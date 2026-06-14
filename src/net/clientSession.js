// 通信対戦 L4a: クライアント側セッション。
//
// レプリカ Game を持ち、受信した wire Event を applyEvent で反映して盤面を再構築する（ルールは
// 再実行しない）。自席の手番/鳴き窓を促す制御 Event(evt.awaitX) には Intent を返す。結果 Event
// (handWon/handDrawn)を反映したら ack を返し、権威に次局へ進んでよいと知らせる。
//
// L4a の人間入力は「ツモ切り＋常にスキップ」の自明ポリシーで代行する（配線の検証が目的）。実 UI
// 入力(main.js の resolver)や client 側 AI 差し込みは後段。トランスポートの中身は知らない。
import { Game } from "../core/game.js";
import { applyEvent } from "./applyEvent.js";

const WIRE_EVENTS = new Set([
  "handStarted", "tileDrawn", "tileDiscarded", "riichiDeclared",
  "meldCalled", "abilityUsed", "handWon", "handDrawn",
]);

export class ClientSession {
  // seated を直接渡せば即レプリカ構築（ループバック）。実回線では席割が事前に分からないので
  // makeSeated(roster) を渡し、サーバの "welcome"(roster) 受信時にレプリカを組む。
  constructor(endpoint, { seat, seated = null, makeSeated = null, policy } = {}) {
    this.endpoint = endpoint;
    this.seat = seat;
    this.makeSeated = makeSeated;
    this.replica = seated ? new Game(seated, -1, undefined) : null;
    this.policy = policy || defaultPolicy;
    this.intentCount = 0;
    this.callCount = 0;
    this.received = []; // 受信メッセージlog（redaction検査/デバッグ用）
    endpoint.onMessage((msg) => this._onMessage(msg));
  }

  _send(msg) { this.endpoint.send(msg); }

  _onMessage(msg) {
    this.received.push(msg);
    if (msg.type === "welcome") {
      // サーバが席割と卓の顔ぶれ(roster=charId列)を通知。これでレプリカを構築する。
      if (msg.seat != null) this.seat = msg.seat;
      if (!this.replica && this.makeSeated) this.replica = new Game(this.makeSeated(msg.roster), -1, undefined);
      return;
    }
    if (!this.replica) return; // welcome 前の取りこぼし保険（通常は到達しない）
    if (WIRE_EVENTS.has(msg.type)) {
      // 自席視点で適用：他席手牌は伏せ札(枚数のみ)になる（受信 Event も席別 redaction 済み）。
      applyEvent(this.replica, msg, { viewpoint: this.seat });
      if (msg.type === "handWon" || msg.type === "handDrawn") this._send({ type: "intent.ack" });
      return;
    }
    if (msg.type === "evt.awaitDiscard" && msg.seat === this.seat) {
      this.intentCount++;
      this._send(this.policy.discard(this.replica, this.seat, msg));
      return;
    }
    if (msg.type === "evt.awaitCalls" && msg.seat === this.seat) {
      this.callCount++;
      this._send(this.policy.call(this.replica, this.seat, msg));
      return;
    }
    // evt.gameOver 等は描画/終了処理用（L4a では無視）。
  }
}

// 自明ポリシー: 手番はツモ切り(常に合法)、鳴きは常にスキップ。配線検証用の最小実装。
export const defaultPolicy = {
  discard(replica, seat) {
    const p = replica.players[seat];
    const tileId = p.drawnTileId != null
      ? p.drawnTileId
      : (p.hand.length ? p.hand[p.hand.length - 1].id : null);
    return { type: "intent.discard", tileId, riichi: false };
  },
  call() {
    return { type: "intent.call", action: "pass" };
  },
};
