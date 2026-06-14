// 通信対戦 L4c: 卓ホスト（権威）。接続を席として受け、AuthorityRoom で対局を回す。
//
// 接続(intent.join)はまず**マッチング待機列**に入る。最大 matchWaitMs だけ他の人間プレイヤーを
// 待ち、4人揃うか時間切れになった時点で卓を確定（空席は CPU 補填）して対局を開始する。確定時に
// 各席へ "welcome"(席割・顔ぶれ roster・再接続トークン token) を送り、クライアントがレプリカを組む。
// 切断時はその席を CPU 代打ちへ（room.dropSeat）。**リコネクト(ライト版)**：対局がメモリに生きて
// いる間、同じ卓(=同じ DO / 同じ RoomHost)へ `intent.rejoin{token}` で繋ぎ直すと、席を遠隔へ戻し
// （CPU解除）現在の盤面スナップショットを送って本人がプレイを再開できる。
import { AuthorityRoom } from "./authorityRoom.js";
import { Game } from "../core/game.js";
import { CHARACTERS, instantiateAbilities } from "../characters/characters.js";

const DEFAULT_MATCH_WAIT_MS = 30000; // この時間まで人間を待ち、揃わなければ空席を CPU 補填して開始。
const CAPACITY = 4;

function randomToken() {
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}
function shuffled(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

// 人間席の雀士ID列（席順）から 4 人卓を組む。空席は人間の選択と重複しない CPU で補填。
// 単一IDも受ける（後方互換）。{game, roster} を返す。
export function buildSeatedGame(charIds) {
  const ids = (Array.isArray(charIds) ? charIds : [charIds]).slice(0, CAPACITY);
  const humans = ids.map((id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]);
  const used = new Set(humans.map((c) => c.id));
  const cpuPool = shuffled(CHARACTERS.filter((c) => !used.has(c.id)));
  const chars = humans.slice();
  while (chars.length < CAPACITY) chars.push(cpuPool.shift() || CHARACTERS[chars.length % CHARACTERS.length]);
  const seated = chars.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  const game = new Game(seated, /*human seat*/ 0, undefined, { maxRounds: 1 });
  return { game, roster: chars.map((c) => c.id) };
}

// 1卓を起動して接続を席0に紐づける（単一接続版）。netws テスト等、待機を挟まず即開始する経路で使う。
// opts.token は再接続用、その他は AuthorityRoom へ（timeout/pacing）。
export function serveRoom(connection, game, roster, { seat = 0, token = null, ...roomOpts } = {}) {
  const room = new AuthorityRoom(game, { [seat]: connection }, roomOpts);
  room.roster = roster; room.token = token; room.seat = seat; // リコネクト時の welcome/snapshot 用
  room.seatTokens = token ? { [seat]: token } : {};
  connection.send({ type: "welcome", seat, roster, token, rules: { players: game.numPlayers } });
  connection.onClose?.(() => room.dropSeat(seat));
  room.run().catch((e) => console.error("room.run crashed", e));
  return room;
}

// 1卓ぶんのホスト。接続(intent.join)は待機列に入れ、人間が揃うか時間切れで卓を確定して開始する。
// 開始後の接続(intent.rejoin)は token→卓/席を照合して同じ卓へ復帰させる。**常設マッチメイカー型**：
// DO は対局を開始しても締め出さず、次の待機バッチを受け付け続ける（1 DO で複数卓を順次/並行に持てる）。
// これにより「直近に対局を始めた卓が居座って新規参加を弾く→2人が別バケツに散る」問題を避ける。
export class RoomHost {
  constructor() {
    this.room = null;          // 直近に開始した AuthorityRoom（テスト/デバッグ参照用）
    this.waiting = [];         // 現在の待機バッチ [{connection, charId}]（着席順＝席番号）
    this.timer = null;         // マッチング締切タイマー（バッチごと）
    this.opts = null;          // AuthorityRoom へ渡す pacing/timeout/matchWaitMs
    this.tokenSeat = {};       // token -> { room, seat }（全アクティブ卓ぶんの rejoin 照合）
  }

  handle(connection, opts = {}) {
    connection.onMessage((msg) => {
      if (!msg) return;
      if (msg.type === "intent.join") {
        this._enqueue(connection, msg.charId, opts);
      } else if (msg.type === "intent.rejoin") {
        const e = (msg.token != null) ? this.tokenSeat[msg.token] : undefined;
        if (e) {
          e.room.rejoin(e.seat, connection); // 席を本人へ戻し snapshot 送付
        } else {
          connection.send({ type: "evt.rejoinFailed", reason: "対局が見つかりません" });
          connection.close?.();
        }
      }
    });
  }

  // 待機バッチへ着席。満席＝即開始 / 待機時間ゼロ＝即開始 / それ以外は締切タイマーで人間を待つ。
  _enqueue(connection, charId, opts) {
    this.opts = opts;
    const entry = { connection, charId };
    this.waiting.push(entry);
    // 待機中の離脱のみ面倒を見る（現バッチに居る間だけ）。開始後の席は AuthorityRoom 側(dropSeat)が担当。
    connection.onClose?.(() => {
      const i = this.waiting.indexOf(entry);
      if (i < 0) return; // 既に開始済みでこのバッチには居ない
      this.waiting.splice(i, 1);
      if (this.waiting.length === 0 && this.timer) { clearTimeout(this.timer); this.timer = null; }
      else this._broadcastWaiting();
    });

    const waitMs = opts.matchWaitMs ?? DEFAULT_MATCH_WAIT_MS;
    if (this.waiting.length >= CAPACITY) { this._start(); return; } // 人間だけで満席
    if (waitMs <= 0) { this._start(); return; }                     // 待機なし（テスト/ループバック）
    if (this.timer == null) this.timer = setTimeout(() => this._start(), waitMs);
    this._broadcastWaiting(waitMs);
  }

  _broadcastWaiting(waitMs) {
    const msg = { type: "evt.matchWaiting", joined: this.waiting.length, capacity: CAPACITY };
    if (waitMs != null) msg.waitMs = waitMs;
    for (const w of this.waiting) w.connection.send(msg);
  }

  // バッチを確定して対局開始。待機中の人間を席 0.. に並べ、空席は CPU 補填。席ごとに token を発行。
  // 開始後も this.waiting を空にして次バッチを受け付け続ける（締め出さない）。
  _start() {
    if (this.waiting.length === 0) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const seats = this.waiting.slice(0, CAPACITY);
    this.waiting = [];
    const { game, roster } = buildSeatedGame(seats.map((s) => s.charId));
    const connections = {};
    seats.forEach((s, seat) => { connections[seat] = s.connection; });
    const room = new AuthorityRoom(game, connections, this.opts || {});
    room.roster = roster;
    room.seatTokens = {};
    seats.forEach((s, seat) => {
      const token = randomToken();
      room.seatTokens[seat] = token;
      this.tokenSeat[token] = { room, seat };
      s.connection.send({ type: "welcome", seat, roster, token, rules: { players: game.numPlayers } });
      s.connection.onClose?.(() => room.dropSeat(seat));
    });
    this.room = room;
    room.run().catch((e) => console.error("room.run crashed", e));
  }
}
