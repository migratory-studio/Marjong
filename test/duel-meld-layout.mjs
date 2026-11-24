// Record actual tile draw calls, including Canvas rotation and CSS perspective.
// Regressions here hide public game information behind the HP/name overlays.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CanvasRenderer, SEATED_LAYOUT } from '../src/ui/canvasRenderer.js';
import { Game, Phase } from '../src/core/game.js';
import { CHARACTERS } from '../src/characters/characters.js';
import { MeldType } from '../src/core/meld.js';

function canvas() {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const multiply = ([a,b,c,d,e,f]) => {
    const [A,B,C,D,E,F] = m;
    m = [A*a+C*b, B*a+D*b, A*c+C*d, B*c+D*d, A*e+C*f+E, B*e+D*f+F];
  };
  const ctx = new Proxy({
    save: () => stack.push([...m]), restore: () => { m = stack.pop(); },
    translate: (x,y) => multiply([1,0,0,1,x,y]),
    rotate: a => multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]),
    scale: (x,y) => multiply([x,0,0,y,0,0]),
    getTransform: () => Object.fromEntries(['a','b','c','d','e','f'].map((k,i) => [k,m[i]])),
    measureText: text => ({ width: [...text].length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target,key) => key in target ? target[key] : () => {} });
  return { width:960, height:720, getContext: () => ctx };
}

class MeasuredRenderer extends CanvasRenderer {
  rectangles = [];
  record(x, y, w, h) {
    const m = this.ctx.getTransform();
    const corners = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([px,py]) => {
      const point = { x:m.a*px+m.c*py+m.e, y:m.b*px+m.d*py+m.f };
      return this._fieldPass ? this.fieldToFlat(point.x,point.y) : point;
    });
    this.rectangles.push({
      role:this.role, seat:this.seat, tileScale:w/38,
      left:Math.min(...corners.map(p=>p.x)) + 16,
      right:Math.max(...corners.map(p=>p.x)) + 16,
      top:Math.min(...corners.map(p=>p.y)),
      bottom:Math.max(...corners.map(p=>p.y)) + (this._fieldPass ? 5 : 12),
    });
  }
  _tile(x,y,kind,opts={}) { const s=opts.scale ?? 1; this.record(x,y,38*s,52*s); }
  _back(x,y,w,h) { this.record(x,y,w,h); }
  _tileSide(x,y,w,h) { this.record(x,y,w,h); }
  _drawOpponentHand(p,seat) { this.role='hand'; this.seat=seat; super._drawOpponentHand(p,seat); }
  _drawHumanHand(p) { this.role='self'; this.seat=0; super._drawHumanHand(p); }
  _drawMelds(p,seat) { this.role='meld'; this.seat=seat; super._drawMelds(p,seat); }
  _drawRiver(pi,seat) { this.role='river'; this.seat=seat; super._drawRiver(pi,seat); }
}

const css = readFileSync(new URL('../src/ui/duel.css', import.meta.url), 'utf8');
const declaration = (selector,prop) => {
  const body=css.slice(css.indexOf(selector)).match(/\{([^}]+)\}/)[1];
  const value=Number(body.match(new RegExp(`(?:^|[;\\s])${prop}:([\\d.]+)px`))?.[1]);
  assert.ok(Number.isFinite(value),`missing CSS geometry: ${selector} ${prop}`);
  return value;
};
const tableLeft=declaration('#game-screen.duel .table-wrap','left');
assert.equal(tableLeft,16,'update recorded table offset if the table moves');
const hpBoxes = [0,1,2,3].map(seat => {
  const selector=`#game-screen.duel .hp-row[data-seat="${seat}"]`;
  const left=declaration(selector,'left');
  const h=seat===0 ? declaration(selector,'min-height') : declaration('#game-screen.duel .hp-row {','min-height');
  const top=seat===0 ? 720-declaration(selector,'bottom')-h : declaration(selector,'top');
  // Include the expanded tournament delta panel, as well as the normal width.
  const width=seat===0 ? declaration(selector,'width') : declaration('#game-screen.duel .hp-row:has(.hp-delta:not([hidden])) {','width');
  return { left,right:left+width,top,bottom:top+h };
});
const commandTop=720-declaration('#game-screen.duel .duel-command-rail {','height');
const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const tile = (id,kind=0) => ({id,kind,red:kind===4});
let cases=0;
let minMeldScale=Infinity, maxMeldScale=0;
const failures=[];
for (const count of [2,3,4]) for (const human of [0,count-1]) {
  for (const type of Object.values(MeldType)) for (let meldCount=1;meldCount<=4;meldCount++) {
    for (let target=0;target<count;target++) for (let from=0;from<count;from++) {
      if (from===target) continue;
      const game=new Game(CHARACTERS.slice(0,count).map(character=>({character,abilities:[]})),human,19);
      game.startHand(); game.turn=human; game.phase=Phase.AWAIT_DISCARD;
      game.players.forEach((p,pi)=>{
        p.hand=Array.from({length:pi===target ? 14-3*meldCount : pi===human ? 14 : 13},(_,i)=>tile(1000+100*pi+i,i%27));
        p.discards=Array.from({length:18},(_,i)=>tile(2000+100*pi+i,i%27));
        p.melds=[]; p.drawnTileId=p.hand.at(-1).id;
      });
      const p=game.players[target];
      p.melds=Array.from({length:meldCount},(_,j)=>{
        const tiles=Array.from({length:type===MeldType.CHI || type===MeldType.PON ? 3 : 4},(_,i)=>tile(3000+j*10+i,type===MeldType.CHI ? j*3+i : j*3));
        return {type,tiles,from:type===MeldType.KAN_CLOSED ? null : from,calledTile:tiles[0]};
      });
      const r=new MeasuredRenderer(canvas(),game,human,null,null,canvas());
      r.seatHud=true; r.selectedTileId=game.players[human].hand[0].id; r.render();
      const boxes=r._seatSlots(count).map(seat=>hpBoxes[seat]);
      const label=`${count}p human=${human} target=${target} ${meldCount}×${type} from=${from}`;
      const meldTiles=r.rectangles.filter(b=>b.role==='meld');
      const hands=r.rectangles.filter(b=>b.role==='hand' || b.role==='self');
      for(const b of [...meldTiles,...hands]) if(boxes.some(hp=>overlaps(b,hp))) failures.push(`${label}: ${b.role} under HP (seat ${b.seat})`);
      for(const b of meldTiles) {
        minMeldScale=Math.min(minMeldScale,b.tileScale); maxMeldScale=Math.max(maxMeldScale,b.tileScale);
        if(b.left<16 || b.right>976 || b.top<0 || b.bottom>commandTop) failures.push(`${label}: meld outside table`);
        if(r.rectangles.some(other=>other.role!=='meld' && overlaps(b,other))) failures.push(`${label}: meld intersects ${r.rectangles.find(other=>other.role!=='meld' && overlaps(b,other)).role}`);
        // Team/pair modes retain the Canvas nameplates instead of the seat HP.
        if(Object.values(SEATED_LAYOUT.plates).some(([x,y])=>overlaps(b,{left:x-90+16,right:x+90+16,top:y-18,bottom:y+18}))) failures.push(`${label}: meld under group nameplate`);
      }
      cases++;
    }
  }
}
assert.equal(failures.length,0,`${failures.length} hidden/overlapping tile cases; first examples:\n${failures.slice(0,10).join('\n')}`);
assert.ok(minMeldScale>=.68,'public meld faces must stay readable even at four kans');
assert.ok(maxMeldScale-minMeldScale<1e-9,'meld count/type/seat must not shrink tile faces');
console.log(`PASS: meld visibility — ${cases} layouts, 2/3/4 players, all seats/call directions and 1–4 melds`);
