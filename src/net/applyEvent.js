// 通信対戦 L3: wire Event を「レプリカ Game」へ適用するリデューサ。
//
// ルールは再実行しない（クライアントは隠匿情報を持たないため不可能かつ不要）。エンジンが確定した
// 結果(Event)を、レンダラが読む可視フィールド(hand/discards/melds/riichi/points 等)へ反映するだけ。
// クライアントはこの applyEvent だけで盤面を描画できる。点数等の公開スカラは各 Event の pub から同期。
//
// 適用対象は実 Game インスタンス(レプリカ)。startHand 等のミューテータは呼ばず、ここでのみ更新する。
//
// opts.viewpoint を渡すと redaction モード：自席(viewpoint)は配信された実 tile で手牌を tracking し、
// 他席は「伏せ札（枚数のみ）」= pub.handCounts ぶんのプレースホルダで保持する（他席の牌は知り得ない）。
// viewpoint 未指定なら全席を実 tile で再構築（L3/L4a の全公開モード＝後方互換）。

import { Events } from "../core/events.js";

const tileFrom = (lite) => ({ id: lite.id, kind: lite.kind });
const FACE_DOWN = () => ({ id: null, kind: -1, hidden: true });

// 公開スカラ(全クライアント共通)を同期。点数・ドラ・壁残り・手番/フェーズ等。
function syncPublic(game, pub) {
  if (!pub) return;
  game.turn = pub.turn;
  game.phase = pub.phase;
  game.dealerIndex = pub.dealer;
  game.kyoku = pub.kyoku;
  game.honba = pub.honba;
  game.roundWind = pub.roundWind;
  game.kyotaku = pub.kyotaku;
  game.players.forEach((p, i) => { p.points = pub.points[i]; });
  // レプリカは実 Wall を持たない。描画が参照する最小限(残り枚数/ドラ表示/表ドラ種)をスタブで供給。
  // uraKinds は和了まで隠す情報なので空配列（pub に載せない＝漏洩防止。裏ドラ表示は結果側で扱う）。
  game.wall = {
    liveRemaining: pub.wallRemaining,
    _dora: pub.dora.map(tileFrom),
    _doraKinds: pub.doraKinds || [],
    doraIndicators() { return this._dora; },
    doraKinds() { return this._doraKinds; },
    uraKinds() { return []; },
  };
}

export function applyEvent(game, evt, opts = {}) {
  const { viewpoint = null } = opts;
  switch (evt.type) {
    case "handStarted": {
      game.handNumber = evt.handNumber;
      game.players.forEach((p, i) => {
        p.hand = (evt.hands[i] || []).map(tileFrom);
        p.discards = [];
        p.melds = [];
        p.riichi = false;
        p.doubleRiichi = false;
        p.ippatsu = false;
        p.kita = [];
        p.drawnTileId = null;
        if (evt.seatWinds) p.seatWind = evt.seatWinds[i];
      });
      break;
    }
    case "tileDrawn": {
      const p = game.players[evt.seat];
      p.hand.push(tileFrom({ id: evt.tileId, kind: evt.kind }));
      p.drawnTileId = evt.tileId;
      break;
    }
    case "tileDiscarded": {
      const p = game.players[evt.seat];
      const i = p.hand.findIndex((t) => t.id === evt.tileId);
      if (i >= 0) p.hand.splice(i, 1);
      p.drawnTileId = null;
      const tile = { id: evt.tileId, kind: evt.kind, tsumogiri: evt.tsumogiri, riichiTile: evt.riichiTile };
      p.discards.push(tile);
      game.lastDiscard = tile;           // 鳴き窓UIのラベル等が参照する
      game.lastDiscardFrom = evt.seat;
      break;
    }
    case "riichiDeclared": {
      game.players[evt.seat].riichi = true;
      break;
    }
    case "meldCalled": {
      const p = game.players[evt.seat];
      // 面子は丸ごと差し替え（公開情報。加槓=既存ポンの差し替えも一貫して反映される）。
      p.melds = evt.melds.map((m) => ({
        type: m.type,
        tiles: m.tiles.map(tileFrom),
        from: m.from,
        calledTile: m.calledTileId != null ? { id: m.calledTileId } : null,
      }));
      // 鳴いた牌のうち自身の手牌にある分を除去（called=他家の捨て牌は手牌に無い→no-op）。
      const meldIds = new Set();
      for (const m of evt.melds) for (const t of m.tiles) meldIds.add(t.id);
      p.hand = p.hand.filter((t) => !meldIds.has(t.id));
      // 鳴かれた牌は捨て手から消える（_consumeDiscardTile と同じ。id 一致でフィルタ＝冪等）。
      for (const m of evt.melds) {
        if (m.from != null && m.calledTileId != null) {
          const river = game.players[m.from].discards;
          const j = river.findIndex((t) => t.id === m.calledTileId);
          if (j >= 0) river.splice(j, 1);
        }
      }
      break;
    }
    case "abilityUsed": {
      // 河↔手牌を書き換える能力(recall-deal)を当該席のスナップショットで再同期する。
      const p = game.players[evt.seat];
      if (evt.hand) p.hand = evt.hand.map(tileFrom);
      if (evt.discards) {
        p.discards = evt.discards.map((t) => ({
          id: t.id, kind: t.kind, tsumogiri: t.tsumogiri, riichiTile: t.riichiTile,
        }));
      }
      break;
    }
    case "handWon":
    case "handDrawn":
      // 席ごとの durable 状態は変えない（点数は pub で同期）。結果画面が読む lastResult を据える。
      if (evt.result) game.lastResult = evt.result;
      break;
    case "evt.snapshot": {
      // 再接続：途中局面からレプリカを丸ごと組み直す（席別 redaction 済みを受ける）。
      game.handNumber = evt.handNumber;
      game.players.forEach((p, i) => {
        p.hand = (evt.hands[i] || []).map(tileFrom); // 自席のみ実値、他席は後段の伏せ札正規化
        const s = evt.seats[i];
        p.discards = s.discards.map((t) => ({ id: t.id, kind: t.kind, tsumogiri: t.tsumogiri, riichiTile: t.riichiTile }));
        p.melds = s.melds.map((m) => ({
          type: m.type, tiles: m.tiles.map(tileFrom), from: m.from,
          calledTile: m.calledTileId != null ? { id: m.calledTileId } : null,
        }));
        p.riichi = !!s.riichi;
        p.kita = [];
        p.drawnTileId = null;
        if (evt.seatWinds) p.seatWind = evt.seatWinds[i];
      });
      game.lastDiscard = evt.lastDiscard ? { id: evt.lastDiscard.id, kind: evt.lastDiscard.kind } : null;
      break;
    }
  }
  syncPublic(game, evt.pub);
  // redaction モード: 他席手牌は伏せ札（枚数のみ）に正規化する。自席は実 tile を tracking 済み
  // なので触らない。枚数は公開情報 pub.handCounts を真とする（鳴き/加槓で枚数が動いても追従）。
  if (viewpoint != null && evt.pub && Array.isArray(evt.pub.handCounts)) {
    game.players.forEach((p, i) => {
      if (i === viewpoint) return;
      const n = evt.pub.handCounts[i];
      p.hand = Array.from({ length: n }, FACE_DOWN);
    });
  }
  // 理牌：オフラインの _sortHand と同じ並び(kind→id)に揃える。レプリカはイベント順で手牌を
  // 積むため、揃えないと画面の手牌がバラバラに見える（伏せ札 kind=-1/id=null は実質no-op）。
  for (const p of game.players) p.hand.sort((a, b) => (a.kind - b.kind) || ((a.id ?? 0) - (b.id ?? 0)));
  // emit モード: レプリカの bus に、エンジンと同じイベントを再発火する。これでレンダラ/SE/相棒
  // ボード/カットイン等の既存リスナがそのまま動く（クライアントは applyEvent だけで描画できる）。
  if (opts.emit) emitForEvent(game, evt);
  return game;
}

// レプリカの bus へ、対応するエンジンイベントを発火（最後に STATE_CHANGED で再描画）。
function emitForEvent(game, evt) {
  const bus = game.bus;
  if (!bus) return;
  const P = (s) => game.players[s];
  switch (evt.type) {
    case "handStarted": bus.emit(Events.HAND_STARTED, { handNumber: evt.handNumber, dealer: evt.dealer }); break;
    case "tileDrawn": bus.emit(Events.TILE_DRAWN, { player: P(evt.seat), tile: { id: evt.tileId, kind: evt.kind } }); break;
    case "tileDiscarded": {
      const p = P(evt.seat);
      bus.emit(Events.TILE_DISCARDED, { player: p, tile: p.discards[p.discards.length - 1] });
      break;
    }
    case "riichiDeclared": bus.emit(Events.RIICHI_DECLARED, { player: P(evt.seat) }); break;
    case "meldCalled": bus.emit(Events.MELD_CALLED, { player: P(evt.seat), type: evt.bannerType || "pon" }); break;
    case "abilityUsed": bus.emit(Events.ABILITY_USED, { player: P(evt.seat), name: evt.name }); break;
    case "handWon": bus.emit(Events.HAND_WON, game.lastResult); break;
    case "handDrawn": bus.emit(Events.HAND_DRAWN, game.lastResult); break;
  }
  game.emitState(); // STATE_CHANGED → render
}
