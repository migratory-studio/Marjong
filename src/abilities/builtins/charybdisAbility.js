// カリュブディスの能力「淵の蒐集」 (常時発動 / passive)。
//
// アビス（癖キャラ）。和了を捨て、流局に全てを賭けた異形の打ち手。
//   - 常時: このキャラは和了できない（ロン・ツモともに不可）。MODIFY_CAN_WIN で弾く。
//   - 流局時: このキャラに「わたる得点」（テンパイ料などの受け取り）が3倍。
//             MODIFY_POINT_DELTA の reason 'draw' で、受け取り（delta>0）のみ×3。
//             増えた分はゼロサムを保つため支払い側（ノーテン）が負担する
//             （按分は game.js の _settle が reason 'draw' でまとめて処理）。
//   - 流し満貫が役満扱いになる。MODIFY_NAGASHI で 流し満貫(満貫) を役満へ昇格。
//
// 設計メモ: 3倍（流局テンパイ料）と 役満昇格（流し満貫）は別々の恩恵として扱い、
// 流し満貫の受け取りには3倍を重ねない（流し満貫は既に役満へ昇格済みのため）。
// 計算例（4人・流局）:
//   - カリュブディスのみ聴牌      … 他3人 -3000 ずつ / カリュブディス +9000
//   - カリュブディス＋1人 聴牌    … 他2人 -3000 ずつ / カリュブディス +4500・もう1人 +1500
//   - カリュブディス含む3人 聴牌  … ノーテン1人 -5000 / カリュブディス +3000・他2人 +1000
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const DRAW_MULT = 3;

export class CharybdisAbility extends Ability {
  constructor() {
    super(abilityDef("abyss-collection"));
  }

  // 和了を禁止（常時）。ロン・ツモのどちらでも false を返す。
  [Hooks.MODIFY_CAN_WIN](_ctx, _api, _canWin) {
    if (!this.isActive) return undefined;
    return false;
  }

  // 流局でこのキャラに渡る得点（テンパイ料の受け取り）を3倍に。
  // 失う側（ノーテン罰符）や流し満貫の受け取りには掛けない。
  [Hooks.MODIFY_POINT_DELTA](ctx, api, delta) {
    if (!this.isActive) return undefined;
    if (ctx.reason !== "draw" || delta <= 0) return undefined;
    const boosted = delta * DRAW_MULT;
    api.log(`淵の蒐集：流局の受け取りが${DRAW_MULT}倍（${delta} → ${boosted}）`);
    return boosted;
  }

  // 流し満貫を役満扱いに昇格（支払い・表示ともに役満へ）。
  [Hooks.MODIFY_NAGASHI](ctx, api, res) {
    if (!this.isActive || !res) return undefined;
    const honbaEach = (api.state.honba || 0) * 100;
    const out = { ...res };
    if (ctx.player.isDealer) {
      const each = 16000 + honbaEach; // 親役満ツモ: 16000オール
      out.tsumoEach = { nonDealer: each };
      out.total = each * 3;
    } else {
      const fromDealer = 16000 + honbaEach; // 子役満ツモ: 8000/16000
      const fromNon = 8000 + honbaEach;
      out.tsumoEach = { dealer: fromDealer, nonDealer: fromNon };
      out.total = fromDealer + fromNon * 2;
    }
    out.yaku = [];
    out.yakuman = [{ name: "流し満貫", times: 1 }];
    out.isYakuman = true;
    out.rank = "役満";
    out.yakuHan = 0;
    out.totalHan = 13;
    out.fu = 0;
    api.log("淵の蒐集：流し満貫を役満として扱う");
    return out;
  }
}

registerAbility("abyss-collection", () => new CharybdisAbility());
