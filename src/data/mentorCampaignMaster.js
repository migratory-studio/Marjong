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
  // 賭羽ルイナ（博徒）：運の宝も早めに。最終は単騎で賭け切る solo4。
  kakeha_ruina: [
    { id: "menzen-kaiken",    oppLv: 2 },
    { id: "musou-kan",        oppLv: 4 },
    { id: "chin-iki",         oppLv: 3 },
    { id: "ji-peeko",         oppLv: 5 },
    { id: "tenchi-shingyoku", oppLv: 8 },
    { id: "kyou-sharin",      oppLv: 6 },
    { id: "daisanken",        oppLv: 7 },
    { id: "tenankou",         oppLv: 9 },
    { id: "kyuuren-houtou",    oppLv: 11, finalFormat: "solo4" },
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
};

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
// ＝弟子の Lv10 と同時期に揃う（系譜の完成）。トラック未定義の師匠（ビビ/ルイナ）は 5 のまま
// （スキルテーブル未設計＝表示のみ。テーブルとトラックを足せば自動で効く）。
export const MENTOR_SKILL_BASE = 5;
export const MENTOR_SKILL_TRACK = {
  shiyue: [
    { scenarioId: "mentor-shiyue-bond-14", level: 6 },  // 読みの達人（鏡）に敗北＝封印していた読みの自覚
    { scenarioId: "mentor-shiyue-bond-17", level: 7 },  // 「読んで、引く」＝鏡車輪・和解の入口
    { scenarioId: "mentor-shiyue-bond-18", level: 8 },  // アビスの壁
    { scenarioId: "mentor-shiyue-bond-19", level: 9 },  // 三人の九蓮
    { scenarioId: "mentor-shiyue-bond-20", level: 10 }, // 神算鬼謀＝最終戦は師弟ふたりとも Lv10
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
