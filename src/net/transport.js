// 通信対戦 L4a: トランスポート抽象（送受信の口）。
//
// 配線(権威⇄クライアント)を「メッセージを send/onMessage する2つの端点」に閉じ込める。L4a は
// 同一プロセス内ループバック実装のみ。後段で同じインターフェースのまま WebSocket(Durable Object)
// 実装に差し替える（authorityRoom / clientSession はトランスポートの中身を知らない）。
//
// 各端点は { send(msg), onMessage(fn) }。配送は queueMicrotask で非同期化し、かつ JSON 往復で
// シリアライズ境界を再現する（関数や循環参照・共有参照を持ち込めない＝実ネットワークと同じ制約）。

export function createLoopback() {
  let handlerA = null;
  let handlerB = null;
  const wire = (msg) => JSON.parse(JSON.stringify(msg)); // serialise boundary
  const deliver = (handler, msg) => {
    if (!handler) return;
    const frozen = wire(msg);
    queueMicrotask(() => handler(frozen));
  };
  const a = {
    send: (msg) => deliver(handlerB, msg),
    onMessage: (fn) => { handlerA = fn; },
  };
  const b = {
    send: (msg) => deliver(handlerA, msg),
    onMessage: (fn) => { handlerB = fn; },
  };
  return { a, b };
}
