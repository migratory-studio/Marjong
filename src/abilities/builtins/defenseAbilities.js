// Defensive abilities (hook: PROVIDE_DANGER_INFO).
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

// 危険度レベル: 3=超危険(赤) / 2=危険(橙) / 1=警戒(黄)。UI はこの値で色分けする。
export const DANGER_SUPER = 3;
export const DANGER_HIGH = 2;
export const DANGER_WARN = 1;

// "危険牌マーキング" — 各牌が「あたり牌である可能性」を見積もり、3段階で返す。
// 相手のリーチ/鳴き、現物（安全）、スジ、牌種（中張ほど危険・端/字は低め）から
// あたり率を推定し、しきい値で 超危険/危険/警戒 の3段階に量子化する。
// UI はこの level を読み、手牌に赤/橙/黄の警告を重ねる。
export class DangerSenseAbility extends Ability {
  constructor() {
    super(abilityDef("danger-sense"));
  }

  [Hooks.PROVIDE_DANGER_INFO](ctx, api) {
    if (!this.isActive) return undefined; // passive => always active
    return estimateDangerInfo(api.opponents());
  }
}

// 危険度推定の本体。脅威（リーチ/鳴きあり）の各相手に対して、現物を除く全34種の
// あたり率を推定し3段階に量子化して返す。マモリ（danger-sense）のほか、超越帯の
// 幸運のツモ（lucky-draw の dangerTier 副次付与・§10.5 Lv6+）が共用する。
export function estimateDangerInfo(opponents) {
  const threats = opponents.filter((p) => p.riichi || p.melds.length > 0);
  if (threats.length === 0) return [];

  const out = [];
  for (let kind = 0; kind < 34; kind++) {
    let risk = 0; // あたり率の推定（0..1）。脅威ごとの最大を採る。
    for (const opp of threats) {
      // genbutsu: if the opponent already discarded this kind, it's safe vs them.
      if (opp.discards.some((t) => t.kind === kind)) continue;
      // base threat: riichi is scarier than open melds
      const base = opp.riichi ? 0.6 : 0.35;
      risk = Math.max(risk, base * shapeFactor(kind) * sujiFactor(opp, kind));
    }
    const level = quantizeDanger(risk);
    if (level > 0) out.push({ kind, level });
  }
  return out;
}

// あたり率を3段階に量子化する。
export function quantizeDanger(risk) {
  if (risk >= 0.55) return DANGER_SUPER; // 超危険（赤）
  if (risk >= 0.32) return DANGER_HIGH;  // 危険（オレンジ）
  if (risk > 0) return DANGER_WARN;      // 警戒（黄）
  return 0;
}

// 牌種ごとのあたり率係数。中張（4〜6）が最も危険、端に向かうほど・字牌は低め。
export function shapeFactor(kind) {
  if (kind >= 27) return 0.85; // 字牌: スジ無し、タンキ/シャンポン待ち
  const rank = (kind % 9) + 1;
  if (rank === 1 || rank === 9) return 0.5;
  if (rank === 2 || rank === 8) return 0.7;
  if (rank === 3 || rank === 7) return 0.9;
  return 1.0; // 4・5・6
}

export function sujiFactor(opp, kind) {
  if (kind >= 27) return 1; // honors: no suji
  const rank = (kind % 9) + 1;
  const suitBase = kind - (rank - 1);
  const discardedRank = (r) =>
    r >= 1 && r <= 9 && opp.discards.some((t) => t.kind === suitBase + (r - 1));
  // classic suji: 4/5/6 safer if 1/7,2/8,3/9 etc. discarded — simplified.
  if (rank >= 4 && rank <= 6) {
    if (discardedRank(rank - 3) && discardedRank(rank + 3)) return 0.4;
    if (discardedRank(rank - 3) || discardedRank(rank + 3)) return 0.7;
  }
  return 1;
}

registerAbility("danger-sense", () => new DangerSenseAbility());
