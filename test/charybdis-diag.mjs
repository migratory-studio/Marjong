// カリュブディス限定診断: なぜ最下位なのかを分解する。
// 1局ごとに、カリュブディスの「立直回数・放銃・流局・流局時聴牌・流局3倍受取」を集計。
import { Game, Phase } from "../src/core/game.js";
import { CHARACTERS, instantiateAbilities } from "../src/characters/characters.js";
import { decideDiscard, decideCall, decideAbilityActivations } from "../src/ai/simpleAI.js";
import { Events } from "../src/core/events.js";

const PER = Number(process.argv[2]) || 80;
const CH = CHARACTERS.find((c) => c.id === "charybdis");
const others = CHARACTERS.filter((c) => c.id !== "charybdis");

function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const rng = mulberry32(0xBEEF);
const randInt=(n)=>Math.floor(rng()*n);
const shuffle=(a)=>{for(let i=a.length-1;i>0;i--){const j=randInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};

function autoplay(game, maxSteps=2000){
  game.startHand(); let steps=0;
  while(!game.isGameOver() && steps++<maxSteps){
    if(game.phase===Phase.HAND_OVER){game.startHand();continue;}
    if(game.phase===Phase.AWAIT_CALLS){
      const d=game.pendingCalls.callers.map(c=>({index:c.index,...decideCall(game,c.index,c.options)}));
      game.resolveCalls(d);continue;
    }
    if(game.phase===Phase.AWAIT_DISCARD){
      const idx=game.turn;
      for(const a of decideAbilityActivations(game,idx)) game.activateAbility(idx,a.id,a.params);
      const dd=decideDiscard(game,idx); if(!dd)break;
      if(dd.type==="tsumo")game.doTsumo(idx);
      else if(dd.type==="kan")game.declareKan(idx,dd.kind,dd.kanType);
      else game.discard(idx,dd.tileId,dd.riichi);
      continue;
    }
    break;
  }
  return steps<maxSteps;
}

const agg={ games:0, hands:0, riichi:0, dealIns:0, tsumoPaid:0, paidTotal:0,
  draws:0, drawTenpai:0, drawBonusIncome:0, drawNoten:0, finalPtsSum:0, startSum:0, skipped:0 };

for(let g=0; g<PER; g++){
  // カリュブディス＋ランダム3人
  const pool=shuffle([...others]).slice(0,3);
  const seats=shuffle([CH, ...pool]);
  const seated=seats.map(c=>({character:c, abilities:instantiateAbilities(c)}));
  const game=new Game(seated,-1,2_000_000+g);
  const chIdx=()=>game.players.findIndex(p=>p.character.id==="charybdis");

  game.bus.on(Events.RIICHI_DECLARED,({player})=>{ if(player.character.id==="charybdis") agg.riichi++; });
  game.bus.on(Events.HAND_WON,(r)=>{
    agg.hands++;
    const ci=chIdx();
    if(r.loser===ci) agg.dealIns++;
    const d=r.deltas[ci]||0;
    if(d<0 && r.loser!==ci) agg.tsumoPaid++; // ツモ被り等
    if(d<0) agg.paidTotal+=d;
  });
  game.bus.on(Events.HAND_DRAWN,(r)=>{
    agg.hands++; agg.draws++;
    const ci=chIdx();
    const d=(r.deltas&&r.deltas[ci])||0;
    if(d>0){agg.drawTenpai++; agg.drawBonusIncome+=d;}
    else if(d<0){agg.drawNoten++;}
    agg.paidTotal+= d<0?d:0;
  });

  let ok=false; try{ok=autoplay(game);}catch(e){ok=false;}
  if(!ok){ agg.skipped++; continue; }
  agg.games++;
  const ci=chIdx();
  agg.finalPtsSum+=game.players[ci].points;
  agg.startSum+=CH.stats.startingPoints;
}

const n=agg.games;
const f=(x)=>(x/n).toFixed(2);
console.log(`カリュブディス診断  (${n} 戦完走 / 目標 ${PER} / スキップ ${agg.skipped} = 終わらない連荘ループ)`);
console.log(`初期点 ${CH.stats.startingPoints} / 平均最終点 ${Math.round(agg.finalPtsSum/n)} / 平均増減 ${Math.round((agg.finalPtsSum-agg.startSum)/n)}`);
console.log(`1戦あたり総局数        ${f(agg.hands)}`);
console.log(`1戦あたり流局数        ${f(agg.draws)}  (うち聴牌 ${f(agg.drawTenpai)} / ノーテン ${f(agg.drawNoten)})`);
console.log(`流局聴牌率(対流局)     ${(100*agg.drawTenpai/Math.max(1,agg.draws)).toFixed(1)}%`);
console.log(`1戦あたり立直回数      ${f(agg.riichi)}   ← アガれないのに供託1000を捨てている`);
console.log(`1戦あたり放銃回数      ${f(agg.dealIns)}`);
console.log(`1戦あたり流局3倍受取   ${Math.round(agg.drawBonusIncome/n)}  (唯一の収入源)`);
console.log(`1戦あたり総支払い      ${Math.round(agg.paidTotal/n)}`);
console.log(`推定 立直供託ロス/戦   ${Math.round(agg.riichi/n*1000)}  (立直回数×1000の概算)`);
