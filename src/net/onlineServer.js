// 通信対戦 L4c: 卓ホスト（権威）。接続を席として受け、AuthorityRoom で対局を回す。
//
// 接続直後に "welcome"(席割・卓の顔ぶれ roster・再接続トークン token) を送り、クライアントがレプリカを
// 組めるようにする。切断時はその席を CPU 代打ちへ（room.dropSeat）。**リコネクト(ライト版)**：対局が
// メモリに生きている間、同じ卓(=同じ DO / 同じ RoomHost)へ `intent.rejoin{token}` で繋ぎ直すと、席を
// 遠隔へ戻し（CPU解除）現在の盤面スナップショットを送って本人がプレイを再開できる。
import { AuthorityRoom } from "./authorityRoom.js";
import { Game } from "../core/game.js";
import { CHARACTERS, instantiateAbilities } from "../characters/characters.js";

function randomToken() {
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}
function shuffled(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

// charId（席0の雀士）から 4 人卓を組む（席0=その雀士、残り3席=CPU補填）。{game, roster} を返す。
export function buildSeatedGame(charId) {
  const human = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
  const cpus = shuffled(CHARACTERS.filter((c) => c.id !== human.id)).slice(0, 3);
  const chars = [human, ...cpus];
  const seated = chars.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  const game = new Game(seated, /*human seat*/ 0, undefined, { maxRounds: 1 });
  return { game, roster: chars.map((c) => c.id) };
}

// 1卓を起動して接続を席0に紐づける。opts.token は再接続用、その他は AuthorityRoom へ（timeout/pacing）。
export function serveRoom(connection, game, roster, { seat = 0, token = null, ...roomOpts } = {}) {
  const room = new AuthorityRoom(game, { [seat]: connection }, roomOpts);
  room.roster = roster; room.token = token; room.seat = seat; // リコネクト時の welcome/snapshot 用
  connection.send({ type: "welcome", seat, roster, token, rules: { players: game.numPlayers } });
  connection.onClose?.(() => room.dropSeat(seat));
  room.run().catch((e) => console.error("room.run crashed", e));
  return room;
}

// 1卓ぶんのホスト。最初の接続(intent.join)で卓を作り、以降の接続(intent.rejoin)は同じ卓へ復帰させる。
// DO は 1 インスタンス=1卓なので this.host を DO に保持、server-online は room 名でこれを引く。
export class RoomHost {
  constructor() { this.room = null; this.token = null; }
  handle(connection, opts = {}) {
    connection.onMessage((msg) => {
      if (!msg) return;
      if (msg.type === "intent.join" && !this.room) {
        this.token = randomToken();
        const { game, roster } = buildSeatedGame(msg.charId);
        this.room = serveRoom(connection, game, roster, { seat: 0, token: this.token, ...opts });
      } else if (msg.type === "intent.rejoin") {
        if (this.room && msg.token && msg.token === this.token) {
          this.room.rejoin(this.room.seat ?? 0, connection); // 席を本人へ戻し snapshot 送付
        } else {
          connection.send({ type: "evt.rejoinFailed", reason: "対局が見つかりません" });
          connection.close?.();
        }
      }
    });
  }
}
