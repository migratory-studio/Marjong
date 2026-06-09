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
import { initStage, clientToLocalFrac } from "./app/stage.js";
import { playScenario } from "./scenario/scenarioPlayer.js";
import { LocalProfileRepository } from "./progression/localProfileRepository.js";
import { activeAvatar, avatarParams6 } from "./progression/avatarFactory.js";
import { showAvatarCreate } from "./screens/avatarCreateScreen.js";
import { showAvatarDetail } from "./screens/avatarDetailScreen.js";
import { showMentorHome } from "./screens/mentorHomeScreen.js";
import { showRest } from "./screens/restScreen.js";
import { showGrowth } from "./screens/growthScreen.js";
import { showAbilityChange } from "./screens/abilityChangeScreen.js";
import { showScenarioList, scenariosForMentor } from "./screens/scenarioListScreen.js";
import { markScenarioRead } from "./progression/scenarioService.js";
import { showMatchIntro } from "./screens/matchIntroScreen.js";
import { showAutoBattle } from "./screens/autoBattleScreen.js";
import { skillTemplateById } from "./data/skillTemplateMaster.js";
import { presetById } from "./data/avatarPresetMaster.js";
import { dayInfo, CONDITIONS, parlorState, visitParlor, applyHonestResult, applyDuoResult, tournamentGate, applyLeagueResult } from "./progression/progressionService.js";
import { tournamentRunConfig, oppHpForLv } from "./data/tournamentMaster.js";
import { nextTreasureStep } from "./data/mentorCampaignMaster.js";
import { MeldType } from "./core/meld.js";
import { kindLabel } from "./core/tiles.js";
import { waits } from "./core/rules/winCheck.js";
import { shanten } from "./core/rules/shanten.js";
import { pickVoiceLine } from "./data/voiceLines.js";
import { makeMobRoster, mobSilhouettePaths } from "./data/mobMaster.js";
import { rivalUnits } from "./data/tournamentRivalMaster.js";
import { isDebugMode } from "./app/debug.js";

const CPU_DELAY = 650; // ms between CPU actions (visualisation)

// 対局ごとのセリフセット。シナリオ戦が指定すると、その対局中の全セリフ解決で
// ctx.voiceSet として参照され、一致する専用セリフを解放する（未指定なら通常のみ）。
// pendingVoiceSet を beginGame 直前にセットすると次の対局に適用される。
let activeVoiceSet = null;
let pendingVoiceSet = null;
// セリフ解決の共通入口。activeVoiceSet を ctx に注入してから pickVoiceLine を呼ぶ。
// 呼び出し側 ctx が voiceSet を明示していればそちらを優先。
function vline(charId, event, ctx = {}) {
  return pickVoiceLine(charId, event, { voiceSet: activeVoiceSet, ...ctx });
}
// シナリオ戦などが「次の対局のセリフセット」を仕込む入口。beginGame がこれを
// activeVoiceSet に確定する。例: setPendingVoiceSet("shugyo") → 二人麻雀を開始。
// 将来のシナリオ・バトルノードはここを呼んでから対局を起動すればよい。
function setPendingVoiceSet(v) { pendingVoiceSet = v || null; }
if (typeof window !== "undefined") window.__setVoiceSet = setPendingVoiceSet;

const el = (id) => document.getElementById(id);
// HTML 差し込み用の最小エスケープ（モブ名・マイキャラ名など）。
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 得点推移（各局はじまりの全員の持ち点）。beginGame でリセット、対局終了で終局を足してグラフ表示。
let scoreHistory = [];
let game, renderer, humanIndex = 0;
let hpCells = null; // 相棒ボード（右側HP表示）の playerIndex -> セル参照マップ
const tileImages = new TileImages();
const charImages = new CharacterImages();
const audio = new AudioManager();
tileImages.load(); // preload in background; renderer falls back until ready
charImages.load(CHARACTERS); // icons/portraits; null fallback until present
// モブのシルエット10枚も先読み（CHARACTERS には入れないので別途プリロード）。
charImages.load(mobSilhouettePaths().map((p) => ({ assets: { icon: p, portrait: p } })));
let selectedCharId = null;
let selectedRounds = 1; // 1 = 東風戦, 2 = 半荘戦
let selectedPlayers = 4; // 4 = 四人麻雀, 3 = 三人麻雀(三麻)
// CPU相手の指名。席オフセット(0=CPU①…2=CPU③)ごとのキャラID。null は「おまかせ
// (ランダム)」で従来挙動。最大3席ぶん保持し、人数に応じて先頭から使う。
let cpuPicks = [null, null, null];
// ロスターのカードをクリックしたとき埋める席。0=あなた, 1..=CPU席。
let activeSeat = 0;
let selectedTeamBattle = false; // 団体戦モードが選択されているか
let selectedTeamCount = 4;      // 団体戦のチーム数（= 卓人数）
let teamBattleData = null;       // 団体戦中のチーム/メンバー状態。null = 通常対戦
let teamHpCells = null;          // 団体戦HPボードのDOM参照マップ
let selectedPairBattle = false;  // ペア戦モードが選択されているか
let pairBattleData = null;       // ペア戦中の状態（独立新モード）。null = 非ペア戦
let pairHpCells = null;          // ペア戦HPボードのDOM参照マップ
let pendingCpuCallDecisions = null; // cached while waiting on human call
let riichiMode = false;
let recallMode = false; // リコール・ディール: 自分の河の牌を選択中
let janeDoeMode = false; // 強制ツモ切り: 対象の相手を選択中
let kakehaMode = false; // 大博打: 賭け金（5000/10000）を選択中
let noNaki = false; // 鳴きなし: when on, auto-skip pon/chi/kan for the human (ron still offered)
let autoPlay = false; // オート観戦: when on, the human seat is driven by the CPU AI (free matches only)
let cpuActionPending = false; // CPU/オートの打牌を setTimeout 済み。loop() の二重キック防止ガード
let meldCalledFlag = false; // set by MELD_CALLED listener during a resolveCalls
let abilityCutInFlag = false; // set by ABILITY_USED listener; CPU loop waits on it
const NAKI_WAIT = 1100; // ms pause to show the naki call banner
const ABILITY_CUTIN_WAIT = 1700; // ms pause so the ability cut-in plays out

// ----------------------------------------------------------------- select UI
// Build a character icon element. Uses the master's declared icon path directly
// (independent of preload state) and degrades to a color block if it fails.
function makeCharIcon(c) {
  const path = c.assets?.icon;
  // モブは全身シルエットなので、丸アイコンには頭部だけをズームクロップして収める
  // （object-fit:cover ではズームできないため background 方式。crop は .is-mob-face）。
  if (path && c.isMob) {
    const div = document.createElement("div");
    div.className = "char-icon is-mob-face";
    div.style.setProperty("--mob-sil", `url("${path}")`);
    return div;
  }
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

// 丸顔アイコンの innerHTML 片を返す（被ダメ表示/結果画面などの文字列組み立て用）。
// モブは全身シルエットなので頭部ズームクロップの div（.is-mob-face）を返す。url が無ければ
// null を返し、呼び出し側のフォールバック表示に委ねる。
function faceMarkup(c, cls, url) {
  if (!url) return null;
  if (c.isMob) return `<div class="${cls} is-mob-face" style="--mob-sil:url('${url}')"></div>`;
  return `<img class="${cls}" src="${url}" alt="">`;
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

// ---- 周回ゲージ（点数がHP満タン=初期持ち点を超えたとき、2週目以降を重ねて見せる）----
// 1週目は通常色(low/mid/high)。2週目=ゴールド固定。3週目以降は色を変えて周回継続。
const LAP1_FULL = "linear-gradient(90deg,#3ddc97,#66e6a8)"; // 1週目を満タン表示するときの緑(high相当)
const LAP_COLORS = [
  "linear-gradient(90deg,#ffcb3d,#ffe487)", // 2週目: ゴールド
  "linear-gradient(90deg,#4dd0e1,#8af0fb)", // 3週目: シアン
  "linear-gradient(90deg,#c77dff,#e7c2ff)", // 4週目: パープル
  "linear-gradient(90deg,#ff7d9d,#ffc0cd)", // 5週目: ローズ
];
// n週目(2..)の固定色。5週目以降はパレットを巡回。
const lapColor = (n) => LAP_COLORS[(n - 2 + LAP_COLORS.length * 99) % LAP_COLORS.length];
// 完了済み周回(prev)を満タン表示するときの色。1週目完了=緑、以降は各周回色。
const lapBaseColor = (prev) => (prev <= 1 ? LAP1_FULL : lapColor(prev));

// points を「周回ゲージ」状態へ分解する。
//   lap     … 現在伸びている周回 (1=1週目)。
//   fillPct … 現在の周回の伸び (0..100)。
//   basePct … 完了済み周回ぶんのベース幅 (lap>=2 で 100)。
function lapState(points, full) {
  if (!(full > 0) || points <= 0) {
    return { lap: 1, fillPct: Math.max(0, (points / (full || 1)) * 100), basePct: 0 };
  }
  const completed = Math.floor(points / full);
  const frac = points / full - completed;
  const lap = frac === 0 ? completed : completed + 1; // 丁度の倍数はその周回が満タン
  return { lap, fillPct: frac === 0 ? 100 : frac * 100, basePct: lap >= 2 ? 100 : 0 };
}

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
const TEAM_MARKS = ["①", "②", "③"]; // 団体戦メンバー番号

function buildSelectScreen() {
  const list = el("char-list");
  list.innerHTML = "";
  const selectedChar = () => CHARACTERS.find((c) => c.id === selectedCharId) || null;
  // ロスターのカードをキャラID で引けるようにして、席割りの選択ハイライトを更新できる。
  const cardById = new Map();

  // どのキャラがどの席に着いているかのラベル（"あなた"/①②③）。未着席は null。
  // 現在の人数を超える席に残った指名は無視する（人数を減らしたときの保険）。
  const seatLabelOf = (id) => {
    if (selectedTeamBattle) {
      if (selectedCharId === id) return `メンバー${TEAM_MARKS[0]}`;
      if (cpuPicks[0] === id) return `メンバー${TEAM_MARKS[1]}`;
      if (cpuPicks[1] === id) return `メンバー${TEAM_MARKS[2]}`;
      return null;
    }
    if (selectedPairBattle) {
      if (selectedCharId === id) return "あなた";
      if (cpuPicks[0] === id) return "相方";
      return null;
    }
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
    const numSlots = selectedTeamBattle ? 3 : selectedPairBattle ? 2 : selectedPlayers;
    for (let step = 1; step <= numSlots; step++) {
      const s = (activeSeat + step) % numSlots;
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
    const isTeamMode = selectedTeamBattle;
    const isHuman = isTeamMode ? true : s === 0; // 団体戦はすべて自チームスロット
    const charId = s === 0 ? selectedCharId : cpuPicks[s - 1];
    const ch = charId ? CHARACTERS.find((c) => c.id === charId) : null;
    const chip = document.createElement(interactive ? "button" : "div");
    if (interactive) chip.type = "button";
    chip.className = "seat-chip" + (interactive && s === activeSeat ? " active" : "") + (interactive ? "" : " static");
    const role = document.createElement("span");
    role.className = "seat-role";
    role.textContent = isTeamMode ? `メンバー${TEAM_MARKS[s]}`
      : selectedPairBattle ? (s === 0 ? "あなた" : "相方")
      : (s === 0 ? "あなた" : `CPU${SEAT_MARKS[s - 1]}`);
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
      // 通常モードのCPU席のみ「おまかせに戻す」ボタンを表示
      if (!isTeamMode && !isHuman && ch) {
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
      const numSlots = selectedTeamBattle ? 3 : selectedPairBattle ? 2 : selectedPlayers;
      for (let s = 0; s < numSlots; s++) bar.appendChild(makeSeatChip(s, true));
      if (!selectedTeamBattle && !selectedPairBattle) {
        const all = document.createElement("button");
        all.type = "button";
        all.className = "seat-allrandom";
        all.textContent = "全員おまかせ";
        all.title = "CPU相手をすべてランダムに戻す";
        all.onclick = () => { audio.playClick?.(); cpuPicks = [null, null, null]; refreshAll(); };
        bar.appendChild(all);
      }
    }
    const prev = el("seat-preview");
    if (prev) {
      prev.innerHTML = "";
      if (!selectedTeamBattle && !selectedPairBattle) {
        for (let s = 0; s < selectedPlayers; s++) prev.appendChild(makeSeatChip(s, false));
      }
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
  const teamSlotsFilled = () => !!(selectedCharId && cpuPicks[0] && cpuPicks[1]);
  const canReach = (step) => {
    if (step <= 2) return true;
    return selectedTeamBattle ? teamSlotsFilled() : !!selectedCharId;
  };

  // 下部ナビ（戻る/次へ/開始）の表示と活性をステップに合わせる。
  function updateWizNav() {
    const back = el("wiz-back"), next = el("wiz-next"), start = el("start-btn");
    if (!back || !next || !start) return;
    back.classList.toggle("hidden", wizStep === 1);
    next.classList.toggle("hidden", wizStep === 3);
    start.classList.toggle("hidden", wizStep !== 3);
    next.disabled = wizStep === 2 && !canReach(3);
    // デバッグボタンは step3 かつデバッグモードのときだけ（start と並べる）。
    const dbg = el("debug-mob-btn");
    if (dbg) dbg.classList.toggle("hidden", !(wizStep === 3 && isDebugMode()));
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
    if (selectedTeamBattle) {
      box.innerHTML = `<div class="sum-line"><span class="sum-k">対戦形式</span><span class="sum-v">団体戦 ${selectedTeamCount}チーム</span></div>`;
      [selectedCharId, cpuPicks[0], cpuPicks[1]].forEach((id, i) => {
        line(`メンバー${TEAM_MARKS[i]}`, id ? CHARACTERS.find((c) => c.id === id) : null, "未選択");
      });
      const cpuRow = document.createElement("div");
      cpuRow.className = "sum-line";
      cpuRow.innerHTML = `<span class="sum-k">相手チーム</span><span class="sum-v sum-random">${selectedTeamCount - 1}チーム（ランダム）</span>`;
      box.appendChild(cpuRow);
      return;
    }
    if (selectedPairBattle) {
      box.innerHTML = `<div class="sum-line"><span class="sum-k">対戦形式</span><span class="sum-v">ペア戦（2対2）</span></div>`;
      line("あなた", selectedChar(), "未選択");
      line("相方", cpuPicks[0] ? CHARACTERS.find((c) => c.id === cpuPicks[0]) : null, "おまかせ（ランダム）");
      const cpuRow = document.createElement("div");
      cpuRow.className = "sum-line";
      cpuRow.innerHTML = `<span class="sum-k">相手ペア</span><span class="sum-v sum-random">2人（ランダム）</span>`;
      box.appendChild(cpuRow);
      return;
    }
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
  // デバッグ専用: 選択キャラ vs モブ3体で即開戦。?debug=合言葉 のときだけ出す。
  const debugMobBtn = el("debug-mob-btn"); // 表示制御は updateWizNav 側（step3×デバッグ時）
  if (debugMobBtn) debugMobBtn.onclick = () => { audio.playClick?.(); startDebugMobMatch(); };
  // ステップ見出しをクリックして到達済みステップへジャンプ（前進は条件を満たす時のみ）。
  for (const li of document.querySelectorAll("#wiz-steps .wiz-step")) {
    li.onclick = () => { audio.playClick?.(); gotoStep(Number(li.dataset.step)); };
  }
  // 対戦形式（通常 / ペア戦 / 団体戦）トグル。
  const battleModeToggle = el("battle-mode-toggle");
  for (const btn of battleModeToggle.querySelectorAll(".mode-btn")) {
    btn.onclick = () => {
      const mode = btn.dataset.battle; // "normal" | "pair" | "team"
      selectedTeamBattle = mode === "team";
      selectedPairBattle = mode === "pair";
      battleModeToggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      el("normal-table-opts").classList.toggle("hidden", selectedTeamBattle || selectedPairBattle);
      el("pair-table-opts").classList.toggle("hidden", !selectedPairBattle);
      el("team-table-opts").classList.toggle("hidden", !selectedTeamBattle);
      if (selectedTeamBattle) {
        selectedPlayers = selectedTeamCount;
        // 団体戦では cpuPicks[0,1] を自チームメンバー枠として使う。既存CPU指名はクリア。
        cpuPicks = [null, null, null];
        activeSeat = 0;
      } else if (selectedPairBattle) {
        selectedPlayers = 4; // 卓は4席（2ペア×2）
        // ペア戦では cpuPicks[0] を相方枠として使う。既存CPU指名はクリア。
        cpuPicks = [null, null, null];
        activeSeat = 0;
      }
      refreshAll();
    };
  }

  // チーム数トグル（団体戦時のみ表示）。
  const teamCountToggle = el("team-count-toggle");
  for (const btn of teamCountToggle.querySelectorAll(".mode-btn")) {
    btn.onclick = () => {
      selectedTeamCount = Number(btn.dataset.teams);
      selectedPlayers = selectedTeamCount;
      teamCountToggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      refreshAll();
    };
  }

  // select-screen を開くたびに①へ戻し、アクティブ席を「あなた」へ戻す（goScreen から呼ぶ）。
  resetSelectWizard = () => {
    activeSeat = 0;
    // 対戦形式を通常に戻す
    selectedTeamBattle = false;
    selectedPairBattle = false;
    selectedTeamCount = 4;
    selectedPlayers = 4;
    battleModeToggle.querySelectorAll(".mode-btn").forEach((b) =>
      b.classList.toggle("selected", b.dataset.battle === "normal"));
    el("normal-table-opts").classList.remove("hidden");
    el("pair-table-opts").classList.add("hidden");
    el("team-table-opts").classList.add("hidden");
    gotoStep(1);
  };
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
  "mentor-home-screen": () => audio.playMentorBgm(),
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
      // 作成完了で師弟シナリオ第1章を自動再生 → 読了後に師弟ホームへ。
      onCreated: (_saved, avatar) => playFirstChapterThenHome(avatar),
    });
    goScreen("avatar-create-screen");
  }
}

// マイキャラ作成直後、その師匠の第1章（sortOrder 先頭・unlock=always）を自動再生する。
function playFirstChapterThenHome(avatar) {
  const first = scenariosForMentor(avatar?.mentorCharacterId)[0];
  if (!first) { openMentorHome(); return; }
  showScreen("scenario-screen");
  playScenario(first.scenarioId, {
    audio,
    onEnd: async () => {
      const fresh = await profileRepo.loadProfile();
      const res = markScenarioRead(fresh, first); // 既読化＋初回ソウル
      if (res.firstRead) await profileRepo.saveProfile(res.profile);
      openMentorHome();
    },
  });
}

// 師弟ホーム（ハブ）。休憩 / 育成 / 能力変更 / マイキャラへ振り分ける（Phase 2B）。
// 各サブ画面は自前で profile を読み込み、戻ると師弟ホームが再読込で最新値を反映する。
function openMentorHome(flash = null) {
  showMentorHome(el("mentor-home-screen"), {
    repository: profileRepo,
    onBack: () => navigate("home"),
    onNavigate: (target, payload) => openMentorSub(target, payload),
    flash, // 戻り時に出すリザルト等（例: 雀荘巡りの結果）
    audio, // 能力値上昇カウントのSE等
  });
  goScreen("mentor-home-screen");
}

// オートバトル起動の共通化（デバッグ起動・雀荘巡りで共用）。
function launchAutoBattle(profile, { oppLv, oppHpMax, maxMatches, seed = Date.now(), onExit, completeLabel }) {
  const av = activeAvatar(profile);
  const abilityName = skillTemplateById(av?.skillTemplateId)?.name || "能力発動";
  const standingSrc = presetById(av?.presetIds?.standing)?.assetPath || "";
  const di = dayInfo(profile);
  const condition = CONDITIONS[di.condition];
  showAutoBattle(el("autobattle-screen"), {
    self: avatarParams6(av),
    avatar: av,
    hp: av?.avatarHpCurrent ?? 5500,
    hpMax: av?.avatarHpMax ?? 5500,
    oppLv,
    oppHpMax,
    maxMatches,
    completeLabel,
    seed,
    onExit,
    audio,
    abilityName,
    standingSrc,
    conditionBias: condition.bias,
    conditionLabel: condition.label,
    conditionTone: condition.tone,
  });
  goScreen("autobattle-screen");
}

// ── 本気対局（Phase 4A・§4.6.9）。既存 beginGame を流用する“橋”。──
let honestCtx = null; // 本気対局中の文脈（{ onResult } 等）。null＝通常（フリー対戦）。
let honestAutoPlay = false; // 本気タイマンを「オート（AI自動打ち）」で始めるか。beginGame が消費。
// マイキャラを対局エンジン用の character へ変換（立ち絵/能力を載せる）。
function avatarToCharacter(avatar, startPoints = 25000) {
  const icon = presetById(avatar?.presetIds?.icon)?.assetPath || "";
  const portrait = presetById(avatar?.presetIds?.standing)?.assetPath || "";
  const abilityId = skillTemplateById(avatar?.skillTemplateId)?.runtimeAbilityId;
  return {
    id: avatar?.avatarId || "deshi",
    name: avatar?.name || "弟子",
    reading: "", color: "#e0b85a", role: "attacker", bio: "",
    profile: avatar?.profileText || "",
    stats: { startingPoints: startPoints }, // 単発＝25000／大会＝runHp 持ち越し（§4.6.9/§14.3）
    assets: { icon, portrait, voices: {} },
    abilities: abilityId ? [{ abilityId, params: {} }] : [],
  };
}
// 師匠タイマン（二人打ち）の師匠 HP。師匠は格上：フリー対戦のHP（キャラ既定 startingPoints）を初期値に、
// 師弟シナリオの進み具合（既読話数）で強化していく。弟子は自分の HP を賭けるので最初は大きな格差になる。
// （覇道編以降の「一緒に育成＝共闘」はペア/団体大会＝詩玥＋弟子 で表現。）
const MENTOR_DUO_HP_PER_SCENARIO = 1500; // 既読1話ごとに師匠HP+（チューニング）
const MENTOR_DUO_HP_CAP_READS = 24;      // 強化の上限話数
function mentorDuoHp(mentorChar, profile) {
  const base = mentorChar?.stats?.startingPoints || 25000; // フリー対戦のHP＝初期状態（格上）
  const read = Math.min(MENTOR_DUO_HP_CAP_READS, (profile?.scenarioProgress || []).length);
  return base + read * MENTOR_DUO_HP_PER_SCENARIO;
}

// 本気対局を起動。config: { avatar, opponents:[character], rounds, players, voiceSet, startPoints, onResult(result, action) }
async function launchHonestMatch(config) {
  honestCtx = config;
  honestAutoPlay = !!config.autoPlay; // 「オート」起動なら beginGame が autoPlay=ON にする
  teamBattleData = null; pairBattleData = null; humanIndex = 0;
  selectedRounds = config.rounds || 1;
  selectedPlayers = config.players || (1 + (config.opponents?.length || 3));
  const deshi = avatarToCharacter(config.avatar, config.startPoints);
  const order = [deshi, ...(config.opponents || [])];
  const seated = order.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  await charImages.load([deshi]); // 弟子の立ち絵/アイコンを描画キャッシュへ
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  if (config.voiceSet) setPendingVoiceSet(config.voiceSet);
  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated, humanIndex,
    mode: { rounds: selectedRounds, players: selectedPlayers },
    dealerIndex, audio,
    tournament: config.tournamentInfo || null,
    onComplete: () => beginGame(seated, dealerIndex),
  });
}

// 大会（M リーグ制）。リーグは常に「8ユニット」で競う：個人=8人 / ペア=8ペア(16人) / 団体=8チーム(24人)。
// 毎節は卓に unitsAtTable ユニットが着き（弟子は必ず参加）、残りは別卓扱い（擬似結果）で累積に反映。
// 全 N 節の累積ポイント1位（ユニット単位）で優勝＝宝獲得。
let tournamentRun = null; // { t, matchIndex, units, totals, names, deshiUnitId, seatedUnitIds }

// 団体戦の弟子チームの“仲間”（師匠以外の3人目）。正典準拠（ビビ＝焔）＋他は妥当な補完。
const ALLY_BY_MENTOR = { bibi: "homura", shiyue: "mamori", kakeha_ruina: "doranie" };
// 対局用に持ち点（startingPoints）を上書きしたキャラの複製を返す。
function asMatchChar(char, points) {
  return { ...char, stats: { ...(char?.stats || {}), startingPoints: points } };
}
// 弟子ユニットを編成する（個人=弟子のみ / ペア=弟子＋師匠 / 団体=弟子＋師匠＋仲間）。
// 持ち点＝HP：弟子ユニットは育成した HP（avatarHpMax）で打つ＝育成成果が大会の持ち点に直結。
function buildDeshiUnit(av, mentorId, format, unitSize) {
  const hp = av.avatarHpMax || 25000;
  const members = [avatarToCharacter(av, hp)];
  if (unitSize >= 2) {
    const mentor = CHARACTERS.find((c) => c.id === mentorId) || CHARACTERS[0];
    members.push(asMatchChar(mentor, hp));
  }
  if (unitSize >= 3) {
    const allyId = ALLY_BY_MENTOR[mentorId] || CHARACTERS.find((c) => c.id !== mentorId)?.id;
    const ally = CHARACTERS.find((c) => c.id === allyId) || CHARACTERS[1];
    members.push(asMatchChar(ally, hp));
  }
  return { id: av.avatarId, name: av.name, isDeshi: true, isRival: false, members };
}
// この節に着卓するユニットを選ぶ（弟子は必ず含み、他ユニットはローテーションで入れ替わる）。
function seatUnitsFor(units, matchIndex, count) {
  const deshi = units.find((u) => u.isDeshi);
  const others = units.filter((u) => !u.isDeshi);
  const need = Math.max(0, count - 1);
  let pick;
  if (others.length <= need) pick = others.slice(0, need);
  else { pick = []; for (let k = 0; k < need; k++) pick.push(others[(matchIndex * need + k) % others.length]); }
  return [deshi, ...pick];
}
// 卓に居ないユニットの「1節ぶん」擬似ポイント（別卓の結果）。実リーグの分布に寄せ、ネームドは少し強気。
function simAbsentLeaguePt(uma, isNamed, rng = Math.random) {
  const base = uma[Math.floor(rng() * uma.length)] ?? 0; // ランダム着順のウマ
  const soten = Math.round((rng() * 2 - 1) * 16);        // 素点ゆらぎ ±16
  return base + soten + (isNamed ? 4 : 0);
}

const UNIT_WORD = { solo4: "人", solo3: "人", pair: "ペア", team: "チーム", final: "人" };

async function openTournament() {
  const profile = await profileRepo.loadProfile();
  const av = activeAvatar(profile);
  // キャンペーン順で「次に挑む宝」を決める（記録済みの宝はスキップ）。
  const step = nextTreasureStep(av?.mentorCharacterId, profile.records?.treasures || []);
  if (!step) { openMentorHome({ tournamentGate: { name: "九蓮宝士", tierLabel: "九つの宝、すべて制覇！" } }); return; }
  const t = tournamentRunConfig(step.id, { oppLv: step.oppLv, finalFormat: step.finalFormat });
  const gate = tournamentGate(profile, t);
  if (!gate.ok) { openMentorHome({ tournamentGate: { name: t.name, tierLabel: gate.tier.label } }); return; }
  // 弟子ユニット＝育成HP / ライバルユニット＝oppLv連動HP（難易度）。計 unitCount＝8。
  const deshiUnit = buildDeshiUnit(av, av.mentorCharacterId, t.format, t.unitSize);
  const oppHp = oppHpForLv(t.gateOppLv ?? t.rivalLv ?? 2);
  const rUnits = rivalUnits(t.id, t.tier, t.unitCount, t.unitSize, { seedPrefix: "league", startingPoints: oppHp });
  const units = [deshiUnit, ...rUnits];
  // 各ユニットの「開始持ち点」（メンバーHPの合計）。採点の素点＝(最終−開始) の基準。
  const unitStart = {};
  for (const u of units) unitStart[u.id] = u.members.reduce((a, m) => a + (m?.stats?.startingPoints || 0), 0);
  // 開幕前に大会要項（ルール・優勝条件・ライバル紹介）の専用画面をはさむ（じっくり演出・#2）。
  showTournamentBriefing(t, rUnits, () => {
    const totals = {}; const names = {};
    for (const u of units) { totals[u.id] = 0; names[u.id] = u.name; }
    tournamentRun = { t, matchIndex: 0, units, totals, names, deshiUnitId: deshiUnit.id, unitStart };
    playTournamentMatch();
  }, () => openMentorHome());
}

// 大会 要項画面（開幕前）。ルール・優勝条件・ライバル紹介を“じっくり”見せてから挑む（#2）。
function showTournamentBriefing(t, rUnits, onStart, onCancel) {
  const host = el("app") || document.body;
  const FMT = { solo4: "個人戦・四人打ち", solo3: "個人戦・三人打ち", pair: "ペア戦・2対2", team: "団体戦・チーム対抗", final: "最終決戦" };
  const word = UNIT_WORD[t.format] || "人";
  const umaStr = (t.uma || []).map((u) => (u > 0 ? "+" : "") + u).join(" / ");
  // ライバル紹介：名のある代表を最大4枚まで1枚ずつ、それ以外（多すぎる分＋無名）は1行に集約
  //（固定ステージに収めるため縦に伸ばさない・QA無スクロール）。
  const MAX_NAMED_CARDS = 4;
  const namedR = rUnits.filter((u) => u.isRival);
  const mobR = rUnits.filter((u) => !u.isRival);
  const shown = namedR.slice(0, MAX_NAMED_CARDS);
  const folded = namedR.length - shown.length + mobR.length; // 残りネームド＋無名
  const memberNote = t.unitSize > 1 ? `<span class="tb-rival-mem">＋仲間${t.unitSize - 1}</span>` : "";
  const namedCards = shown.map((u) => `
      <div class="tb-rival named">
        <div class="tb-rival-art" style="${u.lead?.assets?.portrait ? `--art:url('${u.lead.assets.portrait}')` : `background:${u.color}`}"></div>
        <div class="tb-rival-info">
          <div class="tb-rival-name" style="color:${u.color}">${esc(u.name)}${memberNote}</div>
          ${u.rivalTitle ? `<div class="tb-rival-title">${esc(u.rivalTitle)}</div>` : ""}
          ${u.introLine ? `<div class="tb-rival-line">「${esc(u.introLine)}」</div>` : ""}
        </div>
      </div>`).join("");
  const mobSummary = folded > 0 ? `
      <div class="tb-rival tb-mobsum">
        <div class="tb-rival-art" style="background:${(mobR[0] || namedR[namedR.length - 1])?.color || "#555"}"></div>
        <div class="tb-rival-info">
          <div class="tb-rival-name">ほか ${folded} ${word}</div>
          <div class="tb-rival-title tb-mob">${mobR.length ? "名もなき打ち手たち" : "手練れたち"}</div>
        </div>
      </div>` : "";
  const rivalCards = namedCards + mobSummary;
  const ov = document.createElement("div");
  ov.className = "tourney-brief";
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="tb-card">
      <div class="tb-head">
        <div class="tb-cup">CUP</div>
        <div class="tb-head-txt">
          <div class="tb-name">${esc(t.name)}</div>
          <div class="tb-tier">${esc(FMT[t.format] || "")}　・　ティア ${t.tier}</div>
        </div>
      </div>
      <div class="tb-treasure">
        <div class="tb-tre-mark">宝</div>
        <div class="tb-tre-txt"><b>${esc(t.treasure?.name || "")}</b><small>${esc(t.treasure?.reading || "")}</small><div class="tb-tre-sym">${esc(t.treasure?.symbol || t.treasure?.baseYaku || "")}</div></div>
      </div>
      <div class="tb-rules">
        <div class="tb-rule"><span class="tb-rk">出場</span><span class="tb-rv"><b>${t.entrants} 名</b>（${t.unitCount} ${word}／毎節 ${t.unitsAtTable} ${word}が対戦）</span></div>
        <div class="tb-rule"><span class="tb-rk">持ち点</span><span class="tb-rv"><b>＝HP</b>（あなたは育成したHPで打つ・相手は格上ほど分厚い／節ごと回復・トビても脱落なし）</span></div>
        <div class="tb-rule"><span class="tb-rk">順位点</span><span class="tb-rv">ウマ ${umaStr}（その節の<b>増減（稼ぎ）</b>で順位）</span></div>
        <div class="tb-rule"><span class="tb-rk">優勝条件</span><span class="tb-rv">全 ${t.matches} 節の<b>累積ポイント1位</b>で『${esc(t.treasure?.name || "宝")}』獲得</span></div>
      </div>
      <div class="tb-rivals-head">立ちはだかる者たち（${rUnits.length} ${word}）</div>
      <div class="tb-rivals">${rivalCards}</div>
      <div class="tb-btns"></div>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = (go) => { ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 180); go ? onStart() : onCancel(); };
  const btns = ov.querySelector(".tb-btns");
  btns.appendChild(mkBtn("やめておく", "btn-ron", () => close(false)));
  btns.appendChild(mkBtn("この卓に挑む", "btn-tsumo", () => close(true)));
}

async function playTournamentMatch() {
  const run = tournamentRun; const t = run.t;
  const section = `第 ${run.matchIndex + 1} / ${t.matches} 節`;
  const seated = seatUnitsFor(run.units, run.matchIndex, t.unitsAtTable);
  run.seatedUnitIds = seated.map((u) => u.id);
  const tournamentInfo = { name: t.name, section, treasureName: t.treasure?.name || "", tier: t.tier, entrants: t.entrants };
  const ctx = { tournament: true, tournamentInfo, matchLabel: section, rounds: t.rounds || 2, onResult: (result) => onTournamentMatchDone(result) };
  const deshiUnit = seated.find((u) => u.isDeshi);
  const rivalSeated = seated.filter((u) => !u.isDeshi);
  if (t.format === "pair") {
    launchPairTournamentMatch(deshiUnit, rivalSeated[0], ctx);
  } else if (t.format === "team") {
    launchTeamTournamentMatch(deshiUnit, rivalSeated, ctx);
  } else {
    // 個人戦：弟子（avatar）＝育成HP、ライバルは oppLv連動HP（その代表を launchHonestMatch へ）。
    const profile = await profileRepo.loadProfile();
    const av = activeAvatar(profile);
    launchHonestMatch({
      avatar: av, opponents: rivalSeated.map((u) => u.members[0]), players: t.playerCount, rounds: t.rounds || 2,
      startPoints: av.avatarHpMax || 25000, tournament: true, isLast: run.matchIndex >= t.matches - 1, matchLabel: section,
      tournamentInfo, onResult: (result) => onTournamentMatchDone(result),
    });
  }
}

// ペア大会の1節（2対2・自ペア=弟子＋師匠）。結果は honestCtx.onResult でユニット順位を返す。
async function launchPairTournamentMatch(deshiUnit, rivalUnit, ctx) {
  teamBattleData = null; humanIndex = 0; selectedRounds = ctx.rounds || 2;
  // 席: 0=弟子, 1=敵A, 2=師匠(対面), 3=敵B。
  const order = [deshiUnit.members[0], rivalUnit.members[0], deshiUnit.members[1], rivalUnit.members[1]];
  await charImages.load(order.filter((c) => !c.isMob));
  const abilities = order.map((c) => instantiateAbilities(c));
  const seated = order.map((c, i) => ({ character: c, abilities: abilities[i] }));
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  pairBattleData = {
    pairOf: [0, 1, 0, 1], pairs: [{ seats: [0, 2] }, { seats: [1, 3] }], chars: order,
    hp: order.map((c) => c.stats.startingPoints),
    pairScore: [order[0].stats.startingPoints + order[2].stats.startingPoints, order[1].stats.startingPoints + order[3].stats.startingPoints],
    unitIds: [deshiUnit.id, rivalUnit.id], isTournament: true,
  };
  honestCtx = ctx; honestAutoPlay = false;
  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated, humanIndex, mode: { rounds: selectedRounds, players: 4 }, dealerIndex, audio,
    pairs: pairBattleData.pairs.map((p) => ({ seats: p.seats, chars: p.seats.map((s) => order[s]) })),
    tournament: ctx.tournamentInfo, onComplete: () => beginGame(seated, dealerIndex),
  });
}

// 団体大会の1節（4チーム対抗・自チーム=弟子＋師匠＋仲間）。結果は honestCtx.onResult でユニット順位を返す。
async function launchTeamTournamentMatch(deshiUnit, rivalUnits, ctx) {
  pairBattleData = null; humanIndex = 0; selectedRounds = ctx.rounds || 2;
  const allUnits = [deshiUnit, ...rivalUnits];
  const allTeams = allUnits.map((u) => u.members);
  await charImages.load(allTeams.flat().filter((c) => c && !c.isMob));
  const abilitiesByTeam = allTeams.map((team) => team.map((c) => (c ? instantiateAbilities(c) : null)));
  const seated = allTeams.map((team, ti) => ({ character: team[0], abilities: abilitiesByTeam[ti][0] }));
  for (const team of allTeams) for (const c of team) if (c) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  teamBattleData = {
    numTeams: allTeams.length,
    teams: allTeams.map((team, ti) => ({
      chars: team, activeIdx: 0, hps: team.map((c) => c.stats.startingPoints),
      score: team.reduce((a, c) => a + (c?.stats.startingPoints || 0), 0), abilitiesByMember: abilitiesByTeam[ti],
    })),
    unitIds: allUnits.map((u) => u.id), isTournament: true,
  };
  honestCtx = ctx; honestAutoPlay = false;
  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated, humanIndex, mode: { rounds: selectedRounds, players: allTeams.length }, dealerIndex, audio,
    teams: teamBattleData.teams, tournament: ctx.tournamentInfo, onComplete: () => beginGame(seated, dealerIndex),
  });
}

async function onTournamentMatchDone(result) {
  const run = tournamentRun; const t = run.t;
  // 採点（点棒＝HP）：素点＝(最終−自分の開始HP)/1000。ウマは「その節の増減順位」で配る
  //（＝育成は持ち点の厚み＝攻めの余裕/トビにくさとして効き、宝は打ち回しの累積で決まる）。
  const seated = (result.standings || []).map((s) => ({
    id: s.id, isHuman: !!s.isHuman,
    net: Math.round(((s.points ?? 0) - (run.unitStart?.[s.id] ?? t.base)) / 1000),
  }));
  seated.sort((a, b) => b.net - a.net); // 増減の大きい順＝この節の順位
  const deltaById = {};
  seated.forEach((s, i) => { const pt = s.net + (t.uma[i] ?? 0); run.totals[s.id] = (run.totals[s.id] || 0) + pt; deltaById[s.id] = pt; });
  // 卓に居なかったユニットは別卓扱いで擬似ポイントを加算（全員の累積を動かす＝シーズンの手触り）。
  const seatedSet = new Set(run.seatedUnitIds || []);
  for (const u of run.units) {
    if (seatedSet.has(u.id)) continue;
    const pt = simAbsentLeaguePt(t.uma, !!u.isRival);
    run.totals[u.id] = (run.totals[u.id] || 0) + pt;
    deltaById[u.id] = pt;
  }
  run.matchIndex += 1;
  const finished = run.matchIndex >= t.matches;
  const ranked = Object.keys(run.totals).sort((a, b) => run.totals[b] - run.totals[a]);
  // 節間：まず「この節の得点推移グラフ」を自動表示 → 閉じると累積順位表へ。
  const showStandings = () => showTournamentStandings(run, { ranked, deltaById, finished, entrants: t.entrants, sectionLabel: `第 ${run.matchIndex} / ${t.matches} 節` }, async (action) => {
    if (finished || action === "retreat") {
      const finalRank = ranked.findIndex((id) => id === run.deshiUnitId);
      const cur = await profileRepo.loadProfile();
      const res = applyLeagueResult(cur, t, finalRank, action === "retreat");
      await profileRepo.saveProfile(res.profile);
      const standings = ranked.map((id, i) => ({ name: run.names[id], pt: run.totals[id], isHuman: id === run.deshiUnitId, place: i + 1 }));
      tournamentRun = null;
      openMentorHome({ league: { name: t.name, treasure: t.treasure, finalRank: res.finalRank, won: res.won, rank: res.rank, meta: res.meta, soul: res.soul, retreated: res.retreated, standings } });
    } else {
      playTournamentMatch();
    }
  });
  // この節の得点推移を自動表示してから順位表へ（履歴が無ければ順位表のみ）。
  if (result.graph && (result.graph.history?.length || 0) > 1) {
    showScoreGraph(result.graph.history, result.graph.players, showStandings);
  } else {
    showStandings();
  }
}

// 対局中の大会バッジ（左上）。大会名・節・前節までの累積順位を常時表示してヒリヒリ感を出す（#2）。
function updateTournamentHud() {
  const gs = el("game-screen");
  if (!gs) return;
  gs.querySelector(".game-tourney-hud")?.remove();
  const info = honestCtx?.tournamentInfo;
  if (!info) return;
  const run = tournamentRun;
  const unitN = run ? run.units.length : 8;
  let rankTxt = `開幕節（全${unitN}組）`;
  if (run && run.matchIndex > 0) {
    const ranked = Object.keys(run.totals).sort((a, b) => run.totals[b] - run.totals[a]);
    const place = ranked.findIndex((id) => id === run.deshiUnitId);
    const tot = run.totals[run.deshiUnitId] || 0;
    if (place >= 0) rankTxt = `前節まで ${place + 1}/${unitN}位（${tot > 0 ? "+" : ""}${tot}pt）`;
  }
  const hud = document.createElement("div");
  hud.className = "game-tourney-hud";
  hud.innerHTML = `<div class="gth-cup">CUP</div><div class="gth-txt"><div class="gth-name">${esc(info.name || "大会")}</div><div class="gth-sec">${esc(info.section || "")}　${esc(rankTxt)}</div></div>`;
  gs.appendChild(hud);
}

// 大会 順位表演出（節間）。累積ポイントで全出場者を並べ、この節の増減＋弟子ハイライト＋カウントアップ。
function showTournamentStandings(run, info, onDone) {
  const host = el("app") || document.body;
  const ov = document.createElement("div");
  ov.className = "tourney-standings";
  const rows = info.ranked.map((id, i) => {
    const total = run.totals[id];
    const d = info.deltaById[id] ?? 0;
    const me = id === run.deshiUnitId;
    return `
      <div class="ts-row${me ? " me" : ""}" style="animation-delay:${(info.ranked.length - 1 - i) * 0.12}s">
        <div class="ts-place ts-p${i + 1}">${i + 1}</div>
        <div class="ts-name">${esc(run.names[id])}${me ? '<span class="ts-you">YOU</span>' : ""}</div>
        <div class="ts-delta ${d >= 0 ? "up" : "dn"}">${d >= 0 ? "+" : ""}${d}</div>
        <div class="ts-total" data-to="${total}">0</div>
      </div>`;
  }).join("");
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="ts-card">
      <div class="ts-head">大会 順位表 <small>${esc(info.sectionLabel)}</small></div>
      <div class="ts-list">${rows}</div>
      <div class="ts-btns"></div>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  // 累積ポイントのカウントアップ。
  ov.querySelectorAll(".ts-total").forEach((node, idx) => {
    const to = +node.getAttribute("data-to");
    setTimeout(() => tweenNum(node, 0, to, 650, (v) => (v > 0 ? "+" : "") + v), 300 + idx * 90);
  });
  const btns = ov.querySelector(".ts-btns");
  const close = (action) => { ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 180); onDone(action); };
  if (info.finished) {
    btns.appendChild(mkBtn("最終結果へ", "btn-tsumo", () => close("finish")));
  } else {
    btns.appendChild(mkBtn("次の節へ", "btn-tsumo", () => close("continue")));
    btns.appendChild(mkBtn("ここで退く", "btn-ron", () => close("retreat")));
  }
}

// 現在の対局から「得点推移グラフ用データ」を作る（終局スナップショットを足して返す）。
// pair/team は points=席ごとのHP（推移）として描く。solo は点棒。
function buildTournamentGraph() {
  if (!game || !game.players) return null;
  scoreHistory.push({ label: "終局", points: game.players.map((p) => p.points) });
  const players = game.players.map((p, i) => ({ name: p.character.name, color: p.character.color || "#9aa", isHuman: i === humanIndex }));
  return { history: scoreHistory.slice(), players };
}

// 得点推移グラフ（1試合ぶん・全員）。history=[{label, points:[..]}], players=[{name,color,isHuman}]。
// onDone を渡すと閉じたとき呼ぶ（大会の節間自動表示→順位表 へ繋ぐのに使う）。
function showScoreGraph(history, players, onDone = null) {
  if (!history || history.length < 1) { onDone?.(); return; }
  const host = el("app") || document.body;
  const W = 760, H = 430, L = 52, R = 600, T = 36, B = 322; // プロット領域
  const n = history.length;
  const all = history.flatMap((h) => h.points);
  const lo = Math.min(...all, 25000) - 1500;
  const hi = Math.max(...all, 25000) + 1500;
  const xFor = (i) => (n <= 1 ? (L + R) / 2 : L + (i / (n - 1)) * (R - L));
  const yFor = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
  const y25 = yFor(25000);
  // ラインとラベルを最終持ち点降順で（凡例の並びと色対応）。
  const order = players.map((p, idx) => ({ ...p, idx, fin: history[n - 1].points[idx] }))
    .sort((a, b) => b.fin - a.fin);
  const lines = order.map((p) => {
    const pts = history.map((h, i) => `${xFor(i).toFixed(1)},${yFor(h.points[p.idx]).toFixed(1)}`).join(" ");
    const w = p.isHuman ? 4 : 2.5;
    const dot = `<circle cx="${xFor(n - 1).toFixed(1)}" cy="${yFor(p.fin).toFixed(1)}" r="${p.isHuman ? 5 : 3.5}" fill="${p.color}"/>`;
    return `<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" opacity="${p.isHuman ? 1 : 0.85}"${p.isHuman ? ' filter="url(#glow)"' : ""}/>${dot}`;
  }).join("");
  // X ラベル（多いと潰れるので最大 7 点を均等に）。
  const step = Math.max(1, Math.ceil(n / 7));
  const xlabels = history.map((h, i) => (i % step === 0 || i === n - 1)
    ? `<text x="${xFor(i).toFixed(1)}" y="${B + 18}" class="sg-xl">${esc(h.label)}</text>` : "").join("");
  const legend = order.map((p, i) => `
    <div class="sg-leg-row${p.isHuman ? " me" : ""}">
      <span class="sg-leg-rank">${i + 1}</span>
      <span class="sg-leg-dot" style="background:${p.color}"></span>
      <span class="sg-leg-name">${esc(p.name)}${p.isHuman ? '<span class="ts-you">YOU</span>' : ""}</span>
      <span class="sg-leg-pt">${p.fin.toLocaleString()}</span>
    </div>`).join("");
  const ov = document.createElement("div");
  ov.className = "score-graph";
  ov.innerHTML = `
    <div class="sg-scrim"></div>
    <div class="sg-card">
      <div class="sg-head">得点推移</div>
      <div class="sg-body">
        <svg class="sg-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
          <defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <line x1="${L}" y1="${y25.toFixed(1)}" x2="${R}" y2="${y25.toFixed(1)}" class="sg-base"/>
          <text x="${R + 6}" y="${(y25 + 4).toFixed(1)}" class="sg-base-lbl">25000</text>
          ${lines}
          ${xlabels}
        </svg>
        <div class="sg-legend">${legend}</div>
      </div>
      <button type="button" class="mhx-md-btn sg-close">閉じる</button>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  audio?.playPip?.(1800, 0.4);
  let closed = false;
  const close = () => { if (closed) return; closed = true; ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 180); onDone?.(); };
  ov.querySelector(".sg-scrim").addEventListener("click", close);
  ov.querySelector(".sg-close").addEventListener("click", close);
  if (onDone) ov.querySelector(".sg-close").textContent = "順位表へ";
}

async function openMentorSub(target, payload) {
  const back = () => openMentorHome();
  if (target === "tournament") { openTournament(); return; }
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
  } else if (target === "settings") {
    // 師弟ホームの歯車 → 設定。戻ると現状はホームへ（設定画面の戻りは home 固定）。
    navigate("settings");
  } else if (target === "autobattle-proto") {
    // §4.6 オートバトルのプロト起動（大会未実装のためデバッグ導線から）。
    const profile = await profileRepo.loadProfile();
    launchAutoBattle(profile, { oppLv: 1, oppHpMax: 6000, onExit: () => back() });
  } else if (target === "duo-match") {
    // §4.6.9 B2 二人打ち＝師匠とのタイマン（二人麻雀）。payload.auto でオート/本気。
    const profile = await profileRepo.loadProfile();
    const av = activeAvatar(profile);
    // 点棒＝HP：弟子は「今の HP」を賭けて打つ。結果は HP に反映。
    const stake = Math.max(0, Math.min(av?.avatarHpMax || 0, av?.avatarHpCurrent ?? 0));
    if (stake < 1000) { // HP が無い／僅少なら打てない（休んでから）
      openMentorHome({ duoBlocked: true });
      return;
    }
    const mentorBase = CHARACTERS.find((c) => c.id === av?.mentorCharacterId) || CHARACTERS[0];
    // 師匠は格上：フリー対戦のHP（キャラ既定値）を初期値に、師弟シナリオの進捗（既読数）で強化。
    const mentorHp = mentorDuoHp(mentorBase, profile);
    const mentor = { ...mentorBase, stats: { ...mentorBase.stats, startingPoints: mentorHp } };
    launchHonestMatch({
      avatar: av, opponents: [mentor], players: 2, rounds: 2, // 二人麻雀・東南戦
      startPoints: stake, // ★持ち点＝弟子の現 HP（師匠は格上HP）
      voiceSet: "shugyo", autoPlay: !!payload?.auto, returnTo: "mentor-home",
      onResult: async (result) => {
        const cur = await profileRepo.loadProfile();
        const res = applyDuoResult(cur, result);
        await profileRepo.saveProfile(res.profile);
        openMentorHome({ duo: { won: res.won, soul: res.soul, gains: res.gains, before: res.before, after: res.after, closeness: res.closeness, finalPoints: res.finalPoints, hpBefore: res.hpBefore, hpAfter: res.hpAfter, hpDelta: res.hpDelta } });
      },
    });
  } else if (target === "honest-proto") {
    // §4.6.9 本気対局（4人・モブ）プロト。橋(launchHonestMatch)→結果反映→師弟ホーム。
    const profile = await profileRepo.loadProfile();
    const av = activeAvatar(profile);
    const mobs = makeMobRoster(3, { seedPrefix: "honest-" + Date.now() });
    launchHonestMatch({
      avatar: av, opponents: mobs, rounds: 1, players: 4,
      returnTo: "mentor-home",
      onResult: async (result) => {
        const cur = await profileRepo.loadProfile();
        const res = applyHonestResult(cur, result);
        await profileRepo.saveProfile(res.profile);
        openMentorHome({ honest: { placement: res.placement, numPlayers: res.numPlayers, soul: res.soul, gains: res.gains, before: res.before, after: res.after, won: res.won } });
      },
    });
  } else if (target === "parlor") {
    // §4.6.8 雀荘巡り：選んだ雀荘でオートを連戦し、結果でソウル付与＋1行動消費。
    const profile = await profileRepo.loadProfile();
    const st = parlorState(profile);
    const cand = st.candidates[payload?.index ?? 0];
    if (!cand) { back(); return; }
    launchAutoBattle(profile, {
      oppLv: cand.oppLv,
      oppHpMax: cand.oppHpMax,
      maxMatches: cand.matches,
      onExit: async (session) => {
        const cur = await profileRepo.loadProfile();
        const res = visitParlor(cur, cand.index, session?.wins ?? 0);
        await profileRepo.saveProfile(res.profile);
        // 戻った先（師弟ホーム）で雀荘リザルト＋能力値上昇演出を出す。
        openMentorHome({ parlor: { candidate: res.candidate, wins: res.wins, soul: res.soul, gains: res.gains, before: res.before, after: res.after } });
      },
    });
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
  if (selectedTeamBattle) { startTeamBattleGame(); return; }
  if (selectedPairBattle) { startPairBattleGame(cpuPicks[0]); return; }
  humanIndex = 0;
  teamBattleData = null;
  pairBattleData = null;
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

// デバッグ専用: 選択キャラ（未選択なら詩玥）vs モブ3体で通常対局を即開始する。
// モブ3体のうち2体は能力なし、1体は能力あり（lucky-draw）にして「能力あり/なし両Ver」を
// その場で確認できるようにしている。seed 固定なので毎回同じ顔ぶれ＝同定の確認もできる。
function startDebugMobMatch() {
  humanIndex = 0;
  teamBattleData = null;
  pairBattleData = null;
  const human = CHARACTERS.find((c) => c.id === selectedCharId) || CHARACTERS[0];
  // 1体だけ能力ありにする（残りは能力なし）。
  const mobs = makeMobRoster(3, { seedPrefix: "debug", abilityIds: [null, null, "lucky-draw"] });
  const order = [human, ...mobs];
  const seated = order.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});

  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated,
    humanIndex,
    mode: { rounds: selectedRounds, players: 4 },
    dealerIndex,
    audio,
    onComplete: () => beginGame(seated, dealerIndex),
  });
}

// 団体戦の開始。自チーム3人を選択済み、CPU チームはランダム割り当て。
function startTeamBattleGame() {
  humanIndex = 0;
  pairBattleData = null; // 直前がペア戦でも残骸を持ち越さない（firePartnerTalk 誤発火防止）
  const myMembers = [selectedCharId, cpuPicks[0], cpuPicks[1]]
    .map((id) => CHARACTERS.find((c) => c.id === id));

  // CPU チームを残りキャラからランダム割り当て（1チーム3人）。
  const usedIds = new Set(myMembers.map((c) => c.id));
  const pool = shuffled(CHARACTERS.filter((c) => !usedIds.has(c.id)));
  const cpuTeams = [];
  for (let t = 0; t < selectedTeamCount - 1; t++) {
    cpuTeams.push(pool.splice(0, 3));
  }

  // 全メンバー分の能力インスタンスを先に生成して保持する。交代時はこのインスタンス
  // を game.players へ差し替えるので、game-scoped の使用回数（charges）が個体に残った
  // まま持ち越される。先鋒(idx 0)の分は seated と同一インスタンスを共有し、出場中に
  // 消費した回数がそのまま abilitiesByMember に反映されるようにする。
  const allTeams = [myMembers, ...cpuTeams];
  const abilitiesByTeam = allTeams.map((team) =>
    team.map((c) => (c ? instantiateAbilities(c) : null))
  );

  // ゲームエンジンには各チームの active メンバー1人（先鋒）を渡す。
  const seated = allTeams.map((team, ti) => ({
    character: team[0],
    abilities: abilitiesByTeam[ti][0],
  }));

  // 全チームメンバー分の音声を事前登録。
  for (const team of allTeams) {
    for (const c of team) if (c) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  }

  // teamBattleData を初期化。
  //   hps   … 個人HP（被弾でのみ減る／回復はアイテムのみ）。撃沈・親満ペナルティ判定用。
  //   score … チーム点数（和了で増・放銃で減＝通常の点棒増減）。HPとは別管理で順位の基準。
  //           初期値は3人の初期持ち点合計（HP初期合計と同じスタート。以後は乖離していく）。
  //   abilitiesByMember … メンバーごとの能力インスタンス（交代で持ち越す本体）。
  teamBattleData = {
    numTeams: selectedTeamCount,
    teams: allTeams.map((team, ti) => ({
      chars: team,
      activeIdx: 0,
      hps: team.map((c) => c.stats.startingPoints),
      score: team.reduce((a, c) => a + (c.stats.startingPoints || 0), 0),
      abilitiesByMember: abilitiesByTeam[ti],
    })),
  };

  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated,
    humanIndex,
    mode: { rounds: selectedRounds, players: selectedTeamCount },
    dealerIndex,
    audio,
    teams: teamBattleData.teams, // 団体戦専用 Phase A（3人カード×チーム枠）用
    onComplete: () => beginGame(seated, dealerIndex),
  });
}

// ペア戦（2対2の共闘）の開始。独立した新モード＝団体戦の交代機構は使わない。
// 4席=2ペア×2人。座席は「対面ペア」: 席0=自分 / 席2=相方 / 席1・3=敵ペア。
// 各席は自分の個人HP（被弾でのみ減・着席ダウンで0床）を持ち、ペア点数=2人の合算
// （和了で増・放銃で減＝順位の基準）。team側コードには一切触れない。
function startPairBattleGame(partnerId) {
  humanIndex = 0;
  teamBattleData = null;
  const me = CHARACTERS.find((c) => c.id === selectedCharId);
  // 相方が未指名（おまかせ）なら残りからランダムに1人。
  let partner = partnerId ? CHARACTERS.find((c) => c.id === partnerId) : null;

  // 敵ペア2人＋（必要なら相方）を、自分と被らないようランダム割り当て。
  const usedIds = new Set([me.id, ...(partner ? [partner.id] : [])]);
  const pool = shuffled(CHARACTERS.filter((c) => !usedIds.has(c.id)));
  if (!partner) partner = pool.shift();
  const enemyA = pool.shift();
  const enemyB = pool.shift();

  // 着席順（卓の席）: 席0=自分, 席1=敵A, 席2=相方(対面), 席3=敵B。
  const order = [me, enemyA, partner, enemyB];
  const abilities = order.map((c) => instantiateAbilities(c));
  const seated = order.map((c, i) => ({ character: c, abilities: abilities[i] }));
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});

  // pairBattleData: 席→ペアID対応と、ペア単位の点数を保持。
  //   pairOf … 席index → pairId（0=自ペア{0,2} / 1=敵ペア{1,3}）。
  //   hp     … 席ごとの個人HP（被弾でのみ減る。着席ダウンで0床。回復はアイテムのみ）。
  //   pairScore … ペア2人の合算点（和了で増・放銃で減）。順位＝勝敗の基準。
  pairBattleData = {
    pairOf: [0, 1, 0, 1],
    pairs: [{ seats: [0, 2] }, { seats: [1, 3] }],
    chars: order,
    hp: order.map((c) => c.stats.startingPoints),
    pairScore: [
      order[0].stats.startingPoints + order[2].stats.startingPoints,
      order[1].stats.startingPoints + order[3].stats.startingPoints,
    ],
  };

  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated,
    humanIndex,
    mode: { rounds: selectedRounds, players: 4 },
    dealerIndex,
    audio,
    // ペア戦専用 Phase A（2人ペア×2）用。各ペアの席と立ち絵を渡す。
    pairs: pairBattleData.pairs.map((p) => ({ seats: p.seats, chars: p.seats.map((s) => order[s]) })),
    onComplete: () => beginGame(seated, dealerIndex),
  });
}

// 実対局の生成と開始。対局開始演出（showMatchIntro）の onComplete から呼ばれる。
function beginGame(seated, dealerIndex) {
  // 団体戦は個人が飛んでも交代で続行する。終了（団体トビ）は「いずれかのチームが
  // 全滅（3人全員のHPが尽きてチーム合計が0以下）」したとき、または規定局完了。
  const teamBustCheck = teamBattleData
    ? () => teamBattleData.teams.some((t) => t.hps.reduce((a, b) => a + b, 0) <= 0)
    : undefined;
  // ペア戦の終了: いずれかのペアが全滅（2人ともHP≤0＝着席ダウン）したとき。個人が
  // 1人ダウンしても卓には残り続けるので、ペア単位の全滅でのみ対局終了。
  const pairBustCheck = pairBattleData
    ? () => pairBattleData.pairs.some((p) => p.seats.every((s) => pairBattleData.hp[s] <= 0))
    : undefined;
  // この対局のセリフセットを確定（シナリオ戦が pendingVoiceSet をセットしていれば適用、
  // フリー対戦など未指定なら null＝通常セリフのみ）。
  activeVoiceSet = pendingVoiceSet;
  pendingVoiceSet = null;
  game = new Game(seated, humanIndex, undefined, {
    maxRounds: selectedRounds,
    dealerIndex,
    bustCheck: teamBustCheck || pairBustCheck,
  });
  renderer = new CanvasRenderer(el("table"), game, humanIndex, tileImages, charImages);
  if (typeof window !== "undefined") { window.__game = game; window.__renderer = renderer; window.__audio = audio; window.__teamBattleData = teamBattleData; window.__pairBattleData = pairBattleData; window.__tbFx = showTeamBattleDamageFx; window.__showGameOver = showGameOver; window.__activeVoiceSet = activeVoiceSet; } // debug handle

  game.bus.on(Events.STATE_CHANGED, () => render());
  // SE: random dahai sound whenever anyone discards (incl. the human)
  game.bus.on(Events.TILE_DISCARDED, () => audio.playDahai());
  // BGM (random per hand) + deal-shuffle SE
  game.bus.on(Events.HAND_STARTED, () => {
    audio.playRandomBgm(); audio.playShuffle();
    // 得点推移の記録：各局のはじまり＝直前までの持ち点スナップショット（全員ぶん）。
    scoreHistory.push({ label: game.roundLabel(), points: game.players.map((p) => p.points) });
  });
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
  updateTournamentHud(); // 大会中なら左上に「大会名／節／累積順位」バッジを出す（#2）
  el("table").addEventListener("click", onCanvasClick);
  el("table").addEventListener("mousemove", onCanvasHover);
  el("table").addEventListener("mouseleave", () => { renderer.setHover(null); render(); });
  initSettingsUI(audio); // gear icon + volume panel (idempotent against re-init)
  initNoNakiToggle();
  autoPlay = honestAutoPlay; // 通常は OFF。本気タイマンの「オート」起動時のみ ON で開始。
  honestAutoPlay = false;
  initAutoToggle();

  // game.startHand() emits HAND_STARTED -> BGM. This runs inside the
  // start-button click (a user gesture), satisfying browser autoplay policy.
  scoreHistory = []; // この対局の得点推移を録り直す（HAND_STARTED で各局を積む）
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
    if (actor.isHuman && !autoPlay) {
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
      // CPU 席、またはオート観戦 ON で AI に委ねた人間席。どちらも同じ判断ルート。
      clearActions();
      // Activate any manual abilities first so the cut-in plays during the wait,
      // then discard. A fired ability extends the pause (ウェイト) so it reads.
      const index = game.turn;
      abilityCutInFlag = false;
      for (const a of decideAbilityActivations(game, index)) game.activateAbility(index, a.id, a.params);
      const wait = abilityCutInFlag ? ABILITY_CUTIN_WAIT : CPU_DELAY;
      // cpuActionPending: この待ち時間中に loop() が再キックされても二重に
      // setTimeout しないためのガード（オートのトグル連打対策。下の auto-btn 参照）。
      cpuActionPending = true;
      setTimeout(() => { cpuActionPending = false; cpuDiscard(index); loop(); }, wait);
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
  // オート観戦: 人間席も CPU と同じく decideCall に委ねる（下の CPU decisions に含める）。
  let humanCaller = autoPlay ? null : callers.find((c) => game.players[c.index].isHuman);

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

  // CPU decisions first. オート観戦中は人間席も AI 判断に含める（humanCaller は null）。
  const cpuDecisions = callers
    .filter((c) => autoPlay || !game.players[c.index].isHuman)
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

  const c = el("table");
  const rect = c.getBoundingClientRect();
  const f = clientToLocalFrac(rect, ev.clientX, ev.clientY); // handles 90° rotation
  const x = f.fx * c.width;
  const y = f.fy * c.height;

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
  const f = clientToLocalFrac(rect, ev.clientX, ev.clientY); // handles 90° rotation
  const x = f.fx * c.width;
  const y = f.fy * c.height;

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
    if (r && r.winner != null && deltas && deltas.some((d) => d)) {
      if (teamBattleData) showTeamBattleDamageFx(r, proceed);
      else if (pairBattleData) showPairBattleDamageFx(r, proceed);
      else showDamageFx(r, proceed);
    } else {
      // 流局（ノーテン罰符など）は和了ダメージ演出を通らない。ペア戦は罰符の点移動を
      // ペア点数へ反映してから進む（HPは被弾のみなので変えない）。
      if (pairBattleData && deltas && deltas.some((d) => d)) applyPairDrawSettlement(deltas);
      proceed();
    }
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
function tweenNum(node, from, to, dur, fmt) {
  const f = fmt || ((v) => v);
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = f(Math.round(from + (to - from) * e));
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
  const text = vline(character.id, event, ctx || {});
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
  // 点数 v をゲージの見た目（周回対応）に変換する。
  const vis = (v, i) => {
    const { lap, fillPct, basePct } = lapState(v, full(i));
    return {
      lap, basePct, fillPct: Math.max(0, fillPct),
      fillBg: lap >= 2 ? lapColor(lap) : null,
      fillCls: lap >= 2 ? "lap" : (fillPct <= 25 ? "low" : fillPct <= 50 ? "mid" : "high"),
      baseBg: lap >= 2 ? lapBaseColor(lap - 1) : null,
    };
  };

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
    const b = vis(before, i); // 開始時の見た目（周回対応）。ドレインで after の見た目へ動かす。
    const iconUrl = charImages.url(c, "icon") || charImages.url(c, "portrait");
    const face = faceMarkup(c, "dmg-face", iconUrl)
      || `<div class="dmg-face dmg-face-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
    return `
      <div class="dmg-row ${isWin ? "is-win" : "is-loser"}${busted ? " is-down" : ""}" data-i="${i}" data-before="${before}" data-after="${after}">
        ${face}
        <div class="dmg-info">
          <div class="dmg-name" style="color:${c.color}">${c.name}</div>
          <div class="hpbar">
            <div class="hpfill-base" style="width:${b.basePct}%${b.baseBg ? `;background:${b.baseBg}` : ""}"></div>
            <div class="hpfill-ghost" style="width:${b.fillPct}%"></div>
            <div class="hpfill ${b.fillCls}" style="width:${b.fillPct}%${b.fillBg ? `;background:${b.fillBg}` : ""}"></div>
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
      const a = vis(after, i);
      const w = a.fillPct + "%";
      const fillEl = row.querySelector(".hpfill");
      fillEl.style.width = w;                                // bar snaps toward new HP
      fillEl.className = "hpfill " + a.fillCls;              // 周回をまたぐと色も切り替わる
      fillEl.style.background = a.fillBg || "";
      const baseEl = row.querySelector(".hpfill-base");
      if (baseEl) { baseEl.style.width = a.basePct + "%"; baseEl.style.background = a.baseBg || ""; }
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

// 団体戦用ダメージ演出。通常版と異なり交代UIを表示し、クリック即閉じではなく
// 「次の局へ」ボタンを明示する。個人HPをdeltaで更新してからカードを生成する。
function showTeamBattleDamageFx(r, onDone) {
  const host = el("damage-overlay");
  const deltas = r.deltas || [];

  // この局を実際に打ったメンバーの「被弾前HP」を控えてから delta を反映する。
  // ここでは交代しない（交代はダメージ演出を見せ切ったあと「次の局へ」で行う）。
  // → 演出中は実際に対局したキャラとそのHP変動が表示され、「満タンの控えが被弾」
  //   のような違和感が出ない。
  // HPとチーム点数は別管理:
  //   HP（hps）        … 反映するのはマイナス分（被弾）だけ。和了のプラス点では回復しない。
  //   チーム点数（score）… 和了/放銃の増減をそのまま積む（通常の点棒移動）。HPは減るが点数は上がる。
  // 反映後、出場中HPを game.players[i].points に同期（卓のHP表示用）。
  const beforeOf = {};
  for (let i = 0; i < game.numPlayers; i++) {
    const team = teamBattleData.teams[i];
    beforeOf[i] = team.hps[team.activeIdx];
    const d = deltas[i] || 0;
    if (d < 0) team.hps[team.activeIdx] = Math.max(0, team.hps[team.activeIdx] + d); // 被弾のみHPへ
    if (d) team.score += d; // 点数は増減そのまま
    game.players[i].points = team.hps[team.activeIdx];
  }

  // 飛び検出＋親満ペナルティ。出場中メンバーのHPが尽きたら退場扱いにし、チームへ親満
  // (FLYING_PENALTY) を課す（飛んだ本人以外の生存メンバーからHP高い順に減算）。
  // team.flown で再課金を防ぐ。「飛ばさない戦略」を生むためのコア演出。
  const flyEvents = [];
  for (let i = 0; i < game.numPlayers; i++) {
    const team = teamBattleData.teams[i];
    const ai = team.activeIdx;
    team.flown = team.flown || {};
    if (team.hps[ai] <= 0 && !team.flown[ai]) {
      team.flown[ai] = true;
      team.hps[ai] = 0;
      const taken = applyFlyingPenalty(team);
      const c = team.chars[ai];
      flyEvents.push({ teamIdx: i, name: c.name, color: c.color, penalty: taken });
    }
  }

  const fmtNum = (v) => v.toLocaleString();
  const rowHtml = (i) => {
    const team = teamBattleData.teams[i];
    const c = team.chars[team.activeIdx];
    const after = team.hps[team.activeIdx];
    const before = beforeOf[i];
    const delta = deltas[i] || 0;
    const full = c.stats.startingPoints || MAX_HP;
    const p = (v) => Math.max(0, Math.min(100, (v / full) * 100));
    const isWin = i === r.winner;
    const isMe = i === humanIndex;
    const down = !isWin && after <= 0; // 飛び（撃沈）
    const fc = after <= full * 0.25 ? "low" : after <= full * 0.5 ? "mid" : "high";
    const tag = isMe ? "自チーム" : `チーム ${relSeatLabel(i)}`;
    // 和了者: HPは回復しない（バー据え置き）が、チーム点数は得点ぶん上がる。
    // → delta欄は「点数 +N」を出してHPバー不変との違いを明示。被弾側はHPダメージ量。
    const deltaHtml = isWin
      ? `<div class="tb-dmg-delta gain" title="チーム点数が増えます（HPは回復しません）">点数 +${delta.toLocaleString()}</div>`
      : `<div class="tb-dmg-delta loss">${delta.toLocaleString()}</div>`;
    return `<div class="tb-dmg-row ${isWin ? "is-win" : "is-loser"}${down ? " is-down" : ""}" data-i="${i}" data-before="${before}" data-after="${after}" data-full="${full}">
      <div class="tb-dmg-tag" style="color:${isMe ? "var(--accent)" : "var(--muted)"}">${tag}</div>
      <div class="tb-dmg-name" style="color:${c.color}">${c.name}</div>
      <div class="tb-dmg-barwrap"><div class="hpfill-ghost" style="width:${p(before)}%"></div><div class="hp-fill ${fc}" style="width:${p(before)}%"></div></div>
      <div class="tb-dmg-val"><span class="tb-dmg-num">${fmtNum(before)}</span></div>
      ${deltaHtml}
      ${down ? `<div class="tb-dmg-stamp">撃沈</div>` : ""}
    </div>`;
  };

  // チーム点数（score）でランキング表示。和了で上がり放銃で下がる＝順位の基準。
  const totalHtml = teamBattleData.teams.map((team, i) => {
    const tot = team.score;
    const isMe = i === humanIndex;
    const lbl = isMe ? "自チーム" : `チーム ${relSeatLabel(i)}`;
    return `<div class="tb-tot-item${isMe ? " mine" : ""}">
      <div class="tb-tot-label">${lbl}</div>
      <div class="tb-tot-val" style="${isMe ? "color:var(--accent)" : tot < 10000 ? "color:var(--danger)" : ""}">${tot.toLocaleString()}</div>
    </div>`;
  }).join('<div class="tb-tot-sep"></div>');

  const myTeam = teamBattleData.teams[humanIndex];
  const swapHtml = myTeam.chars.map((mc, mi) => {
    if (!mc) return "";
    const hp = myTeam.hps[mi];
    const full = mc.stats.startingPoints || MAX_HP;
    const pct = Math.max(0, Math.min(100, (hp / full) * 100));
    const fc = pct <= 25 ? "low" : pct <= 50 ? "mid" : "high";
    const isActive = mi === myTeam.activeIdx;
    const isOut = hp <= 0;
    return `<div class="tb-swap-opt${isActive ? " current" : ""}${isOut ? " out" : ""}" data-mi="${mi}">
      <div class="tb-swap-icon" style="color:${mc.color}">${[...mc.name][0] || "?"}</div>
      <div class="tb-swap-info">
        <div class="tb-swap-name" style="color:${mc.color}">${mc.name}</div>
        <div class="hp-gauge tb-swap-gauge"><div class="hp-fill ${fc}" style="width:${pct}%"></div></div>
      </div>
      <div class="tb-swap-right">
        <div class="tb-swap-hp">${isOut ? "退場" : hp.toLocaleString()}</div>
        ${isActive ? '<div class="tb-swap-cur">出場中</div>' : ""}
      </div>
    </div>`;
  }).join("");

  const rows = [r.winner, ...game.players.map((_, i) => i).filter((i) => i !== r.winner && deltas[i])];

  // 飛びバナー（発生時のみ）。誰が飛んでチームがいくら親満ペナルティを受けたか。
  const flyHtml = flyEvents.length
    ? `<div class="tb-fly-banner">${flyEvents
        .map(
          (f) =>
            `<div class="tb-fly-line"><span class="tb-fly-x">✕</span><b style="color:${f.color}">${f.name}</b> 飛び！ <span class="tb-fly-team">チーム${f.teamIdx === humanIndex ? "（自）" : ""}</span>に親満ペナルティ <b class="tb-fly-pen">−${f.penalty.toLocaleString()}</b></div>`
        )
        .join("")}</div>`
    : "";

  // 自チームの出場中が飛んでいるなら交代必須。デフォルト選択を生存最高HPに寄せる。
  const myActiveFlown = myTeam.hps[myTeam.activeIdx] <= 0;
  const myAlive = myTeam.chars
    .map((c, mi) => mi)
    .filter((mi) => myTeam.chars[mi] && myTeam.hps[mi] > 0);
  let pendingMi = myTeam.activeIdx;
  if (myActiveFlown && myAlive.length) {
    pendingMi = myAlive.reduce((b, mi) => (myTeam.hps[mi] > myTeam.hps[b] ? mi : b), myAlive[0]);
  }
  const swapLabel = myActiveFlown
    ? (myAlive.length ? "出場者が飛びました。次に誰を出しますか？" : "チーム全滅…")
    : "次の局、誰と出しますか？";

  const showCard = () => {
  host.innerHTML = `
    <div class="dmg-card tb-dmg-card">
      <div class="dmg-head">${r.tsumo ? "ツモ和了" : "ロン和了"} — ダメージ</div>
      <div class="tb-dmg-rows">${rows.map(rowHtml).join("")}</div>
      <div class="tb-totals">${totalHtml}</div>
      ${flyHtml}
      <div class="tb-swap-block">
        <div class="tb-swap-label">${swapLabel}</div>
        <div class="tb-swap-opts">${swapHtml}</div>
      </div>
      <p class="tb-note">※ 団体戦なので、HPはアイテムでのみ回復できます</p>
      <button class="btn tb-next-btn" id="tb-next-btn">次の局へ</button>
    </div>`;

  host.classList.remove("hidden");
  requestAnimationFrame(() => host.classList.add("show"));

  // 個人戦と同じドレイン演出: 一拍おいて全員のゲージを新HPへ。被弾はシェイク＋SE、
  // 飛びは撃沈スタンプ＋ダウンSE。数値はカウントダウン。
  setTimeout(() => {
    audio.playSe(sePath("ボウリングのピンを倒す1.mp3"), 0.9);
    host.querySelectorAll(".tb-dmg-row").forEach((row) => {
      const i = +row.dataset.i;
      const before = +row.dataset.before, after = +row.dataset.after, full = +row.dataset.full;
      const w = Math.max(0, Math.min(100, (after / full) * 100)) + "%";
      const fill = row.querySelector(".hp-fill");
      if (fill) fill.style.width = w;
      const ghost = row.querySelector(".hpfill-ghost");
      if (ghost) setTimeout(() => { ghost.style.width = w; }, 430);
      // 和了者はHP不変＝被弾演出なし。被弾（マイナス）の行だけフラッシュ＋シェイク。
      const down = i !== r.winner && after <= 0;
      if (i !== r.winner) row.classList.add("flash");
      if (i !== r.winner && !down) row.classList.add("shake");
      row.querySelector(".tb-dmg-delta")?.classList.add("show");
      const numEl = row.querySelector(".tb-dmg-num");
      if (numEl) tweenNum(numEl, before, after, 850, fmtNum);
      if (down) {
        setTimeout(() => {
          row.classList.add("downed");
          row.querySelector(".tb-dmg-stamp")?.classList.add("show");
          host.classList.add("ko");
          audio.playSe(sePath("布団に倒れ込む.mp3"), 1.0);
        }, 620);
      }
    });
  }, 300);

  host.querySelectorAll(".tb-swap-opt").forEach((opt) => {
    const mi = Number(opt.dataset.mi);
    if (myTeam.hps[mi] <= 0) return;
    opt.onclick = (e) => {
      e.stopPropagation();
      pendingMi = mi;
      host.querySelectorAll(".tb-swap-opt").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");
    };
  });
  const defaultOpt = host.querySelector(`.tb-swap-opt[data-mi="${pendingMi}"]`);
  if (defaultOpt) defaultOpt.classList.add("selected");

  el("tb-next-btn").onclick = () => {
    // 交代はここで確定する（演出を見せ切ってから）。自チームの選択ぶん→CPUの自動交代。
    const swaps = [];
    if (pendingMi !== myTeam.activeIdx && myTeam.hps[pendingMi] > 0) {
      const ev = executeTeamSwap(humanIndex, pendingMi);
      if (ev) swaps.push(ev);
    }
    swaps.push(...cpuAutoSwap());
    host.classList.remove("show", "has-speaker", "ko");
    host.classList.add("hidden");
    host.innerHTML = "";
    // 交代が発生したら交代演出を挟んでから次局へ。
    if (swaps.length) showSwapFx(swaps, onDone);
    else onDone();
  };

  // セリフ演出
  const human = game.players[humanIndex];
  const hd = deltas[humanIndex] || 0;
  let spEvent = null, spCtx = null;
  if (r.winner === humanIndex) {
    spEvent = "agari";
    spCtx = { isYakuman: !!r.result.isYakuman, score: r.result.total };
  } else if (hd < 0) {
    spEvent = "damage";
    spCtx = { dmgAmount: Math.abs(hd), hpFrac: human.points / (human.character.stats.startingPoints || MAX_HP) };
  }
  if (spEvent) {
    const sp = mountSpeaker(host, human.character, spEvent, spCtx, "left");
    if (sp) host.classList.add("has-speaker");
  }
  }; // showCard

  // 飛びが発生したら専用カットイン（撃沈＋親満払い）を先に見せ、終わってからダメージカードへ。
  if (flyEvents.length) showFlyingCutIn(flyEvents, showCard);
  else showCard();
}

// 流局時のペア精算。和了ダメージ演出を通らない流局（ノーテン罰符・流し満貫の罰符側）で、
// 罰符の点移動を「ペア点数」にだけ反映する。HPは被弾でのみ減る設計なので変えない（卓の
// HP表示も hp に復元する＝罰符をHPに乗せない）。winner のいる和了は showPairBattleDamageFx 側。
function applyPairDrawSettlement(deltas) {
  if (!pairBattleData) return;
  for (let i = 0; i < game.numPlayers; i++) {
    const d = deltas[i] || 0;
    if (d) pairBattleData.pairScore[pairBattleData.pairOf[i]] += d;
    game.players[i].points = pairBattleData.hp[i]; // HPは流局で変えない（表示も据え置き）
  }
}

// ペア戦用ダメージ演出。団体戦版から「交代UI」「飛びカットイン／親満ペナルティ」を
// 取り除いた簡易版。HPは被弾(マイナス)のみ反映＝着席ダウンで0床。ペア点数は増減そのまま。
// 飛びペナルティは仕様D（当面なし）に従いゼロ。Phase2 でUIを磨く前提の機能版。
function showPairBattleDamageFx(r, onDone) {
  const host = el("damage-overlay");
  const deltas = r.deltas || [];

  // 個人HPとペア点数を別管理で反映。HP=被弾のみ(0床)、pairScore=増減そのまま。
  const beforeOf = {};
  for (let i = 0; i < game.numPlayers; i++) {
    beforeOf[i] = pairBattleData.hp[i];
    const d = deltas[i] || 0;
    if (d < 0) pairBattleData.hp[i] = Math.max(0, pairBattleData.hp[i] + d); // 着席ダウンで0床
    if (d) pairBattleData.pairScore[pairBattleData.pairOf[i]] += d;
    game.players[i].points = pairBattleData.hp[i]; // 卓のHP表示用に同期
  }

  // ペア全滅（2人ともHP0＝着席ダウン）をこの局で確定させる。エンジンの bustCheck は
  // _endHand 時点（hp更新前）に評価されるため、ここで game.gameOver を立てて同じ局で
  // 対局終了に倒す（off-by-one 回避）。onDone(=proceed) が isGameOver を見て結果画面へ。
  if (pairBattleData.pairs.some((p) => p.seats.every((s) => pairBattleData.hp[s] <= 0))) {
    game.gameOver = true;
  }

  const fmtNum = (v) => v.toLocaleString();
  const myPair = pairBattleData.pairOf[humanIndex];
  const rowHtml = (i) => {
    const c = pairBattleData.chars[i];
    const after = pairBattleData.hp[i];
    const before = beforeOf[i];
    const delta = deltas[i] || 0;
    const full = c.stats.startingPoints || MAX_HP;
    const p = (v) => Math.max(0, Math.min(100, (v / full) * 100));
    const isWin = i === r.winner;
    const down = !isWin && after <= 0; // 着席ダウン（脱落ではない）
    const fc = after <= full * 0.25 ? "low" : after <= full * 0.5 ? "mid" : "high";
    const tag = pairBattleData.pairOf[i] === myPair ? "自ペア" : "相手ペア";
    const deltaHtml = isWin
      ? `<div class="tb-dmg-delta gain" title="ペア点数が増えます（HPは回復しません）">点数 +${delta.toLocaleString()}</div>`
      : `<div class="tb-dmg-delta loss">${delta.toLocaleString()}</div>`;
    return `<div class="tb-dmg-row ${isWin ? "is-win" : "is-loser"}${down ? " is-down" : ""}" data-i="${i}" data-before="${before}" data-after="${after}" data-full="${full}">
      <div class="tb-dmg-tag" style="color:${pairBattleData.pairOf[i] === myPair ? "var(--accent)" : "var(--muted)"}">${tag}</div>
      <div class="tb-dmg-name" style="color:${c.color}">${c.name}</div>
      <div class="tb-dmg-barwrap"><div class="hpfill-ghost" style="width:${p(before)}%"></div><div class="hp-fill ${fc}" style="width:${p(before)}%"></div></div>
      <div class="tb-dmg-val"><span class="tb-dmg-num">${fmtNum(before)}</span></div>
      ${deltaHtml}
      ${down ? `<div class="tb-dmg-stamp">ダウン</div>` : ""}
    </div>`;
  };

  // ペア点数（合算）でランキング表示。
  const totalHtml = pairBattleData.pairScore.map((tot, pid) => {
    const isMe = pid === myPair;
    const lbl = isMe ? "自ペア" : "相手ペア";
    return `<div class="tb-tot-item${isMe ? " mine" : ""}">
      <div class="tb-tot-label">${lbl}</div>
      <div class="tb-tot-val" style="${isMe ? "color:var(--accent)" : tot < 10000 ? "color:var(--danger)" : ""}">${tot.toLocaleString()}</div>
    </div>`;
  }).join('<div class="tb-tot-sep"></div>');

  const rows = [r.winner, ...game.players.map((_, i) => i).filter((i) => i !== r.winner && deltas[i])];

  host.innerHTML = `
    <div class="dmg-card tb-dmg-card">
      <div class="dmg-head">${r.tsumo ? "ツモ和了" : "ロン和了"} — ダメージ</div>
      <div class="tb-dmg-rows">${rows.map(rowHtml).join("")}</div>
      <div class="tb-totals">${totalHtml}</div>
      <p class="tb-note">※ ペア戦なので、HPはアイテムでのみ回復できます</p>
      <button class="btn tb-next-btn" id="pb-next-btn">次の局へ</button>
    </div>`;
  host.classList.remove("hidden");
  requestAnimationFrame(() => host.classList.add("show"));

  // ドレイン演出（団体戦版と同じ。被弾はシェイク＋SE、ダウンはスタンプ＋ダウンSE）。
  setTimeout(() => {
    audio.playSe(sePath("ボウリングのピンを倒す1.mp3"), 0.9);
    host.querySelectorAll(".tb-dmg-row").forEach((row) => {
      const i = +row.dataset.i;
      const before = +row.dataset.before, after = +row.dataset.after, full = +row.dataset.full;
      const w = Math.max(0, Math.min(100, (after / full) * 100)) + "%";
      const fill = row.querySelector(".hp-fill");
      if (fill) fill.style.width = w;
      const ghost = row.querySelector(".hpfill-ghost");
      if (ghost) setTimeout(() => { ghost.style.width = w; }, 430);
      const down = i !== r.winner && after <= 0;
      if (i !== r.winner) row.classList.add("flash");
      if (i !== r.winner && !down) row.classList.add("shake");
      row.querySelector(".tb-dmg-delta")?.classList.add("show");
      const numEl = row.querySelector(".tb-dmg-num");
      if (numEl) tweenNum(numEl, before, after, 850, fmtNum);
      if (down) {
        setTimeout(() => {
          row.classList.add("downed");
          row.querySelector(".tb-dmg-stamp")?.classList.add("show");
          host.classList.add("ko");
          audio.playSe(sePath("布団に倒れ込む.mp3"), 1.0);
        }, 620);
      }
    });
  }, 300);

  // 自キャラのセリフ演出（和了/被弾）。
  const human = game.players[humanIndex];
  const hd = deltas[humanIndex] || 0;
  let spEvent = null, spCtx = null;
  if (r.winner === humanIndex) {
    spEvent = "agari";
    spCtx = { isYakuman: !!r.result.isYakuman, score: r.result.total };
  } else if (hd < 0) {
    spEvent = "damage";
    spCtx = { dmgAmount: Math.abs(hd), hpFrac: human.points / (human.character.stats.startingPoints || MAX_HP) };
  }
  if (spEvent) {
    const sp = mountSpeaker(host, human.character, spEvent, spCtx, "left");
    if (sp) host.classList.add("has-speaker");
  }

  el("pb-next-btn").onclick = () => {
    host.classList.remove("show", "has-speaker", "ko");
    host.classList.add("hidden");
    host.innerHTML = "";
    onDone();
  };
}

// 団体戦・飛びカットイン。撃沈したメンバーを大きく見せ、続けて親満（FLYING_PENALTY）
// 払いの数字を叩きつける。SE は 布団に倒れ込む（撃沈）→ 金額表示（親満払い）。
// クリック or 一定時間で onDone（＝ダメージカード表示）へ。
function showFlyingCutIn(flyEvents, onDone) {
  const host = el("damage-overlay");
  const items = flyEvents
    .map((f) => {
      const teamLbl = f.teamIdx === humanIndex ? "自チーム" : `チーム ${relSeatLabel(f.teamIdx)}`;
      return `<div class="fly-cut-item">
        <div class="fly-cut-team">${teamLbl}</div>
        <div class="fly-cut-headline"><span class="fly-cut-x">✕</span><b style="color:${f.color}">${f.name}</b> 撃沈！</div>
        <div class="fly-cut-pen">親満払い <b class="fly-cut-pen-num">−${f.penalty.toLocaleString()}</b></div>
      </div>`;
    })
    .join("");
  host.innerHTML = `<div class="fly-cut">
    <div class="fly-cut-title">飛び —— 親満ペナルティ</div>
    ${items}
  </div>`;
  host.classList.remove("hidden");
  requestAnimationFrame(() => host.classList.add("show", "fly-cut-mode"));
  audio.playSe(sePath("布団に倒れ込む.mp3"), 1.0);                       // 撃沈
  setTimeout(() => audio.playSe(sePath("金額表示.mp3"), 1.0), 620);      // 親満払いを叩きつけ
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(t);
    host.onclick = null;
    host.classList.remove("show", "fly-cut-mode");
    host.classList.add("hidden");
    host.innerHTML = "";
    onDone();
  };
  setTimeout(() => { host.onclick = finish; }, 800);
  const t = setTimeout(finish, 2600);
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
  if (teamBattleData) { showTeamBattleGameOver(); return; }
  if (pairBattleData) { showPairBattleGameOver(); return; }
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
    const face = faceMarkup(c, "go-face", iconUrl)
      || `<div class="go-face go-face-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
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
  const endLine = vline(human.character.id, "matchEnd", { rankIndex: hRank, numPlayers: N });
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

  // 得点推移：終局スナップショットを足し、どのモードでもグラフを開ける。
  scoreHistory.push({ label: "終局", points: game.players.map((p) => p.points) });
  const graphPlayers = game.players.map((p, i) => ({ name: p.character.name, color: p.character.color || "#9aa", isHuman: i === humanIndex }));
  const graphSnapshot = scoreHistory.slice();
  overlay.querySelector(".go-buttons").appendChild(mkBtn("📈 得点推移", "btn-tsumo go-graph-btn", () => showScoreGraph(graphSnapshot, graphPlayers)));

  // 本気対局（Phase 4A）は「もう一度(reload)」ではなく結果を育成へ返して戻る。
  if (honestCtx) {
    const standings = ranks.map((p, i) => ({ id: p.character.id, name: p.character.name, points: p.points, rank: i, isHuman: p === human }));
    const result = { placement: hRank, numPlayers: N, finalPoints: human.points, won: hRank === 0, standings, graph: { history: graphSnapshot, players: graphPlayers } };
    const ctx = honestCtx; honestCtx = null;
    const go = (action) => { overlay.classList.add("hidden"); ctx.onResult?.(result, action); };
    const btns = overlay.querySelector(".go-buttons");
    if (ctx.tournament) {
      // 大会（M リーグ）：この節の結果 → 順位表へ。
      const note = document.createElement("div");
      note.className = "go-tourney-note";
      note.textContent = `${ctx.matchLabel || "大会"}　この節：${hRank + 1} 位`;
      btns.parentElement.insertBefore(note, btns);
      btns.appendChild(mkBtn("順位表へ", "btn-tsumo", () => go("continue")));
    } else {
      btns.appendChild(mkBtn("師弟ホームへ", "btn-tsumo", () => go()));
    }
  } else {
    overlay.querySelector(".go-buttons").appendChild(mkBtn("もう一度", "btn-tsumo", () => location.reload()));
  }
}

// 団体戦の対局終了: 順位は「チーム得点（3人の合計HP）」で集計。優勝チームのエースを
// 立ち絵で大きく見せ、3人トリオ（撃沈メンバーは灰色）と合計点をチームごとに並べる。
function showTeamBattleGameOver() {
  clearActions();
  const overlay = el("win-overlay");
  overlay.classList.remove("hidden");
  const teams = teamBattleData.teams;
  // 順位はチーム点数（score）で集計。HP合計ではない。
  const totalOf = (t) => t.score;
  const fullOf = (t) => t.chars.reduce((a, c) => a + (c?.stats.startingPoints || MAX_HP), 0);
  // チーム index をチーム点数の降順に
  const order = teams.map((_, i) => i).sort((a, b) => totalOf(teams[b]) - totalOf(teams[a]));
  const N = order.length;
  const top = Math.max(...order.map((i) => totalOf(teams[i])), 1);
  const reveal = (i) => (N - 1 - i) * 0.45;
  const teamLabelOf = (i) => (i === humanIndex ? "自チーム" : `チーム ${relSeatLabel(i)}`);
  // チーム内の代表（生存最高HP、全滅なら先頭）。エース立ち絵＆セリフ主に使う。
  const repIdxOf = (t) => {
    let best = 0;
    for (let m = 1; m < t.chars.length; m++) if (t.hps[m] > t.hps[best]) best = m;
    return best;
  };
  // 3人トリオの小顔（撃沈は灰色）。
  const trio = (t) =>
    t.chars
      .map((c, m) => {
        if (!c) return "";
        const u = charImages.url(c, "icon") || charImages.url(c, "portrait");
        const fallen = t.hps[m] <= 0 ? " fallen" : "";
        if (u && c.isMob)
          return `<div class="go-team-face${fallen} is-mob-face" style="--mob-sil:url('${u}')" title="${c.name}"></div>`;
        return u
          ? `<img class="go-team-face${fallen}" src="${u}" alt="" title="${c.name}">`
          : `<div class="go-team-face go-team-face-fb${fallen}" style="--c:${c.color}" title="${c.name}">${[...c.name][0] || "?"}</div>`;
      })
      .join("");

  const champIdx = order[0];
  const champTeam = teams[champIdx];
  const ace = champTeam.chars[repIdxOf(champTeam)];
  const portraitUrl = charImages.url(ace, "portrait");
  const champArt = portraitUrl
    ? `<img class="go-champ-portrait" src="${portraitUrl}" alt="${ace.name}">`
    : `<div class="go-champ-portrait go-champ-fb" style="--char-color:${ace.color}">${[...ace.name][0] || "?"}</div>`;

  const rows = order
    .map((ti, i) => {
      const t = teams[ti];
      const tot = totalOf(t);
      const w = Math.max(2, Math.min(100, (tot / top) * 100)); // 長さ＝首位チーム比
      const frac = tot / (fullOf(t) || 1);
      const tier = frac <= 0.25 ? "low" : frac <= 0.5 ? "mid" : "high"; // 色＝チーム体力
      return `
        <div class="go-rank-row r${i + 1}" style="animation-delay:${reveal(i)}s">
          <div class="go-medal m${i + 1}">${i + 1}</div>
          <div class="go-team-faces">${trio(t)}</div>
          <div class="go-rank-info">
            <div class="go-rank-name${ti === humanIndex ? " mine" : ""}">${teamLabelOf(ti)}</div>
            <div class="hpbar go-bar"><div class="hpfill ${tier}" style="width:${w}%"></div></div>
          </div>
          <div class="go-rank-pts" data-pts="${tot}">0</div>
        </div>`;
    })
    .join("");

  overlay.innerHTML = `
    <div class="go-screen">
      <div class="win-sparkles">${sparkleSpans(22)}</div>
      <div class="go-banner">対局終了</div>
      <div class="go-champion" style="animation-delay:${reveal(0)}s">
        <div class="go-crown">👑</div>
        ${champArt}
        <div class="go-champ-tag">
          <span class="go-champ-badge">優勝</span>
          <span class="go-champ-name" style="color:${ace.color}">${teamLabelOf(champIdx)}</span>
        </div>
        <div class="go-champ-trio">${trio(champTeam)}</div>
      </div>
      <div class="go-ranks">${rows}</div>
      <div class="win-buttons go-buttons"></div>
    </div>`;

  // チーム得点を 0 → 最終値へカウントアップ（行の出るタイミングに合わせて）。
  overlay.querySelectorAll(".go-rank-pts").forEach((node, idx) => {
    const pts = +node.dataset.pts;
    setTimeout(() => tweenNum(node, 0, pts, 650, (v) => v.toLocaleString()), reveal(idx) * 1000 + 240);
  });
  setTimeout(() => audio.playSe(sePath("シャキーン1.mp3"), 0.9), reveal(0) * 1000 + 120);

  // 自チームの順位帯に応じた台詞（代表キャラが話す）。
  const humanRank = order.indexOf(humanIndex);
  const rep = teams[humanIndex].chars[repIdxOf(teams[humanIndex])];
  const endLine = vline(rep.id, "matchEnd", { rankIndex: humanRank, numPlayers: N });
  const sideEl = document.querySelector("#game-screen .side");
  if (endLine && sideEl) {
    setTimeout(() => {
      sideEl.classList.add("side-result");
      const old = sideEl.querySelector(".speaker");
      if (old) old.remove();
      const sp = buildSpeakerEl(rep, endLine, "side");
      sideEl.appendChild(sp);
      requestAnimationFrame(() => sp.classList.add("show"));
    }, reveal(0) * 1000 + 650);
  }

  // 大会（団体M リーグ）：4チームの結果をユニット順位として大会へ返す。
  const btnsT = overlay.querySelector(".go-buttons");
  if (honestCtx?.tournament && teamBattleData.unitIds) {
    const standings = order.map((ti, i) => ({ id: teamBattleData.unitIds[ti], name: teamLabelOf(ti), points: totalOf(teams[ti]), rank: i, isHuman: ti === humanIndex }));
    const graph = buildTournamentGraph();
    const result = { standings, placement: order.indexOf(humanIndex), won: order[0] === humanIndex, graph };
    const ctx = honestCtx; honestCtx = null;
    const note = document.createElement("div");
    note.className = "go-tourney-note";
    note.textContent = `${ctx.matchLabel || "大会"}　この節：${order.indexOf(humanIndex) + 1} 位`;
    btnsT.parentElement.insertBefore(note, btnsT);
    btnsT.appendChild(mkBtn("順位表へ", "btn-tsumo", () => { overlay.classList.add("hidden"); ctx.onResult?.(result, "continue"); }));
  } else {
    btnsT.appendChild(mkBtn("もう一度", "btn-tsumo", () => location.reload()));
  }
}

// ペア戦の結果画面。団体戦版と同じ「ペア点数の降順ランキング＋優勝ペア」。
// 各ペアの顔は2人（ダウンは灰）。代表＝ペア内のHP高い方。
function showPairBattleGameOver() {
  clearActions();
  const overlay = el("win-overlay");
  overlay.classList.remove("hidden");
  const pairs = pairBattleData.pairs;
  const myPair = pairBattleData.pairOf[humanIndex];
  const totalOf = (pid) => pairBattleData.pairScore[pid];
  const fullOf = (pid) => pairs[pid].seats.reduce((a, s) => a + (pairBattleData.chars[s].stats.startingPoints || MAX_HP), 0);
  // 順位はペア点数の降順。同点なら合計HP（着席ダウンは0扱い）が高い方が上＝決着（仕様E）。
  const hpTotalOf = (pid) => pairs[pid].seats.reduce((a, s) => a + Math.max(0, pairBattleData.hp[s]), 0);
  const order = pairs.map((_, pid) => pid).sort((a, b) => totalOf(b) - totalOf(a) || hpTotalOf(b) - hpTotalOf(a));
  const N = order.length;
  const top = Math.max(...order.map((pid) => totalOf(pid)), 1);
  const reveal = (i) => (N - 1 - i) * 0.45;
  const pairLabelOf = (pid) => (pid === myPair ? "自ペア" : "相手ペア");
  // ペア内代表（HP高い方）。立ち絵＆セリフ主に使う。
  const repSeatOf = (pid) => pairs[pid].seats.reduce((b, s) => (pairBattleData.hp[s] > pairBattleData.hp[b] ? s : b), pairs[pid].seats[0]);
  // ペアの2人の小顔（HP0は灰色）。HP高い方を先に。
  const duo = (pid) =>
    [...pairs[pid].seats]
      .sort((a, b) => pairBattleData.hp[b] - pairBattleData.hp[a])
      .map((s) => {
        const c = pairBattleData.chars[s];
        const u = charImages.url(c, "icon") || charImages.url(c, "portrait");
        const fallen = pairBattleData.hp[s] <= 0 ? " fallen" : "";
        if (u && c.isMob)
          return `<div class="go-team-face${fallen} is-mob-face" style="--mob-sil:url('${u}')" title="${c.name}"></div>`;
        return u
          ? `<img class="go-team-face${fallen}" src="${u}" alt="" title="${c.name}">`
          : `<div class="go-team-face go-team-face-fb${fallen}" style="--c:${c.color}" title="${c.name}">${[...c.name][0] || "?"}</div>`;
      })
      .join("");

  const champPid = order[0];
  const ace = pairBattleData.chars[repSeatOf(champPid)];
  // 優勝ペアの2人を立ち絵で並べて見せる（共闘優勝）。HP高い方＝エースを前(1番目)に。
  const champSeats = [...pairs[champPid].seats].sort((a, b) => pairBattleData.hp[b] - pairBattleData.hp[a]);
  const champPortrait = (seat) => {
    const c = pairBattleData.chars[seat];
    const u = charImages.url(c, "portrait");
    const fallen = pairBattleData.hp[seat] <= 0 ? " fallen" : "";
    return u
      ? `<img class="go-champ-portrait${fallen}" src="${u}" alt="${c.name}">`
      : `<div class="go-champ-portrait go-champ-fb${fallen}" style="--char-color:${c.color}">${[...c.name][0] || "?"}</div>`;
  };
  const champDuoArt = `<div class="go-champ-duo">${champSeats.map(champPortrait).join("")}</div>`;
  const champNamesHtml = champSeats
    .map((s) => `<span style="color:${pairBattleData.chars[s].color}">${pairBattleData.chars[s].name}</span>`)
    .join('<span class="go-champ-amp">＆</span>');

  const rows = order
    .map((pid, i) => {
      const tot = totalOf(pid);
      const w = Math.max(2, Math.min(100, (tot / top) * 100));
      const frac = tot / (fullOf(pid) || 1);
      const tier = frac <= 0.25 ? "low" : frac <= 0.5 ? "mid" : "high";
      return `
        <div class="go-rank-row r${i + 1}" style="animation-delay:${reveal(i)}s">
          <div class="go-medal m${i + 1}">${i + 1}</div>
          <div class="go-team-faces">${duo(pid)}</div>
          <div class="go-rank-info">
            <div class="go-rank-name${pid === myPair ? " mine" : ""}">${pairLabelOf(pid)}</div>
            <div class="hpbar go-bar"><div class="hpfill ${tier}" style="width:${w}%"></div></div>
          </div>
          <div class="go-rank-pts" data-pts="${tot}">0</div>
        </div>`;
    })
    .join("");

  overlay.innerHTML = `
    <div class="go-screen">
      <div class="win-sparkles">${sparkleSpans(22)}</div>
      <div class="go-banner">対局終了</div>
      <div class="go-champion go-champion-pair" style="animation-delay:${reveal(0)}s">
        <div class="go-crown">👑</div>
        ${champDuoArt}
        <div class="go-champ-tag">
          <span class="go-champ-badge">優勝ペア</span>
          <span class="go-champ-name go-champ-pairname">${champNamesHtml}</span>
        </div>
        <div class="go-champ-sub">${pairLabelOf(champPid)}・共闘優勝</div>
      </div>
      <div class="go-ranks">${rows}</div>
      <div class="win-buttons go-buttons"></div>
    </div>`;

  overlay.querySelectorAll(".go-rank-pts").forEach((node, idx) => {
    const pts = +node.dataset.pts;
    setTimeout(() => tweenNum(node, 0, pts, 650, (v) => v.toLocaleString()), reveal(idx) * 1000 + 240);
  });
  setTimeout(() => audio.playSe(sePath("シャキーン1.mp3"), 0.9), reveal(0) * 1000 + 120);

  // 自ペアの順位に応じた代表キャラの台詞。
  const humanPairRank = order.indexOf(myPair);
  const rep = pairBattleData.chars[repSeatOf(myPair)];
  const endLine = vline(rep.id, "matchEnd", { rankIndex: humanPairRank, numPlayers: N });
  const sideEl = document.querySelector("#game-screen .side");
  if (endLine && sideEl) {
    setTimeout(() => {
      sideEl.classList.add("side-result");
      const old = sideEl.querySelector(".speaker");
      if (old) old.remove();
      const sp = buildSpeakerEl(rep, endLine, "side");
      sideEl.appendChild(sp);
      requestAnimationFrame(() => sp.classList.add("show"));
    }, reveal(0) * 1000 + 650);
  }

  // 大会（ペアM リーグ）：2ペアの結果をユニット順位として大会へ返す。
  const btnsP = overlay.querySelector(".go-buttons");
  if (honestCtx?.tournament && pairBattleData.unitIds) {
    const standings = order.map((pid, i) => ({ id: pairBattleData.unitIds[pid], name: pairLabelOf(pid), points: totalOf(pid), rank: i, isHuman: pid === myPair }));
    const graph = buildTournamentGraph();
    const result = { standings, placement: order.indexOf(myPair), won: order[0] === myPair, graph };
    const ctx = honestCtx; honestCtx = null;
    const note = document.createElement("div");
    note.className = "go-tourney-note";
    note.textContent = `${ctx.matchLabel || "大会"}　この節：${order.indexOf(myPair) + 1} 位`;
    btnsP.parentElement.insertBefore(note, btnsP);
    btnsP.appendChild(mkBtn("順位表へ", "btn-tsumo", () => { overlay.classList.add("hidden"); ctx.onResult?.(result, "continue"); }));
  } else {
    btnsP.appendChild(mkBtn("もう一度", "btn-tsumo", () => location.reload()));
  }
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

// オート観戦トグル。フリー対戦時のみ表示し、ON で人間席を CPU AI に委ねる（loop /
// handleCalls 側が autoPlay を見て分岐）。団体戦・シナリオでは体感の主役が消えるため
// 非表示＋強制 OFF にする（CLAUDE.md の核: フリー限定が正しい）。
let autoWired = false;
function initAutoToggle() {
  const btn = el("auto-btn");
  if (!btn) return;
  const freeMatch = !teamBattleData; // 団体戦は teamBattleData が立つ。フリーのみ許可。
  if (!freeMatch) { autoPlay = false; btn.classList.add("hidden"); return; }
  btn.classList.remove("hidden");
  const sync = () => {
    btn.classList.toggle("on", autoPlay);
    btn.setAttribute("aria-pressed", String(autoPlay));
    btn.textContent = `オート: ${autoPlay ? "ON" : "OFF"}`;
  };
  if (!autoWired) {
    btn.addEventListener("click", () => {
      autoPlay = !autoPlay;
      sync();
      // OFF→ON を自分の手番中に押したら、その場で AI に手を進めさせる。
      // cpuActionPending 中（前回キックの待ち時間中）は再キックしない＝二重 setTimeout を防ぐ。
      if (autoPlay && !cpuActionPending && game && game.phase === Phase.AWAIT_DISCARD && game.players[game.turn].isHuman) loop();
    });
    autoWired = true;
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
  board.className = "hp-board";
  if (teamBattleData) { buildTeamBattleHpBoard(board); return; }
  if (pairBattleData) { buildPairBattleHpBoard(board); return; }
  if (game.futari) { buildFutariHpBoard(board); return; }
  el("self-stage")?.classList.remove("hidden");
  const N = game.numPlayers;
  board.classList.toggle("p3", N === 3);
  hpCells = {};
  // 自分起点で卓を回る順に並べ替え（自分→下家→対面→上家）。
  const order = [...game.players.keys()].sort(
    (a, b) => ((a - humanIndex + N) % N) - ((b - humanIndex + N) % N)
  );
  for (const i of order) board.appendChild(makeHpRow(i));
  buildSelfBustup();
  updateHpBoard();
}

// 1人ぶんのHPバー行を生成し、hpCells に参照を登録して返す。buildHpBoard と
// 二人麻雀ボードで共用。
function makeHpRow(i) {
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
    <div class="hp-gauge"><div class="hp-base"></div><div class="hp-fill"></div></div>`;
  row.appendChild(main);

  // 短文紹介ポップ（キャラ選択のホバーと同じ bio＋profile）。
  if (c.bio || c.profile) {
    const fl = document.createElement("div");
    fl.className = "hp-flavor";
    fl.innerHTML = `${c.bio ? `<div class="hp-flavor-bio">${c.bio}</div>` : ""}${c.profile ? `<div class="hp-flavor-profile">${c.profile}</div>` : ""}`;
    row.appendChild(fl);
  }

  hpCells[i] = { cell: row, rank, base: main.querySelector(".hp-base"), fill: main.querySelector(".hp-fill"), val: main.querySelector(".hp-val") };
  return row;
}

// ---- 二人麻雀 HP ボード ----
// 「師匠との修行」を意識し、相手(師匠)を上に大きく置く固定レイアウト:
//   ① 相手HP ② 相手立ち絵 ③ 自分HP ④ 自分立ち絵(self-stage)
// updateHpBoard は futari では並べ替えしない（DOM順固定）。
function buildFutariHpBoard(board) {
  board.classList.add("futari");
  el("self-stage")?.classList.remove("hidden");
  hpCells = {};
  const oppIndex = game.players.findIndex((_, i) => i !== humanIndex);

  board.appendChild(makeHpRow(oppIndex));            // ① 相手HP

  const oppStage = document.createElement("div");    // ② 相手立ち絵
  oppStage.className = "opp-bustup";
  fillPortrait(oppStage, game.players[oppIndex].character);
  board.appendChild(oppStage);

  board.appendChild(makeHpRow(humanIndex));          // ③ 自分HP

  buildSelfBustup();                                 // ④ 自分立ち絵(self-stage)
  updateHpBoard();
}

// ---- 団体戦 HP ボード ----
function buildTeamBattleHpBoard(board) {
  board.classList.add("team-battle");
  teamHpCells = {};
  el("self-stage")?.classList.add("hidden");
  const N = game.numPlayers;
  const order = [...game.players.keys()].sort(
    (a, b) => ((a - humanIndex + N) % N) - ((b - humanIndex + N) % N)
  );
  for (const pi of order) {
    const team = teamBattleData.teams[pi];
    const isMyTeam = pi === humanIndex;
    const block = document.createElement("div");
    block.className = "tb-block" + (isMyTeam ? " my-team" : "");
    // ヘッダー（順位メダル＋ラベル｜チーム合計）
    const header = document.createElement("div");
    header.className = "tb-header";
    const headLeft = document.createElement("div");
    headLeft.className = "tb-head-left";
    const rankEl = document.createElement("div");
    rankEl.className = "tb-rank";
    const labelSpan = document.createElement("span");
    labelSpan.className = "tb-label";
    labelSpan.textContent = isMyTeam ? "▶ 自チーム" : `チーム ${relSeatLabel(pi)}`;
    headLeft.appendChild(rankEl);
    headLeft.appendChild(labelSpan);
    const totalEl = document.createElement("span");
    totalEl.className = "tb-total";
    header.appendChild(headLeft);
    header.appendChild(totalEl);
    block.appendChild(header);
    // 出場中メンバー行
    const activeChar = team.chars[team.activeIdx];
    const activeRow = document.createElement("div");
    activeRow.className = "tb-active";
    activeRow.innerHTML = `<div class="tb-dot" style="--c:${activeChar.color}"></div>`;
    const activeIconWrap = document.createElement("div");
    activeIconWrap.className = "tb-icon";
    activeIconWrap.appendChild(makeCharIcon(activeChar));
    activeRow.appendChild(activeIconWrap);
    const activeInfo = document.createElement("div");
    activeInfo.className = "tb-info";
    const activeFill = document.createElement("div");
    activeFill.className = "hp-fill";
    activeInfo.innerHTML = `<div class="tb-name" style="color:${activeChar.color}">${activeChar.name}</div>`;
    activeInfo.innerHTML += `<div class="hp-gauge"></div>`;
    activeInfo.querySelector(".hp-gauge").appendChild(activeFill);
    activeRow.appendChild(activeInfo);
    const activeVal = document.createElement("div");
    activeVal.className = "tb-hp";
    activeRow.appendChild(activeVal);
    block.appendChild(activeRow);
    // セリフ吹き出し（自チームのみ）
    let talkBubble = null;
    if (isMyTeam) {
      talkBubble = document.createElement("div");
      talkBubble.className = "tb-talk hidden";
      block.appendChild(talkBubble);
    }
    // 待機メンバー行（2人をミニ表示）
    const benchRow = document.createElement("div");
    benchRow.className = "tb-bench-row";
    const benchRefs = [];
    for (let mi = 0; mi < 3; mi++) {
      if (mi === team.activeIdx) continue;
      const mc = team.chars[mi];
      if (!mc) continue;
      const bench = document.createElement("div");
      bench.className = "tb-bench";
      const bIconWrap = document.createElement("div");
      bIconWrap.className = "tb-bench-icon";
      bIconWrap.appendChild(makeCharIcon(mc));
      bench.appendChild(bIconWrap);
      const bInfo = document.createElement("div");
      bInfo.className = "tb-bench-info";
      const bFill = document.createElement("div");
      bFill.className = "hp-fill";
      const bBar = document.createElement("div");
      bBar.className = "tb-bench-bar";
      bBar.appendChild(bFill);
      const bVal = document.createElement("div");
      bVal.className = "tb-bench-val";
      bInfo.appendChild(bBar);
      bInfo.appendChild(bVal);
      bench.appendChild(bInfo);
      benchRow.appendChild(bench);
      benchRefs.push({ memberIdx: mi, fill: bFill, val: bVal, el: bench });
    }
    block.appendChild(benchRow);
    board.appendChild(block);
    teamHpCells[pi] = { block, rankEl, totalEl, activeRow, activeFill, activeVal, talkBubble, benchRefs };
  }
  updateTeamBattleHpBoard(true); // 初期構築時はFLIPアニメ無しで順位配置だけ反映
}

function updateTeamBattleHpBoard(skipAnim = false) {
  if (!teamHpCells || !teamBattleData || !game) return;
  // チーム点数（score）の降順で順位を決め、flex order とメダルに反映する。
  // 同点は安定（teams 配列の並び）。0=1位。
  const teamTotal = (pi) => teamBattleData.teams[pi].score;
  const entries = Object.keys(teamHpCells).map(Number);
  const rankByTeam = {};
  [...entries]
    .sort((a, b) => teamTotal(b) - teamTotal(a))
    .forEach((pi, rank) => { rankByTeam[pi] = rank; });

  // FLIP: 並べ替え前の各ブロック位置を記録（順位が動いたらスライドさせる）。
  const firstTop = {};
  if (!skipAnim) for (const pi of entries) firstTop[pi] = teamHpCells[pi].block.getBoundingClientRect().top;

  for (const [key, refs] of Object.entries(teamHpCells)) {
    const pi = Number(key);
    const team = teamBattleData.teams[pi];
    const activeChar = team.chars[team.activeIdx];
    const full = activeChar.stats.startingPoints || MAX_HP;
    const activeHp = team.hps[team.activeIdx];
    // チーム点数（score）を表示。HP合計ではなく、和了で増える成績スコア。
    const teamScore = team.score;
    const fullTeam = team.chars.reduce((a, c) => a + (c?.stats.startingPoints || 0), 0) || 1;
    refs.totalEl.textContent = teamScore.toLocaleString();
    refs.totalEl.style.color = teamScore < fullTeam * 0.4 ? "var(--danger)" : teamScore < fullTeam ? "var(--accent)" : "";
    // チーム得点による順位＝並び順＋メダル
    const rank = rankByTeam[pi];
    refs.block.style.order = rank;
    if (refs.rankEl) {
      refs.rankEl.textContent = rank + 1;
      refs.rankEl.className = "tb-rank m" + (rank + 1);
    }
    // 出場中
    const pct = Math.max(0, Math.min(100, (activeHp / full) * 100));
    refs.activeFill.style.width = pct + "%";
    refs.activeFill.className = "hp-fill " + (pct <= 25 ? "low" : pct <= 50 ? "mid" : "high");
    refs.activeVal.textContent = activeHp.toLocaleString();
    refs.activeRow.classList.toggle("is-turn", game.turn === pi && game.phase !== Phase.HAND_OVER);
    // 待機
    for (const bench of refs.benchRefs) {
      const bhp = team.hps[bench.memberIdx];
      const bfull = team.chars[bench.memberIdx].stats.startingPoints || MAX_HP;
      const bpct = Math.max(0, Math.min(100, (bhp / bfull) * 100));
      bench.fill.style.width = bpct + "%";
      bench.fill.className = "hp-fill " + (bpct <= 25 ? "low" : bpct <= 50 ? "mid" : "high");
      bench.val.textContent = bhp > 999 ? Math.round(bhp / 1000) + "k" : String(bhp);
      bench.el.classList.toggle("out", bhp <= 0);
    }
  }

  // FLIP: 並べ替え後のズレを一旦打ち消し、次フレームで0へトランジション＝スライド。
  if (!skipAnim) {
    for (const pi of entries) {
      const blk = teamHpCells[pi].block;
      const dy = firstTop[pi] - blk.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      blk.style.transition = "none";
      blk.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        blk.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)";
        blk.style.transform = "";
      });
    }
  }
}

// ---- ペア戦 HP ボード ----
// 団体戦ボードと同じ「順位ソート＋メダル」方式。2ペアをペア点数の降順で 1位/2位 に並べ、
// 各ブロック内の2人は HP の高い方を上に並べる（flex order）。着席ダウン(HP0)は .out 表示。
function buildPairBattleHpBoard(board) {
  board.classList.add("team-battle", "pair-battle");
  pairHpCells = {};
  el("self-stage")?.classList.add("hidden");
  const myPair = pairBattleData.pairOf[humanIndex];
  for (let pid = 0; pid < pairBattleData.pairs.length; pid++) {
    const isMine = pid === myPair;
    const block = document.createElement("div");
    block.className = "tb-block" + (isMine ? " my-team" : "");
    // ヘッダー（順位メダル＋ラベル｜ペア合計点）
    const header = document.createElement("div");
    header.className = "tb-header";
    const headLeft = document.createElement("div");
    headLeft.className = "tb-head-left";
    const rankEl = document.createElement("div");
    rankEl.className = "tb-rank";
    const labelSpan = document.createElement("span");
    labelSpan.className = "tb-label";
    labelSpan.textContent = isMine ? "▶ 自ペア" : "相手ペア";
    headLeft.appendChild(rankEl);
    headLeft.appendChild(labelSpan);
    const totalEl = document.createElement("span");
    totalEl.className = "tb-total";
    header.appendChild(headLeft);
    header.appendChild(totalEl);
    block.appendChild(header);
    // メンバー2人（HP順は update でflex orderにより並べ替え）
    const membersWrap = document.createElement("div");
    membersWrap.className = "pb-members";
    const memberRefs = [];
    for (const seat of pairBattleData.pairs[pid].seats) {
      const c = pairBattleData.chars[seat];
      const row = document.createElement("div");
      row.className = "tb-active pb-member";
      row.innerHTML = `<div class="tb-dot" style="--c:${c.color}"></div>`;
      const iconWrap = document.createElement("div");
      iconWrap.className = "tb-icon";
      iconWrap.appendChild(makeCharIcon(c));
      row.appendChild(iconWrap);
      const info = document.createElement("div");
      info.className = "tb-info";
      info.innerHTML = `<div class="tb-name" style="color:${c.color}">${c.name}</div><div class="hp-gauge"><div class="hp-fill"></div></div>`;
      row.appendChild(info);
      const val = document.createElement("div");
      val.className = "tb-hp";
      row.appendChild(val);
      membersWrap.appendChild(row);
      memberRefs.push({ seat, row, fill: info.querySelector(".hp-fill"), val });
    }
    block.appendChild(membersWrap);
    // セリフ吹き出し（自ペアのみ・Phase3で発火）
    let talkBubble = null;
    if (isMine) {
      talkBubble = document.createElement("div");
      talkBubble.className = "tb-talk hidden";
      block.appendChild(talkBubble);
    }
    board.appendChild(block);
    pairHpCells[pid] = { block, rankEl, totalEl, memberRefs, talkBubble };
  }
  updatePairBattleHpBoard(true); // 初期はFLIPなしで配置のみ
}

function updatePairBattleHpBoard(skipAnim = false) {
  if (!pairHpCells || !pairBattleData || !game) return;
  const pairTotal = (pid) => pairBattleData.pairScore[pid];
  // 同点時は合計HP（着席ダウンは0扱い）で決する＝結果画面と同じ基準（仕様E）。
  const hpTotalOf = (pid) => pairBattleData.pairs[pid].seats.reduce((a, s) => a + Math.max(0, pairBattleData.hp[s]), 0);
  const pids = Object.keys(pairHpCells).map(Number);
  const rankByPair = {};
  [...pids].sort((a, b) => pairTotal(b) - pairTotal(a) || hpTotalOf(b) - hpTotalOf(a)).forEach((pid, rank) => { rankByPair[pid] = rank; });

  // FLIP: 並べ替え前のブロック位置を記録。
  const firstTop = {};
  if (!skipAnim) for (const pid of pids) firstTop[pid] = pairHpCells[pid].block.getBoundingClientRect().top;

  for (const [key, refs] of Object.entries(pairHpCells)) {
    const pid = Number(key);
    const score = pairBattleData.pairScore[pid];
    const fullPair = pairBattleData.pairs[pid].seats.reduce((a, s) => a + (pairBattleData.chars[s].stats.startingPoints || 0), 0) || 1;
    refs.totalEl.textContent = score.toLocaleString();
    refs.totalEl.style.color = score < fullPair * 0.4 ? "var(--danger)" : score < fullPair ? "var(--accent)" : "";
    // ペア点数の順位＝並び順＋メダル
    const rank = rankByPair[pid];
    refs.block.style.order = rank;
    refs.rankEl.textContent = rank + 1;
    refs.rankEl.className = "tb-rank m" + (rank + 1);
    // ブロック内の2人は HP 降順（高い方を上）。flex order で並べ替え。
    [...refs.memberRefs]
      .sort((a, b) => pairBattleData.hp[b.seat] - pairBattleData.hp[a.seat])
      .forEach((m, idx) => { m.row.style.order = idx; });
    for (const m of refs.memberRefs) {
      const hp = pairBattleData.hp[m.seat];
      const full = pairBattleData.chars[m.seat].stats.startingPoints || MAX_HP;
      const pct = Math.max(0, Math.min(100, (hp / full) * 100));
      m.fill.style.width = pct + "%";
      m.fill.className = "hp-fill " + (pct <= 25 ? "low" : pct <= 50 ? "mid" : "high");
      m.val.textContent = hp.toLocaleString();
      m.row.classList.toggle("is-turn", game.turn === m.seat && game.phase !== Phase.HAND_OVER);
      m.row.classList.toggle("out", hp <= 0); // 着席ダウン
    }
  }

  // FLIP: ズレを打ち消して0へトランジション＝スライド。
  if (!skipAnim) {
    for (const pid of pids) {
      const blk = pairHpCells[pid].block;
      const dy = firstTop[pid] - blk.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      blk.style.transition = "none";
      blk.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        blk.style.transition = "transform .45s cubic-bezier(.2,.8,.2,1)";
        blk.style.transform = "";
      });
    }
  }
}

// 団体戦の親満ペナルティ（飛ばした相手への支払い相当）。1人飛ぶとチームへ課す額。
const FLYING_PENALTY = 12000;
// CPUが温存交代を選ぶHP差のしきい値。出場中HPが控え最高HPよりこれ以上低いと交代。
const CPU_SWAP_MARGIN = 9000;

// 飛び（撃沈）の親満ペナルティ。親満払いは「点棒」なのでチーム点数(score)から減算する。
// HPは撃沈＝0で表現済みなのでHPからは引かない。減算額を返す。
function applyFlyingPenalty(team) {
  team.score -= FLYING_PENALTY;
  return FLYING_PENALTY;
}

// CPUチームの自動交代。出場中が飛んでいれば生存最高HPへ強制交代。飛んでいなくても
// 出場中HPが控え最高HPより CPU_SWAP_MARGIN 以上低ければ温存のため交代する。
// 実際に行った交代イベントの配列を返す（交代演出用）。
function cpuAutoSwap() {
  const events = [];
  for (let i = 0; i < game.numPlayers; i++) {
    if (i === humanIndex) continue;
    const team = teamBattleData.teams[i];
    const ai = team.activeIdx;
    const others = team.chars
      .map((c, mi) => mi)
      .filter((mi) => mi !== ai && team.chars[mi] && team.hps[mi] > 0);
    if (others.length === 0) continue;
    const best = others.reduce((b, mi) => (team.hps[mi] > team.hps[b] ? mi : b), others[0]);
    const mustSwap = team.hps[ai] <= 0;
    const wantSwap = team.hps[best] - team.hps[ai] >= CPU_SWAP_MARGIN;
    if (mustSwap || wantSwap) {
      const ev = executeTeamSwap(i, best);
      if (ev) events.push(ev);
    }
  }
  return events;
}

// 団体戦: 出場キャラを交代する。game.players の character と points を差し替える。
// 成功時は交代イベント {teamIdx, outChar, inChar} を返す（失敗時 null）。
function executeTeamSwap(teamIdx, newMemberIdx) {
  const team = teamBattleData.teams[teamIdx];
  if (newMemberIdx === team.activeIdx || team.hps[newMemberIdx] <= 0) return null;
  const outChar = team.chars[team.activeIdx];
  // 交代前メンバーの HP を game の持ち点で上書き保存（飛んでいれば0でクランプ）。
  // abilities インスタンスは abilitiesByMember に保持され続けているので、出場中に
  // 消費した使用回数（charges）はそのまま残る（明示的な保存は不要）。
  team.hps[team.activeIdx] = Math.max(0, game.players[teamIdx].points);
  // 新メンバーに切り替え。キャラ・持ち点・能力インスタンスをまとめて差し替える。
  // 能力は新メンバー固有のインスタンスへ。過去に出場していれば game-scoped の
  // 使用回数がそのインスタンスに残ったまま引き継がれる。
  team.activeIdx = newMemberIdx;
  const inChar = team.chars[newMemberIdx];
  game.players[teamIdx].character = inChar;
  game.players[teamIdx].points = team.hps[newMemberIdx];
  if (team.abilitiesByMember) {
    game.players[teamIdx].abilities = team.abilitiesByMember[newMemberIdx];
  }
  // HPボードと立ち絵を再構築（能力バーは次局の自分の手番で再描画される）
  buildHpBoard();
  if (teamIdx === humanIndex) buildSelfBustup();
  return { teamIdx, outChar, inChar };
}

// 団体戦: メンバー交代演出。交代したチームぶん out → in を並べて見せ、クリック or
// 2.2秒で次局へ。damage-overlay を再利用する（ダメージカードはすでに閉じている）。
function showSwapFx(swaps, onDone) {
  const host = el("damage-overlay");
  const face = (c) => {
    const u = charImages.url(c, "icon") || charImages.url(c, "portrait");
    return u
      ? `<img class="swapfx-face" src="${u}" alt="">`
      : `<div class="swapfx-face swapfx-face-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
  };
  const rows = swaps
    .map((s) => {
      const lbl = s.teamIdx === humanIndex ? "自チーム" : `チーム ${relSeatLabel(s.teamIdx)}`;
      return `<div class="swapfx-row${s.teamIdx === humanIndex ? " mine" : ""}">
        <div class="swapfx-team">${lbl}</div>
        <div class="swapfx-pair">
          <div class="swapfx-mem leaving">${face(s.outChar)}<span class="swapfx-nm" style="color:${s.outChar.color}">${s.outChar.name}</span></div>
          <div class="swapfx-arrow">➜</div>
          <div class="swapfx-mem entering">${face(s.inChar)}<span class="swapfx-nm" style="color:${s.inChar.color}">${s.inChar.name}</span></div>
        </div>
      </div>`;
    })
    .join("");
  host.innerHTML = `<div class="dmg-card swapfx-card">
    <div class="dmg-head">メンバー交代</div>
    <div class="swapfx-rows">${rows}</div>
    <div class="dmg-hint">クリックで次へ</div>
  </div>`;
  host.classList.remove("hidden");
  requestAnimationFrame(() => host.classList.add("show"));
  audio.playSe(sePath("ふすまを開ける1.mp3"), 0.8); // 交代＝登場の和風SE
  // 自チームの登場キャラに一言（共在感＝相棒のぶんも背負う）。
  const mySwap = swaps.find((s) => s.teamIdx === humanIndex);
  if (mySwap) {
    const sp = mountSpeaker(host, mySwap.inChar, "swapIn", {}, "left");
    if (sp) host.classList.add("has-speaker");
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(t);
    host.onclick = null;
    host.classList.remove("show", "has-speaker");
    host.classList.add("hidden");
    host.innerHTML = "";
    onDone();
  };
  setTimeout(() => { host.onclick = finish; }, 450);
  const t = setTimeout(finish, 2600);
}

// 右サイド下部の自キャラ・バストアップ（立ち絵）。セリフ枠(#self-talk)の背面に立つ。
// 立ち絵(バストアップ)を host に流し込む。自キャラ・相手キャラ共用。
function fillPortrait(host, c) {
  host.innerHTML = "";
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

function buildSelfBustup() {
  const host = el("self-bustup");
  if (!host || !game) return;
  fillPortrait(host, game.players[humanIndex].character);
}

// 相棒ボードのHP値・ゲージ・手番ハイライト・順位を現在のゲーム状態に同期。
// 持ち点の多い順に並べ替え（flex order）、各行へ順位メダル（1位=上）を振る。
function updateHpBoard() {
  if (teamBattleData) { updateTeamBattleHpBoard(); return; }
  if (pairBattleData) { updatePairBattleHpBoard(); return; }
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
    const { lap, fillPct, basePct } = lapState(p.points, full);
    // 現在の周回ぶん（最前面）。1週目は通常色クラス、2週目以降は固定色を直に当てる。
    ref.fill.style.width = Math.max(0, fillPct) + "%";
    if (lap >= 2) {
      ref.fill.className = "hp-fill lap";
      ref.fill.style.background = lapColor(lap);
    } else {
      ref.fill.style.background = "";
      ref.fill.className = "hp-fill " + (fillPct <= 25 ? "low" : fillPct <= 50 ? "mid" : "high");
    }
    // 完了済み周回ぶん（背面の満タンベース）。lap>=2 のときだけ直前周回色で敷く。
    if (ref.base) {
      ref.base.style.width = basePct + "%";
      ref.base.style.background = lap >= 2 ? lapBaseColor(lap - 1) : "";
    }
    ref.val.textContent = p.points;
    ref.cell.classList.toggle("lap2", lap >= 2); // 周回中フック（演出用）
    ref.cell.classList.toggle("busted", p.points < 0);
    ref.cell.classList.toggle("is-turn", game.turn === i && game.phase !== Phase.HAND_OVER);
    // 順位＝並び順＋メダル（結果画面の m1..m4 と同じ金/銀/銅/灰）。
    // 二人麻雀は固定レイアウト（相手→自分の縦並び）なので並べ替えはしない。
    const rank = rankByIndex[i];
    if (!game.futari) ref.cell.style.order = rank;
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
  showSelfTalk(vline(id, event, {}));
}

// ── ペア戦・相方の局中相槌 ──
// 隣で一緒に打つ相方（自ペアの非人間席）が、味方＝人間プレイヤーの節目に声をかける。
// 文言は characterVoiceMaster の ally* イベント。表示は相棒ボード（自ペアブロック）の吹き出し。
let partnerTalkTimer = null;
function pairPartnerId() {
  if (!pairBattleData) return null;
  const myPair = pairBattleData.pairOf[humanIndex];
  const seat = pairBattleData.pairs[myPair].seats.find((s) => s !== humanIndex);
  return seat != null ? pairBattleData.chars[seat].id : null;
}
function showPartnerTalk(text, ms = 4200) {
  if (!text || !pairHpCells || !pairBattleData) return;
  const myPair = pairBattleData.pairOf[humanIndex];
  const bubble = pairHpCells[myPair]?.talkBubble;
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.remove("hidden");
  clearTimeout(partnerTalkTimer);
  partnerTalkTimer = setTimeout(() => bubble.classList.add("hidden"), ms);
}
// 相方の ally* セリフを引いて吹き出しに出す。未記入テンプレ（［テンプレ］）は黙る。
function firePartnerTalk(event, ctx = {}) {
  if (!pairBattleData || !game || game.phase === Phase.HAND_OVER) return;
  const pid = pairPartnerId();
  if (!pid) return;
  const line = vline(pid, event, ctx);
  if (!line || line.startsWith("［テンプレ］")) return; // 未記入は出さない（grepワードはマスタに残る）
  showPartnerTalk(line);
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
    tsumogiri: 0,        // 連続ツモ切り数
    iishanten: 0,        // 一向聴のまま足踏みした自分の打牌数
    wasTenpai: false,    // 直前まで聴牌していたか
    saidStuck: false,    // 手詰まりセリフを今局すでに出したか
    saidIishanten: false,// イーシャンテン地獄セリフを今局すでに出したか
    saidLast: false,     // 流局間際セリフを今局すでに出したか
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
    // ペア戦: 相方が局頭に声をかける（自分のひと言と被らないよう少しずらす）。
    setTimeout(() => firePartnerTalk("allyHandStart"), 2200);
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
    if (!matchTalk.wasTenpai && sh === 0) { matchTalk.wasTenpai = true; fireSelfTalk("tenpai", { force: true }); setTimeout(() => firePartnerTalk("allyTenpai"), 900); }
    else if (matchTalk.wasTenpai && sh > 0) { matchTalk.wasTenpai = false; fireSelfTalk("tenpaiDrop", { force: true }); }

    if (sh < matchTalk.prevShanten) {
      matchTalk.improveRun++;
      matchTalk.lastImprove = matchTalk.discards;
      // 連続で手が進んだ＝さくさく（聴牌セリフと被らないよう sh>=1 のときだけ）。
      if (matchTalk.improveRun >= 2 && sh >= 1) fireSelfTalk("handSmooth");
    } else {
      matchTalk.improveRun = 0;
      // しばらく進まず、まだ遠い → 手詰まり（1局1回、sh>=2）。
      if (!matchTalk.saidStuck && matchTalk.discards - matchTalk.lastImprove >= 4 && sh >= 2) {
        matchTalk.saidStuck = true;
        fireSelfTalk("handStuck");
        setTimeout(() => firePartnerTalk("allyStuck"), 900);
      }
    }

    // イーシャンテン地獄: 一向聴(sh===1)のまま足踏みが続いたら一度だけ（手詰まりとは別枠）。
    if (sh === 1) {
      matchTalk.iishanten++;
      if (!matchTalk.saidIishanten && matchTalk.iishanten >= 4) {
        matchTalk.saidIishanten = true;
        fireSelfTalk("iishantenHell");
      }
    } else {
      matchTalk.iishanten = 0;
    }
    matchTalk.prevShanten = sh;
  });

  // 流局間際：山が残りわずかになったら一度だけ。
  g.bus.on(Events.TILE_DRAWN, () => {
    if (!matchTalk || matchTalk.saidLast) return;
    if (g.wall.liveRemaining <= 6) { matchTalk.saidLast = true; fireSelfTalk("lastTiles"); setTimeout(() => firePartnerTalk("allyLast"), 900); }
  });
}

initStage(); // fixed 1280x720 stage, scaled to fit the window (letterboxed)
buildSelectScreen();
bootHome();
