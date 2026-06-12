// 凌雲(リン・ユン) の能力「琥珀の盾」(hooks: MODIFY_POINT_DELTA, ON_WIN)。
//
// 常時発動のパッシブ。閾値（既定＝満貫）以上の放銃・被ツモを受けたとき、盾を1枚
// 消費して失点を0にする（致命の一撃だけを受け止める）。閾値未満の小さな手では
// 盾が剥がれる（失点は満額／育成 Lv7+ で半額に抑える）。盾は「ゲームを通しての
// 持続資源」で、毎局リセットしない。補充は超越帯（Lv6+）の自分の和了でのみ。
//
// 失点を0/半額にした「軽減ぶん」は勝者にも渡らない（_settle が軽減ぶんを勝者の
// 獲得から差し引く＝ビビ「身代わり人形」と同じ会計）。点棒は HP 扱いだが、盾で
// 受け切られたぶんは宙に消える＝相手も得をしない。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

// ランク順序。満貫未満（rank が空/undefined）は最弱の 0。役満は文字列でも
// isYakuman フラグでも拾えるよう両対応にする（score.js は "役満"/"数え役満"/"N倍役満"）。
const RANK_ORDER = { "": 0, 満貫: 1, 跳満: 2, 倍満: 3, 三倍満: 4, 役満: 5, 数え役満: 5 };
const TIER_RANK = { mangan: 1, haneman: 2, baiman: 3 };

// res の rank 文字列（＋ isYakuman）を 0〜5 の順位値へ。役満系の表記揺れ（"2倍役満"等）も役満扱い。
function rankValue(resRank, isYakuman) {
  if (isYakuman) return 5;
  if (resRank && resRank.includes("役満")) return 5;
  return RANK_ORDER[resRank ?? ""] ?? 0;
}

// 勝ち手のランク（rank/isYakuman）が tier 閾値以上か。"mangan"=満貫以上 /
// "haneman"=跳満以上 / "baiman"=倍満以上（三倍満・役満も含む）。満貫未満は常に false。
function rankAtLeast(resRank, isYakuman, tier) {
  return rankValue(resRank, isYakuman) >= (TIER_RANK[tier] ?? 1);
}

// runtimeParams（skillLevelMaster lv-amber-shield。既定＝Lv5 相当＝フリー対戦の凌雲）:
//   maxShields      … 盾の最大枚数（持続資源・1ゲーム通し。既定 1）
//   protectTier     … 受け切る閾値 "mangan"|"haneman"|"baiman"（既定 "mangan"）
//   coverTsumo      … 被ツモもカバーするか（既定 true。false＝ロンのみ）
//   stripMitigation … 閾値未満で剥がれるときの失点軽減 0〜0.5（既定 0＝満額）
//   regen           … 和了で盾を補充するルール配列。要素 {minRank?, minWinPoints?, amount}
//                      （超越帯 Lv6+。基準帯は空＝補充なし）
export class AmberShieldAbility extends Ability {
  constructor(params = {}) {
    super({ ...abilityDef("amber-shield"), ...params });
    this.maxShields = params.maxShields ?? 1;
    this.protectTier = params.protectTier ?? "mangan";
    this.coverTsumo = params.coverTsumo ?? true;
    this.stripMitigation = params.stripMitigation ?? 0;
    this.regen = params.regen ?? [];
    this.shields = this.maxShields;
  }

  // 局をまたいでも盾は持続する＝resetForHand では shields を触らない（super のみ）。
  resetForHand() {
    super.resetForHand();
  }
  // 新しいゲームの開始でのみ満タンに戻す（持続資源のリセットはゲーム単位）。
  resetForGame() {
    super.resetForGame();
    this.shields = this.maxShields;
  }

  // 自分の失点（ロン放銃・被ツモ）を盾で受け止める／剥がれる。得点（delta>=0）は対象外。
  [Hooks.MODIFY_POINT_DELTA](ctx, api, delta) {
    if (delta >= 0) return undefined;
    const reason = ctx.reason;
    if (reason !== "ron" && reason !== "tsumo") return undefined; // 流局罰符などは対象外
    // ロンは常にカバー。ツモは coverTsumo のときだけ。非カバーは盾を温存して通常失点。
    const covered = reason === "ron" || (reason === "tsumo" && this.coverTsumo);
    if (!covered) return undefined;
    if (this.shields <= 0) return undefined; // 盾なし＝通常失点

    // 勝ち手のランクは _settle の meta から（B でエンジンが ctx.rank/isYakuman を載せる）。
    const big = rankAtLeast(ctx.rank, ctx.isYakuman, this.protectTier);
    if (big) {
      // 閾値以上の大物手＝盾を1枚消費して受け切る（失点0・勝者の取り分は _settle が差し引く）。
      this.shields--;
      api.log(`「ここは退かぬ」——琥珀の盾が大物手を受け切った（失点0）`);
      return 0;
    }
    // 閾値未満の小さな手＝盾が剥がれる。stripMitigation>0 なら失点を軽減（100点丸め）。
    this.shields--;
    const out = Math.round((delta * (1 - this.stripMitigation)) / 100) * 100;
    if (this.stripMitigation > 0) {
      api.log(`「半分は、受ける」——盾が砕けつつ痛みを半分に抑えた`);
    } else {
      api.log(`「……削られたか」——琥珀の盾が剥がれた`);
    }
    return out;
  }

  // 超越帯（Lv6+）: 自分の和了で盾を編み直す。満タンなら何もしない。
  [Hooks.ON_WIN](ctx, api) {
    if (ctx.winner !== api.me) return;
    if (this.shields >= this.maxShields) return;
    if (this.regen.length === 0) return;
    const res = ctx.result;
    if (!res) return;
    const rank = res.rank;
    const isYakuman = !!res.isYakuman;
    // 総獲得点＝res.total（無ければツモ精算から合算）。
    const won = res.total ?? (
      res.tsumoEach
        ? (res.tsumoEach.nonDealer ?? 0) * 2 + (res.tsumoEach.dealer ?? res.tsumoEach.nonDealer ?? 0)
        : (res.ron ?? 0)
    );
    // 満たすルールの amount の最大値を採用。
    let add = 0;
    for (const rule of this.regen) {
      if (rule.minRank != null && !rankAtLeast(rank, isYakuman, rule.minRank)) continue;
      if (rule.minWinPoints != null && !(won >= rule.minWinPoints)) continue;
      if ((rule.amount ?? 0) > add) add = rule.amount;
    }
    if (add > 0) {
      this.shields = Math.min(this.maxShields, this.shields + add);
      api.log(`「攻めることも、護りだ」——一撃が琥珀を編み直した（盾＋${add}）`);
    }
  }
}

registerAbility("amber-shield", (params) => new AmberShieldAbility(params));
