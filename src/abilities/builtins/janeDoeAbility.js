// JaneDoe(ジェーンドゥ) の能力「強制ツモ切り」 (即時効果型・apply)。
//
// 1局1回・1ゲーム2局まで。発動時に選んだ相手を、以後3巡のあいだ強制でツモ切りに
// する（ツモった牌をそのまま切らされ、リーチ・カン・打牌選択ができない）。ツモ和了
// だけは妨げない。リーチ中の相手は対象にできない（既に自動ツモ切りで意味が無く、
// またリーチ者は狙えないという制約）。
//
// 「3巡」は対象プレイヤーの forcedTsumogiri カウンタで管理し、engine が打牌のたびに
// 減らす（実体は engine 側。ここは対象の検証とカウンタ付与だけ行う）。
//
// 1局1回は active フラグで担保する（manual の active は局頭でのみ false に戻り、局中は
// true のまま＝同一局での再発動を弾く）。2局までは chargeScope:"game"/maxCharges:2。
import { Ability } from "../ability.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";

const FORCED_TURNS = 3;

export class JaneDoeAbility extends Ability {
  constructor() {
    super(abilityDef("jane-doe"));
  }

  // リーチしていない相手が1人でもいれば発動可能。
  activationCondition(api) {
    return api.opponents().some((o) => !o.riichi);
  }

  // 即時効果: params.targetIndex の相手に3巡の強制ツモ切りを付与する。対象が不正
  // （自分・存在しない・リーチ中）なら失敗（チャージ消費なし）。
  apply(game, player, params) {
    const ti = params && params.targetIndex;
    if (ti == null) return false;
    const target = game.players[ti];
    if (!target || target === player || target.riichi) return false;
    target.forcedTsumogiri = FORCED_TURNS;
    game.log(`【${player.character.name}】${target.character.name} を${FORCED_TURNS}巡のあいだ強制ツモ切りにした`);
    return true;
  }
}

registerAbility("jane-doe", () => new JaneDoeAbility());
