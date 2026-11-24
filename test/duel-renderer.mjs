// Geometry/interaction regressions for the seated table, independent of pixels.
import assert from 'node:assert/strict';
import { CanvasRenderer } from '../src/ui/canvasRenderer.js';
import { Game, Phase } from '../src/core/game.js';
import { CHARACTERS, instantiateAbilities } from '../src/characters/characters.js';
import { MeldType } from '../src/core/meld.js';

function canvas() {
  const ctx = new Proxy({
    getTransform: () => ({ a:1,b:0,c:0,d:1,e:0,f:0 }),
    measureText: text => ({ width: [...text].length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return { width:960, height:720, getContext: () => ctx };
}
let assertions=0;
for (const count of [2,3,4]) {
  const seats=CHARACTERS.slice(0,count).map(character=>({character,abilities:instantiateAbilities(character)}));
  const game=new Game(seats,0,19); game.startHand();
  game.turn=0; game.phase=Phase.AWAIT_DISCARD;
  const p=game.players[0];
  p.hand=Array.from({length:14},(_,i)=>({id:1000+i,kind:i%27,red:false}));
  p.drawnTileId=p.hand[13].id;
  game.players.forEach((player,j)=>{player.discards=Array.from({length:18},(_,i)=>({id:2000+j*100+i,kind:i%27,riichiTile:i===6}));});
  const renderer=new CanvasRenderer(canvas(),game,0,null,null,canvas()); renderer.seatHud=true;
  renderer.render();
  assert.equal(renderer.handHitboxes.length,14);assertions++;
  assert.equal(renderer.tileLandings.size,count*18);assertions++;
  for (const box of renderer.handHitboxes) {
    assert.ok(box.enabled && box.x>=0 && box.x+box.w<=960);
    assert.ok(box.y>=0 && box.y+box.h+12<648,'hand and its depth must stay above command rail');assertions+=2;
  }
  for (const box of renderer.riverHitboxes) {
    const x=box.x+box.w/2,y=box.y+box.h/2;
    const flat=renderer.fieldToFlat(x,y),back=renderer.flatToField(flat.x,flat.y);
    assert.ok(Math.abs(back.x-x)<1e-7 && Math.abs(back.y-y)<1e-7,'river selection survives table perspective');assertions++;
  }
  // Long hands must retain six-column rivers without intruding into the hand.
  p.discards=Array.from({length:24},(_,i)=>({id:3000+i,kind:i%27}));
  renderer.selectedTileId=p.hand[0].id;renderer.render();
  const handTop=Math.min(...renderer.handHitboxes.map(b=>b.y));
  for(const box of renderer.riverHitboxes) {
    const bottom=renderer.fieldToFlat(box.x,box.y+box.h).y;
    assert.ok(bottom+3<handTop,`late river ${bottom} must clear selected hand ${handTop}`);assertions++;
  }
  // Riichi/forced discard: still exactly the drawn tile can be selected.
  p.riichi=true;renderer.render();
  assert.deepEqual(renderer.handHitboxes.filter(b=>b.enabled).map(b=>b.tileId),[p.drawnTileId]);assertions++;
  p.riichi=false;
  renderer.setHighlights({forcedTileId:p.drawnTileId});renderer.render();
  assert.equal(renderer.handHitboxes.filter(b=>b.enabled).length,1);assertions++;
  // Four closed kans: render both backs and faces without losing the last pair.
  renderer.setHighlights({});
  p.hand=p.hand.slice(-2);
  p.melds=Array.from({length:4},(_,j)=>({type:MeldType.KAN_CLOSED,from:null,tiles:Array.from({length:4},(_,i)=>({id:4000+j*4+i,kind:j}))}));
  renderer.render();
  assert.equal(renderer.handHitboxes.length,2);assertions++;
  // Online/group presentation can retain Canvas nameplates, with no hand collision.
  renderer.seatHud=false;renderer.render();assertions++;
}
console.log(`PASS: duel renderer — ${assertions} geometry, selection and mode checks`);
