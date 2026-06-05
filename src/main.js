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
import { showMentorHome } from "./screens/mentorHomeScreen.js";
import { showRest } from "./screens/restScreen.js";
import { showGrowth } from "./screens/growthScreen.js";
import { showAbilityChange } from "./screens/abilityChangeScreen.js";
import { showScenarioList } from "./screens/scenarioListScreen.js";
import { showMatchIntro } from "./screens/matchIntroScreen.js";
import { MeldType } from "./core/meld.js";
import { kindLabel } from "./core/tiles.js";
import { waits } from "./core/rules/winCheck.js";
import { shanten } from "./core/rules/shanten.js";
import { pickVoiceLine } from "./data/voiceLines.js";

const CPU_DELAY = 650; // ms between CPU actions (visualisation)

const el = (id) => document.getElementById(id);
let game, renderer, humanIndex = 0;
let hpCells = null; // 相棒ボード（右側HP表示）の playerIndex -> セル参照マップ
const tileImages = new TileImages();
const charImages = new CharacterImages();
const audio = new AudioManager();
tileImages.load(); // preload in background; renderer falls back until ready
charImages.load(CHARACTERS); // icons/portraits; null fallback until present
let selectedCharId = null;
let selectedRounds = 1; // 1 = 東風戦, 2 = 半荘戦
let selectedPlayers = 4; // 4 = 四人麻雀, 3 = 三人麻雀(三麻)
// CPU相手の指名。席オフセット(0=CPU①…2=CPU③)ごとのキャラID。null は「おまかせ
// (ランダム)」で従来挙動。最大3席ぶん保持し、人数に応じて先頭から使う。
let cpuPicks = [null, null, null];
// ロスターのカードをクリックしたとき埋める席。0=あなた, 1..=CPU席。
let activeSeat = 0;
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

// CPU席ラベル（CPU①②③）。席オフセット 0..2 を丸数字に。
const SEAT_MARKS = ["①", "②", "③"];

function buildSelectScreen() {
  const list = el("char-list");
  list.innerHTML = "";
  const selectedChar = () => CHARACTERS.find((c) => c.id === selectedCharId) || null;
  // ロスターのカードをキャラID で引けるようにして、席割りの選択ハイライトを更新できる。
  const cardById = new Map();

  // どのキャラがどの席に着いているかのラベル（"あなた"/①②③）。未着席は null。
  // 現在の人数を超える席に残った指名は無視する（人数を減らしたときの保険）。
  const seatLabelOf = (id) => {
    if (selectedCharId === id) return "あなた";
    const off = cpuPicks.indexOf(id);
    return off >= 0 && off < selectedPlayers - 1 ? `CPU${SEAT_MARKS[off]}` : null;
  };

  // カードのハイライト＋席バッジを現在の席割りに合わせて更新。
  function refreshCards() {
    for (const [id, card] of cardById) {
      const label = seatLabelOf(id);
      card.classList.toggle("selected", label !== null);
      const badge = card.querySelector(".card-seat-badge");
      badge.textContent = label || "";
      badge.classList.toggle("hidden", label === null);
    }
  }

  const refreshAll = () => { renderSeats(); refreshCards(); updateWizNav(); };

  // アクティブ席（クリックでキャラを入れる席）を切り替える。
  function setActiveSeat(s) { activeSeat = s; refreshAll(); }

  // 次の空席へ進む（現在の人数の範囲で巡回）。全席埋まっていれば現状維持。
  function nextEmptySeat() {
    for (let step = 1; step <= selectedPlayers; step++) {
      const s = (activeSeat + step) % selectedPlayers;
      const filled = s === 0 ? !!selectedCharId : !!cpuPicks[s - 1];
      if (!filled) return s;
    }
    return activeSeat;
  }

  // アクティブ席にキャラを着席させる。同キャラが他席にいれば自動で外す（重複防止）。
  function assignToActiveSeat(c) {
    if (activeSeat !== 0 && selectedCharId === c.id) selectedCharId = null;
    for (let i = 0; i < cpuPicks.length; i++) {
      if (cpuPicks[i] === c.id && i !== activeSeat - 1) cpuPicks[i] = null;
    }
    if (activeSeat === 0) selectedCharId = c.id;
    else cpuPicks[activeSeat - 1] = c.id;
    activeSeat = nextEmptySeat();
    refreshAll(); // updateWizNav() inside re-gates 次へ on the human seat
    renderCharDetail(c);
  }

  // 1席ぶんのチップを作る。先頭=あなた、以降=CPU席。CPU席は未指名なら「おまかせ
  // (ランダム)」。interactive=true なら席切替/🎲リセットを配線、false は表示専用。
  function makeSeatChip(s, interactive) {
    const isHuman = s === 0;
    const charId = isHuman ? selectedCharId : cpuPicks[s - 1];
    const ch = charId ? CHARACTERS.find((c) => c.id === charId) : null;
    const chip = document.createElement(interactive ? "button" : "div");
    if (interactive) chip.type = "button";
    chip.className = "seat-chip" + (interactive && s === activeSeat ? " active" : "") + (interactive ? "" : " static");
    const role = document.createElement("span");
    role.className = "seat-role";
    role.textContent = isHuman ? "あなた" : `CPU${SEAT_MARKS[s - 1]}`;
    chip.appendChild(role);
    const pick = document.createElement("span");
    pick.className = "seat-pick";
    if (ch) {
      const ic = makeCharIcon(ch); ic.classList.add("seat-icon");
      pick.appendChild(ic);
      const nm = document.createElement("span"); nm.className = "seat-name"; nm.textContent = ch.name;
      pick.appendChild(nm);
    } else if (isHuman) {
      pick.classList.add("empty"); pick.textContent = "未選択";
    } else {
      pick.classList.add("random"); pick.textContent = "🎲 おまかせ";
    }
    chip.appendChild(pick);
    if (interactive) {
      chip.onclick = () => { audio.playClick?.(); setActiveSeat(s); };
      if (!isHuman && ch) {
        const rs = document.createElement("span");
        rs.className = "seat-reset"; rs.textContent = "🎲"; rs.title = "おまかせに戻す";
        rs.onclick = (e) => { e.stopPropagation(); audio.playClick?.(); cpuPicks[s - 1] = null; setActiveSeat(s); };
        chip.appendChild(rs);
      }
    }
    return chip;
  }

  // ②キャラの操作可能な席バー（席切替＋全員おまかせ）と、①卓の表示専用プレビューを
  // 両方とも現在の席割りで描き直す。存在する側だけ更新する。
  function renderSeats() {
    const bar = el("seat-bar");
    if (bar) {
      bar.innerHTML = "";
      for (let s = 0; s < selectedPlayers; s++) bar.appendChild(makeSeatChip(s, true));
      const all = document.createElement("button");
      all.type = "button";
      all.className = "seat-allrandom";
      all.textContent = "全員おまかせ";
      all.title = "CPU相手をすべてランダムに戻す";
      all.onclick = () => { audio.playClick?.(); cpuPicks = [null, null, null]; refreshAll(); };
      bar.appendChild(all);
    }
    const prev = el("seat-preview");
    if (prev) {
      prev.innerHTML = "";
      for (let s = 0; s < selectedPlayers; s++) prev.appendChild(makeSeatChip(s, false));
    }
  }

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
    // 席割りバッジ（"あなた"/①②③）。未着席時は hidden。
    const badge = document.createElement("span");
    badge.className = "card-seat-badge hidden";
    card.appendChild(badge);
    card.onmouseenter = () => { audio.playClick(); renderCharDetail(c); };
    card.onclick = () => assignToActiveSeat(c);
    cardById.set(c.id, card);
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
  renderSeats();

  // 人数 (4人 / 3人) toggle
  const playersToggle = el("players-toggle");
  for (const btn of playersToggle.querySelectorAll(".mode-btn")) {
    btn.onclick = () => {
      selectedPlayers = Number(btn.dataset.players);
      // 人数を減らしたら消える席の指名は破棄。アクティブ席が範囲外なら自分へ戻す。
      for (let i = selectedPlayers - 1; i < cpuPicks.length; i++) cpuPicks[i] = null;
      if (activeSeat >= selectedPlayers) activeSeat = 0;
      playersToggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      refreshAll();
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

  // --------------------------------------------------------------- wizard nav
  // ①卓 → ②キャラ → ③ルール＆開始 の3ステップ。進行はパネルの出し分け＋下部ナビで
  // 制御する。②から③へ進むには自分（あなた席）の選択が必須。
  let wizStep = 1;
  const canReach = (step) => (step <= 2 ? true : !!selectedCharId);

  // 下部ナビ（戻る/次へ/開始）の表示と活性をステップに合わせる。
  function updateWizNav() {
    const back = el("wiz-back"), next = el("wiz-next"), start = el("start-btn");
    if (!back || !next || !start) return;
    back.classList.toggle("hidden", wizStep === 1);
    next.classList.toggle("hidden", wizStep === 3);
    start.classList.toggle("hidden", wizStep !== 3);
    next.disabled = wizStep === 2 && !selectedCharId; // 自分未選択なら次へ不可
  }

  // ③の確認リスト（人数＋各席の指名/おまかせ）。
  function renderSummary() {
    const box = el("wiz-summary");
    if (!box) return;
    box.innerHTML = "";
    const line = (k, ch, fallback) => {
      const row = document.createElement("div");
      row.className = "sum-line";
      const key = document.createElement("span"); key.className = "sum-k"; key.textContent = k;
      const val = document.createElement("span"); val.className = "sum-v";
      if (ch) { const ic = makeCharIcon(ch); ic.classList.add("sum-icon"); val.appendChild(ic); val.append(ch.name); }
      else { val.classList.add("sum-random"); val.textContent = fallback; }
      row.append(key, val);
      box.appendChild(row);
    };
    const modeRow = document.createElement("div");
    modeRow.className = "sum-line";
    modeRow.innerHTML = `<span class="sum-k">人数</span><span class="sum-v">${selectedPlayers}人</span>`;
    box.appendChild(modeRow);
    line("あなた", selectedChar(), "未選択");
    for (let i = 0; i < selectedPlayers - 1; i++) {
      const id = cpuPicks[i];
      line(`CPU${SEAT_MARKS[i]}`, id ? CHARACTERS.find((c) => c.id === id) : null, "おまかせ（ランダム）");
    }
  }

  function gotoStep(step) {
    if (!canReach(step)) return;
    wizStep = step;
    // ②キャラに入る時、自分が未選択ならアクティブ席を「あなた」に。最初のクリックが
    // 必ず自分の選択になり、CPU席へ誤爆して自分の指名を外す事故を防ぐ。
    if (step === 2 && !selectedCharId) activeSeat = 0;
    for (const pane of document.querySelectorAll("#select-screen .wiz-pane")) {
      pane.classList.toggle("hidden", Number(pane.dataset.pane) !== step);
    }
    for (const li of document.querySelectorAll("#wiz-steps .wiz-step")) {
      const n = Number(li.dataset.step);
      li.classList.toggle("active", n === step);
      li.classList.toggle("done", n < step);
    }
    if (step === 1) renderSeats();   // プレビューを最新の席割りで
    if (step === 3) renderSummary();
    updateWizNav();
  }

  el("wiz-back").onclick = () => { audio.playClick?.(); gotoStep(wizStep - 1); };
  el("wiz-next").onclick = () => { audio.playClick?.(); gotoStep(wizStep + 1); };
  el("start-btn").onclick = startGame;
  // ステップ見出しをクリックして到達済みステップへジャンプ（前進は条件を満たす時のみ）。
  for (const li of document.querySelectorAll("#wiz-steps .wiz-step")) {
    li.onclick = () => { audio.playClick?.(); gotoStep(Number(li.dataset.step)); };
  }
  // select-screen を開くたびに①へ戻し、アクティブ席を「あなた」へ戻す（goScreen から呼ぶ）。
  resetSelectWizard = () => { activeSeat = 0; gotoStep(1); };
  gotoStep(1);

  // シナリオ（紙芝居）サンプル再生。マスタを読み込んで再生 → 終了で選択画面へ戻る。
  const scBtn = el("scenario-demo-btn");
  if (scBtn) scBtn.onclick = () => {
    showScreen("scenario-screen");
    playScenario("twin-chun-yao-01", {
      audio,
      onEnd: () => goScreen("select-screen"),
    });
  };
}
// select-screen の再表示時にウィザードを①へリセットするフック（buildSelectScreen が設定）。
let resetSelectWizard = () => {};

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
  if (id === "select-screen") resetSelectWizard(); // 開くたびにウィザードを①卓へ
}
// 師弟モード: マイキャラがいれば師弟ホーム、いなければ作成画面へ（Phase 2A/2B）。
const profileRepo = new LocalProfileRepository();
async function openMentorMode() {
  const profile = await profileRepo.loadProfile();
  if (activeAvatar(profile)) {
    openMentorHome();
  } else {
    showAvatarCreate(el("avatar-create-screen"), {
      repository: profileRepo,
      onBack: () => navigate("home"),
      onCreated: () => openMentorHome(),
    });
    goScreen("avatar-create-screen");
  }
}

// 師弟ホーム（ハブ）。休憩 / 育成 / 能力変更 / マイキャラへ振り分ける（Phase 2B）。
// 各サブ画面は自前で profile を読み込み、戻ると師弟ホームが再読込で最新値を反映する。
function openMentorHome() {
  showMentorHome(el("mentor-home-screen"), {
    repository: profileRepo,
    onBack: () => navigate("home"),
    onNavigate: (target) => openMentorSub(target),
  });
  goScreen("mentor-home-screen");
}

async function openMentorSub(target) {
  const back = () => openMentorHome();
  if (target === "rest") {
    await showRest(el("rest-screen"), { repository: profileRepo, onBack: back });
    goScreen("rest-screen");
  } else if (target === "growth") {
    await showGrowth(el("growth-screen"), { repository: profileRepo, onBack: back });
    goScreen("growth-screen");
  } else if (target === "ability-change") {
    await showAbilityChange(el("ability-change-screen"), { repository: profileRepo, onBack: back });
    goScreen("ability-change-screen");
  } else if (target === "avatar") {
    const profile = await profileRepo.loadProfile();
    showAvatarDetail(el("avatar-detail-screen"), { profile, onBack: back });
    goScreen("avatar-detail-screen");
  } else if (target === "scenario") {
    // シナリオ一覧 → 選択で #scenario-screen 再生 → 終了で一覧へ戻り既読/報酬を反映。
    await showScenarioList(el("scenario-list-screen"), {
      repository: profileRepo,
      onBack: back,
      onPlay: (scenarioId, onEnd) => {
        showScreen("scenario-screen");
        playScenario(scenarioId, { audio, onEnd: () => { goScreen("scenario-list-screen"); onEnd?.(); } });
      },
    });
    goScreen("scenario-list-screen");
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
  // human picks their character. Each CPU seat is either an explicit pick
  // (cpuPicks) or left as "おまかせ" — empty seats are filled at random with no
  // duplicates against the human or any explicit pick. Seat count depends on the
  // chosen mode: 4 players (四人) or 3 players (三麻).
  const human = CHARACTERS.find((c) => c.id === selectedCharId);
  const picks = cpuPicks.slice(0, selectedPlayers - 1);
  const usedIds = new Set([human.id, ...picks.filter(Boolean)]);
  const randomPool = shuffled(CHARACTERS.filter((c) => !usedIds.has(c.id)));
  const cpus = picks.map((id) =>
    id ? CHARACTERS.find((c) => c.id === id) : randomPool.shift()
  );
  const order = [human, ...cpus];
  const seated = order.map((c) => ({
    character: c,
    abilities: instantiateAbilities(c),
  }));
  // Per-character voices (pon/chi/kan/riichi/tsumo/ron). Missing files fall back
  // to the shared SE inside AudioManager.playVoice().
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});

  // 起家（最初の親）をランダムに決め、対局開始演出で見せる。演出が終わったら
  // その親で実対局を始める（beginGame）。全対局共通の入口。
  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated,
    humanIndex,
    mode: { rounds: selectedRounds, players: selectedPlayers },
    dealerIndex,
    audio,
    onComplete: () => beginGame(seated, dealerIndex),
  });
}

// 実対局の生成と開始。対局開始演出（showMatchIntro）の onComplete から呼ばれる。
function beginGame(seated, dealerIndex) {
  game = new Game(seated, humanIndex, undefined, { maxRounds: selectedRounds, dealerIndex });
  renderer = new CanvasRenderer(el("table"), game, humanIndex, tileImages, charImages);
  if (typeof window !== "undefined") { window.__game = game; window.__renderer = renderer; window.__audio = audio; } // debug handle

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
  // 局中マイクロ反応（自分の状況に応じた一言をバストアップのセリフ枠へ）。
  setupMatchTalk(game);

  showScreen("game-screen");
  buildHpBoard(); // 右側に卓配置どおりのキャラHP（相棒ボード）を構築
  el("table").addEventListener("click", onCanvasClick);
  el("table").addEventListener("mousemove", onCanvasHover);
  el("table").addEventListener("mouseleave", () => { renderer.setHover(null); render(); });
  initSettingsUI(audio); // gear icon + volume panel (idempotent against re-init)
  initNoNakiToggle();

  // game.startHand() emits HAND_STARTED -> BGM. This runs inside the
  // start-button click (a user gesture), satisfying browser autoplay policy.
  game.startHand();
  loop();

  // 対局開始: 自キャラが一言（マスタ駆動・一定時間で自動で消える）。
  // （一旦オフ。再開するときはこの行のコメントを外す）
  // showTransientSpeaker(game.players[humanIndex].character, "matchStart", {}, { side: "left", duration: 3600 });
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
  updateHpBoard(); // 右側の相棒ボードのHP/手番ハイライトを最新状態に同期
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

// 局名を漢数字つきで（東1局 -> 東一局）。
function roundLabelKanji() {
  const k = ["", "一", "二", "三", "四", "五", "六", "七", "八"][game.kyoku] || game.kyoku;
  const wind = { 27: "東", 28: "南", 29: "西", 30: "北" }[game.roundWind] || "東";
  return `${wind}${k}局`;
}

// ドラ表示牌（リーチ和了なら裏ドラも）を小さな牌列で。
function renderDora(winner) {
  let ind = null;
  try { ind = game.wall.doraIndicators(); } catch { ind = null; }
  if (!ind || !ind.length) return "";
  const tiles = (arr) => arr.map((t) => `<img class="win-dora-tile" src="${tilePath(t.kind)}" alt="">`).join("");
  let uraRow = "";
  if (winner && winner.riichi) {
    let ura = null;
    try { ura = game.wall.uraIndicators(); } catch { ura = null; }
    if (ura && ura.length) {
      uraRow = `<div class="win-dora-row"><span class="win-dora-label">裏ドラ</span><span class="win-dora-tiles">${tiles(ura)}</span></div>`;
    }
  }
  return `
    <div class="win-dora">
      <div class="win-dora-row"><span class="win-dora-label">ドラ表示</span><span class="win-dora-tiles">${tiles(ind)}</span></div>
      ${uraRow}
    </div>`;
}

// Full-bleed cinematic win screen (雀龍門/雀魂風): 上に手牌、左に立ち絵、右に役/
// ランク/点数、ドラ表示と煌めき。役は1つずつ捲り、最後にランクと点数がドンと出る。
function showWinResult(overlay, r) {
  const res = r.result;
  const winner = game.players[r.winner];
  const howWord = r.tsumo ? "ツモ和了" : "ロン和了";
  const fromName = !r.tsumo && game.players[r.loser] ? game.players[r.loser].character.name : "";

  const items = [];
  if (res.isYakuman) {
    for (const y of res.yakuman) items.push({ name: y.name, val: "役満" });
  } else {
    for (const y of res.yaku) items.push({ name: y.name, val: `${y.han}飜` });
    if (res.dora) items.push({ name: "ドラ", val: `${res.dora}飜` });
  }

  // 中央のドンと出る大ランク（役満／満貫／跳満…）。安手は飜数を出す。
  const rankTier = (res.isYakuman || /役満/.test(res.rank || "")) ? "yakuman"
    : res.rank ? "mangan" : "normal";
  const bigRank = res.isYakuman ? (res.rank || "役満")
    : res.rank ? res.rank : `${res.totalHan || 0}飜`;

  const detailText = `${res.fu ? res.fu + "符 " : ""}${res.totalHan ? res.totalHan + "飜" : ""}`.trim();
  // 本体点（res.total）と、供託・本場込みの実収支（deltas）。違えば括弧で併記。
  const winnerGain = (r.deltas && r.deltas[r.winner]) || res.total;
  const subText = winnerGain && winnerGain !== res.total ? `(${winnerGain})` : "";

  const portraitUrl = charImages.url(winner.character, "portrait");
  const portraitHtml = portraitUrl
    ? `<img class="win-portrait" src="${portraitUrl}" alt="${winner.character.name}">`
    : `<div class="win-portrait win-portrait-fallback" style="--char-color:${winner.character.color}">${[...winner.character.name][0] || "?"}</div>`;

  let sparkles = "";
  for (let i = 0; i < 16; i++) {
    const x = (Math.random() * 100).toFixed(1), y = (Math.random() * 88).toFixed(1);
    const d = (Math.random() * 2.4).toFixed(2), s = (0.5 + Math.random()).toFixed(2);
    sparkles += `<span class="wspark" style="left:${x}%;top:${y}%;animation-delay:${d}s;--s:${s}"></span>`;
  }

  overlay.innerHTML = `
    <div class="win-rich" data-tier="${rankTier}" style="--char-color:${winner.character.color}">
      <div class="win-sparkles">${sparkles}</div>
      <div class="win-banner">${roundLabelKanji()}　<span class="win-banner-how">${howWord}</span></div>
      ${renderWinHand(r)}
      ${portraitHtml}
      <div class="win-nameplate">
        <span class="win-name" style="color:${winner.character.color}">${winner.character.name}</span>
        ${fromName ? `<span class="win-from">${fromName} から</span>` : ""}
      </div>
      ${renderDora(winner)}
      <div class="win-body">
        <ul class="yaku-list" id="yaku-list"></ul>
        <div class="win-finale">
          <div class="win-rank hidden" id="win-rank">${bigRank}</div>
          <div class="win-scorebox">
            ${detailText ? `<div class="win-detail">${detailText}</div>` : ""}
            <div class="win-score hidden" id="win-score">${res.total}<span class="win-pt">点</span></div>
            ${subText ? `<div class="win-score-sub hidden" id="win-score-sub">${subText}</div>` : ""}
          </div>
        </div>
      </div>
      <div class="win-buttons" id="win-buttons"></div>
    </div>`;

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
    winRevealTimer = setTimeout(revealed < items.length ? revealOne : finishReveal, 520);
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
    for (const id of ["win-rank", "win-score", "win-score-sub"]) {
      const node = el(id);
      if (node) { node.classList.remove("hidden"); node.classList.add("pop"); }
    }
    // Winner's tsumo/ron voice (falls back to the 金額表示 SE when no clip).
    audio.playVoice(winner.character.id, r.tsumo ? "tsumo" : "ron");
    btnBox.innerHTML = "";
    appendNextButton(btnBox, r);
  };

  const skipBtn = mkBtn("スキップ", "btn-skip", finishReveal);
  skipBtn.classList.add("skip-reveal");
  btnBox.appendChild(skipBtn);

  winRevealTimer = setTimeout(revealOne, 400);
}

function appendNextButton(box, r) {
  const deltas = game.lastResult && game.lastResult.deltas; // capture before next hand
  const proceed = () => {
    if (game.isGameOver()) { showGameOver(); return; }
    showPointFx(deltas); // animate +N / -N over the table
    game.startHand();
    loop();
  };
  const btn = mkBtn(game.isGameOver() ? "結果へ" : "次の局へ", "btn-tsumo", () => {
    el("win-overlay").classList.add("hidden");
    // On a 和了, play the RPG-style HP/damage sequence first (points = HP), then
    // advance. Draws (no winner index) skip straight through.
    if (r && r.winner != null && deltas && deltas.some((d) => d)) showDamageFx(r, proceed);
    else proceed();
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

// Encode a one-shot SE under sound/se/ (filenames contain Japanese characters).
const sePath = (name) => "sound/se/" + encodeURIComponent(name);

// Count a number element from `from` -> `to` over `dur` ms (ease-out cubic).
function tweenNum(node, from, to, dur) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 立ち絵＋小さなメッセージウィンドウの「スピーカー」要素を作る（マスタ駆動のセリフ表示）。
// side: "left" | "right"（画面のどちら端に置くか）。DOM を返すだけ（host への追加は呼び出し側）。
function buildSpeakerEl(character, text, side = "left") {
  const c = character;
  const portraitUrl = charImages.url(c, "portrait");
  const art = portraitUrl
    ? `<img class="speaker-portrait" src="${portraitUrl}" alt="${c.name}">`
    : `<div class="speaker-portrait speaker-portrait-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
  const wrap = document.createElement("div");
  wrap.className = `speaker speaker-${side}`;
  wrap.innerHTML = `
    ${art}
    <div class="speaker-box">
      <div class="speaker-name" style="color:${c.color}">${c.name}</div>
      <div class="speaker-text">${text}</div>
    </div>`;
  return wrap;
}

// マスタからセリフを引き、対象 host にスピーカーを差し込む（無ければ何もしない）。
// 返り値はスピーカー要素 or null。表示の出し入れは呼び出し側で制御する。
function mountSpeaker(host, character, event, ctx, side = "left") {
  if (!host || !character) return null;
  const text = pickVoiceLine(character.id, event, ctx || {});
  if (!text) return null;
  const sp = buildSpeakerEl(character, text, side);
  host.appendChild(sp);
  requestAnimationFrame(() => sp.classList.add("show"));
  return sp;
}

// 単発スピーカー: #speaker-fx に出して duration 後に自動で消す（対局開始などの一瞬の演出）。
let speakerFxTimer = null;
function showTransientSpeaker(character, event, ctx, { side = "left", duration = 3400 } = {}) {
  const host = el("speaker-fx");
  if (!host) return;
  clearTimeout(speakerFxTimer);
  host.innerHTML = "";
  const sp = mountSpeaker(host, character, event, ctx, side);
  if (!sp) return;
  speakerFxTimer = setTimeout(() => {
    sp.classList.remove("show");
    setTimeout(() => { if (sp.parentNode === host) host.removeChild(sp); }, 360);
  }, duration);
}

// RPG-style HP/damage sequence shown after the 和了 card (points = HP). Lists the
// winner + every player whose points changed, drains the losers' HP gauges with a
// shake/flash and a floating -N, heals the winner (+N). セリフを読み切れるよう、
// クリック or 10秒で次へ進む。`onDone` runs once when the sequence finishes.
let damageFxTimer = null;
function showDamageFx(r, onDone) {
  const host = el("damage-overlay");
  const deltas = r.deltas || [];
  const full = (i) => game.players[i].character.stats.startingPoints || MAX_HP;
  const pct = (v, i) => Math.max(0, Math.min(100, (v / full(i)) * 100));

  // Winner first, then anyone whose points moved (losers / tsumo payers).
  const order = [r.winner];
  game.players.forEach((p, i) => { if (i !== r.winner && deltas[i]) order.push(i); });

  const rowHtml = (i) => {
    const c = game.players[i].character;
    const after = game.players[i].points;
    const delta = deltas[i] || 0;
    const before = after - delta;
    const isWin = i === r.winner;
    const busted = !isWin && after < 0; // 持ち点マイナス＝トビ（撃沈）
    const fillClass = after <= full(i) * 0.25 ? "low" : after <= full(i) * 0.5 ? "mid" : "high";
    const iconUrl = charImages.url(c, "icon") || charImages.url(c, "portrait");
    const face = iconUrl
      ? `<img class="dmg-face" src="${iconUrl}" alt="">`
      : `<div class="dmg-face dmg-face-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
    return `
      <div class="dmg-row ${isWin ? "is-win" : "is-loser"}${busted ? " is-down" : ""}" data-i="${i}" data-before="${before}" data-after="${after}">
        ${face}
        <div class="dmg-info">
          <div class="dmg-name" style="color:${c.color}">${c.name}</div>
          <div class="hpbar">
            <div class="hpfill-ghost" style="width:${pct(before, i)}%"></div>
            <div class="hpfill ${fillClass}" style="width:${pct(before, i)}%"></div>
          </div>
        </div>
        <div class="dmg-hp"><span class="dmg-hp-num">${before}</span></div>
        <div class="dmg-pop ${isWin ? "heal" : "hit"}">${delta > 0 ? "+" : ""}${delta}</div>
        ${busted ? `<div class="dmg-down-stamp">撃沈</div>` : ""}
      </div>`;
  };

  host.innerHTML = `
    <div class="dmg-card">
      <div class="dmg-head">${r.tsumo ? "ツモ和了" : "ロン和了"} — ダメージ</div>
      ${order.map(rowHtml).join("")}
      <div class="dmg-hint">クリックで次へ（10秒で自動）</div>
    </div>`;
  host.classList.remove("hidden");
  requestAnimationFrame(() => host.classList.add("show"));

  // 自キャラ(人間)の立ち絵＋メッセージ。和了したか／被弾したかで台詞を出し分ける。
  // 局に絡んでいない（増減なし）ときは何も言わない。
  const human = game.players[humanIndex];
  const hd = deltas[humanIndex] || 0;
  let spEvent = null, spCtx = null;
  if (r.winner === humanIndex) {
    spEvent = "agari";
    spCtx = { isYakuman: !!r.result.isYakuman, score: r.result.total };
  } else if (hd < 0) {
    spEvent = "damage";
    spCtx = { dmgAmount: Math.abs(hd), hpFrac: human.points / full(humanIndex) };
  }
  if (spEvent) {
    const sp = mountSpeaker(host, human.character, spEvent, spCtx, "left");
    if (sp) host.classList.add("has-speaker");
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(damageFxTimer); damageFxTimer = null;
    host.onclick = null;
    host.classList.remove("show", "ko", "has-speaker");
    host.classList.add("hidden");
    host.innerHTML = "";
    onDone();
  };

  // Beat, then drain everyone's gauge at once.
  setTimeout(() => {
    audio.playSe(sePath("ボウリングのピンを倒す1.mp3"), 0.9);
    host.querySelectorAll(".dmg-row").forEach((row) => {
      const i = +row.dataset.i;
      const before = +row.dataset.before, after = +row.dataset.after;
      const w = pct(after, i) + "%";
      row.querySelector(".hpfill").style.width = w;          // bar snaps toward new HP
      const ghost = row.querySelector(".hpfill-ghost");
      setTimeout(() => { ghost.style.width = w; }, 430);     // chip-damage trail catches up
      row.classList.add("flash");
      const busted = i !== r.winner && after < 0;
      if (i !== r.winner && !busted) row.classList.add("shake");
      row.querySelector(".dmg-pop").classList.add("show");
      tweenNum(row.querySelector(".dmg-hp-num"), before, after, 850);
      // トビ（撃沈）: ゲージが空いた頃を狙ってダウン演出を炸裂させる。
      if (busted) {
        setTimeout(() => {
          row.classList.add("downed");
          const stamp = row.querySelector(".dmg-down-stamp");
          if (stamp) stamp.classList.add("show");
          host.classList.add("ko");
          audio.playSe(sePath("布団に倒れ込む.mp3"), 1.0);
        }, 620);
      }
    });
  }, 300);

  // セリフを読み切れるよう、クリック or 10秒で次へ進む。
  // 直前の「次の局へ」クリックが流れ込んで即スキップするのを防ぐため、
  // クリック受付は少し待ってから有効化する。
  setTimeout(() => { host.onclick = finish; }, 600);
  damageFxTimer = setTimeout(finish, 10000);
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

// 散りばめる煌めき span 群を作る（和了画面・対局終了で共用）。
function sparkleSpans(n = 16) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 100).toFixed(1), y = (Math.random() * 92).toFixed(1);
    const d = (Math.random() * 2.6).toFixed(2), sc = (0.5 + Math.random()).toFixed(2);
    s += `<span class="wspark" style="left:${x}%;top:${y}%;animation-delay:${d}s;--s:${sc}"></span>`;
  }
  return s;
}

// 対局終了: 全画面の最終結果画面。左に優勝者の立ち絵＋王冠、右に順位リスト
// （最終持ち点を HP ゲージで表示）。最下位→1位の順に下から捲り、点数はカウント
// アップ、1位が出る瞬間に優勝者がフラリッシュ。
function showGameOver() {
  clearActions();
  const overlay = el("win-overlay");
  overlay.classList.remove("hidden");
  const ranks = game.rankings();
  const N = ranks.length;
  const champ = ranks[0];
  const top = Math.max(...ranks.map((p) => p.points), 1); // ゲージは首位を満タン基準に
  const reveal = (i) => (N - 1 - i) * 0.45; // 下位ほど先に出る（秒）

  const portraitUrl = charImages.url(champ.character, "portrait");
  const champArt = portraitUrl
    ? `<img class="go-champ-portrait" src="${portraitUrl}" alt="${champ.character.name}">`
    : `<div class="go-champ-portrait go-champ-fb" style="--char-color:${champ.character.color}">${[...champ.character.name][0] || "?"}</div>`;

  const rows = ranks.map((p, i) => {
    const c = p.character;
    const iconUrl = charImages.url(c, "icon") || charImages.url(c, "portrait");
    const face = iconUrl
      ? `<img class="go-face" src="${iconUrl}" alt="">`
      : `<div class="go-face go-face-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
    const w = Math.max(2, Math.min(100, (p.points / top) * 100)); // 長さ＝首位比（順位バー）
    const tier = p.points <= MAX_HP * 0.25 ? "low" : p.points <= MAX_HP * 0.5 ? "mid" : "high"; // 色＝体力
    return `
      <div class="go-rank-row r${i + 1}" style="animation-delay:${reveal(i)}s">
        <div class="go-medal m${i + 1}">${i + 1}</div>
        ${face}
        <div class="go-rank-info">
          <div class="go-rank-name" style="color:${c.color}">${c.name}</div>
          <div class="hpbar go-bar"><div class="hpfill ${tier}" style="width:${w}%"></div></div>
        </div>
        <div class="go-rank-pts" data-pts="${p.points}">0</div>
      </div>`;
  }).join("");

  overlay.innerHTML = `
    <div class="go-screen">
      <div class="win-sparkles">${sparkleSpans(22)}</div>
      <div class="go-banner">対局終了</div>
      <div class="go-champion" style="animation-delay:${reveal(0)}s">
        <div class="go-crown">👑</div>
        ${champArt}
        <div class="go-champ-tag">
          <span class="go-champ-badge">優勝</span>
          <span class="go-champ-name" style="color:${champ.character.color}">${champ.character.name}</span>
        </div>
      </div>
      <div class="go-ranks">${rows}</div>
      <div class="win-buttons go-buttons"></div>
    </div>`;

  // 各行の点数を、行が出るタイミングに合わせて 0 → 最終値へカウントアップ。
  overlay.querySelectorAll(".go-rank-pts").forEach((node, idx) => {
    const pts = +node.dataset.pts;
    setTimeout(() => tweenNum(node, 0, pts, 650), reveal(idx) * 1000 + 240);
  });
  // 1位（最後の捲り）に合わせて祝祭SE。
  setTimeout(() => audio.playSe(sePath("シャキーン1.mp3"), 0.9), reveal(0) * 1000 + 120);

  // 対局終了: 右側の実況ログ欄を片付け、そこへ自キャラの立ち絵＋セリフを出す
  // （順位帯に応じた台詞。順位の捲りが終わってから登場）。
  const human = game.players[humanIndex];
  const hRank = ranks.findIndex((p) => p === human);
  const endLine = pickVoiceLine(human.character.id, "matchEnd", { rankIndex: hRank, numPlayers: N });
  const sideEl = document.querySelector("#game-screen .side");
  if (endLine && sideEl) {
    setTimeout(() => {
      sideEl.classList.add("side-result"); // CSS が ログ/見出し/能力欄を隠す
      const old = sideEl.querySelector(".speaker"); // 連戦などで残っていれば除去
      if (old) old.remove();
      const sp = buildSpeakerEl(human.character, endLine, "side");
      sideEl.appendChild(sp);
      requestAnimationFrame(() => sp.classList.add("show"));
    }, reveal(0) * 1000 + 650);
  }

  overlay.querySelector(".go-buttons").appendChild(mkBtn("もう一度", "btn-tsumo", () => location.reload()));
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

// 自分から見た相対席ラベル（4人: 自分/下家/対面/上家、3人: 対面なし）。
function relSeatLabel(i) {
  const N = game.numPlayers;
  const off = (i - humanIndex + N) % N;
  if (off === 0) return "自分";
  if (N === 3) return off === 1 ? "下家" : "上家";
  return off === 1 ? "下家" : off === 2 ? "対面" : "上家";
}

// 相棒ボード: 実況ログの代わりに、右サイド上部へ4人ぶんのHPバーを縦に詰めて並べる。
// 卓を回る順（自分→下家→対面→上家）に上から並べ、手番のキャラを灯して共在感を出す。
// 各バーにカーソルを合わせると短文紹介がポップ（キャラ選択のホバーと同じ素性紹介）。
function buildHpBoard() {
  const board = el("hp-board");
  if (!board || !game) return;
  board.innerHTML = "";
  const N = game.numPlayers;
  board.classList.toggle("p3", N === 3);
  hpCells = {};
  // 自分起点で卓を回る順に並べ替え（自分→下家→対面→上家）。
  const order = [...game.players.keys()].sort(
    (a, b) => ((a - humanIndex + N) % N) - ((b - humanIndex + N) % N)
  );
  for (const i of order) {
    const c = game.players[i].character;
    const row = document.createElement("div");
    row.className = "hp-row";
    row.style.setProperty("--c", c.color);
    if (i === humanIndex) row.classList.add("is-you");

    // 順位メダル（結果画面の .go-medal と同じ金/銀/銅/灰の意匠）。番号と並び順は
    // 持ち点に応じて updateHpBoard で更新する。
    const rank = document.createElement("div");
    rank.className = "hp-rank";
    row.appendChild(rank);

    const icon = document.createElement("div");
    icon.className = "hp-icon";
    icon.appendChild(makeCharIcon(c));
    row.appendChild(icon);

    const main = document.createElement("div");
    main.className = "hp-main";
    main.innerHTML = `
      <div class="hp-head">
        <span class="hp-rel">${relSeatLabel(i)}</span>
        <span class="hp-name" style="color:${c.color}">${c.name}</span>
        <span class="hp-val"></span>
      </div>
      <div class="hp-gauge"><div class="hp-fill"></div></div>`;
    row.appendChild(main);

    // 短文紹介ポップ（キャラ選択のホバーと同じ bio＋profile）。
    if (c.bio || c.profile) {
      const fl = document.createElement("div");
      fl.className = "hp-flavor";
      fl.innerHTML = `${c.bio ? `<div class="hp-flavor-bio">${c.bio}</div>` : ""}${c.profile ? `<div class="hp-flavor-profile">${c.profile}</div>` : ""}`;
      row.appendChild(fl);
    }

    board.appendChild(row);
    hpCells[i] = { cell: row, rank, fill: main.querySelector(".hp-fill"), val: main.querySelector(".hp-val") };
  }
  buildSelfBustup();
  updateHpBoard();
}

// 右サイド下部の自キャラ・バストアップ（立ち絵）。セリフ枠(#self-talk)の背面に立つ。
function buildSelfBustup() {
  const host = el("self-bustup");
  if (!host || !game) return;
  host.innerHTML = "";
  const c = game.players[humanIndex].character;
  const url = charImages.url(c, "portrait") || c.assets?.portrait;
  if (url) {
    const img = document.createElement("img");
    img.className = "self-portrait";
    img.src = url;
    img.alt = c.name;
    if (c.portraitPos) img.style.objectPosition = c.portraitPos;
    host.appendChild(img);
  } else {
    const fb = document.createElement("div");
    fb.className = "self-portrait self-portrait-fb";
    fb.style.background = c.color;
    fb.textContent = [...c.name][0] || "?";
    host.appendChild(fb);
  }
}

// 相棒ボードのHP値・ゲージ・手番ハイライト・順位を現在のゲーム状態に同期。
// 持ち点の多い順に並べ替え（flex order）、各行へ順位メダル（1位=上）を振る。
function updateHpBoard() {
  if (!hpCells || !game) return;
  // 持ち点降順の順位（同点は players 配列の並びで安定。0=1位）。
  const rankByIndex = {};
  [...game.players.keys()]
    .sort((a, b) => game.players[b].points - game.players[a].points)
    .forEach((pi, rank) => { rankByIndex[pi] = rank; });

  game.players.forEach((p, i) => {
    const ref = hpCells[i];
    if (!ref) return;
    const full = p.character.stats.startingPoints || MAX_HP;
    const pct = Math.max(0, Math.min(100, (p.points / full) * 100));
    ref.fill.style.width = pct + "%";
    ref.fill.className = "hp-fill " + (pct <= 25 ? "low" : pct <= 50 ? "mid" : "high");
    ref.val.textContent = p.points;
    ref.cell.classList.toggle("busted", p.points < 0);
    ref.cell.classList.toggle("is-turn", game.turn === i && game.phase !== Phase.HAND_OVER);
    // 順位＝並び順＋メダル（結果画面の m1..m4 と同じ金/銀/銅/灰）。
    const rank = rankByIndex[i];
    ref.cell.style.order = rank;
    ref.rank.textContent = rank + 1;
    ref.rank.className = "hp-rank m" + (rank + 1);
  });
}

// ---- 局中マイクロ反応: 自分(人間)の状況に合わせた一言をバストアップのセリフ枠に出す ----
// マスタ駆動（characterVoiceMaster の handStart/tenpai/tenpaiDrop/tsumogiriStreak/handStuck/
// handSmooth/lastTiles を pickVoiceLine で解決）。検出は控えめ＝1局の節目だけ拾い、
// グローバルなクールダウンで連発を防ぐ。トリガを足したいときは setupMatchTalk に1ブロック
// 追加し、文言は characterVoiceMaster に並べるだけで増やせる。
let selfTalkTimer = null;
let matchTalk = null; // 1局ぶんの検出ステート（resetMatchTalk で作る）

// セリフ枠にテキストを出して一定時間で引っ込める。空文字/未定義なら何もしない。
function showSelfTalk(text, ms = 4200) {
  const box = el("self-talk");
  if (!box || !text) return false;
  box.textContent = text;
  box.classList.add("show");
  clearTimeout(selfTalkTimer);
  selfTalkTimer = setTimeout(() => box.classList.remove("show"), ms);
  if (matchTalk) matchTalk.lastAt = performance.now();
  return true;
}

// event のセリフを引いて出す（候補なし/対局終了演出中/クールダウン中はスキップ）。
// force=true は節目（聴牌の出入り・局のはじまり）用にクールダウンを無視する。
function fireSelfTalk(event, { force = false } = {}) {
  if (!game || !matchTalk || game.phase === Phase.HAND_OVER) return;
  const COOLDOWN = 5200;
  if (!force && performance.now() - matchTalk.lastAt < COOLDOWN) return;
  const id = game.players[humanIndex].character.id;
  showSelfTalk(pickVoiceLine(id, event, {}));
}

// 人間プレイヤーのシャンテン数（打牌後の13枚で評価する想定）。0=聴牌。
function humanShanten() {
  const p = game.players[humanIndex];
  return shanten(p.counts(), p.numMeldSets());
}

// 1局ぶんの検出ステートを初期化。
function resetMatchTalk() {
  matchTalk = {
    lastAt: -1e9,     // 直近にセリフを出した時刻（クールダウン用）
    prevShanten: 6,   // 直近の自分シャンテン
    discards: 0,      // この局の自分の打牌数
    lastImprove: 0,   // 最後にシャンテンが進んだ打牌番号
    improveRun: 0,    // 連続でシャンテンが進んだ回数
    tsumogiri: 0,     // 連続ツモ切り数
    wasTenpai: false, // 直前まで聴牌していたか
    saidStuck: false, // 手詰まりセリフを今局すでに出したか
    saidLast: false,  // 流局間際セリフを今局すでに出したか
  };
}

// 対局のイベントに検出を配線（beginGame から一度だけ）。
function setupMatchTalk(g) {
  resetMatchTalk();

  // 局のはじまり：配牌直後に一言（シャッフルSEと被らないよう少し遅らせる）。
  g.bus.on(Events.HAND_STARTED, () => {
    resetMatchTalk();
    matchTalk.prevShanten = humanShanten(); // 配牌時のシャンテンを基準に
    setTimeout(() => fireSelfTalk("handStart", { force: true }), 1200);
  });

  // 自分の打牌ごとに、ツモ切り連続・聴牌の出入り・進行の速さ/詰まりを見る。
  g.bus.on(Events.TILE_DISCARDED, ({ player, tile }) => {
    if (!player.isHuman || !matchTalk) return;
    matchTalk.discards++;

    // ツモ切り連続（3連続でぼやく。閾値未満に戻るまで再発火しない）。
    if (tile?.tsumogiri) {
      matchTalk.tsumogiri++;
      if (matchTalk.tsumogiri === 3) fireSelfTalk("tsumogiriStreak");
    } else {
      matchTalk.tsumogiri = 0;
    }

    // 打牌後（13枚）のシャンテンで聴牌の出入りと進行を判定。
    const sh = humanShanten();
    if (!matchTalk.wasTenpai && sh === 0) { matchTalk.wasTenpai = true; fireSelfTalk("tenpai", { force: true }); }
    else if (matchTalk.wasTenpai && sh > 0) { matchTalk.wasTenpai = false; fireSelfTalk("tenpaiDrop", { force: true }); }

    if (sh < matchTalk.prevShanten) {
      matchTalk.improveRun++;
      matchTalk.lastImprove = matchTalk.discards;
      // 連続で手が進んだ＝さくさく（聴牌セリフと被らないよう sh>=1 のときだけ）。
      if (matchTalk.improveRun >= 2 && sh >= 1) fireSelfTalk("handSmooth");
    } else {
      matchTalk.improveRun = 0;
      // しばらく進まず、まだ遠い → 手詰まり（1局1回）。
      if (!matchTalk.saidStuck && matchTalk.discards - matchTalk.lastImprove >= 4 && sh >= 2) {
        matchTalk.saidStuck = true;
        fireSelfTalk("handStuck");
      }
    }
    matchTalk.prevShanten = sh;
  });

  // 流局間際：山が残りわずかになったら一度だけ。
  g.bus.on(Events.TILE_DRAWN, () => {
    if (!matchTalk || matchTalk.saidLast) return;
    if (g.wall.liveRemaining <= 6) { matchTalk.saidLast = true; fireSelfTalk("lastTiles"); }
  });
}

initStage(); // fixed 1280x720 stage, scaled to fit the window (letterboxed)
buildSelectScreen();
bootHome();
