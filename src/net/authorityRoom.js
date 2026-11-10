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
const START_GATE_TIMEOUT = 12000; // ms。開始ゲートの上限（演出を閉じない席がいても、これを過ぎたら始める）。
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

// --- 遠隔 Intent の検証 -----------------------------------------------------------------------
// クライアントは改造できる前提で、Intent は「権威が awaitDiscard / awaitCalls で提示した選択肢」の
// 中からしか受け付けない。エンジン（game.js）はローカル UI が合法手だけを渡す前提で書かれており、
// 不正値を直接渡すと手牌の外から面子を作る・フリテンでロンする・例外で卓ごと止まる、が起きる。
// 不正な Intent は「無かったこと」にする（持ち時間はそのまま減る＝連打で卓を止めることもできない）。

// 手番の Intent → 決定。不正なら null。opts は同じ手番で awaitDiscard に載せた actionOptions。
export function turnDecisionFrom(intent, opts, player) {
  if (!intent || !opts) return null;
  const { action } = intent;
  if (action === "tsumo") return opts.tsumo ? { type: "tsumo" } : null;
  if (action === "kan") {
    const k = (opts.kans || []).find((x) => x.kind === intent.kind && x.type === intent.kanType);
    return k ? { type: "kan", kind: k.kind, kanType: k.type } : null;
  }
  if (action === "nuki") return opts.nuki ? { type: "nuki" } : null;
  if (action != null) return null;
  const tile = Number.isInteger(intent.tileId) ? player.hand.find((t) => t.id === intent.tileId) : null;
  if (!tile) return null;
  // リーチ中・強制ツモ切り中はツモ牌しか切れない（鳴いた直後などツモ牌が無い手番の強制ツモ切りは自由打牌）。
  const mustTsumogiri = player.riichi || (opts.forcedTsumogiri && player.drawnTileId != null);
  if (mustTsumogiri && tile.id !== player.drawnTileId) return null;
  const riichi = intent.riichi === true;
  if (riichi && !(opts.riichi && (opts.riichiDiscards || []).includes(tile.kind))) return null;
  return { type: "discard", tileId: tile.id, riichi };
}

// 鳴き窓の Intent → 決定。不正なら null。action 無しはパス扱い（従来どおり）。
export function callDecisionFrom(intent, options) {
  if (!intent || !options) return null;
  const { action } = intent;
  if (action == null || action === "pass") return { action: "pass" };
  if (action === "ron" || action === "pon" || action === "kan") return options[action] ? { action } : null;
  if (action === "chi") {
    const m = intent.meta;
    const seq = Array.isArray(m) && m.length === 2
      ? (options.chi || []).find((s) => s[0] === m[0] && s[1] === m[1])
      : null;
    return seq ? { action: "chi", meta: seq.slice() } : null;
  }
  return null;
}

// 能力の発動パラメータは UI が使う4種だけを、型と範囲を確かめて通す（他のキーは捨てる）。
export function abilityParamsFrom(raw, game) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  const seat = src.targetIndex;
  if (Number.isInteger(seat) && seat >= 0 && seat < game.players.length) out.targetIndex = seat;
  if (Number.isInteger(src.riverTileId)) out.riverTileId = src.riverTileId;
  if (Number.isInteger(src.targetKind) && src.targetKind >= 0 && src.targetKind < 34) out.targetKind = src.targetKind;
  if (typeof src.betAmount === "number" && Number.isFinite(src.betAmount)) out.betAmount = src.betAmount;
  return out;
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
    // 開始ゲート：対局開始演出（VS 画面）を見せるクライアントは join で申告し、演出を閉じたら
    // intent.ready を返す。最初の局は申告席が揃って ready になってから始める（上限 startGateMs）。
    // 演出の裏で局が進み、最初の手番の持ち時間が削られる／相手の打牌を見逃すのを防ぐ。
    // 申告しない席（古いクライアント・テスト）と切断した席は待たない。
    this.gateSeats = new Set(opts.startGate || []);
    this.gateMs = opts.startGateMs ?? START_GATE_TIMEOUT;
    this.readySeats = new Set();
    this._gateResolve = null;
    this.started = false;       // 最初の局を始めたか（開始前の再接続には盤面を送らない）
    this.done = false;
    this.humanPlayed = false;
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
    this._checkGate(); // 開始ゲート待ちの最中に抜けた席は待たない
  }

  // 再接続：CPU代打ち中の席を本人へ戻す。新端点を席に紐づけ、現在の盤面スナップショット(席別
  // redaction)を送ってクライアントが途中局面から再構築できるようにする。次の手番から本人が打つ。
  rejoin(seat, endpoint) {
    this.readySeats.add(seat); // 繋ぎ直した席は演出を見終えている扱い（開始ゲートで待たない）
    this.connections[seat] = endpoint;
    this.autoSeats.delete(seat); // 本人が戻った＝代打ち解除。次の手番から本人が打つ。
    endpoint.onMessage((msg) => this._onIntent(seat, msg));
    endpoint.onClose?.(() => { if (this.connections[seat] === endpoint) this.dropSeat(seat); });
    const token = (this.seatTokens && this.seatTokens[seat]) || this.token;
    endpoint.send({ type: "welcome", seat, roster: this.roster, players: this.players, token, rules: { players: this.game.numPlayers }, rejoined: true });
    // 開始前（ゲート待ち）は盤面がまだ無い。最初の局は handStarted で届く。
    if (this.started) endpoint.send(redactFor(snapshotEvent(this.game), seat));
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
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return; // 壊れたフレームは捨てる
    if (msg.type === "intent.ready") {
      this.readySeats.add(seat);
      this._checkGate();
      return;
    }
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
      if (p.validate && !p.validate(msg)) return; // 提示していない手は無視（持ち時間は止めない）
      this.humanPlayed = true;
      this.pending.delete(seat);
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }

  // 指定席からの Intent を待つ。kinds は文字列 or 配列（"discard"/["discard","ability"] 等）。
  // timeout で null を返す（呼び出し側で自動処理）。validate(msg) が false の Intent は受理しない。
  // ms は残り持ち時間（既定は1手ぶん）。
  awaitIntent(seat, kinds, { validate = null, ms = this.timeout } = {}) {
    const list = Array.isArray(kinds) ? kinds : [kinds];
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const p = this.pending.get(seat);
        if (p && p.resolve === resolve) { this.pending.delete(seat); resolve(null); }
      }, Math.max(0, ms));
      this.pending.set(seat, { kinds: list, resolve, timer, validate });
    });
  }

  _pace(ms) { return ms > 0 ? delay(ms) : Promise.resolve(); }

  _allAcked() { return Object.keys(this.connections).every((s) => this.acks.has(Number(s))); }
  _waitAcks() {
    if (this._allAcked()) return Promise.resolve();
    return new Promise((resolve) => { this._ackResolve = resolve; });
  }

  // 開始ゲート：申告席のうち、まだ繋がっている席が全員 ready になったら開く。
  _gateOpen() {
    for (const s of this.gateSeats) if (this.isRemote(s) && !this.readySeats.has(s)) return false;
    return true;
  }
  _checkGate() { if (this._gateResolve && this._gateOpen()) this._gateResolve(); }
  _waitGate() {
    if (this._gateOpen()) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => this._gateResolve?.(), this.gateMs);
      this._gateResolve = () => { clearTimeout(timer); this._gateResolve = null; resolve(); };
    });
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
    // 持ち時間は発動が成功したときだけ仕切り直す（失敗する発動の連打で手番を引き延ばせない）。
    let deadline = Date.now() + this.timeout;
    while (true) {
      const opts = g.actionOptions(seat);
      if (!opts) return null; // 手番が終わっている（局が流れた等）＝ここで選ばせるものは無い
      // リーチ中/強制ツモ切りは権威が自動で裁く（クライアントに委ねない＝L2 と同じ思想）。
      // リーチ中でも選択肢（ツモ/待ち不変カン/北抜き）があるときはクライアントに委ねる。
      // ツモ牌が無い手番（強制ツモ切り中に鳴いた直後）は自動で切る牌が無いので、通常どおり選ばせる
      // （ここで tileId:null を返すとエンジンが無視し、同じ席で空回りして DO ごと固まっていた）。
      const riichiNoChoice = p.riichi && opts && !opts.tsumo && opts.kans.length === 0 && !opts.nuki;
      if (p.drawnTileId != null && (riichiNoChoice || (opts && opts.forcedTsumogiri && !opts.tsumo))) {
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
      const validate = (m) => (m.type === "intent.ability"
        ? typeof m.abilityId === "string" && (p.abilities || []).some((a) => a.id === m.abilityId)
        : turnDecisionFrom(m, opts, p) !== null);
      const intent = await this.awaitIntent(seat, ["discard", "ability"], { validate, ms: deadline - Date.now() });
      if (!intent) {
        // 持ち時間(15s)超過。以後この席は CPU 代打ちへ切替え、本人へモーダル通知。今手も CPU が打つ。
        this._enterAuto(seat, "timeout");
        return decideDiscard(g, seat);
      }
      if (intent.type === "intent.ability") {
        // ホスト側で能力を発動（recall=河↔手牌 / jane-doe / kakeha / zero-search 等）。発動結果は
        // ABILITY_USED 等の Event で配信され、ループ先頭で更新済み awaitDiscard を再送する。
        let ok = false;
        try { ok = g.activateAbility(seat, intent.abilityId, abilityParamsFrom(intent.params, g)); }
        catch (e) { console.error("activateAbility (online) failed", e); }
        if (ok) deadline = Date.now() + this.timeout;
        continue;
      }
      return turnDecisionFrom(intent, opts, p);
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
      const intent = await this.awaitIntent(c.index, "call", { validate: (m) => callDecisionFrom(m, c.options) !== null });
      // 鳴き窓も持ち時間超過(null)なら代打ちへ。打牌手番と挙動を揃え、本人にモーダルを出す
      // （以後の手番も CPU 化。明示パスは intent が返るので代打ちには入らない）。
      if (!intent) this._enterAuto(c.index, "timeout");
      const d = intent ? callDecisionFrom(intent, c.options) : null;
      decisions.push(d && d.action !== "pass" ? { index: c.index, ...d } : { index: c.index, action: "pass" });
    }));
    return { decisions };
  }

  // --- ヘッドレス・ポンプ（描画なし。局を跨いで1ゲーム回す） ---
  async run() {
    const g = this.game;
    await this._waitGate(); // 対局開始演出を見終えるまで最初の局を始めない
    this.started = true;
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
        const decision = await this.decideTurn(seat);
        const seq = this.recorder.records.length;
        applyTurnDecision(g, seat, decision);
        // 安全網：決定がエンジンに受理されず局面が1つも進まなかったら、CPU の手で進める。待ち合わせの
        // 無い空回りは DO を CPU 100% で固め、同じ DO にいる全卓を止めてしまうため。
        const stuck = () => this.recorder.records.length === seq && g.phase === Phase.AWAIT_DISCARD && g.turn === seat;
        if (stuck()) {
          console.warn("turn decision made no progress; using the CPU move", { seat, decision });
          applyTurnDecision(g, seat, decideDiscard(g, seat));
          if (stuck()) throw new Error("turn made no progress"); // 進められない卓は回し続けず閉じる
        }
        continue;
      }
      break;
    }
    this.done = true;
    this._broadcast({ type: "evt.gameOver" });
    this.recorder.dispose();
  }
}
