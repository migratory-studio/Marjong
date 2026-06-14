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
function makeCode(n = 4) {
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

export function showOnlineLobby(root, { mode, characters, audio, onStart, onBack }) {
  if (root._cleanup) root._cleanup(); // 前回の開封で仕掛けたタイマーを掃除
  root.innerHTML = "";
  const timers = [];
  root._cleanup = () => { timers.forEach(clearTimeout); timers.length = 0; };

  let pickedId = null;
  let code = null; // ルーム対戦のあいことば（onStart で部屋名に使う）
  const modeLabel = mode === "room" ? "ルーム対戦" : "マッチング対戦";

  // --- header ---
  const head = elt("header", "online-head");
  head.innerHTML =
    `<button type="button" class="ghost-back online-back">← 戻る</button>` +
    `<h1>通信対戦 <span class="test-badge">テスト中</span></h1>` +
    `<div class="online-mode-label">${modeLabel}</div>`;
  root.appendChild(head);
  head.querySelector(".online-back").onclick = () => { audio?.playClick?.(); root._cleanup(); onBack(); };

  const note = elt("p", "online-note");
  note.textContent = mode === "room"
    ? "※ 同じあいことばの相手と同卓します。最大30秒待っても揃わなければ空席に CPU が入ります。"
    : "※ 開始すると相手を探します。最大30秒待っても揃わなければ空席に CPU が入ります。";
  root.appendChild(note);

  const body = elt("div", "online-body");
  root.appendChild(body);

  // --- 左：卓の状況（合言葉 or マッチング ＋ 4席の埋まり） ---
  const left = elt("div", "online-col online-col-left");
  body.appendChild(left);

  if (mode === "room") {
    code = makeCode(4);
    const codeBox = elt("div", "online-codebox");
    codeBox.innerHTML =
      `<div class="online-codebox-k">あいことば</div>` +
      `<div class="online-code">${code}</div>` +
      `<div class="online-codebox-sub">この合言葉を相手に伝えて招待（同じ合言葉で同卓）</div>`;
    left.appendChild(codeBox);
  } else {
    const mm = elt("div", "online-mm");
    mm.innerHTML =
      `<div class="online-mm-title">準備ができたら「対局開始」<span class="online-dots"></span></div>` +
      `<div class="online-mm-sub">開始後、対戦相手を探します</div>`;
    left.appendChild(mm);
  }

  const tableHead = elt("div", "online-table-head", { textContent: "卓（4人）" });
  left.appendChild(tableHead);
  const seatList = elt("div", "online-seats");
  left.appendChild(seatList);
  const seatEls = [];
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
      seatEls[0].st.textContent = c.name;
      seatEls[0].st.className = "online-seat-state is-you";
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
