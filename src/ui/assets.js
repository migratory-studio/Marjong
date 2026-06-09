// Asset loading: tile images + audio (BGM / SE).
//
// All assets are optional. If a file is missing the game still runs (the
// renderer falls back to procedural tile drawing, audio calls become no-ops).
import { suitOf, rankOf, honorOf, isHonor, SUITS } from "../core/tiles.js";

// ----------------------------------------------------------------- tile images
// Maps engine tile kinds to the actual files in graphic/.
// Naming convention (kept as-is from the asset pack):
//   manzu2_1/p_ms{1..9}_1.gif   (萬子 1..9)
//   pinzu2_1/p_ps{1..9}_1.gif   (筒子 1..9)
//   sozu2_1/p_ss{1..9}_1.gif    (索子 1..9)
//   tupai2_1/p_ji_{e,s,w,n}_1.gif   (東南西北)
//   tupai2_1/p_no_1.gif             (白 - blank tile)
//   tupai2_1/p_ji_h_1.gif           (發)
//   tupai2_1/p_ji_c_1.gif           (中)
// No dedicated red-5 art in this pack -> red fives reuse the normal 5 image.
const SUIT_DIR = { [SUITS.MAN]: ["manzu2_1", "p_ms"], [SUITS.PIN]: ["pinzu2_1", "p_ps"], [SUITS.SOU]: ["sozu2_1", "p_ss"] };
// honor index (1..7) = 東南西北白發中
const HONOR_FILE = ["p_ji_e", "p_ji_s", "p_ji_w", "p_ji_n", "p_no", "p_ji_h", "p_ji_c"];

export function tilePath(kind /*, red */) {
  if (isHonor(kind)) return `graphic/tupai2_1/${HONOR_FILE[honorOf(kind) - 1]}_1.gif`;
  const [dir, pfx] = SUIT_DIR[suitOf(kind)];
  return `graphic/${dir}/${pfx}${rankOf(kind)}_1.gif`;
}

export class TileImages {
  constructor() {
    this.cache = new Map(); // path -> {img, ready}
    this.ready = false;
  }

  // Preload every tile face. Resolves once all attempts settle (loaded or failed).
  load() {
    const paths = new Set();
    for (let kind = 0; kind < 34; kind++) paths.add(tilePath(kind));
    const jobs = [...paths].map((p) => this._loadOne(p));
    return Promise.allSettled(jobs).then(() => { this.ready = true; });
  }

  _loadOne(path) {
    return new Promise((resolve) => {
      const img = new Image();
      const entry = { img, ok: false };
      this.cache.set(path, entry);
      img.onload = () => { entry.ok = true; resolve(); };
      img.onerror = () => { entry.ok = false; resolve(); };
      img.src = path;
    });
  }

  // Returns a ready <img> for the tile, or null if unavailable.
  // `red` is accepted for API symmetry but ignored — pack has no red-5 art.
  get(kind, _red = false) {
    const entry = this.cache.get(tilePath(kind));
    return entry && entry.ok ? entry.img : null;
  }
}

// --------------------------------------------------- character images (icon / portrait)
// Preloads each character's icon + bust-up portrait from the character master.
// All optional: a missing file just yields null and the UI falls back (color block /
// no portrait). Place files at the paths declared in the master to light them up.
export class CharacterImages {
  constructor() {
    this.cache = new Map(); // url -> {img, ok}
  }

  // `characters` = the character master array (each has .id and .assets.{icon,portrait}).
  load(characters) {
    const urls = new Set();
    for (const c of characters) {
      if (c.assets?.icon) urls.add(c.assets.icon);
      if (c.assets?.portrait) urls.add(c.assets.portrait);
    }
    const jobs = [...urls].map((u) => this._loadOne(u));
    return Promise.allSettled(jobs).then(() => this);
  }

  _loadOne(url) {
    return new Promise((resolve) => {
      const img = new Image();
      const entry = { img, ok: false };
      this.cache.set(url, entry);
      img.onload = () => { entry.ok = true; resolve(); };
      img.onerror = () => { entry.ok = false; resolve(); };
      img.src = url;
    });
  }

  // Returns the URL if it loaded OK, else null. Handy for HTML <img> src + fallback.
  url(character, which /* "icon" | "portrait" */) {
    const u = character?.assets?.[which];
    if (!u) return null;
    const entry = this.cache.get(u);
    return entry && entry.ok ? u : null;
  }

  // Returns a ready <img> for canvas drawing, or null.
  get(character, which) {
    const u = character?.assets?.[which];
    if (!u) return null;
    const entry = this.cache.get(u);
    return entry && entry.ok ? entry.img : null;
  }
}

const clamp01v = (v) => Math.max(0, Math.min(1, Number(v) || 0));

// ----------------------------------------------------------------- audio
// BGM: one random track per hand (loops). SE: random dahai on every discard.
// File names contain Japanese characters & full-width digits, so URL-encode.
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
const BGM_TRACKS = ["mahjong-ingame1.mp3", "mahjong-ingame2.mp3"].map((n) => enc(`sound/bgm/${n}`));
const BGM_HOME = enc("sound/bgm/Peritune_Hanadoki.mp3");              // title / home screen
const BGM_SELECT = enc("sound/bgm/PerituneMaterial_Amenoshita3.mp3"); // character select
const BGM_MENTOR = enc("sound/bgm/PerituneMaterial_Otogi4.mp3");      // 師弟ホーム（ほのぼの和風 / Peritune Otogi4）
// 宝大会＝ティア別のインゲームBGM（PeriTune／要クレジット表記）。T1=剣戟 / T2=EpicBattle / T3=天ノ下。
// ※T1/T2 の mp3 は sound/bgm/ に配置（下記ファイル名にリネーム）。T3 は既存 Amenoshita3 を流用。
const BGM_TOURNEY = {
  1: enc("sound/bgm/PeriTune_Kengeki.mp3"),       // https://peritune.com/blog/2021/08/17/kengeki/
  2: enc("sound/bgm/PeriTune_EpicBattle.mp3"),    // https://peritune.com/blog/2021/09/16/epicbattle_j/
  3: enc("sound/bgm/PerituneMaterial_Amenoshita3.mp3"), // 既存流用（天ノ下 / character select と同曲）
};
const SE_DAHAI = ["１", "２", "３", "４"].map((n) => enc(`sound/se/dahai/牌を置く・その${n}.mp3`));
const SE_SHUFFLE = enc("sound/se/麻雀牌をまぜる.mp3"); // start of hand (deal)
const SE_KINGAKU = enc("sound/se/shakiin2.mp3");     // on win (score reveal)
const SE_NAKI = enc("sound/se/naki.mp3");            // shared call SE (pon/chi/kan executed)
const SE_NAKITAKU = enc("sound/se/nakitaku.mp3");    // call-prompt SE (pon/chi/kan options offered)

export class AudioManager {
  constructor({ bgmVolume = 0.4, seVolume = 0.8 } = {}) {
    this.enabled = true;
    this.bgmVolume = bgmVolume;
    this.seVolume = seVolume;
    this.currentBgm = null;
    this.currentBgmSrc = null;
    this._sePool = this._buildPool(SE_DAHAI, seVolume, 4);
    this._seShuffle = this._buildPool([SE_SHUFFLE], seVolume, 1);
    this._seKingaku = this._buildPool([SE_KINGAKU], seVolume, 1);
    this._seNaki = this._buildPool([SE_NAKI], seVolume, 3); // overlap-safe pool
    this._seNakitaku = this._buildPool([SE_NAKITAKU], seVolume, 2); // call-prompt cue
    // Per-character voices: charId -> { key -> { audio, ok } }. Populated by
    // registerCharacterVoices(); playVoice() falls back to the shared SE when absent.
    this._voices = new Map();
  }

  // Preload a small pool of Audio elements per SE so rapid plays don't cut off.
  _buildPool(paths, volume, copies) {
    const pool = paths.map((src) => {
      const variants = [];
      for (let i = 0; i < copies; i++) {
        const a = new Audio();
        a.src = src;
        a.volume = volume;
        a.preload = "auto";
        variants.push(a);
      }
      return { src, variants, next: 0 };
    });
    return pool;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.currentBgm) this.currentBgm.pause();
    else if (on && this.currentBgm) this.currentBgm.play().catch(() => {});
  }

  // Live volume controls (0..1). Used by the settings UI.
  setBgmVolume(v) {
    this.bgmVolume = clamp01v(v);
    if (this.currentBgm) this.currentBgm.volume = this.bgmVolume;
  }
  setSeVolume(v) {
    this.seVolume = clamp01v(v);
    for (const pool of [this._sePool, this._seShuffle, this._seKingaku, this._seNaki, this._seNakitaku]) {
      for (const slot of pool) for (const a of slot.variants) a.volume = this.seVolume;
    }
    for (const byKey of this._voices.values()) {
      for (const slot of Object.values(byKey)) slot.audio.volume = this.seVolume;
    }
  }

  // Register a character's voice clips. `voicesMap` = { pon, chi, kan, riichi, tsumo, ron }
  // -> URL. Each clip tracks whether it actually loaded; playVoice() falls back to the
  // shared SE for any clip that is missing or failed to load. Encodes Japanese paths.
  registerCharacterVoices(charId, voicesMap = {}) {
    const byKey = {};
    for (const [key, src] of Object.entries(voicesMap)) {
      if (!src) continue;
      const a = new Audio();
      const slot = { audio: a, ok: false };
      a.volume = this.seVolume;
      a.preload = "auto";
      a.addEventListener("canplaythrough", () => { slot.ok = true; }, { once: true });
      a.addEventListener("error", () => { slot.ok = false; }, { once: true });
      a.src = enc(src);
      byKey[key] = slot;
    }
    this._voices.set(charId, byKey);
  }

  // Play character `charId`'s voice for `key` (e.g. "pon"). Falls back to the matching
  // shared SE when the clip is unavailable: pon/chi/kan -> naki, riichi -> chime,
  // tsumo/ron -> win jingle.
  playVoice(charId, key) {
    if (!this.enabled) return;
    const slot = this._voices.get(charId)?.[key];
    if (slot && slot.ok) {
      try { slot.audio.currentTime = 0; slot.audio.play().catch(() => {}); return; } catch { /* fall through */ }
    }
    if (key === "riichi") this.playRiichi();
    else if (key === "tsumo" || key === "ron") this.playWin();
    else this.playNaki(); // pon / chi / kan (and any unknown key)
  }

  // Start a random in-game BGM track (loops). Called at the start of each hand.
  playRandomBgm() {
    this.playBgm(BGM_TRACKS[(Math.random() * BGM_TRACKS.length) | 0], { force: true });
  }

  // 宝大会のティア別BGM（大会中は1曲で通す）。force:false なので2局目以降は同曲なら no-op＝曲が続く。
  // ファイル未配置なら play() が失敗して無音になるだけ（クラッシュしない）。
  playTournamentBgm(tier) {
    const src = BGM_TOURNEY[tier] || BGM_TRACKS[0];
    this.playBgm(src);
  }

  // Title / home and character-select screen BGM.
  playHomeBgm() { this.playBgm(BGM_HOME); }
  playSelectBgm() { this.playBgm(BGM_SELECT); }
  // 師弟ホーム（ハブ）のBGM。サブ画面（休憩/育成/シナリオ一覧等）はこのまま継続させる。
  playMentorBgm() { this.playBgm(BGM_MENTOR); }

  // Play a specific looping BGM, cross-fading from the current track. A no-op when
  // that same track is already playing, so re-entering a screen doesn't restart it
  // (pass force:true to always swap, e.g. random per-hand picks). If autoplay is
  // blocked (no user gesture yet) currentBgmSrc is cleared so a later retry works.
  playBgm(src, { force = false } = {}) {
    if (!this.enabled) return;
    if (!force && this.currentBgm && this.currentBgmSrc === src) return;
    const old = this.currentBgm;
    const next = new Audio();
    next.src = src;
    next.loop = true;
    next.volume = 0;
    this.currentBgm = next;
    this.currentBgmSrc = src;
    next.play().then(() => this._fade(next, this.bgmVolume, 600)).catch(() => {
      if (this.currentBgm === next) this.currentBgmSrc = null; // allow retry after a gesture
    });
    if (old) this._fade(old, 0, 500, () => old.pause());
  }

  stopBgm() {
    if (this.currentBgm) { this.currentBgm.pause(); this.currentBgm = null; }
    this.currentBgmSrc = null;
  }

  // Play an arbitrary one-shot SE by URL (used by the scenario player's seId).
  // A fresh Audio per call — fine for the occasional scenario cue. `volume` is a
  // 0..1 multiplier on top of the SE slider. No-ops when audio is off or src empty.
  playSe(src, volume = 1) {
    if (!this.enabled || !src) return;
    try {
      const a = new Audio(src);
      a.volume = clamp01v(volume) * this.seVolume;
      a.play().catch(() => {});
    } catch { /* ignore */ }
  }

  // Play a random dahai SE. Called on every discard (any player).
  playDahai() { this._playFromPool(this._sePool); }
  // Hand-start shuffle / win-jingle / naki (pon-chi-kan) call.
  playShuffle() { this._playFromPool(this._seShuffle); }
  playWin() { this._playFromPool(this._seKingaku); }
  playNaki() { this._playFromPool(this._seNaki); }
  // Call-prompt cue: played when pon/chi/kan options are offered to the human.
  playNakitaku() { this._playFromPool(this._seNakitaku); }

  // Short "カチッ" cursor click, synthesised via WebAudio (no sample shipped).
  // Used by hover/selection UI (e.g. the result screen). Scales with SE volume.
  playClick() {
    if (!this.enabled) return;
    try {
      if (!this._actx) this._actx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._actx;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const peak = this.seVolume * 0.22;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = 1500;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.05);
      o.connect(g).connect(ctx.destination);
      o.start(now); o.stop(now + 0.07);
    } catch { /* ignore */ }
  }

  // 短い「ピッ」（カウントアップ演出用）。freq を上げると「ピピピッ」の上昇感が出る。
  // サンプル不要の WebAudio 合成。SE 音量に追従。
  playPip(freq = 1760, vol = 0.5) {
    if (!this.enabled) return;
    try {
      if (!this._actx) this._actx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._actx;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const peak = this.seVolume * vol;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 0.07);
      o.connect(g).connect(ctx.destination);
      o.start(now); o.stop(now + 0.09);
    } catch { /* ignore */ }
  }

  // Riichi declaration SE: short two-note chime synthesised via WebAudio
  // (the asset pack ships no riichi sample). Scales with the SE volume slider.
  playRiichi() {
    if (!this.enabled) return;
    try {
      if (!this._actx) this._actx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._actx;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const peak = this.seVolume * 0.4;
      // E5 -> A5 ascending chime
      for (const [freq, delay, dur] of [[659.25, 0, 0.22], [880, 0.13, 0.5]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        const t0 = now + delay;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t0); o.stop(t0 + dur + 0.05);
      }
    } catch { /* ignore */ }
  }

  _playFromPool(pool) {
    if (!this.enabled || !pool || pool.length === 0) return;
    const slot = pool[(Math.random() * pool.length) | 0];
    const a = slot.variants[slot.next];
    slot.next = (slot.next + 1) % slot.variants.length;
    try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* ignore */ }
  }

  _fade(audio, target, ms, done) {
    target = Math.max(0, Math.min(1, target));
    const start = audio.volume;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * k));
      if (k < 1) requestAnimationFrame(step);
      else if (done) done();
    };
    requestAnimationFrame(step);
  }
}
