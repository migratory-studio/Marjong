// 楼光の館・道具（アイテム）効果リゾルバ。rogueliteItemMaster.js の定義を run へ当て込む唯一の場所。
// 循環依存を避けるため leaf モジュール（itemMaster 以外を import しない）。run を破壊的に更新する。

import { itemById, ITEM_SLOTS } from "../data/rogueliteItemMaster.js";

export { ITEM_SLOTS };

// 道具を1つ「使う」（active）。即時効果は run を直接更新、次戦効果は run.nextBattle へ仕込む。
// 戻り: { ok, action } … action='reroll' は呼び出し側(UI)で進路引き直しが必要。'consumed' は消費のみ。
export function useItem(run, itemId) {
  const idx = (run.items || []).indexOf(itemId);
  if (idx < 0) return { ok: false };
  const item = itemById(itemId);
  const e = item?.effect || {};
  let action = "consumed";
  switch (e.kind) {
    case "heal":
      for (const m of run.party) if (m.hp > 0) m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * (e.amount || 0)));
      break;
    case "skillUp":
      if (run.skillLevel != null) run.skillLevel = Math.min(10, run.skillLevel + (e.delta || 1));
      break;
    case "nextBattle":
      run.nextBattle = { ...(run.nextBattle || {}), ...(e.set || {}) };
      break;
    case "reroll":
      action = "reroll"; // 実体（進路再抽選）は main 側。run.routeReroll を増やして seed をずらす。
      run.routeReroll = (run.routeReroll || 0) + 1;
      break;
    default:
      break; // passive/trigger は「使う」対象外（保険）
  }
  run.items.splice(idx, 1); // 消費
  return { ok: true, action, item };
}

// 所持している道具のうち active（使える消費）か。passive/trigger は使用ボタンを出さない。
export function isActiveItem(itemId) {
  return itemById(itemId)?.kind === "active";
}

// 常設(passive)道具の合計効果。run.items から都度集計＝取り出すと効果も消える。
export function itemMods(run) {
  const mods = { coinMul: 1, healMul: 1, draftRarityBonus: 0, fdmReduceFrac: 0 };
  for (const id of run?.items || []) {
    const e = itemById(id)?.effect;
    if (!e || e.kind !== "passive") continue;
    if (e.coinMul) mods.coinMul *= e.coinMul;
    if (e.healMul) mods.healMul *= e.healMul;
    if (e.draftRarityBonus) mods.draftRarityBonus += e.draftRarityBonus;
    if (e.fdmReduceFrac) mods.fdmReduceFrac = Math.min(0.6, mods.fdmReduceFrac + e.fdmReduceFrac); // 緩和は最大60%
  }
  return mods;
}

// 宴会の二日酔い：酔い止め(trigger/on=banquet)を持っていれば消費して true（＝酔いを防ぐ）。
export function consumeBanquetCharm(run) {
  const id = (run?.items || []).find((x) => { const e = itemById(x)?.effect; return e?.kind === "trigger" && e.on === "banquet"; });
  if (!id) return false;
  run.items.splice(run.items.indexOf(id), 1);
  return true;
}

// 次戦効果を取り出してクリア（対局起動時に呼ぶ）。戻り値の object を launchRogueliteBattle が使う。
export function takeNextBattle(run) {
  const nb = run?.nextBattle || {};
  run.nextBattle = {};
  return nb;
}
