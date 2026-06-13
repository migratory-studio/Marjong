// 弟子一覧画面 (mentor-roster) — これまで育てた弟子（アバター）をグリッドで一覧する。
//
// 各カードはアイコン・名前・師匠名・キャラLvを表示し、修行中の弟子を強調する。
// カードクリックで選択、末尾の点線カードから新規作成へ。
// 「整理」モード中は各カードに削除ボタン(🗑)が出て、確認モーダルを経て削除する（誤削除防止）。
// 見出し(menu-head)・カード枠(.mentor-roster-card)・戻る(ghost-back)は styles.css 末尾の
// 購入UIセット(gameUIset_19)スキンで装飾する（ここでは配置のみ）。
//
//   import { showMentorRoster } from "./screens/mentorRosterScreen.js";
//   showMentorRoster(container, { profile, isLoggedIn, onSelect, onCreate, onDelete, onBack });
//     onDelete(avatarId) は削除後の最新 profile を返すこと（その場で再描画して整理モードを維持する）。
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { showConfirm } from "./confirmModal.js";

const STYLE_ID = "mentor-roster-style";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// レイアウト専用の最小スタイル（枠・色はスキン側＝styles.css に任せる）。
function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.mentor-roster-head { display:flex; align-items:center; justify-content:space-between; gap:16px;
  width:100%; max-width:1040px; margin:0 auto; }
.mentor-roster-head .mentor-roster-titles { display:flex; flex-direction:column; align-items:flex-start; gap:2px; }
.mentor-roster-head .mentor-roster-subhead { font-size:13px; color:var(--muted); }
.mentor-roster-headright { display:flex; align-items:center; gap:12px; }
.mentor-roster-storage { font-size:12px; color:var(--accent); white-space:nowrap; }
.mentor-roster-manage { padding:4px 14px; font-size:13px; }
.mentor-roster-grid { display:grid; grid-template-columns:repeat(5, 1fr); gap:14px;
  width:100%; max-width:1040px; margin:18px auto 0; }
.mentor-roster-cell { position:relative; display:flex; }
.mentor-roster-card { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 8px; }
.mentor-roster-bg { width:84px; height:84px; border-radius:10px; display:flex; align-items:center;
  justify-content:center; overflow:hidden; }
.mentor-roster-icon { width:72px; height:72px; border-radius:50%; border:3px solid var(--accent);
  overflow:hidden; background:rgba(0,0,0,.2); display:flex; align-items:center; justify-content:center; }
.mentor-roster-icon img { width:100%; height:100%; object-fit:cover; }
.mentor-roster-name { font-size:15px; font-weight:700; }
.mentor-roster-mentor { font-size:12px; color:var(--muted); }
.mentor-roster-lv { font-size:12px; color:var(--accent); }
.mentor-roster-badge { font-size:11px; font-weight:700; color:#1a1a1a; background:#ffd766;
  border-radius:6px; padding:1px 8px; }
.mentor-roster-del { position:absolute; top:6px; right:6px; z-index:3; width:30px; height:30px;
  display:flex; align-items:center; justify-content:center; font-size:15px; cursor:pointer;
  border-radius:50%; border:1px solid #c66; background:rgba(40,10,10,.92); color:#ffd3d3; }
.mentor-roster-del:hover { background:rgba(120,20,20,.95); color:#fff; }
.mentor-roster-add .mentor-roster-plus { font-size:30px; line-height:1; color:var(--accent); }
.mentor-roster-add .mentor-roster-addtxt { font-size:13px; }
.mentor-roster-empty { margin:28px auto 0; max-width:1040px; display:flex; flex-direction:column;
  gap:18px; align-items:flex-start; }
.mentor-roster-empty p { margin:0; color:var(--muted); }
`;
  document.head.appendChild(s);
}

function applyPresets(bg, iconWrap, img, presetIds) {
  const iconP = presetById(presetIds?.icon);
  const frameP = presetById(presetIds?.frame);
  const bgP = presetById(presetIds?.background);
  bg.style.background = bgP?.css || "var(--felt)";
  iconWrap.style.borderColor = frameP?.css || "var(--accent)";
  if (iconP?.assetPath) {
    img.src = iconP.assetPath;
  } else {
    img.style.visibility = "hidden";
  }
  img.onerror = () => {
    img.style.visibility = "hidden";
  };
}

export function showMentorRoster(container, { profile, isLoggedIn, onSelect, onCreate, onDelete, onBack } = {}) {
  injectStyle();

  let current = profile; // 削除で差し替わる最新プロフィール
  let manageMode = false; // 「整理」モード

  function render() {
    container.innerHTML = "";
    const avatars = current?.avatars || [];
    const activeId = current?.activeAvatarId ?? null;

    // ---- 見出し＋（保存先チップ・整理トグル）----
    const head = elt("header", "menu-head mentor-roster-head");
    const titles = elt("div", "mentor-roster-titles");
    titles.appendChild(elt("h1", null, { textContent: "弟子一覧" }));
    titles.appendChild(elt("span", "mentor-roster-subhead", { textContent: "これまで育てた弟子たち" }));
    head.appendChild(titles);

    const right = elt("div", "mentor-roster-headright");
    right.appendChild(
      elt("span", "mentor-roster-storage", { textContent: isLoggedIn ? "☁ クラウド保存" : "▤ この端末に保存" })
    );
    if (avatars.length > 0) {
      const manage = elt("button", "secondary mentor-roster-manage", {
        type: "button",
        textContent: manageMode ? "完了" : "整理",
      });
      manage.onclick = () => { manageMode = !manageMode; render(); };
      right.appendChild(manage);
    }
    head.appendChild(right);
    container.appendChild(head);

    // ---- 0体のとき ----
    if (avatars.length === 0) {
      const empty = elt("div", "mentor-roster-empty");
      empty.appendChild(
        elt("p", null, { textContent: "まだ弟子がいません。『新しく弟子入りする』から始めましょう。" })
      );
      const add = elt("button", "menu-btn", { type: "button" });
      add.appendChild(elt("span", "menu-btn-title", { textContent: "＋ 新しく弟子入りする" }));
      add.onclick = () => onCreate?.();
      empty.appendChild(add);
      container.appendChild(empty);

      const back0 = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
      back0.onclick = () => onBack?.();
      container.appendChild(back0);
      return;
    }

    // ---- グリッド ----
    const grid = elt("div", "mentor-roster-grid");
    for (const avatar of avatars) {
      const isActive = avatar.avatarId === activeId;
      const cell = elt("div", "mentor-roster-cell");

      const card = elt("button", "mentor-roster-card" + (isActive ? " is-active" : ""), { type: "button" });

      const bg = elt("div", "mentor-roster-bg");
      const iconWrap = elt("div", "mentor-roster-icon");
      const img = elt("img", null, { alt: "" });
      applyPresets(bg, iconWrap, img, avatar.presetIds);
      iconWrap.appendChild(img);
      bg.appendChild(iconWrap);
      card.appendChild(bg);

      if (isActive) card.appendChild(elt("span", "mentor-roster-badge", { textContent: "修行中" }));
      card.appendChild(elt("div", "mentor-roster-name", { textContent: avatar.name }));
      const mentor = charById(avatar.mentorCharacterId);
      card.appendChild(
        elt("div", "mentor-roster-mentor", { textContent: mentor ? mentor.name : avatar.mentorCharacterId })
      );
      card.appendChild(elt("div", "mentor-roster-lv", { textContent: `Lv ${avatar.avatarLevel}` }));

      if (manageMode) {
        card.disabled = true; // 整理中は選択を無効化（誤って入門しないように）
      } else {
        card.onclick = () => onSelect?.(avatar.avatarId);
      }
      cell.appendChild(card);

      // 整理モード: 削除ボタン
      if (manageMode) {
        const del = elt("button", "mentor-roster-del", { type: "button", title: "この弟子を削除", textContent: "🗑" });
        del.onclick = () => askDelete(avatar);
        cell.appendChild(del);
      }

      grid.appendChild(cell);
    }

    // ---- 新規作成カード（整理モードでは隠す） ----
    if (!manageMode) {
      const addCell = elt("div", "mentor-roster-cell");
      const addCard = elt("button", "mentor-roster-card mentor-roster-add", { type: "button" });
      addCard.appendChild(elt("div", "mentor-roster-plus", { textContent: "＋" }));
      addCard.appendChild(elt("div", "mentor-roster-addtxt", { textContent: "新しく弟子入りする" }));
      addCard.onclick = () => onCreate?.();
      addCell.appendChild(addCard);
      grid.appendChild(addCell);
    }

    container.appendChild(grid);

    // ---- 戻る ----
    const back = elt("button", "ghost-back", { type: "button", textContent: "← 戻る" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
  }

  function askDelete(avatar) {
    showConfirm({
      title: "弟子を削除",
      message: `「${avatar.name}」を削除しますか？\n育てた記録（Lv・絆・装備）は元に戻せません。`,
      confirmLabel: "削除する",
      cancelLabel: "やめる",
      danger: true,
      onConfirm: async () => {
        const fresh = await onDelete?.(avatar.avatarId);
        if (fresh) current = fresh;
        if ((current?.avatars || []).length === 0) manageMode = false; // 空になったら整理モード解除
        render();
      },
    });
  }

  render();
}
