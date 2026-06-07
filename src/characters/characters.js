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
  return character.abilities.map((a) => createAbility(a.abilityId, a.params));
}
