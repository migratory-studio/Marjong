// 通信対戦ロビー（テスト中）。
//
// ルーム対戦 / マッチング対戦の入口UI。現段階はサーバ未接続のテスト版で、空席は CPU で補填する
// （マッチング不成立＝タイムアウト → CPU）。対局自体は通常の CPU 対戦として起動する（onStart）。
// 本物の通信スタック(AuthorityRoom/ClientSession・ループバック/WebSocket)への差し替えは次段(L4c)。
//
// showOnlineLobby(root, { mode, characters, audio, onStart, onBack })
//   mode: "room" | "match"
//   onStart({ charId, mode }) … 対局開始（main.js が CPU 補填で beginGame まで運ぶ）
//   onBack() … 通信対戦の入口（モード選択）へ戻る

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい 0/O・1/I を除外
export function makeCode(n = 4) {
  // UI 表示用の合言葉。決定論は不要（牌山seed等とは無関係）。
  let s = "";
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function elt(tag, cls, props = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e, props);
  return e;
}

// マッチング対戦ロビーの戦績パネル。段位/RP（プロフィール）＋オンライン専用戦績（対局数/トップ率/
// 平均着順＝online_results集計）＋よく使う相棒（卓表示の代わり）。
function buildStatsPanel(stats) {
  const box = elt("div", "online-stats");
  const s = stats || {};
  const rpText = s.rankAtMax ? `RP ${s.tierRp ?? 0}` : `RP ${s.tierRp ?? 0} / ${s.rankNext ?? "?"}`;
  const o = s.online; // null=未ログイン/未取得 / {games:0}=記録なし
  const games = o?.games ?? 0;
  const topRate = (o && games) ? `${Math.round(o.firstRate * 100)}%` : "—";
  const avgRank = (o && games) ? o.avgRank.toFixed(2) : "—";
  box.innerHTML = `
    <div class="online-stats-head">あなたのオンライン戦績</div>
    <div class="ost-rank">
      <div class="ost-dan"><b>${s.rankTitle || "—"}</b><small>${s.rankKana || ""}</small></div>
      <div class="ost-gauge">
        <div class="ost-bar hpbar"><div class="hpfill high" style="width:${s.rankPct ?? 0}%"></div></div>
        <div class="ost-rp">${rpText}</div>
      </div>
    </div>
    <div class="ost-grid ost-grid-3">
      <div class="ost-cell"><span class="ost-k">対局数</span><span class="ost-v">${games}</span></div>
      <div class="ost-cell"><span class="ost-k">トップ率</span><span class="ost-v">${topRate}</span></div>
      <div class="ost-cell"><span class="ost-k">平均着順</span><span class="ost-v">${avgRank}</span></div>
    </div>
    <div class="ost-buddy">
      <span class="ost-k">よく使う相棒</span>
      <span class="ost-buddy-v"></span>
    </div>`;
  const bv = box.querySelector(".ost-buddy-v");
  if (s.oshi) {
    const ic = s.oshi.icon
      ? elt("img", "ost-buddy-icon", { src: s.oshi.icon, alt: "" })
      : elt("span", "ost-buddy-icon ost-buddy-fb");
    if (!s.oshi.icon) ic.style.background = s.oshi.color || "#2a3f34";
    const nm = elt("span", "ost-buddy-name", { textContent: s.oshi.name });
    bv.append(ic, nm);
  } else {
    bv.appendChild(elt("span", "ost-buddy-none", { textContent: "まだいないよ" }));
  }
  return box;
}

function makeIcon(c) {
  const path = c.assets?.icon;
  if (path) {
    const img = elt("img", "olc-icon", { src: path, alt: c.name });
    img.onerror = () => {
      const fb = elt("div", "olc-icon olc-icon-fb");
      fb.style.background = c.color || "#2a3f34";
      img.replaceWith(fb);
    };
    return img;
  }
  const fb = elt("div", "olc-icon olc-icon-fb");
  fb.style.background = c.color || "#2a3f34";
  return fb;
}

export function showOnlineLobby(root, { mode, characters, audio, onStart, onBack, joinCode = null, stats = null }) {
  if (root._cleanup) root._cleanup(); // 前回の開封で仕掛けたタイマーを掃除
  root.innerHTML = "";
  const timers = [];
  root._cleanup = () => { timers.forEach(clearTimeout); timers.length = 0; };

  let pickedId = null;
  const isRoom = mode === "room";
  const isJoin = isRoom && !!joinCode; // 合言葉で「参加」する側（ホストはコード発行）
  let code = null; // ルーム対戦のあいことば（onStart で部屋名に使う）
  const modeLabel = !isRoom ? "マッチング対戦" : isJoin ? "合言葉で参加" : "ルーム対戦";

  // --- header ---
  const head = elt("header", "online-head");
  head.innerHTML =
    `<button type="button" class="ghost-back online-back">← 戻る</button>` +
    `<h1>通信対戦 <span class="test-badge">テスト中</span></h1>` +
    `<div class="online-mode-label">${modeLabel}</div>`;
  root.appendChild(head);
  head.querySelector(".online-back").onclick = () => { audio?.playClick?.(); root._cleanup(); onBack(); };

  const note = elt("p", "online-note");
  note.textContent = isRoom
    ? "※ 同じあいことばの相手と同卓します。最大30秒待っても揃わなければ空席に CPU が入ります。"
    : "※ 開始すると相手を探します。最大30秒待っても揃わなければ空席に CPU が入ります。";
  root.appendChild(note);

  const body = elt("div", "online-body");
  root.appendChild(body);

  // --- 左カラム: ルーム=合言葉＋卓 / マッチング=戦績（卓表示はマッチング中と誤解されるため出さない） ---
  const left = elt("div", "online-col online-col-left");
  body.appendChild(left);
  const seatEls = []; // ルーム時のみ作る（参照は ?. でガード）

  if (isRoom) {
    code = joinCode || makeCode(4);
    const codeBox = elt("div", "online-codebox");
    codeBox.innerHTML =
      `<div class="online-codebox-k">あいことば</div>` +
      `<div class="online-code">${code}</div>` +
      `<div class="online-codebox-sub">${isJoin ? "この合言葉のルームに入ります" : "この合言葉を相手に伝えて招待（同じ合言葉で同卓）"}</div>`;
    left.appendChild(codeBox);

    const tableHead = elt("div", "online-table-head", { textContent: "卓（4人）" });
    left.appendChild(tableHead);
    const seatList = elt("div", "online-seats");
    left.appendChild(seatList);
    for (let i = 0; i < 4; i++) {
      const row = elt("div", "online-seat");
      const who = elt("span", "online-seat-who", { textContent: i === 0 ? "あなた" : `席 ${i + 1}` });
      const st = elt("span", "online-seat-state");
      if (i === 0) { st.textContent = "雀士を選択"; st.className = "online-seat-state is-you"; }
      else { st.textContent = "開始後に相手 / CPU"; }
      row.append(who, st);
      seatList.appendChild(row);
      seatEls.push({ row, who, st });
    }
  } else {
    const mm = elt("div", "online-mm");
    mm.innerHTML =
      `<div class="online-mm-title">準備ができたら「対局開始」<span class="online-dots"></span></div>` +
      `<div class="online-mm-sub">開始後、対戦相手を探します</div>`;
    left.appendChild(mm);
    left.appendChild(buildStatsPanel(stats)); // 戦績パネル
  }

  // --- 右：自分の雀士を選ぶ ---
  const right = elt("div", "online-col online-col-right");
  body.appendChild(right);
  right.appendChild(elt("div", "online-pick-head", { textContent: "あなたの雀士を選ぶ" }));
  const grid = elt("div", "online-char-grid");
  right.appendChild(grid);
  const cardById = new Map();
  for (const c of characters) {
    const card = elt("button", "olc-card", { type: "button" });
    card.style.setProperty("--role", c.color || "#f6b352");
    card.appendChild(makeIcon(c));
    card.appendChild(elt("span", "olc-name", { textContent: c.name }));
    card.onclick = () => {
      audio?.playClick?.();
      pickedId = c.id;
      for (const [, el2] of cardById) el2.classList.remove("is-picked");
      card.classList.add("is-picked");
      if (seatEls[0]) { seatEls[0].st.textContent = c.name; seatEls[0].st.className = "online-seat-state is-you"; } // 卓表示はルーム時のみ
      updateStart();
    };
    cardById.set(c.id, card);
    grid.appendChild(card);
  }

  // --- footer ---
  const footer = elt("div", "online-foot");
  const startBtn = elt("button", "primary online-start", { type: "button", textContent: "対局開始", disabled: true });
  footer.appendChild(startBtn);
  root.appendChild(footer);

  // 雀士を選べば開始可能。実際の相手探し（最大30秒待ち→空席CPU補填）は開始後にサーバ側で行う。
  const updateStart = () => { startBtn.disabled = !pickedId; };
  startBtn.onclick = () => {
    if (startBtn.disabled) return;
    audio?.playClick?.();
    root._cleanup();
    onStart({ charId: pickedId, mode, code });
  };
}

// ルーム対戦の「リアルタイム待合室」。入室と同時にWS接続し、サーバの evt.lobby で 4 枠を随時更新する。
// 席0（最上）=自分、以下=入室順。ホスト（最小indexの人間）だけが空き枠の CPU 化／対局開始を操作できる。
// 戻り値 { update(lobbyState) } を main 側が evt.lobby のたびに呼ぶ。
//   showRoomLobby(root, { code, isJoin, characters, audio, onSetChar, onSlot, onStart, onBack })
//     onSetChar(charId) … 待合室で雀士を変更（サーバへ intent.lobbySetChar）
//     onSlot(seat, "cpu"|"open") … 空き枠を CPU 化／解除（ホストのみ・intent.lobbySlot）
//     onStart() … 残り空き枠を CPU 補填して開始（ホストのみ・intent.lobbyStart）
export function showRoomLobby(root, { code, isJoin, characters, audio, onSetChar, onSlot, onStart, onBack }) {
  root.innerHTML = "";

  const head = elt("header", "online-head");
  head.innerHTML =
    `<button type="button" class="ghost-back online-back">← 戻る</button>` +
    `<h1>通信対戦 <span class="test-badge">テスト中</span></h1>` +
    `<div class="online-mode-label">${isJoin ? "合言葉で参加" : "ルーム対戦"}</div>`;
  root.appendChild(head);
  head.querySelector(".online-back").onclick = () => { audio?.playClick?.(); onBack(); };

  const note = elt("p", "online-note");
  note.textContent = "※ 同じあいことばの相手が入室すると下に表示されます。ホストが「対局開始」を押すと、空き枠は CPU で埋めて始まります。";
  root.appendChild(note);

  const body = elt("div", "online-body");
  root.appendChild(body);

  // 左: 合言葉＋4枠（人間/CPU/空き）。
  const left = elt("div", "online-col online-col-left");
  body.appendChild(left);
  const codeBox = elt("div", "online-codebox");
  codeBox.innerHTML =
    `<div class="online-codebox-k">あいことば</div>` +
    `<div class="online-code">${code}</div>` +
    `<div class="online-codebox-sub">${isJoin ? "このルームに入りました" : "この合言葉を相手に伝えて招待（同じ合言葉で同卓）"}</div>`;
  left.appendChild(codeBox);
  left.appendChild(elt("div", "online-table-head", { textContent: "卓（4人）" }));
  const seatList = elt("div", "online-seats");
  left.appendChild(seatList);

  // 右: 自分の雀士を選ぶ（待合室中はいつでも変更可・選択は随時共有）。
  const right = elt("div", "online-col online-col-right");
  body.appendChild(right);
  right.appendChild(elt("div", "online-pick-head", { textContent: "あなたの雀士を選ぶ" }));
  const grid = elt("div", "online-char-grid");
  right.appendChild(grid);
  const cardById = new Map();
  for (const c of characters) {
    const card = elt("button", "olc-card", { type: "button" });
    card.style.setProperty("--role", c.color || "#f6b352");
    card.appendChild(makeIcon(c));
    card.appendChild(elt("span", "olc-name", { textContent: c.name }));
    card.onclick = () => { audio?.playClick?.(); onSetChar(c.id); };
    cardById.set(c.id, card);
    grid.appendChild(card);
  }

  // フッタ: ホスト=対局開始 / 非ホスト=開始待ち。
  const footer = elt("div", "online-foot");
  const waitLabel = elt("div", "online-wait-label", { textContent: "ホストの開始を待っています…" });
  const startBtn = elt("button", "primary online-start", { type: "button", textContent: "対局開始" });
  footer.append(waitLabel, startBtn);
  root.appendChild(footer);
  startBtn.onclick = () => { audio?.playClick?.(); onStart(); };

  const charName = (id) => { const c = characters.find((x) => x.id === id); return c ? c.name : "（選択中）"; };

  function renderSlots(state) {
    const { members = [], hostSeat = -1, yourSeat = -1 } = state || {};
    const isHost = yourSeat >= 0 && yourSeat === hostSeat;
    seatList.innerHTML = "";
    for (const m of members) {
      const row = elt("div", "online-seat");
      const who = elt("span", "online-seat-who");
      const st = elt("span", "online-seat-state");
      if (m.kind === "human") {
        const you = m.seat === yourSeat;
        who.textContent = `${m.name || "名無し"}${you ? "（あなた）" : ""}${m.seat === hostSeat ? " ★ホスト" : ""}`;
        st.textContent = charName(m.charId);
        if (you) st.classList.add("is-you");
      } else if (m.kind === "cpu") {
        who.textContent = "CPU";
        if (isHost) {
          const b = elt("button", "online-slot-btn", { type: "button", textContent: "空ける" });
          b.onclick = () => { audio?.playClick?.(); onSlot(m.seat, "open"); };
          st.appendChild(b);
        } else { st.textContent = "コンピュータ"; }
      } else { // open
        who.textContent = "空き";
        if (isHost) {
          const b = elt("button", "online-slot-btn", { type: "button", textContent: "CPUにする" });
          b.onclick = () => { audio?.playClick?.(); onSlot(m.seat, "cpu"); };
          st.appendChild(b);
        } else { st.textContent = "入室待ち"; }
      }
      row.append(who, st);
      seatList.appendChild(row);
    }
    waitLabel.style.display = isHost ? "none" : "";
    startBtn.style.display = isHost ? "" : "none";
    const myChar = (members.find((m) => m.seat === yourSeat) || {}).charId;
    for (const [id, card] of cardById) card.classList.toggle("is-picked", id === myChar);
  }

  // 初期は接続中（evt.lobby 未着）。
  seatList.appendChild(elt("div", "online-seat online-seat-connecting", { textContent: "接続中…" }));
  waitLabel.style.display = "";
  startBtn.style.display = "none";

  return { update: (state) => renderSlots(state) };
}
