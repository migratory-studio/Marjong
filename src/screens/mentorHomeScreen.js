// 師弟ホーム (mentor-home) — major_update_specification.md §7.4 / §4.5 / Phase 2B。
//
// 師弟モードのハブ。和風ゲームUI（claude-design 由来）で、師匠立ち絵＋一言を主役に、
// 上部情報帯（章 / ソウル / 継承 / ○日目 / 設定）と、右の修行コマンド掲示板、
// 下部の弟子ステータス帯（点棒＝HP）＋次の大会CTAで構成する。
//
// コマンド種別（§4.5）:
//   - 軽い日常（休憩 等）… ハブ上モーダルで完結。画面遷移しない＝立ち絵の再デコード無し＆共在感。
//   - 出かける/対局（鍛錬・二人打ち・雀荘巡り・大会）… 画面遷移。
// 実データに無いものは段階開示で「準備中」表示（座学/鍛錬/二人打ち/雀荘巡り/大会、章名/○日目/継承）。
//
//   import { showMentorHome } from "./screens/mentorHomeScreen.js";
//   showMentorHome(container, { repository, onNavigate, onBack });
//     onNavigate("growth"|"ability-change"|"avatar"|"scenario"|"settings")
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { presetById } from "../data/avatarPresetMaster.js";
import { abilityDef } from "../data/abilityMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { canRestToday, rest } from "../progression/progressionService.js";
import { buildUnlockContext, evaluateUnlock } from "../scenario/unlockEvaluator.js";
import { isScenarioRead } from "../progression/scenarioService.js";
import { scenariosForMentor } from "./scenarioListScreen.js";
import { isDebugMode } from "../app/debug.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

// 師匠スキル Lv は仕様の到達基準 Lv5（§10.5「師匠の初期スキル Lv = 5」）。
const MENTOR_SKILL_LEVEL = 5;
// role → 称号（数値でない肩書き。絆とは無関係のフレーバー）。
const MENTOR_TITLE = {
  attacker: "攻めの達人", defender: "守りの達人", defense: "守りの達人",
  gambler: "博打の打ち手", balanced: "型破りの師範", support: "導きの師",
};
// 「今日の様子」プール（非数値の質的表現）。日替わりで安定させる。
const MENTOR_MOODS = ["上機嫌", "穏やか", "いつも通り", "少し眠そう", "鋭い目つき", "上々"];

// HTML へ差し込む動的値の最小エスケープ（マイキャラ名などユーザー入力対策）。
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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

// ハブ上に重ねる再利用モーダル。スクリム/✕/Esc で閉じる。onClose は閉じる直前に呼ぶ。
// 戻り値の card に内容を結線し、close() で明示的に閉じられる。
function openModal(container, innerHTML, onClose) {
  const ov = elt("div", "mhx-modal");
  ov.innerHTML =
    `<div class="mhx-modal-scrim"></div>` +
    `<div class="mhx-modal-card" role="dialog" aria-modal="true">${innerHTML}` +
    `<button type="button" class="mhx-modal-x" aria-label="閉じる">✕</button></div>`;
  container.appendChild(ov);
  let closed = false;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener("keydown", onKey);
    onClose?.();
    ov.classList.remove("is-open");
    setTimeout(() => ov.remove(), 180);
  }
  document.addEventListener("keydown", onKey);
  ov.querySelector(".mhx-modal-scrim").addEventListener("click", close);
  ov.querySelector(".mhx-modal-x").addEventListener("click", close);
  requestAnimationFrame(() => ov.classList.add("is-open"));
  return { card: ov.querySelector(".mhx-modal-card"), close };
}

export async function showMentorHome(container, { repository, onNavigate, onBack } = {}) {
  const profile = await repository.loadProfile();
  const avatar = activeAvatar(profile);
  container.innerHTML = "";
  container.classList.add("mh2");
  container.classList.remove("menu-screen", "mentor-screen");

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
  const debug = isDebugMode();
  const refresh = () => showMentorHome(container, { repository, onNavigate, onBack });

  // ---- 表示値の解決（未実装ぶんは仮値）----
  const soul = profile.wallet?.soul ?? 0;
  const meta = profile.wallet?.meta ?? 0;            // 継承（メタ通貨・未実装→0）
  const day = profile.dayCount;                       // ○日目（未実装→「—」）
  const chapter = "修行の日々";                       // TODO §4.5 mentorCampaignMaster で章名を差す
  const hpMax = avatar.avatarHpMax || 1;
  const hpCur = Math.max(0, Math.min(avatar.avatarHpCurrent ?? hpMax, hpMax));
  const hpPct = Math.round((hpCur / hpMax) * 100);

  // 師匠フレーバー
  const mentorTitle = MENTOR_TITLE[mentor?.role] || "師範";
  const mood = MENTOR_MOODS[(day ?? new Date().getDate()) % MENTOR_MOODS.length];
  const mAbility = mentor?.abilities?.[0]?.abilityId ? abilityDef(mentor.abilities[0].abilityId) : null;
  const mAbilityName = mAbility?.name || "";
  const mAbilityDesc = mAbility?.desc || mentor?.bio || "";

  // ---- シナリオ未読件数（バッジ用）----
  const scList = scenariosForMentor(avatar.mentorCharacterId);
  const ctx = buildUnlockContext(profile);
  const unread = scList.filter(
    (s) => (debug || evaluateUnlock(s, ctx).unlocked) && !isScenarioRead(profile, s.scenarioId)
  ).length;
  const hasScenario = scList.length > 0;

  const portraitSrc = mentor?.assets?.portrait || "";
  const mentorIcon = mentor?.assets?.icon || portraitSrc;
  // 弟子（マイキャラ）のアイコンはプリセットから引く（師匠の立ち絵を流用しない）。
  const discipleIcon = presetById(avatar.presetIds?.icon)?.assetPath || "";

  // ---- レイアウト（和風ゲームUI）----
  container.innerHTML = `
    <div class="mhx-bg">
      <div class="mhx-bg-base"></div>
      <div class="mhx-shoji"></div>
      <div class="mhx-floor"></div>
      <div class="mhx-crest"></div>
      <div class="mhx-lantern mhx-l1"><div class="mhx-cord"></div><div class="mhx-lbody"></div></div>
      <div class="mhx-lantern mhx-l2"><div class="mhx-cord"></div><div class="mhx-lbody"></div></div>
    </div>

    <div class="mhx-topbar">
      <div class="mhx-chapter">
        <button type="button" class="mhx-back" title="ホームへ戻る">‹</button>
        <div class="mhx-seal">章</div>
        <div class="mhx-cname">〔 <b>${esc(chapter)}</b> 〕</div>
      </div>
      <div class="mhx-topright">
        <div class="mhx-cur mhx-soul"><div class="mhx-coin">魂</div><div class="mhx-val">${esc(soul.toLocaleString())}<small> ソウル</small></div></div>
        <div class="mhx-cur mhx-kei"><div class="mhx-coin">継</div><div class="mhx-val">${esc(meta)}<small> 継承</small></div></div>
        <div class="mhx-divider"></div>
        <div class="mhx-day"><b>${day == null ? "—" : esc(day)}</b> 日目</div>
        <div class="mhx-divider"></div>
        <button type="button" class="mhx-gear" title="設定">⚙</button>
      </div>
    </div>

    <div class="mhx-scene">
      <div class="mhx-master${portraitSrc ? " has-img" : ""}">
        <div class="mhx-floorglow"></div>
        ${portraitSrc ? `<img class="mhx-master-img" alt="${esc(mentor?.name || "")}" src="${esc(portraitSrc)}">` : ""}
      </div>
      <div class="mhx-nameplate" role="button" tabindex="0" title="師匠の詳細">
        <span class="mhx-np-ttl">師匠</span>
        <div class="mhx-np-main">
          <span class="mhx-np-nm">${esc(mentor?.name || "師匠")}${mentor?.reading ? `<small>${esc(mentor.reading)}</small>` : ""}</span>
          <div class="mhx-np-sub">
            <span class="mhx-np-title">${esc(mentorTitle)}</span>
            <span class="mhx-np-lv">技 Lv${MENTOR_SKILL_LEVEL}</span>
            <span class="mhx-np-mood">今日：${esc(mood)}</span>
          </div>
        </div>
        ${mAbilityName ? `<div class="mhx-np-tip"><div class="mhx-np-tip-h">能力</div><div class="mhx-np-tip-n">${esc(mAbilityName)}</div><div class="mhx-np-tip-d">${esc(mAbilityDesc)}</div></div>` : ""}
      </div>
      <div class="mhx-bubble">
        <div class="mhx-q">${esc(mentorLine(rested))}</div>
      </div>
    </div>

    <div class="mhx-menu">
      <div class="mhx-menu-head"><span class="mhx-line"></span><span class="mhx-mt">修 行 を 選 ぶ</span><span class="mhx-line mhx-r"></span></div>

      <div class="mhx-group">
        <div class="mhx-cat">日常</div>
        <div class="mhx-tags">
          ${tag("休 憩", rested ? "今日は休憩済み" : "点棒を回復する", "rest", false)}
          ${tag("座 学", "準備中", null, true)}
        </div>
      </div>

      <div class="mhx-group mhx-jissen">
        <div class="mhx-cat">実戦</div>
        <div class="mhx-tags">
          ${tag("鍛 錬", "準備中", null, true)}
          ${tag("二人打ち", "準備中", null, true)}
          ${tag("雀荘巡り", "準備中", null, true)}
        </div>
      </div>

      <div class="mhx-group">
        <div class="mhx-cat">育成</div>
        <div class="mhx-tags">
          ${tag("育 成", "才を伸ばす", "growth", false)}
          ${tag("能力変更", "型を変える", "ability-change", false)}
        </div>
      </div>

      <div class="mhx-group">
        <div class="mhx-cat">物語</div>
        <div class="mhx-tags">
          ${tag("シ ナ リ オ", hasScenario ? (unread > 0 ? `未読 ${unread} 件` : "物語を読む") : "まだありません", "scenario", !hasScenario, unread > 0 ? unread : 0)}
        </div>
      </div>
    </div>

    <div class="mhx-status" role="button" tabindex="0" title="マイキャラの詳細">
      <div class="mhx-port">${discipleIcon ? `<img class="mhx-port-img" alt="" src="${esc(discipleIcon)}">` : "弟子"}</div>
      <div class="mhx-who">
        <div class="mhx-dn">${esc(avatar.name)}${tmpl ? `<small>${esc(tmpl.name)}</small>` : ""}</div>
        <div class="mhx-lv"><span class="mhx-lvtag">LV</span><b>${esc(avatar.avatarLevel)}</b></div>
      </div>
      <div class="mhx-hp">
        <div class="mhx-hp-top">
          <div class="mhx-lab">点棒 <b>＝ HP</b></div>
          <div class="mhx-num">${esc(hpCur.toLocaleString())}<small> / ${esc(hpMax.toLocaleString())}</small></div>
        </div>
        <div class="mhx-bar"><div class="mhx-fill" style="width:${hpPct}%"></div></div>
      </div>
    </div>

    <button type="button" class="mhx-next mhx-next-off" disabled title="準備中（Phase 4B）">
      <div class="mhx-badge"><span class="mhx-b1">CUP</span><span class="mhx-b2">杯</span></div>
      <div class="mhx-txt"><div class="mhx-s">次 の 大 会 へ</div><div class="mhx-m">宝への道</div></div>
      <div class="mhx-na">準備中</div>
    </button>

    <div class="mhx-corner mhx-tl"></div>
    <div class="mhx-corner mhx-tr"></div>
    <div class="mhx-corner mhx-bl"></div>
    <div class="mhx-corner mhx-br"></div>
  `;

  // コマンド札のHTMLを返す。target=null か off=true で無効札（クリック不可）。
  // 第5引数 badge>0 で右上に未読バッジ。
  function tag(cmd, desc, target, off, badge = 0) {
    const cls = "mhx-tag" + (off ? " mhx-tag-off" : "");
    const data = !off && target ? ` data-nav="${target}"` : "";
    const b = badge > 0 ? `<span class="mhx-badge2">${badge}</span>` : "";
    return `<div class="${cls}"${data} role="button" tabindex="${off ? -1 : 0}">${b}<span class="mhx-cmd">${cmd}</span><span class="mhx-desc">${esc(desc)}</span></div>`;
  }

  // ---- 休憩モーダル（ハブ上で完結）----
  function openRestModal() {
    const available = canRestToday(profile);
    const curPct = Math.round((hpCur / hpMax) * 100);
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title"><span class="mhx-md-by">休 憩</span><span class="mhx-md-ttl">${esc(mentor?.name || "師匠")}</span></div>
      </div>
      <p class="mhx-md-line">${available ? "ゆっくり休め。明日に備えるのも実力のうちだ。" : "今日はもう十分休んだ。また明日な。"}</p>
      <div class="mhx-md-hp">
        <div class="mhx-md-hp-top"><span>点棒 ＝ HP</span><span class="mhx-md-hp-num">${hpCur.toLocaleString()} / ${hpMax.toLocaleString()}</span></div>
        <div class="mhx-bar"><div class="mhx-fill mhx-md-fill" style="width:${curPct}%"></div></div>
      </div>
      <p class="mhx-md-result" hidden></p>
      <button type="button" class="mhx-md-btn"${available ? "" : " disabled"}>${available ? "休憩する" : "今日は休憩済み"}</button>
    `;
    let didRest = false;
    const { card } = openModal(container, html, () => { if (didRest) refresh(); });
    const btn = card.querySelector(".mhx-md-btn");
    btn?.addEventListener("click", async () => {
      if (didRest || !canRestToday(profile)) return;
      try {
        const res = rest(profile);
        await repository.saveProfile(res.profile);
        didRest = true;
        const av2 = activeAvatar(res.profile);
        const np = Math.round((av2.avatarHpCurrent / av2.avatarHpMax) * 100);
        card.querySelector(".mhx-md-fill").style.width = `${np}%`;
        card.querySelector(".mhx-md-hp-num").textContent =
          `${av2.avatarHpCurrent.toLocaleString()} / ${av2.avatarHpMax.toLocaleString()}`;
        // 絆は数値で見せない（CLAUDE.md ピラー1）。Lv 上昇は質的な一言で滲ませる。
        const parts = [`HP +${res.healed.toLocaleString()} 回復`, `ソウル +${res.soul}`];
        if (res.bondUp) parts.push("…師匠との距離が、少し縮まった気がする。");
        const r = card.querySelector(".mhx-md-result");
        r.textContent = parts.join("　／　"); r.hidden = false;
        btn.disabled = true; btn.textContent = "ゆっくり休んだ";
      } catch (e) {
        const r = card.querySelector(".mhx-md-result");
        r.textContent = e?.message || "休憩に失敗しました。"; r.hidden = false;
      }
    });
  }

  // ---- 師匠詳細モーダル ----
  function openMentorModal() {
    const html = `
      <div class="mhx-md-head">
        <div class="mhx-md-icon mhx-md-icon-lg">${mentorIcon ? `<img src="${esc(mentorIcon)}" alt="">` : ""}</div>
        <div class="mhx-md-title">
          <span class="mhx-md-by">師匠</span>
          <span class="mhx-md-ttl">${esc(mentor?.name || "師匠")}${mentor?.reading ? `<small>${esc(mentor.reading)}</small>` : ""}</span>
          <div class="mhx-md-chips">
            <span class="mhx-chip">${esc(mentorTitle)}</span>
            <span class="mhx-chip mhx-chip-lv">技 Lv${MENTOR_SKILL_LEVEL}</span>
            <span class="mhx-chip mhx-chip-mood">今日 ${esc(mood)}</span>
          </div>
        </div>
      </div>
      ${mentor?.profile ? `<p class="mhx-md-prof">${esc(mentor.profile)}</p>` : ""}
      ${mAbilityName ? `<div class="mhx-md-abil"><div class="mhx-md-abil-h">能力</div><div class="mhx-md-abil-n">${esc(mAbilityName)}</div><div class="mhx-md-abil-d">${esc(mAbilityDesc)}</div></div>` : ""}
      <div class="mhx-md-haoh">覇道モードでは、ここに師匠の HP も並びます（二人三脚）。</div>
    `;
    openModal(container, html);
  }

  // ---- イベント結線 ----
  const fire = (t) => { if (t) onNavigate?.(t); };
  container.querySelectorAll(".mhx-tag[data-nav]").forEach((node) => {
    const t = node.getAttribute("data-nav");
    const handler = t === "rest" ? openRestModal : () => fire(t);
    node.addEventListener("click", handler);
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); } });
  });
  const status = container.querySelector(".mhx-status");
  status?.addEventListener("click", () => onNavigate?.("avatar"));
  status?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.("avatar"); } });
  const np = container.querySelector(".mhx-nameplate");
  np?.addEventListener("click", openMentorModal);
  np?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMentorModal(); } });
  container.querySelector(".mhx-back")?.addEventListener("click", () => onBack?.());
  container.querySelector(".mhx-gear")?.addEventListener("click", () => onNavigate?.("settings"));

  // 立ち絵はデコード済みになってからフェードイン（初回入場の「ブランク→ポップ」を防ぐ）。
  container.querySelectorAll(".mhx-master-img, .mhx-port-img").forEach((img) => {
    const reveal = () => img.classList.add("is-loaded");
    if (img.complete && img.naturalWidth > 0) reveal();
    else img.addEventListener("load", reveal);
    img.addEventListener("error", () => { img.style.display = "none"; });
  });

  // ---- DEBUG: 1からやりなおす（?debug=tsumoreba 起動時のみ表示）----
  if (debug) {
    const reset = elt("button", "mh-debug-reset mhx-debug", {
      type: "button",
      textContent: "🛠 1からやりなおす（DEBUG）",
    });
    reset.onclick = async () => {
      const ok = (typeof confirm === "function")
        ? confirm("セーブデータを消して、最初からやりなおします。よろしいですか？")
        : true;
      if (!ok) return;
      await repository.clearProfile();
      onBack?.();
    };
    container.appendChild(reset);
  }
}
