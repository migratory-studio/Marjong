// 大会（九大至宝）マスタ — major_update_specification.md §4.6.10 / world.md §11。
//
// 九蓮宝士＝9種の大会すべてで優勝（＝9つの「宝」を集める）。本マスタは各大会の“素性”だけを定義し、
// **敵の強さ（oppLv 等）はここに持たない**：キャラごとに挑戦する順番が違う＝同じ宝でも到達時の
// 相手の強さが変わるため、強さは「ティア既定値 × キャラ進捗」で実行時に与える（tournamentRunConfig）。
//
// 例外（順序の固定要件）:
//   - **九蓮宝燈（final）は全キャラの最終で固定**。会場で人数（形式）が確定する（詩玥＝ペア）。
//   - **ティア**は格・難度の目安（T1→T2→T3 の順に挑むのが基本）。同ティア内の順序はキャラ自由。
//
// format: "solo4"(個人・四麻) / "pair"(ペア＝2対2の4卓) / "team"(団体＝チーム戦)
//         / "final"(九蓮宝燈＝会場でキャラ別に人数確定)
// ※個人戦は四麻と三麻を半々に：門前開鍵杯=四麻 / 清一器杯・無双冠杯=三麻(solo3)。
//   九蓮宝燈(final)が個人形式に解決されるときは四麻（finalFormat=solo4）。
// tableUnits: 毎節の着卓ユニット数の個別上書き（大三剣杯＝3チーム卓→三人打ち。席数はユニット数で決まる）。
// tier:   1 登竜門級 / 2 役満級 / 3 神域級
export const TREASURE_TOURNAMENTS = [
  { id: "menzen-kaiken",    name: "門前開鍵杯", treasure: { name: "門前開鍵", reading: "メンゼンカイケン", baseYaku: "門前清自摸和", symbol: "孤独な試練を独力で開くマスターキー" }, format: "solo4", tier: 1 },
  { id: "chin-iki",         name: "清一器杯",   treasure: { name: "清一器",   reading: "チンイッキ",       baseYaku: "清一色",        symbol: "一色に研ぎ澄ました純粋の器" },     format: "solo3", tier: 1 }, // 三人打ち（一色＝研ぎ澄まし、の少数卓）
  { id: "ji-peeko",         name: "至盃口杯",   treasure: { name: "至盃口",   reading: "ジーペーコー",     baseYaku: "二盃口",        symbol: "1対1の美学を極めた聖杯" },         format: "pair",  tier: 1 },
  { id: "musou-kan",        name: "無双冠杯",   treasure: { name: "無双冠",   reading: "ムソウカン",       baseYaku: "国士無双",      symbol: "孤高の王が戴く王冠" },             format: "solo3", tier: 2 }, // 三人打ち（孤高＝少数の卓）
  { id: "kyou-sharin",      name: "鏡車輪杯",   treasure: { name: "鏡車輪",   reading: "キョウシャリン",   baseYaku: "大車輪",        symbol: "「もう一人の自分」を映す円鏡" },   format: "pair",  tier: 2 },
  { id: "daisanken",        name: "大三剣杯",   treasure: { name: "大三剣",   reading: "ダイサンケン",     baseYaku: "大三元",        symbol: "戦場を支配する一振りの剣" },       format: "team",  tier: 2, tableUnits: 3 }, // 「三」の宝＝三人打ち卓（毎節3チーム着卓・三麻）
  { id: "tenankou",         name: "天暗刻杯",   treasure: { name: "天暗刻",   reading: "テンアンコウ",     baseYaku: "四暗刻",        symbol: "天から与えられた意思を封じた球体" }, format: "team",  tier: 2 },
  { id: "tenchi-shingyoku", name: "天地神玉杯", treasure: { name: "天地神玉", reading: "テンチシンギョク", baseYaku: "天和・地和",    symbol: "確率を捻じ曲げる神がかった運の水晶玉" }, format: "pair", tier: 3 },
  { id: "kyuuren-houtou",   name: "九蓮宝燈杯", treasure: { name: "九蓮宝燈", reading: "チューレンポウトウ", baseYaku: "九蓮宝燈",      symbol: "九つの宝を繋ぎ伝説の紋章を灯す、最後の燈火／最終ピース" }, format: "final", tier: 3, isFinal: true },
];

// ティア別の大会ラン既定値（節数・順位点・報酬の格・ゲート相手 Lv の目安）。
// 実際の相手 Lv はキャラ進捗で上書きする（無ければこの既定値）。順位点（ウマ）は M リーグ準拠。
// ティアは「節数・順位点・報酬・敵の強さ・ネームド比率」を担当（出場者数は形式で固定＝下記 ENTRANTS_BY_FORMAT）。
// expByPlace＝順位別の「実戦経験」（6パラメータの伸び総量）。優勝以外でも卓で得たものが残る＝虚無感対策。
export const TOURNAMENT_TIER = {
  1: { matches: 3, rounds: 1, uma: [50, 10, -10, -30], soulClear: 500,  metaByPlace: [3, 2, 1, 1], expByPlace: [6, 5, 4, 3],  defaultOppLv: 2 }, // 東風戦×3節
  2: { matches: 4, rounds: 1, uma: [50, 10, -10, -30], soulClear: 900,  metaByPlace: [6, 4, 2, 1], expByPlace: [8, 6, 5, 4],  defaultOppLv: 5 }, // 東風戦×4節（半荘×4は体感が長すぎた）
  3: { matches: 5, rounds: 2, uma: [50, 10, -10, -30], soulClear: 1500, metaByPlace: [9, 6, 3, 2], expByPlace: [10, 8, 6, 5], defaultOppLv: 8 },
};

// 出場者（エントリー）総数を形式で固定（Mリーグ＝8基準）。弟子を含む人数。
// 個人=8 / ペア=16（＝8ペア×2人） / 団体=32。毎節は卓に4人ずつ着き、残りは別卓（擬似結果）で累積に反映。
// 出場者（人数）。リーグは常に8ユニットで競う：個人=8人(1人×8) / ペア=16人(2人×8) / 団体=24人(3人×8)。
export const ENTRANTS_BY_FORMAT = { solo4: 8, solo3: 8, pair: 16, team: 24, final: 8 };
// 1ユニットの人数（リーグの単位）。
export const UNIT_SIZE_BY_FORMAT = { solo4: 1, solo3: 1, pair: 2, team: 3, final: 1 };
// 毎節「卓に着くユニット数」。個人=4人、ペア=2ペア(4席)、団体=4チーム(代表1人ずつ)。
export const UNITS_AT_TABLE_BY_FORMAT = { solo4: 4, solo3: 3, pair: 2, team: 4, final: 4 };
// 卓に着くユニット数 → 順位点（ウマ）。4ユニット＝Mリーグ準拠、2ユニット＝ペアの一騎打ち。
export const UMA_BY_UNITS = { 2: [15, -15], 3: [30, 0, -30], 4: [50, 10, -10, -30] };

// 相手1人ぶんの持ち点（HP）を大会の oppLv（難易度）から決める。弟子の avatarHpMax 帯（5500〜26000）に
// おおむね沿わせ、ティア/進捗が上がるほど相手も分厚くする（点棒＝HP・難易度の可視化）。チューニング前提。
export function oppHpForLv(oppLv = 2) {
  return 5000 + Math.max(0, oppLv) * 1900; // 例: Lv2≈8800 / Lv5≈14500 / Lv11≈25900
}

// 最終累積順位 → クリア評価ランク（§4.5.2・満貫級が下限）。
export const PLACE_RANKS = ["役満級", "倍満級", "跳満級", "満貫級"];

// 異能段位（集めた宝の数 → 段位名）。宝1つごとに昇段、9で九蓮宝士。
export const TREASURE_RANKS = [
  { n: 1, name: "一蓮緑士", reading: "いちれんりょくし" },
  { n: 2, name: "二蓮打士", reading: "にれんだし" },
  { n: 3, name: "三蓮巧士", reading: "さんれんこうし" },
  { n: 4, name: "四蓮策士", reading: "よんれんさくし" },
  { n: 5, name: "五蓮闘士", reading: "ごれんとうし" },
  { n: 6, name: "六蓮達士", reading: "ろくれんたつし" },
  { n: 7, name: "七蓮覇士", reading: "しちれんはし" },
  { n: 8, name: "八蓮極士", reading: "はちれんきょくし" },
  { n: 9, name: "九蓮宝士", reading: "きゅうれんほうし" },
];
// 宝の数 → 段位（1〜9）。0/未満は null。
export function treasureRankFor(count) {
  if (!count || count < 1) return null;
  return TREASURE_RANKS[Math.min(9, count) - 1] || null;
}

// 師匠の初期段位（宝数換算・基本は四蓮策士=4 以上）。ホーム表示や格の目安に使う。
export const MENTOR_TREASURE_RANK = {
  shiyue: 6,        // 六蓮達士（読みの達人。盛りすぎ回避でひとまず6）
  bibi: 5,          // 五蓮闘士（正典：5つで停滞＝覇道編で残り4つに挑み直す軸。scenario/design/bibi.json）
  kakeha_ruina: 5,  // 五蓮闘士（博徒）
};
// 師匠の段位の「軌跡」: 弟子の宝の数 → 師匠の蓮数（キャラ別の伸び方）。
// 詩玥は六蓮で止まっていたのが、弟子との覇道編で再び動き出し、九蓮戦の直前に八蓮極士へ届く
// （弟子と並んで最後の一つに挑む画）。ビビ・ルイナはトラック無し＝停滞が正典
// （ビビ「最年少五蓮」のまま。殻破りは物語側 ep12/ep20 で扱う）。
export const MENTOR_RANK_TRACK = {
  shiyue: [
    { treasures: 5, rank: 7 }, // 七蓮覇士
    { treasures: 8, rank: 8 }, // 八蓮極士＝九蓮宝燈杯の直前
  ],
};
// 師匠の段位（mentorId → 段位オブジェクト）。未定義師匠は四蓮策士（=4）を下限に。
// wonTreasures（弟子の宝の数）を渡すと MENTOR_RANK_TRACK ぶん昇段した「今の段位」を返す。
export function mentorRankFor(mentorId, wonTreasures = null) {
  let n = MENTOR_TREASURE_RANK[mentorId] || 4;
  if (wonTreasures != null) {
    for (const step of MENTOR_RANK_TRACK[mentorId] || []) {
      if (wonTreasures >= step.treasures) n = Math.max(n, step.rank);
    }
  }
  return treasureRankFor(n);
}

export const tournamentById = (id) => TREASURE_TOURNAMENTS.find((t) => t.id === id) || TREASURE_TOURNAMENTS[0];

// 形式 → 卓人数（個人戦）。pair/team は専用対局（別系統）なので playerCount は実装側で扱う。
const PLAYER_COUNT = { solo4: 4, solo3: 3, pair: 4, team: 4, final: 4 };

// 大会の“素性”＋ティア既定値＋実行時の相手 Lv をマージした、ラン用コンフィグ。
// opts.oppLv＝キャラ進捗で決まる相手の強さ。opts.finalFormat＝九蓮宝燈の会場形式（キャラ別）。
export function tournamentRunConfig(id, opts = {}) {
  const t = tournamentById(id);
  const tc = TOURNAMENT_TIER[t.tier] || TOURNAMENT_TIER[1];
  const oppLv = opts.oppLv ?? tc.defaultOppLv;
  const format = (t.format === "final" && opts.finalFormat) ? opts.finalFormat : t.format;
  const playerCount = PLAYER_COUNT[format] || 4;
  const runnable = true; // 個人/ペア/団体すべて対応（final は会場形式に解決済み）
  // 出場者総数（弟子含む）は形式で固定（個人8 / ペア16 / 団体24）。リーグの単位＝ユニット。
  const entrants = ENTRANTS_BY_FORMAT[format] || Math.max(playerCount, 8);
  const unitSize = UNIT_SIZE_BY_FORMAT[format] || 1;
  const unitCount = Math.max(2, Math.round(entrants / unitSize)); // 常に8
  // 大会個別の着卓数上書き（大三剣杯＝3）。team で 3 なら卓は3人＝三麻になる。
  const unitsAtTable = t.tableUnits || UNITS_AT_TABLE_BY_FORMAT[format] || 4;
  const uma = UMA_BY_UNITS[unitsAtTable] || UMA_BY_UNITS[4];
  const base = 25000 * unitSize; // ユニットの素点基準（ペア=50000 / 団体=75000）
  return {
    id: t.id, name: t.name, treasure: t.treasure, format, tier: t.tier, isFinal: !!t.isFinal,
    playerCount, entrants, runnable,
    unitSize, unitCount, unitsAtTable, base,
    matches: tc.matches, rounds: tc.rounds, uma,
    soulClear: tc.soulClear, metaByPlace: tc.metaByPlace, expByPlace: tc.expByPlace, rankByPlace: PLACE_RANKS,
    gateOppLv: oppLv, rivalLv: oppLv,
  };
}
