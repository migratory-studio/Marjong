// Phase 2A: ローカル保存とマイキャラ作成の回帰テスト（DOM不要）。
// major_update_specification.md §22.2 Phase 2 のうち、2A 範囲（migration / 作成 / ID保存）を確認。
import { LocalProfileRepository, STORAGE_KEY } from "../src/progression/localProfileRepository.js";
import { createDefaultProfile, SCHEMA_VERSION } from "../src/progression/profileRepository.js";
import { buildNewAvatar, addAvatarToProfile, activeAvatar, AVATAR_DEFAULTS } from "../src/progression/avatarFactory.js";
import { templatesForMentor, INITIAL_MENTOR_IDS } from "../src/data/skillTemplateMaster.js";

let fails = 0;
const ok = (label, cond) => { if (!cond) fails++; console.log(`${cond ? "PASS" : "FAIL"}: ${label}`); };
const eq = (label, got, want) => ok(`${label} (got=${JSON.stringify(got)}, want=${JSON.stringify(want)})`, got === want);

// in-memory localStorage 互換のフェイク
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _raw: () => m.get(STORAGE_KEY),
  };
}

// --- 空ロード: 既定プロフィール ---
{
  const repo = new LocalProfileRepository(fakeStorage());
  const p = await repo.loadProfile();
  eq("空ロードは schemaVersion 付き", p.schemaVersion, SCHEMA_VERSION);
  eq("空ロードは avatar 0体", p.avatars.length, 0);
  eq("空ロードは activeAvatarId null", p.activeAvatarId, null);
  eq("空ロードは soul 0", p.wallet.soul, 0);
}

// --- マイキャラ作成 + 永続化（リロード相当） ---
{
  const storage = fakeStorage();
  const repo = new LocalProfileRepository(storage);
  const mentor = INITIAL_MENTOR_IDS[0];
  const tmpl = templatesForMentor(mentor)[0];
  const avatar = buildNewAvatar({
    name: "テスト雀士",
    profileText: "勝負師",
    mentorCharacterId: mentor,
    skillTemplateId: tmpl.skillTemplateId,
    presetIds: { icon: "icon-shiyue", standing: "standing-shiyue", background: "bg-dojo", frame: "frame-gold" },
  });
  eq("作成直後スキルLvは初期値1", avatar.skillLevel, 1);
  eq("HP満タンで開始", avatar.avatarHpCurrent, avatar.avatarHpMax);

  let profile = createDefaultProfile();
  profile = addAvatarToProfile(profile, avatar);
  eq("作成ボーナスでソウル加算", profile.wallet.soul, AVATAR_DEFAULTS.creationSoulBonus);
  eq("activeAvatarId 設定", profile.activeAvatarId, avatar.avatarId);
  await repo.saveProfile(profile);

  // 別インスタンスで読み直し = リロード相当
  const repo2 = new LocalProfileRepository(storage);
  const loaded = await repo2.loadProfile();
  const a = activeAvatar(loaded);
  ok("リロード後もマイキャラが残る", !!a);
  eq("名前が残る", a.name, "テスト雀士");
  eq("師匠が残る", a.mentorCharacterId, mentor);

  // ID 中心保存: 画像本体（base64/blob/data:）を持たない
  const raw = storage._raw();
  ok("保存に画像本体を含まない", !/data:image|base64/.test(raw));
  ok("保存は presetId 参照のみ", raw.includes("icon-shiyue") && raw.includes("frame-gold"));
}

// --- migration: schemaVersion 無し・欠損キーの旧データを補完 ---
{
  const storage = fakeStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ profile: { name: "旧" }, wallet: { soul: 120 } }));
  const repo = new LocalProfileRepository(storage);
  const p = await repo.loadProfile();
  eq("migration で schemaVersion 付与", p.schemaVersion, SCHEMA_VERSION);
  eq("migration で soul 保持", p.wallet.soul, 120);
  ok("migration で欠損キー補完(avatars)", Array.isArray(p.avatars));
  ok("migration で欠損キー補完(rewardLedger)", Array.isArray(p.rewardLedger));
}

// --- 壊れた JSON は既定プロフィールへフォールバック ---
{
  const storage = fakeStorage();
  storage.setItem(STORAGE_KEY, "{ not json");
  const repo = new LocalProfileRepository(storage);
  const p = await repo.loadProfile();
  eq("壊れデータは既定へ", p.avatars.length, 0);
}

// --- 不正な師匠×能力の組み合わせは弾く ---
{
  let threw = false;
  try {
    buildNewAvatar({ name: "x", mentorCharacterId: "bibi", skillTemplateId: "tmpl-lucky-draw" });
  } catch { threw = true; }
  ok("師匠と能力の不整合を拒否", threw);

  let threw2 = false;
  try { buildNewAvatar({ name: "", mentorCharacterId: "shiyue", skillTemplateId: "tmpl-lucky-draw" }); }
  catch { threw2 = true; }
  ok("名前未入力を拒否", threw2);
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
