import * as THREE from 'https://esm.sh/three@0.180.0';
import { BattleGame } from './game.js';

function ctxFor(game){
  try{
    game.audioCtx ??= new (window.AudioContext||window.webkitAudioContext)();
    if(game.audioCtx.state==='suspended') game.audioCtx.resume();
    return game.audioCtx;
  }catch{return null}
}

function tone(game,{freq=220,dur=.08,type='square',gain=.035,slide=0,delay=0}={}){
  const c=ctxFor(game); if(!c)return;
  const t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(freq,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.01);
}

function noise(game,{dur=.10,gain=.025,filter=900,delay=0}={}){
  const c=ctxFor(game);if(!c)return;const t=c.currentTime+delay;
  const len=Math.max(1,Math.floor(c.sampleRate*dur)),buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  const src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();src.buffer=buf;f.type='lowpass';f.frequency.value=filter;
  g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(f);f.connect(g);g.connect(c.destination);src.start(t);src.stop(t+dur+.01);
}

BattleGame.prototype._sfxShoot=function(){tone(this,{freq:720,dur:.055,type:'square',gain:.032,slide:-420});tone(this,{freq:1220,dur:.028,type:'sine',gain:.018,delay:.008,slide:-650})};
BattleGame.prototype._sfxBrick=function(){noise(this,{dur:.09,gain:.035,filter:620});tone(this,{freq:105,dur:.07,type:'triangle',gain:.018,slide:-45})};
BattleGame.prototype._sfxSteel=function(){tone(this,{freq:980,dur:.045,type:'square',gain:.033,slide:-180});tone(this,{freq:1480,dur:.07,type:'sine',gain:.022,delay:.012,slide:-320})};
BattleGame.prototype._sfxTankHit=function(){noise(this,{dur:.13,gain:.05,filter:520});tone(this,{freq:88,dur:.11,type:'sawtooth',gain:.025,slide:-30})};
BattleGame.prototype._sfxPower=function(){tone(this,{freq:880,dur:.11,type:'sine',gain:.032});tone(this,{freq:1320,dur:.16,type:'sine',gain:.034,delay:.115})};
BattleGame.prototype._sfxRumble=function(){tone(this,{freq:52,dur:.07,type:'sawtooth',gain:.012,slide:-8});noise(this,{dur:.055,gain:.010,filter:180})};
BattleGame.prototype._sfxWin=function(){
  const notes=[523.25,659.25,783.99,1046.5,783.99,1046.5];
  const times=[0,.14,.28,.45,.62,.78];
  notes.forEach((f,i)=>tone(this,{freq:f,dur:i<3?.16:.22,type:i<3?'square':'triangle',gain:.028,delay:times[i]}));
  tone(this,{freq:1567.98,dur:.42,type:'sine',gain:.025,delay:.96});
};

// Desbloquea audio tan pronto haya una interacción del usuario.
window.addEventListener('pointerdown',()=>{try{const g=window.__battleGameAudioUnlock;if(g)ctxFor(g)}catch{}},{passive:true});

// Disparo "piu".
const oldShoot=BattleGame.prototype.shootLocal;
BattleGame.prototype.shootLocal=function(){const before=this.lastShot;oldShoot.call(this);if(this.lastShot!==before)this._sfxShoot()};

// Rumble corto y repetido al avanzar, sin transformarlo en un zumbido continuo molesto.
const oldUpdateLocal=BattleGame.prototype.updateLocal;
BattleGame.prototype.updateLocal=function(dt){
  window.__battleGameAudioUnlock=this;
  const p=this.local?.group?.position?.clone();oldUpdateLocal.call(this,dt);
  if(!p||!this.local?.group)return;
  const moved=p.distanceToSquared(this.local.group.position)>.00005;
  const now=performance.now();
  if(moved&&now>(this._nextRumble||0)){this._nextRumble=now+145;this._sfxRumble()}
};

// Golpe a tanque "puff".
const oldApplyHit=BattleGame.prototype.applyHit;
BattleGame.prototype.applyHit=function(data){oldApplyHit.call(this,data);this._sfxTankHit()};

// Power-up "ding ding" solamente cuando se concede realmente.
const oldPowerGrant=BattleGame.prototype.applyPowerGrant;
BattleGame.prototype.applyPowerGrant=function(data){const existed=this.powers?.has(data?.id);oldPowerGrant.call(this,data);if(existed)this._sfxPower()};

// Música breve de victoria.
const oldFinish=BattleGame.prototype.finishMatch;
BattleGame.prototype.finishMatch=function(result){const wasEnded=this.ended;oldFinish.call(this,result);if(!wasEnded&&this.ended)this._sfxWin()};

// Reemplaza sólo la actualización de proyectiles para distinguir ladrillo, acero y tanque.
BattleGame.prototype.updateBullets=function(dt){
  for(let i=this.bullets.length-1;i>=0;i--){
    const b=this.bullets[i];b.life-=dt;b.mesh.position.addScaledVector(b.vel,dt);
    for(let j=this.bullets.length-1;j>i;j--){const o=this.bullets[j];if(o.life>0&&b.owner!==o.owner&&b.mesh.position.distanceToSquared(o.mesh.position)<.035){b.life=0;o.life=0;break}}
    let hitBlock=null;for(const [id,m] of this.blocks)if(Math.abs(b.mesh.position.x-m.position.x)<.5&&Math.abs(b.mesh.position.z-m.position.z)<.5){hitBlock={id,m};break}
    if(hitBlock){
      const isBrick=hitBlock.m.userData.type==='B',stars=this.stats.get(b.owner)?.stars||0,isSteel=hitBlock.m.userData.type==='S';
      if(isBrick){
        this._sfxBrick();
        const piece=this._brickPieceAt(hitBlock.m,b.mesh.position),willFinish=(hitBlock.m.userData.hp||4)<=1;
        let power=null;if(willFinish&&b.local&&this.hash(`${this.seed}-${hitBlock.id}`)%4===0)power=['star','shield','rapid','damage','speed','helmet','repair'][this.hash(`p-${this.seed}-${hitBlock.id}`)%7];
        const payload={kind:'brick-hit',id:hitBlock.id,piece,final:willFinish,power,x:hitBlock.m.position.x,z:hitBlock.m.position.z,powerId:`pb-${hitBlock.id}`};
        const gone=this.damageBrick(hitBlock.id,piece,true);if(gone&&power)this.spawnPower(power,payload.x,payload.z,payload.powerId,12);if(b.local)this.onDestroy(payload);
      }else if(isSteel){
        this._sfxSteel();
        if(stars>=3){const payload={kind:'destroy',id:hitBlock.id,power:null,x:hitBlock.m.position.x,z:hitBlock.m.position.z};this.destroyBlock(hitBlock.id,true);if(b.local)this.onDestroy(payload)}
      }
      b.life=0;
    }
    if(b.local&&b.life>0){for(const [id,s] of this.stats){if(id===b.owner||!s.alive)continue;const t=this.tankFor(id);if(!t)continue;if(Math.hypot(b.mesh.position.x-t.group.position.x,b.mesh.position.z-t.group.position.z)<.32){const shooter=this.stats.get(b.owner),friendly=this.mode!=='deathmatch'&&shooter?.team===s.team;const data={victim:id,attacker:b.owner,damage:friendly?0:b.damage,friendly};this.applyHit(data);this.onHit(data);b.life=0;break}}}
    if(Math.abs(b.mesh.position.x)>10||Math.abs(b.mesh.position.z)>7)b.life=0;
    if(b.life<=0){this.scene.remove(b.mesh);this.bullets.splice(i,1)}
  }
};
