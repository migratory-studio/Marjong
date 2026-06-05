// 紙芝居プレイヤー（軽量・対局非依存）。
//
// マスタ（SCENARIO_MASTER / SCENARIO_LINE_MASTER）を読み込み、scenarioId を
// 指定すると #scenario-screen に1本ぶんを再生する。クリックで進行、最後の行を
// 越えたら onEnd を呼ぶ。
//
// 演出（すべて任意・後方互換）:
//   - 立ち絵: 1画面に最大3体（left / center / right）。各行は `standings` 配列で
//     「その瞬間に出ている立ち絵」を明示する（状態を持たない VN 方式）。プレイヤーは
//     前行との差分を取り、登場=フェードイン / 退場=フェードアウト / 同一キャラの
//     position 変更=左右スライド を自動で付ける（＝generator は position を変えるだけで移動）。
//   - 話者（speakerCharacterId）は強調表示、他はやや暗くなる。
//   - characterEffect: 話者立ち絵への一発アクセント（jump/shake/fade_in/fade_out）。
//   - screenEffect: 画面全体（flash/shake/fade_in/fade_out）。
//   - backgroundId: 背景切替（backgroundMaster。画像があれば cover、無ければグラデーション）。
//   - bgmId: BGM 切替（変化した行でクロスフェード。"bgm-none" で停止）。
//   - seId: ワンショット効果音。
//   - emoteId: 話者の頭上に感情アイコン（スプライト）を再生。
//
//   import { playScenario, listScenarios } from "./scenario/scenarioPlayer.js";
//   playScenario("twin-chun-yao-01", { onEnd: () => {...}, audio });
//
// マスタ仕様は major_update_specification.md §12 / §16.2、
// 生成は scenario-forge プロジェクト（dist/ を src/data/ へ持ち込む）。
import { SCENARIO_MASTER } from "../data/scenarioMaster.js";
import { SCENARIO_LINE_MASTER } from "../data/scenarioLineMaster.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { emoteDef } from "../data/emoteMaster.js";
import { bgDef } from "../data/backgroundMaster.js";
import { bgmDef, seDef } from "../data/scenarioAudioMaster.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 立ち位置(left/center/right) → 横位置(%)。スライド移動はこの差を CSS transition で繋ぐ。
const POS_PCT = { left: 22, center: 50, right: 78 };
const posPct = (p) => POS_PCT[p] ?? 50;

// 背景画像のプローブ結果キャッシュ（url -> true/false）。同じ背景を何度も試さない。
const bgProbe = new Map();
function probeBg(url) {
  if (bgProbe.has(url)) return Promise.resolve(bgProbe.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { bgProbe.set(url, true); resolve(true); };
    img.onerror = () => { bgProbe.set(url, false); resolve(false); };
    img.src = url;
  });
}

// 行の立ち絵リストを正規化（新形式 standings[] / 旧形式 standingId を吸収）。
function standingsOf(line) {
  if (Array.isArray(line.standings)) return line.standings;
  if (line.speakerCharacterId)
    return [{ characterId: line.speakerCharacterId, position: "center", standingId: line.standingId || "default" }];
  return [];
}

export function listScenarios() {
  return SCENARIO_MASTER.filter((s) => s.isEnabled)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function playScenario(scenarioId, { onEnd, audio } = {}) {
  const meta = SCENARIO_MASTER.find((s) => s.scenarioId === scenarioId);
  const lines = SCENARIO_LINE_MASTER
    .filter((l) => l.scenarioId === scenarioId)
    .slice()
    .sort((a, b) => a.lineNo - b.lineNo);
  if (!meta || lines.length === 0) {
    console.warn(`[scenarioPlayer] シナリオが見つからない: ${scenarioId}`);
    onEnd?.();
    return;
  }

  const root = document.getElementById("scenario-screen");
  root.innerHTML = `
    <div class="sc-bg"></div>
    <div class="sc-stage"></div>
    <div class="sc-emote-layer"></div>
    <div class="sc-fx-screen"></div>
    <div class="sc-textbox">
      <div class="sc-name"></div>
      <div class="sc-text"></div>
      <div class="sc-hint">クリックで進む ▶</div>
    </div>
    <div class="sc-sysbar">
      <button class="sc-sys sc-sys-auto" data-act="auto" type="button" aria-label="オート">自動</button>
      <button class="sc-sys sc-sys-skip" data-act="skip" type="button" aria-label="スキップ">早送</button>
      <button class="sc-sys sc-sys-log" data-act="log" type="button" aria-label="バックログ">履歴</button>
      <button class="sc-sys sc-sys-menu" data-act="menu" type="button" aria-label="閉じる">目録</button>
    </div>
    <div class="sc-backlog hidden" aria-hidden="true">
      <div class="sc-backlog-inner"></div>
      <div class="sc-backlog-hint">クリックで閉じる ✕</div>
    </div>
    <div class="sc-progress"></div>`;
  root.classList.remove("hidden");

  const elBg = root.querySelector(".sc-bg");
  const elStage = root.querySelector(".sc-stage");
  const elEmote = root.querySelector(".sc-emote-layer");
  const elFx = root.querySelector(".sc-fx-screen");
  const elName = root.querySelector(".sc-name");
  const elText = root.querySelector(".sc-text");
  const elProgress = root.querySelector(".sc-progress");
  const elSysbar = root.querySelector(".sc-sysbar");
  const elBacklog = root.querySelector(".sc-backlog");
  const elBacklogInner = root.querySelector(".sc-backlog-inner");

  let i = -1;
  let curBg = null;
  let curBgmId = null;          // 現在鳴らしているシナリオ BGM の id
  let bgmTouched = false;       // 一度でも BGM をいじったか（finish 時の復元判定）
  const prevBgmSrc = audio?.currentBgmSrc ?? null; // 入室前の BGM（終了時に復元）
  let currentSpeakerImg = null;
  let stopEmote = null;         // 再生中エモートの停止関数（次の行/終了で呼ぶ）
  const slots = new Map();      // characterId -> { slot, img, position }（差分描画用）

  // ---- システムバー状態（オート/早送/履歴/目録）----
  const history = [];           // 表示済みの行 { name, text }（バックログ用）
  let autoOn = false;           // オート送り
  let skipOn = false;           // 早送り（スキップ）
  let autoTimer = null;         // オートの次行タイマー
  let skipTimer = null;         // スキップの連続送りタイマー
  const AUTO_DELAY = 1700;      // オート1行あたりの待ち（ms）
  const SKIP_INTERVAL = 60;     // スキップの送り間隔（ms）

  function clearTimers() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    if (skipTimer) { clearInterval(skipTimer); skipTimer = null; }
  }

  function finish() {
    clearTimers();
    clearEmote();
    // BGM を触っていたら入室前の状態へ戻す（メニュー BGM の継続性）。
    if (bgmTouched && audio) {
      if (prevBgmSrc) audio.playBgm(prevBgmSrc);
      else audio.stopBgm();
    }
    root.removeEventListener("click", onClick);
    root.classList.add("hidden");
    root.innerHTML = "";
    onEnd?.();
  }

  function clearEmote() {
    if (stopEmote) { stopEmote(); stopEmote = null; }
    if (elEmote) elEmote.innerHTML = "";
  }

  // 背景切替: まずグラデーションを即時適用、画像があればプローブして cover で被せる。
  function applyBg(id) {
    if (id === curBg) return;
    curBg = id;
    const def = bgDef(id);
    elBg.style.background = def.gradient;
    if (def.image) {
      probeBg(def.image).then((ok) => {
        if (curBg !== id) return; // 進んでしまっていたら何もしない
        if (ok) {
          // 可読性のため薄い暗幕を画像に重ねる。
          elBg.style.backgroundImage = `linear-gradient(rgba(0,0,0,.12),rgba(0,0,0,.32)), url("${def.image}")`;
          elBg.style.backgroundSize = "cover";
          elBg.style.backgroundPosition = "center";
        }
      });
    }
  }

  // 行の bgmId / seId に応じて音を鳴らす（audio が無ければ no-op）。
  function applyAudio(line) {
    if (!audio) return;
    if (line.bgmId && line.bgmId !== curBgmId) {
      curBgmId = line.bgmId;
      bgmTouched = true;
      if (line.bgmId === "bgm-none") { audio.stopBgm(); }
      else { const d = bgmDef(line.bgmId); if (d?.file) audio.playBgm(d.file); }
    }
    if (line.seId) { const d = seDef(line.seId); if (d?.file) audio.playSe(d.file); }
  }

  // 行の emoteId を見て、話者の立ち位置の頭上にスプライトアニメを表示する。
  // スプライトシート（cols×rows）を JS でフレーム送り（backgroundPosition）する。
  function renderEmote(line, speakerImg) {
    clearEmote();
    const def = line.emoteId ? emoteDef(line.emoteId) : null;
    if (!def || !elEmote) return;
    speakerImg = speakerImg || currentSpeakerImg;

    // 話者の立ち位置に x を合わせる（地の文＝話者なしは中央）。
    const sp = standingsOf(line).find((s) => s.characterId === line.speakerCharacterId);
    const pos = sp ? sp.position : "center";
    const fallbackXPct = pos === "left" ? 26 : pos === "right" ? 74 : 50;
    const ch = line.speakerCharacterId ? charById(line.speakerCharacterId) : null;
    const customPos = ch?.emotePos || null;

    const e = document.createElement("div");
    e.className = "sc-emote";
    e.style.width = `${def.size}px`;
    e.style.height = `${def.size}px`;
    e.style.backgroundImage = `url("${def.sheet}")`;
    e.style.backgroundSize = `${def.cols * def.size}px ${def.rows * def.size}px`;
    elEmote.appendChild(e);

    const rootRect = root.getBoundingClientRect();
    const imgRect = speakerImg?.getBoundingClientRect?.();
    if (imgRect && rootRect.width > 0 && rootRect.height > 0) {
      const scaleX = rootRect.width / root.clientWidth;
      const scaleY = rootRect.height / root.clientHeight;
      const imgLeft = (imgRect.left - rootRect.left) / scaleX;
      const imgRight = (imgRect.right - rootRect.left) / scaleX;
      const imgTop = (imgRect.top - rootRect.top) / scaleY;
      const side = customPos?.side === "right" ? 1 : customPos?.side === "left" ? -1 : pos === "left" ? 1 : -1;
      const edgeOffset = customPos?.x ?? def.size * 0.42;
      const topOffset = customPos?.y ?? def.size * 0.02;
      const x = side > 0 ? imgRight + edgeOffset : imgLeft - edgeOffset;
      const y = imgTop + topOffset;
      e.style.left = `${clamp(x, def.size * 0.55, root.clientWidth - def.size * 0.55)}px`;
      e.style.top = `${clamp(y, 12, root.clientHeight - def.size - 12)}px`;
    } else {
      e.style.left = `${fallbackXPct}%`;
      e.style.top = "7%";
    }

    const place = (f) => {
      const col = f % def.cols;
      const row = Math.floor(f / def.cols);
      e.style.backgroundPosition = `-${col * def.size}px -${row * def.size}px`;
    };
    let frame = 0;
    place(0);
    const timer = setInterval(() => {
      frame++;
      if (frame >= def.frameCount) {
        if (def.loop) { frame = 0; }
        else { place(def.frameCount - 1); clearInterval(timer); stopEmote = null; return; }
      }
      place(frame);
    }, 1000 / (def.fps || 24));
    stopEmote = () => clearInterval(timer);
  }

  function applyEffect(target, effect, prefix, ms) {
    if (!target || !effect || effect === "none") return;
    const cls = `${prefix}-${effect}`;
    target.classList.remove(cls);
    void target.offsetWidth; // reflow so the animation can re-trigger
    if (ms && ms > 0) target.style.setProperty("--sc-dur", `${ms}ms`);
    target.classList.add(cls);
    const clear = () => target.classList.remove(cls);
    target.addEventListener("animationend", clear, { once: true });
    setTimeout(clear, (ms && ms > 0 ? ms : 500) + 80); // 保険
  }

  // 立ち絵スロットを前行との差分で更新する（要素を使い回すので CSS transition が効く）:
  //   登場 = フェードイン / 退場 = フェードアウト後に除去 / 継続&位置変更 = 左右スライド。
  // 話者の <img> を返す（emote/効果の対象）。
  function reconcileStage(line) {
    const stands = standingsOf(line).filter((st) => {
      const ch = charById(st.characterId);
      return ch && ch.assets?.portrait;
    });
    const nextIds = new Set(stands.map((s) => s.characterId));

    // 退場: 今行に居ないキャラはフェードアウトして除去。
    for (const [id, rec] of slots) {
      if (!nextIds.has(id)) {
        rec.slot.classList.add("sc-exit");
        const el = rec.slot;
        setTimeout(() => el.remove(), 420);
        slots.delete(id);
      }
    }

    let speakerImg = null;
    for (const st of stands) {
      const ch = charById(st.characterId);
      const targetLeft = posPct(st.position);
      let rec = slots.get(st.characterId);
      if (!rec) {
        // 登場: スロット生成 → 次フレームで sc-enter を外してフェードイン。
        const slot = document.createElement("div");
        slot.className = "sc-slot sc-enter";
        slot.style.left = `${targetLeft}%`;
        const img = document.createElement("img");
        img.className = "sc-standing";
        img.alt = ch.name || "";
        img.src = ch.assets.portrait;
        img.style.objectPosition = ch.portraitPos || "top center";
        img.onerror = () => { slot.style.display = "none"; };
        slot.appendChild(img);
        elStage.appendChild(slot);
        rec = { slot, img, position: st.position };
        slots.set(st.characterId, rec);
        requestAnimationFrame(() => slot.classList.remove("sc-enter"));
      } else if (rec.position !== st.position) {
        // 継続表示で立ち位置が変わった → left の変化を transition がスライドにする。
        rec.slot.style.left = `${targetLeft}%`;
        rec.position = st.position;
      }

      // 話者は強調、それ以外は減光。話者なし（地の文）は全員ニュートラル。
      const isSpeaker = !!line.speakerCharacterId && st.characterId === line.speakerCharacterId;
      rec.img.classList.toggle("sc-active", isSpeaker);
      rec.img.classList.toggle("sc-dim", !!line.speakerCharacterId && !isSpeaker);
      rec.slot.style.zIndex = isSpeaker ? 2 : 1;
      if (isSpeaker) speakerImg = rec.img;
    }
    return speakerImg;
  }

  function show(line) {
    applyBg(line.backgroundId);
    applyAudio(line);
    const speakerImg = reconcileStage(line);
    currentSpeakerImg = speakerImg;

    const ch = line.speakerCharacterId ? charById(line.speakerCharacterId) : null;
    const name = line.speakerNameOverride || ch?.name || "";
    elName.textContent = name;
    elName.style.visibility = name ? "visible" : "hidden";
    if (ch?.color) elName.style.borderColor = ch.color;
    elText.textContent = line.text;
    elProgress.textContent = `${line.lineNo} / ${lines.length}`;
    history.push({ name, text: line.text }); // バックログ（履歴）用に蓄積

    // 立ち絵演出は「話者の立ち絵」に適用（地の文なら対象なし）。
    applyEffect(speakerImg, line.characterEffect, "scfx-ch", line.effectDurationMs);
    applyEffect(elFx, line.screenEffect, "scfx-sc", line.effectDurationMs);

    // エモート（感情アイコン）: 行に emoteId があれば話者の頭上に再生。
    renderEmote(line, speakerImg);
  }

  function advance() {
    i++;
    if (i >= lines.length) { finish(); return; }
    show(lines[i]);
    if (autoOn && !skipOn) scheduleAuto(); // オート中は次行を予約
  }

  // ---- オート（自動送り）----
  function scheduleAuto() {
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => { autoTimer = null; if (autoOn) advance(); }, AUTO_DELAY);
  }
  function setAuto(on) {
    autoOn = on;
    root.querySelector(".sc-sys-auto")?.classList.toggle("is-on", on);
    if (on) { setSkip(false); scheduleAuto(); }
    else if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }
  // ---- スキップ（早送り）----
  function setSkip(on) {
    skipOn = on;
    root.querySelector(".sc-sys-skip")?.classList.toggle("is-on", on);
    if (on) {
      setAuto(false);
      if (skipTimer) clearInterval(skipTimer);
      skipTimer = setInterval(() => { if (skipOn) advance(); }, SKIP_INTERVAL);
    } else if (skipTimer) { clearInterval(skipTimer); skipTimer = null; }
  }
  // ---- バックログ（履歴）----
  function backlogOpen() { return !elBacklog.classList.contains("hidden"); }
  function openBacklog() {
    setAuto(false); setSkip(false); // 読んでいる間は送りを止める
    elBacklogInner.innerHTML = history.map((h) =>
      `<div class="sc-bl-row">${h.name ? `<span class="sc-bl-name">${escapeHtml(h.name)}</span>` : ""}<span class="sc-bl-text">${escapeHtml(h.text)}</span></div>`
    ).join("");
    elBacklog.classList.remove("hidden");
    elBacklog.setAttribute("aria-hidden", "false");
    elBacklogInner.scrollTop = elBacklogInner.scrollHeight; // 最新（末尾）へ
  }
  function closeBacklog() {
    elBacklog.classList.add("hidden");
    elBacklog.setAttribute("aria-hidden", "true");
  }

  // システムバー: 自前のハンドラ＋stopPropagation で本文クリック送りを抑止。
  elSysbar.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const btn = ev.target.closest(".sc-sys");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "auto") setAuto(!autoOn);
    else if (act === "skip") setSkip(!skipOn);
    else if (act === "log") openBacklog();
    else if (act === "menu") finish();
  });
  // バックログはクリックで閉じる（本文送りには伝播させない）。
  elBacklog.addEventListener("click", (ev) => { ev.stopPropagation(); closeBacklog(); });

  function onClick(ev) {
    if (ev.target.closest(".sc-sysbar") || ev.target.closest(".sc-backlog")) return;
    if (backlogOpen()) { closeBacklog(); return; }
    // 手動クリックはオート/スキップを解除してユーザへ制御を戻す。
    if (autoOn) setAuto(false);
    if (skipOn) setSkip(false);
    advance();
  }
  root.addEventListener("click", onClick);
  advance(); // 1行目を表示
}

// バックログ表示用の最小 HTML エスケープ（マスタ文字列を素で innerHTML に入れない）。
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
