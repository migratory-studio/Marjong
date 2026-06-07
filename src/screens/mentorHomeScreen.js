// 師弟ホーム (mentor-home) — major_update_specification.md §7.4 / §4.5 / Phase 2B。
//
// 師弟モードのハブ。和風ゲームUI（claude-design 由来）で、師匠立ち絵＋一言を主役に、
// 上部情報帯（章 / ソウル / 継承 / ○日目 / 設定）と、右の修行コマンド掲示板、
// 下部の弟子ステータス帯（点棒＝HP）＋次の大会CTAで構成する。
//
// 実データに無いものは段階開示（§4.4）に従い「準備中」で見せる:
//   - 座学 / 鍛錬 / 二人打ち / 雀荘巡り … Phase 4 以降（コマンド未実装）
//   - 大会CTA … Phase 4B 以降
//   - 章名 / ○日目 / 継承 … 師匠キャンペーン・メタ通貨の実装待ち（仮値表示）
//
//   import { showMentorHome } from "./screens/mentorHomeScreen.js";
//   showMentorHome(container, { repository, onNavigate, onBack });
//     onNavigate("rest"|"growth"|"ability-change"|"avatar"|"scenario"|"settings")
import { CHARACTER_MASTER } from "../data/characterMaster.js";
import { skillTemplateById } from "../data/skillTemplateMaster.js";
import { activeAvatar } from "../progression/avatarFactory.js";
import { canRestToday } from "../progression/progressionService.js";
import { buildUnlockContext, evaluateUnlock } from "../scenario/unlockEvaluator.js";
import { isScenarioRead } from "../progression/scenarioService.js";
import { scenariosForMentor } from "./scenarioListScreen.js";
import { isDebugMode } from "../app/debug.js";

const charById = (id) => CHARACTER_MASTER.find((c) => c.id === id) || null;

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

  // ---- 表示値の解決（未実装ぶんは仮値）----
  const soul = profile.wallet?.soul ?? 0;
  const meta = profile.wallet?.meta ?? 0;            // 継承（メタ通貨・未実装→0）
  const day = profile.dayCount;                       // ○日目（未実装→「—」）
  const chapter = "修行の日々";                       // TODO §4.5 mentorCampaignMaster で章名を差す
  const hpMax = avatar.avatarHpMax || 1;
  const hpCur = Math.max(0, Math.min(avatar.avatarHpCurrent ?? hpMax, hpMax));
  const hpPct = Math.round((hpCur / hpMax) * 100);

  // ---- シナリオ未読件数（バッジ用）----
  const scList = scenariosForMentor(avatar.mentorCharacterId);
  const ctx = buildUnlockContext(profile);
  const unread = scList.filter(
    (s) => (debug || evaluateUnlock(s, ctx).unlocked) && !isScenarioRead(profile, s.scenarioId)
  ).length;
  const hasScenario = scList.length > 0;

  // 師匠立ち絵URL（無ければプレースホルダ表示にフォールバック）。
  const portraitSrc = mentor?.assets?.portrait || "";

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
      <div class="mhx-nameplate">
        <span class="mhx-np-ttl">師匠</span>
        <span class="mhx-np-nm">${esc(mentor?.name || "師匠")}${mentor?.reading ? `<small>${esc(mentor.reading)}</small>` : ""}</span>
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
          ${tag("休 憩", rested ? "今日は休憩済み" : "点棒を回復する", "rest", rested)}
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
      <div class="mhx-port">${portraitSrc ? `<img class="mhx-port-img" alt="" src="${esc(portraitSrc)}">` : "弟子"}</div>
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

  // ---- イベント結線 ----
  const fire = (t) => { if (t) onNavigate?.(t); };
  container.querySelectorAll(".mhx-tag[data-nav]").forEach((node) => {
    const t = node.getAttribute("data-nav");
    node.addEventListener("click", () => fire(t));
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(t); } });
  });
  const status = container.querySelector(".mhx-status");
  status?.addEventListener("click", () => onNavigate?.("avatar"));
  status?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.("avatar"); } });
  container.querySelector(".mhx-back")?.addEventListener("click", () => onBack?.());
  container.querySelector(".mhx-gear")?.addEventListener("click", () => onNavigate?.("settings"));

  // 立ち絵はデコード済みになってからフェードイン（初回入場の「ブランク→ポップ」を防ぐ）。
  // 既にキャッシュ済み（complete）なら即 is-loaded。失敗時はプレースホルダへフォールバック。
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
