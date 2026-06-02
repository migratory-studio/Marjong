// localStorage 版プロフィールリポジトリ — major_update_specification.md §17 / §19.1。
//
// 保存キーは mahjong-rpg.profile.v1（§17.1）。読み込み時に migrateProfile を通し、
// 旧データ・欠損キーを補完する。Supabase 移行（Phase 6）まではこれが正式な保存先。
//
// storage はテスト容易性のため注入可能（既定は globalThis.localStorage）。Node から
// テストするときは getItem/setItem/removeItem を持つフェイクを渡す。
import { ProfileRepository, createDefaultProfile, SCHEMA_VERSION } from "./profileRepository.js";

export const STORAGE_KEY = "mahjong-rpg.profile.v1";

export class LocalProfileRepository extends ProfileRepository {
  constructor(storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : undefined)) {
    super();
    if (!storage) throw new Error("LocalProfileRepository: storage が利用できません");
    this.storage = storage;
  }

  async loadProfile() {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 壊れたデータは握りつぶさず、空プロフィールから作り直す（保存し直しは saveProfile 時）。
      return createDefaultProfile();
    }
    return this.migrateProfile(parsed);
  }

  async saveProfile(profile) {
    const toSave = { ...profile, schemaVersion: SCHEMA_VERSION };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    return toSave;
  }
}
