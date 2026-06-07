// 対局開始演出（全対局共通）。
//
//   showMatchIntro(host, { seated, humanIndex, mode, dealerIndex, audio, onComplete });
//
// 2フェーズ構成:
//   Phase A … VS 対戦カード（参加者の立ち絵・名前・ロール・持ち点=HP を並べてスライドイン）
//   Phase B … 座席・親決め（俯瞰卓に着席 → 起家を回して決定 → 局名コール）
// どちらもクリック / スキップで先送りでき、最後に onComplete() で抜ける。
//
// seated は main.js が組む [{ character, abilities }] をそのまま受け取る（abilities は未使用）。
// 立ち絵は character.assets.portrait を直接 src に使い、onerror で色ブロックへフォールバック
// （CharacterImages のプリロード状態に依存しない＝選択画面と同じ流儀）。
import { ROLE_MASTER } from "../data/characterMaster.js";

// 起家から各席の自風（東南西北）を引く。SEAT_WINDS は core/game.js と同じ並び。
const WIND_LABEL = ["東", "南", "西", "北"];

// ロール定義引き（未設定/未知は「アビス」へフォールバック）。main.js の roleDef と同じ。
const roleDef = (id) =>
  ROLE_MASTER.find((r) => r.id === id) || { id: "extra", label: "アビス", color: "#a78bfa" };

// 立ち絵 <img>（色ブロックフォールバック付き）。which は "portrait" | "icon"。
function makeArt(c, which, cls) {
  const path = c.assets?.[which];
  if (path) {
    const img = document.createElement("img");
    img.className = cls;
    img.src = path;
    img.alt = c.name;
    if (which === "portrait" && c.portraitPos) img.style.objectPosition = c.portraitPos;
    img.onerror = () => {
      const fb = makeArtFallback(c, cls);
      img.replaceWith(fb);
    };
    return img;
  }
  return makeArtFallback(c, cls);
}
function makeArtFallback(c, cls) {
  const fb = document.createElement("div");
  fb.className = `${cls} mi-art-fallback`;
  fb.style.background = c.color;
  fb.textContent = [...c.name][0] || "?";
  return fb;
}

// 持ち点(=HP)ゲージ。ロスター最大HPに対する相対で 5 ピップ。
function hpGauge(points, maxHp, accent) {
  const v = Math.max(1, Math.min(5, Math.round((points / maxHp) * 5)));
  let pips = "";
  for (let i = 0; i < 5; i++) pips += `<span class="mi-pip${i < v ? " on" : ""}"></span>`;
  return `<div class="mi-hp" style="--accent:${accent}"><span class="mi-hp-pips">${pips}</span><span class="mi-hp-val">${points}</span></div>`;
}

/**
 * 対局開始演出を再生する。
 * @param {HTMLElement} host  マウント先 <section id="match-intro-screen">
 * @param {object} opts
 * @param {Array}  opts.seated      [{ character, abilities }]（席順）
 * @param {number} opts.humanIndex  人間プレイヤーの席index
 * @param {object} opts.mode        { rounds:1|2, players:3|4 }
 * @param {number} opts.dealerIndex 起家（最初の親）の席index
 * @param {object} [opts.audio]     AudioManager（任意。SE 用）
 * @param {Function} opts.onComplete 演出完了で呼ばれる
 */
export function showMatchIntro(host, { seated, humanIndex = 0, mode = {}, dealerIndex = 0, audio, teams = null, pairs = null, onComplete }) {
  const N = seated.length;
  const rounds = mode.rounds === 2 ? 2 : 1;
  const players = N;
  const maxHp = Math.max(...seated.map((s) => s.character.stats?.startingPoints || 1));
  // 団体戦: 各チーム3人を枠で囲んで並べる専用 Phase A を出す。Phase B（着席・親決め）は
  // 各チームの先鋒（seated）でそのまま流用する。
  const isTeam = Array.isArray(teams) && teams.length > 0;
  // ペア戦: 2人ペア×2 を枠で囲んで「自ペア VS 相手ペア」を見せる専用 Phase A。
  // チーム枠のレイアウト（mi-teams / mi-team-block / mi-tm-card）を流用する。
  const isPair = !isTeam && Array.isArray(pairs) && pairs.length > 0;
  const isGrouped = isTeam || isPair; // チーム枠レイアウトを使うか（個人カードではなく）
  // 相手チームの表示ラベル（自チーム以外を出現順に ②③④…）。
  const TEAM_NUM = ["①", "②", "③", "④"];

  // 後始末（タイマー / 多重起動ガード）。
  const timers = [];
  let finished = false;
  const after = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { for (const t of timers) clearTimeout(t); timers.length = 0; };

  // 俯瞰卓の視覚スロット（0=自分bottom,1=right,2=top,3=left）。三麻は北席なし、
  // 二人麻雀は相手を対面(top)に。
  const slotOf = (i) => {
    const off = (i - humanIndex + N) % N;
    return (N === 2 ? [0, 2] : N === 3 ? [0, 1, 3] : [0, 1, 2, 3])[off];
  };
  // 起家からの自風（東南西北）。
  const windOf = (i) => WIND_LABEL[(i - dealerIndex + N) % N];

  host.innerHTML = `
    <div class="match-intro">
      <button type="button" class="mi-skip">スキップ ▶</button>

      <!-- Phase A: VS 対戦カード -->
      <div class="mi-phase mi-versus${isTeam ? " mi-versus-team" : ""}${isPair ? " mi-versus-team mi-versus-pair" : ""}" data-phase="versus">
        <div class="mi-modebar">
          <span class="mi-badge">${isTeam ? `${players}チーム対抗` : isPair ? "ペア戦 2対2" : players === 2 ? "二人打ち" : players === 3 ? "三人打ち" : "四人打ち"}</span>
          <span class="mi-badge">${rounds === 2 ? "半荘戦" : "東風戦"}</span>
        </div>
        ${isGrouped ? '<div class="mi-teams"></div>' : '<div class="mi-cards"></div>'}
        <div class="mi-vs">VS</div>
      </div>

      <!-- Phase B: 座席・親決め -->
      <div class="mi-phase mi-seating hidden" data-phase="seating">
        <div class="mi-table"><div class="mi-table-felt"></div></div>
        <div class="mi-roll-msg">親（起家）を決定中…</div>
      </div>

      <!-- 局名コール -->
      <div class="mi-kyoku hidden"><span class="mi-kyoku-text"></span></div>
    </div>`;

  const root = host.querySelector(".match-intro");
  const cardsBox = root.querySelector(".mi-cards");
  const teamsBox = root.querySelector(".mi-teams");
  const tableBox = root.querySelector(".mi-table");
  const versusEl = root.querySelector('[data-phase="versus"]');
  const seatingEl = root.querySelector('[data-phase="seating"]');

  // ---- Phase A の中身を構築 ----
  if (isTeam) {
    buildTeamCards();
  } else if (isPair) {
    buildPairCards();
  } else {
    for (const s of seated) {
      const c = s.character;
      const role = roleDef(c.role);
      const isHuman = seated.indexOf(s) === humanIndex;
      const card = document.createElement("div");
      card.className = `mi-card${isHuman ? " is-human" : ""}`;
      card.style.setProperty("--role", role.color);
      card.style.setProperty("--char", c.color);
      card.innerHTML = `
        <div class="mi-card-art"></div>
        <div class="mi-card-info">
          <div class="mi-card-reading">${c.reading || ""}</div>
          <div class="mi-card-name" style="color:${c.color}">${c.name}</div>
          <div class="mi-card-role" style="--role:${role.color}">${role.label}</div>
          ${hpGauge(c.stats?.startingPoints || 0, maxHp, c.color)}
          ${isHuman ? `<div class="mi-card-you">YOU</div>` : ""}
        </div>`;
      card.querySelector(".mi-card-art").appendChild(makeArt(c, "portrait", "mi-card-portrait"));
      cardsBox.appendChild(card);
    }
  }

  // 団体戦 Phase A: チーム枠（自チームを左上）に3人カードを横並び。先鋒（activeIdx）に
  // 「一番手」マーク＋強調、控えはトーンダウン。HP等の数値は出さない（ダメージ演出で見せる）。
  function buildTeamCards() {
    const order = [humanIndex, ...teams.map((_, i) => i).filter((i) => i !== humanIndex)];
    order.forEach((ti) => {
      const t = teams[ti];
      const isHuman = ti === humanIndex;
      const block = document.createElement("div");
      block.className = `mi-team-block${isHuman ? " is-human" : ""}`;
      const label = isHuman ? "自チーム" : `チーム ${TEAM_NUM[ti] || ti + 1}`;
      block.innerHTML = `
        <div class="mi-team-head">${label}${isHuman ? '<span class="mi-team-you">YOU</span>' : ""}</div>
        <div class="mi-team-cards"></div>`;
      const wrap = block.querySelector(".mi-team-cards");
      t.chars.forEach((c, mi) => {
        if (!c) return;
        const isFirst = mi === t.activeIdx;
        const card = document.createElement("div");
        card.className = `mi-tm-card${isFirst ? " first" : " bench"}`;
        card.style.setProperty("--char", c.color);
        card.innerHTML = `
          <div class="mi-tm-art"></div>
          <div class="mi-tm-name" style="color:${c.color}">${c.name}</div>
          ${isFirst ? '<div class="mi-tm-badge">一番手</div>' : '<div class="mi-tm-bench-tag">控え</div>'}`;
        card.querySelector(".mi-tm-art").appendChild(makeArt(c, "portrait", "mi-tm-portrait"));
        wrap.appendChild(card);
      });
      teamsBox.appendChild(block);
    });
  }

  // ペア戦 Phase A: 2人ペア×2 を「自ペア VS 相手ペア」で並べる。チーム枠の見た目を流用し、
  // 2人とも同格（一番手/控えの区別なし）として強調する。HP等の数値は出さない。
  function buildPairCards() {
    // 自ペア（humanIndex を含む）を左に。
    const order = [...pairs.keys()].sort(
      (a, b) => (pairs[a].seats.includes(humanIndex) ? 0 : 1) - (pairs[b].seats.includes(humanIndex) ? 0 : 1)
    );
    order.forEach((pid) => {
      const p = pairs[pid];
      const isMine = p.seats.includes(humanIndex);
      const block = document.createElement("div");
      block.className = `mi-team-block mi-pair-block${isMine ? " is-human" : ""}`;
      const label = isMine ? "自ペア" : "相手ペア";
      block.innerHTML = `
        <div class="mi-team-head">${label}${isMine ? '<span class="mi-team-you">YOU</span>' : ""}</div>
        <div class="mi-team-cards"></div>`;
      const wrap = block.querySelector(".mi-team-cards");
      p.chars.forEach((c) => {
        if (!c) return;
        const card = document.createElement("div");
        card.className = "mi-tm-card first"; // 2人とも同格＝強調
        card.style.setProperty("--char", c.color);
        card.innerHTML = `
          <div class="mi-tm-art"></div>
          <div class="mi-tm-name" style="color:${c.color}">${c.name}</div>`;
        card.querySelector(".mi-tm-art").appendChild(makeArt(c, "portrait", "mi-tm-portrait"));
        wrap.appendChild(card);
      });
      teamsBox.appendChild(block);
    });
  }

  // ---- Phase B の中身（俯瞰卓の着席）を構築 ----
  for (let i = 0; i < N; i++) {
    const c = seated[i].character;
    const seat = document.createElement("div");
    seat.className = `mi-seat mi-seat-${slotOf(i)}`;
    seat.dataset.index = String(i);
    seat.style.setProperty("--char", c.color);
    seat.innerHTML = `
      <div class="mi-seat-icon"></div>
      <div class="mi-seat-name">${c.name}</div>
      <div class="mi-seat-wind">${windOf(i)}</div>`;
    seat.querySelector(".mi-seat-icon").appendChild(makeArt(c, "icon", "mi-seat-img"));
    tableBox.appendChild(seat);
  }

  // ---- 進行制御 ----
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimers();
    onComplete?.();
  };

  const seatEls = () => [...tableBox.querySelectorAll(".mi-seat")];

  function runSeating() {
    versusEl.classList.add("hidden");
    seatingEl.classList.remove("hidden");
    audio?.playShuffle?.();
    // 各席をふわっと着席させる
    seatEls().forEach((el, k) => after(120 * k, () => el.classList.add("seated")));

    // 親決め: ハイライトをぐるぐる回して起家で停止。
    const spinStart = 120 * N + 250;
    after(spinStart, spinDealer);
  }

  function spinDealer() {
    const els = seatEls();
    const order = [];
    for (let i = 0; i < N; i++) order.push((humanIndex + i) % N); // 着席スロット順に回す
    const steps = N * 3 + ((dealerIndex - humanIndex + N) % N); // 3周してから起家で止める
    let step = 0;
    const tick = () => {
      els.forEach((el) => el.classList.remove("rolling"));
      const idx = order[step % N];
      const el = els.find((e) => Number(e.dataset.index) === idx);
      el?.classList.add("rolling");
      audio?.playClick?.();
      step++;
      if (step <= steps) {
        const speed = 80 + Math.max(0, step - (steps - N)) * 55; // 終盤で減速
        after(speed, tick);
      } else {
        settleDealer();
      }
    };
    tick();
  }

  function settleDealer() {
    const els = seatEls();
    els.forEach((el) => {
      el.classList.remove("rolling");
      el.classList.toggle("dealer", Number(el.dataset.index) === dealerIndex);
    });
    const name = seated[dealerIndex].character.name;
    root.querySelector(".mi-roll-msg").textContent = `親（起家）: ${name}`;
    audio?.playNaki?.();
    after(900, callKyoku);
  }

  function callKyoku() {
    const box = root.querySelector(".mi-kyoku");
    const text = root.querySelector(".mi-kyoku-text");
    text.textContent = `${WIND_LABEL[0]}一局`; // 起家スタート＝常に東一局
    box.classList.remove("hidden");
    requestAnimationFrame(() => box.classList.add("show"));
    audio?.playShuffle?.();
    after(1200, finish);
  }

  // クリック / スキップの操作。
  // Phase A 中のクリック → Phase B へ。Phase B 中 / スキップボタン → 一気に完了。
  let phase = "versus";
  root.querySelector(".mi-skip").addEventListener("click", (e) => {
    e.stopPropagation();
    audio?.playClick?.();
    finish();
  });
  root.addEventListener("click", () => {
    if (finished) return;
    if (phase === "versus") {
      phase = "seating";
      clearTimers();
      runSeating();
    } else {
      finish();
    }
  });

  // 起動: カード（団体戦はチーム枠）をスライドインさせ、数秒後に自動で Phase B へ。
  const animTargets = isGrouped ? [...teamsBox.children] : [...cardsBox.children];
  requestAnimationFrame(() => {
    root.classList.add("ready");
    animTargets.forEach((card, k) => after(140 * k, () => card.classList.add("in")));
    after(180, () => root.querySelector(".mi-vs").classList.add("in"));
  });
  const autoToSeating = 700 + 200 * animTargets.length + 1400;
  after(autoToSeating, () => {
    if (finished || phase !== "versus") return;
    phase = "seating";
    runSeating();
  });
}
