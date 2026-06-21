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

import { RARITY_META } from "../data/rogueliteCardMaster.js";
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
      <p class="rl-lead">弟子を連れて階層を登る。<b>味方2人が着卓し、敵2人と同卓（2対2）で戦う</b>。勝てばバフを選び、危なくなる前に撤退して記録を持ち帰れ。<b>全員がトベばランは没収</b>だ。</p>
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
      info.textContent = `${ab || role || "—"}・HP${charToughness(c)}`;
      cell.title = `${c.name}｜${role}${ab ? "｜能力：" + ab : ""}｜HPの厚み：${charToughness(c)}`;
      cell.appendChild(info);
      if (c.isCompletedAvatar) {
        const b = document.createElement("span");
        b.className = "rl-cell-badge"; b.textContent = "弟子";
        cell.appendChild(b);
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

// ---- バフカード3択 ----
export function showRogueliteDraft(container, opts = {}) {
  const { floor = 1, cards = [], onPick, title, coins = null } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-draft";
  const cardHtml = cards.map((c, i) => {
    const meta = RARITY_META[c.rarity] || { label: c.rarity, color: "#999" };
    return `
      <button type="button" class="rl-card r-${c.rarity}" data-i="${i}" style="--rarity:${meta.color}">
        <div class="rl-card-rarity">${meta.label}</div>
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

function partyHpRows(run) {
  return (run?.party || []).map((m) => {
    const pct = Math.max(0, Math.min(100, (m.hp / (m.hpMax || 1)) * 100));
    const tier = pct <= 25 ? "low" : pct <= 50 ? "mid" : "high";
    return `<div class="rl-hp-row"><span class="rl-hp-name">${m.char?.name || "?"}${m.hungover ? " 🍶" : ""}</span><span class="rl-hp-bar"><span class="rl-hp-fill ${tier}" style="width:${pct}%"></span></span><span class="rl-hp-val">${Math.max(0, Math.round(m.hp))}/${m.hpMax}</span></div>`;
  }).join("");
}

const coinBadge = (coins) => `<div class="rl-coins">光貨 <b>${coins | 0}</b></div>`;
const skillBadge = (lv) => (lv ? `<div class="rl-skill">スキルLv <b>${lv}</b></div>` : "");

// バフ合計（HP/攻撃/防御）の可視化。run.mods から集計＝蓄積の見える化。
//   HP   … maxHpUp の累積倍率（hpMul）→ +X%
//   攻撃 … dealMul → +X%（与ダメ増）
//   防御 … takeMul → 軽減率 (1-takeMul) → +X%（被ダメ減）
// お守り（味方ツモ無効）の残数も併記。
export function buffTotalsHtml(run) {
  const m = run?.mods; if (!m) return "";
  const hpPct = Math.round(((m.hpMul || 1) - 1) * 100);
  const atkPct = Math.round(((m.dealMul || 1) - 1) * 100);
  const defPct = Math.round((1 - (m.takeMul || 1)) * 100);
  const guard = m.friendlyGuard || 0;
  const stat = (label, val, cls) => `<span class="rl-buff-stat ${cls}"><span class="rl-buff-k">${label}</span><b>${val >= 0 ? "+" : ""}${val}%</b></span>`;
  return `<div class="rl-buff-totals">
    ${stat("HP", hpPct, "hp")}${stat("攻", atkPct, "atk")}${stat("防", defPct, "def")}
    ${guard > 0 ? `<span class="rl-buff-stat ward"><span class="rl-buff-k">庇い</span><b>×${guard}</b></span>` : ""}
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
  const { floor = 1, choices = [], boss = false, coins = 0, skillLevel = 0, held = [], run = null, onPick, onRetreat, onSwap } = opts;
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
      ${run ? `<div class="rl-route-party"><div class="rl-hp-list">${partyHpRows(run)}</div>${onSwap ? `<button type="button" class="rl-swap-open" id="rl-route-swap">編成</button>` : ""}</div>` : ""}
      ${run ? buffTotalsHtml(run) : ""}
      ${body}
      ${held.length ? `<div class="rl-held"><span class="rl-held-label">所持バフ</span>${held.map((b) => {
        const m = RARITY_META[b.rarity] || { color: "#9aa3b2" };
        return `<span class="rl-held-chip" style="--rarity:${m.color}" title="${b.desc || ""}">${b.name}${b.count > 1 ? `×${b.count}` : ""}</span>`;
      }).join("")}</div>` : ""}
      <button type="button" class="rl-retreat" id="rl-route-retreat">ここで撤退する（記録を確保）</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelectorAll(".rl-route-card").forEach((btn) => {
    btn.addEventListener("click", () => { ov.remove(); boss ? onPick?.() : onPick?.(choices[+btn.dataset.i]); });
  });
  ov.querySelector("#rl-route-retreat")?.addEventListener("click", () => { ov.remove(); onRetreat?.(); });
  ov.querySelector("#rl-route-swap")?.addEventListener("click", () => { ov.remove(); onSwap?.(); });
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
    return `<div class="rl-swap-row${dead}" data-id="${m.id}">
      <div class="rl-swap-move"><button type="button" class="rl-swap-up" data-id="${m.id}" ${i === 0 ? "disabled" : ""}>▲</button><button type="button" class="rl-swap-down" data-id="${m.id}" ${i === order.length - 1 ? "disabled" : ""}>▼</button></div>
      <div class="rl-swap-face-wrap" data-face="${m.id}"></div>
      <div class="rl-swap-info"><div class="rl-swap-name" style="color:${m.char?.color || "#ccc"}">${m.char?.name || "?"}${m.hungover ? " 🍶" : ""} ${role}</div>
        <div class="rl-hp-bar"><span class="rl-hp-fill ${tier}" style="width:${pct}%"></span></div></div>
      <div class="rl-swap-hp">${Math.max(0, Math.round(m.hp))}/${m.hpMax}</div>
    </div>`;
  };
  const render = () => {
    const list = ov.querySelector("#rl-swap-list");
    list.innerHTML = order.map((m, i) => rowHtml(m, i)).join("");
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
      <div class="rl-modal-head">編成 — 出場順の入れ替え</div>
      <p class="rl-route-hint">上の<b>2人が着卓</b>して戦う。3人目以降は<b>控え</b>（パッシブ能力でサポート）。▲▼で並べ替え。</p>
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
  const { floor = 1, remaining = 1, run, leadLine, leadChar, onPursue, onGo } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-continue";
  const speakHtml = (leadLine && leadChar)
    ? `<div class="rl-modal-speak" style="--c:${leadChar.color || "var(--accent)"}"><b>${leadChar.name}</b>「${leadLine}」</div>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">第 ${floor} 階・追撃のチャンス（残り ${remaining}）${coinBadge(run?.coins || 0)}</div>
      ${speakHtml}
      <div class="rl-hp-list">${partyHpRows(run)}</div>
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
  const { kind = "rest", floor = 1, run, hungover = [], onDone } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-rest";
  const isBanquet = kind === "banquet";
  const head = isBanquet ? "宴会フロア — 大盤振る舞い！" : "休息フロア — ひと息つく";
  const note = isBanquet ? "パーティ全員のHPが全回復した。" : "パーティ全員のHPが回復した。";
  const hungNote = hungover.length ? `<p class="rl-rest-hung">🍶 ${hungover.join("・")} は酔ってしまった……次の1戦は能力が使えない。</p>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">${head}${coinBadge(run?.coins || 0)}</div>
      <div class="rl-hp-list">${partyHpRows(run)}</div>
      <p class="rl-continue-note">${note}</p>
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
      const isSold = sold.has(i);
      const afford = (run?.coins || 0) >= it.price;
      const cls = "rl-shop-item" + (isSold ? " sold" : "") + (!afford && !isSold ? " poor" : "");
      return `<button type="button" class="${cls}" data-i="${i}" style="--rarity:${meta.color}" ${isSold || !afford ? "disabled" : ""}>
        <div class="rl-shop-price">光貨 ${it.price}</div>
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
  const { reached = 0, wiped = false, retreated = false, bestFloor = 0, carrySlots = 0, acquired = [], partingLine, speakerChar, onClose } = opts;
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
