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
import { rest, trainParam, TRAIN_TUNING, trainOptionsFor, ensureDay, dayInfo, CONDITIONS, ACTIONS_PER_DAY, parlorState, setMentorMemory, mentorGrowthFor } from "../progression/progressionService.js";
import { pickMentorGreeting, pickRestTalk, pickMentorPraise, pickMentorRankUpLine } from "../data/mentorVoiceMaster.js";
import { PARAM_LABELS } from "../autobattle/autoBattle.js";
import { statViews, diffRankUps, rankFill, RANK_COLORS } from "../autobattle/statSystem.js";
import { nextTreasureInfo } from "../data/mentorCampaignMaster.js";
import { treasureRankFor, mentorRankFor } from "../data/tournamentMaster.js";
import { buildUnlockContext, evaluateUnlock } from "../scenario/unlockEvaluator.js";
import { isScenarioRead, unnotifiedUnlocks, markUnlockNotified, episodeNumberOf, mentorPhase } from "../progression/scenarioService.js";
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
// 「今月の様子」プール（非数値の質的表現）。月替わりで安定させる。
const MENTOR_MOODS = ["上機嫌", "穏やか", "いつも通り", "少し眠そう", "鋭い目つき", "上々"];
// 1ターン＝ひと月。3行動を上旬→中旬→下旬に対応づけて時期表示する（称号の重み＝時間の縮尺）。
const TIME_OF_DAY = ["上旬", "中旬", "下旬"];
// 「○ヶ月目」表示。13ヶ月目からは「○年○ヶ月目」に繰り上げて修行の長さを見せる。
function monthLabel(day) {
  if (day == null) return "—";
  const y = Math.floor((day - 1) / 12);
  const m = ((day - 1) % 12) + 1;
  return y > 0 ? `${y}年${m}ヶ月目` : `${m}ヶ月目`;
}
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
  if (actionsLeft >= ACTIONS_PER_DAY) return "今月はどうする？ まずは一息つくか、腕を磨くか。";
  if (actionsLeft <= 0) return "今月はよく動いた。あとはゆっくり休め。";
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
    phase: mentorPhase(profile, avatar.mentorCharacterId).id,
  };
  const greetLine = pickMentorGreeting(avatar.mentorCharacterId, greetCtx) || mentorLine(actionsLeft);

  // ---- 表示値の解決（未実装ぶんは仮値）----
  const soul = profile.wallet?.soul ?? 0;
  const meta = profile.wallet?.meta ?? 0;            // 継承（メタ通貨・未実装→0）
  const day = di.day;                                 // ○日目
  // 育成フェーズ（師弟編→覇道編）。覇道編はホーム全体の空気を変える（is-hadou テーマ＋章名＋一言）。
  const phase = mentorPhase(profile, avatar.mentorCharacterId);
  const isHadou = phase.id === "hadou";
  container.classList.toggle("is-hadou", isHadou);
  const chapter = `${phase.label} ─ ${phase.subtitle}`;
  const hpMax = avatar.avatarHpMax || 1;
  const hpCur = Math.max(0, Math.min(avatar.avatarHpCurrent ?? hpMax, hpMax));
  const hpPct = Math.round((hpCur / hpMax) * 100);

  // 師匠フレーバー（「今日の様子」＝師匠の調子）
  const mentorTitle = MENTOR_TITLE[mentor?.role] || "師範";
  const mood = mentorCond.label;
  // 異能段位：弟子＝集めた宝の数 / 師匠＝マスタ初期値＋段位の軌跡（弟子の宝数で昇段するキャラも）。
  const treasureCount = (profile.records?.treasures || []).length;
  const deshiRank = treasureRankFor(treasureCount); // 0個なら null＝無段
  const mentorRank = mentorRankFor(avatar.mentorCharacterId, treasureCount);
  // 師匠の昇段検知（段位の軌跡が動いた瞬間だけ通知。初回ロードは記録のみ＝既存昇段ぶんを誤通知しない）。
  const seenRank = profile.records?.mentorRankSeen?.[avatar.mentorCharacterId];
  let mentorRankUp = null;
  if (mentorRank && (seenRank == null || mentorRank.n > seenRank)) {
    if (seenRank != null && mentorRank.n > seenRank) mentorRankUp = mentorRank;
    profile = { ...profile, records: { ...(profile.records || {}), mentorRankSeen: { ...(profile.records?.mentorRankSeen || {}), [avatar.mentorCharacterId]: mentorRank.n } } };
    await repository.saveProfile(profile);
  }
  // 覇道編の修行成長（師匠も伸びる）＝ nameplate・師匠詳細の表示に使う。
  const mGrowth = mentorGrowthFor(profile, avatar.mentorCharacterId);
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
        <div class="mhx-seal">${esc(phase.seal)}</div>
        <div class="mhx-cname">〔 <b>${esc(chapter)}</b> 〕</div>
      </div>
      <div class="mhx-topright">
        <div class="mhx-purse" title="所持通貨">
          <div class="mhx-cur mhx-soul" title="ソウル（育成通貨）"><div class="mhx-coin">魂</div><div class="mhx-val">${esc(soul.toLocaleString())}</div><div class="mhx-cur-lab">ソウル</div></div>
          <div class="mhx-cur mhx-kei" title="継承（メタ通貨）"><div class="mhx-coin">継</div><div class="mhx-val">${esc(meta)}</div><div class="mhx-cur-lab">継承</div></div>
        </div>
        <div class="mhx-dayinfo" title="修行 ${esc(monthLabel(day))}・ひと月に3回まで行動できる">
          <div class="mhx-day"><b>${day == null ? "—" : esc(day)}</b><span class="mhx-day-u">ヶ月目</span><span class="mhx-time">${esc(timeLabel)}</span></div>
          <div class="mhx-acts">行動 <b>${actionsLeft}</b><small>/${ACTIONS_PER_DAY}</small></div>
        </div>
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
            ${mentorRank ? `<span class="mhx-dan-chip" title="異能段位：${esc(mentorRank.reading)}">${esc(mentorRank.name)}</span>` : ""}
            <span class="mhx-np-title">${esc(mentorTitle)}</span>
            <span class="mhx-np-lv">技 Lv${MENTOR_SKILL_LEVEL}</span>
            ${isHadou ? `<span class="mhx-np-lv mhx-np-shugyo" title="覇道編は師匠も一緒に伸びる（座学・鍛錬・二人打ち）。持ち点 +${mGrowth.hpBonus.toLocaleString()}">修行 Lv${mGrowth.level}</span>` : ""}
            <span class="mhx-np-mood mhx-cond tone-${mentorCond.tone}">今月：${esc(mood)}</span>
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
          ${tagTrain("鍛 錬", "型を選んで鍛える", "drill")}
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
        <div class="mhx-lv"><span class="mhx-lvtag">LV</span><b>${esc(avatar.avatarLevel)}</b><span class="mhx-cond tone-${cond.tone}" title="今月の調子">${esc(cond.label)}</span><span class="mhx-dan-chip${deshiRank ? "" : " is-none"}" title="異能段位${deshiRank ? "：" + esc(deshiRank.reading) : "（宝を集めて昇段）"}">${deshiRank ? esc(deshiRank.name) : "無段"}</span></div>
      </div>
      <div class="mhx-hp">
        <div class="mhx-hp-top">
          <div class="mhx-lab">点棒 <b>＝ HP</b></div>
          <div class="mhx-num">${esc(hpCur.toLocaleString())}<small> / ${esc(hpMax.toLocaleString())}</small></div>
        </div>
        <div class="mhx-bar"><div class="mhx-fill" style="width:${hpPct}%"></div></div>
      </div>
    </div>

    ${(() => {
      const nx = nextTreasureInfo(avatar.mentorCharacterId, profile.records?.treasures || []);
      const FMT = { solo4: "個人・四麻", solo3: "個人・三麻", pair: "ペア", team: "団体", final: "最終" };
      if (!nx) return `
        <button type="button" class="mhx-next mhx-next-off" disabled title="九蓮宝士">
          <div class="mhx-badge"><span class="mhx-b1">宝</span><span class="mhx-b2">九</span></div>
          <div class="mhx-txt"><div class="mhx-s">九 蓮 宝 士</div><div class="mhx-m">九つの宝、すべて制覇</div></div>
          <div class="mhx-na">達成</div>
        </button>`;
      return `
        <button type="button" class="mhx-next" data-tournament="1" title="${esc(nx.name)}に挑戦">
          <div class="mhx-badge"><span class="mhx-b1">CUP</span><span class="mhx-b2">杯</span></div>
          <div class="mhx-txt">
            <div class="mhx-s">次の大会へ</div>
            <div class="mhx-m">${esc(nx.name)}</div>
            <div class="mhx-tre">宝『<b>${esc(nx.treasure.name)}</b>』<small>${esc(nx.treasure.reading || "")}</small></div>
          </div>
          <div class="mhx-na"><span class="mhx-na-fmt">${esc(FMT[nx.format] || "")}</span><span class="mhx-na-tier">T${nx.tier}</span></div>
        </button>`;
    })()}

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
      <p class="mhx-md-line">${available ? "ゆっくり休め。来月に備えるのも実力のうちだ。" : "今月はもう動けない。また来月な。"}</p>
      <div class="mhx-md-hp">
        <div class="mhx-md-hp-top"><span>点棒 ＝ HP</span><span class="mhx-md-hp-num">${hpCur.toLocaleString()} / ${hpMax.toLocaleString()}</span></div>
        <div class="mhx-bar"><div class="mhx-fill mhx-md-fill" style="width:${curPct}%"></div></div>
      </div>
      <p class="mhx-md-result" hidden></p>
      <div class="mhx-rt" hidden></div>
      <button type="button" class="mhx-md-btn"${available ? "" : " disabled"}>${available ? "休憩する（1行動）" : "今月はもう動けない"}</button>
    `;
    let didRest = false;
    const { card, close } = openModal(container, html, () => { if (didRest) refresh(); });
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
        // 休憩中の2択コミュ（双方向）。選ぶと師匠が返し、その選択を覚える。
        // 質問があるときは「ゆっくり休んだ」ボタンを出さず、回答が前進導線になる（双方向の見せ場を任意化しない）。
        const talk = pickRestTalk(avatar.mentorCharacterId, { bondLevel: avatar.bondLevel ?? 1, condTier: cond.tone, phase: phase.id });
        if (talk) {
          btn.remove();
          const rt = card.querySelector(".mhx-rt");
          rt.innerHTML = `
            <p class="mhx-rt-prompt">${esc(talk.prompt)}</p>
            <div class="mhx-rt-choices">${talk.choices.map((c, i) => `<button type="button" class="mhx-rt-choice" data-i="${i}">${esc(c.label)}</button>`).join("")}</div>
            <p class="mhx-rt-reply" hidden></p>
            <button type="button" class="mhx-md-btn mhx-rt-done" hidden>うん、また来月</button>`;
          rt.hidden = false;
          const doneBtn = rt.querySelector(".mhx-rt-done");
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
              doneBtn.hidden = false;
            });
          });
          doneBtn.addEventListener("click", () => close());
        } else {
          btn.disabled = false; btn.textContent = "ゆっくり休んだ";
          btn.onclick = () => close();
        }
      } catch (e) {
        const r = card.querySelector(".mhx-md-result");
        r.textContent = e?.message || "休憩に失敗しました。"; r.hidden = false;
      }
    });
  }

  // ---- 訓練モーダル（6パラメータを伸ばす）----
  // menuKey＝コマンド札の単位。鍛錬のように複数の「型」（TRAIN_TUNING の変種）を持つ札は、
  // モーダル内で型を選んでから実行する（札を増やさずに 6 パラメータ全部へ主の上げ方を用意する）。
  function openTrainModal(menuKey) {
    const opts = trainOptionsFor(menuKey);
    if (!opts.length) return;
    const single = opts.length === 1;
    const t = opts[0];
    const menuLabel = single ? t.label : t.label.replace(/（.+）$/, "");
    const subLabel = (o) => (o.sub === "random" ? "ランダム" : PARAM_LABELS[o.sub]);
    const styleName = (o) => (o.label.match(/（(.+)）/)?.[1] || o.label) + "の型";
    const profLine = single
      ? `伸びる：<b>${esc(PARAM_LABELS[t.main])}</b>（主）／ ${esc(subLabel(t))}（副）　・　消費 HP ${t.hp.toLocaleString()}${t.soul ? `　・　ソウル +${t.soul}` : ""}`
      : `型を選ぶ　・　消費 HP ${t.hp.toLocaleString()}${t.soul ? `　・　ソウル +${t.soul}` : ""}`;
    const action = single
      ? `<button type="button" class="mhx-md-btn mhx-tr-go" data-key="${esc(t.key)}">${esc(t.label)}する</button>`
      : `<div class="mhx-duo-btns mhx-tr-styles">${opts.map((o) => `
          <button type="button" class="mhx-md-btn mhx-tr-go" data-key="${esc(o.key)}">${esc(styleName(o))}<small>主 ${esc(PARAM_LABELS[o.main])}／副 ${esc(subLabel(o))}</small></button>`).join("")}</div>`;
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">修行</span><span class="mhx-md-ttl">${esc(menuLabel)}</span></div>
      </div>
      <p class="mhx-md-line">${esc(TRAIN_LINE[menuKey] || "")}</p>
      <p class="mhx-md-prof">${profLine}<br><small>※伸びは当日の調子で変動（メンタルが高いほど安定し、大成功も出やすい）</small></p>
      <p class="mhx-md-result" hidden></p>
      <div class="mhx-pg-list mhx-train-gain" hidden></div>
      <p class="mhx-md-mentor" hidden></p>
      ${action}
    `;
    let done = false;
    const { card } = openModal(container, html, () => { if (done) refresh(); });
    card.querySelectorAll(".mhx-tr-go").forEach((btn) => btn.addEventListener("click", async () => {
      if (done) return;
      const key = btn.getAttribute("data-key");
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
        // 覇道編：師匠も一緒に伸びた（修行 exp。Lv が上がった月は強調）。
        if (res.mentor) {
          const mw = card.querySelector(".mhx-md-mentor");
          mw.innerHTML = res.mentor.levelUp
            ? `<b>${esc(mentor?.name || "師匠")}の修行が Lv${res.mentor.level} に！</b>　二人三脚、いい調子だ。`
            : `${esc(mentor?.name || "師匠")}も伸びた　<b>修行 +${res.mentor.gained}</b>`;
          mw.hidden = false;
        }
        // 実行後は全部の型ボタンを畳む（押した型だけ「完了」表示）。
        card.querySelectorAll(".mhx-tr-go").forEach((b) => {
          b.disabled = true;
          if (b !== btn) b.hidden = true;
        });
        btn.innerHTML = "完了";
      } catch (e) {
        const r = card.querySelector(".mhx-md-result");
        r.textContent = e?.message || "失敗しました。"; r.hidden = false;
      }
    }));
  }

  // ---- 二人打ち＝師匠タイマン（オート/本気を選ぶ・§4.6.9 B2）----
  function openDuoModal() {
    const canGo = actionsLeft > 0;
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">二人打ち</span><span class="mhx-md-ttl">師匠とタイマン</span></div>
      </div>
      <p class="mhx-md-line">${canGo ? esc(mentor?.name || "師匠") + "「一局、付き合え。…手は抜かんぞ」" : "今月はもう動けない。また来月だ。"}</p>
      <p class="mhx-md-prof"><small>二人麻雀（東南戦）。<b>持ち点＝今の HP（${hpCur.toLocaleString()}）を賭けて打つ＝結果が HP に反映</b>。師匠は<b>格上</b>。点を奪えれば HP が増え、メンタル・読みも伸びる（食らいつくほど伸びる）。</small></p>
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
      const subList = (c.subParams && c.subParams.length ? c.subParams : (c.subParam ? [c.subParam] : []));
      const subLab = subList.length ? subList.map((s) => PARAM_LABELS[s] || s).join(" ＆ ") : null;
      // 店トレイトは「噂」だけにおわせる（効果値は隠す＝通って学習する楽しみ）。場代の金額のみ明示。
      const traitLine = c.trait
        ? `<span class="mhx-pl-trait">※ ${esc(c.trait.hint)}${c.trait.entryCost ? `（席料 −${c.trait.entryCost}）` : ""}</span>`
        : "";
      return `
        <button type="button" class="mhx-pl${off ? " is-off" : ""}" data-idx="${c.index}"${off ? " disabled" : ""}>
          ${badge}
          <div class="mhx-pl-top">
            <span class="mhx-pl-name">${esc(c.name || "雀荘")}</span>
            <span class="mhx-cond tone-${c.tone} mhx-pl-tier">${esc(c.label)}</span>
          </div>
          <div class="mhx-pl-bot">
            <span class="mhx-pl-info"><b>${c.matches}</b> 戦${c.done ? "　…挑戦済み" : ""}</span>
            ${subLab ? `<span class="mhx-pl-train">鍛：勝負勘 ＆ <b>${esc(subLab)}</b></span>` : ""}
            <span class="mhx-pl-rew">+${c.soulPerWin}／勝</span>
          </div>
          ${traitLine}
        </button>`;
    }).join("");
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">雀荘巡り</span><span class="mhx-md-ttl">今月の卓</span></div>
      </div>
      <p class="mhx-md-line">${canGo ? "どこの卓で腕を試す？ 1 軒選べ。" : "今月はもう動けない。また来月だ。"}</p>
      <div class="mhx-pl-list">${cards}</div>
      <p class="mhx-md-prof"><small>※ 挑戦すると 1 行動を消費。卓は月替わりで変わる（同じ月は 1 軒のみ）。</small></p>
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
            <span class="mhx-chip mhx-chip-mood">今月 ${esc(mood)}</span>
          </div>
        </div>
      </div>
      ${mentor?.profile ? `<p class="mhx-md-prof">${esc(mentor.profile)}</p>` : ""}
      ${mAbilityName ? `<div class="mhx-md-abil"><div class="mhx-md-abil-h">能力</div><div class="mhx-md-abil-n">${esc(mAbilityName)}</div><div class="mhx-md-abil-d">${esc(mAbilityDesc)}</div></div>` : ""}
      ${isHadou ? `
      <div class="mhx-md-haoh">
        <div class="mhx-md-haoh-h">二人三脚 — 覇道編は師匠も伸びる</div>
        <div class="mhx-md-haoh-row">修行 <b>Lv${mGrowth.level}</b>${mGrowth.maxed ? "<small>（極）</small>" : `<span class="mhx-mg-bar"><i style="width:${Math.round(mGrowth.nextPct * 100)}%"></i></span>`}</div>
        <div class="mhx-md-haoh-row">大会・タイマンの持ち点 <b>+${mGrowth.hpBonus.toLocaleString()}</b></div>
        <small>座学・鍛錬・二人打ちのたびに、${esc(mentor?.name || "師匠")}の修行も進む。</small>
      </div>` : ""}
    `;
    openModal(container, html);
  }

  // ---- 師匠の昇段演出（段位の軌跡が動いた瞬間。弟子の昇段 openDaniRankModal の師匠版）----
  function openMentorRankUpModal(rk, onDone) {
    const KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const line = pickMentorRankUpLine(avatar.mentorCharacterId, rk.n);
    const html = `
      <div class="mhx-dan mhx-dan-mentor">
        <div class="mhx-dan-rays"></div>
        <div class="mhx-dan-kicker">師 匠 ＿ 昇 段</div>
        <div class="mhx-dan-seal"><span class="mhx-dan-seal-n">${KANJI[rk.n - 1] || rk.n}</span><span class="mhx-dan-seal-s">蓮</span></div>
        <div class="mhx-dan-name">${esc(mentor?.name || "師匠")} — ${esc(rk.name)}</div>
        <div class="mhx-dan-read">${esc(rk.reading)}</div>
        <div class="mhx-dan-msg mhx-dan-line">${esc(line)}</div>
        <button type="button" class="mhx-md-btn mhx-dan-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    audio?.playPip?.(2600, 0.6);
    setTimeout(() => audio?.playPip?.(3200, 0.5), 130);
    card.querySelector(".mhx-dan-btn")?.addEventListener("click", close);
  }

  // ---- 「〇ヶ月目を終えて」＝先月の手応えサマリ（→次の月へ）----
  function openDaySummaryModal(s, onDone) {
    const OUT = { daiseikou: "大成功", seikou: "成功", bunan: "無難", shippai: "成果イマイチ" };
    const OUTTONE = { daiseikou: "vgood", seikou: "good", bunan: "ok", shippai: "bad" };
    const logHtml = (s.log || []).map((e) => {
      if (e.type === "train") return `<li><span class="mhx-ds-act">${esc(e.label || "修行")}</span><span class="mhx-ds-tag tone-${OUTTONE[e.outcome] || "ok"}">${esc(OUT[e.outcome] || "")}</span></li>`;
      if (e.type === "duo") return `<li><span class="mhx-ds-act">二人打ち（本気）</span><span class="mhx-ds-tag tone-${e.won ? "vgood" : "good"}">${e.won ? "勝利" : "惜敗"}</span></li>`;
      if (e.type === "parlor") return `<li><span class="mhx-ds-act">雀荘巡り（${esc(e.label || "")}）</span><span class="mhx-ds-tag tone-ok">勝ち抜き ${e.wins ?? 0}</span></li>`;
      return `<li><span class="mhx-ds-act">休憩</span><span class="mhx-ds-tag tone-good">回復</span></li>`;
    }).join("");
    const gainStr = Object.entries(s.gains || {}).map(([k, v]) => `${esc(PARAM_LABELS[k] || k)} +${v}`).join("　/　");
    const rankStr = (s.rankUps || []).map((u) => `<span class="mhx-ds-rk"><b>${esc(u.label)}</b> <span class="mhx-stat-rank rank-${u.from}">${u.from}</span>▶<span class="mhx-stat-rank rank-${u.to}">${u.to}</span></span>`).join("　");
    const html = `
      <div class="mhx-ds">
        <div class="mhx-ds-ttl"><b>${esc(monthLabel(s.day))}</b> を終えて<span class="mhx-ds-sub">今月の手応え</span></div>
        <ul class="mhx-ds-log">${logHtml || '<li><span class="mhx-ds-act">…静かなひと月だった</span></li>'}</ul>
        <div class="mhx-ds-grid">
          <div class="mhx-ds-cell"><span class="mhx-ds-k">能力値</span><span class="mhx-ds-v">${gainStr ? esc(gainStr) : "変化なし"}${s.total ? `　<small>(計 +${s.total})</small>` : ""}</span></div>
          ${s.rankUps?.length ? `<div class="mhx-ds-cell"><span class="mhx-ds-k">ランクアップ</span><span class="mhx-ds-v">${rankStr}</span></div>` : ""}
          <div class="mhx-ds-cell"><span class="mhx-ds-k">ソウル</span><span class="mhx-ds-v">${s.soul >= 0 ? "+" : ""}${(s.soul || 0).toLocaleString()}</span></div>
        </div>
        <button type="button" class="mhx-md-btn mhx-ds-btn">次の月へ</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    card.querySelector(".mhx-ds-btn")?.addEventListener("click", close);
  }

  // ---- 「〇ヶ月目」＝今月の調子バナー（→今月も励む）----
  function openDayBanner(onDone) {
    const html = `
      <div class="mhx-db">
        <div class="mhx-db-day"><b>${esc(monthLabel(day))}</b></div>
        <div class="mhx-db-sub">今月の調子</div>
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
        ${day === 1 ? `<p class="mhx-db-note">ひと月に ${ACTIONS_PER_DAY} 回まで行動できる。調子は育成の伸びに効く。</p>` : ""}
        <button type="button" class="mhx-md-btn mhx-db-btn">今月も励む</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    card.querySelector(".mhx-db-btn")?.addEventListener("click", close);
  }

  // ---- ランクアップ演出（月の終わり→新しい月の頭に出す）----
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
        <div class="mhx-ru-sub">先月の修行が実を結んだ。</div>
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
    // 店トレイトの明細（該当時のみ）: ご祝儀倍率／席料／レア客撃破ボーナス。
    const detail = [];
    if (r.trait?.soulWinMul && (r.wins ?? 0) > 0) detail.push(`${esc(r.trait.label)} ×${r.trait.soulWinMul}`);
    if (r.fee > 0) detail.push(`席料 −${r.fee}`);
    if ((r.rareWins ?? 0) > 0) detail.push(`腕利き撃破 +${r.rareBonus}`);
    const detailHtml = detail.length ? `<div class="mhx-pr-detail">${detail.join("　")}</div>` : "";
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">${esc(r.candidate?.name || "雀荘")} 結果</div>
        <div class="mhx-pr-head">
          <span class="mhx-cond tone-${tone}">${esc(r.candidate?.label || "雀荘")}</span>
          <span class="mhx-pr-sum">${r.candidate?.matches ?? "—"} 戦 ／ 勝ち抜き <b>${r.wins ?? 0}</b></span>
        </div>
        <div class="mhx-pr-soul">獲得ソウル <b>${(r.soul ?? 0) >= 0 ? "+" : ""}${r.soul ?? 0}</b></div>
        ${detailHtml}
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

  // ---- 二人打ちタイマン リザルト（点棒＝HP・惜敗で伸び・能力値上昇演出を流用）----
  function openDuoResultModal(r, onDone) {
    const rows = gainRowsFrom(r);
    // 師匠は格上。勝ち＝HPを増やせた（師匠から点を奪えた）こと。
    const hd = r.hpDelta ?? 0;
    const head = hd > 0 ? "師匠から点を奪った！" : (r.closeness >= 0.85 ? "互角に渡り合った" : "削られた…でも、まだ");
    const tone = hd > 0 ? "vgood" : (r.closeness >= 0.85 ? "good" : "bad");
    // 点棒＝HP：賭けた HP（hpBefore）→ 残った HP（hpAfter）の増減を見せる。
    const hb = r.hpBefore ?? null, ha = r.hpAfter ?? null;
    const hpHtml = (hb != null && ha != null)
      ? `<div class="mhx-pr-hp">HP <b>${hb.toLocaleString()}</b> → <b class="${hd >= 0 ? "up" : "dn"}">${ha.toLocaleString()}</b> <span class="mhx-pr-hpd ${hd >= 0 ? "up" : "dn"}">(${hd >= 0 ? "+" : ""}${hd.toLocaleString()})</span></div>`
      : `<span class="mhx-pr-sum">残点 ${(r.finalPoints || 0).toLocaleString()}</span>`;
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">師匠との一局</div>
        <div class="mhx-pr-head"><span class="mhx-cond tone-${tone}">${esc(head)}</span></div>
        ${hpHtml}
        ${r.soul ? `<div class="mhx-pr-soul">獲得ソウル <b>+${r.soul}</b></div>` : ""}
        <div class="mhx-pr-sub">${hd > 0 ? "格上の師匠から、確かに点をもぎ取った。" : "食らいついた分が、力になった。"}${r.bondUp ? "<br>…師匠との距離が、少し縮まった気がする。" : ""}</div>
        <div class="mhx-pr-stats mhx-pg-list">${rows.length ? gainGaugesHtml(rows) : '<div class="mhx-pr-none">変化なし</div>'}</div>
        ${r.mentor ? `<p class="mhx-md-mentor">${r.mentor.levelUp ? `<b>${esc(mentor?.name || "師匠")}の修行が Lv${r.mentor.level} に！</b>　打ち合うたび、二人とも強くなる。` : `${esc(mentor?.name || "師匠")}も伸びた　<b>修行 +${r.mentor.gained}</b>`}</p>` : ""}
        <button type="button" class="mhx-md-btn mhx-pr-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    animateGainGauges(card);
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }

  // ---- 二人打ち：HP不足で打てない ----
  function openDuoBlockedModal() {
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">今は打てない</div>
        <div class="mhx-pr-head"><span class="mhx-cond tone-bad">HP（点棒）が足りない</span></div>
        <p class="mhx-pr-sub">二人打ちは今の HP を賭けて打つ。<br>まずは<b>休憩</b>で立て直してから挑め。</p>
        <button type="button" class="mhx-md-btn mhx-pr-btn">わかった</button>
      </div>`;
    const { card, close } = openModal(container, html);
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
        ${won && r.treasure ? `<div class="mhx-lg-treasure">宝『<b>${esc(r.treasure.name)}</b>』を獲得！<small>${esc(r.treasure.baseYaku || "")}</small></div>` : ""}
        <div class="mhx-lg-list">${rows}</div>
        <div class="mhx-tr-rank">評価 <b>${esc(r.rank || "満貫級")}</b></div>
        <div class="mhx-pr-soul">継承 <b>+${r.meta ?? 0}</b>　／　ソウル <b>+${r.soul ?? 0}</b></div>
        ${r.exp?.total ? `<div class="mhx-lg-exp"><div class="mhx-lg-exp-h">実戦経験 <b>+${r.exp.total}</b><small>（弱点から伸びる）</small></div><div class="mhx-pg-list mhx-lg-exp-g"></div></div>` : ""}
        <p class="mhx-pr-sub">${won ? "宝への道が、また一歩ひらけた。" : r.retreated ? "引いた卓のことも、体は覚えている。" : place === 2 ? "あと一歩。——だが、卓で得たものは確かに残った。" : "負けた卓ほど、よく覚えている。経験は裏切らない。"}</p>
        <button type="button" class="mhx-md-btn mhx-pr-btn">よし</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    if (won) audio?.playPip?.(2600, 0.6);
    // 順位に応じた実戦経験（FE 風ゲージ）。優勝以外でも「持ち帰ったもの」が目に見える。
    if (r.exp?.total) {
      const gw = card.querySelector(".mhx-lg-exp-g");
      gw.innerHTML = gainGaugesHtml(gainRowsFrom(r.exp));
      animateGainGauges(gw);
    }
    card.querySelector(".mhx-pr-btn")?.addEventListener("click", close);
  }

  // ---- 異能段位 獲得演出（宝獲得＝昇段。league の後に出す）----
  function openDaniRankModal(rk, onDone) {
    const KANJI = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const isMax = rk.n >= 9;
    const html = `
      <div class="mhx-dan${isMax ? " is-max" : ""}">
        <div class="mhx-dan-rays"></div>
        <div class="mhx-dan-kicker">異 能 段 位 ＿ 獲 得</div>
        <div class="mhx-dan-seal"><span class="mhx-dan-seal-n">${KANJI[rk.n - 1] || rk.n}</span><span class="mhx-dan-seal-s">蓮</span></div>
        <div class="mhx-dan-name">${esc(rk.name)}</div>
        <div class="mhx-dan-read">${esc(rk.reading)}</div>
        <div class="mhx-dan-msg">${isMax ? "九つの宝、すべて掌中に。" : `集めた宝　${rk.n} / 9`}</div>
        <button type="button" class="mhx-md-btn mhx-dan-btn">${isMax ? "——九蓮宝士" : "よし"}</button>
      </div>`;
    const { card, close } = openModal(container, html, onDone);
    audio?.playPip?.(2600, 0.6);
    setTimeout(() => audio?.playPip?.(3200, 0.5), 130);
    if (isMax) setTimeout(() => audio?.playPip?.(3800, 0.5), 300);
    card.querySelector(".mhx-dan-btn")?.addEventListener("click", close);
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

  // 大会ストーリーゲート：前の大会で解禁された章を読むまで次の宝に挑めない（物語が先）。
  function openStoryGateModal(g, onDone) {
    let navigating = false;
    // locked＝前提章はまだ手前の章がロック中（レベル/前話未達）＝視聴導線を出さず足止めだけ。
    const line = g.locked
      ? "「その話を聞くには、まだ早い。——もう少し、足を運んでからだ。」"
      : "「卓に着くのは、それからだ。——聞いてほしい話がある。」";
    const buttons = g.locked
      ? `<button type="button" class="mhx-md-btn mhx-su-later">わかった</button>`
      : `<button type="button" class="mhx-md-btn mhx-su-play">視聴する</button>
         <button type="button" class="mhx-rt-choice mhx-su-later">あとで</button>`;
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">大会の前に</span><span class="mhx-md-ttl">${esc(mentor?.name || "師匠")}</span></div>
      </div>
      <p class="mhx-md-line">${line}</p>
      ${g.locked ? "" : `<p class="mhx-su-name">${g.episode ? `第${g.episode}話　` : ""}「${esc(g.title)}」</p>`}
      <div class="mhx-su-btns">${buttons}</div>`;
    const { card, close } = openModal(container, html, () => { if (!navigating) onDone?.(); });
    card.querySelector(".mhx-su-play")?.addEventListener("click", () => {
      navigating = true; close(); onNavigate?.("play-scenario", { scenarioId: g.scenarioId });
    });
    card.querySelector(".mhx-su-later")?.addEventListener("click", () => close());
  }
  // 章の解禁通知。数値や条件は見せず「新しい物語が来た」ことだけを告げる。
  function openScenarioUnlockModal(s, onDone) {
    const ep = episodeNumberOf(profile, s.scenarioId);
    let navigating = false;
    // 同じ章で何度も出さない（通知済みを記録。読む/読まないとは独立）。
    profile = markUnlockNotified(profile, [s.scenarioId]);
    repository.saveProfile(profile);
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">新しい物語</span><span class="mhx-md-ttl">${esc(mentor?.name || "師匠")}</span></div>
      </div>
      <p class="mhx-md-line">「——少し、話しておきたいことがある。」</p>
      <p class="mhx-su-name">${ep ? `第${ep}話　` : ""}「${esc(s.title)}」が解禁</p>
      <div class="mhx-su-btns">
        <button type="button" class="mhx-md-btn mhx-su-play">視聴する</button>
        <button type="button" class="mhx-rt-choice mhx-su-later">あとで</button>
      </div>`;
    const { card, close } = openModal(container, html, () => { if (!navigating) onDone?.(); });
    audio?.playPip?.(2200, 0.4);
    card.querySelector(".mhx-su-play")?.addEventListener("click", () => {
      navigating = true; close(); onNavigate?.("play-scenario", { scenarioId: s.scenarioId });
    });
    card.querySelector(".mhx-su-later")?.addEventListener("click", () => close());
  }
  // 直接視聴（play-scenario）からの読了リザルト。絆は数値で見せない（CLAUDE.md ピラー1）。
  function openScenarioReadModal(r, onDone) {
    const html = `
      <div class="mhx-pr">
        <div class="mhx-pr-ttl">読了</div>
        <p class="mhx-pr-sub">「${esc(r.title)}」${r.soul ? `<br>ソウル +${r.soul}` : ""}${r.bondUp ? "<br>…師匠との距離が、少し縮まった気がする。" : ""}</p>
        <button type="button" class="mhx-md-btn mhx-pr-btn">うん</button>
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

  // 戻り時の演出を順番に：雀荘リザルト →（月が変わったなら）先月の手応え → 開始バナー。
  // ※ランクアップは訓練/雀荘の瞬間に FE 風演出で出るので、月替わりではサマリ内にまとめる。
  runModals([
    flash?.parlor ? (next) => openParlorResultModal(flash.parlor, next) : null,
    flash?.honest ? (next) => openHonestResultModal(flash.honest, next) : null,
    flash?.duo ? (next) => openDuoResultModal(flash.duo, next) : null,
    flash?.duoBlocked ? () => openDuoBlockedModal() : null,
    flash?.scenarioRead ? (next) => openScenarioReadModal(flash.scenarioRead, next) : null,
    flash?.league ? (next) => openLeagueResultModal(flash.league, next) : null,
    flash?.league?.rankUp ? (next) => openDaniRankModal(flash.league.rankUp, next) : null,
    // 師匠の昇段（段位の軌跡）。弟子の昇段を見届けたあとに出す＝二人で上がっていく画。
    mentorRankUp ? (next) => openMentorRankUpModal(mentorRankUp, next) : null,
    flash?.tournamentGate ? (next) => openTournamentGateModal(flash.tournamentGate, next) : null,
    flash?.storyGate ? (next) => openStoryGateModal(flash.storyGate, next) : null,
    // 「〇ヶ月目を終えて」→次の月へ → 「〇ヶ月目（今月の調子）」の順で2枚に分けて出す（ごちゃつき回避）。
    (showBanner && daySummary) ? (next) => openDaySummaryModal(daySummary, next) : null,
    showBanner ? (next) => openDayBanner(next) : null,
    // 章の解禁通知はしんがり（リザルト/月替わりを見届けてから「新しい物語」へ誘う）。
    ...unnotifiedUnlocks(profile).map((s) => (next) => openScenarioUnlockModal(s, next)),
  ]);
}
