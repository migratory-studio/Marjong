// 大会ライバル・マスタ — major_update_specification.md §4.6.10 / world.md。
//
// 宝の大会に出てくる「名のある対戦相手」を定義する。狙いはプロジェクトの核＝キャラ愛着：
// 節目の大会の相手が量産モブ名（吉田さん）では盛り上がらないので、名前・肩書き・色・口上を持つ
// “顔のあるライバル”を混ぜる。**敵の強さ自体はキャンペーン進捗(oppLv)で決まる**ので、ここでは
// 強さは持たず「個性」だけを与える。
//
// 人数の建て付け：ティアが上がるほどネームドの登場数が増える（NAMED_BY_TIER）。
// 足りない席は従来どおりシルエットのモブで埋める（makeMobRoster）。
//
// 立ち絵は新規アセットを作らず既存シルエット（graphic/chars/mobs/1〜10.png）を流用する
// （real-resources-only 方針）。名前・肩書き・口上が付くだけで“量産モブ”とは別物の存在感になる。
import { makeMobRoster, makeMob } from "./mobMaster.js";

// ティア → その大会に登場するネームド・ライバルの最大数（出場者−1 まで）。
//   T1=1（少数の出場者） / T2=3（中間） / T3=全員（99＝出場者数ぶん全部ネームド）。
export const NAMED_BY_TIER = { 1: 1, 2: 3, 3: 99 };

// ライバル本体プール。sil＝流用シルエット番号(1〜10) / abilityId＝既存 abilityMaster の id / line＝対局前の口上。
const RIVAL_POOL = {
  shizuka:  { name: "黙打ちの静",   reading: "しずか", title: "門前ひとすじ", color: "#6f7e9c", sil: 2, abilityId: "lucky-draw",   line: "……喋らないわ。卓の上で語るから。" },
  hiro:     { name: "一色の緋呂",   reading: "ひろ",   title: "染め手の鬼",   color: "#b8472f", sil: 7, abilityId: "chunchan",    line: "色を決めたら、もう曲げない。それだけだ。" },
  ren:      { name: "対(つい)の漣", reading: "れん",   title: "形にこだわる男", color: "#3f8f86", sil: 9, abilityId: "danger-sense", line: "美しい手は、二つで一つ。崩させはしない。" },
  garou:    { name: "牙狼",         reading: "ガロウ", title: "国士の亡者",   color: "#7a5cc0", sil: 6, abilityId: "dora-pull",    line: "十三種、すべて喰らい尽くしてやる。" },
  mirei:    { name: "鏡の美玲",     reading: "みれい", title: "写し取る打ち手", color: "#c06a9c", sil: 4, abilityId: "lucky-draw",   line: "あなたの手、そっくり頂くわ。" },
  enji:     { name: "三槓子の焔司", reading: "えんじ", title: "支配の剣",     color: "#d0682f", sil: 8, abilityId: "kakeha-bet",   line: "場を制すのは、いつだって俺の役だ。" },
  kurono:   { name: "暗刻の玄乃",   reading: "くろの", title: "闇に伏せる者", color: "#4a5566", sil: 10, abilityId: "danger-sense", line: "見えぬ手こそ、最も重い。" },
  tenka:    { name: "天運の天香",   reading: "てんか", title: "確率を嗤う女", color: "#caa23a", sil: 5, abilityId: "dora-pull",    line: "運？ いいえ、これが私の実力。" },
  mukou:    { name: "無垢の無辜",   reading: "むこう", title: "真理の探究者", color: "#8a8f9c", sil: 1, abilityId: "bibi",         line: "最後の頁(ページ)に、何が書いてあると思う？" },
  shien:    { name: "紫煙のシエン", reading: "しえん", title: "燻(いぶ)す打ち手", color: "#9c6ab0", sil: 3, abilityId: "kakeha-bet", line: "じっくり、じわじわ。逃がさないよ。" },
};

// 大会 → 登場ライバル候補（優先順）。ティアの人数ぶん、頭から採用する。
// T3（出場8＝相手7）は全員ネームドなので7体ぶん用意する。
const ASSIGN = {
  "menzen-kaiken":    ["shizuka", "kurono", "mirei"],
  "chin-iki":         ["hiro", "shien", "mirei"],
  "ji-peeko":         ["ren", "mirei", "shizuka"],
  "musou-kan":        ["garou", "kurono", "shien"],
  "kyou-sharin":      ["mirei", "ren", "tenka"],
  "daisanken":        ["enji", "garou", "shien"],
  "tenankou":         ["kurono", "enji", "garou"],
  "tenchi-shingyoku": ["tenka", "mirei", "shien", "garou", "kurono", "ren", "hiro"],
  "musou-kokusho":    ["mukou", "garou", "tenka", "enji", "kurono", "mirei", "shien"],
};

// 1体のネームド・ライバルを対局用キャラ・オブジェクトに組む（モブと同形）。
// 立ち絵は流用シルエット。isMob:false＝匿名化しない（名前・肩書きを出す）。
function buildRival(id, def, startingPoints) {
  const portrait = `graphic/chars/mobs/${def.sil}.png`;
  return {
    id: `rival:${id}`,
    name: def.name,
    reading: def.reading || "",
    color: def.color || "#7c7f8a",
    role: "rival",
    isMob: false,
    isRival: true,
    rivalTitle: def.title || "",
    introLine: def.line || "",
    mobSilhouette: def.sil,
    bio: "",
    profile: "",
    stats: { startingPoints: startingPoints ?? 25000 },
    assets: { icon: portrait, portrait, voices: {} },
    params: { attack: 4, defense: 4, quirk: 5, difficulty: 5 },
    portraitPos: "top center",
    abilities: def.abilityId ? [{ abilityId: def.abilityId, params: {} }] : [],
  };
}

// 大会の対戦相手一団を作る。先頭からネームド（ティア人数ぶん）→残りはシルエットのモブで充足。
//   tournamentId / tier … どの大会か（ネームド選定）。
//   count               … 必要な相手数（卓人数−1）。
//   seedPrefix          … モブ側 seed の接頭辞（同定保持）。
//   startingPoints      … 全員の初期点。
// 戻り値：opponents 配列（前から名のあるライバル、後ろにモブ）。
export function tournamentRoster(tournamentId, tier, count, { seedPrefix = "league", startingPoints = 25000 } = {}) {
  const wantNamed = Math.min(NAMED_BY_TIER[tier] || 0, count);
  const ids = (ASSIGN[tournamentId] || []).slice(0, wantNamed);
  const named = ids.map((id) => buildRival(id, RIVAL_POOL[id], startingPoints));
  const fillCount = Math.max(0, count - named.length);
  const mobs = fillCount > 0
    ? makeMobRoster(fillCount, { seedPrefix: `${seedPrefix}-${tournamentId}`, startingPoints })
    : [];
  return [...named, ...mobs];
}

// 表示用：その大会のネームド一覧（情報画面のライバル紹介などに使える）。
export function namedRivalsFor(tournamentId, tier) {
  const wantNamed = NAMED_BY_TIER[tier] || 0;
  return (ASSIGN[tournamentId] || []).slice(0, wantNamed).map((id) => ({ id, ...RIVAL_POOL[id] }));
}

// 大会のライバル“ユニット”を作る（ペア/団体のリーグ用）。unitCount-1 ユニット、各 unitSize 人。
// 各ユニットは「先頭＝ネームド or モブの代表（lead）＋残りはモブ充足」。ユニット名＝代表名。
//   unitSize=1（個人）なら従来どおり 1 人ユニットの集まり。
export function rivalUnits(tournamentId, tier, unitCount, unitSize, { seedPrefix = "league", startingPoints = 25000 } = {}) {
  const leadCount = Math.max(0, unitCount - 1); // 弟子ユニットを除く
  const leads = tournamentRoster(tournamentId, tier, leadCount, { seedPrefix, startingPoints });
  return leads.map((lead, ui) => {
    const members = [lead];
    for (let m = 1; m < unitSize; m++) {
      members.push(makeMob({ seed: `${seedPrefix}-${tournamentId}-u${ui}-m${m}`, startingPoints }));
    }
    return { id: lead.id, name: lead.name, isRival: !!lead.isRival, rivalTitle: lead.rivalTitle || "", introLine: lead.introLine || "", color: lead.color, lead, members };
  });
}
