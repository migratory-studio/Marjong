// 師弟ホーム (mentor-home) — major_update_specification.md §7.4 / §4.5 / Phase 2B。
//
// 師弟モードのハブ。和風ゲームUI（claude-design 由来）で、師匠立ち絵＋一言を主役に、
// 上部情報帯（章 / ソウル / 継承 / ○日目 / 設定）と、右の修行コマンド掲示板、
// 下部の弟子ステータス帯（点棒＝HP）＋次の大会CTAで構成する。
//
// コマンド種別（§4.5）:
//   - 軽い日常（休憩 等）… ハブ上モーダルで完結。画面遷移しない＝立ち絵の再デコード無し＆共在感。
//   - 出かける/対局（鍛錬・二人打ち・雀荘巡り・大会）… 画面遷移。
// 実データに無いものは段階開示で「準備中」表示（座学/鍛錬/二人打ち/雀荘巡り/大会、章名/○日目/継承）。
//
//   import { showMentorHome } from "./screens/mentorHomeScreen.js";
//   showMentorHome(container, { repository, onNavigate, onBack });
//     onNavigate("growth"|"ability-change"|"avatar"|"scenario"|"settings")
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { abilityDef } from "../data/abilityMaster.js";
import { activeAvatar, avatarParams6 } from "../progression/avatarFactory.js";
import { rest, trainParam, TRAIN_TUNING, ensureDay, dayInfo, CONDITIONS, ACTIONS_PER_DAY, parlorState, setMentorMemory } from "../progression/progressionService.js";
import { pickMentorGreeting, pickRestTalk, pickMentorPraise } from "../data/mentorVoiceMaster.js";
import { PARAM_LABELS } from "../autobattle/autoBattle.js";
import { statViews, diffRankUps, rankFill, RANK_COLORS } from "../autobattle/statSystem.js";
import { buildUnlockContext, evaluateUnlock } from "../scenario/unlockEvaluator.js";
import { isScenarioRead } from "../progression/scenarioService.js";
import { scenariosForMentor } from "./scenarioListScreen.js";
import { isDebugMode } from "../app/debug.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

// 師匠スキル Lv は仕様の到達基準 Lv5（§10.5「師匠の初期スキル Lv = 5」）。
const MENTOR_SKILL_LEVEL = 5;
// role → 称号（数値でない肩書き。絆とは無関係のフレーバー）。
const MENTOR_TITLE = {
  attacker: "攻めの達人", defender: "守りの達人", defense: "守りの達人",
  gambler: "博打の打ち手", balanced: "型破りの師範", support: "導きの師",
};
// 「今日の様子」プール（非数値の質的表現）。日替わりで安定させる。
const MENTOR_MOODS = ["上機嫌", "穏やか", "いつも通り", "少し眠そう", "鋭い目つき", "上々"];
// 1日3行動を朝→昼→夜に対応づけて時間表示する。
const TIME_OF_DAY = ["朝", "昼", "夜"];
// 訓練コマンドの師匠の一言。
const TRAIN_LINE = {
  study: "机に向かう時間も実力のうちだ。", drill: "さあ、みっちり鍛えるぞ。",
  duo: "一局、付き合え。…手は抜かんぞ。", parlor: "外の卓は刺激が多い。気をつけてな。",
};

// HTML へ差し込む動的値の最小エスケープ（マイキャラ名などユーザー入力対策）。
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// 師匠の一言（その日の行動状況に応じて1つ）。Phase 3 のシナリオが入るまでの軽い会話。
function mentorLine(actionsLeft) {
  if (actionsLeft >= ACTIONS_PER_DAY) return "今日はどうする？ まずは一息つくか、腕を磨くか。";
  if (actionsLeft <= 0) return "今日はよく動いた。あとはゆっくり休め。";
  return "その調子だ。次はどうする？";
}

// ハブ上に重ねる再利用モーダル。スクリム/✕/Esc で閉じる。onClose は閉じる直前に呼ぶ。
// 戻り値の card に内容を結線し、close() で明示的に閉じられる。
function openModal(container, innerHTML, onClose) {
  const ov = elt("div", "mhx-modal");
  ov.innerHTML =
    `<div class="mhx-modal-scrim"></div>` +
    `<div class="mhx-modal-card" role="dialog" aria-modal="true">${innerHTML}` +
    `<button type="button" class="mhx-modal-x" aria-label="閉じる">✕</button></div>`;
  container.appendChild(ov);
  let closed = false;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener("keydown", onKey);
    onClose?.();
    ov.classList.remove("is-open");
    setTimeout(() => ov.remove(), 180);
  }
  document.addEventListener("keydown", onKey);
  ov.querySelector(".mhx-modal-scrim").addEventListener("click", close);
  ov.querySelector(".mhx-modal-x").addEventListener("click", close);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  return { card: ov.querySelector(".mhx-modal-card"), close };
}

export async function showMentorHome(container, { repository, onNavigate, onBack, flash = null, audio = null } = {}) {
  let profile = await repository.loadProfile();
  const avatar = activeAvatar(profile);
  container.innerHTML = "";
  container.classList.add("mh2");
  container.classList.remove("menu-screen", "mentor-screen");

  if (!avatar) {
    container.appendChild(elt("p", "lead", { textContent: "まだマイキャラがいません。" }));
    const back = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
    return;
  }

  const mentor = charById(avatar.mentorCharacterId);
  const tmpl = skillTemplateById(avatar.skillTemplateId);
  const debug = isDebugMode();
  const refresh = () => showMentorHome(container, { repository, onNavigate, onBack });

  // ---- 日次（1日3行動・日替わり調子）----
  const ds = ensureDay(profile);
  let showBanner = false;
  let daySummary = null;
  if (ds.started) {
    profile = ds.profile;
    // 前日の手応えサマリを組み立てる（行動ログ＋伸び＋ランクアップ＋ソウル差分）。
    if (ds.prevStartParams6 && (ds.prevLog?.length || 0) > 0) {
      const cur = avatarParams6(avatar); // ensureDay は params を変えない＝前日終了時の値
      const prev = ds.prevStartParams6;
      const gains = {};
      let total = 0;
      for (const k of Object.keys(cur)) { const d2 = (cur[k] || 0) - (prev[k] || 0); if (d2 > 0) { gains[k] = d2; total += d2; } }
      daySummary = {
        day: (profile.dayCount ?? 1) - 1,
        log: ds.prevLog || [],
        gains, total,
        rankUps: diffRankUps(prev, cur),
        soul: (profile.wallet?.soul ?? 0) - (ds.prevStartSoul ?? (profile.wallet?.soul ?? 0)),
      };
    }
    await repository.saveProfile(profile);
    showBanner = true;
  }
  const di = dayInfo(profile);
  const cond = CONDITIONS[di.condition];          // 弟子（あなた）の調子
  const mentorCond = CONDITIONS[di.mentorCondition]; // 師匠の調子
  const actionsLeft = di.actionsLeft;
  const timeLabel = TIME_OF_DAY[Math.min(di.actionsUsed, TIME_OF_DAY.length - 1)];

  // 師匠の一言を状況連動で選ぶ（調子・時間帯・絆・直近結果・前回の2択を参照）。
  const mem = profile.mentorMemory || {};
  const recentOutcome = (mem.lastOutcomeDay != null && (di.day - mem.lastOutcomeDay) <= 1) ? mem.lastOutcome : null;
  const greetCtx = {
    condTier: cond.tone,
    time: ["asa", "hiru", "yoru"][Math.min(di.actionsUsed, 2)],
    bondLevel: avatar.bondLevel ?? 1,
    lastOutcome: (recentOutcome === "daiseikou" || recentOutcome === "shippai") ? recentOutcome : null,
    afterChoice: mem.lastChoice || null,
  };
  const greetLine = pickMentorGreeting(avatar.mentorCharacterId, greetCtx) || mentorLine(actionsLeft);

  // ---- 表示値の解決（未実装ぶんは仮値）----
  const soul = profile.wallet?.soul ?? 0;
  const meta = profile.wallet?.meta ?? 0;            // 継承（メタ通貨・未実装→0）
  const day = di.day;                                 // ○日目
  const chapter = "修行の日々";                       // TODO §4.5 mentorCampaignMaster で章名を差す
  const hpMax = avatar.avatarHpMax || 1;
  const hpCur = Math.max(0, Math.min(avatar.avatarHpCurrent ?? hpMax, hpMax));
  const hpPct = Math.round((hpCur / hpMax) * 100);

  // 師匠フレーバー（「今日の様子」＝師匠の調子）
  const mentorTitle = MENTOR_TITLE[mentor?.role] || "師範";
  const mood = mentorCond.label;
  const mAbility = mentor?.abilities?.[0]?.abilityId ? abilityDef(mentor.abilities[0].abilityId) : null;
  const mAbilityName = mAbility?.name || "";
  const mAbilityDesc = mAbility?.desc || mentor?.bio || "";

  // ---- シナリオ未読件数（バッジ用）----
  const scList = scenariosForMentor(avatar.mentorCharacterId);
  const ctx = buildUnlockContext(profile);
  const unread = scList.filter(
    (s) => (debug || evaluateUnlock(s, ctx).unlocked) && !isScenarioRead(profile, s.scenarioId)
  ).length;
  const hasScenario = scList.length > 0;

  const portraitSrc = mentor?.assets?.portrait || "";
  const mentorIcon = mentor?.assets?.icon || portraitSrc;
  // 弟子（マイキャラ）のアイコンはプリセットから引く（師匠の立ち絵を流用しない）。
  const discipleIcon = presetById(avatar.presetIds?.icon)?.assetPath || "";

  // ---- レイアウト（和風ゲームUI）----
  container.innerHTML = `
    <div class="mhx-bg">
      <div class="mhx-bg-base"></div>
      <div class="mhx-shoji"></div>
      <div class="mhx-floor"></div>
      <div class="mhx-crest"></div>
      <div class="mhx-lantern mhx-l1"><div class="mhx-cord"></div><div class="mhx-lbody"></div></div>
      <div class="mhx-lantern mhx-l2"><div class="mhx-cord"></div><div class="mhx-lbody"></div></div>
    </div>

    <div class="mhx-topbar">
      <div class="mhx-chapter">
        <button type="button" class="mhx-back" title="ホームへ戻る">‹</button>
        <div class="mhx-seal">章</div>
        <div class="mhx-cname">〔 <b>${esc(chapter)}</b> 〕</div>
      </div>
      <div class="mhx-topright">
        <div class="mhx-cur mhx-soul"><div class="mhx-coin">魂</div><div class="mhx-val">${esc(soul.toLocaleString())}<small> ソウル</small></div></div>
        <div class="mhx-cur mhx-kei"><div class="mhx-coin">継</div><div class="mhx-val">${esc(meta)}<small> 継承</small></div></div>
        <div class="mhx-divider"></div>
        <div class="mhx-day"><b>${day == null ? "—" : esc(day)}</b> 日目<span class="mhx-time">${esc(timeLabel)}</span></div>
        <div class="mhx-acts" title="1日3回まで行動できる">行動 <b>${actionsLeft}</b><small>/${ACTIONS_PER_DAY}</small></div>
        <div class="mhx-divider"></div>
        <button type="button" class="mhx-gear" title="設定">⚙</button>
      </div>
    </div>

    <div class="mhx-scene">
      <div class="mhx-master${portraitSrc ? " has-img" : ""}">
        <div class="mhx-floorglow"></div>
        ${portraitSrc ? `<img class="mhx-master-img" alt="${esc(mentor?.name || "")}" src="${esc(portraitSrc)}">` : ""}
      </div>
      <div class="mhx-nameplate" role="button" tabindex="0" title="師匠の詳細">
        <span class="mhx-np-ttl">師匠</span>
        <div class="mhx-np-main">
          <span class="mhx-np-nm">${esc(mentor?.name || "師匠")}${mentor?.reading ? `<small>${esc(mentor.reading)}</small>` : ""}</span>
          <div class="mhx-np-sub">
            <span class="mhx-np-title">${esc(mentorTitle)}</span>
            <span class="mhx-np-lv">技 Lv${MENTOR_SKILL_LEVEL}</span>
            <span class="mhx-np-mood mhx-cond tone-${mentorCond.tone}">今日：${esc(mood)}</span>
          </div>
        </div>
        ${mAbilityName ? `<div class="mhx-np-tip"><div class="mhx-np-tip-h">能力</div><div class="mhx-np-tip-n">${esc(mAbilityName)}</div><div class="mhx-np-tip-d">${esc(mAbilityDesc)}</div></div>` : ""}
      </div>
      <div class="mhx-bubble">
        <div class="mhx-q">${esc(greetLine)}</div>
      </div>
    </div>

    <div class="mhx-menu">
      <div class="mhx-menu-head"><span class="mhx-line"></span><span class="mhx-mt">修 行 を 選 ぶ</span><span class="mhx-line mhx-r"></span></div>

      <div class="mhx-group">
        <div class="mhx-cat">日常</div>
        <div class="mhx-tags">
          ${tag("休 憩", "点棒を回復する", "rest", false)}
          ${tagTrain("座 学", "読み・守備を磨く", "study")}
        </div>
      </div>

      <div class="mhx-group mhx-jissen">
        <div class="mhx-cat">実戦</div>
        <div class="mhx-tags">
          ${tagTrain("鍛 錬", "火力・速度を鍛える", "drill")}
          <div class="mhx-tag" data-duo="1" role="button" tabindex="0"><span class="mhx-cmd">二人打ち</span><span class="mhx-desc">師匠とタイマン</span></div>
          <div class="mhx-tag" data-parlor="1" role="button" tabindex="0"><span class="mhx-cmd">雀荘巡り</span><span class="mhx-desc">打ちに出かける</span></div>
        </div>
      </div>

      <div class="mhx-group">
        <div class="mhx-cat">育成</div>
        <div class="mhx-tags">
          ${tag("育 成", "才を伸ばす", "growth", false)}
          ${tag("能力変更", "型を変える", "ability-change", false)}
        </div>
      </div>

      <div class="mhx-group">
        <div class="mhx-cat">物語</div>
        <div class="mhx-tags">
          ${tag("シ ナ リ オ", hasScenario ? (unread > 0 ? `未読 ${unread} 件` : "物語を読む") : "まだありません", "scenario", !hasScenario, unread > 0 ? unread : 0)}
        </div>
      </div>

      <div class="mhx-stats" role="button" tabindex="0" title="マイキャラの詳細を見る">
        <div class="mhx-stats-head"><span class="mhx-line"></span><span class="mhx-st-t">能 力 値</span><span class="mhx-line mhx-r"></span></div>
        <div class="mhx-stats-grid">
          ${statViews(avatarParams6(avatar)).map((s) => `
            <div class="mhx-stat" title="${esc(s.label)}（${s.passive ? "パッシブ" : esc(s.command)}）｜${esc(s.affects)}">
              <span class="mhx-stat-rank rank-${s.rank}">${s.rank}</span>
              <span class="mhx-stat-lab">${esc(s.label)}</span>
              <span class="mhx-stat-val">${s.value}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <div class="mhx-status" role="button" tabindex="0" title="マイキャラの詳細">
      <div class="mhx-port">${discipleIcon ? `<img class="mhx-port-img" alt="" src="${esc(discipleIcon)}">` : "弟子"}</div>
      <div class="mhx-who">
        <div class="mhx-dn">${esc(avatar.name)}${tmpl ? `<small>${esc(tmpl.name)}</small>` : ""}</div>
        <div class="mhx-lv"><span class="mhx-lvtag">LV</span><b>${esc(avatar.avatarLevel)}</b><span class="mhx-cond tone-${cond.tone}" title="今日の調子">${esc(cond.label)}</span></div>
      </div>
      <div class="mhx-hp">
        <div class="mhx-hp-top">
          <div class="mhx-lab">点棒 <b>＝ HP</b></div>
          <div class="mhx-num">${esc(hpCur.toLocaleString())}<small> / ${esc(hpMax.toLocaleString())}</small></div>
        </div>
        <div class="mhx-bar"><div class="mhx-fill" style="width:${hpPct}%"></div></div>
      </div>
    </div>

    <button type="button" class="mhx-next" data-tournament="1" title="初級大会に挑戦">
      <div class="mhx-badge"><span class="mhx-b1">CUP</span><span class="mhx-b2">杯</span></div>
      <div class="mhx-txt"><div class="mhx-s">次 の 大 会 へ</div><div class="mhx-m">宝への道</div></div>
      <div class="mhx-na">挑戦する</div>
    </button>

    <div class="mhx-corner mhx-tl"></div>
    <div class="mhx-corner mhx-tr"></div>
    <div class="mhx-corner mhx-bl"></div>
    <div class="mhx-corner mhx-br"></div>
  `;

  // コマンド札のHTMLを返す。target=null か off=true で無効札（クリック不可）。
  // 第5引数 badge>0 で右上に未読バッジ。
  function tag(cmd, desc, target, off, badge = 0) {
    const cls = "mhx-tag" + (off ? " mhx-tag-off" : "");
    const data = !off && target ? ` data-nav="${target}"` : "";
    const b = badge > 0 ? `<span class="mhx-badge2">${badge}</span>` : "";
    return `<div class="${cls}"${data} role="button" tabindex="${off ? -1 : 0}">${b}<span class="mhx-cmd">${cmd}</span><span class="mhx-desc">${esc(desc)}</span></div>`;
  }
  // 訓練コマンド札（6パラメータを伸ばす活動）。data-train で識別。
  function tagTrain(cmd, desc, key) {
    return `<div class="mhx-tag" data-train="${key}" role="button" tabindex="0"><span class="mhx-cmd">${cmd}</span><span class="mhx-desc">${esc(desc)}</span></div>`;
  }

  // ---- 能力値上昇演出（FE 風：ランク内ゲージを満たし、満タンでランクアップ→次ランクのゲージへ）----
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  // res.gains/before/after から行データを作る。
  function gainRowsFrom(res) {
    return Object.entries(res.gains || {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, label: PARAM_LABELS[k] || k, before: res.before?.[k] ?? 0, after: res.after?.[k] ?? 0, gain: v }));
  }
  // 行の初期 HTML（before 状態）。data-before/after を持たせアニメで読む。
  function gainGaugesHtml(rows) {
    return rows.map((r) => {
      const f = rankFill(r.before);
      return `<div class="mhx-pg-row" data-before="${r.before}" data-after="${r.after}">
        <span class="mhx-pg-lab">${esc(r.label)}</span>
        <span class="mhx-pg-rank rank-${f.rank}">${f.rank}</span>
        <div class="mhx-pg-bar"><div class="mhx-pg-fill" style="width:${f.pct}%;background:${f.color}"></div></div>
        <span class="mhx-pg-now">${r.before}</span>
        <span class="mhx-pg-up">+${r.gain}</span>
      </div>`;
    }).join("");
  }
  async function animateGainRow(row) {
    const fill = row.querySelector(".mhx-pg-fill");
    const rankEl = row.querySelector(".mhx-pg-rank");
    const nowEl = row.querySelector(".mhx-pg-now");
    row.querySelector(".mhx-pg-up")?.classList.add("is-pop");
    let v = Number(row.getAttribute("data-before"));
    const to = Number(row.getAttribute("data-after"));
    const setRank = (f) => { rankEl.textContent = f.rank; rankEl.className = "mhx-pg-rank rank-" + f.rank; };
    let step = 0;
    while (v < to) {
      const fCur = rankFill(v);
      const fNext = rankFill(v + 1);
      if (fNext.rank !== fCur.rank) {
        // 今のランクのゲージを MAX まで満たす → ランクアップ → 次ランクのゲージを 0 から。
        fill.style.width = "100%";
        audio?.playPip?.(2300, 0.55);
        await sleepMs(220);
        row.classList.add("is-rankup");
        v += 1; nowEl.textContent = String(v);
        fill.style.transition = "none"; fill.style.width = "0%"; fill.style.background = fNext.color;
        setRank(fNext);
        void fill.offsetWidth; // reflow
        fill.style.transition = "";
        await sleepMs(240);
        row.classList.remove("is-rankup");
        fill.style.width = `${fNext.pct}%`;
        await sleepMs(140);
      } else {
        v += 1; step += 1;
        fill.style.width = `${fNext.pct}%`;
        nowEl.textContent = String(v);
        audio?.playPip?.(1500 + step * 90, 0.4);
        await sleepMs(110);
      }
    }
    audio?.playPip?.(2300, 0.55);
    await sleepMs(120);
  }
  async function animateGainGauges(scope) {
    for (const row of scope.querySelectorAll(".mhx-pg-row")) await animateGainRow(row);
  }

  // 大成功の専用フラッシュ（金の閃光＋「大成功」ズーム）。card に重ねて1秒で消える。
  function fireDaiseikouFlash(card) {
    const fx = elt("div", "mhx-daiseikou-fx");
    fx.innerHTML = `<div class="mhx-dk-burst"></div><div class="mhx-dk-rays"></div><div class="mhx-dk-word">大成功</div>`;
    card.appendChild(fx);
    audio?.playPip?.(2600, 0.6);
    setTimeout(() => audio?.playPip?.(3200, 0.5), 90);
    setTimeout(() => fx.remove(), 1200);
  }

  // ---- 休憩モーダル（ハブ上で完結）----
  function openRestModal() {
    const available = actionsLeft > 0;
    const curPct = Math.round((hpCur / hpMax) * 100);
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">休 憩</span><span class="mhx-md-ttl">${esc(mentor?.name || "師匠")}</span></div>
      </div>
      <p class="mhx-md-line">${available ? "ゆっくり休め。明日に備えるのも実力のうちだ。" : "今日はもう動けない。また明日な。"}</p>
      <div class="mhx-md-hp">
        <div class="mhx-md-hp-top"><span>点棒 ＝ HP</span><span class="mhx-md-hp-num">${hpCur.toLocaleString()} / ${hpMax.toLocaleString()}</span></div>
        <div class="mhx-bar"><div class="mhx-fill mhx-md-fill" style="width:${curPct}%"></div></div>
      </div>
      <p class="mhx-md-result" hidden></p>
      <div class="mhx-rt" hidden></div>
      <button type="button" class="mhx-md-btn"${available ? "" : " disabled"}>${available ? "休憩する（1行動）" : "今日はもう動けない"}</button>
    `;
    let didRest = false;
    const { card } = openModal(container, html, () => { if (didRest) refresh(); });
    const btn = card.querySelector(".mhx-md-btn");
    btn?.addEventListener("click", async () => {
      if (didRest || actionsLeft <= 0) return;
      try {
        const res = rest(profile);
        await repository.saveProfile(res.profile);
        didRest = true;
        const av2 = activeAvatar(res.profile);
        const np = Math.round((av2.avatarHpCurrent / av2.avatarHpMax) * 100);
        card.querySelector(".mhx-md-fill").style.width = `${np}%`;
        card.querySelector(".mhx-md-hp-num").textContent =
          `${av2.avatarHpCurrent.toLocaleString()} / ${av2.avatarHpMax.toLocaleString()}`;
        // 絆は数値で見せない（CLAUDE.md ピラー1）。Lv 上昇は質的な一言で滲ませる。
        const parts = [];
        if (res.healed > 0) parts.push(`HP +${res.healed.toLocaleString()} 回復`);
        parts.push(`ソウル +${res.soul}`);
        if (res.conditionUp) parts.push("調子が上向いた");
        if (res.bondUp) parts.push("…師匠との距離が、少し縮まった気がする。");
        const r = card.querySelector(".mhx-md-result");
        r.textContent = parts.join("　／　"); r.hidden = false;
        btn.disabled = true; btn.textContent = "ゆっくり休んだ";
        // 休憩中の2択コミュ（双方向）。選ぶと師匠が返し、その選択を覚える。
        const talk = pickRestTalk(avatar.mentorCharacterId, { bondLevel: avatar.bondLevel ?? 1, condTier: cond.tone });
        if (talk) {
          const rt = card.querySelector(".mhx-rt");
          rt.innerHTML = `
            <p class="mhx-rt-prompt">${esc(talk.prompt)}</p>
            <div class="mhx-rt-choices">${talk.choices.map((c, i) => `<button type="button" class="mhx-rt-choice" data-i="${i}">${esc(c.label)}</button>`).join("")}</div>
            <p class="mhx-rt-reply" hidden></p>`;
          rt.hidden = false;
          let picked = false;
          rt.querySelectorAll(".mhx-rt-choice").forEach((b) => {
            b.addEventListener("click", async () => {
              if (picked) return; picked = true;
              const ch = talk.choices[Number(b.getAttribute("data-i"))];
              const cur = await repository.loadProfile();
              await repository.saveProfile(setMentorMemory(cur, { lastChoice: ch.memory }));
              const reply = rt.querySelector(".mhx-rt-reply");
              reply.textContent = ch.reply; reply.hidden = false;
              rt.querySelectorAll(".mhx-rt-choice").forEach((x) => { x.disabled = true; });
              b.classList.add("is-picked");
            });
          });
        }
      } catch (e) {
        const r = card.querySelector(".mhx-md-result");
        r.textContent = e?.message || "休憩に失敗しました。"; r.hidden = false;
      }
    });
  }

  // ---- 訓練モーダル（6パラメータを伸ばす）----
  function openTrainModal(key) {
    const t = TRAIN_TUNING[key];
    if (!t) return;
    const subLabel = t.sub === "random" ? "ランダム" : PARAM_LABELS[t.sub];
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">修行</span><span class="mhx-md-ttl">${esc(t.label)}</span></div>
      </div>
      <p class="mhx-md-line">${esc(TRAIN_LINE[key] || "")}</p>
      <p class="mhx-md-prof">伸びる：<b>${esc(PARAM_LABELS[t.main])}</b>（主）／ ${esc(subLabel)}（副）　・　消費 HP ${t.hp.toLocaleString()}${t.soul ? `　・　ソウル +${t.soul}` : ""}<br><small>※伸びは当日の調子で変動（メンタルが高いほど安定し、大成功も出やすい）</small></p>
      <p class="mhx-md-result" hidden></p>
      <div class="mhx-pg-list mhx-train-gain" hidden></div>
      <button type="button" class="mhx-md-btn">${esc(t.label)}する</button>
    `;
    let done = false;
    const { card } = openModal(container, html, () => { if (done) refresh(); });
    const btn = card.querySelector(".mhx-md-btn");
    btn?.addEventListener("click", async () => {
      if (done) return;
      try {
        const res = trainParam(profile, key);
        // 大成功／失敗は師匠が覚えて、次の一言に反映する。
        let saved = res.profile;
        if (res.outcome === "daiseikou" || res.outcome === "shippai") {
          saved = setMentorMemory(saved, { lastOutcome: res.outcome, lastOutcomeDay: dayInfo(saved).day });
        }
        await repository.saveProfile(saved);
        done = true;
        const parts = [];
        if (res.soul) parts.push(`ソウル +${res.soul}`);
        parts.push(`HP −${res.hpCost.toLocaleString()}`);
        if (res.conditionDelta < 0) parts.push("調子が下がった…");
        else if (res.conditionDelta > 0) parts.push("調子が上がった！");
        // 調子（大成功/成功/無難/失敗）を見出しに、師匠の一言を反応として返す。
        const badge = `<span class="mhx-md-badge tone-${res.outcomeTone}">${esc(res.outcomeLabel)}${res.outcomeTone === "great" ? "！" : ""}</span>`;
        const line = card.querySelector(".mhx-md-line");
        // 大成功は専用フラッシュ＋師匠の“素出し”ボイス。それ以外は通常の調子コメント。
        if (res.outcome === "daiseikou") {
          const praise = pickMentorPraise(avatar.mentorCharacterId, { bondLevel: avatar.bondLevel ?? 1 });
          if (line) line.textContent = praise || res.outcomeLine || "";
          fireDaiseikouFlash(card);
        } else if (line && res.outcomeLine) {
          line.textContent = res.outcomeLine;
        }
        card.querySelector(".mhx-md-prof")?.setAttribute("hidden", "");
        const r = card.querySelector(".mhx-md-result");
        r.innerHTML = `${badge}　${esc(parts.join("　/　"))}`; r.hidden = false;
        // 能力値上昇（FE 風ゲージ＋ピピピッ）。
        const gw = card.querySelector(".mhx-train-gain");
        gw.innerHTML = gainGaugesHtml(gainRowsFrom(res)); gw.hidden = false;
        animateGainGauges(gw);
        btn.disabled = true; btn.textContent = "完了";
      } catch (e) {
        const r = card.querySelector(".mhx-md-result");
        r.textContent = e?.message || "失敗しました。"; r.hidden = false;
      }
    });
  }

  // ---- 二人打ち＝師匠タイマン（オート/本気を選ぶ・§4.6.9 B2）----
  function openDuoModal() {
    const canGo = actionsLeft > 0;
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">二人打ち</span><span class="mhx-md-ttl">師匠とタイマン</span></div>
      </div>
      <p class="mhx-md-line">${canGo ? esc(mentor?.name || "師匠") + "「一局、付き合え。…手は抜かんぞ」" : "今日はもう動けない。また明日だ。"}</p>
      <p class="mhx-md-prof"><small>二人麻雀（東南戦）。メンタル・読みが伸びる。<b>負けても、どれだけ食らいつけたかで伸びが変わる</b>。</small></p>
      ${canGo ? `<div class="mhx-duo-btns">
        <button type="button" class="mhx-md-btn mhx-duo-auto">オートで打つ<small>AI にまかせて見る</small></button>
        <button type="button" class="mhx-md-btn mhx-duo-honest">本気で打つ<small>自分の手で（手動）</small></button>
      </div>` : ""}
    `;
    const { card, close } = openModal(container, html);
    card.querySelector(".mhx-duo-auto")?.addEventListener("click", () => { close(); onNavigate?.("duo-match", { auto: true }); });
    card.querySelector(".mhx-duo-honest")?.addEventListener("click", () => { close(); onNavigate?.("duo-match", { auto: false }); });
  }

  // ---- 雀荘巡りモーダル（その日の候補から1つ選ぶ・§4.6.8）----
  function openParlorModal() {
    const st = parlorState(profile);
    const canGo = actionsLeft > 0;
    const cards = st.candidates.map((c) => {
      const off = c.done || !canGo;
      const badge = c.tournament ? `<span class="mhx-pl-badge">大会中</span>` : "";
      return `
        <button type="button" class="mhx-pl${off ? " is-off" : ""}" data-idx="${c.index}"${off ? " disabled" : ""}>
          ${badge}
          <span class="mhx-cond tone-${c.tone} mhx-pl-tier">${esc(c.label)}</span>
          <span class="mhx-pl-info"><b>${c.matches}</b> 戦${c.done ? "　…挑戦済み" : ""}</span>
          <span class="mhx-pl-rew">勝ち抜き毎 +${c.soulPerWin} ソウル</span>
        </button>`;
    }).join("");
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">雀荘巡り</span><span class="mhx-md-ttl">今日の卓</span></div>
      </div>
      <p class="mhx-md-line">${canGo ? "どこの卓で腕を試す？ 1 軒選べ。" : "今日はもう動けない。また明日だ。"}</p>
      <div class="mhx-pl-list">${cards}</div>
      <p class="mhx-md-prof"><small>※ 挑戦すると 1 行動を消費。卓は日替わりで変わる（同じ日は 1 軒のみ）。</small></p>
    `;
    const { card, close } = openModal(container, html);
    card.querySelectorAll(".mhx-pl:not(.is-off)").forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.getAttribute("data-idx"));
        close();
        onNavigate?.("parlor", { index: idx });
      });
    });
  }

  // ---- 師匠詳細モーダル ----
  function openMentorModal() {
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon mhx-md-icon-lg">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title">
          <span class="mhx-md-by">師匠</span>
          <span class="mhx-md-ttl">${esc(mentor?.name || "師匠")}${mentor?.reading ? `<small>${esc(mentor.reading)}</small>` : ""}</span>
          <div class="mhx-md-chips">
            <span class="mhx-chip">${esc(mentorTitle)}</span>
            <span class="mhx-chip mhx-chip-lv">技 Lv${MENTOR_SKILL_LEVEL}</span>
            <span class="mhx-chip mhx-chip-mood">今日 ${esc(mood)}</span>
          </div>
        </div>
      </div>
      ${mentor?.profile ? `<p class="mhx-md-prof">${esc(mentor.profile)}</p>` : ""}
      ${mAbilityName ? `<div class="mhx-md-abil"><div class="mhx-md-abil-h">能力</div><div class="mhx-md-abil-n">${esc(mAbilityName)}</div><div class="mhx-md-abil-d">${esc(mAbilityDesc)}</div></div>` : ""}
      <div class="mhx-md-haoh">覇道モードでは、ここに師匠の HP も並びます（二人三脚）。</div>
    `;
    openModal(container, html);
  }

  // ---- 日の始まりバナー（〇日目＋師匠・弟子の調子）----
  function openDayBanner() {
    const html = `
      <div class="mhx-db">
        <div class="mhx-db-day"><b>${esc(day)}</b> 日目</div>
        <div class="mhx-db-sub">今日の調子</div>
        <div class="mhx-db-conds">
          <div class="mhx-db-c">
            <span class="mhx-db-ic">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</span>
            <span class="mhx-db-who">師匠</span>
            <span class="mhx-cond tone-${mentorCond.tone}">${esc(mentorCond.label)}</span>
          </div>
          <div class="mhx-db-c">
            <span class="mhx-db-ic">${discipleIcon ? `<img src="${esc(discipleIcon)}" alt="">` : ""}</span>
            <span class="mhx-db-who">あなた</span>
            <span class="mhx-cond tone-${cond.tone}">${esc(cond.label)}</span>
          </div>
        </div>
        <p class="mhx-db-note">1日 ${ACTIONS_PER_DAY} 回まで行動できる。調子は育成の伸びに効く（失敗で下がる）。</p>
        <button type="button" class="mhx-md-btn mhx-db-btn">今日も励む</button>
      </div>`;
    const { card, close } = openModal(container, html);
    card.querySelector(".mhx-db-btn")?.addEventListener("click", close);
  }

  // ---- 今日の手応えサマリ（一日の終わり＝新しい日の頭に、前日を振り返る）----
  function openDaySummaryModal(s, onDone) {
    const ACT = { train: "修行", rest: "休憩", parlor: "雀荘巡り" };
    const OUT = { daiseikou: "大成功", seikou: "成功", bunan: "無難", shippai: "失敗" };
    const logHtml = (s.log || []).map((e) => {
      if (e.type === "train") return `<li><span class="mhx-ds-act">${esc(e.label || "修行")}</span><span class="mhx-ds-tag">${esc(OUT[e.outcome] || "")}</span></li>`;
      if (e.type === "duo") return `<li><span class="mhx-ds-act">二人打ち（本気）</span><span class="mhx-ds-tag">${e.won ? "勝利" : "惜敗"}</span></li>`;
      if (e.type === "parlor") return `<li><span class="mhx-ds-act">雀荘巡り（${esc(e.label || "")}）</span><span class="mhx-ds-tag">勝ち抜き ${e.wins ?? 0}</span></li>`;
      return `<li><span class="mhx-ds-act">休憩</span></li>`;
    }).join("");
    const gainStr = Object.entries(s.gains || {}).map(([k, v]) => `${esc(PARAM_LABELS[k] || k)} +${v}`).join("　/　");
    const rankStr = (s.rankUps || []).map((u) => `<span class="mhx-ds-rk"><b>${esc(u.label)}</b> <span class="mhx-stat-rank rank-${u.from}">${u.from}</span>▶<span class="mhx-stat-rank rank-${u.to}">${u.to}</span></span>`).join("　");
    const html = `
      <div class="mhx-ds">
        <div class="mhx-ds-ttl"><b>${esc(s.day)}</b> 日目 を終えて</div>
        <div class="mhx-ds-sub">今日の手応え</div>
        <ul class="mhx-ds-log">${logHtml || '<li><span class="mhx-ds-act">…静かな一日だった</span></li>'}</ul>
        <div class="mhx-ds-grid">
          <div class="mhx-ds-cell"><span class="mhx-ds-k">能力値</span><span class="mhx-ds-v">${gainStr ? esc(gainStr) : "変化なし"}${s.total ? `　<small>(計 +${s.total})</small>` : ""}</span></div>
          ${s.rankUps?.length ? `<div class="mhx-ds-cell"><span class="mhx-ds-k">ランクアップ</span><span class="mhx-ds-v">${rankStr}</span></div>` : ""}
          <div class="mhx-ds-cell"><span class="mhx-ds-k">ソウル</span><span class="mhx-ds-v">${s.soul >= 0 ? "+" : ""}${(s.soul || 0).toLocaleString()}</span></div>
        </div>
        <button type="button" class="mhx-md-btn mhx-ds-btn">次の日へ</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    card.querySelector(".mhx-ds-btn")?.addEventListener("click", close);
  }

  // ---- ランクアップ演出（1日の終わり→新しい日の頭に出す）----
  function openRankUpModal(ups, onDone) {
    const rows = ups.map((u) => `
      <div class="mhx-ru-row">
        <span class="mhx-ru-lab">${esc(u.label)}</span>
        <span class="mhx-stat-rank rank-${u.from}">${u.from}</span>
        <span class="mhx-ru-arrow">▶</span>
        <span class="mhx-stat-rank rank-${u.to} mhx-ru-to">${u.to}</span>
      </div>`).join("");
    const html = `
      <div class="mhx-ru">
        <div class="mhx-ru-ttl">RANK UP!</div>
        <div class="mhx-ru-sub">昨日の修行が実を結んだ。</div>
        <div class="mhx-ru-list">${rows}</div>
        <button type="button" class="mhx-md-btn mhx-ru-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    card.querySelector(".mhx-ru-btn")?.addEventListener("click", close);
  }

  // ---- 雀荘リザルト（能力値上昇演出つき・§4.6.8）----
  function openParlorResultModal(r, onDone) {
    const rows = gainRowsFrom(r);
    const tone = r.candidate?.tone || "ok";
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">雀荘 結果</div>
        <div class="mhx-pr-head">
          <span class="mhx-cond tone-${tone}">${esc(r.candidate?.label || "雀荘")}</span>
          <span class="mhx-pr-sum">${r.candidate?.matches ?? "—"} 戦 ／ 勝ち抜き <b>${r.wins ?? 0}</b></span>
        </div>
        <div class="mhx-pr-soul">獲得ソウル <b>+${r.soul ?? 0}</b></div>
        <div class="mhx-pr-sub">能力値が上がった！</div>
        <div class="mhx-pr-stats mhx-pg-list">${rows.length ? gainGaugesHtml(rows) : '<div class="mhx-pr-none">変化なし</div>'}</div>
        <button type="button" class="mhx-md-btn mhx-pr-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    animateGainGauges(card);
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }

  // ---- 本気対局リザルト（Phase 4A・能力値上昇演出を流用）----
  function openHonestResultModal(r, onDone) {
    const rows = gainRowsFrom(r);
    const place = (r.placement ?? 0) + 1;
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">本気対局 結果</div>
        <div class="mhx-pr-head">
          <span class="mhx-cond tone-${r.won ? "vgood" : "ok"}">${place} 着${r.won ? "・優勝！" : ""}</span>
        </div>
        <div class="mhx-pr-soul">獲得ソウル <b>+${r.soul ?? 0}</b></div>
        <div class="mhx-pr-sub">本気の一局が、力になった。</div>
        <div class="mhx-pr-stats mhx-pg-list">${rows.length ? gainGaugesHtml(rows) : '<div class="mhx-pr-none">変化なし</div>'}</div>
        <button type="button" class="mhx-md-btn mhx-pr-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    animateGainGauges(card);
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }

  // ---- 二人打ちタイマン リザルト（惜敗で伸び・能力値上昇演出を流用）----
  function openDuoResultModal(r, onDone) {
    const rows = gainRowsFrom(r);
    const head = r.won ? "勝利！" : (r.closeness >= 0.8 ? "惜敗——あと一歩" : "完敗…でも、まだ");
    const tone = r.won ? "vgood" : (r.closeness >= 0.8 ? "good" : "bad");
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">師匠との一局</div>
        <div class="mhx-pr-head"><span class="mhx-cond tone-${tone}">${esc(head)}</span><span class="mhx-pr-sum">残点 ${(r.finalPoints || 0).toLocaleString()}</span></div>
        ${r.soul ? `<div class="mhx-pr-soul">獲得ソウル <b>+${r.soul}</b></div>` : ""}
        <div class="mhx-pr-sub">${r.won ? "師匠を越えた一局。" : "食らいついた分が、力になった。"}</div>
        <div class="mhx-pr-stats mhx-pg-list">${rows.length ? gainGaugesHtml(rows) : '<div class="mhx-pr-none">変化なし</div>'}</div>
        <button type="button" class="mhx-md-btn mhx-pr-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    animateGainGauges(card);
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }

  // ---- 大会（M リーグ）最終結果＋クリア評価 ----
  function openLeagueResultModal(r, onDone) {
    const won = r.won;
    const place = (r.finalRank ?? 3) + 1;
    const rows = (r.standings || []).map((s, i) => `
      <div class="mhx-lg-row${s.isHuman ? " me" : ""}">
        <span class="mhx-lg-place ts-p${i + 1}">${i + 1}</span>
        <span class="mhx-lg-name">${esc(s.name)}${s.isHuman ? '<span class="ts-you">YOU</span>' : ""}</span>
        <span class="mhx-lg-pt">${s.pt > 0 ? "+" : ""}${s.pt}</span>
      </div>`).join("");
    const html = `
      <div class="mhx-pr mhx-lg">
        <div class="mhx-pr-ttl">${won ? "優勝！" : r.retreated ? "途中退場" : `最終 ${place} 位`}</div>
        <div class="mhx-pr-head"><span class="mhx-cond tone-${won ? "vgood" : place <= 2 ? "good" : "bad"}">${esc(r.name || "大会")}</span></div>
        <div class="mhx-lg-list">${rows}</div>
        <div class="mhx-tr-rank">評価 <b>${esc(r.rank || "満貫級")}</b></div>
        <div class="mhx-pr-soul">継承 <b>+${r.meta ?? 0}</b>　／　ソウル <b>+${r.soul ?? 0}</b></div>
        <p class="mhx-pr-sub">${won ? "宝への道が、また一歩ひらけた。" : "悔しさは、次の糧に。"}</p>
        <button type="button" class="mhx-md-btn mhx-pr-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    if (won) audio?.playPip?.(2600, 0.6);
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }
  // 出場ゲート不合格（大劣勢＝門前払い）。
  function openTournamentGateModal(g, onDone) {
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">門前払い</div>
        <div class="mhx-pr-head"><span class="mhx-cond tone-vbad">相手評価：${esc(g.tierLabel || "大劣勢")}</span></div>
        <p class="mhx-pr-sub">今のお前では、この卓には立てん。<br>もっと腕を磨いてから出直せ。</p>
        <button type="button" class="mhx-md-btn mhx-pr-btn">わかった</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }

  // 複数のモーダルを順番に出す（前のを閉じたら次へ）。
  function runModals(list) {
    const seq = list.filter(Boolean);
    const step = () => { const fn = seq.shift(); if (fn) fn(step); };
    step();
  }

  // ---- イベント結線 ----
  const fire = (t) => { if (t) onNavigate?.(t); };
  container.querySelectorAll(".mhx-tag[data-nav]").forEach((node) => {
    const t = node.getAttribute("data-nav");
    const handler = t === "rest" ? openRestModal : () => fire(t);
    node.addEventListener("click", handler);
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); } });
  });
  container.querySelectorAll(".mhx-tag[data-train]").forEach((node) => {
    const key = node.getAttribute("data-train");
    node.addEventListener("click", () => openTrainModal(key));
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTrainModal(key); } });
  });
  const parlorTile = container.querySelector(".mhx-tag[data-parlor]");
  parlorTile?.addEventListener("click", openParlorModal);
  parlorTile?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openParlorModal(); } });
  const duoTile = container.querySelector(".mhx-tag[data-duo]");
  duoTile?.addEventListener("click", openDuoModal);
  duoTile?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDuoModal(); } });
  container.querySelector(".mhx-next[data-tournament]")?.addEventListener("click", () => onNavigate?.("tournament"));
  const status = container.querySelector(".mhx-status");
  status?.addEventListener("click", () => onNavigate?.("avatar"));
  status?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.("avatar"); } });
  const statsBlock = container.querySelector(".mhx-stats");
  statsBlock?.addEventListener("click", () => onNavigate?.("avatar"));
  statsBlock?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.("avatar"); } });
  const np = container.querySelector(".mhx-nameplate");
  np?.addEventListener("click", openMentorModal);
  np?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMentorModal(); } });
  container.querySelector(".mhx-back")?.addEventListener("click", () => onBack?.());
  container.querySelector(".mhx-gear")?.addEventListener("click", () => onNavigate?.("settings"));

  // 立ち絵はデコード済みになってからフェードイン（初回入場の「ブランク→ポップ」を防ぐ）。
  container.querySelectorAll(".mhx-master-img, .mhx-port-img").forEach((img) => {
    const reveal = () => img.classList.add("is-loaded");
    if (img.complete && img.naturalWidth > 0) reveal();
    else img.addEventListener("load", reveal);
    img.addEventListener("error", () => { img.style.display = "none"; });
  });

  // ---- DEBUG: 起動オプション（?debug=tsumoreba 時のみ表示）----
  if (debug) {
    // §4.6 オートバトルのプロト起動（大会導線が入るまでの仮入口）。
    const ab = elt("button", "mh-debug-reset mhx-debug", {
      type: "button",
      textContent: "⚔ オートバトル（proto）",
    });
    ab.style.cssText = "top:92px;";
    ab.onclick = () => onNavigate?.("autobattle-proto");
    container.appendChild(ab);

    const honest = elt("button", "mh-debug-reset mhx-debug", {
      type: "button",
      textContent: "🀄 本気対局（proto）",
    });
    honest.style.cssText = "top:128px;";
    honest.onclick = () => onNavigate?.("honest-proto");
    container.appendChild(honest);

    const reset = elt("button", "mh-debug-reset mhx-debug", {
      type: "button",
      textContent: "🛠 1からやりなおす（DEBUG）",
    });
    reset.onclick = async () => {
      const ok = (typeof confirm === "function")
        ? confirm("セーブデータを消して、最初からやりなおします。よろしいですか？")
        : true;
      if (!ok) return;
      await repository.clearProfile();
      onBack?.();
    };
    container.appendChild(reset);
  }

  // 戻り時の演出を順番に：雀荘リザルト →（日が変わったなら）今日の手応え → 開始バナー。
  // ※ランクアップは訓練/雀荘の瞬間に FE 風演出で出るので、日替わりではサマリ内にまとめる。
  runModals([
    flash?.parlor ? (next) => openParlorResultModal(flash.parlor, next) : null,
    flash?.honest ? (next) => openHonestResultModal(flash.honest, next) : null,
    flash?.duo ? (next) => openDuoResultModal(flash.duo, next) : null,
    flash?.league ? (next) => openLeagueResultModal(flash.league, next) : null,
    flash?.tournamentGate ? (next) => openTournamentGateModal(flash.tournamentGate, next) : null,
    (showBanner && daySummary) ? (next) => openDaySummaryModal(daySummary, next) : null,
    showBanner ? () => openDayBanner() : null,
  ]);
}
