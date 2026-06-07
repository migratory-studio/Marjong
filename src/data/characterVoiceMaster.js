// キャラ別セリフ・マスタ — 状況に応じて「立ち絵＋メッセージウィンドウ」で流すセリフ。
//
// 仕組み（解決ロジックは src/data/voiceLines.js の pickVoiceLine）:
//   pickVoiceLine(charId, event, ctx) が、event と cond(条件) に一致する text 群から
//   1つを“ランダムに”返す。→ 同じ event/cond で複数定義すれば、そのぶん台詞が増える。
//
// ── イベント(event) と 条件(cond) の語彙 ──────────────────────────────
//   "matchStart"  対局開始        cond: なし
//   "agari"       和了            cond.scoreTier: "yakuman"(役満) | "high"(10000以上) | "low"(10000未満)
//   "damage"      被ダメージ      cond.dmgTier:  "pinch"(残りわずか) | "big"(大/8000以上) | "mid"(中/3900以上) | "small"(小)
//   "matchEnd"    対局終了        cond.rankTier: "top"(1位) | "upper"(上位) | "lower"(下位) | "bottom"(最下位)
//
// ── 局中マイクロ反応（対局の流れに沿った一言。立ち絵＝相棒の“共在感”を出す） ──
//   発火タイミングの検出は src/main.js の setupMatchTalk（自分=人間プレイヤー向け）。
//   いずれも cond: なし（必要なら後から tier を足せる）。短め推奨（バストアップのセリフ枠は小さい）。
//   "handStart"        局のはじまり（配牌直後）
//   "tenpai"           聴牌した瞬間
//   "tenpaiDrop"       聴牌をくずした／降りた
//   "tsumogiriStreak"  ツモ切りが続いている（手が動かない）
//   "handStuck"        なかなか手が進まない（シャンテンが長く変わらない＝まだ遠い）
//   "iishantenHell"    イーシャンテン地獄（一向聴のまま長く足踏み＝あと一歩が遠い）
//   "handSmooth"       さくさく進んでいる（連続で手が進んだ）
//   "lastTiles"        流局間際（山が残りわずか）
//   "swapIn"           団体戦・交代で出場（控え→出場の登場ボイス）
//   ── ペア戦・相方への局中相槌（隣で一緒に打つ相棒として、味方＝人間プレイヤーの節目に反応） ──
//   "allyHandStart"    ペア戦・局のはじまり（相棒への声かけ）
//   "allyTenpai"       ペア戦・味方が聴牌
//   "allyStuck"        ペア戦・味方が手詰まり
//   "allyLast"         ペア戦・流局間際（一緒に粘る）
//
// ── 将来の拡張条件（任意。あれば評価し、無ければ無視）───────────────────
//   cond.skillLevelMin: N  … そのキャラのスキルLvが N 以上のときだけ候補になる（追々ctxに供給）。
//   ※ 条件キーを増やすときは voiceLines.js の condMatches に1行足すだけで拡張できる。
//
// ── 文言の方針 ──────────────────────────────────────────────────────
//   1行 = 1セリフ。未実装キャラは name から自動生成したテンプレ文字列を入れている。
//   未記入セリフは grep キーワード "［テンプレ］" で一括検索できる。
//
import { CHARACTER_MASTER } from "./characterMaster.js";
// scenario-forge で量産した局中・対局セリフ（dist/voiceLineMaster.js をコピーしたもの）。
// キャラ別 { event, cond, text } 配列。EXPLICIT にマージして使う（下記）。
import { VOICE_LINE_MASTER } from "./voiceLineMaster.js";

// セリフ1件を作る小ヘルパー。
const L = (event, cond, text) => ({ event, cond, text });

// 未実装キャラ用テンプレ群（name から全イベント・全条件ぶんを自動生成）。
// grep 用キーワード "［テンプレ］" を必ず先頭に付ける。
function templateLines(name) {
  const t = (label) => `［テンプレ］${name}・${label}：ここにセリフが入ります`;
  return [
    L("matchStart", {}, t("対局開始")),
    L("agari", { scoreTier: "yakuman" }, t("和了・役満")),
    L("agari", { scoreTier: "high" }, t("和了・高得点(10000以上)")),
    L("agari", { scoreTier: "low" }, t("和了・通常(10000未満)")),
    L("damage", { dmgTier: "small" }, t("被ダメージ・小")),
    L("damage", { dmgTier: "mid" }, t("被ダメージ・中")),
    L("damage", { dmgTier: "big" }, t("被ダメージ・大")),
    L("damage", { dmgTier: "pinch" }, t("被ダメージ・残りわずか")),
    L("matchEnd", { rankTier: "top" }, t("対局終了・1位")),
    L("matchEnd", { rankTier: "upper" }, t("対局終了・上位")),
    L("matchEnd", { rankTier: "lower" }, t("対局終了・下位")),
    L("matchEnd", { rankTier: "bottom" }, t("対局終了・最下位")),
    // 局中マイクロ反応
    L("handStart", {}, t("局のはじまり")),
    L("tenpai", {}, t("聴牌")),
    L("tenpaiDrop", {}, t("聴牌くずし")),
    L("tsumogiriStreak", {}, t("ツモ切り続き")),
    L("handStuck", {}, t("手詰まり")),
    L("iishantenHell", {}, t("イーシャンテン地獄")),
    L("handSmooth", {}, t("好調")),
    L("lastTiles", {}, t("流局間際")),
    // 団体戦・交代で登場
    L("swapIn", {}, t("交代登場")),
    // ペア戦・相方への局中相槌（味方＝人間プレイヤーの節目に反応）
    L("allyHandStart", {}, t("相方相槌・局のはじまり")),
    L("allyTenpai", {}, t("相方相槌・味方が聴牌")),
    L("allyStuck", {}, t("相方相槌・味方が手詰まり")),
    L("allyLast", {}, t("相方相槌・流局間際")),
  ];
}

// ── 詩玥（シ・ユエ）──────────────────────────────────────────────────
// 師弟シナリオ正典(scenario-forge/reference world.md §7 / characters.json)準拠の口調。
//   中華娘口調。自称「我（ウォ）」、語尾「〜ネ／〜ダヨ／〜ヨ／〜ダロ」。口癖「ツモれば勝ち」。
//   アルヨ系の過剰さは避け軽いフレーバー。表は楽天・軽口だが、素性（異名「深謀遠慮」＝
//   読みの達人だった過去／恩師の喪失／点棒嫌いは自罰）に触れる瞬間だけ軽さの下の素が滲む。
const SHIYUE = [
  // 対局開始
  L("matchStart", {}, "さーて、今日も派手にツモってくヨ。ついてきて、ネ？"),
  L("matchStart", {}, "我（ウォ）のツモ、抜けるもんなら抜いてみるダヨ？　ふふっ。"),

  // 和了・役満
  L("agari", { scoreTier: "yakuman" }, "見たヨ今の!? これが我のツモ——役満、ごちそうさまネ♪"),
  L("agari", { scoreTier: "yakuman" }, "ツモれば勝ち、って言ったダロ？　役満まで連れてきちゃったヨ。"),
  // 和了・高得点(10000以上)
  L("agari", { scoreTier: "high" }, "ツモッ! このくらい、軽い軽いヨ～♪"),
  L("agari", { scoreTier: "high" }, "ね、言ったダロ？　我の引きはホンモノだヨ。"),
  // 和了・通常(10000未満)
  L("agari", { scoreTier: "low" }, "とりあえずツモ、っと。小さくても勝ちは勝ちダヨ？"),
  L("agari", { scoreTier: "low" }, "ま、地味なのもたまにはネ。ツモれば勝ち、ダロ？"),

  // 被ダメージ・小
  L("damage", { dmgTier: "small" }, "いったぁ……まだまだ、こんなのかすり傷ダヨ。"),
  L("damage", { dmgTier: "small" }, "へーきへーき。我、引きで取り返すからネ。"),
  // 被ダメージ・中
  L("damage", { dmgTier: "mid" }, "うぐっ……ちょっと効いたヨ、今の……。"),
  L("damage", { dmgTier: "mid" }, "むー、押し返されたネ。次のツモでチャラにするダヨ。"),
  // 被ダメージ・大
  L("damage", { dmgTier: "big" }, "うわっ、そんなに持ってくヨ!? 守りは苦手なんだってばネ～。"),
  L("damage", { dmgTier: "big" }, "いったぁ……“守ってりゃ”なんて言わないでヨ。我は、引いて勝つんダロ。"),
  // 被ダメージ・残りわずか（素が少し滲む）
  L("damage", { dmgTier: "pinch" }, "点棒、もうこれだけ……でも、ツモれば勝ちダヨ。一発、引くからネ。"),
  L("damage", { dmgTier: "pinch" }, "……数えるのは、苦手なの。だからツモで、ぜんぶひっくり返すダヨ。"),

  // 対局終了・1位
  L("matchEnd", { rankTier: "top" }, "ふふん、我の勝ちネ! ツモれば勝ち——ほら、ホントだったダロ？"),
  L("matchEnd", { rankTier: "top" }, "やった、一番乗りダヨ! ……この景色、いつか見せたかったンだ。"),
  // 対局終了・上位
  L("matchEnd", { rankTier: "upper" }, "うー、惜しいネ! あと一歩、ツモが足りなかったダヨ。"),
  L("matchEnd", { rankTier: "upper" }, "今日はここまで、っと。次は一番、もらうからネ。"),
  // 対局終了・下位
  L("matchEnd", { rankTier: "lower" }, "あれー……引き、渋かったネ。こういう日もあるヨ、うん。"),
  L("matchEnd", { rankTier: "lower" }, "むー、攻めすぎたカナ。……でも、降りるのは性じゃないダロ。"),
  // 対局終了・最下位（素が少し滲む）
  L("matchEnd", { rankTier: "bottom" }, "うぅ、ビリ……点棒なんて、ホント数えたくないヨ……。"),
  L("matchEnd", { rankTier: "bottom" }, "……ツモれない日は、ちょっとだけ昔を思い出すネ。次は、勝つダヨ。"),

  // ── 局中マイクロ反応（短め・軽口） ──
  // 局のはじまり
  L("handStart", {}, "さ、次いくヨ。ツモれば勝ち——でしょ？"),
  L("handStart", {}, "ふー、仕切り直しネ。今度は派手にいくダヨ。"),
  // 聴牌した瞬間
  L("tenpai", {}, "ふふ、待ちに入ったヨ。来い来い、我のアガリ牌～♪"),
  L("tenpai", {}, "聴牌っ。あと一枚、ツモれば勝ちダヨ?"),
  // 聴牌をくずした／降りた（素がほんの少し）
  L("tenpaiDrop", {}, "んー、ここは引くヨ。……無理しないのも、強さダロ?"),
  L("tenpaiDrop", {}, "聴牌、崩したヨ。我にしては珍しい——でしょ?"),
  // ツモ切りが続く
  L("tsumogiriStreak", {}, "ツモ切り、ツモ切り……むー、噛み合わないネ。"),
  L("tsumogiriStreak", {}, "通せんぼかヨ……いいヨ、引きで黙らせるダヨ。"),
  // なかなか進まない
  L("handStuck", {}, "うーん、手が伸びないネ……我のツモ、どこ行ったヨ。"),
  L("handStuck", {}, "じれったいダヨ……でも焦らない、焦らないネ。"),
  // イーシャンテン地獄（あと一歩が遠い。素のじれったさが少し滲む）
  L("iishantenHell", {}, "またイーシャンテン……あと一枚が、遠いヨぉ……。"),
  L("iishantenHell", {}, "ずーっと一向聴ネ。我のアガリ牌、どこで油売ってるヨ?"),
  L("iishantenHell", {}, "イーシャンテン地獄ってやつ……? 笑えないんですけど、ネ。"),
  // さくさく進む
  L("handSmooth", {}, "おっ、いい感じ! ツモが噛み合ってきたヨ♪"),
  L("handSmooth", {}, "ね、これだヨこれ。我のターン、来てるネ～。"),
  // 流局間際
  L("lastTiles", {}, "もう山が薄いヨ……ここで一発、欲しいネ。"),
  L("lastTiles", {}, "ラスト数枚……引くなら、今ダヨ。"),

  // 団体戦・交代で登場（共闘＝相棒のぶんも背負う一言。素がほんの少し滲む）
  L("swapIn", {}, "我（ウォ）の出番ネ! ここからツモって、ぜんぶ持ってくダヨ♪"),
  L("swapIn", {}, "おまたせ! ……仲間のぶんも、我が引いて返すからネ。"),

  // ── ペア戦・相方への局中相槌（隣で一緒に打つ“相棒”として、味方＝あなたに声をかける） ──
  // 局のはじまり
  L("allyHandStart", {}, "いくヨ、相棒! 我がついてるからネ♪"),
  L("allyHandStart", {}, "さ、二人で派手にツモってこ。背中はまかせてヨ。"),
  // 味方が聴牌
  L("allyTenpai", {}, "お、聴牌ネ! いいヨいいヨ、そのまま決めちゃえ♪"),
  L("allyTenpai", {}, "さっすが我の相方! あと一枚、引いといでヨ。"),
  // 味方が手詰まり（素のやさしさが少し滲む）
  L("allyStuck", {}, "焦らない焦らない。我が前で受けてるから、ゆっくりでいいヨ。"),
  L("allyStuck", {}, "手、重いネ? ……だいじょぶ、こっちは我がカバーするダヨ。"),
  // 流局間際
  L("allyLast", {}, "ラストだヨ! ここ踏ん張りどころ、一緒に粘るネ。"),
  L("allyLast", {}, "山が薄いヨ……二人で食らいついてこ、相棒!"),

  // ── voiceSet: "shugyo" — 「師匠との修行」(二人麻雀)専用。シナリオが voiceSet を
  //    指定した対局でだけ解放される。指定が無ければ上の通常セリフに自動フォールバック。
  //    軽口の下の“素”を一段だけ出す：恩師との一対一を思い出す、まっすぐな声。
  L("matchStart", { voiceSet: "shugyo" }, "……一対一、ひさしぶりネ。手加減はナシだヨ、師匠（せんせい）。"),
  L("matchStart", { voiceSet: "shugyo" }, "向かい合わせの卓って、なんだか落ち着くんダ。さ、見ててヨ。"),
  L("agari", { scoreTier: "high", voiceSet: "shugyo" }, "ツモッ! ……どう、ネ? ちゃんと“読んで”引いたヨ、今の。"),
  L("agari", { scoreTier: "low", voiceSet: "shugyo" }, "小さくても、組み立てて獲ったヨ。……昔の我なら、こうは打てなかったネ。"),
  L("damage", { dmgTier: "pinch", voiceSet: "shugyo" }, "……まだ倒れないヨ。この一対一は、最後まで“読み”きるダヨ。"),
  L("tenpai", { voiceSet: "shugyo" }, "聴牌。……手の内、ぜんぶ見透かされてる気がするネ。それでも、いくヨ。"),
  L("matchEnd", { rankTier: "top", voiceSet: "shugyo" }, "我の勝ち、ネ。……ねえ、今の打ち方……ちょっとは、誇ってもいい?"),
  L("matchEnd", { rankTier: "bottom", voiceSet: "shugyo" }, "……負けたヨ。でも、逃げなかった。それだけは——数えてほしいんダ。"),
];

// 明示的に書いたキャラだけここに登録。未登録キャラは name からテンプレ自動生成。
// scenario-forge 由来の VOICE_LINE_MASTER（bibi 等）をまず展開し、本体で手書きしている
// 詩玥(SHIYUE)を上書きで優先（詩玥は本体が正典・他はパイプライン生成を採用）。
const EXPLICIT = {
  ...VOICE_LINE_MASTER,
  shiyue: SHIYUE,
};

// 全キャラぶんを id キーで用意（名前はマスタと自動同期）。
export const CHARACTER_VOICE_MASTER = Object.fromEntries(
  CHARACTER_MASTER.map((c) => [c.id, EXPLICIT[c.id] || templateLines(c.name)])
);
