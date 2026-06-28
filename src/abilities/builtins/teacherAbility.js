// 灯子（先生）の能力「模範解答」— passive（常時発動・PROVIDE_BEST_DISCARDS フック）。
//
// 手牌が2シャンテン以上のとき、牌効率上もっとも有効な打牌の候補トップ3を求めて
// UI に渡す（手牌へ ①②③ を灯す）。イーシャンテン／聴牌（shanten ≤ 1）では効果が消え、
// 手が崩れて2シャンテン以下に戻ると再び現れる——「正解が一意に定まる序盤だけ寄り添い、
// 勝負所は自分で打たせる」家庭教師の設計。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";
import { shanten } from "../../core/rules/shanten.js";

// 牌効率による打牌ランキング。concealed の counts（array[34]）と副露面子数 numMelds から、
// 「各牌 d を切ったときの (シャンテン, 受け入れ種類数)」を評価し、
//   シャンテン昇順 → 受け入れ降順 → kind 昇順
// でソートした配列 [{ kind, shanten, ukeire }] を返す。
// ※ ukeire は「シャンテンを進める有効牌の種類数」（zero-search の breadth と同じ流儀）。
export function bestDiscardRanking(counts, numMelds = 0) {
  const c = counts.slice();
  const evals = [];
  for (let d = 0; d < 34; d++) {
    if (c[d] === 0) continue;
    c[d]--; // 打牌 d（残り手牌）
    const sh = shanten(c, numMelds);
    let ukeire = 0;
    for (let k = 0; k < 34; k++) {
      if (c[k] >= 4) continue;
      c[k]++;
      if (shanten(c, numMelds) < sh) ukeire++;
      c[k]--;
    }
    c[d]++;
    evals.push({ kind: d, shanten: sh, ukeire });
  }
  evals.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || a.kind - b.kind);
  return evals;
}

export class ModelAnswerAbility extends Ability {
  constructor() {
    super(abilityDef("model-answer"));
  }

  [Hooks.PROVIDE_BEST_DISCARDS](ctx, api) {
    if (!this.isActive) return undefined; // passive => 常時発動
    const p = api.me;
    const counts = p.counts();
    // 打牌を決める局面（ツモ番＝手牌が 3n+2 枚）でのみ意味を持つ。
    // 待ち中（3n+1 枚）や他家手番では候補を出さない。
    let total = 0;
    for (let i = 0; i < counts.length; i++) total += counts[i];
    if (total % 3 !== 2) return undefined;

    const numMelds = p.numMeldSets();
    const ranked = bestDiscardRanking(counts, numMelds);
    if (ranked.length === 0) return undefined;

    // 効果が出るのは2シャンテン以上のときだけ（イーシャンテン／聴牌では消える）。
    // 手の実シャンテン＝最良打牌後のシャンテン（ranked 先頭）。
    if (ranked[0].shanten < 2) return undefined;

    return ranked.slice(0, 3).map((e, i) => ({ kind: e.kind, rank: i + 1 }));
  }
}

registerAbility("model-answer", () => new ModelAnswerAbility());
