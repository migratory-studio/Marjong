// 能力変更 (ability-change) — major_update_specification.md §10.6 / Phase 2B。
//
// 師匠は変えず、許可候補から能力種類を選び直す。ソウルを消費し、変更後はスキル Lv が
// 初期値（Lv1）へ戻る。リセットを伴うので確認を挟む。
//
//   import { showAbilityChange } from "./screens/abilityChangeScreen.js";
//   showAbilityChange(container, { repository, onBack });
import { mountTrainingPage } from "../ui/trainingPage.js";
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { abilityChangeOptions, changeAbility } from "../progression/progressionService.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

export async function showAbilityChange(container, { repository, onBack } = {}) {
  let selected = null; // 選択中の skillTemplateId

  const render = async () => {
    const profile = await repository.loadProfile();
    const avatar = activeAvatar(profile);
    const content = mountTrainingPage(container, { title: "能力変更", profile, avatar, mentorSide: true, onBack });

    if (!avatar) {
      content.appendChild(elt("p", "lead", { textContent: "マイキャラがいません。" }));
      return;
    }

    const soulNow = profile.wallet?.soul ?? 0;
    const mentor = charById(avatar.mentorCharacterId);
    const current = skillTemplateById(avatar.skillTemplateId);

    const top = elt("div", "ac-top");
    top.appendChild(elt("div", "growth-soul", {}));
    top.querySelector(".growth-soul").appendChild(elt("span", "mh-soul-label", { textContent: "ソウル" }));
    top.querySelector(".growth-soul").appendChild(elt("span", "mh-soul-val", { textContent: String(soulNow) }));
    top.appendChild(elt("div", "ac-current", {
      textContent: `師匠: ${mentor ? mentor.name : avatar.mentorCharacterId}  ／  現在の能力: ${current ? current.name : "—"}（スキルLv ${avatar.skillLevel}）`,
    }));
    content.appendChild(top);

    content.appendChild(elt("p", "ac-warn", { textContent: "※ 能力を変更するとスキル Lv は 1 に戻ります。" }));

    const err = elt("p", "av-error ac-err hidden");
    content.appendChild(err);

    const options = abilityChangeOptions(profile);
    const list = elt("div", "ac-list");
    if (options.length === 0) {
      list.appendChild(elt("p", "lead", { textContent: "この師匠には他の能力候補がありません。" }));
    }
    for (const { template: t, cost } of options) {
      const afford = soulNow >= cost;
      const card = elt("button", "av-skill-card ac-card" + (selected === t.skillTemplateId ? " selected" : ""), { type: "button" });
      const head2 = elt("div", "av-skill-top");
      head2.appendChild(elt("span", "av-skill-name", { textContent: t.name }));
      head2.appendChild(elt("span", "av-skill-rarity", { textContent: t.rarity }));
      card.appendChild(head2);
      card.appendChild(elt("span", "av-skill-desc", { textContent: t.description }));
      const costRow = elt("div", "ac-cost" + (afford ? "" : " ac-cost-short"), { textContent: `変更費用: ソウル ${cost}${afford ? "" : "（不足）"}` });
      card.appendChild(costRow);
      card.onclick = () => { selected = t.skillTemplateId; render(); };
      list.appendChild(card);
    }
    content.appendChild(list);

    // 確認 + 実行
    const footer = elt("div", "ac-footer");

    const sel = options.find((o) => o.template.skillTemplateId === selected);
    const confirmBtn = elt("button", "primary", { type: "button",
      disabled: !sel || soulNow < (sel?.cost ?? Infinity),
      textContent: sel ? `「${sel.template.name}」に変更（ソウル ${sel.cost}）` : "変更先を選択" });
    confirmBtn.onclick = async () => {
      if (!sel) return;
      err.classList.add("hidden");
      try {
        const res = changeAbility(profile, sel.template.skillTemplateId);
        await repository.saveProfile(res.profile);
        selected = null;
        await render();
        const e2 = container.querySelector(".ac-err");
        if (e2) { e2.textContent = `能力を「${sel.template.name}」に変更しました（スキル Lv は 1 に戻りました）。`; e2.classList.remove("hidden"); e2.classList.add("ac-ok"); }
      } catch (e) {
        err.textContent = e?.message || "変更に失敗しました。";
        err.classList.remove("hidden");
      }
    };
    footer.appendChild(confirmBtn);
    content.appendChild(footer);
  };

  await render();
}
