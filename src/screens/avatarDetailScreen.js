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
import { activeAvatar, avatarParams6 } from "../progression/avatarFactory.js";
import { statViews } from "../autobattle/statSystem.js";

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

  // ---- オートバトル能力値（6 パラメータ：レベル＋ランク＋上げ方＋効果）----
  const panel = elt("section", "av-params");
  const phead = elt("div", "av-params-head");
  phead.appendChild(elt("span", "av-params-ttl", { textContent: "オートバトル能力値" }));
  phead.appendChild(elt("span", "av-params-note", { textContent: "活動で伸ばす・対局オートに直結（本気対局には不干渉）" }));
  panel.appendChild(phead);

  const grid = elt("div", "av-params-grid");
  for (const s of statViews(avatarParams6(avatar))) {
    const card = elt("div", "av-pstat");
    const top = elt("div", "av-pstat-top");
    top.appendChild(elt("span", `av-pstat-rank rank-${s.rank}`, { textContent: s.rank }));
    const lab = elt("span", "av-pstat-label");
    lab.appendChild(document.createTextNode(s.label));
    lab.appendChild(elt("small", null, { textContent: s.passive ? `${s.kana}・パッシブ` : s.kana }));
    top.appendChild(lab);
    top.appendChild(elt("span", "av-pstat-lv", { textContent: `Lv ${s.value}` }));
    card.appendChild(top);

    const bar = elt("div", "av-pstat-bar");
    const fill = elt("div", "av-pstat-fill");
    fill.style.width = `${s.pct}%`;
    bar.appendChild(fill);
    card.appendChild(bar);

    const up = s.raisedBy.map((r) => `${r.label}(${r.role})`).join("・");
    card.appendChild(elt("div", "av-pstat-up", { textContent: `↑ ${up}` }));
    card.appendChild(elt("div", "av-pstat-aff", { textContent: s.affects, title: s.affects }));
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  container.appendChild(panel);

  const back = elt("button", "ghost-back", { type: "button", textContent: "← 師弟ホームへ" });
  back.onclick = () => onBack?.();
  container.appendChild(back);
}
