// 宝珠ショップ (shop-screen) — アカウント通貨「宝珠」で恒久強化・解禁を買うハブ（モック）。
//
//   import { showShop } from "./screens/shopScreen.js";
//   showShop(container, { repository, audio, onBack });
//
// 設計メモ:
//  - 1280×720 固定・内部スクロール禁止（CLAUDE.md / fixed-stage-no-scroll）。商品はグリッドで収める。
//  - 見た目は楼光の館／対戦ホームと同じ和風UI（暗カード＋金アクセント、menu-btn / ghost-back）。
//  - カタログは src/data/shopMaster.js（恒久バフ＝レベル制 / 解禁＝1回購入）。ここは描画と購入導線だけ。
//  - 導線は当面ここ（対戦ホーム）から。将来は「楼光の館トップ」へ移す（呼び出し側を差し替えるだけ）。
import {
  SHOP_BUFFS, SHOP_UNLOCKS, UNLOCK_FIELD,
  buffCost, buffEffectText, isShopUnlocked,
} from "../data/shopMaster.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
      <p class="shop-lead">宝珠を捧げ、楼光の館に挑む力を恒久に養う。背景やBGMの解禁もここで。</p>
      <div class="shop-body">
        <section class="shop-sec">
          <div class="shop-sec-h">恒久強化 <span class="shop-sec-sub">次の楼光の館ランから効く補正</span></div>
          <div class="shop-grid" id="shop-buffs"></div>
        </section>
        <section class="shop-sec">
          <div class="shop-sec-h">解禁 <span class="shop-sec-sub">背景・BGM・キャラクター</span></div>
          <div class="shop-grid" id="shop-unlocks"></div>
        </section>
      </div>
      <footer class="shop-foot">
        <button type="button" class="ghost-back" id="shop-back">← 対戦ホームへ</button>
      </footer>
    </div>`;

  const orbsEl = container.querySelector("#shop-orbs");
  const buffGrid = container.querySelector("#shop-buffs");
  const unlockGrid = container.querySelector("#shop-unlocks");

  function renderOrbs() { orbsEl.textContent = profile.orbs | 0; }

  function renderBuffs() {
    buffGrid.innerHTML = SHOP_BUFFS.map((b) => {
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
    }).join("");
    for (const btn of buffGrid.querySelectorAll(".shop-buy[data-buff]")) {
      btn.addEventListener("click", () => buyBuff(btn.dataset.buff));
    }
  }

  function renderUnlocks() {
    if (!SHOP_UNLOCKS.length) {
      unlockGrid.innerHTML = `<div class="shop-empty">近日追加予定。</div>`;
      return;
    }
    unlockGrid.innerHTML = SHOP_UNLOCKS.map((it) => {
      const owned = isShopUnlocked(it, profile);
      const afford = (profile.orbs | 0) >= it.cost;
      const cls = "shop-card shop-card--unlock" + (owned ? " owned" : afford ? "" : " poor");
      const bg = it.img ? ` style="background-image:url('${esc(it.img)}')"` : "";
      const tag = owned ? "解禁済" : afford ? `宝珠 ${it.cost}` : `宝珠 ${it.cost}（不足）`;
      return `<div class="${cls}"${bg}>
        <div class="shop-card-veil">
          <span class="shop-card-name">${esc(it.name)}</span>
          <div class="shop-card-desc">${esc(it.desc)}</div>
          <button type="button" class="shop-buy" data-unlock="${esc(it.id)}" ${owned || !afford ? "disabled" : ""}>${tag}</button>
        </div>
      </div>`;
    }).join("");
    for (const btn of unlockGrid.querySelectorAll(".shop-buy[data-unlock]")) {
      btn.addEventListener("click", () => buyUnlock(btn.dataset.unlock));
    }
  }

  function rerender() { renderOrbs(); renderBuffs(); renderUnlocks(); }

  function buyBuff(id) {
    const b = SHOP_BUFFS.find((x) => x.id === id);
    if (!b) return;
    const lv = buffs[id] | 0;
    const cost = buffCost(id, lv);
    if (cost == null || (profile.orbs | 0) < cost) return;
    profile.orbs = (profile.orbs | 0) - cost;
    buffs[id] = lv + 1; // buffs は profile.rogueliteShopBuffs の参照
    audio?.playClick?.();
    rerender();
    queueSave();
  }

  function buyUnlock(id) {
    const it = SHOP_UNLOCKS.find((x) => x.id === id);
    if (!it || isShopUnlocked(it, profile) || (profile.orbs | 0) < it.cost) return;
    const field = UNLOCK_FIELD[it.type];
    if (!field) return;
    profile.orbs = (profile.orbs | 0) - it.cost;
    if (!profile[field].includes(it.key)) profile[field].push(it.key);
    audio?.playClick?.();
    rerender();
    queueSave();
  }

  rerender();
  container.querySelector("#shop-back")?.addEventListener("click", () => onBack?.());
}
