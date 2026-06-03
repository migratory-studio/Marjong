// 師弟ホーム (mentor-home) — major_update_specification.md §7.4 / Phase 2B。
//
// 師弟モードのハブ。ソウル残高・師匠立ち絵・一言会話を出し、休憩 / 育成 / 能力変更 /
// シナリオ / マイキャラ へ振り分ける。シナリオは Phase 3 までプレースホルダ。
//
//   import { showMentorHome } from "./screens/mentorHomeScreen.js";
//   showMentorHome(container, { repository, onNavigate, onBack });
//     onNavigate("rest"|"growth"|"ability-change"|"avatar"|"scenario")
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { canRestToday } from "../progression/progressionService.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// 師匠の一言（一覧から状況に応じて1つ）。Phase 3 のシナリオが入るまでの軽い会話。
function mentorLine(rested) {
  if (!rested) return "今日はどうする？ まずは一息つくか、腕を磨くか。";
  const lines = [
    "今日はよく休んだな。次の一局が楽しみだ。",
    "焦らず積み上げていこう。お前なら届く。",
    "調子はどうだ？ 無理は禁物だぞ。",
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

export async function showMentorHome(container, { repository, onNavigate, onBack } = {}) {
  const profile = await repository.loadProfile();
  const avatar = activeAvatar(profile);
  container.innerHTML = "";
  container.classList.add("mentor-screen");

  if (!avatar) {
    container.appendChild(elt("p", "lead", { textContent: "まだマイキャラがいません。" }));
    const back = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
    back.onclick = () => onBack?.();
    container.appendChild(back);
    return;
  }

  const mentor = charById(avatar.mentorCharacterId);
  const tmpl = skillTemplateById(avatar.skillTemplateId);
  const rested = !canRestToday(profile);

  // ---- 上段バー: ソウル / 戻る ----
  const topbar = elt("div", "mh-topbar");
  const soul = elt("div", "mh-soul");
  soul.appendChild(elt("span", "mh-soul-label", { textContent: "ソウル" }));
  soul.appendChild(elt("span", "mh-soul-val", { textContent: String(profile.wallet?.soul ?? 0) }));
  topbar.appendChild(soul);
  const back = elt("button", "ghost-back", { type: "button", textContent: "← ホームへ" });
  back.onclick = () => onBack?.();
  topbar.appendChild(back);
  container.appendChild(topbar);

  // ---- 中央: 師匠立ち絵 + 一言 ----
  const stage = elt("div", "mh-stage");
  const portrait = elt("img", "mh-portrait", { alt: mentor ? mentor.name : "", src: mentor?.assets?.portrait || "" });
  portrait.onerror = () => { portrait.style.visibility = "hidden"; };
  stage.appendChild(portrait);
  const bubble = elt("div", "mh-bubble");
  bubble.appendChild(elt("span", "mh-bubble-name", { textContent: mentor ? mentor.name : "師匠" }));
  bubble.appendChild(elt("p", "mh-bubble-text", { textContent: mentorLine(rested) }));
  stage.appendChild(bubble);
  container.appendChild(stage);

  // ---- 弟子サマリ ----
  const summary = elt("div", "mh-summary", {
    textContent: `${avatar.name}  ／  ${tmpl ? tmpl.name : "—"}  ／  スキルLv ${avatar.skillLevel}・キャラLv ${avatar.avatarLevel}`,
  });
  container.appendChild(summary);

  // ---- メニュー ----
  const menu = elt("div", "mh-menu");
  const mkBtn = (label, sub, target, { disabled = false } = {}) => {
    const b = elt("button", "menu-btn mh-menu-btn", { type: "button", disabled });
    b.appendChild(elt("span", "menu-btn-title", { textContent: label }));
    if (sub) b.appendChild(elt("span", "menu-btn-sub", { textContent: sub }));
    if (!disabled) b.onclick = () => onNavigate?.(target);
    return b;
  };
  menu.appendChild(mkBtn("休憩", rested ? "今日は休憩済み" : "HP回復・絆・ソウル", "rest", { disabled: rested }));
  menu.appendChild(mkBtn("育成", "HP / スキルLv を強化", "growth"));
  menu.appendChild(mkBtn("能力変更", "能力種類を変える", "ability-change"));
  menu.appendChild(mkBtn("シナリオ", "Phase 3 で解放", "scenario", { disabled: true }));
  menu.appendChild(mkBtn("マイキャラ", "ステータス確認", "avatar"));
  container.appendChild(menu);
}
