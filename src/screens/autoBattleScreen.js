// オートバトル画面 — major_update_specification.md §4.6（プロトタイプ）。
//
// 中央に卓を囲む 4 人（あなた＋相手 3）。毎局コマンドを選ぶと、まず中央の結果カードで
// 「役・翻／点数／獲得 or 放銃」を見せ、その後に HP（点棒）の増減演出を流す。
// 1 試合＝東風 4 局。終了で着順 →「もう 1 試合／やめる（撤退）」。HP0 で敗退。
//
//   showAutoBattle(container, { self, avatar, oppLv, hp, hpMax, seed, onExit });
import {
  COMMANDS, evaluateTier, paramsFromLv, makeRng,
  newMatch, resolveRound, oppHint, finalPlacement, healAfterMatch,
} from "../autobattle/autoBattle.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { makeMobRoster } from "../data/mobMaster.js";
import { flavorTilePath } from "../ui/assets.js";
import { pickBeatChain, STANCE_HINT, VAGUE_HINT, EDGE_LABEL, INTENT_KANJI } from "../data/autoBattleTextMaster.js";
import { pickMentorBattleQuip } from "../data/mentorVoiceMaster.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { pickVoiceLine } from "../data/voiceLines.js";
import { TRAIT_CFG } from "../data/parlorTraitMaster.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// インラインstyleへ注入する色値の保険（hexのみ通す。CSSインジェクション防止）。
const safeColor = (c, fb = "#ecd592") => (/^#[0-9a-fA-F]{3,8}$/.test(String(c || "")) ? c : fb);
const sePath = (name) => "sound/se/" + encodeURIComponent(name);
// seat(0=自分,1..3=相手) → 席要素の CSS クラス。
const SEAT_CLASS = ["ab-s-you", "ab-s-left", "ab-s-top", "ab-s-right"];

const TIER_CLASS = {
  yusei: "ab-tier-up2", yaya_yusei: "ab-tier-up1", kakko: "ab-tier-even",
  yaya_ressei: "ab-tier-dn1", ressei: "ab-tier-dn2", dai_ressei: "ab-tier-dn3",
};
const ROUND_LABELS = ["東一局", "東二局", "東三局", "東四局"];

export function showAutoBattle(container, { self, avatar, oppLv = 4, hp, hpMax, seed = Date.now(), onExit, audio, abilityName = "能力発動", standingSrc = "", abilityUses = 3, conditionBias = 0, conditionLabel = "", conditionTone = "ok", maxMatches = Infinity, oppHpMax = 25000, completeLabel = "雀荘を後にする", mentor = null, bondLevel = 1, trait = null } = {}) {
  const selfP = self || { fire: 35, guard: 30, read: 32, gamble: 28, speed: 30, mental: 30 };
  const HPMAX = hpMax || 30000;
  const youIcon = presetById(avatar?.presetIds?.icon)?.assetPath || "";
  // 能力発動は出撃（セッション）通しで abilityUses 回まで（試合をまたいでも回復しない＝貴重な切り札）。
  const session = { matchNo: 1, hp: hp ?? HPMAX, hpMax: HPMAX, wins: 0, rareWins: 0, oppLv, abilityLeft: abilityUses };
  container.classList.add("ab");

  let match = null;
  let mobs = [];
  let busy = false; // 演出中はコマンド受付を止める
  let fxRng = Math.random; // 演出専用乱数（ロジックの state.rng を汚さない）
  let exiting = false;     // 退場演出（相槌の一拍）中の二重操作ガード
  // 師匠相槌の抑制状態（試合ごとにリセット）。lastQuipAt は「喋った時点の解決済み局数」。
  let quipState = { lastQuipAt: -2, pinchDone: false, startDone: false, rareDone: false, hideTimer: null };

  let rare = null; // レア客 { seat: 1..3, char }（出た試合のみ）
  let selfHandPaths = []; // 自分の手牌（フレーバー表示。fxRng 由来・ロジック無関係）

  // 自分の手牌（見た目だけ）を 13 枚引き直す。ソートして「整えた手」に見せる。
  function regenSelfHand() {
    selfHandPaths = Array.from({ length: 13 }, () => flavorTilePath(fxRng)).sort();
  }

  function startMatch() {
    const sd = `${seed}-m${session.matchNo}`;
    mobs = makeMobRoster(3, { seedPrefix: sd });
    // レア客（軸4）: 低確率で相手 1 席がネームドに差し替わる。店トレイト「常連の影」で率 UP。
    // 出た試合は相手パラメが格上（rareGuestLvUp）になる＝勝てばボーナス（visitParlor 側で精算）。
    rare = null;
    const rr = makeRng(`${sd}:rare`);
    let lvEff = session.oppLv;
    if (rr() < TRAIT_CFG.rareGuestBase + (trait?.rareGuestAdd || 0)) {
      const pool = CHARACTER_MASTER.filter((c) => c.id !== mentor?.id);
      if (pool.length) {
        rare = { seat: 1 + Math.floor(rr() * 3), char: pool[Math.floor(rr() * pool.length)] };
        lvEff = session.oppLv + TRAIT_CFG.rareGuestLvUp;
      }
    }
    const opp = paramsFromLv(lvEff, sd);
    fxRng = makeRng(`${sd}:fx`);
    regenSelfHand();
    // レア客席は点棒を太く（rareGuestHpMul）＝飛ばされにくい「格上の貫禄」。
    const oppHpMaxSeats = rare
      ? [0, 1, 2].map((i) => rare.seat === i + 1 ? Math.round(oppHpMax * TRAIT_CFG.rareGuestHpMul) : oppHpMax)
      : null;
    match = newMatch({ self: selfP, opp, hp: session.hp, hpMax: session.hpMax, seed: sd, conditionBias, oppHpMax, oppHpMaxSeats,
      uraRateAdd: trait?.uraRateAdd || 0 }); // 店トレイト「裏ドラ濃いめ」
    match._opp = opp;
    busy = false;
    clearTimeout(quipState.hideTimer); // 前試合の相槌フェードタイマーを破棄
    quipState = { lastQuipAt: -2, pinchDone: false, startDone: false, rareDone: false, hideTimer: null };
    renderFrame();
    if (rare) setTimeout(() => playRareEntrance(), 400);
    setTimeout(() => maybeQuip("matchStart"), 800);
  }

  // レア客の登場演出: 帯＋顔＋一言（ネームドは喋って OK・モブ無口ポリシーの例外）。
  function playRareEntrance() {
    const area = container.querySelector(".ab-table-area");
    if (!area || !rare) return;
    const line = pickVoiceLine(rare.char.id, "matchStart") || "";
    const ov = document.createElement("div");
    ov.className = "ab-rare-banner";
    ov.innerHTML = `
      <div class="ab-rare-inner">
        ${rare.char.assets?.icon ? `<img class="ab-rare-ic" src="${esc(rare.char.assets.icon)}" alt="">` : ""}
        <div class="ab-rare-tx">
          <span class="ab-rare-cap">★ 腕利きの客が卓に着いた</span>
          <span class="ab-rare-nm" style="color:${safeColor(rare.char.color)}">${esc(rare.char.name)}</span>
          ${line ? `<span class="ab-rare-line">「${esc(line)}」</span>` : ""}
        </div>
      </div>`;
    area.appendChild(ov);
    audio?.playSe?.(sePath("入店チャイム.mp3"), 0.8);
    requestAnimationFrame(() => ov.classList.add("is-on"));
    setTimeout(() => maybeQuip("rareGuest"), 1200);
    setTimeout(() => ov.classList.add("is-off"), 2400);
    setTimeout(() => ov.remove(), 2900);
  }

  // ── 師匠の見守り相槌 ──────────────────────────────────────────
  // 優先度: 大事件(>=85)はクールダウン無視で必ず拾う。それ未満は「前局に喋っていたら黙る」。
  const QUIP_PRI = {
    tobi: 100, bustWin: 95, abilityUse: 90, complete: 85, retreat: 85,
    bigWin: 80, bigLoss: 75, pinch: 70, rareGuest: 65, readWin: 60,
    riichiSelf: 58, riichiOpp: 58, matchStart: 50,
  };

  function showQuipBubble(text) {
    const panel = container.querySelector(".ab-mentor");
    const b = panel?.querySelector(".ab-mentor-bubble");
    if (!panel || !b) return;
    b.textContent = text;
    b.classList.add("is-show");
    panel.classList.add("is-talk");
    clearTimeout(quipState.hideTimer);
    quipState.hideTimer = setTimeout(() => {
      b.classList.remove("is-show");
      panel.classList.remove("is-talk");
    }, 2600);
  }

  function maybeQuip(event) {
    if (!mentor) return;
    const pri = QUIP_PRI[event] ?? 0;
    if (event === "pinch" && quipState.pinchDone) return;
    if (event === "matchStart" && quipState.startDone) return;
    if (event === "rareGuest" && quipState.rareDone) return;
    if (pri < 80 && match.round - quipState.lastQuipAt < 2) return; // 連発防止（1局空ける）
    const text = pickMentorBattleQuip(mentor.id, event, { bondLevel, condTier: conditionTone }, fxRng);
    if (!text) return;
    if (event === "pinch") quipState.pinchDone = true;
    if (event === "matchStart") quipState.startDone = true;
    if (event === "rareGuest") quipState.rareDone = true;
    quipState.lastQuipAt = match.round;
    showQuipBubble(text);
  }

  // 退出の一元ガード（KO演出・相槌の一拍・オーバーレイの各経路から二重発火させない）。
  function doExit() {
    if (exiting) return;
    exiting = true;
    onExit?.(session);
  }

  // 撤退・切り上げ時は相槌を一拍見せてから退出する（mentor 不在なら即時）。
  function exitWithQuip(event) {
    if (exiting) return;
    exiting = true;
    if (!mentor) { onExit?.(session); return; }
    maybeQuip(event);
    setTimeout(() => onExit?.(session), 1300);
  }

  function seatHtml(cls, label, iconSrc, isMob, seatKey, pct, pts, rareColor = null) {
    const img = iconSrc
      ? `<img class="ab-seat-img${isMob ? " is-mob" : ""}" src="${esc(iconSrc)}" alt="">`
      : `<span class="ab-seat-ph">${esc(label[0] || "?")}</span>`;
    const nm = rareColor
      ? `<div class="ab-seat-nm ab-seat-rare" style="color:${esc(rareColor)}">★ ${esc(label)}</div>`
      : `<div class="ab-seat-nm">${esc(label)}</div>`;
    return `<div class="ab-seat ${cls}${rareColor ? " is-rare" : ""}"><div class="ab-seat-ic">${img}</div>${nm}`
      + `<div class="ab-seat-bar"><div class="ab-seat-fill" data-seat="${seatKey}" style="width:${pct}%"></div></div>`
      + `<div class="ab-seat-num" data-seat="${seatKey}">${(pts ?? 0).toLocaleString()}</div></div>`;
  }

  // 相手席の表示情報（レア客席はネームドの顔＋名前色＋★）。i = 0..2（seat 1..3）。
  function oppSeatHtml(i, cls) {
    if (rare && rare.seat === i + 1) {
      return seatHtml(cls, rare.char.name, rare.char.assets?.icon || "", false, i + 1, oppPct(i), match.oppHp[i], safeColor(rare.char.color));
    }
    return seatHtml(cls, mobs[i]?.name || `相手${i + 1}`, mobs[i]?.assets?.icon, true, i + 1, oppPct(i), match.oppHp[i]);
  }
  const youPct = () => Math.round((match.hp / session.hpMax) * 100);
  const oppPct = (i) => Math.round((match.oppHp[i] / match.oppHpMaxSeats[i]) * 100);

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
          <div class="ab-top-r">${conditionLabel ? `<span class="ab-cond tone-${conditionTone}" title="今月の調子（勝率に軽く影響）">${esc(conditionLabel)}</span>` : ""}相手評価 ${tierBadge()}</div>
        </div>

        <div class="ab-table-area">
          <div class="ab-table">
            <div class="ab-center">
              <div class="ab-center-round">${esc(ROUND_LABELS[match.round] || "—")}</div>
              <div class="ab-center-rc">${match.round + 1} / ${match.rounds}</div>
              <div class="ab-center-intent"></div>
            </div>
            <div class="ab-hand ab-hand-top">${'<span class="ab-tback"></span>'.repeat(13)}</div>
            <div class="ab-hand ab-hand-left">${'<span class="ab-tback ab-tback-v"></span>'.repeat(13)}</div>
            <div class="ab-hand ab-hand-right">${'<span class="ab-tback ab-tback-v"></span>'.repeat(13)}</div>
            <div class="ab-hand ab-hand-you">${selfHandPaths.map((p) => `<img class="ab-htile" src="${esc(p)}" alt="">`).join("")}</div>
            <div class="ab-river ab-river-top"></div>
            <div class="ab-river ab-river-left"></div>
            <div class="ab-river ab-river-right"></div>
            <div class="ab-river ab-river-you"></div>
          </div>
          ${oppSeatHtml(1, "ab-s-top")}
          ${oppSeatHtml(0, "ab-s-left")}
          ${oppSeatHtml(2, "ab-s-right")}
          ${seatHtml("ab-s-you", avatar?.name || "あなた", youIcon, false, 0, youPct(), match.hp)}
          <div class="ab-result" id="ab-result"></div>
          <div class="ab-beat" id="ab-beat"></div>
          ${mentor ? `
          <div class="ab-mentor">
            <div class="ab-mentor-frame">${mentor.portrait
              ? `<img class="ab-mentor-img" src="${esc(mentor.portrait)}" alt="">`
              : `<span class="ab-mentor-ph">${esc((mentor.name || "師")[0])}</span>`}</div>
            <div class="ab-mentor-nm">${esc(mentor.name || "")}<small>見守り中</small></div>
            <div class="ab-mentor-bubble"></div>
          </div>` : ""}
        </div>

        <div class="ab-hint" id="ab-hint"></div>

        <div class="ab-self-hp">
          <div class="ab-self-lab">あなたの点棒 ＝ HP</div>
          <div class="ab-bar-track"><div class="ab-bar-ghost" style="width:${pct}%"></div><div class="ab-bar-fill ab-fill-self" style="width:${pct}%"></div></div>
          <div class="ab-self-num">${match.hp.toLocaleString()} <small>/ ${session.hpMax.toLocaleString()}</small></div>
        </div>

        <div class="ab-cmds">${cmds}</div>
        <button type="button" class="ab-quit ghost-back" data-act="quit">↩ 切り上げる</button>
      </div>
    `;
    container.querySelectorAll(".ab-cmd").forEach((b) =>
      b.addEventListener("click", () => onCommand(b.getAttribute("data-cmd"))));
    container.querySelector('[data-act="quit"]').addEventListener("click", () => exitWithQuip("retreat"));
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

  // ヒント3段: 開示（確定・金）／曖昧（外れることもある気配）／無し。
  // 軸B: 卓中央の「意図チップ」（攻/守/観/賭）にも翻訳。開示=金枠くっきり、曖昧=半透明＋？揺れ。
  function updateHint() {
    const el = container.querySelector("#ab-hint");
    if (!el) return;
    const h = oppHint(match);
    if (h && !h.vague) {
      el.className = "ab-hint ab-hint-read";
      el.innerHTML = `相手の気配：<b>${esc(STANCE_HINT[h.stance])}</b>`;
    } else if (h) {
      el.className = "ab-hint ab-hint-vague";
      el.innerHTML = `うっすらと——<i>${esc(VAGUE_HINT[h.stance])}</i>`;
    } else {
      el.className = "ab-hint ab-hint-blind";
      el.innerHTML = "相手の出方が読めない…";
    }
    let chip = container.querySelector(".ab-intent");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "ab-intent";
      container.querySelector(".ab-center-intent")?.appendChild(chip); // 卓中央パネルに埋め込む
    }
    if (h) {
      chip.className = `ab-intent is-show ${h.vague ? "ab-intent-vague" : "ab-intent-sure"} ab-intent-${h.stance}`;
      chip.innerHTML = `<span class="ab-intent-k">${esc(INTENT_KANJI[h.stance] || "？")}</span>${h.vague ? '<span class="ab-intent-q">？</span>' : ""}`;
    } else {
      chip.className = "ab-intent";
      chip.innerHTML = "";
    }
  }

  // 局解決中は意図チップを引っ込める（結果カードと重なるため）。
  function hideIntent() {
    container.querySelector(".ab-intent")?.classList.remove("is-show");
  }

  // ── 麻雀卓の舞台装置（河・リーチ棒）──────────────────────────
  // 河に捨て牌を n 枚ばらまく（fxRng・ゾーンはランダム・1ゾーン10枚まで）。
  function sprinkleRiver(n) {
    const zones = container.querySelectorAll(".ab-river");
    if (!zones.length) return;
    for (let i = 0; i < n; i++) {
      const z = zones[Math.floor(fxRng() * zones.length)];
      if (!z || z.children.length >= 10) continue;
      const img = document.createElement("img");
      img.className = "ab-rtile";
      img.src = flavorTilePath(fxRng);
      img.alt = "";
      z.appendChild(img);
    }
  }

  // リーチ棒（千点棒）を卓中央の上に置く。次局頭の clearTableFx で回収。
  function placeRiichiStick() {
    const table = container.querySelector(".ab-table");
    if (!table || table.querySelector(".ab-rstick")) return;
    const stick = document.createElement("div"); // 素材レスの点棒（CSSで描画）
    stick.className = "ab-rstick";
    table.appendChild(stick);
    requestAnimationFrame(() => stick.classList.add("is-on"));
  }

  // 局頭の卓リセット（前局の河・リーチ棒を流す）。
  function clearTableFx() {
    container.querySelectorAll(".ab-river").forEach((z) => { z.innerHTML = ""; });
    container.querySelector(".ab-rstick")?.remove();
  }

  // 局表示（topbar＋卓中央）と自分のフレーバー手牌を次局用に更新する。
  function refreshRoundIndicators() {
    const roundEl = container.querySelector(".ab-round");
    if (roundEl) roundEl.textContent = ROUND_LABELS[match.round] || "—";
    const rc = container.querySelector(".ab-rc");
    if (rc) rc.textContent = `(${match.round + 1}/${match.rounds})`;
    const cr = container.querySelector(".ab-center-round");
    if (cr) cr.textContent = ROUND_LABELS[match.round] || "—";
    const crc = container.querySelector(".ab-center-rc");
    if (crc) crc.textContent = `${match.round + 1} / ${match.rounds}`;
    regenSelfHand();
    const hand = container.querySelector(".ab-hand-you");
    if (hand) hand.innerHTML = selfHandPaths.map((p) => `<img class="ab-htile" src="${esc(p)}" alt="">`).join("");
  }

  function setCmdsDisabled(d) {
    container.querySelectorAll(".ab-cmd").forEach((b) => { b.disabled = d; });
    if (!d) syncAbilityBtn(); // 再有効化時、能力が尽きていれば無効のまま
  }

  function seatLabel(seat) {
    if (seat === 0) return avatar?.name || "あなた";
    if (rare && rare.seat === seat) return rare.char.name;
    return mobs[seat - 1]?.name || `相手${seat}`;
  }

  // ── 打撃感ヘルパー（軸A: 格ゲー流のジュース）──────────────────
  // 自 HP バー更新。減るときは残像（ゴーストバー）が遅れて縮む＝削られた量が体感に残る。
  function updateSelfBar(pct) {
    const fill = container.querySelector(".ab-fill-self");
    const ghost = container.querySelector(".ab-bar-ghost");
    const cur = fill ? parseFloat(fill.style.width) || 0 : 0;
    if (fill) fill.style.width = `${pct}%`;
    if (!ghost) return;
    if (pct >= cur) {
      ghost.style.transition = "none";
      ghost.style.width = `${pct}%`;
    } else {
      ghost.style.transition = "width .7s ease .45s"; // 本体が減りきってから追従
      void ghost.offsetWidth; // transition の適用を確実に（同tick変更の取りこぼし防止）
      ghost.style.width = `${pct}%`;
    }
  }

  // 卓シェイク。level: "sm"(2px) / "lg"(6px減衰)。被ダメ・KO で使う。
  function shakeTable(level) {
    const area = container.querySelector(".ab-table-area");
    if (!area) return;
    area.classList.remove("ab-shake-sm", "ab-shake-lg");
    void area.offsetWidth; // 連続発火でも再生し直す
    area.classList.add(level === "lg" ? "ab-shake-lg" : "ab-shake-sm");
  }

  // ヒットストップの白フラッシュ（大物手・大放銃の直前に 1 拍止める）。
  // animationend が来ない環境（非表示中など）でも残留しないようフォールバック削除を併設。
  function flashFreeze() {
    const area = container.querySelector(".ab-table-area");
    if (!area) return;
    const f = document.createElement("div");
    f.className = "ab-freeze";
    area.appendChild(f);
    f.addEventListener("animationend", () => f.remove(), { once: true });
    setTimeout(() => f.remove(), 700);
  }

  // 読み勝ちのカウンター演出（画面縁の金フラッシュ）。
  function edgeFlash() {
    const area = container.querySelector(".ab-table-area");
    if (!area) return;
    const f = document.createElement("div");
    f.className = "ab-counterflash";
    area.appendChild(f);
    f.addEventListener("animationend", () => f.remove(), { once: true });
    setTimeout(() => f.remove(), 1000);
  }

  // 飛び/飛ばしの KO 演出（一文字ドン＋シェイク）。終わったら then()。
  function playKo(text, tone, then) {
    const area = container.querySelector(".ab-table-area");
    if (!area) { then?.(); return; }
    const ov = document.createElement("div");
    ov.className = "ab-ko " + tone; // "ab-ko-win" | "ab-ko-lose"
    ov.innerHTML = `<span class="ab-ko-txt">${esc(text)}</span>`;
    area.appendChild(ov);
    shakeTable("lg");
    audio?.playPip?.(tone === "ab-ko-win" ? 220 : 140, 0.4);
    requestAnimationFrame(() => ov.classList.add("is-on"));
    setTimeout(() => ov.classList.add("is-off"), 950);
    setTimeout(() => { ov.remove(); then?.(); }, 1250);
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
      // カットイン → 勝負勘ベース(last)を能力で超強化して解決。相槌はカットイン明けに。
      playCutin(abilityName, () => { maybeQuip("abilityUse"); runRound("last", true); });
      return;
    }
    busy = true;
    setCmdsDisabled(true);
    runRound(cmd, false);
  }

  // ステップキュー実行。steps = [{ at(ms), run(instant) }]（at 昇順）。
  // 演出中に卓エリアを押すと残りステップを即時実行（スキップ）→ 350ms 後にクローズ。
  function playSteps(rawSteps, onDone) {
    const steps = [...rawSteps].sort((a, b) => a.at - b.at); // 実行順 = at 順を保証（安定ソート）
    const area = container.querySelector(".ab-table-area");
    let timers = [];
    let next = 0;
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      area?.removeEventListener("pointerdown", skip);
      onDone?.();
    };
    const skip = () => {
      area?.removeEventListener("pointerdown", skip);
      timers.forEach(clearTimeout);
      timers = [];
      while (next < steps.length) steps[next++].run(true);
      setTimeout(finish, 350);
    };
    steps.forEach((s, idx) => {
      timers.push(setTimeout(() => {
        if (idx < next) return;
        next = idx + 1;
        s.run(false);
        if (next >= steps.length) finish();
      }, s.at));
    });
    area?.addEventListener("pointerdown", skip);
  }

  function runRound(cmd, ability) {
    const res = resolveRound(match, cmd, { ability });
    const h = res.hand;
    const win = h.winnerSeat === 0;
    const card = container.querySelector("#ab-result");
    const beat = container.querySelector("#ab-beat");
    const tone = win ? "ab-result-win" : (res.delta < 0 ? "ab-result-lose" : "ab-result-safe");
    const hanLabel = (han) => (han >= 6 ? "跳満" : han === 5 ? "満貫" : `${han} 翻`);
    const wt = h.winType === "tsumo" ? "ツモ" : "ロン";
    const who = h.ronTarget != null
      ? `${esc(seatLabel(h.winnerSeat))} → ${esc(seatLabel(h.ronTarget))} へ${wt}`
      : `${esc(seatLabel(h.winnerSeat))} の${wt}`;
    let deltaHtml;
    if (res.delta > 0) deltaHtml = `獲得 +${res.delta.toLocaleString()}`;
    else if (res.delta < 0) deltaHtml = `${h.winType === "tsumo" ? "被ツモ −" : "放銃 −"}${Math.abs(res.delta).toLocaleString()}`;
    else deltaHtml = "難を逃れた";
    // 読み合いフィードバック: 開示に正対して取った=読み勝ち／未開示で刺さった=かみ合った／開示無視で落とした=読み外し。
    let edgeBadge = "", edgeCls = "";
    if (res.edge === "win" && res.tookRound) {
      edgeBadge = res.revealed ? EDGE_LABEL.readWin : EDGE_LABEL.luckyMatch;
      edgeCls = "ab-edge-win";
    } else if (res.edge === "lose" && res.revealed && !res.tookRound) {
      edgeBadge = EDGE_LABEL.readMiss;
      edgeCls = "ab-edge-miss";
    }

    const steps = [];
    // 経過ビート連鎖（軸D′）: 通常局=1行、リーチ/大物手局=2行の実況。
    // リーチ実況の行で師匠が反応する（riichiSelf/riichiOpp、クールダウン制御は maybeQuip 任せ）。
    const beats = pickBeatChain(res, seatLabel(h.winnerSeat), fxRng);
    beats.forEach((line, bi) => {
      steps.push({ at: bi * 550, run(instant) {
        if (bi === 0) { hideIntent(); clearTableFx(); } // 前局の河とリーチ棒を流す
        if (beat) {
          beat.textContent = line;
          beat.classList.remove("is-show");
          void beat.offsetWidth; // 2行目で再生し直す
          beat.classList.add("is-show");
        }
        if (bi === 1 && h.riichi) placeRiichiStick(); // 千点棒が卓に置かれる
        if (instant) return;
        if (bi === 0) audio?.playSe?.(sePath("カードをめくる.mp3"), 0.5);
        if (bi === 1 && h.riichi) {
          audio?.playSe?.(sePath("カードを台の上に出す.mp3"), 0.8); // リーチ棒を置く音
          maybeQuip(h.winnerSeat === 0 ? "riichiSelf" : "riichiOpp");
        }
      } });
    });
    const cardAt = 700 + (beats.length - 1) * 550;
    // 河に捨て牌が増えていく（局が進行している画）。スキップ時も即時で同じ状態に。
    steps.push({ at: 160, run() { sprinkleRiver(2); } });
    steps.push({ at: 480, run() { sprinkleRiver(2); } });
    steps.push({ at: cardAt + 300, run() { sprinkleRiver(3); } });
    // カード出現（誰のツモ/ロン＋リーチ chip）。中身は段階表示するので空スロットで開く。
    steps.push({ at: cardAt, run(instant) {
      beat?.classList.remove("is-show");
      card.className = "ab-result is-show " + tone;
      card.innerHTML = `
        <div class="ab-r-who">${who}${h.riichi ? '<span class="ab-r-riichi">リーチ</span>' : ""}</div>
        <div class="ab-r-tiles"></div>
        <div class="ab-r-yaku"></div>
        <div class="ab-r-han-big"></div>
        <div class="ab-r-ura"></div>
        <div class="ab-r-pts"></div>
        <div class="ab-r-delta"></div>
      `;
      container.querySelectorAll(".ab-seat").forEach((s) => s.classList.remove("is-winner"));
      container.querySelector("." + SEAT_CLASS[h.winnerSeat])?.classList.add("is-winner");
      if (!instant && win) audio?.playSe?.(sePath("シャキーン1.mp3"), 0.55);
    } });
    // 役名スラム＋和了牌の倒牌（フレーバー5枚が順にめくれる）。
    steps.push({ at: cardAt + 200, run() {
      const y = card.querySelector(".ab-r-yaku");
      if (y) { y.textContent = h.yaku || ""; y.classList.add("is-slam"); }
      const tl = card.querySelector(".ab-r-tiles");
      if (tl) tl.innerHTML = Array.from({ length: 5 }, (_, i) =>
        `<img class="ab-rwtile" style="animation-delay:${i * 70}ms" src="${esc(flavorTilePath(fxRng))}" alt="">`).join("");
    } });
    // 翻カウントアップ（170ms/翻、ピッ音の音程が上がっていく）。まず base の翻まで数える。
    const baseHan = Math.max(1, h.baseHan ?? h.han);
    for (let n = 1; n <= baseHan; n++) {
      steps.push({ at: cardAt + 350 + (n - 1) * 170, run(instant) {
        const el = card.querySelector(".ab-r-han-big");
        if (el) el.textContent = `${n} 翻`;
        if (!instant) audio?.playPip?.(1320 + n * 120, 0.10);
      } });
    }
    let t = cardAt + 350 + baseHan * 170;
    // 満貫以上はラベルをドン（カードにパンチ＝軽い拡大の戻し）。
    if (baseHan >= 5) {
      steps.push({ at: t, run(instant) {
        const el = card.querySelector(".ab-r-han-big");
        if (el) { el.textContent = hanLabel(baseHan); el.classList.add("is-big"); }
        if (!instant) {
          card.classList.remove("is-punch"); void card.offsetWidth; card.classList.add("is-punch");
          audio?.playPip?.(2200, 0.16);
        }
      } });
      t += 250;
    }
    // 裏ドラめくり（乗った局のみ）: 金フラッシュ＋翻/点数を final へ昇格。
    if ((h.ura || 0) > 0) {
      t += 200;
      steps.push({ at: t, run(instant) {
        card.classList.add("is-ura");
        const u = card.querySelector(".ab-r-ura");
        if (u) u.textContent = `裏ドラ乗り！ +${h.ura} 翻`;
        const el = card.querySelector(".ab-r-han-big");
        if (el) { el.textContent = hanLabel(h.han); if (h.han >= 5) el.classList.add("is-big"); }
        if (!instant) audio?.playSe?.(sePath("シャキーン2.mp3"), 0.8);
      } });
      t += 250;
    }
    // 点数＋自分への影響＋読み合いバッジ。読み勝ちはカウンター演出（縁の金フラッシュ）。
    t += 250;
    steps.push({ at: t, run(instant) {
      const p = card.querySelector(".ab-r-pts");
      if (p) p.textContent = `${h.points.toLocaleString()} 点`;
      const d = card.querySelector(".ab-r-delta");
      if (d) d.innerHTML = deltaHtml + (edgeBadge ? ` <span class="ab-r-edge ${edgeCls}">${esc(edgeBadge)}</span>` : "");
      if (!instant && edgeBadge && edgeCls === "ab-edge-win") edgeFlash();
    } });
    // ヒットストップ（軸A）: 大物手・大放銃は白フラッシュで 1 拍止めてから点棒を動かす。
    const bigHit = (win && h.han >= 5) || res.delta <= -8000;
    if (bigHit) {
      t += 200;
      steps.push({ at: t, run(instant) { if (!instant) flashFreeze(); } });
      t += 110;
    }
    // 点棒移動＋HP バー更新（残像バー）。被ダメは量に応じて卓シェイク。
    t += 200;
    steps.push({ at: t, run(instant) {
      if (!instant) flyAllPayments(res.payments);
      const num = container.querySelector(".ab-self-num");
      updateSelfBar(Math.round((match.hp / session.hpMax) * 100));
      if (num) num.innerHTML = `${match.hp.toLocaleString()} <small>/ ${session.hpMax.toLocaleString()}</small>`;
      if (!instant && res.delta !== 0) {
        const hpBox = container.querySelector(".ab-self-hp");
        hpBox?.classList.add(res.delta > 0 ? "ab-flash-up" : "ab-flash-dn");
        setTimeout(() => hpBox?.classList.remove("ab-flash-up", "ab-flash-dn"), 500);
      }
      if (!instant && res.delta < 0) shakeTable(res.delta <= -8000 ? "lg" : "sm");
      const setSeat = (k, pct, val) => {
        const f = container.querySelector(`.ab-seat-fill[data-seat="${k}"]`); if (f) f.style.width = `${pct}%`;
        const n = container.querySelector(`.ab-seat-num[data-seat="${k}"]`); if (n) n.textContent = val.toLocaleString();
      };
      setSeat(0, youPct(), match.hp);
      setSeat(1, oppPct(0), match.oppHp[0]); setSeat(2, oppPct(1), match.oppHp[1]); setSeat(3, oppPct(2), match.oppHp[2]);
      // 師匠の局中相槌（優先度順に1イベントだけ）。終端イベント(トビ等)は showResult 側で拾う。
      if (!res.finished || res.result === "clear") {
        if (win && h.han >= 5) maybeQuip("bigWin");
        else if (res.delta <= -5000) maybeQuip("bigLoss");
        else if (!quipState.pinchDone && match.hp > 0 && match.hp / session.hpMax <= 0.25) maybeQuip("pinch");
        else if (res.edge === "win" && res.revealed && res.tookRound) maybeQuip("readWin");
      }
    } });
    // 余韻（この no-op が走り切ったらクローズ）。
    steps.push({ at: t + 1000, run() {} });

    playSteps(steps, () => {
      card.className = "ab-result";
      beat?.classList.remove("is-show");
      container.querySelectorAll(".ab-seat").forEach((s) => s.classList.remove("is-winner"));
      if (res.finished) { showResult(); return; }
      refreshRoundIndicators(); // 局表示＋自分のフレーバー手牌を次局へ
      updateHint();
      busy = false;
      setCmdsDisabled(false);
    });
  }

  function showResult() {
    if (match.result === "down") {
      // KO 演出（飛びの一文字ドン）→ 師匠の相槌 → リザルト。KO中に切り上げ済みなら何もしない。
      playKo("飛", "ab-ko-lose", () => {
        if (exiting) return;
        maybeQuip("tobi");
        overlay(`
          <div class="ab-res-ttl ab-res-down">飛び！</div>
          <p class="ab-res-sub">点棒が尽きた。ここまでだ。</p>
          <button type="button" class="primary ab-res-btn" data-act="exit">師弟ホームへ</button>
        `, { exit: doExit });
      });
      return;
    }
    const place = finalPlacement(match);
    session.wins += place <= 2 ? 1 : 0;
    const bust = match.result === "bust_win"; // 相手を飛ばした
    const last = session.matchNo >= maxMatches; // 雀荘の連戦数を打ち切ったら完走
    // レア客撃破（2着以内）: ボーナスは雀荘リザルト（visitParlor）で精算。悔し台詞は最下位扱いで引く。
    const rareBeat = !!(rare && place <= 2);
    if (rareBeat) session.rareWins += 1;
    const rareLine = rareBeat ? pickVoiceLine(rare.char.id, "matchEnd", { rankIndex: 3, numPlayers: 4 }) : null;
    const tail = last
      ? `<button type="button" class="primary ab-res-btn" data-act="stop">${esc(completeLabel)}</button>`
      : `<div class="ab-res-row">
           <button type="button" class="primary ab-res-btn" data-act="next">もう 1 試合</button>
           <button type="button" class="ghost-back ab-res-btn" data-act="stop">やめる（撤退）</button>
         </div>
         <p class="ab-res-note">※ 撤退すると「勝ち抜き」扱いになりません</p>`;
    const showFinal = () => {
      if (exiting) return; // KO演出中に切り上げ済みなら出さない
      if (bust) maybeQuip("bustWin");
      else if (last) maybeQuip("complete");
      overlay(`
        <div class="ab-res-ttl">${bust ? "トビ終了！" : last ? `完走（全 ${maxMatches} 戦）` : `第 ${session.matchNo} 試合 終了`}</div>
        ${bust ? `<p class="ab-res-sub">相手を飛ばした！</p>` : ""}
        <div class="ab-res-place ab-place-${place}">${place} 着</div>
        <p class="ab-res-sub">勝ち抜き ${session.wins}${Number.isFinite(maxMatches) ? ` / ${maxMatches}` : ""} ／ 残り HP ${match.hp.toLocaleString()}</p>
        ${rareBeat ? `<p class="ab-res-rare">★ 腕利き <b style="color:${safeColor(rare.char.color)}">${esc(rare.char.name)}</b> を下した！${rareLine ? `<br><span class="ab-res-rare-line">「${esc(rareLine)}」</span>` : ""}</p>` : ""}
        ${tail}
      `, {
        next: () => { session.hp = healAfterMatch(match.hp, session.hpMax, trait?.healMul || 1); session.matchNo += 1; startMatch(); },
        stop: () => (last ? doExit() : exitWithQuip("retreat")),
      });
    };
    if (bust) playKo("飛ばした！", "ab-ko-win", showFinal);
    else showFinal();
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
