// 師匠選択画面 (mentor-select) — major_update_specification.md §8 / Phase 2A。
//
// キャラ作成（名前・プロフィール・見た目）の次のステップ。師匠＋初期能力種類を選び、
// 「この師匠で決める」でアバターを実際に作成・保存する（buildNewAvatar → saveProfile）。
// draft（前画面の入力）から見た目とプロフィールを引き継ぐ。
//
// レイアウト方針: 全UIは固定ステージ 1280×720 に内部スクロールなしで収める。
//
//   import { showMentorSelect } from "./screens/mentorSelectScreen.js";
//   showMentorSelect(container, { repository, draft, onBack, onDecided });
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { applyPortraitCrop } from "../data/imagePos.js";
import { INITIAL_MENTOR_IDS, templatesForMentor } from "../data/skillTemplateMaster.js";
import { presetById, defaultPresetIds } from "../data/avatarPresetMaster.js";
import { buildNewAvatar, addAvatarToProfile, initialParams6 } from "../progression/avatarFactory.js";
import { scenariosForMentor } from "./scenarioListScreen.js";
import { statViews, rankCells } from "../autobattle/statSystem.js";

// シナリオと能力テンプレが揃った師匠を候補に出し、準備中の名前は別欄で紹介する。
const mentorReady = (id) => scenariosForMentor(id).length > 0 && templatesForMentor(id).length > 0;
// 師匠の専門分野ラベル（ヒーロー表示のサブテキスト）。
const ROLE_LABEL = { attacker: "攻撃の師", blocker: "守備の師", gambler: "博打の師" };
const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}


export async function showMentorSelect(container, { repository, draft, onBack, onDecided } = {}) {
  draft = draft || {};

  // 宝珠ショップ解禁状態。未解禁(locked & 未購入)キャラは師匠選択の母集団から除外する。
  // ※解禁しても師匠シナリオ/能力テンプレが無ければ師匠にはなれない（mentorReady）。「準備中」表示で
  //   「解禁すれば師匠にできる」と誤認させないため、未解禁の時点で出さない（解禁後は通常の準備中ゲートに合流）。
  let unlockedChars = new Set();
  try { const p = await repository?.loadProfile?.(); unlockedChars = new Set(p?.unlockedCharacters || []); } catch { /* 未ログインは未解禁扱い */ }
  const isMentorLocked = (c) => !!(c && c.locked) && !unlockedChars.has(c.id);

  const pool = CHARACTER_MASTER.filter((c) => ROLE_LABEL[c.role] && !c.noMentor && !c.isMob && !isMentorLocked(c));
  const ready = pool.filter((c) => mentorReady(c.id));
  const state = {
    mentorCharacterId: INITIAL_MENTOR_IDS.find((id) => ready.some((c) => c.id === id)) || ready[0]?.id,
    skillTemplateId: null,
  };

  container.innerHTML = "";
  container.classList.add("avatar-screen");

  const head = elt("header", "menu-head avatar-head");
  head.appendChild(elt("h1", null, { textContent: "師匠を選ぶ" }));
  container.appendChild(head);

  const layout = elt("div", "avatar-create-layout avatar-create-layout--mentor");
  container.appendChild(layout);

  const catalog = elt("section", "mentor-candidates");
  const candidateTitle = elt("h2", null, { textContent: "弟子入りできる師匠" });
  const faces = elt("div", "mentor-faces");
  faces.setAttribute("role", "group");
  faces.setAttribute("aria-label", candidateTitle.textContent);
  catalog.append(candidateTitle, faces);
  const waiting = pool.filter((c) => !mentorReady(c.id));
  if (waiting.length) {
    const more = elt("details", "mentor-pending");
    more.append(elt("summary", null, { textContent: `準備中の師匠（${waiting.length}人）` }),
      elt("p", null, { textContent: waiting.map((c) => c.name).join("　／　") }));
    catalog.append(more);
  }
  layout.append(catalog);

  // 中央は師匠の人物紹介と、この師匠から教わる能力。
  const center = elt("div", "av-col av-col-center");
  layout.appendChild(center);

  const mentorField = elt("div", "av-field");
  const mentorHero = elt("div", "av-mentor-hero");
  mentorField.appendChild(mentorHero);
  center.appendChild(mentorField);

  const skillField = elt("div", "av-field av-field-grow");
  skillField.appendChild(elt("h2", "av-label", { textContent: "最初に教わる能力" }));
  const skillRow = elt("div", "av-skill-row");
  skillField.appendChild(skillRow);
  center.appendChild(skillField);

  // ===== 右カラム: プレビュー（見た目＋名前＋師匠/能力＋初期パラメータ） =====
  const preview = elt("aside", "av-col avatar-preview");
  layout.appendChild(preview);
  preview.append(elt("h2", null, { textContent: "弟子入りするあなた" }));
  const previewBg = elt("div", "av-preview-bg");
  const previewStanding = elt("img", "av-preview-standing", { alt: "" });
  previewStanding.onerror = () => { previewStanding.style.visibility = "hidden"; };
  previewBg.appendChild(previewStanding);
  const previewIconWrap = elt("div", "av-preview-icon");
  const previewIcon = elt("img", "av-preview-img", { alt: "" });
  previewIconWrap.appendChild(previewIcon);
  previewBg.appendChild(previewIconWrap);
  preview.appendChild(previewBg);
  const previewName = elt("div", "av-preview-name", { textContent: draft.name || "（名前未入力）" });
  preview.appendChild(previewName);
  const previewMentor = elt("div", "av-preview-meta");
  preview.appendChild(previewMentor);
  const previewSkill = elt("div", "av-preview-meta");
  preview.appendChild(previewSkill);
  const previewParams = elt("div", "ms-preview-params");
  preview.appendChild(previewParams);

  // 見た目は draft 固定（この画面では編集しない）。
  function renderLook() {
    const iconP = presetById(draft.presetIds?.icon);
    const standingP = presetById(draft.presetIds?.standing);
    const frameP = presetById(draft.presetIds?.frame);
    const bgP = presetById(draft.presetIds?.background);
    if (standingP?.assetPath) {
      previewStanding.src = standingP.assetPath;
      previewStanding.style.objectPosition = standingP.objectPosition || "top center";
      previewStanding.style.visibility = "visible";
    } else previewStanding.style.visibility = "hidden";
    if (iconP?.assetPath) { previewIcon.src = iconP.assetPath; previewIcon.style.visibility = "visible"; }
    else previewIcon.style.visibility = "hidden";
    previewIconWrap.style.borderColor = frameP?.css || "var(--accent)";
    previewBg.style.background = bgP?.css || "var(--felt)";
  }

  // ===== フッター（全幅）: エラー + 決める + 戻る =====
  const footer = elt("div", "av-footer");
  layout.appendChild(footer);
  const errMsg = elt("p", "av-error hidden");
  errMsg.setAttribute("role", "alert");
  footer.appendChild(errMsg);
  const backBtn = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
  backBtn.onclick = () => onBack?.();
  footer.appendChild(backBtn);
  const decideBtn = elt("button", "entry-choice", { type: "button", textContent: "この師匠に弟子入りする" });
  footer.appendChild(decideBtn);

  // ===== レンダリング =====
  function renderMentorHero() {
    mentorHero.innerHTML = "";
    const c = charById(state.mentorCharacterId);
    if (!c) { mentorHero.textContent = "現在、弟子入りできる師匠はいません"; return; }
    for (const btn of faces.children) btn.setAttribute("aria-pressed", String(btn.dataset.mentor === c.id));
    mentorHero.style.setProperty("--role", c.color || "var(--accent)");
    const pwrap = elt("div", "av-mentor-hero-portrait");
    const img = elt("img", "av-mentor-hero-img", { src: c.assets?.portrait || "", alt: c.name });
    applyPortraitCrop(img, c);
    img.onerror = () => { img.style.visibility = "hidden"; };
    pwrap.appendChild(img);
    mentorHero.appendChild(pwrap);
    const info = elt("div", "av-mentor-hero-info");
    if (ROLE_LABEL[c.role]) info.appendChild(elt("div", "av-mentor-hero-sub", { textContent: ROLE_LABEL[c.role] }));
    info.appendChild(elt("h2", "av-mentor-hero-name", { textContent: c.name }));
    if (c.bio) info.appendChild(elt("p", null, { textContent: c.bio }));
    mentorHero.appendChild(info);
  }

  // 弟子入りできる師匠は一枚ずつ顔と専門を見せる。詳しい能力と弟子の初期値は選ぶたびに更新。
  for (const c of ready) {
    const btn = elt("button", "mentor-face", { type: "button" });
    btn.dataset.mentor = c.id;
    btn.append(elt("img", null, { src: c.assets.icon, alt: "" }),
      elt("b", null, { textContent: c.name }), elt("small", null, { textContent: ROLE_LABEL[c.role] }));
    btn.onclick = () => {
      if (state.mentorCharacterId === c.id) return;
      state.mentorCharacterId = c.id;
      state.skillTemplateId = null;
      renderMentorHero();
      renderSkills();
      renderPreview();
    };
    faces.append(btn);
  }

  function renderSkills() {
    skillRow.innerHTML = "";
    const templates = templatesForMentor(state.mentorCharacterId);
    if (state.skillTemplateId == null && templates[0]) state.skillTemplateId = templates[0].skillTemplateId;
    for (const t of templates) {
      const card = elt("button", "av-skill-card" + (state.skillTemplateId === t.skillTemplateId ? " selected" : ""), { type: "button" });
      card.setAttribute("aria-pressed", String(state.skillTemplateId === t.skillTemplateId));
      const top = elt("div", "av-skill-top");
      top.appendChild(elt("span", "av-skill-name", { textContent: t.name }));
      top.appendChild(elt("span", "av-skill-rarity", { textContent: t.rarity }));
      card.appendChild(top);
      card.appendChild(elt("span", "av-skill-desc", { textContent: t.description }));
      card.onclick = () => {
        state.skillTemplateId = t.skillTemplateId;
        for (const b of skillRow.children) {
          b.classList.toggle("selected", b === card);
          b.setAttribute("aria-pressed", String(b === card));
        }
        renderPreview();
      };
      skillRow.appendChild(card);
    }
  }

  function renderPreview() {
    previewName.textContent = draft.name || "（名前未入力）";
    const mentor = charById(state.mentorCharacterId);
    previewMentor.textContent = mentor ? `師匠　${mentor.name}` : "";
    const tmpl = templatesForMentor(state.mentorCharacterId).find((t) => t.skillTemplateId === state.skillTemplateId);
    previewSkill.textContent = tmpl ? `能力　${tmpl.name}` : "";
    decideBtn.disabled = !tmpl;
    // 初期パラメータ（ゲージ表示）。
    previewParams.innerHTML = "";
    if (state.skillTemplateId == null) return;
    for (const s of statViews(initialParams6(state.skillTemplateId))) {
      const row = elt("div", "ac-cf-stat");
      row.appendChild(elt("span", `ac-cf-rank rank-${s.rank}`, { textContent: s.rank }));
      row.appendChild(elt("span", "ac-cf-slab", { textContent: s.label }));
      const gauge = elt("span", "statgauge ac-cf-gauge");
      for (const c of rankCells(s.value)) {
        const seg = elt("span", "statgauge-seg" + (c.on ? " on" : ""));
        if (c.on) seg.style.background = c.color;
        gauge.appendChild(seg);
      }
      row.appendChild(gauge);
      row.appendChild(elt("span", "ac-cf-sval", { textContent: String(s.value) }));
      previewParams.appendChild(row);
    }
  }

  // 「この師匠で決める」: 実際にアバターを作成・保存して onDecided に渡す。
  async function doDecide() {
    if (decideBtn.disabled) return;
    decideBtn.disabled = true;
    container.inert = true;
    errMsg.classList.add("hidden");
    try {
      const profile = await repository.loadProfile();
      const avatar = buildNewAvatar({
        name: draft.name,
        profileText: draft.profileText,
        mentorCharacterId: state.mentorCharacterId,
        skillTemplateId: state.skillTemplateId,
        presetIds: draft.presetIds,
      });
      let next = addAvatarToProfile(profile, avatar);
      // 解放済みプリセットの記録（初期所持＋既存解放の和集合）。
      const unlocked = new Set([...(profile.unlockedPresetIds || []), ...defaultPresetIds()]);
      next = { ...next, unlockedPresetIds: [...unlocked] };
      const saved = await repository.saveProfile(next);
      onDecided?.(saved, avatar);
    } catch (e) {
      errMsg.textContent = e?.message || "作成に失敗しました。";
      errMsg.classList.remove("hidden");
      decideBtn.disabled = false;
    } finally {
      container.inert = false;
    }
  }

  decideBtn.onclick = doDecide;

  renderLook();
  renderMentorHero();
  renderSkills();
  renderPreview();
}
