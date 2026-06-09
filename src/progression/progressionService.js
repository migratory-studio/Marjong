// 育成サービス — major_update_specification.md §10 / §11 / Phase 2B。
//
// 画面 → ProgressionService → ProfileRepository（§19.3）の中段。マイキャラの
// 休憩・HP 成長（キャラ Lv）・スキル Lv 強化・能力変更といった「ルール込みの
// プロフィール変換」をここに集約する。すべて純粋＆不変更新で、新しい profile を
// 返すか、不正な操作（ソウル不足・最大 Lv・日次制限）で例外を投げる。保存は
// 呼び出し側（screen）が repository.saveProfile() で行う。
//
// 対局エンジンには一切触れない（§3.1: エンジンに育成/報酬/保存の責務を持たせない）。
import { activeAvatar, avatarParams6 } from "./avatarFactory.js";
import { spendSoul, grantSoul } from "./rewardService.js";
import { skillTemplateById, templatesForMentor } from "../data/skillTemplateMaster.js";
import { nextAvatarLevel } from "../data/avatarLevelMaster.js";
import { nextSkillLevel } from "../data/skillLevelMaster.js";
import { abilityChangeCost } from "../data/abilityChangeCostMaster.js";
import { rollDailyParlors } from "../data/parlorMaster.js";
import { evaluateTier, paramsFromLv } from "../autobattle/autoBattle.js";

// 育成の調整値（バランス調整で動かす単一の出どころ）。
export const GROWTH_TUNING = {
  rest: {
    healRatio: 0.5, // 1 回の休憩で最大 HP の何割を回復するか
    soul: 80, // 休憩で得る少量ソウル（§11.2）
    bondExp: 20, // 休憩で得る絆経験値（§11.2）
  },
  bondExpPerLevel: 100, // 絆 Lv 上昇に必要な経験値（次 Lv = base * 現Lv）
};

// 端末ローカル日付 "YYYY-MM-DD"（§11.2: ローカル版は端末日付で 1 日 1 回）。
export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// アクティブなマイキャラを updater で書き換えた新しい profile を返す（不変更新）。
function withActiveAvatar(profile, updater) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const updated = { ...updater(av), updatedAt: new Date().toISOString() };
  return {
    ...profile,
    avatars: (profile.avatars || []).map((a) => (a.avatarId === av.avatarId ? updated : a)),
  };
}

const clampN = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------- 日次ループ／調子（§4.5.3）
// 1 日 = ACTIONS_PER_DAY 回行動 → 日が進む。日替わりで弟子・師匠の「調子」を抽選。
// 調子は 5 段階（index 0=絶不調 … 4=絶好調）。bias は育成の伸び・オート勝率に効く強さ。
export const ACTIONS_PER_DAY = 3;
export const CONDITIONS = [
  { key: "zekkyou_bad", label: "絶不調", tone: "vbad",  bias: -2 },
  { key: "fuchou",      label: "不調",   tone: "bad",   bias: -1 },
  { key: "futsuu",      label: "普通",   tone: "ok",    bias: 0 },
  { key: "kouchou",     label: "好調",   tone: "good",  bias: 1 },
  { key: "zekkouchou",  label: "絶好調", tone: "vgood", bias: 2 },
];
// 抽選は「普通」へ寄せる（極端はまれ）。index と対応。
const CONDITION_WEIGHTS = [1, 3, 5, 3, 1];
export function rollCondition(rng = Math.random) {
  const sum = CONDITION_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < CONDITION_WEIGHTS.length; i++) { if ((r -= CONDITION_WEIGHTS[i]) < 0) return i; }
  return 2;
}

// 当日の状態を保証する。日が変わっていれば調子を抽選し行動数を 0 に戻す。
// 戻り値 started=true は「新しい日が始まった」＝開始バナーを出す合図。
// prevStartParams6 ＝ 終わった日の「開始時ステ」スナップショット（ランクアップ判定用）。
// startParams6 はその日の開始時の params6 を保存しておき、翌日にランクアップを集計する。
export function ensureDay(profile, rng = Math.random) {
  const day = profile.dayCount ?? 1;
  const d = profile.daily || {};
  if (d.initDay === day && d.condition != null && d.mentorCondition != null) {
    return { profile: { ...profile, dayCount: day }, started: false, prevStartParams6: null };
  }
  const av = activeAvatar(profile);
  const cur = av ? avatarParams6(av) : {};
  const daily = {
    ...d,
    initDay: day,
    actionsUsed: 0,
    condition: rollCondition(rng),
    mentorCondition: rollCondition(rng),
    startParams6: { ...cur },
    startSoul: profile.wallet?.soul ?? 0,  // 当日の手応えサマリ用（稼ぎの差分）
    log: [],                               // その日の行動ログ
    parlorsDone: [],  // 雀荘巡りの挑戦済み（日替わりでリセット＝候補シャッフル）
  };
  return {
    profile: { ...profile, dayCount: day, daily },
    started: true,
    prevStartParams6: d.startParams6 || null,
    prevStartSoul: d.startSoul ?? null,
    prevLog: d.log || [],
  };
}

// 当日の読み取り情報（行動残り・調子）。ensureDay 済みを前提。
export function dayInfo(profile) {
  const d = profile.daily || {};
  const used = d.actionsUsed ?? 0;
  return {
    day: profile.dayCount ?? 1,
    actionsUsed: used,
    actionsLeft: Math.max(0, ACTIONS_PER_DAY - used),
    condition: d.condition ?? 2,
    mentorCondition: d.mentorCondition ?? 2,
  };
}

// 1 行動を消費する。conditionDelta は調子の増減（失敗 -1 / 大成功 +1）。
// logEntry はその日の行動ログ（手応えサマリ用）。3 行動使い切ったら dayCount を進める。
function endAction(profile, conditionDelta = 0, logEntry = null) {
  const d = profile.daily || {};
  const condition = clampN((d.condition ?? 2) + conditionDelta, 0, CONDITIONS.length - 1);
  const used = (d.actionsUsed ?? 0) + 1;
  const log = logEntry ? [...(d.log || []), logEntry] : (d.log || []);
  let dayCount = profile.dayCount ?? 1;
  let dayAdvanced = false;
  if (used >= ACTIONS_PER_DAY) { dayCount += 1; dayAdvanced = true; }
  return {
    profile: { ...profile, dayCount, daily: { ...d, condition, actionsUsed: used, log } },
    dayAdvanced,
  };
}

// ---------------------------------------------------------------- 休憩（§11）
export function canRestToday(profile, today = localDate()) {
  return (profile.daily?.lastRestDate ?? null) !== today;
}

// 日次休憩。今日まだなら HP 回復＋絆経験値＋少量ソウル。済みなら例外。
// 大会進行中の runHp は休憩で回復しない（§11.2）が、Phase 2B 時点では runHp 自体が
// 未導入なので avatarHpCurrent のみ扱う。
export function rest(profile) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  if (dayInfo(profile).actionsLeft <= 0) throw new Error("今日の行動はもう残っていない");

  const heal = Math.round(av.avatarHpMax * GROWTH_TUNING.rest.healRatio);
  const newHp = Math.min(av.avatarHpMax, av.avatarHpCurrent + heal);

  // 絆経験値の加算と Lv 上昇（しきい値は base * 現Lv で逓増）。
  let bondLevel = av.bondLevel ?? 1;
  let bondExp = (av.bondExp ?? 0) + GROWTH_TUNING.rest.bondExp;
  while (bondExp >= GROWTH_TUNING.bondExpPerLevel * bondLevel) {
    bondExp -= GROWTH_TUNING.bondExpPerLevel * bondLevel;
    bondLevel += 1;
  }

  let next = withActiveAvatar(profile, (a) => ({
    ...a,
    avatarHpCurrent: newHp,
    bondLevel,
    bondExp,
  }));
  next = grantSoul(next, GROWTH_TUNING.rest.soul);
  // 休憩は 1 行動を消費し、調子を 1 段階戻す（上限＝絶好調）。必要なら日が進む。
  const beforeCond = dayInfo(next).condition;
  const ended = endAction(next, 1, { type: "rest" });
  next = ended.profile;
  const conditionUp = dayInfo(next).condition > beforeCond;

  return {
    profile: next,
    dayAdvanced: ended.dayAdvanced,
    conditionUp,
    healed: newHp - av.avatarHpCurrent,
    soul: GROWTH_TUNING.rest.soul,
    bondExp: GROWTH_TUNING.rest.bondExp,
    bondUp: bondLevel > (av.bondLevel ?? 1),
    bondLevel,
  };
}

// ------------------------------------------------- キャラ Lv（HP 成長）（§10.2）
export function avatarLevelInfo(profile) {
  const av = activeAvatar(profile);
  if (!av) return null;
  return {
    current: av.avatarLevel,
    currentHpMax: av.avatarHpMax,
    next: nextAvatarLevel(av.avatarLevel), // null なら最大
  };
}

// キャラ Lv を 1 上げ、最大 HP を引き上げる。増えたぶんは現在 HP にも加算する。
export function levelUpAvatar(profile) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const next = nextAvatarLevel(av.avatarLevel);
  if (!next) throw new Error("キャラ Lv は最大です");

  let p = spendSoul(profile, next.soulCost);
  const hpGain = Math.max(0, next.avatarHpMax - av.avatarHpMax);
  p = withActiveAvatar(p, (a) => ({
    ...a,
    avatarLevel: next.avatarLevel,
    avatarHpMax: next.avatarHpMax,
    avatarHpCurrent: a.avatarHpCurrent + hpGain,
  }));
  return { profile: p, avatarLevel: next.avatarLevel, hpGain, cost: next.soulCost };
}

// ------------------------------------------------------- スキル Lv 強化（§10.5）
export function skillLevelInfo(profile) {
  const av = activeAvatar(profile);
  if (!av) return null;
  const tmpl = skillTemplateById(av.skillTemplateId);
  return {
    current: av.skillLevel,
    tableId: tmpl?.levelTableId ?? null,
    next: tmpl ? nextSkillLevel(tmpl.levelTableId, av.skillLevel) : null, // null なら最大
  };
}

export function upgradeSkill(profile) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const tmpl = skillTemplateById(av.skillTemplateId);
  if (!tmpl) throw new Error("能力種類が不正です");
  const next = nextSkillLevel(tmpl.levelTableId, av.skillLevel);
  if (!next) throw new Error("スキル Lv は最大です");

  let p = spendSoul(profile, next.soulCost);
  p = withActiveAvatar(p, (a) => ({ ...a, skillLevel: next.skillLevel }));
  return { profile: p, skillLevel: next.skillLevel, cost: next.soulCost };
}

// ------------------------------------------------------- 能力種類変更（§10.6）
// 師匠は変えず、許可候補（現能力を除く）から選ぶ。各候補の費用を添えて返す。
export function abilityChangeOptions(profile) {
  const av = activeAvatar(profile);
  if (!av) return [];
  return templatesForMentor(av.mentorCharacterId)
    .filter((t) => t.skillTemplateId !== av.skillTemplateId)
    .map((t) => ({
      template: t,
      cost: abilityChangeCost({
        avatarLevel: av.avatarLevel,
        currentSkillLevel: av.skillLevel,
        targetRarity: t.rarity,
      }),
    }));
}

// 能力種類を変更する。ソウルを消費し、スキル Lv を初期値（Lv1）へ戻し（§10.6）、
// 変更回数を加算する（能力変更シナリオの解放条件に使える）。師匠は変えない。
export function changeAbility(profile, targetSkillTemplateId) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const tmpl = skillTemplateById(targetSkillTemplateId);
  if (!tmpl || !tmpl.isEnabled) throw new Error("選べない能力種類です");
  if (!tmpl.mentorCharacterIds.includes(av.mentorCharacterId))
    throw new Error("この師匠では選べない能力です");
  if (tmpl.skillTemplateId === av.skillTemplateId) throw new Error("すでにその能力です");

  const cost = abilityChangeCost({
    avatarLevel: av.avatarLevel,
    currentSkillLevel: av.skillLevel,
    targetRarity: tmpl.rarity,
  });
  let p = spendSoul(profile, cost);
  p = withActiveAvatar(p, (a) => ({
    ...a,
    skillTemplateId: tmpl.skillTemplateId,
    skillLevel: tmpl.initialSkillLevel ?? 1, // §10.6 スキル Lv リセット
    abilityChangedCount: (a.abilityChangedCount ?? 0) + 1,
  }));
  return { profile: p, cost, skillTemplateId: tmpl.skillTemplateId };
}

// ------------------------------------------- 育成パラメータ訓練（§4.6.1）
// 活動コマンドが 6 パラメータを直接伸ばす（主 1＋副 1）。HP を消費し、一部はソウルも得る。
// 雀荘巡り(parlor)の副は「ランダム 1 種」。数値はチューニング前提。
export const TRAIN_TUNING = {
  study:  { label: "座学",     main: "read",   sub: "guard",  mainGain: 3, subGain: 1, hp: 600 },
  drill:  { label: "鍛錬",     main: "fire",   sub: "speed",  mainGain: 3, subGain: 1, hp: 1500, soul: 120 },
  duo:    { label: "二人打ち", main: "mental", sub: "read",   mainGain: 3, subGain: 1, hp: 1500 },
  parlor: { label: "雀荘巡り", main: "gamble", sub: "random", mainGain: 3, subGain: 2, hp: 2500, soul: 200 },
};
const PARAM_CAP = 99;
const ALL_PARAMS = ["fire", "guard", "read", "gamble", "speed", "mental"];

// 訓練の「調子」による結果（伸び倍率）。大成功＞成功＞無難＞失敗。
// mult が主/副の伸びに掛かる（失敗でも主は最低 +1＝失敗なし路線 §4.6.4）。
// line は師匠が返す一言（双方向の愛着フック）。
export const TRAIN_OUTCOMES = {
  daiseikou: { label: "大成功", tone: "great", mult: 2.2, line: "筋がいい。我が見込んだ通りだ。" },
  seikou:    { label: "成功",   tone: "good",  mult: 1.5, line: "うむ、よく伸びた。" },
  bunan:     { label: "無難",   tone: "ok",    mult: 1.0, line: "悪くない。地道が一番だ。" },
  shippai:   { label: "失敗",   tone: "bad",   mult: 0.34, line: "ま、こういう日もある。気にするな。" },
};

// 伸びの引きの良さは「メンタル（恒常）」と「当日の調子（変動）」の合算。
// メンタルは対局オートでも乱数の振れを圧縮する＝育成でも同じ性格（ブレを抑える）。
// condition は 0..4（普通=2）。
export function rollTrainOutcome(mental = 0, condition = 2, rng = Math.random) {
  const m = clampN(mental, 0, PARAM_CAP) / PARAM_CAP;  // 0..1（恒常の安定）
  const c = clampN(condition, 0, 4) / 4;               // 0..1（当日の調子）
  const f = clampN(0.5 * m + 0.5 * c, 0, 1);           // 総合の引きの良さ
  const pFail = 0.20 * (1 - 0.9 * f);
  const pBunan = 0.42 * (1 - 0.5 * f);
  const rest = 1 - pFail - pBunan;     // 成功＋大成功
  const pDai = rest * (0.18 + 0.34 * f);
  const r = rng();
  if (r < pDai) return "daiseikou";
  if (r < rest) return "seikou";
  if (r < rest + pBunan) return "bunan";
  return "shippai";
}

export function trainParam(profile, key, rng = Math.random) {
  const t = TRAIN_TUNING[key];
  if (!t) throw new Error("未知の育成コマンド: " + key);
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  if (dayInfo(profile).actionsLeft <= 0) throw new Error("今日の行動はもう残っていない");

  const cur = avatarParams6(av);
  const before = { ...cur };
  const condition = dayInfo(profile).condition;
  const outcomeKey = rollTrainOutcome(cur.mental, condition, rng);
  const outcome = TRAIN_OUTCOMES[outcomeKey];
  const sub = t.sub === "random" ? ALL_PARAMS[Math.floor(rng() * ALL_PARAMS.length)] : t.sub;
  const gains = {};
  const apply = (k, g) => {
    const before = cur[k] || 0;
    const after = Math.min(PARAM_CAP, before + g);
    gains[k] = (gains[k] || 0) + (after - before);
    cur[k] = after;
  };
  // 主は最低 +1 を保証（失敗でも何かは身につく）。副は 0 になりうる。
  apply(t.main, Math.max(1, Math.round(t.mainGain * outcome.mult)));
  apply(sub, Math.round(t.subGain * outcome.mult));

  const hpCost = t.hp || 0;
  let p = withActiveAvatar(profile, (a) => ({
    ...a,
    params6: cur,
    avatarHpCurrent: Math.max(0, (a.avatarHpCurrent ?? a.avatarHpMax) - hpCost),
  }));
  if (t.soul) p = grantSoul(p, t.soul);
  // 失敗で調子↓ / 大成功で調子↑。行動を 1 消費（必要なら日が進む）。
  const conditionDelta = outcomeKey === "shippai" ? -1 : outcomeKey === "daiseikou" ? 1 : 0;
  const ended = endAction(p, conditionDelta, { type: "train", key, label: t.label, outcome: outcomeKey });
  return {
    profile: ended.profile, gains, hpCost, soul: t.soul || 0,
    outcome: outcomeKey, outcomeLabel: outcome.label, outcomeTone: outcome.tone, outcomeLine: outcome.line,
    conditionDelta, dayAdvanced: ended.dayAdvanced,
    before, after: { ...cur },
  };
}

// ------------------------------------------------- 大会（M リーグ制）（Phase 4B・§4.6.10 / §4.5.2）
// 出場ゲート：相手評価が「大劣勢」だと門前払い（§4.6.2）。
export function tournamentGate(profile, t) {
  const av = activeAvatar(profile);
  const self = avatarParams6(av);
  const opp = paramsFromLv(t.gateOppLv ?? t.rivalLv ?? 2, "tourney:" + t.id);
  const { tier } = evaluateTier(self, opp);
  return { ok: tier.id !== "dai_ressei", tier };
}

// その節（半荘）の各プレイヤーのポイント＝素点((最終−25000)/1000)＋ウマ。
export function leaguePoints(standings = [], uma = [50, 10, -10, -30]) {
  return standings.map((s) => ({
    id: s.id, isHuman: !!s.isHuman, rank: s.rank,
    pt: Math.round(((s.points ?? 25000) - 25000) / 1000) + (uma[s.rank] ?? 0),
  }));
}

// 全節終了後の結果反映。finalRank＝弟子の累積ポイント順位(0..3)。
// 完走で必ず評価＋継承＋ソウル（失敗なし路線）。最終1位＝優勝で tournament_won++。持ち点は持ち越さない（節ごと 25000）。
export function applyLeagueResult(profile, t, finalRank = 3, retreated = false) {
  const place = Math.max(0, Math.min((t.rankByPlace?.length ?? 4) - 1, finalRank));
  const rank = t.rankByPlace[place];
  const meta = t.metaByPlace[place] || 1;
  const soul = t.soulClear || 0;
  let p = grantSoul(profile, soul);
  p = { ...p, wallet: { ...(p.wallet || {}), meta: (p.wallet?.meta ?? 0) + meta } };
  const won = place === 0 && !retreated;
  if (won) p = { ...p, records: { ...(p.records || {}), tournamentsWon: (p.records?.tournamentsWon ?? 0) + 1 } };
  return { profile: p, finalRank: place, won, rank, meta, soul, retreated };
}

// ------------------------------------------------- 本気対局の結果反映（Phase 4A・§4.6.9）
// MatchResult（着順・残点）を育成へ反映する。単発の本気対局はソウル＋param経験のみ
// （HP=avatarHpCurrent は上書きしない。runHp 持ち越しは大会(C)で扱う）。数値は仮・チューニング前提。
export const HONEST_REWARD = {
  soulByPlacement: [320, 180, 100, 60], // 着順 0..3（1着が最大）
  expByPlacement: [4, 3, 2, 1],         // 散らす param 経験の総量
  expKeys: ["read", "mental", "gamble"], // 本気＝実力＝読み/メンタル/勝負勘を磨く
};
export function applyHonestResult(profile, result = {}) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const n = Math.max(1, result.numPlayers || 4);
  const place = Math.max(0, Math.min(n - 1, result.placement ?? n - 1));
  const idx = Math.min(HONEST_REWARD.soulByPlacement.length - 1, place);
  const soul = HONEST_REWARD.soulByPlacement[idx] || 0;
  const exp = HONEST_REWARD.expByPlacement[idx] || 1;

  const cur = avatarParams6(av);
  const before = { ...cur };
  const gains = {};
  const apply = (k, g) => { const b = cur[k] || 0; const a = Math.min(PARAM_CAP, b + g); gains[k] = (gains[k] || 0) + (a - b); cur[k] = a; };
  for (let i = 0; i < exp; i++) apply(HONEST_REWARD.expKeys[i % HONEST_REWARD.expKeys.length], 1);

  let p = grantSoul(profile, soul);
  p = withActiveAvatar(p, (a) => ({ ...a, params6: cur }));
  return { profile: p, soul, gains, before, after: { ...cur }, placement: place, numPlayers: n, won: place === 0 };
}

// ------------------------------------------------- 二人打ち＝師匠タイマンの結果（Phase 4A B2・§4.6.9）
// 二人麻雀(futari)で師匠と打った結果を反映。メンタル(主)・読み(副)が伸びる＝二人打ちの主旨。
// 「惜敗で伸び」＝残点が多い(食らいついた)ほど経験 UP。勝てば調子↑＋ソウル。1 行動を消費。
export function applyDuoResult(profile, result = {}) {
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");
  const won = (result.placement ?? 1) === 0;
  const fp = Math.max(0, result.finalPoints ?? 0);
  const closeness = Math.max(0, Math.min(1.5, fp / 25000)); // 0=完敗 / 1=五分 / 1.5=快勝
  const cur = avatarParams6(av);
  const before = { ...cur };
  const gains = {};
  const apply = (k, g) => { const b = cur[k] || 0; const a = Math.min(PARAM_CAP, b + g); gains[k] = (gains[k] || 0) + (a - b); cur[k] = a; };
  apply("mental", Math.max(1, Math.round(2 + closeness * 3))); // 主 2..6
  apply("read", Math.max(0, Math.round(1 + closeness * 2)));   // 副 1..4
  const soul = won ? 200 : Math.round(60 * closeness);
  let p = soul > 0 ? grantSoul(profile, soul) : profile;
  p = withActiveAvatar(p, (a) => ({ ...a, params6: cur }));
  const ended = endAction(p, won ? 1 : 0, { type: "duo", label: "二人打ち（本気）", won }); // 勝てば調子↑
  return { profile: ended.profile, soul, gains, before, after: { ...cur }, won, closeness, finalPoints: fp, dayAdvanced: ended.dayAdvanced };
}

// ------------------------------------------------- 師匠の記憶（双方向・蓄積）
// 休憩の2択や直近の訓練結果を覚えて、次の「師匠の一言」に反映する。
// patch 例: { lastChoice:"honest" } / { lastOutcome:"daiseikou", lastOutcomeDay: 12 }
export function setMentorMemory(profile, patch) {
  const mem = { ...(profile.mentorMemory || {}), ...patch };
  if (patch.lastChoice) {
    const counts = { ...(mem.counts || {}) };
    counts[patch.lastChoice] = (counts[patch.lastChoice] || 0) + 1;
    mem.counts = counts;
  }
  return { ...profile, mentorMemory: mem };
}

// ------------------------------------------------- 雀荘巡り（候補選択・§4.6.8）
// シナリオ進捗（当面 0。経済再調整バッチで実進捗に差し替え）。
function scenarioProgressLevel(_profile) { return 0; }

// その日の雀荘候補と挑戦済みフラグ。候補は dayCount から決定論生成（同じ日は不変）。
export function parlorState(profile) {
  const candidates = rollDailyParlors(profile.dayCount ?? 1, scenarioProgressLevel(profile));
  const done = profile.daily?.parlorsDone || [];
  return {
    candidates: candidates.map((c) => ({ ...c, done: done.includes(c.index) })),
    actionsLeft: dayInfo(profile).actionsLeft,
  };
}

// 雀荘を 1 つ訪れた結果を記録する。wins＝オートの勝ち抜き数。
// ソウル付与＋6 パラメータ成長（勝負勘＝主／ランダム＝副・§4.6.1）＋グレーアウト＋1 行動消費。
export function visitParlor(profile, index, wins = 0, rng = Math.random) {
  const cand = rollDailyParlors(profile.dayCount ?? 1, scenarioProgressLevel(profile))[index];
  if (!cand) throw new Error("雀荘が見つかりません");
  const av = activeAvatar(profile);
  if (!av) throw new Error("マイキャラがいません");

  // 能力値上昇：勝負勘（主）＋ランダム 1 種（副）。勝つほど伸びる（負けても主は最低 +1）。
  const cur = avatarParams6(av);
  const before = { ...cur };
  const subKey = ALL_PARAMS[Math.floor(rng() * ALL_PARAMS.length)];
  const gains = {};
  const apply = (k, g) => {
    const beforeV = cur[k] || 0;
    const afterV = Math.min(PARAM_CAP, beforeV + g);
    gains[k] = (gains[k] || 0) + (afterV - beforeV);
    cur[k] = afterV;
  };
  apply("gamble", Math.max(1, (cand.paramMain || 1) + wins));
  apply(subKey, (cand.paramSub || 1) + Math.floor(wins / 2));

  const soul = Math.max(0, Math.round(cand.soulPerWin * wins));
  let p = soul > 0 ? grantSoul(profile, soul) : profile;
  p = withActiveAvatar(p, (a) => ({ ...a, params6: cur }));
  const done = Array.from(new Set([...(p.daily?.parlorsDone || []), index]));
  p = { ...p, daily: { ...(p.daily || {}), parlorsDone: done } };
  const ended = endAction(p, 0, { type: "parlor", label: cand.label, wins, soul }); // 雀荘巡り＝1 行動

  return {
    profile: ended.profile, soul, wins, candidate: cand,
    gains, before, after: { ...cur }, dayAdvanced: ended.dayAdvanced,
  };
}
