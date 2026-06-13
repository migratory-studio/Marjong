// 保存先の自動切替ファサード — major_update_specification.md §Phase 6。
//
// ログイン中は Supabase、未ログインは localStorage を使う。画面側(main.js)は単一の
// profileRepo としてこれを持てば、ログイン状態の変化に応じて保存先が透過的に切り替わる
// （フリー対戦・師弟はログインしなくても遊べる＝未ログインはローカルのまま）。
//
// loadProfile / saveProfile は ProfileRepository インターフェースのまま。既存の呼び出し
// 24 箇所は無改修で動く。
import { ProfileRepository } from "./profileRepository.js";
import { LocalProfileRepository } from "./localProfileRepository.js";
import { SupabaseProfileRepository } from "./supabaseProfileRepository.js";
import { getUser, onAuthChange } from "../auth/authService.js";

export class ProfileRepositoryFacade extends ProfileRepository {
  constructor() {
    super();
    this.local = new LocalProfileRepository();
    this.remote = new SupabaseProfileRepository();
    this.loggedIn = false;
    // ログイン/ログアウト（OAuth リダイレクト後など）に追従。isLoggedIn() の同期読み取り用。
    // 失敗しても致命ではない（loadProfile/saveProfile は毎回 #refresh で取り直す）。
    try {
      onAuthChange((session) => { this.loggedIn = !!session; });
    } catch { /* 認証購読に失敗しても保存自体は動く */ }
  }

  // 呼び出しごとにログイン状態を取り直す（getSession はキャッシュ参照で軽い）。
  // boot 時の単一プロミスに依存させない＝初期化が詰まっても保存系が固まらない。
  async #refresh() {
    try {
      this.loggedIn = !!(await getUser());
    } catch {
      this.loggedIn = false;
    }
    return this.loggedIn;
  }

  #active() {
    return this.loggedIn ? this.remote : this.local;
  }

  isLoggedIn() {
    return this.loggedIn;
  }

  async loadProfile() {
    await this.#refresh();
    return this.#active().loadProfile();
  }

  async saveProfile(profile) {
    await this.#refresh();
    return this.#active().saveProfile(profile);
  }

  async migrateProfile(raw) {
    return this.#active().migrateProfile(raw);
  }

  // デバッグの「1からやりなおす」はローカルのみ対象（クラウドは画面から消さない）。
  async clearProfile() {
    return this.local.clearProfile();
  }

  // 初回同期の最小版: クラウドが空（弟子0体）でローカルに弟子がいれば、ローカルを吸い上げる。
  // ログイン成功直後に呼ぶ。戻り値で移行有無を返す（呼び出し側でトースト等に使える）。
  async syncLocalToCloudIfEmpty() {
    await this.#refresh();
    if (!this.loggedIn) return { migrated: false };
    const remote = await this.remote.loadProfile();
    if ((remote.avatars || []).length > 0) return { migrated: false };
    const local = await this.local.loadProfile();
    if ((local.avatars || []).length === 0) return { migrated: false };
    await this.remote.saveProfile(local);
    return { migrated: true, count: local.avatars.length };
  }
}
