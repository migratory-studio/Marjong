// 道場の修行記録。閲覧中の記録と、実際に再開する記録を分ける。
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { monthInfo } from "../data/calendarMaster.js";
import { bondBandLabel } from "../progression/progressionService.js";
import { bondPtView } from "../progression/companionBond.js";
import { showConfirm } from "./confirmModal.js";
import { searchKey } from "../ui/characterCatalog.js";

export function showMentorRoster(container, { profile, isLoggedIn, onSelect, onCreate, onDelete, onBack } = {}) {
  const perPage = 6;
  let current = profile;
  let selectedId = current?.activeAvatarId;
  let page = 0;
  let managing = false;
  const mentorOf = a => CHARACTER_MASTER.find(c => c.id === a.mentorCharacterId);
  container.innerHTML = `
    <header class="mode-heading">
      <button type="button" class="mode-back" aria-label="師のもとへ戻る"></button>
      <h1>修行の記録</h1><span class="mode-format">${isLoggedIn ? "クラウドに保存" : "この端末に保存"}</span>
    </header>
    <div class="records-layout">
      <section class="record-preview" aria-label="選択中の記録"></section>
      <section class="record-ledger" aria-label="記録一覧">
        <div class="record-tools"><h2>記録一覧</h2><button type="button" class="mode-button record-manage">整理</button></div>
        <input type="search" class="record-search" aria-label="弟子名・師匠名で検索" placeholder="弟子名・師匠名で検索">
        <div class="record-rows"></div>
        <footer class="record-footer">
          <button type="button" class="record-prev" aria-label="前のページ"></button>
          <span class="record-page" role="status"></span>
          <button type="button" class="record-next" aria-label="次のページ"></button>
        </footer>
        <button type="button" class="mode-button record-new">新しく弟子入りする</button>
      </section>
    </div>`;
  const get = sel => container.querySelector(sel);
  const preview = get(".record-preview");
  const rows = get(".record-rows");
  const search = get(".record-search");
  const manage = get(".record-manage");
  const prev = get(".record-prev");
  const next = get(".record-next");
  const add = get(".record-new");
  function element(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  }
  function showDetails(a) {
    preview.replaceChildren();
    if (!a) {
      preview.append(element("h2", "", current?.avatars?.length ? "該当する記録がありません" : "最初の修行の記録"),
        element("p", "", current?.avatars?.length ? "名前を変えて検索してください。" : "弟子入りすると、ここに師匠との歩みが残ります。"));
      return;
    }
    const master = mentorOf(a);
    const art = element("div", "record-art");
    if (master?.assets?.portrait) {
      const img = element("img"); img.src = master.assets.portrait; img.alt = ""; art.append(img);
    }
    const sheet = element("div", "record-sheet");
    const month = monthInfo((a.avatarId === current.activeAvatarId ? current.dayCount : a.run?.dayCount) || 1);
    const bond = bondPtView({ level: a.bondLevel, exp: a.bondExp });
    sheet.append(element("p", "record-master", `師匠　${master?.name || "—"}`),
      element("h2", "", a.name), element("p", "record-date", `${month.year}年目 ${month.gameMonth}月　／　弟子 Lv ${a.avatarLevel ?? 1}`),
      element("p", "record-bond", `絆　${bondBandLabel(bond.lv)}　Lv ${bond.lv}　${bond.cur} / ${bond.need} pt`));
    const action = element("button", managing ? "mode-button record-remove" : "mode-choice record-resume", managing ? "この記録を削除" : "この修行を再開");
    action.type = "button";
    action.onclick = managing ? () => askDelete(a) : () => onSelect?.(a.avatarId);
    sheet.append(action);
    preview.append(art, sheet);
  }
  function render(preferActivePage = false) {
    const all = current?.avatars || [];
    const term = searchKey(search.value);
    const matches = all.filter(a => {
      const master = mentorOf(a);
      return [a.name, master?.name, master?.reading].some(label => searchKey(label).includes(term));
    });
    if (preferActivePage) page = Math.floor(Math.max(0, matches.findIndex(a => a.avatarId === selectedId)) / perPage);
    const pages = Math.ceil(matches.length / perPage);
    page = Math.max(0, Math.min(page, pages - 1));
    const slice = matches.slice(page * perPage, (page + 1) * perPage);
    const selected = slice.find(a => a.avatarId === selectedId) || slice[0];
    selectedId = selected?.avatarId;
    manage.disabled = !all.length;
    manage.textContent = managing ? "整理を終える" : "記録を整理";
    manage.setAttribute("aria-pressed", String(managing));
    add.hidden = managing;
    prev.disabled = page === 0;
    next.disabled = page + 1 >= pages;
    get(".record-page").textContent = `${matches.length}件${pages ? `　${page + 1} / ${pages}` : ""}`;
    const activeRow = document.activeElement?.closest(".record-row");
    rows.replaceChildren();
    for (const a of slice) {
      const row = element("button", "record-row"); row.type = "button";
      row.dataset.id = a.avatarId;
      row.setAttribute("aria-pressed", String(a === selected));
      const face = element("span", "record-icon");
      const icon = presetById(a.presetIds?.icon);
      face.style.background = presetById(a.presetIds?.background)?.css || "";
      face.style.borderColor = presetById(a.presetIds?.frame)?.css || "";
      if (icon?.assetPath) {
        const img = element("img"); img.src = icon.assetPath; img.alt = ""; face.append(img);
      }
      const label = element("span", "record-row-label");
      label.append(element("strong", "", a.name), element("small", "", `師匠　${mentorOf(a)?.name || "—"}`));
      row.append(face, label, element("span", "record-level", `${a.avatarId === current.activeAvatarId ? "修行中　" : ""}Lv ${a.avatarLevel ?? 1}`));
      row.onclick = () => { selectedId = a.avatarId; render(); };
      rows.append(row);
    }
    if (activeRow) rows.querySelector("[aria-pressed=true]")?.focus({ preventScroll: true });
    showDetails(selected);
  }
  function askDelete(a) {
    showConfirm({
      title: "修行の記録を削除",
      message: `「${a.name}」の修行の記録を削除しますか？\nLv・絆・装備は元に戻せません。`,
      confirmLabel: "削除する", cancelLabel: "やめる", danger: true, background: container,
      onConfirm: async () => {
        const fresh = await onDelete?.(a.avatarId);
        if (fresh) current = fresh;
        if (!current?.avatars?.length) managing = false;
        render();
      },
    });
  }
  get(".mode-back").onclick = () => onBack?.();
  add.onclick = () => onCreate?.();
  manage.onclick = () => { managing = !managing; render(); };
  search.oninput = () => { page = 0; render(); };
  prev.onclick = () => { page--; render(); };
  next.onclick = () => { page++; render(); };
  render(true);
}
