// マイキャラ作成画面 (avatar-create) — major_update_specification.md §8 / Phase 2A。
//
// 名前・プロフィール・師匠・初期能力種類・見た目プリセット（アイコン/立ち絵/背景/枠）を
// 選んで1体だけマイキャラを作る。保存は注入された repository（LocalProfileRepository）経由。
// 画像本体は保存せず presetId だけを持つ（§8.2）。
//
// レイアウト方針: 全UIは固定ステージ 1280×720 に内部スクロールなしで収める。
// そのため横幅を活かした3カラム（識別情報 / 師匠・能力 / プレビュー）＋下部フッター構成。
//
//   import { showAvatarCreate } from "./screens/avatarCreateScreen.js";
//   showAvatarCreate(container, { repository, onCreated, onBack });
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { INITIAL_MENTOR_IDS, templatesForMentor } from "../data/skillTemplateMaster.js";
import {
  presetsOfType, presetById, defaultPresetIds, defaultPresetIdForType,
} from "../data/avatarPresetMaster.js";
import { buildNewAvatar, addAvatarToProfile } from "../progression/avatarFactory.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export async function showAvatarCreate(container, { repository, onCreated, onBack } = {}) {
  const profile = await repository.loadProfile();
  // 初期所持プリセット（isDefault）と既存解放ぶんの和集合から選べるようにする。
  const unlocked = new Set([...(profile.unlockedPresetIds || []), ...defaultPresetIds()]);
  const availableOfType = (type) => presetsOfType(type).filter((p) => unlocked.has(p.presetId));

  // 現在の選択状態
  const state = {
    mentorCharacterId: INITIAL_MENTOR_IDS[0],
    skillTemplateId: null,
    presetIds: {
      icon: defaultPresetIdForType("icon"),
      standing: defaultPresetIdForType("standing"),
      background: defaultPresetIdForType("background"),
      frame: defaultPresetIdForType("frame"),
    },
  };

  container.innerHTML = "";
  container.classList.add("avatar-screen");

  const head = elt("header", "menu-head avatar-head");
  head.appendChild(elt("h1", null, { textContent: "マイキャラ作成" }));
  container.appendChild(head);

  const layout = elt("div", "avatar-create-layout");
  container.appendChild(layout);

  // ===== 左カラム: 識別情報（名前 / プロフィール / 見た目） =====
  const identity = elt("div", "av-col av-col-identity");
  layout.appendChild(identity);

  const nameField = elt("div", "av-field");
  nameField.appendChild(elt("label", "av-label", { textContent: "名前", htmlFor: "av-name" }));
  const nameInput = elt("input", "av-input", { id: "av-name", type: "text", maxLength: 12, placeholder: "雀士の名前（12文字まで）" });
  nameField.appendChild(nameInput);
  identity.appendChild(nameField);

  const bioField = elt("div", "av-field");
  bioField.appendChild(elt("label", "av-label", { textContent: "プロフィール", htmlFor: "av-bio" }));
  const bioInput = elt("textarea", "av-input av-textarea", { id: "av-bio", rows: 2, maxLength: 120, placeholder: "どんな打ち手？（任意・120文字まで）" });
  bioField.appendChild(bioInput);
  identity.appendChild(bioField);

  const lookField = elt("div", "av-field");
  lookField.appendChild(elt("div", "av-label", { textContent: "見た目" }));
  const lookGrid = elt("div", "av-look-grid");
  lookField.appendChild(lookGrid);
  identity.appendChild(lookField);

  const PRESET_LABELS = { icon: "アイコン", standing: "立ち絵", background: "背景", frame: "枠" };
  const selects = {};
  for (const type of ["icon", "standing", "background", "frame"]) {
    const wrap = elt("label", "av-look-item");
    wrap.appendChild(elt("span", "av-look-label", { textContent: PRESET_LABELS[type] }));
    const sel = elt("select", "av-input");
    for (const p of availableOfType(type)) {
      sel.appendChild(elt("option", null, { value: p.presetId, textContent: p.name }));
    }
    sel.value = state.presetIds[type] || "";
    sel.onchange = () => { state.presetIds[type] = sel.value; renderPreview(); };
    selects[type] = sel;
    wrap.appendChild(sel);
    lookGrid.appendChild(wrap);
  }

  // ===== 中央カラム: 師匠 / 初期能力種類 =====
  const center = elt("div", "av-col av-col-center");
  layout.appendChild(center);

  const mentorField = elt("div", "av-field");
  mentorField.appendChild(elt("div", "av-label", { textContent: "師匠" }));
  const mentorRow = elt("div", "av-mentor-row");
  mentorField.appendChild(mentorRow);
  center.appendChild(mentorField);

  const skillField = elt("div", "av-field av-field-grow");
  skillField.appendChild(elt("div", "av-label", { textContent: "初期能力種類" }));
  const skillRow = elt("div", "av-skill-row");
  skillField.appendChild(skillRow);
  center.appendChild(skillField);

  // ===== 右カラム: プレビュー =====
  const preview = elt("aside", "av-col avatar-preview");
  layout.appendChild(preview);
  const previewBg = elt("div", "av-preview-bg");
  const previewIconWrap = elt("div", "av-preview-icon");
  const previewIcon = elt("img", "av-preview-img", { alt: "" });
  previewIconWrap.appendChild(previewIcon);
  previewBg.appendChild(previewIconWrap);
  preview.appendChild(previewBg);
  const previewName = elt("div", "av-preview-name", { textContent: "（名前未入力）" });
  preview.appendChild(previewName);
  const previewMentor = elt("div", "av-preview-meta");
  preview.appendChild(previewMentor);
  const previewSkill = elt("div", "av-preview-meta");
  preview.appendChild(previewSkill);

  // ===== フッター（全幅）: エラー + 作成 + 戻る =====
  const footer = elt("div", "av-footer");
  layout.appendChild(footer);
  const errMsg = elt("p", "av-error hidden");
  footer.appendChild(errMsg);
  const backBtn = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
  backBtn.onclick = () => onBack?.();
  footer.appendChild(backBtn);
  const createBtn = elt("button", "primary", { type: "button", textContent: "この雀士で始める" });
  footer.appendChild(createBtn);

  // ===== レンダリング =====
  function renderMentors() {
    mentorRow.innerHTML = "";
    for (const id of INITIAL_MENTOR_IDS) {
      const c = charById(id);
      if (!c) continue;
      const card = elt("button", "av-mentor-card" + (state.mentorCharacterId === id ? " selected" : ""), { type: "button" });
      card.style.setProperty("--role", c.color);
      const img = elt("img", "av-mentor-img", { src: c.assets?.icon || "", alt: c.name });
      img.onerror = () => { img.style.visibility = "hidden"; };
      card.appendChild(img);
      card.appendChild(elt("span", "av-mentor-name", { textContent: c.name }));
      card.onclick = () => {
        state.mentorCharacterId = id;
        state.skillTemplateId = null;
        renderMentors();
        renderSkills();
        renderPreview();
      };
      mentorRow.appendChild(card);
    }
  }

  function renderSkills() {
    skillRow.innerHTML = "";
    const templates = templatesForMentor(state.mentorCharacterId);
    if (state.skillTemplateId == null && templates[0]) state.skillTemplateId = templates[0].skillTemplateId;
    for (const t of templates) {
      const card = elt("button", "av-skill-card" + (state.skillTemplateId === t.skillTemplateId ? " selected" : ""), { type: "button" });
      const top = elt("div", "av-skill-top");
      top.appendChild(elt("span", "av-skill-name", { textContent: t.name }));
      top.appendChild(elt("span", "av-skill-rarity", { textContent: t.rarity }));
      card.appendChild(top);
      card.appendChild(elt("span", "av-skill-desc", { textContent: t.description }));
      card.onclick = () => { state.skillTemplateId = t.skillTemplateId; renderSkills(); renderPreview(); };
      skillRow.appendChild(card);
    }
  }

  function renderPreview() {
    const iconP = presetById(state.presetIds.icon);
    const frameP = presetById(state.presetIds.frame);
    const bgP = presetById(state.presetIds.background);
    if (iconP?.assetPath) { previewIcon.src = iconP.assetPath; previewIcon.style.visibility = "visible"; }
    else previewIcon.style.visibility = "hidden";
    previewIconWrap.style.borderColor = frameP?.css || "var(--accent)";
    previewBg.style.background = bgP?.css || "var(--felt)";
    previewName.textContent = nameInput.value.trim() || "（名前未入力）";
    const mentor = charById(state.mentorCharacterId);
    previewMentor.textContent = mentor ? `師匠: ${mentor.name}` : "";
    const tmpl = templatesForMentor(state.mentorCharacterId).find((t) => t.skillTemplateId === state.skillTemplateId);
    previewSkill.textContent = tmpl ? `能力: ${tmpl.name}` : "";
  }

  nameInput.oninput = renderPreview;

  createBtn.onclick = async () => {
    errMsg.classList.add("hidden");
    try {
      const avatar = buildNewAvatar({
        name: nameInput.value,
        profileText: bioInput.value,
        mentorCharacterId: state.mentorCharacterId,
        skillTemplateId: state.skillTemplateId,
        presetIds: state.presetIds,
      });
      let next = addAvatarToProfile(profile, avatar);
      // 初期所持プリセットを解放済みとして記録（画像本体ではなく ID のみ保存）。
      next = { ...next, unlockedPresetIds: [...unlocked] };
      const saved = await repository.saveProfile(next);
      onCreated?.(saved, avatar);
    } catch (e) {
      errMsg.textContent = e?.message || "作成に失敗しました。";
      errMsg.classList.remove("hidden");
    }
  };

  renderMentors();
  renderSkills();
  renderPreview();
}
