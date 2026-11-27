// ホーム (battle-home) — タイトルの次に来る、全モードのハブ。
//
// タイトル ― ホーム ― CPU対戦 / オンライン / 楼光の館 / 師弟モード / 宝珠ショップ / 設定
// どのモードへもここから1手で行き、どのモードからもここへ帰ってくる。
// 遊びの入口（対局開始／師弟モード／楼光の館）は同じ大きさで同列に並べ、
// オンラインと宝珠ショップは絵札の上の小さな操作列に置く。
// 主役は「お気に入りキャラ」の立ち絵＋出迎えセリフ。出入りのたびに相棒の前を通る＝
// 愛着の蓄積（毎回顔を合わせる）×固有性（あなたを覚えている）×双方向（タップで返る）。
//
//   import { showBattleHome } from "./screens/battleHomeScreen.js";
//   showBattleHome(container, { repository, onCpu, onOnline, onMentor, onRoguelite, onShop, onSettings, onTitle });
//     onCpu()      … CPU対戦（フリー対戦の準備画面）へ
//     onOnline()   … オンライン対戦へ（ログイン/名前ゲートは呼び出し側で）
//     onMentor()   … 師弟モードへ
//     onSettings() … 設定へ（もどるでホームに帰る）
//     onTitle()    … タイトルへ
//
// 設計メモ:
//  - 1280×720 固定。上段は相棒のいる風景と会話、下段は遊びを選ぶ三枚の絵札。
//  - お気に入りは profile.favoriteCharId に保存。未選択は絆最上位→CHARACTERS[0] で補う。
//  - セリフは home(固有性)/homeChat(雑談)/homeTap(タップ) を pickVoiceLine で解決。
//    固有性を主軸に約7割で優先し、無ければ雑談へフォールバック（両軸：固有性＋雑談ストック）。
import { CHARACTERS } from "../characters/characters.js";
import { pickVoiceLine } from "../data/voiceLines.js";
import { topPlayStyle, bondProgressFrac, bondPtView } from "../progression/companionBond.js";
import { bondBandLabel } from "../progression/progressionService.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { HOME_BGM_CHOICES } from "../ui/assets.js";
import { homeTuneOf } from "../data/imagePos.js";
import { mountCharacterCatalog } from "../ui/characterCatalog.js";

// 相棒の後ろに表示する背景。未設定のときは先頭の道場で出迎える。
// thumb=一覧モーダルのサムネ。locked を付ければ将来の解禁機能でロック表示にできる（後述 isUnlocked）。
const HOME_BG_CHOICES = [
  { key: "dojo",   label: "道場",   img: "graphic/bg/bg-dojo.png",   thumb: "graphic/bg/bg-dojo.png" },
  { key: "washi",  label: "青海波", img: "graphic/ui/sc/bg.png",     thumb: "graphic/ui/sc/bg.png" },
  { key: "street", label: "街角",   img: "graphic/bg/bg-street.png", thumb: "graphic/bg/bg-street.png" },
  // 宝珠ショップで解禁する背景（locked=既定は施錠。profile.unlockedBackgrounds に key が入れば解放）。
  { key: "washitsu", label: "和室",       img: "graphic/bg/sc/bg-washitsu.jpg", thumb: "graphic/bg/sc/bg-washitsu.jpg", locked: true },
  { key: "cafe",     label: "喫茶店",     img: "graphic/bg/sc/bg-cafe.jpg",     thumb: "graphic/bg/sc/bg-cafe.jpg",     locked: true },
  { key: "ryokan",   label: "旅館の和室", img: "graphic/bg/sc/bg-ryokan.jpg",   thumb: "graphic/bg/sc/bg-ryokan.jpg",   locked: true },
  { key: "kyudo",       label: "弓道場",       img: "graphic/bg/sc/bg-kyudo.jpg",           thumb: "graphic/bg/sc/bg-kyudo.jpg",           locked: true },
  { key: "festival",    label: "縁日",         img: "graphic/bg/sc/bg-festival.jpg",        thumb: "graphic/bg/sc/bg-festival.jpg",        locked: true },
  { key: "bar",         label: "バー",         img: "graphic/bg/sc/bg-bar.jpg",             thumb: "graphic/bg/sc/bg-bar.jpg",             locked: true },
  { key: "restaurant",  label: "レストラン",   img: "graphic/bg/sc/bg-restaurant.jpg",      thumb: "graphic/bg/sc/bg-restaurant.jpg",      locked: true },
  { key: "park",        label: "公園",         img: "graphic/bg/sc/bg-park.jpg",            thumb: "graphic/bg/sc/bg-park.jpg",            locked: true },
  { key: "city",        label: "夜景",         img: "graphic/bg/sc/bg-city.jpg",            thumb: "graphic/bg/sc/bg-city.jpg",            locked: true },
  { key: "station",     label: "駅",           img: "graphic/bg/sc/bg-station.jpg",         thumb: "graphic/bg/sc/bg-station.jpg",         locked: true },
  { key: "train",       label: "電車",         img: "graphic/bg/sc/bg-train.jpg",           thumb: "graphic/bg/sc/bg-train.jpg",           locked: true },
  { key: "convenience", label: "コンビニ",     img: "graphic/bg/sc/bg-convenience.jpg",     thumb: "graphic/bg/sc/bg-convenience.jpg",     locked: true },
  { key: "arcade",      label: "ゲームセンター", img: "graphic/bg/sc/bg-arcade.jpg",         thumb: "graphic/bg/sc/bg-arcade.jpg",          locked: true },
  { key: "classroom",   label: "教室",         img: "graphic/bg/sc/bg-classroom.jpg",       thumb: "graphic/bg/sc/bg-classroom.jpg",       locked: true },
  { key: "clubroom",    label: "部室",         img: "graphic/bg/sc/bg-clubroom.jpg",        thumb: "graphic/bg/sc/bg-clubroom.jpg",        locked: true },
  { key: "corridor",    label: "学校の廊下",   img: "graphic/bg/sc/bg-school-corridor.jpg", thumb: "graphic/bg/sc/bg-school-corridor.jpg", locked: true },
  { key: "gate",        label: "校門",         img: "graphic/bg/sc/bg-school-gate.jpg",     thumb: "graphic/bg/sc/bg-school-gate.jpg",     locked: true },
  { key: "rooftop",     label: "屋上",         img: "graphic/bg/sc/bg-school-rooftop.jpg",  thumb: "graphic/bg/sc/bg-school-rooftop.jpg",  locked: true },
  { key: "campus",      label: "学び舎",       img: "graphic/bg/sc/bg-campus.jpg",          thumb: "graphic/bg/sc/bg-campus.jpg",          locked: true },
  { key: "blackboard",  label: "黒板",         img: "graphic/bg/sc/bg-blackboard.jpg",      thumb: "graphic/bg/sc/bg-blackboard.jpg",      locked: true },
  { key: "ruins",       label: "遺跡",         img: "graphic/bg/sc/bg-ruins.jpg",           thumb: "graphic/bg/sc/bg-ruins.jpg",           locked: true },
  { key: "dungeon",     label: "ダンジョン",   img: "graphic/bg/sc/bg-dungeon.jpg",         thumb: "graphic/bg/sc/bg-dungeon.jpg",         locked: true },
  { key: "hideout",     label: "アジト",       img: "graphic/bg/sc/bg-hideout.jpg",         thumb: "graphic/bg/sc/bg-hideout.jpg",         locked: true },
  { key: "basement",    label: "地下室",       img: "graphic/bg/sc/bg-basement.jpg",        thumb: "graphic/bg/sc/bg-basement.jpg",        locked: true },
  // げーむまてりあるず・白い雀荘シリーズ（ショップの高級ライン）。
  { key: "parlor",         label: "雀荘",           img: "graphic/bg/sc/bg-parlor.jpg",         thumb: "graphic/bg/sc/bg-parlor.jpg",         locked: true },
  { key: "parlornatural",  label: "雀荘（木漏れ）", img: "graphic/bg/sc/bg-parlor-natural.jpg", thumb: "graphic/bg/sc/bg-parlor-natural.jpg", locked: true },
  { key: "parlorhall",     label: "雀荘（大広間）", img: "graphic/bg/sc/bg-hall.jpg",           thumb: "graphic/bg/sc/bg-hall.jpg",           locked: true },
  { key: "parlornoir",     label: "雀荘（黒革）",   img: "graphic/bg/sc/bg-parlor-noir.jpg",    thumb: "graphic/bg/sc/bg-parlor-noir.jpg",    locked: true },
];

// 解禁判定。locked でなければ常に解放。locked は宝珠ショップで買った key（profile.unlocked*）を見る。
// 背景キーとBGMキーは衝突しないので両配列の和で判定（呼び出し側は bg/bgm 双方からこの1関数を使う）。
function isUnlocked(item, profile) {
  if (!item?.locked) return true;
  const u = profile || {};
  return (u.unlockedBackgrounds || []).includes(item.key) || (u.unlockedBgms || []).includes(item.key);
}

const selectableChars = () => CHARACTERS.filter((c) => !c.isMob);
const charById = (id) => CHARACTERS.find((c) => c.id === id) || null;

// 絆が最も育っているキャラ id（未選択時のフォールバック）。main.js の topCompanionId と同ロジック。
function topBondId(bonds) {
  let topId = null, topKey = -1;
  for (const [id, b] of Object.entries(bonds || {})) {
    const key = (b?.level ?? 1) * 1e7 + (b?.exp ?? 0);
    if (key > topKey) { topKey = key; topId = id; }
  }
  return topId;
}

// 出迎えセリフの解決 ctx（履歴を見て「あなたを覚えている」を出す材料）。
function buildHomeCtx(profile, charId) {
  const bonds = profile?.companionBonds || {};
  const hist = profile?.playerHistory || {};
  return {
    companionBondLevel: bonds[charId]?.level ?? 1,
    winStreak: hist.winStreak ?? 0,
    loseStreak: hist.loseStreak ?? 0,
    playStyleTag: topPlayStyle(hist),
    firstMeet: (hist.totalMatches ?? 0) === 0,
  };
}

// 固有性(home)を主軸に、約7割で優先。無ければ雑談(homeChat)へフォールバック。
function pickHomeGreeting(charId, ctx) {
  const special = pickVoiceLine(charId, "home", ctx);
  const chat = pickVoiceLine(charId, "homeChat", {});
  if (special && (Math.random() < 0.7 || !chat)) return special;
  return chat || special || "……。";
}

// 動的値の最小エスケープ（キャラ名など）。
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 対戦ホームの立ち絵フレーミングのキャラ別微調整（バストアップ時に人物が中心からズレる子を寄せる）。
//   x: 横方向の translate（自身サイズ比%。＋で右へ） / y: 縦方向（＋で下へ） / zoom: 拡大率。未指定=無補正。
//   ※ 正式な調整先は characterMaster の imagePos.home（開発ツール tools/offset-tuner.html の出力先）。
//     下表はそれが未設定のキャラ用の既定フォールバックとして残す（既存値は master へ移管済み）。
const HOME_PORTRAIT_TUNE = {
  bibi: { x: "12%" }, // 人物が左に寄っているため右へ寄せる
  chun_chan: { x: "-18%", zoom: 1.1 },           // 全身・前傾ポーズで顔が右上＝左へ寄せて顔を中央に。寄りすぎず上半身を見せる
  yao_chu: { x: "18%", zoom: 1.12 },             // 全身立ち・顔が左寄り＝右へ寄せてバストアップ
  doranie: { zoom: 0.82 },                       // 全身立ち＝引いて頭光輪〜胸元のバストアップに収める（顔は上中央）
};
// 適用順: characterMaster の imagePos.home（開発ツールの出力先）を最優先、無ければ
// 下の HOME_PORTRAIT_TUNE を既定として使う。どちらも未設定なら無補正。
function applyPortraitTune(img, c) {
  const t = homeTuneOf(c, HOME_PORTRAIT_TUNE[c?.id] || {});
  if (t.x) img.style.setProperty("--bh-x", t.x);
  if (t.y) img.style.setProperty("--bh-y", t.y);
  if (t.zoom) img.style.setProperty("--bh-zoom", String(t.zoom));
}

// 立ち絵 <img>（宣言パス→失敗時は単色＋頭文字のフォールバック）。makeCharPortrait と同方針。
function portraitNode(c) {
  const path = c?.assets?.portrait;
  if (path) {
    const img = document.createElement("img");
    img.className = "bh-portrait";
    img.src = path;
    img.alt = c.name || "";
    applyPortraitTune(img, c); // キャラ別フレーミング微調整（offset/zoom）
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = "bh-portrait bh-portrait-fallback";
      fb.style.background = c.color || "#444";
      fb.textContent = (c.name || "?").slice(0, 1);
      img.replaceWith(fb);
    };
    return img;
  }
  const fb = document.createElement("div");
  fb.className = "bh-portrait bh-portrait-fallback";
  fb.style.background = c?.color || "#444";
  fb.textContent = (c?.name || "?").slice(0, 1);
  return fb;
}

export async function showBattleHome(container, opts = {}) {
  const { repository, audio, loggedIn = false, onCpu, onOnline, onMentor, onRoguelite, onShop, onSettings, onTitle } = opts;
  if (!container) return;

  let profile = null;
  try { profile = await repository?.loadProfile?.(); } catch { /* 未ログイン/失敗は既定で描く */ }

  // 背景・BGM の現在キー（未設定は既定）。手動スイッチャーで切替→profile へ保存。
  let bgKey, bgmKey;

  const favId =
    profile?.favoriteCharId ||
    topBondId(profile?.companionBonds) ||
    selectableChars()[0]?.id ||
    CHARACTERS[0]?.id;
  let current = charById(favId) || selectableChars()[0] || CHARACTERS[0];

  // 情報パネル用のデータ。「一緒に」/絆は current 依存＝paint 時に更新。プレイヤー名/連勝は横断。
  const hist = profile?.playerHistory || {};
  const displayName = String(profile?.profile?.displayName || "").trim() || "あなた";
  const winStreak = hist.winStreak ?? 0;
  const disciple = activeAvatar(profile);
  const discipleIcon = presetById(disciple?.presetIds?.icon)?.assetPath || "graphic/chars/deshi_set/icon/deshi_1.png";
  const mentorIcon = charById(disciple?.mentorCharacterId)?.assets?.icon || "graphic/chars/deshi_set/icon/deshi_8.png";
  const bestFloor = Number(profile?.roguelite?.bestFloor) || 0;

  container.innerHTML = `
    <div class="battle-home">
      <section class="bh-stage" aria-label="相棒のいる場所">
        <img class="bh-backdrop" alt="">
        <header class="bh-header">
          <div class="bh-brand"><img src="graphic/tiles/Chun.svg" alt=""><span>ツモノグリフ</span></div>
          <div class="bh-player"><span class="bh-info-k">プレイヤー</span><span id="bh-name"></span></div>
          <span class="bh-streak" id="bh-streak-row" hidden><span id="bh-streak"></span></span>
          <nav class="bh-util" aria-label="ホームの設定">
            <button type="button" class="bh-framed bh-amb-edit" id="bh-amb-edit"><span class="bh-location"></span><span class="bh-amb-caption">背景・BGM</span></button>
            <button type="button" class="bh-system" id="bh-settings" title="音量・テスト版の窓口">設定</button>
            <button type="button" class="bh-system" id="bh-title">タイトル</button>
          </nav>
        </header>
        <button type="button" class="bh-portrait-wrap" id="bh-portrait-wrap"></button>
        <div class="bh-companion">
          <div class="bh-dialogue">
            <h2 class="bh-charname" id="bh-charname"></h2>
            <p class="bh-talk" id="bh-talk" aria-live="polite"></p>
          </div>
          <div class="bh-info">
            <div class="bh-info-row bh-info-row--bond"><span class="bh-info-k">絆</span><div class="bh-bond-col"><span class="bh-info-v bh-bond" id="bh-bond"></span><div class="bh-bond-gauge" id="bh-bond-gauge" hidden><div class="bh-bond-fill" id="bh-bond-fill"></div></div></div></div>
            <div class="bh-info-row bh-info-row--together"><span class="bh-info-k">一緒に</span><span class="bh-info-v" id="bh-together"></span></div>
            <button type="button" class="bh-speak" id="bh-speak">話しかける</button>
            <button type="button" class="bh-change" id="bh-change"><span class="bh-yukiwa" aria-hidden="true">⇄</span>相棒をかえる</button>
          </div>
        </div>
      </section>
      <nav class="bh-deck" aria-labelledby="bh-modes-heading">
        <div class="bh-deck-head">
          <h1 class="bh-title" id="bh-modes-heading">モード選択</h1>
          <div class="bh-route-grid">
            <button type="button" class="bh-route bh-framed" id="bh-online" title="合言葉・マッチングで対戦">オンライン</button>
            <button type="button" class="bh-route bh-framed" id="bh-shop" title="宝珠で恒久強化・背景やBGMを解禁">宝珠ショップ</button>
          </div>
        </div>
        <div class="bh-modes">
          <button type="button" class="bh-mode" id="bh-cpu">
            <span class="bh-mode-art bh-table" aria-hidden="true">
              <span class="bh-discards"><img src="graphic/tiles/Ton.svg" alt=""><img src="graphic/tiles/Pin3.svg" alt=""><img src="graphic/tiles/Sou7.svg" alt=""></span>
              <span class="bh-hand"><img src="graphic/tiles/Sou1.svg" alt=""><img src="graphic/tiles/Man5-Dora.svg" alt=""><img src="graphic/tiles/Chun.svg" alt=""></span>
            </span>
            <span class="bh-mode-title">対局開始</span><span class="bh-mode-sub">CPU対戦 · 通常／ペア／団体</span>
          </button>
          <button type="button" class="bh-mode" id="bh-mentor">
            <span class="bh-mode-art bh-disciples" aria-hidden="true">
              <img class="bh-mode-scene" src="graphic/bg/sc/bg-kyudo.jpg" alt="">
              <img class="bh-pupil bh-pupil-far" src="${esc(mentorIcon)}" alt="">
              <img class="bh-pupil bh-pupil-near" src="${esc(discipleIcon)}" alt="">
            </span>
            <span class="bh-mode-title">師弟モード</span><span class="bh-mode-sub">${disciple?.name ? esc(disciple.name) + "の修行" : "あなたが弟子になるサクセスストーリー"}</span>
          </button>
          <button type="button" class="bh-mode" id="bh-roguelite">
            <span class="bh-mode-art" aria-hidden="true"><img class="bh-mode-scene" src="graphic/bg/sc/bg-dungeon.jpg" alt=""></span>
            <span class="bh-mode-title">楼光の館</span><span class="bh-mode-sub">${bestFloor > 0 ? `最深到達　第 ${bestFloor} 階` : "仲間と登るローグライト"}</span>
          </button>
        </div>
      </nav>
    </div>`;

  const talkEl = container.querySelector("#bh-talk");
  const wrap = container.querySelector("#bh-portrait-wrap");
  const bondEl = container.querySelector("#bh-bond");
  const bondGaugeEl = container.querySelector("#bh-bond-gauge");
  const bondFillEl = container.querySelector("#bh-bond-fill");
  const togetherEl = container.querySelector("#bh-together");
  const setTalk = (t) => { if (talkEl) talkEl.textContent = t || "……。"; };
  const nameplateEl = container.querySelector("#bh-charname");

  // 背景・BGM の切替はヘッダー（設定の隣）。いまの組み合わせはボタンのツールチップで見せる。
  const ambBtn = container.querySelector("#bh-amb-edit");
  const backdrop = container.querySelector(".bh-backdrop");
  const locationEl = container.querySelector(".bh-location");
  let bgLabel = "", bgmLabel = "";
  const syncAmbTitle = () => { if (ambBtn) ambBtn.title = `背景：${bgLabel}／BGM：${bgmLabel}`; };

  // キャラ非依存の情報は一度だけ。
  container.querySelector("#bh-name").textContent = displayName;
  if (winStreak > 0) {
    container.querySelector("#bh-streak-row").hidden = false;
    container.querySelector("#bh-streak").textContent = `${winStreak} 連勝`;
  }

  // 立ち絵とは兄弟の要素なので、相棒変更で立ち絵を描き直しても背景はその場に残る。
  function applyBg(key) {
    const c = HOME_BG_CHOICES.find((x) => x.key === key) || HOME_BG_CHOICES[0];
    bgKey = c.key;
    backdrop.src = c.img;
    locationEl.textContent = c.label;
    bgLabel = c.label;
    syncAmbTitle();
  }
  function applyBgm(key, { play = false } = {}) {
    const c = HOME_BGM_CHOICES.find((x) => x.key === key) || HOME_BGM_CHOICES[0];
    bgmKey = c.key;
    bgmLabel = c.label;
    syncAmbTitle();
    if (play) audio?.playHomeBgmByKey?.(c.key);
  }
  applyBg(profile?.homeBg);
  applyBgm(profile?.homeBgm, { play: true }); // 入場時に選択中のBGMへ切替（ナビのクリック＝ジェスチャ済み）

  // 背景・BGM・相棒を続けて選んだときも、各変更を順番に最新のプロフィールへ反映する。
  let saving = Promise.resolve();
  function persist(patch) {
    saving = saving.then(async () => {
      const latest = (await repository?.loadProfile?.()) || profile;
      const next = { ...latest, ...patch };
      await repository?.saveProfile?.(next);
      profile = next;
    }).catch(() => { /* 保存失敗後も次の選択を受け付ける */ });
  }

  // 立ち絵＋相棒名＋絆＋出迎えセリフを current で描き直す。
  // 絆は帯名＋Lv実数＋pt(現在/次まで)で見せる（数値表示へ転換。ゲージ2周＝1帯のズレが
  // 数値なしでは伝わらなかったため。[[bond-display-hybrid-policy]] 改）。
  function paint() {
    wrap.innerHTML = "";
    wrap.appendChild(portraitNode(current));
    wrap.setAttribute("aria-label", `${current?.name || "相棒"}に話しかける`);
    // 立ち絵のそばに相棒の名前を出し、会話の話者を明確にする。
    if (nameplateEl) {
      nameplateEl.textContent = current?.name || "";
    }
    // 「一緒に」(キャラ別局数)・絆。未ログイン時もダッシュ(—)ではなく“始まりの言葉”で見せる
    // （数値レス方針 [[bond-display-hybrid-policy]]。ダッシュは「意味不明」とUXテストで指摘されたため、
    //   これから関係が育つことを言葉で伝える。計上は連携時のみ＝ [[companion-bond-system]] は不変）。
    const b = profile?.companionBonds?.[current.id];
    if (togetherEl) togetherEl.textContent = loggedIn ? `${b?.matches ?? 0} 局` : "これから";
    if (bondEl) {
      if (loggedIn) {
        const { lv, cur, need } = bondPtView(b || {});
        bondEl.innerHTML = `${bondBandLabel(b?.level ?? 1)}<span class="bh-bond-pt">Lv${lv}（${cur}/${need}）</span>`;
      } else {
        bondEl.textContent = "出会ったばかり";
      }
    }
    // 細ゲージ＝次のLvまでの進捗（pt の cur/need と一致。連携時のみ・未連携は隠す）。
    if (bondGaugeEl && bondFillEl) {
      bondGaugeEl.hidden = !loggedIn;
      if (loggedIn) bondFillEl.style.width = `${Math.round(bondProgressFrac(b || {}) * 100)}%`;
    }
    setTalk(pickHomeGreeting(current.id, buildHomeCtx(profile, current.id)));
  }
  paint();

  // 人物をタップしても会話窓から話しかけても、同じキャラの返事になる。
  function speak() {
    const ctx = buildHomeCtx(profile, current.id);
    const line = pickVoiceLine(current.id, "homeTap", ctx);
    if (line) setTalk(line);
  }
  wrap.addEventListener("click", speak);
  container.querySelector("#bh-speak").addEventListener("click", speak);

  // 導線。
  container.querySelector("#bh-cpu")?.addEventListener("click", () => onCpu?.());
  container.querySelector("#bh-online")?.addEventListener("click", () => onOnline?.());
  container.querySelector("#bh-mentor")?.addEventListener("click", () => onMentor?.());
  container.querySelector("#bh-roguelite")?.addEventListener("click", () => onRoguelite?.());
  container.querySelector("#bh-shop")?.addEventListener("click", () => onShop?.());
  container.querySelector("#bh-settings")?.addEventListener("click", () => onSettings?.());
  container.querySelector("#bh-title")?.addEventListener("click", () => onTitle?.());

  // 背景・BGM の「変更」→ 一覧モーダル（選択中ハイライト／将来は解禁状態も表示）。
  ambBtn?.addEventListener("click", () => {
    openAmbiance(container, {
      profile, bgKey, bgmKey,
      onPickBg: (key) => { applyBg(key); persist({ homeBg: key }); },
      onPickBgm: (key) => { applyBgm(key, { play: true }); persist({ homeBgm: key }); },
    });
  });

  // 「相棒をかえる」ピッカー（モーダル）。選んだら favoriteCharId を保存して即反映。
  container.querySelector("#bh-change")?.addEventListener("click", () => {
    openPicker(container, current?.id, profile, (picked) => {
      current = charById(picked) || current;
      paint();
      persist({ favoriteCharId: current.id });
    });
  });
}

// キャラが解禁済みか（locked でなければ常に true／locked は宝珠ショップ購入で profile.unlockedCharacters に積まれる）。
function isCharUnlocked(c, profile) {
  if (!c?.locked) return true;
  return (profile?.unlockedCharacters || []).includes(c.id);
}

// モーダル中はホームを操作対象から外し、閉じたら起点へフォーカスを戻す。
function mountHomeDialog(container, ov) {
  const opener = document.activeElement;
  const home = container.querySelector(".battle-home");
  container.appendChild(ov);
  if (home) home.inert = true;
  const card = ov.querySelector("[role=dialog]");
  const title = ov.querySelector(".bh-picker-title");
  title.id = "bh-dialog-title";
  card.setAttribute("aria-labelledby", title.id);
  const buttons = () => [...card.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")];
  const close = () => {
    ov.remove();
    if (home) home.inert = false;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  ov.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key !== "Tab") return;
    const items = buttons(), first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  ov.querySelector(".bh-picker-scrim")?.addEventListener("click", close);
  ov.querySelector(".bh-picker-x")?.addEventListener("click", close);
  (card.querySelector('button[aria-pressed="true"]:not(:disabled)') || buttons()[0])?.focus({ preventScroll: true });
  return close;
}

// お気に入りキャラ選択モーダル（アイコングリッド）。スクリム/✕/Esc で閉じる。
// 未解禁キャラ（宝珠ショップ前）は鍵・非アクティブで表示し、選べないようにする。
function openPicker(container, currentId, profile, onPick) {
  const ov = document.createElement("div");
  ov.className = "bh-picker";
  ov.innerHTML = `<div class="bh-picker-scrim"></div>
    <div class="bh-picker-card home-catalog-card" role="dialog" aria-modal="true">
      <h2 class="bh-picker-title">相棒をえらぶ</h2>
      <div class="home-catalog"></div>
      <button type="button" class="bh-picker-x" aria-label="閉じる">✕</button>
    </div>`;
  mountCharacterCatalog(ov.querySelector(".home-catalog"), {
    characters: selectableChars, isLocked: (c) => !isCharUnlocked(c, profile), initialId: currentId,
    describe: (c) => ({ active: c.id === currentId, badge: c.id === currentId ? "今の相棒" : "" }),
    onPick(c) { close(); onPick?.(c.id); },
  });
  const close = mountHomeDialog(container, ov);
}

// 背景・BGM 設定モーダル。一覧から選択（選択中ハイライト／ロックはグレーアウト＝解禁機能の拡張点）。
// 背景はサムネで選んで即プレビュー、BGM は選ぶとその場で試聴。モーダルは開いたまま何度でも試せる。
function openAmbiance(container, { profile, bgKey, bgmKey, onPickBg, onPickBgm }) {
  let curBg = bgKey, curBgm = bgmKey;

  const bgTile = (c) => {
    const ok = isUnlocked(c, profile);
    return `<button type="button" class="bh-amb-tile${c.key === curBg ? " is-selected" : ""}${ok ? "" : " is-locked"}"`
      + ` data-key="${esc(c.key)}" aria-pressed="${c.key === curBg}"${ok ? "" : " disabled"} style="background-image:url('${esc(c.thumb || "")}')">`
      + `<span class="bh-amb-tile-label">${esc(c.label)}${ok ? "" : " 🔒"}</span></button>`;
  };
  const bgmRow = (c) => {
    const ok = isUnlocked(c, profile);
    return `<button type="button" class="bh-amb-row bh-framed${c.key === curBgm ? " is-selected" : ""}${ok ? "" : " is-locked"}"`
      + ` data-key="${esc(c.key)}" aria-pressed="${c.key === curBgm}"${ok ? "" : " disabled"}>`
      + `<span class="bh-amb-row-name">${esc(c.label)}${ok ? "" : " 🔒"}</span>`
      + `<span class="bh-amb-row-cue" aria-hidden="true">▶</span></button>`;
  };

  const ov = document.createElement("div");
  ov.className = "bh-picker bh-amb-modal";
  ov.innerHTML =
    `<div class="bh-picker-scrim"></div>` +
    `<div class="bh-picker-card" role="dialog" aria-modal="true">` +
      `<h2 class="bh-picker-title">背景・BGM</h2>` +
      `<div class="bh-amb-sec"><div class="bh-amb-sec-h">背景</div>` +
        `<div class="bh-amb-grid" data-kind="bg">${HOME_BG_CHOICES.map(bgTile).join("")}</div></div>` +
      `<div class="bh-amb-sec"><div class="bh-amb-sec-h">BGM</div>` +
        `<div class="bh-amb-list" data-kind="bgm">${HOME_BGM_CHOICES.map(bgmRow).join("")}</div></div>` +
      `<button type="button" class="bh-picker-x" aria-label="閉じる">✕</button>` +
    `</div>`;
  mountHomeDialog(container, ov);

  const reselect = (sel, key) => {
    for (const b of ov.querySelectorAll(sel)) {
      b.classList.toggle("is-selected", b.dataset.key === key);
      b.setAttribute("aria-pressed", String(b.dataset.key === key));
    }
  };
  for (const b of ov.querySelectorAll(".bh-amb-grid [data-key]")) {
    b.addEventListener("click", () => { curBg = b.dataset.key; reselect(".bh-amb-grid [data-key]", curBg); onPickBg?.(curBg); });
  }
  for (const b of ov.querySelectorAll(".bh-amb-list [data-key]")) {
    b.addEventListener("click", () => { curBgm = b.dataset.key; reselect(".bh-amb-list [data-key]", curBgm); onPickBgm?.(curBgm); });
  }
  attachDragScroll(ov.querySelector(".bh-amb-grid"), "x"); // 背景=横スクロール
  attachDragScroll(ov.querySelector(".bh-amb-list"), "y"); // BGM=縦スクロール
}

// ドラッグ/スワイプ・スクロール（axis="x"|"y"）。タッチは overflow のネイティブ挙動に任せ（二重移動を
// 避ける）、マウスのみ手動ドラッグ。
// ★重要: pointerdown では何もしない。閾値(THRESH)を超えて初めて「ドラッグ」と判定し、その時だけ
//   setPointerCapture＋スクロール＋直後の click 抑止を行う。pointerdown で即キャプチャすると、純粋な
//   クリックでも pointer がストリップに捕捉され、子（タイル/行）の click＝選択が発火しなくなる（既出バグ）。
function attachDragScroll(strip, axis = "x") {
  if (!strip) return;
  const vert = axis === "y";
  const posOf = (e) => (vert ? e.clientY : e.clientX);
  const scrollProp = vert ? "scrollTop" : "scrollLeft";
  const THRESH = 6;
  let down = false, dragging = false, start = 0, startScroll = 0, pid = null;
  strip.addEventListener("pointerdown", (e) => {
    dragging = false;                                  // 開始時に必ずリセット（純クリック/タップを妨げない）
    if (e.pointerType === "touch") { down = false; return; } // タッチはネイティブ・スワイプ
    down = true; start = posOf(e); startScroll = strip[scrollProp]; pid = e.pointerId;
  });
  strip.addEventListener("pointermove", (e) => {
    if (!down) return;
    const d = posOf(e) - start;
    if (!dragging) {
      if (Math.abs(d) < THRESH) return;                // 閾値未満＝クリック扱い。キャプチャしない
      dragging = true; strip.classList.add("is-dragging");
      try { strip.setPointerCapture(pid); } catch { /* noop */ }
    }
    strip[scrollProp] = startScroll - d;
  });
  const end = () => {
    if (!down) return;
    down = false;
    if (dragging) { strip.classList.remove("is-dragging"); try { strip.releasePointerCapture(pid); } catch { /* noop */ } }
  };
  strip.addEventListener("pointerup", end);
  strip.addEventListener("pointercancel", end);
  // 実ドラッグの直後だけ click（選択）を握りつぶす。純粋なクリック/タップは通す。
  strip.addEventListener("click", (e) => { if (dragging) { e.stopPropagation(); e.preventDefault(); } }, true);
}
