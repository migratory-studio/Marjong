// マイキャラ作成画面 (avatar-create) — major_update_specification.md §8 / Phase 2A。
//
// 名前・プロフィール・見た目プリセット（アイコン/立ち絵/背景/枠）だけを編集する。
// 師匠・初期能力種類の選択は次画面（mentorSelectScreen）へ分離した。
// 画像本体は保存せず presetId だけを持つ（§8.2）。実際の作成・保存は師匠選択画面で行う。
//
// レイアウト方針: 全UIは固定ステージ 1280×720 に内部スクロールなしで収める。
//
//   import { showAvatarCreate } from "./screens/avatarCreateScreen.js";
//   showAvatarCreate(container, { repository, draft, onNext, onBack });
import {
  presetsOfType, presetById, defaultPresetIds, defaultPresetIdForType,
  DESHI_PRESET_SETS,
} from "../data/avatarPresetMaster.js";

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export async function showAvatarCreate(container, { repository, draft, onNext, onBack } = {}) {
  const profile = await repository.loadProfile();
  // 初期所持プリセット（isDefault）と既存解放ぶんの和集合から選べるようにする。
  const unlocked = new Set([...(profile.unlockedPresetIds || []), ...defaultPresetIds()]);
  const availableOfType = (type) => presetsOfType(type).filter((p) => unlocked.has(p.presetId));

  // 現在の選択状態（見た目のみ）。draft があれば prefill する（師匠選択から「戻る」対応）。
  const state = {
    presetIds: {
      icon: draft?.presetIds?.icon || defaultPresetIdForType("icon"),
      standing: draft?.presetIds?.standing || defaultPresetIdForType("standing"),
      background: draft?.presetIds?.background || defaultPresetIdForType("background"),
      frame: draft?.presetIds?.frame || defaultPresetIdForType("frame"),
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
  if (draft?.name) nameInput.value = draft.name;
  nameField.appendChild(nameInput);
  identity.appendChild(nameField);

  const bioField = elt("div", "av-field");
  bioField.appendChild(elt("label", "av-label", { textContent: "プロフィール", htmlFor: "av-bio" }));
  const bioInput = elt("textarea", "av-input av-textarea", { id: "av-bio", rows: 2, maxLength: 120, placeholder: "どんな打ち手？（任意・120文字まで）" });
  if (draft?.profileText) bioInput.value = draft.profileText;
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

  // ===== 右カラム: プレビュー（見た目＋名前まで） =====
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

  // ===== フッター（全幅）: エラー + 師匠を選ぶ + 戻る =====
  const footer = elt("div", "av-footer");
  layout.appendChild(footer);
  const errMsg = elt("p", "av-error hidden");
  footer.appendChild(errMsg);
  const backBtn = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
  backBtn.onclick = () => onBack?.();
  footer.appendChild(backBtn);
  const nextBtn = elt("button", "primary", { type: "button", textContent: "師匠を選ぶ →" });
  footer.appendChild(nextBtn);

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
  }

  nameInput.oninput = renderPreview;

  nextBtn.onclick = () => {
    errMsg.classList.add("hidden");
    if (!nameInput.value.trim()) {
      errMsg.textContent = "名前を入力してください。";
      errMsg.classList.remove("hidden");
      nameInput.focus();
      return;
    }
    onNext?.({
      name: nameInput.value.trim(),
      profileText: bioInput.value.trim(),
      presetIds: { ...state.presetIds },
    });
  };

  renderDeshi();
  renderPreview();
}
