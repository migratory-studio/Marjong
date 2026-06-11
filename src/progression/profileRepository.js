// プロフィール保存の抽象境界 — major_update_specification.md §19.3。
//
// 画面 → ProgressionService → ProfileRepository（→ Local / Supabase）と段階を踏む。
// Phase 2A は LocalProfileRepository だけを実装し、Phase 6 で
// SupabaseProfileRepository に差し替えられるよう、保存先をこの interface で隠す。
//
// 保存データ全体の形は §17.1。schemaVersion を持たせ、後方互換の移行を migrateProfile で行う。
export const SCHEMA_VERSION = 1;

// 改名された大会id（旧→新）。records.treasures に旧idで残る獲得記録を読み込み時に付け替える。
//   musou-kokusho → kyuuren-houtou … 無双国書杯を九蓮宝燈杯へ改名（2026-06。無双冠との国士無双モチーフ被り解消）
const RENAMED_TOURNAMENT_IDS = { "musou-kokusho": "kyuuren-houtou" };

// 空のプロフィール（マイキャラ未作成）。§17.1 のキー構成に合わせる。
export function createDefaultProfile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {},
    wallet: { soul: 0 },
    activeAvatarId: null,
    avatars: [],
    inventory: [],
    scenarioProgress: [],
    tournamentRuns: [],
    records: {},
    daily: {},
    unlockedPresetIds: [],
    rewardLedger: [],
  };
}

// 抽象リポジトリ。具象（Local / Supabase）はこれを継承して上書きする。
export class ProfileRepository {
  async loadProfile() {
    throw new Error("loadProfile() not implemented");
  }
  async saveProfile(_profile) {
    throw new Error("saveProfile() not implemented");
  }
  async migrateProfile(raw) {
    // 既定の移行: 不足キーを既定値で補完し、schemaVersion を最新へ。
    const base = createDefaultProfile();
    const merged = { ...base, ...(raw && typeof raw === "object" ? raw : {}) };
    merged.wallet = { ...base.wallet, ...(raw?.wallet || {}) };
    if (Array.isArray(merged.records?.treasures)) {
      merged.records = {
        ...merged.records,
        treasures: [...new Set(merged.records.treasures.map((id) => RENAMED_TOURNAMENT_IDS[id] || id))],
      };
    }
    merged.schemaVersion = SCHEMA_VERSION;
    return merged;
  }
}
