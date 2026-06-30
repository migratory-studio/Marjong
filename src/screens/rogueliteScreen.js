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

import { RARITY_META, CARD_CATEGORY, cardCategory, cardById, CLUSTER_META, clusterOf } from "../data/rogueliteCardMaster.js";
import { clusterProgress, clusterPickPreview } from "../roguelite/cardEffects.js";
import { ITEM_KIND_META, itemById, ITEM_SLOTS } from "../data/rogueliteItemMaster.js";
import { abilityDef } from "../data/abilityMaster.js";
import { biomeEffectChips, biomeOf } from "../data/rogueliteBiomeMaster.js";
import { tableSizeLabel, isSoloTable, ABILITY_SOURCE_MAX, soloPenaltyHint } from "../roguelite/run.js";
import { bgDef } from "../data/backgroundMaster.js";
import { portraitStyleAttr } from "../data/imagePos.js";

const MAX_PARTY = 3;

// 章ごとのカラーセット（tools/roguelite-designer.html が chapter.colorSet を生成）を
// 演出パネルへインライン適用。指定キーだけ上書き＝未指定は CSS 既定/tone のまま。
export function applyChapterColorSet(el, cs) {
  if (!el || !cs || typeof cs !== "object") return;
  if (cs.gold) el.style.setProperty("--rl-gold", cs.gold);
  if (cs.ink) el.style.setProperty("--rl-ink", cs.ink);
  if (cs.edge) el.style.setProperty("--rl-edge", cs.edge);
  if (cs.ember) el.style.setProperty("--rl-ember", cs.ember);
  if (cs.tc) el.style.setProperty("--tc", cs.tc);
}

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

// 立ち絵（対局開始と同じ portrait）をHTML文字列で返す。出陣編成の縦カラム用。実画像が無ければ頭文字。
function portraitHtml(charImages, c, cls = "rl-deploy-col-art") {
  const u = charImages?.url?.(c, "portrait") || charImages?.url?.(c, "icon") || "";
  if (u && !c?.isMob) {
    const isPortrait = u === charImages?.url?.(c, "portrait");
    const ps = isPortrait ? ` style="${portraitStyleAttr(c, { zoom: false, translate: false })}"` : "";
    return `<img class="${cls}" src="${u}" alt=""${ps}>`;
  }
  return `<div class="${cls} rl-face-fb" style="--c:${c?.color || "#888"}">${[...(c?.name || "?")][0] || "?"}</div>`;
}

// 能力の中身を小モーダルで表示（出陣編成で能力チップをクリック）。abilityMaster の定義をそのまま読む。
function showAbilityModal(host, abilityId) {
  const d = abilityDef(abilityId);
  if (!host || !d) return;
  const kind = d.activation === "manual" ? "任意発動" : "常時発動";
  const scope = d.activation === "manual" && Number.isFinite(d.maxCharges)
    ? (d.chargeScope === "game" ? `1ゲーム${d.maxCharges}回` : `1局${d.maxCharges}回`) : "";
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-abil-modal";
  ov.innerHTML = `
    <div class="rl-modal rl-abil-card">
      <div class="rl-abil-h">${d.name}<span class="rl-abil-kind">${kind}${scope ? ` ・ ${scope}` : ""}</span></div>
      <p class="rl-abil-desc">${d.desc || d.blurb || ""}</p>
      <button type="button" class="rl-start" id="rl-abil-close">閉じる</button>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = () => ov.remove();
  ov.querySelector("#rl-abil-close")?.addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
}

// ---- パーティ編成 ----
// ---- 大章（記憶）選択ハブ（提案B §3.1 ①／「記憶の塔」縦選択）。どの記憶を登るかを選ぶ ----
// 塔＝記憶を辿る縦軸そのもの：層を下(第一)から上へ積み、解禁された記憶は灯り、未解禁は封じられて翳る。
export function showRogueliteChapterSelect(container, opts = {}) {
  const { chapters = [], bestFloor = 0, orbs = 0, onPick, onBack, onOrbUnlock } = opts;
  if (!container || !chapters.length) { onBack?.(); return; }

  const sealReason = (ch) => {
    if (ch.comingSoon) return "未だ綴られぬ記憶 ・ 近日";
    const prev = chapters.find((c) => c.id === ch.unlock);
    return prev ? `「${prev.title}」を踏破すると開く` : "まだ開かれていない記憶";
  };

  container.innerHTML = `
    <div class="rl-screen rl-chapter">
      <div class="rl-chap-backdrop"></div>
      <header class="rl-chap-head">
        <span class="rl-chap-eyebrow">楼光の館 ・ 記憶を映す塔</span>
        <h1 class="rl-chap-title">登る記憶を選ぶ</h1>
        <span class="rl-chap-best">最深の記録　<b>${bestFloor}</b> 階</span>
      </header>
      <div class="rl-chap-body">
        <ol class="rl-tower" id="rl-tower">
          ${chapters.map((ch, i) => `
            <li class="rl-stratum tone-${ch.tone} ${ch.unlocked ? "is-open" : "is-sealed"}" data-id="${ch.id}" style="--rise:${(chapters.length - 1 - i) * 70}ms" tabindex="0" role="button" aria-pressed="false">
              <span class="rl-stratum-rune">${ch.unlocked ? (ch.cleared ? "✦" : "◇") : "封"}</span>
              <span class="rl-stratum-meta">
                <span class="rl-stratum-sub">${ch.subtitle}</span>
                <span class="rl-stratum-name">${ch.unlocked ? ch.title : "？？？"}</span>
              </span>
            </li>`).join("")}
        </ol>
        <section class="rl-chap-detail" id="rl-chap-detail"></section>
      </div>
      <footer class="rl-chap-foot">
        <button type="button" class="ghost-back" id="rl-chap-back">← 対戦ホームへ</button>
        <span class="rl-chap-foot-hint">踏破した記憶が、次の記憶への扉を開く。</span>
      </footer>
    </div>`;

  const detailEl = container.querySelector("#rl-chap-detail");
  const strata = [...container.querySelectorAll(".rl-stratum")];

  const renderDetail = (ch) => {
    const castChips = (ch.cast || []).map((p) => `<span class="rl-chap-castchip">${p.name}</span>`).join("");
    detailEl.className = `rl-chap-detail tone-${ch.tone}`;
    detailEl.innerHTML = ch.unlocked
      ? `
        <div class="rl-chap-sub">${ch.subtitle}${ch.cleared ? ' ・ <span class="rl-chap-done">踏破済</span>' : ""}</div>
        <h2 class="rl-chap-name">${ch.title}</h2>
        <p class="rl-chap-blurb">${ch.blurb}</p>
        <div class="rl-chap-cast"><span class="rl-chap-cast-k">登場</span>${castChips}</div>
        <p class="rl-chap-aim">${ch.aim}</p>
        <button type="button" class="rl-start rl-chap-go" id="rl-chap-go">この記憶を登る ›</button>`
      : `
        <div class="rl-chap-sub">${ch.subtitle}</div>
        <h2 class="rl-chap-name rl-chap-name-sealed">封じられた記憶</h2>
        <p class="rl-chap-blurb">この記憶は、まだ姿を見せない。</p>
        <div class="rl-chap-seal"><span class="rl-chap-seal-rune">封</span>${sealReason(ch)}</div>
        ${(!ch.comingSoon && ch.orbUnlockCost > 0 && onOrbUnlock) ? `<button type="button" class="rl-start rl-chap-orb" id="rl-chap-orb"${orbs >= ch.orbUnlockCost ? "" : " disabled"}>宝珠 ${ch.orbUnlockCost} で解く${orbs >= ch.orbUnlockCost ? "" : "（所持 " + orbs + "）"}</button>` : ""}`;
    const go = detailEl.querySelector("#rl-chap-go");
    if (go) go.addEventListener("click", () => onPick?.(ch.id), { once: true });
    const orbBtn = detailEl.querySelector("#rl-chap-orb");
    if (orbBtn) orbBtn.addEventListener("click", () => onOrbUnlock?.(ch.id), { once: true });
  };

  const focus = (id) => {
    const ch = chapters.find((c) => c.id === id);
    if (!ch) return;
    for (const s of strata) { const on = s.dataset.id === id; s.classList.toggle("is-focused", on); s.setAttribute("aria-pressed", on ? "true" : "false"); }
    renderDetail(ch);
  };
  for (const s of strata) {
    const pick = () => focus(s.dataset.id);
    s.addEventListener("click", pick);
    s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  }
  // 既定フォーカス＝未踏破の最初の解禁章（無ければ先頭）＝「いま登るべき記憶」を提示。
  const def = chapters.find((c) => c.unlocked && !c.cleared) || chapters.find((c) => c.unlocked) || chapters[0];
  focus(def.id);

  container.querySelector("#rl-chap-back")?.addEventListener("click", () => onBack?.());
}

export function showRoguelite(container, opts = {}) {
  const { deshiRoster = [], characters = [], unlockedIds = null, charImages, bestFloor = 0, carry = [], onBack, onStart, backLabel = "← 対戦ホームへ" } = opts;
  if (!container) return;
  // 未解禁キャラ（characterMaster で locked:true ＆ 宝珠ショップ未購入）。鍵・非アクティブで出す。
  const isLocked = (c) => !!(c && c.locked) && !(unlockedIds && unlockedIds.has(c.id));
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
          <div class="rl-party-head">パーティ（1〜${MAX_PARTY}人・先頭「あなた」＝操作キャラ／3人目は控え＝倒れたら繰り上がり）</div>
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
        <button type="button" class="ghost-back" id="rl-back">${backLabel}</button>
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
      const locked = isLocked(c);
      const inParty = party.some((p) => p.id === c.id);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "rl-cell" + (inParty ? " picked" : "") + (c.isCompletedAvatar ? " deshi" : "") + (locked ? " locked" : "");
      cell.disabled = locked || (!inParty && party.length >= MAX_PARTY);
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
      if (locked) { // 宝珠ショップで解禁前＝鍵を表示し、ホバーで解禁先を案内
        const lk = document.createElement("span");
        lk.className = "rl-cell-lock"; lk.textContent = "🔒";
        cell.appendChild(lk);
        cell.title = `${c.name}｜未解禁\n宝珠ショップで解禁すると連れて行けます`;
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
  const { floor = 1, cards = [], onPick, title, coins = null, bonus = null, penalty = null, run = null } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-draft";
  const cardHtml = cards.map((c, i) => {
    const meta = RARITY_META[c.rarity] || { label: c.rarity, color: "#999" };
    const cat = CARD_CATEGORY[cardCategory(c)];
    const cl = clusterOf(c); const clm = cl ? CLUSTER_META[cl] : null;
    const clTag = clm ? `<span class="rl-card-cluster" style="--cl:${clm.color}">${clm.label}</span>` : "";
    // シナジー予告（スライス5）：取ると流派がどう動くか。しきい値到達は「開眼」を大きく見せる＝決断の山場。
    const pv = run ? clusterPickPreview(run, c) : null;
    let synHtml = "";
    if (pv) {
      synHtml = pv.crosses
        ? `<div class="rl-card-syn awaken" style="--cl:${pv.color}"><span class="rl-syn-seal">${pv.awaken}</span><span class="rl-syn-txt">取ると【${pv.awaken}】 ${pv.label}が一段強くなる</span></div>`
        : `<div class="rl-card-syn" style="--cl:${pv.color}">${pv.label} ${pv.from}→${pv.to}${pv.nextAt ? `（${pv.awaken}まであと${pv.nextAt - pv.to}）` : ""}</div>`;
    }
    return `
      <button type="button" class="rl-card r-${c.rarity}${pv && pv.crosses ? " syn-awaken" : ""}" data-i="${i}" style="--rarity:${meta.color}${pv ? `;--cl:${pv.color}` : ""}">
        <div class="rl-card-tags"><span class="rl-card-cat" style="--cat:${cat.color}">${cat.mark} ${cat.label}</span>${clTag}<span class="rl-card-rarity">${meta.label}</span></div>
        ${c.icon ? `<div class="rl-card-ico-wrap">${rlIcon(c.icon, "rl-card-ico")}</div>` : ""}
        <div class="rl-card-name">${c.name}</div>
        <div class="rl-card-desc">${c.desc}</div>
        ${synHtml}
      </button>`;
  }).join("");
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">${title || `第 ${floor} 階 突破！　力を1つ授かる`}${coins != null ? coinBadge(coins) : ""}</div>
      ${bonus ? `<div class="rl-dominate"><span class="rl-dominate-tag">${bonus.label}</span><span class="rl-dominate-note">${bonus.note}</span></div>` : ""}
      ${penalty ? `<div class="rl-penalty"><span class="rl-penalty-tag">${penalty.label}</span><span class="rl-penalty-note">${penalty.note}</span></div>` : ""}
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

// 流派レベルアップ演出（②）：段(しきい値)を新たに越えた瞬間に「流派〇〇が〇〇になった」＋効果説明を
// モーダルで見せる。複数同時に上がったときはキューで1枚ずつ。閉じ切ったら onClose で先へ進む。
export function showRogueliteClusterLevelUp(container, { items = [], onClose } = {}) {
  if (!container || !items.length) { onClose?.(); return; }
  const queue = items.filter(Boolean);
  const showNext = () => {
    const it = queue.shift();
    if (!it) { onClose?.(); return; }
    const ov = document.createElement("div");
    ov.className = "rl-overlay rl-levelup";
    const tiers = it.prevName
      ? `<span class="rl-lvl-prev">${it.prevName}</span><span class="rl-lvl-arrow">▸</span><span class="rl-lvl-now">${it.tierName}</span>`
      : `<span class="rl-lvl-now">${it.tierName}</span>`;
    ov.innerHTML = `
      <div class="rl-modal rl-lvl-modal" style="--cl:${it.color || "#8fd0ff"}">
        <div class="rl-lvl-seal">${it.awaken || "開眼"}</div>
        <div class="rl-modal-head">流派・${it.label} が<br><b class="rl-lvl-name">「${it.tierName}」</b> になった</div>
        <div class="rl-lvl-tiers">${tiers}</div>
        <p class="rl-lvl-desc">${it.tierDesc || ""}</p>
        <button type="button" class="rl-start" id="rl-lvl-ok">${queue.length ? "次へ ›" : "力を受け取る"}</button>
      </div>`;
    container.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("is-open"));
    ov.querySelector("#rl-lvl-ok")?.addEventListener("click", () => { ov.remove(); showNext(); });
  };
  showNext();
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
  recruit: { mark: "🔁", color: "#56c8b0" },
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
  const hpAdd = Math.round(m.hpAdd || 0); // 絶対値HP加算（線形・複利しない地力）
  const atkPct = Math.round(((m.dealMul || 1) - 1) * 100);
  const defPct = Math.round((1 - (m.takeMul || 1)) * 100);
  const stat = (label, val, cls) => `<span class="rl-buff-stat ${cls}"><span class="rl-buff-k">${label}</span><b>${val >= 0 ? "+" : ""}${val}%</b></span>`;
  const statAdd = (label, val, cls) => `<span class="rl-buff-stat ${cls}"><span class="rl-buff-k">${label}</span><b>+${val}</b></span>`;
  const lv = run?.skillLevel || 1;
  // 条件付き（状況）バフ＝発動条件つきで効くため HP/攻/防 の累積%には乗らない。取ったのに合計が
  // 動かず「効いてない」に見える対策＝専用チップで明示（title に発動条件を補足）。値>0のみ表示。
  const cond = (label, val, tip) => `<span class="rl-buff-stat cond" title="${tip}"><span class="rl-buff-k">${label}</span><b>${val}</b></span>`;
  const pct = (v) => Math.round(v * 100);
  const condChips = [
    m.streakDeal ? cond("波に乗る", `+${pct(m.streakDeal)}%/連勝`, "連勝数ぶん与ダメ上昇") : "",
    m.lowHpPower ? cond("火事場", `+${pct(m.lowHpPower)}%`, "HPが低いほど与ダメ↑・被ダメ↓") : "",
    m.revengeDeal ? cond("倍返し", `+${pct(m.revengeDeal)}%`, "前局に味方が被弾していた次局の和了で与ダメ↑") : "",
    m.riichiDeal ? cond("背水", `+${pct(m.riichiDeal)}%`, "リーチ中の和了で与ダメ↑") : "",
  ].join("");
  const hpAddChip = hpAdd > 0 ? statAdd("HP", hpAdd, "hp") : ""; // 絶対値HP（地力・複利しない）は実数で表示
  const buffRow = `${stat("HP", hpPct, "hp")}${hpAddChip}${stat("攻", atkPct, "atk")}${stat("防", defPct, "def")}${lv > 1 ? `<span class="rl-buff-stat skl"><span class="rl-buff-k">技Lv</span><b>${lv}</b></span>` : ""}${condChips}`;
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
  // 流派（クラスター）はここでは出さない。増えると縦に伸びて選択肢に被るため、HPバー下の
  // 固定パネル（clusterPanelHtml）へ分離した（①の修正）。ここはバフ/必殺技/道具のみ。
  return `<div class="rl-inv">
    <div class="rl-inv-row">${groupHead("buff")}<div class="rl-buff-totals">${buffRow}</div></div>
    <div class="rl-inv-row">${groupHead("skill", ` <small>${skills.length}/2</small>`)}<div class="rl-inv-chips">${skillRow}</div></div>
    ${items.length ? `<div class="rl-inv-row">${groupHead("item", run?.items ? ` <small>${(run.items || []).length}/${ITEM_SLOTS}</small>` : "")}<div class="rl-inv-chips">${items.join("")}</div></div>` : ""}
  </div>`;
}

// 流派パネル（①）：全5流派を常に同じ行数で表示（未取得はグレー）。HPバーの直下に置く。
// 「増えると縦に伸びて選択肢に被る」を解消＝行数は流派数で固定、レイアウトが暴れない。
// 副産物として「あと何が育つか」が常に見える＝蓄積の可視化（CLAUDE.md）。
export function clusterPanelHtml(run) {
  const prog = clusterProgress(run, { all: true }); // 取得0も含めて全流派
  const rows = prog.map((p) => {
    const clm = CLUSTER_META[p.cluster] || { label: p.cluster, color: "#9ad", awaken: "開眼" };
    const aw = clm.awaken || "開眼";
    const tierSet = new Set(p.tiers || []);
    const lockedSet = new Set(p.lockedTiers || []); // 未解放の節目（ショップ「流派の極意」で解禁）
    const pips = [];
    const pipMax = Math.max(p.max || 0, p.fullMax || 0); // 未解放の節目まで含めて見せる（解放の余地を示す）
    for (let i = 1; i <= pipMax; i++) {
      const cls = ["rl-pip"];
      if (tierSet.has(i) || lockedSet.has(i)) cls.push("brk");   // しきい値の節目は大きい玉
      if (lockedSet.has(i)) cls.push("locked");                  // 未解放＝薄く鍵
      if (i <= p.count) cls.push("on");                          // 取得済み
      if (tierSet.has(i) && i <= p.count) cls.push("lit");       // 到達した（解放済みの）節目
      pips.push(`<i class="${cls.join(" ")}"></i>`);
    }
    // state：解放済み段の進捗。解放済みが頭打ちで未解放段が残るときは🔒（ショップ解禁待ち）を添える。
    const lockHint = !p.nextAt && lockedSet.size ? `・<span class="rl-clrow-lock" title="宝珠ショップ「流派の極意」で解放">🔒</span>` : "";
    const state = p.reached > 0
      ? `<b>${aw}${p.reached > 1 ? `×${p.reached}` : ""}</b>${p.nextAt ? `・あと${p.nextAt - p.count}` : lockHint}`
      : (p.nextAt ? `あと${p.nextAt - p.count}で${aw}` : "");
    const cls = ["rl-clrow"]; if (p.count > 0) cls.push("on"); if (p.reached > 0) cls.push("lit");
    return `<div class="${cls.join(" ")}" style="--cl:${clm.color}" title="${(clm.tip || "").replace(/"/g, "&quot;")}">
      <span class="rl-clrow-name">${clm.label}</span>
      <span class="rl-pips">${pips.join("")}</span>
      <span class="rl-clrow-state">${state}</span>
    </div>`;
  }).join("");
  return `<div class="rl-clusters" aria-label="流派">${rows}</div>`;
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
  const { floor = 1, choices = [], boss = false, bossTableSize = 4, coins = 0, skillLevel = 0, held = [], run = null, charImages = null, forgeInfo = null, onPick, onRetreat, onSwap, onItems } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-route rl-hub" + (boss ? " is-boss" : "");
  applyChapterColorSet(ov, run?.over?.colorSet); // 章ごとのカラーセット（任意）
  // 進路カード（ヒーロー＝大胆さを集中する1点）。ボス階は単一の大カード。
  const cardEntries = boss
    ? [{ kind: "boss", name: "館の主との対決", blurb: `第 ${floor} 階・逃げ場はない大一番。`, _boss: true, tableSize: bossTableSize }]
    : choices.map((f) => ({ kind: f.kind, name: f.name, blurb: f.blurb || "", id: f.id, tableSize: f.tableSize }));
  // 戦闘マスの卓サイズ（4麻=相棒と2v2 / 3麻・2麻=一人で挑む）をバッジで明示。ソロは点負けダメージ2倍。
  const sizeChip = (sz) => {
    if (!sz) return "";
    const solo = isSoloTable(sz);
    return `<span class="rl-route-size ${solo ? "solo" : "pair"}">${tableSizeLabel(sz)}<small>${solo ? "一人で挑む" : "相棒と2対2"}</small></span>`;
  };
  // 鍛冶屋マス：次Lv（or 限界突破）までに必要な光貨を常時表示。所持不足ならグレーアウト＝選べない。
  const forgeCostChip = (kind) => {
    if (kind !== "forge" || !forgeInfo) return "";
    const label = forgeInfo.maxed ? `限界突破　光貨 ${forgeInfo.cost}` : `Lv${forgeInfo.lv}→${forgeInfo.lv + 1}　光貨 ${forgeInfo.cost}`;
    return `<span class="rl-route-cost${forgeInfo.afford ? "" : " poor"}">${label}${forgeInfo.afford ? "" : "（光貨不足）"}</span>`;
  };
  const cardsHtml = cardEntries.map((f, i) => {
    const m = FLOOR_KIND_META[f.kind] || FLOOR_KIND_META.battle;
    const solo = isSoloTable(f.tableSize);
    const forgeLocked = f.kind === "forge" && forgeInfo && !forgeInfo.afford; // 光貨不足の鍛冶屋は選べない
    return `<button type="button" class="rl-route-card${f._boss ? " boss" : ""}${forgeLocked ? " is-locked" : ""}" data-i="${i}" style="--mark:${m.color}"${forgeLocked ? " disabled" : ""}>
      <span class="rl-route-spark"></span>
      <span class="rl-route-mark">${m.mark}</span>
      <span class="rl-route-name">${f.name}</span>
      ${sizeChip(f.tableSize)}
      ${forgeCostChip(f.kind)}
      <span class="rl-route-blurb">${f.blurb}</span>
      ${solo ? `<span class="rl-route-solonote">相棒なし・着順ペナルティ（${soloPenaltyHint(f.tableSize)}）</span>` : ""}
      <span class="rl-route-go">${forgeLocked ? "光貨が足りない" : "この道へ ›"}</span>
    </button>`;
  }).join("");
  const partyDock = run ? `
    <div class="rl-hub-party">
      <div class="rl-hub-party-head">パーティ</div>
      <div class="rl-hp-list">${partyHpRows(run, charImages)}</div>
      ${clusterPanelHtml(run)}
    </div>
    <div class="rl-hub-build">${buffTotalsHtml(run)}</div>` : "";
  // 現在の層（バイオーム）バナー：いまどんな場所か＋効果を常時表示。
  const biome = run ? biomeOf(run) : null;
  const biomeBanner = biome ? `
    <div class="rl-hub-biomebar" style="--biome:${biome.color || "var(--rl-gold)"}" title="${(biome.blurb || "").replace(/"/g, "&quot;")}">
      <span class="rl-hub-biome-glyph">${biome.glyph || "✦"}</span>
      <span class="rl-hub-biome-name">${biome.name}</span>
      <span class="rl-hub-biome-blurb">${biome.blurb || ""}</span>
      <span class="rl-hub-biome-chips">${biomeEffectChips(biome).map((g) => `<span class="rl-gain-chip ${g.tone}">${g.t}</span>`).join("")}</span>
    </div>` : "";
  // 編成・道具は上部の手が届きやすい位置（HUD右の操作クラスタ）へ。
  const manageBtns = run ? `<div class="rl-hub-manage">
    ${onSwap ? `<button type="button" class="rl-hub-mbtn" id="rl-route-swap"><span class="rl-hub-mico">⚌</span>編成</button>` : ""}
    ${onItems ? `<button type="button" class="rl-hub-mbtn" id="rl-route-items"><span class="rl-hub-mico">◆</span>道具 <b>${(run.items || []).length}/${ITEM_SLOTS}</b></button>` : ""}
  </div>` : "";
  ov.innerHTML = `
    <div class="rl-hub-wrap">
      <header class="rl-hub-top">
        <div class="rl-hub-floor"><span class="rl-hub-eyebrow">楼光の館</span><span class="rl-hub-floornum">第 <b>${floor}</b> 階</span></div>
        <div class="rl-hub-topright">
          <div class="rl-hub-res">
            <span class="rl-hub-res-i"><span class="rl-hub-res-k">光貨</span><b>${coins | 0}</b></span>
            <span class="rl-hub-res-i"><span class="rl-hub-res-k">スキルLv</span><b>${skillLevel || 1}</b></span>
            ${run ? `<span class="rl-hub-res-i" title="出陣編成で「能力を使って打つ」を選ぶと1個消費。休息/ショップで補充（上限${ABILITY_SOURCE_MAX}）"><span class="rl-hub-res-k">能力の源</span><b>${run.abilitySource ?? 0}/${ABILITY_SOURCE_MAX}</b></span>` : ""}
          </div>
          ${manageBtns}
        </div>
      </header>
      ${biomeBanner}
      <main class="rl-hub-main">
        <div class="rl-hub-choose"><span>${boss ? "館の主が待つ" : "進路を選ぶ"}</span></div>
        <div class="rl-route-cards">${cardsHtml}</div>
        <p class="rl-hub-hint">${boss ? "10階ごとの大一番。倒せば奥へ続く。" : "光貨は戦うほど貯まり、ショップや鍛冶屋で使える。10階ごとにボス。"}</p>
      </main>
      <footer class="rl-hub-dock">
        ${partyDock}
        <button type="button" class="rl-hub-retreat" id="rl-route-retreat">撤退する<small>記録を確保して帰る</small></button>
      </footer>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => { ov.classList.add("is-open"); ov.querySelectorAll(".rl-route-card").forEach((c, i) => c.style.setProperty("--d", `${i * 70}ms`)); });
  ov.querySelectorAll(".rl-route-card").forEach((btn) => {
    btn.addEventListener("click", () => { ov.remove(); boss ? onPick?.() : onPick?.(choices[+btn.dataset.i]); });
  });
  ov.querySelector("#rl-route-retreat")?.addEventListener("click", () => { ov.remove(); onRetreat?.(); });
  ov.querySelector("#rl-route-swap")?.addEventListener("click", () => { ov.remove(); onSwap?.(); });
  ov.querySelector("#rl-route-items")?.addEventListener("click", () => { ov.remove(); onItems?.(); });
}

// ---- 編成（任意のタイミングでメンバー入れ替え） ----
// 出場順（run.lineup）を並べ替える。上の2人が着卓、3人目以降は控え（戦死時の繰り上がり要員）。
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
      <p class="rl-route-hint"><b>戦うのは上の2人だけ</b>（着卓は固定・勝手に入れ替わらない）。控えを卓に出すには ▲ で<b>着卓ラインより上</b>へ（先頭＝あなたが操作）。着卓の2人は「自分の能力＋ストックした必殺技」を使える。<b>控えの能力は使えない</b>（戦死時の繰り上がり要員）。</p>
      ${buffTotalsHtml(run)}
      <div class="rl-swap-list" id="rl-swap-list"></div>
      <button type="button" class="rl-start" id="rl-swap-close">この編成で進む</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  render();
  ov.querySelector("#rl-swap-close")?.addEventListener("click", () => { ov.remove(); onClose?.(); });
}

// ---- 出陣編成（戦闘フロア突入の直前・フルスクリーン）----
// 進路で戦闘(通常/強敵/ボス)を選んで押した直後に1枚挟む確認画面。「卓に出す二人」を決め、
// 各自のHP・携えるもの(バフ/必殺技/道具/流派)を一望して「出陣する」で対局へ。戻れば進路へ。
// 着卓の入替は showRogueliteSwap と同じ lineup ロジック（上2人＝着卓・先頭=操作／▲▼で並べ替え・run.lineupへ保存）。
// 編成画面に入った瞬間の「ドドン！」幕間。第N階・〇〇戦／卓形式／煽り文句を順に滲ませ、
// 一拍おいて溶けて消える（タップで即スキップ）。演出だけで状態は触らない。
function playDeployIntro(container, { floor, battleTitle, modeName, cry, tone, colorSet, sound } = {}) {
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = `rl-vs-intro tone-${tone || "normal"}`;
  applyChapterColorSet(ov, colorSet);
  ov.innerHTML = `
    <div class="rl-vs-inner">
      <div class="rl-vs-floor">楼光の館 ・ 第 ${floor} 階</div>
      <div class="rl-vs-line rl-vs-title"><span>${battleTitle}</span></div>
      <div class="rl-vs-line rl-vs-mode">${modeName}</div>
      <div class="rl-vs-line rl-vs-cry">${cry}</div>
    </div>`;
  container.appendChild(ov);
  const timers = [];
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    timers.forEach(clearTimeout);
    ov.classList.add("is-leaving");
    setTimeout(() => ov.remove(), 360);
  };
  // 各行を時間差で起こす（CSSの .show でフェード/パンチ）。最後の煽りのあと一拍おいて退場。
  requestAnimationFrame(() => {
    timers.push(setTimeout(() => { ov.querySelector(".rl-vs-title")?.classList.add("show"); sound?.playDodon?.(); }, 120));
    timers.push(setTimeout(() => ov.querySelector(".rl-vs-mode")?.classList.add("show"), 620));
    timers.push(setTimeout(() => { ov.querySelector(".rl-vs-cry")?.classList.add("show"); sound?.playWinHit?.(); }, 1080));
    timers.push(setTimeout(finish, 2150));
  });
  ov.addEventListener("click", finish); // タップで即スキップ
  return finish;
}

export function showRogueliteDeploy(container, opts = {}) {
  const { run, floorType, charImages, onConfirm, onBack, audio } = opts;
  if (!container || !run) { onConfirm?.(false); return; }
  const isBoss = floorType?.enemy === "boss";
  const tone = isBoss ? "boss" : (floorType?.elite ? "elite" : "normal");
  const tableSize = floorType?.tableSize || 4;
  const solo = isSoloTable(tableSize);
  const seatCount = solo ? 1 : 2;
  const sizeName = tableSizeLabel(tableSize); // 四麻/三麻/二麻
  const baseLabel = isBoss ? "ボス戦" : (floorType?.elite ? "強敵戦" : (floorType?.name || "戦闘"));
  const battleLabel = `${sizeName}・${baseLabel}`;
  const enemyNote = isBoss
    ? (solo ? `館の主が待つ。${sizeName}・一人で挑む大一番。` : "館の主が待つ。逃げ場のない大一番。")
    : (solo ? `${sizeName}・相棒なしの一人打ち。着順ペナルティ（${soloPenaltyHint(tableSize)}）。` : (floorType?.blurb || "卓に着く二人で挑む。"));
  const src = run.abilitySource ?? 0;

  // 出場順（lineupが無ければparty順）。上2人＝着卓・先頭=操作。
  const orderIds = (Array.isArray(run.lineup) && run.lineup.length)
    ? [...run.lineup, ...run.party.map((m) => m.id).filter((id) => !run.lineup.includes(id))]
    : run.party.map((m) => m.id);
  let order = orderIds.map((id) => run.party.find((m) => m.id === id)).filter(Boolean);

  const ov = document.createElement("div");
  ov.className = `rl-overlay rl-deploy is-open tone-${tone}`;
  applyChapterColorSet(ov, run?.over?.colorSet);
  ov.innerHTML = `
    <div class="rl-deploy-wrap">
      <header class="rl-deploy-top">
        <div class="rl-deploy-floor">
          <span class="rl-hub-eyebrow">楼光の館 ・ 第 ${run.floor} 階</span>
          <span class="rl-deploy-battle">${battleLabel}</span>
        </div>
        <div class="rl-hub-res">
          <span class="rl-hub-res-i"><span class="rl-hub-res-k">光貨</span><b>${run.coins | 0}</b></span>
          <span class="rl-hub-res-i"><span class="rl-hub-res-k">スキルLv</span><b>${run.skillLevel || 1}</b></span>
        </div>
      </header>
      <div class="rl-deploy-choose"><span>${solo ? "卓に出す一人を選ぶ" : "卓に出す二人を選ぶ"}</span></div>
      <main class="rl-deploy-main">
        <section class="rl-deploy-lineup">
          <div class="rl-deploy-lineup-head">出陣　<small>${enemyNote}</small></div>
          <div class="rl-deploy-stage" id="rl-deploy-list"></div>
        </section>
        <aside class="rl-deploy-side">
          <div class="rl-deploy-side-h">携えるもの</div>
          ${buffTotalsHtml(run)}
          ${clusterPanelHtml(run)}
        </aside>
      </main>
      <footer class="rl-deploy-foot">
        <button type="button" class="rl-retreat" id="rl-deploy-back">← 進路へ戻る</button>
        <span class="rl-deploy-hint">戦うのは上の${solo ? "一人" : "二人"}だけ。控えは倒れた時に繰り上がる。</span>
        <div class="rl-deploy-actions">
          <button type="button" class="rl-start ghost" id="rl-deploy-plain">能力を使わず打つ<small>源を温存</small></button>
          <button type="button" class="rl-start armed" id="rl-deploy-armed" ${src > 0 ? "" : "disabled"}>
            <span class="rl-armed-main">⚡ 能力を使って打つ</span>
            <span class="rl-armed-src">${src > 0
              ? `${Array.from({ length: ABILITY_SOURCE_MAX }, (_, i) => `<i class="rl-src-pip${i < src ? " on" : ""}"></i>`).join("")}<b>能力の源 残り ${src}</b>（−1）`
              : "能力の源が足りない"}</span>
          </button>
        </div>
      </footer>
    </div>`;
  container.appendChild(ov);

  const listEl = ov.querySelector("#rl-deploy-list");
  const youId = run.party[0]?.id;
  // 立ち絵の3カラム構図（左から出場順）。上位 seatCount 人＝着卓、それ以下＝控え。
  // ◀▶ で並べ替え（左へ動かすほど着卓に近づく）。能力チップはクリックで内容をモーダル表示。
  const renderList = () => {
    listEl.innerHTML = "";
    order.forEach((m, i) => {
      const seated = i < seatCount;
      const pct = Math.max(0, Math.min(100, (m.hp / (m.hpMax || 1)) * 100));
      const tier = pct <= 25 ? "low" : pct <= 50 ? "mid" : "high";
      const isYou = m.id === youId;
      const dead = m.hp <= 0;
      const abils = (m.char?.abilities || []).map((a) => a.abilityId).filter(Boolean);
      const abilChips = abils.length
        ? abils.map((id) => `<button type="button" class="rl-deploy-abchip" data-abil="${id}" title="クリックで能力の詳細">${abilityDef(id)?.name || id}</button>`).join("")
        : `<span class="rl-deploy-abnone">—</span>`;
      // 着卓と控えの境目に仕切り（着卓ライン）を1本だけ挟む。
      if (i === seatCount && order.length > seatCount) {
        const div = document.createElement("div");
        div.className = "rl-deploy-vdivider";
        div.innerHTML = `<span>控え</span>`;
        listEl.appendChild(div);
      }
      const col = document.createElement("div");
      col.className = `rl-deploy-col${seated ? " seated" : " bench"}${dead ? " is-down" : ""}`;
      col.innerHTML = `
        <div class="rl-deploy-col-portrait">
          ${portraitHtml(charImages, m.char)}
          <span class="rl-deploy-col-tag ${seated ? "active" : "bench"}">${seated ? (isYou ? "操作" : (solo ? "出陣" : "出場")) : "控え"}</span>
          <div class="rl-deploy-col-move">
            <button type="button" class="rl-swap-up" data-id="${m.id}" ${i === 0 ? "disabled" : ""} aria-label="前へ">◀</button>
            <button type="button" class="rl-swap-down" data-id="${m.id}" ${i === order.length - 1 ? "disabled" : ""} aria-label="後ろへ">▶</button>
          </div>
        </div>
        <div class="rl-deploy-col-name" style="color:${m.char?.color || "#eadfce"}">${m.char?.name || "?"}${m.hungover ? " 🍶" : ""}</div>
        <div class="rl-deploy-col-hp">
          <div class="rl-hp-bar"><span class="rl-hp-fill ${tier}" style="width:${pct}%"></span></div>
          <div class="rl-deploy-col-hpval">${dead ? "ダウン" : `${Math.max(0, Math.round(m.hp))}<small>/${m.hpMax}</small>`}</div>
        </div>
        <div class="rl-deploy-col-abils"><span class="rl-deploy-abk">能力</span>${abilChips}</div>`;
      listEl.appendChild(col);
    });
    const move = (id, dir) => {
      const idx = order.findIndex((m) => m.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= order.length) return;
      [order[idx], order[j]] = [order[j], order[idx]];
      run.lineup = order.map((m) => m.id); // 保存（seatedAllies が尊重）
      renderList();
    };
    listEl.querySelectorAll(".rl-swap-up").forEach((b) => b.addEventListener("click", () => move(b.dataset.id, -1)));
    listEl.querySelectorAll(".rl-swap-down").forEach((b) => b.addEventListener("click", () => move(b.dataset.id, +1)));
    listEl.querySelectorAll(".rl-deploy-abchip").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); showAbilityModal(container, b.dataset.abil); }));
  };
  renderList();
  run.lineup = order.map((m) => m.id); // 並べ替えずに出陣しても現順を確定保存

  ov.querySelector("#rl-deploy-back")?.addEventListener("click", () => { ov.remove(); onBack?.(); });
  ov.querySelector("#rl-deploy-plain")?.addEventListener("click", () => { ov.remove(); onConfirm?.(false); });
  ov.querySelector("#rl-deploy-armed")?.addEventListener("click", () => { if ((run.abilitySource ?? 0) <= 0) return; ov.remove(); onConfirm?.(true); });

  // 入場の「ドドン！」幕間（編成画面の上に被せて、一拍おいて溶ける）。
  const modeName = tableSize === 2 ? "二人麻雀 ・ 一騎打ち" : tableSize === 3 ? "三人麻雀 ・ 一人打ち" : "四人麻雀 ・ 相棒戦";
  const cry = isBoss ? "館の主、いざ——尋常に勝負！" : (floorType?.elite ? "強敵あり。尋常に——勝負！" : "尋常に——勝負！");
  playDeployIntro(container, { floor: run.floor, battleTitle: battleLabel, modeName, cry, tone, colorSet: run?.over?.colorSet, sound: audio });
}

// ---- 流派の門（交代マス）：光貨で1人を迎え、1人を送り出す（PTは3人のまま） ----
export function showRogueliteRecruit(container, opts = {}) {
  const { run, candidates = [], cost = 50, charImages = null, onSwap, onSkip } = opts;
  if (!container || !run) { onSkip?.(); return; }
  const coins = run.coins || 0;
  const canAfford = coins >= cost;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-recruit";
  let pickCand = null, pickRelease = null;
  const charCard = (c, kind, key) => {
    const icon = charImages?.url?.(c, "icon") || charImages?.url?.(c, "portrait") || "";
    const ab = (c.abilities || []).map((a) => abilityDef(a.abilityId)?.name).filter(Boolean).join("・");
    const face = icon
      ? `<img class="rl-rc-face" src="${icon}" alt="">`
      : `<span class="rl-rc-face rl-face-fb" style="--c:${c.color || "#666"}">${(c.name || "?").slice(0, 1)}</span>`;
    return `<button type="button" class="rl-rc-card" data-${kind}="${key}">${face}<span class="rl-rc-name">${c.name}</span><span class="rl-rc-ab">${ab || "—"}</span></button>`;
  };
  ov.innerHTML = `
    <div class="rl-modal rl-recruit-modal">
      <div class="rl-modal-head">流派の門 — 仲間を入れ替える${coinBadge(coins)}</div>
      <p class="rl-route-hint">候補から1人を<b>迎え</b>、編成から1人を<b>送り出す</b>。<b>光貨 ${cost}</b> 消費（パーティは3人のまま）。${canAfford ? "" : '<span style="color:var(--danger)">　光貨が足りない…</span>'}</p>
      <div class="rl-rc-sec">迎える（候補）</div>
      <div class="rl-rc-row">${candidates.map((c, i) => charCard(c, "cand", i)).join("") || "<span class='rl-card-empty'>候補がいない</span>"}</div>
      <div class="rl-rc-sec">送り出す（編成）</div>
      <div class="rl-rc-row">${run.party.map((m) => charCard(m.char, "rel", run.party.indexOf(m))).join("")}</div>
      <div class="rl-continue-btns">
        <button type="button" class="rl-start" id="rl-rc-go" disabled>入れ替える</button>
        <button type="button" class="rl-retreat" id="rl-rc-skip">やめる</button>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const goBtn = ov.querySelector("#rl-rc-go");
  const refresh = () => { goBtn.disabled = !(canAfford && pickCand != null && pickRelease != null); };
  ov.querySelectorAll("[data-cand]").forEach((b) => b.addEventListener("click", () => { pickCand = +b.dataset.cand; ov.querySelectorAll("[data-cand]").forEach((x) => x.classList.toggle("sel", x === b)); refresh(); }));
  ov.querySelectorAll("[data-rel]").forEach((b) => b.addEventListener("click", () => { pickRelease = +b.dataset.rel; ov.querySelectorAll("[data-rel]").forEach((x) => x.classList.toggle("sel", x === b)); refresh(); }));
  ov.querySelector("#rl-rc-skip")?.addEventListener("click", () => { ov.remove(); onSkip?.(); });
  goBtn.addEventListener("click", () => { if (goBtn.disabled) return; ov.remove(); onSwap?.(pickCand, pickRelease); });
}

// ---- 追撃（push-your-luck）：先に行く / 追撃（残り回数） ----
// 局終わりの追撃モーダル（インゲーム）。同じ卓・HPを引き継いで次局（東2局/東3局…）を戦うか確認する。
// onPursue=次局へ／onStop=この対局を締める（戦果を確定）。
export function showRoguelitePursue(container, opts = {}) {
  const { floor = 1, nextLabel = "次局", run, charImages = null, leadLine, leadChar, onPursue, onStop } = opts;
  if (!container) { onStop?.(); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-continue";
  const speakHtml = (leadLine && leadChar)
    ? `<div class="rl-modal-speak" style="--c:${leadChar.color || "var(--accent)"}"><b>${leadChar.name}</b>「${leadLine}」</div>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">第 ${floor} 階・局終わり — このまま追撃しますか？${coinBadge(run?.coins || 0)}</div>
      ${speakHtml}
      <div class="rl-hp-list">${partyHpRows(run, charImages)}</div>
      <p class="rl-continue-note">この卓・HPをそのまま引き継いで <strong>${nextLabel}</strong> を戦う。深追いするほど<strong>撃破・戦利品（高レア）</strong>を狙えるが、削られれば<strong>没収</strong>に近づく。</p>
      <div class="rl-continue-btns">
        <button type="button" class="rl-start" id="rl-go">ここで充分<small>戦果を確定して進む</small></button>
        <button type="button" class="rl-retreat rl-pursue-btn" id="rl-pursue">追撃する<small>${nextLabel}へ</small></button>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-pursue")?.addEventListener("click", () => { ov.remove(); onPursue?.(); });
  ov.querySelector("#rl-go")?.addEventListener("click", () => { ov.remove(); onStop?.(); });
}

// ---- 層（バイオーム）入場演出 ----
// 10階ごとに塔の景色が変わる瞬間を、frontend-design のトーンで一拍見せる（題材＝記憶を映す塔）。
export function showRogueliteBiomeIntro(container, opts = {}) {
  const { biome, floor = 1, onDone, onReshuffle = null, orbGain = 0, orbTotal = 0, nextBiome = null } = opts;
  if (!container || !biome) { onDone?.(); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-biome";
  const bgImg = bgDef(biome.bg)?.image;
  const chips = biomeEffectChips(biome).map((g) => `<span class="rl-gain-chip ${g.tone}">${g.t}</span>`).join("");
  const band = Math.floor((Math.max(1, floor) - 1) / 10) + 1;
  // 巡りの賽を持っていれば「踏み入る」前にこの層を引き直せる（使うと消える）。
  const reshuffleBtn = onReshuffle
    ? `<button type="button" class="rl-retreat rl-biome-reroll" id="rl-biome-reroll"><span class="rl-hub-mico">🎲</span>別の層を引く<small>巡りの賽</small></button>` : "";
  ov.innerHTML = `
    <div class="rl-biome-bg" style="${bgImg ? `background-image:url('${bgImg}')` : ""}"></div>
    <div class="rl-biome-card" style="--biome:${biome.color || "var(--rl-gold)"}">
      <span class="rl-biome-eyebrow">第 ${band} 層 ・ 第 ${floor} 階</span>
      <span class="rl-biome-glyph">${biome.glyph || "✦"}</span>
      <h2 class="rl-biome-name">${biome.name}</h2>
      <p class="rl-biome-blurb">${biome.blurb || ""}</p>
      <div class="rl-biome-chips">${chips}</div>
      ${orbGain > 0 ? `<div class="rl-biome-orb">宝珠 <b>+${orbGain}</b><span class="rl-biome-orb-total">所持 ${orbTotal}</span></div>` : ""}
      ${nextBiome ? `<div class="rl-biome-next">👁 次の層 ▸ <b style="color:${nextBiome.color || "var(--rl-gold)"}">${nextBiome.glyph || ""} ${nextBiome.name}</b></div>` : ""}
      <div class="rl-biome-btns">
        ${reshuffleBtn}
        <button type="button" class="rl-start rl-biome-go" id="rl-biome-go">踏み入る ›</button>
      </div>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const go = () => { ov.remove(); onDone?.(); };
  ov.querySelector("#rl-biome-go")?.addEventListener("click", go, { once: true });
  ov.querySelector("#rl-biome-reroll")?.addEventListener("click", () => { ov.remove(); onReshuffle?.(); }, { once: true });
}

// ---- 章intro（記憶へ踏み入る導入。提案B・縦軸の結びつけ）。相棒が一言添えて記憶へ入る ----
export function showRogueliteChapterIntro(container, opts = {}) {
  const { chapter, leadChar = null, leadLine = null, charImages = null, onProceed } = opts;
  if (!container || !chapter) { onProceed?.(); return; }
  const ov = document.createElement("div");
  ov.className = `rl-overlay rl-chapintro tone-${chapter.tone || "gold"}`;
  applyChapterColorSet(ov, chapter.colorSet);
  let speak = "";
  if (leadChar && leadLine) {
    const u = charImages?.url?.(leadChar, "portrait") || charImages?.url?.(leadChar, "icon") || "";
    const ps = u && u === charImages?.url?.(leadChar, "portrait") ? ` style="${portraitStyleAttr(leadChar, { zoom: false, translate: false })}"` : "";
    const face = u
      ? `<img class="rl-chapintro-face" src="${u}" alt=""${ps}>`
      : `<div class="rl-chapintro-face rl-chapintro-fb" style="--c:${leadChar.color || "#888"}">${[...(leadChar.name || "?")][0] || "?"}</div>`;
    speak = `<div class="rl-chapintro-speak">${face}<div class="rl-chapintro-bubble"><div class="rl-chapintro-who" style="color:${leadChar.color || "var(--rl-gold)"}">${leadChar.name || ""}</div><div class="rl-chapintro-line">${leadLine}</div></div></div>`;
  }
  ov.innerHTML = `
    <div class="rl-chapintro-card">
      <span class="rl-chapintro-eyebrow">${chapter.subtitle || "記憶"}　に入る</span>
      <h2 class="rl-chapintro-name">${chapter.title || ""}</h2>
      <p class="rl-chapintro-blurb">${chapter.blurb || ""}</p>
      ${speak}
      <button type="button" class="rl-start rl-chapintro-go" id="rl-chapintro-go">記憶に入る ›</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-chapintro-go")?.addEventListener("click", () => { ov.remove(); onProceed?.(); }, { once: true });
}

// ---- 大章 踏破演出（提案B §3.1）。clearFloor の主を初めて退けた瞬間の祝祭。
//   「第一の記憶を読み切った」を一拍見せ、相棒が一言締める。ラン自体はエンドレス＝なお登れる。
//   ※ シナリオ本文は別途。ここは器（演出シェル）。leadLine も差し替え前提のモック。 ----
export function showRogueliteChapterClear(container, opts = {}) {
  const { chapter, floor = 1, leadChar = null, leadLine = null, nextChapter = null, charImages = null, cleared = false, onProceed } = opts;
  if (!container || !chapter) { onProceed?.(); return; }
  const ov = document.createElement("div");
  ov.className = `rl-overlay rl-chapclear tone-${chapter.tone || "gold"}`;
  applyChapterColorSet(ov, chapter.colorSet);
  let speak = "";
  if (leadChar && leadLine) {
    const u = charImages?.url?.(leadChar, "portrait") || charImages?.url?.(leadChar, "icon") || "";
    const ps = u && u === charImages?.url?.(leadChar, "portrait") ? ` style="${portraitStyleAttr(leadChar, { zoom: false, translate: false })}"` : "";
    const face = u
      ? `<img class="rl-chapclear-face" src="${u}" alt=""${ps}>`
      : `<div class="rl-chapclear-face rl-chapclear-fb" style="--c:${leadChar.color || "#888"}">${[...(leadChar.name || "?")][0] || "?"}</div>`;
    speak = `<div class="rl-chapclear-speak">${face}<div class="rl-chapclear-bubble"><div class="rl-chapclear-who" style="color:${leadChar.color || "var(--rl-gold)"}">${leadChar.name || ""}</div><div class="rl-chapclear-line">${leadLine}</div></div></div>`;
  }
  // 次の記憶：実在して新規解禁されるなら「開かれた」、未綴(comingSoon)/無しなら塔の予告に留める（嘘をつかない）。
  const nextNote = nextChapter
    ? `<div class="rl-chapclear-next rl-chapclear-open">🗝 次の記憶が開かれた ▸ <b>${nextChapter.title || ""}</b></div>`
    : `<div class="rl-chapclear-next rl-chapclear-foretell">……やがて、次の記憶がこの塔に綴られる。</div>`;
  ov.innerHTML = `
    <div class="rl-chapclear-card">
      <span class="rl-chapclear-seal">踏 破</span>
      <span class="rl-chapclear-eyebrow">${chapter.subtitle || "記憶"}　を読み切った</span>
      <h2 class="rl-chapclear-name">${chapter.title || ""}</h2>
      <p class="rl-chapclear-blurb">第 ${floor} 階の主を退け、この記憶の核へ辿り着いた。</p>
      ${speak}
      ${nextNote}
      <button type="button" class="rl-start rl-chapclear-go" id="rl-chapclear-go">${cleared ? "クリア！ 帰還する ›" : "記憶を胸に、なお登る ›"}</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-chapclear-go")?.addEventListener("click", () => { ov.remove(); onProceed?.(); }, { once: true });
}

// ---- ボス対局前口上（提案B・「ボスが覚えている」）。tier名はUIに出さず、口上の変化で気づかせる ----
export function showRogueliteBossIntro(container, opts = {}) {
  const { bosses = [], floor = 1, charImages = null, onProceed } = opts;
  if (!container || !bosses.length) { onProceed?.(); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-bossintro";
  const panel = (b) => {
    const c = b.char || {};
    const u = charImages?.url?.(c, "portrait") || charImages?.url?.(c, "icon") || "";
    const ps = u && u === charImages?.url?.(c, "portrait") ? ` style="${portraitStyleAttr(c, { zoom: false, translate: false })}"` : "";
    const art = u
      ? `<img class="rl-bossintro-art" src="${u}" alt=""${ps}>`
      : `<div class="rl-bossintro-art rl-bossintro-art-fb" style="--c:${c.color || "#888"}">${[...(c.name || "?")][0] || "?"}</div>`;
    return `
      <div class="rl-bossintro-boss" style="--c:${c.color || "var(--rl-gold)"}">
        ${art}
        <div class="rl-bossintro-name">${c.name || "館の主"}</div>
        ${b.line ? `<div class="rl-bossintro-line">${b.line}</div>` : ""}
      </div>`;
  };
  ov.innerHTML = `
    <div class="rl-bossintro-card">
      <span class="rl-bossintro-eyebrow">第 ${floor} 階 ・ 館の主</span>
      <div class="rl-bossintro-stage rl-bossintro-n${Math.min(2, bosses.length)}">${bosses.map(panel).join("")}</div>
      <button type="button" class="rl-start rl-bossintro-go" id="rl-bossintro-go">対峙する ›</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-bossintro-go")?.addEventListener("click", () => { ov.remove(); onProceed?.(); }, { once: true });
}

// ---- 群像の二人相槌（提案B スライス2）。相棒(A)が口火→相方(B)が受ける軽い掛け合い ----
export function showRogueliteBanter(container, opts = {}) {
  const { a, b, charImages = null, onDone } = opts;
  if (!container || !a?.char || !a?.line || !b?.char || !b?.line) { onDone?.(); return; }
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-banter";
  const row = (s, side) => {
    const c = s.char;
    const u = charImages?.url?.(c, "portrait") || charImages?.url?.(c, "icon") || "";
    const face = u
      ? `<img class="rl-banter-face" src="${u}" alt="">`
      : `<div class="rl-banter-face rl-banter-fb" style="--c:${c.color || "#888"}">${[...(c.name || "?")][0] || "?"}</div>`;
    return `<div class="rl-banter-row rl-banter-${side}">${face}<div class="rl-banter-bubble"><div class="rl-banter-name" style="color:${c.color || "var(--rl-gold)"}">${c.name || ""}</div><div class="rl-banter-line">${s.line}</div></div></div>`;
  };
  ov.innerHTML = `
    <div class="rl-banter-card">
      ${row(a, "l")}
      ${row(b, "r")}
      <button type="button" class="rl-start rl-banter-go" id="rl-banter-go">続ける ›</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  // 二言目はワンテンポ遅れて滲ませる（掛け合いの呼吸）。
  const second = ov.querySelector(".rl-banter-r");
  if (second) { second.classList.add("rl-banter-pending"); setTimeout(() => second.classList.remove("rl-banter-pending"), 650); }
  ov.querySelector("#rl-banter-go")?.addEventListener("click", () => { ov.remove(); onDone?.(); }, { once: true });
}

// ---- 休息 / 宴会（回復演出） ----
export function showRogueliteRest(container, opts = {}) {
  const { kind = "rest", floor = 1, run, charImages = null, hungover = [], soberUsed = false, sourceRestored = false, onDone } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-rest";
  const isBanquet = kind === "banquet";
  const head = isBanquet ? "宴会フロア — 大盤振る舞い！" : "休息フロア — ひと息つく";
  const note = isBanquet ? "生存している味方のHPが全回復した。" : "生存している味方のHPが回復した。";
  const srcNote = sourceRestored ? `<p class="rl-rest-hung" style="color:var(--rl-gold)">⚡ 能力の源が1つ回復した（${run?.abilitySource ?? 0}/${ABILITY_SOURCE_MAX}）。</p>` : "";
  const soberNote = soberUsed ? `<p class="rl-rest-hung" style="color:#6fe08a">◆ 酔い止めが割れて、二日酔いを防いだ。</p>` : "";
  const hungNote = hungover.length ? `<p class="rl-rest-hung">🍶 ${hungover.join("・")} は酔ってしまった……次の1戦は能力が使えない。</p>` : "";
  ov.innerHTML = `
    <div class="rl-modal">
      <div class="rl-modal-head">${head}${coinBadge(run?.coins || 0)}</div>
      <div class="rl-hp-list">${partyHpRows(run, charImages)}</div>
      <p class="rl-continue-note">${note}</p>
      ${srcNote}
      ${soberNote}
      ${hungNote}
      <button type="button" class="rl-start" id="rl-rest-go">先へ進む</button>
    </div>`;
  container.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  ov.querySelector("#rl-rest-go")?.addEventListener("click", () => { ov.remove(); onDone?.(); });
}

// 効果(effect)を「何がどれくらい」の人間語チップへ。compound は再帰。
function describeEffect(e, out = []) {
  if (!e) return out;
  switch (e.kind) {
    case "heal": out.push({ t: `HP +${Math.round((e.amount || 0) * 100)}%`, tone: "hp" }); break;
    case "maxHpUp": out.push({ t: `HP最大 +${Math.round(((e.mul || 1) - 1) * 100)}%`, tone: "hp" }); break;
    case "maxHpAdd": out.push({ t: `HP最大 +${e.add || 0}`, tone: "hp" }); break;
    case "dealMul": out.push({ t: `攻撃 +${Math.round(((e.mul || 1) - 1) * 100)}%`, tone: "atk" }); break;
    case "takeReduce": out.push({ t: `防御 +${Math.round((e.rate || 0) * 100)}%`, tone: "def" }); break;
    case "skillLevelUp": out.push({ t: `スキルLv +${e.delta || 1}`, tone: "skl" }); break;
    case "grantAbility": out.push({ t: `必殺技「${abilityDef(e.abilityId)?.name || e.abilityId}」習得`, tone: "skill" }); break;
    case "friendlyGuard": out.push({ t: `庇いの守り ×${e.count || 1}`, tone: "item" }); break;
    case "addBench": out.push({ t: "控え枠 +1", tone: "gain" }); break;
    case "paramBoost": out.push({ t: `${e.param || "能力"} +${e.add || 0}`, tone: "gain" }); break;
    case "compound": for (const p of e.parts || []) describeEffect(p, out); break;
    default: break;
  }
  return out;
}

// イベント/祠の outcome を「獲得・損失」チップ配列へ（何がどれくらい入ったか／払ったか）。
export function describeOutcome(outcome) {
  if (!outcome) return [];
  const out = [];
  if (outcome.coins) out.push({ t: `光貨 ${outcome.coins > 0 ? "+" : ""}${outcome.coins}`, tone: outcome.coins > 0 ? "coin" : "loss" });
  if (outcome.healFrac) out.push({ t: `HP +${Math.round(outcome.healFrac * 100)}%`, tone: "hp" });
  if (outcome.hurtFrac) out.push({ t: `HP −${Math.round(outcome.hurtFrac * 100)}%`, tone: "loss" });
  describeEffect(outcome.effect, out);
  if (outcome.cardId) { const c = cardById(outcome.cardId); if (c) { const sub = describeEffect(c.effect, []); for (const s of sub) out.push(s); } }
  if (outcome.item) { const it = itemById(outcome.item); out.push({ t: `道具「${it?.name || outcome.item}」入手`, tone: "item" }); }
  if (outcome.itemRandom) out.push({ t: "道具を入手", tone: "item" });
  if (outcome.draft) out.push({ t: "バフを1枚選ぶ", tone: "gain" });
  return out;
}
function gainChipsHtml(outcome) {
  const list = describeOutcome(outcome);
  if (!list.length) return "";
  return `<div class="rl-gain"><span class="rl-gain-label">獲得</span>${list.map((g) => `<span class="rl-gain-chip ${g.tone}">${g.t}</span>`).join("")}</div>`;
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
    ? `<img class="rl-event-art" src="${portrait}" alt="" style="${portraitStyleAttr(speakerChar, { zoom: false, translate: false })}">`
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
          <div class="rl-event-gain" id="rl-event-gain"></div>
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
      // 「何がどれくらい入った／払った」をチップで見せる（祠/遭遇 共通）。
      const gain = ov.querySelector("#rl-event-gain");
      if (gain) { gain.innerHTML = gainChipsHtml(choice.outcome); requestAnimationFrame(() => gain.classList.add("is-in")); }
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
    const usable = it.kind === "active" && it.useAt !== "biome"; // 巡りの賽は層入場でのみ使う
    const passiveNote = it.useAt === "biome" ? "層に踏み入る時に使える"
      : (it.kind === "passive" ? "持っている間ずっと有効" : "条件で自動発動");
    return `<div class="rl-item-slot" data-id="${id}">
      <div class="rl-item-head"><span class="rl-item-kind" style="--cat:${km.color}">${it.icon ? rlIcon(it.icon, "rl-ico") : km.mark} ${km.label}</span><span class="rl-item-name">${it.name}</span></div>
      <div class="rl-item-desc">${it.desc}</div>
      ${usable ? `<button type="button" class="rl-item-use" data-use="${id}">使う</button>` : `<div class="rl-item-passive">${passiveNote}</div>`}
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
// Lv上限(cap)に達した後は「限界突破」モードに切り替わり、光貨を大量に払って攻撃力(与ダメ)を鍛え続けられる。
export function showRogueliteForge(container, opts = {}) {
  const { floor = 1, run, cap = 10, costOf, overchargeCostOf, overchargeDeal = 0.08, onForge, onOvercharge, onLeave } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-forge";
  const render = () => {
    const lv = run?.skillLevel || 1;
    const maxed = lv >= cap;
    const coins = run?.coins | 0;
    ov.querySelector("#rl-forge-lv").textContent = lv;
    ov.querySelector("#rl-forge-coins").textContent = coins;
    const btn = ov.querySelector("#rl-forge-do");
    const note = ov.querySelector("#rl-forge-note");
    if (maxed && onOvercharge && overchargeCostOf) {
      // 限界突破：攻撃力を鍛える。
      const n = run?.forgeOvercharge || 0;
      const cost = overchargeCostOf(n);
      const afford = coins >= cost;
      const pct = Math.round(overchargeDeal * 100);
      btn.disabled = !afford;
      btn.textContent = `限界突破：攻撃力を鍛える（光貨 ${cost}）→ 与ダメ +${pct}%`;
      note.textContent = n > 0
        ? `スキルは極まった。さらに光貨を捧げ、攻撃力を研ぎ澄ます（強化済み +${n}段）。`
        : afford ? "スキルは極まった。光貨を大量に捧げれば、なお攻撃力を鍛えられる。" : "限界突破には大量の光貨が要る。戦って稼ごう。";
    } else {
      const cost = costOf ? costOf(lv) : 40;
      const afford = coins >= cost;
      btn.disabled = maxed || !afford;
      btn.textContent = maxed ? "これ以上は鍛えられない（Lv上限）" : `鍛える（光貨 ${cost}）→ Lv${lv + 1}`;
      note.textContent = maxed
        ? "パーティのスキルは極まっている。"
        : afford ? "スキルレベルが上がると、全員の能力そのものが強くなる。" : "光貨が足りない。戦って稼ごう。";
    }
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
  ov.querySelector("#rl-forge-do")?.addEventListener("click", () => {
    const lv = run?.skillLevel || 1;
    const maxed = lv >= cap;
    const ok = (maxed && onOvercharge) ? onOvercharge() : onForge?.();
    if (ok) render();
  });
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
  const { reached = 0, wiped = false, retreated = false, cleared = false, bestFloor = 0, carrySlots = 0, acquired = [], partingLine, speakerChar, bondDeepened = false, partyChars = [], orbsEarned = 0, orbsTotal = 0, onClose, resolveChoices = [], onResolve } = opts;
  if (!container) return;
  const ov = document.createElement("div");
  ov.className = "rl-overlay rl-gameover" + (wiped ? " wiped" : cleared ? " cleared" : " safe");
  // P7：全滅は「罰」でなく「塔から記憶として弾かれた＝継続」。没収/力尽きた等の懲罰的な語を使わない。
  const title = cleared ? "踏破成功・この記憶を読み切った" : wiped ? "塔に弾かれた——だが、記憶は還る" : retreated ? "撤退成功・記録を持ち帰った" : "ラン終了";
  const sub = cleared
    ? `第 ${reached} 階の主を退け、この記憶を踏破した。力は持ち帰れる——次の記憶へ。`
    : wiped
      ? `第 ${reached} 階で塔は君を記憶として還した。歩いた道は消えない——また、登れる。`
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
        <div class="rl-go-stat rl-go-orb"><div class="rl-go-k">宝珠</div><div class="rl-go-v">+${orbsEarned}<span class="rl-go-orb-total">所持 ${orbsTotal}</span></div></div>
      </div>
      <p class="rl-go-sub">${sub}</p>
      ${bondDeepened ? `<p class="rl-go-bond">◆ 共に戦い抜き、${partyChars.length > 1 ? "仲間たち" : (partyChars[0]?.name || "相棒")}との絆が少し深まった。</p>` : ""}
      ${partingLine && speakerChar ? `<div class="rl-modal-speak" style="--c:${speakerChar.color || "var(--accent)"}"><b>${speakerChar.name}</b>「${partingLine}」</div>` : ""}
      ${resolveChoices.length && onResolve ? `<div class="rl-go-resolve" id="rl-go-resolve">
        <div class="rl-go-resolve-q">——君は、どうする?</div>
        <div class="rl-go-resolve-opts">${resolveChoices.map((c) => `<button type="button" class="rl-go-resolve-btn" data-id="${c.id}">${c.label}</button>`).join("")}</div>
        <div class="rl-go-resolve-reply" id="rl-go-resolve-reply" hidden></div>
      </div>` : ""}
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

  // 双方向＝プレイヤーが返す2択（提案B §3.2-5）。選ぶと相棒が短く返し、その手はキャラが覚える（onResolveで永続）。
  const resolveBox = ov.querySelector("#rl-go-resolve");
  if (resolveBox && onResolve) {
    resolveBox.querySelectorAll(".rl-go-resolve-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const reply = onResolve(id); // 永続＋相棒の返しセリフ（同期）
        resolveBox.querySelector(".rl-go-resolve-opts")?.remove();
        const r = resolveBox.querySelector("#rl-go-resolve-reply");
        if (r) {
          r.hidden = false;
          r.innerHTML = reply && speakerChar
            ? `<span style="color:${speakerChar.color || "var(--accent)"}"><b>${speakerChar.name}</b></span>「${reply}」`
            : "";
        }
        resolveBox.querySelector(".rl-go-resolve-q")?.remove();
      }, { once: true });
    });
  }

  const doClose = () => { ov.remove(); onClose?.([...selected]); };
  ov.querySelector("#rl-go-close")?.addEventListener("click", () => {
    // 何も選ばず帰還しようとしたら確認（引き継ぎ枠があるのに0枠＝取りこぼし防止）。
    if (canCarry && selected.size === 0) {
      const cf = document.createElement("div");
      cf.className = "rl-overlay rl-confirm";
      cf.innerHTML = `
        <div class="rl-modal rl-confirm-card">
          <div class="rl-confirm-h">バフを持ち帰らずに帰還しますか？</div>
          <p class="rl-confirm-note">獲得したバフを1つも引き継ぎに選んでいません。このまま帰ると次のランへは何も持ち越せません。</p>
          <div class="rl-continue-btns">
            <button type="button" class="rl-retreat" id="rl-confirm-cancel">選び直す</button>
            <button type="button" class="rl-start" id="rl-confirm-ok">このまま帰還する</button>
          </div>
        </div>`;
      container.appendChild(cf);
      requestAnimationFrame(() => cf.classList.add("is-open"));
      cf.querySelector("#rl-confirm-cancel")?.addEventListener("click", () => cf.remove());
      cf.querySelector("#rl-confirm-ok")?.addEventListener("click", () => { cf.remove(); doClose(); });
      cf.addEventListener("click", (e) => { if (e.target === cf) cf.remove(); });
      return;
    }
    doClose();
  });
}
