// Canvas renderer for the table. Pure drawing + hitbox bookkeeping; it never
// mutates game state. The controller reads `handHitboxes` to map clicks to tiles.
import { kindLabel, rankOf, suitOf, isHonor, SUITS } from "../core/tiles.js";
import { Phase } from "../core/game.js";
import { MeldType } from "../core/meld.js";

const TILE_W = 38;
const TILE_H = 52;
const SMALL = 0.62;
// 自分の手牌だけ拡大して見やすくする倍率（牌サイズ・間隔・当たり判定すべてに適用）。
// スマホでもタップしやすいよう大きめに。門前14牌でも横幅は卓内(≈900/960px)に収まる上限。
const HAND_SCALE = 1.5;
// 河の牌。捨て牌の読みが麻雀の半分なので、手牌の約半分まで大きくする（旧 SMALL=0.62 は
// 手牌の0.4倍で読みにくかった）。中央の方位盤を正方形に絞ったぶんの外周に収まる大きさ。
const RIVER_SCALE = 0.72;
// 自分の副露は手牌と同じ行の右端に、手牌に近い大きさで並べる（右下の操作ボタンと重ねない）。
const SELF_MELD_SCALE = 1.0;
// 卓中央の方位盤（正方形）の半辺・リーチ棒の位置・河の開始位置（いずれも中心からの距離）。
// 旧来の横長パネル(300×140)は上家・下家の河とリーチ棒に重なっていた。
const CENTER_HALF = 72;
const STICK_Y = 80;
const RIVER_Y = 88;
// 対面の手牌の上端。河を大きくしたぶん、河3段目と重ならない高さへ上げる。
const TOP_HAND_Y = 110;
const WIND_CHAR = { 27: "東", 28: "南", 29: "西", 30: "北" };

// 自分の手番(打牌待ち)で「押せる牌」を一段持ち上げて受け皿の光を敷く量。
// 「今ここを押す」という手がかりを、打てない局面との見た目差で作る（当たり判定も同量ずらす）。
const PICK_LIFT = 8;        // 打てる牌の通常リフト
const PICK_HOVER_LIFT = 16; // ホバー中の牌はさらに持ち上げて選択候補を明示

// ── 卓を囲む（2.5D卓）──────────────────────────────────────────────────────
// 卓の面（河・山・相手の手牌・方位盤）だけを奥へ傾け、自分の手牌は平らなまま手前に置く。
// 傾きは CSS（main.js が #table-plane に当てる）で、ここはその写像（canvas 座標どうし）を持つ。
// 値はすべて canvas 座標（960×720）: 傾き角・視点距離・回転軸の高さ（手牌の下端あたり）。
export const TILT = { deg: 24, perspective: 1227, originY: 707 };

// 傾けて空いた卓の奥に、対戦相手を座らせる（立ち絵＝相棒ボードと同じ切り抜きの縮小）。
// すべて平らな手牌キャンバス（#table）の座標。席: 1=下家(右奥) / 2=対面(奥) / 3=上家(左奥)。
//   busts  … 立ち絵の枠（左上と幅。高さは相棒ボードの立ち絵と同じ縦横比で決まる）
//   plates … 名札（ネームプレート）の中心。卓の奥の縁＝その人の手前に置く
//   fx     … ポン/リーチの席テロップ・±N を出す位置（顔の少し下）
export const SEATED_LAYOUT = {
  busts: {
    1: { x: 746, y: 60, w: 200 },
    2: { x: 373, y: -22, w: 214 },
    3: { x: -12, y: 72, w: 214 },
  },
  plates: { 1: [815, 262], 2: [480, 200], 3: [130, 262] },
  fx: { 1: { x: 830, y: 176 }, 2: { x: 480, y: 150 }, 3: { x: 130, y: 196 } },
};

const SUIT_COLOR = {
  [SUITS.MAN]: "#b5341f",
  [SUITS.PIN]: "#1f5fb5",
  [SUITS.SOU]: "#1f7a3a",
  [SUITS.HONOR]: "#3a2b55",
};

// 危険感知（マモリ）の3段階表示。キーは danger-sense が返す level。
// 3=超危険(赤) / 2=危険(オレンジ) / 1=警戒(黄)。
const DANGER_STYLES = {
  3: { fill: "rgba(232,40,60,0.62)", mark: "#7a0010", label: "!!" },
  2: { fill: "rgba(240,140,30,0.55)", mark: "#7a3a00", label: "!" },
  1: { fill: "rgba(235,200,40,0.50)", mark: "#6b5500", label: "?" },
};

export class CanvasRenderer {
  // fieldCanvas（任意）を渡すと「卓を囲む」配置になる: 卓の面はそちらへ描き（CSS で奥へ傾く）、
  // canvas には自分の手牌と相手の名札だけを平らに描く。当たり判定は canvas の座標のまま。
  constructor(canvas, game, humanIndex, tileImages = null, charImages = null, fieldCanvas = null) {
    this.canvas = canvas;
    this.handCtx = canvas.getContext("2d");
    this.fieldCtx = fieldCanvas ? fieldCanvas.getContext("2d") : this.handCtx;
    this.seated = !!fieldCanvas;
    this.tilt = this.seated ? TILT : null;
    this.ctx = this.handCtx;
    this._fieldPass = false; // 卓の面を描いている間だけ true（牌に厚みと落ち影を付ける）
    this.game = game;
    this.humanIndex = humanIndex;
    this.tileImages = tileImages; // optional TileImages; falls back to procedural
    this.charImages = charImages; // optional CharacterImages; falls back to colored disc
    this.handHitboxes = []; // [{tileId, kind, x,y,w,h, enabled}]
    this.riverHitboxes = []; // [{tileId, x,y,w,h}] — the human's OWN river (for リコール選択)
    this.hover = null; // {x, y, waits:[kind...]} for the wait tooltip
    this.hoverTileId = null; // 自分の手牌でホバー中の牌id（リフト強調用）。null=なし。
    this.selectedTileId = null; // 2タップ打牌で選択中(浮かせている)の牌id。null=未選択。
    this.showHandCoach = false; // 初回オンボーディング: 手牌を指すコーチマークを出すか。
    this._humanHandBox = null; // 直近に描いた自分の手牌の外接矩形（コーチマークの矢印位置に使う）。
    this.thinkingSeat = null; // 通信対戦: 長考中の席（「⏳ 長考中」バッジ対象）。null=なし。
    // 局が終わってから次の局が始まるまでは、エンジンの局番号が先に進んでいる（_endHand）。
    // その間は main.js が「終わった局」の表示を渡し、方位盤がそれを出す。null=現在の局。
    this.roundInfo = null; // { label, honba, kyotaku }
    // 方位盤の中の目印（演出の座標に使う。canvas 座標）。_drawCenterInfo が毎回更新する。
    this.anchors = { wall: { x: canvas.width / 2, y: canvas.height / 2 - 14 }, dora: { x: canvas.width / 2, y: canvas.height / 2 + 26 } };
    this.W = canvas.width;
    this.H = canvas.height;

    // リーチ棒は素材を使わず Canvas で直接描く（_riichiStick）。点棒=HP のゲージは
    // 右サイドの相棒ボードに集約済みで、卓上にはHPバーを描かない。
  }

  setHighlights({ riichiMode = false, riichiKinds = null, danger = null, recallMode = false, best = null, deadKinds = null, recalled = null } = {}) {
    this.riichiMode = riichiMode;
    this.riichiKinds = riichiKinds;
    this.danger = danger; // Map kind -> level
    this.recallMode = recallMode; // リコール・ディール: 自分の河の牌を選択中
    this.best = best; // 模範解答: Map kind -> rank(1..3)。null=非表示
    // ゼロ・リサーチ（ルクス）の「該当なし」告知中だけ立つ Set<kind>。全員の河の該当牌を
    // シアンで囲み、「その牌はもう場に出切っている」ことを目に見える証明として示す。
    this.deadKinds = deadKinds;
    // リコール・ディール（エージェント・RE）で河から手に戻した牌の id（Set<tileId>）。
    // 一度手放した牌＝取引材料であることを、局のあいだ手牌に印として残す。
    this.recalled = recalled;
  }

  render() {
    this.handCtx.clearRect(0, 0, this.W, this.H);
    if (this.fieldCtx !== this.handCtx) this.fieldCtx.clearRect(0, 0, this.W, this.H);
    this.handHitboxes = [];
    this.riverHitboxes = [];

    // Map each player (by turn-order offset from the human) to a visual seat slot:
    //   4p: offset 0,1,2,3 -> seat 0(bottom),1(right),2(top),3(left)
    //   3p: offset 0,1,2   -> seat 0(bottom),1(right),3(left)  (no top seat)
    const N = this.game.numPlayers;
    const slots = this._seatSlots(N);
    const seats = [];
    for (let offset = 0; offset < N; offset++) seats.push([(this.humanIndex + offset) % N, slots[offset]]);

    // 卓の面（傾く層）: 方位盤・相手の手牌と鳴き・全員の河・自分の名札。
    this.ctx = this.fieldCtx;
    this._fieldPass = this.seated;
    this._drawCenterInfo();
    for (const [pIndex, seat] of seats) {
      if (seat === 0 || !this.seated) this._namePlate(this.game.players[pIndex], seat);
      if (seat !== 0) {
        this._drawOpponentHand(this.game.players[pIndex], seat);
        this._drawMelds(this.game.players[pIndex], seat);
      }
      this._drawRiver(pIndex, seat);
    }

    // 手前の層（平ら）: 自分の手牌、着席配置なら相手の名札（卓の奥の縁＝その人の手前）。
    this.ctx = this.handCtx;
    this._fieldPass = false;
    this._drawHumanHand(this.game.players[this.humanIndex]); // 自分の副露も手牌の行に並べて描く
    if (this.seated) {
      for (const [pIndex, seat] of seats) if (seat !== 0) this._namePlate(this.game.players[pIndex], seat);
    }
    this._drawHandCoach();
    this._drawWaitTooltip();
  }

  // 傾いた卓の面の点（field canvas 座標）→ 画面上の位置（平らな #table の canvas 座標）。
  // CSS の transform: perspective(P) rotateX(deg)（原点＝卓の中央・手牌の下端あたり）と同じ写像。
  fieldToFlat(x, y) {
    const t = this.tilt;
    if (!t || !t.deg) return { x, y };
    const a = (t.deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const ox = this.W / 2, oy = t.originY, P = t.perspective;
    const X = x - ox, Y = y - oy;
    const w = 1 - (Y * s) / P;
    return { x: ox + X / w, y: oy + (Y * c) / w };
  }

  // 逆写像：画面上の位置（#table の canvas 座標）→ 傾いた卓の面の点。河のクリック判定に使う。
  flatToField(x, y) {
    const t = this.tilt;
    if (!t || !t.deg) return { x, y };
    const a = (t.deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const ox = this.W / 2, oy = t.originY, P = t.perspective;
    const Xs = x - ox, Ys = y - oy;
    const Y = Ys / (c + (Ys * s) / P);
    const w = 1 - (Y * s) / P;
    return { x: ox + Xs * w, y: oy + Y };
  }

  // 初回オンボーディング: 自分の打牌待ちのとき、手牌を指す一回限りのコーチマーク。
  // canvas 座標で描くのでステージ縮小・回転に追従し、手牌と必ず一致する。
  _drawHandCoach() {
    if (!this.showHandCoach) return;
    if (this.game.phase !== Phase.AWAIT_DISCARD || this.game.turn !== this.humanIndex) return;
    const box = this._humanHandBox;
    if (!box) return;
    const ctx = this.ctx;
    const cx = box.x + box.w / 2;
    const label = "牌をタップ → もう一度で打牌";
    ctx.save();
    ctx.font = "bold 16px sans-serif";
    const tw = ctx.measureText(label).width;
    const pad = 14, boxW = tw + pad * 2, boxH = 32;
    let bx = cx - boxW / 2;
    bx = Math.max(8, Math.min(this.W - boxW - 8, bx));
    const by = box.y - boxH - 26; // 手牌の少し上に浮かせる
    // ピル
    ctx.fillStyle = "rgba(20,32,25,0.96)";
    ctx.strokeStyle = "#f6b352"; ctx.lineWidth = 2;
    roundRect(ctx, bx, by, boxW, boxH, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffe9b8";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, bx + boxW / 2, by + boxH / 2 + 1);
    // 手牌を指す下向き矢印
    const ax = Math.max(bx + 16, Math.min(bx + boxW - 16, cx));
    ctx.fillStyle = "#f6b352";
    ctx.beginPath();
    ctx.moveTo(ax - 9, by + boxH);
    ctx.lineTo(ax + 9, by + boxH);
    ctx.lineTo(ax, by + boxH + 13);
    ctx.closePath(); ctx.fill();
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Show the waiting tiles for a hovered discard (caller supplies waits via
  // setHover). Drawn last so it floats above everything.
  _drawWaitTooltip() {
    const h = this.hover;
    if (!h || !h.waits || h.waits.length === 0) return;
    const ctx = this.ctx;
    const scale = 0.55;
    const tw = TILE_W * scale, th = TILE_H * scale;
    const pad = 8, gap = 3, labelH = 16;
    const boxW = Math.max(h.waits.length * (tw + gap) - gap, 56) + pad * 2;
    const boxH = th + labelH + pad * 2;
    // position above the hovered point, clamped to canvas
    let bx = h.x - boxW / 2;
    let by = h.y - boxH - 14;
    bx = Math.max(6, Math.min(this.W - boxW - 6, bx));
    by = Math.max(6, by);

    ctx.save();
    ctx.fillStyle = "rgba(20,32,25,0.95)";
    ctx.strokeStyle = "#f6b352"; ctx.lineWidth = 2;
    roundRect(ctx, bx, by, boxW, boxH, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f6b352";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("待ち", bx + pad, by + 12);
    let tx = bx + pad;
    const ty = by + pad + labelH - 2;
    for (const k of h.waits) {
      this._tile(tx, ty, k, { scale });
      tx += tw + gap;
    }
    ctx.restore();
  }

  setHover(hover) { this.hover = hover; }

  // Turn-order offset -> visual seat slot. Shared by the controller's FX helpers.
  //   2p (二人麻雀): self bottom, opponent facing across the top
  //   3p (sanma):    no top seat
  _seatSlots(n) {
    if (n === 2) return [0, 2];
    return n === 3 ? [0, 1, 3] : [0, 1, 2, 3];
  }

  // 卓中央の方位盤。正方形に絞り（河とリーチ棒をその外側に置ける）、各辺にその席の自風を
  // その席から読める向きで書く。いま打牌する席の辺を光らせて「誰の番か」を示す。
  _drawCenterInfo() {
    const ctx = this.ctx;
    const cx = this.W / 2, cy = this.H / 2, h = CENTER_HALF;
    const info = this.roundInfo || { label: this.game.roundLabel(), honba: this.game.honba, kyotaku: this.game.kyotaku };

    ctx.save();
    const bg = ctx.createLinearGradient(cx, cy - h, cx, cy + h);
    bg.addColorStop(0, "#1b4634");
    bg.addColorStop(1, "#11301f");
    ctx.fillStyle = bg;
    roundRect(ctx, cx - h, cy - h, h * 2, h * 2, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(240, 206, 140, 0.30)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 各席の自風＋手番の灯り。席の向きに回した局所フレームで描く（河と同じ慣習）。
    const N = this.game.numPlayers;
    const slots = this._seatSlots(N);
    const turnIdx = this.game.phase === Phase.AWAIT_DISCARD ? this.game.turn : null;
    for (let offset = 0; offset < N; offset++) {
      const pIndex = (this.humanIndex + offset) % N;
      const p = this.game.players[pIndex];
      const seat = slots[offset];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-seat * Math.PI / 2);
      if (turnIdx === pIndex) {
        ctx.save();
        ctx.shadowColor = p.character.color || "#f6d24a";
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.character.color || "#f6d24a";
        roundRect(ctx, -44, h - 7, 88, 4, 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = p.isDealer ? "#f2b45a" : "#a9c4b6";
      ctx.fillText(WIND_CHAR[p.seatWind] || "", 0, h - 14);
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f3e6c4";
    ctx.font = "bold 17px sans-serif";
    ctx.fillText(info.label, cx, cy - 27);
    ctx.fillStyle = "#cfe0d6";
    ctx.font = "12px sans-serif";
    ctx.fillText(`残り ${this.game.wall.liveRemaining}`, cx, cy - 11);
    const subs = [];
    if (info.honba > 0) subs.push(`${info.honba}本場`);
    if (info.kyotaku > 0) subs.push(`供託 ${info.kyotaku}`);
    if (subs.length) {
      ctx.fillStyle = "#e8c98a";
      ctx.font = "11px sans-serif";
      ctx.fillText(subs.join(" · "), cx, cy + 3);
    }
    ctx.restore();

    // ドラ表示牌。槓ドラで4枚以上になったら縮めて方位盤に収める。
    const dora = this.game.wall.doraIndicators();
    const ds = dora.length >= 4 ? 0.5 : SMALL;
    const dw = TILE_W * ds, gap = 3;
    const startX = cx - (dora.length * (dw + gap) - gap) / 2;
    const dy = cy + 9;
    dora.forEach((t, i) => {
      this._tile(startX + i * (dw + gap), dy, t.kind, { scale: ds });
    });
    this.anchors = { wall: { x: cx, y: cy - 15 }, dora: { x: cx, y: dy + (TILE_H * ds) / 2 } };
  }

  _namePlate(p, seat) {
    const ctx = this.ctx;
    let x, y;
    const positions = {
      0: [this.W / 2, this.H - 132],
      1: [this.W - 210, this.H / 2 + 120],
      2: [this.W / 2, 78],
      3: [210, this.H / 2 - 120],
    };
    // 着席配置では相手の名札を立ち絵の手前（卓の奥の縁）へ。立ち絵が顔を出すので丸アイコンは描かない。
    const seatedPlate = this.seated && seat !== 0;
    [x, y] = seatedPlate ? SEATED_LAYOUT.plates[seat] : positions[seat];
    ctx.textAlign = "center";
    const isTurn = this.game.turn === p.index && this.game.phase === Phase.AWAIT_DISCARD;
    // 手動発動能力が発動中のプレイヤーは、プレートを能力カラーで光らせて一目で分かるようにする。
    const activeAbility = (p.abilities || []).find((a) => a.activation === "manual" && a.active);
    const ABILITY_GLOW = "#c9a0ff";
    // plate — HP(点棒)は右サイドの相棒ボードに集約したので、ここは名前＋状態のみ。
    // 高さを詰めたプレートに名前を縦中央で置き、リーチ/北だけ下に出す。
    ctx.save();
    if (activeAbility) { ctx.shadowColor = ABILITY_GLOW; ctx.shadowBlur = 20; }
    ctx.fillStyle = activeAbility ? "#33265a" : (isTurn ? "#244b39" : "#1a2c23");
    roundRect(ctx, x - 90, y - 18, 180, 36, 8);
    ctx.fill();
    ctx.restore();
    if (activeAbility) {
      ctx.strokeStyle = ABILITY_GLOW; ctx.lineWidth = 2.5;
      roundRect(ctx, x - 90, y - 18, 180, 36, 8); ctx.stroke();
    } else if (isTurn) {
      ctx.strokeStyle = p.character.color; ctx.lineWidth = 2;
      roundRect(ctx, x - 90, y - 18, 180, 36, 8); ctx.stroke();
    }

    // 自席のバッジは卓に描かない（プレートの真上は自分の河の3段目と重なる）。自分の能力の
    // 状態は右サイドの立ち絵の常設バッジ・能力欄が受け持つ。プレートの発光だけは残す。
    if (seat === 0) { /* no badge */ }
    // 発動中バッジ：プレート上に「⚡発動中 能力名」をピル型で出す。
    else if (activeAbility) this._abilityBadge(x, y - 18 - 8, activeAbility.name, ABILITY_GLOW);
    // 通信対戦: この席が長考中（手番開始から一定時間動きなし）なら「⏳ 長考中」をプレート上に出す。
    // 能力発動中バッジとは排他（同じ位置）。動き出し（打牌）でホスト側がクリアする。
    else if (this.thinkingSeat === p.index) this._thinkingBadge(x, y - 18 - 8);
    // 常時(パッシブ)能力は全席のプレート上に「常時 能力名」を出す（全体出し）。
    // 盾系（uiState の meter）はここで残数 ●○ も描き、卓全体で盾の有無が読める。
    else {
      const passive = (p.abilities || []).find((a) => a.activation === "passive");
      if (passive) {
        let meter = null, statusKind = null;
        try {
          const ui = typeof passive.uiState === "function" ? passive.uiState() : null;
          if (ui && ui.meter) { meter = ui.meter; statusKind = ui.status; }
        } catch { /* uiState が api 必須なら表示なしで握りつぶす */ }
        this._passiveBadge(x, y - 18 - 8, passive.name, meter, statusKind);
      }
    }

    // Character icon just left of the plate (real art if present, else a colored disc).
    if (!seatedPlate) this._seatIcon(p, x - 90 - 22, y, 18, isTurn);

    const windName = { 27: "東", 28: "南", 29: "西", 30: "北" }[p.seatWind];
    // 卓上ネームプレートは「プレイヤーの名前」。通信対戦では seatLabels[席]=ユーザー名を出す
    // （CPU席や非オンラインは未設定→キャラ名にフォールバック）。HPゲージ側はキャラ名のまま。
    const plateName = this.seatLabels?.[p.index] ?? p.character.name;
    ctx.fillStyle = p.character.color;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`${windName} ${plateName}${p.isDealer ? "(親)" : ""}`, x, y + 5);

    // リーチ／北抜きの状態行。ふだんはプレートの下。着席配置の左右の席は、プレートの真下が
    // その人の手牌の列の頭なので、卓の内側（プレートの横）に縦へ積む。
    const side = seatedPlate && (seat === 1 || seat === 3);
    const sx = side ? (seat === 3 ? x + 98 : x - 98) : x;
    const sy = (row) => (side ? y - 2 + row * 15 : y + 32 + row * 14);
    if (side) ctx.textAlign = seat === 3 ? "left" : "right";
    if (p.riichi) {
      ctx.fillStyle = "#f0d264";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("● リーチ", sx, sy(0));
    }

    // 北抜き (sanma nuki-dora) count, shown opposite the riichi indicator row.
    if (p.kita && p.kita.length > 0) {
      ctx.fillStyle = "#7fd1ff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`北 ×${p.kita.length}`, sx, sy(p.riichi ? 1 : 0));
    }
    ctx.textAlign = "center";
  }

  // 能力発動中バッジ。ネームプレートの上に「⚡ 能力名」をピル型＋発光で出す。
  // cx=プレート中央x / bottomY=バッジ下端の基準y。
  _abilityBadge(cx, bottomY, name, color) {
    const ctx = this.ctx;
    const label = `⚡ ${name}`;
    ctx.save();
    ctx.font = "bold 12px sans-serif";
    const padX = 9, h = 20;
    const w = ctx.measureText(label).width + padX * 2;
    const bx = cx - w / 2, by = bottomY - h;
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.fillStyle = "#2a1f4a";
    roundRect(ctx, bx, by, w, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = "#f0e6ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, by + h / 2 + 0.5);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // 「⏳ 長考中」バッジ。通信対戦で相手の手番が長引いているとき、その席のプレート上に出す。
  _thinkingBadge(cx, bottomY) {
    const ctx = this.ctx;
    const label = "⏳ 長考中";
    const color = "#f0c060";
    ctx.save();
    ctx.font = "bold 12px sans-serif";
    const padX = 9, h = 20;
    const w = ctx.measureText(label).width + padX * 2;
    const bx = cx - w / 2, by = bottomY - h;
    ctx.fillStyle = "#3a2f12";
    roundRect(ctx, bx, by, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = "#ffe9b0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, by + h / 2 + 0.5);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // 常時(パッシブ)能力バッジ。ネームプレート上に「[常時] 能力名 (盾 ●○)」を出す。
  // 手動発動の ⚡バッジ（紫）と区別するため緑系。meter があれば盾の残数ピップを添える
  // （armed=金 / broken=赤）。卓上の全席に出して「誰が何の常時能力／盾を持つか」を可視化する。
  _passiveBadge(cx, bottomY, name, meter, statusKind) {
    const ctx = this.ctx;
    const TAG = "常時", ACCENT = "#86e0b0";
    ctx.save();
    ctx.font = "bold 11px sans-serif";
    const tagW = ctx.measureText(TAG).width;
    const nameW = ctx.measureText(name).width;
    // 盾などの残数メーター（"盾 ●○"）。7枚以上は N/M にフォールバック。
    let pips = "", pipColor = statusKind === "broken" ? "#ff9a9a" : "#ffd98a";
    if (meter) {
      const on = Math.max(0, meter.on || 0), max = Math.max(0, meter.max || 0);
      const body = (max > 0 && max <= 6) ? "●".repeat(on) + "○".repeat(Math.max(0, max - on)) : `${on}/${max}`;
      pips = meter.label ? `${meter.label} ${body}` : body;
    }
    const pipsW = pips ? ctx.measureText(pips).width : 0;
    const padX = 8, gap = 6, tagPad = 5, h = 19, tagH = 15;
    const tagPillW = tagW + tagPad * 2;
    const w = padX + tagPillW + gap + nameW + (pips ? gap + pipsW : 0) + padX;
    const bx = cx - w / 2, by = bottomY - h;
    // 外枠ピル
    ctx.fillStyle = "#102019ee";
    roundRect(ctx, bx, by, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.3;
    roundRect(ctx, bx, by, w, h, h / 2); ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    // 「常時」タグ（塗りピル）
    let px = bx + padX;
    ctx.fillStyle = ACCENT;
    roundRect(ctx, px, by + (h - tagH) / 2, tagPillW, tagH, tagH / 2); ctx.fill();
    ctx.fillStyle = "#0e1813";
    ctx.fillText(TAG, px + tagPad, by + h / 2 + 0.5);
    px += tagPillW + gap;
    // 能力名
    ctx.fillStyle = "#dff3e8";
    ctx.fillText(name, px, by + h / 2 + 0.5);
    px += nameW;
    // 残数ピップ
    if (pips) {
      px += gap;
      ctx.fillStyle = pipColor;
      ctx.fillText(pips, px, by + h / 2 + 0.5);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // Round character icon. Uses the loaded icon image when available; otherwise
  // draws a colored disc with the name's first character (procedural fallback).
  _seatIcon(p, cx, cy, r, highlight) {
    const ctx = this.ctx;
    const img = this.charImages ? this.charImages.get(p.character, "icon") : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    if (img) {
      ctx.clip();
      // モブは黒シルエット。対局中の卓上アイコンに灰背景を敷いて felt に溶けないようにする
      // （透過PNGの透明部に色が出る）。シナリオ描画は別経路なので影響しない。
      if (p.character.isMob) { ctx.fillStyle = "#b8bcc4"; ctx.fill(); }
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = p.character.color;
      ctx.fill();
      ctx.fillStyle = "#0c150f";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
      ctx.fillText([...p.character.name][0] || "?", cx, cy + 1);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    // ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = highlight ? p.character.color : "#2a3f34";
    ctx.stroke();
  }

  _drawHumanHand(p) {
    const ctx = this.ctx;
    const s = HAND_SCALE;
    const tw = TILE_W * s, th = TILE_H * s;
    const gap = 4 * s, drawnGap = 12 * s;
    const hand = p.hand.filter((t) => t.id !== p.drawnTileId);
    const drawn = p.hand.find((t) => t.id === p.drawnTileId);
    const tiles = drawn ? [...hand, "gap", drawn] : hand;
    const count = hand.length + (drawn ? 1 : 0);
    const totalW = count * (tw + gap) + (drawn ? drawnGap : 0);
    // 副露は手牌と同じ行の右に置く（手牌＋すき間＋副露を1つの塊として中央に寄せる）。
    // 鳴くほど手牌が3枚ずつ減るので、門前14牌の幅(≈900px)を超えることはない。
    const ms = SELF_MELD_SCALE;
    const mtw = TILE_W * ms, mth = TILE_H * ms, mGap = 2, meldGap = 10, groupGap = 22;
    const meldLayouts = p.melds.map((m) => this._meldLayout(m, p.index));
    const meldsW = meldLayouts.length ? this._meldsWidth(meldLayouts, mtw, mth, mGap, meldGap) : 0;
    const groupW = totalW + (meldsW ? groupGap + meldsW : 0);
    const startX = Math.max(8, this.W / 2 - groupW / 2);
    let x = startX;
    // 拡大した牌が画面下にはみ出さないよう、下端から積み上げて上端 y を決める。
    // 打てる牌はここから PICK_LIFT 持ち上げるので、その分の余白も下端に残してある。
    const y = this.H - 8 - th;

    // dora kinds (incl. red fives) get a small ★ above the tile in your own hand
    const doraKinds = new Set(this.game.wall.doraKinds());

    let anyPickable = false;
    for (const t of tiles) {
      if (t === "gap") { x += drawnGap; continue; }
      const dangerLevel = this.danger ? this.danger.get(t.kind) : 0;
      const myTurn = this.game.phase === Phase.AWAIT_DISCARD && this.game.turn === p.index;
      const canPick =
        myTurn &&
        // リーチ後の打牌はツモ切りだけ（カン/北抜き選択で手番UIが開いても手牌は崩せない）。
        (!p.riichi || t.id === p.drawnTileId) &&
        (!this.riichiMode || (this.riichiKinds && this.riichiKinds.includes(t.kind)));
      const dim =
        (this.riichiMode && this.riichiKinds && !this.riichiKinds.includes(t.kind)) ||
        (myTurn && p.riichi && t.id !== p.drawnTileId);
      // 押せる牌は一段持ち上げ、ホバー中／2タップ選択中の牌はさらに上げる。
      // 当たり判定(ty)も同じだけずらして見た目と一致させる。
      const hovered = canPick && this.hoverTileId === t.id;
      const selected = canPick && this.selectedTileId === t.id;
      const lift = canPick ? ((hovered || selected) ? PICK_HOVER_LIFT : PICK_LIFT) : 0;
      const ty = y - lift;
      if (canPick) { anyPickable = true; this._pickGlow(x, ty, tw, th, hovered || selected); }
      // 影は持ち上げる前の位置に残す（浮かせた牌と影のすき間＝「手に取った」感）。
      if (this.seated && !dim) this._handShadow(x, y, tw, th, 5 * s);
      this._tile(x, ty, t.kind, { red: t.red, danger: dangerLevel, dim, scale: s });
      if (doraKinds.has(t.kind) || t.red) this._doraStar(x, ty, tw, dim);
      if (this.best && !dim) { const r = this.best.get(t.kind); if (r) this._bestMark(x, ty, tw, th, r); }
      if (this.recalled && this.recalled.has(t.id)) this._recallMark(x, ty, tw, th);
      if (selected) this._selectOutline(x, ty, tw, th); // 「次のタップで切る」武装中の牌を縁取り
      this.handHitboxes.push({ tileId: t.id, kind: t.kind, x, y: ty, w: tw, h: th, enabled: canPick });
      x += tw + gap;
    }
    if (meldsW) {
      // 手牌の下端にそろえて右に並べる（横向きの鳴き牌も下端そろえ）。
      const my = this.H - 8 - mth;
      let mx = startX + totalW + groupGap;
      for (const layout of meldLayouts) {
        for (const cell of layout) {
          if (cell.faceDown) {
            if (this.seated) this._handShadow(mx, my, mtw, mth, 5 * ms);
            this._back(mx, my, mtw, mth);
            mx += mtw + mGap;
          } else if (cell.rotated) {
            if (this.seated) this._handShadow(mx, my + (mth - mtw), mth, mtw, 5 * ms);
            this._drawTileAt(mx, my + (mth - mtw), cell.kind, { scale: ms, red: cell.red, sideways: true });
            mx += mth + mGap;
          } else {
            if (this.seated) this._handShadow(mx, my, mtw, mth, 5 * ms);
            this._tile(mx, my, cell.kind, { scale: ms, red: cell.red });
            mx += mtw + mGap;
          }
        }
        mx += meldGap;
      }
    }
    // コーチマークの矢印位置に使う外接矩形（押せる局面のときだけ更新）。
    // 上端はホバー時の最大リフト(PICK_HOVER_LIFT)基準にして、牌が浮いてもピル/矢印が被らないようにする。
    this._humanHandBox = anyPickable ? { x: startX, y: y - PICK_HOVER_LIFT, w: totalW, h: th } : null;
  }

  // 押せる手牌の下に敷く温色の受け皿光。「ここはクリックできる」という手がかり。
  _pickGlow(x, y, w, h, hovered) {
    const ctx = this.ctx;
    const cx = x + w / 2;
    const baseY = y + h + 2;
    const r = w * 0.95;
    const grad = ctx.createRadialGradient(cx, baseY, 2, cx, baseY, r);
    grad.addColorStop(0, hovered ? "rgba(246,210,74,0.55)" : "rgba(246,210,74,0.28)");
    grad.addColorStop(1, "rgba(246,210,74,0)");
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(x - w * 0.45, y, w * 1.9, h + 16);
    ctx.restore();
  }

  // 2タップ選択中の牌を縁取りして「次のタップで打牌される牌」を明示する。
  _selectOutline(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#f6b352";
    ctx.lineWidth = 3;
    roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 6);
    ctx.stroke();
    ctx.restore();
  }

  // リコール・ディール（エージェント・RE）で取り戻した牌の印。牌の右下角に小さな
  // 諜報タグを重ねる（danger=右上系 / bestMark=左上 / doraStar=上中央 と位置で住み分け）。
  _recallMark(x, y, w, h) {
    const ctx = this.ctx;
    const bw = 13, bh = 9;
    const bx = x + w - bw - 3, by = y + h - bh - 3;
    ctx.save();
    ctx.fillStyle = "#2b3946";
    roundRect(ctx, bx, by, bw, bh, 2.5); ctx.fill();
    ctx.strokeStyle = "#7f8c99"; ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 2.5); ctx.stroke();
    ctx.fillStyle = "#cfd8e0";
    ctx.fillRect(bx + 3, by + 3, bw - 6, 1.2);
    ctx.fillRect(bx + 3, by + 5.4, bw - 8, 1.2);
    ctx.restore();
  }

  // Small ★ marker drawn just above a tile to flag it as dora (or a red five).
  _doraStar(x, y, w, dim) {
    const ctx = this.ctx;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.4;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#3a2b00";
    ctx.strokeText("★", x + w / 2, y - 2);
    ctx.fillStyle = "#f6d24a";
    ctx.fillText("★", x + w / 2, y - 2);
    ctx.restore();
  }

  // 模範解答（篠宮 栞）— 牌効率トップ3の打牌候補に「栞（しおり）」を挟む。丸数字ではなく
  // 本に挟む紙のしおりの形にして、能力名と持ち主の名前がそのまま絵になるようにしてある
  // （docs/character-ingame-fx-plan.md 2-4）。牌の左上に垂らし、danger(右上系)・
  // doraStar(上中央)とは位置で住み分ける。1位ほど長く濃い＝迷ったときの優先度が読める。
  _bestMark(x, y, w, h, rank) {
    const ctx = this.ctx;
    const bw = 11;                       // しおりの幅
    const bh = [26, 22, 19][rank - 1] || 19; // 順位が上ほど長く垂れる
    const bx = x + 3;
    const by = y - 4;                    // 牌の上端から少し飛び出して「挟んである」感を出す
    const tail = 6;                      // 下端の V 字カット
    const alpha = [1, 0.86, 0.72][rank - 1] || 0.72;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw / 2, by + bh - tail);
    ctx.lineTo(bx, by + bh);
    ctx.closePath();
    ctx.fillStyle = "#2f9e7e"; // 翠（先生の色）
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#eafff7";
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(rank), bx + bw / 2, by + 8);
    ctx.restore();
  }

  _drawOpponentHand(p, seat) {
    const ctx = this.ctx;
    const n = p.hand.length;
    const back = TILE_W * 0.7;
    if (seat === 2) {
      const totalW = n * (back + 3);
      let x = this.W / 2 - totalW / 2;
      const y = TOP_HAND_Y;
      for (let i = 0; i < n; i++) { this._back(x, y, back, back * 1.35); x += back + 3; }
    } else {
      const th = back * 1.05;
      const totalH = n * (th + 3);
      let y = this.H / 2 - totalH / 2;
      const x = seat === 3 ? 52 : this.W - 52 - back;
      // 左右の相手は牌を立てて横から見た「側面」を見せる（背面ではなく厚みの面）。
      for (let i = 0; i < n; i++) { this._tileSide(x, y, back, th, seat); y += th + 3; }
    }
  }

  // Build the visual layout of a called meld: an ordered left-to-right list of
  // cells. The cell that was *called* is drawn sideways (rotated), and its
  // position encodes who it was taken from (official convention):
  //   上家(left seat)  -> rotated tile at the LEFT
  //   対面(across)     -> rotated tile in the MIDDLE
  //   下家(right seat) -> rotated tile at the RIGHT
  // チー is always from 上家, so its called tile sits leftmost.
  _meldLayout(m, mi) {
    if (m.type === MeldType.KAN_CLOSED) {
      // ankan: ends face-down, middle two face-up (standard display).
      return m.tiles.map((t, i) => ({
        kind: t.kind, red: t.red, faceDown: i === 0 || i === 3,
      }));
    }

    if (m.type === MeldType.CHI) {
      // 通信対戦のレプリカは calledTile を id だけで持つので、牌種は面子の中から引き直す。
      const called = (m.calledTile && m.tiles.find((t) => t.id === m.calledTile.id)) || m.calledTile;
      const others = m.tiles
        .filter((t) => t.id !== (called && called.id))
        .sort((a, b) => a.kind - b.kind);
      return [
        { kind: called.kind, red: called.red, rotated: true },
        ...others.map((t) => ({ kind: t.kind, red: t.red, rotated: false })),
      ];
    }

    // pon / minkan / shouminkan: all the same kind; place the rotated tile by
    // the relative direction of the seat the tile came from.
    const n = m.tiles.length;
    let rotIndex = 0; // default 上家
    if (m.from != null) {
      const N = this.game.numPlayers;
      const rel = (m.from - mi + N) % N; // 1 = 下家, 2 = 対面(4p), N-1 = 上家
      if (rel === 1) rotIndex = n - 1;            // 下家 -> right
      else if (rel === 2 && N === 4) rotIndex = 1; // 対面 -> middle (4p only)
      else rotIndex = 0;                           // 上家 -> left
    }
    return m.tiles.map((t, i) => ({ kind: t.kind, red: t.red, rotated: i === rotIndex }));
  }

  _meldsWidth(layouts, tw, th, gap, meldGap) {
    let w = 0;
    for (const layout of layouts) {
      for (const cell of layout) w += (cell.rotated ? th : tw) + gap;
      w += meldGap;
    }
    return w - meldGap;
  }

  _drawMelds(p, seat) {
    if (p.melds.length === 0) return;
    const ctx = this.ctx;
    const scale = SMALL;
    const tw = TILE_W * scale, th = TILE_H * scale;
    const gap = 2, meldGap = 9;
    const layouts = p.melds.map((m) => this._meldLayout(m, p.index));
    const totalW = this._meldsWidth(layouts, tw, th, gap, meldGap);

    // 鳴き牌ブロックを「その席の向き」に回した局所フレームで描く（河と同じ慣習）。
    // 局所フレーム: 原点(0,0)=ブロック左上、x右・y下で上端揃え・左→右に並べる。
    // angle で各席の手前向きへ回転 → 対面=180°/下家=右90°/上家=左90°、自席=正立。
    // origin は回転後にブロックが画面のその席の手前に来るよう逆算した画面座標。
    const handTop = this.H - 8 - TILE_H * HAND_SCALE; // 自分の手牌の上端
    let originX, originY, angle;
    if (seat === 0) { angle = 0; originX = this.W - 16 - totalW; originY = handTop - 8 - th; }
    else if (seat === 2) { angle = Math.PI; originX = 16 + totalW; originY = 96 + th; }
    else if (seat === 1) { angle = -Math.PI / 2; originX = this.W - 18 - th; originY = this.H / 2 + totalW / 2; }
    else { angle = Math.PI / 2; originX = 18 + th; originY = this.H / 2 - totalW / 2; }

    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(angle);
    let x = 0;
    const y = 0;
    for (const layout of layouts) {
      for (const cell of layout) {
        if (cell.faceDown) {
          this._back(x, y, tw, th);
          x += tw + gap;
        } else if (cell.rotated) {
          // sideways tile: footprint th wide × tw tall; bottom-align with uprights
          this._drawTileAt(x, y + (th - tw), cell.kind, { scale, red: cell.red, sideways: true });
          x += th + gap;
        } else {
          this._tile(x, y, cell.kind, { scale, red: cell.red });
          x += tw + gap;
        }
      }
      x += meldGap;
    }
    ctx.restore();
  }

  _drawRiver(pIndex, seat) {
    const p = this.game.players[pIndex];
    const scale = RIVER_SCALE;
    const tw = TILE_W * scale, th = TILE_H * scale;
    const perRow = 6;
    const cx = this.W / 2, cy = this.H / 2;
    const ctx = this.ctx;

    // Each river is laid out in a "local" frame (grid centred horizontally,
    // growing right-then-down, just below the centre box) and then the whole
    // frame is rotated so it faces that seat. This makes every player's
    // discards read upright FROM THAT PLAYER's side: self upright, 下家(right)
    // and 上家(left) sideways, 対面(top) upside-down — like a real table.
    const angle = -seat * Math.PI / 2;
    const blockW = perRow * (tw + 2);
    const ox = -blockW / 2;
    const oy = RIVER_Y; // 方位盤の外側から河を始める（局所フレーム）
    // 直近に捨てられた牌（鳴かれて河から消えたら該当なし＝印も出ない）。
    const lastId = this.game.lastDiscard ? this.game.lastDiscard.id : null;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Hitboxes are only needed for the human's OWN river (seat 0), and that frame
    // is un-rotated (angle 0, translated by the table centre), so local coords map
    // to screen coords by a simple offset. We record them while drawing.
    const selfHitboxes = seat === 0;

    // リーチ宣言中はその家の手前(河と方位盤の間)に点棒を横向きで1本置く（素材レス描画）。
    if (p.riichi) this._riichiStick(0, STICK_Y); // 方位盤(局所y=72)と河(同88)の隙間

    let rowIndex = -1;
    let rowX = ox;
    p.discards.forEach((t, i) => {
      const row = Math.floor(i / perRow);
      if (row !== rowIndex) { rowIndex = row; rowX = ox; }
      const ly = oy + row * (th + 2);
      const sideways = !!t.riichiTile;
      const slotW = (sideways ? th : tw);
      this._drawTileAt(rowX, ly, t.kind, {
        scale, red: t.red, riichi: t.riichiTile, sideways, ronImmune: t.ronImmune,
      });
      // 直近の捨て牌に金の縁取り。CPU の打牌は速いので「いま何が切られたか」を目で拾えるように。
      if (lastId != null && t.id === lastId) {
        ctx.save();
        ctx.strokeStyle = "#ffd76a"; ctx.lineWidth = 2.5;
        ctx.shadowColor = "#ffcf4d"; ctx.shadowBlur = 10;
        roundRect(ctx, rowX - 1.5, ly - 1.5, slotW + 3, (sideways ? tw : th) + 3, 5 * scale); ctx.stroke();
        ctx.restore();
      }
      // ルクスの走査結果「出切っている有効牌」を河で光らせる（告知中のみ）。
      if (this.deadKinds && this.deadKinds.has(t.kind)) {
        ctx.save();
        ctx.strokeStyle = "#4ea1d3"; ctx.lineWidth = 2;
        ctx.shadowColor = "#4ea1d3"; ctx.shadowBlur = 8;
        roundRect(ctx, rowX - 1, ly - 1, slotW + 2, th + 2, 5 * scale); ctx.stroke();
        ctx.restore();
      }
      // リコール選択中は自分の河の牌を選べることを縁取りで示す。
      if (selfHitboxes) {
        if (this.recallMode) {
          ctx.save();
          ctx.strokeStyle = "#f6b352"; ctx.lineWidth = 2;
          roundRect(ctx, rowX - 1, ly - 1, slotW + 2, th + 2, 5 * scale); ctx.stroke();
          ctx.restore();
        }
        this.riverHitboxes.push({ tileId: t.id, x: cx + rowX, y: cy + ly, w: slotW, h: th });
      }
      rowX += slotW + 2;
    });
    ctx.restore();
  }

  // ---- primitives ----
  // Sideways-aware wrapper: rotates the canvas 90° CCW when opts.sideways is
  // set so the underlying _tile draws upright but the footprint becomes h×w
  // (i.e. wider than tall). x,y is the top-left of that footprint.
  _drawTileAt(x, y, kind, opts) {
    if (!opts.sideways) { this._tile(x, y, kind, opts); return; }
    const ctx = this.ctx;
    const s = opts.scale || 1;
    const w = TILE_W * s, h = TILE_H * s;
    ctx.save();
    // pivot so the rotated tile occupies an h-wide × w-tall box at (x,y)
    ctx.translate(x + h / 2, y + w / 2);
    ctx.rotate(-Math.PI / 2);
    this._tile(-w / 2, -h / 2, kind, { ...opts, sideways: false });
    ctx.restore();
  }

  _tile(x, y, kind, opts = {}) {
    const ctx = this.ctx;
    const s = opts.scale || 1;
    const w = TILE_W * s, h = TILE_H * s;
    ctx.save();
    if (opts.dim) ctx.globalAlpha = 0.4;
    if (this._fieldPass) this._tileDepth(x, y, w, h, 5 * s, 3.4 * s, true);

    const img = this.tileImages ? this.tileImages.get(kind, opts.red) : null;
    if (img) {
      // image face: clip to rounded rect, lay the white tile base (Front) then the figure.
      // FluffyStuff の各牌SVGは図柄のみ＝下地が無いので、Front を敷かないと文字以外が透ける。
      ctx.save();
      roundRect(ctx, x, y, w, h, 5 * s);
      ctx.clip();
      const front = this.tileImages.getFront ? this.tileImages.getFront() : null;
      if (front) ctx.drawImage(front, x, y, w, h);
      else { ctx.fillStyle = "#f5f0eb"; ctx.fillRect(x, y, w, h); } // 下地フォールバック
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = "#c9c2ad"; ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, h, 5 * s); ctx.stroke();
      if (opts.riichi) { ctx.strokeStyle = "#f0d264"; ctx.lineWidth = 2; ctx.stroke(); }
      this._dangerOverlay(x, y, w, h, s, opts.danger);
      this._ronImmuneMark(x, y, w, h, s, opts.ronImmune);
      ctx.restore();
      return;
    }

    // ---- procedural fallback (no image) ----
    ctx.fillStyle = "#f7f3e8";
    roundRect(ctx, x, y, w, h, 5 * s); ctx.fill();
    ctx.strokeStyle = "#c9c2ad"; ctx.lineWidth = 1; ctx.stroke();
    if (opts.riichi) { ctx.strokeStyle = "#f0d264"; ctx.lineWidth = 2; ctx.stroke(); }
    this._dangerOverlay(x, y, w, h, s, opts.danger);

    const suit = suitOf(kind);
    ctx.fillStyle = opts.red ? "#d11" : SUIT_COLOR[suit];
    ctx.textAlign = "center";
    if (isHonor(kind)) {
      ctx.font = `bold ${20 * s}px sans-serif`;
      ctx.fillText(kindLabel(kind), x + w / 2, y + h / 2 + 7 * s);
    } else {
      ctx.font = `bold ${22 * s}px sans-serif`;
      ctx.fillText(String(rankOf(kind)), x + w / 2, y + h / 2 + 2 * s);
      ctx.font = `${11 * s}px sans-serif`;
      ctx.fillText({ m: "萬", p: "筒", s: "索" }[suit], x + w / 2, y + h - 6 * s);
    }
    this._ronImmuneMark(x, y, w, h, s, opts.ronImmune);
    ctx.restore();
  }

  // Marks a river tile that was placed by リコール・ディール and so cannot be
  // ronned: a translucent blue veil plus a small "ロン×" badge in the top-left.
  _ronImmuneMark(x, y, w, h, s, immune) {
    if (!immune) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(80,140,200,0.30)";
    roundRect(ctx, x, y, w, h, 5 * s); ctx.fill();
    const bw = 20 * s, bh = 11 * s;
    ctx.fillStyle = "#1f3b5c";
    roundRect(ctx, x + 1, y + 1, bw, bh, 3 * s); ctx.fill();
    ctx.fillStyle = "#cfe2ff";
    ctx.font = `bold ${8 * s}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ロン✕", x + 1 + bw / 2, y + 1 + bh / 2 + 0.5);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  // 傾いた卓の上の牌の厚み。卓の手前側（画面の下）に牌の側面＝象牙の表層と藍の背を覗かせ、
  // その先に落ち影を置く。河は席の向きに回して描くので、「画面の下」を今の局所座標へ戻して使う。
  // faceUp=false（伏せ牌・立てた牌）は自前で背や天面を描くので、側面は付けず影だけ。
  _tileDepth(x, y, w, h, r, t, faceUp) {
    const ctx = this.ctx;
    const m = ctx.getTransform();
    const det = m.a * m.d - m.b * m.c || 1;
    const dx = (-m.c * t) / det, dy = (m.a * t) / det;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    roundRect(ctx, x + dx * 1.9, y + dy * 1.9, w, h, r); ctx.fill();
    if (faceUp) {
      ctx.fillStyle = "#2b4166"; // 牌の背（藍）
      roundRect(ctx, x + dx, y + dy, w, h, r); ctx.fill();
      ctx.fillStyle = "#d6ccb2"; // 表側の層（象牙の側面）
      roundRect(ctx, x + dx * 0.55, y + dy * 0.55, w, h, r); ctx.fill();
    }
    ctx.restore();
  }

  // 手牌の落ち影（手前の層）。卓の縁に立てて置いた牌が、ランプの光で卓に影を落とす。
  _handShadow(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    roundRect(ctx, x + 3, y + 7, w, h, r); ctx.fill();
    ctx.restore();
  }

  // danger は危険度レベル 3=超危険(赤)/2=危険(橙)/1=警戒(黄)。
  _dangerOverlay(x, y, w, h, s, danger) {
    const st = DANGER_STYLES[danger];
    if (!st) return;
    const ctx = this.ctx;
    ctx.fillStyle = st.fill;
    roundRect(ctx, x, y, w, h, 5 * s); ctx.fill();
    ctx.fillStyle = st.mark;
    ctx.font = `bold ${10 * s}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(st.label, x + w - 3, y + 11 * s);
  }

  // 牌の裏。素材の裏面(Back.svg)は鮮やかな赤で、卓上でいちばん重要度の低い情報（対面の伏せ牌）が
  // いちばん目立っていたため、タイトルロゴの藍＋金に合わせた落ち着いた裏面を描く。下端に象牙色の
  // 表側の層を細く覗かせて、牌の厚みを出す。
  _back(x, y, w, h) {
    const ctx = this.ctx;
    const r = Math.min(4, w * 0.18);
    ctx.save();
    if (this._fieldPass) this._tileDepth(x, y, w, h, r, 3, false);
    // 表側（象牙）の層
    ctx.fillStyle = "#e9e1cc";
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    // 裏面（藍のグラデ）
    const lip = Math.max(2, h * 0.08);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#34507a");
    g.addColorStop(1, "#1d2d49");
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h - lip, r); ctx.fill();
    // 金の内枠
    ctx.strokeStyle = "rgba(232, 196, 120, 0.55)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + w * 0.16, y + h * 0.12, w * 0.68, h * 0.64 - lip, Math.max(1.5, r - 1.5)); ctx.stroke();
    // 輪郭
    ctx.strokeStyle = "#1a2438";
    roundRect(ctx, x, y, w, h, r); ctx.stroke();
    ctx.restore();
  }

  // 立てた牌を横から見た「側面」（左右の相手手牌用）。象牙の側面＋卓中央側に覗く
  // 白い天面で、牌の厚み＝立体感を出す。背面(Back)を並べるより自然に見える。
  _tileSide(x, y, w, h, seat) {
    const ctx = this.ctx;
    if (this._fieldPass) this._tileDepth(x, y, w, h, 3, 3, false);
    // 側面本体（象牙、わずかに陰）
    ctx.fillStyle = "#ddd6c2";
    roundRect(ctx, x, y, w, h, 3); ctx.fill();
    // 天面ハイライト：卓中央側の辺に白い細帯（立てた牌の上面が覗く）
    const lipW = Math.max(5, w * 0.26);
    const lipX = seat === 1 ? x : x + w - lipW; // 右席=左辺/左席=右辺が中央側
    ctx.fillStyle = "#f6f1e6";
    roundRect(ctx, lipX, y, lipW, h, 3); ctx.fill();
    // 牌の輪郭
    ctx.strokeStyle = "#b3ab95"; ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 3); ctx.stroke();
  }

  // リーチ棒(千点棒)を素材なしで描く。(cx,cy)中心の横長の白棒＋中央の赤丸。
  // 河フレームは呼び出し側で回転済みなので、ここは常に「横向き」で描けばよい。
  _riichiStick(cx, cy) {
    const ctx = this.ctx;
    const len = 116, thick = 10;
    const x = cx - len / 2, y = cy - thick / 2;
    ctx.save();
    ctx.fillStyle = "#f4efe3"; // 象牙色の棒
    roundRect(ctx, x, y, len, thick, thick / 2); ctx.fill();
    ctx.strokeStyle = "#c9c2ad"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#d23b3b"; // 中央の赤丸（千点棒の標識）
    ctx.beginPath();
    ctx.arc(cx, cy, thick * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
