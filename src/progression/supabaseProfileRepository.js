// Supabase 版プロフィールリポジトリ — major_update_specification.md §19 / §Phase 6。
//
// LocalProfileRepository と同じ ProfileRepository インターフェース（loadProfile/saveProfile）
// を実装し、ログイン中ユーザーの保存先を Supabase に差し替える。画面側(main.js)は
// インターフェースしか見ないので、ログイン状態で local ⇄ supabase を切り替えられる。
//
// マッピング:
//   profiles 1 行          … 弟子以外の状態（wallet / activeAvatarId / その他は misc(jsonb)）
//   user_avatars 複数行     … 弟子1体＝1行（state(jsonb)＝完全状態、name/avatar_level は一覧用サマリ）
//
// 現状の saveProfile は「プロフィール丸ごと書き戻す」素直版（弟子が少ない MVP では十分）。
// スキーマは行単位なので、将来 saveAvatar(avatar) 等の差分保存へ無改修で進化できる。
import { ProfileRepository, createDefaultProfile, SCHEMA_VERSION } from "./profileRepository.js";
import { supabase } from "../config/supabase.js";
import { getUser } from "../auth/authService.js";

export class SupabaseProfileRepository extends ProfileRepository {
  async #requireUserId() {
    const user = await getUser();
    if (!user) throw new Error("SupabaseProfileRepository: 未ログインです");
    return user.id;
  }

  async loadProfile() {
    const uid = await this.#requireUserId();

    const { data: row, error: pErr } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (pErr) throw pErr;

    const { data: avatarRows, error: aErr } = await supabase
      .from("user_avatars")
      .select("state")
      .eq("user_id", uid);
    if (aErr) throw aErr;

    // 行が無い（＝このユーザーは初回）の場合は空プロフィールを返す。最初の saveProfile で行ができる。
    if (!row && (!avatarRows || avatarRows.length === 0)) return createDefaultProfile();

    const base = createDefaultProfile();
    const misc = row?.misc || {};
    const assembled = {
      ...base,
      ...misc, // profile / inventory / scenarioProgress / tournamentRuns / records / daily / unlockedPresetIds / rewardLedger / mentorGrowth
      schemaVersion: row?.schema_version ?? base.schemaVersion,
      wallet: row?.wallet ?? base.wallet,
      activeAvatarId: row?.active_avatar_id ?? null,
      avatars: (avatarRows || []).map((r) => r.state),
    };
    // 欠損キー補完・スキーマ移行は共通ロジックに通す。
    return this.migrateProfile(assembled);
  }

  async saveProfile(profile) {
    const uid = await this.#requireUserId();
    const now = new Date().toISOString();

    // 弟子(avatars)・専用列(wallet/activeAvatarId/schemaVersion)以外をまとめて misc へ。
    const { schemaVersion, wallet, activeAvatarId, avatars, ...misc } = profile;
    const avatarList = avatars || [];

    const { error: pErr } = await supabase.from("profiles").upsert(
      {
        id: uid,
        schema_version: SCHEMA_VERSION,
        wallet: wallet || { soul: 0 },
        active_avatar_id: activeAvatarId ?? null,
        display_name: misc?.profile?.displayName ?? null,
        misc,
        updated_at: now,
      },
      { onConflict: "id" }
    );
    if (pErr) throw pErr;

    // 現存する弟子を upsert。
    if (avatarList.length) {
      const rows = avatarList.map((a) => ({
        user_id: uid,
        avatar_id: a.avatarId,
        name: a.name ?? null,
        avatar_level: a.avatarLevel ?? null,
        state: a,
        updated_at: now,
      }));
      const { error: upErr } = await supabase.from("user_avatars").upsert(rows, { onConflict: "user_id,avatar_id" });
      if (upErr) throw upErr;
    }

    // ローカルで消えた弟子はリモートからも削除（現存 id に無いものを消す）。
    const keepIds = avatarList.map((a) => a.avatarId);
    const { data: existing, error: exErr } = await supabase
      .from("user_avatars")
      .select("avatar_id")
      .eq("user_id", uid);
    if (exErr) throw exErr;
    const toDelete = (existing || []).map((r) => r.avatar_id).filter((id) => !keepIds.includes(id));
    if (toDelete.length) {
      const { error: delErr } = await supabase
        .from("user_avatars")
        .delete()
        .eq("user_id", uid)
        .in("avatar_id", toDelete);
      if (delErr) throw delErr;
    }

    return { ...profile, schemaVersion: SCHEMA_VERSION };
  }

  // クラウド側を初期化（デバッグの「1からやりなおす」用）。自分の弟子行と profiles 行を削除する。
  // 行が無くなれば loadProfile は createDefaultProfile を返す＝完全リセット。
  async clearProfile() {
    const uid = await this.#requireUserId();
    const av = await supabase.from("user_avatars").delete().eq("user_id", uid);
    if (av.error) throw av.error;
    const pr = await supabase.from("profiles").delete().eq("id", uid);
    if (pr.error) throw pr.error;
  }
}
