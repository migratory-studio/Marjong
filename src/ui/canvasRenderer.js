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
  constructor(canvas, game, humanIndex, tileImages = null, charImages = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.humanIndex = humanIndex;
    this.tileImages = tileImages; // optional TileImages; falls back to procedural
    this.charImages = charImages; // optional CharacterImages; falls back to colored disc
    this.handHitboxes = []; // [{tileId, kind, x,y,w,h, enabled}]
    this.riverHitboxes = []; // [{tileId, x,y,w,h}] — the human's OWN river (for リコール選択)
    this.hover = null; // {x, y, waits:[kind...]} for the wait tooltip
    this.W = canvas.width;
    this.H = canvas.height;

    // リーチ棒は素材を使わず Canvas で直接描く（_riichiStick）。点棒=HP のゲージは
    // 右サイドの相棒ボードに集約済みで、卓上にはHPバーを描かない。
  }

  setHighlights({ riichiMode = false, riichiKinds = null, danger = null, recallMode = false } = {}) {
    this.riichiMode = riichiMode;
    this.riichiKinds = riichiKinds;
    this.danger = danger; // Map kind -> level
    this.recallMode = recallMode; // リコール・ディール: 自分の河の牌を選択中
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.handHitboxes = [];
    this.riverHitboxes = [];

    this._drawCenterInfo();
    // Map each player (by turn-order offset from the human) to a visual seat slot:
    //   4p: offset 0,1,2,3 -> seat 0(bottom),1(right),2(top),3(left)
    //   3p: offset 0,1,2   -> seat 0(bottom),1(right),3(left)  (no top seat)
    const N = this.game.numPlayers;
    const slots = this._seatSlots(N);
    for (let offset = 0; offset < N; offset++) {
      const pIndex = (this.humanIndex + offset) % N;
      const seat = slots[offset];
      this._drawPlayer(pIndex, seat);
      this._drawRiver(pIndex, seat);
    }
    this._drawWaitTooltip();
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

  _drawCenterInfo() {
    const ctx = this.ctx;
    const cx = this.W / 2, cy = this.H / 2;
    // center box
    ctx.fillStyle = "#163a2b";
    roundRect(ctx, cx - 150, cy - 70, 300, 140, 12);
    ctx.fill();

    ctx.fillStyle = "#cfe0d6";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`残り牌: ${this.game.wall.liveRemaining}`, cx, cy - 40);
    const honbaText = this.game.honba > 0 ? `  ${this.game.honba}本場` : "";
    ctx.fillText(`${this.game.roundLabel()}${honbaText}`, cx, cy - 18);
    if (this.game.kyotaku > 0) ctx.fillText(`供託 ${this.game.kyotaku}`, cx, cy + 2);

    // dora indicators
    const dora = this.game.wall.doraIndicators();
    const startX = cx - (dora.length * (TILE_W * SMALL + 3)) / 2;
    ctx.fillStyle = "#9bb3a6";
    ctx.fillText("ドラ表示", cx, cy + 22);
    dora.forEach((t, i) => {
      this._tile(startX + i * (TILE_W * SMALL + 3), cy + 30, t.kind, { scale: SMALL });
    });
  }

  _seatTransform(seat) {
    // returns {ox, oy, dir} dir: 'h' bottom/top, 'v' left/right; and orientation
    const m = 56;
    switch (seat) {
      case 0: return { type: "bottom" };
      case 1: return { type: "right" };
      case 2: return { type: "top" };
      case 3: return { type: "left" };
    }
  }

  _drawPlayer(pIndex, seat) {
    const ctx = this.ctx;
    const p = this.game.players[pIndex];
    const t = this._seatTransform(seat);

    // name plate + HP bar
    this._namePlate(p, seat);

    if (seat === 0) {
      this._drawHumanHand(p);
      this._drawMelds(p, seat);
    } else {
      this._drawOpponentHand(p, seat);
      this._drawMelds(p, seat);
    }
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
    [x, y] = positions[seat];
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

    // 発動中バッジ：プレート上に「⚡発動中 能力名」をピル型で出す。
    if (activeAbility) this._abilityBadge(x, y - 18 - 8, activeAbility.name, ABILITY_GLOW);

    // Character icon just left of the plate (real art if present, else a colored disc).
    this._seatIcon(p, x - 90 - 22, y, 18, isTurn);

    const windName = { 27: "東", 28: "南", 29: "西", 30: "北" }[p.seatWind];
    ctx.fillStyle = p.character.color;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`${windName} ${p.character.name}${p.isDealer ? "(親)" : ""}`, x, y + 5);

    if (p.riichi) {
      ctx.fillStyle = "#f0d264";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("● リーチ", x, y + 32);
    }

    // 北抜き (sanma nuki-dora) count, shown opposite the riichi indicator row.
    if (p.kita && p.kita.length > 0) {
      ctx.fillStyle = "#7fd1ff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`北 ×${p.kita.length}`, x, p.riichi ? y + 46 : y + 32);
    }
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
    let x = this.W / 2 - totalW / 2;
    // 拡大した牌が画面下にはみ出さないよう、下端から積み上げて上端 y を決める。
    const y = this.H - 8 - th;

    // dora kinds (incl. red fives) get a small ★ above the tile in your own hand
    const doraKinds = new Set(this.game.wall.doraKinds());

    for (const t of tiles) {
      if (t === "gap") { x += drawnGap; continue; }
      const dangerLevel = this.danger ? this.danger.get(t.kind) : 0;
      const canPick =
        this.game.phase === Phase.AWAIT_DISCARD &&
        this.game.turn === p.index &&
        (!this.riichiMode || (this.riichiKinds && this.riichiKinds.includes(t.kind)));
      const dim = this.riichiMode && this.riichiKinds && !this.riichiKinds.includes(t.kind);
      this._tile(x, y, t.kind, { red: t.red, danger: dangerLevel, dim, scale: s });
      if (doraKinds.has(t.kind) || t.red) this._doraStar(x, y, tw, dim);
      this.handHitboxes.push({ tileId: t.id, kind: t.kind, x, y, w: tw, h: th, enabled: canPick });
      x += tw + gap;
    }
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

  _drawOpponentHand(p, seat) {
    const ctx = this.ctx;
    const n = p.hand.length;
    const back = TILE_W * 0.7;
    if (seat === 2) {
      const totalW = n * (back + 3);
      let x = this.W / 2 - totalW / 2;
      const y = 128;
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
      const called = m.calledTile;
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
    const scale = SMALL;
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
    const oy = 92; // gap below centre box where the river starts (local frame)

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Hitboxes are only needed for the human's OWN river (seat 0), and that frame
    // is un-rotated (angle 0, translated by the table centre), so local coords map
    // to screen coords by a simple offset. We record them while drawing.
    const selfHitboxes = seat === 0;

    // リーチ宣言中はその家の手前(河と中央箱の間)に点棒を横向きで1本置く（素材レス描画）。
    if (p.riichi) this._riichiStick(0, 80); // 中央箱(局所y=70)と河(同92)の隙間

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

  _back(x, y, w, h) {
    const ctx = this.ctx;
    const img = this.tileImages ? this.tileImages.getBack() : null;
    if (img) {
      ctx.save();
      roundRect(ctx, x, y, w, h, 4); ctx.clip();
      const front = this.tileImages.getFront ? this.tileImages.getFront() : null;
      if (front) ctx.drawImage(front, x, y, w, h); // 白い下地（裏面の透過対策）
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      ctx.strokeStyle = "#c9c2ad"; ctx.lineWidth = 1;
      roundRect(ctx, x, y, w, h, 4); ctx.stroke();
      return;
    }
    // 画像未ロード時のフォールバック（緑の牌裏）。
    ctx.fillStyle = "#2e6f4f";
    roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = "#1c4632"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#3c8a63";
    roundRect(ctx, x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, 3); ctx.fill();
  }

  // 立てた牌を横から見た「側面」（左右の相手手牌用）。象牙の側面＋卓中央側に覗く
  // 白い天面で、牌の厚み＝立体感を出す。背面(Back)を並べるより自然に見える。
  _tileSide(x, y, w, h, seat) {
    const ctx = this.ctx;
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
