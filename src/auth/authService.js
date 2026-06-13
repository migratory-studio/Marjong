// 認証の抽象境界 — major_update_specification.md §Phase 6 / §19.4。
//
// Supabase Auth(Google)を薄く包む。画面側はこの関数群だけを使い、Supabase の API へ
// 直接依存しないようにする（将来プロバイダを足す/差し替える時の影響範囲を閉じる）。
import { supabase } from "../config/supabase.js";

// Google でログイン。OAuth はリダイレクト方式：Google → Supabase(/auth/v1/callback)
// → redirectTo で指定したこのアプリのページ、の順で戻ってくる。
//   redirectTo は Supabase の URL Configuration(Redirect URLs)で許可済みである必要がある。
//   既定は現在のページ（ハッシュを除いた URL）へ戻す。
export async function signInWithGoogle(redirectTo) {
  const to = redirectTo || (typeof window !== "undefined" ? window.location.href.split("#")[0] : undefined);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: to },
  });
  if (error) throw error;
  return data; // { provider, url }（このあとブラウザが url へ遷移する）
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// 現在のセッション（未ログインなら null）。
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

// 現在のユーザー（未ログインなら null）。
export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

// 認証状態の変化を購読。戻り値は購読解除関数。
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
