// Service Worker — 同一オリジン資産を「ネットワーク優先」で配る。
//
// 目的: GitHub Pages は Cache-Control: max-age=600 固定でヘッダを変えられないため、
// 更新後もブラウザが最大10分（モバイルはさらに長く）古い JS を掴み続け、修正が反映されない。
// この SW が制御下に入ると、オンライン時は毎回ネットワークから取り直す（HTTP キャッシュの
// stale も no-cache 再検証で回避）＝常に最新コードで動く。オフライン時のみキャッシュへフォールバック。
//
// 安全側の設計:
//  - network-first（cache-first にしない）＝オンラインなら決して古いものを出さない。
//  - fetch は { cache: "no-cache" } で条件付きリクエスト＝更新が無ければ 304 で軽い。
//  - skipWaiting + clients.claim＝新 SW を即時適用（更新が数秒で行き渡る）。
//  - 扱うのは same-origin の GET のみ。POST や外部（Supabase 等）は素通し。
const CACHE = "mahjong-rpg-runtime-v1";

self.addEventListener("install", () => {
  self.skipWaiting(); // 新しい SW を待機させず即座に有効化候補にする
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 旧バージョンのランタイムキャッシュを掃除
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim(); // 既存タブも即このSWの制御下に置く
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // 変更系（POST等）は触らない
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // 外部（CDN/Supabase等）は素通し

  event.respondWith((async () => {
    try {
      // ネット優先＋再検証（HTTPキャッシュの stale を掴まない）。オンラインなら常に最新。
      const fresh = await fetch(req, { cache: "no-cache" });
      // オフライン用に控える（正常な同一オリジン応答のみ）。
      if (fresh && fresh.status === 200 && fresh.type === "basic") {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // オフライン等でネットに出られない時だけキャッシュへフォールバック。
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
