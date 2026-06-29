// 篠宮 栞（先生）の能力「模範解答」— passive（常時発動・PROVIDE_BEST_DISCARDS フック）。
//
// 手牌が shantenThreshold 以上のとき、牌効率上もっとも有効な打牌の候補トップ candidateCount を
// 求めて UI に渡す（手牌へ ①②③… を灯す）。テンパイへ近づくと（実シャンテン < threshold で）
// 効果が消え、手が崩れて再び深くなると現れる——「正解が一意に定まる序盤だけ寄り添い、
// 勝負所は自分で打たせる」家庭教師の設計。
//
// スキル Lv（lv-model-answer）で精度が伸びる。runtimeParams（コンストラクタ params）:
//   candidateCount    … 灯す候補数（既定3＝Lv5）
//   shantenThreshold  … 効果が残る最小シャンテン（既定2＝Lv5。3/2/1 と下がるほど勝負所まで寄り添う）
//   showComeback      … Lv7+：トップ捲り条件を卓上HUDに板書（PROVIDE_COMEBACK_PLAN）
//   showPushFold      … Lv10：押し引き判断を表示（PROVIDE_PUSHFOLD）
// 既定値はフリー対戦の栞＝Lv5 相当（候補3・2シャンテン以上・捲り/押し引きなし）。
import { Ability } from "../ability.js";
import { Hooks } from "../hooks.js";
import { registerAbility } from "../registry.js";
import { abilityDef } from "../../data/abilityMaster.js";
import { shanten } from "../../core/rules/shanten.js";
import { estimateDangerInfo, DANGER_SUPER } from "./defenseAbilities.js";

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

// 必要打点 points を「満貫級（8000点〜）」のような板書フレーズに変換する。
// 満貫(8000)以上は役級名つき、未満は素点だけ。directや tsumo の必要打点を読みやすく見せる。
const RANK_BRACKETS = [
  [32000, "役満"], [24000, "三倍満"], [16000, "倍満"], [12000, "跳満"], [8000, "満貫"],
];
function rankPhrase(points) {
  for (const [v, name] of RANK_BRACKETS) {
    if (points >= v) return `${name}級（${points.toLocaleString()}点〜）`;
  }
  return `${points.toLocaleString()}点〜`;
}
const ceil100 = (n) => Math.ceil(n / 100) * 100;

export class ModelAnswerAbility extends Ability {
  constructor(params = {}) {
    super({ ...abilityDef("model-answer"), ...params });
    this.candidateCount = params.candidateCount ?? 3;     // 既定＝Lv5（候補3）
    this.shantenThreshold = params.shantenThreshold ?? 2; // 既定＝Lv5（2シャンテン以上で点灯）
    this.showComeback = params.showComeback ?? false;     // Lv7+
    this.showPushFold = params.showPushFold ?? false;     // Lv10
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

    // 効果が出るのは「実シャンテン（最良打牌後＝ranked 先頭）が threshold 以上」のとき。
    // threshold が下がるほど（3→2→1）テンパイ近くまで助言が残る。
    if (ranked[0].shanten < this.shantenThreshold) return undefined;

    return ranked.slice(0, this.candidateCount).map((e, i) => ({ kind: e.kind, rank: i + 1 }));
  }

  // トップ捲り条件（Lv7+）。首位との点差から「どんな和了で逆転できるか」を板書する。
  // 点はすべて100点単位。スイング（自分の増加＋相手の減少）が点差を超えれば逆転する:
  //   直撃（首位からロン）   … スイング 2V ＞ gap → 必要打点 V ＞ gap/2
  //   ツモ／出和了          … 安全側に「自分の和了点 ＞ gap」で表現（首位の支払いは余剰マージン）
  [Hooks.PROVIDE_COMEBACK_PLAN](ctx, api) {
    if (!this.showComeback) return undefined;
    const me = api.me;
    const others = api.opponents();
    if (others.length === 0) return undefined;
    const topOther = Math.max(...others.map((o) => o.points));
    const gap = topOther - me.points;
    if (gap <= 0) {
      return { leading: true, gapToTop: 0, lines: ["首位——振り込まなければ、このまま守り切れます。"] };
    }
    const direct = ceil100((gap + 1) / 2);
    const tsumo = ceil100(gap + 1);
    return {
      leading: false,
      gapToTop: gap,
      direct,
      tsumo,
      lines: [
        `首位まで ${gap.toLocaleString()}点`,
        `直撃なら ${rankPhrase(direct)}`,
        `ツモ・出和了なら ${rankPhrase(tsumo)}`,
      ],
    };
  }

  // 押し引き判断（Lv10）。自分のシャンテン・相手の脅威（リーチ/濃い危険牌）・残り山・点況から
  // 「押すべき／オリるべき／様子見」を一言で示す。閾値はヒューリスティック（栞の達観の表現）。
  [Hooks.PROVIDE_PUSHFOLD](ctx, api) {
    if (!this.showPushFold) return undefined;
    const me = api.me;
    const others = api.opponents();
    const myShanten = shanten(me.counts(), me.numMeldSets());
    const danger = estimateDangerInfo(others);
    const hasSuper = danger.some((d) => d.level >= DANGER_SUPER);
    const threat = others.some((o) => o.riichi) || hasSuper;
    const remaining = api.state?.wall?.liveRemaining ?? 999;
    const late = remaining <= 16; // 終盤（残りツモが各家4巡前後）
    const topOther = others.length ? Math.max(...others.map((o) => o.points)) : 0;
    const bigLead = me.points - topOther >= 8000;

    if (!threat) {
      return { verdict: "push", label: "押し", reason: "明確な脅威はありません。最善手で手を進めましょう。" };
    }
    if (myShanten <= 0) {
      if (bigLead && late) {
        return { verdict: "fold", label: "オリ", reason: "テンパイでも充分なリード。終盤は安全に守り切りを。" };
      }
      return { verdict: "push", label: "押し", reason: "テンパイ。ここは受けて立ち、押し返しましょう。" };
    }
    if (myShanten === 1 && !late) {
      return { verdict: "hold", label: "様子見", reason: "イーシャンテン。安全牌を残しつつ、危険牌は避けて。" };
    }
    return { verdict: "fold", label: "オリ", reason: "相手の手が見えています。深追いせず、オリましょう。" };
  }
}

registerAbility("model-answer", (params) => new ModelAnswerAbility(params));
