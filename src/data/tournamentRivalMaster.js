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

// ライバル本体プール。sil＝流用シルエット番号(1〜10) / abilityId＝既存 abilityMaster の id。
// 口上は因縁の段階で変わる（蓄積×反転＝「相手もこちらを覚えている」）：
//   line    … 初対面（一度もリーグを共にしていない）
//   rematch … 再会（同じリーグを戦ったことがある）
//   grudge  … 雪辱（こちらが2回以上上位でフィニッシュ＝向こうの因縁。敗者の言葉が一番キャラが出る）
//   proud   … 勝ち誇り（こちらが2回以上負け越し＝向こうが「格の差」を口にする。雪辱の的を立てる）
const RIVAL_POOL = {
  shizuka:  { name: "黙打ちの静",   reading: "しずか", title: "門前ひとすじ", color: "#6f7e9c", sil: 2, abilityId: "lucky-draw",   line: "……喋らないわ。卓の上で語るから。",
              rematch: "……また会ったわね。……それだけ。", grudge: "……あなたの打牌、ぜんぶ覚えてる。今日は、語らせて。", proud: "……あなたには、負けてない。これからも。" },
  hiro:     { name: "一色の緋呂",   reading: "ひろ",   title: "染め手の鬼",   color: "#b8472f", sil: 7, abilityId: "chunchan",    line: "色を決めたら、もう曲げない。それだけだ。",
              rematch: "お前か。前の卓の色は、まだ覚えてるぞ。", grudge: "お前に染められた負けの色が、まだ落ちん。……今日こそ塗り替える。", proud: "お前との卓は、いつも俺の色で終わる。今日もだ。" },
  ren:      { name: "対(つい)の漣", reading: "れん",   title: "形にこだわる男", color: "#3f8f86", sil: 9, abilityId: "danger-sense", line: "美しい手は、二つで一つ。崩させはしない。",
              rematch: "また君か。……前の対局、対子のように二つ並べて覚えている。", grudge: "君に崩された形を、何度も並べ直した。……今日は完成させる。", proud: "君とは何度も打ったが、形は崩れていない。……美しいまま勝たせてもらう。" },
  garou:    { name: "牙狼",         reading: "ガロウ", title: "国士の亡者",   color: "#7a5cc0", sil: 6, abilityId: "dora-pull",    line: "十三種、すべて喰らい尽くしてやる。",
              rematch: "また貴様か。……いい牙になってきたな。", grudge: "二度も、三度も……！　貴様だけは、ここで喰っておく。", proud: "ハッ、また喰われに来たか。いい度胸だ。" },
  mirei:    { name: "鏡の美玲",     reading: "みれい", title: "写し取る打ち手", color: "#c06a9c", sil: 4, abilityId: "lucky-draw",   line: "あなたの手、そっくり頂くわ。",
              rematch: "また会えたわね。あなたの打ち筋、もう写してあるの。", grudge: "鏡のこっち側で、何度も負けたわ。……今日は、あなた以上のあなたになる。", proud: "あなたの手はもう全部写したわ。……勝ち筋まで、ね。" },
  enji:     { name: "三槓子の焔司", reading: "えんじ", title: "支配の剣",     color: "#d0682f", sil: 8, abilityId: "kakeha-bet",   line: "場を制すのは、いつだって俺の役だ。",
              rematch: "戻ってきたか。この卓の主役は譲らんぞ。", grudge: "お前の前でだけ、場が言うことを聞かん。……今日で終わらせる。", proud: "お前相手なら、場は俺に従う。いつも通りにな。" },
  kurono:   { name: "暗刻の玄乃",   reading: "くろの", title: "闇に伏せる者", color: "#4a5566", sil: 10, abilityId: "danger-sense", line: "見えぬ手こそ、最も重い。",
              rematch: "……また伏せ合う仲か。悪くない。", grudge: "何度伏せても、あなたは見抜いてくる。……ならば今日は、底の底を見せよう。", proud: "……あなたの手は、よく見える。今日も、底まで。" },
  tenka:    { name: "天運の天香",   reading: "てんか", title: "確率を嗤う女", color: "#caa23a", sil: 5, abilityId: "dora-pull",    line: "運？ いいえ、これが私の実力。",
              rematch: "あら、また当たったわね。……確率って、意地悪。", grudge: "あなたに負ける確率、計算ではゼロだったのに。……今日、世界を正すわ。", proud: "あなたが私に勝つ確率？　ふふ、小数点の下を探して。" },
  mukou:    { name: "無垢の無辜",   reading: "むこう", title: "真理の探究者", color: "#8a8f9c", sil: 1, abilityId: "bibi",         line: "最後の頁(ページ)に、何が書いてあると思う？",
              rematch: "また君だ。……君の章は、読み応えがある。", grudge: "君に負けるたび、頁が増えていく。……結末は、書き換えさせてもらう。", proud: "君の章は、もう読み終えた。……結末も知っている。" },
  shien:    { name: "紫煙のシエン", reading: "しえん", title: "燻(いぶ)す打ち手", color: "#9c6ab0", sil: 3, abilityId: "kakeha-bet", line: "じっくり、じわじわ。逃がさないよ。",
              rematch: "おや、また燻し甲斐のある顔が来た。", grudge: "君だけは煙に巻けない。……なら、今日は直火でいこうか。", proud: "君はいつも、いい色に燻し上がる。……今日も、じっくりいこうか。" },
};

// 因縁段階の口上を解決する。unitOrCharId は "rival:shizuka" 形式でも素の id でも可。
// history＝profile.records.rivalHistory（{ [id]: { met, beaten, lostTo } }）。無ければ初対面。
// 優先順位: 雪辱（向こうの因縁・beaten>=2）＞ 勝ち誇り（こちらの純粋な負け越し・lostTo>=2 かつ lostTo>beaten）
// ＞ 再会 ＞ 初対面。五分（beaten=lostTo=2 等）は雪辱側＝「何度も上に立たれた記憶」のほうが口をつく。
export function rivalIntroLineFor(unitOrCharId, history = {}) {
  const id = String(unitOrCharId || "").replace(/^rival:/, "");
  const def = RIVAL_POOL[id];
  if (!def) return "";
  const h = history[id];
  if (!h || !(h.met > 0)) return def.line;
  if ((h.beaten || 0) >= 2 && def.grudge) return def.grudge;
  if ((h.lostTo || 0) >= 2 && (h.lostTo || 0) > (h.beaten || 0) && def.proud) return def.proud;
  return def.rematch || def.line;
}

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
  "kyuuren-houtou":   ["mukou", "garou", "tenka", "enji", "kurono", "mirei", "shien"],
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
