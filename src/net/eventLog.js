// 通信対戦 L3: エンジンの bus イベントを「シリアライズ可能な Event 列」へ捕捉する計装。
//
// オフライン対局では使わない（main.js は無改変）。将来の権威(サーバ)が対局を回しつつここで
// Event 化し、各クライアントへ配信する。クライアントは applyEvent.js でこの Event 列だけから
// 盤面を再構築して描画する。隠匿情報の除去(redaction)は L4 / docs/online-multiplayer-p0.md §5
// で別途。本モジュールは「捕捉とシリアライズ」と「決定論テスト用の真スナップショット」を担う。
import { Events } from "../core/events.js";

export const EVENT_VERSION = 1;

const tileLite = (t) => ({ id: t.id, kind: t.kind });
const tileId = (t) => (t ? t.id : null);

// seat の面子を公開形へ（牌は id+kind、called/from も保持）。
function serializeMelds(player) {
  return player.melds.map((m) => ({
    type: m.type,
    tiles: m.tiles.map(tileLite),
    from: m.from ?? null,
    calledTileId: tileId(m.calledTile),
  }));
}

// 公開スカラのスナップショット（全クライアントが等しく知ってよい値）。毎イベントに添える。
export function publicSnapshot(game) {
  return {
    turn: game.turn,
    phase: game.phase,
    dealer: game.dealerIndex,
    kyoku: game.kyoku,
    honba: game.honba,
    roundWind: game.roundWind,
    kyotaku: game.kyotaku,
    wallRemaining: game.wall ? game.wall.liveRemaining : 0,
    points: game.players.map((p) => p.points),
    // 各席の手牌枚数は公開情報（誰が何枚持つかは見える）。redaction 後も他席はこの枚数だけ伝える。
    handCounts: game.players.map((p) => p.hand.length),
    dora: game.wall ? game.wall.doraIndicators().map(tileLite) : [],
    // 表ドラ種（表示牌から導いた実ドラ）も公開。※裏ドラ(uraKinds)は和了まで隠す＝pub に載せない。
    doraKinds: game.wall ? game.wall.doraKinds() : [],
  };
}

// 局結果(lastResult)を配信用にシリアライズ。結果画面(showHandResult)が役/点/和了手まで読むため、
// 和了時点で公開される lastResult を丸ごと JSON クローンで運ぶ（winningHand=勝者の公開手・winningTile・
// 役・点・deltas など。敗者の手牌は lastResult に含まれないので漏洩しない）。失敗時は最小限へ退避。
function serializeResult(r) {
  if (!r) return null;
  try {
    return JSON.parse(JSON.stringify(r));
  } catch {
    return { winner: r.winner ?? null, deltas: Array.isArray(r.deltas) ? r.deltas.slice() : null, draw: !!r.draw };
  }
}

// 再接続用の盤面スナップショット（wire Event）。現在の局面一式を運ぶ。redactFor で席別に
// 他席手牌を伏せて配信し、applyEvent("evt.snapshot") が途中局面からレプリカを組み直す。
export function snapshotEvent(game) {
  return {
    type: "evt.snapshot",
    handNumber: game.handNumber,
    seatWinds: game.players.map((p) => p.seatWind),
    hands: game.players.map((p) => p.hand.map(tileLite)), // 配信時に自席以外を null 化(redactFor)
    seats: game.players.map((p) => ({
      discards: p.discards.map((t) => ({ id: t.id, kind: t.kind, tsumogiri: !!t.tsumogiri, riichiTile: !!t.riichiTile })),
      melds: serializeMelds(p),
      riichi: !!p.riichi,
    })),
    lastDiscard: game.lastDiscard ? { id: game.lastDiscard.id, kind: game.lastDiscard.kind } : null,
    pub: publicSnapshot(game),
  };
}

// 完全状態スナップショット（決定論テストの「真」。redaction なしの全公開＋全手牌）。
export function fullSnapshot(game) {
  return {
    ...publicSnapshot(game),
    seats: game.players.map((p) => ({
      hand: p.hand.map((t) => t.id).sort((a, b) => a - b),
      discards: p.discards.map((t) => t.id),
      melds: serializeMelds(p),
      riichi: !!p.riichi,
      kita: p.kita.map((t) => t.id),
      points: p.points,
    })),
  };
}

// game.bus を購読し、wire Event 列を records に積む。dispose() で購読解除。
// withTruth=true なら各 record に fullSnapshot(=真) を併記する（決定論テスト用）。
// onEvent(rec) を渡すと、Event 確定のたびに同期で呼ぶ（権威が各クライアントへ即配信する用途）。
export function attachRecorder(game, { withTruth = false, onEvent = null } = {}) {
  const records = [];
  let seq = 0;
  const push = (type, fields) => {
    const rec = { v: EVENT_VERSION, seq: seq++, type, ...fields, pub: publicSnapshot(game) };
    if (withTruth) rec.truth = fullSnapshot(game);
    records.push(rec);
    if (onEvent) onEvent(rec);
  };
  const offs = [
    game.bus.on(Events.HAND_STARTED, () =>
      push("handStarted", {
        handNumber: game.handNumber,
        dealer: game.dealerIndex,
        roundWind: game.roundWind,
        kyoku: game.kyoku,
        honba: game.honba,
        // 全席の配牌。redaction では自席のみ実値・他席は枚数のみにする（L4）。
        hands: game.players.map((p) => p.hand.map(tileLite)),
        seatWinds: game.players.map((p) => p.seatWind),
      })
    ),
    game.bus.on(Events.TILE_DRAWN, ({ player, tile }) =>
      push("tileDrawn", { seat: player.index, tileId: tile.id, kind: tile.kind })
    ),
    game.bus.on(Events.TILE_DISCARDED, ({ player, tile }) =>
      push("tileDiscarded", {
        seat: player.index,
        tileId: tile.id,
        kind: tile.kind,
        tsumogiri: !!tile.tsumogiri,
        riichiTile: !!tile.riichiTile,
      })
    ),
    game.bus.on(Events.RIICHI_DECLARED, ({ player }) =>
      push("riichiDeclared", { seat: player.index })
    ),
    game.bus.on(Events.MELD_CALLED, ({ player, type }) =>
      // 面子は全リストをスナップショット（加槓=既存ポンの差し替えも含め一貫して再現できる）。
      // bannerType(pon/chi/kan) は鳴きバナー/SE 用（クライアントの描画 emit が使う）。
      push("meldCalled", { seat: player.index, bannerType: type, melds: serializeMelds(player) })
    ),
    game.bus.on(Events.ABILITY_USED, ({ index, player, name }) =>
      // 能力は ON で河↔手牌を直接書き換えるものがある(recall-deal)。当該席の手牌/河を併記して
      // レプリカを再同期する。granular な能力 Event 化はサーバ権威化(L4 / p0 §6)で行う。
      push("abilityUsed", {
        seat: index,
        name,
        hand: player.hand.map(tileLite),
        discards: player.discards.map((t) => ({
          id: t.id, kind: t.kind, tsumogiri: !!t.tsumogiri, riichiTile: !!t.riichiTile,
        })),
      })
    ),
    game.bus.on(Events.HAND_WON, (r) => push("handWon", { result: serializeResult(r) })),
    game.bus.on(Events.HAND_DRAWN, (r) => push("handDrawn", { result: serializeResult(r) })),
  ];
  const dispose = () => offs.forEach((off) => off && off());
  return { records, dispose };
}
