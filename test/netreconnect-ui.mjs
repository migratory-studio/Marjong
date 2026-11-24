// 本番のメッセージハンドラを実行し、F5後の空の画面状態から復帰できることを確認。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { applyEvent } from "../src/net/applyEvent.js";
import { snapshotEvent } from "../src/net/eventLog.js";
import { redactFor } from "../src/net/redact.js";

const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const start = source.indexOf("function onlineClientMessage(msg)");
const end = source.indexOf("\nfunction ", start + 1);
assert.ok(start >= 0 && end > start);
const handler = source.slice(start, end);
function screen() {
  const calls = { begin: 0, intro: 0, result: 0, gameOver: 0, clears: 0, save: [], hidden: [] };
  const context = {
    game: null, online: null, humanIndex: 0, onlineToken: null,
    onlineWsUrl: "wss://game.example/ws?room=match3",
    matchmaking: null, roomLobby: null, onlineSeatInfo: null,
    selectedPlayers: 4, selectedRounds: 1, selectedTeamBattle: false, selectedPairBattle: false,
    teamBattleData: null, pairBattleData: null,
    CHARACTERS, instantiateAbilities, Phase, applyEvent, clearTimeout,
    winRevealTimer: null, hpHold: [999],
    audio: { registerCharacterVoices() {} },
    onlineResume: { save: (...v) => calls.save.push(v), clear: () => calls.clears++ },
    onlineRecovery: { stop() {} },
    hideMatchSearchOverlay() {}, resetOnlineTurnUi() {}, clearActions() {},
    clearHandEndInfo() {}, setStageEcho() {},
    el: (id) => ({ classList: { add: (c) => calls.hidden.push([id, c]) } }),
    showScreen: (name) => { calls.screen = name; },
    showOnlineWaitToast: () => { calls.waiting = true; },
    showHandResult: () => { calls.result++; },
    showGameOver: () => { calls.gameOver++; },
    showOnlineMatchIntro: () => { calls.intro++; },
    beginGame(seated, dealer, options) {
      calls.begin++;
      assert.deepEqual({ ...options }, { online: true, ws: true });
      context.game = new Game(seated, context.humanIndex, undefined, { dealerIndex: dealer });
      context.online = { ws: true, opts: null, callOpts: null };
    },
  };
  vm.createContext(context);
  vm.runInContext(handler, context);
  return { context, calls };
}
const roster = CHARACTERS.slice(0, 4).map((c) => c.id);
const welcome = { type: "welcome", rejoined: true, seat: 1, roster, token: "a".repeat(32), players: [] };
function authority() {
  const seated = roster.map((id) => {
    const character = CHARACTERS.find((c) => c.id === id);
    return { character, abilities: instantiateAbilities(character) };
  });
  const game = new Game(seated, 1, 111);
  game.startHand();
  return game;
}

test("F5後のwelcome(rejoined)からレプリカを作り、開始演出を挟まず盤面へ戻す", () => {
  const { context, calls } = screen();
  context.onlineClientMessage(welcome);
  assert.equal(calls.begin, 1);
  assert.equal(calls.intro, 0);
  assert.equal(context.humanIndex, 1);
  assert.equal(calls.save[0][1], welcome.token);
  const game = authority();
  context.onlineClientMessage(redactFor(snapshotEvent(game), 1));
  assert.equal(context.game.handNumber, game.handNumber);
  assert.equal(context.game.players[1].hand.length, game.players[1].hand.length);
  assert.equal(calls.screen, "game-screen");
  assert.equal(context.hpHold, null);
  assert.ok(calls.hidden.some(([id]) => id === "win-overlay"));
  context.onlineClientMessage(welcome);
  assert.equal(calls.begin, 1, "同じページ内の復帰は既存レプリカを再利用する");
});

test("局間復帰は未確認結果を再表示し、確認済みなら待機する。終局は一度だけ表示", () => {
  const { context, calls } = screen();
  context.onlineClientMessage(welcome);
  const game = authority();
  game.phase = Phase.HAND_OVER;
  game.lastResult = { draw: true, tenpai: [false, false, false, false], deltas: [0, 0, 0, 0] };
  context.onlineClientMessage({ ...redactFor(snapshotEvent(game), 1), acked: false });
  assert.equal(calls.result, 1);
  context.onlineClientMessage({ ...redactFor(snapshotEvent(game), 1), acked: true });
  assert.equal(calls.result, 1);
  assert.equal(calls.waiting, true);
  context.onlineClientMessage({ type: "evt.gameOver" });
  context.onlineClientMessage({ type: "evt.gameOver" });
  assert.equal(calls.gameOver, 1);
  assert.ok(calls.clears > 0);
});
