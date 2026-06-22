// ローグライト画面（F7）— docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// 4つのビューを提供する純UI（状態は main.js が持ち、コールバックで返す）:
//   showRoguelite        … エントリ＋パーティ編成（修行完了弟子＋通常キャラから1〜3人）
//   showRogueliteDraft   … 勝利後のバフカード3択
//   showRogueliteContinue… 継続 or 撤退
//   showRogueliteGameOver… ラン終了（撤退で帰還／全滅で没収）
//
// 立ち絵/アイコンは charImages（呼び出し側が渡す）から引く。無ければ頭文字フォールバック。
// 1280×720 ノースクロール方針：ロスターのみ内部スクロールに逃がす（F6 と同様の扱い）。

import { RARITY_META, CARD_CATEGORY, cardCategory } from "../data/rogueliteCardMaster.js";
import { ITEM_KIND_META, itemById, ITEM_SLOTS } from "../data/rogueliteItemMaster.js";
import { abilityDef } from "../data/abilityMaster.js";

const MAX_PARTY = 3;

// 編成カード用：能力名と「丈夫さ」目安（持ち点＝HPの厚み）。
const ROLE_LABEL = { attacker: "アタッカー", blocker: "ブロッカー", gambler: "ギャンブラー", support: "サポート" };
function charAbilityName(c) {
  const id = c?.abilities?.[0]?.abilityId;
  return id ? (abilityDef(id)?.name || "") : "";
}
function charToughness(c) {
  const hp = c?.stats?.startingPoints || 0;
  return hp >= 22000 ? "堅" : hp >= 15000 ? "並" : "脆";
}

function faceNode(charImages, c, cls = "rl-face") {
  const u = charImages?.url?.(c, "icon") || charImages?.url?.(c, "portrait") || "";
  if (u && c.isMob) {
    const d = document.createElement("div");
    d.className = `${cls} is-mob-face`;
    d.style.setProperty("--mob-sil", `url('${u}')`);
    return d;
  }
  if (u) {
    const img = document.createElement("img");
    img.className = cls; img.src = u; img.alt = c.name || "";
    return img;
  }
  const d = document.createElement("div");
  d.className = `${cls} rl-face-fb`;
  d.style.setProperty("--c", c.color || "#888");
  d.textContent = [...(c.name || "?")][0] || "?";
  return d;
}

// ---- パーティ編成 ----
export function showRoguelite(container, opts = {}) {
  const { deshiRoster = [], characters = [], charImages, bestFloor = 0, carry = [], onBack, onStart } = opts;
  if (!container) return;
  // 候補：修行完了弟子（先頭）＋通常キャラ。id 重複は弟子優先。
  const seen = new Set();
  const pool = [];
  for (const c of [...deshiRoster, ...characters]) {
    if (!c || seen.has(c.id) || c.isMob) continue;
    seen.add(c.id); pool.push(c);
  }
  const party = []; // 選択順＝席順（先頭=あなた）

  container.innerHTML = `
    <div class="rl-screen">
      <header class="rl-head">
        <h1 class="rl-title">楼光の館</h1>
        <div class="rl-best">これまでの最深到達記録：<b>${bestFloor}</b> 階</div>
      </header>
      <p class="rl-lead">弟子を連れて階層を登る。<b>味方2人が着卓し、敵2人と同卓（2対2）で戦う</b>。勝てばバフを選び、危なくなる前に撤退して記録を持ち帰れ。<b>戦える味方が1人以下になればランは没収</b>だ（一度トべば復活しない）。</p>
      <div class="rl-body">
        <div class="rl-party">
          <div class="rl-party-head">パーティ（1〜${MAX_PARTY}人・先頭「あなた」＝操作キャラ／3人目は控えで交代）</div>
          <div class="rl-party-slots" id="rl-party-slots"></div>
          ${carry.length ? `<div class="rl-carry">
            <div class="rl-carry-head">引き継ぎ中のバフ</div>
            <div class="rl-carry-chips">${carry.map((c) => {
              const meta = RARITY_META[c.rarity] || { color: "#999" };
              return `<span class="rl-carry-chip" style="--rarity:${meta.color}" title="${c.desc}">${c.name}</span>`;
            }).join("")}</div>
          </div>` : ""}
        </div>
        <div class="rl-roster">
          <div class="rl-roster-head">連れて行く打ち手を選ぶ</div>
          <div class="rl-roster-grid" id="rl-roster-grid"></div>
        </div>
      </div>
      <div class="rl-foot">
        <button type="button" class="ghost-back" id="rl-back">← 対戦ホームへ</button>
        <span class="rl-foot-hint">対局は右上の「オート」で観戦に切替可（設定は記憶される）</span>
        <button type="button" class="rl-start" id="rl-start" disabled>出発する</button>
      </div>
    </div>`;

  const slotsEl = container.querySelector("#rl-party-slots");
  const gridEl = container.querySelector("#rl-roster-grid");
  const startBtn = container.querySelector("#rl-start");

  const renderParty = () => {
    slotsEl.innerHTML = "";
    for (let i = 0; i < MAX_PARTY; i++) {
      const c = party[i];
      const slot = document.createElement("div");
      slot.className = "rl-slot" + (c ? " filled" : "") + (i === 0 ? " you" : "");
      if (c) {
        slot.appendChild(faceNode(charImages, c, "rl-slot-face"));
        const name = document.createElement("div");
        name.className = "rl-slot-name";
        name.textContent = c.name || "?";
        slot.appendChild(name);
        const tag = document.createElement("div");
        tag.className = "rl-slot-tag";
        tag.textContent = i === 0 ? "あなた" : i === MAX_PARTY - 1 ? "控え" : "相棒";
        slot.appendChild(tag);
        slot.title = "外す";
        slot.addEventListener("click", () => { party.splice(i, 1); sync(); });
      } else {
        slot.textContent = i === 0 ? "あなた" : "＋";
      }
      slotsEl.appendChild(slot);
    }
  };

  const renderGrid = () => {
    gridEl.innerHTML = "";
    for (const c of pool) {
      const inParty = party.some((p) => p.id === c.id);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "rl-cell" + (inParty ? " picked" : "") + (c.isCompletedAvatar ? " deshi" : "");
      cell.disabled = !inParty && party.length >= MAX_PARTY;
      cell.appendChild(faceNode(charImages, c, "rl-cell-face"));
      const nm = document.createElement("div");
      nm.className = "rl-cell-name";
      nm.textContent = c.name || "?";
      cell.appendChild(nm);
      // 能力名＋丈夫さ目安（誰を選ぶかの判断材料）。
      const info = document.createElement("div");
      info.className = "rl-cell-info";
      const ab = charAbilityName(c);
      const role = ROLE_LABEL[c.role] || "";
      const tough = charToughness(c);
      info.textContent = `${ab || role || "—"}・HP${tough}`;
      cell.appendChild(info);
      // 能力の「効果」までホバーで見せる（一見さんが手探りで選ばないように）。
      const abId = c?.abilities?.[0]?.abilityId;
      const def = abId ? abilityDef(abId) : null;
      const toughLabel = tough === "堅" ? "堅い（高HP）" : tough === "並" ? "並" : "脆い（低HP）";
      cell.title = `${c.name}｜${role}${def ? `\n能力「${def.name}」：${def.desc}` : ""}\nHPの厚み：${toughLabel}`;
      const pop = document.createElement("div");
      pop.className = "rl-cell-pop";
      pop.innerHTML = `<div class="rl-cell-pop-name">${c.name}<span class="rl-cell-pop-role">${role}・HP${toughLabel}</span></div>${def ? `<div class="rl-cell-pop-ab"><b>${def.name}</b>${def.desc ? `<span>${def.desc}</span>` : ""}</div>` : ""}`;
      cell.appendChild(pop);
      if (c.isCompletedAvatar) {
        const b = document.createElement("span");
        b.className = "rl-cell-badge"; b.textContent = "弟子";
        cell.appendChild(b);
      }
      if (inParty) { // 選択済みの明示（ロスターでも分かるように）
        const chk = document.createElement("span");
        chk.className = "rl-cell-check"; chk.textContent = `✓ ${party.findIndex((p) => p.id === c.id) === 0 ? "あなた" : "出陣中"}`;
        cell.appendChild(chk);
      }
      cell.addEventListener("click", () => {
        const idx = party.findIndex((p) => p.id === c.id);
        if (idx >= 0) party.splice(idx, 1);
        else if (party.length < MAX_PARTY) party.push(c);
        sync();
      });
      gridEl.appendChild(cell);
    }
  };

  const sync = () => { renderParty(); renderGrid(); startBtn.disabled = party.length < 1; };
  sync();

  container.querySelector("#rl-back")?.addEventListener("click", () => onBack?.());
  startBtn.addEventListener("click", () => { if (party.length) onStart?.([...party]); });
}

// ---- 中断ランの再開確認 ----
export function showRogueliteResume(container, opts = {}) {
  const { floor = 1, partyNames = [], onResume, onDiscard } = opts;
  if (!container) { onDiscard?.(); return; }
  container.innerHTML = ""; // キャラ選択の前に出す＝下地は空でよい
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-resume is-open";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">中断したランがあります</div>
      <p class="rl-continue-note">第 <b>${floor}</b> 階まで進んだランの続きがあります。<br>パーティ：${partyNames.join(" / ") || "?"}</p>
      <div class="rl-continue-btns">
        <button type="button" class="rl-start" id="rl-resume-yes">続きから再開する</button>
        <button type="button" class="rl-retreat" id="rl-resume-no">やめて新しく始める</button>
      </div>
      <p class="rl-route-hint">※「新しく始める」を選ぶと、中断したランのデータは破棄されます。</p>
    </div>`;
  container.appendChild(ov);
  ov.querySelector("#rl-resume-yes")?.addEventListener("click", () => { ov.remove(); onResume?.(); });
  ov.querySelector("#rl-resume-no")?.addEventListener("click", () => { ov.remove(); onDiscard?.(); });
}

// ---- バフカード3択 ----
export function showRogueliteDraft(container, opts = {}) {
  const { floor = 1, cards = [], onPick, title, coins = null } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-draft";
  const cardHtml = cards.map((c, i) => {
    const meta = RARITY_META[c.rarity] || { label: c.rarity, color: "#999" };
    const cat = CARD_CATEGORY[cardCategory(c)];
    return `
      <button type="button" class="rl-card r-${c.rarity}" data-i="${i}" style="--rarity:${meta.color}">
        <div class="rl-card-tags"><span class="rl-card-cat" style="--cat:${cat.color}">${cat.mark} ${cat.label}</span><span class="rl-card-rarity">${meta.label}</span></div>
        ${c.icon ? `<div class="rl-card-ico-wrap">${rlIcon(c.icon, "rl-card-ico")}</div>` : ""}
        <div class="rl-card-name">${c.name}</div>
        <div class="rl-card-desc">${c.desc}</div>
      </button>`;
  }).join("");
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">${title || `第 ${floor} 階 突破！　力を1つ授かる`}${coins != null ? coinBadge(coins) : ""}</div>
      <div class="rl-cards">${cardHtml || '<div class="rl-card-empty">授かれる力は出尽くした……</div>'}</div>
      ${cards.length ? "" : '<button type="button" class="rl-start" id="rl-skip">先へ進む</button>'}
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = (card) => { ov.remove(); onPick?.(card || null); };
  ov.querySelectorAll(".rl-card").forEach((btn) => {
    btn.addEventListener("click", () => close(cards[+btn.dataset.i]));
  });
  ov.querySelector("#rl-skip")?.addEventListener("click", () => close(null));
}

// ---- 継続 or 撤退 ----
export function showRogueliteContinue(container, opts = {}) {
  const { floor = 1, run, charImages, onContinue, onRetreat } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-continue";
  const hpRows = (run?.party || []).map((m) => {
    const pct = Math.max(0, Math.min(100, (m.hp / (m.hpMax || 1)) * 100));
    const tier = pct <= 25 ? "low" : pct <= 50 ? "mid" : "high";
    return `
      <div class="rl-hp-row">
        <span class="rl-hp-name">${m.char?.name || "?"}</span>
        <span class="rl-hp-bar"><span class="rl-hp-fill ${tier}" style="width:${pct}%"></span></span>
        <span class="rl-hp-val">${Math.max(0, Math.round(m.hp))}/${m.hpMax}</span>
      </div>`;
  }).join("");
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">第 ${floor} 階を踏破した</div>
      <div class="rl-hp-list">${hpRows}</div>
      <p class="rl-continue-note">このまま登れば報酬は増えるが、全滅すれば<strong>すべて没収</strong>。撤退すれば今の記録を持ち帰れる。</p>
      <div class="rl-continue-btns">
        <button type="button" class="rl-retreat" id="rl-retreat">撤退する（記録を確保）</button>
        <button type="button" class="rl-start" id="rl-continue">次の階へ（第 ${floor + 1} 階）</button>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  void charImages;
  ov.querySelector("#rl-continue")?.addEventListener("click", () => { ov.remove(); onContinue?.(); });
  ov.querySelector("#rl-retreat")?.addEventListener("click", () => { ov.remove(); onRetreat?.(); });
}

// フロア種別の表示メタ（アイコン色）。
const FLOOR_KIND_META = {
  battle: { mark: "⚔", color: "#e0734d" },
  rest: { mark: "♨", color: "#5ad17a" },
  banquet: { mark: "🍶", color: "#e8c45d" },
  treasure: { mark: "🎁", color: "#56a8ff" },
  event: { mark: "✦", color: "#c06bff" },
  boss: { mark: "☠", color: "#ff5470" },
  shop: { mark: "🛒", color: "#56a8ff" },
  gamble: { mark: "🎲", color: "#e8734d" },
  shrine: { mark: "⛩", color: "#c06bff" },
  forge: { mark: "🔨", color: "#e8c45d" },
};

// カード/道具の任意アイコン画像（HTML文字列）。src 未指定や読込失敗は空（呼び出し側の絵文字へ）。
// 画像が壊れていたら onerror で自分を消すので、絵文字マーク側が見える。
function rlIcon(src, cls = "rl-ico") {
  return src ? `<img class="${cls}" src="${src}" alt="" onerror="this.remove()">` : "";
}

// HP行/バッジ用の顔アイコン（HTML文字列）。実画像が無ければ頭文字フォールバック。
function faceImgHtml(charImages, c, cls = "rl-hp-face") {
  const u = charImages?.url?.(c, "icon") || charImages?.url?.(c, "portrait") || "";
  if (u && !c?.isMob) return `<img class="${cls}" src="${u}" alt="">`;
  return `<span class="${cls} rl-face-fb" style="--c:${c?.color || "#888"}">${[...(c?.name || "?")][0] || "?"}</span>`;
}

function partyHpRows(run, charImages) {
  return (run?.party || []).map((m) => {
    const pct = Math.max(0, Math.min(100, (m.hp / (m.hpMax || 1)) * 100));
    const tier = pct <= 25 ? "low" : pct <= 50 ? "mid" : "high";
    const down = m.hp <= 0;
    const face = charImages ? faceImgHtml(charImages, m.char) : "";
    return `<div class="rl-hp-row${down ? " is-down" : ""}">${face}<span class="rl-hp-name">${m.char?.name || "?"}${m.hungover ? " 🍶" : ""}</span><span class="rl-hp-bar"><span class="rl-hp-fill ${tier}" style="width:${pct}%"></span></span><span class="rl-hp-val">${down ? "ダウン" : `${Math.max(0, Math.round(m.hp))}/${m.hpMax}`}</span></div>`;
  }).join("");
}

const coinBadge = (coins) => `<div class="rl-coins">光貨 <b>${coins | 0}</b></div>`;
const skillBadge = (lv) => (lv ? `<div class="rl-skill">スキルLv <b>${lv}</b></div>` : "");

// 所持の可視化（A案：バフ／必殺技／道具の3分類で蓄積を legible に）。run.mods から集計。
//   バフ   … HP(hpMul)/攻(dealMul)/防(takeMul軽減) の累積% ＋ スキルLv
//   必殺技 … 付与能力（grantedAbilityIds・最大2）。技スロットとして名前で表示
//   道具   … お守り等の所持（friendlyGuard＝庇い×N）。個数で持つ使い切り
export function buffTotalsHtml(run) {
  const m = run?.mods; if (!m) return "";
  const C = CARD_CATEGORY;
  // バフ
  const hpPct = Math.round(((m.hpMul || 1) - 1) * 100);
  const atkPct = Math.round(((m.dealMul || 1) - 1) * 100);
  const defPct = Math.round((1 - (m.takeMul || 1)) * 100);
  const stat = (label, val, cls) => `<span class="rl-buff-stat ${cls}"><span class="rl-buff-k">${label}</span><b>${val >= 0 ? "+" : ""}${val}%</b></span>`;
  const lv = run?.skillLevel || 1;
  const buffRow = `${stat("HP", hpPct, "hp")}${stat("攻", atkPct, "atk")}${stat("防", defPct, "def")}${lv > 1 ? `<span class="rl-buff-stat skl"><span class="rl-buff-k">技Lv</span><b>${lv}</b></span>` : ""}`;
  // 必殺技（技スロット）
  const skills = (m.grantedAbilityIds || []).map((id) => abilityDef(id)?.name || id);
  const skillRow = skills.length
    ? skills.map((n) => `<span class="rl-inv-chip skill">${n}</span>`).join("")
    : `<span class="rl-inv-empty">なし</span>`;
  // 道具（スロットの中身＋庇いの守りチャージ）
  const items = [];
  for (const id of run?.items || []) { const it = itemById(id); if (it) items.push(`<span class="rl-inv-chip item">${it.icon ? rlIcon(it.icon, "rl-ico-sm") : "◆"} ${it.name}</span>`); }
  if ((m.friendlyGuard || 0) > 0) items.push(`<span class="rl-inv-chip item">◆ 庇いの守り ×${m.friendlyGuard}</span>`);
  const groupHead = (cat, extra = "") => `<span class="rl-inv-head" style="--cat:${C[cat].color}">${C[cat].mark} ${C[cat].label}${extra}</span>`;
  return `<div class="rl-inv">
    <div class="rl-inv-row">${groupHead("buff")}<div class="rl-buff-totals">${buffRow}</div></div>
    <div class="rl-inv-row">${groupHead("skill", ` <small>${skills.length}/2</small>`)}<div class="rl-inv-chips">${skillRow}</div></div>
    ${items.length ? `<div class="rl-inv-row">${groupHead("item", run?.items ? ` <small>${(run.items || []).length}/${ITEM_SLOTS}</small>` : "")}<div class="rl-inv-chips">${items.join("")}</div></div>` : ""}
  </div>`;
}

// 意思決定の瞬間に、先頭キャラが一言「返す」小トースト（立ち絵＋吹き出し）。
// 愛着×双方向＝選んだことが手触りとして返ってくる。数秒で自動的に消える。
let _speakTimer = null;
export function showRogueliteSpeak(container, { char, charImages, line } = {}) {
  if (!container || !char || !line) return;
  container.querySelector(".rl-speak")?.remove();
  clearTimeout(_speakTimer);
  const u = charImages?.url?.(char, "icon") || charImages?.url?.(char, "portrait") || "";
  const face = u
    ? `<img class="rl-speak-face" src="${u}" alt="">`
    : `<div class="rl-speak-face rl-speak-fb" style="--c:${char.color || "#888"}">${[...(char.name || "?")][0] || "?"}</div>`;
  const el = document.createElement("div");
  el.className = "rl-speak";
  el.innerHTML = `${face}<div class="rl-speak-bubble"><div class="rl-speak-name" style="color:${char.color || "var(--accent)"}">${char.name || ""}</div><div class="rl-speak-line">${line}</div></div>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  _speakTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 4200);
}

// ---- 進路選択（次フロアを2〜3択／ボス階は強制）＋撤退 ----
export function showRogueliteRoute(container, opts = {}) {
  const { floor = 1, choices = [], boss = false, coins = 0, skillLevel = 0, held = [], run = null, charImages = null, onPick, onRetreat, onSwap, onItems } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-route";
  let body;
  if (boss) {
    const m = FLOOR_KIND_META.boss;
    body = `<div class="rl-route-cards"><button type="button" class="rl-route-card boss" data-i="0" style="--rarity:${m.color}">
      <div class="rl-route-mark">${m.mark}</div><div class="rl-route-name">ボスフロア</div>
      <div class="rl-route-blurb">第 ${floor} 階・館の主が待つ。逃げ場はない。</div></button></div>`;
  } else {
    body = `<div class="rl-route-cards">${choices.map((f, i) => {
      const m = FLOOR_KIND_META[f.kind] || FLOOR_KIND_META.battle;
      return `<button type="button" class="rl-route-card" data-i="${i}" style="--rarity:${m.color}">
        <div class="rl-route-mark">${m.mark}</div><div class="rl-route-name">${f.name}</div>
        <div class="rl-route-blurb">${f.blurb || ""}</div></button>`;
    }).join("")}</div>`;
  }
  ov.innerHTML = `
    <div class="rl-modal rl-route-modal">
      <div class="rl-modal-head">第 ${floor} 階へ — 進路を選ぶ ${coinBadge(coins)}${skillBadge(skillLevel)}</div>
      <p class="rl-route-hint">光貨は戦闘を踏破するほど貯まり、<b>ショップ</b>で回復やバフに使える。10階ごとに<b>ボス</b>。</p>
      ${run ? `<div class="rl-route-party"><div class="rl-hp-list">${partyHpRows(run, charImages)}</div><div class="rl-route-btns">${onSwap ? `<button type="button" class="rl-swap-open" id="rl-route-swap">編成</button>` : ""}${onItems ? `<button type="button" class="rl-swap-open" id="rl-route-items">道具 ${(run.items || []).length}/${ITEM_SLOTS}</button>` : ""}</div></div>` : ""}
      ${run ? buffTotalsHtml(run) : ""}
      ${body}
      <button type="button" class="rl-retreat" id="rl-route-retreat">ここで撤退する（記録を確保）</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelectorAll(".rl-route-card").forEach((btn) => {
    btn.addEventListener("click", () => { ov.remove(); boss ? onPick?.() : onPick?.(choices[+btn.dataset.i]); });
  });
  ov.querySelector("#rl-route-retreat")?.addEventListener("click", () => { ov.remove(); onRetreat?.(); });
  ov.querySelector("#rl-route-swap")?.addEventListener("click", () => { ov.remove(); onSwap?.(); });
  ov.querySelector("#rl-route-items")?.addEventListener("click", () => { ov.remove(); onItems?.(); });
}

// ---- 編成（任意のタイミングでメンバー入れ替え） ----
// 出場順（run.lineup）を並べ替える。上の2人が着卓、3人目以降は控え（パッシブ能力源）。
// 並びは run.lineup（id配列）へ保存し、seatedAllies/benchAbilityIds がこれを尊重する。
export function showRogueliteSwap(container, opts = {}) {
  const { run, charImages, onClose } = opts;
  if (!container || !run) { onClose?.(); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-swap";
  // 現在の出場順（lineupが無ければ party 順）。
  const orderIds = (Array.isArray(run.lineup) && run.lineup.length)
    ? [...run.lineup, ...run.party.map((m) => m.id).filter((id) => !run.lineup.includes(id))]
    : run.party.map((m) => m.id);
  let order = orderIds.map((id) => run.party.find((m) => m.id === id)).filter(Boolean);

  const rowHtml = (m, i) => {
    const pct = Math.max(0, Math.min(100, (m.hp / (m.hpMax || 1)) * 100));
    const tier = pct <= 25 ? "low" : pct <= 50 ? "mid" : "high";
    // 着卓は出場順の上位2人。操作キャラ＝party[0]（あなた）。着卓2人にあなたが入るなら席0固定＝操作。
    const isYou = m.id === run.party[0]?.id;
    const role = i < 2 ? `<span class="rl-swap-tag active">出場${isYou ? "・操作" : ""}</span>` : `<span class="rl-swap-tag bench">控え</span>`;
    const dead = m.hp <= 0 ? " is-dead" : "";
    return `<div class="rl-swap-row${i < 2 ? " active" : " bench"}${dead}" data-id="${m.id}">
      <div class="rl-swap-move"><button type="button" class="rl-swap-up" data-id="${m.id}" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" class="rl-swap-down" data-id="${m.id}" ${i === order.length - 1 ? "disabled" : ""}>▼</button></div>
      <div class="rl-swap-face-wrap" data-face="${m.id}"></div>
      <div class="rl-swap-info"><div class="rl-swap-name" style="color:${m.char?.color || "#ccc"}">${m.char?.name || "?"}${m.hungover ? " 🍶" : ""} ${role}</div>
        <div class="rl-hp-bar"><span class="rl-hp-fill ${tier}" style="width:${pct}%"></span></div></div>
      <div class="rl-swap-hp">${Math.max(0, Math.round(m.hp))}/${m.hpMax}</div>
    </div>`;
  };
  const render = () => {
    const list = ov.querySelector("#rl-swap-list");
    // 着卓ライン：上の2人＝戦う／それ以下＝控え。境界を仕切りで明示（控えを出すには線より上へ）。
    const rowsHtml = order.map((m, i) => rowHtml(m, i));
    list.innerHTML = order.length > 2
      ? [...rowsHtml.slice(0, 2), `<div class="rl-swap-divider"><span>― ここまで着卓（戦う2人）／下は控え ―</span></div>`, ...rowsHtml.slice(2)].join("")
      : rowsHtml.join("");
    // 顔を挿す
    for (const m of order) {
      const slot = list.querySelector(`[data-face="${m.id}"]`);
      if (slot && m.char) slot.appendChild(faceNode(charImages, m.char, "rl-swap-face"));
    }
    const move = (id, dir) => {
      const idx = order.findIndex((m) => m.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= order.length) return;
      [order[idx], order[j]] = [order[j], order[idx]];
      run.lineup = order.map((m) => m.id); // 保存（seatedAllies が尊重）
      render();
    };
    list.querySelectorAll(".rl-swap-up").forEach((b) => b.addEventListener("click", () => move(b.dataset.id, -1)));
    list.querySelectorAll(".rl-swap-down").forEach((b) => b.addEventListener("click", () => move(b.dataset.id, +1)));
  };
  ov.innerHTML = `
    <div class="rl-modal rl-swap-modal">
      <div class="rl-modal-head">編成 — 誰を卓に出すか</div>
      <p class="rl-route-hint"><b>戦うのは上の2人だけ</b>（着卓は固定・勝手に入れ替わらない）。控えを卓に出すには ▲ で<b>着卓ラインより上</b>へ（先頭＝あなたが操作）。控えはパッシブ能力でサポート。着卓が倒れたときだけ控えが繰り上がる。</p>
      ${buffTotalsHtml(run)}
      <div class="rl-swap-list" id="rl-swap-list"></div>
      <button type="button" class="rl-start" id="rl-swap-close">この編成で進む</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  render();
  ov.querySelector("#rl-swap-close")?.addEventListener("click", () => { ov.remove(); onClose?.(); });
}

// ---- 追撃（push-your-luck）：先に行く / 追撃（残り回数） ----
export function showRoguelitePursue(container, opts = {}) {
  const { floor = 1, remaining = 1, run, charImages = null, leadLine, leadChar, onPursue, onGo } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-continue";
  const speakHtml = (leadLine && leadChar)
    ? `<div class="rl-modal-speak" style="--c:${leadChar.color || "var(--accent)"}"><b>${leadChar.name}</b>「${leadLine}」</div>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">第 ${floor} 階・追撃のチャンス（残り ${remaining}）${coinBadge(run?.coins || 0)}</div>
      ${speakHtml}
      <div class="rl-hp-list">${partyHpRows(run, charImages)}</div>
      <p class="rl-continue-note">追撃すればもう1局戦い、<strong>さらなる戦利品（高レア）</strong>を狙える。だが全滅すれば<strong>すべて没収</strong>。</p>
      <div class="rl-continue-btns">
        <button type="button" class="rl-start" id="rl-go">先へ進む</button>
        <button type="button" class="rl-retreat rl-pursue-btn" id="rl-pursue">追撃する</button>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-pursue")?.addEventListener("click", () => { ov.remove(); onPursue?.(); });
  ov.querySelector("#rl-go")?.addEventListener("click", () => { ov.remove(); onGo?.(); });
}

// ---- 休息 / 宴会（回復演出） ----
export function showRogueliteRest(container, opts = {}) {
  const { kind = "rest", floor = 1, run, charImages = null, hungover = [], soberUsed = false, onDone } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-rest";
  const isBanquet = kind === "banquet";
  const head = isBanquet ? "宴会フロア — 大盤振る舞い！" : "休息フロア — ひと息つく";
  const note = isBanquet ? "生存している味方のHPが全回復した。" : "生存している味方のHPが回復した。";
  const soberNote = soberUsed ? `<p class="rl-rest-hung" style="color:#6fe08a">◆ 酔い止めが割れて、二日酔いを防いだ。</p>` : "";
  const hungNote = hungover.length ? `<p class="rl-rest-hung">🍶 ${hungover.join("・")} は酔ってしまった……次の1戦は能力が使えない。</p>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">${head}${coinBadge(run?.coins || 0)}</div>
      <div class="rl-hp-list">${partyHpRows(run, charImages)}</div>
      <p class="rl-continue-note">${note}</p>
      ${soberNote}
      ${hungNote}
      <button type="button" class="rl-start" id="rl-rest-go">先へ進む</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-rest-go")?.addEventListener("click", () => { ov.remove(); onDone?.(); });
}

// ---- 遭遇イベント（会話＋2択／選んだら短く返す） ----
export function showRogueliteEvent(container, opts = {}) {
  const { event, speakerChar, charImages, floor = 1, onChoose, onDone, affordCoins = Infinity } = opts;
  if (!container || !event) { onDone?.(); return; }
  const affordable = (c) => !(c.outcome?.coins < 0) || affordCoins >= -c.outcome.coins;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-event";
  const portrait = speakerChar ? (charImages?.url?.(speakerChar, "portrait") || "") : "";
  const art = portrait
    ? `<img class="rl-event-art" src="${portrait}" alt="">`
    : `<div class="rl-event-art rl-event-art-fb"></div>`;
  const linesHtml = (event.lines || []).map((l) => `<p>${l}</p>`).join("");
  ov.innerHTML = `
    <div class="rl-modal rl-event-modal">
      <div class="rl-event-row">
        ${art}
        <div class="rl-event-body">
          <div class="rl-event-title">第 ${floor} 階・${event.title || "遭遇"}${Number.isFinite(affordCoins) ? coinBadge(affordCoins) : ""}</div>
          <div class="rl-event-lines">${linesHtml}</div>
          <div class="rl-event-choices">${(event.choices || []).map((c, i) => `<button type="button" class="rl-event-choice" data-i="${i}"${affordable(c) ? "" : " disabled"}>${c.label}${affordable(c) ? "" : "（光貨不足）"}</button>`).join("")}</div>
          <div class="rl-event-reply" id="rl-event-reply" hidden></div>
          <button type="button" class="rl-start" id="rl-event-go" hidden>先へ進む</button>
        </div>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelectorAll(".rl-event-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = event.choices[+btn.dataset.i];
      // 選択後：他の選択肢を消し、キャラが短く「返す」→「先へ進む」。
      ov.querySelector(".rl-event-choices").remove();
      const reply = ov.querySelector("#rl-event-reply");
      reply.hidden = false; reply.textContent = choice.reply || "";
      // 結果はここで確定（applyEventOutcome）。前進は「先へ進む」で。
      onChoose?.(choice);
      const go = ov.querySelector("#rl-event-go");
      go.hidden = false;
      go.addEventListener("click", () => { ov.remove(); onDone?.(); }, { once: true });
    });
  });
}

// ---- ダメージ計算の内訳（和了/被弾の「素点→ダメージ」を一拍見せる演出） ----
// host は #damage-overlay（対局オーバーレイ）。rows=[{name,color,kind:'deal'|'take',steps,final,capped}]
export function showRogueliteDamageBreakdown(container, opts = {}) {
  const { rows = [], tsumo = false, score = 0, showSkip = false, onSkip, onDone } = opts;
  if (!container || !rows.length) { onDone?.(); return; }
  const fmt = (v) => Math.abs(v).toLocaleString();
  const rowHtml = (rrow) => {
    const isDeal = rrow.kind === "deal";
    const pills = rrow.steps.map((s, k) => {
      const last = k === rrow.steps.length - 1;
      return `<span class="rl-calc-step${last ? " final" : ""}" style="--d:${k * 90}ms">${s.k}${last ? "" : `<b>${fmt(s.v)}</b>`}</span>`;
    }).join('<span class="rl-calc-arrow">→</span>');
    return `<div class="rl-calc-row ${isDeal ? "deal" : "take"}">
      <div class="rl-calc-head"><span class="rl-calc-kind">${isDeal ? "与ダメージ" : "被ダメージ"}</span><span class="rl-calc-name" style="color:${rrow.color}">${rrow.name}</span></div>
      <div class="rl-calc-chain">${pills}</div>
      <div class="rl-calc-result ${isDeal ? "deal" : "take"}">${isDeal ? "" : "−"}${fmt(rrow.final)}<small>${isDeal ? "ダメージ" : "HP"}</small>${rrow.capped ? '<span class="rl-calc-cap">上限で軽減！</span>' : ""}</div>
    </div>`;
  };
  container.innerHTML = `
    <div class="dmg-card rl-calc-card">
      <div class="dmg-head">ダメージ計算　<small>${tsumo ? "ツモ" : "ロン"} ${score ? score.toLocaleString() + "点" : ""}</small></div>
      <div class="rl-calc-rows">${rows.map(rowHtml).join("")}</div>
      <p class="tb-note">素点を ×0.04 でHPに換算し、攻撃/防御バフ・階層の深度・上限を経て最終ダメージが決まる。</p>
      ${showSkip ? `<label class="rl-calc-skip"><input type="checkbox" id="rl-calc-skip"> 以後この計算を自動で出さない（ダメージカードの「🔍計算を見る」でいつでも確認できます）</label>` : ""}
      <button class="btn tb-next-btn" id="rl-calc-next">次へ</button>
    </div>`;
  container.classList.remove("hidden");
  requestAnimationFrame(() => { container.classList.add("show"); container.querySelectorAll(".rl-calc-step").forEach((s) => s.classList.add("in")); });
  container.querySelector("#rl-calc-next").onclick = () => {
    if (container.querySelector("#rl-calc-skip")?.checked) onSkip?.();
    onDone?.();
  };
}

// ---- 道具パネル（フロア選択時に使う・最大3スロット） ----
export function showRogueliteItems(container, opts = {}) {
  const { run, onUse, onClose } = opts;
  if (!container || !run) { onClose?.(); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-items";
  const slotHtml = (id, i) => {
    if (!id) return `<div class="rl-item-slot empty"><span>空きスロット ${i + 1}</span></div>`;
    const it = itemById(id); if (!it) return "";
    const km = ITEM_KIND_META[it.kind] || {};
    const usable = it.kind === "active";
    return `<div class="rl-item-slot" data-id="${id}">
      <div class="rl-item-head"><span class="rl-item-kind" style="--cat:${km.color}">${it.icon ? rlIcon(it.icon, "rl-ico") : km.mark} ${km.label}</span><span class="rl-item-name">${it.name}</span></div>
      <div class="rl-item-desc">${it.desc}</div>
      ${usable ? `<button type="button" class="rl-item-use" data-use="${id}">使う</button>` : `<div class="rl-item-passive">${it.kind === "passive" ? "持っている間ずっと有効" : "条件で自動発動"}</div>`}
    </div>`;
  };
  const render = () => {
    const list = ov.querySelector("#rl-item-list");
    const ids = run.items || [];
    list.innerHTML = Array.from({ length: ITEM_SLOTS }, (_, i) => slotHtml(ids[i], i)).join("");
    list.querySelectorAll(".rl-item-use").forEach((b) => b.addEventListener("click", () => onUse?.(b.dataset.use)));
  };
  ov.innerHTML = `
    <div class="rl-modal rl-items-modal">
      <div class="rl-modal-head">道具（${(run.items || []).length}/${ITEM_SLOTS}）</div>
      <p class="rl-route-hint">消費は<b>このフロア選択のタイミング</b>で使う。常設は持っている間ずっと、自動は条件で勝手に発動する。</p>
      <div class="rl-item-list" id="rl-item-list"></div>
      <button type="button" class="rl-start" id="rl-items-close">閉じる</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  render();
  ov.querySelector("#rl-items-close")?.addEventListener("click", () => { ov.remove(); onClose?.(); });
}

// ---- 道具の入れ替え（スロット満杯で新規入手時） ----
export function showRogueliteItemSwap(container, opts = {}) {
  const { current = [], incoming, slots = 3, onResolve } = opts;
  if (!container || !incoming) { onResolve?.(null); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-forget";
  const km = (it) => ITEM_KIND_META[it?.kind] || {};
  const rows = current.map((it) => `
    <button type="button" class="rl-forget-row" data-id="${it.id}">
      <div class="rl-forget-info"><div class="rl-forget-name"><span class="rl-item-kind" style="--cat:${km(it).color}">${it.icon ? rlIcon(it.icon, "rl-ico") : km(it).mark}</span> ${it.name}</div>
        <div class="rl-forget-desc">${it.desc || ""}</div></div>
      <div class="rl-forget-x">これと入替</div>
    </button>`).join("");
  ov.innerHTML = `
    <div class="rl-modal rl-forget-modal">
      <div class="rl-modal-head">道具は最大 ${slots} つ — 入れ替える</div>
      <p class="rl-route-hint">新しい道具「<b style="color:${km(incoming).color}">${incoming.name}</b>」を手に入れた。<br><span class="rl-forget-desc">${incoming.desc || ""}</span><br>どれと入れ替える？</p>
      <div class="rl-forget-list">${rows}</div>
      <button type="button" class="rl-retreat" id="rl-itemswap-skip">今の道具のままにする（新しいのを諦める）</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelectorAll(".rl-forget-row").forEach((b) => b.addEventListener("click", () => { ov.remove(); onResolve?.(b.dataset.id); }));
  ov.querySelector("#rl-itemswap-skip")?.addEventListener("click", () => { ov.remove(); onResolve?.(null); });
}

// ---- 必殺枠の忘却（ポケモン式：枠超過＝どれか1つ手放す） ----
export function showRogueliteForget(container, opts = {}) {
  const { abilities = [], newId = null, cap = 2, onForget } = opts;
  if (!container || abilities.length === 0) { onForget?.(null); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-forget";
  const rows = abilities.map((a) => `
    <button type="button" class="rl-forget-row${a.id === newId ? " is-new" : ""}" data-id="${a.id}">
      <div class="rl-forget-info"><div class="rl-forget-name">${a.name}${a.id === newId ? ' <span class="rl-forget-tag">NEW</span>' : ""}</div>
        <div class="rl-forget-desc">${a.desc || ""}</div></div>
      <div class="rl-forget-x">手放す</div>
    </button>`).join("");
  ov.innerHTML = `
    <div class="rl-modal rl-forget-modal">
      <div class="rl-modal-head">追加必殺は最大 ${cap} つ — 1つ手放す</div>
      <p class="rl-route-hint">覚えられる付与能力は<b>${cap}つまで</b>。新しい力を得るなら、ひとつ手放さなければならない。</p>
      <div class="rl-forget-list">${rows}</div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelectorAll(".rl-forget-row").forEach((b) => b.addEventListener("click", () => { ov.remove(); onForget?.(b.dataset.id); }));
}

// ---- 鍛冶屋（光貨でスキルレベルを鍛える。打つたびLv/残高を更新） ----
export function showRogueliteForge(container, opts = {}) {
  const { floor = 1, run, cap = 10, costOf, onForge, onLeave } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-forge";
  const render = () => {
    const lv = run?.skillLevel || 1;
    const cost = costOf ? costOf(lv) : 40;
    const maxed = lv >= cap;
    const afford = (run?.coins || 0) >= cost;
    ov.querySelector("#rl-forge-lv").textContent = lv;
    ov.querySelector("#rl-forge-coins").textContent = run?.coins | 0;
    const btn = ov.querySelector("#rl-forge-do");
    btn.disabled = maxed || !afford;
    btn.textContent = maxed ? "これ以上は鍛えられない（Lv上限）" : `鍛える（光貨 ${cost}）→ Lv${lv + 1}`;
    ov.querySelector("#rl-forge-note").textContent = maxed
      ? "パーティのスキルは極まっている。"
      : afford ? "スキルレベルが上がると、全員の能力そのものが強くなる。" : "光貨が足りない。戦って稼ごう。";
  };
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">第 ${floor} 階・鍛冶屋 — スキルLv <b id="rl-forge-lv">1</b>　／　光貨 <b id="rl-forge-coins">0</b></div>
      <p class="rl-continue-note" id="rl-forge-note"></p>
      <div class="rl-continue-btns">
        <button type="button" class="rl-start" id="rl-forge-do"></button>
        <button type="button" class="rl-retreat" id="rl-forge-leave">店を出る</button>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  render();
  ov.querySelector("#rl-forge-do")?.addEventListener("click", () => { if (onForge?.()) render(); });
  ov.querySelector("#rl-forge-leave")?.addEventListener("click", () => { ov.remove(); onLeave?.(); });
}

// ---- ショップ（光貨で購入。買うたび在庫/残高を更新） ----
export function showRogueliteShop(container, opts = {}) {
  const { floor = 1, run, stock = [], onBuy, onLeave } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-shop";
  const sold = new Set();
  const render = () => {
    const items = stock.map((it, i) => {
      const meta = RARITY_META[it.rarity] || { color: "#9aa3b2" };
      const catKey = it.type === "card" ? cardCategory(it.card) : it.type === "heal" ? "item" : "buff";
      const cat = CARD_CATEGORY[catKey];
      const ico = it.type === "card" ? it.card?.icon : it.type === "item" ? it.item?.icon : null; // 任意アイコン
      const isSold = sold.has(i);
      const afford = (run?.coins || 0) >= it.price;
      const cls = "rl-shop-item" + (isSold ? " sold" : "") + (!afford && !isSold ? " poor" : "");
      return `<button type="button" class="${cls}" data-i="${i}" style="--rarity:${meta.color}" ${isSold || !afford ? "disabled" : ""}>
        <div class="rl-shop-toprow"><span class="rl-card-cat" style="--cat:${cat.color}">${ico ? rlIcon(ico, "rl-ico-sm") : cat.mark} ${cat.label}</span><span class="rl-shop-price">光貨 ${it.price}</span></div>
        <div class="rl-shop-name">${it.name}</div>
        <div class="rl-shop-desc">${it.desc}</div>
        <div class="rl-shop-tag">${isSold ? "売約済" : afford ? "購入" : "光貨不足"}</div>
      </button>`;
    }).join("");
    ov.querySelector(".rl-shop-items").innerHTML = items;
    ov.querySelector("#rl-shop-coins").textContent = run?.coins | 0;
    ov.querySelectorAll(".rl-shop-item:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = +btn.dataset.i;
        if (onBuy?.(stock[i])) { sold.add(i); render(); }
      });
    });
  };
  ov.innerHTML = `
    <div class="rl-modal rl-shop-modal">
      <div class="rl-modal-head">第 ${floor} 階・ショップ — 所持 光貨 <b id="rl-shop-coins">0</b></div>
      <div class="rl-shop-items"></div>
      <button type="button" class="rl-start" id="rl-shop-leave">店を出る</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  render();
  ov.querySelector("#rl-shop-leave")?.addEventListener("click", () => { ov.remove(); onLeave?.(); });
}

// ---- ラン終了（＋引き継ぎバフ選択） ----
export function showRogueliteGameOver(container, opts = {}) {
  const { reached = 0, wiped = false, retreated = false, bestFloor = 0, carrySlots = 0, acquired = [], partingLine, speakerChar, bondDeepened = false, partyChars = [], onClose } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-gameover" + (wiped ? " wiped" : " safe");
  const title = wiped ? "全滅……ランは没収された" : retreated ? "撤退成功・記録を持ち帰った" : "ラン終了";
  const sub = wiped
    ? `第 ${reached} 階で力尽きた。到達の記録だけが残る。`
    : `第 ${reached} 階まで到達した。`;
  const canCarry = carrySlots > 0 && acquired.length > 0;
  const carryHtml = canCarry ? `
    <div class="rl-carry-pick">
      <div class="rl-carry-pick-head">次のランへ引き継ぐバフを選ぶ（最大 <b id="rl-carry-max">${carrySlots}</b> 枠）</div>
      <div class="rl-carry-pick-list">${acquired.map((c) => {
        const meta = RARITY_META[c.rarity] || { color: "#999" };
        return `<button type="button" class="rl-pick-chip r-${c.rarity}" data-id="${c.id}" style="--rarity:${meta.color}" title="${c.desc}">${c.name}</button>`;
      }).join("")}</div>
      <div class="rl-carry-count" id="rl-carry-count">0 / ${carrySlots} 枠</div>
    </div>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-go-banner">${title}</div>
      <div class="rl-go-stats">
        <div class="rl-go-stat"><div class="rl-go-k">到達</div><div class="rl-go-v">${reached} 階</div></div>
        <div class="rl-go-stat"><div class="rl-go-k">最深記録</div><div class="rl-go-v">${bestFloor} 階</div></div>
      </div>
      <p class="rl-go-sub">${sub}</p>
      ${bondDeepened ? `<p class="rl-go-bond">◆ 共に戦い抜き、${partyChars.length > 1 ? "仲間たち" : (partyChars[0]?.name || "相棒")}との絆が少し深まった。</p>` : ""}
      ${partingLine && speakerChar ? `<div class="rl-modal-speak" style="--c:${speakerChar.color || "var(--accent)"}"><b>${speakerChar.name}</b>「${partingLine}」</div>` : ""}
      ${carryHtml}
      <button type="button" class="rl-start" id="rl-go-close">編成へ戻る</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));

  // 引き継ぎ選択：最大 carrySlots 枠までトグル。超過時は他を選べない（上限ガード）。
  const selected = new Set();
  const countEl = ov.querySelector("#rl-carry-count");
  const chips = [...ov.querySelectorAll(".rl-pick-chip")];
  const refresh = () => {
    if (countEl) countEl.textContent = `${selected.size} / ${carrySlots} 枠`;
    for (const ch of chips) {
      const on = selected.has(ch.dataset.id);
      ch.classList.toggle("picked", on);
      ch.disabled = !on && selected.size >= carrySlots;
    }
  };
  for (const ch of chips) {
    ch.addEventListener("click", () => {
      const id = ch.dataset.id;
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < carrySlots) selected.add(id);
      refresh();
    });
  }
  refresh();

  ov.querySelector("#rl-go-close")?.addEventListener("click", () => { ov.remove(); onClose?.([...selected]); });
}
