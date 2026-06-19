// 対戦ホーム (battle-home) — 対局モードのハブ。
//
// トップ ―（対戦ホーム）― フリー対戦 / オンライン対戦（ルーム/オートマッチ）
// という導線の中継地点。ここの主役は「お気に入りキャラ」の立ち絵＋出迎えセリフ。
// 麻雀の外でも相棒が“居る”ことで、愛着＝固有性（あなたを覚えている）×双方向（タップで返る）を作る。
//
//   import { showBattleHome } from "./screens/battleHomeScreen.js";
//   showBattleHome(container, { repository, onFree, onOnline, onBack });
//     onFree()   … フリー対戦へ
//     onOnline() … オンライン対戦へ（ログイン/名前ゲートは呼び出し側で）
//     onBack()   … トップへ戻る
//
// 設計メモ:
//  - 1280×720 固定・内部スクロール禁止（CLAUDE.md / fixed-stage-no-scroll）。左=立ち絵、右=導線。
//  - お気に入りは profile.favoriteCharId に保存。未選択は絆最上位→CHARACTERS[0] で補う。
//  - セリフは home(固有性)/homeChat(雑談)/homeTap(タップ) を pickVoiceLine で解決。
//    固有性を主軸に約7割で優先し、無ければ雑談へフォールバック（両軸：固有性＋雑談ストック）。
import { CHARACTERS } from "../characters/characters.js";
import { pickVoiceLine } from "../data/voiceLines.js";
import { topPlayStyle } from "../progression/companionBond.js";
import { bondBandLabel } from "../progression/progressionService.js";
import { HOME_BGM_CHOICES } from "../ui/assets.js";

// 対戦ホームで切替できる背景（画像は graphic/bg/。washi=既定＝#app の青海波をそのまま見せる）。
// thumb=一覧モーダルのサムネ。locked を付ければ将来の解禁機能でロック表示にできる（後述 isUnlocked）。
const HOME_BG_CHOICES = [
  { key: "washi",  label: "青海波", img: null,                       thumb: "graphic/ui/sc/bg.png" },
  { key: "dojo",   label: "道場",   img: "graphic/bg/bg-dojo.png",   thumb: "graphic/bg/bg-dojo.png" },
  { key: "street", label: "街角",   img: "graphic/bg/bg-street.png", thumb: "graphic/bg/bg-street.png" },
];

// 解禁判定。今は全解放。将来は item.locked / item.unlock(profile) や profile.unlocked* を見て
// ここを差し替えるだけで、一覧モーダルがロック表示（グレーアウト＋🔒）に切り替わる拡張点。
function isUnlocked(item /* , profile */) {
  return !item?.locked;
}

const selectableChars = () => CHARACTERS.filter((c) => !c.isMob);
const charById = (id) => CHARACTERS.find((c) => c.id === id) || null;

// 絆が最も育っているキャラ id（未選択時のフォールバック）。main.js の topCompanionId と同ロジック。
function topBondId(bonds) {
  let topId = null, topKey = -1;
  for (const [id, b] of Object.entries(bonds || {})) {
    const key = (b?.level ?? 1) * 1e7 + (b?.exp ?? 0);
    if (key > topKey) { topKey = key; topId = id; }
  }
  return topId;
}

// 出迎えセリフの解決 ctx（履歴を見て「あなたを覚えている」を出す材料）。
function buildHomeCtx(profile, charId) {
  const bonds = profile?.companionBonds || {};
  const hist = profile?.playerHistory || {};
  return {
    companionBondLevel: bonds[charId]?.level ?? 1,
    winStreak: hist.winStreak ?? 0,
    loseStreak: hist.loseStreak ?? 0,
    playStyleTag: topPlayStyle(hist),
    firstMeet: (hist.totalMatches ?? 0) === 0,
  };
}

// 固有性(home)を主軸に、約7割で優先。無ければ雑談(homeChat)へフォールバック。
function pickHomeGreeting(charId, ctx) {
  const special = pickVoiceLine(charId, "home", ctx);
  const chat = pickVoiceLine(charId, "homeChat", {});
  if (special && (Math.random() < 0.7 || !chat)) return special;
  return chat || special || "……。";
}

// 動的値の最小エスケープ（キャラ名など）。
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 立ち絵 <img>（宣言パス→失敗時は単色＋頭文字のフォールバック）。makeCharPortrait と同方針。
function portraitNode(c) {
  const path = c?.assets?.portrait;
  if (path) {
    const img = document.createElement("img");
    img.className = "bh-portrait";
    img.src = path;
    img.alt = c.name || "";
    if (c.portraitPos) img.style.objectPosition = c.portraitPos;
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = "bh-portrait bh-portrait-fallback";
      fb.style.background = c.color || "#444";
      fb.textContent = (c.name || "?").slice(0, 1);
      img.replaceWith(fb);
    };
    return img;
  }
  const fb = document.createElement("div");
  fb.className = "bh-portrait bh-portrait-fallback";
  fb.style.background = c?.color || "#444";
  fb.textContent = (c?.name || "?").slice(0, 1);
  return fb;
}

export async function showBattleHome(container, opts = {}) {
  const { repository, audio, onFree, onOnline, onBack } = opts;
  if (!container) return;

  let profile = null;
  try { profile = await repository?.loadProfile?.(); } catch { /* 未ログイン/失敗は既定で描く */ }

  // 背景・BGM の現在キー（未設定は既定）。手動スイッチャーで切替→profile へ保存。
  let bgKey = profile?.homeBg || HOME_BG_CHOICES[0].key;
  let bgmKey = profile?.homeBgm || HOME_BGM_CHOICES[0].key;

  const favId =
    profile?.favoriteCharId ||
    topBondId(profile?.companionBonds) ||
    selectableChars()[0]?.id ||
    CHARACTERS[0]?.id;
  let current = charById(favId) || selectableChars()[0] || CHARACTERS[0];

  // 情報パネル用のプレイヤー横断データ（キャラ非依存。絆帯だけ current 依存で paint 時に更新）。
  const hist = profile?.playerHistory || {};
  const displayName = String(profile?.profile?.displayName || "").trim() || "あなた";
  const together = hist.totalMatches ?? 0;       // 一緒に打った局数＝蓄積（履歴がある）
  const winStreak = hist.winStreak ?? 0;

  container.innerHTML = `
    <div class="battle-home">
      <div class="bh-stage">
        <div class="bh-talk" id="bh-talk" aria-live="polite"></div>
        <div class="bh-portrait-wrap" id="bh-portrait-wrap" title="タップで話しかけられるよ"></div>
        <button type="button" class="bh-change" id="bh-change">相棒をかえる</button>
      </div>
      <div class="bh-side">
        <div class="bh-card">
          <h1 class="bh-title">対戦ホーム</h1>
          <div class="bh-info">
            <div class="bh-info-row"><span class="bh-info-k">プレイヤー</span><span class="bh-info-v" id="bh-name"></span></div>
            <div class="bh-info-row"><span class="bh-info-k">相棒</span><span class="bh-info-v" id="bh-partner"></span></div>
            <div class="bh-info-row"><span class="bh-info-k">絆</span><span class="bh-info-v bh-bond" id="bh-bond"></span></div>
            <div class="bh-info-row"><span class="bh-info-k">一緒に</span><span class="bh-info-v" id="bh-together"></span></div>
            <div class="bh-info-row" id="bh-streak-row" hidden><span class="bh-info-k">連勝中</span><span class="bh-info-v bh-streak" id="bh-streak"></span></div>
          </div>
          <div class="bh-amb">
            <div class="bh-amb-cur">背景 <span id="bh-bg-name"></span><span class="bh-amb-dot">・</span>BGM <span id="bh-bgm-name"></span></div>
            <button type="button" class="bh-amb-btn" id="bh-amb-edit">変更</button>
          </div>
        </div>
        <nav class="bh-routes">
          <button type="button" class="menu-btn" id="bh-free">
            <span class="menu-btn-title">フリー対戦</span>
            <span class="menu-btn-sub">既存キャラで CPU 対局</span>
          </button>
          <button type="button" class="menu-btn" id="bh-online">
            <span class="menu-btn-title">オンライン対戦</span>
            <span class="menu-btn-sub">ルームマッチ / オートマッチ</span>
          </button>
        </nav>
        <button type="button" class="ghost-back bh-back" id="bh-back">← ホームへ</button>
      </div>
    </div>`;

  const talkEl = container.querySelector("#bh-talk");
  const wrap = container.querySelector("#bh-portrait-wrap");
  const partnerEl = container.querySelector("#bh-partner");
  const bondEl = container.querySelector("#bh-bond");
  const setTalk = (t) => { if (talkEl) talkEl.textContent = t || "……。"; };

  const bgNameEl = container.querySelector("#bh-bg-name");
  const bgmNameEl = container.querySelector("#bh-bgm-name");

  // キャラ非依存の情報は一度だけ。
  container.querySelector("#bh-name").textContent = displayName;
  container.querySelector("#bh-together").textContent = `${together} 局`;
  if (winStreak > 0) {
    container.querySelector("#bh-streak-row").hidden = false;
    container.querySelector("#bh-streak").textContent = `${winStreak} 連勝`;
  }

  // 背景を適用（washi=既定は #app の青海波をそのまま見せる＝オーバーライド無し）。
  function applyBg(key) {
    const c = HOME_BG_CHOICES.find((x) => x.key === key) || HOME_BG_CHOICES[0];
    if (c.img) {
      container.style.backgroundImage = `url("${c.img}")`;
      container.style.backgroundSize = "cover";
      container.style.backgroundPosition = "center";
    } else {
      container.style.backgroundImage = "";
    }
    if (bgNameEl) bgNameEl.textContent = c.label;
  }
  function applyBgm(key, { play = false } = {}) {
    const c = HOME_BGM_CHOICES.find((x) => x.key === key) || HOME_BGM_CHOICES[0];
    if (bgmNameEl) bgmNameEl.textContent = c.label;
    if (play) audio?.playHomeBgmByKey?.(c.key);
  }
  applyBg(bgKey);
  applyBgm(bgmKey, { play: true }); // 入場時に選択中のBGMへ切替（ナビのクリック＝ジェスチャ済み）

  // 背景/BGM の切替を profile に保存（最新を読み直してから）。
  async function persist(patch) {
    try {
      const p = (await repository?.loadProfile?.()) || profile || {};
      Object.assign(p, patch);
      await repository?.saveProfile?.(p);
      profile = p;
    } catch { /* 保存失敗してもセッション内の見た目/再生は反映済み */ }
  }

  // 立ち絵＋相棒名＋絆帯＋出迎えセリフを current で描き直す。
  // 絆は数値レス方針 [[bond-display-hybrid-policy]]：帯名(bondBandLabel)で見せる。
  function paint() {
    wrap.innerHTML = "";
    wrap.appendChild(portraitNode(current));
    if (partnerEl) partnerEl.textContent = current?.name || "—";
    if (bondEl) bondEl.textContent = bondBandLabel(profile?.companionBonds?.[current.id]?.level ?? 1);
    setTalk(pickHomeGreeting(current.id, buildHomeCtx(profile, current.id)));
  }
  paint();

  // タップで追加の一言（双方向の入口）。テンプレ未記入キャラは黙らない範囲で homeTap を出す。
  wrap.addEventListener("click", () => {
    const ctx = buildHomeCtx(profile, current.id);
    const line = pickVoiceLine(current.id, "homeTap", ctx);
    if (line) setTalk(line);
  });

  // 導線。
  container.querySelector("#bh-free")?.addEventListener("click", () => onFree?.());
  container.querySelector("#bh-online")?.addEventListener("click", () => onOnline?.());
  container.querySelector("#bh-back")?.addEventListener("click", () => onBack?.());

  // 背景・BGM の「変更」→ 一覧モーダル（選択中ハイライト／将来は解禁状態も表示）。
  container.querySelector("#bh-amb-edit")?.addEventListener("click", () => {
    openAmbiance(container, {
      profile, bgKey, bgmKey,
      onPickBg: (key) => { bgKey = key; applyBg(key); persist({ homeBg: key }); },
      onPickBgm: (key) => { bgmKey = key; applyBgm(key, { play: true }); persist({ homeBgm: key }); },
    });
  });

  // 「相棒をかえる」ピッカー（モーダル）。選んだら favoriteCharId を保存して即反映。
  container.querySelector("#bh-change")?.addEventListener("click", () => {
    openPicker(container, current?.id, async (picked) => {
      current = charById(picked) || current;
      // 保存は最新プロフィールを読み直してから（他の更新を踏まない）。
      try {
        const p = (await repository?.loadProfile?.()) || profile || {};
        p.favoriteCharId = current.id;
        await repository?.saveProfile?.(p);
        profile = p;
      } catch { /* 保存失敗してもセッション内では選択を反映 */ }
      paint();
    });
  });
}

// お気に入りキャラ選択モーダル（アイコングリッド）。スクリム/✕/Esc で閉じる。
function openPicker(container, currentId, onPick) {
  const ov = document.createElement("div");
  ov.className = "bh-picker";
  const cells = selectableChars().map((c) => {
    const icon = c.assets?.icon || c.assets?.portrait || "";
    const face = icon
      ? `<img class="bh-pick-face" src="${icon}" alt="">`
      : `<span class="bh-pick-face bh-pick-fallback" style="background:${c.color || "#444"}">${esc((c.name || "?").slice(0, 1))}</span>`;
    return `<button type="button" class="bh-pick${c.id === currentId ? " is-active" : ""}" data-id="${esc(c.id)}">
      ${face}<span class="bh-pick-name">${esc(c.name)}</span></button>`;
  }).join("");
  ov.innerHTML =
    `<div class="bh-picker-scrim"></div>` +
    `<div class="bh-picker-card" role="dialog" aria-modal="true">` +
      `<h2 class="bh-picker-title">相棒をえらぶ</h2>` +
      `<div class="bh-pick-grid">${cells}</div>` +
      `<button type="button" class="bh-picker-x" aria-label="閉じる">✕</button>` +
    `</div>`;
  container.appendChild(ov);

  const close = () => { document.removeEventListener("keydown", onKey); ov.remove(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector(".bh-picker-scrim")?.addEventListener("click", close);
  ov.querySelector(".bh-picker-x")?.addEventListener("click", close);
  for (const btn of ov.querySelectorAll(".bh-pick")) {
    btn.addEventListener("click", () => { const id = btn.dataset.id; close(); onPick?.(id); });
  }
}

// 背景・BGM 設定モーダル。一覧から選択（選択中ハイライト／ロックはグレーアウト＝解禁機能の拡張点）。
// 背景はサムネで選んで即プレビュー、BGM は選ぶとその場で試聴。モーダルは開いたまま何度でも試せる。
function openAmbiance(container, { profile, bgKey, bgmKey, onPickBg, onPickBgm }) {
  let curBg = bgKey, curBgm = bgmKey;

  const bgTile = (c) => {
    const ok = isUnlocked(c, profile);
    return `<button type="button" class="bh-amb-tile${c.key === curBg ? " is-selected" : ""}${ok ? "" : " is-locked"}"`
      + ` data-key="${esc(c.key)}"${ok ? "" : " disabled"} style="background-image:url('${esc(c.thumb || "")}')">`
      + `<span class="bh-amb-tile-label">${esc(c.label)}${ok ? "" : " 🔒"}</span></button>`;
  };
  const bgmRow = (c) => {
    const ok = isUnlocked(c, profile);
    return `<button type="button" class="bh-amb-row${c.key === curBgm ? " is-selected" : ""}${ok ? "" : " is-locked"}"`
      + ` data-key="${esc(c.key)}"${ok ? "" : " disabled"}>`
      + `<span class="bh-amb-row-name">${esc(c.label)}${ok ? "" : " 🔒"}</span>`
      + `<span class="bh-amb-row-cue" aria-hidden="true">▶</span></button>`;
  };

  const ov = document.createElement("div");
  ov.className = "bh-picker bh-amb-modal";
  ov.innerHTML =
    `<div class="bh-picker-scrim"></div>` +
    `<div class="bh-picker-card" role="dialog" aria-modal="true">` +
      `<h2 class="bh-picker-title">背景・BGM</h2>` +
      `<div class="bh-amb-sec"><div class="bh-amb-sec-h">背景</div>` +
        `<div class="bh-amb-grid" data-kind="bg">${HOME_BG_CHOICES.map(bgTile).join("")}</div></div>` +
      `<div class="bh-amb-sec"><div class="bh-amb-sec-h">BGM</div>` +
        `<div class="bh-amb-list" data-kind="bgm">${HOME_BGM_CHOICES.map(bgmRow).join("")}</div></div>` +
      `<button type="button" class="bh-picker-x" aria-label="閉じる">✕</button>` +
    `</div>`;
  container.appendChild(ov);

  const close = () => { document.removeEventListener("keydown", onKey); ov.remove(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  ov.querySelector(".bh-picker-scrim")?.addEventListener("click", close);
  ov.querySelector(".bh-picker-x")?.addEventListener("click", close);

  const reselect = (sel, key) => {
    for (const b of ov.querySelectorAll(sel)) b.classList.toggle("is-selected", b.dataset.key === key);
  };
  for (const b of ov.querySelectorAll(".bh-amb-grid [data-key]")) {
    b.addEventListener("click", () => { curBg = b.dataset.key; reselect(".bh-amb-grid [data-key]", curBg); onPickBg?.(curBg); });
  }
  for (const b of ov.querySelectorAll(".bh-amb-list [data-key]")) {
    b.addEventListener("click", () => { curBgm = b.dataset.key; reselect(".bh-amb-list [data-key]", curBgm); onPickBgm?.(curBgm); });
  }
}
