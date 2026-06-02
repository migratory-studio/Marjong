// Canvas renderer for the table. Pure drawing + hitbox bookkeeping; it never
// mutates game state. The controller reads `handHitboxes` to map clicks to tiles.
import { kindLabel, rankOf, suitOf, isHonor, SUITS } from "../core/tiles.js";
import { Phase } from "../core/game.js";
import { MeldType } from "../core/meld.js";

const TILE_W = 38;
const TILE_H = 52;
const SMALL = 0.62;

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
  _seatSlots(n) {
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
      1: [this.W - 150, this.H / 2 + 120],
      2: [this.W / 2, 84],
      3: [150, this.H / 2 - 120],
    };
    [x, y] = positions[seat];
    ctx.textAlign = "center";
    const isTurn = this.game.turn === p.index && this.game.phase === Phase.AWAIT_DISCARD;
    // plate
    ctx.fillStyle = isTurn ? "#244b39" : "#1a2c23";
    roundRect(ctx, x - 90, y - 26, 180, 52, 8);
    ctx.fill();
    if (isTurn) { ctx.strokeStyle = p.character.color; ctx.lineWidth = 2; ctx.stroke(); }

    // Character icon just left of the plate (real art if present, else a colored disc).
    this._seatIcon(p, x - 90 - 22, y, 18, isTurn);

    const windName = { 27: "東", 28: "南", 29: "西", 30: "北" }[p.seatWind];
    ctx.fillStyle = p.character.color;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`${windName} ${p.character.name}${p.isDealer ? "(親)" : ""}`, x, y - 8);

    // HP bar (points)
    const maxHP = p.character.stats.startingPoints;
    const ratio = Math.max(0, Math.min(1, p.points / Math.max(maxHP, 1)));
    const barW = 150;
    ctx.fillStyle = "#0c150f";
    roundRect(ctx, x - barW / 2, y + 4, barW, 12, 6); ctx.fill();
    ctx.fillStyle = p.points < 0 ? "#7a2030" : hpColor(ratio);
    roundRect(ctx, x - barW / 2, y + 4, barW * ratio, 12, 6); ctx.fill();
    ctx.fillStyle = "#e8efe9";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(`${p.points}`, x, y + 14);

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
    const hand = p.hand.filter((t) => t.id !== p.drawnTileId);
    const drawn = p.hand.find((t) => t.id === p.drawnTileId);
    const tiles = drawn ? [...hand, "gap", drawn] : hand;
    const count = hand.length + (drawn ? 1 : 0);
    const totalW = count * (TILE_W + 4) + (drawn ? 12 : 0);
    let x = this.W / 2 - totalW / 2;
    const y = this.H - 74;

    // dora kinds (incl. red fives) get a small ★ above the tile in your own hand
    const doraKinds = new Set(this.game.wall.doraKinds());

    for (const t of tiles) {
      if (t === "gap") { x += 12; continue; }
      const dangerLevel = this.danger ? this.danger.get(t.kind) : 0;
      const canPick =
        this.game.phase === Phase.AWAIT_DISCARD &&
        this.game.turn === p.index &&
        (!this.riichiMode || (this.riichiKinds && this.riichiKinds.includes(t.kind)));
      const dim = this.riichiMode && this.riichiKinds && !this.riichiKinds.includes(t.kind);
      this._tile(x, y, t.kind, { red: t.red, danger: dangerLevel, dim });
      if (doraKinds.has(t.kind) || t.red) this._doraStar(x, y, TILE_W, dim);
      this.handHitboxes.push({ tileId: t.id, kind: t.kind, x, y, w: TILE_W, h: TILE_H, enabled: canPick });
      x += TILE_W + 4;
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
      const y = 116;
      for (let i = 0; i < n; i++) { this._back(x, y, back, back * 1.35); x += back + 3; }
    } else {
      const th = back * 1.05;
      const totalH = n * (th + 3);
      let y = this.H / 2 - totalH / 2;
      const x = seat === 3 ? 96 : this.W - 96 - back;
      for (let i = 0; i < n; i++) { this._back(x, y, back, th); y += th + 3; }
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
    const scale = SMALL;
    const tw = TILE_W * scale, th = TILE_H * scale;
    const gap = 2, meldGap = 9;
    const layouts = p.melds.map((m) => this._meldLayout(m, p.index));
    const totalW = this._meldsWidth(layouts, tw, th, gap, meldGap);

    // melds are drawn left-to-right; pick a corner per seat.
    let x, y;
    if (seat === 0) { y = this.H - 64; x = this.W - 16 - totalW; }
    else if (seat === 2) { y = 64; x = 16; }
    else if (seat === 1) { y = 96; x = this.W - 16 - totalW; }
    else { y = this.H - 128; x = 16; }

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
      // image face: clip to rounded rect and draw the sprite
      ctx.save();
      roundRect(ctx, x, y, w, h, 5 * s);
      ctx.clip();
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
    ctx.fillStyle = "#2e6f4f";
    roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = "#1c4632"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "#3c8a63";
    roundRect(ctx, x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, 3); ctx.fill();
  }
}

function hpColor(ratio) {
  if (ratio > 0.6) return "#5fbf6f";
  if (ratio > 0.3) return "#e0c14a";
  return "#e85d75";
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
