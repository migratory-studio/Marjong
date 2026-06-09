// 師匠別キャンペーン — major_update_specification.md §4.5 / world.md §7・§9。
//
// 「誰がどの順で 9 つの宝に挑むか」＋「各到達時の相手の強さ（oppLv＝進捗カーブ）」を定義する。
// 同じ宝でもキャラ／到達順が違えば相手の強さが変わる（敵強度はここで与える）。
//   - 無双国書（musou-kokusho）は **全キャラの最終で固定**。`finalFormat` で会場の人数（形式）を確定する
//     （world.md：詩玥＝2人＝pair。他師匠は素性に応じて team / solo4 等）。
//   - ティアは基本 T1→T2→T3 だが、序盤は“今すぐ遊べる個人戦（solo4/solo3）”を前に寄せている（順序は調整可）。
import { tournamentById } from "./tournamentMaster.js";

export const MENTOR_CAMPAIGN = {
  // 詩玥（攻め・引き）：最初は門前開鍵（ツモあがり）から。最終は弟子との 2 人（pair）で九蓮宝士。
  shiyue: [
    { id: "menzen-kaiken",    oppLv: 2 },
    { id: "chin-iki",         oppLv: 3 },
    { id: "musou-kan",        oppLv: 5 },
    { id: "ji-peeko",         oppLv: 4 },
    { id: "kyou-sharin",      oppLv: 6 },
    { id: "daisanken",        oppLv: 7 },
    { id: "tenankou",         oppLv: 8 },
    { id: "tenchi-shingyoku", oppLv: 9 },
    { id: "musou-kokusho",    oppLv: 11, finalFormat: "pair" }, // 詩玥＋弟子の二人
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
    { id: "musou-kokusho",    oppLv: 11, finalFormat: "team" },
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
    { id: "musou-kokusho",    oppLv: 11, finalFormat: "solo4" },
  ],
};

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
