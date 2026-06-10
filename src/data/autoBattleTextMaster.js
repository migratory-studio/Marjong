// オートバトルの地の文・テキストマスタ（軸3: 局中の揺れ・めくり演出）。
//
// モブ無口ポリシー: ここに置くのはナレーション（地の文）のみ。「{name}がリーチを宣言した」は
// 実況であってモブのセリフではない。モブに直接喋らせる文言は書かないこと。
// 経過ビートは「解決済みの結果から逆算」して選ぶ＝演出と結果が必ず噛み合う。

export const AB_BEATS = {
  // 自分の和了局でリーチが付いたとき（winnerSeat=0 && riichi）。
  selfRiichi: [
    "リーチ！　勝負に出た——",
    "千点棒が、静かに場に置かれた。",
  ],
  // 相手の和了局でリーチが付いたとき。{name} に勝者名が入る。
  oppRiichi: [
    "{name}がリーチを宣言した！",
    "{name}の河が止まった——リーチだ。",
  ],
  // リーチなし局: 相手スタンス別の場の空気。
  byOppStance: {
    push: [
      "相手の捨て牌が鋭い。攻めてきている——",
      "場に緊張が走る。",
    ],
    pull: [
      "場が静かだ。誰も踏み込んでこない。",
      "河が整っている……守りの匂いがする。",
    ],
    watch: [
      "様子見の応酬。場が煮詰まっていく……",
      "誰も仕掛けない。嵐の前の静けさ。",
    ],
    last: [
      "空気が変わった。誰かが勝負に出る——！",
      "鋭い視線が卓に刺さる。",
    ],
  },
  // リーチなしの大物手（満貫以上）局: 2行目の煽り。
  bigMove: [
    "誰かの手が、静かに完成へ向かっている——",
    "卓の空気が、張り詰めた。",
  ],
};

// 意図チップ（軸B: 相手スタンスのアイコン化）。卓中央に出す漢字一文字。
export const INTENT_KANJI = { push: "攻", pull: "守", watch: "観", last: "賭" };

// 読み開示時の確定ヒント（autoBattleScreen から移設）。
export const STANCE_HINT = {
  push: "押してきそうだ", pull: "受けに回るか", watch: "様子を見ている", last: "勝負を懸けてくる",
};

// 未開示時の「曖昧な気配」。外れていることもある（的中率は読み差で変動）。
export const VAGUE_HINT = {
  push: "…攻め気の匂いがする？", pull: "…守りに入る気配？", watch: "…静かに構えている？", last: "…何か仕掛けてきそうな…？",
};

// 読み合いフィードバックのバッジ文言。
export const EDGE_LABEL = {
  readWin: "読み勝ち！",    // 開示情報に正しく対応して取った
  luckyMatch: "かみ合った！", // 未開示だが相性が刺さった
  readMiss: "読み外し…",    // 開示されていたのに不利対応で落とした
};

// 経過ビートの連鎖（1〜2行）を組む。res は resolveRound の戻り値、winnerName は勝者の表示名。
// 通常局=1行（場の空気）。リーチ局・大物手局=2行（空気→実況）で「見守るドラマ」を作る（軸D′）。
// rng は演出用乱数（ロジック列を汚さないこと）。
export function pickBeatChain(res, winnerName, rng = Math.random) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const pool = AB_BEATS.byOppStance[res.oppStance] || AB_BEATS.byOppStance.watch;
  const lines = [pick(pool)];
  if (res.hand?.riichi) {
    lines.push(res.hand.winnerSeat === 0
      ? pick(AB_BEATS.selfRiichi)
      : pick(AB_BEATS.oppRiichi).replace("{name}", winnerName || "相手"));
  } else if ((res.hand?.han || 0) >= 5) {
    lines.push(pick(AB_BEATS.bigMove));
  }
  return lines;
}
