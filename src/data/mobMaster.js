// モブ（シルエット）マスタ — 師弟シナリオ／大会トーナメントの「顔のない対戦相手」。
//
// 設計方針:
//   - CHARACTER_MASTER には入れない。理由は characterMaster を全件 map している
//     avatarPresetMaster（アバタープリセット）/ characterVoiceMaster（ボイス自動生成）
//     にモブが混入しないようにするため。フリー対戦の選択肢・ランダム補充も CHARACTERS
//     しか見ないので、別管理にするだけでモブは自動的に「フリー対戦で選べない」状態になる。
//   - getCharacter(id) は characters.js 側でこのファイルの getMobById に
//     フォールバックする。シナリオ/デバッグは "mob:<seed>" の id でモブを引ける。
//
// 一意性ポリシー（大会トーナメント表向け）:
//   モブは seed を持ち、名前・シルエット・初期点を seed から「決定論的」に生成する。
//   同じ seed のモブはいつ・どこで生成しても同じ見た目＝トーナメント表で同一人物として
//   維持できる。シルエットは 10 枚（graphic/chars/mobs/1〜10.png）の使い回しなので、
//   別 seed どうしで絵が被るのは許容（被ってOK）。
//
// 能力あり/なし:
//   makeMob({ abilityId }) を省略 → abilities: []（能力なしのザコ）。
//   abilityId を渡す → その能力を1つ持つモブ（既存 abilityMaster の id を流用）。

import { MOB_NAMES_MALE, MOB_NAMES_FEMALE } from "./mobNameMaster.js";

// シルエット画像の枚数（graphic/chars/mobs/ 配下の連番 .png）。
export const MOB_SILHOUETTE_COUNT = 10;

// シルエットの性別分け（実画像を見て分類）: 女性=1〜5 / 男性=6〜10。
// 名前の性別(gender_hint)に合わせてこのプールから1枚を選ぶ＝立ち絵と名前の性別が一致する。
const FEMALE_SILHOUETTES = [1, 2, 3, 4, 5];
const MALE_SILHOUETTES = [6, 7, 8, 9, 10];

// 初期持ち点の候補（seed で決定論的に1つ選ぶ。モブごとに少しだけ個性を出すため）。
const MOB_POINT_POOL = [10000, 12000, 12000, 14000, 16000];

// 文字列 seed → 32bit ハッシュ（FNV-1a）。決定論的に派生値を作るための種。
function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function silhouettePath(index /* 1..COUNT */) {
  return `graphic/chars/mobs/${index}.png`;
}

// 全シルエットのパス（プリロード用）。
export function mobSilhouettePaths() {
  return Array.from({ length: MOB_SILHOUETTE_COUNT }, (_, i) => silhouettePath(i + 1));
}

// seed から1体のモブを決定論的に生成する。
//   opts.seed           … 同定の種（省略時はランダム＝使い捨てモブ）。
//   opts.abilityId      … 能力id（省略で能力なし）。
//   opts.abilityParams  … 能力へ渡すパラメータ（省略時 {}）。
//   opts.name           … 表示名の上書き（省略で名前マスタから seed 抽選）。
//   opts.startingPoints … 初期点の上書き（省略で seed から選択）。
//
// 名前は MOB_NAMES_MALE/FEMALE から決定論的に抽選し、その性別に合うシルエット
// （女性=1〜5 / 男性=6〜10）を割り当てる＝立ち絵と名前の性別が一致する。
export function makeMob(opts = {}) {
  const seed = opts.seed != null ? String(opts.seed) : Math.random().toString(36).slice(2);
  const h = hashSeed(seed);
  // seed から複数の独立した派生値を取る（用途ごとに別ビット/再ハッシュで相関を避ける）。
  const hName = hashSeed(`${seed}#name`);
  const hSil = hashSeed(`${seed}#sil`);

  // 名前抽選: 男女リストを連結した index 空間から1件。出現比は元データの 400:200。
  const total = MOB_NAMES_MALE.length + MOB_NAMES_FEMALE.length;
  const nameIdx = hName % total;
  const isFemale = nameIdx >= MOB_NAMES_MALE.length;
  const gender = isFemale ? "f" : "m";
  const pickedName = isFemale
    ? MOB_NAMES_FEMALE[nameIdx - MOB_NAMES_MALE.length]
    : MOB_NAMES_MALE[nameIdx];
  const name = opts.name || pickedName;

  // 性別に合うシルエットを抽選。
  const pool = isFemale ? FEMALE_SILHOUETTES : MALE_SILHOUETTES;
  const silIndex = pool[hSil % pool.length];
  const portrait = silhouettePath(silIndex);

  const startingPoints =
    opts.startingPoints != null ? opts.startingPoints : MOB_POINT_POOL[h % MOB_POINT_POOL.length];

  const abilities = opts.abilityId
    ? [{ abilityId: opts.abilityId, params: opts.abilityParams || {} }]
    : [];

  return {
    id: `mob:${seed}`,
    name,
    reading: "",
    color: "#7c7f8a", // シルエット相応のニュートラルグレー
    role: "mob",
    isMob: true,
    mobSeed: seed,
    mobSilhouette: silIndex,
    mobGender: gender,
    bio: "",
    profile: "",
    stats: { startingPoints },
    // icon / portrait はともにシルエット。voices は空（無口＝ボイス未登録でも
    // AudioManager は共通SEへフォールバックするので安全）。
    // ※ icon は全身画像なので、表示側で頭部にズームクロップする（is-mob-face / CSS）。
    assets: { icon: portrait, portrait, voices: {} },
    // 選択画面ゲージ用パラメータ。モブは選択画面に出ないが、参照側の安全のため既定値を持たせる。
    params: { attack: 3, defense: 3, quirk: 3, difficulty: 3 },
    portraitPos: "top center",
    abilities,
  };
}

// "mob:<seed>" 形式の id からモブを復元する（見た目の同定用）。
// 注意: 能力は id に埋め込まないため、この復元では abilities は空になる。対局中は
// 生成済みのモブ「オブジェクト」を seated 経由で持ち回るので、能力ありモブが id 復元で
// 能力を失うことはない（id からの復元は立ち絵/名前の解決などに使う想定）。
export function getMobById(id) {
  if (typeof id !== "string" || !id.startsWith("mob:")) return null;
  return makeMob({ seed: id.slice(4) });
}

// トーナメント等で「同定が保たれた」モブの一団を作る。silhouette の被りは許容。
//   count        … 生成数。
//   seedPrefix   … seed の接頭辞（大会ごとに変えると別人の集団になる）。
//   abilityIds   … 能力割り当て。配列なら i 番目を循環適用、文字列なら全員同一、
//                  null（既定）なら全員能力なし。
export function makeMobRoster(count, { seedPrefix = "mob", abilityIds = null, startingPoints = null } = {}) {
  const roster = [];
  const seen = new Map(); // name -> 出現回数。同卓に同名が並ぶのを避ける（順位は決定論的）。
  for (let i = 0; i < count; i++) {
    const abilityId = Array.isArray(abilityIds)
      ? abilityIds[i % abilityIds.length]
      : abilityIds || undefined;
    const mob = makeMob({ seed: `${seedPrefix}-${i}`, abilityId, startingPoints: startingPoints ?? undefined });
    // 表示名が被ったら通し番号を後置（雀士・己 → 雀士・己(2)）。i 順なので結果は決定論的。
    const n = (seen.get(mob.name) || 0) + 1;
    seen.set(mob.name, n);
    if (n > 1) mob.name = `${mob.name}(${n})`;
    roster.push(mob);
  }
  return roster;
}
