// The sender supplies only an ID. Obtain its actual scores from the deployed
// game authority. The Worker never receives a Supabase database credential.
const authority = "https://mahjong-online.nogi-kaiyu.workers.dev";
const writerDigest = "6ec1bcce7f9f9593e4582ba7b10376df173a099bbe235744973706748d91cd76";
const matchIdPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const token = req.headers.get("x-regular-token") ?? "";
  if (token.length !== 44) return new Response(null, { status: 403 });
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  if (Array.from(digest, b => b.toString(16).padStart(2, "0")).join("") !== writerDigest) {
    return new Response(null, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("match") ?? "";
  if (!matchIdPattern.test(id)) return new Response(null, { status: 400 });
  const source = await fetch(authority + "/regular-result/" + id, {
    headers: { "x-regular-token": token }, redirect: "error",
  });
  if (!source.ok) return new Response(null, { status: 502 });
  const rows = await source.json();
  if (!Array.isArray(rows) || !rows.length || rows.length > 4 || rows.some(r => r.match_id !== id)) {
    return new Response(null, { status: 502 });
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const saved = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/online_regular_results?on_conflict=match_id,bot_id", {
    method: "POST", redirect: "error",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return new Response(null, { status: saved.ok ? 204 : 502 });
});
