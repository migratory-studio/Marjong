// Controller: select screen -> game loop. Drives CPU turns on timers and routes
// human input. Engine stays synchronous; this file owns orchestration & timing.
import { Game, Phase, Events } from "./core/game.js";
import { CHARACTERS, instantiateAbilities } from "./characters/characters.js";
import { ROLE_MASTER } from "./data/characterMaster.js";
import { abilityDef } from "./data/abilityMaster.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "./ai/simpleAI.js";
import { CanvasRenderer } from "./ui/canvasRenderer.js";
import { TileImages, CharacterImages, AudioManager, tilePath } from "./ui/assets.js";
import { initSettingsUI, applyAudioSettings, wireSettingsControls } from "./ui/settings.js";
import { showScreen } from "./app/router.js";
import { initStage } from "./app/stage.js";
import { playScenario } from "./scenario/scenarioPlayer.js";
import { LocalProfileRepository } from "./progression/localProfileRepository.js";
import { activeAvatar } from "./progression/avatarFactory.js";
import { showAvatarCreate } from "./screens/avatarCreateScreen.js";
import { showAvatarDetail } from "./screens/avatarDetailScreen.js";
import { MeldType } from "./core/meld.js";
import { kindLabel } from "./core/tiles.js";
import { waits } from "./core/rules/winCheck.js";

const CPU_DELAY = 650; // ms between CPU actions (visualisation)

const el = (id) => document.getElementById(id);
let game, renderer, humanIndex = 0;
const tileImages = new TileImages();
const charImages = new CharacterImages();
const audio = new AudioManager();
tileImages.load(); // preload in background; renderer falls back until ready
charImages.load(CHARACTERS); // icons/portraits; null fallback until present
let selectedCharId = null;
let selectedRounds = 1; // 1 = 東風戦, 2 = 半荘戦
let selectedPlayers = 4; // 4 = 四人麻雀, 3 = 三人麻雀(三麻)
let pendingCpuCallDecisions = null; // cached while waiting on human call
let riichiMode = false;
let recallMode = false; // リコール・ディール: 自分の河の牌を選択中
let janeDoeMode = false; // 強制ツモ切り: 対象の相手を選択中
let kakehaMode = false; // 大博打: 賭け金（5000/10000）を選択中
let noNaki = false; // 鳴きなし: when on, auto-skip pon/chi/kan for the human (ron still offered)
let meldCalledFlag = false; // set by MELD_CALLED listener during a resolveCalls
let abilityCutInFlag = false; // set by ABILITY_USED listener; CPU loop waits on it
const NAKI_WAIT = 1100; // ms pause to show the naki call banner
const ABILITY_CUTIN_WAIT = 1700; // ms pause so the ability cut-in plays out

// ----------------------------------------------------------------- select UI
// Build a character icon element. Uses the master's declared icon path directly
// (independent of preload state) and degrades to a color block if it fails.
function makeCharIcon(c) {
  const path = c.assets?.icon;
  if (path) {
    const img = document.createElement("img");
    img.className = "char-icon";
    img.src = path;
    img.alt = c.name;
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = "char-icon char-icon-fallback";
      fb.style.background = c.color;
      img.replaceWith(fb);
    };
    return img;
  }
  const fb = document.createElement("div");
  fb.className = "char-icon char-icon-fallback";
  fb.style.background = c.color;
  return fb;
}

// Large portrait for the detail panel (declared path, color-block fallback).
function makeCharPortrait(c) {
  const path = c.assets?.portrait;
  if (path) {
    const img = document.createElement("img");
    img.className = "detail-portrait";
    img.src = path;
    img.alt = c.name;
    // Per-character crop focal point (defaults to the CSS "top center").
    if (c.portraitPos) img.style.objectPosition = c.portraitPos;
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = "detail-portrait detail-portrait-fallback";
      fb.style.background = c.color;
      img.replaceWith(fb);
    };
    return img;
  }
  const fb = document.createElement("div");
  fb.className = "detail-portrait detail-portrait-fallback";
  fb.style.background = c.color;
  return fb;
}

// ロール（種別）の定義引き。未設定/未知の role はフォールバック扱い。
const roleDef = (id) =>
  ROLE_MASTER.find((r) => r.id === id) || { id: "extra", label: "アビス", color: "#a78bfa" };

// Map a character's starting points to gauge pips (1..5) relative to the roster's
// highest HP, so the bar scales automatically if values are retuned.
const MAX_HP = Math.max(...CHARACTERS.map((c) => c.stats.startingPoints));
const hpPips = (sp) => Math.max(1, Math.min(5, Math.round((sp / MAX_HP) * 5)));

// One ▮▮▮▯▯ gauge row. `value` filled of `max` segments. `overlay` (optional)
// draws a value on top of the pips (used for the HP number).
function gaugeRow(label, value, accent, overlay) {
  let pips = "";
  for (let i = 0; i < 5; i++) pips += `<span class="pip${i < value ? " on" : ""}"></span>`;
  const style = accent ? ` style="--pip-on:${accent}"` : "";
  const ov = overlay != null ? `<span class="g-overlay">${overlay}</span>` : "";
  return `<div class="gauge"${style}><span class="g-label">${label}</span><span class="g-pips">${pips}${ov}</span></div>`;
}

// Render the right-hand detail panel for a character (or a prompt when null).
function renderCharDetail(c) {
  const detail = el("char-detail");
  if (!c) {
    detail.classList.add("empty");
    detail.innerHTML = `<div class="detail-prompt">← アイコンにカーソルを合わせると<br>ここに詳細が表示されます</div>`;
    return;
  }
  detail.classList.remove("empty");
  const p = c.params || { attack: 3, defense: 3, quirk: 3, difficulty: 3 };
  // The ability is the key gameplay info, so it's shown expanded (name + desc).
  const ability = c.abilities.map((a) => {
    const d = abilityDef(a.abilityId);
    return `<div class="ability-item"><div class="detail-ability-name">${d.name}</div><div class="detail-ability-desc">${d.desc}</div></div>`;
  }).join("");
  // Flavor text (bio + profile) is secondary, so it lives in a popover revealed
  // by hovering the name (see .detail-name-wrap:hover in styles.css).
  const flavor = `${c.bio ? `<div class="detail-bio">${c.bio}</div>` : ""}${c.profile ? `<div class="detail-profile">${c.profile}</div>` : ""}`;
  const sp = c.stats.startingPoints;
  const role = roleDef(c.role);
  detail.innerHTML = `
    <div class="detail-portrait-wrap"></div>
    <div class="detail-body">
      <div class="detail-reading">${c.reading || ""}</div>
      <div class="detail-name-wrap">
        <span class="detail-name" style="color:${c.color}">${c.name}</span>
        ${flavor ? `<div class="detail-flavor">${flavor}</div>` : ""}
      </div>
      <div class="detail-role" style="--role:${role.color}">${role.label}</div>
      <div class="detail-gauges">
        ${gaugeRow("ＨＰ", hpPips(sp), c.color, sp)}
        ${gaugeRow("攻め", p.attack, "#e85d75")}
        ${gaugeRow("守り", p.defense, "#4ea1d3")}
        ${gaugeRow("癖", p.quirk, "#a78bfa")}
        ${gaugeRow("難易度", p.difficulty, "#f6b352")}
      </div>
      <div class="detail-ability"><div class="detail-ability-head">固有能力</div>${ability}</div>
    </div>`;
  detail.querySelector(".detail-portrait-wrap").appendChild(makeCharPortrait(c));
}

function buildSelectScreen() {
  const list = el("char-list");
  list.innerHTML = "";
  const selectedChar = () => CHARACTERS.find((c) => c.id === selectedCharId) || null;

  // Build one roster tile (icon + HP) whose frame is tinted by its role color.
  const makeCard = (c) => {
    const role = roleDef(c.role);
    const card = document.createElement("div");
    card.className = "char-card";
    card.style.setProperty("--role", role.color);
    card.appendChild(makeCharIcon(c));
    // Horizontal card: icon + name (HP is shown in the detail panel's gauges).
    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = c.name;
    card.appendChild(name);
    card.onmouseenter = () => { audio.playClick(); renderCharDetail(c); };
    card.onclick = () => {
      selectedCharId = c.id;
      list.querySelectorAll(".char-card").forEach((ch) => ch.classList.remove("selected"));
      card.classList.add("selected");
      el("start-btn").disabled = false;
      renderCharDetail(c);
    };
    return card;
  };

  // Group the roster by role and emit a labeled section per role (in ROLE_MASTER
  // order). Empty roles are skipped; unknown roles fall through to "extra".
  for (const role of ROLE_MASTER) {
    const members = CHARACTERS.filter((c) => roleDef(c.role).id === role.id);
    if (members.length === 0) continue;
    const group = document.createElement("div");
    group.className = "role-group";
    group.style.setProperty("--role", role.color);
    const head = document.createElement("div");
    head.className = "role-header";
    head.innerHTML = `<span class="role-name">${role.label}</span><span class="role-line"></span>`;
    group.appendChild(head);
    const cards = document.createElement("div");
    cards.className = "role-cards";
    for (const c of members) cards.appendChild(makeCard(c));
    group.appendChild(cards);
    list.appendChild(group);
  }
  // Leaving the roster restores the selected character's detail (or the prompt).
  list.onmouseleave = () => renderCharDetail(selectedChar());
  renderCharDetail(null);

  // 人数 (4人 / 3人) toggle
  const playersToggle = el("players-toggle");
  for (const btn of playersToggle.querySelectorAll(".mode-btn")) {
    btn.onclick = () => {
      selectedPlayers = Number(btn.dataset.players);
      playersToggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    };
  }

  // 東風戦 / 半荘戦 toggle
  const toggle = el("mode-toggle");
  for (const btn of toggle.querySelectorAll(".mode-btn")) {
    btn.onclick = () => {
      selectedRounds = Number(btn.dataset.rounds);
      toggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    };
  }

  el("start-btn").onclick = startGame;

  // シナリオ（紙芝居）サンプル再生。マスタを読み込んで再生 → 終了で選択画面へ戻る。
  const scBtn = el("scenario-demo-btn");
  if (scBtn) scBtn.onclick = () => {
    showScreen("scenario-screen");
    playScenario("twin-chun-yao-01", {
      onEnd: () => goScreen("select-screen"),
    });
  };
}

// ----------------------------------------------------------------- navigation
// Wire every [data-nav] control to a screen. Home is the boot screen; the
// existing 選択 -> 対局 flow lives behind フリー対戦 > 通常フリー対戦.
let resyncHomeSettings = () => {};
const NAV_TARGETS = {
  home: "home-screen",
  "free-battle": "free-battle-screen",
  online: "online-screen",
  settings: "settings-screen",
  select: "select-screen",
};
// Menu BGM per screen. Tracks that aren't listed leave the current BGM playing,
// so the title theme carries through the free-battle / settings submenus and only
// swaps to the select theme on the character screen. In-game uses random per-hand BGM.
const SCREEN_BGM = {
  "home-screen": () => audio.playHomeBgm(),
  "select-screen": () => audio.playSelectBgm(),
};
function goScreen(id) {
  showScreen(id);
  SCREEN_BGM[id]?.();
}
// 師弟モード: マイキャラがいれば確認画面、いなければ作成画面へ（Phase 2A）。
const profileRepo = new LocalProfileRepository();
async function openMentorMode() {
  const profile = await profileRepo.loadProfile();
  if (activeAvatar(profile)) {
    showAvatarDetail(el("avatar-detail-screen"), { profile, onBack: () => navigate("home") });
    goScreen("avatar-detail-screen");
  } else {
    showAvatarCreate(el("avatar-create-screen"), {
      repository: profileRepo,
      onBack: () => navigate("home"),
      onCreated: (saved) => {
        showAvatarDetail(el("avatar-detail-screen"), { profile: saved, onBack: () => navigate("home") });
        goScreen("avatar-detail-screen");
      },
    });
    goScreen("avatar-create-screen");
  }
}

function navigate(target) {
  if (target === "mentor") { openMentorMode(); return; }
  const id = NAV_TARGETS[target];
  if (!id) return;
  if (target === "settings") resyncHomeSettings(); // reflect in-game edits
  goScreen(id);
}
function bootHome() {
  for (const btn of document.querySelectorAll("[data-nav]")) {
    btn.addEventListener("click", () => { audio.playClick?.(); navigate(btn.dataset.nav); });
  }
  // Volumes apply regardless of starting screen; the home 設定 controls share
  // the same AudioManager + storage as the in-game gear panel.
  applyAudioSettings(audio);
  resyncHomeSettings = wireSettingsControls(audio, {
    enabled: "home-audio-enabled",
    bgm: "home-bgm-volume", bgmVal: "home-bgm-volume-val",
    se: "home-se-volume", seVal: "home-se-volume-val",
  });
  goScreen("home-screen");
  // Browsers block audio before the first user gesture, so the home BGM may not
  // start at boot. Retry once on the first interaction (playHomeBgm no-ops if it
  // already started).
  const kickBgm = () => { audio.playHomeBgm(); window.removeEventListener("pointerdown", kickBgm); };
  window.addEventListener("pointerdown", kickBgm, { once: true });
}

// ----------------------------------------------------------------- start
function startGame() {
  humanIndex = 0;
  // human picks their character; the remaining CPUs are drawn at random (no
  // duplicates) from the rest of the roster. Seat count depends on the chosen
  // mode: 4 players (四人) or 3 players (三麻).
  const human = CHARACTERS.find((c) => c.id === selectedCharId);
  const pool = shuffled(CHARACTERS.filter((c) => c.id !== selectedCharId));
  const order = [human, ...pool.slice(0, selectedPlayers - 1)];
  const seated = order.map((c) => ({
    character: c,
    abilities: instantiateAbilities(c),
  }));
  // Per-character voices (pon/chi/kan/riichi/tsumo/ron). Missing files fall back
  // to the shared SE inside AudioManager.playVoice().
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});

  game = new Game(seated, humanIndex, undefined, { maxRounds: selectedRounds });
  renderer = new CanvasRenderer(el("table"), game, humanIndex, tileImages, charImages);
  if (typeof window !== "undefined") { window.__game = game; window.__renderer = renderer; window.__audio = audio; } // debug handle

  game.bus.on(Events.LOG, (msg) => addLog(msg));
  game.bus.on(Events.STATE_CHANGED, () => render());
  // SE: random dahai sound whenever anyone discards (incl. the human)
  game.bus.on(Events.TILE_DISCARDED, () => audio.playDahai());
  // BGM (random per hand) + deal-shuffle SE
  game.bus.on(Events.HAND_STARTED, () => { audio.playRandomBgm(); audio.playShuffle(); });
  // Riichi declaration chime
  game.bus.on(Events.RIICHI_DECLARED, ({ player }) => audio.playVoice(player.character.id, "riichi"));
  // Naki call: shared SE + big banner over the caller's seat (win SE / point
  // popups are handled in the result-overlay flow, not here).
  game.bus.on(Events.MELD_CALLED, ({ player, type }) => {
    meldCalledFlag = true;
    // type is "pon"/"chi"/"kan" — used as the voice key; falls back to shared naki SE.
    audio.playVoice(player.character.id, type);
    showNakiFx(player.index, type);
  });
  // Ability cut-in: big skill-name text + bust-up sweeping across, with a wait.
  game.bus.on(Events.ABILITY_USED, ({ player, name }) => {
    abilityCutInFlag = true;
    audio.playVoice(player.character.id, "ability"); // no clip -> shared naki SE
    showAbilityCutIn(player, name);
  });

  showScreen("game-screen");
  el("table").addEventListener("click", onCanvasClick);
  el("table").addEventListener("mousemove", onCanvasHover);
  el("table").addEventListener("mouseleave", () => { renderer.setHover(null); render(); });
  initSettingsUI(audio); // gear icon + volume panel (idempotent against re-init)
  initNoNakiToggle();

  // game.startHand() emits HAND_STARTED -> BGM. This runs inside the
  // start-button click (a user gesture), satisfying browser autoplay policy.
  game.startHand();
  loop();
}

// ----------------------------------------------------------------- main loop
function loop() {
  render();
  // Show the hand-over presentation (ron/tsumo banner + win/draw screen) first,
  // even when this hand ends the game (トビ終了 / 最終局). The result screen is
  // reached via the "結果へ" button in that overlay, not directly here.
  if (game.phase === Phase.HAND_OVER) { showHandResult(); return; }

  if (game.isGameOver()) { showGameOver(); return; }

  if (game.phase === Phase.AWAIT_CALLS) { handleCalls(); return; }

  if (game.phase === Phase.AWAIT_DISCARD) {
    const actor = game.players[game.turn];
    if (actor.isHuman) {
      // After own riichi: auto-tsumogiri the drawn tile (unless tsumo is available).
      const opts = game.actionOptions(actor.index);
      if (actor.riichi && opts && !opts.tsumo) {
        autoTsumogiri(actor, "リーチ中（自動ツモ切り）");
        return;
      }
      // JaneDoe で強制ツモ切りにされている: ツモ和了以外は自動でツモ切り。
      if (opts && opts.forcedTsumogiri && !opts.tsumo) {
        autoTsumogiri(actor, "強制ツモ切り中");
        return;
      }
      showHumanActions();
    } else {
      // Activate any manual abilities first so the cut-in plays during the wait,
      // then discard. A fired ability extends the pause (ウェイト) so it reads.
      const index = game.turn;
      abilityCutInFlag = false;
      for (const a of decideAbilityActivations(game, index)) game.activateAbility(index, a.id, a.params);
      const wait = abilityCutInFlag ? ABILITY_CUTIN_WAIT : CPU_DELAY;
      setTimeout(() => { cpuDiscard(index); loop(); }, wait);
    }
  }
}

const AUTO_TSUMOGIRI_DELAY = 700; // ms — long enough for the player to see what they drew
function autoTsumogiri(actor, hintText = "リーチ中（自動ツモ切り）") {
  clearActions();
  const bar = el("action-bar");
  const hint = document.createElement("span");
  hint.style.cssText = "align-self:center;color:#f0d264;font-weight:700;font-size:14px;";
  hint.textContent = hintText;
  bar.appendChild(hint);
  // re-render to refresh highlights / hand display
  refreshHighlights();
  render();
  setTimeout(() => {
    clearActions();
    game.discard(actor.index, actor.drawnTileId, false);
    loop();
  }, AUTO_TSUMOGIRI_DELAY);
}

function cpuDiscard(index) {
  // Ability activation now happens in loop() (before the cut-in wait); here we
  // just choose and execute the discard / tsumo / kan.
  const d = decideDiscard(game, index);
  if (!d) return;
  if (d.type === "tsumo") { game.doTsumo(index); return; }
  if (d.type === "kan") { game.declareKan(index, d.kind, d.kanType); return; }
  if (d.type === "nuki") { game.nukiKita(index); return; }
  game.discard(index, d.tileId, d.riichi);
}

// ----------------------------------------------------------------- calls
function handleCalls() {
  const callers = game.pendingCalls.callers;
  let humanCaller = callers.find((c) => game.players[c.index].isHuman);

  // 鳴きなし: drop pon/chi/kan from the human's options (ron is not a naki, so it
  // stays). If nothing's left to ask, the human is simply omitted => treated as
  // a pass by resolveCalls (which only acts on decisions it's given).
  if (humanCaller && noNaki) {
    if (humanCaller.options.ron) {
      humanCaller = { index: humanCaller.index, options: { ron: true, pon: false, kan: false, chi: [] } };
    } else {
      humanCaller = null;
    }
  }

  // CPU decisions first
  const cpuDecisions = callers
    .filter((c) => !game.players[c.index].isHuman)
    .map((c) => ({ index: c.index, ...decideCall(game, c.index, c.options) }));

  if (!humanCaller) {
    meldCalledFlag = false;
    game.resolveCalls(cpuDecisions);
    setTimeout(loop, meldCalledFlag ? NAKI_WAIT : 250); // pause to show naki banner
    return;
  }

  // human is among callers: show buttons, stash cpu decisions
  pendingCpuCallDecisions = cpuDecisions;
  showCallActions(humanCaller);
}

function resolveHumanCall(action, meta) {
  const human = game.pendingCalls.callers.find((c) => game.players[c.index].isHuman);
  const decisions = [...pendingCpuCallDecisions];
  if (action !== "pass") decisions.push({ index: human.index, action, meta });
  else decisions.push({ index: human.index, action: "pass" });
  pendingCpuCallDecisions = null;
  clearActions();
  meldCalledFlag = false;
  game.resolveCalls(decisions);
  setTimeout(loop, meldCalledFlag ? NAKI_WAIT : 200); // pause to show naki banner
}

// ----------------------------------------------------------------- human input
function onCanvasClick(ev) {
  if (game.phase !== Phase.AWAIT_DISCARD) return;
  const actor = game.players[game.turn];
  if (!actor.isHuman) return;

  const rect = el("table").getBoundingClientRect();
  const scaleX = el("table").width / rect.width;
  const scaleY = el("table").height / rect.height;
  const x = (ev.clientX - rect.left) * scaleX;
  const y = (ev.clientY - rect.top) * scaleY;

  // リコール選択中: 自分の河の牌クリックで交換を実行（その後そのまま通常打牌へ）。
  if (recallMode) {
    for (const hb of renderer.riverHitboxes) {
      if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
        recallMode = false;
        game.activateAbility(actor.index, "recall-deal", { riverTileId: hb.tileId });
        showHumanActions();
        render();
        return;
      }
    }
    return; // 河以外のクリックは無視（キャンセルはボタンで）
  }

  // JaneDoe 対象選択中・大博打の賭け金選択中は打牌をブロック（ボタンで選ぶ）。
  if (janeDoeMode || kakehaMode) return;

  for (const hb of renderer.handHitboxes) {
    if (!hb.enabled) continue;
    if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
      const wasRiichi = riichiMode;
      riichiMode = false;
      clearActions();
      game.discard(actor.index, hb.tileId, wasRiichi);
      loop();
      return;
    }
  }
}

// Hovering one of YOUR OWN hand tiles previews the wait: if discarding that
// tile leaves the hand tenpai, show which tiles it would then wait on.
let lastHoverKey = null;
function onCanvasHover(ev) {
  // only meaningful on the human's own turn to discard
  if (game.phase !== Phase.AWAIT_DISCARD || !game.players[game.turn].isHuman) {
    if (lastHoverKey !== null) { lastHoverKey = null; renderer.setHover(null); render(); }
    return;
  }
  const c = el("table");
  const rect = c.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (c.width / rect.width);
  const y = (ev.clientY - rect.top) * (c.height / rect.height);

  let hit = null;
  for (const hb of renderer.handHitboxes) {
    if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) { hit = hb; break; }
  }
  const key = hit ? hit.tileId : null;
  if (key === lastHoverKey) return; // avoid re-rendering every pixel
  lastHoverKey = key;

  if (!hit) { renderer.setHover(null); render(); return; }

  // simulate discarding this tile, then compute waits of the remaining hand
  const p = game.players[game.turn];
  const counts = p.counts();
  counts[hit.kind]--;
  const w = waits(counts, p.numMeldSets());
  if (w.length === 0) { renderer.setHover(null); render(); return; } // not tenpai
  renderer.setHover({ x: hit.x + hit.w / 2, y: hit.y, waits: w });
  render();
}

function showHumanActions() {
  clearActions();
  const idx = game.turn;
  const opts = game.actionOptions(idx);
  if (!opts) return;

  // JaneDoe 対象選択中は専用の対象ボタンを表示する。
  if (janeDoeMode) { showJaneDoeTargets(idx); return; }
  // 大博打の賭け金選択中は専用ボタンを表示する。
  if (kakehaMode) { showKakehaBets(idx); return; }

  // danger marking (defensive ability) -> renderer highlights
  refreshHighlights();

  const bar = el("action-bar");
  if (opts.tsumo) bar.appendChild(mkBtn("ツモ和了", "btn-tsumo", () => { clearActions(); game.doTsumo(idx); loop(); }));
  if (opts.riichi) {
    bar.appendChild(mkBtn(riichiMode ? "リーチ解除" : "リーチ", "btn-riichi", () => {
      riichiMode = !riichiMode;
      renderer.setHighlights({ riichiMode, riichiKinds: opts.riichiDiscards, danger: currentDanger() });
      render();
      showHumanActions();
    }));
  }
  if (opts.kans.length > 0) {
    bar.appendChild(mkBtn("カン", "btn-kan", () => {
      const k = opts.kans[0];
      clearActions();
      game.declareKan(idx, k.kind, k.type);
      loop();
    }));
  }
  // 北抜き (三麻): pull a North tile as nuki-dora, then act again (no turn passes).
  if (opts.nuki) {
    bar.appendChild(mkBtn("北抜き", "btn-kan", () => {
      clearActions();
      game.nukiKita(idx);
      showHumanActions();
      render();
    }));
  }

  // Ability activation buttons / indicators (発動種別ごと)。These go in the side
  // panel (#ability-bar), not the action bar, so they never cover the hand tiles.
  const abilityBar = el("ability-bar");
  for (const a of game.abilityStatus(idx)) {
    if (a.activation === "passive") {
      abilityBar.appendChild(mkChip(`常時: ${a.name}`, "ability-chip passive"));
    } else if (a.active) {
      abilityBar.appendChild(mkChip(`発動中: ${a.name}`, "ability-chip active"));
    } else {
      // remaining-count UI sits above the activation button (not inline in it).
      if (a.maxCharges !== Infinity) {
        abilityBar.appendChild(mkChip(`${a.name}　残り ${a.charges}/${a.maxCharges}`, "ability-remain"));
      }
      const btn = mkBtn(`発動: ${a.name}`, "btn-ability", () => {
        // recall-deal needs a target: enter a "pick a river tile" selection mode
        // instead of firing immediately. The click handler completes the swap.
        if (a.id === "recall-deal") {
          recallMode = true;
          riichiMode = false;
          showHumanActions();
          render();
          return;
        }
        // jane-doe needs a target: enter opponent-selection mode.
        if (a.id === "jane-doe") {
          janeDoeMode = true;
          riichiMode = false;
          showHumanActions();
          render();
          return;
        }
        // kakeha-bet needs a bet amount: enter bet-selection mode.
        if (a.id === "kakeha-bet") {
          kakehaMode = true;
          riichiMode = false;
          showHumanActions();
          render();
          return;
        }
        game.activateAbility(idx, a.id);
        showHumanActions();
        render();
      });
      if (!a.canActivate) btn.disabled = true;
      abilityBar.appendChild(btn);
    }
  }

  // リコール選択中はキャンセルボタンを出し、ヒントを差し替える。
  if (recallMode) {
    bar.appendChild(mkBtn("キャンセル", "btn-skip", () => {
      recallMode = false;
      showHumanActions();
      render();
    }));
  }

  const hint = document.createElement("span");
  hint.style.cssText = "align-self:center;color:#cfe0d6;font-size:13px;margin-left:8px;";
  hint.textContent = recallMode
    ? "河から手牌へ戻す牌を選んでください（ツモ牌は河へ・ロン不可）"
    : riichiMode ? "リーチ宣言牌を選んで切ってください" : "手牌をクリックして打牌";
  bar.appendChild(hint);
}

// 強制ツモ切り（JaneDoe）の対象選択バー。リーチ中の相手は選べない。
function showJaneDoeTargets(idx) {
  clearActions();
  const bar = el("action-bar");
  const label = document.createElement("span");
  label.style.cssText = "align-self:center;color:#f6b352;font-weight:700;margin-right:8px;";
  label.textContent = "強制ツモ切りの対象を選択:";
  bar.appendChild(label);
  for (const o of game.players) {
    if (o.index === idx) continue;
    const btn = mkBtn(`${o.character.name}${o.riichi ? "（リーチ中）" : ""}`, "btn-ability", () => {
      janeDoeMode = false;
      game.activateAbility(idx, "jane-doe", { targetIndex: o.index });
      showHumanActions();
      render();
    });
    if (o.riichi) btn.disabled = true;
    bar.appendChild(btn);
  }
  bar.appendChild(mkBtn("キャンセル", "btn-skip", () => {
    janeDoeMode = false;
    showHumanActions();
    render();
  }));
}

// 大博打（賭羽ルイナ）の賭け金選択バー。持ち点が賭け金を下回る額は選べない。
function showKakehaBets(idx) {
  clearActions();
  const bar = el("action-bar");
  const me = game.players[idx];
  const label = document.createElement("span");
  label.style.cssText = "align-self:center;color:#f6b352;font-weight:700;margin-right:8px;";
  label.textContent = "賭け金を選択:";
  bar.appendChild(label);
  for (const [amount, mult] of [[5000, "1.5"], [10000, "2"]]) {
    const btn = mkBtn(`${amount}点（和了${mult}倍）`, "btn-ability", () => {
      kakehaMode = false;
      game.activateAbility(idx, "kakeha-bet", { betAmount: amount });
      showHumanActions();
      render();
    });
    if (me.points < amount) btn.disabled = true;
    bar.appendChild(btn);
  }
  bar.appendChild(mkBtn("キャンセル", "btn-skip", () => {
    kakehaMode = false;
    showHumanActions();
    render();
  }));
}

function showCallActions(humanCaller) {
  clearActions();
  refreshHighlights();
  const bar = el("action-bar");
  const o = humanCaller.options;
  // ポン/チー/カンの選択肢が出たら nakitaku SE で知らせる（ロンのみは対象外）。
  if (o.pon || o.kan || o.chi.length > 0) audio.playNakitaku();
  const tile = game.lastDiscard;
  const label = document.createElement("span");
  label.style.cssText = "align-self:center;color:#f6b352;font-weight:700;margin-right:8px;";
  label.textContent = `${kindLabel(tile.kind)} に対して:`;
  bar.appendChild(label);

  if (o.ron) bar.appendChild(mkBtn("ロン", "btn-ron", () => resolveHumanCall("ron")));
  if (o.kan) bar.appendChild(mkBtn("カン", "btn-kan", () => resolveHumanCall("kan")));
  if (o.pon) bar.appendChild(mkBtn("ポン", "btn-pon", () => resolveHumanCall("pon")));
  if (o.chi.length > 0) {
    o.chi.forEach((seq, i) => {
      const names = seq.map(kindLabel).join("");
      bar.appendChild(mkBtn(`チー(${names})`, "btn-chi", () => resolveHumanCall("chi", seq)));
    });
  }
  bar.appendChild(mkBtn("スキップ", "btn-skip", () => resolveHumanCall("pass")));
}

// ----------------------------------------------------------------- rendering
function refreshHighlights() {
  renderer.setHighlights({
    riichiMode,
    riichiKinds: riichiMode ? game.actionOptions(game.turn)?.riichiDiscards : null,
    danger: currentDanger(),
    recallMode,
  });
}

function currentDanger() {
  const human = game.players[humanIndex];
  const info = game.abilities.dangerInfo(human);
  if (!info) return null;
  const map = new Map();
  for (const d of info) map.set(d.kind, d.level);
  return map;
}

function render() {
  renderer.setHighlights({
    riichiMode,
    riichiKinds: riichiMode ? game.actionOptions(game.turn)?.riichiDiscards : null,
    danger: currentDanger(),
    recallMode,
  });
  renderer.render();
}

// ----------------------------------------------------------------- results
let winRevealTimer = null;
const WIN_CALL_WAIT = 1200; // ms to show the ロン/ツモ banner on the table first

function showHandResult() {
  clearActions();
  const r = game.lastResult;

  if (r.draw) {
    const overlay = el("win-overlay");
    overlay.classList.remove("hidden");
    const tenpaiNames = r.tenpai.map((t, i) => (t ? game.players[i].character.name : null)).filter(Boolean);
    overlay.innerHTML = `
      <div class="win-card">
        <h2 class="win-title">流局</h2>
        <div class="win-sub">テンパイ: ${tenpaiNames.join("、") || "なし"}</div>
        <div class="win-buttons"></div>
      </div>`;
    appendNextButton(overlay.querySelector(".win-buttons"));
    return;
  }

  // Win: first show a big ロン/ツモ banner over the winner's seat (like a naki
  // call), wait, then open the centered result screen. No dedicated ron/tsumo
  // voice in the asset pack, so reuse the shared naki call SE here.
  audio.playNaki();
  showWinCallFx(r.winner, r.tsumo ? "tsumo" : "ron");
  setTimeout(() => {
    const overlay = el("win-overlay");
    overlay.classList.remove("hidden");
    showWinResult(overlay, r);
  }, WIN_CALL_WAIT);
}

// Build the winning hand row for the result screen: concealed tiles (sorted),
// the agari tile set slightly apart, then any melds. `winningHand` is captured
// at win time; for tsumo the agari tile is part of the concealed hand, for ron
// it is not (so we append it).
function tileImgHtml(t, extraClass = "") {
  return `<img class="win-tile ${extraClass}" src="${tilePath(t.kind)}" alt="">`;
}

function renderWinHand(r) {
  const wh = r.winningHand;
  if (!wh || !wh.hand) return "";
  const concealed = wh.hand.slice();
  let winTile = { kind: r.winningTile, red: false };
  if (r.tsumo) {
    const idx = concealed.findIndex((t) => t.kind === r.winningTile);
    if (idx >= 0) winTile = concealed.splice(idx, 1)[0];
  }
  concealed.sort((a, b) => a.kind - b.kind);

  const handHtml = concealed.map((t) => tileImgHtml(t)).join("");
  const winHtml = tileImgHtml(winTile, "win-tile-agari");
  const meldsHtml = wh.melds.map((m) =>
    `<span class="win-meld">${m.tiles.map((t) => tileImgHtml(t)).join("")}</span>`
  ).join("");

  return `
    <div class="win-hand">
      <span class="win-hand-concealed">${handHtml}</span>
      <span class="win-hand-agari">${winHtml}</span>
      ${meldsHtml ? `<span class="win-hand-melds">${meldsHtml}</span>` : ""}
    </div>`;
}

// Centered win screen: reveals yaku one at a time; a skip button reveals all.
function showWinResult(overlay, r) {
  const res = r.result;
  const winner = game.players[r.winner];
  const how = r.tsumo ? "ツモ" : `ロン（${game.players[r.loser].character.name}から）`;

  const items = [];
  if (res.isYakuman) {
    for (const y of res.yakuman) items.push({ name: y.name, val: "役満" });
  } else {
    for (const y of res.yaku) items.push({ name: y.name, val: `${y.han}飜` });
    if (res.dora) items.push({ name: "ドラ", val: `${res.dora}飜` });
  }

  const fu = res.fu ? `${res.fu}符 ` : "";
  const scoreText = `${res.rank ? res.rank + " " : ""}${fu}${res.totalHan ? res.totalHan + "飜 " : ""}${res.total}点`;

  const portraitUrl = charImages.url(winner.character, "portrait");
  const portraitHtml = portraitUrl
    ? `<img class="win-portrait" src="${portraitUrl}" alt="${winner.character.name}">`
    : `<div class="win-portrait win-portrait-fallback" style="--char-color:${winner.character.color}">${[...winner.character.name][0] || "?"}</div>`;
  overlay.innerHTML = `
    <div class="win-card">
      <div class="win-how">${how}</div>
      <h2 class="win-title" style="color:${winner.character.color}">${winner.character.name} の和了</h2>
      ${renderWinHand(r)}
      <ul class="yaku-list" id="yaku-list"></ul>
      <div class="win-score hidden" id="win-score">${scoreText}</div>
      <div class="win-buttons" id="win-buttons"></div>
    </div>
    ${portraitHtml}`;

  const listEl = el("yaku-list");
  const btnBox = el("win-buttons");
  let revealed = 0;

  const revealOne = () => {
    if (revealed >= items.length) { finishReveal(); return; }
    const it = items[revealed++];
    const li = document.createElement("li");
    li.className = "yaku-item";
    li.innerHTML = `<span class="yaku-name">${it.name}</span><span class="yaku-han">${it.val}</span>`;
    listEl.appendChild(li);
    requestAnimationFrame(() => li.classList.add("show"));
    winRevealTimer = setTimeout(revealed < items.length ? revealOne : finishReveal, 650);
  };

  const finishReveal = () => {
    clearTimeout(winRevealTimer); winRevealTimer = null;
    for (; revealed < items.length; revealed++) {
      const it = items[revealed];
      const li = document.createElement("li");
      li.className = "yaku-item show";
      li.innerHTML = `<span class="yaku-name">${it.name}</span><span class="yaku-han">${it.val}</span>`;
      listEl.appendChild(li);
    }
    const score = el("win-score");
    score.classList.remove("hidden");
    score.classList.add("pop");
    // Winner's tsumo/ron voice (falls back to the 金額表示 SE when no clip).
    audio.playVoice(winner.character.id, r.tsumo ? "tsumo" : "ron");
    btnBox.innerHTML = "";
    appendNextButton(btnBox);
  };

  const skipBtn = mkBtn("スキップ", "btn-skip", finishReveal);
  skipBtn.classList.add("skip-reveal");
  btnBox.appendChild(skipBtn);

  winRevealTimer = setTimeout(revealOne, 400);
}

function appendNextButton(box) {
  const deltas = game.lastResult && game.lastResult.deltas; // capture before next hand
  const btn = mkBtn(game.isGameOver() ? "結果へ" : "次の局へ", "btn-tsumo", () => {
    el("win-overlay").classList.add("hidden");
    if (game.isGameOver()) { showGameOver(); return; }
    showPointFx(deltas); // animate +N / -N over the table
    game.startHand();
    loop();
  });
  box.appendChild(btn);
}

// ----------------------------------------------------------------- FX
// Big "ポン/チー/カン" banner near the calling player's seat (auto-fades).
function showNakiFx(playerIndex, type) {
  showSeatCall(playerIndex, { pon: "ポン", chi: "チー", kan: "カン" }[type] || type, "naki-call");
}

// Big "ロン/ツモ" banner near the winner's seat before the result screen.
function showWinCallFx(playerIndex, type) {
  showSeatCall(playerIndex, type === "tsumo" ? "ツモ" : "ロン", "naki-call win-call");
}

// Map a player index to its on-screen seat slot (matches the renderer's layout:
// 4p offsets -> [0,1,2,3]; 3p offsets -> [0,1,3], i.e. self/right/left).
function visualSeat(playerIndex) {
  const N = game.numPlayers;
  const offset = (playerIndex - humanIndex + N) % N;
  const slots = N === 3 ? [0, 1, 3] : [0, 1, 2, 3];
  return slots[offset];
}

function showSeatCall(playerIndex, text, className) {
  const seat = visualSeat(playerIndex);
  const pos = SEAT_FX_POS[seat];
  const e = document.createElement("div");
  e.className = className;
  e.textContent = text;
  e.style.left = pos.left;
  e.style.top = pos.top;
  el("naki-fx").appendChild(e);
  requestAnimationFrame(() => e.classList.add("show"));
  setTimeout(() => e.remove(), 1400);
}

// Floating +N / -N point deltas near each seat.
function showPointFx(deltas) {
  if (!deltas) return;
  const fx = el("point-fx");
  deltas.forEach((d, pIndex) => {
    if (!d) return;
    const seat = visualSeat(pIndex);
    const pos = SEAT_FX_POS[seat];
    const e = document.createElement("div");
    e.className = `point-delta ${d > 0 ? "plus" : "minus"}`;
    e.textContent = (d > 0 ? "+" : "") + d;
    e.style.left = pos.left;
    e.style.top = pos.top;
    fx.appendChild(e);
    requestAnimationFrame(() => e.classList.add("show"));
    setTimeout(() => e.remove(), 1800);
  });
}

// Ability cut-in: a diagonal band sweeps across with the character's bust-up and
// the skill name in big text, holds briefly (ウェイト), then sweeps off. The band's
// CSS animation runs for ABILITY_CUTIN_WAIT; we just clean up afterward.
let abilityCutInTimer = null;
function showAbilityCutIn(player, name) {
  const host = el("ability-cutin");
  const c = player.character;
  const portraitUrl = charImages.url(c, "portrait");
  const art = portraitUrl
    ? `<img class="cutin-portrait" src="${portraitUrl}" alt="${c.name}">`
    : `<div class="cutin-portrait cutin-portrait-fallback" style="--char-color:${c.color}">${[...c.name][0] || "?"}</div>`;
  clearTimeout(abilityCutInTimer);
  host.innerHTML = `
    <div class="cutin-band" style="--char-color:${c.color}">
      ${art}
      <div class="cutin-text">
        <div class="cutin-char" style="color:${c.color}">${c.name}</div>
        <div class="cutin-name">${name}</div>
      </div>
    </div>`;
  host.classList.remove("hidden");
  abilityCutInTimer = setTimeout(() => {
    host.classList.add("hidden");
    host.innerHTML = "";
    abilityCutInTimer = null;
  }, ABILITY_CUTIN_WAIT);
}

// Seat-relative positions (0=self bottom,1=right,2=top,3=left) as % of table.
const SEAT_FX_POS = {
  0: { left: "50%", top: "66%" },
  1: { left: "78%", top: "50%" },
  2: { left: "50%", top: "30%" },
  3: { left: "22%", top: "50%" },
};

function showGameOver() {
  clearActions();
  const overlay = el("win-overlay");
  overlay.classList.remove("hidden");
  const ranks = game.rankings();
  const rows = ranks
    .map((p, i) => `<div class="rank-row"><span>${i + 1}位　<b style="color:${p.character.color}">${p.character.name}</b></span><span>${p.points}点</span></div>`)
    .join("");
  overlay.innerHTML = `
    <div class="win-card">
      <h2 class="win-title">対局終了</h2>
      <div class="rank-list">${rows}</div>
      <div class="win-buttons"></div>
    </div>`;
  overlay.querySelector(".win-buttons").appendChild(mkBtn("もう一度", "btn-tsumo", () => location.reload()));
}

// ----------------------------------------------------------------- helpers
function mkBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = cls;
  b.onclick = onClick;
  return b;
}
function mkChip(label, cls) {
  const s = document.createElement("span");
  s.textContent = label;
  s.className = cls;
  return s;
}
function clearActions() {
  el("action-bar").innerHTML = "";
  const ab = el("ability-bar");
  if (ab) ab.innerHTML = ""; // ability controls live in the side panel now
}

// Fisher–Yates copy shuffle (used for random CPU character selection).
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wire the 鳴きなし toggle button (idempotent — startGame may run once per game).
let noNakiWired = false;
function initNoNakiToggle() {
  const btn = el("nonaki-btn");
  if (!btn) return;
  const sync = () => {
    btn.classList.toggle("on", noNaki);
    btn.setAttribute("aria-pressed", String(noNaki));
    btn.textContent = `鳴きなし: ${noNaki ? "ON" : "OFF"}`;
  };
  if (!noNakiWired) {
    btn.addEventListener("click", () => { noNaki = !noNaki; sync(); });
    noNakiWired = true;
  }
  sync();
}

function addLog(msg) {
  const log = el("log");
  const div = document.createElement("div");
  if (msg.startsWith("【")) div.className = "ability";
  div.textContent = msg;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

initStage(); // fixed 1280x720 stage, scaled to fit the window (letterboxed)
buildSelectScreen();
bootHome();
