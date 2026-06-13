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
import { flushRun, hydrateRun } from "./avatarRun.js";

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
    const p = await this.#active().loadProfile();
    return hydrateRun(p); // アクティブ弟子の run を profile レベルへ反映（per-disciple）
  }

  async saveProfile(profile) {
    await this.#refresh();
    flushRun(profile); // profile レベルの進行状態をアクティブ弟子の run へ退避してから保存
    return this.#active().saveProfile(profile);
  }

  async migrateProfile(raw) {
    return this.#active().migrateProfile(raw);
  }

  // 「1からやりなおす」: ローカルを消し、ログイン中ならクラウドの自分の行も消す。
  // 片方だけ消すと、次回 loadProfile で残った側のデータ（既読シナリオ等）が復活し整合が崩れる。
  async clearProfile() {
    await this.local.clearProfile();
    await this.#refresh();
    if (this.loggedIn) await this.remote.clearProfile();
  }

  // ログイン中のローカル⇄クラウドの状態を判定する。未ログインや非競合では何もしない判断材料に使う。
  //   戻り値: { state, localCount, cloudCount }
  //   state: "not-logged-in" | "empty-cloud"(クラウド空&ローカルに弟子有) | "conflict"(両方に弟子有)
  //          | "cloud-has-data"(クラウドに弟子有・ローカル空=そのままクラウド使用) | "both-empty"
  async inspectSync() {
    await this.#refresh();
    if (!this.loggedIn) return { state: "not-logged-in", localCount: 0, cloudCount: 0 };
    const remote = await this.remote.loadProfile();
    const local = await this.local.loadProfile();
    const cloudCount = (remote.avatars || []).length;
    const localCount = (local.avatars || []).length;
    let state;
    if (cloudCount === 0 && localCount === 0) state = "both-empty";
    else if (cloudCount === 0 && localCount > 0) state = "empty-cloud";
    else if (cloudCount > 0 && localCount > 0) state = "conflict";
    else state = "cloud-has-data";
    return { state, localCount, cloudCount };
  }

  // 競合時：クラウドを土台に、この端末(ローカル)の弟子を「追加」してクラウドへ保存する。
  // アカウント共通値(ソウル/報酬台帳/mentorGrowth/activeAvatarId)はクラウド側を維持=ソウル二重取り等を防ぐ。
  // unlockedPresetIds だけは和集合（見た目開放は無害なので失わない）。
  //   戻り値: { merged: true, added: <追加した弟子数> }
  async mergeLocalIntoCloud() {
    await this.#refresh();
    if (!this.loggedIn) return { merged: false, added: 0 };
    const remote = await this.remote.loadProfile();
    const local = await this.local.loadProfile();
    flushRun(local); // active なローカル弟子の作業コピーを avatar.run へ確実に退避（全弟子が run を持つ状態に）
    const cloudIds = new Set((remote.avatars || []).map((a) => a.avatarId));
    const added = (local.avatars || []).filter((a) => !cloudIds.has(a.avatarId));
    remote.avatars = [...(remote.avatars || []), ...added];
    const union = new Set([...(remote.unlockedPresetIds || []), ...(local.unlockedPresetIds || [])]);
    remote.unlockedPresetIds = [...union];
    // wallet / rewardLedger / mentorGrowth / records / scenarioProgress / daily / activeAvatarId はクラウド維持。
    await this.remote.saveProfile(remote);
    return { merged: true, added: added.length };
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
    await this.remote.saveProfile(flushRun(local));
    return { migrated: true, count: local.avatars.length };
  }
}
