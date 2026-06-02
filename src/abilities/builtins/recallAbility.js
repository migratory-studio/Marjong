// エージェント・RE の能力「リコール・ディール」。
//
// フック型ではなく「即時効果型」の手動能力。発動時に状態を直接書き換えるため、
// MODIFY_* のようなスレッド型フックは持たず、engine が activateAbility() の中で
// 呼ぶ apply() で交換処理を行う（実際の牌の出し入れ・整合は engine 側に委譲）。
//
// 効果（1局1回）:
//   - 今ツモった牌 T を自分の河へ置く（その牌は他家にロンされない＝ronImmune）。
//   - 代わりに、自分が以前に捨てた河の牌 R を1枚、手牌へ戻す。
//   - 手牌は14枚のままなので、交換後はそのまま通常打牌でターンを終える。
//   - テンパイ時は発動不可（交換した結果テンパイになるのはOK）。
import { Ability } from "../ability.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";
import { shanten } from "../../core/rules/shanten.js";

export class RecallDealAbility extends Ability {
  constructor() {
    super(abilityDef("recall-deal"));
  }

  // 発動できる条件: 自分のツモ牌があり、河に戻せる牌が1枚以上あり、かつ「テンパイ
  // でない」こと。判定時の手牌は14枚（ツモ牌込み）なので、shanten>0 がそのまま
  // 「アガってもいないしテンパってもいない（＝交換の余地がある）」を意味する。
  activationCondition(api) {
    const p = api.me;
    if (p.drawnTileId == null) return false; // 鳴き後など、ツモ牌が無いときは不可
    if (!p.discards || p.discards.length === 0) return false; // 戻せる河の牌が無い
    return shanten(p.counts(), p.numMeldSets()) > 0;
  }

  // 即時効果: 交換の実体は engine が一元管理する（牌の出し入れ・ロン不可マーク・
  // 手牌ソート）。params.riverTileId は戻したい河の牌の id（人間はUIで選択、CPUは
  // AIが選ぶ）。成功時 true。失敗時は engine 側でチャージを消費しない。
  apply(game, player, params) {
    return game.recallSwap(player, params && params.riverTileId);
  }
}

registerAbility("recall-deal", () => new RecallDealAbility());
