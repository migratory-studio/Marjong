// 通信対戦 L4c: 卓ホスト（権威）。1接続を遠隔席として受け、AuthorityRoom で対局を回す最小ホスト。
//
// 接続直後に "welcome"(席割・卓の顔ぶれ roster) を送り、クライアントがレプリカを組めるようにする。
// 切断時はその席を CPU 代打ちへ（room.dropSeat）＝マッチング不成立/離脱の CPU 補填と同じ仕組み。
// 本物のロビー/マッチング（複数卓・席の動的割当）は後段。ここは「1卓・席0=接続クライアント・
// 残りCPU」の最小構成で、実回線越しに既存スタックが回ることの土台を担う。
import { AuthorityRoom } from "./authorityRoom.js";

// connection: socketTransport の端点。game: 権威の実 Game。roster: charId 配列（welcome 用）。
// seat: 接続クライアントの席（既定0）。opts は AuthorityRoom にそのまま渡す（timeout/pacing）。
export function serveRoom(connection, game, roster, { seat = 0, ...roomOpts } = {}) {
  connection.send({ type: "welcome", seat, roster, rules: { players: game.numPlayers } });
  const room = new AuthorityRoom(game, { [seat]: connection }, roomOpts);
  // 切断 → その席を CPU 代打ちに（対局はそのまま続行する）。
  connection.onClose?.(() => room.dropSeat(seat));
  room.run().catch((e) => console.error("room.run crashed", e));
  return room;
}
