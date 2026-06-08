// オートバトル画面 — major_update_specification.md §4.6（プロトタイプ）。
//
// 中央に卓を囲む 4 人（あなた＋相手 3）。毎局コマンドを選ぶと、まず中央の結果カードで
// 「役・翻／点数／獲得 or 放銃」を見せ、その後に HP（点棒）の増減演出を流す。
// 1 試合＝東風 4 局。終了で着順 →「もう 1 試合／やめる（撤退）」。HP0 で敗退。
//
//   showAutoBattle(container, { self, avatar, oppLv, hp, hpMax, seed, onExit });
import {
  COMMANDS, evaluateTier, paramsFromLv,
  newMatch, resolveRound, revealedOppStance, finalPlacement, healAfterMatch,
} from "../autobattle/autoBattle.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { makeMobRoster } from "../data/mobMaster.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sePath = (name) => "sound/se/" + encodeURIComponent(name);
// seat(0=自分,1..3=相手) → 席要素の CSS クラス。
const SEAT_CLASS = ["ab-s-you", "ab-s-left", "ab-s-top", "ab-s-right"];

const TIER_CLASS = {
  yusei: "ab-tier-up2", yaya_yusei: "ab-tier-up1", kakko: "ab-tier-even",
  yaya_ressei: "ab-tier-dn1", ressei: "ab-tier-dn2", dai_ressei: "ab-tier-dn3",
};
const ROUND_LABELS = ["東一局", "東二局", "東三局", "東四局"];
const STANCE_HINT = {
  push: "押してきそうだ", pull: "受けに回るか", watch: "様子を見ている", last: "勝負を懸けてくる",
};

export function showAutoBattle(container, { self, avatar, oppLv = 4, hp, hpMax, seed = Date.now(), onExit, audio, abilityName = "能力発動", standingSrc = "", abilityUses = 3 } = {}) {
  const selfP = self || { fire: 35, guard: 30, read: 32, gamble: 28, speed: 30, mental: 30 };
  const HPMAX = hpMax || 30000;
  const youIcon = presetById(avatar?.presetIds?.icon)?.assetPath || "";
  // 能力発動は出撃（セッション）通しで abilityUses 回まで（試合をまたいでも回復しない＝貴重な切り札）。
  const session = { matchNo: 1, hp: hp ?? HPMAX, hpMax: HPMAX, wins: 0, oppLv, abilityLeft: abilityUses };
  container.classList.add("ab");

  let match = null;
  let mobs = [];
  let busy = false; // 演出中はコマンド受付を止める

  function startMatch() {
    const sd = `${seed}-m${session.matchNo}`;
    mobs = makeMobRoster(3, { seedPrefix: sd });
    const opp = paramsFromLv(session.oppLv, sd);
    match = newMatch({ self: selfP, opp, hp: session.hp, hpMax: session.hpMax, seed: sd });
    match._opp = opp;
    busy = false;
    renderFrame();
  }

  function seatHtml(cls, label, iconSrc, isMob, seatKey, pct, pts) {
    const img = iconSrc
      ? `<img class="ab-seat-img${isMob ? " is-mob" : ""}" src="${esc(iconSrc)}" alt="">`
      : `<span class="ab-seat-ph">${esc(label[0] || "?")}</span>`;
    return `<div class="ab-seat ${cls}"><div class="ab-seat-ic">${img}</div><div class="ab-seat-nm">${esc(label)}</div>`
      + `<div class="ab-seat-bar"><div class="ab-seat-fill" data-seat="${seatKey}" style="width:${pct}%"></div></div>`
      + `<div class="ab-seat-num" data-seat="${seatKey}">${(pts ?? 0).toLocaleString()}</div></div>`;
  }
  const youPct = () => Math.round((match.hp / session.hpMax) * 100);
  const oppPct = (i) => Math.round((match.oppHp[i] / match.oppHpMax) * 100);

  function tierBadge() {
    const { tier } = evaluateTier(selfP, match._opp);
    return `<span class="ab-tier ${TIER_CLASS[tier.id]}">${esc(tier.label)}</span>`;
  }

  function renderFrame() {
    const pct = Math.round((match.hp / session.hpMax) * 100);
    // 通常コマンドは押す/引く/様子を見る。4 枠目は「能力発動」（旧・次ラスで → 勝負勘の必殺）。
    const cmds = COMMANDS.filter((c) => c.id !== "last").map((c) =>
      `<button type="button" class="ab-cmd" data-cmd="${c.id}"><span class="ab-cmd-l">${esc(c.label)}</span><span class="ab-cmd-s">${esc(c.sub)}</span></button>`
    ).join("")
    + `<button type="button" class="ab-cmd ab-cmd-ability" data-cmd="ability"><span class="ab-cmd-l">${esc(abilityName)}</span><span class="ab-cmd-s">能力発動 <span class="ab-cmd-uses">×${session.abilityLeft}</span></span></button>`;

    container.innerHTML = `
      <div class="ab-wrap">
        <div class="ab-top">
          <div class="ab-top-l">第 ${session.matchNo} 試合　<span class="ab-round">${esc(ROUND_LABELS[match.round] || "—")}</span> <small class="ab-rc">(${match.round + 1}/${match.rounds})</small></div>
          <div class="ab-top-r">相手評価 ${tierBadge()}</div>
        </div>

        <div class="ab-table-area">
          <div class="ab-table"></div>
          ${seatHtml("ab-s-top", mobs[1]?.name || "相手2", mobs[1]?.assets?.icon, true, 2, oppPct(1), match.oppHp[1])}
          ${seatHtml("ab-s-left", mobs[0]?.name || "相手1", mobs[0]?.assets?.icon, true, 1, oppPct(0), match.oppHp[0])}
          ${seatHtml("ab-s-right", mobs[2]?.name || "相手3", mobs[2]?.assets?.icon, true, 3, oppPct(2), match.oppHp[2])}
          ${seatHtml("ab-s-you", avatar?.name || "あなた", youIcon, false, 0, youPct(), match.hp)}
          <div class="ab-result" id="ab-result"></div>
        </div>

        <div class="ab-hint" id="ab-hint"></div>

        <div class="ab-self-hp">
          <div class="ab-self-lab">あなたの点棒 ＝ HP</div>
          <div class="ab-bar-track"><div class="ab-bar-fill ab-fill-self" style="width:${pct}%"></div></div>
          <div class="ab-self-num">${match.hp.toLocaleString()} <small>/ ${session.hpMax.toLocaleString()}</small></div>
        </div>

        <div class="ab-cmds">${cmds}</div>
        <button type="button" class="ab-quit ghost-back" data-act="quit">↩ 切り上げる</button>
      </div>
    `;
    container.querySelectorAll(".ab-cmd").forEach((b) =>
      b.addEventListener("click", () => onCommand(b.getAttribute("data-cmd"))));
    container.querySelector('[data-act="quit"]').addEventListener("click", () => onExit?.(session));
    updateHint();
    syncAbilityBtn();
  }

  // 能力発動ボタンの残り回数表示と、残 0 のときの無効化を同期する。
  function syncAbilityBtn() {
    const b = container.querySelector(".ab-cmd-ability");
    if (!b) return;
    const left = session.abilityLeft;
    const uses = b.querySelector(".ab-cmd-uses");
    if (uses) uses.textContent = "×" + left;
    b.classList.toggle("is-empty", left <= 0);
    if (left <= 0) b.disabled = true;
  }

  function updateHint() {
    const el = container.querySelector("#ab-hint");
    if (!el) return;
    const reveal = revealedOppStance(match);
    el.className = "ab-hint " + (reveal ? "ab-hint-read" : "ab-hint-blind");
    el.innerHTML = reveal ? `相手の気配：<b>${esc(STANCE_HINT[reveal])}</b>` : "相手の出方が読めない…";
  }

  function setCmdsDisabled(d) {
    container.querySelectorAll(".ab-cmd").forEach((b) => { b.disabled = d; });
    if (!d) syncAbilityBtn(); // 再有効化時、能力が尽きていれば無効のまま
  }

  function seatLabel(seat) {
    return seat === 0 ? (avatar?.name || "あなた") : (mobs[seat - 1]?.name || `相手${seat}`);
  }

  // 払い手席 → 勝者席へ点棒の数字を飛ばす簡易演出。座標は卓エリア基準で算出。
  // kind: "gain"(自分が受取) / "lose"(自分が払う) / "neutral"(他家同士)。
  function flyPoints(fromSeat, toSeat, amount, kind, withSe) {
    const area = container.querySelector(".ab-table-area");
    const fromEl = container.querySelector("." + SEAT_CLASS[fromSeat]);
    const toEl = container.querySelector("." + SEAT_CLASS[toSeat]);
    if (!area || !fromEl || !toEl) return;
    const a = area.getBoundingClientRect();
    const f = fromEl.getBoundingClientRect();
    const t = toEl.getBoundingClientRect();
    const x0 = f.left + f.width / 2 - a.left, y0 = f.top + f.height / 2 - a.top;
    const x1 = t.left + t.width / 2 - a.left, y1 = t.top + t.height / 2 - a.top;
    const sign = kind === "gain" ? "+" : kind === "lose" ? "−" : "";
    const chip = document.createElement("div");
    chip.className = "ab-fly ab-fly-" + kind;
    chip.textContent = `${sign}${amount.toLocaleString()}`;
    chip.style.left = `${x0}px`;
    chip.style.top = `${y0}px`;
    chip.style.setProperty("--dx", `${x1 - x0}px`);
    chip.style.setProperty("--dy", `${y1 - y0}px`);
    area.appendChild(chip);
    if (withSe) audio?.playSe?.(sePath("金額表示.mp3"), 0.9);
    chip.addEventListener("animationend", () => chip.remove(), { once: true });
  }

  // 点棒移動の明細をまとめて飛ばす（少しずつずらして連続感を出す）。SE は先頭 1 回だけ。
  function flyAllPayments(payments) {
    payments.forEach((p, i) => {
      const kind = p.to === 0 ? "gain" : (p.from === 0 ? "lose" : "neutral");
      setTimeout(() => flyPoints(p.from, p.to, p.amount, kind, i === 0), i * 150);
    });
  }

  // 能力発動カットイン（立ち絵＋能力名がスイープイン）。終わったら then() で局を解決。
  function playCutin(name, then) {
    const ov = document.createElement("div");
    ov.className = "ab-cutin";
    ov.innerHTML = `
      <div class="ab-cutin-band"></div>
      ${standingSrc ? `<img class="ab-cutin-img" src="${esc(standingSrc)}" alt="">` : ""}
      <div class="ab-cutin-txt">
        <span class="ab-cutin-who">${esc(avatar?.name || "")}</span>
        <span class="ab-cutin-skill">${esc(name)}</span>
      </div>`;
    container.appendChild(ov);
    audio?.playSe?.(sePath("シャキーン2.mp3"), 0.95);
    requestAnimationFrame(() => ov.classList.add("is-on"));
    setTimeout(() => ov.classList.add("is-off"), 1000);
    setTimeout(() => { ov.remove(); then?.(); }, 1300);
  }

  function onCommand(cmd) {
    if (busy || match.finished) return;
    if (cmd === "ability") {
      if (session.abilityLeft <= 0) return;
      busy = true;
      setCmdsDisabled(true);
      session.abilityLeft -= 1;
      // カットイン → 勝負勘ベース(last)を能力で超強化して解決。
      playCutin(abilityName, () => runRound("last", true));
      return;
    }
    busy = true;
    setCmdsDisabled(true);
    runRound(cmd, false);
  }

  function runRound(cmd, ability) {
    const res = resolveRound(match, cmd, { ability });
    const win = res.hand.winnerSeat === 0;

    // 1) 中央に結果カード（種別・役・翻・点数・自分への影響）を出す。
    const card = container.querySelector("#ab-result");
    const tone = win ? "ab-result-win" : (res.delta < 0 ? "ab-result-lose" : "ab-result-safe");
    card.className = "ab-result is-show " + tone;
    const hl = res.hand.han >= 6 ? "跳満" : res.hand.han === 5 ? "満貫" : `${res.hand.han} 翻`;
    const wt = res.hand.winType === "tsumo" ? "ツモ" : "ロン";
    let deltaHtml;
    if (res.delta > 0) deltaHtml = `獲得 +${res.delta.toLocaleString()}`;
    else if (res.delta < 0) deltaHtml = `${res.hand.winType === "tsumo" ? "被ツモ −" : "放銃 −"}${Math.abs(res.delta).toLocaleString()}`;
    else deltaHtml = "難を逃れた";
    const who = res.hand.ronTarget != null
      ? `${esc(seatLabel(res.hand.winnerSeat))} → ${esc(seatLabel(res.hand.ronTarget))} へ${wt}`
      : `${esc(seatLabel(res.hand.winnerSeat))} の${wt}`;
    card.innerHTML = `
      <div class="ab-r-who">${who}</div>
      <div class="ab-r-han-big">${hl}</div>
      <div class="ab-r-pts">${res.hand.points.toLocaleString()} 点</div>
      <div class="ab-r-delta">${deltaHtml}</div>
    `;
    // 勝者の席をハイライト。
    container.querySelectorAll(".ab-seat").forEach((s) => s.classList.remove("is-winner"));
    container.querySelector("." + SEAT_CLASS[res.hand.winnerSeat])?.classList.add("is-winner");
    // 結果カード出現に合わせて軽い和風 SE（自分の和了は華やか）。
    if (win) audio?.playSe?.(sePath("シャキーン1.mp3"), 0.55);

    // 2) 少し見せてから点棒移動＋HP 増減演出。
    setTimeout(() => {
      flyAllPayments(res.payments);
      const fill = container.querySelector(".ab-fill-self");
      const num = container.querySelector(".ab-self-num");
      if (fill) fill.style.width = `${Math.round((match.hp / session.hpMax) * 100)}%`;
      if (num) num.innerHTML = `${match.hp.toLocaleString()} <small>/ ${session.hpMax.toLocaleString()}</small>`;
      if (res.delta !== 0) {
        const hpBox = container.querySelector(".ab-self-hp");
        hpBox?.classList.add(res.delta > 0 ? "ab-flash-up" : "ab-flash-dn");
        setTimeout(() => hpBox?.classList.remove("ab-flash-up", "ab-flash-dn"), 500);
      }
      // 各席のバー＆点棒数値も更新（相手の HP も見える）。
      const setSeat = (k, pct, val) => {
        const f = container.querySelector(`.ab-seat-fill[data-seat="${k}"]`); if (f) f.style.width = `${pct}%`;
        const n = container.querySelector(`.ab-seat-num[data-seat="${k}"]`); if (n) n.textContent = val.toLocaleString();
      };
      setSeat(0, youPct(), match.hp);
      setSeat(1, oppPct(0), match.oppHp[0]); setSeat(2, oppPct(1), match.oppHp[1]); setSeat(3, oppPct(2), match.oppHp[2]);
    }, 1100);

    // 3) カードを引っ込めて次局 or 結果へ。
    setTimeout(() => {
      card.className = "ab-result";
      container.querySelectorAll(".ab-seat").forEach((s) => s.classList.remove("is-winner"));
      if (res.finished) { showResult(); return; }
      const roundEl = container.querySelector(".ab-round");
      if (roundEl) roundEl.textContent = ROUND_LABELS[match.round] || "—";
      const rc = container.querySelector(".ab-rc");
      if (rc) rc.textContent = `(${match.round + 1}/${match.rounds})`;
      updateHint();
      busy = false;
      setCmdsDisabled(false);
    }, 2300);
  }

  function showResult() {
    if (match.result === "down") {
      overlay(`
        <div class="ab-res-ttl ab-res-down">飛び！</div>
        <p class="ab-res-sub">点棒が尽きた。ここまでだ。</p>
        <button type="button" class="primary ab-res-btn" data-act="exit">師弟ホームへ</button>
      `, { exit: () => onExit?.(session) });
      return;
    }
    const place = finalPlacement(match);
    session.wins += place <= 2 ? 1 : 0;
    overlay(`
      <div class="ab-res-ttl">第 ${session.matchNo} 試合 終了</div>
      <div class="ab-res-place ab-place-${place}">${place} 着</div>
      <p class="ab-res-sub">勝ち抜き ${session.wins} ／ 残り HP ${match.hp.toLocaleString()}</p>
      <div class="ab-res-row">
        <button type="button" class="primary ab-res-btn" data-act="next">もう 1 試合</button>
        <button type="button" class="ghost-back ab-res-btn" data-act="stop">やめる（撤退）</button>
      </div>
      <p class="ab-res-note">※ 撤退すると「勝ち抜き」扱いになりません</p>
    `, {
      next: () => { session.hp = healAfterMatch(match.hp, session.hpMax); session.matchNo += 1; startMatch(); },
      stop: () => onExit?.(session),
    });
  }

  function overlay(inner, actions) {
    const ov = document.createElement("div");
    ov.className = "ab-overlay";
    ov.innerHTML = `<div class="ab-res-card">${inner}</div>`;
    container.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add("is-open"));
    ov.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => { const a = actions[b.getAttribute("data-act")]; ov.remove(); a?.(); }));
  }

  startMatch();
}
