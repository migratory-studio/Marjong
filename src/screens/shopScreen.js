// 宝珠ショップ (shop-screen) — アカウント通貨「宝珠」で恒久強化・解禁を買うハブ（モック）。
//
//   import { showShop } from "./screens/shopScreen.js";
//   showShop(container, { repository, audio, onBack });
//
// 設計メモ:
//  - 1280×720 固定。ヘッダー／タブ／フッターは固定、商品リストの本体だけ縦スクロール可（fixed-stage-no-scroll の例外）。
//    報酬ジャンル・件数が増えてもタブで整理し、はみ出しはタブ内スクロールで吸収する。
//  - 整理は「カテゴリタブ」。タブ定義(SHOP_CATEGORIES)に1行足すだけで新ジャンルを増やせる（恒久強化＝固定／解禁＝type別）。
//  - 見た目は楼光の館／対戦ホームと同じ和風UI（暗カード＋金アクセント、menu-btn / ghost-back）。
//  - カタログは src/data/shopMaster.js（恒久バフ＝レベル制 / 解禁＝1回購入）。ここは描画と購入導線だけ。
//  - 導線は当面ここ（対戦ホーム）から。将来は「楼光の館トップ」へ移す（呼び出し側を差し替えるだけ）。
import {
  SHOP_BUFFS, SHOP_UNLOCKS, UNLOCK_FIELD,
  buffCost, buffEffectText, isShopUnlocked, dailyShopUnlocks,
} from "../data/shopMaster.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { shopStyleAttr } from "../data/imagePos.js";

// 解禁タイプ別の見せ方（モーダルのアイコン／完了文）。新typeを足すときはここにも1行。
const UNLOCK_ICON = { bg: "🖼", bgm: "🎵", char: "🤝" };
const UNLOCK_DONE = {
  bg: "対戦ホームの背景で選べるようになった。",
  bgm: "対戦ホームのBGMで選べるようになった。",
  char: "仲間に加わった。フリー対戦などで連れていける。",
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// カテゴリ（タブ）定義。kind="buffs"＝恒久強化（SHOP_BUFFS）。kind="unlock"＝解禁を type で絞る（SHOP_UNLOCKS）。
// 新ジャンルを増やすときはここに1行足すだけ（中身が0件のタブは自動で隠す）。
const SHOP_CATEGORIES = [
  { id: "buffs", kind: "buffs",                 label: "恒久強化",     sub: "次の楼光の館ランから効く補正" },
  { id: "bg",    kind: "unlock", type: "bg",    label: "背景",         sub: "対戦ホームの背景を増やす（本日の品揃え・毎日24時更新）" },
  { id: "bgm",   kind: "unlock", type: "bgm",   label: "BGM",          sub: "対戦ホームのBGMを増やす（本日の品揃え・毎日24時更新）" },
  { id: "char",  kind: "unlock", type: "char",  label: "キャラクター", sub: "仲間を解禁する" },
];

// カテゴリに属する商品（タブの件数バッジ・本体描画の両方で使う＝表示する物そのものを返す）。
//  - 背景 / BGM は在庫が多いので「日替わり3点」だけ並べる（dailyShopUnlocks＝日付シードの決定論抽選。
//    同じ日なら何度呼んでも同じ3点なので、出入り・再描画・連続呼び出しでもブレない）。
//  - 恒久強化 / キャラは常に全部。
function categoryItems(cat) {
  if (cat.kind === "buffs") return SHOP_BUFFS;
  if (cat.type === "bg" || cat.type === "bgm") return dailyShopUnlocks(cat.type, 3);
  return SHOP_UNLOCKS.filter((it) => it.type === cat.type);
}

export async function showShop(container, opts = {}) {
  const { repository, audio, onBack } = opts;
  if (!container) return;

  let profile = null;
  try { profile = await repository?.loadProfile?.(); } catch { /* 未ログインでも閲覧可（残高0） */ }
  profile = profile || {};
  // メモリ上の profile を唯一の真実とする（ショップ以外が同時に書く想定はない）。各フィールドを正規化。
  if (typeof profile.orbs !== "number") profile.orbs = 0;
  if (!profile.rogueliteShopBuffs || typeof profile.rogueliteShopBuffs !== "object") profile.rogueliteShopBuffs = {};
  for (const f of ["unlockedBackgrounds", "unlockedBgms", "unlockedCharacters"]) {
    if (!Array.isArray(profile[f])) profile[f] = [];
  }
  const buffs = profile.rogueliteShopBuffs;

  // 表示するタブ（中身が1件以上あるカテゴリだけ）。全部空でも「恒久強化」だけは常に出す。
  let cats = SHOP_CATEGORIES.filter((c) => categoryItems(c).length > 0);
  if (!cats.length) cats = [SHOP_CATEGORIES[0]];
  let activeCat = cats[0].id;

  // 保存は直列化（購入を連打しても read-modify-write 競合＝ロストアップデートにならない）。
  // 毎回 loadProfile で読み直すと、保存が間に合わない連打で互いを上書きするため、メモリの profile を丸ごと保存する。
  let saveChain = Promise.resolve();
  function queueSave() {
    saveChain = saveChain.then(() => repository?.saveProfile?.(profile)).catch(() => { /* 保存失敗は見た目に影響させない */ });
    return saveChain;
  }

  container.innerHTML = `
    <div class="shop-screen">
      <header class="shop-head">
        <h1 class="shop-title">宝珠ショップ</h1>
        <div class="shop-orbs">所持 宝珠 <b id="shop-orbs">0</b></div>
      </header>
      <p class="shop-lead">宝珠を捧げ、楼光の館に挑む力を恒久に養う。背景やBGMの解禁もここで。<span class="shop-lead-hint">宝珠は「楼光の館」を踏破すると手に入る。</span></p>
      <nav class="shop-tabs" id="shop-tabs" role="tablist" aria-label="ショップ カテゴリ"></nav>
      <div class="shop-body" id="shop-body">
        <div class="shop-sec-sub" id="shop-sec-sub"></div>
        <div class="shop-grid" id="shop-grid"></div>
      </div>
      <footer class="shop-foot">
        <button type="button" class="ghost-back" id="shop-back">← 対戦ホームへ</button>
      </footer>
      <div class="shop-modal" id="shop-modal" hidden></div>
    </div>`;

  const orbsEl = container.querySelector("#shop-orbs");
  const tabsEl = container.querySelector("#shop-tabs");
  const bodyEl = container.querySelector("#shop-body");
  const subEl = container.querySelector("#shop-sec-sub");
  const gridEl = container.querySelector("#shop-grid");

  function renderOrbs() { orbsEl.textContent = profile.orbs | 0; }

  function renderTabs() {
    tabsEl.innerHTML = cats.map((c) => {
      const items = categoryItems(c);
      const on = c.id === activeCat;
      return `<button type="button" class="shop-tab${on ? " is-on" : ""}" role="tab"
        aria-selected="${on}" data-cat="${esc(c.id)}">
        <span class="shop-tab-label">${esc(c.label)}</span>
        <span class="shop-tab-count">${items.length}</span>
      </button>`;
    }).join("");
    for (const btn of tabsEl.querySelectorAll(".shop-tab[data-cat]")) {
      btn.addEventListener("click", () => {
        if (activeCat === btn.dataset.cat) return;
        activeCat = btn.dataset.cat;
        audio?.playClick?.();
        renderTabs();
        renderBody();
        bodyEl.scrollTop = 0; // タブ切替で先頭から見せる
      });
    }
  }

  // 恒久バフ1枚。
  function buffCardHtml(b) {
    const lv = buffs[b.id] | 0;
    const cost = buffCost(b.id, lv);
    const maxed = cost == null;
    const afford = !maxed && (profile.orbs | 0) >= cost;
    const cls = "shop-card" + (maxed ? " maxed" : afford ? "" : " poor");
    const tag = maxed ? "最大強化" : afford ? `宝珠 ${cost}` : `宝珠 ${cost}（不足）`;
    return `<div class="${cls}">
      <div class="shop-card-top"><span class="shop-card-ico">${esc(b.icon || "★")}</span>
        <span class="shop-card-name">${esc(b.name)}</span>
        <span class="shop-card-lv">Lv ${lv}/${b.maxLevel}</span></div>
      <div class="shop-card-desc">${esc(b.desc)}</div>
      <div class="shop-card-eff">現在 <b>${buffEffectText(b, lv)}</b>${maxed ? "" : ` → ${buffEffectText(b, lv + 1)}`}</div>
      <button type="button" class="shop-buy" data-buff="${esc(b.id)}" ${maxed || !afford ? "disabled" : ""}>${tag}</button>
    </div>`;
  }

  // 解禁1枚。
  //  - char … キャラ立ち絵を <img>(cover) で被せ、用途別オフセット(shop)で顔/バストを見せる（胴体だけにしない）。
  //  - bg/bgm … サムネ画像を background-image で敷く（横長サムネは cover/center のままで自然）。
  function unlockCardHtml(it) {
    const owned = isShopUnlocked(it, profile);
    const afford = (profile.orbs | 0) >= it.cost;
    const isChar = it.type === "char";
    const cls = "shop-card shop-card--unlock" + (isChar ? " shop-card--char" : "")
      + (owned ? " owned" : afford ? "" : " poor");
    const tag = owned ? "解禁済" : afford ? `宝珠 ${it.cost}` : `宝珠 ${it.cost}（不足）`;
    let media = "", bg = "";
    if (isChar && it.img) {
      const c = CHARACTER_MASTER.find((x) => x.id === it.key);
      media = `<img class="shop-card-img" src="${esc(it.img)}" alt="" style="${esc(shopStyleAttr(c))}">`;
    } else if (it.img) {
      bg = ` style="background-image:url('${esc(it.img)}')"`;
    }
    return `<div class="${cls}"${bg}>
      ${media}
      <div class="shop-card-veil">
        <span class="shop-card-name">${esc(it.name)}</span>
        <div class="shop-card-desc">${esc(it.desc)}</div>
        <button type="button" class="shop-buy" data-unlock="${esc(it.id)}" ${owned || !afford ? "disabled" : ""}>${tag}</button>
      </div>
    </div>`;
  }

  function renderBody() {
    const cat = cats.find((c) => c.id === activeCat) || cats[0];
    subEl.textContent = cat.sub || "";
    const items = categoryItems(cat);
    if (!items.length) {
      gridEl.innerHTML = `<div class="shop-empty">近日追加予定。</div>`;
      return;
    }
    gridEl.innerHTML = cat.kind === "buffs"
      ? items.map(buffCardHtml).join("")
      : items.map(unlockCardHtml).join("");
    for (const btn of gridEl.querySelectorAll(".shop-buy[data-buff]")) {
      btn.addEventListener("click", () => buyBuff(btn.dataset.buff));
    }
    for (const btn of gridEl.querySelectorAll(".shop-buy[data-unlock]")) {
      btn.addEventListener("click", () => buyUnlock(btn.dataset.unlock));
    }
  }

  function rerender() { renderOrbs(); renderTabs(); renderBody(); }

  // ===== 購入導線：確認モーダル → 実行 → 完了モーダルの2段（即時購入はしない＝押し間違い防止＋達成感） =====
  const modalEl = container.querySelector("#shop-modal");
  let onModalKey = null;

  function closeModal() {
    modalEl.hidden = true;
    modalEl.innerHTML = "";
    if (onModalKey) { document.removeEventListener("keydown", onModalKey); onModalKey = null; }
  }
  function openModal(html, wire) {
    modalEl.innerHTML = html;
    modalEl.hidden = false;
    wire?.();
    modalEl.querySelector(".shop-modal-scrim")?.addEventListener("click", () => { audio?.playClick?.(); closeModal(); });
    onModalKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeModal(); } };
    document.addEventListener("keydown", onModalKey);
    modalEl.querySelector(".shop-modal-go, .shop-modal-ok")?.focus();
  }

  // 確認モーダル。intent = { kind, id, icon, name, cost, effect, doneText }
  function openConfirm(intent) {
    if (!intent) return;
    const have = profile.orbs | 0;
    const after = have - intent.cost;
    openModal(`
      <div class="shop-modal-scrim"></div>
      <div class="shop-modal-card" role="dialog" aria-modal="true" aria-label="購入の確認">
        <div class="shop-modal-h">購入の確認</div>
        <div class="shop-modal-item">
          <span class="shop-modal-ico">${esc(intent.icon)}</span>
          <div class="shop-modal-itxt">
            <div class="shop-modal-name">${esc(intent.name)}</div>
            <div class="shop-modal-eff">${esc(intent.effect)}</div>
          </div>
        </div>
        <div class="shop-modal-cost">
          <span>宝珠 <b>${intent.cost}</b> を捧げますか？</span>
          <span class="shop-modal-bal">所持 ${have} → <b>${after}</b></span>
        </div>
        <div class="shop-modal-btns">
          <button type="button" class="shop-modal-cancel" id="shop-m-cancel">やめる</button>
          <button type="button" class="shop-modal-go" id="shop-m-go">購入する</button>
        </div>
      </div>`, () => {
      modalEl.querySelector("#shop-m-cancel").addEventListener("click", () => { audio?.playClick?.(); closeModal(); });
      modalEl.querySelector("#shop-m-go").addEventListener("click", () => {
        const ok = intent.kind === "buff" ? commitBuff(intent.id) : commitUnlock(intent.id);
        if (ok) openComplete(intent); else closeModal();
      });
    });
  }

  // 完了モーダル（残高は commit 反映後の profile を見る）。
  function openComplete(intent) {
    openModal(`
      <div class="shop-modal-scrim"></div>
      <div class="shop-modal-card shop-modal-card--done" role="dialog" aria-modal="true" aria-label="購入完了">
        <div class="shop-modal-badge">購入完了</div>
        <div class="shop-modal-item">
          <span class="shop-modal-ico">${esc(intent.icon)}</span>
          <div class="shop-modal-itxt">
            <div class="shop-modal-name">${esc(intent.name)}</div>
            <div class="shop-modal-eff">${esc(intent.doneText)}</div>
          </div>
        </div>
        <div class="shop-modal-cost"><span class="shop-modal-bal">残り 宝珠 <b>${profile.orbs | 0}</b></span></div>
        <div class="shop-modal-btns">
          <button type="button" class="shop-modal-ok" id="shop-m-ok">閉じる</button>
        </div>
      </div>`, () => {
      modalEl.querySelector("#shop-m-ok").addEventListener("click", () => { audio?.playClick?.(); closeModal(); });
    });
  }

  // クリック＝確認を開く（intent 組み立て）。実購入は commit*（確認後）に分離。
  function buyBuff(id) {
    const b = SHOP_BUFFS.find((x) => x.id === id);
    if (!b) return;
    const lv = buffs[id] | 0;
    const cost = buffCost(id, lv);
    if (cost == null || (profile.orbs | 0) < cost) return;
    audio?.playClick?.();
    openConfirm({
      kind: "buff", id, icon: b.icon || "★", name: b.name, cost,
      effect: `${buffEffectText(b, lv)} → ${buffEffectText(b, lv + 1)}（Lv ${lv} → ${lv + 1}）`,
      doneText: `${b.name} が Lv ${lv + 1} になった。`,
    });
  }
  function buyUnlock(id) {
    const it = SHOP_UNLOCKS.find((x) => x.id === id);
    if (!it || isShopUnlocked(it, profile) || (profile.orbs | 0) < it.cost) return;
    audio?.playClick?.();
    openConfirm({
      kind: "unlock", id, icon: UNLOCK_ICON[it.type] || "🎁", name: it.name, cost: it.cost,
      effect: it.desc,
      doneText: UNLOCK_DONE[it.type] || "解禁しました。",
    });
  }

  // 実購入（残高再検証つき。成功で true）。状態更新＝残高・本体のみ（タブ件数は不変＝スクロール位置を保つ）。
  function commitBuff(id) {
    const b = SHOP_BUFFS.find((x) => x.id === id);
    if (!b) return false;
    const lv = buffs[id] | 0;
    const cost = buffCost(id, lv);
    if (cost == null || (profile.orbs | 0) < cost) return false;
    profile.orbs = (profile.orbs | 0) - cost;
    buffs[id] = lv + 1; // buffs は profile.rogueliteShopBuffs の参照
    renderOrbs();
    renderBody();
    queueSave();
    return true;
  }
  function commitUnlock(id) {
    const it = SHOP_UNLOCKS.find((x) => x.id === id);
    if (!it || isShopUnlocked(it, profile) || (profile.orbs | 0) < it.cost) return false;
    const field = UNLOCK_FIELD[it.type];
    if (!field) return false;
    profile.orbs = (profile.orbs | 0) - it.cost;
    if (!profile[field].includes(it.key)) profile[field].push(it.key);
    renderOrbs();
    renderBody();
    queueSave();
    return true;
  }

  rerender();
  container.querySelector("#shop-back")?.addEventListener("click", () => onBack?.());
}
