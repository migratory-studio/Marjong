// マイキャラ確認画面 (avatar-detail) — major_update_specification.md §8 / Phase 2A。
//
// 作成済みのマイキャラの現在値・見た目・師匠・能力を表示する読み取り専用画面。
// 休憩 / 育成 / 能力変更への導線は師弟ホーム（mentorHomeScreen, Phase 2B）が持つ。
//
//   import { showAvatarDetail } from "./screens/avatarDetailScreen.js";
//   showAvatarDetail(container, { profile, onBack });
import { mountTrainingPage } from "../ui/trainingPage.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { activeAvatar, avatarParams6 } from "../progression/avatarFactory.js";
import { bondBandLabel } from "../progression/progressionService.js";
import { bondPtView } from "../progression/companionBond.js";
import { statViews, rankCells } from "../autobattle/statSystem.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export function showAvatarDetail(container, { profile, onBack } = {}) {
  const avatar = activeAvatar(profile);
  const content = mountTrainingPage(container, { title: "弟子手帳", profile, avatar, onBack });

  if (!avatar) {
    content.appendChild(elt("p", "lead", { textContent: "まだマイキャラがいません。" }));
    return;
  }

  const mentor = charById(avatar.mentorCharacterId);
  const tmpl = skillTemplateById(avatar.skillTemplateId);
  // ---- ステータス ----
  const stats = elt("div", "avatar-stats");
  const hpPct = Math.max(0, Math.min(100, Math.round((avatar.avatarHpCurrent / avatar.avatarHpMax) * 100)));
  const rows = [
    ["師匠", mentor ? mentor.name : avatar.mentorCharacterId],
    ["能力種類", tmpl ? `${tmpl.name}（${tmpl.rarity}）` : avatar.skillTemplateId],
    ["スキル Lv", `Lv ${avatar.skillLevel}`],
    ["弟子 Lv", `Lv ${avatar.avatarLevel}`],
    ["師匠との間柄", (() => {
      const { lv, cur, need } = bondPtView({ level: avatar.bondLevel, exp: avatar.bondExp });
      return `${bondBandLabel(avatar.bondLevel)}　Lv${lv}（${cur}/${need} pt）`;
    })()],
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

  content.appendChild(stats);

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

    // ランク段ゲージ（1段=1ランク、現ランクまで点灯）。
    const gauge = elt("div", "statgauge");
    for (const cell of rankCells(s.value)) {
      const seg = elt("span", "statgauge-seg" + (cell.on ? " on" : ""));
      if (cell.on) seg.style.background = cell.color;
      gauge.appendChild(seg);
    }
    card.appendChild(gauge);

    const up = s.raisedBy.map((r) => `${r.label}(${r.role})`).join("・");
    card.appendChild(elt("div", "av-pstat-up", { textContent: `↑ ${up}` }));
    card.appendChild(elt("div", "av-pstat-aff", { textContent: s.affects, title: s.affects }));
    grid.appendChild(card);
  }
  panel.appendChild(grid);
  content.appendChild(panel);

}
