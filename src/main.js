// Controller: select screen -> game loop. Drives CPU turns on timers and routes
// human input. Engine stays synchronous; this file owns orchestration & timing.
import { Game, Phase, Events } from "./core/game.js";
import { CHARACTERS, instantiateAbilities, setModelAnswerLevelOverride, getModelAnswerLevelOverride, setMuddyLotusLevelOverride, getMuddyLotusLevelOverride } from "./characters/characters.js";
import { CHARACTER_MASTER, ROLE_MASTER } from "./data/characterMaster.js";
import { applyPortraitCrop, installIconPosStyles } from "./data/imagePos.js";
import { abilityDef } from "./data/abilityMaster.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "./ai/simpleAI.js";
import { CanvasRenderer } from "./ui/canvasRenderer.js";
import { TileImages, CharacterImages, AudioManager, tilePath } from "./ui/assets.js";
import { initSettingsUI, applyAudioSettings, wireSettingsControls } from "./ui/settings.js";
import { showScreen } from "./app/router.js";
import { initStage, clientToLocalFrac } from "./app/stage.js";
import { playScenario } from "./scenario/scenarioPlayer.js";
import { ProfileRepositoryFacade } from "./progression/profileRepositoryFacade.js";
import { signInWithGoogle, signOut, getUser } from "./auth/authService.js";
import { activeAvatar, avatarParams6 } from "./progression/avatarFactory.js";
import { activateAvatar, hydrateRun } from "./progression/avatarRun.js";
import { showAvatarCreate } from "./screens/avatarCreateScreen.js";
import { showAvatarDetail } from "./screens/avatarDetailScreen.js";
import { showMentorEntry } from "./screens/mentorEntryScreen.js";
import { showMentorRoster } from "./screens/mentorRosterScreen.js";
import { showMentorSelect } from "./screens/mentorSelectScreen.js";
import { showAuthPrompt } from "./screens/authPromptModal.js";
import { showConfirm } from "./screens/confirmModal.js";
import { showUsernameModal, normalizeUsername } from "./screens/usernameModal.js";
import { showSyncConflict } from "./screens/syncConflictModal.js";
import { showAccount } from "./screens/accountScreen.js";
import { buildPrologueLines } from "./data/prologueScenario.js";
import { showMentorHome } from "./screens/mentorHomeScreen.js";
import { showBattleHome } from "./screens/battleHomeScreen.js";
import { mountHomeCast } from "./screens/homeCast.js";
import { showShop } from "./screens/shopScreen.js";
import { SHOP_BUFFS } from "./data/shopMaster.js";
import { showRest } from "./screens/restScreen.js";
import { showGrowth } from "./screens/growthScreen.js";
import { showAbilityChange } from "./screens/abilityChangeScreen.js";
import { showScenarioList, scenariosForMentor } from "./screens/scenarioListScreen.js";
import { markScenarioRead, tournamentStoryGate, episodeNumberOf } from "./progression/scenarioService.js";
import { showMatchIntro } from "./screens/matchIntroScreen.js";
import { showOnlineLobby, showRoomLobby, makeCode } from "./screens/onlineLobbyScreen.js";
import { showRoomCodeModal } from "./screens/roomCodeModal.js";
import { createLoopback } from "./net/transport.js";
import { AuthorityRoom } from "./net/authorityRoom.js";
import { applyEvent } from "./net/applyEvent.js";
import { connectWebSocket } from "./net/wsTransport.js";
import { showAutoBattle } from "./screens/autoBattleScreen.js";
import { recordOnlineResult, fetchMyOnlineStats } from "./progression/onlineResults.js";
import { defaultRankState, applyMatchToRank, describeRank, seasonIdFromDate } from "./progression/onlineRank.js";
import { pushRanking, fetchLeaderboard, fetchMyStanding } from "./progression/onlineRankRepo.js";
import { showOnlineLeaderboard } from "./screens/onlineLeaderboardScreen.js";
import { skillTemplateById, templateForAbility } from "./data/skillTemplateMaster.js";
import { skillRuntimeAbilityParams, maxSkillLevel } from "./data/skillLevelMaster.js";
import { presetById } from "./data/avatarPresetMaster.js";
import { dayInfo, CONDITIONS, parlorState, visitParlor, applyHonestResult, applyDuoResult, tournamentGate, applyLeagueResult, recordRivalEncounters, mentorGrowthFor } from "./progression/progressionService.js";
import { tournamentRunConfig, oppHpForLv, treasureRankFor, TREASURE_TOURNAMENTS } from "./data/tournamentMaster.js";
import { createAbility } from "./abilities/registry.js";
import { newRun, enemyUnitForFloor, previewBossChars, seatedAllies, partyOrder, runWiped, survivorCount, rogueliteDamageDeltas, explainRogueliteDamage, handsForType, healParty, rollHangover, rollDraft, carrySlotsFor, REGEN_FRAC, shopStock, buyShopItem, shrineOffers, serializeRun, deserializeRun, recruitCandidates, swapPartyMember, growMaxHp, floorOverride, floorWeightMap, chapterEconomy, rollTableSize, tableSizeLabel, isSoloTable, TABLE_SIZE_DIST, gainAbilitySource, spendAbilitySource, ABILITY_SOURCE_MAX, ROGUELITE_SOLO_PENALTY } from "./roguelite/run.js";
import { bossMemoryTier, readBossTally, recordBossOutcome, withBossTally } from "./roguelite/bossMemory.js";
import { chaptersWithState, chapterById, firstChapterId, canOrbUnlock, nextChapterAfter } from "./data/rogueliteChapterMaster.js";
import { ROGUELITE_BEAT_MASTER, beatForFloor } from "./data/rogueliteBeatMaster.js";
import { biomeOf, biomeMods, bandOfFloor, biomeEffectChips, biomeForBand } from "./data/rogueliteBiomeMaster.js";
import { applyCard, applyEffect, clusterDealMul, clusterLevelUp, recomputeClusterCount } from "./roguelite/cardEffects.js";
import { cardById, isGrantCard, ROGUELITE_CARD_MASTER, clusterOf } from "./data/rogueliteCardMaster.js";
import { ROGUELITE_ITEM_MASTER, itemById, drawItems, ITEM_SLOTS, ITEM_KIND_META } from "./data/rogueliteItemMaster.js";
import { useItem, itemMods, consumeBanquetCharm, takeNextBattle, biomeDieId, consumeBiomeDie, consumeBustSaver, consumeHpRaceSaver, hasHpRaceSaver, hasForesight } from "./roguelite/itemEffects.js";
import { rlLog, rlLogAll, rlLogJSONL, rlLogCSV, rlLogDownload, rlLogClear, setRlLogSink, flushRlLog, setRlRunId } from "./roguelite/rogueliteLog.js";
import { supabase } from "./config/supabase.js";
import { bgDef } from "./data/backgroundMaster.js";
import { drawFloorChoices, floorTypeById, BOSS_FLOOR, coinsForClear, forgeCost, forgeOverchargeCost, FORGE_OVERCHARGE_DEAL, SKILL_LEVEL_CAP, RECRUIT_COST } from "./data/rogueliteFloorMaster.js";
import { pickEvent } from "./data/rogueliteEventMaster.js";
import { makeRng } from "./autobattle/autoBattle.js";
import { showRoguelite, showRogueliteDraft, showRogueliteGameOver, showRogueliteRoute, showRoguelitePursue, showRogueliteRest, showRogueliteEvent, showRogueliteShop, showRogueliteSpeak, showRogueliteForge, showRogueliteSwap, showRogueliteDeploy, showRogueliteForget, showRogueliteDamageBreakdown, showRogueliteItems, showRogueliteItemSwap, showRogueliteResume, showRogueliteBiomeIntro, showRogueliteRecruit, showRogueliteBossIntro, showRogueliteBanter, showRogueliteChapterSelect, showRogueliteChapterIntro, showRogueliteChapterClear, showRogueliteClusterLevelUp } from "./screens/rogueliteScreen.js";
import { nextTreasureStep, campaignFor, mentorSkillLevel, isMentorEpilogue } from "./data/mentorCampaignMaster.js";
import { tournamentsOpenAt, monthInfo, calendarLabel } from "./data/calendarMaster.js";
import { showCreditsRoll } from "./screens/creditsRoll.js";
import { evaluateSuccession } from "./progression/successionResult.js";
import { buildCompletedAvatar, addCompletedAvatar, markGraduated, deshiCharFrom, completedAvatarToChar } from "./progression/completedAvatar.js";
import { MeldType } from "./core/meld.js";
import { kindLabel, isTerminalOrHonor } from "./core/tiles.js";
import { waits } from "./core/rules/winCheck.js";
import { shanten } from "./core/rules/shanten.js";
import { bestDiscardRanking } from "./abilities/builtins/teacherAbility.js";
import { pickVoiceLine } from "./data/voiceLines.js";
import { makeMobRoster, mobSilhouettePaths } from "./data/mobMaster.js";
import { rivalUnits, rivalIntroLineFor } from "./data/tournamentRivalMaster.js";
import { simulateLeagueSection, simAbsentLeaguePt } from "./autobattle/leagueAutoSim.js";
import { paramsFromLv, PARAM_KEYS } from "./autobattle/autoBattle.js";
import { pickMentorBigMatchLine, pickMentorBattleQuip } from "./data/mentorVoiceMaster.js";
import { isDebugMode } from "./app/debug.js";
import { applyMatchToCompanion, addCompanionBondExp, detectPlayStyle, topPlayStyle } from "./progression/companionBond.js";

const CPU_DELAY = 650; // ms between CPU actions (visualisation)
// 春嬋「韋駄天の中張」発動中は場の見せ待ちそのものを詰める（韋駄天バッジ点灯でさらに速く）。
// 中張が来ること自体はプレイヤーから見て当たり前すぎて気づけないので、"速い"を時間で
// 体感させる＝ロジックには一切触れず、CPU の間合いだけを短くする演出（docs/character-ingame-fx-plan.md）。
function cpuDelayNow() {
  // ★対人戦では絶対に触らない。オンラインの進行ペースは権威(AuthorityRoom)の pacing が
  //   握っていて、そこを能力で動かすと「ホストのクライアント都合で卓全員の速度が変わる」
  //   ＝公平性と同期の問題になる。春嬋の"速さ"は対人戦では視覚（足跡・風・オーラ）で語る。
  if (online) return CPU_DELAY;
  if (!humanAbilityActive("chunchan")) return CPU_DELAY;
  return auraFx.rush ? 260 : 380;
}

// 対局ごとのセリフセット。シナリオ戦が指定すると、その対局中の全セリフ解決で
// ctx.voiceSet として参照され、一致する専用セリフを解放する（未指定なら通常のみ）。
// pendingVoiceSet を beginGame 直前にセットすると次の対局に適用される。
let activeVoiceSet = null;
let pendingVoiceSet = null;

// ── 対局中セリフの動的 ctx（相棒絆＋プレイヤー履歴）。仕様: docs/companion-bond-and-history.md ──
// 対局開始時に profile のスナップショットを取り（primeMatchVoiceState）、同期の vline がそこから
// companionBondLevel / winStreak / 前局結果 / 多用する打ち筋 を補って pickVoiceLine に渡す。
// 絆は「本人 × 相棒キャラ」で集約：師弟対局で師匠＝詩玥と打って貯めた絆を、フリー対戦で詩玥を
// 操作キャラにしたとき同じ companionBonds[shiyue] として読む（経路をまたいで一つに）。
let matchVoiceState = null; // { companionBonds, history } のスナップショット（対局外は null）
let lastHandResult = null;  // 「前の局」の結果 "agari"|"dealIn"|"tsumoLoss"|"draw"（対局をまたいで保持）

// 対局開始前に呼ぶ。現在の profile から相棒絆・履歴のスナップショットを作る（同期 vline 用）。
async function primeMatchVoiceState() {
  try {
    const p = await profileRepo.loadProfile();
    matchVoiceState = { companionBonds: p?.companionBonds || {}, history: p?.playerHistory || {} };
  } catch { matchVoiceState = null; }
  lastHandResult = null;
}

// charId（＝対局中に喋る相棒キャラ）に対する動的 ctx。スナップショット未取得なら空。
function matchVoiceCtxFor(charId) {
  if (!matchVoiceState) return {};
  const h = matchVoiceState.history || {};
  return {
    companionBondLevel: matchVoiceState.companionBonds?.[charId]?.level ?? 1,
    winStreak: h.winStreak ?? 0,
    loseStreak: h.loseStreak ?? 0,
    lastPlacement: h.lastPlacement ?? null,
    lastHandResult,
    playStyleTag: topPlayStyle(h),
  };
}

// フリー対戦（個人）の終局で相棒（＝操作キャラ）との絆・履歴を更新（本気/大会は結果反映側で加算）。
// アカウント連携時のみ計上する方針（未連携は「一緒に」カウントも絆も記録しない＝対戦ホームでは「—」表示）。
async function applyFreeMatchToCompanion({ companionId, placement, numPlayers, styleTags }) {
  if (!companionId) return;
  const user = await getUser().catch(() => null);
  if (!user) return; // 未連携は記録しない
  try {
    const p = await profileRepo.loadProfile();
    await profileRepo.saveProfile(applyMatchToCompanion(p, { companionId, placement, numPlayers, styleTags }));
  } catch (e) { console.error("companion bond 更新失敗(free):", e); }
}

// 「前の局」の結果を人間視点で導出（vline の lastHandResult 用）。
function deriveHandResult(r) {
  if (!r) return null;
  if (r.draw) return "draw";
  if (r.winner === humanIndex) return "agari";
  if (r.loser === humanIndex) return "dealIn";
  if ((r.deltas?.[humanIndex] ?? 0) < 0) return "tsumoLoss";
  return null;
}

// セリフ解決の共通入口。activeVoiceSet＋動的ctx（絆/履歴）を注入してから pickVoiceLine を呼ぶ。
// 呼び出し側 ctx が明示した値を最優先（matchEnd の rankIndex 等を壊さない）。
function vline(charId, event, ctx = {}) {
  return pickVoiceLine(charId, event, { voiceSet: activeVoiceSet, ...matchVoiceCtxFor(charId), ...ctx });
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
// ペア戦の味方相互の被弾を避ける戦術トグル（右サイドメニュー）。自陣（人間と同ペア）に適用。
//   noWin   … 自陣は一切和了しない（ロンもツモも不可）
//   noAllyRon … 相棒の捨て牌をロンしない（味方から点を奪わない。敵ロン・自分のツモは可）
const pairWinPolicy = { noWin: false, noAllyRon: false };
const tileImages = new TileImages();
const charImages = new CharacterImages();
const audio = new AudioManager();
// icon.png の用途別オフセット（imagePos.icon）を src 末尾一致の <style> で全アイコンに一括適用。
// 注入は1回でよい（CSSなので後から描かれる要素にも効く）。
installIconPosStyles(CHARACTER_MASTER);
// 起動時のリソース先読み（ロード画面の進捗バーへ 0..1 を報告）。各ローダの (done,total) を集約。
// renderer/UI は未ready時はフォールバック描画なので、ここで待ってから本編を見せる。
function preloadAssets(onProgress) {
  const prog = {}; // loaderキー -> { d, t }
  const report = () => {
    let d = 0, t = 0;
    for (const k in prog) { d += prog[k].d; t += prog[k].t; }
    onProgress?.(t ? d / t : 0);
  };
  const mk = (k) => (d, t) => { prog[k] = { d, t }; report(); };
  const mobs = mobSilhouettePaths().map((p) => ({ assets: { icon: p, portrait: p } }));
  return Promise.all([
    tileImages.load(mk("tiles")),
    charImages.load(CHARACTERS, mk("chars")),
    charImages.load(mobs, mk("mobs")),
  ]);
}
let selectedCharId = null;
// フリー対戦で席0（あなた）に選べる「修行完了弟子」（completedAvatarToChar 済みの CHARACTER 互換）。
// select-screen を開くたびにプロフィールから読み直す（F6）。CPU 席には出さない＝席0専用。
let completedRoster = [];
// 宝珠ショップで解禁済みのキャラ id 集合。select-screen を開くたび loadCompletedRoster で読み直す。
// characterMaster で locked:true のキャラは、この集合に入るまで選択導線で「鍵・非アクティブ」になる。
let unlockedCharIds = new Set();
// キャラが未解禁か（locked かつ未購入）。解禁キャラ以外は常に false。
const isCharLocked = (c) => !!(c && c.locked) && !unlockedCharIds.has(c.id);
// キャラ ID 解決：通常ロスター（CHARACTERS）＋修行完了弟子（completedRoster）を一つの窓口で引く。
// 弟子 ID（completed-*）は CHARACTERS に無いので、これを通すことで席割り/開始/確認が弟子も扱える。
const charById = (id) => CHARACTERS.find((c) => c.id === id) || completedRoster.find((c) => c.id === id) || null;
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
let pairPartnerAuto = true;      // ペア戦：相方の能力発動をおまかせ(自動)にするか。false=「発動要請」した時だけ撃つ
const pairAbilityRequests = new Set(); // ペア戦：相方へ発動要請した能力id（撃てる手番で消費）
let rogueliteState = null;       // ローグライト・ラン進行中の状態（{ run } 等）。null = 非ローグライト（F7）
let rogueliteHandLimit = null;   // 楼光の館：この1戦の「定められた局数」(maxHands)。null = 非ローグライト
const ROGUELITE_RIICHI_FRAC = 0.05; // 楼光の館：リーチ宣言で最大HPの5%を消費（緊張感のあるギャンブル）
const ROGUELITE_NOTEN_FRAC = 0.20;  // 楼光の館：荒牌平局でノーテン席が最大HPの20%ダメージ
const ROGUELITE_HP_LOSS_PENALTY_FRAC = 0.20; // 楼光の館（ペア戦）：合計HPで競り負けたら着卓2人に 最大HPのこの割合だけダメージ（撃墜あり・救済なし）。
const CHARYBDIS_NOTEN_MUL = 3;      // カリュブディス（淵の蒐集）在卓ならノーテン罰符が3倍
// アカウント共通通貨「宝珠」：層（帯）に到達するたび段階的に獲得（深いほど多い）。用途は別途。
const ORB_BASE = 5, ORB_STEP = 3;
const orbsForBand = (band) => ORB_BASE + Math.max(0, band) * ORB_STEP;
// 楼光の館：中断したランの一時保存（localStorage）。撤退/全滅で削除。データがあれば再開を問う。
const RL_RUN_KEY = "mahjong-rpg.rogueliteRun";
function saveRogueliteRun(run) {
  try { const d = serializeRun(run); if (d) localStorage.setItem(RL_RUN_KEY, JSON.stringify(d)); } catch { /* 保存不可は無視 */ }
}
function loadSavedRogueliteRunData() {
  try { const s = localStorage.getItem(RL_RUN_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function clearSavedRogueliteRun() {
  try { localStorage.removeItem(RL_RUN_KEY); } catch { /* 無視 */ }
}
// 中断ランの char をidから再解決（修行完了弟子＋通常キャラのプール）。
function makeRogueliteCharResolver(deshiRoster) {
  const pool = new Map();
  for (const c of [...(deshiRoster || []), ...CHARACTERS]) if (c && !pool.has(c.id)) pool.set(c.id, c);
  return (id) => pool.get(id) || null;
}
const MAX_GRANTED_ABILITIES = 1;    // 追加必殺枠の上限（付与能力）。1枠＝抱える必殺技は常に1つ。超えそうなら持ち替える（ポケモン式）
// L1: 非同期ポンプ runHand() 用の状態。人間の手番/鳴きの決定は DOM ハンドラが
// これらの resolver を解決して返す（CPU/オートは AI 経路、将来のオンラインは別経路）。
let humanTurnResolver = null;  // 解決値: 打牌/ツモ/カンの決定、または SWITCH_TO_AI
let humanCallResolver = null;  // 解決値: { action, meta }
const SWITCH_TO_AI = Symbol("switch-to-ai"); // オート観戦に切替＝AI に手を委ねる合図
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let riichiMode = false;
let selectedTileId = null; // 2タップ打牌: 1タップ目で選んだ手牌id（2タップ目の同牌で打牌確定）。null=未選択。
let recallMode = false; // リコール・ディール: 自分の河の牌を選択中
let janeDoeMode = false; // 強制ツモ切り: 対象の相手を選択中
let kakehaMode = false; // 大博打: 賭け金（5000/10000）を選択中
let luxMode = false; // ゼロ・リサーチ: 確保する有効牌（候補）を選択中
let noNaki = false; // 鳴きなし: when on, auto-skip pon/chi/kan for the human (ron still offered)
let autoPlay = false; // オート観戦: when on, the human seat is driven by the CPU AI (free matches only)
// 通信対戦（テスト中）。null=オフライン。{ send, opts, ... } のとき、人間の手番/鳴きは Intent を
// 権威へ送り、結果は wire Event→applyEvent(emit) でレプリカ(game)の bus に再発火し描画される。
// 権威は in-browser ループバック（startOnlineRoom）か、実 WS サーバ（startOnlineMatchWS）。
let online = null;
let onlineWsEp = null; // 実 WS 接続時の transport 端点（welcome 受信→beginGame で client 化）
let onlineWsUrl = null; // 再接続用に接続先URLを保持
let onlineToken = null; // 再接続用トークン（welcome で受領）。同じ卓へ rejoin する鍵
let reconnecting = false; // 再接続シーケンス中フラグ
let reconnectTimer = null;
let matchmaking = null; // マッチング探索中の状態 { base, room, mode, charId, name, dan, attempt }（welcome で解除）
let roomLobby = null; // ルーム対戦の待合室中の状態 { ep, code, api, myCharId }（welcome で解除）
let matchCountdownTimer = null; // 探索オーバーレイの「あとX秒」カウントダウン
let onlineSeatInfo = null; // 通信対戦の席ごと表示情報 [{charId,name,dan}|{charId,cpu}]（welcome で受領）
// 通信対戦の手番/待機 UI 状態。
let onlineTurnSeat = null;      // 直近の evt.turn の席（手番中の席）。
let thinkingBadgeTimer = null;  // 他席の「長考中」バッジを出すまでの猶予タイマー（約3秒）。
let onlineAutoSelf = false;     // 自席が CPU 代打ち中（長考超過）か。
let ackWaitTimer = null;        // 局間「通信待機中…」を出すまでの猶予タイマー（自分は ack 済・次局待ち）。
const THINK_BADGE_DELAY = 3000; // ms。これ以上手番が続いたら「長考中」を出す。
const ACK_WAIT_DELAY = 3000;    // ms。ack 後これ以上次局が来なければ「通信待機中…」を出す。
let meldCalledFlag = false; // set by MELD_CALLED listener during a resolveCalls
let abilityCutInFlag = false; // set by ABILITY_USED listener; CPU loop waits on it
let riichiWaitFlag = false; // set by RIICHI_DECLARED listener; CPU loop waits one turn so the リーチ banner reads
let kitaWaitFlag = false; // set by KITA_PULLED listener; the puller's next CPU action waits so the 北 banner reads
const NAKI_WAIT = 1100; // ms pause to show the naki call banner
const ABILITY_CUTIN_WAIT = 1700; // ms pause so the ability cut-in plays out
const RIICHI_WAIT = 1400; // ms pause after a riichi declaration（ポン/カンと同様にテロップの間を取る）

// ----------------------------------------------------------------- select UI
// Build a character icon element. Uses the master's declared icon path directly
// (independent of preload state) and degrades to a color block if it fails.
// 立ち絵/アイコンの <img> に「一時的な読み込み失敗の自己回復」を仕込む。これらは起動時に
// 先読み済み（＝アセット自体は健全）なので、同時読み込みが混んだ瞬間（例：弟子タブ表示で
// 弟子の立ち絵をロードした直後）に稀に起きるデコード/取得の取りこぼしは、少し待って貼り直せば
// たいてい直る。規定回数リトライしても駄目なときだけ色ブロック（c.color）へフォールバックする。
function wireImgSelfHeal(img, c, fallbackClass, maxRetry = 2) {
  const base = img.src;
  let tries = 0;
  img.onerror = () => {
    if (tries < maxRetry) {
      tries++;
      // 混雑が落ち着く猶予を置いてから貼り直す。同 URL だと再ロードされない環境があるため
      // クエリを変えて確実に再取得（静的配信なのでクエリは無視される）。
      setTimeout(() => { img.src = `${base}${base.includes("?") ? "&" : "?"}_r=${tries}`; }, 140 * tries);
      return;
    }
    const fb = document.createElement("div");
    fb.className = fallbackClass;
    fb.style.background = c.color;
    img.replaceWith(fb);
  };
}

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
    wireImgSelfHeal(img, c, "char-icon char-icon-fallback");
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
    // Per-character crop focal point + zoom (defaults to the CSS "top center", scale 1).
    applyPortraitCrop(img, c);
    wireImgSelfHeal(img, c, "detail-portrait detail-portrait-fallback");
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
  const locked = isCharLocked(c); // 未解禁キャラは解禁案内を出し、選べない旨を示す
  detail.classList.toggle("locked", locked);
  detail.innerHTML = `
    <div class="detail-portrait-wrap"></div>
    <div class="detail-body">
      ${locked ? `<div class="detail-lock-note">🔒 未解禁　<b>宝珠ショップ</b>で解禁すると選べます</div>` : ""}
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
  const selectedChar = () => charById(selectedCharId);
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
      const locked = isCharLocked(charById(id));
      card.classList.toggle("locked", locked);
      // 未解禁カードは hover で即「どうすれば使えるか」が分かるよう native ツールチップを付ける
      // （詳細パネルの解禁注記に加えての即時ヒント。UXテスト＝鍵の条件が分からない、への対処）。
      card.title = locked ? "🔒 宝珠ショップで解禁すると選べます" : "";
      const lock = card.querySelector(".card-lock");
      if (lock) { lock.classList.toggle("hidden", !locked); lock.title = "宝珠ショップで解禁すると選べます"; }
      const label = locked ? null : seatLabelOf(id); // 未解禁は着席しないので選択ハイライトも出さない
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
  // 修行完了弟子（completed-*）は「あなた席（席0）」専用＝CPU/相方/チームには出さない（F6）。
  function assignToActiveSeat(c) {
    if (isCharLocked(c)) { renderCharDetail(c); return; } // 未解禁キャラはどの席にも着けない（鍵・非アクティブ）
    if (c.isCompletedAvatar) {
      if (selectedTeamBattle || selectedPairBattle) return; // 弟子は通常フリー対戦の席0だけ
      activeSeat = 0;
    }
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
    const ch = charId ? charById(charId) : null; // 席0は弟子（completed-*）も解決
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
    // 未解禁キャラの鍵オーバーレイ（表示の出し分けは refreshCards で解禁状態に同期）。
    const lock = document.createElement("span");
    lock.className = "card-lock hidden";
    lock.textContent = "🔒";
    card.appendChild(lock);
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
  // 修行完了弟子（completedRoster）のセクション。育てた弟子を「あなたの弟子」として
  // ロスター先頭に出す＝育成⇔対戦の接続を体験で完成させる（F6）。席0専用は assignToActiveSeat 側で担保。
  // select-screen を開くたびに refreshDeshiRoster() で作り直す（completedAvatars は増減する）。
  let deshiGroupEl = null;
  let deshiCardIds = []; // 実際に登録した弟子カードの id（再描画時の cardById 掃除用）
  function renderDeshiSection() {
    if (deshiGroupEl) { // 旧セクション分の card 登録を解除してから作り直す
      for (const id of deshiCardIds) cardById.delete(id);
      deshiGroupEl.remove();
      deshiGroupEl = null;
      deshiCardIds = [];
    }
    if (!completedRoster.length) { refreshCards(); return; }
    const group = document.createElement("div");
    group.className = "role-group deshi-group";
    group.style.setProperty("--role", "#e0b85a");
    const head = document.createElement("div");
    head.className = "role-header";
    head.innerHTML = `<span class="role-name">あなたの弟子</span><span class="role-line"></span>`;
    group.appendChild(head);
    const cards = document.createElement("div");
    cards.className = "role-cards";
    for (const c of completedRoster) { cards.appendChild(makeCard(c)); deshiCardIds.push(c.id); }
    group.appendChild(cards);
    list.prepend(group);
    deshiGroupEl = group;
    refreshCards(); // 弟子カードのハイライト＋席バッジを現在の席割りに同期
  }
  refreshDeshiRoster = renderDeshiSection;

  // Leaving the roster restores the selected character's detail (or the prompt).
  list.onmouseleave = () => renderCharDetail(selectedChar());
  renderCharDetail(null);
  renderDeshiSection();
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
  // ①形式 → ②卓 → ③キャラ → ④ルール＆開始 の4ステップ。進行はパネルの出し分け＋
  // 下部ナビで制御する。③から④へ進むには自分（あなた席）の選択が必須。
  let wizStep = 1;
  const teamSlotsFilled = () => !!(selectedCharId && cpuPicks[0] && cpuPicks[1]);
  const canReach = (step) => {
    if (step <= 3) return true;
    return selectedTeamBattle ? teamSlotsFilled() : !!selectedCharId;
  };

  // 下部ナビ（戻る/次へ/開始）の表示と活性をステップに合わせる。
  function updateWizNav() {
    const back = el("wiz-back"), next = el("wiz-next"), start = el("start-btn");
    if (!back || !next || !start) return;
    back.classList.toggle("hidden", wizStep === 1);
    next.classList.toggle("hidden", wizStep === 4);
    start.classList.toggle("hidden", wizStep !== 4);
    next.disabled = wizStep === 3 && !canReach(4);
    // デバッグボタンは step4 かつデバッグモードのときだけ（start と並べる）。
    const dbg = el("debug-mob-btn");
    if (dbg) dbg.classList.toggle("hidden", !(wizStep === 4 && isDebugMode()));
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
    // ③キャラに入る時、自分が未選択ならアクティブ席を「あなた」に。最初のクリックが
    // 必ず自分の選択になり、CPU席へ誤爆して自分の指名を外す事故を防ぐ。
    if (step === 3 && !selectedCharId) activeSeat = 0;
    for (const pane of document.querySelectorAll("#select-screen .wiz-pane")) {
      pane.classList.toggle("hidden", Number(pane.dataset.pane) !== step);
    }
    for (const li of document.querySelectorAll("#wiz-steps .wiz-step")) {
      const n = Number(li.dataset.step);
      li.classList.toggle("active", n === step);
      li.classList.toggle("done", n < step);
    }
    if (step === 2) renderSeats();   // ②卓の席プレビューを最新の席割りで
    if (step === 4) renderSummary();
    updateWizNav();
  }

  el("wiz-back").onclick = () => { audio.playClick?.(); gotoStep(wizStep - 1); };
  el("wiz-next").onclick = () => { audio.playClick?.(); gotoStep(wizStep + 1); };
  el("start-btn").onclick = startGame;
  // クイックスタート：4ステップを飛ばし通常4人戦を即開始（ウィザードが重い＝UXテスト全視点指摘）。
  // 席0が未選択/未解禁なら主役・詩玥で。CPUはおまかせ（ランダム）。
  function quickStart() {
    selectedTeamBattle = false; selectedPairBattle = false; selectedPlayers = 4;
    const cur = selectedChar();
    if (!cur || isCharLocked(cur)) {
      const def = CHARACTERS.find((c) => c.id === "shiyue") || CHARACTERS.find((c) => !isCharLocked(c)) || CHARACTERS[0];
      selectedCharId = def?.id || null;
    }
    startGame();
  }
  el("wiz-quickstart")?.addEventListener("click", () => { audio.playClick?.(); quickStart(); });
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
      // 修行完了弟子は通常フリー対戦の席0専用。団体/ペアへ切り替えたら弟子の指名は外す
      // （これらの開始経路は CHARACTERS 前提のため、弟子 ID が残ると未解決でクラッシュする）。
      if ((selectedTeamBattle || selectedPairBattle) && selectedCharId && !CHARACTERS.find((c) => c.id === selectedCharId)) {
        selectedCharId = null;
      }
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
    selectedRounds = 1; // 楼光ボス戦（=99）等の残留を掃除（Game側の東風クランプ頼みにしない）
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
// 修行完了弟子セクションを最新の completedRoster で描き直すフック（buildSelectScreen が設定）。
let refreshDeshiRoster = () => {};

// ----------------------------------------------------------------- navigation
// Wire every [data-nav] control to a screen. Home is the boot screen; the
// existing 選択 -> 対局 flow lives behind フリー対戦 > 通常フリー対戦.
let resyncHomeSettings = () => {};
const NAV_TARGETS = {
  home: "home-screen",
  "battle-home": "battle-home-screen",
  "free-battle": "free-battle-screen",
  roguelite: "roguelite-screen",
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
  if (id === "select-screen") { resetSelectWizard(); loadCompletedRoster(); } // ①卓へ＋弟子ロスター更新
  if (id === "online-screen") renderOnlineProfile(); // プロフィール帯を最新の名前/相棒/段位で更新
  if (id === "battle-home-screen") renderBattleHome(); // お気に入りキャラ＋出迎えセリフを毎回更新
  if (id === "shop-screen") renderShop(); // 宝珠ショップ（残高/解禁状態を毎回最新で描く）
}

// フリー対戦 select-screen 用：プロフィールの修行完了弟子（completedAvatars）を読み、席0で
// 選べるよう CHARACTER 互換へ変換してロスターへ反映する（F6）。立ち絵/アイコンも描画キャッシュへ。
// goScreen("select-screen") から毎回（非同期・fire-and-forget）。完了データ無しなら弟子セクションは出ない。
async function loadCompletedRoster() {
  let profile = null;
  try { profile = await profileRepo.loadProfile(); } catch { /* 未ログイン/読込失敗は弟子なし */ }
  unlockedCharIds = new Set(profile?.unlockedCharacters || []); // 宝珠ショップの解禁状態を反映（鍵カードの解放）
  completedRoster = (profile?.completedAvatars || []).map((ca) => completedAvatarToChar(ca));
  // 選択中の弟子が（入替などで）消えていたら選択解除＝stale な selectedCharId を残さない。
  if (selectedCharId && !charById(selectedCharId)) selectedCharId = null;
  if (completedRoster.length) {
    try { await charImages.load(completedRoster); } catch { /* 画像なしはフォールバック描画 */ }
    for (const c of completedRoster) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  }
  refreshDeshiRoster();
}

// 対戦ホーム: お気に入りキャラの立ち絵＋出迎えセリフを描く。開くたびに最新プロフィールで再描画。
// 導線＝フリー対戦／オンライン対戦（オンラインは enterOnline のログイン/名前ゲートを通す）。
async function renderBattleHome() {
  const host = el("battle-home-screen");
  if (!host) return;
  const user = await getUser().catch(() => null); // 連携時のみ「一緒に」/絆を表示・計上
  showBattleHome(host, {
    repository: profileRepo,
    audio,
    loggedIn: !!user,
    onFree: () => { audio.playClick?.(); goScreen("free-battle-screen"); },
    onRoguelite: () => { audio.playClick?.(); openRoguelite(); },
    onShop: () => { audio.playClick?.(); goScreen("shop-screen"); },
    onBack: () => { audio.playClick?.(); goScreen("home-screen"); },
  });
  // 初回の対戦ホーム到達で、詩玥の出迎えが出てから少し遅れて認証おすすめを出す（セッション1回だけ予約）。
  // maybeShowAuthPrompt 自体が「未ログイン＆未提示」を自己ガードするので、既に選択済みなら何も出ない。
  if (!authPromptScheduled) {
    authPromptScheduled = true;
    setTimeout(() => { maybeShowAuthPrompt(); }, 1500);
  }
}
let authPromptScheduled = false; // 認証おすすめモーダルの予約フラグ（セッション内1回）

// 宝珠ショップ：恒久強化・解禁のハブ（当面は対戦ホームから。将来は楼光の館トップへ）。
function renderShop() {
  const host = el("shop-screen");
  if (!host) return;
  showShop(host, {
    repository: profileRepo,
    audio,
    onBack: () => { audio.playClick?.(); goScreen("battle-home-screen"); },
  });
}

// 通信対戦メニューのプロフィール帯：ユーザー名 / よく使う相棒 / 段位・RP。online-screen を開くたびに更新。
// プロフィール読込は非同期なので、描画できしだい DOM を差し替える（描画前は前回値のまま）。
async function renderOnlineProfile() {
  const panel = el("online-profile");
  if (!panel) return;
  let profile = null;
  try { profile = await profileRepo.loadProfile(); } catch { /* 未ログイン/読込失敗は既定値で描く */ }
  const name = normalizeUsername(profile?.profile?.displayName || "") || "名無し";
  // よく使う相棒＝絆が最も育っているキャラ。※絆は数値を見せない方針なのでキャラだけ。
  const topId = topCompanionId(profile?.companionBonds);
  const topChar = topId ? CHARACTERS.find((c) => c.id === topId) : null;
  // 段位・RP は競技ランクなので数値表示OK。
  const r = describeRank(profile?.onlineRank || defaultRankState());
  const rpText = r.atMax ? `RP ${r.tierRp}` : `RP ${r.tierRp} / ${r.next}`;
  const icon = topChar?.assets?.icon
    ? `<img class="op-bd-icon" src="${topChar.assets.icon}" alt="">`
    : `<span class="op-bd-icon op-bd-fb" style="background:${topChar?.color || "#2a3f34"}"></span>`;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="op-cell op-id">
      <span class="op-k">プレイヤー</span>
      <span class="op-name"></span>
    </div>
    <div class="op-cell op-buddy">
      <span class="op-k">よく使う相棒</span>
      <span class="op-bd">${topChar ? `${icon}<span class="op-bd-name"></span>` : `<span class="op-bd-none">まだいないよ</span>`}</span>
    </div>
    <div class="op-cell op-rank">
      <span class="op-k">段位</span>
      <span class="op-rank-row">
        <span class="op-rank-dan"><b>${r.title}</b><small>${r.kana}</small></span>
        <span class="op-rank-gauge">
          <span class="op-rank-bar hpbar"><span class="hpfill high" style="width:${r.progressPct}%"></span></span>
          <span class="op-rank-rp">${rpText}</span>
        </span>
      </span>
    </div>`;
  // 名前/相棒名はユーザー入力・マスタ文字列なので textContent で安全に入れる。
  panel.querySelector(".op-name").textContent = name;
  if (topChar) panel.querySelector(".op-bd-name").textContent = topChar.name;
}
// 師弟モード（Phase 6）: 入口メニュー（新規入門 / 修行＝弟子一覧 / ログイン）を挟む。
// profileRepo はログイン中=Supabase / 未ログイン=Local を自動で選ぶファサード。
const profileRepo = new ProfileRepositoryFacade();

// 師弟入口メニュー。
let mentorSyncChecked = false; // 初回同期（ローカル→クラウド吸い上げ）はセッション中1回だけ。
let pendingSyncConflict = null; // 競合検出時に一時保持し、entry 描画後にモーダルを重ねる。
async function openMentorMode() {
  const user = await getUser().catch(() => null);
  // ログイン中かつ未チェックなら、同期状態を検査して適切に処理する。
  if (user && !mentorSyncChecked) {
    mentorSyncChecked = true;
    try {
      const info = await profileRepo.inspectSync();
      if (info.state === "empty-cloud") {
        const res = await profileRepo.syncLocalToCloudIfEmpty();
        if (res?.migrated) console.info(`初回同期: ローカルの弟子 ${res.count} 体をクラウドへ移行しました`);
      } else if (info.state === "conflict") {
        // 入口を先に描画してから、その上にモーダルを重ねる（背景が見える）
        pendingSyncConflict = info;
      }
    } catch (e) {
      console.error("初回同期に失敗", e);
    }
  }
  const profile = await profileRepo.loadProfile();
  showMentorEntry(el("mentor-entry-screen"), {
    profile,
    isLoggedIn: !!user,
    accountLabel: user?.email ?? "",
    onCreate: () => openMentorCreate(),
    onTrain: () => openMentorRoster(),
    onLogin: () => loginThenReopenMentor(),
    onLogout: () => logoutThenReopenMentor(),
    onAccount: () => openAccount(),
    onBack: () => navigate("home"),
  });
  goScreen("mentor-entry-screen");
  // 競合が検出されていれば、entry 画面の上にモーダルを重ねる。
  if (pendingSyncConflict) {
    const conflict = pendingSyncConflict;
    pendingSyncConflict = null;
    showSyncConflict({
      localCount: conflict.localCount,
      cloudCount: conflict.cloudCount,
      onUseCloud: () => { /* クラウドのデータをそのまま使う。何もしない。 */ },
      onMerge: async () => {
        try {
          const r = await profileRepo.mergeLocalIntoCloud();
          console.info("統合: " + r.added + "体追加");
        } catch (e) {
          console.error(e);
        }
        openMentorMode();
      },
    });
  }
}

async function openAccount() {
  const user = await getUser().catch(() => null);
  const profile = await profileRepo.loadProfile();
  showAccount(el("account-screen"), {
    user,
    profile,
    onLogout: () => logoutThenReopenMentor(),
    onBack: () => openMentorMode(),
  });
  goScreen("account-screen");
}

// 「新しく弟子入りする」: キャラ作成(情報のみ) → 師匠選択 → プロローグ確認 → プロローグ or 師弟ホーム。
function openMentorCreate(draft = {}) {
  showAvatarCreate(el("avatar-create-screen"), {
    repository: profileRepo,
    draft,
    onBack: () => openMentorMode(),
    onNext: (d) => openMentorSelect(d),
  });
  goScreen("avatar-create-screen");
}

// 師匠選択（別画面）。戻るとキャラ作成へ（入力は draft で保持）。決定でアバター確定→プロローグ確認。
function openMentorSelect(draft) {
  showMentorSelect(el("mentor-select-screen"), {
    repository: profileRepo,
    draft,
    onBack: () => openMentorCreate(draft),
    onDecided: (_saved, avatar) => promptPrologue(avatar),
  });
  goScreen("mentor-select-screen");
}

// 作成直後：プロローグ（任意の手書き前口上）を観るか確認。
// 観る/とばす どちらでも、続けて第1話（bond-01）を本編として再生する
//（第1話の読了で既読化＋絆が入り、第2話の解禁ゲート＝read(ep1)+絆Lv2 が満たされる）。
// ※プロローグは第1話とは別物。プロローグだけでは第1話は既読化されない＝第2話が解禁されない、
//   という詰まりを塞ぐため、作成直後は必ず第1話へ橋渡しする。
function promptPrologue(avatar) {
  showConfirm({
    title: "プロローグ",
    message: "あなたの物語が、ここから始まります。\n出発のプロローグを観ますか？",
    confirmLabel: "観る",
    cancelLabel: "とばす",
    danger: false,
    onConfirm: () => playPrologueThenFirstChapter(avatar),
    onCancel: () => playFirstChapterThenHome(avatar), // プロローグは飛ばすが、第1話は本編として観る
  });
}

// プロローグ（手書き・mentor-aware）を再生 → そのまま第1話へ自然につなぐ。
function playPrologueThenFirstChapter(avatar) {
  const mentor = CHARACTER_MASTER.find((c) => c.id === avatar?.mentorCharacterId) || null;
  showScreen("scenario-screen");
  playScenario(null, {
    audio,
    lines: buildPrologueLines({ avatar, mentor }),
    onEnd: () => playFirstChapterThenHome(avatar),
  });
}

// 「修行する」: 弟子一覧から続ける弟子を選ぶ → activeAvatarId を確定 → 師弟ホーム。
async function openMentorRoster() {
  const profile = await profileRepo.loadProfile();
  showMentorRoster(el("mentor-roster-screen"), {
    profile,
    isLoggedIn: profileRepo.isLoggedIn(),
    onSelect: (avatarId) => selectAvatarThenHome(avatarId),
    onCreate: () => openMentorCreate(),
    onDelete: (avatarId) => deleteAvatar(avatarId),
    onBack: () => openMentorMode(),
  });
  goScreen("mentor-roster-screen");
}

// 弟子を削除する。修行中の弟子を消したら active を別の弟子（無ければ null）へ付け替える。
// 削除後の最新プロフィールを返す（一覧がその場で再描画＝整理モードを維持）。
async function deleteAvatar(avatarId) {
  const profile = await profileRepo.loadProfile();
  profile.avatars = (profile.avatars || []).filter((a) => a.avatarId !== avatarId);
  if (profile.activeAvatarId === avatarId) {
    profile.activeAvatarId = profile.avatars[0]?.avatarId ?? null;
    hydrateRun(profile); // 別の弟子へ移ったら、その弟子の進行状態を反映（残弟子がいれば）
  }
  await profileRepo.saveProfile(profile);
  return profile;
}

async function selectAvatarThenHome(avatarId) {
  const profile = await profileRepo.loadProfile();
  if ((profile.avatars || []).some((a) => a.avatarId === avatarId)) {
    activateAvatar(profile, avatarId); // 弟子ごと独立の進行状態へ切替（run の退避→反映）
    await profileRepo.saveProfile(profile);
  }
  openMentorHome();
}

// Google ログイン → リダイレクトで戻ってくると detectSessionInUrl でセッション復元。
// 戻り先を師弟入口にして、復帰後そのまま続けられるようにする。
async function loginThenReopenMentor() {
  try {
    await signInWithGoogle(window.location.href.split("#")[0]);
  } catch (e) {
    console.error("ログイン失敗", e);
    alert("ログインに失敗しました: " + (e?.message ?? e));
  }
}

async function logoutThenReopenMentor() {
  try {
    await signOut();
  } catch (e) {
    console.error("ログアウト失敗", e);
  }
  openMentorMode();
}

// 初回の打牌だけ、手牌を指すコーチマークを出すためのフラグ。一度でも切れば二度と出さない。
const HAND_HINT_KEY = "mahjong-rpg.handHintShown";
function handHintShown() { try { return !!localStorage.getItem(HAND_HINT_KEY); } catch { return true; } }
function markHandHintShown() { try { localStorage.setItem(HAND_HINT_KEY, "1"); } catch {} }

// 楼光の館の「オート観戦」設定を保持（毎戦ONにし直す作業感の解消・UXプレイテスト指摘）。
const RL_AUTO_KEY = "mahjong-rpg.rogueliteAuto";
function rogueliteAutoPref() { try { return localStorage.getItem(RL_AUTO_KEY) === "1"; } catch { return false; } }
function setRogueliteAutoPref(on) { try { localStorage.setItem(RL_AUTO_KEY, on ? "1" : "0"); } catch {} }
// ダメージ内訳モーダルの自動表示：最初の数回は自動で見せて（教える）、以降は「計算を見る」で任意表示。
// ユーザーが「以後自動で出さない」を選んだら 0 を保存して恒久スキップ。
const RL_CALC_KEY = "mahjong-rpg.rogueliteCalcShown"; // 自動表示した回数
const RL_CALC_OFF_KEY = "mahjong-rpg.rogueliteCalcOff"; // 1=自動表示を切る
const RL_CALC_AUTO_LIMIT = 3; // 最初の3回まで自動表示
function rlCalcShownCount() { try { return Number(localStorage.getItem(RL_CALC_KEY)) || 0; } catch { return 0; } }
function bumpRlCalcShown() { try { localStorage.setItem(RL_CALC_KEY, String(rlCalcShownCount() + 1)); } catch {} }
function rlCalcAutoOff() { try { return localStorage.getItem(RL_CALC_OFF_KEY) === "1"; } catch { return false; } }
function setRlCalcAutoOff(off) { try { localStorage.setItem(RL_CALC_OFF_KEY, off ? "1" : "0"); } catch {} }
function rlCalcShouldAuto() { return !rlCalcAutoOff() && rlCalcShownCount() < RL_CALC_AUTO_LIMIT; }

// 初回起動時の認証おすすめモーダル。未ログイン かつ 一度も「このまま遊ぶ」を選んでいない時だけ出す。
const AUTH_PROMPT_KEY = "mahjong-rpg.authPromptDismissed";
async function maybeShowAuthPrompt() {
  try {
    if (localStorage.getItem(AUTH_PROMPT_KEY)) return; // 既に「ローカルで遊ぶ」を選択済み
    const user = await getUser().catch(() => null);
    if (user) return; // ログイン済みなら不要
    showAuthPrompt({
      onLogin: () => loginThenReopenMentor(), // OAuth リダイレクト（戻るとログイン状態）
      onLocal: () => { try { localStorage.setItem(AUTH_PROMPT_KEY, "1"); } catch {} },
    });
  } catch { /* モーダル提示失敗は致命でない */ }
}

// エピローグ章の読了後はスタッフロール（クレジット）を流してから次の画面へ。
// それ以外の章は即 next。キャスト最後に弟子の名前を載せる＝「あなたもこの物語の登場人物」。
async function rollCreditsIfEpilogue(scenarioId, next) {
  if (!isMentorEpilogue(scenarioId)) { next(); return; }
  const p = await profileRepo.loadProfile();
  const av = activeAvatar(p);
  // エンドロール → 修行成果（評価・タイプ確定）→ next。
  showCreditsRoll(el("app") || document.body, {
    deshiName: av?.name || "", mentorId: av?.mentorCharacterId || null,
    onDone: () => showSuccessionResult(el("app") || document.body, av, evaluateSuccession(p, av), next),
  });
}

// 修行成果（エピローグ後）。クリア評価・集めた宝・弟子のタイプ確定を見せて締める（F4）。
function showSuccessionResult(host, av, result, onDone) {
  const ov = document.createElement("div");
  ov.className = "succ-result";
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="succ-card">
      <div class="succ-ttl">修 行 成 果</div>
      <div class="succ-name">${esc(av?.name || "弟子")}</div>
      <div class="succ-rank">評価　<b>${esc(result.rank)}</b></div>
      <div class="succ-grid">
        <div class="succ-cell"><span>修行期間</span><b>${result.months} ヶ月</b></div>
        <div class="succ-cell"><span>大会優勝</span><b>${result.wins} 回</b></div>
        <div class="succ-cell"><span>集めた宝</span><b>${result.treasures} / 9</b></div>
      </div>
      <div class="succ-role">タイプ確定 ―― <b style="color:${result.roleColor}">${esc(result.roleLabel)}</b></div>
      <p class="succ-note">${esc(av?.name || "弟子")}は、独り立ちした。<br>この姿が「修行完了データ」として残り、対戦で連れ歩けるようになる。</p>
      <button type="button" class="succ-go">よし</button>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = () => { ov.classList.remove("is-open"); setTimeout(() => { ov.remove(); onDone?.(); }, 220); };
  // 「よし」で修行完了データとして記録（5枠満杯なら入替先を選ぶ）→アーカイブ→保存→次へ。
  ov.querySelector(".succ-go")?.addEventListener("click", async () => {
    const p = await profileRepo.loadProfile();
    const ca = buildCompletedAvatar(av, result, new Date().toISOString());
    const r = addCompletedAvatar(p, ca);
    if (r.needsReplace) { showCompletedReplaceModal(host, p, ca, av, close); return; }
    await profileRepo.saveProfile(markGraduated(r.profile, av.avatarId));
    close();
  });
}

// 修行完了データが5枠埋まっているとき、新しい卒業生とどの枠を入れ替えるか選ぶ。
function showCompletedReplaceModal(host, profile, ca, av, done) {
  const ov = document.createElement("div");
  ov.className = "succ-result";
  const cards = (profile.completedAvatars || []).map((c) => `
    <button type="button" class="succ-rep-card" data-id="${esc(c.completedAvatarId)}">
      <b>${esc(c.name)}</b><span>${esc(c.roleLabel || c.role || "")}　・　${esc(c.result?.rank || "")}</span>
    </button>`).join("");
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="succ-card">
      <div class="succ-ttl">修行完了データが いっぱい</div>
      <p class="succ-note">保存枠は5つまで。<b>${esc(ca.name)}</b> を記録するには、どれか1人と入れ替える。</p>
      <div class="succ-rep-list">${cards}</div>
      <button type="button" class="succ-rep-cancel">入れ替えずに進む</button>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = () => { ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 200); };
  ov.querySelectorAll(".succ-rep-card").forEach((b) => b.addEventListener("click", async () => {
    const r = addCompletedAvatar(profile, ca, b.getAttribute("data-id"));
    await profileRepo.saveProfile(markGraduated(r.profile, av.avatarId));
    close(); done?.();
  }));
  ov.querySelector(".succ-rep-cancel").addEventListener("click", async () => {
    // 入替しない＝記録は見送り、卒業（アーカイブ）だけして進む。
    await profileRepo.saveProfile(markGraduated(profile, av.avatarId));
    close(); done?.();
  });
}

// マイキャラ作成直後、その師匠の第1章（sortOrder 先頭・unlock=always）を本編として再生し、
// 読了で既読化＋初回ソウル＋絆を確定してから師弟ホームへ（promptPrologue から必ず経由する）。
function playFirstChapterThenHome(avatar) {
  const first = scenariosForMentor(avatar?.mentorCharacterId)[0];
  if (!first) { openMentorHome(); return; }
  showScreen("scenario-screen");
  playScenario(first.scenarioId, {
    audio,
    onEnd: async () => {
      const fresh = await profileRepo.loadProfile();
      const res = markScenarioRead(fresh, first); // 既読化＋初回ソウル
      if (res.newlyRead) await profileRepo.saveProfile(res.profile); // 既読/絆が変わったら保存（初回ソウルの有無に依らない）
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

// オートバトル起動の共通化（デバッグ起動・雀荘巡りで共用）。parlor を渡すと店トレイト＋レア客が効く。
function launchAutoBattle(profile, { oppLv, oppHpMax, maxMatches, seed = Date.now(), onExit, completeLabel, parlor = null }) {
  const av = activeAvatar(profile);
  const abilityName = skillTemplateById(av?.skillTemplateId)?.name || "能力発動";
  const standingSrc = presetById(av?.presetIds?.standing)?.assetPath || "";
  const di = dayInfo(profile);
  const condition = CONDITIONS[di.condition];
  const mentorChar = CHARACTERS.find((c) => c.id === av?.mentorCharacterId) || null;
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
    mentor: mentorChar
      ? { id: mentorChar.id, name: mentorChar.name, portrait: mentorChar.assets?.portrait || "" }
      : null,
    bondLevel: av?.bondLevel ?? 1,
    trait: parlor?.trait || null,
  });
  goScreen("autobattle-screen");
}

// ── 本気対局（Phase 4A・§4.6.9）。既存 beginGame を流用する“橋”。──
let honestCtx = null; // 本気対局中の文脈（{ onResult } 等）。null＝通常（フリー対戦）。
let honestAutoPlay = false; // 本気タイマンを「オート（AI自動打ち）」で始めるか。beginGame が消費。
// マイキャラを対局エンジン用の character へ変換（立ち絵/能力を載せる）。
// 育成中アバター → 対局キャラ。変換ロジックは deshiCharFrom（completedAvatar.js）に集約。
// startPoints＝単発 25000／大会＝runHp 持ち越し（§4.6.9/§14.3）。
function avatarToCharacter(avatar, startPoints = 25000) {
  return deshiCharFrom({
    id: avatar?.avatarId,
    name: avatar?.name,
    profileText: avatar?.profileText,
    presetIds: avatar?.presetIds,
    skillTemplateId: avatar?.skillTemplateId,
    skillLevel: avatar?.skillLevel,
  }, startPoints);
}
// 師匠タイマン（二人打ち）の師匠 HP。師匠は格上：フリー対戦のHP（キャラ既定 startingPoints）を初期値に、
// 師弟シナリオの進み具合（既読話数）で強化していく。弟子は自分の HP を賭けるので最初は大きな格差になる。
// （覇道編以降の「一緒に育成＝共闘」はペア/団体大会＝詩玥＋弟子 で表現。）
const MENTOR_DUO_HP_PER_SCENARIO = 1500; // 既読1話ごとに師匠HP+（チューニング）
const MENTOR_DUO_HP_CAP_READS = 24;      // 強化の上限話数
function mentorDuoHp(mentorChar, profile) {
  const base = mentorChar?.stats?.startingPoints || 25000; // フリー対戦のHP＝初期状態（格上）
  const read = Math.min(MENTOR_DUO_HP_CAP_READS, (profile?.scenarioProgress || []).length);
  // 覇道編の修行成長（座学/鍛錬/二人打ちで師匠も伸びる）＝持ち点の上乗せ。
  const grown = mentorGrowthFor(profile, mentorChar?.id).hpBonus;
  return base + read * MENTOR_DUO_HP_PER_SCENARIO + grown;
}

// 本気対局を起動。config: { avatar, opponents:[character], rounds, players, voiceSet, startPoints, onResult(result, action) }
async function launchHonestMatch(config) {
  honestCtx = config;
  await primeMatchVoiceState(); // 相棒絆・履歴のスナップショット（読む側。加算は結果反映側）
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
let tournamentRun = null; // { t, matchIndex, units, totals, names, deshiUnitId, seatedUnitIds, strengthById, fieldAvgStrength }

// 団体戦の弟子チームの“仲間”（師匠以外の3人目）。正典準拠：ビビ＝焔／ルイナ＝ドラニエル（ep17）／
// ドラニエル＝ルクス・ゼロ（ep17・design/doranie.json teamBattleTrio）／ルクス・ゼロ＝ルイナ（ep17・
// design/yobinin.json teamBattleTrio）／凌雲＝詩玥（ep17。従来はフォールバック CHARACTERS[0]=shiyue で
// 偶然一致していたのを明示化＝挙動不変）。
const ALLY_BY_MENTOR = { bibi: "homura", shiyue: "mamori", kakeha_ruina: "doranie", doranie: "yobinin", yobinin: "kakeha_ruina", kuidoshi: "shiyue" };
// 対局用に持ち点（startingPoints）を上書きしたキャラの複製を返す。
function asMatchChar(char, points) {
  return { ...char, stats: { ...(char?.stats || {}), startingPoints: points } };
}
// 師匠の対局投入キャラ。技 Lv（シナリオ起点・mentorSkillLevel）に対応するスキルテーブルが
// あれば runtimeParams を能力に効かせる（詩玥=lv-lucky-draw は Lv5 が現行性能と一致＝
// 基準帯では挙動不変、覇道編の超越帯 Lv6〜10 で読み・チャージが冴える）。
// テーブル未設計の師匠（ビビ/ルイナ等）は従来どおり＝表示のみ。
function asMentorMatchChar(mentorChar, points, profile) {
  const c = asMatchChar(mentorChar, points);
  const ability = c.abilities?.[0];
  const tmpl = ability ? templateForAbility(ability.abilityId) : null;
  if (!tmpl?.levelTableId) return c;
  const lv = mentorSkillLevel(profile, mentorChar?.id);
  const params = skillRuntimeAbilityParams(tmpl.levelTableId, lv);
  return { ...c, abilities: [{ ...ability, params: { ...(ability.params || {}), ...params } }] };
}
// 弟子ユニットを編成する（個人=弟子のみ / ペア=弟子＋師匠 / 団体=弟子＋師匠＋仲間）。
// 持ち点＝HP：弟子ユニットは育成した HP（avatarHpMax）で打つ＝育成成果が大会の持ち点に直結。
// 師匠の持ち点には覇道編の修行成長（mentorGrowth）が乗る＝「2人とも伸びる」が大会の戦力になる。
function buildDeshiUnit(av, mentorId, format, unitSize, profile = null) {
  const hp = av.avatarHpMax || 25000;
  const members = [avatarToCharacter(av, hp)];
  if (unitSize >= 2) {
    const mentor = CHARACTERS.find((c) => c.id === mentorId) || CHARACTERS[0];
    members.push(asMentorMatchChar(mentor, hp + mentorGrowthFor(profile, mentorId).hpBonus, profile));
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
const UNIT_WORD = { solo4: "人", solo3: "人", pair: "ペア", team: "チーム", final: "人" };

// 大会の入口＝「大会メニュー」（その月に開催中の卓から選ぶ）。
// docs/shitei-calendar-and-roguelite.md「九宝コレクション表示／大会メニュー」。
async function openTournament() {
  const profile = await profileRepo.loadProfile();
  const av = activeAvatar(profile);
  if (!av) { openMentorHome(); return; }
  showTournamentMenu(profile, av);
}

// 大会メニュー：当月開催（半年周期）の大会から自由選択。既得は再挑戦可・目標にマーク・
// 九宝コレクション付き。実力不足は選んでも openTournamentForStep の門前払いで弾かれる。
function showTournamentMenu(profile, av) {
  const host = el("app") || document.body;
  const mentorId = av.mentorCharacterId;
  const won = profile.records?.treasures || [];
  const day = profile.dayCount ?? 1;
  const nextStep = nextTreasureStep(mentorId, won);
  const campaign = campaignFor(mentorId);
  const FMT = { solo4: "個人・四麻", solo3: "個人・三麻", pair: "ペア", team: "団体", final: "最終決戦" };

  // 当月開催の大会＋各種判定（目標／既得／物語ゲート／相手評価）。
  const cards = tournamentsOpenAt(day, won).map((t) => {
    const step = campaign.find((s) => s.id === t.id) || { id: t.id };
    const cfg = tournamentRunConfig(t.id, { oppLv: step.oppLv, finalFormat: step.finalFormat });
    const gate = tournamentGate(profile, cfg);
    const story = tournamentStoryGate(profile, step);
    return { t, step, owned: won.includes(t.id), isGoal: nextStep?.id === t.id, gate, story };
  });

  // 九宝コレクション（定義順9枠・既得点灯・目標マーク）＋異能段位。
  const collection = TREASURE_TOURNAMENTS.map((t) => {
    const owned = won.includes(t.id);
    const goal = nextStep?.id === t.id;
    return `<div class="tmc-gem${owned ? " is-owned" : ""}${goal ? " is-goal" : ""}" title="${esc(t.treasure?.name || t.name)}${owned ? "（制覇）" : goal ? "（目標）" : ""}">
      <span class="tmc-gem-mk">${owned ? "宝" : goal ? "★" : "・"}</span><span class="tmc-gem-nm">${esc(t.treasure?.name || "")}</span></div>`;
  }).join("");
  const rank = treasureRankFor(won.length);

  const cardHtml = cards.length ? cards.map((c, i) => {
    const tags = [];
    if (c.isGoal) tags.push(`<span class="tmenu-tag is-goal">★ 目標</span>`);
    if (c.owned) tags.push(`<span class="tmenu-tag is-owned">制覇済</span>`);
    if (c.story) tags.push(`<span class="tmenu-tag is-story">物語が先</span>`);
    const ev = c.gate.ok
      ? `<span class="tmenu-eval ok">挑める（${esc(c.gate.tier?.label || "互角")}）</span>`
      : `<span class="tmenu-eval ng">門前払い必至（${esc(c.gate.tier?.label || "大劣勢")}）</span>`;
    return `<button type="button" class="tmenu-card${c.isGoal ? " is-goal" : ""}" data-i="${i}">
      <div class="tmenu-badge"><span>CUP</span></div>
      <div class="tmenu-body">
        <div class="tmenu-tags">${tags.join("")}</div>
        <div class="tmenu-name">${esc(c.t.name)}</div>
        <div class="tmenu-tre">宝『${esc(c.t.treasure?.name || "")}』<small>${esc(c.t.treasure?.reading || "")}</small></div>
        <div class="tmenu-meta">${esc(FMT[c.t.format] || "")}　・　T${c.t.tier}　・　${ev}</div>
      </div>
    </button>`;
  }).join("") : `<div class="tmenu-empty">今月（${esc(calendarLabel(day))}）は開催中の大会がありません。<br>育成して次の開催を待とう。</div>`;

  const ov = document.createElement("div");
  ov.className = "tourney-menu";
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="tmenu-wrap">
      <div class="tmenu-head">
        <div class="tmenu-h-l"><div class="tmenu-h-ttl">大会に挑む</div><div class="tmenu-h-sub">${esc(calendarLabel(day))}　開催中の卓から選ぶ</div></div>
        <div class="tmenu-rank">${rank ? `異能段位 <b>${esc(rank.name)}</b>` : "<b>無段</b>"}<small>宝 ${won.length} / 9</small></div>
      </div>
      <div class="tmc-collection">${collection}</div>
      <div class="tmenu-list">${cardHtml}</div>
      <div class="tmenu-btns"></div>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = () => { ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 180); };
  ov.querySelectorAll(".tmenu-card").forEach((b) => b.addEventListener("click", () => {
    const c = cards[Number(b.getAttribute("data-i"))];
    close();
    openTournamentForStep(c.step);
  }));
  ov.querySelector(".ts-scrim")?.addEventListener("click", () => { close(); openMentorHome(); });
  const btns = ov.querySelector(".tmenu-btns");
  btns.appendChild(mkBtn("やめておく", "btn-ron", () => { close(); openMentorHome(); }));
}

// 選ばれた大会（step）で従来の大会フローを起動（物語ゲート→門前払い→要項→開幕）。
async function openTournamentForStep(step) {
  const profile = await profileRepo.loadProfile();
  const av = activeAvatar(profile);
  if (!step) { openMentorHome({ tournamentGate: { name: "九蓮宝士", tierLabel: "九つの宝、すべて制覇！" } }); return; }
  // ストーリーゲート：物語が先。前提章（仲間の加入など）が未読なら読むまで挑めない。
  const storyPending = tournamentStoryGate(profile, step);
  if (storyPending) {
    openMentorHome({ storyGate: { scenarioId: storyPending.scenarioId, title: storyPending.title, episode: episodeNumberOf(profile, storyPending.scenarioId), locked: !!storyPending.locked } });
    return;
  }
  const t = tournamentRunConfig(step.id, { oppLv: step.oppLv, finalFormat: step.finalFormat });
  const gate = tournamentGate(profile, t);
  if (!gate.ok) { openMentorHome({ tournamentGate: { name: t.name, tierLabel: gate.tier.label, passLabel: gate.passLabel, weakLabels: gate.weakLabels, close: gate.close } }); return; }
  // 弟子ユニット＝育成HP / ライバルユニット＝oppLv連動HP（難易度）。計 unitCount＝8。
  const deshiUnit = buildDeshiUnit(av, av.mentorCharacterId, t.format, t.unitSize, profile);
  const oppHp = oppHpForLv(t.gateOppLv ?? t.rivalLv ?? 2);
  const rUnits = rivalUnits(t.id, t.tier, t.unitCount, t.unitSize, { seedPrefix: "league", startingPoints: oppHp });
  // 因縁の口上：一度リーグを共にしたネームドは「あなた」を覚えている（初対面→再会→雪辱）。
  const rivalHistory = profile.records?.rivalHistory || {};
  for (const u of rUnits) {
    if (!u.isRival) continue;
    const line = rivalIntroLineFor(u.id, rivalHistory);
    if (line) { u.introLine = line; if (u.lead) u.lead.introLine = line; }
  }
  const units = [deshiUnit, ...rUnits];
  // 各ユニットの「開始持ち点」（メンバーHPの合計）。採点の素点＝(最終−開始) の基準。
  const unitStart = {};
  for (const u of units) unitStart[u.id] = u.members.reduce((a, m) => a + (m?.stats?.startingPoints || 0), 0);
  // 開幕前に大会要項（ルール・優勝条件・ライバル紹介）の専用画面をはさむ（じっくり演出・#2）。
  showTournamentBriefing(t, rUnits, () => {
    const totals = {}; const names = {};
    const unitSuffix = { pair: "ペア", team: "チーム" }[t.format] || "";
    for (const u of units) { totals[u.id] = 0; names[u.id] = u.name + unitSuffix; }
    const strengthById = {};
    for (const u of units) strengthById[u.id] = unitStrengthFor(u, t, profile, av);
    const fieldAvgStrength = Object.values(strengthById).reduce((a, b) => a + b, 0) / (units.length || 1);
    tournamentRun = { t, matchIndex: 0, units, totals, names, deshiUnitId: deshiUnit.id, unitStart, strengthById, fieldAvgStrength };
    playTournamentMatch();
  }, () => openTournament()); // キャンセル→大会メニューを再フェッチで開き直す（古い profile を再表示しない）
}

// 大会 要項画面（開幕前）。ルール・優勝条件・ライバル紹介を“じっくり”見せてから挑む（#2）。
function showTournamentBriefing(t, rUnits, onStart, onCancel) {
  const host = el("app") || document.body;
  const FMT = { solo4: "個人戦・四人打ち", solo3: "個人戦・三人打ち", pair: "ペア戦・2対2", team: "団体戦・チーム対抗", final: "最終決戦" };
  // 大三剣杯など「3チーム卓」の団体戦は三人打ちであることを格式に添える。
  const fmtLabel = (FMT[t.format] || "") + (t.format === "team" && t.unitsAtTable === 3 ? "・三人打ち" : "");
  const word = UNIT_WORD[t.format] || "人";
  const umaStr = (t.uma || []).map((u) => (u > 0 ? "+" : "") + u).join(" / ");
  // ライバル紹介：名のある代表を最大3枚まで1枚ずつ、それ以外（多すぎる分＋無名）は1行に集約
  //（固定ステージに収めるため縦に伸ばさない・QA無スクロール。4枚だとT3=ネームド7で81pxあふれる実測）。
  const MAX_NAMED_CARDS = 3;
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
          <div class="tb-tier">${esc(fmtLabel)}　・　ティア ${t.tier}</div>
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
  const seated = seatUnitsFor(run.units, run.matchIndex, t.unitsAtTable);
  run.seatedUnitIds = seated.map((u) => u.id);
  const isLast = run.matchIndex >= t.matches - 1;
  const profile = await profileRepo.loadProfile();
  const av = activeAvatar(profile);
  // 節前ブリーフィング：卓のメンツ・形勢・総合順位を見せて「オートで観る / 自分で打つ」を選ぶ。
  // 最終節は「大一番」＝専用口上つきの手動戦のみ（最後だけは自分の手で決める＝体験の山）。
  // 節数の多い T2/T3 は「大一番へ一気に」も選べる＝道中を全シミュで流し、最終節だけが本番（再挑戦も軽い）。
  showSectionBriefing(run, t, seated, { isLast, profile, av }, {
    onAuto: () => runAutoSection(run, t, seated, profile, av),
    onManual: () => launchManualSection(run, t, seated),
    onRush: () => rushToBigMatch(run, t, profile, av),
  });
}

// 残りの道中節をすべて即時シミュレートして「大一番」（最終節ブリーフィング）へ直行する。
// 道中の観戦時間を払わず最終決戦に焦点を当てる＝T2/T3 の節数の重さと再挑戦コストの解。
function rushToBigMatch(run, t, profile, av) {
  while (run.matchIndex < t.matches - 1) {
    const seated = seatUnitsFor(run.units, run.matchIndex, t.unitsAtTable);
    run.seatedUnitIds = seated.map((u) => u.id);
    const sim = simulateLeagueSection(simSectionInput(run, t, seated, profile, av));
    applySectionResult(run, t, { standings: sim.standings });
  }
  playTournamentMatch();
}

// 手動で打つ節（従来の対局起動）。形式ごとに専用エンジンへ。
async function launchManualSection(run, t, seated) {
  const section = `第 ${run.matchIndex + 1} / ${t.matches} 節`;
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

// オート節のユニット強度。弟子=育成6パラメータ平均（ペア/団体は師匠の技Lv・修行Lvを上乗せ＝
// 「師匠も伸びる」がオート節の勝率に効く）。相手=oppLv 由来をティア上限(oppCap)で頭打ち
// ＝育てた弟子が壁を越えられる余地を残す（要求評価ランクで安定勝利になるよう校正・tournamentMaster）。
// 師匠の担ぎ(carry)は控えめに圧縮：効きすぎると弟子自身の評価ランクが勝敗のゲートでなくなるため、
// 技Lv＝1段/Lv・修行Lv＝0.5段/Lv（最大 ≒+9.5）。covenant期(T3=ペア/団体)でも“弟子のランク”が主役。
function unitStrengthFor(u, t, profile, av) {
  const avg = (p) => PARAM_KEYS.reduce((a, k) => a + (p[k] || 0), 0) / PARAM_KEYS.length;
  if (u.isDeshi) {
    let s = avg(avatarParams6(av));
    if (t.unitSize >= 2) {
      s += (mentorSkillLevel(profile, av.mentorCharacterId) - 5) * 1;
      s += (mentorGrowthFor(profile, av.mentorCharacterId).level - 1) * 0.5;
    }
    return s;
  }
  // 敵の素強度を oppLv から生成し、ティア上限で頭打ち。ネームドの +3 は上限の「外側」に乗せる＝
  // ライバルだけ壁を少し超える「強気」演出（意図的。この挙動込みで勝率を校正＝test/leaguebalance）。
  const raw = avg(paramsFromLv(t.gateOppLv ?? t.rivalLv ?? 2, "league:" + u.id));
  return Math.min(raw, t.oppCap ?? 99) + (u.isRival ? 3 : 0);
}

// オート節シミュレータへの入力（観戦・一気進行が共通で使う卓組み）。
function simSectionInput(run, t, seated, profile, av) {
  const seats = t.format === "pair" ? 4 : seated.length;
  const hands = seats * (t.rounds || 1);
  const units = seated.map((u) => ({
    id: u.id, name: run.names?.[u.id] || u.name, // ペア/団体は「◯◯ペア/チーム」表記
    color: u.color || (u.isDeshi ? "#f6b352" : "#8a96a8"),
    isHuman: !!u.isDeshi, start: run.unitStart?.[u.id] ?? t.base,
    strength: run.strengthById?.[u.id] ?? unitStrengthFor(u, t, profile, av),
  }));
  return { units, seats, hands };
}

// オートで観る節：シミュレーション＋観戦演出 → 手動と同じ result 形で合流。
function runAutoSection(run, t, seated, profile, av) {
  const { units, seats, hands } = simSectionInput(run, t, seated, profile, av);
  const sim = simulateLeagueSection({ units, seats, hands });
  showLeagueAutoWatch(run, t, units, sim, av, () =>
    onTournamentMatchDone({ standings: sim.standings, graph: { history: sim.history, players: sim.players } }));
}

// 節前ブリーフィング（第N節＝オート/手動の選択。最終節＝大一番、本気で勝負！のみ。
// 節数の多い T2/T3 は「大一番へ一気に」＝残りの道中を全シミュで流して最終節に直行できる）。
function showSectionBriefing(run, t, seated, { isLast, profile, av }, { onAuto, onManual, onRush }) {
  const host = el("app") || document.body;
  const word = UNIT_WORD[t.format] || "人";
  const mentorChar = CHARACTERS.find((c) => c.id === av?.mentorCharacterId);
  const tierLabel = tournamentGate(profile, t).tier?.label || "互角"; // 形勢＝出場ゲートと同じ評価
  // ペア/団体の「この卓のメンツ」はメンバー連名（ＡＡ・ＢＢ・ＣＣ）＝自ユニットなら相棒の顔ぶれが見える。
  const isUnitFmt = t.format === "pair" || t.format === "team";
  const memberNames = (u) => (u.members || []).map((m) => m?.name).filter(Boolean).join("・");
  const rowName = (u) => (isUnitFmt && memberNames(u)) || u.name;
  const rows = seated.map((u) => `
    <div class="tsb-row${u.isDeshi ? " me" : ""}${u.isRival ? " named" : ""}">
      <span class="tsb-dot" style="background:${u.color || (u.isDeshi ? "#f6b352" : "#777")}"></span>
      <span class="tsb-name">${esc(rowName(u))}${u.isDeshi ? '<span class="ts-you">YOU</span>' : ""}</span>
      <span class="tsb-title">${esc(u.rivalTitle || (u.isDeshi ? "" : "腕利き"))}</span>
    </div>`).join("");
  // 総合順位（開幕節はまだ無い）。上位3＋圏外なら自分の行を足す。
  const ranked = Object.keys(run.totals).sort((a, b) => run.totals[b] - run.totals[a]);
  const myPlace = ranked.findIndex((id) => id === run.deshiUnitId);
  const standRow = (id, i) => {
    const me = id === run.deshiUnitId; const v = run.totals[id] || 0;
    return `<div class="tsb-st${me ? " me" : ""}"><span class="tsb-st-p">${i + 1}</span><span class="tsb-st-n">${esc(run.names[id])}${me ? '<span class="ts-you">YOU</span>' : ""}</span><span class="tsb-st-v">${v > 0 ? "+" : ""}${v}pt</span></div>`;
  };
  const standRows = run.matchIndex === 0 ? "" :
    ranked.slice(0, 3).map(standRow).join("") + (myPlace > 2 ? standRow(run.deshiUnitId, myPlace) : "");
  // 大一番：優勝条件の目安＋師匠の口上。
  let bigHtml = "";
  if (isLast) {
    // myPlace=-1（理論上の未発見）は首位扱いにせず「追う側」に倒す（防衛的・QA指摘）。
    const diff = myPlace === 0 ? 0 : (run.totals[ranked[0]] || 0) - (run.totals[run.deshiUnitId] || 0);
    const situation = myPlace === 0 ? "top" : diff <= 40 ? "chase" : "longshot";
    const cond = myPlace === 0
      ? "首位で迎える最終節。守り切れば優勝。"
      : diff <= 40
        ? `首位と ${diff}pt 差。この節トップ（+${t.uma?.[0] ?? 50}〜）なら逆転圏。`
        : `首位と ${diff}pt 差。トップ＋大きな素点まで稼げば、道はある。`;
    const line = pickMentorBigMatchLine(av?.mentorCharacterId, situation);
    bigHtml = `
      <div class="tsb-big">
        <div class="tsb-big-cond">${esc(cond)}</div>
        <div class="tsb-big-line">${mentorChar?.assets?.icon ? `<img src="${esc(mentorChar.assets.icon)}" alt="">` : ""}<span>${esc(line)}</span></div>
      </div>`;
  }
  const ov = document.createElement("div");
  ov.className = "tourney-section" + (isLast ? " is-big" : "");
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="tsb-card">
      <div class="tsb-head">
        <div class="tsb-kicker">${esc(t.name)}</div>
        <div class="tsb-sec">${isLast ? "大 一 番 ─ 最 終 節" : `第 ${run.matchIndex + 1} / ${t.matches} 節`}</div>
      </div>
      <div class="tsb-cols">
        <div class="tsb-col">
          <div class="tsb-h">この卓のメンツ（${seated.length} ${word}）</div>
          ${rows}
          <div class="tsb-tier">形勢：<b>${esc(tierLabel)}</b></div>
        </div>
        <div class="tsb-col">
          <div class="tsb-h">総合順位${run.matchIndex === 0 ? "" : `（第 ${run.matchIndex} 節まで）`}</div>
          ${standRows || '<div class="tsb-st tsb-none">開幕節──ここから始まる。</div>'}
        </div>
      </div>
      ${bigHtml}
      <div class="tsb-btns"></div>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const close = (fn) => { ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 180); fn(); };
  const btns = ov.querySelector(".tsb-btns");
  if (isLast) {
    btns.appendChild(mkBtn("本気で勝負！", "btn-tsumo tsb-go-big", () => close(onManual)));
  } else {
    // 道中が2節以上残る T2/T3 のみ「一気に」を出す（T1=3節は道中が短く不要）。
    if (onRush && t.matches >= 4 && run.matchIndex < t.matches - 2) {
      btns.appendChild(mkBtn("大一番へ一気に", "btn-ron tsb-rush", () => close(onRush)));
    }
    btns.appendChild(mkBtn("オートで観る", "btn-ron", () => close(onAuto)));
    btns.appendChild(mkBtn("自分で打つ", "btn-tsumo", () => close(onManual)));
  }
}

// オート節の観戦演出。雀荘オートと同じ「観るだけ」のテンポ＝局ごとの結果がめくれていき、
// 弟子ユニットの大物手/被弾には師匠が相槌を打つ。スキップでまとめて結果へ。
function showLeagueAutoWatch(run, t, units, sim, av, onDone) {
  const host = el("app") || document.body;
  const mentorChar = CHARACTERS.find((c) => c.id === av?.mentorCharacterId);
  const meIdx = units.findIndex((u) => u.isHuman);
  const bondLevel = av?.bondLevel ?? 1;
  const ov = document.createElement("div");
  ov.className = "tourney-watch";
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="tw-card">
      <div class="tw-head"><span class="tw-kicker">${esc(t.name)}</span><span class="tw-sec">第 ${run.matchIndex + 1} / ${t.matches} 節 ─ オート観戦</span></div>
      <div class="tw-pts">${units.map((u, i) => `<div class="tw-pt${u.isHuman ? " me" : ""}"><span class="tw-pt-name" style="color:${u.color}">${esc(u.name)}</span><b class="tw-pt-v" data-i="${i}">${u.start.toLocaleString()}</b></div>`).join("")}</div>
      <div class="tw-log"></div>
      <div class="tw-quip">${mentorChar?.assets?.icon ? `<img src="${esc(mentorChar.assets.icon)}" alt="">` : ""}<span class="tw-quip-t"></span></div>
      <div class="tw-btns"></div>
    </div>`;
  host.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  const log = ov.querySelector(".tw-log");
  const quipEl = ov.querySelector(".tw-quip-t");
  const setQuip = (ev) => { const q = pickMentorBattleQuip(av?.mentorCharacterId, ev, { bondLevel }); if (q) quipEl.textContent = q; };
  setQuip("matchStart");
  const renderStep = (s) => {
    const row = document.createElement("div");
    row.className = "tw-row";
    if (s.draw) {
      row.innerHTML = `<span class="tw-r-l">${esc(s.label)}</span><span class="tw-r-t">流局</span>`;
    } else {
      const w = units[s.winner];
      row.classList.add(s.winner === meIdx ? "win" : s.victim === meIdx ? "pay" : "other");
      const how = s.tsumo ? "ツモ" : `${esc(units[s.victim]?.name || "")} から`;
      row.innerHTML = `<span class="tw-r-l">${esc(s.label)}</span><span class="tw-r-t"><b style="color:${w.color}">${esc(w.name)}</b> が ${how} <b>${s.value.toLocaleString()}</b>${s.big ? '<i class="tw-bigtag">大物手！</i>' : ""}</span>`;
      if (s.winner === meIdx && s.big) { setQuip("bigWin"); audio.playPip?.(2600, 0.4); }
      else if (s.victim === meIdx && s.big) setQuip("bigLoss");
      s.points.forEach((p, idx) => { const elv = ov.querySelector(`.tw-pt-v[data-i="${idx}"]`); if (elv) elv.textContent = p.toLocaleString(); });
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  };
  let i = 0; let timer = null; let done = false;
  const btns = ov.querySelector(".tw-btns");
  const finish = () => {
    if (done) return; done = true;
    if (timer) clearInterval(timer);
    while (i < sim.steps.length) renderStep(sim.steps[i++]);
    setQuip("complete");
    btns.innerHTML = "";
    btns.appendChild(mkBtn("結果へ", "btn-tsumo", () => { ov.classList.remove("is-open"); setTimeout(() => ov.remove(), 180); onDone(); }));
  };
  btns.appendChild(mkBtn("スキップ", "btn-ron", finish));
  timer = setInterval(() => { if (i >= sim.steps.length) { finish(); return; } renderStep(sim.steps[i++]); }, 850);
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

// =============================================================== ローグライト（F7）
// 麻雀×ローグライト。ペア戦エンジン（2対2同卓）を流用し、味方2人で敵2人を削る。
// HPは独自スケール（敵1000〜・点棒をDAMAGE_SCALEで写像）。勝つ毎にバフカードを選び、
// 継続 or 撤退。全滅でラン没収。最深到達階層（撃破数）を profile.roguelite に記録する。
// カード効果は完全マスタドリブン（rogueliteCardMaster.js）＋既存能力フックへ相乗り。

// エントリ：パーティ編成画面を開く。修行完了弟子＋通常キャラから1〜3人を選んで出発。
async function openRoguelite() {
  rogueliteState = null;
  exitRogueliteAmbience(); // ラン専用背景を片付け、キャラ選択へ
  audio.playSelectBgm();   // 選択画面のBGMへ戻す
  let profile = null;
  try { profile = await profileRepo.loadProfile(); } catch { /* 未ログインでも遊べる */ }
  unlockedCharIds = new Set(profile?.unlockedCharacters || []); // 宝珠ショップの解禁状態（鍵カードの解放）
  const roster = (profile?.completedAvatars || []).map((ca) => completedAvatarToChar(ca));
  if (roster.length) {
    try { await charImages.load(roster); } catch { /* 画像無しはフォールバック */ }
    for (const c of roster) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  }
  // パーティ候補：修行完了弟子（あれば）＋お気に入り/詩玥などの通常キャラ。
  const best = profile?.roguelite?.bestFloor || 0;
  const carryCards = (profile?.roguelite?.carry || []).map((id) => cardById(id)).filter(Boolean);
  // 中断したランがあれば「再開しますか？」を先に出す（復元できる場合のみ）。
  const savedData = loadSavedRogueliteRunData();
  if (savedData) {
    const resolver = makeRogueliteCharResolver(roster);
    const restored = deserializeRun(savedData, resolver);
    if (restored) {
      goScreen("roguelite-screen");
      showRogueliteResume(el("roguelite-screen"), {
        floor: restored.floor,
        partyNames: restored.party.map((m) => m.char?.name || "?"),
        onResume: () => resumeRogueliteRun(restored),
        onDiscard: () => { clearSavedRogueliteRun(); openRoguelite(); },
      });
      return;
    }
    clearSavedRogueliteRun(); // 復元不能（メンバー欠落等）は破棄
  }
  // 大章（記憶）選択ハブ → 編成 → 出発（提案B §3.1 ①）。どの記憶を登るかを最初に選ぶ。
  const cleared = profile?.roguelite?.chaptersCleared || [];
  let orbs = profile?.orbs || 0; // 宝珠で章解禁（提案D）に使える残高（解禁後に減る→再描画で反映）
  let orbUnlockedIds = [...(profile?.roguelite?.chaptersUnlocked || [])]; // 宝珠で先行解禁済みの章
  // 編成画面（選んだ記憶を抱えて出発）。onBack で記憶選択へ戻れる。
  const showPartyFor = (chapterId) => {
    showRoguelite(el("roguelite-screen"), {
      deshiRoster: roster,
      characters: CHARACTERS,
      unlockedIds: unlockedCharIds, // 未解禁キャラ（locked）はパーティ候補で鍵・非アクティブに
      charImages,
      bestFloor: best,
      carry: carryCards, // 引き継ぎ中のバフ（表示用）
      companionBonds: profile?.companionBonds || {}, // 相棒絆Lv（枠の灯の色＝間柄の段階表示に使う）
      backLabel: "← 記憶を選ぶ", // 戻り先＝大章選択ハブ（ボタンは行き先を名乗る）
      onBack: () => showChapterHub(),
      onStart: (party) => startRogueliteRun(party, chapterId),
    });
    goScreen("roguelite-screen");
  };
  const showChapterHub = () => {
    showRogueliteChapterSelect(el("roguelite-screen"), {
      chapters: chaptersWithState(cleared, orbUnlockedIds), bestFloor: best, orbs,
      onPick: (chapterId) => showPartyFor(chapterId),
      onBack: () => goScreen("battle-home-screen"),
      onOrbUnlock: (chapterId) => orbUnlockChapter(chapterId, cleared, orbUnlockedIds, orbs, (newOrbs) => { orbs = newOrbs; showChapterHub(); }),
    });
    goScreen("roguelite-screen");
  };
  showChapterHub();
}

// 宝珠で章を先行解禁する（提案D・別ルート／仕組み）。所持・条件を満たせば宝珠を払い、解禁を永続してハブを再描画。
async function orbUnlockChapter(chapterId, cleared, orbUnlockedIds, orbs, done) {
  const chap = chapterById(chapterId);
  if (!canOrbUnlock(chap, cleared, orbUnlockedIds, orbs)) return; // 二重押し/不足/予告枠は弾く
  const cost = chap.orbUnlockCost;
  orbUnlockedIds.push(chapterId); // ローカルに反映（再描画で解禁表示）
  const nextOrbs = Math.max(0, orbs - cost);
  rlLog("chapter_orb_unlock", { chapter: chapterId, cost });
  try {
    const p = await profileRepo.loadProfile();
    if (p) {
      const unlocked = [...new Set([...(p.roguelite?.chaptersUnlocked || []), chapterId])];
      p.orbs = Math.max(0, (p.orbs || 0) - cost);
      p.roguelite = { ...(p.roguelite || {}), chaptersUnlocked: unlocked };
      await profileRepo.saveProfile(p);
    }
  } catch { /* 永続失敗時もこのセッションの解禁は活かす（次回再取得で整合） */ }
  done?.(nextOrbs);
}

// 宝珠ショップで買った恒久バフ（profile.rogueliteShopBuffs：id→レベル）を新ランへ適用する。
// kind ごとに run.mods / 光貨 / 最大HP を底上げ（ラン開始時点。SHOP_BUFFS が単一の出どころ）。
function applyShopBuffsToRun(run, shopBuffs) {
  if (!run || !shopBuffs) return;
  for (const b of SHOP_BUFFS) {
    const lv = shopBuffs[b.id] | 0;
    if (lv <= 0) continue;
    if (b.kind === "dealMul") run.mods.dealMul = (run.mods.dealMul || 1) * (1 + b.perLevel * lv);
    else if (b.kind === "takeMul") run.mods.takeMul = (run.mods.takeMul || 1) * Math.max(0.1, 1 - b.perLevel * lv);
    else if (b.kind === "startCoins") run.coins = (run.coins || 0) + b.perLevel * lv;
    else if (b.kind === "startHp") {
      const mul = 1 + b.perLevel * lv;
      for (const m of run.party) { m.hpMax = Math.round(m.hpMax * mul); m.baseHp = m.hpMax; m.hp = m.hpMax; }
    }
    else if (b.kind === "clusterTier") run.clusterTierCap = 1 + lv; // 流派の極意：2段目（極み等）を解放（lv=1→cap=2）

  }
}

// パーティ（charById で解決済みの CHARACTER 配列）からランを開始し、1階の対局へ。
// 引き継ぎバフ（profile.roguelite.carry）を新ランへ適用してから出発する（ローグライク）。
async function startRogueliteRun(partyChars, chapterId = null) {
  const party = (partyChars || []).filter(Boolean).map((c) => ({ id: c.id, char: c }));
  if (!party.length) return;
  const chap = chapterById(chapterId || firstChapterId()); // 登る記憶（大章）
  // ボス陣＝この記憶の群像（章の cast）から立ちはだかる（提案B・縦軸の結びつけ）。
  const bossPool = (chap?.cast || []).map((c) => c.id).filter(Boolean);
  // 章別オーバーライド（tools/roguelite-designer.html が生成）。指定キーだけ上書き＝未指定はグローバル既定。
  const chapOver = chap ? {
    floors: chap.floors || null, biome: chap.biome || null, itemPool: chap.itemPool || null,
    cardPool: chap.cardPool || null, rarityWeights: chap.rarityWeights || null, economy: chap.economy || null,
    bossHpMul: chap.bossHpMul ?? null, routeCount: chap.routeCount ?? null, colorSet: chap.colorSet || null,
    tableSizeDist: chap.tableSizeDist || null, // 章別の卓サイズ分布（戦闘4/3/2・ボス4/3の重み）
  } : null;
  const run = newRun(party, undefined, chap?.id || null, bossPool, chap?.bossFloors || null, chap?.tuning || null, chapOver);
  rlLog("chapter_start", { chapter: run.chapterId, bossPool: run.bossPool });
  let profile = null;
  try { profile = await profileRepo.loadProfile(); } catch { /* 引き継ぎ無しで開始 */ }
  for (const id of profile?.roguelite?.carry || []) {
    const c = cardById(id);
    if (c) applyCard(run, c);
  }
  applyShopBuffsToRun(run, profile?.rogueliteShopBuffs); // 宝珠ショップで買った恒久バフを開始時に反映
  // ボス記憶（提案B）：プロフィールの通算勝敗をランへ持ち込む（対局前口上の出し分けに使う・ラン内で更新→永続）。
  // 潜行履歴（提案B スライス2）：過去最深・撤退回数を持ち込み、相棒のセリフ ctx（rlVoiceCtx）に効かせる。
  rogueliteState = { run, bossTally: readBossTally(profile), bestFloor: profile?.roguelite?.bestFloor || 0, retreatCount: profile?.roguelite?.retreats || 0, resolveClimb: profile?.roguelite?.resolve?.climb || 0, chaptersCleared: [...(profile?.roguelite?.chaptersCleared || [])], beatsSeen: [...(profile?.roguelite?.beatsSeen || [])] };
  setRlRunId(run.seed); // このランのイベントを run_id=seed で束ねる
  rlLog("run_start", { seed: run.seed, party: run.party.map((p) => p.id), ...rlBuffSnap(run) });
  saveRogueliteRun(run); // 中断ランの一時保存（floor1 初期状態）
  goScreen("roguelite-screen"); // 章introオーバーレイを乗せる前に楼光画面をアクティブ化（従来は enterFloor 内 goScreen が担保）
  enterRogueliteAmbience(); // 専用バックグラウンド＋探索BGM（キャラ選択の見た目を引きずらない）
  // 章intro口上（提案B・縦軸の結びつけ）：記憶へ入る導入を一度だけ。相棒(先頭)が記憶へ踏み出す一言を添える。
  // ※ 中身はモック。姚玖/春嬋の作り込みは未着手のため、語り口は相棒（well-defined）＋章フレーミングに留める。
  showChapterIntroThen(run, chap, () => enterFloor(run, floorTypeById("normal"))); // 1階は通常戦闘から
}
// 記憶へ入る導入を出してから続行（章が無ければ素通り）。相棒の rlChapterIntro を一言添える。
function showChapterIntroThen(run, chap, after) {
  if (!chap) { after?.(); return; }
  const lead = run.party?.[0]?.char || null;
  const leadLine = lead ? vline(lead.id, "rlChapterIntro", { ...rlVoiceCtx(), rlChapter: run.chapterId }) : null;
  showRogueliteChapterIntro(el("roguelite-screen"), {
    chapter: chap, leadChar: lead, leadLine, charImages,
    onProceed: () => after?.(),
  });
}

// 中断ランの再開：復元済み run を rogueliteState に据え、進路から再開する。
async function resumeRogueliteRun(run) {
  // ボス記憶（提案B）：再開時もプロフィールから通算勝敗を復元（口上の出し分け用）。
  let resumeProfile = null;
  try { resumeProfile = await profileRepo.loadProfile(); } catch { /* 読込失敗は空タリーで継続 */ }
  rogueliteState = { run, bossTally: readBossTally(resumeProfile), bestFloor: resumeProfile?.roguelite?.bestFloor || 0, retreatCount: resumeProfile?.roguelite?.retreats || 0, resolveClimb: resumeProfile?.roguelite?.resolve?.climb || 0, chaptersCleared: [...(resumeProfile?.roguelite?.chaptersCleared || [])], beatsSeen: [...(resumeProfile?.roguelite?.beatsSeen || [])] };
  setRlRunId(run.seed); // 再開＝同じ run_id（seed）でログが繋がる
  rlLog("run_resume", { seed: run.seed, floor: run.floor, ...rlBuffSnap(run) });
  try { await charImages.load(run.party.map((m) => m.char).filter((c) => c && !c.isMob)); } catch { /* 画像はフォールバック */ }
  for (const m of run.party) audio.registerCharacterVoices(m.char?.id, m.char?.assets?.voices || {});
  enterRogueliteAmbience();
  renderRoute(run); // 現在の階の進路から再開（ルートは決定論なので同じ選択肢）
}

// 楼光の館の専用アンビエンス。roguelite-screen の背景を館（廃墟）に差し替え、探索BGMを流す。
// 進行モーダルはこの背景の上に重なる（キャラ選択のUIが透けない）。対局から戻るたびに呼び直す。
const ROGUELITE_BG_ID = "bg-ruins"; // 廃墟の部屋＝塔を登るダンジョン感（実リソース）
function enterRogueliteAmbience() {
  const host = el("roguelite-screen");
  if (host) {
    host.classList.add("rl-in-run");
    host.querySelector(".rl-screen")?.remove(); // キャラ選択UIを片付ける（背景に引きずらない）
    let bd = host.querySelector(".rl-run-backdrop");
    if (!bd) { bd = document.createElement("div"); bd.className = "rl-run-backdrop"; host.insertBefore(bd, host.firstChild); }
    const bgId = biomeOf(rogueliteState?.run)?.bg || ROGUELITE_BG_ID; // 層ごとに背景が変わる
    const img = bgDef(bgId)?.image;
    bd.style.backgroundImage = img ? `url('${img}')` : "";
  }
  audio.playRogueliteBgm(biomeOf(rogueliteState?.run)?.bgm); // 層のBGM（未指定は朔夜）
}
function exitRogueliteAmbience() {
  const host = el("roguelite-screen");
  host?.classList.remove("rl-in-run");
  host?.querySelector(".rl-run-backdrop")?.remove();
}

// チューニングログ用：いまのバフ・パーティ・道具の要約スナップショット。
function rlBuffSnap(run) {
  const m = run?.mods || {};
  const im = itemMods(run);
  return {
    skillLevel: run?.skillLevel || 1,
    hpMulEff: +((m.hpMul || 1)).toFixed(3),     // 累積HP倍率（成長曲線の主指標）
    dealMul: +((m.dealMul || 1)).toFixed(3),    // 累積与ダメ倍率
    takeMul: +((m.takeMul || 1)).toFixed(3),    // 累積被ダメ倍率（小さいほど硬い）
    friendlyGuard: m.friendlyGuard || 0,
    coinMul: +(im.coinMul).toFixed(2),
    items: [...(run?.items || [])],
    cards: (run?.cards || []).length,
    hp: (run?.party || []).map((p) => `${p.id}:${Math.max(0, p.hp)}/${p.hpMax}`),
    hpTotal: (run?.party || []).reduce((a, p) => a + Math.max(0, p.hp), 0),
    clusters: { ...(m.clusterCount || {}) }, // 流派ごとの取得枚数（提案A・ビルド傾向の主指標）
    mainCluster: dominantCluster(m.clusterCount), // 最多流派（=このランの軸）
  };
}
// 最多の流派id（同数/無しは null）。計測（勝利ビルド出現率）の集計軸。
function dominantCluster(counts) {
  if (!counts) return null;
  let best = null, bn = 0, tie = false;
  for (const [k, v] of Object.entries(counts)) { if (v > bn) { best = k; bn = v; tie = false; } else if (v === bn && bn > 0) tie = true; }
  return bn > 0 && !tie ? best : null;
}
// 楼光の館：意思決定の瞬間に先頭キャラが一言「返す」（愛着×双方向）。
const rlLead = () => rogueliteState?.run?.party?.[0]?.char || null;
// 調整ログを Supabase(roguelite_logs) へバッチ送信（localStorage は常に正本・Supabaseは集約用）。
setRlLogSink(async (rows) => { const { error } = await supabase.from("roguelite_logs").insert(rows); if (error) throw error; });
// 調整用ログのデバッグアクセス（コンソール/ボタンから）。window.rogueliteTuningLog.download() で取得。
if (typeof window !== "undefined") {
  window.rogueliteTuningLog = { all: rlLogAll, jsonl: rlLogJSONL, csv: rlLogCSV, download: rlLogDownload, clear: rlLogClear, flush: flushRlLog };
  window.addEventListener("beforeunload", () => { try { flushRlLog(); } catch { /* ベストエフォート */ } });
}
function cardFamily(card) {
  const k = card?.effect?.kind;
  if (k === "grantAbility") return "ability";
  if (k === "takeReduce") return "defense";
  if (k === "heal" || k === "maxHpUp") return "sustain";
  if (k === "addBench") return "ally";
  if (k === "dealMul") return "attack";
  if (k === "compound") {
    const parts = card.effect.parts || [];
    if (parts.some((p) => p.kind === "dealMul")) return "attack";
    if (parts.some((p) => p.kind === "takeReduce")) return "defense";
    return "sustain";
  }
  return "attack";
}
// 楼光の館・相棒が「あなたの潜行履歴」に反応するための動的 ctx（提案B スライス2・固有性）。
// 最多流派・この潜行の踏破数（勢い）・自己ベスト更新中か・撤退癖を、相棒のセリフ条件へ渡す。
function rlVoiceCtx() {
  const run = rogueliteState?.run;
  if (!run) return {};
  return {
    rlChapter: run.chapterId || null, // 登っている記憶（大章）id＝章ごとのセリフ出し分けに（cond.rlChapter）
    rlMainCluster: dominantCluster(run.mods?.clusterCount),
    rlCleared: run.cleared || 0,
    rlRetreatHabit: rogueliteState.retreatCount || 0,
    rlResolveClimb: rogueliteState.resolveClimb || 0, // 「また登る」を選び続けた回数＝挑み続ける性分（双方向で覚える）
    rlDeepRun: run.floor > (rogueliteState.bestFloor || 0), // 過去最深を超えて潜っている＝自己ベスト更新中
  };
}
function rogueliteSpeak(event, ctx = {}) {
  const lead = rlLead();
  if (!lead) return;
  const line = vline(lead.id, event, { ...rlVoiceCtx(), ...ctx });
  if (line) showRogueliteSpeak(el("roguelite-screen"), { char: lead, charImages, line });
}
// 群像＝物語の縦軸を背負うテーマの面々（兄弟弟子＋御庭番）。二人相槌はこの面々が2人以上いるときだけ滲ませる。
const RL_THEMED_CAST = new Set(["shiyue", "kuidoshi", "mamori", "yao_chu", "chun_chan"]);
// 休息など落ち着いた拍で、相棒(先頭)＋控えのテーマ相方がいれば“群像の二人相槌”を時折挟む（提案B スライス2・最小）。
// 発火可否は seed×floor で決定論（再描画で二度出さない）。出さない場合は after をそのまま呼ぶ。
function maybePlayBanter(run, after) {
  const lead = run.party?.[0]?.char;
  if (!lead || !RL_THEMED_CAST.has(lead.id)) { after?.(); return; }
  const partnerMember = run.party.slice(1).find((m) => m.char && RL_THEMED_CAST.has(m.char.id) && m.char.id !== lead.id);
  const partner = partnerMember?.char;
  if (!partner) { after?.(); return; }
  // 毎休息では出さない（半々）。同一フロアでは決定論で固定＝再描画しても揺れない。
  if (makeRng(`${run.seed}:banter:${run.floor}`)() >= 0.5) { after?.(); return; }
  const ctx = rlVoiceCtx();
  const aLine = vline(lead.id, "rlBanter", ctx);
  const bLine = vline(partner.id, "rlBanterReply", ctx);
  if (!aLine || !bLine) { after?.(); return; }
  charImages.load([lead, partner].filter((c) => c && !c.isMob)).finally(() => {
    rlLog("banter", { floor: run.floor, a: lead.id, b: partner.id });
    showRogueliteBanter(el("roguelite-screen"), { a: { char: lead, line: aLine }, b: { char: partner, line: bLine }, charImages, onDone: () => after?.() });
  });
}
// 能力をスキルレベルで生成する。レベルテーブルを持つ能力は run.skillLevel の params で強化、
// 持たない能力は baseParams のまま。レベルは各能力テーブルの上限でクランプ。
function skilledAbility(abilityId, baseParams, skillLevel) {
  try {
    const tmpl = templateForAbility(abilityId);
    if (tmpl?.levelTableId) {
      const max = maxSkillLevel(tmpl.levelTableId) || 1;
      const lv = Math.max(1, Math.min(max, skillLevel || 1));
      const p = skillRuntimeAbilityParams(tmpl.levelTableId, lv);
      if (p && Object.keys(p).length) return createAbility(abilityId, p);
    }
    return createAbility(abilityId, baseParams || {});
  } catch { return null; } // 未知能力は無視
}

// 追加必殺枠（付与能力）の上限管理。カード適用後に枠超過していれば、ポケモン式の忘却モーダルで
// 1つ手放させる（手放した能力は取得履歴 run.cards からも除いて再ドラフト可能に戻す）。超過なしは即 after()。
function enforceGrantCap(run, after) {
  const ids = run.mods.grantedAbilityIds;
  if (ids.length <= MAX_GRANTED_ABILITIES) { after?.(); return; }
  const host = el("roguelite-screen");
  const newId = ids[ids.length - 1]; // 直近に覚えた能力（強調表示用）
  showRogueliteForget(host, {
    abilities: ids.map((id) => ({ id, name: abilityDef(id)?.name || id, desc: abilityDef(id)?.desc || "" })),
    newId, cap: MAX_GRANTED_ABILITIES,
    onForget: (forgetId) => {
      run.mods.grantedAbilityIds = ids.filter((id) => id !== forgetId);
      // 手放した付与カードを履歴から1枚戻す＝再ドラフト可能に（card.effect.abilityId で同定）。
      const ci = run.cards.findIndex((cid) => {
        const c = ROGUELITE_CARD_MASTER.find((x) => x.id === cid);
        return c && c.effect?.kind === "grantAbility" && c.effect.abilityId === forgetId;
      });
      if (ci >= 0) {
        run.cards.splice(ci, 1);
        recomputeClusterCount(run); // 流派タグ付き付与札を手放したら clusterCount を再集計（しきい値のオーバーカウント防止）。
      }
      enforceGrantCap(run, after); // 念のため再判定（多重超過の保険）
    },
  });
}

// 所持バフ一覧（重複は枚数でまとめる・蓄積の可視化）。
function heldBuffs(run) {
  const count = {};
  for (const id of run.cards) count[id] = (count[id] || 0) + 1;
  return Object.entries(count).map(([id, n]) => { const c = cardById(id); return c ? { name: c.name, rarity: c.rarity, count: n, desc: c.desc } : null; }).filter(Boolean);
}

// フロア種別ごとのディスパッチ。戦闘以外（休息/宴会/宝箱/遭遇）は即解決して advanceRoguelite へ。
function enterFloor(run, floorType) {
  rogueliteState.floorType = floorType;
  rogueliteState.gamble = false; // 博打マス入場時にだけ true（被ダメ貫通2倍）。他種別では確実にOFF。
  const host = el("roguelite-screen");
  goScreen("roguelite-screen");
  // 調整ログ：フロア入場（種別・バイオーム・現バフ/HP状況）。
  { const bi = biomeOf(run); rlLog("floor", { floor: run.floor, kind: floorType?.kind, enemy: floorType?.enemy || null, biome: bi?.id, biomeMods: bi?.mods || {}, ...rlBuffSnap(run) }); }
  switch (floorType?.kind) {
    case "battle":
    case "gamble": {
      // 博打マスも通常/強敵/ボスと同じフロー（出陣編成→対局→局終わりの追撃）。違いは被ダメが
      // 防御流派を貫通して2倍になる点だけ（rogueliteState.gamble で showPairBattleDamageFx が反映）。
      rogueliteState.gamble = floorType?.kind === "gamble";
      rogueliteState.pursuing = false;
      // 対局突入の直前に「出陣編成」を1枚挟む（誰を卓に出すか＋HP/携えるもの確認 → 出陣で対局）。
      // 戻れば進路へ。ボスは編成確認のあとボス導入演出→対局。
      const launch = (armed) => {
        if (armed) spendAbilitySource(run, 1); // 能力の源を1個消費（インゲームで能力/必殺技/相方指示が有効化）
        rogueliteState.armed = !!armed;
        saveRogueliteRun(run);
        if (floorType?.enemy === "boss") showBossIntroThenBattle(run, floorType); else launchRogueliteBattle(run, floorType);
      };
      showRogueliteDeploy(host, { run, floorType, charImages, audio, onConfirm: launch, onBack: () => renderRoute(run) });
      break;
    }
    case "rest": {
      healParty(run, floorOverride(run, floorType.id)?.healFrac ?? floorType.healFrac ?? 0.3);
      const before = run.abilitySource ?? 0;
      gainAbilitySource(run, 1); // 休息で能力の源を1回復（上限3は超えない）
      showRogueliteRest(host, { kind: "rest", floor: run.floor, run, charImages, sourceRestored: (run.abilitySource ?? 0) > before, onDone: () => maybePlayBanter(run, () => advanceRoguelite(run)) });
      break;
    }
    case "banquet": {
      healParty(run, floorOverride(run, floorType.id)?.healFrac ?? floorType.healFrac ?? 1);
      const rng = makeRng(`${run.seed}:banquet:${run.floor}`);
      rollHangover(run, floorOverride(run, floorType.id)?.hangoverChance ?? floorType.hangoverChance ?? 0.35, rng);
      // 酔い止め（道具）：誰かが酔ったら身代わりに割れて全員の二日酔いを防ぐ（消費）。
      let soberUsed = false;
      if (run.party.some((m) => m.hungover) && consumeBanquetCharm(run)) { for (const m of run.party) m.hungover = false; soberUsed = true; }
      const hung = run.party.filter((m) => m.hungover).map((m) => m.char?.name || "?");
      showRogueliteRest(host, { kind: "banquet", floor: run.floor, run, charImages, hungover: hung, soberUsed, onDone: () => advanceRoguelite(run) });
      break;
    }
    case "treasure": {
      // プレゼント（物資）マス。「道具1つ」or「バフ3択」のどちらか（決定論抽選）。さらに能力の源が
      // 上限未満なら、いずれの提示にも「能力の源 +1」の選択肢を1枚混ぜる（HP/バフ以外の補給導線）。
      const trng = makeRng(`${run.seed}:treasure:${run.floor}`);
      const items = drawItems(trng, { count: 1, exclude: run.items, pool: run.over?.itemPool || null });
      // 源回復の選択肢（synthetic card）。上限に達していたら出さない。
      const sourceCard = (run.abilitySource ?? 0) < ABILITY_SOURCE_MAX
        ? { id: "__source", name: "能力の源", desc: `能力の源を1つ補充する（${run.abilitySource ?? 0}→${Math.min(ABILITY_SOURCE_MAX, (run.abilitySource ?? 0) + 1)}／上限${ABILITY_SOURCE_MAX}）。出陣前に使えば能力・必殺技で打てる。`, rarity: "rare", category: "item", _source: true }
        : null;
      const isItemBox = items.length && trng() < 0.5;
      const baseCards = isItemBox
        ? [{ id: items[0].id, name: items[0].name, desc: items[0].desc, rarity: "rare", icon: items[0].icon, _item: true }]
        : rollDraft(run, { hpRatio: 1 });
      const cards = sourceCard ? [...baseCards, sourceCard] : baseCards;
      showRogueliteDraft(host, {
        floor: run.floor, title: isItemBox ? "プレゼント：物資を選ぶ" : "プレゼント：力を1つ選ぶ", cards, charImages, coins: run.coins || 0, run,
        onPick: (card) => {
          const proceed = () => enforceGrantCap(run, () => advanceRoguelite(run)); // 必殺枠が3つ目なら忘却モーダル
          if (card?._source) { gainAbilitySource(run, 1); proceed(); return; }   // 源を1補充して前進
          if (card?._item) { grantRogueliteItem(run, card.id, () => advanceRoguelite(run)); return; } // 道具を授かる
          const lvlUp = card ? clusterLevelUp(run, card) : null; // 取得前に段越えを判定（②演出）
          if (card) { applyCard(run, card); rogueliteSpeak("rlBuff", { buffFamily: cardFamily(card) }); }
          if (lvlUp) showRogueliteClusterLevelUp(host, { items: [lvlUp], onClose: proceed });
          else proceed();
        },
      });
      break;
    }
    case "event": {
      run.eventSeen = true; // 遭遇イベントを体験した（序盤確定枠の判定に使う）
      const ev = pickEvent(makeRng(`${run.seed}:event:${run.floor}`), { exclude: rogueliteState.lastEvent ? [rogueliteState.lastEvent] : [] });
      rogueliteState.lastEvent = ev?.id;
      showRogueliteEvent(host, {
        event: ev, speakerChar: ev?.speakerId ? charById(ev.speakerId) : null, floor: run.floor, charImages,
        onChoose: (choice) => applyEventOutcome(run, choice?.outcome),
        onDone: () => advanceRoguelite(run),
      });
      break;
    }
    case "shop":
      showRogueliteShop(host, {
        floor: run.floor, run, stock: shopStock(run, makeRng(`${run.seed}:shop:${run.floor}`)),
        onBuy: (item) => {
          // 道具の購入は枠(3)管理が要るので main 側で。光貨を払って grantRogueliteItem（満杯なら入れ替え）。
          if (item?.type === "item") {
            if ((run.coins || 0) < item.price) return false;
            run.coins -= item.price;
            grantRogueliteItem(run, item.item.id, () => {});
            return true;
          }
          // カード購入は段越えを「取得前」に判定（②演出）。ドラフト取得と同じ経路に揃える。
          const lvlUp = item?.type === "card" && item.card ? clusterLevelUp(run, item.card) : null;
          const ok = buyShopItem(run, item); // 戻り値 true=成立（UIが光貨/在庫を更新）
          if (ok && item?.type === "card") {
            rogueliteSpeak("rlBuff", { buffFamily: cardFamily(item.card) }); // バフ獲得ボイス
            if (lvlUp) showRogueliteClusterLevelUp(host, { items: [lvlUp] }); // 流派が一段強くなった演出（ショップに重ねて表示）
            if (isGrantCard(item.card)) enforceGrantCap(run, () => {}); // 必殺枠超過なら忘却モーダル
          }
          return ok;
        },
        onLeave: () => advanceRoguelite(run),
      });
      break;
    case "shrine": {
      // 祠＝供物の選択（イベントUIを流用。痛みと引き換えの強大な恩恵）。
      const shrineEvent = { title: "祠", lines: ["苔むした祠が、かすかに脈打っている。", "「捧げよ。さらば、力を授けよう」"], choices: shrineOffers(run) };
      showRogueliteEvent(host, {
        event: shrineEvent, speakerChar: null, floor: run.floor, charImages, affordCoins: run.coins || 0,
        onChoose: (choice) => applyEventOutcome(run, choice?.outcome),
        onDone: () => advanceRoguelite(run),
      });
      break;
    }
    case "forge":
      // 鍛冶屋：光貨を払ってパーティのスキルレベルを+1（能力強化）。上限Lv10。
      // Lv上限に達した後は「限界突破」＝光貨を大量に払って攻撃力(与ダメ)を鍛え続けられる。
      showRogueliteForge(host, {
        floor: run.floor, run, cap: SKILL_LEVEL_CAP, costOf: (lv) => forgeCost(lv, chapterEconomy(run)),
        overchargeCostOf: forgeOverchargeCost, overchargeDeal: FORGE_OVERCHARGE_DEAL,
        onForge: () => {
          const cost = forgeCost(run.skillLevel, chapterEconomy(run));
          if ((run.coins || 0) >= cost && run.skillLevel < SKILL_LEVEL_CAP) { run.coins -= cost; run.skillLevel += 1; return true; }
          return false;
        },
        onOvercharge: () => {
          const n = run.forgeOvercharge || 0;
          const cost = forgeOverchargeCost(n);
          if ((run.coins || 0) >= cost && run.skillLevel >= SKILL_LEVEL_CAP) {
            run.coins -= cost;
            run.forgeOvercharge = n + 1;
            run.mods.dealMul = (run.mods.dealMul || 1) * (1 + FORGE_OVERCHARGE_DEAL);
            rlLog("forgeOvercharge", { floor: run.floor, cost, n: run.forgeOvercharge, dealMul: run.mods.dealMul });
            return true;
          }
          return false;
        },
        onLeave: () => advanceRoguelite(run),
      });
      break;
    case "recruit": {
      // 流派の門：光貨を多く払い、候補3人から1人を迎え1人を送り出す（PTは3人のまま）。
      const cands = recruitCandidates(run, 3);
      const recCost = chapterEconomy(run)?.recruitCost ?? RECRUIT_COST; // 章ごとに流派の門の費用を上書き可
      charImages.load(cands.filter((c) => !c.isMob)).then(() => {
        showRogueliteRecruit(host, {
          run, candidates: cands, cost: recCost, charImages,
          onSwap: (ci, ri) => {
            const inId = cands[ci]?.id, outId = run.party[ri]?.id;
            run.coins = Math.max(0, (run.coins || 0) - recCost);
            swapPartyMember(run, cands[ci], ri);
            rlLog("recruit", { floor: run.floor, in: inId, out: outId, cost: recCost });
            advanceRoguelite(run);
          },
          onSkip: () => advanceRoguelite(run),
        });
      });
      break;
    }
    default:
      advanceRoguelite(run); // 未知種別は素通り（保険）
  }
}

// 遭遇イベントの選択結果をランへ適用（マスタ駆動・cardEffects/回復/供物を流用）。
function applyEventOutcome(run, outcome) {
  if (!outcome) return;
  if (outcome.coins) run.coins = Math.max(0, (run.coins || 0) + outcome.coins); // 供物/報酬（負=支払い）
  if (outcome.healFrac) healParty(run, outcome.healFrac);
  // 供物（生存メンバーのみ・最低1残す）。トんだメンバーは対象外＝1HPで復活させない。
  if (outcome.hurtFrac) for (const m of run.party) if (m.hp > 0) m.hp = Math.max(1, m.hp - Math.round(m.hpMax * outcome.hurtFrac));
  if (outcome.effect) applyEffect(run, outcome.effect);
  if (outcome.cardId) { const c = cardById(outcome.cardId); if (c) applyCard(run, c); }
  // 道具報酬（特定id or 未所持からランダム）。満杯なら入れ替えモーダル。
  if (outcome.item) grantRogueliteItem(run, outcome.item, () => {});
  if (outcome.itemRandom) { const it = drawItems(makeRng(`${run.seed}:evitem:${run.floor}`), { count: 1, exclude: run.items, pool: run.over?.itemPool || null })[0]; if (it) grantRogueliteItem(run, it.id, () => {}); }
  if (outcome.draft) { // 無料ドラフト（イベント内即時）
    const host = el("roguelite-screen");
    showRogueliteDraft(host, { floor: run.floor, title: "餞別：1枚選ぶ", cards: rollDraft(run, { hpRatio: 1 }), charImages, coins: run.coins || 0, run, onPick: (card) => { if (card) applyCard(run, card); enforceGrantCap(run, () => {}); } });
  }
  enforceGrantCap(run, () => {}); // effect/cardId 経由で必殺枠が超過したら忘却モーダル
}

// 1フロア解決後の前進：階層を進め、ボス階は強制ボス、それ以外は進路2-3択（撤退も可）。
function advanceRoguelite(run) {
  run.floor += 1;
  growMaxHp(run); // 館の気脈：1フロア進むごとに最大HPを緩やかに底上げ（敵HP増加に追従＝制圧ボーナスを狙える）
  renderRoute(run);
}

// 進路選択画面を描画（フロアは進めない＝編成モーダルから戻ったときに再描画できる）。
function renderRoute(run) {
  const host = el("roguelite-screen");
  goScreen("roguelite-screen");
  // 新しい帯（10階ごと）へ踏み入った瞬間は、層(バイオーム)の入場演出を一度だけ挟む。
  const band = bandOfFloor(run.floor);
  if (run._biomeBandShown !== band) {
    const firstShow = run._biomeBandReached !== band; // この帯の宝珠を未付与なら付与（再描画では二重加算しない）
    run._biomeBandShown = band;
    let orbGain = 0;
    if (firstShow) { run._biomeBandReached = band; orbGain = orbsForBand(band); run.orbsEarned = (run.orbsEarned || 0) + orbGain; }
    enterRogueliteAmbience(); // 背景を新しい層へ切り替え
    const showBiome = () => {
      // 先見の札を持っていれば次の層を見通せる（最終帯の先は無し）。
      const nextBiome = hasForesight(run) ? biomeForBand(run.seed, band + 1, 0, run.over?.biome || null) : null;
      showRogueliteBiomeIntro(host, {
        biome: biomeOf(run), floor: run.floor, orbGain, orbTotal: run.orbsEarned || 0, nextBiome,
        // 巡りの賽を持っていれば「踏み入る」前にこの層を引き直せる（使うと消える）。
        onReshuffle: biomeDieId(run) ? () => {
          consumeBiomeDie(run);
          run.biomeRerolls = run.biomeRerolls || {};
          run.biomeRerolls[band] = (run.biomeRerolls[band] || 0) + 1;
          saveRogueliteRun(run);
          enterRogueliteAmbience();   // 引き直した層の背景へ
          showBiome();                // 新しい層で再提示（賽を使い切れば次はボタン無し）
        } : null,
        onDone: () => renderRoute(run),
      });
    };
    showBiome();
    return;
  }
  saveRogueliteRun(run); // 進路＝安全な再開チェックポイント（中断時はこの階の進路から再開）
  const held = heldBuffs(run); // 所持バフ一覧（蓄積の可視化）
  // 編成モーダル：任意のタイミングで出場順を入れ替え→閉じたら同じ進路を再描画。
  const onSwap = () => showRogueliteSwap(host, { run, charImages, onClose: () => renderRoute(run) });
  if (run.floor % 10 === 0) { // 10階ごとにボス（強制）
    // ボスの卓サイズ＝4麻 or 3麻（決定論・章で分布上書き可）。
    const bossDist = run.over?.tableSizeDist?.boss || TABLE_SIZE_DIST.boss;
    const bossSize = rollTableSize(makeRng(`${run.seed}:bosssize:${run.floor}`), bossDist);
    const bossFloor = { ...BOSS_FLOOR, tableSize: bossSize };
    showRogueliteRoute(host, { boss: true, bossTableSize: bossSize, floor: run.floor, coins: run.coins || 0, skillLevel: run.skillLevel, held, run, charImages, onSwap, onPick: () => enterFloor(run, bossFloor), onRetreat: () => finishRogueliteRun(run, { wiped: false, retreated: true }) });
    return;
  }
  // 地図の写し（道具）で引き直した回数を seed に混ぜる＝選択肢が変わる。
  const rng = makeRng(`${run.seed}:route:${run.floor}:${run.routeReroll || 0}`);
  // 序盤（2〜5階）にまだ遭遇イベントを引いていなければ、進路に1回確定で出す（物語の場を必ず体験させる）。
  const force = (!run.eventSeen && run.floor >= 2 && run.floor <= 5) ? ["event"] : [];
  // ボス直前（次が10階ごとのボス＝floor%10===9）は、休息かショップを必ず1枠出す＝整える余地を保証
  // （初ボスの「回復を引けず瀕死突入」運ゲーを緩和）。
  if (run.floor % 10 === 9) force.push(rng() < 0.5 ? "rest" : "shop");
  const routeCount = run.over?.routeCount || (run.floor <= 2 ? 2 : 3); // 章ごとに進路の選択肢数を上書き可（無指定=序盤2/以降3）
  const choices = drawFloorChoices(rng, { count: routeCount, exclude: rogueliteState.lastFloorId ? [rogueliteState.lastFloorId] : [], force, weights: floorWeightMap(run) });
  // 戦闘マスは「別マス」として 4麻/3麻/2麻 を出す（分布 6:3:1。章で上書き可）。決定論：同じ進路rngで再現。
  const battleDist = run.over?.tableSizeDist?.battle || TABLE_SIZE_DIST.battle;
  for (const ch of choices) if (ch.kind === "battle") ch.tableSize = rollTableSize(rng, battleDist);
  // 鍛冶屋マスは進路カードに「次Lvまでに必要な光貨」を表示。所持不足ならグレーアウト（選べない）。
  const fLv = run.skillLevel || 1;
  const fMaxed = fLv >= SKILL_LEVEL_CAP;
  const forgeCostNow = fMaxed ? forgeOverchargeCost(run.forgeOvercharge || 0) : forgeCost(fLv, chapterEconomy(run));
  const forgeInfo = { cost: forgeCostNow, maxed: fMaxed, lv: fLv, afford: (run.coins || 0) >= forgeCostNow };
  showRogueliteRoute(host, {
    floor: run.floor, choices, coins: run.coins || 0, skillLevel: run.skillLevel, held, run, charImages, onSwap, forgeInfo,
    onItems: () => openRogueliteItems(run), // 道具パネル
    onPick: (ft) => { rogueliteState.lastFloorId = ft.id; enterFloor(run, ft); },
    onRetreat: () => finishRogueliteRun(run, { wiped: false, retreated: true }),
  });
}

// 道具パネル（フロア選択時に使う）。使用→消費、地図の写しは進路を引き直し。閉じたら進路へ戻る。
function openRogueliteItems(run) {
  const host = el("roguelite-screen");
  showRogueliteItems(host, {
    run, charImages,
    onUse: (itemId) => {
      const res = useItem(run, itemId);
      if (res?.action === "reroll") { renderRoute(run); return; } // 引き直し＝進路を作り直す
      openRogueliteItems(run); // 使った後もパネルを開いたまま更新
    },
    onClose: () => renderRoute(run),
  });
}

// 道具を入手。スロット(3)が埋まっていれば入れ替えモーダル、空きがあれば追加。after で続行。
function grantRogueliteItem(run, itemId, after) {
  if (!itemId || !itemById(itemId)) { after?.(); return; }
  if ((run.items || []).length < ITEM_SLOTS) { run.items.push(itemId); after?.(); return; }
  const host = el("roguelite-screen");
  showRogueliteItemSwap(host, {
    current: run.items.map((id) => itemById(id)).filter(Boolean),
    incoming: itemById(itemId), slots: ITEM_SLOTS,
    onResolve: (dropId) => { // dropId=手放すアイテム（null=新アイテムを諦める）
      if (dropId) { const di = run.items.indexOf(dropId); if (di >= 0) run.items.splice(di, 1); run.items.push(itemId); }
      after?.();
    },
  });
}

// この階層の1戦を起動（ペア戦エンジン流用）。味方席へカードの付与能力＋控え能力を相乗り。
// 1戦＝1ゲーム（複数局）。1局目は必ず打ち、局終わりに追撃モーダルで続行可否を確認する（同卓・HP継続）。
// ボス階：対局前に「館の主」が立ちはだかる口上を見せてから本戦へ（提案B「ボスが覚えている」）。
// 表示するボス＝enemyUnitForFloor と同一決定論で先読み。bossTally から段階(初遭遇/再戦/雪辱)を出し分ける。
async function showBossIntroThenBattle(run, floorType) {
  const bossChars = previewBossChars(run, floorType);
  if (!bossChars.length) { launchRogueliteBattle(run, floorType); return; }
  const tally = rogueliteState?.bossTally || {};
  let bosses = bossChars.map((c) => ({
    char: c,
    line: vline(c.id, "rlBossIntro", { bossMemoryTier: bossMemoryTier(tally[c.id]) }),
  }));
  // ペア掛け合い口上（大1章S4/大2章S2）：配役2人が固有の「口火＋受け」を両方持つコンビのときだけ、
  // 個別口上を掛け合い（口火→ワンテンポ遅れて受け）へ差し替える。無ければ従来の個別口上のまま。
  // どちらが口火かは run seed で決まる（両台本を周回で使い分け）。配役キャラ編成中のモブ退避時は
  // previewBossChars が2人揃わない＝自然にフォールバック。
  let pair = false;
  if (bossChars.length === 2) {
    const rng = makeRng(`${run.seed}:pairintro:${run.floor}`);
    const [x, y] = bossChars;
    const orders = rng() < 0.5 ? [[x, y], [y, x]] : [[y, x], [x, y]];
    for (const [a, b] of orders) {
      const open = vline(a.id, "rlBossIntroPair", { pairWith: b.id, bossMemoryTier: bossMemoryTier(tally[a.id]) });
      const reply = open && vline(b.id, "rlBossIntroPairReply", { pairWith: a.id, bossMemoryTier: bossMemoryTier(tally[b.id]) });
      if (open && reply) { bosses = [{ char: a, line: open }, { char: b, line: reply }]; pair = true; break; }
    }
  }
  try { await charImages.load(bossChars.filter((c) => c && !c.isMob)); } catch { /* 画像はフォールバック */ }
  showRogueliteBossIntro(el("roguelite-screen"), {
    bosses, pair, floor: run.floor, charImages,
    onProceed: () => launchRogueliteBattle(run, floorType),
  });
}

// ボス階決着をランの bossTally へ刻み、プロフィールへ永続（提案B「ボスが覚えている」）。
// won=true=踏破（プレイヤー勝利）→w+1 / won=false=全滅→l+1。次ラン以降の口上の出し分けに効く。
function recordBossEncounter(run, won) {
  // salt 省略（=""）は本戦の enemyUnitForFloor と同一＝同じボス顔ぶれ。記録は本戦決着のみ（追撃は呼び元で除外）。
  const bosses = previewBossChars(run, rogueliteState.floorType);
  if (!bosses.length) return;
  let tally = rogueliteState.bossTally || {};
  for (const c of bosses) tally = recordBossOutcome(tally, c.id, won);
  rogueliteState.bossTally = tally;
  rlLog("bossMemory", { floor: run.floor, won, bosses: bosses.map((c) => c.id) });
  persistBossTally(tally);
}
async function persistBossTally(tally) {
  try {
    const p = await profileRepo.loadProfile();
    if (p) await profileRepo.saveProfile(withBossTally(p, tally));
  } catch { /* 永続失敗はラン内 bossTally を保持して続行 */ }
}

// 大章ボス踏破か：登っている記憶の clearFloor ボスを退けた瞬間か（既踏破かは問わない）。
//   ・clearFloor ちょうどのボス階で踏破した（追撃でない本戦）。これで「クリア＝一区切り→帰還」が毎回成立する（有限ダンジョン）。
function isChapterClearFloorWin(run) {
  if (!run || run.chapterCleared) return false;            // このランで既に踏破処理済み（多重発火防止）
  if (rogueliteState?.pursuing) return false;              // 追撃のおまけ戦では出さない（本戦の決着でのみ）
  const chap = chapterById(run.chapterId);
  if (!chap || chap.comingSoon) return false;
  return run.floor === chap.clearFloor;                    // clearFloor ちょうどのボス階で退けた時
}
// その踏破が「初回」か（初めてこの記憶を読み切った）。初回だけ次の記憶を解禁＆永続し、演出を「次が開かれた」フレームにする。
function isFirstChapterClear(run) {
  const chap = chapterById(run?.chapterId);
  if (!chap) return false;
  return !(rogueliteState?.chaptersCleared || []).includes(chap.id);
}
// 踏破を「いま」確定：このランで一度きりのフラグ＋ラン内既踏破集合＋プロフィールへ即永続。
function markChapterClearedNow(run) {
  run.chapterCleared = true;
  const chap = chapterById(run.chapterId);
  if (!chap) return;
  if (rogueliteState) {
    const cur = rogueliteState.chaptersCleared || [];
    if (!cur.includes(chap.id)) rogueliteState.chaptersCleared = [...cur, chap.id];
  }
  rlLog("chapter_cleared", { chapter: chap.id, reached: run.floor, moment: "boss" });
  persistChapterCleared(chap.id);
}
async function persistChapterCleared(chapId) {
  try {
    const p = await profileRepo.loadProfile();
    if (!p) return;
    const cur = Array.isArray(p.roguelite?.chaptersCleared) ? p.roguelite.chaptersCleared : [];
    if (cur.includes(chapId)) return;
    p.roguelite = { ...(p.roguelite || {}), chaptersCleared: [...cur, chapId] };
    await profileRepo.saveProfile(p);
  } catch { /* 永続失敗は finishRogueliteRun の reached>=clearFloor が拾う（冪等） */ }
}

// 章の記憶ビート（紙芝居・提案Bナラティブ層）：配役ボス階の本戦を退けた直後、未読なら1本返す。
// 発火条件＝ボス階×本戦（追撃でない）×勝利（呼び元で runWiped 判定後）×初回（beatsSeen 未収載）。
function pendingChapterBeat(run) {
  if (rogueliteState?.floorType?.enemy !== "boss" || rogueliteState?.pursuing) return null;
  const beat = beatForFloor(run.chapterId, run.floor);
  if (!beat) return null;
  if ((rogueliteState?.beatsSeen || []).includes(beat.id)) return null;
  return beat;
}
// 既読化＝観終わったときに刻む（途中でブラウザが落ちたら次回また観られる＝物語を取りこぼさない側に倒す）。
function markBeatSeenNow(beatId) {
  if (rogueliteState) {
    const cur = rogueliteState.beatsSeen || [];
    if (!cur.includes(beatId)) rogueliteState.beatsSeen = [...cur, beatId];
  }
  rlLog("beat_seen", { beat: beatId });
  persistBeatSeen(beatId);
}
async function persistBeatSeen(beatId) {
  try {
    const p = await profileRepo.loadProfile();
    if (!p) return;
    const cur = Array.isArray(p.roguelite?.beatsSeen) ? p.roguelite.beatsSeen : [];
    if (cur.includes(beatId)) return;
    p.roguelite = { ...(p.roguelite || {}), beatsSeen: [...cur, beatId] };
    await profileRepo.saveProfile(p);
  } catch { /* 永続失敗＝次回また観られるだけ（既読ロストで物語は失わない） */ }
}

async function launchRogueliteBattle(run, floorType, opts = {}) {
  // 外枠：通常＝東風＋局数上限で短く決着。ボス＝勝ち抜くまで終わらない（2026-07-11 ディレクション）：
  //   風の外枠を実質無効化（99）し、決着は「HPで上回って締める／撤退（全滅と同じ）／トビ」のみ。
  //   局数上限はマスタ（boss.baseHands=99）が担う＝毎局の追撃モーダルがループの主役になる。
  const bossRule = floorType?.enemy === "boss";
  teamBattleData = null; humanIndex = 0; selectedRounds = bossRule ? 99 : 1;
  rogueliteState.pursuing = false;
  rogueliteState.bossYield = false; // ボス戦の「撤退（全滅と同じ）」選択フラグ（局終わりモーダルで立てる）
  // 1戦＝1ゲーム（1局目は必ず打ち、以降は局終わりの追撃モーダルで続行可否を確認）。maxHands は上限。
  rogueliteHandLimit = handsForType(floorType, floorOverride(run, floorType.id)); // 章ごとに局数上限を上書き可
  // 卓サイズ（4=ペア2v2 / 3=三麻ソロ1v2 / 2=二麻ソロ1v1）。
  const tableSize = floorType?.tableSize || 4;
  rogueliteState.tableSize = tableSize;
  const solo = isSoloTable(tableSize);
  const enemyCount = solo ? tableSize - 1 : 2; // 三麻=2敵 / 二麻=1敵 / ペア=2敵
  const armed = !!rogueliteState.armed; // 出陣編成で「能力を使って打つ」を選んだか
  // 着卓する味方：ペア=上から生存2人 / ソロ=上から生存1人（先頭=あなた優先）。
  const allies = solo
    ? [partyOrder(run).find((m) => m.hp > 0) || run.party[0]]
    : seatedAllies(run);
  rogueliteState.seated = allies; // 決着時にこの味方へHPを戻す（同定）
  const allySeatList = solo ? [0] : [0, 2]; // 味方が座る席
  rogueliteState.allySeats = allySeatList;
  // 道具の「次の1戦だけ」効果を取り出す（追撃＝同一ゲーム内なので戦の頭で1回だけ）。
  rogueliteState.battleMods = takeNextBattle(run);
  const battleMods = rogueliteState.battleMods || {};
  rogueliteState.enduredSeats = new Set(); // 不屈：致命回避を使った席（各メンバー1回）
  rogueliteState.yakumanThisBattle = false; // この戦で味方が役満を和了したか（踏破でご祝儀＝オールレジェ）
  const enemy = enemyUnitForFloor(run, floorType);
  // 弱体の札：次戦だけ敵の初期HPを下げる。
  if (battleMods.enemyHpMul && battleMods.enemyHpMul !== 1) {
    for (const mm of enemy.members) mm.stats.startingPoints = Math.max(1, Math.round(mm.stats.startingPoints * battleMods.enemyHpMul));
  }
  // 味方チャラは hpMax をHPボードの満タン基準にするため stats.startingPoints を複製して上書き。
  // 奈落など層の hpMul は「この帯の対局だけ」HP上限を縮める（run.party.hpMax は不変＝抜ければ回復で戻る）。
  const biomeHpMul = biomeMods(run).hpMul || 1;
  const allyMaxOf = (m) => Math.max(1, Math.round(m.hpMax * biomeHpMul));
  const allyChar = (m) => ({ ...m.char, stats: { ...(m.char.stats || {}), startingPoints: allyMaxOf(m) } });
  const enemyChars = enemy.members.slice(0, enemyCount);
  // 席並び・役割・グループを卓サイズで決める。ソロは「1人グループ×N」（pairBattleData を一般化して流用）。
  let order, seatRoles, pairs, pairOf;
  if (solo) {
    order = [allyChar(allies[0]), ...enemyChars]; // [あなた, 敵A(, 敵B)]
    seatRoles = order.map((_, i) => (i === 0 ? "ally" : "enemy"));
    pairs = order.map((_, i) => ({ seats: [i] }));
    pairOf = order.map((_, i) => i);
  } else {
    const a0 = allyChar(allies[0]);
    const a1 = allies[1] === allies[0]
      ? { ...allyChar(allies[0]), id: allies[0].char.id + "#2" } // ソロPTは影武者（同ステの2人目）
      : allyChar(allies[1]);
    order = [a0, enemyChars[0], a1, enemyChars[1]]; // 席: 0=あなた / 1=敵A / 2=相棒 / 3=敵B
    seatRoles = ["ally", "enemy", "ally", "enemy"];
    pairs = [{ seats: [0, 2] }, { seats: [1, 3] }];
    pairOf = [0, 1, 0, 1];
  }
  await charImages.load(order.filter((c) => !c.isMob));
  const seated = order.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  // 味方席の能力：武装(armed)時のみ「固有能力＋ストックした必殺技」を注入。非武装は能力なしで打つ
  //   （能力・必殺技・相方指示すべて無効＝「能力の源」を温存した対局）。二日酔いも封印。
  const stockedIds = armed ? (run.mods.grantedAbilityIds || []) : [];
  allies.forEach((m, k) => {
    const seatIdx = allySeatList[k];
    if (seatIdx == null) return;
    if (!armed || m.hungover) { seated[seatIdx].abilities = []; return; }
    const abilities = [];
    for (const a of (m.char.abilities || [])) { const ab = skilledAbility(a.abilityId, a.params, run.skillLevel); if (ab) abilities.push(ab); }
    for (const abId of stockedIds) { const ab = skilledAbility(abId, {}, run.skillLevel); if (ab) abilities.push(ab); }
    seated[seatIdx].abilities = abilities;
  });
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  // 層でHP上限が縮むときは、出場HPもその上限までクランプ（満タン超過を防ぐ）。
  const hp = order.map((c, i) => {
    if (seatRoles[i] === "enemy") return c.stats.startingPoints;
    const m = allies[allySeatList.indexOf(i)];
    return Math.min(m.hp, allyMaxOf(m));
  });
  pairBattleData = {
    pairOf, pairs, chars: order, hp: [...hp],
    pairScore: pairs.map((p) => p.seats.reduce((a, s) => a + hp[s], 0)),
    isRoguelite: true, solo, tableSize, seatRoles, floor: run.floor, enemy,
  };
  honestCtx = { isRoguelite: true, onResult: (result) => onRogueliteBattleEnd(result), matchLabel: `第${run.floor}階` };
  honestAutoPlay = rogueliteAutoPref(); // オート設定を保持＝毎戦ONにし直さなくてよい
  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated, humanIndex, mode: { rounds: selectedRounds, players: order.length }, dealerIndex, audio,
    pairs: solo ? null : pairBattleData.pairs.map((p) => ({ seats: p.seats, chars: p.seats.map((s) => order[s]) })),
    tournament: { name: `第 ${run.floor} 階`, section: enemy.label },
    onComplete: () => beginGame(seated, dealerIndex),
  });
}

// 1戦の決着 → HPを run へ戻し、踏破ならバフドラフト→（追撃 or 前進）。全員トビでラン終了。
function onRogueliteBattleEnd(result) {
  const run = rogueliteState?.run; if (!run) return;
  // 制圧判定（pairBattleData を消す前に確保）。役割配列で味方/敵を合算＝卓サイズに依らず一般化。
  const roles = pairBattleData?.seatRoles || ["ally", "enemy", "ally", "enemy"];
  const hpArr = pairBattleData?.hp || [];
  const solo = !!pairBattleData?.solo;
  const allyEndHp = roles.reduce((a, ro, i) => a + (ro === "ally" ? (hpArr[i] ?? 0) : 0), 0);
  const enemyEndHp = roles.reduce((a, ro, i) => a + (ro === "enemy" ? (hpArr[i] ?? 0) : 0), 0);
  const enemyTopHp = roles.reduce((a, ro, i) => (ro === "enemy" ? Math.max(a, hpArr[i] ?? 0) : a), 0);
  const dominated = allyEndHp > enemyEndHp; // 自パーティのHP合計が相手を上回って決着したか（計測ログ用）
  // ボスの卓（2026-07-11 ディレクション）＝勝ち抜くまで終わらない：劣勢のまま締める道が無いので
  // 点負けペナルティ（競り負け/ソロ着順）はボス戦では発生しない（勝ち抜け or 撤退=全滅と同じ or トビ）。
  const isBossFight = rogueliteState?.floorType?.enemy === "boss";
  // 点負け：ペア=合計HPで競り負け / ソロ=「着順」で段階ペナルティ（1位=無傷・下位ほど痛い）。
  //   ソロ着順 = 1 + 自分よりHPが多い敵の数（同点は自分を上位扱い＝1位なら無傷）。
  const soloRank = solo ? 1 + roles.reduce((a, ro, i) => a + (ro === "enemy" && (hpArr[i] ?? 0) > (hpArr[0] ?? 0) ? 1 : 0), 0) : 0;
  const penaltyFrac = isBossFight ? 0 : solo
    ? (ROGUELITE_SOLO_PENALTY[pairBattleData?.tableSize]?.[soloRank] || 0)
    : ROGUELITE_HP_LOSS_PENALTY_FRAC;
  const outHpRace = isBossFight ? false : solo ? (penaltyFrac > 0) : (allyEndHp < enemyEndHp);
  // 競り守りの護符（trigger/on=hpRace）：点負けの痛手をラン中1回だけ無効化。持っていれば自動発動して消える。
  const warded = outHpRace && consumeHpRaceSaver(run);
  const applyPenalty = outHpRace && !warded; // 実際にペナルティを与えるか（護符で防げば与えない）
  // 着卓していた味方へHPを戻す（同定）。allySeats=味方の座席。ペアの影武者(同一参照×2席)は低い方を採用。
  const seated = rogueliteState?.seated || seatedAllies(run);
  const allySeats = rogueliteState?.allySeats || [0, 2];
  if (seated.length >= 2 && seated[1] === seated[0]) {
    seated[0].hp = Math.max(0, Math.min(hpArr[allySeats[0]] ?? seated[0].hp, hpArr[allySeats[1]] ?? seated[0].hp));
  } else {
    seated.forEach((m, k) => { m.hp = Math.max(0, hpArr[allySeats[k]] ?? m.hp); });
  }
  // 二日酔いは着卓した味方ぶん、この1戦で解除。
  for (const m of seated) m.hungover = false;
  rogueliteState.battleMods = null; rogueliteState.enduredSeats = null; // 「次の1戦だけ」効果は終了
  pairBattleData = null; honestCtx = null;
  // ボス戦の撤退（2026-07-11）：劣勢のまま「撤退する」を選んだ＝ラン終了（全滅と同じ重さ・持ち帰り無し）。
  // 挑んだ記録はボスが覚えている（敗北として刻む＝次回は雪辱口上）。HPの書き戻しは済んでいる。
  if (isBossFight && rogueliteState.bossYield) {
    rogueliteState.bossYield = false;
    recordBossEncounter(run, false);
    rlLog("boss_yield", { floor: run.floor });
    finishRogueliteRun(run, { wiped: true }); // 撤退＝全滅扱い（ディレクション確定・0枠）
    return;
  }
  // 合計HP敗北ペナルティ対象（着卓2人・生存のみ）。被弾演出は #game-screen がまだ可視のうちに出す。
  // ── #damage-overlay は #game-screen の子。先に roguelite 画面へ切り替えると display:none の中に
  //    入り、「SEだけ鳴って何も見えない・HPも減って見えない」状態になる（過去はそれで全回復に見えた）。
  const seatedPenTargets = [...new Set(seated)].filter((m) => m && m.hp > 0); // 着卓2人（ソロは重複排除）・生存のみ
  const penTargets = applyPenalty
    ? seatedPenTargets.map((m) => ({ m, before: m.hp, after: Math.max(0, m.hp - Math.round(m.hpMax * penaltyFrac)) }))
    : [];
  // 競り負けでダメージを受けた着卓2人は、この1戦の踏破回復から除外（ペナルティを直後の回復で打ち消さない）。
  // ※ さもないと「ペナルティ20%」を直後の踏破回復(最大41%超)が打ち消し、競り負けたのに全回復して見える。
  const regenSkip = penTargets.length ? new Set(penTargets.map((t) => t.m)) : null;
  // 決着後の本処理（roguelite画面へ戻し→ボス記憶→全滅判定→回復→光貨→ドラフト）。合計HP敗北の被弾演出を
  // 挟む場合は、その演出を閉じてから（＝ペナルティをデータ確定してから）呼ぶ。
  const proceedAfterBattle = () => {
  const host = el("roguelite-screen");
  goScreen("roguelite-screen");
  enterRogueliteAmbience(); // 専用背景＋探索BGMへ復帰（対局中の in-game BGM から戻す）
  // ボス記憶（提案B）：本戦（追撃でない）のボス階決着を通算勝敗へ刻む。勝敗＝全滅でなく踏破できたか。
  if (rogueliteState.floorType?.enemy === "boss" && !rogueliteState.pursuing) recordBossEncounter(run, !runWiped(run));
  // ゲームオーバー＝生存メンバーが1人以下（2人で着卓できない）。残り2人以上なら踏破（次の階へ）。
  if (runWiped(run)) { finishRogueliteRun(run, { wiped: true }); return; }
  run.cleared += 1;
  // 踏破で部分回復。回復量は「戦いの質」でスケール＝圧勝/撃破はしっかり回復、辛勝は
  // ほぼ回復せず手負いのまま次へ（survive=前進は維持しつつ、毎戦の出来に緊張感を持たせる）。
  // トんだ(hp<=0)メンバーは回復しない＝復活させない（脱落はランを通して継続）。
  const perf = Math.max(0.25, Math.min(1.3, 0.25 + (result.hpRatio ?? 0.5) * 0.85 + (result.koAny ? 0.25 : 0)));
  const regenMul = biomeMods(run).regenMul || 1; // 温泉郷など層で回復量UP
  const regenFrac = run.tuning?.regenFrac ?? REGEN_FRAC; // 大章ごとに踏破回復を上書きできる（無指定=グローバル既定）
  for (const m of run.party) {
    if (m.hp <= 0 || regenSkip?.has(m)) continue; // トんだメンバー＋競り負けペナルティを受けた着卓2人は回復しない
    m.hp = Math.min(m.hpMax, m.hp + Math.round(m.hpMax * regenFrac * perf * regenMul));
  }
  // 光貨を獲得（深いほど・強敵/ボス/撃破/追撃で増す。賭場勝利は2倍）。
  const isGamble = !!rogueliteState.gamble; rogueliteState.gamble = false;
  const pursued = (result.handsPlayed || 1) > 1; // 1局で締めず追撃して複数局打ったか＝実入り上乗せ
  let coins = coinsForClear({ floor: run.floor, kind: rogueliteState.floorType?.enemy || "mob", ko: !!result.koAny, pursue: pursued, econ: chapterEconomy(run) });
  if (isGamble) coins *= 2;
  // ※ 旧「制圧ボーナス」（合計HPで勝つと光貨上乗せ＋レア度UP）は撤廃。HPで勝つ意義は
  //   「ボーナスを得る」ではなく「ペナルティ（合計HP敗北で全員30%ダメージ）を避ける」側へ反転した。
  coins = Math.round(coins * itemMods(run).coinMul * (biomeMods(run).coinMul || 1)); // 商人の天秤（道具）＋層(祭/崩落)で光貨↑
  run.coins = (run.coins || 0) + coins;
  // 役満ご祝儀：味方が役満を和了して踏破したら、ドラフトをオールレジェンダリーに。
  const yakuman = !!rogueliteState.yakumanThisBattle; rogueliteState.yakumanThisBattle = false;
  rlLog("clear", { floor: run.floor, biome: biomeOf(run)?.id, ko: !!result.koAny, hpRatio: +(result.hpRatio ?? 0).toFixed(2), dominated, warded, yakuman, gamble: isGamble, pursue: pursued, coins, ...rlBuffSnap(run) });
  // 賭場勝利は高レア確定気味。通常は ko/HP/追撃でバイアス。ご祝儀は全レジェ。
  const cards = yakuman
    ? rollDraft(run, { allLegendary: true })
    : isGamble
      ? rollDraft(run, { bias: 1, hpRatio: 1 })
      : rollDraft(run, { ko: !!result.koAny || pursued, hpRatio: result.hpRatio ?? 0.5 });
  const showDraft = () => showRogueliteDraft(host, {
    floor: run.floor, cards, charImages, coins: run.coins || 0, run,
    bonus: yakuman
      ? { label: "役満ご祝儀", note: "役満を決めて踏破！ オールレジェンダリーの大盤振る舞い" }
      // 競り守りの護符が割れて点負けの痛手を防いだら、その旨を明示（HPが減らない理由を legible に）。
      : warded ? { label: "競り守り", note: "競り守りの護符が割れ、競り負けの痛手を防いだ。" }
      : null,
    // 合計HPで競り負けたら被弾を明示（次画面でHPバーが下がる理由を legible に）。割合は定数に追従。
    penalty: applyPenalty ? { label: solo ? `${soloRank}位` : "競り負け", note: `${solo ? `${soloRank}位で決着` : "合計HPで及ばず"} — 着卓していた味方に 最大HPの${Math.round(penaltyFrac * 100)}%ダメージ` } : null,
    onPick: (card) => {
      // 計測（P9）：提示3枚(offered)と選択(picked)を必ず記録＝offlineで「カード別pick率」を出せる。
      // 提示時に未取得カードを把握 → 選ばれた率を見て「居場所のないカード(pick率が極端に低い)」を炙る。
      rlLog("buff", {
        floor: run.floor, biome: biomeOf(run)?.id,
        offered: cards.map((c) => c.id), picked: card?.id ?? null, skipped: !card,
        card: card?.id ?? null, rarity: card?.rarity ?? null, kind: card?.effect?.kind ?? null,
        cluster: card ? clusterOf(card) : null, jackpot: yakuman,
      });
      const lvlUp = card ? clusterLevelUp(run, card) : null; // 取得前に段越えを判定（②演出）
      if (card) { applyCard(run, card); rogueliteSpeak("rlBuff", { buffFamily: cardFamily(card) }); }
      // 追撃は「対局中（局終わり）」に確認済み。ここでは戦果（ドラフト）を確定して前進するだけ。
      const proceed = () => enforceGrantCap(run, () => advanceRoguelite(run));
      // 流派が一段上がったら演出モーダルを挟んでから先へ（閉じたら proceed）。
      if (lvlUp) showRogueliteClusterLevelUp(host, { items: [lvlUp], onClose: proceed });
      else proceed();
    },
  });
  // 大章 踏破モーメント（提案B §3.1 ＋ ディレクション 2026-06-27）：clearFloor の主（大章ボス）を初めて退けたら、
  //   そこで「クリアで一区切り」＝盛大な踏破演出 → ランを締めて拠点へ帰還する（大章＝完走できる有限ダンジョン）。
  //   ※ F10/F20 等の中ボスは clearFloor でない＝この分岐に入らず、通常どおりドラフトして登り続ける。
  // 踏破の確定は「勝った瞬間」に前倒しで行う（2026-07-11 修正）：従来は帰還ボタン到達まで
  //   finishRogueliteRun（＝一時セーブ削除）が呼ばれず、ビート/踏破演出の途中で離脱すると出陣時の
  //   F=clearFloor セーブが残り「踏破後なのに『続きから？』の再開モーダルが出る」矛盾があった。
  //   勝負が決した時点で ①踏破・次章解禁を即永続 ②一時セーブを破棄（再開に意味がない＝帰還のみ）。
  //   ※途中離脱時はラン終端の持ち帰り（carry/宝珠 commit）だけが失われるが、全滅0枠と同等の軽い損＝許容。
  const chapterClearWin = isChapterClearFloorWin(run);
  const firstClear = chapterClearWin && isFirstChapterClear(run); // markChapterClearedNow が集合を書き換える前に判定
  if (chapterClearWin) {
    if (firstClear) markChapterClearedNow(run);      // chaptersCleared へ即永続（次章解禁）
    else run.chapterCleared = true;                  // 既踏破の章でも多重発火は防ぐ（ランフラグ）
    clearSavedRogueliteRun();
  }
  const afterBeat = () => {
  if (chapterClearWin) {
    const chap = chapterById(run.chapterId);
    const lead = rlLead();
    showRogueliteChapterClear(host, {
      chapter: chap, floor: run.floor, leadChar: lead,
      leadLine: lead ? vline(lead.id, "rlChapterClear", { ...rlVoiceCtx(), rlChapter: run.chapterId }) : null,
      nextChapter: firstClear ? nextChapterAfter(chap?.id) : null, // 再踏破では「次が開かれた」と偽らない
      cleared: true, // クリアで帰還＝CTAを「帰還する」に（続行でなく一区切り）
      onProceed: () => finishRogueliteRun(run, { cleared: true }), // 踏破＝ランを締めて結果画面→拠点へ
    });
  } else {
    showDraft();
  }
  };
  // 記憶ビート（提案Bナラティブ層）：配役ボス階の本戦を初めて退けたら、短い群像シーン（紙芝居）を
  // 一度だけ挟む（B1=F10/B2=F20/B3=F30）。B3 は踏破演出の前＝物語の答え→「踏 破」印の順。
  // 既読・章外・追撃・通常階は素通り（従来フロー不変）。
  const beat = pendingChapterBeat(run);
  if (beat) {
    showScreen("scenario-screen");
    playScenario(null, {
      audio, lines: beat.lines,
      onEnd: () => {
        markBeatSeenNow(beat.id);           // 観終わってから既読（途中離脱は次回また観られる）
        goScreen("roguelite-screen");
        enterRogueliteAmbience();           // 紙芝居のBGM/背景から館のアンビエンスへ復帰
        afterBeat();
      },
    });
  } else {
    afterBeat();
  }
  }; // ← proceedAfterBattle ここまで

  // 合計HPで競り負けたら、その卓で打っていた着卓2人だけ最大HPの一定割合ダメージ。控え（卓外）は対象外。
  // インゲーム同様の被弾演出（HPバー減少＋赤い被ダメ数字＋撃沈スタンプ＋揺れ＋SE）を #game-screen 上で
  // 見せ、閉じたらダメージを確定して本処理（画面切替→踏破処理）へ。撃墜あり・救済なし＝この一撃で残り
  // 1人以下になれば proceedAfterBattle 内の全滅判定でラン終了。
  if (penTargets.length) {
    showRoguelitePenaltyFx({ targets: penTargets, onDone: () => { for (const t of penTargets) t.m.hp = t.after; proceedAfterBattle(); } });
  } else {
    proceedAfterBattle();
  }
}

// ラン終了（撤退＝報酬確保で帰還／全滅＝没収）。最深到達階層を保存し、獲得バフから
// 引き継ぎ枠ぶんを選ばせて次ランへ持ち越す（ローグライク・累積しない）。
// 到達階層＝フロア番号：全滅は死んだ階(run.floor)、撤退は1つ手前(まだ入っていない次の階の手前)。
// 双方向2択（提案B §3.2-5）：別れ際にプレイヤーが返した手（climb/rest）の通算をプロフィールへ。
// 「また登る(climb)」の積み重ねが rlVoiceCtx.rlResolveClimb として次ラン以降の相棒セリフに効く（覚える）。
async function persistRogueliteResolve(choiceId) {
  if (choiceId !== "climb" && choiceId !== "rest") return;
  try {
    const p = await profileRepo.loadProfile();
    if (!p) return;
    const resolve = { climb: 0, rest: 0, ...(p.roguelite?.resolve || {}) };
    resolve[choiceId] = (resolve[choiceId] || 0) + 1;
    p.roguelite = { ...(p.roguelite || {}), resolve };
    await profileRepo.saveProfile(p);
  } catch { /* 永続失敗は次ランに反映されないだけ */ }
}

async function finishRogueliteRun(run, { wiped = false, retreated = false, cleared = false } = {}) {
  // 計測（P9）：終了時に最終ビルド全カードを記録＝offlineで「勝利ビルド出現率」(到達深度別にどのカード/流派が残るか)を出せる。
  rlLog("run_end", { depth: run.floor, result: cleared ? "cleared" : wiped ? "wiped" : (retreated ? "retreat" : "end"), cleared: run.cleared, cardIds: [...(run.cards || [])], ...rlBuffSnap(run) });
  flushRlLog(); // ラン終端でSupabaseへ送信（取りこぼし低減）
  clearSavedRogueliteRun(); // クリア/撤退/全滅でラン終了＝一時セーブを削除（再開は出さない）
  // 到達階層＝全滅は死んだ階(run.floor)、クリアは退けた大章ボスの階(run.floor)、撤退は1つ手前。別れ際セリフの見守り(P8)にも使う。
  const reached = (wiped || cleared) ? run.floor : Math.max(1, run.floor - 1);
  // 先頭キャラの別れ際の一言（rogueliteState を消す前に解決）。
  //   全滅＝罰でなく「塔から記憶として弾かれた」継続(P7)＝専用 rlWipe で前向きに送り出す（matchEnd の敗北弁は使わない）。
  //   撤退/クリア＝引く/読み切った判断への“返し”。どちらも到達深度(rlReached)を渡し、浅くても言葉が出る見守り(P8)。
  //   ※クリアの感情の山は踏破演出(rlChapterClear)で済んでいる＝結果画面は持ち帰り(rlRetreat)の落ち着いた返しでよい。
  const lead = rlLead();
  const partingLine = lead ? vline(lead.id, (retreated || cleared) ? "rlRetreat" : "rlWipe", { ...rlVoiceCtx(), rlReached: reached }) : null;
  let profile = null;
  try { profile = await profileRepo.loadProfile(); } catch { /* 保存できなくても結果は見せる */ }
  const prev = profile?.roguelite || { bestFloor: 0, runs: 0, carry: [] };
  const best = Math.max(prev.bestFloor || 0, reached);
  // 共闘ボーナス：楼光の館で一緒に戦った分だけ、パーティ各員と少しだけ絆が深まる。
  // フリー対戦(1位=12exp/局)より控えめ＝1踏破=2exp・1ラン上限24（連勝/着順履歴には触れない）。
  const coFightExp = Math.min(24, 2 * (run.cleared || 0));
  // アカウント通貨「宝珠」：このランの稼ぎを口座へ commit（misc jsonb に自動永続）。用途は別途。
  const orbsEarned = run.orbsEarned || 0;
  const orbsTotal = (profile?.orbs || 0) + orbsEarned;
  // ボス記憶（提案B）：ラン内で最新化した bossTally を保全（mid-runのpersistと競合しても上書きで失わない）。
  const liveBossTally = rogueliteState?.bossTally ?? prev.bossTally ?? {};
  // 記憶ビート既読も同様にラン内の最新値を保全（mid-run persist の非同期完了を待たない）。
  const liveBeatsSeen = rogueliteState?.beatsSeen ?? prev.beatsSeen ?? [];
  // 撤退癖（提案B スライス2）：撤退で帰還したランだけ通算撤退回数を+1（相棒のセリフ ctx rlRetreatHabit の源）。
  const nextRetreats = (prev.retreats || 0) + (retreated ? 1 : 0);
  // 大章の解禁（提案B §3.1 ①）：登っていた記憶の踏破階(clearFloor)に届いていれば、その章を踏破済へ。
  // → 次の記憶が選択ハブで開く（解禁ツリー）。P8厳守＝物語フラグでなく「選択の解禁」のみ。
  const chap = chapterById(run.chapterId);
  const prevCleared = Array.isArray(prev.chaptersCleared) ? prev.chaptersCleared : [];
  // 章踏破の冪等バックアップ（本判定は勝利の瞬間の markChapterClearedNow）。⚠ 敗北を除外すること：
  // ボスは常に clearFloor に立つため、reached だけ見ると「大章ボスに撤退/全滅しても解禁」の裏抜けになる
  // （2026-07-11 QA検出。必勝制で撤退が身近になり顕在化）。wiped=負け（全滅/ボス撤退）は解禁しない。
  const nextCleared = (chap && !wiped && reached >= chap.clearFloor && !prevCleared.includes(chap.id))
    ? [...prevCleared, chap.id] : prevCleared;
  if (nextCleared !== prevCleared) rlLog("chapter_cleared", { chapter: chap.id, reached });
  // 進捗（到達・通算）は即保存（離脱しても失わない）。引き継ぎは選択後に上書き。
  if (profile) {
    // chaptersUnlocked（宝珠先行解禁）/ resolve（双方向2択の通算）はこのランで触らないが、明示構築のため必ず引き継ぐ（ドロップ防止）。
    let next = { ...profile, orbs: orbsTotal, roguelite: { bestFloor: best, runs: (prev.runs || 0) + 1, carry: prev.carry || [], bossTally: liveBossTally, retreats: nextRetreats, chaptersCleared: nextCleared, chaptersUnlocked: prev.chaptersUnlocked || [], resolve: prev.resolve || { climb: 0, rest: 0 }, beatsSeen: liveBeatsSeen } };
    if (coFightExp > 0) for (const m of run.party) next = addCompanionBondExp(next, m.char?.id || m.id, coFightExp);
    try { await profileRepo.saveProfile(next); } catch { /* 保存失敗は無視 */ }
  }
  rogueliteState = null;
  // 持ち帰り枠（ディレクション指定）：全滅＝0枠（何も持ち帰れない）／道中帰還（撤退）＝1枠／踏破＝2枠。
  const slots = wiped ? 0 : retreated ? 1 : 2;
  // 獲得バフ（ユニーク）を引き継ぎ候補に。
  const acquired = [...new Set(run.cards)].map((id) => cardById(id)).filter(Boolean);
  // 双方向＝プレイヤーが返す2択（提案B §3.2-5）。「また登る/今は休む」を選ぶと相棒が返し、その手をキャラが覚える。
  showRogueliteGameOver(el("roguelite-screen"), {
    reached, wiped, retreated, cleared, bestFloor: best,
    orbsEarned, orbsTotal, // アカウント通貨「宝珠」：今回の獲得＋口座残高
    carrySlots: slots, acquired, partingLine, speakerChar: lead, charImages,
    bondDeepened: coFightExp > 0, // 共闘で絆が少し深まった（数値は見せない）
    partyChars: run.party.map((m) => m.char).filter(Boolean),
    resolveChoices: lead ? [{ id: "climb", label: "また登る" }, { id: "rest", label: "今は休む" }] : [],
    onResolve: (choiceId) => { // 選択を永続（覚える）＋相棒の返しを同期で返す（rogueliteState は既に null なので vline を直接）
      persistRogueliteResolve(choiceId);
      return lead ? vline(lead.id, "rlResolve", { resolveChoice: choiceId }) : null;
    },
    onClose: async (selectedIds) => {
      const carry = (selectedIds || []).slice(0, slots);
      try {
        const p = (await profileRepo.loadProfile()) || profile;
        if (p) {
          // 直前の roguelite 保存が失敗していても、ラン内で確定した記録を必ず保全（bossTally/retreats/章解禁）。
          p.roguelite = {
            ...(p.roguelite || { bestFloor: best, runs: 1 }), carry,
            bossTally: p.roguelite?.bossTally ?? liveBossTally,
            retreats: p.roguelite?.retreats ?? nextRetreats,
            chaptersCleared: p.roguelite?.chaptersCleared ?? nextCleared,
            beatsSeen: p.roguelite?.beatsSeen ?? liveBeatsSeen,
          };
          await profileRepo.saveProfile(p);
        }
      } catch { /* 保存失敗は次ランで引き継がれないだけ */ }
      openRoguelite();
    },
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

// 1節ぶんの結果を累積へ反映する採点（手動・オート観戦・一気進行が共通で使う）。
// 採点（点棒＝HP）：素点＝(最終−自分の開始HP)/1000。ウマは「その節の増減順位」で配る
//（＝育成は持ち点の厚み＝攻めの余裕/トビにくさとして効き、宝は打ち回しの累積で決まる）。
function applySectionResult(run, t, result) {
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
    const pt = simAbsentLeaguePt(t.uma, run.strengthById?.[u.id] ?? 0, run.fieldAvgStrength ?? 0);
    run.totals[u.id] = (run.totals[u.id] || 0) + pt;
    deltaById[u.id] = pt;
  }
  // この節の自分の結果（節内順位・獲得ptの内訳）。順位表の見出しで真っ先に見せる。
  const myIdx = seated.findIndex((s) => s.id === run.deshiUnitId || s.isHuman);
  const sectionResult = myIdx < 0 ? null : {
    place: myIdx + 1, of: seated.length,
    net: seated[myIdx].net, uma: t.uma[myIdx] ?? 0,
    pt: deltaById[run.deshiUnitId] ?? 0,
  };
  run.matchIndex += 1;
  return { deltaById, sectionResult };
}

async function onTournamentMatchDone(result) {
  const run = tournamentRun; const t = run.t;
  const { deltaById, sectionResult } = applySectionResult(run, t, result);
  const finished = run.matchIndex >= t.matches;
  const ranked = Object.keys(run.totals).sort((a, b) => run.totals[b] - run.totals[a]);
  // 節間：まず「この節の得点推移グラフ」を自動表示 → 閉じると累積順位表へ。
  const showStandings = () => showTournamentStandings(run, { ranked, deltaById, sectionResult, finished, entrants: t.entrants, sectionLabel: `第 ${run.matchIndex} / ${t.matches} 節` }, async (action) => {
    if (finished || action === "retreat") {
      const finalRank = ranked.findIndex((id) => id === run.deshiUnitId);
      let cur = await profileRepo.loadProfile();
      // 因縁の蓄積：このリーグを共にしたネームド全員と「会った」。最終順位でこちらが上なら beaten。
      const myPos = ranked.indexOf(run.deshiUnitId);
      cur = recordRivalEncounters(cur, run.units.filter((u) => u.isRival).map((u) => ({
        id: String(u.id).replace(/^rival:/, ""),
        beaten: myPos >= 0 && myPos < ranked.indexOf(u.id),
      })));
      const beforeTreasures = (cur.records?.treasures || []).length;
      const res = applyLeagueResult(cur, t, finalRank, action === "retreat");
      let np = res.profile;
      const leagueAv = activeAvatar(np);
      const afterTreasures = (np.records?.treasures || []).length;
      if (leagueAv?.mentorCharacterId) np = applyMatchToCompanion(np, { companionId: leagueAv.mentorCharacterId, placement: res.finalRank, numPlayers: t.rankByPlace?.length ?? 4, styleTags: [], treasureJustCleared: beforeTreasures < 9 && afterTreasures >= 9 });
      await profileRepo.saveProfile(np);
      const standings = ranked.map((id, i) => ({ name: run.names[id], pt: run.totals[id], isHuman: id === run.deshiUnitId, place: i + 1 }));
      // 宝獲得＝異能段位の昇段。獲得後の宝数から段位を引いて演出に渡す。
      const treasureCount = res.profile.records?.treasures?.length || 0;
      const rankUp = res.won ? treasureRankFor(treasureCount) : null;
      tournamentRun = null;
      openMentorHome({ league: { name: t.name, treasure: t.treasure, finalRank: res.finalRank, won: res.won, rank: res.rank, meta: res.meta, soul: res.soul, retreated: res.retreated, exp: res.exp, bond: res.bond, standings, rankUp } });
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
  // この節の自分の結果＝順位表の最上段で即答する（何位で・何pt稼いだ/失ったか）。
  const sr = info.sectionResult;
  const srHtml = sr ? `
      <div class="ts-secres ${sr.pt >= 0 ? "up" : "dn"}">
        <span class="ts-sr-lab">この節のあなた</span>
        <b class="ts-sr-place">${sr.place}<small>位</small><span class="ts-sr-of">/${sr.of}</span></b>
        <b class="ts-sr-pt">${sr.pt >= 0 ? "+" : ""}${sr.pt}<small>pt</small></b>
        <span class="ts-sr-detail">素点 ${sr.net >= 0 ? "+" : ""}${sr.net} ／ 順位点 ${sr.uma >= 0 ? "+" : ""}${sr.uma}</span>
      </div>` : "";
  ov.innerHTML = `
    <div class="ts-scrim"></div>
    <div class="ts-card">
      <div class="ts-head">大会 順位表 <small>${esc(info.sectionLabel)}</small></div>
      ${srHtml}
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
    // エピローグ読了後はスタッフロールを挟む（読み返しでも流れる＝締めの儀式は何度でも）。
    await showScenarioList(el("scenario-list-screen"), {
      repository: profileRepo,
      onBack: back,
      onPlay: (scenarioId, onEnd) => {
        showScreen("scenario-screen");
        playScenario(scenarioId, { audio, onEnd: () => rollCreditsIfEpilogue(scenarioId, () => { goScreen("scenario-list-screen"); onEnd?.(); }) });
      },
    });
    goScreen("scenario-list-screen");
  } else if (target === "play-scenario") {
    // 解禁モーダル/大会ストーリーゲートの「視聴する」→ 一覧を経由せず直接再生。
    // 読了で既読化＋初回ソウルを付与し、師弟ホームへ戻ってリザルトを出す。
    const profile = await profileRepo.loadProfile();
    const s = scenariosForMentor(activeAvatar(profile)?.mentorCharacterId)
      .find((x) => x.scenarioId === payload?.scenarioId);
    if (!s) { back(); return; }
    showScreen("scenario-screen");
    playScenario(s.scenarioId, {
      audio,
      onEnd: async () => {
        const fresh = await profileRepo.loadProfile();
        const res = markScenarioRead(fresh, s);
        if (res.newlyRead) await profileRepo.saveProfile(res.profile); // 既読/絆が変わったら保存（初回ソウルの有無に依らない）
        rollCreditsIfEpilogue(s.scenarioId, () => openMentorHome({ scenarioRead: { title: s.title, soul: res.soul, bondUp: res.bondUp } }));
      },
    });
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
    // 技 Lv（シナリオ起点）も効く＝覇道編後半の師匠タイマンは歯応えが上がる。
    const mentorHp = mentorDuoHp(mentorBase, profile);
    const mentor = asMentorMatchChar(mentorBase, mentorHp, profile);
    launchHonestMatch({
      avatar: av, opponents: [mentor], players: 2, rounds: 2, // 二人麻雀・東南戦
      startPoints: stake, // ★持ち点＝弟子の現 HP（師匠は格上HP）
      voiceSet: "shugyo", autoPlay: !!payload?.auto, returnTo: "mentor-home",
      onResult: async (result) => {
        const cur = await profileRepo.loadProfile();
        const res = applyDuoResult(cur, result);
        let np = res.profile;
        if (av?.mentorCharacterId) np = applyMatchToCompanion(np, { companionId: av.mentorCharacterId, placement: result.placement ?? 1, numPlayers: 2, styleTags: [] });
        await profileRepo.saveProfile(np);
        openMentorHome({ duo: { won: res.won, soul: res.soul, gains: res.gains, before: res.before, after: res.after, closeness: res.closeness, finalPoints: res.finalPoints, hpBefore: res.hpBefore, hpAfter: res.hpAfter, hpDelta: res.hpDelta, bondUp: res.bondUp, mentor: res.mentor } });
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
        let np = res.profile;
        if (av?.mentorCharacterId) np = applyMatchToCompanion(np, { companionId: av.mentorCharacterId, placement: res.placement, numPlayers: res.numPlayers, styleTags: result.styleTags || [] });
        await profileRepo.saveProfile(np);
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
      parlor: cand,
      onExit: async (session) => {
        const cur = await profileRepo.loadProfile();
        const res = visitParlor(cur, cand.index, session?.wins ?? 0, Math.random, { rareWins: session?.rareWins ?? 0 });
        await profileRepo.saveProfile(res.profile);
        // 戻った先（師弟ホーム）で雀荘リザルト＋能力値上昇演出を出す。
        openMentorHome({ parlor: { candidate: res.candidate, wins: res.wins, soul: res.soul, gains: res.gains, before: res.before, after: res.after, trait: res.trait, fee: res.fee, rareWins: res.rareWins, rareBonus: res.rareBonus } });
      },
    });
  }
}

function navigate(target) {
  if (target === "mentor") { openMentorMode(); return; }
  if (target === "online") { enterOnline(); return; } // 通信対戦はログイン+名前ゲートを通す
  const id = NAV_TARGETS[target];
  if (!id) return;
  if (target === "settings") resyncHomeSettings(); // reflect in-game edits
  goScreen(id);
}

// 通信対戦の入場ゲート: ①ログイン必須 → ②ユーザーネーム必須 → online-screen。
// ランクは「誰の記録か」が要るので、未ログイン/名前なしでは入場させない。
async function enterOnline() {
  const user = await getUser().catch(() => null);
  if (!user) {
    showConfirm({
      title: "ログインが必要だよ",
      message:
        "通信対戦は、段位やオンラインの記録を残すために\nアカウント連携（Googleログイン）が必要なんだ。\nログインすると、育てた弟子もクラウドに保存されるよ。",
      confirmLabel: "Googleでログイン",
      cancelLabel: "やめる",
      onConfirm: () => {
        signInWithGoogle(window.location.href.split("#")[0]).catch((e) => {
          console.error("ログイン開始失敗", e);
          alert("ログインを開始できませんでした。少し時間をおいて試してね。");
        });
      },
    });
    return;
  }
  // ログイン済: ユーザーネーム未設定なら入力を要求してから入場。
  const profile = await profileRepo.loadProfile().catch(() => null);
  const current = normalizeUsername(profile?.profile?.displayName || "");
  if (!current) {
    showUsernameModal({
      onSubmit: async (name) => {
        try {
          const p = await profileRepo.loadProfile();
          p.profile = p.profile || {};
          p.profile.displayName = name;
          await profileRepo.saveProfile(p);
          goScreen("online-screen");
        } catch (e) {
          console.error("ユーザーネーム保存失敗", e);
          alert("名前の保存に失敗しました。通信状態を確認して試してね。");
        }
      },
    });
    return;
  }
  goScreen("online-screen");
}
function bootHome() {
  // トップの左右に起動ごとのランダム立ち絵を“出迎え”として置く（寂しさ解消・共在感）。
  mountHomeCast(el("home-screen"));
  for (const btn of document.querySelectorAll("[data-nav]")) {
    btn.addEventListener("click", () => { audio.playClick?.(); navigate(btn.dataset.nav); });
  }
  // DEBUG: ?debug=tsumoreba 起動時だけホームに 🐛 を出し、演出プレビュー等のメニューを開く。
  if (isDebugMode()) {
    const dbgBtn = el("debug-menu-btn");
    dbgBtn?.classList.remove("hidden");
    dbgBtn?.addEventListener("click", () => { audio.playClick?.(); showDebugMenu(); });
  }
  // 通信対戦（テスト中）の入口: モード選択 → ロビー。
  el("online-room-btn")?.addEventListener("click", () => { audio.playClick?.(); openOnlineLobby("room"); });
  el("online-join-btn")?.addEventListener("click", () => {
    audio.playClick?.();
    showRoomCodeModal({ onSubmit: (code) => openOnlineLobby("room", { joinCode: code }) });
  });
  el("online-match-btn")?.addEventListener("click", () => { audio.playClick?.(); openOnlineLobby("match"); });
  el("online-rank-btn")?.addEventListener("click", () => { audio.playClick?.(); openOnlineLeaderboard(); });
  // Volumes apply regardless of starting screen; the home 設定 controls share
  // the same AudioManager + storage as the in-game gear panel.
  applyAudioSettings(audio);
  resyncHomeSettings = wireSettingsControls(audio, {
    enabled: "home-audio-enabled",
    bgm: "home-bgm-volume", bgmVal: "home-bgm-volume-val",
    se: "home-se-volume", seVal: "home-se-volume-val",
  });
  // ロード画面でリソースを先読みしてからホームへ。ゲージは下部(load-fill)を伸ばす。
  goScreen("loading-screen");
  const fill = el("load-fill");
  const tip = el("loading-screen")?.querySelector(".load-tip");
  preloadAssets((f) => { if (fill) fill.style.width = `${Math.round(f * 100)}%`; })
    .finally(() => {
      if (fill) fill.style.width = "100%";
      if (tip) tip.textContent = "ようこそ";
      // ほんの一拍 100% を見せてからホームへ（一瞬で消えてチラつくのを防ぐ）。
      setTimeout(() => {
        goScreen("home-screen");
        // 認証おすすめは「相棒（詩玥）と出会った後」に出す＝第一印象を機能説明でなくキャラ接触に
        // （初回の対戦ホーム表示後に遅延フェードイン。renderBattleHome 側で発火）。UXテスト指摘。
      }, 240);
    });
  // Browsers block audio before the first user gesture, so the home BGM may not
  // start at boot. Retry once on the first interaction (playHomeBgm no-ops if it
  // already started).
  const kickBgm = () => { audio.playHomeBgm(); window.removeEventListener("pointerdown", kickBgm); };
  window.addEventListener("pointerdown", kickBgm, { once: true });
}

// ----------------------------------------------------------------- start
async function startGame() {
  await primeMatchVoiceState(); // 相棒絆・履歴のスナップショット（個人/ペア/団体すべて／読む側）
  if (selectedTeamBattle) { startTeamBattleGame(); return; }
  if (selectedPairBattle) { startPairBattleGame(cpuPicks[0]); return; }
  humanIndex = 0;
  teamBattleData = null;
  pairBattleData = null;
  // human picks their character. Each CPU seat is either an explicit pick
  // (cpuPicks) or left as "おまかせ" — empty seats are filled at random with no
  // duplicates against the human or any explicit pick. Seat count depends on the
  // chosen mode: 4 players (四人) or 3 players (三麻).
  // 席0（あなた）は通常キャラまたは修行完了弟子（completed-*）。CPU 席は CHARACTERS のみ。
  const human = charById(selectedCharId);
  if (!human) return; // 弟子ロスター読込前の競合等で未解決なら開始しない（クラッシュ防止）
  const picks = cpuPicks.slice(0, selectedPlayers - 1);
  const usedIds = new Set([human.id, ...picks.filter(Boolean)]);
  // 未解禁キャラ（宝珠ショップ前）はCPU相手の母集団にも出さない（解禁前のお披露目もしない）。
  const randomPool = shuffled(CHARACTERS.filter((c) => !usedIds.has(c.id) && !isCharLocked(c)));
  const cpus = picks.map((id) =>
    id ? CHARACTERS.find((c) => c.id === id) : randomPool.shift()
  );
  const order = [human, ...cpus];
  const seated = order.map((c) => ({
    character: c,
    abilities: instantiateAbilities(c),
  }));
  // 弟子の立ち絵/アイコンは起動時プリロード対象外なので念のため確保（通常は select 開時にロード済み）。
  if (human.isCompletedAvatar) { try { await charImages.load([human]); } catch { /* フォールバック描画 */ } }
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

// 通信対戦の権威サーバ（Cloudflare Worker + Durable Object）。既定はこの本番URL。
// 開発時は window.__ONLINE_WS_URL で差し替え可：
//   "ws://127.0.0.1:8788/ws" など … そのローカルサーバへ接続
//   "loopback" … サーバ無しの in-browser 権威（オフラインでも遊べる）
const ONLINE_WS_URL = "wss://mahjong-online.nogi-kaiyu.workers.dev/ws";

// 通信対戦（テスト中）: ロビーを開く。mode = "room" | "match"。
// opts.joinCode があれば「合言葉で参加」モード（その合言葉のルームへ入る）。
async function openOnlineLobby(mode, opts = {}) {
  // ルーム対戦は「リアルタイム待合室」へ（入室と同時にWS接続・ホスト主導で開始）。
  if (mode === "room") { enterRoomLobby(opts); return; }
  showScreen("online-lobby-screen");
  // マッチング対戦のロビー左側は戦績を見せる（卓表示だと「ここでマッチング中」と誤解されるため）。
  // 戦績は「オンライン対戦だけ」の集計（online_results）。プロフィールは段位/名前/推し用。
  let profile = null, onlineStats = null;
  try { profile = await profileRepo.loadProfile(); } catch { /* 未ログインは段位等を既定で描く */ }
  try { onlineStats = await fetchMyOnlineStats(); } catch { /* 取得失敗は戦績なし扱い */ }
  showOnlineLobby(el("online-lobby-screen"), {
    mode,
    characters: CHARACTERS,
    audio,
    joinCode: opts.joinCode || null, // 合言葉で参加するときの既定コード
    stats: profileStatsForLobby(profile, onlineStats), // 戦績パネル用
    onBack: () => goScreen("online-screen"),
    onStart: ({ charId, code }) => {
      const ov = (typeof window !== "undefined") ? window.__ONLINE_WS_URL : undefined;
      if (ov === "loopback") { startOnlineMatch(charId); return; } // 開発: サーバ無し権威
      const base = ov || ONLINE_WS_URL;
      // room=合言葉(招待制・同じ合言葉の人と同卓) / match=共有マッチング卓(他の待機者と相席)。
      // どちらもサーバ側で人間が揃うか時間切れまで待ってから開始する（空席は CPU 補填）。
      // マッチング部屋名は **バージョン付き**: サーバ挙動を変えたら番号を上げ、古いコードを保持した
      // 既存 Durable Object（退避まで旧コードのまま動く）を確実に避けてフレッシュな DO に入る。
      const room = mode === "room" ? `room-${code}` : "match2";
      startMatchmaking(charId, base, room, mode);
    },
  });
}

// ルーム対戦の待合室へ入る：画面を出してから即WS接続し intent.join{lobby:true} を送る。
// 以降の evt.lobby で 4 枠を随時更新し、ホストの「対局開始」(intent.lobbyStart)で welcome→対局へ。
// welcome 後は onlineWsEp 等の既存WS経路（client化・再接続）にそのまま乗る（connectMatchmaking と同型）。
async function enterRoomLobby(opts = {}) {
  const isJoin = !!opts.joinCode;
  const code = opts.joinCode || makeCode(4);
  humanIndex = 0;
  teamBattleData = null; pairBattleData = null;
  selectedTeamBattle = false; selectedPairBattle = false;
  selectedPlayers = 4; selectedRounds = 1; // テスト中は4人東風固定

  // 自分の表示情報（ユーザー名/段位/推し）を join に同梱（startMatchmaking と同じ取得）。
  let name = null, dan = 1, oshi = null;
  try {
    const p = await profileRepo.loadProfile();
    name = normalizeUsername(p?.profile?.displayName || "") || null;
    dan = describeRank(p?.onlineRank || defaultRankState()).dan;
    oshi = topCompanionId(p?.companionBonds);
  } catch { /* 未ログイン等は名無しで参加 */ }

  let myCharId = (CHARACTERS[0] && CHARACTERS[0].id) || null; // 既定キャラ（待合室で変更可）
  const ov = (typeof window !== "undefined") ? window.__ONLINE_WS_URL : undefined;
  if (ov === "loopback") { startOnlineMatch(myCharId); return; } // 開発: サーバ無しは従来の即CPU
  const base = (ov && ov !== "loopback") ? ov : ONLINE_WS_URL;

  showScreen("online-lobby-screen");
  const api = showRoomLobby(el("online-lobby-screen"), {
    code, isJoin, characters: CHARACTERS, audio,
    onSetChar: (id) => { myCharId = id; sendLobbySetChar(id); },
    onSlot: (seat, state) => sendLobbySlot(seat, state),
    onStart: () => sendLobbyStart(),
    onBack: () => { leaveRoomLobby(); goScreen("online-screen"); },
  });
  roomLobby = { ep: null, code, api, myCharId: () => myCharId }; // 待合室入室の印（接続中・ep は接続後に差す）

  const url = `${base}?room=room-${encodeURIComponent(code)}`;
  let ep;
  try { ep = await connectWebSocket(url); }
  catch (e) {
    console.error("WS接続失敗", e);
    if (roomLobby) { roomLobby = null; alert("オンラインサーバに接続できませんでした：" + url); goScreen("online-screen"); }
    return;
  }
  if (!roomLobby) { ep.close?.(); return; } // 接続待ちの間に「戻る」で離脱した
  // welcome 以降の client 化・再接続が使う既存WS状態を確立（connectMatchmaking と揃える）。
  onlineWsEp = ep; onlineWsUrl = url; onlineToken = null; reconnecting = false;
  roomLobby.ep = ep;
  if (typeof window !== "undefined") window.__onlineEp = ep; // デバッグ: 強制切断テスト用
  ep.onMessage(onlineClientMessage); // evt.lobby→待合室更新 / welcome→対局へ
  ep.onClose?.(() => handleWsClose(ep)); // 切断時は既存の再接続/終了ハンドラへ委譲（待合室中は online=null で no-op）
  ep.send({ type: "intent.join", charId: myCharId, name, dan, oshi, lobby: true });
}

// 待合室の操作を権威へ送る（待合室中のみ。roomLobby が無ければ no-op）。
function sendLobbySetChar(charId) { roomLobby?.ep.send({ type: "intent.lobbySetChar", charId }); }
function sendLobbySlot(seat, state) { roomLobby?.ep.send({ type: "intent.lobbySlot", slot: seat, state }); }
function sendLobbyStart() { roomLobby?.ep.send({ type: "intent.lobbyStart" }); }
// 待合室から手動で抜ける（戻るボタン）。接続を閉じて状態を消す。
function leaveRoomLobby() {
  const ep = roomLobby?.ep;
  roomLobby = null;
  if (ep) { ep === onlineWsEp && (onlineWsEp = null); try { ep.close?.(); } catch { /* already closed */ } }
}

// 通信対戦の対局を開始（テスト中＝4人東風固定・自席以外は CPU 補填）。startGame と同じ
// 入口（showMatchIntro → beginGame）を通すので、対局中の挙動はフリー対戦と同一。
function startOnlineMatch(charId) {
  humanIndex = 0;
  teamBattleData = null;
  pairBattleData = null;
  selectedTeamBattle = false;
  selectedPairBattle = false;
  selectedPlayers = 4;
  selectedRounds = 1; // テスト中は東風戦固定
  const human = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
  const cpus = shuffled(CHARACTERS.filter((c) => c.id !== human.id && !isCharLocked(c))).slice(0, 3); // 未解禁キャラはCPU相手に出さない
  const order = [human, ...cpus];
  const seated = order.map((c) => ({ character: c, abilities: instantiateAbilities(c) }));
  for (const c of order) audio.registerCharacterVoices(c.id, c.assets?.voices || {});
  const dealerIndex = Math.floor(Math.random() * seated.length);
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated,
    humanIndex,
    mode: { rounds: selectedRounds, players: selectedPlayers },
    dealerIndex,
    audio,
    onComplete: () => beginGame(seated, dealerIndex, { online: true }),
  });
}

// 通信対戦（テスト中・ループバック）: ③ 本物のクライアント化。
// 画面に映す `game` は「レプリカ」（applyEvent で駆動。自席手牌のみ実値・他席は伏せ札）。権威は
// 別インスタンス authGame（ヘッドレス）で AuthorityRoom が回す。席0の意思決定は Intent で権威へ、
// 結果は wire Event → applyEvent(emit) でレプリカの bus を発火＝既存の描画/SE/相棒ボード配線が動く。
// （ループバックなので transport を WS/DO に差し替えれば別マシンでもそのまま成立＝L4c-2 ①。）
const ONLINE_WIRE = new Set([
  "handStarted", "tileDrawn", "tileDiscarded", "riichiDeclared", "meldCalled", "abilityUsed", "handWon", "handDrawn",
]);
// オンライン共通: 結果画面トリガ（権威の HAND_WON/HAND_DRAWN が applyEvent(emit) でレプリカ bus に
// 再発火する）＋オート観戦ボタンを隠す。loopback / WS どちらの client 化でも使う。
function wireOnlineCommon() {
  game.bus.on(Events.HAND_WON, () => { if (online) showHandResult(); });
  game.bus.on(Events.HAND_DRAWN, () => { if (online) showHandResult(); });
  el("auto-btn")?.classList.add("hidden");
}

// in-browser ループバック権威（サーバ不要のテスト経路）。
function startOnlineRoom(seated, dealerIndex) {
  const authSeated = seated.map((s) => ({ character: s.character, abilities: instantiateAbilities(s.character) }));
  const authGame = new Game(authSeated, humanIndex, undefined, { maxRounds: selectedRounds, dealerIndex });
  const { a: roomEp, b: clientEp } = createLoopback();
  const room = new AuthorityRoom(authGame, { [humanIndex]: roomEp }, {
    // timeout 未指定＝AuthorityRoom 既定(15s)。本番 WS と揃え、ループバックでも代打ちを確認できる。
    pacing: { cpuDelay: CPU_DELAY, cutInWait: ABILITY_CUTIN_WAIT, nakiWait: NAKI_WAIT },
  });
  clientEp.onMessage(onlineClientMessage);
  online = { room, send: (m) => clientEp.send(m), opts: null, callOpts: null };
  wireOnlineCommon();
  room.run().catch((e) => console.error("online room crashed", e));
}

// 実 WS 権威クライアント。online.send は onlineWsEp へ。権威(サーバ)は join 後すでに対局開始済みで、
// welcome 後の handStarted 以降が onlineClientMessage に届く（描画/結果は loopback と同じ経路）。
function startOnlineClientWS() {
  online = { send: (m) => onlineWsEp.send(m), opts: null, callOpts: null, ws: true };
  wireOnlineCommon();
}

// 通信対戦の対局開始画面。各席の「ユーザー名＋段位（推し＝持ちキャラの立ち絵）」を VS カードで見せる。
// 親決め演出（Phase B）はオンラインでは権威が決めるためスキップし、完了で対局画面を表に出す。
function showOnlineMatchIntro(seated) {
  const labels = seated.map((s, i) => {
    const info = onlineSeatInfo?.[i];
    if (!info || info.cpu) return { name: s.character.name, sub: "CPU", cpu: true };
    // 推し＝相手が送ってきた最高絆キャラ。無ければこの対局の持ちキャラで代用。
    const oshiChar = (info.oshi && CHARACTERS.find((c) => c.id === info.oshi)) || s.character;
    return {
      name: info.name || "名無し",
      sub: describeRank({ dan: info.dan || 1, tierRp: 0 }).title, // 段位の称号
      oshiName: oshiChar.name,
      oshiColor: oshiChar.color,
      you: i === humanIndex,
    };
  });
  showScreen("match-intro-screen");
  showMatchIntro(el("match-intro-screen"), {
    seated,
    humanIndex,
    mode: { rounds: selectedRounds, players: seated.length },
    dealerIndex: humanIndex, // skipSeating なので親決めには使われない
    audio,
    labels,
    skipSeating: true,
    onComplete: () => { showScreen("game-screen"); render(); },
  });
}

// マッチング開始（テスト中）。サーバへ接続して待機列に入り、人間が揃うか時間切れで対局が始まる。
// 探索中は「対戦相手を探しています」オーバーレイを出し、welcome 受信で対局へ移る。match モードで
// 卓が満席/対局中(evt.matchClosed)だった場合は別バケツ（match-1, match-2, …）へ自動で繋ぎ直す。
async function startMatchmaking(charId, base, room, mode) {
  humanIndex = 0;
  teamBattleData = null; pairBattleData = null;
  selectedTeamBattle = false; selectedPairBattle = false;
  selectedPlayers = 4; selectedRounds = 1;
  // 自分の表示情報（ユーザー名・段位・推し）を join に同梱して、相手の対局開始画面/卓上にも出せるように。
  let name = null, dan = 1, oshi = null;
  try {
    const p = await profileRepo.loadProfile();
    name = normalizeUsername(p?.profile?.displayName || "") || null;
    dan = describeRank(p?.onlineRank || defaultRankState()).dan;
    oshi = topCompanionId(p?.companionBonds);
  } catch { /* 未ログイン等は名前なしで参加（CPU同様 名無し扱い） */ }
  matchmaking = { base, room, mode, charId, name, dan, oshi, attempt: 0 };
  connectMatchmaking();
}

// 現在の matchmaking 状態でサーバへ接続して join を送る。再試行時は同じ関数を attempt を上げて呼ぶ。
async function connectMatchmaking() {
  const mm = matchmaking;
  if (!mm) return;
  const roomName = mm.attempt === 0 ? mm.room : `${mm.room}-${mm.attempt}`;
  const url = `${mm.base}?room=${encodeURIComponent(roomName)}`;
  onlineWsUrl = url; onlineToken = null; reconnecting = false;
  showMatchSearchOverlay();
  let ep;
  try { ep = await connectWebSocket(url); }
  catch (e) {
    console.error("WS接続失敗", e);
    hideMatchSearchOverlay(); matchmaking = null;
    alert("オンラインサーバに接続できませんでした：" + url);
    goScreen("online-screen");
    return;
  }
  if (!matchmaking) { ep.close?.(); return; } // 接続待ちの間にキャンセルされた
  onlineWsEp = ep;
  if (typeof window !== "undefined") window.__onlineEp = ep; // デバッグ: 強制切断テスト用
  ep.onMessage(onlineClientMessage); // matchWaiting→探索表示 / welcome→beginGame(client化) / 以降 wire Event
  ep.onClose?.(() => handleWsClose(ep));
  ep.send({ type: "intent.join", charId: mm.charId, name: mm.name, dan: mm.dan, oshi: mm.oshi });
}

// 相棒絆が最も育っているキャラID（=よく使う相棒/推し）。level優先→exp。無ければ null。
function topCompanionId(bonds) {
  let topId = null, topKey = -1;
  for (const [id, b] of Object.entries(bonds || {})) {
    const key = (b?.level ?? 1) * 1e7 + (b?.exp ?? 0);
    if (key > topKey) { topKey = key; topId = id; }
  }
  return topId;
}

// マッチング対戦ロビーの戦績パネル用に要約。段位/RP・推しはプロフィール、対局数/トップ率/平均着順は
// オンライン専用集計(online_results)から。onlineStats=null（未ログイン/未取得）は戦績「—」表示。
function profileStatsForLobby(profile, onlineStats) {
  const r = describeRank(profile?.onlineRank || defaultRankState());
  const oshiId = topCompanionId(profile?.companionBonds);
  const oshi = oshiId ? CHARACTERS.find((c) => c.id === oshiId) : null;
  return {
    name: normalizeUsername(profile?.profile?.displayName || "") || "名無し",
    rankTitle: r.title, rankKana: r.kana, tierRp: r.tierRp, rankNext: r.next, rankAtMax: r.atMax, rankPct: r.progressPct,
    online: onlineStats, // { games, firstRate, avgRank, ... } or null
    oshi: oshi ? { name: oshi.name, color: oshi.color, icon: oshi.assets?.icon || null } : null,
  };
}

// 接続断の検知 → 対局が生きている間は自動で同じ卓へ再接続（リコネクト・ライト版）。
function handleWsClose(ep) {
  if (ep !== onlineWsEp) return;            // 旧端点の close は無視
  if (!online || !online.ws || reconnecting) return;
  if (!game || game.isGameOver()) return;   // 対局が終わっていれば再接続しない
  reconnecting = true;
  showReconnectOverlay("再接続中…");
  tryReconnect(0);
}
function tryReconnect(attempt) {
  if (!reconnecting) return;
  connectWebSocket(onlineWsUrl).then((ep) => {
    if (!reconnecting) { ep.close?.(); return; }
    onlineWsEp = ep;
    if (typeof window !== "undefined") window.__onlineEp = ep; // デバッグ
    if (online) online.send = (m) => ep.send(m);
    ep.onMessage(onlineClientMessage);
    ep.onClose?.(() => handleWsClose(ep));
    ep.send({ type: "intent.rejoin", token: onlineToken }); // 成功すると welcome(rejoined)+snapshot が届く
  }).catch(() => {
    if (!reconnecting) return;
    if (attempt < 6) reconnectTimer = setTimeout(() => tryReconnect(attempt + 1), Math.min(1500 * (attempt + 1), 6000));
    else reconnectGiveUp();
  });
}
function reconnectSuccess() {
  reconnecting = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  showReconnectOverlay(null); // 隠す
}
function reconnectGiveUp() {
  reconnecting = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  showReconnectOverlay("fail");
}
// 再接続オーバーレイ。text=null で隠す / "fail" で「繋がらない」案内（やり直し/ホーム）。
function showReconnectOverlay(text) {
  let ov = el("reconnect-overlay");
  if (!text) { ov?.remove(); return; }
  if (!ov) { ov = document.createElement("div"); ov.id = "reconnect-overlay"; ov.className = "reconnect-overlay"; (el("app") || document.body).appendChild(ov); }
  if (text === "fail") {
    ov.innerHTML =
      `<div class="reconnect-card"><div class="reconnect-msg">接続が切れちゃった……もう一度試す？</div>` +
      `<div class="reconnect-btns"><button class="primary" id="reconnect-retry">もう一度</button>` +
      `<button class="ghost-back" id="reconnect-home">← ホームへ</button></div></div>`;
    el("reconnect-retry").onclick = () => { showReconnectOverlay("再接続中…"); reconnecting = true; tryReconnect(0); };
    el("reconnect-home").onclick = () => { reconnecting = false; onlineWsEp?.close?.(); online = null; showReconnectOverlay(null); goScreen("home-screen"); };
  } else {
    ov.innerHTML = `<div class="reconnect-card"><span class="online-spinner"></span><span class="reconnect-msg">${text}</span></div>`;
  }
}

// --- マッチング探索オーバーレイ（接続後〜welcome までの「相手を探しています」表示） ---
function showMatchSearchOverlay() {
  let ov = el("match-search-overlay");
  if (!ov) { ov = document.createElement("div"); ov.id = "match-search-overlay"; ov.className = "reconnect-overlay"; (el("app") || document.body).appendChild(ov); }
  ov.innerHTML =
    `<div class="reconnect-card match-search-card">` +
    `<div class="match-search-title">対戦相手を探しています<span class="online-dots"></span></div>` +
    `<div class="match-search-count"><span id="match-search-joined">1</span> / 4 人</div>` +
    `<div class="match-search-sub" id="match-search-sub">空席は時間内に揃わなければ CPU が入ります</div>` +
    `<div class="reconnect-btns"><button class="ghost-back" id="match-search-cancel">← やめる</button></div>` +
    `</div>`;
  el("match-search-cancel").onclick = () => { audio?.playClick?.(); cancelMatchmaking(); };
}
function updateMatchSearchOverlay(info) {
  const j = el("match-search-joined");
  if (j && info.joined != null) j.textContent = info.joined;
  if (info.waitMs != null) startMatchCountdown(info.waitMs);
}
function startMatchCountdown(ms) {
  clearInterval(matchCountdownTimer);
  let remain = Math.ceil(ms / 1000);
  const sub = el("match-search-sub");
  const tick = () => {
    if (sub) sub.textContent = remain > 0 ? `あと約 ${remain} 秒で開始（空席は CPU が入ります）` : "まもなく開始…";
    if (remain <= 0) { clearInterval(matchCountdownTimer); matchCountdownTimer = null; return; }
    remain -= 1;
  };
  tick();
  matchCountdownTimer = setInterval(tick, 1000);
}
function hideMatchSearchOverlay() {
  clearInterval(matchCountdownTimer); matchCountdownTimer = null;
  el("match-search-overlay")?.remove();
}
// 探索を中止してオンライン入口へ戻る。
function cancelMatchmaking() {
  matchmaking = null;
  hideMatchSearchOverlay();
  onlineWsEp?.close?.(); onlineWsEp = null;
  goScreen("online-screen");
}
// 卓が対局中(evt.matchClosed)だったときの再試行。match は別バケツへ、room(招待制)は諦める。
function retryMatchmaking() {
  if (!matchmaking) return;
  onlineWsEp?.close?.(); onlineWsEp = null;
  if (matchmaking.mode === "room") {
    hideMatchSearchOverlay(); matchmaking = null;
    alert("この合言葉の卓はすでに対局中です。別の合言葉でやり直してください。");
    goScreen("online-screen");
    return;
  }
  matchmaking.attempt += 1;
  if (matchmaking.attempt > 5) {
    hideMatchSearchOverlay(); matchmaking = null;
    alert("空いている卓が見つかりませんでした。少し待ってからもう一度お試しください。");
    goScreen("online-screen");
    return;
  }
  connectMatchmaking(); // 次のバケツ（match-1, match-2, …）へ繋ぎ直す
}

// 権威（ループバック/WS 共通）からのメッセージ。welcome でレプリカ構築→対局画面、wire Event は
// applyEvent(emit) でレプリカ(game)を描画、awaitX は自席 UI。
function onlineClientMessage(msg) {
  // 探索中（welcome 前）のマッチング進捗。game/online がまだ無い段階で届くため最初に処理する。
  if (msg.type === "evt.matchWaiting") { updateMatchSearchOverlay(msg); return; }
  if (msg.type === "evt.matchClosed") { retryMatchmaking(); return; }
  // ルーム対戦の待合室（welcome 前）。members の人数/顔ぶれ・ホストUIを随時更新する。
  if (msg.type === "evt.lobby") { roomLobby?.api?.update(msg); return; }
  if (msg.type === "evt.lobbyFull") { leaveRoomLobby(); alert("この部屋は満員です。"); goScreen("online-screen"); return; }
  if (msg.type === "welcome") {
    hideMatchSearchOverlay(); matchmaking = null; roomLobby = null; // 探索/待合室 終了 → 対局へ
    if (msg.token) onlineToken = msg.token; // 再接続トークンを保持
    onlineSeatInfo = Array.isArray(msg.players) ? msg.players : null; // 席ごとの名前/段位（卓上＆開始画面用）
    if (msg.rejoined) { reconnectSuccess(); return; } // 再接続: 既存の対局へ復帰（snapshot が続く）
    // サーバが席割と卓の顔ぶれ(roster=charId列)を通知 → レプリカを構築して対局へ。
    const seated = (msg.roster || []).map((id) => {
      const c = CHARACTERS.find((x) => x.id === id) || CHARACTERS[0];
      return { character: c, abilities: instantiateAbilities(c) };
    });
    for (const s of seated) audio.registerCharacterVoices(s.character.id, s.character.assets?.voices || {});
    humanIndex = msg.seat != null ? msg.seat : 0;
    // レプリカを先に構築（=以降のサーバイベントが適用される）。対局開始画面はその上に重ねて見せ、
    // 完了で game-screen を表に出す（イベントは画面が隠れている間もレプリカに反映され続ける）。
    beginGame(seated, 0, { online: true, ws: true });
    showOnlineMatchIntro(seated);
    return;
  }
  if (msg.type === "evt.rejoinFailed") { reconnectGiveUp(); return; }
  if (!game || !online) return; // welcome 前の取りこぼし保険（通常は到達しない）
  if (msg.type === "evt.snapshot") {
    // 再接続: 途中局面からレプリカを組み直して描画再開。
    applyEvent(game, msg, { viewpoint: humanIndex, emit: true });
    reconnectSuccess();
    return;
  }
  if (msg.type === "evt.gameOver") {
    // 権威からの終局通知。レプリカの gameOver はイベントで同期されないため、ここで立てて結果画面へ。
    // この通知は最終局の ack 送出後（結果オーバーレイを閉じた後）に届くので、そのまま結果へ進める。
    // 二重発火（再接続後の重複通知など）に備え一度だけ表示する。
    game.gameOver = true; // 以降 handleWsClose の自動再接続も抑止される
    resetOnlineTurnUi(); // 長考バッジ/代打ちモーダル/待機トーストが残らないよう一掃
    if (!game._goShownOnline) { game._goShownOnline = true; showGameOver(); }
    return;
  }
  if (msg.type === "evt.turn") { handleOnlineTurn(msg.seat, msg.ms); return; }
  if (msg.type === "evt.autoOn") { enterAutoTakeover(); return; }
  if (msg.type === "evt.autoOff") { exitAutoTakeover(); return; }
  if (ONLINE_WIRE.has(msg.type)) {
    // 動き出し（打牌）/結果/次局開始で「長考中」バッジを解除する。
    if (msg.type === "tileDiscarded" || msg.type === "handWon" || msg.type === "handDrawn") setThinkingSeat(null);
    if (msg.type === "handStarted") { setThinkingSeat(null); hideOnlineWaitToast(); } // 次局到来＝局間待ち解除
    applyEvent(game, msg, { viewpoint: humanIndex, emit: true });
    return;
  }
  if (msg.type === "evt.awaitDiscard" && msg.seat === humanIndex) {
    // 権威の「あなたの打牌番」シグナル。pub.phase は emit 時点で前フェーズが残ることがあるため
    // （親=自席で最初に打つ場合など）、ここで phase/turn を確定させる（onCanvasClick のガード対策）。
    game.phase = Phase.AWAIT_DISCARD;
    game.turn = msg.seat;
    online.opts = msg; // { options, abilityStatus, danger } を showHumanActions が使う
    showHumanActions();
    render(); // phase 確定後に再描画＝手牌ヒットボックスを正しい手番状態で再計算（打牌可に）
    maybePlayLuckyTsumoFx(); // 対人戦のツモ演出（詩玥の金リング／ルクスの捕捉回収）はここが入口
    return;
  }
  if (msg.type === "evt.awaitCalls" && msg.seat === humanIndex) {
    game.phase = Phase.AWAIT_CALLS; // 鳴き窓中は打牌ガードを効かせる
    let options = msg.options;
    // 鳴きなし: オフライン(LocalController.decideCalls)と同じ扱いをオンラインでも適用する。
    // ポン/チー/カンは伏せ、ロン(鳴きではない)だけ残す。残る選択肢が無ければ自動でパスを権威へ返す。
    // ※ 鳴き決定はサーバ(AuthorityRoom)発の evt.awaitCalls で来るため、ここで間引かないと無視される。
    if (noNaki) {
      if (options && options.ron) {
        options = { ron: true, pon: false, kan: false, chi: [] };
      } else {
        online.send({ type: "intent.call", action: "pass" });
        return;
      }
    }
    online.callOpts = options;
    showCallActions({ index: humanIndex, options });
    render();
  }
}

// 通信対戦の手番/待機 UI ----------------------------------------------------
// 手番開始通知。他席なら一定時間後に「長考中」バッジ、自席なら持ち時間の起点（UI は awaitDiscard が出す）。
function handleOnlineTurn(seat, ms) {
  onlineTurnSeat = seat;
  clearTimeout(thinkingBadgeTimer); thinkingBadgeTimer = null;
  setThinkingSeat(null); // 前席のバッジを消す
  hideOnlineWaitToast(); // 手番が動いた＝局は進行中。局間待ちトーストは引っ込める。
  if (seat === humanIndex) return; // 自席は ③ の持ち時間/代打ち側で扱う（バッジは出さない）
  // 他席：3秒以上手番が続いたら「長考中」。CPU は即打つので閾値に届かず出ない。
  thinkingBadgeTimer = setTimeout(() => {
    if (onlineTurnSeat === seat) setThinkingSeat(seat);
  }, THINK_BADGE_DELAY);
}

// レンダラへ「長考中」席を伝えて再描画。null で消灯。
function setThinkingSeat(seat) {
  if (!renderer) return;
  if (renderer.thinkingSeat === seat) return;
  renderer.thinkingSeat = seat;
  if (game && !game.gameOver) render();
}

// 自席が長考超過 → CPU 代打ち開始。操作 UI を畳み、「CPU代打ち中」＋「オート解除」モーダルを出す。
function enterAutoTakeover() {
  onlineAutoSelf = true;
  clearActions();
  let ov = el("takeover-overlay");
  if (!ov) { ov = document.createElement("div"); ov.id = "takeover-overlay"; ov.className = "reconnect-overlay"; (el("app") || document.body).appendChild(ov); }
  ov.innerHTML =
    `<div class="reconnect-card takeover-card">` +
    `<div class="takeover-title">長考時間超過</div>` +
    `<div class="takeover-sub"><span class="online-spinner"></span>CPU 代打ち中</div>` +
    `<div class="reconnect-btns"><button class="btn-tsumo" id="takeover-resume">オート解除</button></div>` +
    `</div>`;
  el("takeover-resume").onclick = () => {
    audio?.playClick?.();
    online?.send({ type: "intent.resumeControl" });
    const b = el("takeover-resume");
    if (b) { b.disabled = true; b.textContent = "解除中…"; } // 次の手番から本人へ。evt.autoOff で閉じる。
  };
}

// CPU 代打ち解除（本人が「オート解除」を押し、サーバが受理）。
function exitAutoTakeover() {
  onlineAutoSelf = false;
  el("takeover-overlay")?.remove();
}

// 局間「通信待機中…」：自分は次局へ進む準備ができたが、他家の足並みを待っている間に出す。
// 再接続/マッチング探索と同じ中央モーダル（reconnect-overlay）の見た目に揃える。
function showOnlineWaitToast() {
  let ov = el("online-wait-toast");
  if (!ov) { ov = document.createElement("div"); ov.id = "online-wait-toast"; ov.className = "reconnect-overlay"; (el("app") || document.body).appendChild(ov); }
  ov.innerHTML = `<div class="reconnect-card"><span class="online-spinner"></span><span class="reconnect-msg">通信待機中<span class="online-dots"></span></span></div>`;
}
function hideOnlineWaitToast() {
  clearTimeout(ackWaitTimer); ackWaitTimer = null;
  el("online-wait-toast")?.remove();
}

// 通信対戦を抜ける/開始しなおすときに手番・待機 UI を全リセット（タイマー/オーバーレイのリーク防止）。
function resetOnlineTurnUi() {
  onlineTurnSeat = null;
  onlineAutoSelf = false;
  clearTimeout(thinkingBadgeTimer); thinkingBadgeTimer = null;
  if (renderer) renderer.thinkingSeat = null;
  el("takeover-overlay")?.remove();
  hideOnlineWaitToast();
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

  // CPU チームを残りキャラからランダム割り当て（1チーム3人）。未解禁キャラは出さない。
  const usedIds = new Set(myMembers.map((c) => c.id));
  const pool = shuffled(CHARACTERS.filter((c) => !usedIds.has(c.id) && !isCharLocked(c)));
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

  // 敵ペア2人＋（必要なら相方）を、自分と被らないようランダム割り当て。未解禁キャラは出さない。
  const usedIds = new Set([me.id, ...(partner ? [partner.id] : [])]);
  const pool = shuffled(CHARACTERS.filter((c) => !usedIds.has(c.id) && !isCharLocked(c)));
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
  // 相方への指示：おまかせ(自動発動)で開始。要請キューは空に。
  pairPartnerAuto = true;
  pairAbilityRequests.clear();

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
function beginGame(seated, dealerIndex, opts = {}) {
  online = null; // 既定はオフライン。オンライン時のみ startOnlineRoom が設定する。
  resetOnlineTurnUi(); // 前局/前対局の手番・待機 UI（長考バッジ/代打ちモーダル/待機トースト）を一掃。
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
    // 楼光の館：定められた局数で打ち切り（耐え切る or どちらかトビで決着＝サクサク）。
    maxHands: pairBattleData?.isRoguelite ? rogueliteHandLimit : undefined,
    // 楼光の館は点棒＝HPの独自スケール（~1000）。供託(リーチ棒)は0にし、代わりに宣言時へ
    // 「最大HPの5%消費」を課す（閾値=riichiCostFrac／実消費は RIICHI_DECLARED で pairBattleData.hp を削る）。
    riichiCost: pairBattleData?.isRoguelite ? 0 : undefined,
    // 不抜のリーチ（道具）：次戦だけリーチのHP消費を0にする。
    riichiCostFrac: pairBattleData?.isRoguelite ? (rogueliteState?.battleMods?.freeRiichi ? 0 : ROGUELITE_RIICHI_FRAC) : undefined,
  });
  // ペア戦の味方相互の被弾を避ける戦術トグル（右サイドメニュー）。自陣（人間と同ペア）の
  // 席へ「和了しない／自分からあがらない」を適用する。
  applyPairWinPolicy();
  renderer = new CanvasRenderer(el("table"), game, humanIndex, tileImages, charImages);
  // 通信対戦の卓上ネームプレートはユーザー名で出す（席→名前。CPU/未設定は null＝キャラ名にフォールバック）。
  renderer.seatLabels = (opts.online && onlineSeatInfo)
    ? onlineSeatInfo.map((p) => (p && !p.cpu ? (p.name || "名無し") : null))
    : null;
  if (typeof window !== "undefined") { window.__game = game; window.__renderer = renderer; window.__audio = audio; window.__teamBattleData = teamBattleData; window.__pairBattleData = pairBattleData; window.__tbFx = showTeamBattleDamageFx; window.__showGameOver = showGameOver; window.__showHandResult = showHandResult; window.__activeVoiceSet = activeVoiceSet; } // debug handle

  game.bus.on(Events.STATE_CHANGED, () => render());
  // SE: random dahai sound whenever anyone discards (incl. the human)
  game.bus.on(Events.TILE_DISCARDED, () => audio.playDahai());
  // BGM (random per hand) + deal-shuffle SE
  game.bus.on(Events.HAND_STARTED, () => {
    // 宝大会中はティア別BGMで通す（force:false＝同曲継続）。それ以外は従来どおり局ごとランダム。
    const tier = honestCtx?.tournamentInfo?.tier;
    if (tier) audio.playTournamentBgm(tier); else audio.playRandomBgm();
    audio.playShuffle();
    // 得点推移の記録：各局のはじまり＝直前までの持ち点スナップショット（全員ぶん）。
    scoreHistory.push({ label: game.roundLabel(), points: game.players.map((p) => p.points) });
    // 能力の持続レイヤーは1局ぶんの蓄積（灯の数・歩数）なので局頭で畳んで数え直す。
    resetAbilityAuraState();
    clearAbilityAura();
    clearFieldAura(); // 場レイヤー（他家の泥）も自席と同じ作法で畳む＝連戦で前局の残りを見せない
    resetLuxWatch();
    resetShioriReview(); // 前の対局の「答え合わせ」が連戦に持ち越されないよう畳む
    mamoriWarned = new Map(); // 真守の警告履歴は1局ぶん
    recalledTileIds.clear();  // 回収マークも1局ぶん
  });
  // Riichi declaration: chime/voice + a seat テロップ (ポン/カンと同系). The flag
  // extends the *next* CPU turn by RIICHI_WAIT so the banner reads (宣言後ウェイト).
  game.bus.on(Events.RIICHI_DECLARED, ({ player }) => {
    riichiWaitFlag = true;
    audio.playVoice(player.character.id, "riichi");
    showRiichiFx(player.index);
    // 楼光の館：リーチ宣言で最大HPの5%を消費（点棒＝HPの独自スケールでは供託0＝ここで実HPを削る）。
    if (pairBattleData?.isRoguelite) {
      const seat = player.index;
      const maxHp = pairBattleData.chars[seat]?.stats?.startingPoints || 0;
      const cost = Math.round(maxHp * ROGUELITE_RIICHI_FRAC);
      if (cost > 0) {
        pairBattleData.hp[seat] = Math.max(1, pairBattleData.hp[seat] - cost); // リーチで自滅はしない（最低1）
        pairBattleData.pairScore[pairBattleData.pairOf[seat]] = pairBattleData.pairs[pairBattleData.pairOf[seat]].seats.reduce((a, s) => a + Math.max(0, pairBattleData.hp[s]), 0);
        if (game.players[seat]) game.players[seat].points = pairBattleData.hp[seat]; // 局中表示も整合
        updateHpBoard();
      }
    }
  });
  // Naki call: shared SE + big banner over the caller's seat (win SE / point
  // popups are handled in the result-overlay flow, not here).
  game.bus.on(Events.MELD_CALLED, ({ player, type }) => {
    meldCalledFlag = true;
    // type is "pon"/"chi"/"kan" — used as the voice key; falls back to shared naki SE.
    audio.playVoice(player.character.id, type);
    showNakiFx(player.index, type);
  });
  // 北抜き (三麻): ポン/チーと同系の発声演出（キャラの "kita" ボイス→無ければ共有 naki SE
  // ＋席テロップ「北」）。抜いた本人はこの後もう一度行動するので、CPU はその再行動を
  // 一拍遅らせてテロップを読ませる（人間は自分の打牌操作が挟まるぶん間は不要）。
  game.bus.on(Events.KITA_PULLED, ({ player }) => {
    if (!player.isHuman || autoPlay) kitaWaitFlag = true;
    audio.playVoice(player.character.id, "kita");
    showKitaFx(player.index);
  });
  // Ability cut-in: big skill-name text + bust-up sweeping across, with a wait.
  game.bus.on(Events.ABILITY_USED, ({ player, name, abilityId, params }) => {
    abilityCutInFlag = true;
    audio.playVoice(player.character.id, "ability"); // no clip -> shared naki SE
    showAbilityCutIn(player, name, enemyNoteFor(player, abilityId, params));
  });
  // 局中マイクロ反応（自分の状況に応じた一言をバストアップのセリフ枠へ）。
  setupMatchTalk(game);

  showScreen("game-screen");
  // 前局の結果画面が右サイドを「立ち絵＋セリフ」枠に転用したまま（side-result）だと、
  // 大会の連戦で相棒ボードが隠れて立ち絵が残り続けるので、対局開始時に必ず復旧する。
  const sidePanel = document.querySelector("#game-screen .side");
  if (sidePanel) {
    sidePanel.classList.remove("side-result");
    sidePanel.querySelector(".speaker")?.remove();
  }
  buildHpBoard(); // 右側に卓配置どおりのキャラHP（相棒ボード）を構築
  updateTournamentHud(); // 大会中なら左上に「大会名／節／累積順位」バッジを出す（#2）
  el("table").addEventListener("click", onCanvasClick);
  el("table").addEventListener("mousemove", onCanvasHover);
  el("table").addEventListener("mouseleave", () => {
    el("table").style.cursor = "";
    lastHoverKey = null;
    renderer.hoverTileId = null;
    renderer.setHover(null);
    render();
  });
  initSettingsUI(audio); // gear icon + volume panel (idempotent against re-init)
  initNoNakiToggle();
  autoPlay = honestAutoPlay; // 通常は OFF。本気タイマンの「オート」起動時のみ ON で開始。
  honestAutoPlay = false;
  initAutoToggle();

  // game.startHand() emits HAND_STARTED -> BGM. This runs inside the
  // start-button click (a user gesture), satisfying browser autoplay policy.
  scoreHistory = []; // この対局の得点推移を録り直す（HAND_STARTED で各局を積む）
  if (opts.online) {
    // オンライン（テスト中）: `game` はレプリカ。権威は実 WS サーバ（opts.ws）か in-browser ループバック。
    if (opts.ws) startOnlineClientWS();
    else startOnlineRoom(seated, dealerIndex);
  } else {
    game.startHand();
    startPump();
  }

  // 対局開始: 自キャラが一言（マスタ駆動・一定時間で自動で消える）。
  // （一旦オフ。再開するときはこの行のコメントを外す）
  // showTransientSpeaker(game.players[humanIndex].character, "matchStart", {}, { side: "left", duration: 3600 });
}

// ----------------------------------------------------------------- main loop
// 非同期ポンプ。同期 loop() を置き換え、フェーズごとに「決定の供給(stepTurn/stepCalls)」を
// await する。CPU/オートは AI、人間は DOM ハンドラ(resolver)から決定が返る。演出の間合いは
// await delay() で従来の setTimeout と同じ尺を保つ。1局ぶんを回し、HAND_OVER/GAME_OVER で抜ける
// （次局は結果画面の「次の局へ」ボタンが startHand()+startPump() で再開する）。
function startPump() {
  runHand().catch((e) => console.error("runHand crashed", e));
}

// 次の局を開始する共通口。楼光の館は「1戦＝複数局」が1ゲームなので、能力の使用回数は戦を通して
// 持続させたい（局ごとに補充＝リセットしない）。startHand は hand スコープの charges を満タンに戻す
// ため、ローグライト戦では局開始前の残量を控え、startHand 後に書き戻す（active/cooldown の局リセットは活かす）。
// ※game スコープの能力は startHand で元々 charges を触られないので、この書き戻しは無害（同値）。
function startNextHand() {
  const keep = pairBattleData?.isRoguelite
    ? game.players.map((p) => (p.abilities || []).map((ab) => ab.charges))
    : null;
  game.startHand();
  if (keep) {
    game.players.forEach((p, pi) => (p.abilities || []).forEach((ab, ai) => { ab.charges = keep[pi][ai]; }));
  }
  startPump();
}

async function runHand() {
  while (true) {
    render();
    // Show the hand-over presentation (ron/tsumo banner + win/draw screen) first,
    // even when this hand ends the game (トビ終了 / 最終局). The result screen is
    // reached via the "結果へ" button in that overlay, not directly here.
    if (game.phase === Phase.HAND_OVER) { showHandResult(); return; }
    if (game.isGameOver()) { showGameOver(); return; }
    if (game.phase === Phase.AWAIT_CALLS) { await stepCalls(); continue; }
    if (game.phase === Phase.AWAIT_DISCARD) { await stepTurn(); continue; }
    return; // GAME_OVER フェーズ等
  }
}

// ----------------------------------------------------------------- decision layer
// 決定の供給源(A)。runHand/stepTurn/stepCalls は「決定の取得」をすべて controller 経由で行い、
// 「状態の変更(B)」(applyTurnDecision / game.resolveCalls / game.activateAbility) はポンプ側で行う。
// オフラインは LocalController。将来のオンライン(権威/クライアント)はこの口を差し替えるだけにする。
const LocalController = {
  // 自動発動する能力を返す（発動=状態変更は pump が activateAbility する）。人間席(手動発動)は空。
  decideAbilities(game, seat) {
    const actor = game.players[seat];
    if (actor.isHuman && !autoPlay) return [];
    // ペア戦・相方席：おまかせOFFなら「発動要請」された能力だけを撃つ（要件を満たした手番で消費）。
    if (pairBattleData && !autoPlay && !pairPartnerAuto && seat === pairPartnerSeat()) {
      return drainPartnerAbilityRequests(game, seat);
    }
    return decideAbilityActivations(game, seat);
  },
  // 手番の決定を返す。人間席=リーチ/強制中は自動ツモ切り・それ以外は resolver 待ち、
  // CPU/オート席=AI(演出ウェイト込み)。オートへの切替時は SWITCH_TO_AI がそのまま返る。
  async decideTurn(game, seat) {
    const actor = game.players[seat];
    // 直前の手番でリーチが宣言されていたら、この手番を一拍ぶん遅らせて
    // リーチのテロップを読ませる（一度きり消費）。北抜き直後の再行動も同様。
    const riichiBeat = riichiWaitFlag; riichiWaitFlag = false;
    const kitaBeat = kitaWaitFlag; kitaWaitFlag = false;
    if (actor.isHuman && !autoPlay) {
      // After own riichi: auto-tsumogiri the drawn tile unless there is a real
      // choice to make (tsumo / wait-preserving kan / kita pull).
      const opts = game.actionOptions(seat);
      if (actor.riichi && opts && !opts.tsumo && opts.kans.length === 0 && !opts.nuki) {
        return autoTsumogiri(actor, "リーチ中（自動ツモ切り）");
      }
      // JaneDoe で強制ツモ切りにされている: ツモ和了以外は自動でツモ切り。
      if (opts && opts.forcedTsumogiri && !opts.tsumo) return autoTsumogiri(actor, "強制ツモ切り中");
      return waitHumanTurn(seat); // 打牌/ツモ/カンの決定、または SWITCH_TO_AI
    }
    // CPU 席、またはオート観戦 ON で AI に委ねた人間席。どちらも同じ判断ルート。
    clearActions();
    // A fired ability sets abilityCutInFlag (ON_... listener) and extends the pause so it reads.
    // 直前のリーチ宣言/北抜きも同様に間を取る（能力カットインを優先）。
    const wait = abilityCutInFlag ? ABILITY_CUTIN_WAIT : riichiBeat ? RIICHI_WAIT : kitaBeat ? NAKI_WAIT : cpuDelayNow();
    await delay(wait);
    return decideDiscard(game, seat);
  },
  // 鳴き窓の全決定を返す。CPU/オート分を集め、人間が caller なら resolver 待ちで足す。
  // humanInvolved は鳴きバナー後の間合い(人間あり=200 / なし=250)の出し分けに使う。
  async decideCalls(game, callers) {
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
    if (!humanCaller) return { decisions: cpuDecisions, humanInvolved: false };
    // human is among callers: show buttons and wait for the choice.
    const hd = await waitHumanCall(humanCaller);
    const decisions = [...cpuDecisions];
    if (hd.action !== "pass") decisions.push({ index: humanCaller.index, action: hd.action, meta: hd.meta });
    else decisions.push({ index: humanCaller.index, action: "pass" });
    return { decisions, humanInvolved: true };
  },
};
let controller = LocalController; // 差し替え点（オフライン=Local / 将来=Authority/Online）

// 1手番ぶん: 決定(A)を controller から取得し、状態変更(B)はここで行う。
async function stepTurn() {
  const seat = game.turn;
  // 能力の自動発動（人間席は空配列）。発動は pump が行い、cut-in 演出が AI の wait を延ばす。
  abilityCutInFlag = false;
  for (const a of controller.decideAbilities(game, seat)) game.activateAbility(seat, a.id, a.params);
  const d = await controller.decideTurn(game, seat);
  if (d === SWITCH_TO_AI) return; // オートに切替→runHand が AI 分岐で同席を再処理
  applyTurnDecision(seat, d);
}

// 手番決定(打牌/ツモ/カン/北抜き)を実エンジンへ適用する唯一の口。CPU/人間/(将来)権威で共有。
function applyTurnDecision(seat, d) {
  if (!d) return;
  if (seat === humanIndex) noteShioriChoice(d); // 栞: 打牌が確定する直前に模範解答と突き合わせる
  if (d.type === "tsumo") { game.doTsumo(seat); return; }
  if (d.type === "kan") { game.declareKan(seat, d.kind, d.kanType); return; }
  if (d.type === "nuki") { game.nukiKita(seat); return; }
  game.discard(seat, d.tileId, d.riichi);
}

// 人間の手番: アクションUIを出し、終端アクション(打牌/ツモ/カン)が resolver を解決するまで待つ。
// 中間操作(リーチ切替/北抜き/リコール/能力選択)は resolver を解決せず showHumanActions を再描画する。
function waitHumanTurn(seat) {
  return new Promise((resolve) => {
    humanTurnResolver = resolve;
    showHumanActions();
    render(); // 手番開始時に即再描画。showHumanActions が立てた手牌コーチ等を次イベント待ちにせず反映する。
    maybePlayLuckyTsumoFx(); // 発動中なら、このツモが特別ツモであることを小演出で示す
  });
}
// 人間の手番決定を、決定 → Intent へ変換（オンライン時に権威へ送る）。
function turnIntent(d) {
  if (d.type === "tsumo") return { type: "intent.discard", action: "tsumo" };
  if (d.type === "kan") return { type: "intent.discard", action: "kan", kind: d.kind, kanType: d.kanType };
  if (d.type === "nuki") return { type: "intent.discard", action: "nuki" };
  return { type: "intent.discard", tileId: d.tileId, riichi: !!d.riichi };
}
function resolveHumanTurn(decision) {
  if (online) {
    // オンライン: ローカルに適用せず Intent を権威へ送る（結果は bus 経由で描画される）。
    if (decision === SWITCH_TO_AI) return; // オンラインではオート観戦切替なし
    // 打牌が確定する直前にだけ成立する突き合わせ（栞の答え合わせ）は、権威へ投げる前にここで。
    noteShioriChoice(decision);
    clearActions();
    online.send(turnIntent(decision));
    return;
  }
  if (!humanTurnResolver) return;
  const r = humanTurnResolver;
  humanTurnResolver = null;
  clearActions();
  r(decision);
}

const AUTO_TSUMOGIRI_DELAY = 700; // ms — long enough for the player to see what they drew
async function autoTsumogiri(actor, hintText = "リーチ中（自動ツモ切り）") {
  clearActions();
  const bar = el("action-bar");
  const hint = document.createElement("span");
  hint.style.cssText = "align-self:center;color:#f0d264;font-weight:700;font-size:14px;";
  hint.textContent = hintText;
  bar.appendChild(hint);
  // re-render to refresh highlights / hand display
  refreshHighlights();
  render();
  maybePlayLuckyTsumoFx(); // リーチ中/強制ツモ切り中でも、発動中の特別ツモは見せる
  await delay(AUTO_TSUMOGIRI_DELAY);
  clearActions();
  // 決定を返すだけ（適用は pump の applyTurnDecision）。drawnTileId は待ち明けに確定。
  return { type: "discard", tileId: actor.drawnTileId, riichi: false };
}

// ----------------------------------------------------------------- calls
// 鳴き窓: 決定(A)を controller から取得し、resolveCalls(B)と鳴きバナーぶんの間合いはここで。
// 間合いは従来の尺を踏襲（鳴き成立=NAKI_WAIT / 人間あり=200 / 人間なし=250）。
async function stepCalls() {
  const { decisions, humanInvolved } = await controller.decideCalls(game, game.pendingCalls.callers);
  meldCalledFlag = false;
  game.resolveCalls(decisions);
  await delay(meldCalledFlag ? NAKI_WAIT : humanInvolved ? 200 : 250); // pause to show naki banner
}

// 人間の鳴き選択を待つ。終端ボタン(ロン/カン/ポン/チー/スキップ)が resolver を解決する。
function waitHumanCall(humanCaller) {
  return new Promise((resolve) => {
    humanCallResolver = resolve;
    showCallActions(humanCaller);
  });
}
function resolveHumanCall(action, meta) {
  if (online) {
    // オンライン: 鳴き選択を Intent で権威へ送る（適用は権威→bus 経由で描画）。
    clearActions();
    online.send({ type: "intent.call", action, meta });
    return;
  }
  if (!humanCallResolver) return;
  const r = humanCallResolver;
  humanCallResolver = null;
  clearActions();
  r({ action, meta });
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
        // 取引の因果（河→手牌 ／ ツモ牌→河）を見せてから発動する。座標は交換前に取る。
        playRecallSwapFx(hb.tileId, actor.drawnTileId);
        recalledTileIds.add(hb.tileId);
        fireAbility(actor.index, "recall-deal", { riverTileId: hb.tileId });
        return;
      }
    }
    return; // 河以外のクリックは無視（キャンセルはボタンで）
  }

  // JaneDoe 対象選択中・大博打の賭け金選択中・ゼロ・リサーチの有効牌選択中は打牌をブロック（ボタンで選ぶ）。
  if (janeDoeMode || kakehaMode || luxMode) return;

  for (const hb of renderer.handHitboxes) {
    if (!hb.enabled) continue;
    if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
      // 一度でも牌に触れた＝コーチマークの役目は終わり。以後は二度と出さない。
      if (!handHintShown()) { markHandHintShown(); renderer.showHandCoach = false; }
      if (selectedTileId === hb.tileId) {
        // 2タップ目（同じ牌）＝打牌確定。
        const wasRiichi = riichiMode;
        riichiMode = false;
        setSelectedTile(null);
        resolveHumanTurn({ type: "discard", tileId: hb.tileId, riichi: wasRiichi });
      } else {
        // 1タップ目（または別の牌）＝選択（浮かせる）。もう一度同じ牌をタップで打牌。
        setSelectedTile(hb.tileId);
        render();
      }
      return;
    }
  }
  // 手牌の外をタップ＝選択解除（誤タップのキャンセル）。
  if (selectedTileId !== null) { setSelectedTile(null); render(); }
}

// 2タップ打牌の選択状態を更新（描画用に renderer へミラーし、ヒント文言も同期）。
function setSelectedTile(tileId) {
  selectedTileId = tileId;
  if (renderer) renderer.selectedTileId = tileId;
  updateDiscardHint();
}

// 打牌ヒントの文言（選択前/選択後・リーチ宣言牌選択中・リーチ中・リコール中で出し分け）。
function discardHintText() {
  if (recallMode) return "河から手牌へ戻す牌を選んでください（ツモ牌は河へ・ロン不可）";
  // リーチ中に手動になるのはツモ/カン/北抜きの選択があるときだけ。打牌はツモ切りに限る。
  if (game.players[game.turn]?.riichi) {
    return selectedTileId !== null ? "もう一度タップでツモ切り" : "リーチ中：ボタンで選ぶか、ツモ牌をタップしてツモ切り";
  }
  if (selectedTileId !== null) return riichiMode ? "もう一度タップでリーチ宣言（別の牌で選び直し）" : "もう一度タップで打牌（別の牌で選び直し）";
  return riichiMode ? "リーチ宣言牌をタップ → もう一度で確定" : "牌をタップして選択 → もう一度で打牌";
}

// action-bar のヒント span（あれば）を現在の選択状態に合わせて差し替える。
function updateDiscardHint() {
  const h = document.getElementById("discard-hint");
  if (h) h.textContent = discardHintText();
}

// Hovering one of YOUR OWN hand tiles previews the wait: if discarding that
// tile leaves the hand tenpai, show which tiles it would then wait on.
let lastHoverKey = null;
function onCanvasHover(ev) {
  const c = el("table");
  // only meaningful on the human's own turn to discard
  if (game.phase !== Phase.AWAIT_DISCARD || !game.players[game.turn].isHuman) {
    c.style.cursor = "";
    if (lastHoverKey !== null) { lastHoverKey = null; renderer.hoverTileId = null; renderer.setHover(null); render(); }
    return;
  }
  const rect = c.getBoundingClientRect();
  const f = clientToLocalFrac(rect, ev.clientX, ev.clientY); // handles 90° rotation
  const x = f.fx * c.width;
  const y = f.fy * c.height;

  let hit = null;
  for (const hb of renderer.handHitboxes) {
    if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) { hit = hb; break; }
  }
  // 押せる牌の上では「クリックできる」とわかるよう指カーソルに。
  c.style.cursor = hit && hit.enabled ? "pointer" : "";
  const key = hit ? hit.tileId : null;
  if (key === lastHoverKey) return; // avoid re-rendering every pixel
  lastHoverKey = key;
  // ホバー中の押せる牌をさらに持ち上げて選択候補を明示（描画は _drawHumanHand）。
  renderer.hoverTileId = hit && hit.enabled ? hit.tileId : null;

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

// 能力発動の確定。オフラインはローカル適用、オンラインはホスト(権威)へ intent.ability を送る
// （適用結果は権威の Event＋awaitDiscard 再送→showHumanActions で反映）。選択サブモードは解除。
function fireAbility(idx, abilityId, params = {}) {
  recallMode = false; janeDoeMode = false; kakehaMode = false; luxMode = false;
  if (online) {
    clearActions();
    online.send({ type: "intent.ability", abilityId, params });
    return;
  }
  // 天啓ドラ寄せ: めくる前のドラ種を控えておき、増えた1種を演出で見せる（docs §11-2-4 #1）。
  const doraBefore = abilityId === "dora-pull" ? new Set(game.wall?.doraKinds?.() || []) : null;
  game.activateAbility(idx, abilityId, params);
  showHumanActions();
  render();
  if (doraBefore) maybePlayDoraRevealFx(doraBefore);
  maybePlayLuckyTsumoFx(); // 「幸運のツモ」発動の瞬間、いまのツモ牌に特別演出
}

function showHumanActions() {
  clearActions();
  const idx = game.turn;
  // オンラインはレプリカ上で actionOptions を再計算できないため、権威が awaitDiscard で送った値を使う。
  const opts = online ? (online.opts && online.opts.options) : game.actionOptions(idx);
  if (!opts) return;

  // JaneDoe 対象選択中は専用の対象ボタンを表示する。
  if (janeDoeMode) { showJaneDoeTargets(idx); return; }
  // 大博打の賭け金選択中は専用ボタンを表示する。
  if (kakehaMode) { showKakehaBets(idx); return; }
  // ゼロ・リサーチの有効牌選択中は専用ボタンを表示する。
  if (luxMode) { showLuxCandidates(idx); return; }

  // danger marking (defensive ability) -> renderer highlights
  refreshHighlights();

  // アクションUIを組み直すたびに2タップの選択はリセット（前の手番/モードの選択を持ち越さない）。
  setSelectedTile(null);

  // 初回オンボーディング: まだ一度も自力で打牌していない人にだけ、手牌を指すコーチマークを出す。
  // リーチ宣言牌選択中・リーチ中（カン/北抜き選択）・リコール選択中・オート中は邪魔なので出さない。
  renderer.showHandCoach = !handHintShown() && !recallMode && !riichiMode && !autoPlay && !game.players[idx]?.riichi;

  const bar = el("action-bar");
  if (opts.tsumo) bar.appendChild(mkBtn("ツモ和了", "btn-tsumo", () => resolveHumanTurn({ type: "tsumo" })));
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
      resolveHumanTurn({ type: "kan", kind: k.kind, kanType: k.type });
    }));
  }
  // 北抜き (三麻): pull a North tile as nuki-dora, then act again (no turn passes).
  // resolver 経由で pump が適用→同席を再処理するので、通常時は行動UIが開き直され、
  // リーチ中は「抜いた後に選択肢が無ければ自動ツモ切り」へ自然に戻る。
  if (opts.nuki) {
    bar.appendChild(mkBtn("北抜き", "btn-kan", () => resolveHumanTurn({ type: "nuki" })));
  }

  // Ability activation buttons / indicators (発動種別ごと)。These go in the side
  // panel (#ability-bar), not the action bar, so they never cover the hand tiles.
  const abilityBar = el("ability-bar");
  // ペア戦：相方への指示ウィンドウ（自分の能力ボタンの上に常時表示）。
  renderPairCommandPanel(abilityBar);
  let luxGrayHint = false; // ゼロ・リサーチがグレーアウト中なら下のヒントを出す
  // オンラインは権威が送った abilityStatus を表示する。手動発動はテスト中は未対応（intent 化は後段）
  // ＝発動ボタンは出さずチップ表示のみ。受動能力は権威側で従来どおり効く。
  const abilityList = online ? (online.opts?.abilityStatus || []) : game.abilityStatus(idx);
  // 能力名だけだと初見は「何が起きてるか」が分からない（UXテスト指摘）。説明を native ツールチップで添える。
  const abDesc = (x) => { const d = abilityDef(x.id); return d ? `${d.name}：${d.desc}` : (x.name || ""); };
  for (const a of abilityList) {
    // visible===false の能力はボタン自体を描画しない（zero-search の1シャンテン外など）。
    if (a.visible === false) continue;
    if (a.activation === "passive") {
      const chip = mkPassiveIndicator(a);
      chip.classList.add("ability-chip", "passive");
      chip.title = abDesc(a);
      abilityBar.appendChild(chip);
    } else if (a.active) {
      const chip = mkChip(`発動中: ${a.name}`, "ability-chip active");
      chip.title = abDesc(a);
      abilityBar.appendChild(chip);
    } else {
      // remaining-count UI sits above the activation button (not inline in it).
      if (a.maxCharges !== Infinity) {
        const rc = mkChip(`${a.name}　残り ${a.charges}/${a.maxCharges}`, "ability-remain");
        rc.title = abDesc(a);
        abilityBar.appendChild(rc);
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
        // zero-search needs a target kind: enter candidate-selection mode.
        if (a.id === "zero-search") {
          luxMode = true;
          riichiMode = false;
          showHumanActions();
          render();
          return;
        }
        fireAbility(idx, a.id); // 無対象能力: 即発動（オンラインは intent.ability）
      });
      if (!a.canActivate) btn.disabled = true;
      btn.title = abDesc(a); // 何の能力かをホバーで説明（初見の「これ何？」を解消）
      // 焔「大物手の焔」は1巡目にしか張れない＝窓が開いているのは今だけ（docs §11-2-1 #4）。
      // 押せるあいだだけ脈打たせる。窓が閉じれば通常の disabled に戻る＝火が消えた合図。
      if (a.id === "homura" && a.canActivate) btn.classList.add("ability-window");
      // ゼロ・リサーチが表示中だが発動不可＝生有効牌0（グレーアウト）の合図。
      if (a.id === "zero-search" && a.visible && !a.canActivate) luxGrayHint = true;
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
  hint.id = "discard-hint";
  hint.style.cssText = "align-self:center;color:#cfe0d6;font-size:13px;margin-left:8px;";
  hint.textContent = discardHintText();
  bar.appendChild(hint);

  // ゼロ・リサーチがグレーアウト中なら「山に残っていない＝読みの材料」ヒントを添える。
  if (luxGrayHint) {
    const lux = document.createElement("span");
    lux.style.cssText = "align-self:center;color:#7fa8c9;font-size:12px;margin-left:8px;";
    lux.textContent = "有効牌は山に残っていない——読みの材料に";
    bar.appendChild(lux);
  }
}

// ゼロ・リサーチ（ルクス・ゼロ）の走査計器。素のボタン列ではなく「山を照らす計器」として
// 出す＝無機質な彼の人格そのものを操作画面にする（docs/character-ingame-fx-plan.md 2-3）。
// 候補には待ちの広さ（breadth）と山の残り枚数を数値で添える。超越帯の“誤差の一打”は
// いちど ERROR を吐いたうえで掴みにいく＝反転を演出で見せる。
function showLuxCandidates(idx) {
  clearActions();
  const list = online ? (online.opts?.abilityStatus || []) : game.abilityStatus(idx);
  const status = list.find((a) => a.id === "zero-search");
  const candidates = (status && status.candidates) || [];
  const scan = (status && status.scan) || null;
  const isFallback = !!(status && (status.isFallback || scan?.isFallback));
  const host = el("lux-scan");
  if (!host) return;
  const rowOf = (kind) => {
    const d = scan?.rows?.find((r) => r.kind === kind);
    const nums = d
      ? `<span class="lux-num">待ち <b>${d.breadth}</b>種 ／ 山に <b>${d.live}</b>枚</span>`
      : `<span class="lux-num">走査済み</span>`;
    return `<button type="button" class="lux-row" data-kind="${kind}">
        <span class="lux-tile">${kindLabel(kind)}</span>${nums}</button>`;
  };
  const remaining = scan?.liveRemaining ?? (game?.wall?.liveRemaining ?? "--");
  host.className = "lux-scan" + (isFallback ? " fallback" : "");
  host.innerHTML = `
    <div class="lux-head">
      <span class="lux-tag">LUX SCAN</span>
      <span>${isFallback ? "該当なし — 再走査" : "走査完了"}</span>
      <span class="lux-meta">残牌 ${remaining}</span>
    </div>
    ${isFallback ? `<div class="lux-err">ERROR: 聴牌を確定できる牌は、山に無い<b>——構わない。計算の外の一枚を掴む</b></div>` : ""}
    <div class="lux-rows">${candidates.map(rowOf).join("")}</div>
    <div class="lux-foot">
      <span class="lux-note">${isFallback ? "確定の保証なし・最も手が伸びる一枚" : "捕捉した牌は次のツモで確保される"}</span>
      <button type="button" class="lux-cancel">中止</button>
    </div>`;
  host.classList.remove("hidden");
  host.querySelectorAll(".lux-row").forEach((b) => b.addEventListener("click", () => {
    const kind = Number(b.dataset.kind);
    luxReserveKind = kind; // 次のツモで回収する（＝予約→回収の因果を見せる）
    fireAbility(idx, "zero-search", { targetKind: kind });
    playLuxReserveFx(kind);
  }));
  host.querySelector(".lux-cancel")?.addEventListener("click", () => {
    luxMode = false;
    showHumanActions();
    render();
  });
}
// 計器を畳む（clearActions から毎回呼ぶ＝発動・キャンセル・手番終了のいずれでも閉じる）。
function hideLuxScan() {
  const host = el("lux-scan");
  if (host && !host.classList.contains("hidden")) { host.classList.add("hidden"); host.innerHTML = ""; }
}

// 強制ツモ切り（JaneDoe）の対象選択バー。リーチ中の相手は選べない。
function showJaneDoeTargets(idx) {
  clearActions();
  const bar = el("action-bar");
  const label = document.createElement("span");
  label.style.cssText = "align-self:center;color:#f6b352;font-weight:700;margin-right:8px;";
  label.textContent = "「沈黙の処方箋」の対象を選択:";
  bar.appendChild(label);
  for (const o of game.players) {
    if (o.index === idx) continue;
    const btn = mkBtn(`${o.character.name}${o.riichi ? "（リーチ中）" : ""}`, "btn-ability", () => fireAbility(idx, "jane-doe", { targetIndex: o.index }));
    if (o.riichi) btn.disabled = true;
    bar.appendChild(btn);
  }
  bar.appendChild(mkBtn("キャンセル", "btn-skip", () => {
    janeDoeMode = false;
    showHumanActions();
    render();
  }));
}

// 大博打（賭羽ルイナ）の賭場。素のボタン列ではなく「点棒の束を卓へ押し出す」儀式にする
// （docs §11-2-2 #1）。賭け金は前払い＝選んだ瞬間に点棒（＝HP）が減るので、選ばせる前に
// 「払ったあとの手元」を見せる。持ち点が賭け金を下回る額は選べない。
const KAKEHA_BETS = [{ amount: 5000, mult: "1.5", sticks: 1 }, { amount: 10000, mult: "2", sticks: 2 }];
function showKakehaBets(idx) {
  clearActions();
  const me = game.players[idx];
  const host = el("kakeha-bet");
  if (!host) return;
  const card = (b) => {
    const afford = me.points >= b.amount;
    return `<button type="button" class="kb-card${afford ? "" : " out"}" data-bet="${b.amount}"${afford ? "" : " disabled"}>
      <span class="kb-sticks">${'<span class="kb-stick"></span>'.repeat(b.sticks)}</span>
      <span class="kb-amount">${b.amount.toLocaleString()}<i>点</i></span>
      <span class="kb-mult">アガれば ×${b.mult}</span>
      <span class="kb-after">${afford ? `払えば 手元 ${(me.points - b.amount).toLocaleString()}` : "点棒が足りない"}</span>
    </button>`;
  };
  host.innerHTML = `
    <div class="kb-head"><span class="kb-tag">大博打</span><span class="kb-hold">手元 <b>${me.points.toLocaleString()}</b></span></div>
    <div class="kb-cards">${KAKEHA_BETS.map(card).join("")}</div>
    <div class="kb-foot">
      <span class="kb-note">賭け金は前払い。アガれなければ戻らない</span>
      <button type="button" class="kb-cancel">やめる</button>
    </div>`;
  host.classList.remove("hidden");
  const hold = host.querySelector(".kb-hold");
  const holdNum = host.querySelector(".kb-hold b");
  host.querySelectorAll(".kb-card").forEach((b) => {
    const amount = Number(b.dataset.bet);
    if (me.points < amount) return;
    // ホバー/フォーカスのあいだだけ手元の数字を「払ったあと」に差し替える＝痛みを先に見せる。
    const preview = () => { if (holdNum) { holdNum.textContent = (me.points - amount).toLocaleString(); hold?.classList.add("paying"); } };
    const restore = () => { if (holdNum) { holdNum.textContent = me.points.toLocaleString(); hold?.classList.remove("paying"); } };
    b.addEventListener("mouseenter", preview);
    b.addEventListener("focus", preview);
    b.addEventListener("mouseleave", restore);
    b.addEventListener("blur", restore);
    b.addEventListener("click", () => fireAbility(idx, "kakeha-bet", { betAmount: amount }));
  });
  host.querySelector(".kb-cancel")?.addEventListener("click", () => {
    kakehaMode = false;
    showHumanActions();
    render();
  });
}
// 賭場を畳む（clearActions から毎回＝発動・キャンセル・手番終了のいずれでも閉じる）。
function hideKakehaBet() {
  const host = el("kakeha-bet");
  if (host && !host.classList.contains("hidden")) { host.classList.add("hidden"); host.innerHTML = ""; }
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
    riichiKinds: riichiKindsNow(),
    danger: currentDanger(),
    recallMode,
    best: currentBest(),
    deadKinds: luxDeadKinds, // ルクス「該当なし」告知中だけ、河の該当牌を光らせる
    recalled: recalledTileIds, // エージェント・RE: 河から手に戻した牌に諜報マーク
  });
}

// リーチ宣言牌（オンラインは権威配信値、オフラインはレプリカでない実 Game から）。
function riichiKindsNow() {
  if (!riichiMode) return null;
  if (online) return online.opts?.options?.riichiDiscards || null;
  return game.actionOptions(game.turn)?.riichiDiscards || null;
}

function currentDanger() {
  // オンラインは権威が awaitDiscard で送った危険牌情報を使う（レプリカでは dangerInfo を計算不可）。
  const info = online ? (online.opts?.danger || null) : game.abilities.dangerInfo(game.players[humanIndex]);
  if (!info) return null;
  const map = new Map();
  for (const d of info) map.set(d.kind, d.level);
  // 真守「見えていました」用に、この局で警告した最大レベルを覚えておく（局頭でリセット）。
  // 推定が当たったかどうかが返らないと、警告はただの色で終わってしまう（§8-2-3）。
  // ★手牌に実際にあった牌だけを積む：estimateDangerInfo は34種すべてを評価するので、
  //   一度も持っていない牌まで拾うと「避けられましたね」がプレイヤーの見ていない警告に対して
  //   出てしまう。手牌オーバーレイで色が付いた牌＝本人が判断した牌に限定する。
  if (mamoriWarned) {
    const inHand = new Set((game.players[humanIndex]?.hand || []).map((t) => t.kind));
    for (const [k, lv] of map) if (inHand.has(k)) mamoriWarned.set(k, Math.max(mamoriWarned.get(k) || 0, lv));
  }
  return map;
}

// ── 真守 由紀「見えていました」──────────────────────────────────────────────
// 局が終わって手が開いたとき、警告していた牌が本当に当たり牌だったときだけ静かに示す。
// 外れた局は黙る＝当てたぶんだけ「この人の目は信用できる」が積み上がる。
let mamoriWarned = null; // Map<kind, level>（局ごと。null=未対局）
// 和了結果から「見えていた一枚」を作る。橙(2)以上を警告していた牌が当たり牌だったときのみ。
function mamoriInsight(r) {
  if (!mamoriWarned || !humanHasAbility("danger-sense")) return null;
  // ツモ和了は「誰かが切った牌」ではないので対象外（セリフが切る/避けるを前提にしている）。
  if (r?.tsumo) return null;
  const kind = typeof r?.winningTile === "number" ? r.winningTile : r?.winningTile?.kind;
  if (kind == null) return null;
  if ((mamoriWarned.get(kind) || 0) < 2) return null;
  const dealtIn = r.loser === humanIndex;
  const text = vline("mamori", "insight", { dealtIn });
  if (!text) return null;
  return { text: esc(text).replace("{tile}", `<b>${esc(kindLabel(kind))}</b>`), dealtIn };
}

// 模範解答（篠宮 栞）— 牌効率トップ3の打牌候補（kind→rank）。
// オフラインは能力エンジン経由。オンラインはレプリカで能力を回さないため、自分の手牌だけから
// ローカル計算する（盤面に影響しない・相手に見えない純クライアントUIヒントなのでサーバ不要）。
function currentBest() {
  const p = game.players?.[humanIndex];
  if (!p) return null;
  const info = online ? localModelAnswer(p) : game.abilities.bestDiscards(p);
  if (!info) return null;
  const map = new Map();
  for (const b of info) map.set(b.kind, b.rank);
  return map;
}

// ── 篠宮 栞「答え合わせ」───────────────────────────────────────────────
// 模範解答は“プレイヤーを賢くする道具”なので、放っておけば誰の能力でも成立してしまう。
// だから対局のあとに一度だけ、彼女が「あなたが選んだ一打」を振り返る。取り上げるのは
// 正答率ではなく、"わたしが選ばなかった牌" を切った一打ひとつ——教える側に居続けた
// 彼女が、正解のない一打の前で立ち止まる、その入口（docs/character-ingame-fx-plan.md 2-4）。
let shioriMiss = null;        // { round, kind, top:[kind...], result } | null
let shioriReviewTimer = null; // 対局終了→答え合わせを開くまでの遅延（対局を抜けたら必ず解除する）
// 答え合わせを畳んで予約も解除する。連戦（大会の節送り・楼光の潜行・対戦ホーム復帰）は
// リロードを挟まないので、次の対局が始まる前にここで必ず後始末する。
function resetShioriReview() {
  clearTimeout(shioriReviewTimer);
  shioriReviewTimer = null;
  const host = el("shiori-review");
  if (host) { host.classList.add("hidden"); host.innerHTML = ""; }
}
function humanHasAbility(abilityId) {
  const p = game ? game.players[humanIndex] : null;
  if (!p) return false;
  // レプリカは能力インスタンスを持たないので、キャラ定義側（character.abilities）で判定する。
  if (online) return !!p.character?.abilities?.some((a) => a.abilityId === abilityId);
  return (p.abilities || []).some((a) => a.id === abilityId);
}
// 人間の打牌が決まる直前に呼び、模範解答の3手と突き合わせて「外した一打」を覚えておく。
// オート代行中の打牌は“あなたの選択”ではないので数えない。
function noteShioriChoice(d) {
  if (autoPlay || !game || !d || d.tileId == null) return;
  if (!humanHasAbility("model-answer")) return;
  // 強制ツモ切り中（JaneDoe「沈黙の処方箋」）は打牌を選べていない＝答え合わせの対象外。
  if (game.players[humanIndex]?.forcedTsumogiri > 0) return;
  const best = currentBest();
  if (!best || best.size === 0) return;
  const p = game.players[humanIndex];
  const tile = (p.hand || []).find((t) => t.id === d.tileId);
  if (!tile || best.has(tile.kind)) return;
  shioriMiss = {
    round: game.roundLabel(),
    kind: tile.kind,
    top: [...best.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k),
    result: null,
  };
}
// その一打の局がどう終わったかを紐づける（結末まで込みで振り返れるように）。
function noteShioriResult(kind) {
  if (shioriMiss && !shioriMiss.result) shioriMiss.result = kind || "none";
}
// 対局終了後に開く黒板。miss があればその一打を、無ければ「示した通りに打った日」を返す。
function showShioriReview(onClose) {
  const host = el("shiori-review");
  const c = charById("teacher") || game?.players?.[humanIndex]?.character;
  if (!host || !c) { onClose?.(); return; }
  const miss = shioriMiss;
  // 文言はマスタ（characterVoiceMaster の "review"）。cond.reviewMiss＝外した一打の有無、
  // cond.lastHandResult＝その一打を打った局の結末で分岐する。{tile} は表示側で差し替え。
  const raw = vline(c.id, "review", { reviewMiss: !!miss, lastHandResult: miss?.result || "draw" });
  if (!raw) { onClose?.(); return; }
  const tileTag = miss ? `<span class="sr-tile">${esc(kindLabel(miss.kind))}</span>` : "";
  const topTag = miss ? miss.top.map((k) => kindLabel(k)).join("・") : "";
  const line = esc(raw).split("\n").join("<br>").replace("{tile}", tileTag);
  const sub = miss ? `${esc(miss.round)}／わたしの三手：${esc(topTag)}` : "外した一打：なし";
  host.innerHTML = `
    <div class="sr-card">
      <div class="sr-portrait"></div>
      <div class="sr-body">
        <div class="sr-head">今日の答え合わせ</div>
        <div class="sr-line">${line}</div>
        <div class="sr-sub">${sub}</div>
        <button type="button" class="sr-close">ありがとうございました</button>
      </div>
    </div>`;
  // 立ち絵は相棒ボードと同じ寄せ（imagePos）で入れる＝どの画面でも同じ「彼女の顔」になる。
  const pf = host.querySelector(".sr-portrait");
  if (pf) {
    fillPortrait(pf, c);
    // この枠は縦長なので、全身立ち絵のままだと顔が小さくなる。上端基準で寄せて
    // バストアップにする（キャラ別オフセットより、この枠での見え方を優先）。
    const img = pf.querySelector("img");
    if (img) { img.style.transform = "scale(1.7)"; img.style.transformOrigin = "top center"; }
  }
  host.classList.remove("hidden");
  const close = () => { host.classList.add("hidden"); host.innerHTML = ""; onClose?.(); };
  host.querySelector(".sr-close")?.addEventListener("click", close);
}

// オンライン用ローカル計算。模範解答を持つキャラのときだけ、自分の手牌（14枚相当＝打牌局面）
// から牌効率トップ3を出す。ability の発火条件（2シャンテン以上）と揃える。
function localModelAnswer(p) {
  const hasMA = p?.character?.abilities?.some((a) => a.abilityId === "model-answer");
  if (!hasMA || !Array.isArray(p.hand)) return null;
  const counts = new Array(34).fill(0);
  for (const t of p.hand) if (t && typeof t.kind === "number") counts[t.kind]++;
  let total = 0;
  for (const n of counts) total += n;
  if (total % 3 !== 2) return null; // 打牌を決める局面（ツモ番）でのみ
  const numMelds = Array.isArray(p.melds) ? p.melds.length : 0;
  const ranked = bestDiscardRanking(counts, numMelds);
  if (!ranked.length || ranked[0].shanten < 2) return null; // イーシャンテン以下では消える
  return ranked.slice(0, 3).map((e, i) => ({ kind: e.kind, rank: i + 1 }));
}

// 模範解答（栞 Lv7+/Lv10）の卓上HUD。トップ捲り条件（comebackPlan）と押し引き判断
// （pushFoldAdvice）を左上に板書する。能力が該当Lvでないときは両者 null ＝HUDは隠れる。
// オフラインのみ（オンラインのレプリカでは能力を回さない＝栞は Lv5 想定で対象外）。
function updateModelAnswerHud() {
  const host = el("model-advice");
  if (!host) return;
  const me = !online && game ? game.players?.[humanIndex] : null;
  const plan = me ? game.abilities.comebackPlan(me) : null;
  const pf = me ? game.abilities.pushFoldAdvice(me) : null;
  if (!plan && !pf) { host.classList.add("hidden"); host.innerHTML = ""; return; }
  let html = "";
  if (plan) {
    html += `<div class="ma-block ${plan.leading ? "ma-lead" : "ma-comeback"}">` +
      `<div class="ma-title">栞の板書 — トップ捲り</div>` +
      plan.lines.map((l) => `<div class="ma-line">${l}</div>`).join("") + `</div>`;
  }
  if (pf) {
    html += `<div class="ma-block ma-pf ma-${pf.verdict}">` +
      `<div class="ma-title">押し引き</div>` +
      `<div class="ma-verdict">${pf.label}</div>` +
      `<div class="ma-reason">${pf.reason}</div></div>`;
  }
  host.innerHTML = html;
  host.classList.remove("hidden");
}

function render() {
  renderer.setHighlights({
    riichiMode,
    riichiKinds: riichiKindsNow(),
    danger: currentDanger(),
    recallMode,
    best: currentBest(),
    deadKinds: luxDeadKinds, // ルクス「該当なし」告知中だけ、河の該当牌を光らせる
    recalled: recalledTileIds, // エージェント・RE: 河から手に戻した牌に諜報マーク
  });
  renderer.render();
  updateHpBoard(); // 右側の相棒ボードのHP/手番ハイライトを最新状態に同期
  updateModelAnswerHud(); // 栞 Lv7+/Lv10 の卓上HUD（捲り条件・押し引き）を同期
  updateAbilityAura();    // 自席の持続レイヤー（姚玖の庭・春嬋の韋駄天…）を同期
  updateFieldAura();      // 場の持続レイヤー（他家由来で卓全体に効く能力＝泥中の蓮…）
  updateLuxWatch();       // ルクス「該当なし＝場に出切っている」の告知を監視
}

// ----------------------------------------------------------------- results
let winRevealTimer = null;
// 和了演出は打点tierで3段階に出し分ける。テーブル上の前演出(バナー/カットイン)を
// 見せてから中央の結果画面を開くまでの待ち時間も、tierごとに延ばす。
const WIN_CALL_WAIT = { normal: 1200, mangan: 1700, yakuman: 3900 };

// 打点tier: 役満 / 満貫〜(満貫・跳満・倍満・三倍満) / それ未満。和了画面とテーブル前演出で共用。
function winTierOf(res) {
  if (res.isYakuman || /役満/.test(res.rank || "")) return "yakuman";
  return res.rank ? "mangan" : "normal";
}
// カットインの副題に出す打点名（満貫/跳満/役満…）。安手は空。
function winRankLabel(res) {
  if (res.isYakuman) return res.rank || "役満";
  return res.rank || "";
}

function showHandResult() {
  clearActions();
  const r = game.lastResult;

  if (r.draw) {
    const overlay = el("win-overlay");
    overlay.classList.remove("hidden");
    const tenpaiNames = r.tenpai.map((t, i) => (t ? game.players[i].character.name : null)).filter(Boolean);
    // 楼光：荒牌平局のノーテン罰符（最大HPの20%・カリュブディス在卓で×3）を告知。
    let notenNote = "";
    if (pairBattleData?.isRoguelite && r.exhaustive) {
      const charybdis = (pairBattleData.chars || []).some((c) => (c?.id || "").startsWith("charybdis"));
      const pct = Math.round(ROGUELITE_NOTEN_FRAC * (charybdis ? CHARYBDIS_NOTEN_MUL : 1) * 100);
      const notenNames = r.tenpai.map((t, i) => (t ? null : game.players[i].character.name)).filter(Boolean);
      notenNote = `<div class="win-sub rl-noten-note">ノーテン罰符：${notenNames.join("、") || "なし"} が最大HPの<b>${pct}%</b>ダメージ${charybdis ? "（淵の蒐集 ×3）" : ""}</div>`;
    }
    // カリュブディスにとって流局は和了そのもの（テンパイ料3倍／流し満貫は役満）。通常の
    // 流局表示は「誰もアガらなかった」という顔をしているので、彼女が蒐集した局だけ
    // 名前を与える（docs §14-2-3 #3）。
    overlay.classList.remove("lotus-bloom"); // 前局の「蓮が咲いた」余韻を流局へ持ち越さない
    const abyssNote = abyssCollectNoteHtml(r);
    overlay.innerHTML = `
      <div class="win-card${abyssNote ? " abyss" : ""}">
        <h2 class="win-title">流局</h2>
        <div class="win-sub">テンパイ: ${tenpaiNames.join("、") || "なし"}</div>
        ${notenNote}
        ${abyssNote}
        <div class="win-buttons"></div>
      </div>`;
    maybeAbyssCollectTalk(r);
    appendNextButton(overlay.querySelector(".win-buttons"), r); // r を渡す（ノーテン罰符の適用に必要）
    return;
  }

  // Win: first show a flourish over the winner's seat, scaled to the hand's value,
  // then open the centered result screen.
  //   normal  … テロップ（ポン/カンと同系の席バナー）＋ naki SE
  //   mangan〜 … 旧カットイン（横帯＋バストアップ「ロン/ツモ」）＋「決まった！」SE
  //   yakuman … 専用の特別演出（長尺・新演出）＋ファンファーレ
  const tier = winTierOf(r.result);
  const callType = r.tsumo ? "tsumo" : "ron";
  if (tier === "yakuman") {
    audio.playFanfare();
    const res = r.result;
    const ymName = (res.yakuman && res.yakuman.length) ? res.yakuman.map((y) => y.name).join("・") : "";
    showYakumanCutIn(r.winner, callType, { title: winRankLabel(res) || "役満", name: ymName });
  } else if (tier === "mangan") {
    audio.playWinHit();
    showWinCutIn(r.winner, callType);
  } else {
    audio.playNaki();
    showWinCallFx(r.winner, callType);
  }
  setTimeout(() => {
    const overlay = el("win-overlay");
    overlay.classList.remove("hidden");
    showWinResult(overlay, r);
  }, WIN_CALL_WAIT[tier] || WIN_CALL_WAIT.normal);
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
// 和了点を動かした能力の一行（docs/character-ingame-fx-plan.md §11-3-1）。
// 文言は abilityMaster の scoreFxLabel（マスタ駆動）。「◯◯——説明」の書式は
// 前半＝大ラベル／後半＝小さい注記に分ける。ラベルの無い能力は従来の 増加!/減少! に落ちる。
// {name}＝能力の持ち主（泥中の蓮のような場能力は他家のこともあるので seat で引く）。
function scoreFxParts(step) {
  const fallback = step.dir === "up" ? "増加！" : "減少！";
  const raw = step.abilityId ? abilityDef(step.abilityId).scoreFxLabel?.[step.dir] : null;
  if (!raw) return { head: fallback, note: "" };
  const owner = game?.players?.[step.seat]?.character?.name || "";
  if (raw.includes("{name}") && !owner) return { head: fallback, note: "" };
  const [head, note = ""] = raw.replace("{name}", owner).split("——");
  return { head, note };
}

// scoreFx の一行を描く。show=true は「スキップで最終ステップへ飛ばす」ときの焼き付け。
function paintScoreFx(fxEl, step, show) {
  const { head, note } = scoreFxParts(step);
  fxEl.innerHTML = note ? `${head}<span class="win-score-note">${note}</span>` : head;
  const long = [...head].length > 7 ? " is-long" : "";
  fxEl.className = `win-score-fx ${step.dir === "up" ? "up" : "down"}${long}${show ? " show" : ""}`;
}

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
  const rankTier = winTierOf(res);
  const bigRank = res.isYakuman ? (res.rank || "役満")
    : res.rank ? res.rank : `${res.totalHan || 0}飜`;

  const detailText = `${res.fu ? res.fu + "符 " : ""}${res.totalHan ? res.totalHan + "飜" : ""}`.trim();
  // 本体点（res.total）と、供託・本場込みの実収支（deltas）。違えば括弧で併記。
  const winnerGain = (r.deltas && r.deltas[r.winner]) || res.total;
  const subText = winnerGain && winnerGain !== res.total ? `(${winnerGain})` : "";

  // 泥中の蓮が咲いた局＝安手がいちばん綺麗に見える瞬間（§11-2-3 #4）。花は誰が咲かせても出す。
  maybeLotusBloomFx(overlay, r, res);

  // 能力で和了点が増減したとき: 先に素点を出し、増加!/減少! を挟んで改変後へ動かす。
  const scoreFx = r.scoreFx && r.scoreFx.steps && r.scoreFx.steps.length ? r.scoreFx : null;
  const initialScore = scoreFx ? scoreFx.baseTotal : res.total;

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
            <div class="win-score hidden" id="win-score">${initialScore}<span class="win-pt">点</span></div>
            <div class="win-score-fx hidden" id="win-score-fx"></div>
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

  // 増加!/減少! を順に再生してから sub と次へボタンを出す。
  const revealSub = () => {
    const sub = el("win-score-sub");
    if (sub) { sub.classList.remove("hidden"); sub.classList.add("pop"); }
  };

  const playScoreFx = (steps, done) => {
    const fxEl = el("win-score-fx");
    const scoreEl = el("win-score");
    let i = 0;
    let doneCalled = false;
    const complete = () => {
      if (doneCalled) return;
      doneCalled = true;
      clearTimeout(winRevealTimer); winRevealTimer = null;
      // 最終値とラベルは出したまま残す（増加!/減少! の余韻＝報酬感）。スキップで途中から
      // 飛んでもここで最後のステップを焼き付ける。
      const last = steps[steps.length - 1];
      if (scoreEl && last) scoreEl.innerHTML = `${last.to}<span class="win-pt">点</span>`;
      if (fxEl && last) paintScoreFx(fxEl, last, true);
      done();
    };
    const stepOne = () => {
      if (i >= steps.length) { complete(); return; }
      const s = steps[i++];
      const up = s.dir === "up";
      if (scoreEl) {
        scoreEl.innerHTML = `${s.to}<span class="win-pt">点</span>`;
        scoreEl.classList.remove("pop"); void scoreEl.offsetWidth; scoreEl.classList.add("pop");
      }
      if (fxEl) {
        paintScoreFx(fxEl, s, false);
        void fxEl.offsetWidth; fxEl.classList.add("show");
      }
      audio.playPip?.(up ? 2600 : 360, up ? 0.45 : 0.5);
      winRevealTimer = setTimeout(stepOne, 1150);
    };
    // 素点が出てひと呼吸おいてから増減を見せる。スキップで即・最終値へ。
    btnBox.innerHTML = "";
    const fxSkip = mkBtn("スキップ", "btn-skip", complete);
    fxSkip.classList.add("skip-reveal");
    btnBox.appendChild(fxSkip);
    winRevealTimer = setTimeout(stepOne, 650);
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
    // 役満／満貫ランクと「素点」をドンと出す（scoreFx 時は素点、無ければ最終点）。
    for (const id of ["win-rank", "win-score"]) {
      const node = el(id);
      if (node) { node.classList.remove("hidden"); node.classList.add("pop"); }
    }
    // Winner's tsumo/ron voice (falls back to the 金額表示 SE when no clip).
    audio.playVoice(winner.character.id, r.tsumo ? "tsumo" : "ron");
    btnBox.innerHTML = "";
    if (scoreFx) {
      // 素点 → 増加!/減少! → 改変後。演出後に sub と次へボタン。
      playScoreFx(scoreFx.steps, () => { revealSub(); appendNextButton(btnBox, r); });
    } else {
      revealSub();
      appendNextButton(btnBox, r);
    }
  };

  const skipBtn = mkBtn("スキップ", "btn-skip", finishReveal);
  skipBtn.classList.add("skip-reveal");
  btnBox.appendChild(skipBtn);

  winRevealTimer = setTimeout(revealOne, 400);
}

// 局終わり時点の「卓上の順位」を生スコア(=HP)から組む。追撃モーダルに渡し、他グループの点数・自分の
// 順位・いま追撃をやめたら何が起きるか（突破 or 着卓ペナルティ）をユーザーに提示するための土台。
//   pairBattleData.hp は局中つねに game.players[].points と同期済み（＝ライブ点数）。
function rogueliteTableStandings(run) {
  const pb = pairBattleData;
  if (!pb || !pb.pairs || !pb.chars) return null;
  const { pairs, pairOf, chars, hp, solo, tableSize } = pb;
  const myPair = pairOf?.[humanIndex] ?? pairOf?.[0] ?? 0;
  const scoreOf = (pid) => pairs[pid].seats.reduce((a, s) => a + Math.max(0, hp[s] ?? 0), 0);
  const fullOf  = (pid) => pairs[pid].seats.reduce((a, s) => a + (chars[s]?.stats?.startingPoints || 0), 0);
  const groups = pairs.map((p, pid) => ({
    pid, isAlly: pid === myPair, score: scoreOf(pid), fullScore: fullOf(pid),
    members: [...p.seats].sort((a, b) => (hp[b] ?? 0) - (hp[a] ?? 0)).map((s) => ({
      char: chars[s], name: chars[s]?.name || "?", color: chars[s]?.color || "#888",
      hp: Math.max(0, Math.round(hp[s] ?? 0)), down: (hp[s] ?? 0) <= 0,
    })),
  }));
  // 順位は「自分より厳密に点が多いグループ数+1」（同点は上位扱い＝ソロ着順ペナルティの strict-greater と一致）。
  for (const g of groups) g.rank = 1 + groups.reduce((a, o) => a + (o.score > g.score ? 1 : 0), 0);
  const ally = groups.find((g) => g.isAlly) || groups[0];
  const allyRank = ally?.rank || 1;
  // いま「やめる」と確定する結末＝onRogueliteBattleEnd と同一判定。
  //   ソロ(三麻/二麻)＝着順ペナルティ表 / ペア(四麻)＝合計HPで競り負けたら20%。1位/上回り=無傷の突破。
  let penaltyFrac = 0;
  if (solo) penaltyFrac = ROGUELITE_SOLO_PENALTY[tableSize]?.[allyRank] || 0;
  else {
    const enemyScore = groups.filter((g) => !g.isAlly).reduce((a, g) => a + g.score, 0);
    penaltyFrac = (ally?.score ?? 0) < enemyScore ? ROGUELITE_HP_LOSS_PENALTY_FRAC : 0;
  }
  const behind = penaltyFrac > 0;
  const warded = behind && hasHpRaceSaver(run); // 護符を持っていれば身代わりに割れて痛手を防ぐ（予告）
  return { mode: solo ? "solo" : "pair", solo, groups, allyRank, groupCount: groups.length,
           penaltyFrac, penaltyPct: Math.round(penaltyFrac * 100), behind, warded };
}

// 楼光の館・局終わりの追撃モーダル（インゲーム）。同卓・HPを引き継いで次局へ進むか確認する。
// onPursue=次局へ／onStop=この対局を締める（戦果確定）。次局のラベル（東2局…）は game から取る。
function promptRoguelitePursueInGame(onPursue, onStop) {
  const run = rogueliteState?.run;
  if (!run) { onPursue?.(); return; }
  const lead = rlLead();
  const standings = rogueliteTableStandings(run);
  // ボスの卓（2026-07-11）＝勝ち抜くまで終わらない。劣勢での「やめる」は素通りでなく
  // 撤退＝ラン終了（全滅と同じ重さ・持ち帰り無し）。フラグを立てて onRogueliteBattleEnd が引き取る。
  const bossRule = rogueliteState?.floorType?.enemy === "boss";
  const stop = (bossRule && standings?.behind)
    ? () => { rogueliteState.bossYield = true; onStop?.(); }
    : onStop;
  showRoguelitePursue(el("game-screen"), {
    floor: run.floor,
    nextLabel: game?.roundLabel?.() || "次局",
    run, charImages,
    standings,
    bossRule,
    leadChar: lead,
    leadLine: lead ? vline(lead.id, "rlPursue", rlVoiceCtx()) : null,
    onPursue, onStop: stop,
  });
}

function appendNextButton(box, r) {
  const deltas = game.lastResult && game.lastResult.deltas; // capture before next hand
  const proceed = () => {
    if (game.isGameOver()) {
      if (online) online.send({ type: "intent.ack" }); // 権威の run() を終了させる
      showGameOver();
      return;
    }
    showPointFx(deltas); // animate +N / -N over the table
    if (online) {
      online.send({ type: "intent.ack" }); // 権威が次局を開始 → bus で描画
      // ① 局間待ち：自分は次局へ進める状態だが、他家の ack 待ちで開始が遅れることがある。
      // 3秒来なければ「通信待機中…」を出し、次局(handStarted)受信で引っ込める。
      clearTimeout(ackWaitTimer);
      ackWaitTimer = setTimeout(() => { if (online && !game.gameOver) showOnlineWaitToast(); }, ACK_WAIT_DELAY);
      return;
    }
    // 楼光の館：局終わりに「このまま追撃するか（同卓・HP継続で次局へ）」を確認。
    // 続行＝次局へ／やめる＝この対局をここで締める（戦果を確定→踏破処理）。局数上限/トビ時は
    // すでに game.isGameOver()＝true で上の分岐に入るため、ここに来るのは「まだ追撃できる」局終わりだけ。
    if (pairBattleData?.isRoguelite && honestCtx?.isRoguelite && rogueliteState?.run) {
      promptRoguelitePursueInGame(() => startNextHand(), () => { game.gameOver = true; showGameOver(); });
      return;
    }
    startNextHand();
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
      applyRogueliteNotenPenalty(r); // 楼光：荒牌平局のノーテン罰符＝HPダメージ（カリュブディス3倍）
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

// Big "北" banner near the puller's seat — 北抜き(三麻)もポン/チー同様の発声感で見せる。
function showKitaFx(playerIndex) {
  showSeatCall(playerIndex, "北", "naki-call kita-call");
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

// 席バナー1枚を host に出す（pos は画面上の left/top）。ゲームの席演出と
// デバッグプレビューの両方で使う。
function spawnCall(host, pos, text, className, ttl = 1400) {
  if (!host) return;
  const e = document.createElement("div");
  e.className = className;
  e.textContent = text;
  e.style.left = pos.left;
  e.style.top = pos.top;
  host.appendChild(e);
  requestAnimationFrame(() => e.classList.add("show"));
  setTimeout(() => e.remove(), ttl);
}
function showSeatCall(playerIndex, text, className) {
  spawnCall(el("naki-fx"), SEAT_FX_POS[visualSeat(playerIndex)], text, className);
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

// 任意テキストの単発スピーカー（マスタ非経由）。event に紐づかない一度きりの台詞——
// キャラ同士の掛け合いなど——に使う。表示先・畳み方は showTransientSpeaker と同じ。
function showSpeakerText(character, text, { side = "left", duration = 2800 } = {}) {
  const host = el("speaker-fx");
  if (!host || !character || !text) return;
  clearTimeout(speakerFxTimer);
  host.innerHTML = "";
  const sp = buildSpeakerEl(character, text, side);
  host.appendChild(sp);
  requestAnimationFrame(() => sp.classList.add("show"));
  speakerFxTimer = setTimeout(() => {
    sp.classList.remove("show");
    setTimeout(() => { if (sp.parentNode === host) host.removeChild(sp); }, 360);
  }, duration);
}

// 焔「大物手の焔」を張った局に、満貫へ届きそうにない形で聴牌したときだけ一言（§11-2-1 #2）。
// 満貫未満で和了ると点数が固定される賭けなので、これは「安手で和了るな」という圧＝押し引きが
// 変わる。判定は火柱ゲージと同じ燃料の数え方（homuraHeat）を使う＝卓上の絵と言葉が食い違わない。
const FLAME_WEAK_MAX = 2; // 燃料これ以下＝満貫は遠い
function maybeFlameWeakTalk() {
  if (!game || !humanAbilityActive("homura")) return;
  const me = game.players[humanIndex];
  if (!me || homuraHeat(me) > FLAME_WEAK_MAX) return;
  const text = vline(me.character.id, "flameWeak", {});
  if (text) setTimeout(() => showSelfTalk(text), 1100); // 聴牌の一言と重ねない
}

// 沼田 蓮「泥中の蓮」が咲いた瞬間＝3ハン以下の安手が泥をすり抜けて実った局（§11-2-3 #4#5）。
// 本作でいちばん地味な手に、いちばん綺麗な絵を当てる＝派手さの反転。花は誰が咲かせても出し、
// 言葉は自席のときだけ返す（局中セリフの作法どおり）。
function maybeLotusBloomFx(overlay, r, res) {
  if (!overlay) return;
  overlay.classList.remove("lotus-bloom"); // 前の和了の余韻を持ち越さない（連戦で咲きっぱなしにしない）
  if (!game || !res || res.isYakuman) return;
  if ((res.totalHan ?? 0) > 3) return; // 泥の対象外＝蓮が咲く条件（cheapHanMax）と同じ
  const winner = game.players[r.winner];
  const hasLotus = (winner?.character?.abilities || []).some((a) => a.abilityId === "muddy-lotus");
  if (!hasLotus) return;
  overlay.classList.add("lotus-bloom");
  if (r.winner !== humanIndex) return;
  const text = vline(winner.character.id, "lotusBloom", {});
  if (text) setTimeout(() => showSpeakerText(winner.character, text, { duration: 3200 }), 900);
}

// ── 賭けの落とし前（docs/character-ingame-fx-plan.md §11-3-3）──────────────
// ギャンブラーは構造上、半分は外れる。外れた局が無演出だと「点棒を損しただけ」で終わって
// しまうので、張った局が実らなかったときだけ、次の局の頭でそのキャラの言葉を一度返す。
// アガった局には何も出さない＝配当は和了画面の一行（abilityMaster.scoreFxLabel）が受け持つ。
// 文言は characterVoiceMaster の "betLost"（cond.lastHandResult で結末ごとに出し分け）。
let betLostPending = null; // { charId, result }｜null
function noteBetOutcome(result) {
  betLostPending = null;
  if (!game || result === "agari") return;
  const me = game.players[humanIndex];
  if (!me) return;
  // 何を張っていたかはキャラごとに違う（点棒／火／めくったドラ）。どれか1つでも乗っていれば賭けた局。
  const staked = (humanAbilityStatus("kakeha-bet")?.pot?.bet || 0) > 0
    || (humanAbilityStatus("dora-pull")?.dora?.stacked || 0) > 0
    || humanAbilityActive("homura");
  if (staked) betLostPending = { charId: me.character.id, result };
}
// 局頭で消化する。出したら true（＝通常の局頭セリフは出さない）。
function fireBetLostTalk() {
  const pending = betLostPending;
  betLostPending = null;
  if (!pending || !game) return false;
  const me = game.players[humanIndex];
  if (!me || me.character.id !== pending.charId) return false;
  // 第三者どうしの決着（自分は無関係に局が終わった）は deriveHandResult が null を返す。
  // 賭けは流れているので "draw"（＝実らないまま局が流れた）として扱う＝栞の答え合わせと同じ救済。
  const text = vline(me.character.id, "betLost", { lastHandResult: pending.result || "draw" });
  if (!text) return false;
  showSpeakerText(me.character, text, { duration: 3200 });
  return true;
}

// ── 卓上の掛け合い ────────────────────────────────────────────────────────
// 同卓の2人が互いに向けた口上（"tableBanter"）と返し（"tableBanterReply"）をマスタに
// 持っているとき、東1局に一度だけ一往復を交わす。文言は characterVoiceMaster 側にあり、
// ここは「誰と誰が・いつ喋るか」だけを決める（楼光のボス口上 rlBossIntroPair と同じ形）。
// どちらが人間側かに関係なく出す＝「誰と打っているかで卓の景色が変わる」（固有性）。
// 現状の実装は姚玖×春嬋（先代の養子＝庭番の兄妹・world.md §12）。
let tableBanterDone = false;
function maybeTableBanter() {
  if (tableBanterDone || !game) return;
  const chars = game.players.map((p) => p.character).filter(Boolean);
  for (const a of chars) {
    for (const b of chars) {
      if (a === b) continue;
      const open = vline(a.id, "tableBanter", { pairWith: b.id });
      const reply = open && vline(b.id, "tableBanterReply", { pairWith: a.id });
      if (!open || !reply) continue;
      tableBanterDone = true;
      // 局頭の自分のひと言(1200ms)・相方相槌(2200ms)と重ならないよう後ろへずらす。
      setTimeout(() => showSpeakerText(a, open, { side: "left", duration: 2500 }), 2900);
      setTimeout(() => showSpeakerText(b, reply, { side: "right", duration: 2800 }), 5600);
      return;
    }
  }
}

// その席が何で守ったか（表示名・見た目・勝者へ渡す一文）をキャラの能力定義から引く。
// レプリカでも読める静的マスタ（character.abilities）だけを見る＝対人戦でも動く。
function guardDefOfSeat(i) {
  for (const a of game?.players?.[i]?.character?.abilities || []) {
    const def = abilityDef(a.abilityId);
    if (def.guardLabel) return def;
  }
  return null;
}
// カリュブディスが流局で蒐集した局の一行（誰が蒐集したかは公開情報＝点棒の動き）。
function abyssCollectSeat(r) {
  const list = game?.players || [];
  for (let i = 0; i < list.length; i++) {
    const has = (list[i].character?.abilities || []).some((a) => a.abilityId === "abyss-collection");
    if (has && ((r?.deltas && r.deltas[i]) || 0) > 0) return i;
  }
  return -1;
}
function abyssCollectNoteHtml(r) {
  // 楼光の館だけは流局の精算が別経路（applyRogueliteNotenPenalty＝最大HPの%ベース）で、
  // ここで見える deltas（標準エンジンの3000点プール）は捨てられる値。桁も違うので数字を
  // 出すと嘘になる。楼光は既存の rl-noten-note が「淵の蒐集 ×3」まで説明しているので、
  // そちらへ一本化する（セリフだけは数字を含まないので出す）。
  if (pairBattleData?.isRoguelite) return "";
  const i = abyssCollectSeat(r);
  if (i < 0) return "";
  const gain = r.deltas[i];
  return `<div class="win-sub abyss-collect">淵の蒐集 — ${esc(game.players[i].character.name)} が <b>+${gain}</b> を蒐集した</div>`;
}
// 蒐集した局の一言（自席のときだけ＝局中セリフの作法）。彼女にとってこれは勝ち名乗り。
function maybeAbyssCollectTalk(r) {
  const i = abyssCollectSeat(r);
  if (i < 0 || i !== humanIndex) return;
  const c = game.players[i].character;
  const text = vline(c.id, "abyssCollect", {});
  if (text) setTimeout(() => showSpeakerText(c, text, { duration: 3200 }), 700);
}

// 呪い（暗黒星）側のマスタ引き。守りの鏡像なので同じ形で持つ。
function curseDefOfSeat(i) {
  for (const a of game?.players?.[i]?.character?.abilities || []) {
    const def = abilityDef(a.abilityId);
    if (def.curseLabel) return def;
  }
  return null;
}
// 「呪いに呑まれた」説明（呪われた席ごとに1行）。膨らんだ痛みは誰の取り分にもならず消えるので、
// これが無いと「なぜこの席だけ倍も減っているのか」が分からない（§14-2-1）。
function curseNotesHtml(r) {
  return (r?.curses || []).map((c) => {
    const def = curseDefOfSeat(c.seat);
    if (!def?.curseNote || !(c.extra > 0)) return "";
    return `<div class="dmg-blocked-note is-curse">${esc(def.curseNote)}<span>−${c.extra}</span></div>`;
  }).join("");
}
// 「守りに阻まれた」説明（守った席ごとに1行）。守られたぶんは勝者の取り分からも引かれるので、
// これが無いと「満貫をロンしたのに点が入らない」＝バグに見える（§8-3-2）。個人戦・団体戦・
// ペア戦・楼光の館のいずれの被ダメ演出でも同じ文言を出す。
function guardBlockedNotesHtml(r) {
  // 凌雲とビビが同じ局で同時に守ることもある（ツモは支払者が複数）。合算1行だと内訳と
  // 食い違うので、守った席ごとに1行ずつ出す。
  return (r?.guards || []).map((g) => {
    const def = guardDefOfSeat(g.seat);
    if (!def?.guardNote || !(g.blocked > 0)) return "";
    return `<div class="dmg-blocked-note">${esc(def.guardNote)}<span>−${g.blocked}</span></div>`;
  }).join("");
}

// RPG-style HP/damage sequence shown after the 和了 card (points = HP). Lists the
// winner + every player whose points changed, drains the losers' HP gauges with a
// shake/flash and a floating -N, heals the winner (+N). セリフを読み切れるよう、
// クリック or 10秒で次へ進む。`onDone` runs once when the sequence finishes.
let damageFxTimer = null;
// 楼光の館：合計HP敗北ペナルティの被弾演出。インゲームのダメージカード（showDamageFx）と同じ
// #damage-overlay / .dmg-* 語彙を流用し、パーティ全員のHPバーを一斉にドレイン＋赤い被ダメ数字＋
// 撃沈スタンプ＋揺れ＋SE。閉じる（クリック or 自動）と onDone。data確定は呼び出し側が onDone で行う。
function showRoguelitePenaltyFx({ targets = [], onDone } = {}) {
  const host = el("damage-overlay");
  if (!host || !targets.length) { onDone?.(); return; }
  const fillClsFor = (pct) => (pct <= 25 ? "low" : pct <= 50 ? "mid" : "high");
  const rowHtml = (t, idx) => {
    const c = t.m.char;
    const before = Math.round(t.before), after = Math.round(t.after);
    const delta = after - before; // 負値（被ダメ）
    const busted = after <= 0;
    const bPct = Math.max(0, Math.min(100, (before / (t.m.hpMax || 1)) * 100));
    const iconUrl = charImages?.url?.(c, "icon") || charImages?.url?.(c, "portrait");
    const face = faceMarkup(c, "dmg-face", iconUrl)
      || `<div class="dmg-face dmg-face-fb" style="--c:${c?.color || "#888"}">${[...(c?.name || "?")][0] || "?"}</div>`;
    return `
      <div class="dmg-row is-loser${busted ? " is-down" : ""}" data-i="${idx}" data-before="${before}" data-after="${after}" data-max="${t.m.hpMax}">
        ${face}
        <div class="dmg-info">
          <div class="dmg-name" style="color:${c?.color || "#ccc"}">${c?.name || "?"}</div>
          <div class="hpbar">
            <div class="hpfill-ghost" style="width:${bPct}%"></div>
            <div class="hpfill ${fillClsFor(bPct)}" style="width:${bPct}%"></div>
          </div>
        </div>
        <div class="dmg-hp"><span class="dmg-hp-num">${before}</span></div>
        <div class="dmg-pop hit">${delta}</div>
        ${busted ? `<div class="dmg-down-stamp">撃沈</div>` : ""}
      </div>`;
  };
  host.innerHTML = `
    <div class="dmg-card rl-pen-card">
      <div class="dmg-head rl-pen-head">競り負け — 被弾</div>
      <p class="rl-pen-sub">合計HPで及ばず、パーティ全員が痛手を負った。</p>
      ${targets.map(rowHtml).join("")}
      <div class="dmg-hint">クリックで次へ</div>
    </div>`;
  host.classList.remove("hidden");
  requestAnimationFrame(() => host.classList.add("show"));
  let finished = false; let timer = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    host.onclick = null;
    host.classList.remove("show", "ko");
    host.classList.add("hidden");
    host.innerHTML = "";
    onDone?.();
  };
  // ひと呼吸おいて一斉ドレイン。
  setTimeout(() => {
    audio.playSe(sePath("ボウリングのピンを倒す1.mp3"), 0.9);
    host.querySelectorAll(".dmg-row").forEach((row) => {
      const before = +row.dataset.before, after = +row.dataset.after, max = +row.dataset.max;
      const aPct = Math.max(0, Math.min(100, (after / (max || 1)) * 100));
      const fillEl = row.querySelector(".hpfill");
      fillEl.style.width = aPct + "%";
      fillEl.className = "hpfill " + fillClsFor(aPct);
      const ghost = row.querySelector(".hpfill-ghost");
      setTimeout(() => { ghost.style.width = aPct + "%"; }, 430); // 削れる残像が追いつく
      row.classList.add("flash");
      const busted = after <= 0;
      if (!busted) row.classList.add("shake");
      row.querySelector(".dmg-pop")?.classList.add("show");
      tweenNum(row.querySelector(".dmg-hp-num"), before, after, 850);
      if (busted) {
        setTimeout(() => {
          row.classList.add("downed");
          row.querySelector(".dmg-down-stamp")?.classList.add("show");
          host.classList.add("ko");
          audio.playSe(sePath("布団に倒れ込む.mp3"), 1.0);
        }, 620);
      }
    });
  }, 300);
  // 直前クリックの流れ込みを避け、少し待ってから受付。自動でも閉じる。
  setTimeout(() => { host.onclick = finish; }, 700);
  timer = setTimeout(finish, 6500);
}

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

  // 守りで失点が軽減された席（琥珀の盾・身代わり人形）。点棒が動かないぶん deltas には
  // 出ないので、ここを見て「守り切った席」も演出に出す（docs/character-ingame-fx-plan.md §8-3-1）。
  const guards = r.guards || [];
  const guardOf = (i) => guards.find((g) => g.seat === i) || null;
  // 呪いで失点が膨らんだ席（暗黒星）。守りの鏡像＝「本来いくらだったか」を先に見せてから、
  // 呑まれて深くなる（§14-2-1）。倍化ぶんは誰の取り分にもならず消える。
  const curses = r.curses || [];
  const curseOf = (i) => curses.find((c) => c.seat === i) || null;

  // Winner first, then anyone whose points moved (losers / tsumo payers) — 加えて、
  // 点棒は動かなかったが守り切った席も。守備キャラの見せ場がここにしか無い。
  const order = [r.winner];
  game.players.forEach((p, i) => { if (i !== r.winner && (deltas[i] || guardOf(i))) order.push(i); });

  const rowHtml = (i) => {
    const c = game.players[i].character;
    const after = game.players[i].points;
    const delta = deltas[i] || 0;
    const before = after - delta;
    const isWin = i === r.winner;
    const guard = !isWin ? guardOf(i) : null;
    const busted = !isWin && after < 0; // 持ち点マイナス＝トビ（撃沈）
    const b = vis(before, i); // 開始時の見た目（周回対応）。ドレインで after の見た目へ動かす。
    const iconUrl = charImages.url(c, "icon") || charImages.url(c, "portrait");
    const face = faceMarkup(c, "dmg-face", iconUrl)
      || `<div class="dmg-face dmg-face-fb" style="--c:${c.color}">${[...c.name][0] || "?"}</div>`;
    // 守り切った席は「回避された未来」を先に見せる：本来の失点が突き刺さり、守りの膜に
    // 呑まれて砕け、実際の増減（0 か軽減後）だけが残る。
    const gDef = guard ? guardDefOfSeat(i) : null;
    const gKind = gDef?.guardStyle || "amber";
    // 呪われた席は守りの鏡像：本来の失点を先に出し、星に呑まれて深い数字へ膨らむ。
    const curse = !isWin ? curseOf(i) : null;
    const cDef = curse ? curseDefOfSeat(i) : null;
    const cKind = cDef?.curseStyle || "star";
    return `
      <div class="dmg-row ${isWin ? "is-win" : "is-loser"}${busted ? " is-down" : ""}${guard ? " is-guard" : ""}${curse ? " is-cursed" : ""}" data-i="${i}" data-before="${before}" data-after="${after}">
        ${face}
        <div class="dmg-info">
          <div class="dmg-name" style="color:${c.color}">${c.name}${guard ? `<span class="dmg-guard-tag ${gKind}">${esc(gDef?.guardLabel || "守り")}</span>` : ""}${curse ? `<span class="dmg-curse-tag ${cKind}">${esc(cDef?.curseLabel || "呪い")}</span>` : ""}</div>
          <div class="hpbar">
            <div class="hpfill-base" style="width:${b.basePct}%${b.baseBg ? `;background:${b.baseBg}` : ""}"></div>
            <div class="hpfill-ghost" style="width:${b.fillPct}%"></div>
            <div class="hpfill ${b.fillCls}" style="width:${b.fillPct}%${b.fillBg ? `;background:${b.fillBg}` : ""}"></div>
          </div>
        </div>
        <div class="dmg-hp"><span class="dmg-hp-num">${before}</span></div>
        ${guard ? `<div class="dmg-pop guard-raw">${guard.raw}</div><div class="dmg-guard-veil ${gKind}"></div>` : ""}
        ${curse ? `<div class="dmg-pop curse-raw">${curse.raw}</div><div class="dmg-curse-veil ${cKind}"></div>` : ""}
        <div class="dmg-pop ${isWin ? "heal" : "hit"}${guard ? " guard-kept" : ""}">${delta > 0 ? "+" : ""}${delta}</div>
        ${busted ? `<div class="dmg-down-stamp">撃沈</div>` : ""}
      </div>`;
  };

  // 勝った側への一行：守られたぶんは勝者の取り分からも引かれる（_settle）。説明が無いと
  // 「満貫をロンしたのに点が入らない」＝バグに見える（§8-3-2）。
  const blockedNote = guardBlockedNotesHtml(r) + curseNotesHtml(r);
  // 真守「見えていました」：警告した牌が実際に当たり牌だったときだけ、局の終わりに一言。
  const insight = mamoriInsight(r);
  const insightNote = insight
    ? `<div class="dmg-insight${insight.dealtIn ? " missed" : ""}">${insight.text}</div>`
    : "";

  host.innerHTML = `
    <div class="dmg-card">
      <div class="dmg-head">${r.tsumo ? "ツモ和了" : "ロン和了"} — ダメージ</div>
      ${order.map(rowHtml).join("")}
      ${blockedNote}
      ${insightNote}
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
    // 呪いで失点が膨らんだ局は、被弾そのものより「倍になったこと」が事件なので専用の一言に
    // 差し替える（§14-2-1）。持たないキャラは vline が null を返すので damage に落ちる。
    spEvent = curseOf(humanIndex) && vline(human.character.id, "curseHit", {}) ? "curseHit" : "damage";
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
      // 守り切った席：「本来の失点 → 守りの膜が呑む → 実際の増減」を重ねて見せる
      // （回避された未来を一度だけ実体化させる／§8-1）。揺らさない＝受け止めた。
      // ★ここで return してはいけない。凌雲の超越帯（stripMitigation>0）は「盾が剥がれつつ
      //   半額だけ受ける」＝軽減はされたが実損がある状態で、ゲージ更新もトビ演出も必要になる。
      const g = guardOf(i);
      if (g) {
        row.classList.add("flash");
        row.querySelector(".dmg-pop.guard-raw")?.classList.add("show");
        const isDoll = !!row.querySelector(".dmg-guard-veil.doll");
        setTimeout(() => {
          row.classList.add("guarding");
          audio.playSe(sePath(isDoll ? "紙を破く1.mp3" : "和太鼓でドドン.mp3"), 0.8);
        }, 360);
        setTimeout(() => row.querySelector(".dmg-pop.guard-kept")?.classList.add("show"), 780);
      }
      // 呪われた席：「本来の失点 → 星に呑まれる → 膨らんだ実失点」＝守りの鏡像（§14-2-1）。
      // 守りと違って揺れは殺さない（受け止めたのではなく、人の倍だけ深く受けたから）。
      const cu = curseOf(i);
      if (cu) {
        row.querySelector(".dmg-pop.curse-raw")?.classList.add("show");
        setTimeout(() => {
          row.classList.add("cursing");
          audio.playSe(sePath("和太鼓でドドン.mp3"), 0.75);
        }, 360);
      }
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
      // 守り切った席は揺らさない（受け止めた）。数字も guard-kept 側で出すのでここでは触らない。
      if (i !== r.winner && !busted && !g) row.classList.add("shake");
      // 呪い行は `.dmg-pop` が2つ（本来の失点＝curse-raw と実失点）あるので明示して取る。
      // 実失点は「本来の数字を見せてから」遅らせて出す＝膨らんだことが読める。
      if (!g) {
        const popEl = row.querySelector(cu ? ".dmg-pop.hit" : ".dmg-pop");
        if (cu) setTimeout(() => popEl?.classList.add("show"), 720);
        else popEl?.classList.add("show");
      }
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
      ${guardBlockedNotesHtml(r)}
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
    updateHpBoard(); // 右側の相棒ボードのHPバーも即同期（ダメージカードと同時に動く）
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
  // ペア戦：相方（自ペアの非人間席）が自分で和了したら、相棒ボードの吹き出しで一言。
  // 相棒の存在感＝「一緒に戦っている」手触り（楼光の館の編成＝相棒選びの意味づけ）。
  if (pairBattleData) {
    const myPair = pairBattleData.pairOf[humanIndex];
    const partnerSeat = pairBattleData.pairs[myPair].seats.find((s) => s !== humanIndex);
    if (partnerSeat != null && r.winner === partnerSeat) {
      const pline = vline(pairBattleData.chars[partnerSeat].id, "agari", { isYakuman: !!r.result.isYakuman, score: r.result.total });
      if (pline && !pline.startsWith("［テンプレ］")) setTimeout(() => showPartnerTalk(pline), 650);
    }
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

// 楼光の館限定：荒牌平局（山切れ）でノーテン席に最大HPの20%ダメージ（カリュブディス在卓で3倍）。
// 味方/敵いずれのノーテン席にも対称に効く。トベば end-on-bust と同じく gameOver でその局終了。
function applyRogueliteNotenPenalty(r) {
  if (!pairBattleData?.isRoguelite || !r?.exhaustive) return;
  const tenpai = r.tenpai || [];
  const charybdis = (pairBattleData.chars || []).some((c) => (c?.id || "").startsWith("charybdis"));
  const frac = ROGUELITE_NOTEN_FRAC * (charybdis ? CHARYBDIS_NOTEN_MUL : 1);
  let hit = false;
  for (let i = 0; i < game.numPlayers; i++) {
    if (tenpai[i]) continue; // テンパイは無傷
    const maxHp = pairBattleData.chars[i]?.stats?.startingPoints || 0;
    const dmg = Math.round(maxHp * frac);
    if (dmg <= 0 || pairBattleData.hp[i] <= 0) continue;
    pairBattleData.hp[i] = Math.max(0, pairBattleData.hp[i] - dmg);
    game.players[i].points = pairBattleData.hp[i];
    hit = true;
  }
  if (!hit) return;
  // ペア点数を現HP合計へ整合。
  for (const p of pairBattleData.pairs) pairBattleData.pairScore[pairBattleData.pairOf[p.seats[0]]] = p.seats.reduce((a, s) => a + Math.max(0, pairBattleData.hp[s]), 0);
  updateHpBoard();
  // ノーテン罰符でトんだら、誰か飛んだ＝その局で終了（end-on-bust と同じ）。
  if (pairBattleData.hp.some((h) => h <= 0)) game.gameOver = true;
}

// ペア戦用ダメージ演出。団体戦版から「交代UI」「飛びカットイン／親満ペナルティ」を
// 取り除いた簡易版。HPは被弾(マイナス)のみ反映＝着席ダウンで0床。ペア点数は増減そのまま。
// 飛びペナルティは仕様D（当面なし）に従いゼロ。Phase2 でUIを磨く前提の機能版。
// 条件付き（動的）バフをこの局の与/被ダメ倍率へ折り込む。base＝次戦アイテムのbattleMods。
//   波に乗る(streakDeal)：連勝×係数で与ダメ↑（味方和了時）。倍返し(revengeDeal)：前局被弾なら次の和了で↑。
//   背水(riichiDeal)：リーチ中の和了で↑。火事場(lowHpPower)：和了者HPが低いほど与ダメ↑＋味方最低HPが低いほど被ダメ↓。
function rlApplyDynamicBuffs(run, r, base) {
  const m = run.mods || {}; const pb = pairBattleData; const roles = pb.seatRoles || [];
  const winnerIsAlly = r.winner != null && roles[r.winner] === "ally";
  const maxOf = (i) => pb.chars[i]?.stats?.startingPoints || 1;
  let dealMul = 1, takeMul = 1;
  if (winnerIsAlly) {
    if (m.streakDeal) dealMul *= 1 + (rogueliteState.allyWinStreak || 0) * m.streakDeal;
    if (m.revengeDeal && rogueliteState.allyHurtLastHand) dealMul *= 1 + m.revengeDeal;
    if (m.riichiDeal && game.players[r.winner]?.riichi) dealMul *= 1 + m.riichiDeal;
    if (m.lowHpPower) dealMul *= 1 + m.lowHpPower * Math.max(0, 1 - (pb.hp[r.winner] || 0) / maxOf(r.winner));
    // 流派シナジー（提案A）：和了の質に応じて各流派のしきい値ボーナスが与ダメに乗る。
    //   染め＝染め手(混一/清一)／速攻＝ツモ和了／打点＝満貫以上。複数該当なら掛け合わせ（混色のご褒美）。
    const flushWin = !!r.result?.yaku?.some((y) => y.name === "清一色" || y.name === "混一色");
    const tsumoWin = !!r.tsumo;
    const score = r.result?.total ?? r.result?.score ?? 0;
    // 満貫以上＝打点流派の発火。score(支払い合計)が主。翻数は score.js の totalHan（han という別名は無い）。
    const bigWin = !!r.result && (r.result.isYakuman || (r.result.totalHan || 0) >= 5 || score >= 8000);
    dealMul *= clusterDealMul(run, { flushWin, tsumoWin, bigWin, anyWin: true }); // 博打=anyWin（味方和了なら常に）
  }
  if (m.lowHpPower) {
    const minHf = Math.min(...roles.map((ro, i) => (ro === "ally" ? (pb.hp[i] || 0) / maxOf(i) : 1)));
    takeMul *= 1 - Math.min(0.5, m.lowHpPower * Math.max(0, 1 - minHf));
  }
  return { ...base, dealMul: (base.dealMul || 1) * dealMul, takeMul: (base.takeMul || 1) * takeMul };
}

function showPairBattleDamageFx(r, onDone) {
  const host = el("damage-overlay");
  // ローグライト：素点差分を独自HPスケール（与ダメ倍率・被ダメ軽減のmod込み）へ写してから反映。
  const rlHpMax = pairBattleData?.isRoguelite ? pairBattleData.chars.map((c) => c.stats?.startingPoints || 0) : null;
  const rlBattleMods = pairBattleData?.isRoguelite ? (rogueliteState?.battleMods || {}) : {};
  // 条件付き（動的）バフ＝連勝/瀕死/反撃/リーチをこの局の倍率へ折り込む（次戦アイテムのbattleModsに合流）。
  const rlEffMods = (pairBattleData?.isRoguelite && rogueliteState) ? rlApplyDynamicBuffs(rogueliteState.run, r, rlBattleMods) : rlBattleMods;
  // 内訳（演出用）は deltas を確定（＝お守り消費）する前に取る＝この局のお守り状態を正しく映す。
  const rlGambleFloor = !!(pairBattleData?.isRoguelite && rogueliteState?.gamble); // 博打マス＝被ダメ防御貫通2倍
  const rlBreakdown = (pairBattleData?.isRoguelite && rogueliteState)
    ? explainRogueliteDamage(rogueliteState.run, { deltas: r.deltas || [], roles: pairBattleData.seatRoles, winnerSeat: r.winner, hpMax: rlHpMax, battleMods: rlEffMods, gambleFloor: rlGambleFloor })
    : null;
  const deltas = (pairBattleData?.isRoguelite && rogueliteState)
    ? rogueliteDamageDeltas(rogueliteState.run, { deltas: r.deltas || [], roles: pairBattleData.seatRoles, winnerSeat: r.winner, hpMax: rlHpMax, battleMods: rlEffMods, gambleFloor: rlGambleFloor })
    : (r.deltas || []);

  // 個人HPとペア点数を別管理で反映。HP=被弾のみ(0床)、pairScore=増減そのまま。
  const enduredNow = []; // 不屈で踏みとどまった席（演出用）
  const beforeOf = {};
  for (let i = 0; i < game.numPlayers; i++) {
    beforeOf[i] = pairBattleData.hp[i];
    const d = deltas[i] || 0;
    if (d < 0) {
      let next = pairBattleData.hp[i] + d;
      // 致命回避：①不屈のお守り（次戦・各メンバー1回）②不死鳥の羽（ラン中1回・道具消費）。HP1で踏みとどまる。
      const isAlly = pairBattleData.seatRoles?.[i] === "ally";
      if (next <= 0 && beforeOf[i] > 0 && isAlly && rogueliteState) {
        if (rlBattleMods.endure && !rogueliteState.enduredSeats.has(i)) { rogueliteState.enduredSeats.add(i); next = 1; enduredNow.push(i); }
        else if (consumeBustSaver(rogueliteState.run)) { next = 1; enduredNow.push(i); } // 不死鳥の羽
      }
      pairBattleData.hp[i] = Math.max(0, next); // 着席ダウンで0床
    }
    if (d) pairBattleData.pairScore[pairBattleData.pairOf[i]] += d;
    game.players[i].points = pairBattleData.hp[i]; // 卓のHP表示用に同期
  }
  // 条件付きバフ用の状態更新：連勝（味方和了で+1・それ以外で0）と前局の味方被弾。
  if (pairBattleData.isRoguelite && rogueliteState) {
    const roles2 = pairBattleData.seatRoles || [];
    const winnerIsAlly2 = r.winner != null && roles2[r.winner] === "ally";
    rogueliteState.allyWinStreak = winnerIsAlly2 ? (rogueliteState.allyWinStreak || 0) + 1 : 0;
    rogueliteState.allyHurtLastHand = roles2.some((ro, i) => ro === "ally" && (deltas[i] || 0) < 0);
  }

  // ペア全滅（2人ともHP0＝着席ダウン）をこの局で確定させる。エンジンの bustCheck は
  // _endHand 時点（hp更新前）に評価されるため、ここで game.gameOver を立てて同じ局で
  // 対局終了に倒す（off-by-one 回避）。onDone(=proceed) が isGameOver を見て結果画面へ。
  // ローグライトは「誰か（味方/敵いずれか）が飛んだらその時点で終了」＝決着が明快、
  // かつ“飛んだ後の手番（リーチ等）”に入らずクラッシュも回避。通常ペア戦はペア全滅で終了。
  const pairFullyDown = pairBattleData.pairs.some((p) => p.seats.every((s) => pairBattleData.hp[s] <= 0));
  const anyBust = pairBattleData.hp.some((h) => h <= 0);
  if (pairFullyDown || (pairBattleData.isRoguelite && anyBust)) {
    game.gameOver = true;
  }

  const fmtNum = (v) => v.toLocaleString();
  const myPair = pairBattleData.pairOf[humanIndex];
  // ローグライト：勝者は「敵に与えたダメージ」を見せる（点棒=HP。+0表示の無報酬感を解消）。
  const isRl = !!pairBattleData.isRoguelite;
  const roles = pairBattleData.seatRoles || [];
  const winnerIsAlly = isRl && roles[r.winner] === "ally";
  // 役満ご祝儀：味方が役満を和了したらフラグを立てる（この戦を踏破するとオールレジェンダリー）。
  if (isRl && winnerIsAlly && r.result?.isYakuman && rogueliteState) rogueliteState.yakumanThisBattle = true;
  const enemyDmg = isRl ? game.players.reduce((a, _p, i) => a + (roles[i] === "enemy" && deltas[i] < 0 ? -deltas[i] : 0), 0) : 0;
  // 調整ログ：1局の決着（勝者・アガリ点/役満・与/被ダメ・決着時HP）。HP反映後に記録。
  if (isRl && rogueliteState?.run) {
    const allyTaken = game.players.reduce((a, _p, i) => a + (roles[i] === "ally" && deltas[i] < 0 ? -deltas[i] : 0), 0);
    rlLog("hand", {
      floor: rogueliteState.run.floor, biome: biomeOf(rogueliteState.run)?.id,
      winner: r.winner == null ? "draw" : (winnerIsAlly ? "ally" : "enemy"), tsumo: !!r.tsumo,
      yakuman: !!r.result?.isYakuman, han: r.result?.totalHan ?? null, score: r.result?.total ?? r.result?.score ?? null,
      dealt: enemyDmg, taken: allyTaken,
      hpSelf: pairBattleData.hp[0], hpAlly: pairBattleData.hp[2],
      hpAllyTotal: (pairBattleData.hp[0] || 0) + (pairBattleData.hp[2] || 0),
      hpEnemy: (pairBattleData.hp[1] || 0) + (pairBattleData.hp[3] || 0),
      ...rlBuffSnap(rogueliteState.run),
    });
  }
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
    const tag = pairBattleData.solo
      ? (roles[i] === "ally" ? "あなた" : "敵")
      : (pairBattleData.pairOf[i] === myPair ? "自ペア" : "相手ペア");
    const deltaHtml = isWin
      ? (isRl
          ? (winnerIsAlly
              ? `<div class="tb-dmg-delta gain" title="敵のHPを削った">敵に ${enemyDmg.toLocaleString()} ダメージ！</div>`
              : `<div class="tb-dmg-delta">—</div>`)
          : `<div class="tb-dmg-delta gain" title="ペア点数が増えます（HPは回復しません）">点数 +${delta.toLocaleString()}</div>`)
      : `<div class="tb-dmg-delta loss">${delta.toLocaleString()}</div>`;
    return `<div class="tb-dmg-row ${isWin ? "is-win" : "is-loser"}${down ? " is-down" : ""}" data-i="${i}" data-before="${before}" data-after="${after}" data-full="${full}">
      <div class="tb-dmg-tag" style="color:${pairBattleData.pairOf[i] === myPair ? "var(--accent)" : "var(--muted)"}">${tag}</div>
      <div class="tb-dmg-name" style="color:${c.color}">${c.name}</div>
      <div class="tb-dmg-barwrap"><div class="hpfill-ghost" style="width:${p(before)}%"></div><div class="hp-fill ${fc}" style="width:${p(before)}%"></div></div>
      <div class="tb-dmg-val"><span class="tb-dmg-num">${fmtNum(before)}</span></div>
      ${deltaHtml}
      ${down ? `<div class="tb-dmg-stamp">ダウン</div>` : enduredNow.includes(i) ? `<div class="tb-dmg-stamp endure">不屈！HP1</div>` : ""}
    </div>`;
  };

  // ペア点数（合算）でランキング表示。
  const totalHtml = pairBattleData.pairScore.map((tot, pid) => {
    const isMe = pid === myPair;
    const lbl = pairBattleData.solo ? (isMe ? "あなた" : "敵") : (isMe ? "自ペア" : "相手ペア");
    return `<div class="tb-tot-item${isMe ? " mine" : ""}">
      <div class="tb-tot-label">${lbl}</div>
      <div class="tb-tot-val" style="${isMe ? "color:var(--accent)" : tot < 10000 ? "color:var(--danger)" : ""}">${tot.toLocaleString()}</div>
    </div>`;
  }).join('<div class="tb-tot-sep"></div>');

  const rows = [r.winner, ...game.players.map((_, i) => i).filter((i) => i !== r.winner && deltas[i])];

  const calcRows = rlBreakdown ? rogueliteBreakdownRows(rlBreakdown, r) : [];
  host.innerHTML = `
    <div class="dmg-card tb-dmg-card">
      <div class="dmg-head">${r.tsumo ? "ツモ和了" : "ロン和了"} — ダメージ</div>
      <div class="tb-dmg-rows">${rows.map(rowHtml).join("")}</div>
      <div class="tb-totals">${totalHtml}</div>
      ${guardBlockedNotesHtml(r)}
      <p class="tb-note">${isRl ? "※ 和了で敵のHPを削る。戦える味方が1人以下になれば没収。HPは休息/宴会フロア等で回復できる" : "※ ペア戦なので、HPはアイテムでのみ回復できます"}</p>
      ${calcRows.length ? `<button class="tb-calc-link" id="pb-calc-btn">🔍 ダメージ計算を見る</button>` : ""}
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
    updateHpBoard(); // 右側の相棒ボードのHPバーも即同期（ダメージカードと同時に動く）
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

  const finish = () => { host.classList.remove("show", "has-speaker", "ko"); host.classList.add("hidden"); host.innerHTML = ""; onDone(); };
  // ローグライト：和了/被弾の「素点→ダメージ」内訳。最初の数回だけ自動で見せ（教える）、
  // 以降は「計算を見る」で任意表示（毎ハンド強制で重くならないように）。
  const openCalc = (afterClose) => {
    host.classList.remove("has-speaker", "ko");
    showRogueliteDamageBreakdown(host, { rows: calcRows, tsumo: r.tsumo, score: r.result?.total || 0, showSkip: rlCalcShouldAuto(), onSkip: () => setRlCalcAutoOff(true), onDone: afterClose });
  };
  // 手動で開く（計算を見る）→ 見終えたら次へ進む（デルタは適用済みなので再描画しない）。
  const calcBtn = el("pb-calc-btn");
  if (calcBtn) calcBtn.onclick = () => openCalc(finish);
  el("pb-next-btn").onclick = () => {
    if (calcRows.length && rlCalcShouldAuto()) { bumpRlCalcShown(); openCalc(finish); }
    else finish();
  };
}

// 内訳トレースを演出用の行（敵への与ダメ＋味方の被弾）に整える。winner席の攻撃を主役に。
function rogueliteBreakdownRows(breakdown, r) {
  const roles = pairBattleData?.seatRoles || [];
  const chars = pairBattleData?.chars || [];
  const rows = [];
  for (const b of breakdown) {
    if (!b.steps?.length || b.value === 0 && b.role === "enemy") continue;
    const c = chars[b.seat];
    if (!c) continue;
    const kind = b.role === "enemy" ? "deal" : "take"; // 敵への与ダメ / 味方の被弾
    rows.push({ name: c.name, color: c.color, kind, steps: b.steps, final: b.value, capped: !!b.capped });
  }
  // 与ダメ（敵）を先頭、被弾（味方）を後に。
  rows.sort((a, b) => (a.kind === "deal" ? 0 : 1) - (b.kind === "deal" ? 0 : 1));
  return rows;
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

// Diagonal cut-in band. Two visual variants share the single #ability-cutin host:
//   variant "bold" … 能力発動。画面いっぱいの立ち絵＋斜めウォッシュ（大胆）。
//   variant "band" … 満貫以上の和了。横帯にバストアップ（旧カットイン）。
// 役満は別物の特別演出（showYakumanCutIn）。teardown timer は host に持たせ、後続の
// カットインがきれいに上書きできるようにする。
function playCutIn(character, { charLabel, bigLabel, subLabel = "", kind = "", variant = "bold", dur, host = el("ability-cutin") }) {
  const c = character;
  const portraitUrl = charImages.url(c, "portrait");
  const art = portraitUrl
    ? `<img class="cutin-portrait" src="${portraitUrl}" alt="${c.name}">`
    : `<div class="cutin-portrait cutin-portrait-fallback" style="--char-color:${c.color}">${[...c.name][0] || "?"}</div>`;
  clearTimeout(host._cutinTimer);
  host.innerHTML = `
    <div class="cutin-band" data-kind="${kind}" data-variant="${variant}" style="--char-color:${c.color}; --cut-dur:${dur}ms">
      <div class="cutin-bandbg"></div>
      ${art}
      <div class="cutin-text">
        <div class="cutin-char" style="color:${c.color}">${charLabel}</div>
        <div class="cutin-name">${bigLabel}</div>
        ${subLabel ? `<div class="cutin-sub">${subLabel}</div>` : ""}
      </div>
    </div>`;
  host.classList.remove("hidden");
  host._cutinTimer = setTimeout(() => {
    host.classList.add("hidden");
    host.innerHTML = "";
    host._cutinTimer = null;
  }, dur);
}

// 他家の能力が「自分に何をするのか」を一行にする（カットインの副題）。これまで敵の能力は
// 名前だけが流れ、何をされたのか分からないまま局が進んでいた＝敵キャラの印象が残らない
// 最大の原因だった（docs/character-ingame-fx-plan.md 3-2）。文言は abilityMaster.enemyNote。
// 自分の発動には出さない（自分で選んでいるので説明は要らない）。
function enemyNoteFor(player, abilityId, params) {
  if (!abilityId || !game || player.index === humanIndex) return "";
  const note = abilityDef(abilityId).enemyNote;
  if (!note) return "";
  const targetIdx = params?.targetIndex;
  const targetName = targetIdx === humanIndex ? "あなた"
    : (game.players[targetIdx]?.character?.name || "");
  if (note.includes("{target}") && !targetName) return "";
  return note.replace("{name}", player.character.name).replace("{target}", targetName);
}

// 能力発動カットイン（大胆な全身立ち絵）。CSS animation runs for ABILITY_CUTIN_WAIT。
// subLabel には「自分にとって何が起きるか」（他家の発動時のみ）を添える。
function showAbilityCutIn(player, name, subLabel = "") {
  playCutIn(player.character, { charLabel: player.character.name, bigLabel: name, subLabel, variant: "bold", dur: ABILITY_CUTIN_WAIT });
}

// 卓上の1牌に重ねる小エフェクト（自分視点専用）。位置は手牌ヒットボックス→画面座標へ変換。
// variant でキャラ別の色に振り分ける（既定＝詩玥「幸運のツモ」の金リング）:
//   ""           … 金（詩玥・幸運のツモ）
//   "fx-lantern" … 橙（姚玖・老頭の庭＝么九にともる灯）
//   "fx-wind"    … 翠（春嬋・韋駄天＝駆け抜ける風）
function playTileFx(tileId, variant = "") {
  if (!renderer || !game) return;
  const cv = el("table");
  const hb = (renderer.handHitboxes || []).find((h) => h.tileId === tileId);
  if (!cv || !hb) return;
  const r = cv.getBoundingClientRect();
  const sx = r.width / cv.width, sy = r.height / cv.height;
  const fx = document.createElement("div");
  fx.className = "tsumo-fx" + (variant ? ` ${variant}` : "");
  fx.style.left = `${r.left + (hb.x + hb.w / 2) * sx}px`;
  fx.style.top = `${r.top + (hb.y + hb.h / 2) * sy}px`;
  fx.style.setProperty("--w", `${hb.w * sx}px`);
  fx.style.setProperty("--h", `${hb.h * sy}px`);
  fx.innerHTML = `<span class="tsumo-fx-glow"></span><span class="tsumo-fx-ring"></span><span class="tsumo-fx-spark">✦</span>`;
  document.body.appendChild(fx);
  requestAnimationFrame(() => fx.classList.add("go"));
  setTimeout(() => fx.remove(), 700);
}
// 「幸運のツモ」（詩玥）発動中の特別ツモ演出（金リング）。
function playLuckyTsumoFx(tileId) { playTileFx(tileId); }

// 天啓ドラ寄せ（ドラニエル）— めくった瞬間を事件にする（docs §11-2-4 #1）。
// この能力の諸刃は「暴いたドラが全員に乗る」ことなのに、いまは卓中央の表示牌が1枚
// 増えるだけで誰も気づけない。めくれた瞬間に卓が光り、**自分の手が新ドラを持っていれば
// その牌が灯る**ところまでを1つの演出にする（＝場を荒らして自分も潤う、が同時に見える）。
function maybePlayDoraRevealFx(beforeKinds) {
  if (!game) return;
  const added = (game.wall?.doraKinds?.() || []).filter((k) => !beforeKinds.has(k));
  if (!added.length) return; // めくれていない（四開槓で流局したときなど）
  playDoraFlash();
  const set = new Set(added);
  const me = game.players[humanIndex];
  for (const t of me?.hand || []) if (set.has(t.kind)) playTileFx(t.id, "fx-dora");
}
// 卓中央（ドラ表示牌の高さ）に走る金の閃光。0.6s 以内＝連戦のテンポを殺さない。
function playDoraFlash() {
  const wrap = tableWrapEl();
  const pos = tablePointAt(480, 396); // canvas 座標: 中央パネルの「ドラ表示」段
  if (!wrap || !pos) return;
  const fx = document.createElement("div");
  fx.className = "dora-flash";
  fx.style.left = `${pos.x}px`;
  fx.style.top = `${pos.y}px`;
  wrap.appendChild(fx);
  setTimeout(() => fx.remove(), 700);
}

let lastLuckyFxTileId = null;
let lastFateFxTileId = null; // ルイナ「運命を手繰る」で光らせた直近のツモ牌
let lastAbyssFxTileId = null; // カリュブディス「呑まれた和了牌」で沈めた直近のツモ牌
// 自分(人間)のツモ演出をまとめて面倒を見る。発動時＋発動中の各ツモで呼ぶ。
//   ・詩玥「幸運のツモ」… 発動中は毎ツモ、金のリング（同じツモ牌では二重発火しない）
//   ・ルクス「ゼロ・リサーチ」… 捕捉した牌を引いた瞬間、山の光点が手牌へ流れ込む
// オンラインはローカル描画座標を持たないので対象外（自分視点のオフライン演出）。
function maybePlayLuckyTsumoFx() {
  if (!game) return;
  const p = game.players[humanIndex];
  if (!p || p.drawnTileId == null) return;
  maybePlayLuxCaptureFx();
  // ルイナの超越帯「運命を手繰る」（drawBias）＝常時パッシブでツモが寄る。詩玥の金と
  // 見分けがつくよう紫で出す（同じメカでも、宿っているのは彼女自身の"いい目"だから）。
  if (humanAbilityStatus("kakeha-bet")?.pot?.fate && p.drawnTileId !== lastFateFxTileId) {
    lastFateFxTileId = p.drawnTileId;
    playTileFx(p.drawnTileId, "fx-fate");
  }
  maybeAbyssDenyFx(); // カリュブディス: 掴んだ和了牌が呑まれる
  if (!humanAbilityActive("lucky-draw")) return;
  if (p.drawnTileId === lastLuckyFxTileId) return;
  lastLuckyFxTileId = p.drawnTileId;
  playLuckyTsumoFx(p.drawnTileId);
}

// ============================================================================
// 能力の持続レイヤー（キャラ別インゲーム演出の共通の器）
// ---------------------------------------------------------------------------
// 「能力＝そのキャラが見ている世界を、一局だけプレイヤーに貸す」という物差しの実装
// （正典 docs/character-ingame-fx-plan.md）。発動中のあいだ卓の左下にそのキャラの"視界"を
// 出し、能力が切れる／局が終わると畳む。器（#ability-aura とパネルの出し入れ）は共通で
// 中身だけキャラ別に差す＝新しいキャラの持続演出は sync 関数を1本足すだけで増やせる。
// 自分視点のオフライン演出（オンラインはレプリカで能力を回さないので対象外）。
// ============================================================================
const auraFx = {
  kind: null,      // 今の局で出したオーラ種別（"yaochu"|"chunchan"）。能力が切れても局末まで残す＝余韻
  seen: new Set(), // 姚玖: この局で一度でも手にした么九の種類（切っても消えない＝出会いの蓄積）
  lanterns: 0,     // 姚玖: いま灯っている数（= seen.size。差分点灯の判定に持つ）
  moon: false,     // 姚玖: 満月（么九13種そろう or 国士テンパイ）が昇ったか
  steps: 0,        // 春嬋: 進んだ歩数（シャンテンが縮んだ回数）
  rush: false,     // 春嬋: 韋駄天バッジ（3歩でテンポがさらに詰まる）
  dolls: -1,       // ビビ: 残っている人形の数（守りの窓。-1=未同期）
  sunk: -1,        // 沼田蓮: 直近に描いた沈殿＝泥の水位（-1=未同期）
  heat: -1,        // 焔: 直近に描いた火の勢い（打点の芽。-1=未同期）
  pot: -1,         // ルイナ: 卓に積んである賭け金（-1=未同期）
  dora: "",        // ドラニエル: 直近に描いた札束＋崖の状態（""=未同期）
  silence: "",     // JaneDoe: 縛っている相手と残り巡（""=未同期）
  abyss: -1,       // カリュブディス: 渦の深さ（山の消化率。-1=未同期）
};
// 場の持続レイヤー（卓の上辺）。自席のオーラとは別スロットで、住む場所を分けることで
// 「自分の能力」と「他家が卓に敷いている場」が同時に立っても潰し合わない（§11-4 案a）。
const fieldFx = { kind: null };
function resetAbilityAuraState() {
  auraFx.kind = null; auraFx.seen.clear(); auraFx.lanterns = 0; auraFx.dolls = -1; auraFx.moon = false; auraFx.steps = 0; auraFx.rush = false;
  auraFx.sunk = -1; auraFx.heat = -1; auraFx.pot = -1; auraFx.dora = ""; auraFx.silence = ""; auraFx.abyss = -1;
  lastAbyssFxTileId = null;
}
// 人間プレイヤーがその能力を発動中か。
// オンラインはレプリカで能力を回さないので、権威が evt.awaitDiscard で送ってくる
// abilityStatus（自席ぶんだけ・sendToSeat）の active を見る。自分の手番のたび更新され、
// 局頭のリセットと合わせて「発動した局のあいだ立っている」状態を再現できる。
function humanAbilityActive(abilityId) {
  if (!game) return false;
  if (online) return (online.opts?.abilityStatus || []).some((a) => a.id === abilityId && a.active);
  const p = game.players[humanIndex];
  return !!p && (p.abilities || []).some((a) => a.id === abilityId && a.isActive);
}
const tableWrapEl = () => document.querySelector("#game-screen .table-wrap");
// 自席のその能力の表示状態（meter/status/candidates…）。オンラインは権威が自席にだけ
// 送ってきた abilityStatus を使う（レプリカでは能力を回せない）。
function humanAbilityStatus(abilityId) {
  if (!game) return null;
  const list = online ? (online.opts?.abilityStatus || []) : game.abilityStatus(humanIndex);
  return list.find((a) => a.id === abilityId) || null;
}
// オーラ本体を畳む（局終わり・能力切れ）。卓のビネットも一緒に落とす。
function clearAbilityAura() {
  const host = el("ability-aura");
  if (!host) return;
  if (!host.dataset.kind) return; // 既に畳んである
  host.classList.add("hidden");
  host.innerHTML = "";
  delete host.dataset.kind;
  tableWrapEl()?.classList.remove("aura-night", "aura-night-lit");
}
// 指定 kind のパネルを（無ければ）建てる。既にあるときは中身に触らず返す＝差分更新のため。
function ensureAuraPanel(kind, html) {
  const host = el("ability-aura");
  if (!host) return null;
  if (host.dataset.kind !== kind) {
    host.dataset.kind = kind;
    host.innerHTML = html;
    host.classList.remove("hidden");
  }
  return host.firstElementChild;
}

// --- 場の持続レイヤー（卓の上辺）--------------------------------------------
// 自席のオーラ（#ability-aura＝卓の左下）と役割で住み分ける器（§11-4 案a）。ここに出すのは
// 「他家由来で卓全体に効いている」もの＝発動の瞬間を持たない場能力。自分の能力とは
// 排他にしない＝両方立つ局（例: 自分が姚玖・他家が沼田蓮）でも、どちらも消えない。
function clearFieldAura() {
  const host = el("field-aura");
  if (host && host.dataset.kind) {
    host.classList.add("hidden");
    host.innerHTML = "";
    delete host.dataset.kind;
  }
  tableWrapEl()?.classList.remove("field-mud");
  fieldFx.kind = null;
}
function ensureFieldPanel(kind, html) {
  const host = el("field-aura");
  if (!host) return null;
  if (host.dataset.kind !== kind) {
    host.dataset.kind = kind;
    host.innerHTML = html;
    host.classList.remove("hidden");
  }
  return host.firstElementChild;
}
// この卓で「泥中の蓮」を敷いている他家（居なければ null）。レプリカは能力インスタンスを
// 持たないので、humanHasAbility と同じくキャラ定義（character.abilities）で判定する。
function mudFieldOwner() {
  const list = game ? game.players || [] : [];
  for (let i = 0; i < list.length; i++) {
    if (i === humanIndex) continue;
    if ((list[i].character?.abilities || []).some((a) => a.abilityId === "muddy-lotus")) return list[i];
  }
  return null;
}
// 沼田 蓮「泥中の蓮」（他家）— 卓が濁る。常時発動＝発動カットインが無い能力なので、
// 「なぜか点が減る」を防ぐ最初の一手は"居るだけで卓が沈んでいる"を静かに置くこと。
// 沈殿の量は他家ぶんが権威から送られてこない（§7 ルール3）ので出さない＝濁りと一行だけ。
function mudFieldPanel(owner) {
  return {
    key: "mud",
    html: `<div class="aura-panel aura-mud">
      <span class="aura-title">泥中の蓮</span>
      <span class="aura-note">${esc(owner.character?.name || "")}——この卓のアガリは、沈む</span>
    </div>`,
  };
}
// JaneDoe「沈黙の処方箋」に縛られている側（自分）— なぜ打牌が選べないのかを卓に出す
// （docs §14-2-2）。いまは engine が黙ってツモ切りするだけで、理由がどこにも出ていない。
// 「…」の数＝残り巡＝彼女の無言そのもの。
function silencedPanel() {
  const left = Math.max(0, game?.players?.[humanIndex]?.forcedTsumogiri || 0);
  if (left <= 0) return null;
  return {
    key: `silenced${left}`,
    html: `<div class="aura-panel aura-silenced">
      <span class="aura-title">沈黙の処方箋</span>
      <span class="sil-dots">${'<span class="sil-dot"></span>'.repeat(left)}</span>
      <span class="aura-note">あと${left}巡、打牌は選べない</span>
    </div>`,
  };
}
// 場の能力に合わせて卓の上辺を同期する（render から毎回）。他家由来のものだけがここに住む。
// 同時に2枚まで（§11-4 の調停表）。増やすときはその表を先に更新すること。
function updateFieldAura() {
  const owner = game ? mudFieldOwner() : null;
  const parts = [];
  if (owner) parts.push(mudFieldPanel(owner));
  const sil = game ? silencedPanel() : null;
  if (sil) parts.push(sil);
  if (!parts.length) { clearFieldAura(); return; }
  ensureFieldPanel(parts.map((p) => p.key).join("+"), parts.map((p) => p.html).join(""));
  fieldFx.kind = parts.map((p) => p.key).join("+");
  tableWrapEl()?.classList.toggle("field-mud", !!owner);
}

// 手牌＋副露にある么九牌を「出会った種類」として庭に積む（灯は切っても消えない）。
// 現在の手牌の種類数をそのまま映すと、么九を切るたび灯が消えて“夢が遠のく”表示になる。
// 姚玖の庭は「今夜いくつの端に出会えたか」＝蓄積の器なので、一度ともった灯は残す。
// 返り値は「いま手にしている么九の種類数」（国士テンパイ判定に使う・こちらは増減する）。
function collectYaochuKinds(p) {
  let held = 0;
  const add = (k) => { if (isTerminalOrHonor(k)) { auraFx.seen.add(k); return true; } return false; };
  const heldKinds = new Set();
  for (const t of p.hand || []) if (add(t.kind)) heldKinds.add(t.kind);
  for (const m of p.melds || []) for (const t of m.tiles || []) if (add(t.kind)) heldKinds.add(t.kind);
  held = heldKinds.size;
  return held;
}

// 姚玖「老頭の庭」— 么九を引くたび庭に灯がひとつともる。能力が当たらなかった局は庭が
// 暗いままで、それ自体が「夢は遠い」という語りになる（引けた枚数ではなく"種類"で数える＝
// 国士・混老頭という夢への距離そのもの）。
function syncGardenAura(p) {
  const panel = ensureAuraPanel("yaochu", `
    <div class="aura-panel aura-garden">
      <div class="aura-title">老頭の庭</div>
      <div class="garden-lanterns">${'<span class="lantern"></span>'.repeat(13)}</div>
      <div class="aura-note">今夜の灯り <b>0</b>／13</div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "yaochu";
  tableWrapEl()?.classList.add("aura-night");
  const held = collectYaochuKinds(p);
  const n = Math.min(13, auraFx.seen.size);
  if (n !== auraFx.lanterns) {
    panel.querySelectorAll(".lantern").forEach((lamp, i) => {
      if (i < n) {
        if (!lamp.classList.contains("on")) {
          lamp.classList.add("on", "just");
          setTimeout(() => lamp.classList.remove("just"), 600);
        }
      } else lamp.classList.remove("on", "just");
    });
    const note = panel.querySelector(".aura-note b");
    if (note) note.textContent = String(n);
    // 灯が増えた瞬間だけ、いま引いた牌へ橙のリングを重ねる（么九を引き当てた合図）。
    const drawn = (p.hand || []).find((t) => t.id === p.drawnTileId);
    if (n > auraFx.lanterns && drawn && isTerminalOrHonor(drawn.kind)) playTileFx(drawn.id, "fx-lantern");
    auraFx.lanterns = n;
  }
  // 灯が10を超えたら夜が明るむ＝夢（国士・混老頭）の射程に入った合図。
  panel.classList.toggle("lit", n >= 10);
  tableWrapEl()?.classList.toggle("aura-night-lit", n >= 10);
  // 満月: 13種すべてに出会った、または国士テンパイ（＝いま手にしている種類で判定）。
  // 1局に一度だけ昇り、口癖をテロップで置く。
  if (!auraFx.moon && (n >= 13 || (held >= 12 && humanShanten() === 0))) {
    auraFx.moon = true;
    panel.insertAdjacentHTML("beforeend", `<span class="garden-moon"></span>`);
    showSeatCall(humanIndex, "……揃うと、いいな", "step-call");
  }
}

// 春嬋「韋駄天の中張」— 走った距離を見せる。中張が来ること自体は当たり前すぎて気づけない
// ので、"速さ"という別チャネル（歩数＋場のテンポ短縮＝cpuDelayNow）に翻訳する。
function syncSprintAura() {
  const panel = ensureAuraPanel("chunchan", `
    <div class="aura-panel aura-sprint">
      <div class="aura-title">韋駄天の中張</div>
      <div class="step-marks"></div>
      <div class="aura-note">場のテンポが詰まっている</div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "chunchan";
  const marks = panel.querySelector(".step-marks");
  if (marks) {
    for (let i = marks.childElementCount; i < Math.min(auraFx.steps, 8); i++) {
      marks.insertAdjacentHTML("beforeend", `<span class="step-mark"></span>`);
    }
  }
  const title = panel.querySelector(".aura-title");
  if (auraFx.rush && title && !title.querySelector(".sprint-badge")) {
    title.insertAdjacentHTML("beforeend", `<span class="sprint-badge">疾走</span>`);
    const note = panel.querySelector(".aura-note");
    if (note) note.textContent = "——もっと速く";
  }
  panel.classList.toggle("rush", auraFx.rush);
}

// ビビ「身代わり人形」— 守りの窓（あと何回の自打牌ぶん守られているか）を人形の数で見せる。
// 1体消えるたびに「あと何打、誰にも渡さないか」が見える＝押し引きの材料でもある。
function syncDollAura() {
  const st = humanAbilityStatus("bibi");
  const max = st?.meter?.max ?? 6;
  const left = st?.meter?.on ?? 0;
  const panel = ensureAuraPanel("bibi", `
    <div class="aura-panel aura-doll">
      <div class="aura-title">身代わり人形</div>
      <div class="doll-marks">${'<span class="doll"></span>'.repeat(max)}</div>
      <div class="aura-note">あと <b>${max}</b> 打、誰にも渡さない</div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "bibi";
  if (left !== auraFx.dolls) {
    panel.querySelectorAll(".doll").forEach((d, i) => {
      const spent = i >= left;
      if (spent && !d.classList.contains("spent")) {
        d.classList.add("spent", "just");
        setTimeout(() => d.classList.remove("just"), 600);
      } else if (!spent) d.classList.remove("spent", "just");
    });
    const note = panel.querySelector(".aura-note b");
    if (note) note.textContent = String(left);
    auraFx.dolls = left;
  }
  panel.classList.toggle("last", left > 0 && left <= 2); // 残りわずかは色で警告
}

// 沼田 蓮「泥中の蓮」（自席）— 泥の水位＝沈殿。泥が沈めた点は消えたのではなく卓の底に
// 溜まっていて、安手が咲くとき（超越帯）に吸い上げられる。「格好悪く泥臭く勝つ」美学と、
// 沈殿というメカが一致する唯一の場所なので、溜まっていく様子そのものを報酬にする。
// 水位が満ちる沈殿量の目安。楼光の館は独自HPスケール（stats.startingPoints を run の
// HP上限で差し替えて卓に着く）なので、固定値だとゲージがほぼ空のままになる。開始持ち点
// からの相対で決めて、どのモードでも「溜まっていく」体感が揃うようにする。
const mudFullOf = (p) => Math.max(1000, Math.round((p?.character?.stats?.startingPoints || 16000) * 0.75));
function syncLotusAura() {
  const panel = ensureAuraPanel("lotus", `
    <div class="aura-panel aura-lotus">
      <div class="aura-title">泥中の蓮</div>
      <div class="mud-gauge"><span class="mud-water"></span><span class="mud-bloom"></span></div>
      <div class="aura-note">沈殿 <b>0</b></div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "lotus";
  const sunk = Math.max(0, humanAbilityStatus("muddy-lotus")?.mud?.sunk ?? 0);
  if (sunk === auraFx.sunk) return;
  const water = panel.querySelector(".mud-water");
  if (water) water.style.height = `${Math.min(100, Math.round((sunk / mudFullOf(game.players[humanIndex])) * 100))}%`;
  const note = panel.querySelector(".aura-note b");
  if (note) note.textContent = sunk.toLocaleString();
  // 水位が引く＝沈殿を吸い上げた＝蓮が咲いた瞬間。上がるときは静かに、引くときだけ咲かせる。
  if (auraFx.sunk > 0 && sunk < auraFx.sunk) {
    panel.classList.add("bloom");
    setTimeout(() => panel.classList.remove("bloom"), 900);
  }
  panel.classList.toggle("has-mud", sunk > 0);
  auraFx.sunk = sunk;
}

// 焔「大物手の焔」— 発動局のあいだ、手の"燃料"を炎の高さで見せる。満貫以上なら1.5倍・
// 未満なら点数固定という賭けなので、「この手はいま燃えているか」がそのまま押し引きの
// 判断材料になる。厳密な打点計算はしない（役の有無まで断定すると嘘になるし、点数を
// そのまま出すのは §11-1 の禁じ手）。ドラ・赤・北抜き・リーチ・テンパイという燃料を
// 数えて高さに翻訳する＝「この手は燃えるか」という彼の視界を貸す。
const HOMURA_FUEL_MAX = 5; // 満貫（5翻）を火柱の満位に見立てる
const HOMURA_WORDS = ["くすぶり", "細い火", "灯る", "育つ", "燃える", "火柱"];
function homuraHeat(p) {
  if (!p || !game) return 0;
  let fuel = 0;
  const doraKinds = new Set(game.wall?.doraKinds?.() ?? []);
  const tiles = [...(p.hand || []), ...(p.melds || []).flatMap((m) => m.tiles || [])];
  for (const t of tiles) if (t && (t.red || doraKinds.has(t.kind))) fuel++;
  fuel += (p.kita || []).length; // 北抜きは1枚＝ドラ1
  if (p.riichi) fuel++;
  if (shanten(p.counts(), p.numMeldSets()) <= 0) fuel++; // テンパイ＝あと一歩
  return Math.min(HOMURA_FUEL_MAX, fuel);
}
function syncFlameAura(p) {
  const panel = ensureAuraPanel("homura", `
    <div class="aura-panel aura-flame">
      <div class="aura-title">大物手の焔</div>
      <div class="flame-pit"><span class="flame-body"></span></div>
      <div class="aura-note">火の勢い <b>—</b></div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "homura";
  const heat = homuraHeat(p);
  if (heat === auraFx.heat) return;
  const body = panel.querySelector(".flame-body");
  if (body) body.style.height = `${20 + heat * 16}%`;
  const note = panel.querySelector(".aura-note b");
  if (note) note.textContent = HOMURA_WORDS[heat] || HOMURA_WORDS[0];
  // 満位に届いた瞬間だけ一度あおる（届いてからは静かに燃え続ける＝連戦のテンポを殺さない）。
  if (heat >= HOMURA_FUEL_MAX && auraFx.heat < HOMURA_FUEL_MAX) {
    panel.classList.add("flare");
    setTimeout(() => panel.classList.remove("flare"), 700);
  }
  panel.classList.toggle("blaze", heat >= HOMURA_FUEL_MAX);
  auraFx.heat = heat;
}

// 賭羽ルイナ「大博打」— 前払いした賭け金を、局が終わるまで卓に置いておく（docs §11-2-2 #2）。
// 賭けは「払った瞬間から結末まで見えている」べきもの。アガれば配当（和了画面の一行が受ける）、
// 流れれば灰になる＝外した局にも必ず結末の絵がつく＝損しただけの局にしない。
function syncPotAura() {
  const panel = ensureAuraPanel("kakeha", `
    <div class="aura-panel aura-pot">
      <div class="aura-title">大博打</div>
      <div class="pot-stack"></div>
      <div class="aura-note">賭け金 <b>0</b></div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "kakeha";
  // 局が終わって自分が和了れなかった＝賭け金は戻らない。灰にして結末を見せる。
  const r = game.lastResult;
  panel.classList.toggle("ash", game.phase === Phase.HAND_OVER && !!r && r.winner !== humanIndex);
  const bet = humanAbilityStatus("kakeha-bet")?.pot?.bet || 0;
  if (bet === auraFx.pot) return;
  const stack = panel.querySelector(".pot-stack");
  if (stack) {
    stack.innerHTML = '<span class="pot-stick"></span>'.repeat(Math.max(0, Math.round(bet / 5000)));
    stack.classList.add("just");
    setTimeout(() => stack.classList.remove("just"), 700);
  }
  const note = panel.querySelector(".aura-note b");
  if (note) note.textContent = bet.toLocaleString();
  auraFx.pot = bet;
}

// ドラニエル「天啓ドラ寄せ」— 積み上げた確定ドラの札束と、四開槓の崖（docs §11-2-4 #2#3#4）。
// 崖は能力の諸刃そのものなのに、いまは「ボタンが黙って押せなくなる」だけで伝わらない。
// 札束は発動していない局も出す＝崖の監視そのものが彼女の卓上の役割だから。
function syncDoraAura() {
  const panel = ensureAuraPanel("dora", `
    <div class="aura-panel aura-dora">
      <div class="aura-title">天啓ドラ寄せ</div>
      <div class="dora-stack"></div>
      <div class="aura-note">確定ドラ <b>0</b><span class="dora-cliff"></span></div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "dora";
  const d = humanAbilityStatus("dora-pull")?.dora || null;
  const stacked = d?.stacked || 0;
  const stand = d?.lastStand || 0;
  const left = Math.max(0, 5 - (d?.revealed ?? 1)); // あと何枚めくれば四開槓の域か
  const key = `${stacked}/${stand}/${left}/${d?.blocked ? 1 : 0}`;
  panel.classList.toggle("cliff", !!d?.blocked || left <= 1);
  panel.classList.toggle("laststand", stand > 0);
  if (key === auraFx.dora) return;
  const stack = panel.querySelector(".dora-stack");
  if (stack) {
    stack.innerHTML = '<span class="dora-card"></span>'.repeat(stacked + stand);
    if (stacked + stand > 0) {
      stack.classList.add("just");
      setTimeout(() => stack.classList.remove("just"), 700);
    }
  }
  const note = panel.querySelector(".aura-note b");
  if (note) note.textContent = String(stacked + stand);
  const cliff = panel.querySelector(".dora-cliff");
  if (cliff) {
    cliff.textContent = d?.blocked ? "／これ以上めくれば場が流れる"
      : left <= 2 ? `／あと${left}枚で場が流れる`
      : stand > 0 ? "／背水の天啓" : "";
  }
  auraFx.dora = key;
}

// JaneDoe「沈黙の処方箋」を自分が使っている側（docs §14-2-2）。奪った時間が減っていく様子を
// 「…」の数で見せる＝完全無言の彼女にとって、点の数そのものが言葉になる。
function syncSilenceAura() {
  const sil = humanAbilityStatus("jane-doe")?.silence || null;
  const left = sil?.left || 0;
  const panel = ensureAuraPanel("janedoe", `
    <div class="aura-panel aura-silence">
      <div class="aura-title">沈黙の処方箋</div>
      <div class="sil-dots"></div>
      <div class="aura-note">…</div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "janedoe";
  const key = `${sil?.seat ?? -1}/${left}`;
  if (key === auraFx.silence) return;
  const dots = panel.querySelector(".sil-dots");
  if (dots) dots.innerHTML = '<span class="sil-dot"></span>'.repeat(left);
  const note = panel.querySelector(".aura-note");
  if (note) note.textContent = left > 0 ? `${sil.name}　あと${left}巡` : "…………";
  panel.classList.toggle("done", left <= 0);
  auraFx.silence = key;
}

// カリュブディス「淵の蒐集」— 渦が満ちるほど、彼女の和了が近づく（docs §14-2-3）。
// 彼女だけは和了れない代わりに流局で蒐集する＝「山が減る」が他の誰とも違う意味を持つ。
// 卓の残り牌をそのまま数字で出すのではなく、渦の深さに翻訳する＝彼女の視界を貸す。
function syncAbyssAura() {
  const panel = ensureAuraPanel("abyss", `
    <div class="aura-panel aura-abyss">
      <div class="aura-title">淵の蒐集</div>
      <div class="abyss-ring"><span class="abyss-core"></span></div>
      <div class="aura-note">和了は、呑まれる</div>
    </div>`);
  if (!panel) return;
  auraFx.kind = "abyss";
  const ab = humanAbilityStatus("abyss-collection")?.abyss || null;
  const live = ab?.live ?? 0;
  const total = ab?.total || 1;
  const depth = Math.max(0, Math.min(100, Math.round((1 - live / total) * 100))); // 山が減るほど深い
  if (depth === auraFx.abyss) return;
  const ring = panel.querySelector(".abyss-ring");
  if (ring) ring.style.setProperty("--depth", `${depth}%`);
  const note = panel.querySelector(".aura-note");
  if (note) note.textContent = live <= 8 ? `淵は、もうすぐ満ちる（残り${live}）` : "和了は、呑まれる";
  panel.classList.toggle("near", live <= 8);
  auraFx.abyss = depth;
}

// アガれたはずの牌が呑まれた瞬間（§14-2-3）。彼女だけは和了を禁じられているので、
// 待ち牌を掴んでも何も起きない——その「何も起きなさ」を一度だけ絵にする。
function maybeAbyssDenyFx() {
  if (!game || !humanHasAbility("abyss-collection")) return;
  const p = game.players[humanIndex];
  if (!p || p.drawnTileId == null || p.drawnTileId === lastAbyssFxTileId) return;
  const drawn = (p.hand || []).find((t) => t.id === p.drawnTileId);
  if (!drawn) return;
  const counts = p.counts();
  counts[drawn.kind]--; // 引く前の13枚に戻して待ちを見る
  const w = waits(counts, p.numMeldSets());
  if (!w.includes(drawn.kind)) return;
  lastAbyssFxTileId = p.drawnTileId;
  playTileFx(drawn.id, "fx-abyss");
  const line = vline(p.character.id, "abyssDeny", {});
  if (line) setTimeout(() => showSelfTalk(line), 500);
}

// 発動中の能力に合わせて持続レイヤーを同期する（render から毎回呼ぶ）。
// 新しいキャラの持続演出を足すときは、ここに1行と sync 関数を1本。
function updateAbilityAura() {
  const p = game ? game.players[humanIndex] : null;
  if (!p) { clearAbilityAura(); return; }
  // 能力は局の終わりに切れるが、オーラは局末（＝次局の配牌）まで残す。和了/流局の結果を
  // 見ているあいだも「今夜の灯り」「走った歩数」が卓に残る＝その局の余韻になる。
  if (humanAbilityActive("rootou") || auraFx.kind === "yaochu") { syncGardenAura(p); return; }
  if (humanAbilityActive("chunchan") || auraFx.kind === "chunchan") { syncSprintAura(); return; }
  if (humanAbilityActive("bibi") || auraFx.kind === "bibi") { syncDollAura(); return; }
  if (humanAbilityActive("homura") || auraFx.kind === "homura") { syncFlameAura(p); return; }
  // ルイナは「賭けた局だけ」ポットが立つ（賭けていない局は何も出さない）。
  if (auraFx.kind === "kakeha" || (humanHasAbility("kakeha-bet") && (humanAbilityStatus("kakeha-bet")?.pot?.bet || 0) > 0)) { syncPotAura(); return; }
  // ドラニエルは常時（未発動の局も四開槓の崖を見張るのが彼女の卓上の役割）。
  if (humanHasAbility("dora-pull")) { syncDoraAura(); return; }
  // JaneDoe は縛っている局だけ（縛られている側の表示は場レイヤー＝他家由来なので別枠）。
  if (auraFx.kind === "janedoe" || humanAbilityStatus("jane-doe")?.silence) { syncSilenceAura(); return; }
  // カリュブディスは常時（山が減ること自体が彼女の進捗＝渦の深さ）。
  if (humanHasAbility("abyss-collection")) { syncAbyssAura(); return; }
  // 泥中の蓮は常時発動＝「発動した局だけ」ではないので、持っていれば局中ずっと出す。
  if (humanHasAbility("muddy-lotus")) { syncLotusAura(); return; }
  clearAbilityAura();
}

// ============================================================================
// ルクス・ゼロ「ゼロ・リサーチ」の演出 — 捕捉（予約）→ 回収 と「該当なし」の告知
// ---------------------------------------------------------------------------
// これまでは能力の結果（次のツモで有効牌が来る）しか見えなかった。捕捉した瞬間に山へ
// 光点を刺し、それが次のツモで手牌へ流れ込むことで「予約→回収」の因果を目に見せる。
// ============================================================================
let luxReserveKind = null; // 捕捉して回収待ちの牌種（null=なし）
let luxPointEl = null;     // 山に刺さっている光点の DOM
function clearLuxPoint() {
  if (luxPointEl) { luxPointEl.remove(); luxPointEl = null; }
}
// canvas 内座標 → table-wrap 内の絶対座標（オーバーレイ配置用）。
function tablePointAt(cx, cy) {
  const cv = el("table"), wrap = tableWrapEl();
  if (!cv || !wrap) return null;
  const r = cv.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  return { x: (r.left - wr.left) + cx * (r.width / cv.width), y: (r.top - wr.top) + cy * (r.height / cv.height) };
}
// 捕捉: 山（卓中央の残り牌表示のあたり）に光点を刺す。回収まで脈打って残る。
function playLuxReserveFx() {
  clearLuxPoint();
  const wrap = tableWrapEl();
  const pos = tablePointAt(480, 318); // 中央パネル上部＝「残り牌」の高さ
  if (!wrap || !pos) return;
  const dot = document.createElement("div");
  dot.className = "lux-point";
  dot.style.left = `${pos.x}px`;
  dot.style.top = `${pos.y}px`;
  wrap.appendChild(dot);
  luxPointEl = dot;
}
// 回収: 予約した牌を引いた瞬間、光点がその牌へ流れ込んで消える（＋シアンのツモFX）。
function maybePlayLuxCaptureFx() {
  if (!game || luxReserveKind == null) return;
  const p = game.players[humanIndex];
  const drawn = (p?.hand || []).find((t) => t.id === p.drawnTileId);
  if (!drawn || drawn.kind !== luxReserveKind) return;
  luxReserveKind = null;
  const hb = (renderer?.handHitboxes || []).find((h) => h.tileId === drawn.id);
  if (luxPointEl && hb) {
    const pos = tablePointAt(hb.x + hb.w / 2, hb.y + hb.h / 2);
    if (pos) { luxPointEl.style.left = `${pos.x}px`; luxPointEl.style.top = `${pos.y}px`; }
    const dot = luxPointEl;
    luxPointEl = null;
    setTimeout(() => { dot.style.opacity = "0"; playTileFx(drawn.id, "fx-scan"); }, 430);
    setTimeout(() => dot.remove(), 700);
  } else {
    clearLuxPoint();
    playTileFx(drawn.id, "fx-scan");
  }
}

// ── エージェント・RE「リコール・ディール」──────────────────────────────────
// 河↔手牌の交換は、これまで結果（手牌と河が入れ替わる）しか見えなかった。取り戻す光と
// 手放す光をすれ違わせて、取引の因果を目に見せる（docs/character-ingame-fx-plan.md §8-2-4）。
const recalledTileIds = new Set(); // この局で手に戻した牌（手牌の諜報マーク用）
function playRecallSwapFx(riverTileId, drawnTileId) {
  const wrap = tableWrapEl();
  if (!wrap || !renderer) return;
  const rh = (renderer.riverHitboxes || []).find((h) => h.tileId === riverTileId);
  const hh = (renderer.handHitboxes || []).find((h) => h.tileId === drawnTileId);
  const at = (hb) => (hb ? tablePointAt(hb.x + hb.w / 2, hb.y + hb.h / 2) : null);
  const river = at(rh), hand = at(hh);
  if (!river || !hand) return;
  const fly = (from, to, cls) => {
    const dot = document.createElement("div");
    dot.className = `recall-dot ${cls}`;
    dot.style.left = `${from.x}px`;
    dot.style.top = `${from.y}px`;
    wrap.appendChild(dot);
    requestAnimationFrame(() => { dot.style.left = `${to.x}px`; dot.style.top = `${to.y}px`; });
    setTimeout(() => { dot.style.opacity = "0"; }, 460);
    setTimeout(() => dot.remove(), 780);
  };
  fly(river, hand, "in");  // 河の牌 → 手牌（取り戻す）
  fly(hand, river, "out"); // ツモ牌 → 河（手放す＝ロンされない牌になる）
}

// 「該当なし」の告知 — 1シャンテンなのに、聴牌を確定できる有効牌が山に尽きている状態。
// 能力が使えない理由をグレーアウトで済ませず、"場に出切っている" という読みの材料として
// 渡す（河の該当牌を光らせて証明を見せる）。1局に一度だけ。
let luxDeadShown = false;
let luxDeadKinds = null;  // 河ハイライト中の牌種（null=非表示）
let luxDeadTimer = null;
function resetLuxWatch() {
  luxDeadShown = false; luxDeadKinds = null; luxReserveKind = null;
  clearTimeout(luxDeadTimer); clearLuxPoint();
  const host = el("lux-alert");
  if (host) { host.classList.add("hidden"); host.classList.remove("out"); }
}
function updateLuxWatch() {
  if (!game || luxDeadShown) return;
  // abilityStatus() はルクスの走査（34×34のシャンテン評価）を回すので、評価するのは
  // 「自分が打牌を選ぶ手番」だけに絞る。CPU手番中やホバー再描画では走らせない。
  if (game.phase !== Phase.AWAIT_DISCARD || game.turn !== humanIndex) return;
  if (!humanHasAbility("zero-search")) return;
  // オンラインは権威が自席にだけ送ってきた走査結果を使う（レプリカでは能力を回せない）。
  const list = online ? (online.opts?.abilityStatus || []) : game.abilityStatus(humanIndex);
  const st = list.find((a) => a.id === "zero-search");
  const dead = st?.scan?.deadKinds || [];
  if (!st?.visible || (st.candidates || []).length > 0 || dead.length === 0) return;
  luxDeadShown = true;
  luxDeadKinds = new Set(dead);
  const host = el("lux-alert");
  if (host) {
    host.className = "lux-alert";
    host.innerHTML = `
      <div class="la-tag">NOT FOUND</div>
      <div class="la-main">該当なし — 有効牌は場に出切っている</div>
      <div class="la-sub">${dead.map((k) => kindLabel(k)).slice(0, 6).join(" / ")}　…河に光らせた</div>`;
    host.classList.remove("hidden");
  }
  refreshHighlights(); // 河ハイライトを即反映（render 内から呼ばれるので再帰させない）
  renderer?.render();
  luxDeadTimer = setTimeout(() => {
    host?.classList.add("out");
    luxDeadKinds = null;
    refreshHighlights();
    renderer?.render();
    setTimeout(() => { host?.classList.add("hidden"); host?.classList.remove("out"); }, 400);
  }, 3200);
}

// 春嬋の「一歩」テロップ＋歩数の加算。3歩で韋駄天バッジが点き、場のテンポがさらに詰まる。
const STEP_WORDS = ["一歩", "二歩", "三歩", "四歩", "五歩", "六歩", "七歩", "八歩"];
function bumpSprintStep() {
  if (!humanAbilityActive("chunchan")) return;
  auraFx.steps++;
  showSeatCall(humanIndex, STEP_WORDS[Math.min(auraFx.steps, STEP_WORDS.length) - 1], "step-call");
  if (auraFx.steps >= 3) auraFx.rush = true;
  updateAbilityAura();
}
// 聴牌に届いた瞬間の一閃（画面を横切る風）。春嬋の口癖「間に合わせる」の回収。
function playSprintFlash() {
  const wrap = tableWrapEl();
  if (!wrap) return;
  const fx = document.createElement("div");
  fx.className = "sprint-flash";
  wrap.appendChild(fx);
  setTimeout(() => fx.remove(), 620);
  showSeatCall(humanIndex, "——間に合った", "step-call");
}

// リーチ宣言: ポン/カンと同じ席テロップ。宣言後の間は riichiWaitFlag が次手番で取る。
function showRiichiFx(playerIndex) {
  showSeatCall(playerIndex, "リーチ", "naki-call riichi-call");
}

// 満貫以上の和了カットイン（旧カットイン＝横帯＋バストアップ）。立ち絵＋「ロン/ツモ」。
// 打点名（満貫〜三倍満）の表記は出さない方針。
function showWinCutIn(playerIndex, type) {
  const c = game.players[playerIndex].character;
  playCutIn(c, {
    charLabel: c.name,
    bigLabel: type === "tsumo" ? "ツモ" : "ロン",
    kind: "win",
    variant: "band",
    dur: WIN_CALL_WAIT.mangan - 100,
  });
}

// 役満専用の特別演出（長尺・新演出）。回転する金光・立ち絵の立ち上がり・「役満」の
// 大書き・役名を段階的に見せる。host を専有し、dur 後に片付ける。
function renderYakumanInto(host, character, type, { title, name }, dur) {
  const c = character;
  const portraitUrl = charImages.url(c, "portrait");
  const art = portraitUrl
    ? `<img class="ym-portrait" src="${portraitUrl}" alt="${c.name}">`
    : `<div class="ym-portrait ym-portrait-fallback" style="--char-color:${c.color}">${[...c.name][0] || "?"}</div>`;
  clearTimeout(host._cutinTimer);
  host.innerHTML = `
    <div class="yakuman-fx" style="--char-color:${c.color}">
      <div class="ym-rays"></div>
      <div class="ym-flash"></div>
      ${art}
      <div class="ym-center">
        <div class="ym-how">${type === "tsumo" ? "ツモ" : "ロン"}</div>
        <div class="ym-title">${title}</div>
        ${name ? `<div class="ym-name">${name}</div>` : ""}
        <div class="ym-who" style="color:${c.color}">${c.name}</div>
      </div>
    </div>`;
  host.classList.remove("hidden");
  host._cutinTimer = setTimeout(() => {
    host.classList.add("hidden");
    host.innerHTML = "";
    host._cutinTimer = null;
  }, dur);
}
function showYakumanCutIn(playerIndex, type, data) {
  renderYakumanInto(el("ability-cutin"), game.players[playerIndex].character, type, data, WIN_CALL_WAIT.yakuman - 100);
}

// ---------------------------------------------------------------- DEBUG menu
// ?debug=tsumoreba 時にホーム左下の 🐛 から開ける。各演出を指定キャラで再生して確認する。
// 演出ビルダー（playCutIn / renderYakumanInto / spawnCall）を専用の FX host に向けて
// 呼ぶだけ＝ゲーム本体と同じ描画パスを通すので、見た目は実機と一致する。
const DBG_YAKUMAN = ["国士無双", "天和", "大三元", "四暗刻", "字一色", "緑一色", "清老頭", "九蓮宝燈", "四槓子", "国士無双十三面待ち"];
const DBG_YM_TITLE = ["役満", "ダブル役満", "数え役満"];

function showDebugMenu() {
  document.getElementById("debug-menu")?.remove();
  const ov = document.createElement("div");
  ov.id = "debug-menu";
  ov.className = "dbg-overlay";
  const opts = (arr, val = (x) => x, label = (x) => x) => arr.map((x) => `<option value="${val(x)}">${label(x)}</option>`).join("");
  ov.innerHTML = `
    <div class="dbg-panel">
      <div class="dbg-head"><span>🐛 DEBUG メニュー</span><button type="button" class="dbg-close" title="閉じる">✕</button></div>
      <div class="dbg-row"><label>キャラ</label><select class="dbg-char">${opts(CHARACTER_MASTER, (c) => c.id, (c) => c.name)}</select></div>
      <div class="dbg-sec">演出プレビュー</div>
      <div class="dbg-grid">
        <button type="button" class="dbg-btn" data-fx="ability">能力発動カットイン</button>
        <button type="button" class="dbg-btn" data-fx="riichi">リーチ（テロップ）</button>
        <button type="button" class="dbg-btn" data-fx="ron">ロン（テロップ）</button>
        <button type="button" class="dbg-btn" data-fx="tsumo">ツモ（テロップ）</button>
        <button type="button" class="dbg-btn" data-fx="pon">ポン</button>
        <button type="button" class="dbg-btn" data-fx="chi">チー</button>
        <button type="button" class="dbg-btn" data-fx="kan">カン</button>
        <button type="button" class="dbg-btn" data-fx="kita">北抜き</button>
      </div>
      <div class="dbg-row"><label>満貫カットイン</label>
        <button type="button" class="dbg-btn dbg-mini" data-fx="mangan-ron">ロン</button>
        <button type="button" class="dbg-btn dbg-mini" data-fx="mangan-tsumo">ツモ</button></div>
      <div class="dbg-row"><label>役満 特別演出</label><select class="dbg-ymtitle">${opts(DBG_YM_TITLE)}</select><select class="dbg-ym">${opts(DBG_YAKUMAN)}</select>
        <button type="button" class="dbg-btn dbg-mini" data-fx="yakuman-ron">ロン</button>
        <button type="button" class="dbg-btn dbg-mini" data-fx="yakuman-tsumo">ツモ</button></div>
      <div class="dbg-sec">栞 模範解答スキルLv</div>
      <div class="dbg-row"><label>Lv（次の対局から）</label><select class="dbg-ma-lv">
        <option value="">既定（Lv5）</option>
        ${[1,2,3,4,5,6,7,8,9,10].map((n) => `<option value="${n}">Lv${n}</option>`).join("")}
      </select></div>
      <div class="dbg-sec">沼田蓮 泥中の蓮スキルLv</div>
      <div class="dbg-row"><label>Lv（次の対局から）</label><select class="dbg-ml-lv">
        <option value="">既定（Lv5）</option>
        ${[1,2,3,4,5,6,7,8,9,10].map((n) => `<option value="${n}">Lv${n}</option>`).join("")}
      </select></div>
      <div class="dbg-sec">宝珠を付与（動作確認用）</div>
      <div class="dbg-row"><label>所持: <span class="dbg-orb-now">…</span></label>
        <button type="button" class="dbg-btn dbg-mini dbg-orb-add" data-orbs="100">+100</button>
        <button type="button" class="dbg-btn dbg-mini dbg-orb-add" data-orbs="300">+300</button></div>
      <div class="dbg-sec">楼光の館 記憶ビート（紙芝居プレビュー）</div>
      <div class="dbg-row"><label>再生</label>
        ${ROGUELITE_BEAT_MASTER.map((b) => `<button type="button" class="dbg-btn dbg-mini dbg-beat" data-beat="${b.id}">${b.title}</button>`).join("")}</div>
      <div class="dbg-note">※ ?debug=tsumoreba 起動時のみ表示／該当キャラでフリー対戦すると反映</div>
    </div>
    <div class="naki-fx" id="dbg-naki-host"></div>
    <div class="ability-cutin hidden" id="dbg-cutin-host"></div>`;
  (el("app") || document.body).appendChild(ov);

  const charSel = ov.querySelector(".dbg-char");
  const ymSel = ov.querySelector(".dbg-ym");
  const ymTitleSel = ov.querySelector(".dbg-ymtitle");
  const cutinHost = ov.querySelector("#dbg-cutin-host");
  const nakiHost = ov.querySelector("#dbg-naki-host");

  // 栞 模範解答スキルLv の強制（次の対局から反映）。現在値を初期選択に反映。
  const maLvSel = ov.querySelector(".dbg-ma-lv");
  if (maLvSel) {
    const cur = getModelAnswerLevelOverride();
    maLvSel.value = cur == null ? "" : String(cur);
    maLvSel.onchange = () => setModelAnswerLevelOverride(maLvSel.value === "" ? null : Number(maLvSel.value));
  }
  // 沼田蓮 泥中の蓮スキルLv の強制（次の対局から反映）。栞と同じ足場。
  const mlLvSel = ov.querySelector(".dbg-ml-lv");
  if (mlLvSel) {
    const cur = getMuddyLotusLevelOverride();
    mlLvSel.value = cur == null ? "" : String(cur);
    mlLvSel.onchange = () => setMuddyLotusLevelOverride(mlLvSel.value === "" ? null : Number(mlLvSel.value));
  }
  // 宝珠の付与（動作確認用）。プロフィール経由＝ログイン時はSupabaseにも同期される。
  const orbNow = ov.querySelector(".dbg-orb-now");
  const refreshOrbs = () => profileRepo.loadProfile().then((p) => { if (orbNow) orbNow.textContent = String(p.orbs || 0); }).catch(() => {});
  refreshOrbs();
  for (const btn of ov.querySelectorAll(".dbg-orb-add")) {
    btn.onclick = async () => {
      try {
        const p = await profileRepo.loadProfile();
        p.orbs = (p.orbs || 0) + Number(btn.dataset.orbs || 0);
        await profileRepo.saveProfile(p);
        refreshOrbs();
      } catch (e) { console.error("宝珠付与失敗:", e); }
    };
  }
  const CENTER = { left: "50%", top: "50%" };
  const curChar = () => CHARACTER_MASTER.find((c) => c.id === charSel.value) || CHARACTER_MASTER[0];

  const play = (fx) => {
    const ch = curChar();
    const type = fx.endsWith("tsumo") ? "tsumo" : "ron";
    if (fx === "ability") {
      const ab = ch.abilities?.[0]?.abilityId;
      audio.playVoice(ch.id, "ability");
      playCutIn(ch, { charLabel: ch.name, bigLabel: (ab && abilityDef(ab)?.name) || "能力発動", variant: "bold", dur: ABILITY_CUTIN_WAIT, host: cutinHost });
    } else if (fx === "riichi") {
      audio.playVoice(ch.id, "riichi");
      spawnCall(nakiHost, CENTER, "リーチ", "naki-call riichi-call");
    } else if (fx === "ron" || fx === "tsumo") {
      audio.playNaki();
      spawnCall(nakiHost, CENTER, fx === "tsumo" ? "ツモ" : "ロン", "naki-call win-call");
    } else if (fx === "pon" || fx === "chi" || fx === "kan") {
      audio.playVoice(ch.id, fx);
      spawnCall(nakiHost, CENTER, { pon: "ポン", chi: "チー", kan: "カン" }[fx], "naki-call");
    } else if (fx === "kita") {
      audio.playVoice(ch.id, "kita");
      spawnCall(nakiHost, CENTER, "北", "naki-call kita-call");
    } else if (fx.startsWith("mangan")) {
      audio.playWinHit();
      playCutIn(ch, { charLabel: ch.name, bigLabel: type === "tsumo" ? "ツモ" : "ロン", kind: "win", variant: "band", dur: WIN_CALL_WAIT.mangan - 100, host: cutinHost });
    } else if (fx.startsWith("yakuman")) {
      audio.playFanfare();
      renderYakumanInto(cutinHost, ch, type, { title: ymTitleSel.value, name: ymSel.value }, WIN_CALL_WAIT.yakuman - 100);
    }
  };
  // 記憶ビートのプレビュー再生（実機feel確認用＝本番と同じ playScenario 経路。既読には触れない）。
  for (const b of ov.querySelectorAll(".dbg-beat")) {
    b.addEventListener("click", () => {
      audio.playClick?.();
      const beat = ROGUELITE_BEAT_MASTER.find((x) => x.id === b.dataset.beat);
      if (!beat) return;
      const backTo = document.querySelector(".screen:not(.hidden)")?.id || "home-screen";
      ov.remove();
      showScreen("scenario-screen");
      playScenario(null, { audio, lines: beat.lines, onEnd: () => goScreen(backTo) });
    });
  }
  ov.querySelectorAll(".dbg-btn:not(.dbg-beat)").forEach((b) => b.addEventListener("click", () => { audio.playClick?.(); play(b.dataset.fx); }));
  ov.querySelector(".dbg-close").addEventListener("click", () => { audio.playClick?.(); ov.remove(); });
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

  // 栞（模範解答）を連れていた対局は、順位の捲りが落ち着いてから「答え合わせ」を開く。
  // ここだけは能力の効果ではなく“彼女があなたの一打をどう見ていたか”を返す場（愛着＝蓄積）。
  if (humanHasAbility("model-answer")) {
    clearTimeout(shioriReviewTimer);
    shioriReviewTimer = setTimeout(() => showShioriReview(), reveal(0) * 1000 + 1500);
  }

  // 得点推移：終局スナップショットを足し、どのモードでもグラフを開ける。
  scoreHistory.push({ label: "終局", points: game.players.map((p) => p.points) });
  const graphPlayers = game.players.map((p, i) => ({ name: p.character.name, color: p.character.color || "#9aa", isHuman: i === humanIndex }));
  const graphSnapshot = scoreHistory.slice();
  overlay.querySelector(".go-buttons").appendChild(mkBtn("📈 得点推移", "btn-tsumo go-graph-btn", () => showScoreGraph(graphSnapshot, graphPlayers)));

  // フリー対戦（個人）：相棒（＝操作キャラ）との絆・履歴を更新（本気/大会は結果反映側で加算）。
  // 操作キャラが修行完了弟子のときは絆を計上しない（弟子は相棒キャラではない＝案A・F6）。
  if (!honestCtx && !human.character.isCompletedAvatar) {
    applyFreeMatchToCompanion({ companionId: human.character.id, placement: hRank, numPlayers: N, styleTags: detectPlayStyle(human, game.lastResult) });
  }

  // 本気対局（Phase 4A）は「もう一度(reload)」ではなく結果を育成へ返して戻る。
  if (honestCtx) {
    const standings = ranks.map((p, i) => ({ id: p.character.id, name: p.character.name, points: p.points, rank: i, isHuman: p === human }));
    const result = { placement: hRank, numPlayers: N, finalPoints: human.points, won: hRank === 0, standings, graph: { history: graphSnapshot, players: graphPlayers }, styleTags: detectPlayStyle(human, game.lastResult) };
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
  } else if (online) {
    // 通信対戦（テスト中）：順位を Supabase に記録し、段位を更新し、ロビー/トップへ戻れる。
    const btns = overlay.querySelector(".go-buttons");
    const finishedAt = new Date().toISOString();
    const opponents = game.players.filter((_, i) => i !== humanIndex).map((p) => p.character.id);
    // 戦績ログ（online_results）。表示は段位モーダル側に集約するので結果は捨てる。
    recordOnlineResult({ charId: human.character.id, rank: hRank + 1, numPlayers: N, finalPoints: human.points, opponents });
    // 段位更新（profile.onlineRank）→ 対局終了の捲り演出が一段落してから「段位モーダル」(FE風)を出す。
    // ※以前は go-overlay 内にパネルを差し込んでいたが「対局終了」バナーに丸被りしたため、独立モーダルへ。
    let rankRes = null, rankFailed = false;
    applyOnlineRankUpdate({ placement: hRank + 1, numPlayers: N, finishedAt })
      .then((res) => { rankRes = res; })
      .catch((e) => { console.warn("段位更新失敗", e); rankFailed = true; });
    const popRank = () => {
      if (rankFailed) return;                              // 取得失敗時はモーダルなし（結果だけ見せる）
      if (!rankRes) { setTimeout(popRank, 150); return; }  // データ未着なら少し待つ
      showRankUpModal(rankRes, human.character);
    };
    setTimeout(popRank, reveal(0) * 1000 + 900); // 1位の捲り＋点数カウントが終わってから
    // 通信状態を片付けてから遷移（再接続タイマ停止・WS切断・online クリア）。
    const leave = (target) => {
      overlay.classList.add("hidden");
      reconnecting = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      showReconnectOverlay(null);
      onlineWsEp?.close?.();
      online = null;
      resetOnlineTurnUi(); // 長考バッジ/代打ちモーダル/待機トーストの後始末（経路追加時の取りこぼし防止）
      goScreen(target);
    };
    btns.appendChild(mkBtn("ロビーに戻る", "btn-tsumo", () => leave("online-screen")));
    btns.appendChild(mkBtn("トップへ", "btn-skip", () => leave("home-screen")));
  } else {
    // フリー対戦の対局後は「相棒のいる対戦ホーム」へ戻せる＝loopを閉じる（UXテスト最重要指摘）。
    // 戻ると renderBattleHome が絆帯/出迎えセリフを引き直す＝「一緒に打った結果」が相棒に滲んで見える。
    const btns = overlay.querySelector(".go-buttons");
    btns.appendChild(mkBtn("🏠 対戦ホームへ", "btn-tsumo", () => { overlay.classList.add("hidden"); goScreen("battle-home-screen"); }));
    btns.appendChild(mkBtn("もう一度", "btn-skip", () => location.reload()));
  }
}

// 対局結果を段位状態へ適用して保存。戻り値 { before, after, delta, promotedTo }。
// online_results を正とした再計算ではなく increment（高速）。profile.onlineRank を更新。
async function applyOnlineRankUpdate({ placement, numPlayers, finishedAt }) {
  const profile = await profileRepo.loadProfile();
  const before = profile.onlineRank || defaultRankState();
  const { state, delta, promotedTo } = applyMatchToRank(before, { placement, numPlayers, finishedAt });
  profile.onlineRank = state;
  await profileRepo.saveProfile(profile);
  // 順位表（全員が読める集計表）へ自分の当季行を upsert（未ログインは skip）。失敗は握りつぶす。
  pushRanking({
    seasonId: state.seasonId,
    username: profile.profile?.displayName || "名無し",
    seasonScore: state.seasonScore,
    dan: state.dan,
    tierRp: state.tierRp,
  }).catch(() => {});
  return { before, after: state, delta, promotedTo };
}

// 順位表を開く（今シーズン）。上位＋自分の順位を取得して描画。
async function openOnlineLeaderboard() {
  const seasonId = seasonIdFromDate(new Date());
  const user = await getUser().catch(() => null);
  showScreen("online-leaderboard-screen");
  showOnlineLeaderboard(el("online-leaderboard-screen"), {
    seasonLabel: seasonId,
    myUserId: user?.id || null,
    load: async () => {
      const [top, me] = await Promise.all([
        fetchLeaderboard(seasonId, 7),
        fetchMyStanding(seasonId).catch(() => null),
      ]);
      return { top, me };
    },
    onBack: () => goScreen("online-screen"),
  });
}

// 昇段時のキャラ一言（叩き台。正式には step4 で voiceLines の danUp イベント化）。
function danUpLineFor(character) {
  if (character?.id === "shiyue") return "ふふん、また一段上ったアルね。我と打てば当然ヨ？";
  return "また一歩、上ったね。";
}

// 対局終了後に出るオンライン段位モーダル（FE風ゲージ演出）。師弟パラメータの能力値上昇演出と同じ
// 言語：RP ゲージを before→after まで満たし、昇段ぶんは「満タン→フラッシュ→次段位の0%から」を繰り返す。
// 数値は競技ランクなので見せる。つづけるで閉じる（裏の対局終了画面のボタンへ）。
function showRankUpModal({ before, after, delta }, character, onClose) {
  const promoted = after.dan > before.dan;
  const deltaStr = `RP ${delta >= 0 ? "+" : ""}${delta}`;
  const host = el("app") || document.body;
  const ov = document.createElement("div");
  ov.className = "rankup-overlay";
  ov.innerHTML = `
    <div class="rankup-card">
      <div class="rankup-head">オンライン段位</div>
      <div class="rankup-promote" hidden>昇段！</div>
      <div class="rankup-dan">
        <span class="rankup-title"></span>
        <span class="rankup-kana"></span>
      </div>
      <div class="rankup-gauge">
        <div class="rankup-bar hpbar"><div class="hpfill high rankup-fill"></div></div>
        <div class="rankup-meta">
          <span class="rankup-rp"></span>
          <span class="rankup-delta ${delta < 0 ? "minus" : ""}">${deltaStr}</span>
        </div>
      </div>
      <div class="rankup-line" hidden></div>
      <button type="button" class="primary rankup-close" disabled>つづける</button>
    </div>`;
  host.appendChild(ov);
  const fill = ov.querySelector(".rankup-fill");
  const titleEl = ov.querySelector(".rankup-title");
  const kanaEl = ov.querySelector(".rankup-kana");
  const rpEl = ov.querySelector(".rankup-rp");
  const promoteEl = ov.querySelector(".rankup-promote");
  const lineEl = ov.querySelector(".rankup-line");
  const closeBtn = ov.querySelector(".rankup-close");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const close = () => { ov.remove(); onClose?.(); };
  closeBtn.onclick = () => { audio?.playClick?.(); close(); };

  const capOf = (dan) => describeRank({ dan, tierRp: 0 }).next; // null=最高位
  const pctOf = (dan, rp) => { const cap = capOf(dan); return cap == null ? 100 : Math.min(100, Math.round((rp / cap) * 100)); };
  const setDan = (dan) => { const d = describeRank({ dan, tierRp: 0 }); titleEl.textContent = d.title; kanaEl.textContent = d.kana; };
  const rpFmt = (dan) => { const cap = capOf(dan); return (v) => (cap == null ? `RP ${v}` : `RP ${v} / ${cap}`); };

  (async () => {
    requestAnimationFrame(() => ov.classList.add("show"));
    audio?.playPip?.(1500, 0.35);
    // 初期表示：before（段位・ゲージ・RP）を即セット。
    setDan(before.dan);
    fill.style.transition = "none"; fill.style.width = pctOf(before.dan, before.tierRp) + "%";
    rpEl.textContent = rpFmt(before.dan)(before.tierRp);
    void fill.offsetWidth; fill.style.transition = "";
    await sleep(550);

    // 昇段ぶん：現段位を満タン→フラッシュ→次段位 0% から。
    let dan = before.dan;
    while (dan < after.dan) {
      fill.style.width = "100%"; rpEl.textContent = rpFmt(dan)(capOf(dan));
      audio?.playPip?.(2200, 0.5);
      await sleep(500);
      ov.classList.add("is-rankup");
      promoteEl.hidden = false;
      dan += 1; setDan(dan);
      fill.style.transition = "none"; fill.style.width = "0%"; rpEl.textContent = rpFmt(dan)(0);
      void fill.offsetWidth; fill.style.transition = "";
      audio?.playSe?.(sePath("シャキーン1.mp3"), 0.9);
      await sleep(440);
      ov.classList.remove("is-rankup");
    }

    // 最終段位で after.tierRp まで満たす（同段なら単純に before→after）。
    fill.style.width = pctOf(after.dan, after.tierRp) + "%";
    tweenNum(rpEl, promoted ? 0 : before.tierRp, after.tierRp, 650, rpFmt(after.dan));
    // 充填に合わせてピピピッ（FE風）。
    for (let i = 0; i < 4; i++) setTimeout(() => audio?.playPip?.(1500 + i * 140, 0.32), i * 130);
    await sleep(720);

    if (promoted) { lineEl.hidden = false; lineEl.textContent = `「${danUpLineFor(character)}」`; }
    closeBtn.disabled = false;
  })();
}
// デバッグ: 段位モーダルを単体で確認する。__rankUpDemo(placement, beforeDan, beforeRp)。
// 例) window.__rankUpDemo(0, 1, 160) で昇段（萌芽→蓮蕾）演出。
if (typeof window !== "undefined") {
  window.__rankUpDemo = (placement = 0, beforeDan = 1, beforeRp = 160) => {
    const before = { dan: beforeDan, tierRp: beforeRp, seasonId: "demo", seasonScore: 0 };
    const r = applyMatchToRank(before, { placement, numPlayers: 4, finishedAt: new Date().toISOString() });
    showRankUpModal({ before, after: r.state, delta: r.delta }, CHARACTERS[0]);
  };
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

  // 大会（団体M リーグ）：着卓全チームの結果をユニット順位として大会へ返す（大三剣杯は3チーム）。
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
    btnsT.appendChild(mkBtn("🏠 対戦ホームへ", "btn-tsumo", () => { overlay.classList.add("hidden"); goScreen("battle-home-screen"); }));
    btnsT.appendChild(mkBtn("もう一度", "btn-skip", () => location.reload()));
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
  const pairLabelOf = (pid) => pairBattleData.solo ? (pid === myPair ? "あなた" : "敵") : (pid === myPair ? "自ペア" : "相手ペア");
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
          <span class="go-champ-badge">${pairBattleData.solo ? "1位" : "優勝ペア"}</span>
          <span class="go-champ-name go-champ-pairname">${champNamesHtml}</span>
        </div>
        <div class="go-champ-sub">${pairBattleData.solo ? pairLabelOf(champPid) : `${pairLabelOf(champPid)}・共闘優勝`}</div>
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
  if (pairBattleData.isRoguelite && honestCtx?.isRoguelite) {
    // 楼光の館＝生存レース：パーティ全員がトビでなければ踏破（次の階へ）。控えが居れば全滅しても続行。
    // 撃破（敵ペア全滅）は早期決着＋高レアの燃料（koAny）。最終判定は onRogueliteBattleEnd（HP同期後）。
    // 味方/敵の席を役割で集約（卓サイズに依らず一般化＝ソロの三麻=敵2グループも正しく数える）。
    const roles = pairBattleData.seatRoles || [];
    const allySeatsGO = pairBattleData.chars.map((_, s) => s).filter((s) => roles[s] === "ally");
    const enemySeatsGO = pairBattleData.chars.map((_, s) => s).filter((s) => roles[s] === "enemy");
    // ゲームオーバー＝生存メンバーが1人以下（runWiped と一致させる）。着卓のHPは未同期なので
    // pairBattleData.hp で、控えは run.party の現HPで数える。ソロランのみ全滅(0)まで続行。
    const seatedSurvivors = allySeatsGO.filter((s) => pairBattleData.hp[s] > 0).length;
    const benchAliveCount = rogueliteState?.run?.party?.filter((m) => !rogueliteState.seated?.includes(m) && m.hp > 0).length || 0;
    const totalSurvivors = seatedSurvivors + benchAliveCount;
    const partyLen = rogueliteState?.run?.party?.length || 0;
    const runEnds = partyLen <= 1 ? totalSurvivors === 0 : totalSurvivors <= 1;
    const koAny = enemySeatsGO.some((s) => pairBattleData.hp[s] <= 0);
    const enemyAllDown = enemySeatsGO.every((s) => pairBattleData.hp[s] <= 0);
    const allyHp = allySeatsGO.reduce((a, s) => a + Math.max(0, pairBattleData.hp[s]), 0);
    const allyFull = allySeatsGO.reduce((a, s) => a + (pairBattleData.chars[s].stats.startingPoints || MAX_HP), 0);
    const enemyHp = enemySeatsGO.reduce((a, s) => a + Math.max(0, pairBattleData.hp[s]), 0);
    const enemyFull = enemySeatsGO.reduce((a, s) => a + (pairBattleData.chars[s].stats.startingPoints || MAX_HP), 0);
    const survivors = totalSurvivors; // 表示用＝控えも含めた生存数
    const result = { cleared: !runEnds, koAny, hpRatio: allyFull ? allyHp / allyFull : 0, handsPlayed: game?.handNumber || 1 };
    const ctx = honestCtx; honestCtx = null;
    // ローグライトは「対局終了/優勝ペア」枠より、撃破/生存と敵HPを前面に（無報酬感の解消）。
    const bannerEl = overlay.querySelector(".go-banner");
    if (bannerEl) bannerEl.textContent = runEnds ? "ここで力尽きた……" : enemyAllDown ? "敵を撃破！" : "この階を耐え抜いた";
    const note = document.createElement("div");
    note.className = "go-tourney-note";
    note.textContent = runEnds
      ? "戦える味方が1人以下に。ランは没収される。"
      : `${enemyAllDown ? "敵を飛ばした！" : `敵に削り込み — 残りHP ${enemyHp.toLocaleString()} / ${enemyFull.toLocaleString()}`}　味方 ${survivors} 人生存`;
    btnsP.parentElement.insertBefore(note, btnsP);
    btnsP.appendChild(mkBtn(runEnds ? "決着（記録を残す）" : "次の階へ進む", "btn-tsumo", () => { overlay.classList.add("hidden"); ctx.onResult?.(result); }));
  } else if (honestCtx?.tournament && pairBattleData.unitIds) {
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
    btnsP.appendChild(mkBtn("🏠 対戦ホームへ", "btn-tsumo", () => { overlay.classList.add("hidden"); goScreen("battle-home-screen"); }));
    btnsP.appendChild(mkBtn("もう一度", "btn-skip", () => location.reload()));
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
// 能力のメーター表示（凌雲の盾など）。残数を ●(残り)/○(消費) のピップで描く。
// 枚数が多い(7以上)ときだけ「N/M」表記にフォールバック。status で色を変える。
function mkAbilityMeter(meter, status) {
  const m = document.createElement("span");
  m.className = "ability-meter" + (status ? " " + status : "");
  const { on = 0, max = 0, label = "" } = meter || {};
  let body;
  if (max > 0 && max <= 6) {
    body = "●".repeat(Math.max(0, on)) + "○".repeat(Math.max(0, max - on));
  } else {
    body = `${on}/${max}`;
  }
  m.textContent = label ? `${label} ${body}` : body;
  return m;
}
// 常時(パッシブ)能力の表示ノード。「常時」バッジ＋能力名＋（あれば）メーター。
// 能力パネルと自分立ち絵の常設バッジで共用する（cls で見た目を切り替え）。
function mkPassiveIndicator(a, cls = "") {
  const wrap = document.createElement("span");
  wrap.className = "passive-ind" + (cls ? " " + cls : "");
  const tag = document.createElement("span");
  tag.className = "passive-tag";
  tag.textContent = "常時";
  wrap.appendChild(tag);
  const name = document.createElement("span");
  name.className = "passive-name";
  name.textContent = a.name;
  wrap.appendChild(name);
  if (a.meter) wrap.appendChild(mkAbilityMeter(a.meter, a.status));
  return wrap;
}
// 常時能力のメーター（凌雲の盾など）の増減を覚えておき、変わった瞬間だけ演出を付ける。
// 減＝琥珀が砕ける／増＝編み直される。key は `席:能力id`。
const meterPrev = new Map();
// プレイヤー idx のパッシブ(常時)能力バッジを host に流し込む（既存内容はクリア）。
// 個人戦の立ち絵・団体/ペアの自ブロックで共用。cls でバッジの見た目を切り替える。
function renderPassiveBadges(host, idx, cls = "self-ability") {
  if (!host || !game) return;
  host.innerHTML = "";
  const list = online ? (online.opts?.abilityStatus || []) : game.abilityStatus(idx);
  for (const a of list) {
    if (a.visible === false) continue;
    if (a.activation !== "passive") continue;
    const node = mkPassiveIndicator(a, cls);
    // 盾が1枚減った/増えた瞬間を見せる（守りの資源が動いたことが分かるように）。
    const now = a.meter?.on;
    if (now != null) {
      const key = `${idx}:${a.id}`;
      const prev = meterPrev.get(key);
      if (prev != null && now !== prev) node.classList.add(now < prev ? "meter-break" : "meter-mend");
      meterPrev.set(key, now);
    }
    host.appendChild(node);
  }
}
// 自分立ち絵の上の「常設バッジ」を、人間プレイヤーのパッシブ能力で更新する。
// updateHpBoard から毎イベント呼ばれるので、盾の残数はリアルタイムに追従する。
function updateSelfAbilities() {
  renderPassiveBadges(el("self-abilities"), humanIndex);
}
function clearActions() {
  hideLuxScan(); // ルクスの走査計器は手番UIの再描画のたびに畳む（出すのは showLuxCandidates）
  hideKakehaBet(); // ルイナの賭場も同じ（出すのは showKakehaBets）
  el("action-bar").innerHTML = "";
  const ab = el("ability-bar");
  if (ab) ab.innerHTML = ""; // ability controls live in the side panel now
}

// ペア戦・相方への指示ウィンドウ。自分の能力ボタンの上に常時表示する。
//  ・「能力発動はおまかせ」トグル … ON=相方が自動で能力を撃つ / OFF=要請した時だけ撃つ
//  ・各能力の「発動要請」ボタン … OFF時のみ有効。パッシブは常時表示で要請不可、要件未達はグレー。
function renderPairCommandPanel(abilityBar) {
  if (!pairBattleData || online || !game) return;
  if (pairBattleData.isRoguelite && !rogueliteState?.armed) return; // 非武装(能力の源を温存)＝相方指示も出さない
  const seat = pairPartnerSeat();
  if (seat < 0) return; // ソロ卓は相方なし＝指示なし
  const list = game.abilityStatus(seat);
  const name = pairBattleData.chars?.[seat]?.name || game.players[seat]?.character?.name || "相方";

  const panel = document.createElement("div");
  panel.className = "pair-cmd";

  const head = document.createElement("div");
  head.className = "pair-cmd-head";
  head.textContent = `${name} への指示`;
  panel.appendChild(head);

  // おまかせトグル
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pair-cmd-toggle" + (pairPartnerAuto ? " on" : " off");
  toggle.innerHTML = `<span class="pair-cmd-knob"></span><span class="pair-cmd-toggle-label">能力発動はおまかせ <b>${pairPartnerAuto ? "ON" : "OFF"}</b></span>`;
  toggle.addEventListener("click", () => {
    pairPartnerAuto = !pairPartnerAuto;
    if (pairPartnerAuto) pairAbilityRequests.clear();
    showHumanActions();
  });
  panel.appendChild(toggle);

  const rows = document.createElement("div");
  rows.className = "pair-cmd-rows";
  const manual = list.filter((a) => a.activation !== "passive");
  const passive = list.filter((a) => a.activation === "passive");

  for (const a of manual) {
    const row = document.createElement("div");
    row.className = "pair-cmd-row";
    const nm = document.createElement("span");
    nm.className = "pair-cmd-name";
    nm.textContent = a.name + (a.maxCharges !== Infinity ? `（残${a.charges}）` : "");
    row.appendChild(nm);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pair-cmd-req";
    const requested = pairAbilityRequests.has(a.id);
    if (a.active) {
      btn.textContent = "発動中"; btn.disabled = true; btn.classList.add("is-active");
    } else if (pairPartnerAuto) {
      btn.textContent = "おまかせ中"; btn.disabled = true;
    } else if (!a.canActivate) {
      btn.textContent = "発動要請"; btn.disabled = true; // 要件未達＝グレー
    } else if (requested) {
      btn.textContent = "要請中…"; btn.classList.add("is-req");
    } else {
      btn.textContent = "発動要請";
    }
    btn.addEventListener("click", () => {
      if (pairAbilityRequests.has(a.id)) pairAbilityRequests.delete(a.id);
      else pairAbilityRequests.add(a.id);
      showHumanActions();
    });
    row.appendChild(btn);
    rows.appendChild(row);
  }

  for (const a of passive) {
    const row = document.createElement("div");
    row.className = "pair-cmd-row passive";
    const nm = document.createElement("span");
    nm.className = "pair-cmd-name";
    nm.textContent = a.name;
    row.appendChild(nm);
    const tag = document.createElement("span");
    tag.className = "pair-cmd-passive-tag";
    tag.textContent = "常時";
    row.appendChild(tag);
    rows.appendChild(row);
  }

  if (!manual.length && !passive.length) {
    const empty = document.createElement("div");
    empty.className = "pair-cmd-empty";
    empty.textContent = "指示できる能力はない。";
    rows.appendChild(empty);
  }
  panel.appendChild(rows);
  abilityBar.appendChild(panel);
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

// オート観戦トグル。ON で人間席を CPU AI に委ねる（stepTurn / stepCalls 側が autoPlay を
// 見て分岐）。団体戦を含む全対局で使用可（交代選択などのモーダルは従来どおり手動）。
let autoWired = false;
function initAutoToggle() {
  const btn = el("auto-btn");
  if (!btn) return;
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
      // 楼光の館では設定を保持＝次の対局も同じ（毎戦ONにし直す手間の解消）。
      if (pairBattleData?.isRoguelite) setRogueliteAutoPref(autoPlay);
      // OFF→ON を自分の手番中（=resolver 待ち）に押したら、待ちを畳んで AI に手を委ねる。
      // humanTurnResolver が立っていないとき（CPU待ち/自動ツモ切り中など）は何もしない。
      if (autoPlay && humanTurnResolver && game && game.phase === Phase.AWAIT_DISCARD && game.players[game.turn].isHuman) resolveHumanTurn(SWITCH_TO_AI);
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
      <span class="hp-delta" hidden></span>
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

  hpCells[i] = { cell: row, rank, base: main.querySelector(".hp-base"), fill: main.querySelector(".hp-fill"), val: main.querySelector(".hp-val"), delta: main.querySelector(".hp-delta") };
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
    // 大会中のみ「開始からの増減」を合計点の左に出す（緑=プラス / 赤=マイナス）。
    const deltaEl = document.createElement("span");
    deltaEl.className = "hp-delta tb-delta";
    deltaEl.hidden = true;
    header.appendChild(headLeft);
    header.appendChild(deltaEl);
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
    // 常時(パッシブ)能力の常設バッジ（自チームのみ／出場中メンバーの盾などを表示）。
    let passives = null;
    if (isMyTeam) {
      passives = document.createElement("div");
      passives.className = "tb-passives";
      block.appendChild(passives);
    }
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
    teamHpCells[pi] = { block, rankEl, totalEl, deltaEl, activeRow, activeFill, activeVal, talkBubble, benchRefs, passives };
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
    // 大会中は「増減（チーム点数−開始合計）」を表示（個人戦の hp-delta と同じ流儀）。
    if (refs.deltaEl && teamBattleData.isTournament) {
      const d = teamScore - fullTeam;
      refs.deltaEl.textContent = (d > 0 ? "+" : d < 0 ? "" : "±") + d.toLocaleString();
      refs.deltaEl.className = "hp-delta tb-delta " + (d > 0 ? "up" : d < 0 ? "dn" : "");
      refs.deltaEl.hidden = false;
    }
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
    // 自チームの常設バッジ（出場中メンバー＝人間プレイヤーの常時能力・盾の残数）を同期。
    if (refs.passives) renderPassiveBadges(refs.passives, humanIndex, "tb-passive");
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
// 自陣の和了抑止トグル2種（右サイドメニュー）。味方相互の自摸被弾を避ける戦術操作。
function buildPairWinPolicyToggles() {
  const wrap = document.createElement("div");
  wrap.className = "pb-winpolicy";
  const mk = (key, label, hint) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pb-wp-toggle" + (pairWinPolicy[key] ? " on" : "");
    b.innerHTML = `<span class="pb-wp-dot"></span><span class="pb-wp-lbl">${label}</span>`;
    b.title = hint;
    b.setAttribute("aria-pressed", String(!!pairWinPolicy[key]));
    b.addEventListener("click", () => {
      pairWinPolicy[key] = !pairWinPolicy[key];
      // 2つは排他（完全防御 と ロンのみ）。一方をONにしたら他方はOFFに整える。
      if (key === "noWin" && pairWinPolicy.noWin) pairWinPolicy.noAllyRon = false;
      if (key === "noAllyRon" && pairWinPolicy.noAllyRon) pairWinPolicy.noWin = false;
      b.classList.toggle("on", pairWinPolicy[key]);
      b.setAttribute("aria-pressed", String(!!pairWinPolicy[key]));
      applyPairWinPolicy();
      // 自分の手番中なら行動ボタンを即再描画（ツモ/ロン候補の出し分けを反映）。
      if (game && game.turn === humanIndex && game.phase === "await-discard") showHumanActions();
      // 表示状態を揃えるため両トグルを描き直す。
      const sib = wrap.querySelectorAll(".pb-wp-toggle");
      sib.forEach((el2) => { const k = el2.dataset.k; if (k) { el2.classList.toggle("on", pairWinPolicy[k]); el2.setAttribute("aria-pressed", String(!!pairWinPolicy[k])); } });
    });
    b.dataset.k = key;
    return b;
  };
  const toggles = document.createElement("div");
  toggles.className = "pb-wp-body";
  toggles.appendChild(mk("noWin", "和了しない", "自陣は一切和了しない（ロンもツモも控える＝完全防御）"));
  toggles.appendChild(mk("noAllyRon", "自分からあがらない", "相棒の捨て牌ではロンしない（味方から点を奪わない）。敵へのロン・自分のツモは可。"));
  // 上級者向けの戦術トグルは既定で折りたたむ（初心者が「なぜ和了しない？」と混乱しないように）。
  // 何か有効なら開いた状態で出す（設定中だと一目で分かる）。
  const open = pairWinPolicy.noWin || pairWinPolicy.noAllyRon;
  const head = document.createElement("button");
  head.type = "button";
  head.className = "pb-wp-head" + (open ? " open" : "");
  head.innerHTML = `<span class="pb-wp-caret">▸</span>味方の方針${open ? '<span class="pb-wp-on-dot"></span>' : ""}`;
  head.title = "味方の和了をあえて控える戦術（味方への自摸被弾を避ける等）。分からなければ触らなくてOK。";
  toggles.hidden = !open;
  head.addEventListener("click", () => { const o = toggles.hidden; toggles.hidden = !o; head.classList.toggle("open", o); });
  wrap.appendChild(head);
  wrap.appendChild(toggles);
  return wrap;
}

// 和了抑止トグルを現在の game へ反映。自陣（人間と同じペア）の席にだけ適用する。
function applyPairWinPolicy() {
  if (!game) return;
  game.noWinSeats.clear();
  game.noRonFromSeats.clear();
  if (!pairBattleData) return; // ペア戦/楼光の館のみ
  const myPair = pairBattleData.pairOf[humanIndex];
  const allySeats = pairBattleData.pairOf.map((p, i) => (p === myPair ? i : -1)).filter((i) => i >= 0);
  for (const s of allySeats) {
    if (pairWinPolicy.noWin) game.noWinSeats.add(s);
    // 自分からあがらない＝自陣の他席（相棒）の捨て牌はロンしない。
    if (pairWinPolicy.noAllyRon) game.noRonFromSeats.set(s, new Set(allySeats.filter((x) => x !== s)));
  }
}

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
    labelSpan.textContent = pairBattleData.solo ? (isMine ? "▶ あなた" : "敵") : (isMine ? "▶ 自ペア" : "相手ペア");
    headLeft.appendChild(rankEl);
    headLeft.appendChild(labelSpan);
    const totalEl = document.createElement("span");
    totalEl.className = "tb-total";
    // 大会中のみ「開始からの増減」を合計点の左に出す（団体戦ボードと同じ流儀）。
    const deltaEl = document.createElement("span");
    deltaEl.className = "hp-delta tb-delta";
    deltaEl.hidden = true;
    header.appendChild(headLeft);
    header.appendChild(deltaEl);
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
    // 常時(パッシブ)能力の常設バッジ（自ペアのみ／自席の盾などを表示）。
    let passives = null;
    if (isMine) {
      passives = document.createElement("div");
      passives.className = "tb-passives";
      block.appendChild(passives);
      if (!pairBattleData.solo) block.appendChild(buildPairWinPolicyToggles()); // 和了抑止トグル（相方がいるペア戦のみ）
    }
    // セリフ吹き出し（自ペアのみ・Phase3で発火）
    let talkBubble = null;
    if (isMine) {
      talkBubble = document.createElement("div");
      talkBubble.className = "tb-talk hidden";
      block.appendChild(talkBubble);
    }
    board.appendChild(block);
    pairHpCells[pid] = { block, rankEl, totalEl, deltaEl, memberRefs, talkBubble, passives };
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
    // 大会中は「増減（ペア点数−開始合計）」を表示。
    if (refs.deltaEl && pairBattleData.isTournament) {
      const d = score - fullPair;
      refs.deltaEl.textContent = (d > 0 ? "+" : d < 0 ? "" : "±") + d.toLocaleString();
      refs.deltaEl.className = "hp-delta tb-delta " + (d > 0 ? "up" : d < 0 ? "dn" : "");
      refs.deltaEl.hidden = false;
    }
    // ペア点数の順位＝並び順＋メダル
    const rank = rankByPair[pid];
    refs.block.style.order = rank;
    refs.rankEl.textContent = rank + 1;
    refs.rankEl.className = "tb-rank m" + (rank + 1);
    // 自ペアの常設バッジ（自席＝人間プレイヤーの常時能力・盾の残数）を同期。
    if (refs.passives) renderPassiveBadges(refs.passives, humanIndex, "tb-passive");
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
    applyPortraitCrop(img, c);
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
  updateSelfAbilities(); // 自分立ち絵の常設バッジ（常時能力・盾の残数）も同期
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
    // 大会中は「増減（現在−開始持ち点）」を色付きで表示（緑=プラス / 赤=マイナス）。
    if (ref.delta) {
      if (honestCtx?.tournamentInfo) {
        const d = p.points - (p.character.stats.startingPoints || 0);
        const sign = d > 0 ? "+" : d < 0 ? "" : "±";
        ref.delta.textContent = `増減 ${sign}${d.toLocaleString()}`;
        ref.delta.className = "hp-delta " + (d > 0 ? "up" : d < 0 ? "dn" : "");
        ref.delta.hidden = false;
      } else if (!ref.delta.hidden) {
        ref.delta.hidden = true;
      }
    }
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
// 表示尺は文字数で伸縮（短文≈4.2s〜長文は最大8s）。牌に集中していても読み切れるように
// ＝「相棒の声が一瞬で消える」を防ぐ（共在感の核。UXテストでの最重要指摘）。ms 明示で固定も可。
function talkDwellMs(text) {
  return Math.min(8000, 3200 + (text?.length || 0) * 110);
}
function showSelfTalk(text, ms) {
  const box = el("self-talk");
  if (!box || !text) return false;
  box.textContent = text;
  box.classList.add("show");
  clearTimeout(selfTalkTimer);
  selfTalkTimer = setTimeout(() => box.classList.remove("show"), ms ?? talkDwellMs(text));
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
// 相方（自ペアの非人間席）の席index。pairPartnerId と対。-1=ペア戦でない/未解決。
function pairPartnerSeat() {
  if (!pairBattleData) return -1;
  const myPair = pairBattleData.pairOf[humanIndex];
  const seat = pairBattleData.pairs[myPair].seats.find((s) => s !== humanIndex);
  return seat == null ? -1 : seat;
}
function pairPartnerId() {
  const seat = pairPartnerSeat();
  return seat >= 0 ? pairBattleData.chars[seat].id : null;
}
// 「発動要請」キューを相方の手番で消費：撃てる能力だけ発動し、未達なら要請を残す（次手番で再試行）。
function drainPartnerAbilityRequests(game, seat) {
  if (!pairAbilityRequests.size) return [];
  const actor = game.players[seat];
  const api = game.abilities.apiFor(actor);
  const aiPicks = decideAbilityActivations(game, seat); // 対象/賭け金などの良い選択を再利用
  const out = [];
  for (const id of [...pairAbilityRequests]) {
    const ab = (actor.abilities || []).find((a) => a.id === id);
    if (!ab || ab.activation !== "manual") { pairAbilityRequests.delete(id); continue; }
    if (!ab.canActivate(api)) continue; // まだ撃てない（要件未達）。要請は保持し次手番で再試行。
    const pick = aiPicks.find((p) => p.id === id);
    out.push(pick || { id, params: {} });
    pairAbilityRequests.delete(id);
  }
  return out;
}
function showPartnerTalk(text, ms) {
  if (!text || !pairHpCells || !pairBattleData) return;
  const myPair = pairBattleData.pairOf[humanIndex];
  const bubble = pairHpCells[myPair]?.talkBubble;
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.remove("hidden");
  clearTimeout(partnerTalkTimer);
  partnerTalkTimer = setTimeout(() => bubble.classList.add("hidden"), ms ?? talkDwellMs(text)); // 文字数で伸縮（相方の声も読み切れる）
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
  tableBanterDone = false;   // 卓上の掛け合いは1対局に1回（東1局で消化）
  meterPrev.clear();         // 盾など常時メーターの増減演出は対局ごとに取り直す
  shioriMiss = null;         // 栞の「答え合わせ」は対局ごとに取り直す
  betLostPending = null;     // 賭けの落とし前も対局をまたいで持ち越さない
  resetShioriReview();       // 予約済みの表示・開きっぱなしのモーダルも対局開始で解除

  // 「前の局」の結果を人間視点で記録（次局以降の相槌が ctx.lastHandResult で参照）。
  g.bus.on(Events.HAND_WON, (r) => { lastHandResult = deriveHandResult(r); noteShioriResult(lastHandResult); noteBetOutcome(lastHandResult); });
  g.bus.on(Events.HAND_DRAWN, () => { lastHandResult = "draw"; noteShioriResult("draw"); noteBetOutcome("draw"); });

  // 局のはじまり：配牌直後に一言（シャッフルSEと被らないよう少し遅らせる）。
  g.bus.on(Events.HAND_STARTED, () => {
    resetMatchTalk();
    matchTalk.prevShanten = humanShanten(); // 配牌時のシャンテンを基準に
    // 前局で張った賭けが実らなかったなら、局頭の一言をその落とし前に差し替える
    // （§11-3-3。和了画面と重ねず、次の局で一度だけ引きずる＝外した局にも結末をつける）。
    setTimeout(() => { if (!fireBetLostTalk()) fireSelfTalk("handStart", { force: true }); }, 1200);
    // ペア戦: 相方が局頭に声をかける（自分のひと言と被らないよう少しずらす）。
    setTimeout(() => firePartnerTalk("allyHandStart"), 2200);
    maybeTableBanter(); // 掛け合いが成立するペア（姚玖×春嬋など）が同卓なら一度だけ
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
    if (!matchTalk.wasTenpai && sh === 0) {
      matchTalk.wasTenpai = true;
      fireSelfTalk("tenpai", { force: true });
      if (humanAbilityActive("chunchan")) playSprintFlash(); // 春嬋: 走り切った一閃「——間に合った」
      maybeFlameWeakTalk(); // 焔: 火が細いまま聴牌したら「このままでは燃えない」
      setTimeout(() => firePartnerTalk("allyTenpai"), 900);
    }
    else if (matchTalk.wasTenpai && sh > 0) { matchTalk.wasTenpai = false; fireSelfTalk("tenpaiDrop", { force: true }); }

    if (sh < matchTalk.prevShanten) {
      matchTalk.improveRun++;
      matchTalk.lastImprove = matchTalk.discards;
      if (sh > 0) bumpSprintStep(); // 春嬋: 距離が詰まるたび足跡（聴牌の一歩だけは一閃に譲る）
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
