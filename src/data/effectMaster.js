// スプライトエフェクトの台帳と「どの瞬間に・どれを・どの色で」の選定表（マスタ駆動）。
//
// 素材：空想曲線（こぱんだ）「ゲームエフェクト素材 01」192px 版（購入素材。有料素材はクレジット表記不要）。
//   原本は _assets-stock/effects/kuusou-kyokusen_gameeffect01_192/（.gitignore＝公開リポジトリには載せない）。
//   tools/build-effects.mjs が FX_TYPES に載せた色違いだけを graphic/fx/<種類>-<色>.avif
//   （1マス FX_CELL px の中央に 192px の1コマ・左上から横 frames/4 列 × 縦4行）へ組み直す。ここを書き換えたら
//   `node tools/build-effects.mjs` で作り直すこと。規約の要点と選定の理由は docs/sprite-effects.md。
//
// 演出の物差し（CLAUDE.md・docs/character-ingame-fx-plan.md と同じ）:
//   - 点棒＝HP。点が動く瞬間を「当たった／回復した」手応えにする（被弾＝打撃、和了＝回復）。
//   - 和了・リーチ・カンは打った人の色で響く（キャラ色の系統で色違いを引く）＝誰の一撃かが色で分かる。
//   - 能力は「そのキャラの視界を一局だけ貸す」。発動と、能力が効いた瞬間に、そのキャラだけの絵を置く。
//   - 進行は止めない（演出を待たない）。重ねるだけ＝連戦のテンポを殺さない。

export const FX_FRAME = 192; // 原本の1コマ（px）
export const FX_PAD = 4;     // アトラスのコマのまわりの透明な余白（px）。拡縮で隣のコマが滲まないように
export const FX_CELL = FX_FRAME + FX_PAD * 2;
export const FX_FPS = 24;    // 原本の再生速度（同梱「収録内容について.txt」）

// 種類ごとの原本番号・コマ数と、ゲームに載せる色違い（色の系統 → 色違い番号）。
// 原本の色違いの並びは 01=赤 02=黄(橙) 03=緑 04=青 05=紫 06=桃 or 白系 07=白（`node tools/build-effects.mjs survey`）。
// 載せる色を増やすときは variants に1行足してビルドし直すだけ。
export const FX_TYPES = {
  impact:     { no: 11, frames: 16, name: "衝撃",               variants: { red: 1, yellow: 2, green: 3, blue: 4, purple: 5, pink: 6, white: 7 } },
  wave:       { no: 13, frames: 16, name: "ショックウェーブ",    variants: { red: 1, yellow: 2, green: 3, blue: 4, purple: 5, pink: 6 } },
  bolt:       { no: 12, frames: 16, name: "衝撃_稲妻",          variants: { yellow: 2, blue: 4 } },
  hit:        { no: 7,  frames: 20, name: "打撃_シングル",      variants: { orange: 1 } },
  hits:       { no: 8,  frames: 28, name: "打撃_連打",          variants: { orange: 1 } },
  heal:       { no: 20, frames: 32, name: "回復",               variants: { green: 3, pink: 6 } },
  heart:      { no: 19, frames: 28, name: "ハート",             variants: { pink: 1 } },
  flash:      { no: 9,  frames: 20, name: "フラッシュ_01",      variants: { yellow: 2, blue: 4 } },
  flash2:     { no: 10, frames: 20, name: "フラッシュ_02",      variants: { yellow: 2, white: 6 } },
  atkup:      { no: 21, frames: 28, name: "攻撃力アップ",       variants: { red: 1, yellow: 2, purple: 5 } },
  atkdown:    { no: 22, frames: 28, name: "攻撃力ダウン",       variants: { orange: 2, purple: 5, gray: 6 } },
  shieldup:   { no: 23, frames: 32, name: "防御力アップ_盾",    variants: { amber: 2 } },
  shielddown: { no: 25, frames: 28, name: "防御力ダウン_盾",    variants: { amber: 2 } },
  hexup:      { no: 24, frames: 32, name: "防御力アップ_ヘキサ", variants: { green: 3, blue: 4 } },
  hexdown:    { no: 26, frames: 28, name: "防御力ダウン_ヘキサ", variants: { purple: 5 } },
  dizzy:      { no: 18, frames: 32, name: "めまい_トリプル",    variants: { purple: 5 } },
  fire:       { no: 16, frames: 24, name: "炎",                 variants: { orange: 1 } },
  vortex:     { no: 6,  frames: 20, name: "回転ヒット_渦多め",  variants: { blue: 4 } },
  spin:       { no: 5,  frames: 20, name: "回転ヒット",         variants: { white: 6 } },
  slash:      { no: 1,  frames: 20, name: "斬撃_シングル",      variants: { green: 3 } },
  slash2:     { no: 2,  frames: 24, name: "斬撃_ダブルスラッシュ", variants: { green: 3 } },
};

// 書き出すアトラスの一覧（id = "<種類>-<色>"）。ビルドと再生の両方がここを見る。
export const FX_SHEETS = Object.fromEntries(
  Object.entries(FX_TYPES).flatMap(([kind, t]) =>
    Object.entries(t.variants).map(([color, variant]) => [`${kind}-${color}`, { kind, color, type: t.no, variant, frames: t.frames }])),
);
export const fxSheetUrl = (id) => `graphic/fx/${id}.avif`;

// ── どの瞬間に・どの種類を・どの色で ──────────────────────────────────────────
//   size  … 1280×720 ステージ上の表示サイズ（px）。192px の1コマを拡縮する
//   color … "@actor"（その行動をした人）/ "@winner"（和了者）＝キャラ色の系統で色違いを引く。それ以外は固定色
//   speed … 再生速度の倍率（既定 1＝原本どおり 24fps）／ delay … 開始を遅らせる ms
//   lazy  … 対局の頭に先読みしない（めったに出ない演出。初回は読み込みが間に合わなければ出ない）
// 位置（どの席・どの行・どの牌）は main.js の呼び出し側が決める。ここは「何を出すか」だけ。
export const FX_CUES = {
  // ── 和了・リーチ・カン（打った人の色）──
  ronHit:       { fx: "impact", color: "@winner", size: 230 },              // ロン：放銃した人の席に、和了者の色の衝撃＝撃ち抜かれた
  tsumoWave:    { fx: "wave",   color: "@winner", size: 290 },              // ツモ：和了者の席から衝撃波＝3人いっぺんに払わされる
  riichiWave:   { fx: "wave",   color: "@actor",  size: 210, speed: 1.15 }, // リーチ：宣言した席から波紋＝卓の空気が変わる
  kanImpact:    { fx: "impact", color: "@actor",  size: 160 },              // カン：卓に叩きつける重さ（ポン・チーは頻度が高いのでテロップだけ）
  manganBolt:   { fx: "bolt",   color: "yellow",  size: 330 },              // 満貫以上のカットイン：金の稲妻＝大物手の雷鳴
  yakumanWave:  { fx: "wave",   color: "@winner", size: 660 },              // 役満：画面いっぱいの衝撃波＋白い閃光
  yakumanFlash: { fx: "flash2", color: "white",   size: 480, delay: 280, lazy: true },
  // ── 点棒＝HP（ダメージカード・右のHPボード・相棒の立ち絵）──
  dmgHit:       { fx: "hit",    color: "orange",  size: 132 },              // 削られた行の顔に打撃
  dmgHitBig:    { fx: "hits",   color: "orange",  size: 158 },              // 大きな被弾（8000以上／最大HPの35%以上）は連打
  dmgKO:        { fx: "impact", color: "white",   size: 214 },              // トビ（撃沈）：スタンプと同時に白い衝撃
  dmgHeal:      { fx: "heal",   color: "green",   size: 152 },              // 和了者の行に回復（HPが本当に増える個人戦だけ）
  boardHit:     { fx: "hit",    color: "orange",  size: 96 },               // カードを出さない局：右のHPボードの行
  boardHeal:    { fx: "heal",   color: "green",   size: 104 },
  portraitHit:  { fx: "hit",    color: "orange",  size: 214 },              // 自分が削られたら相棒の立ち絵にも当たる（ひるむ芝居と同時）
  portraitHitBig: { fx: "hits", color: "orange",  size: 236 },
  // ── 絆（対局後）──
  bondHeart:    { fx: "heart",  color: "pink",    size: 124, lazy: true },  // 対局で絆が増えた瞬間
  bondHeartUp:  { fx: "heart",  color: "pink",    size: 184, lazy: true },  // 絆 Lv UP
  // 下の ABILITY_FX に cast が無い能力の発動（モブ・将来の能力）
  castFallback: { fx: "flash",  color: "yellow",  size: 320, lazy: true },
};

// ── キャラ能力（abilityId ごと）──────────────────────────────────────────────
//   cast      … 発動カットインの立ち絵に重ねる（そのキャラが力を使った瞬間）。null＝出さない
//               （この表に無い能力は FX_CUES.castFallback）
//   scoreUp / scoreDown … 和了画面で能力が点数を動かした一行（abilityMaster.scoreFxLabel）の点数に重ねる
//   それ以外 … 能力が効いた瞬間（どこに出すかは main.js のコメント参照）
export const ABILITY_FX = {
  // 詩玥「ツモれば勝ち」— 運が上向く。赤＝彼女の色
  "lucky-draw":   { cast: { fx: "atkup", color: "red", size: 340 } },
  // ルクス・ゼロ「ゼロ・リサーチ」— 山を照らして捕捉し、引いた瞬間に雷で確保する
  "zero-search":  {
    cast:    { fx: "flash", color: "blue", size: 340 },
    reserve: { fx: "flash", color: "blue", size: 132, delay: 1300 }, // 山に光点が刺さる（捕捉）。発動カットインが引く頃に
    capture: { fx: "bolt",  color: "blue", size: 150 },   // その牌を引いた瞬間（確保）
  },
  // 姚玖「老頭の庭」— 夜の庭に月が昇る
  "rootou":       {
    cast: { fx: "flash2", color: "white", size: 340 },
    moon: { fx: "flash2", color: "white", size: 230 },    // 么九13種に出会えた／国士テンパイ（満月）
  },
  // 春嬋「韋駄天の中張」— 風の斬撃
  "chunchan":     {
    cast:   { fx: "slash2", color: "green", size: 360 },
    rush:   { fx: "slash",  color: "green", size: 170 },  // 3歩目で「疾走」
    tenpai: { fx: "slash2", color: "green", size: 430 },  // 聴牌「——間に合った」（卓を横切る一閃）
  },
  // ドラニエル「天啓ドラ寄せ」— 金の閃光
  "dora-pull":    {
    cast:      { fx: "flash2", color: "yellow", size: 340 },
    reveal:    { fx: "flash",  color: "yellow", size: 220, delay: 1300 }, // 新ドラがめくれた（卓中央のドラ表示）。カットインが引く頃に
    lastStand: { fx: "atkup",  color: "yellow", size: 170 }, // 背水の天啓に入った
    scoreUp:   { fx: "flash",  color: "yellow", size: 290 }, // 「天啓——暴いたドラが、手に乗る」
  },
  // 焔「大物手の焔」— 炎
  "homura":       {
    cast:      { fx: "fire",    color: "orange", size: 360 },
    flare:     { fx: "fire",    color: "orange", size: 170 }, // 火柱に届いた
    scoreUp:   { fx: "fire",    color: "orange", size: 310 }, // 「焔が舐めた」
    scoreDown: { fx: "atkdown", color: "orange", size: 250 }, // 「火が萎んだ」
  },
  // 賭羽ルイナ「大博打」— 張る（紫の上昇）／配当（金）／外した局は賭け金が灰に（紫の下降）
  "kakeha-bet":   {
    cast:    { fx: "atkup",   color: "purple", size: 340 },
    scoreUp: { fx: "flash",   color: "yellow", size: 290 },
    betLost: { fx: "atkdown", color: "purple", size: 170 },
  },
  // JaneDoe「沈黙の処方箋」— 縛った相手の席でめまい（カットインが引くのを待ってから相手の席へ）
  // 完全無言のキャラなので発動の瞬間は飾らない（cast: null）。効いた相手の側にだけ絵が出る。
  "jane-doe":     { cast: null, target: { fx: "dizzy", color: "purple", size: 196, delay: 1250 } },
  // ビビ「身代わり人形」— 青い結界
  "bibi":         {
    cast:    { fx: "hexup", color: "blue",   size: 340 },
    guard:   { fx: "hexup", color: "blue",   size: 164 },  // ダメージカードで身代わりが受けた行
    scoreUp: { fx: "fire",  color: "orange", size: 270 },  // 超越帯「焔の火が宿る」
  },
  // エージェント・RE「リコール・ディール」— 取引の回転
  "recall-deal":  {
    cast: { fx: "spin", color: "white", size: 320 },
    swap: { fx: "spin", color: "white", size: 112 },       // 河の牌と手牌が入れ替わる両端
  },
  // 凌雲「琥珀の盾」— 受け止める／剥がれる／編み直される（琥珀＝黄橙）
  "amber-shield": {
    guard: { fx: "shieldup",   color: "amber", size: 172 },
    break: { fx: "shielddown", color: "amber", size: 150 },
    mend:  { fx: "shieldup",   color: "amber", size: 150 },
  },
  // 真守 由紀「放銃、いたしません」— 超危険（赤）と見えていた牌を、通し切った瞬間だけ緑の結界
  "danger-sense": { pass: { fx: "hexup", color: "green", size: 116 } },
  // ネビュラ「暗黒星」— 痛みが人の倍（守りの鏡像＝防御力ダウン）
  "nebula-curse": {
    curse:     { fx: "hexdown", color: "purple", size: 172 },
    scoreDown: { fx: "atkdown", color: "purple", size: 250 }, // 「掴む喜びは、半分」
  },
  // 沼田 蓮「泥中の蓮」— 沈む（灰の下降）／咲く（桃の回復）
  "muddy-lotus":  {
    bloom:     { fx: "heal",    color: "pink", size: 310 },  // 和了画面：安手が泥をすり抜けて咲いた
    auraBloom: { fx: "heal",    color: "pink", size: 150 },  // 自席の水位が引いた（沈殿を吸い上げた）
    scoreUp:   { fx: "heal",    color: "pink", size: 270 },  // 「泥中に咲いた」
    scoreDown: { fx: "atkdown", color: "gray", size: 250 },  // 「泥に沈んだ」
  },
  // カリュブディス「淵の蒐集」— 渦
  "abyss-collection": {
    deny:    { fx: "vortex", color: "blue", size: 140 },     // 掴んだ和了牌が渦に呑まれる
    collect: { fx: "vortex", color: "blue", size: 270 },     // 流局で蒐集した
  },
  // 篠宮 栞「模範解答」は対局中は黙って見守る設計（docs/character-ingame-fx-plan.md 2-4 #3）＝エフェクトも置かない。
};

// ── 色の系統 ──────────────────────────────────────────────────────────────────
// キャラ色（#rrggbb）を、原本の色違いの系統へ寄せる。彩度の低い色（灰・墨）は白。
export function colorKeyOf(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "white";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
  if (s < 0.2) return "white";
  let h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h >= 345 || h < 15) return "red";
  if (h < 65) return "yellow";
  if (h < 185) return "green";
  if (h < 250) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

// その種類に無い色を頼まれたときの寄せ先（近い色から順に）。
const COLOR_FALLBACK = {
  red:    ["red", "pink", "orange", "yellow", "amber"],
  orange: ["orange", "yellow", "amber", "red"],
  yellow: ["yellow", "amber", "orange", "red"],
  amber:  ["amber", "yellow", "orange"],
  green:  ["green", "blue", "yellow"],
  blue:   ["blue", "green", "purple"],
  purple: ["purple", "pink", "blue"],
  pink:   ["pink", "red", "purple"],
  white:  ["white", "gray", "blue", "purple", "yellow"],
  gray:   ["gray", "white", "purple"],
};
// 種類 kind を色 colorKey で引いたときのアトラス id（無ければ近い色・最後は先頭の色）。
export function fxSheetId(kind, colorKey) {
  const t = FX_TYPES[kind];
  if (!t) return null;
  for (const c of COLOR_FALLBACK[colorKey] || [colorKey]) if (t.variants[c] != null) return `${kind}-${c}`;
  return `${kind}-${Object.keys(t.variants)[0]}`;
}
// キューを具体的なアトラス id にする。who = { actor, winner }（キャラ定義。"@actor"/"@winner" の解決に使う）。
export function cueSheetId(cue, who = {}) {
  if (!cue) return null;
  const c = cue.color || "";
  const key = c.startsWith("@") ? colorKeyOf(who[c.slice(1)]?.color) : c;
  return fxSheetId(cue.fx, key);
}

// この卓で使いうるアトラス（先読み用）。characters＝卓に着くキャラ（団体戦の控えも含めてよい）。
export function fxSheetsForTable(characters = []) {
  const ids = new Set();
  const add = (cue, who) => { const id = !cue?.lazy && cueSheetId(cue, who); if (id) ids.add(id); };
  for (const cue of Object.values(FX_CUES)) if (!cue.color?.startsWith("@")) add(cue);
  for (const ch of characters) {
    if (!ch) continue;
    for (const cue of Object.values(FX_CUES)) if (cue.color?.startsWith("@")) add(cue, { actor: ch, winner: ch });
    for (const a of ch.abilities || []) {
      const set = ABILITY_FX[a.abilityId];
      for (const cue of Object.values(set || {})) add(cue, { actor: ch, winner: ch });
      if (!set) add({ ...FX_CUES.castFallback, lazy: false }); // 表に無い能力（モブなど）の発動
    }
  }
  return [...ids];
}
