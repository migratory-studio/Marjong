// マイキャラ確認画面 (avatar-detail) — major_update_specification.md §8 / Phase 2A。
//
// 作成済みのマイキャラの現在値・見た目・師匠・能力を表示する読み取り専用画面。
// 休憩 / 育成 / 能力変更への導線は師弟ホーム（mentorHomeScreen, Phase 2B）が持つ。
//
//   import { showAvatarDetail } from "./screens/avatarDetailScreen.js";
//   showAvatarDetail(container, { profile, onBack });
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showAvatarDetail(container, { profile, onBack } = {}) {
  const avatar = activeAvatar(profile);
  container.innerHTML = "";
  container.classList.add("avatar-screen");

  const head = elt("header", "menu-head");
  head.appendChild(elt("h1", null, { textContent: "マイキャラ" }));
  container.appendChild(head);

  if (!avatar) {
    container.appendChild(elt("p", "lead", { textContent: "まだマイキャラがいません。" }));
    const back = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
    return;
  }

  const mentor = charById(avatar.mentorCharacterId);
  const tmpl = skillTemplateById(avatar.skillTemplateId);
  const iconP = presetById(avatar.presetIds?.icon);
  const frameP = presetById(avatar.presetIds?.frame);
  const bgP = presetById(avatar.presetIds?.background);

  const layout = elt("div", "avatar-detail-layout");
  container.appendChild(layout);

  // ---- 見た目 ----
  const portrait = elt("aside", "avatar-preview");
  const bg = elt("div", "av-preview-bg");
  bg.style.background = bgP?.css || "var(--felt)";
  const iconWrap = elt("div", "av-preview-icon");
  iconWrap.style.borderColor = frameP?.css || "var(--accent)";
  const img = elt("img", "av-preview-img", { alt: "" });
  if (iconP?.assetPath) img.src = iconP.assetPath; else img.style.visibility = "hidden";
  img.onerror = () => { img.style.visibility = "hidden"; };
  iconWrap.appendChild(img);
  bg.appendChild(iconWrap);
  portrait.appendChild(bg);
  portrait.appendChild(elt("div", "av-preview-name", { textContent: avatar.name }));
  if (avatar.profileText) portrait.appendChild(elt("p", "av-detail-bio", { textContent: avatar.profileText }));
  layout.appendChild(portrait);

  // ---- ステータス ----
  const stats = elt("div", "avatar-stats");
  const hpPct = Math.max(0, Math.min(100, Math.round((avatar.avatarHpCurrent / avatar.avatarHpMax) * 100)));
  const rows = [
    ["師匠", mentor ? mentor.name : avatar.mentorCharacterId],
    ["能力種類", tmpl ? `${tmpl.name}（${tmpl.rarity}）` : avatar.skillTemplateId],
    ["スキル Lv", `Lv ${avatar.skillLevel}`],
    ["キャラ Lv", `Lv ${avatar.avatarLevel}`],
    ["絆 Lv", `Lv ${avatar.bondLevel}`],
    ["ソウル", `${profile.wallet?.soul ?? 0}`],
  ];
  for (const [k, v] of rows) {
    const row = elt("div", "av-stat-row");
    row.appendChild(elt("span", "av-stat-key", { textContent: k }));
    row.appendChild(elt("span", "av-stat-val", { textContent: v }));
    stats.appendChild(row);
  }
  // HP ゲージ
  const hpRow = elt("div", "av-stat-row av-stat-hp");
  hpRow.appendChild(elt("span", "av-stat-key", { textContent: "HP" }));
  const hpBox = elt("div", "av-hp-box");
  const hpBar = elt("div", "av-hp-bar");
  hpBar.style.width = `${hpPct}%`;
  hpBox.appendChild(hpBar);
  hpBox.appendChild(elt("span", "av-hp-text", { textContent: `${avatar.avatarHpCurrent} / ${avatar.avatarHpMax}` }));
  hpRow.appendChild(hpBox);
  stats.appendChild(hpRow);

  if (tmpl) stats.appendChild(elt("p", "av-detail-bio", { textContent: tmpl.description }));

  layout.appendChild(stats);

  const back = elt("button", "ghost-back", { type: "button", textContent: "← 師弟ホームへ" });
  back.onclick = () => onBack?.();
  container.appendChild(back);
}
