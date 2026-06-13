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
import { CHARACTER_MASTER, ROLE_MASTER } from "../data/characterMaster.js";
import { INITIAL_MENTOR_IDS, templatesForMentor } from "../data/skillTemplateMaster.js";
import { presetById, defaultPresetIds } from "../data/avatarPresetMaster.js";
import { buildNewAvatar, addAvatarToProfile, initialParams6 } from "../progression/avatarFactory.js";
import { scenariosForMentor } from "./scenarioListScreen.js";
import { statViews, rankCells } from "../autobattle/statSystem.js";

// 師匠として選べるのは「シナリオ＋能力テンプレが実装済み」の師匠だけ（未実装はグレーアウト）。
const mentorReady = (id) => scenariosForMentor(id).length > 0 && templatesForMentor(id).length > 0;
// 師匠の専門分野ラベル（ヒーロー表示のサブテキスト）。
const ROLE_LABEL = { attacker: "攻撃の師", blocker: "守備の師", gambler: "博打の師" };
// 師匠選びに出すロール（アビス＝extra は除いた3ロール）。
const MENTOR_ROLES = ROLE_MASTER.filter((r) => r.id !== "extra");

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// 既存CSSにない最小限の補助スタイルを一度だけ注入（プレビューの初期パラメータ枠など）。
function ensureStyle() {
  if (document.getElementById("mentor-select-style")) return;
  const st = document.createElement("style");
  st.id = "mentor-select-style";
  st.textContent = `
    .ms-preview-params { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; width: 100%; }
    .ms-preview-params .ac-cf-stat { display: flex; align-items: center; gap: 6px; }
  `;
  document.head.appendChild(st);
}

export async function showMentorSelect(container, { repository, draft, onBack, onDecided } = {}) {
  ensureStyle();
  draft = draft || {};

  const state = {
    // 既定はシナリオ実装済みの先頭師匠（未実装師匠が先頭でも選択不可状態で始めない）。
    mentorCharacterId: INITIAL_MENTOR_IDS.find(mentorReady) || INITIAL_MENTOR_IDS[0],
    skillTemplateId: null,
  };

  container.innerHTML = "";
  container.classList.add("avatar-screen");

  const head = elt("header", "menu-head avatar-head");
  head.appendChild(elt("h1", null, { textContent: "師匠を選ぶ" }));
  container.appendChild(head);

  const layout = elt("div", "avatar-create-layout");
  container.appendChild(layout);

  // ===== 中央カラム: 師匠 / 初期能力種類 =====
  const center = elt("div", "av-col av-col-center");
  layout.appendChild(center);

  const mentorField = elt("div", "av-field");
  mentorField.appendChild(elt("div", "av-label", { textContent: "師匠" }));
  const mentorHero = elt("div", "av-mentor-hero");
  mentorField.appendChild(mentorHero);
  center.appendChild(mentorField);

  const skillField = elt("div", "av-field av-field-grow");
  skillField.appendChild(elt("div", "av-label", { textContent: "初期能力種類" }));
  const skillRow = elt("div", "av-skill-row");
  skillField.appendChild(skillRow);
  center.appendChild(skillField);

  // ===== 右カラム: プレビュー（見た目＋名前＋師匠/能力＋初期パラメータ） =====
  const preview = elt("aside", "av-col avatar-preview");
  layout.appendChild(preview);
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
  footer.appendChild(errMsg);
  const backBtn = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
  backBtn.onclick = () => onBack?.();
  footer.appendChild(backBtn);
  const decideBtn = elt("button", "primary", { type: "button", textContent: "この師匠で決める" });
  footer.appendChild(decideBtn);

  // ===== レンダリング =====
  // 師匠は立ち絵を大きめに出し、「変更」で師匠選びオーバーレイを開く。
  function renderMentorHero() {
    mentorHero.innerHTML = "";
    const c = charById(state.mentorCharacterId);
    if (!c) return;
    mentorHero.style.setProperty("--role", c.color || "var(--accent)");
    const pwrap = elt("div", "av-mentor-hero-portrait");
    const img = elt("img", "av-mentor-hero-img", { src: c.assets?.portrait || "", alt: c.name });
    if (c.portraitPos) img.style.objectPosition = c.portraitPos;
    img.onerror = () => { img.style.visibility = "hidden"; };
    pwrap.appendChild(img);
    mentorHero.appendChild(pwrap);
    const info = elt("div", "av-mentor-hero-info");
    info.appendChild(elt("div", "av-mentor-hero-name", { textContent: c.name }));
    if (ROLE_LABEL[c.role]) info.appendChild(elt("div", "av-mentor-hero-sub", { textContent: ROLE_LABEL[c.role] }));
    const changeBtn = elt("button", "av-mentor-change", { type: "button", textContent: "師匠を変更" });
    changeBtn.onclick = openMentorPicker;
    info.appendChild(changeBtn);
    mentorHero.appendChild(info);
  }

  // 師匠選びオーバーレイ（ロール別構成）。未実装の師匠はグレーアウトして選べない。
  function openMentorPicker() {
    const overlay = elt("div", "av-mentor-picker");
    const close = () => overlay.remove();
    const panel = elt("div", "av-mentor-picker-panel");
    panel.appendChild(elt("h2", "av-mentor-picker-title", { textContent: "師匠を選ぶ" }));

    const roles = elt("div", "av-mentor-picker-roles");
    for (const role of MENTOR_ROLES) {
      const members = CHARACTER_MASTER.filter((c) => c.role === role.id);
      if (members.length === 0) continue;
      const group = elt("div", "av-mentor-role-group");
      group.style.setProperty("--role", role.color);
      const rhead = elt("div", "av-mentor-role-head");
      rhead.appendChild(elt("span", "av-mentor-role-name", { textContent: role.label }));
      group.appendChild(rhead);
      const cards = elt("div", "av-mentor-role-cards");
      for (const c of members) {
        const ready = mentorReady(c.id);
        const selected = state.mentorCharacterId === c.id;
        const card = elt(
          "button",
          "av-mentor-pick-card" + (selected ? " selected" : "") + (ready ? "" : " is-locked"),
          { type: "button", disabled: !ready },
        );
        const icon = elt("div", "av-mentor-pick-icon");
        const img = elt("img", "av-mentor-pick-img", { src: c.assets?.icon || "", alt: c.name });
        img.onerror = () => { img.style.visibility = "hidden"; };
        icon.appendChild(img);
        card.appendChild(icon);
        card.appendChild(elt("span", "av-mentor-pick-name", { textContent: c.name }));
        if (!ready) card.appendChild(elt("span", "av-mentor-pick-lock", { textContent: "準備中" }));
        if (ready) {
          card.onclick = () => {
            state.mentorCharacterId = c.id;
            state.skillTemplateId = null;
            renderMentorHero();
            renderSkills();
            renderPreview();
            close();
          };
        }
        cards.appendChild(card);
      }
      group.appendChild(cards);
      roles.appendChild(group);
    }
    panel.appendChild(roles);

    const cancel = elt("button", "ghost-back av-mentor-picker-close", { type: "button", textContent: "閉じる" });
    cancel.onclick = close;
    panel.appendChild(cancel);
    overlay.appendChild(panel);
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    container.appendChild(overlay);
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
    previewName.textContent = draft.name || "（名前未入力）";
    const mentor = charById(state.mentorCharacterId);
    previewMentor.textContent = mentor ? `師匠: ${mentor.name}` : "";
    const tmpl = templatesForMentor(state.mentorCharacterId).find((t) => t.skillTemplateId === state.skillTemplateId);
    previewSkill.textContent = tmpl ? `能力: ${tmpl.name}` : "";
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
    }
  }

  decideBtn.onclick = doDecide;

  renderLook();
  renderMentorHero();
  renderSkills();
  renderPreview();
}
