// Game engine: state + turn flow for 4-player riichi mahjong.
//
// The engine is synchronous and UI-agnostic. A controller (main.js) drives it,
// asking CPU players for decisions immediately and humans via the UI. Ability
// hooks are invoked at the points described in abilities/hooks.js.
import { Wall } from "./wall.js";
import { EventBus, Events } from "./events.js";
import { MeldType, makeMeld } from "./meld.js";
import {
  tilesToCounts, isHonor, isTerminalOrHonor, rankOf, suitOf, SUITS, makeKind, kindLabel,
} from "./tiles.js";
import { isAgari, waits } from "./rules/winCheck.js";
import { scoreHand } from "./rules/score.js";
import { AbilityManager, emptyEligibility } from "../abilities/registry.js";
import { Hooks } from "../abilities/hooks.js";

export const Phase = {
  AWAIT_DISCARD: "await-discard", // current player drew; must act
  AWAIT_CALLS: "await-calls", // a discard is open for calls
  HAND_OVER: "hand-over",
  GAME_OVER: "game-over",
};

const SEAT_WINDS = [27, 28, 29, 30]; // E,S,W,N kinds, indexed from dealer

export class Player {
  constructor(index, character, abilities, isHuman) {
    this.index = index;
    this.character = character;
    this.abilities = abilities;
    this.isHuman = isHuman;
    this.points = character.stats.startingPoints; // "HP"
    this.reset();
  }
  reset() {
    this.hand = []; // concealed tiles
    this.melds = [];
    this.discards = []; // river
    this.kita = []; // 北抜き: pulled North tiles (sanma nuki-dora), each = +1 dora
    this.discardCalled = false; // any of own discards was called (disqualifies 流し満貫)
    this.riichi = false;
    this.doubleRiichi = false;
    this.riichiTurn = -1;
    this.ippatsu = false;
    this.drawnTileId = null;
    this.seatWind = 27;
    this.isDealer = false;
    this.forcedTsumogiri = 0; // JaneDoe: remaining turns forced to tsumogiri
  }
  get menzen() {
    return this.melds.every((m) => m.type === MeldType.KAN_CLOSED);
  }
  counts() {
    return tilesToCounts(this.hand);
  }
  numMeldSets() {
    return this.melds.length;
  }
}

export class Game {
  // options.maxRounds: 1 = 東風戦 (East only), 2 = 半荘戦 (East + South).
  constructor(characters, humanIndex = 0, seed, options = {}) {
    this.bus = new EventBus();
    this.abilities = new AbilityManager(this);
    this.players = characters.map(
      (c, i) => new Player(i, c.character, c.abilities, i === humanIndex)
    );
    this.humanIndex = humanIndex;
    // Player count is derived from the seated roster: 3 = 三人麻雀 (sanma), 4 = 四人麻雀.
    this.numPlayers = this.players.length;
    this.sanma = this.numPlayers === 3;
    this.maxRounds = options.maxRounds === 2 ? 2 : 1; // default 東風
    this.roundWind = 27; // 27=東, 28=南
    this.kyoku = 1; // hand number WITHIN the current round (1..4)
    // 起家（最初の親）。対局開始演出の親決めで決まった席を注入できる。
    // 未指定 / 範囲外なら従来どおり席0（人間）が起家。
    this.dealerIndex =
      Number.isInteger(options.dealerIndex) &&
      options.dealerIndex >= 0 &&
      options.dealerIndex < this.numPlayers
        ? options.dealerIndex
        : 0;
    this.honba = 0;
    this.kyotaku = 0; // riichi sticks on the table
    this.seed = seed;
    this.handNumber = 0; // monotonic counter (used only for wall seeding)
    this.phase = Phase.HAND_OVER;
    // Terminal flag, tracked separately from `phase` so the HAND_OVER
    // presentation (ron/tsumo banner + win screen) still plays on the hand
    // that ends the game (トビ終了 or final round). The UI routes to the
    // results screen via the "結果へ" button after that presentation.
    this.gameOver = false;
  }

  log(msg) {
    this.bus.emit(Events.LOG, msg);
  }
  emitState() {
    this.bus.emit(Events.STATE_CHANGED, this);
  }

  // ----------------------------------------------------------------- hand setup
  startHand() {
    this.handNumber++;
    this.wall = new Wall(
      this.seed != null ? this.seed + this.handNumber : undefined,
      { sanma: this.sanma }
    );
    this.lastDiscard = null;
    this.lastDiscardFrom = null;
    this.pendingCalls = null;
    this.firstGoAround = true;

    const N = this.numPlayers;
    for (let i = 0; i < N; i++) {
      const p = this.players[i];
      p.reset();
      p.isDealer = i === this.dealerIndex;
      // seat winds use the first N of E,S,W,N (sanma has no North seat)
      p.seatWind = SEAT_WINDS[(i - this.dealerIndex + N) % N];
      for (const ab of p.abilities) ab.resetForHand();
    }
    // deal 13 each
    for (let n = 0; n < 13; n++) {
      for (let i = 0; i < N; i++) this.players[i].hand.push(this.wall.drawLive());
    }
    for (const p of this.players) this._sortHand(p);

    this.turn = this.dealerIndex;
    this.abilities.notify(Hooks.ON_HAND_START, {});
    this.bus.emit(Events.HAND_STARTED, { handNumber: this.handNumber, dealer: this.dealerIndex });
    const honbaText = this.honba > 0 ? ` ${this.honba}本場` : "";
    this.bus.emit(Events.LOG, `--- ${this.roundLabel()}${honbaText} 開始（親: ${this.players[this.dealerIndex].character.name}） ---`);
    this._beginTurn();
  }

  _sortHand(p) {
    p.hand.sort((a, b) => a.kind - b.kind || a.id - b.id);
  }

  // ----------------------------------------------------------------- turn flow
  _beginTurn() {
    const p = this.players[this.turn];
    this.abilities.notify(Hooks.ON_TURN_START, { player: p });
    if (this.wall.liveRemaining <= 0) {
      this._exhaustiveDraw();
      return;
    }
    const tile = this.abilities.resolveDraw(p, this.wall);
    p.hand.push(tile);
    p.drawnTileId = tile.id;
    this.abilities.notify(Hooks.ON_DRAW, { player: p, tile });
    this.bus.emit(Events.TILE_DRAWN, { player: p, tile });
    this.phase = Phase.AWAIT_DISCARD;
    this._lastDraw = tile;
    this._rinshanFlag = false;
    this.emitState();
  }

  // Options for the player who must act after drawing.
  actionOptions(playerIndex) {
    const p = this.players[playerIndex];
    if (this.phase !== Phase.AWAIT_DISCARD || this.turn !== playerIndex) return null;
    const opts = { discard: true, tsumo: false, riichi: false, kans: [], drawnTile: this._lastDraw };
    // tsumo? (リコール交換後は _lastDraw が無く、ツモ和了は提示しない)
    if (this._lastDraw && this._canTsumo(p)) opts.tsumo = true;
    // JaneDoe 強制ツモ切り中: ツモ和了以外の選択（リーチ/カン/打牌選択）を封じる。
    opts.forcedTsumogiri = p.forcedTsumogiri > 0;
    if (opts.forcedTsumogiri) return opts;
    // riichi? (menzen, tenpai, enough points, wall has draws left)
    if (!p.riichi && p.menzen && p.points >= 1000 && this.wall.liveRemaining >= 4) {
      const disc = this._riichiDiscards(p);
      if (disc.length > 0) { opts.riichi = true; opts.riichiDiscards = disc; }
    }
    // kans (closed kan / added kan)
    opts.kans = this._kanOptions(p);
    // 北抜き (sanma only): pull a North tile from hand as nuki-dora.
    opts.nuki = this.sanma && !p.riichi && p.hand.some((t) => t.kind === 30);
    return opts;
  }

  // -------------------------------------------------------- manual abilities
  // Activate a manual ability at the player's chosen timing. Allowed only on the
  // player's own AWAIT_DISCARD turn (CPU uses the same entry point). The effect
  // (which hooks apply) is owned by the ability itself; this just gates + logs.
  activateAbility(playerIndex, abilityId, params = {}) {
    if (this.phase !== Phase.AWAIT_DISCARD || this.turn !== playerIndex) return false;
    const p = this.players[playerIndex];
    const ab = (p.abilities || []).find((a) => a.id === abilityId);
    if (!ab) return false;
    const api = this.abilities.apiFor(p);
    if (!ab.canActivate(api)) return false;
    // 即時効果型の能力（apply あり）は先に効果を適用してから課金する。失敗（不正な
    // 対象など）ならチャージを消費せず中断する。フック型の能力は apply を持たない。
    if (typeof ab.apply === "function" && !ab.apply(this, p, params)) return false;
    ab.activate();
    this.log(`${p.character.name} が能力「${ab.name}」を発動`);
    this.bus.emit(Events.ABILITY_USED, { index: playerIndex, player: p, name: ab.name });
    this.emitState();
    return true;
  }

  // リコール・ディールの交換実体。ツモ牌 T を自分の河（riverTileId の位置）へ置き、
  // その河の牌 R を手牌へ戻す。T は他家にロンされない（ronImmune）。交換はコール
  // 待機を一切開かないため、他家がそもそも T にロンする機会は生じない。交換後の
  // 手牌は14枚のままで、呼び出し元（人間/CPU）が続けて通常打牌する。成功時 true。
  recallSwap(player, riverTileId) {
    if (riverTileId == null) return false;
    const ri = player.discards.findIndex((t) => t.id === riverTileId);
    if (ri < 0) return false;
    const hi = player.hand.findIndex((t) => t.id === player.drawnTileId);
    if (hi < 0) return false;
    const drawn = player.hand[hi];
    const recalled = player.discards[ri];
    // ツモ牌を河の R の位置へ（ロン不可マーク）。表示用フラグも素の打牌に揃える。
    player.hand.splice(hi, 1);
    drawn.ronImmune = true;
    drawn.tsumogiri = false;
    drawn.riichiTile = false;
    player.discards[ri] = drawn;
    // 河の R を手牌へ戻す（戻した牌は普通の手牌）。
    delete recalled.ronImmune;
    player.hand.push(recalled);
    // ツモ牌は河へ出たので「直前のツモ」は消える。以降はツモ和了不可（交換で
    // 引き戻した牌での和了はツモではない）＝ actionOptions 側で tsumo を出さない。
    player.drawnTileId = null;
    this._lastDraw = null;
    this._sortHand(player);
    this.log(`【${player.character.name}】河の${kindLabel(recalled.kind)}を手牌へ／ツモ牌${kindLabel(drawn.kind)}を河へ（ロン不可）`);
    return true;
  }

  // Snapshot of a player's abilities for the UI (buttons / indicators).
  abilityStatus(playerIndex) {
    const p = this.players[playerIndex];
    const api = this.abilities.apiFor(p);
    return (p.abilities || []).map((ab) => ({
      id: ab.id,
      name: ab.name,
      desc: ab.desc,
      activation: ab.activation,
      charges: ab.charges,
      maxCharges: ab.maxCharges,
      active: ab.active,
      canActivate: ab.canActivate(api),
    }));
  }

  _canTsumo(p) {
    const counts = p.counts();
    if (!isAgari(counts, p.numMeldSets())) return false;
    const ctx = this._winContext(p, this._lastDraw.kind, /*tsumo*/ true);
    const res = scoreHand(counts, p.melds, ctx);
    if (!res.valid) return false;
    // abilities may forbid 和了 entirely (e.g. カリュブディスの「淵の蒐集」)
    return this.abilities.canWin(p, this._lastDraw.kind, /*tsumo*/ true);
  }

  // Tile ids that, if discarded, keep the hand tenpai (legal riichi declarations).
  _riichiDiscards(p) {
    const out = [];
    const seen = new Set();
    for (const t of p.hand) {
      if (seen.has(t.kind)) continue;
      seen.add(t.kind);
      const counts = p.counts();
      counts[t.kind]--;
      if (waits(counts, p.numMeldSets()).length > 0) out.push(t.kind);
    }
    return out;
  }

  _kanOptions(p) {
    const counts = p.counts();
    const kans = [];
    // closed kan: 4 in hand
    for (let k = 0; k < 34; k++) if (counts[k] === 4) kans.push({ type: MeldType.KAN_CLOSED, kind: k });
    // added kan: have a pon of k and drew/hold the 4th
    for (const m of p.melds) {
      if (m.type === MeldType.PON && counts[m.tiles[0].kind] >= 1) {
        kans.push({ type: MeldType.KAN_ADDED, kind: m.tiles[0].kind });
      }
    }
    // can't kan after riichi unless it doesn't change the wait (simplified: forbid)
    return p.riichi ? [] : kans;
  }

  // --------------------------------------------------------------- discard
  discard(playerIndex, tileId, declareRiichi = false) {
    const p = this.players[playerIndex];
    if (this.phase !== Phase.AWAIT_DISCARD || this.turn !== playerIndex) return;
    const idx = p.hand.findIndex((t) => t.id === tileId);
    if (idx < 0) return;
    const tile = p.hand.splice(idx, 1)[0];
    const wasTsumogiri = tile.id === p.drawnTileId;
    p.drawnTileId = null;
    this._sortHand(p);
    // a riichi player's ippatsu window ends with their own next discard
    if (!declareRiichi && p.ippatsu) p.ippatsu = false;

    if (declareRiichi) {
      if (this.firstGoAround) p.doubleRiichi = true;
      p.riichi = true;
      p.riichiTurn = p.discards.length;
      p.ippatsu = true;
      p.points -= 1000;
      this.kyotaku += 1000;
      this.bus.emit(Events.RIICHI_DECLARED, { player: p });
      this.log(`${p.character.name} がリーチ！`);
    }

    tile.tsumogiri = wasTsumogiri;
    tile.riichiTile = declareRiichi;
    p.discards.push(tile);
    // any other player's ippatsu chance ends when their own turn passes; it ends
    // for the discarder's pending one only after a full go-around without a call.
    this.abilities.notify(Hooks.ON_DISCARD, { player: p, tile });
    this.bus.emit(Events.TILE_DISCARDED, { player: p, tile });

    this.lastDiscard = tile;
    this.lastDiscardFrom = playerIndex;

    // tick cooldowns for the acting player's abilities
    for (const ab of p.abilities) ab.tickCooldown();
    // JaneDoe: a forced-tsumogiri turn was just spent
    if (p.forcedTsumogiri > 0) p.forcedTsumogiri--;

    // gather call eligibility
    const callers = this._collectCallers(tile, playerIndex);
    if (callers.length > 0) {
      this.phase = Phase.AWAIT_CALLS;
      this.pendingCalls = { tile, from: playerIndex, callers };
      this.emitState();
      return { callers };
    }
    this._afterDiscardNoCalls();
    return { callers: [] };
  }

  _afterDiscardNoCalls() {
    // clear ippatsu of everyone except as appropriate; advance turn
    // ippatsu is lost for a player once their next discard happens or any call;
    // simplest correct-enough rule: a riichi player's ippatsu clears after the
    // turn returns to them. We clear ippatsu when their own next turn begins.
    if (this.wall.liveRemaining <= 0) {
      this._exhaustiveDraw();
      return;
    }
    this.turn = (this.turn + 1) % this.numPlayers;
    // first uninterrupted go-around ends once play returns to the dealer
    if (this.turn === this.dealerIndex) this.firstGoAround = false;
    this._beginTurn();
  }

  // Who can call on this discard, and with what.
  _collectCallers(tile, fromPlayer) {
    let elig = emptyEligibility();
    const N = this.numPlayers;
    const next = (fromPlayer + 1) % N;

    for (let i = 0; i < N; i++) {
      if (i === fromPlayer) continue;
      const p = this.players[i];
      const counts = p.counts();
      // ron
      if (this._canRon(p, tile.kind)) elig.ron.add(i);
      // pon (any player, needs 2)
      if (counts[tile.kind] >= 2 && !p.riichi) elig.pon.add(i);
      // kan (open, needs 3)
      if (counts[tile.kind] >= 3 && !p.riichi) elig.kan.add(i);
      // chi (only from left/kamicha by default; needs sequence). 三麻ではチー禁止。
      if (!this.sanma && i === next && !p.riichi && this._chiSequences(p, tile.kind).length > 0) {
        elig.chi.add(i);
      }
    }
    // let abilities expand eligibility (e.g. omni-chi)
    elig = this.abilities.resolveEligibility(tile, fromPlayer, elig);
    // 三麻ではチー禁止。能力（全方位チー等）が広げた分もここで打ち消す。
    if (this.sanma) elig.chi.clear();

    const callers = [];
    for (let i = 0; i < N; i++) {
      const o = {
        ron: elig.ron.has(i),
        pon: elig.pon.has(i),
        kan: elig.kan.has(i),
        chi: elig.chi.has(i) ? this._chiSequences(this.players[i], tile.kind) : [],
      };
      if (o.ron || o.pon || o.kan || o.chi.length) callers.push({ index: i, options: o });
    }
    return callers;
  }

  _canRon(p, kind) {
    // furiten: cannot ron if the winning kind is in own discards
    if (p.discards.some((t) => t.kind === kind)) return false;
    // also furiten if any of the current waits is in own river
    const counts = p.counts();
    const myWaits = waits(counts, p.numMeldSets());
    if (myWaits.length === 0) return false;
    if (!myWaits.includes(kind)) return false;
    if (myWaits.some((w) => p.discards.some((t) => t.kind === w))) return false; // furiten
    // must form a valid yaku
    counts[kind]++;
    const ctx = this._winContext(p, kind, /*tsumo*/ false);
    const res = scoreHand(counts, p.melds, ctx);
    counts[kind]--;
    if (!res.valid) return false;
    // abilities may forbid 和了 entirely (e.g. カリュブディスの「淵の蒐集」)
    return this.abilities.canWin(p, kind, /*tsumo*/ false);
  }

  _chiSequences(p, kind) {
    if (isHonor(kind)) return [];
    const counts = p.counts();
    const r = rankOf(kind);
    const suit = suitOf(kind);
    const base = makeKind(suit, 1); // first kind of the suit
    const k = (rank) => base + (rank - 1);
    const has = (rank) => rank >= 1 && rank <= 9 && counts[k(rank)] > 0;
    const seqs = [];
    if (has(r - 2) && has(r - 1)) seqs.push([k(r - 2), k(r - 1)]);
    if (has(r - 1) && has(r + 1)) seqs.push([k(r - 1), k(r + 1)]);
    if (has(r + 1) && has(r + 2)) seqs.push([k(r + 1), k(r + 2)]);
    return seqs; // each: the two hand kinds used
  }

  // --------------------------------------------------------------- calls
  // decisions: array of { index, action: 'ron'|'pon'|'kan'|'chi'|'pass', meta }
  resolveCalls(decisions) {
    if (this.phase !== Phase.AWAIT_CALLS) return;
    const byIndex = new Map(decisions.map((d) => [d.index, d]));

    // priority: ron > pon/kan > chi
    const rons = this.pendingCalls.callers
      .filter((c) => byIndex.get(c.index)?.action === "ron")
      .map((c) => c.index);
    if (rons.length > 0) {
      if (this.pendingCalls.chankan) {
        this._revertAddedKan(this.players[this.lastDiscardFrom], this.pendingCalls.kanKind);
      }
      this._doRon(rons, this.lastDiscardFrom, this.lastDiscard.kind);
      return;
    }
    const ponkan = this.pendingCalls.callers.find((c) => {
      const a = byIndex.get(c.index)?.action;
      return a === "pon" || a === "kan";
    });
    if (ponkan) {
      const d = byIndex.get(ponkan.index);
      if (d.action === "kan") this._doOpenKan(ponkan.index);
      else this._doPon(ponkan.index);
      return;
    }
    const chi = this.pendingCalls.callers.find((c) => byIndex.get(c.index)?.action === "chi");
    if (chi) {
      this._doChi(chi.index, byIndex.get(chi.index).meta);
      return;
    }
    // everyone passed
    if (this.pendingCalls.chankan) {
      const kanner = this.players[this.lastDiscardFrom];
      this.pendingCalls = null;
      this._completeKan(kanner); // 槍槓 declined -> the kan goes through
      return;
    }
    this.pendingCalls = null;
    this._afterDiscardNoCalls();
  }

  _consumeDiscardTile() {
    // remove the called tile from the discarder's river
    const from = this.players[this.lastDiscardFrom];
    from.discardCalled = true; // discard was taken -> 流し満貫 no longer possible
    const t = from.discards.pop();
    return t;
  }

  _doPon(index) {
    const p = this.players[index];
    const kind = this.lastDiscard.kind;
    const called = this._consumeDiscardTile();
    const tiles = [called];
    for (let n = 0; n < 2; n++) {
      const i = p.hand.findIndex((t) => t.kind === kind);
      tiles.push(p.hand.splice(i, 1)[0]);
    }
    p.melds.push(makeMeld(MeldType.PON, tiles, this.lastDiscardFrom, called));
    this._clearAllIppatsu();
    this.firstGoAround = false;
    this.abilities.notify(Hooks.ON_MELD, { player: p, meld: p.melds.at(-1) });
    this.bus.emit(Events.MELD_CALLED, { player: p, type: "pon" });
    this.log(`${p.character.name} がポン`);
    this.pendingCalls = null;
    this.turn = index;
    this.phase = Phase.AWAIT_DISCARD;
    this._lastDraw = null; // melded; must discard from hand
    this.emitState();
  }

  _doOpenKan(index) {
    const p = this.players[index];
    const kind = this.lastDiscard.kind;
    const called = this._consumeDiscardTile();
    const tiles = [called];
    for (let n = 0; n < 3; n++) {
      const i = p.hand.findIndex((t) => t.kind === kind);
      tiles.push(p.hand.splice(i, 1)[0]);
    }
    p.melds.push(makeMeld(MeldType.KAN_OPEN, tiles, this.lastDiscardFrom, called));
    this._clearAllIppatsu();
    this.firstGoAround = false;
    this.wall.revealKanDora();
    this.abilities.notify(Hooks.ON_MELD, { player: p, meld: p.melds.at(-1) });
    this.bus.emit(Events.MELD_CALLED, { player: p, type: "kan" });
    this.log(`${p.character.name} がカン（大明槓）`);
    this.pendingCalls = null;
    this.turn = index;
    this._drawRinshan(p);
  }

  _doChi(index, sequenceKinds) {
    const p = this.players[index];
    const called = this._consumeDiscardTile();
    const tiles = [called];
    for (const k of sequenceKinds) {
      const i = p.hand.findIndex((t) => t.kind === k);
      tiles.push(p.hand.splice(i, 1)[0]);
    }
    tiles.sort((a, b) => a.kind - b.kind);
    p.melds.push(makeMeld(MeldType.CHI, tiles, this.lastDiscardFrom, called));
    this._clearAllIppatsu();
    this.firstGoAround = false;
    this.abilities.notify(Hooks.ON_MELD, { player: p, meld: p.melds.at(-1) });
    this.bus.emit(Events.MELD_CALLED, { player: p, type: "chi" });
    this.log(`${p.character.name} がチー`);
    this.pendingCalls = null;
    this.turn = index;
    this.phase = Phase.AWAIT_DISCARD;
    this._lastDraw = null;
    this.emitState();
  }

  // 北抜き (sanma nuki-dora): pull one North tile from hand, set it aside as a
  // dora, and draw a replacement. Does not open a call window and does not reveal
  // kan-dora. The player stays in AWAIT_DISCARD and acts again afterwards.
  nukiKita(playerIndex) {
    if (!this.sanma) return false;
    if (this.phase !== Phase.AWAIT_DISCARD || this.turn !== playerIndex) return false;
    const p = this.players[playerIndex];
    if (p.riichi) return false;
    const i = p.hand.findIndex((t) => t.kind === 30);
    if (i < 0) return false;
    const tile = p.hand.splice(i, 1)[0];
    p.kita.push(tile);
    p.drawnTileId = null;
    this._sortHand(p);
    this.log(`${p.character.name} が北抜き（抜きドラ ${p.kita.length}）`);
    const repl = this.wall.drawReplacement();
    if (!repl) { this._exhaustiveDraw(); return true; }
    p.hand.push(repl);
    p.drawnTileId = repl.id;
    this._lastDraw = repl;
    this._rinshanFlag = false; // nuki replacement is not 嶺上開花
    this.bus.emit(Events.TILE_DRAWN, { player: p, tile: repl });
    this.emitState();
    return true;
  }

  // closed kan / added kan from one's own hand (during AWAIT_DISCARD)
  declareKan(playerIndex, kind, type) {
    const p = this.players[playerIndex];
    if (this.phase !== Phase.AWAIT_DISCARD || this.turn !== playerIndex) return;
    if (type === MeldType.KAN_CLOSED) {
      const tiles = [];
      for (let n = 0; n < 4; n++) {
        const i = p.hand.findIndex((t) => t.kind === kind);
        tiles.push(p.hand.splice(i, 1)[0]);
      }
      p.melds.push(makeMeld(MeldType.KAN_CLOSED, tiles, null, null));
      this.log(`${p.character.name} が暗槓`);
    } else {
      // added kan: move the 4th tile from hand into the existing pon
      const meld = p.melds.find((m) => m.type === MeldType.PON && m.tiles[0].kind === kind);
      const i = p.hand.findIndex((t) => t.kind === kind);
      meld.tiles.push(p.hand.splice(i, 1)[0]);
      meld.type = MeldType.KAN_ADDED;
      this.log(`${p.character.name} が加槓`);
    }
    this._sortHand(p);
    this._clearAllIppatsu();

    // 槍槓 (chankan): an added kan can be robbed by any opponent waiting on that
    // tile. Open a ron-only call window BEFORE completing the kan (no kan-dora /
    // rinshan draw yet). If nobody robs it, the kan completes normally.
    if (type === MeldType.KAN_ADDED) {
      const added = p.melds.at(-1).tiles.at(-1);
      this._chankanActive = true; // so _canRon sees 槍槓 as the providing yaku
      const callers = this._collectChankanCallers(playerIndex, kind);
      if (callers.length > 0) {
        this.lastDiscard = added;
        this.lastDiscardFrom = playerIndex;
        this.phase = Phase.AWAIT_CALLS;
        this.pendingCalls = { tile: added, from: playerIndex, callers, chankan: true, kanKind: kind };
        this.emitState();
        return;
      }
      this._chankanActive = false;
    }
    this._completeKan(p);
  }

  // Finish a kan after any 槍槓 window: reveal kan-dora, notify, draw rinshan.
  _completeKan(p) {
    this._chankanActive = false;
    this.wall.revealKanDora();
    this.abilities.notify(Hooks.ON_MELD, { player: p, meld: p.melds.at(-1) });
    this.bus.emit(Events.MELD_CALLED, { player: p, type: "kan" });
    p.drawnTileId = null;
    this._drawRinshan(p);
  }

  // Opponents who can rob an added kan of `kind` (ron only; never the kanner).
  _collectChankanCallers(kannerIndex, kind) {
    const callers = [];
    for (let i = 0; i < this.numPlayers; i++) {
      if (i === kannerIndex) continue;
      if (this._canRon(this.players[i], kind)) {
        callers.push({ index: i, options: { ron: true, pon: false, kan: false, chi: [] } });
      }
    }
    return callers;
  }

  // Robbed kan reverts to a pon; the stolen 4th tile leaves the kanner's meld.
  _revertAddedKan(p, kind) {
    const meld = p.melds.find((m) => m.type === MeldType.KAN_ADDED && m.tiles[0].kind === kind);
    if (!meld) return;
    meld.type = MeldType.PON;
    meld.tiles.pop();
  }

  _drawRinshan(p) {
    const tile = this.wall.drawRinshan();
    if (!tile) { this._exhaustiveDraw(); return; }
    p.hand.push(tile);
    p.drawnTileId = tile.id;
    this._lastDraw = tile;
    this._rinshanFlag = true;
    this.phase = Phase.AWAIT_DISCARD;
    this.bus.emit(Events.TILE_DRAWN, { player: p, tile });
    this.emitState();
  }

  // --------------------------------------------------------------- wins
  doTsumo(playerIndex) {
    const p = this.players[playerIndex];
    const counts = p.counts();
    const ctx = this._winContext(p, this._lastDraw.kind, true);
    let res = scoreHand(counts, p.melds, ctx);
    if (!res.valid) return;
    res = this.abilities.modifyScore(p, res) || res;
    this._applyTsumo(p, res);
  }

  _doRon(winnerIndices, fromIndex, kind) {
    // head-bump: take the first winner in turn order after discarder
    const order = [];
    for (let n = 1; n <= this.numPlayers - 1; n++) order.push((fromIndex + n) % this.numPlayers);
    const winners = order.filter((i) => winnerIndices.includes(i));
    const winnerIndex = winners[0];
    const p = this.players[winnerIndex];
    const counts = p.counts();
    counts[kind]++;
    const ctx = this._winContext(p, kind, false);
    let res = scoreHand(counts, p.melds, ctx);
    if (!res.valid) { this.pendingCalls = null; this._afterDiscardNoCalls(); return; }
    res = this.abilities.modifyScore(p, res) || res;
    this._applyRon(p, this.players[fromIndex], res, kind);
  }

  _winContext(p, winningTileKind, tsumo) {
    // 天和/地和: tsumo on one's very first draw with no calls having occurred.
    // firstGoAround stays true through the opening go-around and is cleared by
    // any call; melds.length===0 rules out the winner's own kan; discards===0
    // confirms it is their first turn.
    const firstDraw = tsumo && this.firstGoAround
      && p.discards.length === 0 && p.melds.length === 0;
    return {
      winningTile: winningTileKind,
      tsumo,
      ron: !tsumo,
      tenhou: firstDraw && p.isDealer,
      chiihou: firstDraw && !p.isDealer,
      seatWind: p.seatWind,
      roundWind: this.roundWind,
      isDealer: p.isDealer,
      honba: this.honba,
      riichi: p.riichi,
      doubleRiichi: p.doubleRiichi,
      ippatsu: p.ippatsu,
      haitei: tsumo && this.wall.liveRemaining === 0,
      houtei: !tsumo && this.wall.liveRemaining === 0,
      rinshan: tsumo && this._rinshanFlag,
      chankan: !tsumo && !!this._chankanActive,
      doraKinds: this.wall.doraKinds(),
      uraKinds: this.wall.uraKinds(),
      redCount: this._redCount(p, winningTileKind, tsumo),
      kitaCount: p.kita.length, // 北抜き nuki-dora (sanma): each pulled North = +1 dora
    };
  }

  _redCount(p, winningKind, tsumo) {
    let n = p.hand.filter((t) => t.red).length;
    for (const m of p.melds) n += m.tiles.filter((t) => t.red).length;
    return n; // winning tile redness already in hand for tsumo; ron tile redness omitted (simplified)
  }

  // Apply per-player point deltas, letting each player's own abilities adjust
  // their share first (MODIFY_POINT_DELTA). `rawDeltas` is indexed by player
  // index. Adjustments need not stay zero-sum (points are "HP").
  //
  // 防御系で「失点を軽減した分」は勝者にも渡らない（ブロックされた点は消える）。
  // ron/tsumo の敗者側で adjusted > raw（＝失点が減った）になった差分を集計し、
  // 勝者の獲得からその総額を差し引く。失点が「増えた」場合（ネビュラの暗黒星など）は
  // HPロスとして消えるだけなので勝者へは移さない（軽減方向のみ対象）。
  _settle(rawDeltas, meta) {
    const N = this.numPlayers;
    const adjusted = [];
    for (let i = 0; i < N; i++) {
      adjusted[i] = this.abilities.modifyPointDelta(this.players[i], rawDeltas[i] || 0, meta);
    }
    const wi = meta && meta.winnerIndex;
    if ((meta?.reason === "ron" || meta?.reason === "tsumo") && wi != null) {
      let blocked = 0;
      for (let i = 0; i < N; i++) {
        if (i === wi) continue;
        const raw = rawDeltas[i] || 0;
        if (raw < 0) blocked += Math.max(0, adjusted[i] - raw); // 軽減された失点ぶん
      }
      adjusted[wi] -= blocked;
    }
    // 流局の精算はゼロサムを保つ。能力で「受け取りが増えた」分（余剰）が出た場合、
    // その増分を支払い側（罰符を払った＝raw<0 のプレイヤー）へ按分して上乗せ請求する。
    // 例: カリュブディスの受け取り3倍 → 増えた分はノーテン側が負担する（端数は最後の
    // 支払者で吸収して厳密にゼロサム）。失点を増やす方向（ネビュラ等）は余剰にならない
    // ので対象外（従来どおりHPロストとして消える）。
    if (meta?.reason === "draw") {
      let surplus = 0;
      for (let i = 0; i < N; i++) surplus += adjusted[i];
      const payTotal = rawDeltas.reduce((s, r) => s + (r < 0 ? -r : 0), 0);
      if (surplus > 0 && payTotal > 0) {
        const payers = [];
        for (let i = 0; i < N; i++) if ((rawDeltas[i] || 0) < 0) payers.push(i);
        let remaining = surplus;
        payers.forEach((i, k) => {
          const share = k === payers.length - 1
            ? remaining
            : Math.round(surplus * (-rawDeltas[i] / payTotal));
          adjusted[i] -= share;
          remaining -= share;
        });
      }
    }
    for (let i = 0; i < N; i++) this.players[i].points += adjusted[i];
  }

  _applyTsumo(p, res) {
    const before = this.players.map((q) => q.points);
    const raw = Array(this.numPlayers).fill(0);
    if (p.isDealer) {
      const each = res.tsumoEach.nonDealer;
      for (const o of this.players) if (o !== p) raw[o.index] -= each;
    } else {
      for (const o of this.players) {
        if (o === p) continue;
        raw[o.index] -= o.isDealer ? res.tsumoEach.dealer : res.tsumoEach.nonDealer;
      }
    }
    // Credit the winner with what was ACTUALLY collected from the seated players
    // (not res.total). In 三麻 this yields ツモ損 naturally — only the present
    // opponents pay. In 4p the sum equals res.total, so behavior is unchanged.
    const collected = this.players.reduce((s, o) => s - (o === p ? 0 : raw[o.index]), 0);
    raw[p.index] += collected + this.kyotaku;
    this.kyotaku = 0;
    this._settle(raw, { reason: "tsumo", winnerIndex: p.index });
    this._finishWin(p, res, null, before, this._lastDraw.kind);
  }

  _applyRon(p, loser, res, kind) {
    const before = this.players.map((q) => q.points);
    const raw = Array(this.numPlayers).fill(0);
    raw[loser.index] -= res.ron;
    raw[p.index] += res.ron + this.kyotaku;
    this.kyotaku = 0;
    this._settle(raw, { reason: "ron", winnerIndex: p.index });
    this._finishWin(p, res, loser, before, kind);
  }

  // Snapshot the winning hand for the result screen. `hand` is the concealed
  // hand; for tsumo it already contains the winning tile, for ron it does not.
  _handSnapshot(p) {
    const tile = (t) => ({ kind: t.kind, red: !!t.red });
    return {
      hand: p.hand.map(tile),
      melds: p.melds.map((m) => ({ type: m.type, tiles: m.tiles.map(tile) })),
    };
  }

  _finishWin(winner, res, loser, before, winningTile) {
    this.phase = Phase.HAND_OVER;
    this._chankanActive = false;
    this.pendingCalls = null;
    this.abilities.notify(Hooks.ON_WIN, { winner, result: res });
    this.lastResult = {
      winner: winner.index,
      loser: loser ? loser.index : null,
      result: res,
      tsumo: res.tsumoEach != null,
      winningTile,
      winningHand: this._handSnapshot(winner),
      deltas: this.players.map((q, i) => q.points - before[i]),
    };
    this.bus.emit(Events.HAND_WON, this.lastResult);
    const dealerWon = winner.isDealer;
    this._endHand(dealerWon, winner.index);
  }

  _exhaustiveDraw() {
    this.phase = Phase.HAND_OVER;
    const before = this.players.map((p) => p.points);

    // 流し満貫: a player whose discards are ALL terminals/honors and none of
    // which were called scores a mangan (paid like a tsumo). It overrides the
    // normal exhaustive-draw settlement and shows the win screen.
    const nagashi = this.players.filter((p) => this._isNagashi(p));
    if (nagashi.length > 0) {
      this._applyNagashi(nagashi, before);
      return;
    }

    // tenpai payments
    const N = this.numPlayers;
    const tenpai = this.players.map((p) => this._isTenpai(p));
    const tenpaiCount = tenpai.filter(Boolean).length;
    if (tenpaiCount > 0 && tenpaiCount < N) {
      const recvEach = 3000 / tenpaiCount; // each tenpai player receives
      const payEach = 3000 / (N - tenpaiCount); // each noten player pays
      const raw = this.players.map((_, i) => (tenpai[i] ? recvEach : -payEach));
      this._settle(raw, { reason: "draw", winnerIndex: null });
    }
    const dealerTenpai = tenpai[this.dealerIndex];
    this.lastResult = {
      draw: true,
      tenpai,
      deltas: this.players.map((p, i) => p.points - before[i]),
    };
    this.bus.emit(Events.HAND_DRAWN, this.lastResult);
    this.log("流局");
    this._endHand(dealerTenpai, null, /*ryuukyoku*/ true);
  }

  _isTenpai(p) {
    return waits(p.counts(), p.numMeldSets()).length > 0;
  }

  // 流し満貫 qualifies if every discard is a terminal/honor and none was called.
  _isNagashi(p) {
    if (p.discardCalled || p.discards.length === 0) return false;
    return p.discards.every((t) => isTerminalOrHonor(t.kind));
  }

  // Settle 流し満貫: each qualifying player is paid as a tsumo mangan. Riichi
  // sticks stay on the table (this is still a 流局). Dealer keeps on either a
  // dealer 流し満貫 or dealer tenpai, and honba increments like a draw.
  _applyNagashi(list, before) {
    const honbaEach = (this.honba || 0) * 100;
    let dealerNagashi = false;
    let display = null;
    const raw = Array(this.numPlayers).fill(0);
    for (const p of list) {
      // base 流し満貫 (paid like a tsumo mangan)
      let res = p.isDealer
        ? { tsumoEach: { nonDealer: 4000 + honbaEach }, total: (4000 + honbaEach) * 3 }
        : {
            tsumoEach: { dealer: 4000 + honbaEach, nonDealer: 2000 + honbaEach },
            total: (4000 + honbaEach) + (2000 + honbaEach) * 2,
          };
      res = {
        valid: true, yaku: [{ name: "流し満貫", han: 5 }], yakuman: [],
        dora: 0, yakuHan: 5, totalHan: 5, fu: 0, rank: "満貫", ...res,
      };
      // abilities may upgrade the result (e.g. 流し満貫→役満). Payments are
      // collected from the (possibly upgraded) result so they stay consistent.
      res = this.abilities.modifyNagashi(p, res) || res;
      if (p.isDealer) {
        const each = res.tsumoEach.nonDealer;
        for (const o of this.players) if (o !== p) { raw[o.index] -= each; raw[p.index] += each; }
        dealerNagashi = true;
      } else {
        for (const o of this.players) {
          if (o === p) continue;
          const pay = o.isDealer ? res.tsumoEach.dealer : res.tsumoEach.nonDealer;
          raw[o.index] -= pay; raw[p.index] += pay;
        }
      }
      if (!display) display = { winner: p.index, result: res };
    }
    this._settle(raw, { reason: "nagashi", winnerIndex: display.winner });
    this.lastResult = {
      winner: display.winner,
      loser: null,
      result: display.result,
      tsumo: true,
      nagashi: true,
      deltas: this.players.map((p, i) => p.points - before[i]),
    };
    this.bus.emit(Events.HAND_WON, this.lastResult);
    this.log("流し満貫");
    const dealerTenpai = this._isTenpai(this.players[this.dealerIndex]);
    this._endHand(dealerNagashi || dealerTenpai, display.winner, /*ryuukyoku*/ true);
  }

  _clearAllIppatsu() {
    for (const p of this.players) p.ippatsu = false;
  }

  // advance dealer / honba / round; check game end.
  // dealerKeeps (連荘): dealer won or, on an exhaustive draw, was tenpai.
  _endHand(dealerKeeps, winnerIndex, ryuukyoku = false) {
    if (dealerKeeps) {
      // 連荘: same dealer, same 局number, honba +1.
      this.honba++;
    } else {
      // 親流れ: honba resets on a win, but a draw carries honba +1.
      this.honba = ryuukyoku ? this.honba + 1 : 0;
      this.dealerIndex = (this.dealerIndex + 1) % this.numPlayers;
      this.kyoku++;
      // a round has numPlayers hands (4p: 東1-4 / sanma: 東1-3).
      if (this.kyoku > this.numPlayers) {
        // round finished -> advance wind (東→南), reset 局 to 1.
        this.kyoku = 1;
        this.roundWind++;
      }
    }

    // End conditions:
    //  * someone busts (points < 0) -> immediate end (トビ終了)
    //  * the configured final round/hand is completed without 連荘
    const bust = this.players.some((p) => p.points < 0);
    // roundsPlayed: how many full rounds (東=1, 南=2, ...) we've moved past.
    const finishedAllRounds = (this.roundWind - 27) >= this.maxRounds;
    if (bust || finishedAllRounds) {
      // Mark terminal but keep phase = HAND_OVER so the win/draw presentation
      // plays first; the UI shows "結果へ" instead of "次の局へ".
      this.gameOver = true;
    }
    this.emitState();
  }

  // Human-readable round label, e.g. "東1局" / "南4局".
  roundLabel() {
    const wind = { 27: "東", 28: "南", 29: "西", 30: "北" }[this.roundWind] || "?";
    return `${wind}${this.kyoku}局`;
  }

  isGameOver() {
    return this.gameOver;
  }
  rankings() {
    return [...this.players].sort((a, b) => b.points - a.points);
  }
}

export { Events };
