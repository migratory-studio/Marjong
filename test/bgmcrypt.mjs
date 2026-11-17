// BGM 暗号化（src/ui/bgmCrypt.js）のテスト。
//   - ChaCha20 実装が RFC 8439 のテストベクタ／Node 標準の chacha20 と一致すること
//   - encrypt → decrypt で元に戻ること、参照名 → .bgm の差し替え規則
//   - 同梱の .bgm がすべて復号でき、中身が mp3 であること／sound/bgm に生 mp3 が無いこと
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bgmFileUrl, chacha20Xor, decryptBgm, encryptBgm, isEncryptedBgm } from "../src/ui/bgmCrypt.js";

const hex = (s) => Uint8Array.from(s.replace(/\s+/g, "").match(/../g).map((h) => parseInt(h, 16)));
const keyWords = (bytes) => { const dv = new DataView(bytes.buffer); return Uint32Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4, true)); };

// RFC 8439 §2.4.2
{
  const key = hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
  const nonce = hex("000000000000004a00000000");
  const pt = new TextEncoder().encode("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const ct = chacha20Xor(Uint8Array.from(pt), keyWords(key), nonce, 1);
  assert.deepEqual(ct.subarray(0, 16), hex("6e2e359a2568f98041ba0728dd0d6981"));
  assert.deepEqual(ct.subarray(ct.length - 10), hex("b40b8eedf2785e42874d"));
}

// Node 標準 chacha20（iv = 4 バイトのカウンタ LE + 12 バイト nonce）と一致
for (const len of [0, 1, 63, 64, 65, 1000, 70001]) {
  const key = randomBytes(32), nonce = randomBytes(12), data = randomBytes(len);
  const iv = Buffer.concat([Buffer.from([1, 0, 0, 0]), nonce]);
  const c = createCipheriv("chacha20", key, iv);
  const want = Buffer.concat([c.update(data), c.final()]);
  const got = chacha20Xor(Uint8Array.from(data), keyWords(new Uint8Array(key)), new Uint8Array(nonce), 1);
  assert.deepEqual(Buffer.from(got), want, `len=${len}`);
}

// 往復・形式チェック
{
  const plain = new Uint8Array(randomBytes(5000));
  const enc = encryptBgm(plain, new Uint8Array(randomBytes(12)));
  assert.equal(enc.length, plain.length + 16);
  assert.notDeepEqual(enc.subarray(16, 48), plain.subarray(0, 32));
  assert.deepEqual(decryptBgm(enc), plain);
  assert.throws(() => decryptBgm(plain), /not a \.bgm/);
}

// 参照名の差し替え規則
assert.equal(bgmFileUrl("sound/bgm/Peritune_Hanadoki.mp3"), "sound/bgm/Peritune_Hanadoki.bgm");
assert.equal(bgmFileUrl("sound/bgm/scenario/bgm-warm.mp3"), "sound/bgm/scenario/bgm-warm.bgm");
assert.equal(bgmFileUrl("sound/se/naki.mp3"), "sound/se/naki.mp3");
assert.equal(isEncryptedBgm("sound/voice/shiyue/pon.mp3"), false);

// 同梱ファイル
const root = fileURLToPath(new URL("..", import.meta.url));
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p))); else out.push(p);
  }
  return out;
}
const shipped = await walk(join(root, "sound", "bgm"));
assert.deepEqual(shipped.filter((f) => /\.mp3$/i.test(f)), [], "sound/bgm/ に生の mp3 が残っている");
const bgms = shipped.filter((f) => /\.bgm$/i.test(f));
assert.ok(bgms.length > 0, "sound/bgm/ に .bgm が無い");
for (const f of bgms) {
  const mp3 = decryptBgm(new Uint8Array(await readFile(f)));
  const id3 = mp3[0] === 0x49 && mp3[1] === 0x44 && mp3[2] === 0x33;     // "ID3"
  const sync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;               // MPEG frame sync
  assert.ok(id3 || sync, `復号結果が mp3 に見えない: ${f}`);
}

console.log(`bgmcrypt: ok（.bgm ${bgms.length} 件を復号確認）`);
