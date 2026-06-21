// ローグライト・カード効果リゾルバ — docs/shitei-calendar-and-roguelite.md「B. ローグライト」。
//
// rogueliteCardMaster.js のカード定義（effect.kind）を、ラン状態（run.js の RogueliteRun）へ
// 当て込む“唯一の場所”。マスタは定義だけ・挙動はここだけ＝マスタドリブンの肝。
//
// 効果は3系統（プラン参照）:
//   即時系   … その場で run.party の hp/hpMax を動かす（heal / maxHpUp）または run.mods を積む
//              （skillLevelUp / paramBoost / addBench）。
//   戦闘数値系… run.mods.dealMul（積）/ run.mods.takeMul（積＝1-軽減率の積）へ集約。
//              対局のダメージ適用層（run.js rogueliteDamageDeltas）が参照する。
//   付与能力系… run.mods.grantedAbilityIds に積む。対局起動時に味方席へ createAbility で注入。
//
// すべて run をその場で破壊的に更新する（ランは1本の可変状態＝セーブ単位）。純粋に近い小関数群。

// 1つの effect オブジェクトを run へ適用（compound は再帰）。
export function applyEffect(run, effect) {
  if (!effect || !effect.kind) return run;
  const m = run.mods;
  switch (effect.kind) {
    case "heal": {
      const amt = effect.amount ?? 0;
      for (const p of run.party) p.hp = Math.min(p.hpMax, p.hp + Math.round(p.hpMax * amt));
      break;
    }
    case "maxHpUp": {
      const mul = effect.mul ?? 1;
      m.hpMul *= mul; // 累積HP倍率（バフ合計UIの「HP +X%」表示用）
      for (const p of run.party) {
        p.hpMax = Math.round(p.hpMax * mul);
        p.hp = Math.round(p.hp * mul); // 現在HPも同率で底上げ（取得が即得になる）
      }
      break;
    }
    case "dealMul":
      m.dealMul *= effect.mul ?? 1;
      break;
    case "takeReduce":
      m.takeMul *= 1 - (effect.rate ?? 0); // 軽減は乗算で重ねる（1-r の積＝重ね取りが逓減）
      break;
    case "friendlyGuard": // 味方のツモで受けるダメージを無効化する“お守り”（受けたら1個消費）
      m.friendlyGuard = (m.friendlyGuard || 0) + (effect.count ?? 1);
      break;
    case "skillLevelUp":
      m.skillLevelDelta += effect.delta ?? 0; // 後方互換（集計）
      if (run.skillLevel != null) run.skillLevel = Math.min(10, run.skillLevel + (effect.delta ?? 0)); // パーティのスキルLvを上げる（能力強化）
      break;
    case "paramBoost": {
      const k = effect.param;
      if (k) m.paramAdd[k] = (m.paramAdd[k] || 0) + (effect.add ?? 0);
      break;
    }
    case "addBench":
      m.benchSlots += 1;
      break;
    case "grantAbility":
      if (effect.abilityId && !m.grantedAbilityIds.includes(effect.abilityId)) {
        m.grantedAbilityIds.push(effect.abilityId);
      }
      break;
    case "compound":
      for (const part of effect.parts || []) applyEffect(run, part);
      break;
    default:
      // 未知 kind は無視（マスタ先行・配線後追いを許容）。
      break;
  }
  return run;
}

// カード1枚を run へ適用し、取得履歴へ記録する。
export function applyCard(run, card) {
  if (!card) return run;
  applyEffect(run, card.effect);
  run.cards.push(card.id);
  return run;
}

// run.mods の初期値（newRun から呼ぶ）。
export function freshMods() {
  return {
    dealMul: 1, // 与ダメ倍率（積）
    takeMul: 1, // 被ダメ倍率（積＝1-軽減率の積）
    hpMul: 1,   // 累積HP倍率（バフ合計UI用・maxHpUpで積む）
    friendlyGuard: 0, // 味方ツモ被弾を無効化するお守りの残数（アイテム）
    skillLevelDelta: 0, // 能力Lv一時加算
    paramAdd: {}, // params6 加算
    benchSlots: 0, // 控え枠の追加数
    grantedAbilityIds: [], // 付与する能力id
  };
}
