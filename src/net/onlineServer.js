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
  // 解禁制キャラ（locked）はCPU補填に出さない（アカウント解禁コンテンツなので汎用CPUにしない）。
  const cpuPool = shuffled(CHARACTERS.filter((c) => !used.has(c.id) && !c.locked));
  const chars = humans.slice();
  while (chars.length < CAPACITY) chars.push(cpuPool.shift() || CHARACTERS[chars.length % CHARACTERS.length]);
  const seated = chars.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  const game = new Game(seated, /*human seat*/ 0, undefined, { maxRounds: 1 });
  return { game, roster: chars.map((c) => c.id) };
}

// 待合室スロット（human/cpu/open 混在・長さ CAPACITY）から卓を組む。**スロット順＝席順**を保つので、
// 待合室の見た目と対局の席順が一致する。human はその charId、cpu/open は人間と重複しない CPU を補填。
export function buildSeatedGameFromSlots(slots) {
  const resolve = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  const used = new Set();
  for (const s of slots) if (s.type === "human") used.add(resolve(s.charId).id);
  // 解禁制キャラ（locked）はCPU補填に出さない（アカウント解禁コンテンツなので汎用CPUにしない）。
  const cpuPool = shuffled(CHARACTERS.filter((c) => !used.has(c.id) && !c.locked));
  const chars = slots.map((s, i) => {
    if (s.type === "human") return resolve(s.charId);
    const c = cpuPool.shift() || CHARACTERS[i % CHARACTERS.length];
    used.add(c.id);
    return c;
  });
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
    this.slots = null;         // ルーム対戦の待合室スロット [CAPACITY]（lobby時のみ生成・人間ゼロで null）
  }

  handle(connection, opts = {}) {
    connection.onMessage((msg) => {
      if (!msg) return;
      if (msg.type === "intent.join") {
        // charId=使用キャラ / name=ユーザー名 / dan=段位 / oshi=推しキャラID（表示用。欠落しうる）。
        const info = { charId: msg.charId, name: msg.name, dan: msg.dan, oshi: msg.oshi };
        // lobby=true（ルーム対戦）はホスト主導の待合室へ。未指定（マッチング対戦）は従来の自動待機列へ。
        if (msg.lobby) this._lobbyJoin(connection, info, opts);
        else this._enqueue(connection, info, opts);
      } else if (msg.type === "intent.rejoin") {
        const e = (msg.token != null) ? this.tokenSeat[msg.token] : undefined;
        if (e) {
          e.room.rejoin(e.seat, connection); // 席を本人へ戻し snapshot 送付
        } else {
          connection.send({ type: "evt.rejoinFailed", reason: "対局が見つかりません" });
          connection.close?.();
        }
      } else if (msg.type === "intent.lobbySetChar") {
        this._lobbySetChar(connection, msg.charId);
      } else if (msg.type === "intent.lobbySlot") {
        this._lobbySlot(connection, msg.slot, msg.state); // ホスト限定（_lobbySlot 内で検証）
      } else if (msg.type === "intent.lobbyStart") {
        this._lobbyStart(connection);                     // ホスト限定（_lobbyStart 内で検証）
      }
    });
  }

  // --- ルーム対戦の待合室（ホスト主導・自動タイマーなし） -------------------------------
  // ホスト＝最小 index の human スロット（離脱で次の人間へ繰り上がり）。
  _hostSeat() { return this.slots ? this.slots.findIndex((s) => s.type === "human") : -1; }
  _isHost(connection) {
    const h = this._hostSeat();
    return h >= 0 && this.slots[h].conn === connection;
  }

  // 入室＝最初の open スロットを human で埋める。満席なら evt.lobbyFull で弾く。
  _lobbyJoin(connection, info, opts) {
    this.opts = opts;
    if (!this.slots) this.slots = Array.from({ length: CAPACITY }, () => ({ type: "open" }));
    const idx = this.slots.findIndex((s) => s.type === "open");
    if (idx < 0) { connection.send({ type: "evt.lobbyFull" }); connection.close?.(); return; }
    this.slots[idx] = {
      type: "human", conn: connection,
      charId: info.charId, name: info.name ?? null, dan: info.dan ?? null, oshi: info.oshi ?? null,
    };
    // 待合室中の離脱のみ面倒を見る（開始後は AuthorityRoom.dropSeat が担当・slots=null で no-op）。
    connection.onClose?.(() => this._lobbyLeave(connection));
    this._broadcastLobby();
  }

  _lobbyLeave(connection) {
    if (!this.slots) return; // 既に開始済み（slots=null）
    const idx = this.slots.findIndex((s) => s.type === "human" && s.conn === connection);
    if (idx < 0) return;
    this.slots[idx] = { type: "open" };
    if (!this.slots.some((s) => s.type === "human")) { this.slots = null; return; } // 全員退室＝部屋リセット
    this._broadcastLobby();
  }

  // 待合室で雀士を変更（本人スロットのみ）。
  _lobbySetChar(connection, charId) {
    if (!this.slots || !charId) return;
    const slot = this.slots.find((s) => s.type === "human" && s.conn === connection);
    if (!slot) return;
    slot.charId = charId;
    this._broadcastLobby();
  }

  // 空き枠の CPU 確定 / 解除（ホスト限定）。state="cpu"|"open"。
  _lobbySlot(connection, slot, state) {
    if (!this.slots || !this._isHost(connection)) return;
    if (typeof slot !== "number" || slot < 0 || slot >= CAPACITY) return;
    const cur = this.slots[slot];
    if (state === "cpu" && cur.type === "open") this.slots[slot] = { type: "cpu" };
    else if (state === "open" && cur.type === "cpu") this.slots[slot] = { type: "open" };
    else return;
    this._broadcastLobby();
  }

  // 待合室の現況を全 human 接続へ配信。各接続に自席 yourSeat を含める（自分が最上＝視点別）。
  _broadcastLobby() {
    if (!this.slots) return;
    const members = this.slots.map((s, i) => {
      if (s.type === "human") return { seat: i, kind: "human", name: s.name, dan: s.dan, charId: s.charId, oshi: s.oshi };
      if (s.type === "cpu") return { seat: i, kind: "cpu" };
      return { seat: i, kind: "open" };
    });
    const hostSeat = this._hostSeat();
    this.slots.forEach((s, i) => {
      if (s.type === "human") s.conn.send({ type: "evt.lobby", members, hostSeat, capacity: CAPACITY, yourSeat: i });
    });
  }

  // ホストの開始：残り open を CPU 化して卓を確定（_start と同形。token/welcome/rejoin 照合も同じ）。
  _lobbyStart(connection) {
    if (!this.slots || !this._isHost(connection)) return;
    const slots = this.slots.map((s) => (s.type === "open" ? { type: "cpu" } : s));
    const { game, roster } = buildSeatedGameFromSlots(slots);
    const playersInfo = roster.map((charId, seat) => {
      const s = slots[seat];
      return s.type === "human" ? { charId, name: s.name, dan: s.dan, oshi: s.oshi } : { charId, cpu: true };
    });
    const connections = {};
    slots.forEach((s, seat) => { if (s.type === "human") connections[seat] = s.conn; });
    const room = new AuthorityRoom(game, connections, this.opts || {});
    room.roster = roster;
    room.players = playersInfo;
    room.seatTokens = {};
    slots.forEach((s, seat) => {
      if (s.type !== "human") return;
      const token = randomToken();
      room.seatTokens[seat] = token;
      this.tokenSeat[token] = { room, seat };
      s.conn.send({ type: "welcome", seat, roster, players: playersInfo, token, rules: { players: game.numPlayers } });
      s.conn.onClose?.(() => room.dropSeat(seat));
    });
    this.room = room;
    this.slots = null; // 待合室を消費（以後の join は新バッチ＝新ホスト扱い）
    room.run().catch((e) => console.error("room.run crashed", e));
  }

  // 待機バッチへ着席。満席＝即開始 / 待機時間ゼロ＝即開始 / それ以外は締切タイマーで人間を待つ。
  // info = { charId, name, dan }（name/dan は表示用・任意）。文字列だけ渡されても charId として受ける。
  _enqueue(connection, info, opts) {
    this.opts = opts;
    const meta = (typeof info === "string") ? { charId: info } : (info || {});
    const entry = { connection, charId: meta.charId, name: meta.name ?? null, dan: meta.dan ?? null, oshi: meta.oshi ?? null };
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
    // 席ごとの表示情報（対局開始画面/卓上ネームプレート用）。人間席=名前/段位、空席=CPU。
    const playersInfo = roster.map((charId, seat) => {
      const h = seats[seat];
      return h ? { charId, name: h.name, dan: h.dan, oshi: h.oshi } : { charId, cpu: true };
    });
    const room = new AuthorityRoom(game, connections, this.opts || {});
    room.roster = roster;
    room.players = playersInfo; // リコネクト時の welcome にも載せられるよう保持
    room.seatTokens = {};
    seats.forEach((s, seat) => {
      const token = randomToken();
      room.seatTokens[seat] = token;
      this.tokenSeat[token] = { room, seat };
      s.connection.send({ type: "welcome", seat, roster, players: playersInfo, token, rules: { players: game.numPlayers } });
      s.connection.onClose?.(() => room.dropSeat(seat));
    });
    this.room = room;
    room.run().catch((e) => console.error("room.run crashed", e));
  }
}
