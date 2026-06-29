// キャラクター定義の薄いアクセサ。
//
// 実データは src/data/characterMaster.js（キャラマスタ）にある。ここはマスタを
// 読み出して、能力インスタンス化などのヘルパを提供するだけ。
//   - キャラを足す/直す → characterMaster.js を編集
//   - 能力を足す/直す   → src/abilities/builtins/ + src/data/abilityMaster.js
import "../abilities/builtins/index.js";
import { createAbility } from "../abilities/registry.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { getMobById } from "../data/mobMaster.js";
import { skillRuntimeAbilityParams } from "../data/skillLevelMaster.js";

// デバッグ専用: 栞の能力「模範解答」のスキルLvを強制する（1〜10・null=既定=Lv5）。
// DEBUG メニューから設定し、次の対局の能力生成（instantiateAbilities）時に反映される。
// 通常の育成導線が栞に無いため、Lv1〜4・Lv6〜10 を実機で確認するための足場。
let _modelAnswerLvOverride = null;
export function setModelAnswerLevelOverride(lv) {
  _modelAnswerLvOverride = (lv == null) ? null : Math.max(1, Math.min(10, lv | 0));
}
export function getModelAnswerLevelOverride() { return _modelAnswerLvOverride; }

// CHARACTERS はフリー対戦の選択肢・ランダム補充の母集団。モブ（isMob）はここに含めない
// ことで「フリー対戦では選べない」を自動的に満たす。getCharacter だけはモブ id にも
// フォールバックし、シナリオ/デバッグからモブを引けるようにする。
export const CHARACTERS = CHARACTER_MASTER;

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || getMobById(id) || undefined;
}

// キャラの能力をフレッシュなインスタンスとして生成（プレイヤーごとに別個体が必要）。
// マスタの abilities[].params をそのまま能力に渡し、キャラ別チューニングを可能にする。
export function instantiateAbilities(character) {
  return character.abilities.map((a) => {
    // デバッグ: 栞の模範解答だけ、Lv強制が設定されていれば lv-model-answer の params を被せる。
    if (a.abilityId === "model-answer" && _modelAnswerLvOverride != null) {
      const p = skillRuntimeAbilityParams("lv-model-answer", _modelAnswerLvOverride);
      return createAbility("model-answer", { ...(a.params || {}), ...p });
    }
    return createAbility(a.abilityId, a.params);
  });
}
