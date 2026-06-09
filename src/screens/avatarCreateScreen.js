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
import { CHARACTER_MASTER, ROLE_MASTER } from "../data/characterMaster.js";
import { INITIAL_MENTOR_IDS, templatesForMentor } from "../data/skillTemplateMaster.js";
import {
  presetsOfType, presetById, defaultPresetIds, defaultPresetIdForType,
  DESHI_PRESET_SETS,
} from "../data/avatarPresetMaster.js";
import { buildNewAvatar, addAvatarToProfile, AVATAR_DEFAULTS } from "../progression/avatarFactory.js";
import { scenariosForMentor } from "./scenarioListScreen.js";
import { statViews } from "../autobattle/statSystem.js";

// 師匠として選べるのは「シナリオ＋能力テンプレが実装済み」の師匠だけ（未実装はグレーアウト）。
// 判定はマスタから導出する（専用フラグは持たず、シナリオ／テンプレを足せば自動で解放される）。
const mentorReady = (id) => scenariosForMentor(id).length > 0 && templatesForMentor(id).length > 0;
// 師匠の専門分野ラベル（ヒーロー表示のサブテキスト）。
const ROLE_LABEL = { attacker: "攻撃の師", blocker: "守備の師", gambler: "博打の師" };
// 師匠選びに出すロール（アビス＝extra は除いた3ロール）。
const MENTOR_ROLES = ROLE_MASTER.filter((r) => r.id !== "extra");

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

// HTML 差し込み用の最小エスケープ（名前・プロフィールはユーザー入力）。
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
    // 既定はシナリオ実装済みの先頭師匠（未実装師匠が先頭でも選択不可状態で始めない）。
    mentorCharacterId: INITIAL_MENTOR_IDS.find(mentorReady) || INITIAL_MENTOR_IDS[0],
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

  // 弟子グラフィック: アイコン＋立ち絵をセットで選ぶ（プリセット選択は常にペアで設定）。
  const deshiWrap = elt("div", "av-deshi-wrap");
  deshiWrap.appendChild(elt("span", "av-look-label", { textContent: "弟子グラフィック（アイコン＋立ち絵）" }));
  const deshiGrid = elt("div", "av-deshi-grid");
  deshiWrap.appendChild(deshiGrid);
  lookField.appendChild(deshiWrap);
  // 個別設定（アイコン/立ち絵を別々に差し替え）は画像アップロード対応で解禁予定。開発中はグレーアウト。
  lookField.appendChild(elt("p", "av-look-note", {
    textContent: "アイコン・立ち絵の個別設定は画像アップロード対応で解禁予定（開発中）",
  }));

  const lookGrid = elt("div", "av-look-grid");
  lookField.appendChild(lookGrid);
  identity.appendChild(lookField);

  // 弟子グラフィックのサムネ選択。クリックで icon/standing を一括設定する。
  function renderDeshi() {
    deshiGrid.innerHTML = "";
    for (const s of DESHI_PRESET_SETS) {
      if (!unlocked.has(s.iconPresetId)) continue;
      const selected = state.presetIds.icon === s.iconPresetId;
      const btn = elt("button", "av-deshi-card" + (selected ? " selected" : ""), { type: "button", title: s.name });
      const img = elt("img", "av-deshi-img", { src: s.thumbPath, alt: s.name });
      img.onerror = () => { img.style.visibility = "hidden"; };
      btn.appendChild(img);
      btn.onclick = () => {
        state.presetIds.icon = s.iconPresetId;
        state.presetIds.standing = s.standingPresetId;
        renderDeshi();
        renderPreview();
      };
      deshiGrid.appendChild(btn);
    }
  }

  const PRESET_LABELS = { background: "背景", frame: "枠" };
  const selects = {};
  for (const type of ["background", "frame"]) {
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
  const mentorHero = elt("div", "av-mentor-hero");
  mentorField.appendChild(mentorHero);
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
  // 立ち絵をバストアップで大きく（透過PNGなので背景プリセットの上に重なる）、
  // そのそばに丸アイコンを添える。
  const previewStanding = elt("img", "av-preview-standing", { alt: "" });
  previewStanding.onerror = () => { previewStanding.style.visibility = "hidden"; };
  previewBg.appendChild(previewStanding);
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

  // 師匠選びオーバーレイ（フリー対戦のキャラ選択に寄せたロール別構成。BGM は変えない＝画面遷移しない）。
  // アビス以外の3ロールの全キャラを並べ、シナリオ／能力が未実装の師匠はグレーアウトして選べない。
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
      const head = elt("div", "av-mentor-role-head");
      head.appendChild(elt("span", "av-mentor-role-name", { textContent: role.label }));
      group.appendChild(head);
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
    const iconP = presetById(state.presetIds.icon);
    const standingP = presetById(state.presetIds.standing);
    const frameP = presetById(state.presetIds.frame);
    const bgP = presetById(state.presetIds.background);
    if (standingP?.assetPath) {
      previewStanding.src = standingP.assetPath;
      previewStanding.style.objectPosition = standingP.objectPosition || "top center"; // バストアップ＝上寄せ
      previewStanding.style.visibility = "visible";
    } else previewStanding.style.visibility = "hidden";
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

  // 実際の作成処理（確認モーダルの「はい」で実行）。
  async function doCreate() {
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
  }

  // 作成前の確認モーダル：キャラ情報・師匠・初期パラメータを見せて開始確認。
  function openCreateConfirm() {
    const mentor = charById(state.mentorCharacterId);
    const tmpl = templatesForMentor(state.mentorCharacterId).find((t) => t.skillTemplateId === state.skillTemplateId);
    const iconP = presetById(state.presetIds.icon);
    const name = nameInput.value.trim();
    const bio = bioInput.value.trim();
    const paramsHtml = statViews(AVATAR_DEFAULTS.params6).map((s) => `
      <div class="ac-cf-stat">
        <span class="ac-cf-rank rank-${s.rank}">${s.rank}</span>
        <span class="ac-cf-slab">${s.label}</span>
        <span class="ac-cf-sval">${s.value}</span>
      </div>`).join("");
    const ov = elt("div", "ac-confirm");
    ov.innerHTML = `
      <div class="ac-cf-scrim"></div>
      <div class="ac-cf-card" role="dialog" aria-modal="true">
        <div class="ac-cf-ttl">この弟子で始める？</div>
        <div class="ac-cf-id">
          <div class="ac-cf-iconwrap">${iconP?.assetPath ? `<img src="${iconP.assetPath}" alt="">` : ""}</div>
          <div class="ac-cf-idtxt">
            <div class="ac-cf-name">${esc(name) || "（名前未入力）"}</div>
            ${bio ? `<div class="ac-cf-bio">${esc(bio)}</div>` : ""}
            <div class="ac-cf-mentor">師匠：<b>${esc(mentor?.name || "—")}</b>${mentor?.role ? `（${esc(ROLE_LABEL[mentor.role] || "師")}）` : ""}　／　能力：<b>${esc(tmpl?.name || "—")}</b></div>
          </div>
        </div>
        <div class="ac-cf-shead">はじめの能力値</div>
        <div class="ac-cf-stats">${paramsHtml}</div>
        <p class="ac-cf-msg"><b>${esc(mentor?.name || "師匠")}</b>を師匠にして、師弟シナリオが始まります。よろしいですか？</p>
        <div class="ac-cf-btns">
          <button type="button" class="ghost-back ac-cf-no">いいえ</button>
          <button type="button" class="primary ac-cf-yes">はい、始める</button>
        </div>
      </div>`;
    container.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector(".ac-cf-scrim").onclick = close;
    ov.querySelector(".ac-cf-no").onclick = close;
    ov.querySelector(".ac-cf-yes").onclick = () => { close(); doCreate(); };
    requestAnimationFrame(() => ov.classList.add("is-open"));
  }

  createBtn.onclick = () => {
    errMsg.classList.add("hidden");
    if (!nameInput.value.trim()) {
      errMsg.textContent = "名前を入力してください。";
      errMsg.classList.remove("hidden");
      nameInput.focus();
      return;
    }
    openCreateConfirm();
  };

  renderDeshi();
  renderMentorHero();
  renderSkills();
  renderPreview();
}
