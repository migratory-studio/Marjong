// BGM の暗号化同梱 — 楽曲ファイルを「直接抽出できない」形で配信するための薄い層。
//
// なぜ: PeriTune の規約は、有償作品に楽曲を同梱するなら「ファイルが直接抽出できないよう
// 暗号化等の処置」を求めている（CREDITS.md「PeriTune」節）。生の mp3 を Pages に置くと
// URL を叩くだけで曲が落とせるため、sound/bgm/ には暗号化済みの .bgm だけを置く。
//
// 仕組み:
//  - 曲の「参照名」はこれまでどおり sound/bgm/**/<name>.mp3（コード・マスタはそのまま）。
//  - 実際に取りに行くのは同じ場所の <name>.bgm（bgmFileUrl が拡張子を差し替える）。
//  - .bgm = "MJB1"(4) + nonce(12) + ChaCha20(mp3)。復号して Blob URL にし <audio> で鳴らす。
//  - 原本 mp3 は _assets-stock/bgm/（追跡外）。生成・復元は tools/build-bgm.mjs。
//
// 鍵はクライアントに同梱されるので、技術的に「破れない」ものではない（どの方式でも同じ）。
// 目的は「サーバから mp3 をそのまま落とせない」状態にすること。
// ChaCha20 を自前実装にしているのは、Web Crypto が secure context（https/localhost）限定で、
// LAN の http から実機テストすると BGM が鳴らなくなるのを避けるため。Node のビルド側と共用。

const MAGIC = [0x4d, 0x4a, 0x42, 0x31]; // "MJB1"
const HEADER = 4 + 12;

// 32 バイト鍵（8 ワード）。
const KEY = new Uint32Array([
  0x6b1d3a97, 0x2ec4f058, 0x91a7d2e3, 0x0f5c8b6a,
  0xd3e9147c, 0x58b2a0f1, 0xa46e3d29, 0x7c0b95e4,
]);

const rotl = (v, c) => (v << c) | (v >>> (32 - c));

// RFC 8439 の ChaCha20。data を in-place で XOR する（暗号化も復号も同じ操作）。
// key: Uint32Array(8) / nonce: Uint8Array(12) / counter: 初期ブロックカウンタ
export function chacha20Xor(data, key, nonce, counter = 0) {
  const st = new Uint32Array(16);
  st[0] = 0x61707865; st[1] = 0x3320646e; st[2] = 0x79622d32; st[3] = 0x6b206574;
  for (let i = 0; i < 8; i++) st[4 + i] = key[i];
  const nv = new DataView(nonce.buffer, nonce.byteOffset, 12);
  st[13] = nv.getUint32(0, true); st[14] = nv.getUint32(4, true); st[15] = nv.getUint32(8, true);
  const x = new Uint32Array(16);
  const ks = new Uint8Array(64);
  const ksw = new DataView(ks.buffer);
  for (let off = 0, ctr = counter; off < data.length; off += 64, ctr++) {
    st[12] = ctr >>> 0;
    x.set(st);
    for (let r = 0; r < 10; r++) {
      // column rounds
      x[0] += x[4]; x[12] = rotl(x[12] ^ x[0], 16); x[8] += x[12]; x[4] = rotl(x[4] ^ x[8], 12);
      x[0] += x[4]; x[12] = rotl(x[12] ^ x[0], 8);  x[8] += x[12]; x[4] = rotl(x[4] ^ x[8], 7);
      x[1] += x[5]; x[13] = rotl(x[13] ^ x[1], 16); x[9] += x[13]; x[5] = rotl(x[5] ^ x[9], 12);
      x[1] += x[5]; x[13] = rotl(x[13] ^ x[1], 8);  x[9] += x[13]; x[5] = rotl(x[5] ^ x[9], 7);
      x[2] += x[6]; x[14] = rotl(x[14] ^ x[2], 16); x[10] += x[14]; x[6] = rotl(x[6] ^ x[10], 12);
      x[2] += x[6]; x[14] = rotl(x[14] ^ x[2], 8);  x[10] += x[14]; x[6] = rotl(x[6] ^ x[10], 7);
      x[3] += x[7]; x[15] = rotl(x[15] ^ x[3], 16); x[11] += x[15]; x[7] = rotl(x[7] ^ x[11], 12);
      x[3] += x[7]; x[15] = rotl(x[15] ^ x[3], 8);  x[11] += x[15]; x[7] = rotl(x[7] ^ x[11], 7);
      // diagonal rounds
      x[0] += x[5]; x[15] = rotl(x[15] ^ x[0], 16); x[10] += x[15]; x[5] = rotl(x[5] ^ x[10], 12);
      x[0] += x[5]; x[15] = rotl(x[15] ^ x[0], 8);  x[10] += x[15]; x[5] = rotl(x[5] ^ x[10], 7);
      x[1] += x[6]; x[12] = rotl(x[12] ^ x[1], 16); x[11] += x[12]; x[6] = rotl(x[6] ^ x[11], 12);
      x[1] += x[6]; x[12] = rotl(x[12] ^ x[1], 8);  x[11] += x[12]; x[6] = rotl(x[6] ^ x[11], 7);
      x[2] += x[7]; x[13] = rotl(x[13] ^ x[2], 16); x[8] += x[13]; x[7] = rotl(x[7] ^ x[8], 12);
      x[2] += x[7]; x[13] = rotl(x[13] ^ x[2], 8);  x[8] += x[13]; x[7] = rotl(x[7] ^ x[8], 7);
      x[3] += x[4]; x[14] = rotl(x[14] ^ x[3], 16); x[9] += x[14]; x[4] = rotl(x[4] ^ x[9], 12);
      x[3] += x[4]; x[14] = rotl(x[14] ^ x[3], 8);  x[9] += x[14]; x[4] = rotl(x[4] ^ x[9], 7);
    }
    for (let i = 0; i < 16; i++) ksw.setUint32(i * 4, (x[i] + st[i]) >>> 0, true);
    const n = Math.min(64, data.length - off);
    for (let i = 0; i < n; i++) data[off + i] ^= ks[i];
  }
  return data;
}

// mp3 バイト列 → .bgm バイト列。nonce は呼び出し側が与える（ビルドでは内容由来＝再ビルドで差分が出ない）。
export function encryptBgm(plain, nonce) {
  const out = new Uint8Array(HEADER + plain.length);
  out.set(MAGIC, 0);
  out.set(nonce, 4);
  out.set(plain, HEADER);
  chacha20Xor(out.subarray(HEADER), KEY, nonce, 1);
  return out;
}

// .bgm バイト列 → mp3 バイト列（新しい配列）。形式が違えば例外。
export function decryptBgm(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < HEADER || MAGIC.some((m, i) => b[i] !== m)) throw new Error("not a .bgm file");
  const nonce = b.slice(4, HEADER);
  return chacha20Xor(b.slice(HEADER), KEY, nonce, 1);
}

// 参照名（sound/bgm/**/<name>.mp3）→ 実際に配信している暗号化ファイルの URL。
// それ以外のパス（SE・ボイス等）はそのまま返す。
export function bgmFileUrl(src) {
  if (typeof src !== "string") return src;
  return /(^|\/)sound\/bgm\/.+\.mp3$/i.test(src) ? src.replace(/\.mp3$/i, ".bgm") : src;
}
export const isEncryptedBgm = (src) => bgmFileUrl(src) !== src;

// ── ブラウザ側：参照名 → 再生できる Blob URL（小さな LRU キャッシュ付き） ──────────
const MAX_CACHED = 4;
const _pending = new Map(); // src -> Promise<string>
const _ready = new Map();   // src -> blob URL（挿入順＝古い順）
let _inUse = () => new Set();

// 再生中の URL を返す関数を登録する（キャッシュ追い出し時に、鳴っている曲を revoke しないため）。
export function setBgmInUseProbe(fn) { if (typeof fn === "function") _inUse = fn; }

// 復号済みなら即座に Blob URL、未取得なら null（同期パス＝ユーザー操作の直後に play() したい時用）。
export function readyBgmUrl(src) {
  const u = _ready.get(src);
  if (u) { _ready.delete(src); _ready.set(src, u); } // LRU を更新
  return u || null;
}

// 参照名の曲を取得・復号して Blob URL を返す。暗号化対象外のパスはそのまま返す。
export function loadBgmUrl(src) {
  if (!isEncryptedBgm(src)) return Promise.resolve(src);
  const hit = readyBgmUrl(src);
  if (hit) return Promise.resolve(hit);
  if (_pending.has(src)) return _pending.get(src);
  const p = (async () => {
    const res = await fetch(bgmFileUrl(src));
    if (!res.ok) throw new Error(`BGM ${res.status}: ${bgmFileUrl(src)}（node tools/build-bgm.mjs で生成）`);
    const mp3 = decryptBgm(new Uint8Array(await res.arrayBuffer()));
    const url = URL.createObjectURL(new Blob([mp3], { type: "audio/mpeg" }));
    _ready.set(src, url);
    _evict();
    return url;
  })().finally(() => _pending.delete(src));
  _pending.set(src, p);
  return p;
}

// 先読み（失敗は黙って捨てる）。最初の画面の曲を起動時に温めておく用。
export function prefetchBgm(...srcs) {
  for (const s of srcs.flat()) if (s) loadBgmUrl(s).catch(() => {});
}

function _evict() {
  if (_ready.size <= MAX_CACHED) return;
  const busy = _inUse();
  for (const [src, url] of _ready) {
    if (_ready.size <= MAX_CACHED) break;
    if (busy.has(url)) continue;
    _ready.delete(src);
    // フェードアウト中の要素がまだ掴んでいる可能性があるので、少し待ってから解放。
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}
