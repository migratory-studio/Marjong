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
import { attachRecorder, snapshotEvent } from "./eventLog.js";
import { redactFor } from "./redact.js";

const INTENT_TIMEOUT = 15000; // ms。1手の持ち時間。超過した遠隔席は CPU 代打ち(autoSeats)へ。
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
    this.autoSeats = new Set(); // CPU 代打ち中の遠隔席（長考超過 or 本人がオート委任）。本人が "オート解除" で外す。
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
    if (this.connections[seat]) this.connections[seat]._dropped = true; // 旧端点の close で誤 drop しない印
    delete this.connections[seat];
    this.autoSeats.delete(seat); // 切断席は connections から消えて isRemote=false＝恒久 CPU 扱い。autoSeats に残しても無意味なのでクリア。
    const p = this.pending.get(seat);
    if (p) { this.pending.delete(seat); clearTimeout(p.timer); p.resolve(null); }
    if (this._ackResolve && this._allAcked()) { const r = this._ackResolve; this._ackResolve = null; r(); }
  }

  // 再接続：CPU代打ち中の席を本人へ戻す。新端点を席に紐づけ、現在の盤面スナップショット(席別
  // redaction)を送ってクライアントが途中局面から再構築できるようにする。次の手番から本人が打つ。
  rejoin(seat, endpoint) {
    this.connections[seat] = endpoint;
    this.autoSeats.delete(seat); // 本人が戻った＝代打ち解除。次の手番から本人が打つ。
    endpoint.onMessage((msg) => this._onIntent(seat, msg));
    endpoint.onClose?.(() => { if (this.connections[seat] === endpoint) this.dropSeat(seat); });
    const token = (this.seatTokens && this.seatTokens[seat]) || this.token;
    endpoint.send({ type: "welcome", seat, roster: this.roster, players: this.players, token, rules: { players: this.game.numPlayers }, rejoined: true });
    endpoint.send(redactFor(snapshotEvent(this.game), seat));
  }

  // wire Event は宛先席ごとに redaction して送る（他席の手牌/ツモは送らない＝漏洩防止）。
  _broadcast(rec) {
    for (const [seatStr, ep] of Object.entries(this.connections)) ep.send(redactFor(rec, Number(seatStr)));
  }
  sendToSeat(seat, msg) { this.connections[seat] && this.connections[seat].send(msg); }

  // 長考超過で CPU 代打ちへ。本人席へだけ通知（他席はモーダル不要）。以後 decideTurn/decideCalls/
  // decideAbilities はこの席をローカル AI で裁き、Intent 待ちをしない（＝待たずに進む）。
  _enterAuto(seat, reason) {
    if (this.autoSeats.has(seat)) return;
    this.autoSeats.add(seat);
    this.sendToSeat(seat, { type: "evt.autoOn", seat, reason });
  }

  _onIntent(seat, msg) {
    if (msg.type === "intent.ack") {
      this.acks.add(seat);
      if (this._ackResolve && this._allAcked()) { const r = this._ackResolve; this._ackResolve = null; r(); }
      return;
    }
    if (msg.type === "intent.resumeControl") {
      // 本人が「オート解除」を押した。代打ちを外し、次の手番から本人へ手番を渡す。
      if (this.autoSeats.delete(seat)) this.sendToSeat(seat, { type: "evt.autoOff", seat });
      return;
    }
    const p = this.pending.get(seat);
    if (p && p.kinds.some((k) => msg.type === `intent.${k}`)) {
      this.pending.delete(seat);
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }

  // 指定席からの Intent を待つ。kinds は文字列 or 配列（"discard"/["discard","ability"] 等）。
  // timeout で null を返す（呼び出し側で自動処理）。
  awaitIntent(seat, kinds) {
    const list = Array.isArray(kinds) ? kinds : [kinds];
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const p = this.pending.get(seat);
        if (p && p.resolve === resolve) { this.pending.delete(seat); resolve(null); }
      }, this.timeout);
      this.pending.set(seat, { kinds: list, resolve, timer });
    });
  }

  _pace(ms) { return ms > 0 ? delay(ms) : Promise.resolve(); }

  _allAcked() { return Object.keys(this.connections).every((s) => this.acks.has(Number(s))); }
  _waitAcks() {
    if (this._allAcked()) return Promise.resolve();
    return new Promise((resolve) => { this._ackResolve = resolve; });
  }

  // 代打ち中の遠隔席は CPU と同じく扱う（ローカル AI で裁き、Intent を待たない）。
  _cpuLike(seat) { return !this.isRemote(seat) || this.autoSeats.has(seat); }

  // --- 決定層(A)。CPU=ローカル AI、遠隔=Intent。状態変更(B)はポンプ側で行う。 ---
  decideAbilities(seat) {
    if (!this._cpuLike(seat)) return []; // 遠隔席(本人操作中)の能力発動は intent 化(L4 follow-up)。
    return decideAbilityActivations(this.game, seat);
  }

  async decideTurn(seat) {
    const g = this.game;
    if (this._cpuLike(seat)) return decideDiscard(g, seat);
    const p = g.players[seat];
    // 手番中ループ：能力発動(intent.ability)は権威がその場で適用し、更新した awaitDiscard を再送して
    // 継続する（発動はターンを終わらせない）。打牌/ツモ/カン(intent.discard)で終了。
    while (true) {
      const opts = g.actionOptions(seat);
      // リーチ中/強制ツモ切りは権威が自動で裁く（クライアントに委ねない＝L2 と同じ思想）。
      if ((p.riichi && opts && !opts.tsumo) || (opts && opts.forcedTsumogiri && !opts.tsumo)) {
        return { type: "discard", tileId: p.drawnTileId, riichi: false };
      }
      // 人間UIの描画材料を権威が計算して同梱（レプリカでは actionOptions 等を再計算できないため）。
      let danger = null;
      try { danger = g.abilities.dangerInfo(p) || null; } catch { danger = null; }
      this.sendToSeat(seat, {
        type: "evt.awaitDiscard", you: true, seat,
        options: opts || null,
        abilityStatus: (() => { try { return g.abilityStatus(seat); } catch { return []; } })(),
        danger,
      });
      const intent = await this.awaitIntent(seat, ["discard", "ability"]);
      if (!intent) {
        // 持ち時間(15s)超過。以後この席は CPU 代打ちへ切替え、本人へモーダル通知。今手も CPU が打つ。
        this._enterAuto(seat, "timeout");
        return decideDiscard(g, seat);
      }
      if (intent.type === "intent.ability") {
        // ホスト側で能力を発動（recall=河↔手牌 / jane-doe / kakeha / zero-search 等）。発動結果は
        // ABILITY_USED 等の Event で配信され、ループ先頭で更新済み awaitDiscard を再送する。
        try { g.activateAbility(seat, intent.abilityId, intent.params || {}); }
        catch (e) { console.error("activateAbility (online) failed", e); }
        continue;
      }
      if (intent.action === "tsumo") return { type: "tsumo" };
      if (intent.action === "kan") return { type: "kan", kind: intent.kind, kanType: intent.kanType };
      return { type: "discard", tileId: intent.tileId, riichi: !!intent.riichi };
    }
  }

  async decideCalls(callers) {
    const g = this.game;
    const decisions = [];
    for (const c of callers) {
      if (this._cpuLike(c.index)) decisions.push({ index: c.index, ...decideCall(g, c.index, c.options) });
    }
    const remote = callers.filter((c) => !this._cpuLike(c.index));
    await Promise.all(remote.map(async (c) => {
      this.sendToSeat(c.index, { type: "evt.awaitCalls", you: true, seat: c.index, options: c.options });
      const intent = await this.awaitIntent(c.index, "call");
      // 鳴き窓も持ち時間超過(null)なら代打ちへ。打牌手番と挙動を揃え、本人にモーダルを出す
      // （以後の手番も CPU 化。明示パスは intent が返るので代打ちには入らない）。
      if (!intent) this._enterAuto(c.index, "timeout");
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
        // 手番開始通知（「長考中」バッジ＝他席 / 持ち時間＝自席）。長考しうるのは本人操作の遠隔席だけ
        // なので、CPU/代打ち席の手番では配信しない（無駄な配信を避ける＝バッジ閾値でも抑制されるが、
        // 配信自体を絞ってトラフィックを抑える）。配信は接続席のみ（_broadcast が connections を回す）。
        if (!this._cpuLike(seat)) this._broadcast({ type: "evt.turn", seat, ms: this.timeout });
        const acts = this.decideAbilities(seat);
        for (const a of acts) g.activateAbility(seat, a.id, a.params);
        // CPU/代打ち席は間合い（カットインが出たら長め）。本人操作の遠隔席は Intent 待ち＝人間のペース。
        if (this._cpuLike(seat)) await this._pace(acts.length ? (P.cutInWait || 0) : (P.cpuDelay || 0));
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
