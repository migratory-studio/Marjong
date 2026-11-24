import { connectionDiagnostics } from "./connectionDiagnostics.js";

// 再接続の寿命を1か所で管理する。対局不在は終端、通信失敗は上限付きで再試行。
// welcome だけでは復帰扱いにせず、盤面の受信・適用まで待つ。
export class ReconnectController {
  constructor({ connect, onEndpoint, onMessage, onState, maxAttempts = 7,
    responseTimeout = 12000, stableMs = 5000, diagnostics = connectionDiagnostics,
    retryDelay = (attempt) => Math.min(1500 * Math.max(1, attempt), 6000) }) {
    Object.assign(this, { connect, onEndpoint, onMessage, onState, maxAttempts, responseTimeout, stableMs, retryDelay, diagnostics });
    this.state = "idle";
    this.generation = 0;
    this.endpoint = null;
    this.timer = null;
    this.stableTimer = null;
    this.attempts = 0;
  }

  _state(state, reason = null) {
    this.state = state;
    this._log("reconnect_state", { state, reason });
    this.onState(state, reason);
  }

  _log(event, fields = {}) {
    try { this.diagnostics?.record(event, { attempt: this.attempts, ...fields }); } catch { /* 診断のみ */ }
  }

  _invalidate() {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.stableTimer);
    this.timer = this.stableTimer = null;
    const ep = this.endpoint;
    this.endpoint = null; // close が同期発火しても再試行を起こさない
    ep?.close?.();
  }

  stop() {
    this._invalidate();
    this._state("idle");
  }

  start(url, token) {
    this._invalidate();
    this.url = url;
    this.token = token;
    this.attempts = 0;
    if (!url || !token) { this._fail("missing"); return; }
    this._state("reconnecting");
    this._connect();
  }

  _fail(reason) {
    this._invalidate();
    this._state("failed", reason);
  }

  _retry() {
    this._invalidate();
    if (this.attempts >= this.maxAttempts) { this._fail("connection"); return; }
    this._state("reconnecting");
    this.timer = setTimeout(() => this._connect(), this.retryDelay(this.attempts));
  }

  async _connect() {
    const generation = ++this.generation;
    this.attempts++;
    this._log("reconnect_attempt");
    let welcomed = false;
    const current = () => generation === this.generation;
    // open 後の rejoin 応答待ちも期限に含める（応答前の切断・無応答でも固まらない）。
    this.timer = setTimeout(() => { if (current()) { this._log("reconnect_timeout"); this._retry(); } }, this.responseTimeout);
    let ep;
    try { ep = await this.connect(this.url); }
    catch { if (current()) this._retry(); return; }
    if (!current()) { ep.close?.(); return; }
    this.endpoint = ep;
    this.onEndpoint(ep);
    ep.onClose?.(() => { if (current()) this._retry(); });
    ep.onMessage((msg) => {
      if (!current()) return;
      // サーバの拒否後に来る close は _invalidate で無効化済み。再接続の無限ループを防ぐ。
      if (msg.type === "evt.rejoinFailed") { this._fail("missing"); return; }
      if (msg.type === "welcome" && msg.rejoined) welcomed = true;
      this.onMessage(msg);
      if (current() && welcomed && this.state === "reconnecting" &&
          (msg.type === "evt.snapshot" || msg.type === "handStarted")) {
        clearTimeout(this.timer);
        this.timer = null;
        this._state("connected");
        // 復帰直後に何度も切れる場合も回数制限を維持。安定後だけリセットする。
        this.stableTimer = setTimeout(() => { if (current()) this.attempts = 0; }, this.stableMs);
      }
    });
    if (current()) ep.send({ type: "intent.rejoin", token: this.token });
  }
}
