// 通信対戦 L4b: 席別 redaction（隠匿情報の除去）。
//
// サーバ権威の肝は「クライアントに知り得ない情報を一切送らない」こと（docs/online-multiplayer-p0.md §5）。
// 配信前に、宛先席 `seat` から見て隠匿すべき値を伏せた Event を作る。公開情報（河・面子・点数・ドラ・
// 各席の手牌枚数=pub.handCounts）はそのまま。隠匿対象は「他席の配牌・他席のツモ牌・他席の手牌
// スナップショット」だけ。seed や未ツモの山は元々どの Event にも入れていない。
export function redactFor(rec, seat) {
  switch (rec.type) {
    case "handStarted": {
      // 自席の配牌だけ実値、他席は null（枚数は pub.handCounts で伝わる）。
      const hands = rec.hands.map((h, i) => (i === seat ? h : null));
      return { ...rec, hands };
    }
    case "tileDrawn":
      // 自席のツモだけ実値。他席は「引いた事実」のみ（牌は伏せる＝山読み防止）。
      if (rec.seat === seat) return rec;
      return { ...rec, tileId: null, kind: null };
    case "abilityUsed":
      // 河の書き換えは公開（discards はそのまま）。手牌スナップショットは自席のみ。
      if (rec.seat === seat) return rec;
      return { ...rec, hand: null };
    default:
      // tileDiscarded / meldCalled / riichiDeclared / handWon / handDrawn は公開情報のみ。
      return rec;
  }
}
