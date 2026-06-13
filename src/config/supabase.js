// Supabase クライアントの単一の出どころ — major_update_specification.md §19.4。
//
// このアプリはビルドなし・npm 依存なしの素の ESM なので、@supabase/supabase-js は
// CDN(esm.sh) から直接 import する。env 機構が無いため URL と anon key はここに直書きする。
//
// ⚠️ ここに置いてよいのは anon / public key だけ。これは「クライアントへ配って安全」な
//    公開鍵で、データ保護は RLS（Row Level Security）が担う。service_role key は
//    全データを素通しできる管理鍵なので、絶対にこのファイル（＝公開リポジトリ）へ置かない。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://pbhxswjcttovsfofrddj.supabase.co";

// anon / public key（公開して安全）。
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaHhzd2pjdHRvdnNmb2ZyZGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDE3MDEsImV4cCI6MjA5Njg3NzcwMX0.NlaeOKlKI6KOx9xH936-dYlu3KxkfhGT3HPbN-4AY6Y";

// 認証はブラウザ側で永続化＋自動リフレッシュ。OAuth リダイレクト後の URL から
// セッションを拾う（detectSessionInUrl）。
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
