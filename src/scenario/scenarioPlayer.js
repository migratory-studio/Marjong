// 紙芝居プレイヤー（軽量・対局非依存）。
//
// マスタ（SCENARIO_MASTER / SCENARIO_LINE_MASTER）を読み込み、scenarioId を
// 指定すると #scenario-screen に1本ぶんを再生する。クリックで進行、最後の行を
// 越えたら onEnd を呼ぶ。演出は CSS animation（characterEffect / screenEffect）。
//
// 立ち絵は1画面に最大3体（left / center / right）。各行は標準で `standings` 配列
// （{ characterId, position, standingId }）で「その瞬間に出ている立ち絵」を明示する。
// 喋っているキャラ（speakerCharacterId）は強調表示され、他はやや暗くなる。
// 旧形式（standings 無し・speakerCharacterId + standingId のみ）も後方互換で中央1体描画。
//
//   import { playScenario, listScenarios } from "./scenario/scenarioPlayer.js";
//   playScenario("twin-chun-yao-01", { onEnd: () => {...} });
//
// マスタ仕様は major_update_specification.md §12 / §16.2、
// 生成は scenario-forge プロジェクト（dist/ を src/data/ へ持ち込む）。
import { SCENARIO_MASTER } from "../data/scenarioMaster.js";
import { SCENARIO_LINE_MASTER } from "../data/scenarioLineMaster.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { emoteDef } from "../data/emoteMaster.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

// 背景IDは現状プリセット画像が無いので CSS グラデーションへフォールバック。
// 画像を graphic/bg/<id>.png として置けば差し替え可能（未実装でも崩れない）。
const BG_GRADIENT = {
  "bg-dojo": "linear-gradient(160deg,#2a2018 0%,#3c2c20 55%,#1c140e 100%)",
  "bg-dojo-night": "linear-gradient(160deg,#10141f 0%,#1b2233 60%,#0a0d15 100%)",
  "bg-table": "radial-gradient(circle at 50% 40%,#246048 0%,#163a2b 80%)",
  "bg-street": "linear-gradient(160deg,#33384a 0%,#4a5168 60%,#20242f 100%)",
  "bg-black": "#0a0a0c",
  "bg-white": "#f3f1ec",
};
const bgStyle = (id) => BG_GRADIENT[id] || "linear-gradient(160deg,#2a2018,#1c140e)";

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

export function playScenario(scenarioId, { onEnd } = {}) {
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
    <button class="sc-close" type="button" aria-label="閉じる">× とじる</button>
    <div class="sc-progress"></div>`;
  root.classList.remove("hidden");

  const elBg = root.querySelector(".sc-bg");
  const elStage = root.querySelector(".sc-stage");
  const elEmote = root.querySelector(".sc-emote-layer");
  const elFx = root.querySelector(".sc-fx-screen");
  const elName = root.querySelector(".sc-name");
  const elText = root.querySelector(".sc-text");
  const elProgress = root.querySelector(".sc-progress");

  let i = -1;
  let curBg = null;
  let stopEmote = null; // 再生中エモートの停止関数（次の行/終了で呼ぶ）

  function finish() {
    clearEmote();
    root.removeEventListener("click", onClick);
    root.classList.add("hidden");
    root.innerHTML = "";
    onEnd?.();
  }

  function clearEmote() {
    if (stopEmote) { stopEmote(); stopEmote = null; }
    if (elEmote) elEmote.innerHTML = "";
  }

  // 行の emoteId を見て、話者の立ち位置の頭上にスプライトアニメを表示する。
  // スプライトシート（cols×rows）を JS でフレーム送り（backgroundPosition）する。
  function renderEmote(line) {
    clearEmote();
    const def = line.emoteId ? emoteDef(line.emoteId) : null;
    if (!def || !elEmote) return;

    // 話者の立ち位置に x を合わせる（地の文＝話者なしは中央）。
    const sp = standingsOf(line).find((s) => s.characterId === line.speakerCharacterId);
    const pos = sp ? sp.position : "center";
    const xPct = pos === "left" ? 26 : pos === "right" ? 74 : 50;

    const e = document.createElement("div");
    e.className = "sc-emote";
    e.style.left = `${xPct}%`;
    e.style.width = `${def.size}px`;
    e.style.height = `${def.size}px`;
    e.style.backgroundImage = `url("${def.sheet}")`;
    e.style.backgroundSize = `${def.cols * def.size}px ${def.rows * def.size}px`;
    elEmote.appendChild(e);

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

  // その行の立ち絵スロット（最大3）を組み直し、話者の <img> を返す。
  function renderStage(line) {
    elStage.innerHTML = "";
    const stands = standingsOf(line);
    let speakerImg = null;
    for (const st of stands) {
      const ch = charById(st.characterId);
      if (!ch || !ch.assets?.portrait) continue;
      const slot = document.createElement("div");
      slot.className = `sc-slot sc-pos-${st.position || "center"}`;
      const img = document.createElement("img");
      img.className = "sc-standing";
      img.alt = ch.name || "";
      img.src = ch.assets.portrait;
      img.style.objectPosition = ch.portraitPos || "top center";
      img.onerror = () => { slot.style.display = "none"; };
      // 話者は強調、それ以外は減光。話者なし（地の文）は全員ニュートラル。
      const isSpeaker = line.speakerCharacterId && st.characterId === line.speakerCharacterId;
      if (line.speakerCharacterId) img.classList.add(isSpeaker ? "sc-active" : "sc-dim");
      if (isSpeaker) speakerImg = img;
      slot.appendChild(img);
      elStage.appendChild(slot);
    }
    return speakerImg;
  }

  function show(line) {
    if (line.backgroundId !== curBg) {
      elBg.style.background = bgStyle(line.backgroundId);
      curBg = line.backgroundId;
    }
    const speakerImg = renderStage(line);

    const ch = line.speakerCharacterId ? charById(line.speakerCharacterId) : null;
    const name = line.speakerNameOverride || ch?.name || "";
    elName.textContent = name;
    elName.style.visibility = name ? "visible" : "hidden";
    if (ch?.color) elName.style.borderColor = ch.color;
    elText.textContent = line.text;
    elProgress.textContent = `${line.lineNo} / ${lines.length}`;

    // 立ち絵演出は「話者の立ち絵」に適用（地の文なら対象なし）。
    applyEffect(speakerImg, line.characterEffect, "scfx-ch", line.effectDurationMs);
    applyEffect(elFx, line.screenEffect, "scfx-sc", line.effectDurationMs);

    // エモート（感情アイコン）: 行に emoteId があれば話者の頭上に再生。
    renderEmote(line);
  }

  function advance() {
    i++;
    if (i >= lines.length) { finish(); return; }
    show(lines[i]);
  }

  function onClick(ev) {
    if (ev.target.closest(".sc-close")) { finish(); return; }
    advance();
  }
  root.addEventListener("click", onClick);
  advance(); // 1行目を表示
}
