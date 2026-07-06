// 師匠別キャンペーン — major_update_specification.md §4.5 / world.md §7・§9。
//
// 「誰がどの順で 9 つの宝に挑むか」＋「各到達時の相手の強さ（oppLv＝進捗カーブ）」を定義する。
// 同じ宝でもキャラ／到達順が違えば相手の強さが変わる（敵強度はここで与える）。
//   - 九蓮宝燈（kyuuren-houtou）は **全キャラの最終で固定**。`finalFormat` で会場の人数（形式）を確定する
//     （world.md：詩玥＝2人＝pair。他師匠は素性に応じて team / solo4 等）。
//   - ティアは基本 T1→T2→T3 だが、序盤は“今すぐ遊べる個人戦（solo4/solo3）”を前に寄せている（順序は調整可）。
import { tournamentById } from "./tournamentMaster.js";

export const MENTOR_CAMPAIGN = {
  // 詩玥（攻め・引き）：順序はシナリオ正典（scenario-forge masters/mentor-shiyue-bond-*.brief）と同期。
  //   1 menzen   … 11話「個人戦・門前開鍵を制し最初の宝」
  //   2 daisanken… 11話でトリオ結成→12話「団体戦・大三剣の最終戦＝2個目の宝」（師弟編フィナーレ）
  //   3 ji-peeko … 13話「ふたりの勝ち」直後のペア戦＝辛勝で3個目
  //   4 kyou-sharin … 14話「読みの達人（鏡）に敗北」→17話「読んで、引く」で勝つ＝
  //                   “もう一人の自分を映す”鏡車輪＝深謀遠慮との和解の卓
  //   5 chin-iki … 18話前半のモンタージュ（勝ち星を重ねる）
  //   6 tenankou … 18話「アビスの壁」＝ネビュラ戦（団体・闇の宝）
  //   7 musou-kan… 19話前半のモンタージュ
  //   8 tenchi-shingyoku … 19話「三人の九蓮」＝弟子の一打で8個目（ペア）
  //   9 kyuuren-houtou … 20話「神算鬼謀」読了後、二人で九蓮宝士
  // oppLv は「形式込みの実効難度」で単調増加：ペア/団体は師匠（格上）が同卓して戦力を
  // 担ぐぶん、同じ oppLv でも個人戦より楽になる。そのため生の oppLv は前後して見えるが、
  // 体感は約3〜4ヶ月（ターン）に1杯のペースで一定に上がる（回帰は test/leveldesign.mjs）。
  // ティアも前後する（物語正典を優先。ティアは節数・報酬の「格」、難度は oppLv が担う）。
  shiyue: [
    { id: "menzen-kaiken",    oppLv: 4 },                       // 個人
    // 団体（師匠＋マモリ同卓）。ep11「二人の九蓮」でマモリが「組みに来た／正式に協力相手になる」＝
    // トリオ結成。その章を読むまで挑めない（団体戦なのに3人目が未加入、を防ぐ・requireScenario）。
    { id: "daisanken",        oppLv: 6, requireScenario: "mentor-shiyue-bond-11" },
    { id: "ji-peeko",         oppLv: 7 },                       // ペア
    { id: "kyou-sharin",      oppLv: 8 },                       // ペア
    { id: "chin-iki",         oppLv: 8 },                       // 個人
    { id: "tenankou",         oppLv: 9 },                       // 団体
    { id: "musou-kan",        oppLv: 9 },                       // 個人（個人戦は担ぎ無し＝実効は団体9より重い）
    { id: "tenchi-shingyoku", oppLv: 11 },                      // ペア
    { id: "kyuuren-houtou",    oppLv: 12, finalFormat: "pair" }, // 詩玥＋弟子の二人＝カンスト級の壁
  ],
  // ビビ（守り）：最初は清一器。最終は仲間と組む team（背中を守る守備の人）。
  bibi: [
    { id: "chin-iki",         oppLv: 2 },
    { id: "menzen-kaiken",    oppLv: 3 },
    { id: "musou-kan",        oppLv: 5 },
    { id: "tenankou",         oppLv: 6 },
    { id: "daisanken",        oppLv: 7 },
    { id: "ji-peeko",         oppLv: 4 },
    { id: "kyou-sharin",      oppLv: 8 },
    { id: "tenchi-shingyoku", oppLv: 9 },
    { id: "kyuuren-houtou",    oppLv: 11, finalFormat: "team" },
  ],
  // 賭羽ルイナ（博徒）：師弟編=個人戦中心（ソロの美学）→覇道編=ペア（弟子と二人）→トリオ（ドラニエル加入）。
  //   宝順はシナリオ正典（masters/mentor-kakeha_ruina-bond-*）と同期：
  //     ep12=musou-kan(国士)＝師弟編フィナーレ(won2)／ep17「三人で、張る」=トリオ結成→daisanken／
  //     ep20=kyuuren＝弟子+ルイナ+ドラニエルの team で九蓮宝士（ソロ→トリオ反転の到達点）。
  kakeha_ruina: [
    { id: "menzen-kaiken",    oppLv: 2 },                        // 個人
    { id: "musou-kan",        oppLv: 4 },                        // 個人・ep12フィナーレ（国士無双／won2）
    { id: "chin-iki",         oppLv: 5 },                        // 個人
    { id: "ji-peeko",         oppLv: 5 },                        // ペア（弟子と二人）
    { id: "kyou-sharin",      oppLv: 6 },                        // ペア（これを取ると5個目＝won5でep17「三人で、張る」が解禁→次の団体戦へ）
    // 団体（弟子＋ルイナ＋ドラニエル）。ep17「三人で、張る」でトリオ結成＝その章を読むまで挑めない。
    { id: "daisanken",        oppLv: 7, requireScenario: "mentor-kakeha_ruina-bond-17" },
    { id: "tenchi-shingyoku", oppLv: 8 },                        // ペア・ep19（won7）
    { id: "tenankou",         oppLv: 9 },                        // 団体
    { id: "kyuuren-houtou",    oppLv: 11, finalFormat: "team" }, // 弟子＋ルイナ＋ドラニエルのトリオで九蓮宝士
  ],
  // 凌雲（リン・ユン／守り・盾）：師弟編=個人戦で「不動の受け」を磨く→覇道編=ペア（弟子と二人）＋
  //   団体（弟子＋凌雲＋詩玥）→最終はペア（弟子＋凌雲の二人で九蓮宝士）。宝順は design/ryuuun.json と同期：
  //     ep6=chin-iki（清一器・won1）／ep12=menzen-kaiken（門前開鍵・won2＝師弟編フィナーレ「泥仕合」）。
  //   覇道編(ep13-20)は実装済み。3つ目以降(ji-peeko=won3)は ep13 読了で解禁され、以降は宝優勝(won)に
  //   同期して章が段階解禁する（scenarioのunlockConditions側＝詩玥階段に倣った成長/won ゲート）。
  //     daisanken は ep17「トリオ結成」読了で挑める（弟子＋凌雲＋詩玥）。
  kuidoshi: [
    { id: "chin-iki",         oppLv: 3 },                                          // 個人・ep6（won1）
    { id: "menzen-kaiken",    oppLv: 4, requireScenario: "mentor-kuidoshi-bond-11" }, // 個人・ep12フィナーレ（won2）
    { id: "ji-peeko",         oppLv: 5, requireScenario: "mentor-kuidoshi-bond-13" }, // ペア（弟子＋凌雲）※覇道編ゲート
    { id: "kyou-sharin",      oppLv: 6 },                                          // ペア
    { id: "musou-kan",        oppLv: 7 },                                          // 個人
    { id: "daisanken",        oppLv: 7, requireScenario: "mentor-kuidoshi-bond-17" }, // 団体（弟子＋凌雲＋詩玥）ep17トリオ
    { id: "tenankou",         oppLv: 9 },                                          // 団体
    { id: "tenchi-shingyoku", oppLv: 9 },                                          // ペア
    { id: "kyuuren-houtou",    oppLv: 11, finalFormat: "pair" },                    // 弟子＋凌雲の二人で九蓮宝士
  ],
  // ドラニエル（博打・ドラ寄せ）：宝順はシナリオ正典（masters/mentor-doranie-bond-*）＝design/doranie.json
  //   campaignTreasureOrder と同期。won ゲート数列はルイナ編と同型（won1→2→4→5→7→8）：
  //     ep11=chin-iki（清一器・won1＝弟子の初宝）／ep12=ji-peeko（至盃口・won2＝師弟編フィナーレ「差し向かい」
  //     ＝公式ペア戦は師弟共闘・1対1は夜の非公式卓）／ep16=kyou-sharin（鏡車輪・won4「二人なら飛ばぬ」）／
  //     ep17「三人はもっと最高じゃ」=トリオ結成（弟子＋ドラニエル＋ルクス・ゼロ）→tenankou（天の宝×天使）／
  //     ep19=tenchi-shingyoku（天地神玉・won7「運は作るものじゃ」）／ep20=kyuuren（won8）＝team で九蓮宝士
  //     （最終局＝ドラを全部弟子に注ぐ「ドラはぜーんぶ、ぬしのものじゃ！」）。
  doranie: [
    { id: "chin-iki",         oppLv: 3 },                        // 個人（三人打ち）・ep11（won1）
    { id: "ji-peeko",         oppLv: 5 },                        // ペア・ep12フィナーレ（師弟共闘／won2）
    { id: "menzen-kaiken",    oppLv: 5 },                        // 個人（オフスクリーン）
    { id: "kyou-sharin",      oppLv: 6 },                        // ペア・ep16「二人なら飛ばぬ」（won4）
    { id: "musou-kan",        oppLv: 7 },                        // 個人（これで won5＝ep17トリオ結成が解禁）
    // 団体（弟子＋ドラニエル＋ルクス・ゼロ）。ep17でトリオ結成＝その章を読むまで挑めない。
    { id: "tenankou",         oppLv: 8, requireScenario: "mentor-doranie-bond-17" },
    { id: "daisanken",        oppLv: 9 },                        // 団体（オフスクリーン）
    { id: "tenchi-shingyoku", oppLv: 9 },                        // ペア・ep19「運は作るものじゃ」（won7）
    { id: "kyuuren-houtou",    oppLv: 11, finalFormat: "team" }, // 弟子＋ドラニエル＋ルクスのトリオで九蓮宝士
  ],
  // ルクス・ゼロ（精密機械・ゼロ・リサーチ）：宝順はシナリオ正典（masters/mentor-yobinin-bond-*）＝
  //   design/yobinin.json campaignTreasureOrder と同期。won ゲート数列はルイナ/ドラニエル編と同型：
  //     ep11=chin-iki（清一器・won1＝一色に研ぎ澄ます＝誤差を消す純化）／ep12=menzen-kaiken（門前開鍵・won2
  //     ＝『孤独な試練を独力で開くマスターキー』＝単独の機械のテーマ宝で師弟決勝対峙「割り切れない」）／
  //     ep16=kyou-sharin（鏡車輪・won4「揺らぎは、変数」）／ep17「検証のため、貴殿が必要だ」=トリオ結成
  //     （弟子＋ルクス＋ルイナ＝機械がルイナを口説く）→daisanken／ep19=tenankou（won7「運の隣に立つ」）／
  //     ep20=kyuuren（won8）＝team＝グレーアウトの最終局に確定のない一打→『誤差も、悪くない』。
  yobinin: [
    { id: "chin-iki",         oppLv: 3 },                        // 個人（三人打ち）・ep11（won1）
    { id: "menzen-kaiken",    oppLv: 4 },                        // 個人・ep12フィナーレ（師弟対峙／won2）
    { id: "musou-kan",        oppLv: 5 },                        // 個人（オフスクリーン）
    { id: "kyou-sharin",      oppLv: 6 },                        // ペア・ep16「揺らぎは、変数」（won4）
    { id: "ji-peeko",         oppLv: 7 },                        // ペア（これで won5＝ep17トリオ結成が解禁）
    // 団体（弟子＋ルクス・ゼロ＋賭羽ルイナ）。ep17でトリオ結成＝その章を読むまで挑めない。
    { id: "daisanken",        oppLv: 8, requireScenario: "mentor-yobinin-bond-17" },
    { id: "tenchi-shingyoku", oppLv: 9 },                        // ペア（オフスクリーン）
    { id: "tenankou",         oppLv: 9 },                        // 団体・ep19「運の隣に立つ」（won7）
    { id: "kyuuren-houtou",    oppLv: 11, finalFormat: "team" }, // 弟子＋ルクス＋ルイナのトリオで九蓮宝士
  ],
};

// ------------------------------------------------- 育成フェーズ（章立て）：師弟編 → 覇道編
// 師弟編の最終章（finaleScenario）を読了すると、育成ホームは「覇道編」フェーズに切り替わる
// （章名・UI テーマ・師匠の一言が変わる。判定は scenarioService.mentorPhase）。
// シナリオ未実装の師匠は finale 無し＝常に師弟編のまま。
export const MENTOR_PHASES = {
  shitei: { id: "shitei", label: "師弟編", subtitle: "修行の日々", seal: "章" },
  hadou:  { id: "hadou",  label: "覇道編", subtitle: "九つの宝へ", seal: "覇" },
};
export const MENTOR_FINALE_SCENARIO = {
  shiyue: "mentor-shiyue-bond-12", // 12話「ツモれば、ふたりの勝ち」＝師弟編フィナーレ
  bibi: "mentor-bibi-bond-12",     // 12話＝団体戦優勝。守りに閉じたビビが初めて「信じて攻めを託す」転回点（design/bibi.json）
  kakeha_ruina: "mentor-kakeha_ruina-bond-12", // 12話「ひとりで、いい」＝無双冠(国士無双)で師弟が決勝対峙（design/ruina.json）
  kuidoshi: "mentor-kuidoshi-bond-12", // 12話「泥仕合」＝門前開鍵で師弟編フィナーレ（読了で覇道編へ）
  doranie: "mentor-doranie-bond-12", // 12話「差し向かい」＝至盃口をペアで獲った夜の非公式1対1（design/doranie.json）
  yobinin: "mentor-yobinin-bond-12", // 12話「割り切れない」＝門前開鍵で師弟決勝対峙・計算の外の一打が機械を破る（design/yobinin.json）
};

// エピローグ章（最終大会＝九蓮宝燈の優勝後に解禁・読了でスタッフロール）。
// 詩玥 ep20「神算鬼謀」は優勝後の物語なので、挑戦前に読ませない（unlock=tournament_won 9）。
// 表示も「第20話」ではなく「エピローグ」（scenarioListScreen / 解禁モーダル）。
export const MENTOR_EPILOGUE_SCENARIO = {
  shiyue: "mentor-shiyue-bond-20",
  bibi: "mentor-bibi-bond-20", // 20話＝弟子の個人戦単独優勝を見届け、手を放して見送る。ビビ自身も道へ（殻破り完成）
  kakeha_ruina: "mentor-kakeha_ruina-bond-20", // 20話「いい目に、する」＝九蓮宝燈を弟子の大捲りで制覇＋後日譚（design/ruina.json）
  kuidoshi: "mentor-kuidoshi-bond-20", // 20話エピローグ＝2人で九蓮宝士・不屈の後日譚（読了でスタッフロール）
  doranie: "mentor-doranie-bond-20", // 20話「最高なのじゃ」＝トリオで九蓮宝士・口癖の反転＋明るい後日譚（design/doranie.json）
  yobinin: "mentor-yobinin-bond-20", // 20話「誤差も、悪くない」＝グレーアウトの最終局に確定のない一打・観測継続宣言で幕（design/yobinin.json）
};
export function isMentorEpilogue(scenarioId) {
  return Object.values(MENTOR_EPILOGUE_SCENARIO).includes(scenarioId);
}

// 育成フェーズ判定。師弟編の最終章を読了していれば覇道編、それ以外（finale 未定義含む）は師弟編。
// データ層に置くのは progressionService（師匠の修行成長）からも循環なしで参照するため。
// UI からは scenarioService 経由（再エクスポート）でも使える。
export function mentorPhase(profile, mentorId) {
  const fin = MENTOR_FINALE_SCENARIO[mentorId];
  const read = fin && (profile?.scenarioProgress || []).some((p) => p.scenarioId === fin);
  return read ? MENTOR_PHASES.hadou : MENTOR_PHASES.shitei;
}

// ------------------------------------------------- 師匠のスキル Lv（技）＝シナリオ起点
// 師匠の技 Lv は基準 5（§10.5「師匠の初期スキル Lv = 5」）から、覇道編の節目の読了で超越帯へ。
// 詩玥＝「封印した読みを取り戻す」アークと同期し、ep20（神算鬼謀）で Lv10
// ＝弟子の Lv10 と同時期に揃う（系譜の完成）。ビビも ep15〜20 で超越帯（焔の火が宿る）へ。
// 賭羽ルイナ＝超越帯（lv-gamble-bet Lv6〜10）＝「運命を手繰る」ツモ偏重が宿る（詩玥のlucky-drawメカ流用・覇道編で力が極まる）。
export const MENTOR_SKILL_BASE = 5;
export const MENTOR_SKILL_TRACK = {
  shiyue: [
    { scenarioId: "mentor-shiyue-bond-14", level: 6 },  // 読みの達人（鏡）に敗北＝封印していた読みの自覚
    { scenarioId: "mentor-shiyue-bond-17", level: 7 },  // 「読んで、引く」＝鏡車輪・和解の入口
    { scenarioId: "mentor-shiyue-bond-18", level: 8 },  // アビスの壁
    { scenarioId: "mentor-shiyue-bond-19", level: 9 },  // 三人の九蓮
    { scenarioId: "mentor-shiyue-bond-20", level: 10 }, // 神算鬼謀＝最終戦は師弟ふたりとも Lv10
  ],
  // ビビ＝超越帯（lv-iron-guard Lv6〜10）＝「相棒・焔の火が宿る」＝身代わり（守り）が攻めへ転じる
  // 殻破りアークと同期。段位（MENTOR_RANK_TRACK）は五蓮で停滞のまま＝外の宝数とは別軸の、内面の成長。
  bibi: [
    { scenarioId: "mentor-bibi-bond-15", level: 6 },  // 焔の火＝信じて見送る守りに、攻めの火が灯りはじめる
    { scenarioId: "mentor-bibi-bond-17", level: 7 },  // ころんで、立つ＝庇わない守りの自覚
    { scenarioId: "mentor-bibi-bond-18", level: 8 },  // あなたなら＝手を放し、信じて託す
    { scenarioId: "mentor-bibi-bond-19", level: 9 },  // お守りのラビちゃん＝相棒と自分の足で
    { scenarioId: "mentor-bibi-bond-20", level: 10 }, // いってきます＝殻破り完成・身代わりの火（焔1.5倍に並ぶ）
  ],
  // 賭羽ルイナ＝超越帯（lv-gamble-bet Lv6〜10）＝大博打に「運命を手繰る」ツモ偏重が宿る。
  // 覇道編で“いい目だと言えばそうなる”力が段階的に極まる（弟子のLv10と同時期に揃う）。
  kakeha_ruina: [
    { scenarioId: "mentor-kakeha_ruina-bond-15", level: 6 },  // 賭ける羽＝留まる兆し・運命との間合い
    { scenarioId: "mentor-kakeha_ruina-bond-16", level: 7 },  // いい目に、なってきたね＝力の芽吹き
    { scenarioId: "mentor-kakeha_ruina-bond-18", level: 8 },  // 見えてきたかい＝同じ景色へ近づく
    { scenarioId: "mentor-kakeha_ruina-bond-19", level: 9 },  // あんたに、張る＝運命を託す
    { scenarioId: "mentor-kakeha_ruina-bond-20", level: 10 }, // いい目に、する＝運命を手なずける極み
  ],
  // 凌雲＝超越帯（lv-amber-shield Lv6〜10）＝盾の純化（受け切る盾→勝ち切る盾／2枚目＝Lv8）。
  // 覇道編で“自分を知る”を経て、ep19で2枚目の盾が3倍満を0に＝進化、ep20で天衣無縫が完成（弟子Lv10と同時期）。
  kuidoshi: [
    { scenarioId: "mentor-kuidoshi-bond-15", level: 6 },  // 盾の純化を決意（自分を知る）
    { scenarioId: "mentor-kuidoshi-bond-17", level: 7 },  // 円陣＝前に出る一歩
    { scenarioId: "mentor-kuidoshi-bond-18", level: 8 },  // 特訓で2枚目の盾を掴みかける
    { scenarioId: "mentor-kuidoshi-bond-19", level: 9 },  // 決勝＝2枚目の盾が3倍満を0に（進化）
    { scenarioId: "mentor-kuidoshi-bond-20", level: 10 }, // 天衣無縫＝守りと攻めに継ぎ目なし
  ],
  // ドラニエル＝超越帯（lv-dora-pull Lv6〜10）＝能力自身が極まる型（相棒 graft なし）。
  // 前半=賭けの深化（1局3めくり・3局）、後半=**「背水の天啓」**＝持ち点が薄いほど確定ドラが増える
  // （Lv8=25%以下+1→Lv9=50%以下→Lv10=+2。test/dorapull.mjs）＝紙HPの弱点が火力に反転。
  // 覇道編＝紙HPの反転アーク（二人なら飛ばぬ→三人なら飛ばぬ＝飛び際こそ見せ場）と同期。
  doranie: [
    { scenarioId: "mentor-doranie-bond-16", level: 6 },  // 二人なら飛ばぬ＝鏡車輪・共闘の実り
    { scenarioId: "mentor-doranie-bond-17", level: 7 },  // トリオ結成＝天の宝×天使×機械
    { scenarioId: "mentor-doranie-bond-18", level: 8 },  // 帰らんのか＝口癖の前震（最高絆）
    { scenarioId: "mentor-doranie-bond-19", level: 9 },  // 運は作るものじゃ＝哲学の完成
    { scenarioId: "mentor-doranie-bond-20", level: 10 }, // 最高なのじゃ＝ドラを注ぐ極み（弟子Lv10と同時期）
  ],
  // ルクス・ゼロ＝超越帯（lv-zero-search Lv6〜10）＝能力自身が極まる型（相棒 graft なし）。
  // 前半=読みの網の拡大（候補3→4・局数3）、後半=「該当なし」の反転＝聴牌を確定できる有効牌が
  // 山に無くても発動できる“誤差の一打”（Lv9解禁→Lv10研ぎ澄まし。test/zerosearch.mjs）。
  // 覇道編＝運との和解アーク（揺らぎは変数→運の隣に立つ(ep19=Lv9)→誤差も、悪くない(ep20=Lv10)）と同期。
  yobinin: [
    { scenarioId: "mentor-yobinin-bond-16", level: 6 },  // 揺らぎは、変数＝委ねる一打・信条が形を変える
    { scenarioId: "mentor-yobinin-bond-17", level: 7 },  // トリオ結成＝運命の女を口説く
    { scenarioId: "mentor-yobinin-bond-18", level: 8 },  // 観測記録＝蓄積の可視化（最高絆）
    { scenarioId: "mentor-yobinin-bond-19", level: 9 },  // 運の隣に立つ＝共闘の完成
    { scenarioId: "mentor-yobinin-bond-20", level: 10 }, // 誤差も、悪くない＝確定のない一打（弟子Lv10と同時期）
  ],
};
export function mentorSkillLevel(profile, mentorId) {
  let lv = MENTOR_SKILL_BASE;
  const read = new Set((profile?.scenarioProgress || []).map((p) => p.scenarioId));
  for (const s of MENTOR_SKILL_TRACK[mentorId] || []) {
    if (read.has(s.scenarioId)) lv = Math.max(lv, s.level);
  }
  return lv;
}

export function campaignFor(mentorId) {
  return MENTOR_CAMPAIGN[mentorId] || MENTOR_CAMPAIGN.shiyue;
}

// 次に挑む宝（records.treasures にまだ無い、キャンペーン順で最初の宝）。全制覇なら null。
export function nextTreasureStep(mentorId, wonTreasures = []) {
  return campaignFor(mentorId).find((s) => !wonTreasures.includes(s.id)) || null;
}

// 表示用：次の宝の素性（名前・役・形式・ティア）。全制覇なら null。
export function nextTreasureInfo(mentorId, wonTreasures = []) {
  const step = nextTreasureStep(mentorId, wonTreasures);
  if (!step) return null;
  const t = tournamentById(step.id);
  const format = (t.format === "final" && step.finalFormat) ? step.finalFormat : t.format;
  return { step, treasure: t.treasure, name: t.name, format, tier: t.tier };
}
