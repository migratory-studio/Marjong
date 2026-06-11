// シナリオ解放条件の評価 — major_update_specification.md §12.4 / Phase 3。
//
// プロフィール（＋アクティブなマイキャラ）から解放判定コンテキストを作り、
// シナリオの unlockConditions（AND）を評価する純粋関数群。DOM 非依存。
//
// 対応する条件型（scenarioMaster の unlockConditions / vocab）:
//   always / bond_level / avatar_level / skill_level /
//   ability_changed_count / scenario_read / scenario_read_prev_month / tournament_won
//
// scenario_read_prev_month ＝「対象の章を読了し、かつ読了の翌月以降」。フィナーレ直後に
// 次章へ一気見させず、ひと月の余韻を置くためのクールダウン（旧セーブで readDay が無い
// 既読は通過扱い＝後方互換）。
//
// tournament_won は大会システム（後続フェーズ）の優勝カウンタ records.tournamentsWon を
// 参照する。未実装の現状は 0 とみなされるため、そのゲートを持つシナリオはロック表示になる。
import { activeAvatar } from "../progression/avatarFactory.js";

// プロフィールから解放判定に必要な値を一括で取り出す。
export function buildUnlockContext(profile) {
  const av = activeAvatar(profile) || {};
  const progress = profile?.scenarioProgress || [];
  const readIds = new Set(progress.map((p) => p.scenarioId));
  const readDays = {};
  for (const p of progress) { if (p.readDay != null) readDays[p.scenarioId] = p.readDay; }
  return {
    bondLevel: av.bondLevel ?? 1,
    avatarLevel: av.avatarLevel ?? 1,
    skillLevel: av.skillLevel ?? 1,
    abilityChangedCount: av.abilityChangedCount ?? 0,
    tournamentWon: profile?.records?.tournamentsWon ?? 0,
    readIds,
    readDays,
    dayCount: profile?.dayCount ?? 1,
  };
}

// 条件型 → 表示ラベル（未達条件の説明に使う）。
const LABELS = {
  always: () => "",
  bond_level: (v) => `親密度 Lv${v} 以上`,
  avatar_level: (v) => `キャラ Lv${v} 以上`,
  skill_level: (v) => `スキル Lv${v} 以上`,
  ability_changed_count: (v) => `能力変更 ${v} 回以上`,
  tournament_won: (v) => `大会優勝 ${v} 回`,
  scenario_read: (v, titleOf) => `「${(titleOf && titleOf(v)) || v}」を読む`,
  scenario_read_prev_month: (v, titleOf) => `「${(titleOf && titleOf(v)) || v}」を読んだ翌月から`,
};

// 1 条件を評価して { ok, label } を返す。titleOf は scenario_read のタイトル解決（任意）。
export function evalCondition(cond, ctx, titleOf) {
  const t = cond?.type;
  let ok = false;
  switch (t) {
    case "always": ok = true; break;
    case "bond_level": ok = ctx.bondLevel >= cond.value; break;
    case "avatar_level": ok = ctx.avatarLevel >= cond.value; break;
    case "skill_level": ok = ctx.skillLevel >= cond.value; break;
    case "ability_changed_count": ok = ctx.abilityChangedCount >= cond.value; break;
    case "tournament_won": ok = ctx.tournamentWon >= cond.value; break;
    case "scenario_read": ok = ctx.readIds.has(cond.value); break;
    case "scenario_read_prev_month": {
      const readDay = ctx.readDays?.[cond.value];
      ok = ctx.readIds.has(cond.value) && (readDay == null || (ctx.dayCount ?? 1) > readDay);
      break;
    }
    default: ok = false;
  }
  const label = (LABELS[t] || (() => t))(cond?.value, titleOf);
  return { ok, label };
}

// シナリオ全体の解放可否。全条件 AND。{ unlocked, unmet:[label...] } を返す。
export function evaluateUnlock(scenario, ctx, titleOf) {
  const conds = scenario?.unlockConditions?.length ? scenario.unlockConditions : [{ type: "always" }];
  const unmet = [];
  for (const c of conds) {
    const { ok, label } = evalCondition(c, ctx, titleOf);
    if (!ok) unmet.push(label || c?.type || "?");
  }
  return { unlocked: unmet.length === 0, unmet };
}
