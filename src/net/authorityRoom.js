// 通信対戦 L4a: 権威(authoritative)対局室。
//
// 1卓=1 AuthorityRoom。唯一の真実である実 Game を保持し、ヘッドレスなポンプで局を進める。決定は
// 「CPU席=ローカル AI」「遠隔(人間)席=該当クライアントへ awaitX を送り Intent を待つ(timeout=自動
// ツモ切り)」。確定した bus イベントは attachRecorder で wire Event 化し、各クライアントへ配信する。
//
// L4a の責務は「配線」：同一プロセス内ループバックで Intent/Event を疎結合させる。redaction(隠匿
// 情報の除去)は L4b、Durable Object + WebSocket への載せ替えは L4c。ポンプは main.js の runHand を
// 踏襲しつつ、描画を持たないサーバ版（決定は controller、状態変更はここ＝L1/L2 と同じ A/B 分離）。
import { Phase } from "../core/game.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../ai/simpleAI.js";
import { attachRecorder } from "./eventLog.js";
import { redactFor } from "./redact.js";

const INTENT_TIMEOUT = 8000; // ms。未応答は自動ツモ切り/パス扱い。
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const meldTotal = (game) => game.players.reduce((s, p) => s + p.melds.length, 0);

// 手番決定を実エンジンへ適用する唯一の口（main.js の applyTurnDecision と同形）。
function applyTurnDecision(game, seat, d) {
  if (!d) return;
  if (d.type === "tsumo") { game.doTsumo(seat); return; }
  if (d.type === "kan") { game.declareKan(seat, d.kind, d.kanType); return; }
  if (d.type === "nuki") { game.nukiKita(seat); return; }
  game.discard(seat, d.tileId, d.riichi);
}

export class AuthorityRoom {
  // game: 権威の実 Game。connections: { [seat]: transportEndpoint } 遠隔(人間)席のみ。
  constructor(game, connections = {}, opts = {}) {
    this.game = game;
    this.connections = connections;
    this.timeout = opts.timeout ?? INTENT_TIMEOUT;
    // 演出ペーシング（ブラウザ描画用。ヘッドレス＝省略で 0＝即時）。CPU の間合い/カットイン/鳴き待ち。
    this.pacing = opts.pacing || null;
    this.pending = new Map();   // seat -> { kind, resolve, timer }
    this.acks = new Set();      // 現局の結果を反映済みの遠隔席
    this._ackResolve = null;
    this.done = false;
    for (const [seatStr, ep] of Object.entries(connections)) {
      const seat = Number(seatStr);
      ep.onMessage((msg) => this._onIntent(seat, msg));
    }
    // bus → wire Event を、確定のたび各クライアントへ配信（redaction なし＝L4a。L4b で席別に除去）。
    this.recorder = attachRecorder(game, { onEvent: (rec) => this._broadcast(rec) });
  }

  isRemote(seat) { return Object.prototype.hasOwnProperty.call(this.connections, seat); }

  // 切断/離席 → その席を CPU 代打ちに切り替える。以後 decideTurn/decideCalls はローカル AI を使い、
  // ack 待ちもこの席を待たない。手番待ち中なら null 解決＝自動ツモ切り/パスで即座に進行を続ける。
  dropSeat(seat) {
    delete this.connections[seat];
    const p = this.pending.get(seat);
    if (p) { this.pending.delete(seat); clearTimeout(p.timer); p.resolve(null); }
    if (this._ackResolve && this._allAcked()) { const r = this._ackResolve; this._ackResolve = null; r(); }
  }

  // wire Event は宛先席ごとに redaction して送る（他席の手牌/ツモは送らない＝漏洩防止）。
  _broadcast(rec) {
    for (const [seatStr, ep] of Object.entries(this.connections)) ep.send(redactFor(rec, Number(seatStr)));
  }
  sendToSeat(seat, msg) { this.connections[seat] && this.connections[seat].send(msg); }

  _onIntent(seat, msg) {
    if (msg.type === "intent.ack") {
      this.acks.add(seat);
      if (this._ackResolve && this._allAcked()) { const r = this._ackResolve; this._ackResolve = null; r(); }
      return;
    }
    const p = this.pending.get(seat);
    if (p && msg.type === `intent.${p.kind}`) {
      this.pending.delete(seat);
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }

  // 指定席からの Intent を待つ。timeout で null を返す（呼び出し側で自動処理）。
  awaitIntent(seat, kind) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const p = this.pending.get(seat);
        if (p && p.resolve === resolve) { this.pending.delete(seat); resolve(null); }
      }, this.timeout);
      this.pending.set(seat, { kind, resolve, timer });
    });
  }

  _pace(ms) { return ms > 0 ? delay(ms) : Promise.resolve(); }

  _allAcked() { return Object.keys(this.connections).every((s) => this.acks.has(Number(s))); }
  _waitAcks() {
    if (this._allAcked()) return Promise.resolve();
    return new Promise((resolve) => { this._ackResolve = resolve; });
  }

  // --- 決定層(A)。CPU=ローカル AI、遠隔=Intent。状態変更(B)はポンプ側で行う。 ---
  decideAbilities(seat) {
    if (this.isRemote(seat)) return []; // 遠隔席の能力発動は intent 化(L4 follow-up)。今は CPU 席のみ。
    return decideAbilityActivations(this.game, seat);
  }

  async decideTurn(seat) {
    const g = this.game;
    if (!this.isRemote(seat)) return decideDiscard(g, seat);
    const p = g.players[seat];
    const opts = g.actionOptions(seat);
    // リーチ中/強制ツモ切りは権威が自動で裁く（クライアントに委ねない＝L2 と同じ思想）。
    if ((p.riichi && opts && !opts.tsumo) || (opts && opts.forcedTsumogiri && !opts.tsumo)) {
      return { type: "discard", tileId: p.drawnTileId, riichi: false };
    }
    // 人間UIの描画材料を権威が計算して同梱（クライアントのレプリカでは actionOptions 等を再計算
    // できないため）。options=打牌/リーチ/カン/北の可否, abilityStatus=能力ボタン, danger=危険牌。
    let danger = null;
    try { danger = g.abilities.dangerInfo(p) || null; } catch { danger = null; }
    this.sendToSeat(seat, {
      type: "evt.awaitDiscard", you: true, seat,
      options: opts || null,
      abilityStatus: (() => { try { return g.abilityStatus(seat); } catch { return []; } })(),
      danger,
    });
    const intent = await this.awaitIntent(seat, "discard");
    if (!intent) return { type: "discard", tileId: p.drawnTileId, riichi: false }; // timeout=自動ツモ切り
    if (intent.action === "tsumo") return { type: "tsumo" };
    if (intent.action === "kan") return { type: "kan", kind: intent.kind, kanType: intent.kanType };
    return { type: "discard", tileId: intent.tileId, riichi: !!intent.riichi };
  }

  async decideCalls(callers) {
    const g = this.game;
    const decisions = [];
    for (const c of callers) {
      if (!this.isRemote(c.index)) decisions.push({ index: c.index, ...decideCall(g, c.index, c.options) });
    }
    const remote = callers.filter((c) => this.isRemote(c.index));
    await Promise.all(remote.map(async (c) => {
      this.sendToSeat(c.index, { type: "evt.awaitCalls", you: true, seat: c.index, options: c.options });
      const intent = await this.awaitIntent(c.index, "call");
      decisions.push(intent && intent.action && intent.action !== "pass"
        ? { index: c.index, action: intent.action, meta: intent.meta }
        : { index: c.index, action: "pass" });
    }));
    return { decisions };
  }

  // --- ヘッドレス・ポンプ（描画なし。局を跨いで1ゲーム回す） ---
  async run() {
    const g = this.game;
    g.startHand();
    this.acks.clear();
    while (true) {
      if (g.phase === Phase.HAND_OVER) {
        await this._waitAcks();            // クライアントが結果を反映(ack)するまで待つ
        if (g.isGameOver()) break;
        g.startHand();
        this.acks.clear();                  // 次局ぶんの ack を集め直す
        continue;
      }
      if (g.isGameOver()) break;
      const P = this.pacing || {};
      if (g.phase === Phase.AWAIT_CALLS) {
        const before = meldTotal(g);
        const { decisions } = await this.decideCalls(g.pendingCalls.callers);
        g.resolveCalls(decisions);
        if (meldTotal(g) > before) await this._pace(P.nakiWait || 0); // 鳴きバナーを見せる間合い
        continue;
      }
      if (g.phase === Phase.AWAIT_DISCARD) {
        const seat = g.turn;
        const acts = this.decideAbilities(seat);
        for (const a of acts) g.activateAbility(seat, a.id, a.params);
        // CPU 席は間合い（カットインが出たら長め）。遠隔席は Intent 待ち＝人間のペースなので置かない。
        if (!this.isRemote(seat)) await this._pace(acts.length ? (P.cutInWait || 0) : (P.cpuDelay || 0));
        applyTurnDecision(g, seat, await this.decideTurn(seat));
        continue;
      }
      break;
    }
    this.done = true;
    this._broadcast({ type: "evt.gameOver" });
    this.recorder.dispose();
  }
}
