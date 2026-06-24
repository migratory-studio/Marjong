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

import { CLUSTER_SYNERGY, CLUSTER_META, clusterOf, cardById } from "../data/rogueliteCardMaster.js";

// バフ成長の上限（test/roguelite-balance.mjs で調整／本番は既定）。攻撃(dealCap)・防御(takeFloor)は
// run.js 側で天井あり。HP は上限なし（青天井）＝取れば必ず伸びる（「+90%で凍結＝壊れて見える」対策）。
// ランが必ず終わるのは被ダメ青天井(floorDamageMul)が担保する＝HP上限は不要（バランス実測：上限を外しても
// 到達深度の中央値は不変、伸びるのは運のいいtankランの裾のみ＝スポンジ化はしない）。hpMulCap は検証用に残す
// （null=上限なし。test 側で HPCAP env を数値指定したときだけ効く）。
export const BUFF_TUNE = {
  hpMulCap: null,      // 累積HP倍率の上限。null=上限なし（青天井）。数値を入れるとその倍率で頭打ち（掃引検証用）
  depthGrowth: 0.025,  // 深度値上がり：HP/攻撃/防御バフの付与値を 1階ごとに +この割合 増幅（深いほど強いバフ）
};
// 深度スケール：その階で取得したバフの「上乗せ部分」をどれだけ増幅するか（floor1=×1）。
function depthScale(floor) { return 1 + Math.max(0, (floor || 1) - 1) * BUFF_TUNE.depthGrowth; }

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
      // 深度値上がり：上乗せ分(mul-1)を階層で増幅（深い階で取るほど強い）。
      let mul = 1 + ((effect.mul ?? 1) - 1) * depthScale(run.floor);
      // 累積HP倍率の上限（既定 null＝上限なし）。検証用に cap が数値のときだけクランプ。
      const cap = BUFF_TUNE.hpMulCap;
      if (cap && m.hpMul * mul > cap) mul = Math.max(1, cap / m.hpMul);
      m.hpMul *= mul; // 累積HP倍率（バフ合計UIの「HP +X%」表示用）
      for (const p of run.party) {
        p.hpMax = Math.round(p.hpMax * mul);
        p.hp = Math.round(p.hp * mul); // 現在HPも同率で底上げ（取得が即得になる）
      }
      break;
    }
    case "maxHpAdd": {
      // 絶対値（固定HP点）でHP最大を底上げ。深度値上がりで額は増えるが線形＝複利爆発しない。
      // add は基礎HPスケール(allyScaledHp 基準＝25000点が1000HP)での点数。割合(maxHpUp)と棲み分け：
      // common/rare はこちら（積んでも指数的に膨らまない地力）、epic+ は maxHpUp（希少な割合スパイク）。
      const add = Math.round((effect.add ?? 0) * depthScale(run.floor));
      if (add > 0) {
        m.hpAdd = (m.hpAdd || 0) + add; // 累積（バフ合計UI表示用）
        for (const p of run.party) { p.hpMax += add; p.hp += add; } // 現在HPも同量底上げ（取得が即得）
      }
      break;
    }
    case "dealMul":
      m.dealMul *= 1 + ((effect.mul ?? 1) - 1) * depthScale(run.floor); // 深度値上がり
      break;
    case "takeReduce":
      m.takeMul *= 1 - (effect.rate ?? 0) * depthScale(run.floor); // 軽減も深度で増幅（1-r の積＝重ね取りが逓減）
      break;
    case "friendlyGuard": // 味方のツモで受けるダメージを無効化する“お守り”（受けたら1個消費）
      m.friendlyGuard = (m.friendlyGuard || 0) + (effect.count ?? 1);
      break;
    // 条件付き（動的）バフ：値を積むだけ。実際の効きは main.js のダメージ計算時に状況で評価。
    case "streakDeal":  m.streakDeal  = (m.streakDeal  || 0) + (effect.per ?? 0); break;
    case "lowHpPower":  m.lowHpPower  = (m.lowHpPower  || 0) + (effect.power ?? 0); break;
    case "revengeDeal": m.revengeDeal = (m.revengeDeal || 0) + (effect.bonus ?? 0); break;
    case "riichiDeal":  m.riichiDeal  = (m.riichiDeal  || 0) + (effect.bonus ?? 0); break;
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
  // 流派（クラスター）集計：cluster タグ付きカードは clusterCount を積む（提案A・しきい値シナジー用）。
  const cl = clusterOf(card);
  if (cl) {
    if (!run.mods.clusterCount) run.mods.clusterCount = {};
    run.mods.clusterCount[cl] = (run.mods.clusterCount[cl] || 0) + 1;
  }
  run.cards.push(card.id);
  return run;
}

// run.cards から clusterCount を再集計する（単一情報源＝取得履歴）。カード除去（必殺技の忘却など）の後に
// 呼べば desync しない＝しきい値のオーバーカウントを構造的に防ぐ。applyCard の加算経路とも矛盾しない。
export function recomputeClusterCount(run) {
  if (!run?.mods) return run;
  const cc = {};
  for (const id of run.cards || []) { const cl = clusterOf(cardById(id)); if (cl) cc[cl] = (cc[cl] || 0) + 1; }
  run.mods.clusterCount = cc;
  return run;
}

// 流派シナジーの記述子（.tiers を持つもの＝deal/takeCap 等）を1つ取り出す。種類はキー名で分岐する。
function synDescriptor(syn) {
  for (const v of Object.values(syn || {})) if (v && Array.isArray(v.tiers)) return v;
  return null;
}

// 流派シナジー（攻め）：対局中の与ダメ倍率を返す（1=効果なし）。
//   ctx … 発火フラグ（main.js が立てる）。例：{ flushWin: true }＝染め手で和了した局。
// 各流派の deal シナジーについて、発火条件(trigger)が立っていれば、
// 達成しているしきい値段(at<=count)の最大 bonus を採用（累積しない＝段で跳ねる）。
export function clusterDealMul(run, ctx = {}) {
  const counts = run?.mods?.clusterCount || {};
  let mul = 1;
  for (const [cl, syn] of Object.entries(CLUSTER_SYNERGY)) {
    const deal = syn?.deal;
    if (!deal || !ctx[deal.trigger]) continue;
    const count = counts[cl] || 0;
    let best = 0;
    for (const t of deal.tiers || []) if (count >= t.at && t.bonus > best) best = t.bonus;
    if (best > 0) mul *= 1 + best;
  }
  return mul;
}

// 流派シナジー（守り）：1局あたり被ダメ上限（最大HP比）。達成段の中で最も低い cap を返す（＝最も固い）。
// 該当なしは null（＝深度由来の既定 lethalCapFrac をそのまま使う）。run.js の被ダメ層が min を取る。
export function clusterTakeCapFrac(run) {
  const counts = run?.mods?.clusterCount || {};
  let cap = null;
  for (const [cl, syn] of Object.entries(CLUSTER_SYNERGY)) {
    const tc = syn?.takeCap;
    if (!tc) continue;
    const count = counts[cl] || 0;
    for (const t of tc.tiers || []) if (count >= t.at && (cap == null || t.cap < cap)) cap = t.cap;
  }
  return cap;
}

// ドラフト時の意思決定支援（提案A・スライス5）：このカードを取ると流派がどう動くか。
//   返り: { cluster, label, awaken, from, to, crosses(取ると新たにしきい値到達), nextAt } / 無所属は null。
// 「取ると【開眼】」「開眼まであと1」を出すための素。研究の核 P4「考えて選ぶ」を支える。
export function clusterPickPreview(run, card) {
  const cl = clusterOf(card); if (!cl) return null;
  const desc = synDescriptor(CLUSTER_SYNERGY[cl]); if (!desc) return null;
  const tiers = (desc.tiers || []).map((t) => t.at).sort((a, b) => a - b);
  const from = run?.mods?.clusterCount?.[cl] || 0;
  const to = from + 1;
  const crosses = tiers.includes(to);               // 取るとちょうどしきい値に到達
  const nextAt = tiers.find((at) => to < at) ?? null; // 取った後の次のしきい値
  const meta = CLUSTER_META[cl] || {};
  return { cluster: cl, label: meta.label || cl, color: meta.color, awaken: meta.awaken || "開眼", from, to, crosses, nextAt };
}

// 博打系シナジー（守り takeCap の真逆）：1局あたり被ダメ上限(最大HP比)に上乗せする量。
// 達成段の最大 add を返す（0=なし）。run.js が baseCap に足す＝大振り（高分散）。
export function clusterTakeRaiseFrac(run) {
  const counts = run?.mods?.clusterCount || {};
  let add = 0;
  for (const [cl, syn] of Object.entries(CLUSTER_SYNERGY)) {
    const tr = syn?.takeRaise; if (!tr) continue;
    const count = counts[cl] || 0;
    for (const t of tr.tiers || []) if (count >= t.at && t.add > add) add = t.add;
  }
  return add;
}

// UI/legible用：流派ごとの達成状況（現在枚数・次のしきい値・開眼済み段数）。
// docs §4.3「【染め】3枚で開眼（あと1枚）」表示の素。攻め/守りどちらの流派も同じ形で返す。
export function clusterProgress(run) {
  const counts = run?.mods?.clusterCount || {};
  const out = [];
  for (const [cl, syn] of Object.entries(CLUSTER_SYNERGY)) {
    const count = counts[cl] || 0;
    const desc = synDescriptor(syn);
    const tiers = (desc?.tiers || []).map((t) => t.at).sort((a, b) => a - b);
    const nextAt = tiers.find((at) => count < at) ?? null;
    const reached = tiers.filter((at) => count >= at).length;
    const max = tiers[tiers.length - 1] || 0;
    if (count > 0 || reached > 0) out.push({ cluster: cl, label: CLUSTER_META[cl]?.label || cl, count, nextAt, reached, tiers, max });
  }
  return out;
}

// run.mods の初期値（newRun から呼ぶ）。
export function freshMods() {
  return {
    dealMul: 1, // 与ダメ倍率（積）
    takeMul: 1, // 被ダメ倍率（積＝1-軽減率の積）
    hpMul: 1,   // 累積HP倍率（割合・epic+ の maxHpUp で積む。バフ合計UI用）
    hpAdd: 0,   // 累積HP加算（絶対値・common/rare の maxHpAdd で積む。線形＝複利しない）
    friendlyGuard: 0, // 味方ツモ被弾を無効化するお守りの残数（アイテム）
    skillLevelDelta: 0, // 能力Lv一時加算
    paramAdd: {}, // params6 加算
    benchSlots: 0, // 控え枠の追加数
    grantedAbilityIds: [], // 付与する能力id
    clusterCount: {}, // 流派（クラスター）ごとの取得枚数（提案A・しきい値シナジー用）
    // 条件付き（動的）バフ＝対局中の状況で効く。main.js のダメージ計算時に評価する。
    streakDeal: 0,  // 波に乗る：連勝1につき与ダメ +この割合
    lowHpPower: 0,  // 火事場：HPが低いほど与ダメ↑＆被ダメ↓（この係数）
    revengeDeal: 0, // 倍返し：前局に味方が被弾していたら次の和了で与ダメ +この割合
    riichiDeal: 0,  // 背水：リーチ中の和了で与ダメ +この割合
  };
}
