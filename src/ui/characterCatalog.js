import { ROLE_MASTER, roleDef } from "../data/characterMaster.js";
import { abilityDef } from "../data/abilityMaster.js";

const COLUMNS = 4;
const PAGE_SIZE = COLUMNS * 2;

// 「シ・ユエ」「しゆえ」、全角英数、名前の途中の空白を同じ表記として探せる。
export function searchKey(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60))
    .replace(/[\s・･]/g, "");
}

function span(className, value) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = value;
  return node;
}

// フィルター・ページはこの名簿を開いている間だけ保持。席・解禁・絆は呼び出し元の状態を読む。
export function mountCharacterCatalog(root, {
  characters, isLocked, describe, onPick, onBrowse, initialId, inspectLocked = false,
}) {
  root.classList.add("character-catalog");
  root.style.setProperty("--catalog-columns", COLUMNS);
  root.innerHTML = `
    <div class="catalog-tools">
      <input type="search" aria-label="名前・読み・能力で検索" placeholder="名前・読み・能力で検索" autocomplete="off">
      <select aria-label="役割で絞り込み"><option value="">すべての役割</option></select>
      <label><input type="checkbox" checked>解禁済みのみ</label>
    </div>
    <div class="catalog-grid" role="group" aria-label="キャラクター一覧" aria-description="矢印キーで移動し、Enterで選択できます"></div>
    <div class="catalog-foot">
      <span class="catalog-count" role="status"></span>
      <button type="button" class="catalog-prev" aria-label="前のページ">前へ</button>
      <span class="catalog-page"></span>
      <button type="button" class="catalog-next" aria-label="次のページ">次へ</button>
    </div>`;
  const search = root.querySelector('[type="search"]');
  const role = root.querySelector("select");
  const available = root.querySelector('[type="checkbox"]');
  const grid = root.querySelector(".catalog-grid");
  const prev = root.querySelector(".catalog-prev"), next = root.querySelector(".catalog-next");
  const count = root.querySelector(".catalog-count"), pageText = root.querySelector(".catalog-page");
  for (const r of ROLE_MASTER) role.add(new Option(r.label, r.id));
  let page = 0;

  function tile(c) {
    const info = describe(c);
    const locked = isLocked(c);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "catalog-tile";
    button.dataset.id = c.id;
    button.classList.toggle("is-locked", locked);
    button.setAttribute("aria-pressed", String(!!info.active));
    button.disabled = locked && !inspectLocked;
    const fallback = [...(c.name || "")][0] || "？";
    const face = span("catalog-face", c.assets?.icon ? "" : fallback);
    if (c.assets?.icon) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = c.assets.icon;
      img.onerror = () => { face.textContent = fallback; };
      face.append(img);
    }
    const name = span("catalog-name", c.name);
    const roleLabel = roleDef(c.role).label;
    button.append(face, name, span("catalog-meta", info.note || (c.isCompletedAvatar ? "修行完了の弟子" : roleLabel)));
    if (locked || info.badge) button.append(span("catalog-badge", locked ? "未解禁" : info.badge));
    button.title = [c.name, info.note || roleLabel, locked ? "宝珠ショップで解禁" : info.badge].filter(Boolean).join(" ／ ");
    button.onclick = () => onPick(c);
    return button;
  }

  function refresh({ revealId, browse = false } = {}) {
    const pool = characters();
    available.closest("label").hidden = !pool.some(isLocked);
    const hasDisciples = pool.some((c) => c.isCompletedAvatar);
    const discipleOption = role.querySelector('[value="disciple"]');
    if (hasDisciples && !discipleOption) role.add(new Option("修行完了の弟子", "disciple"));
    if (!hasDisciples && discipleOption) discipleOption.remove();
    const key = searchKey(search.value);
    const matches = pool.filter((c) => {
      if (available.checked && isLocked(c)) return false;
      if (role.value === "disciple" && !c.isCompletedAvatar) return false;
      if (role.value && role.value !== "disciple" && c.role !== role.value) return false;
      return !key || [c.name, c.reading, ...(c.abilities || []).map((a) => abilityDef(a.abilityId)?.name)]
        .some((value) => searchKey(value).includes(key));
    });
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const revealIndex = revealId ? matches.findIndex((c) => c.id === revealId) : -1;
    page = revealIndex >= 0 ? Math.floor(revealIndex / PAGE_SIZE) : Math.min(page, pages - 1);
    const visible = matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const focusedId = grid.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    if (browse) onBrowse?.(visible);
    grid.replaceChildren(...visible.map(tile));
    const enabled = [...grid.querySelectorAll("button:enabled")];
    const entry = enabled.find((b) => b.dataset.id === focusedId) || enabled.find((b) => b.getAttribute("aria-pressed") === "true") || enabled[0];
    for (const b of enabled) b.tabIndex = b === entry ? 0 : -1;
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "catalog-empty";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "絞り込みを解除";
      reset.onclick = () => { search.value = ""; role.value = ""; available.checked = false; changeFilter(); search.focus(); };
      empty.append(span("", "条件に合うキャラがいません"), reset);
      grid.append(empty);
    }
    count.textContent = matches.length === pool.length ? `${matches.length}人` : `${matches.length} / ${pool.length}人`;
    pageText.textContent = `${page + 1} / ${pages}`;
    prev.disabled = page === 0;
    next.disabled = page + 1 >= pages;
    if (focusedId) entry?.focus({ preventScroll: true });
  }

  function changeFilter() { page = 0; refresh({ browse: true }); }
  function resetFilters() {
    search.value = "";
    role.value = "";
    available.checked = true;
    changeFilter();
  }
  search.addEventListener("input", changeFilter);
  role.addEventListener("change", changeFilter);
  available.addEventListener("change", changeFilter);
  grid.addEventListener("focusin", (event) => {
    if (!event.target.matches(".catalog-tile")) return;
    for (const b of grid.querySelectorAll(".catalog-tile:enabled")) b.tabIndex = b === event.target ? 0 : -1;
  });
  grid.addEventListener("keydown", (event) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[event.key];
    if (!offset || !event.target.matches(".catalog-tile")) return;
    event.preventDefault();
    const tiles = [...grid.children];
    for (let i = tiles.indexOf(event.target) + offset; i >= 0 && i < tiles.length; i += offset) {
      if (!tiles[i].disabled) { tiles[i].focus({ preventScroll: true }); break; }
    }
  });
  function turn(by) {
    page += by;
    refresh({ browse: true });
    if (document.activeElement === document.body) grid.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
  }
  prev.onclick = () => turn(-1);
  next.onclick = () => turn(1);
  refresh({ revealId: initialId });
  return { refresh, resetFilters };
}
