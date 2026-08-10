import * as THREE from 'https://esm.sh/three@0.180.0';
import { BattleGame } from './game.js';

// Tuning arcade: tanques mucho más lentos y stun temporal con cuenta regresiva visible.
const SPEED_FACTOR = 0.38;
const STUN_MS = 2600;

function makeCountdownSprite(){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  const tex=new THREE.CanvasTexture(canvas);
  tex.minFilter=THREE.LinearFilter;
  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false});
  const sprite=new THREE.Sprite(mat);
  sprite.scale.set(1.15,.58,1);
  sprite.position.set(0,2.4,0);
  sprite.visible=false;
  sprite.userData={canvas,ctx,tex,lastText:''};
  return sprite;
}

function updateCountdownFor(game,id){
  const s=game.stats?.get(id),tank=game.tankFor?.(id);
  if(!s||!tank)return;
  if(!tank.stunCountdown){
    tank.stunCountdown=makeCountdownSprite();
    tank.group.add(tank.stunCountdown);
  }
  const sprite=tank.stunCountdown;
  const left=(s.stunUntil||0)-performance.now();
  if(left<=0||!s.alive){sprite.visible=false;return;}
  const text=(left/1000).toFixed(1);
  sprite.visible=true;
  if(sprite.userData.lastText===text)return;
  sprite.userData.lastText=text;
  const {canvas,ctx,tex}=sprite.userData;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='rgba(8,12,20,.82)';
  ctx.beginPath();ctx.roundRect(16,28,96,70,24);ctx.fill();
  ctx.strokeStyle='#ffd84a';ctx.lineWidth=5;ctx.stroke();
  ctx.font='900 48px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  ctx.fillText(text,64,63);
  tex.needsUpdate=true;
}

const originalApplyHit=BattleGame.prototype.applyHit;
BattleGame.prototype.applyHit=function(data){
  if(data?.friendly){
    const s=this.stats?.get(data.victim);
    if(!s||!s.alive)return;
    // Cada impacto reinicia un stun corto; nunca queda permanente.
    s.stunUntil=performance.now()+STUN_MS;
    if(data.victim===this.selfId)this.toast?.('⚡ PARALIZADO · 2.6 s');
    updateCountdownFor(this,data.victim);
    return;
  }
  return originalApplyHit.call(this,data);
};

const originalUpdateLocal=BattleGame.prototype.updateLocal;
BattleGame.prototype.updateLocal=function(dt){
  const tank=this.local;
  if(!tank)return originalUpdateLocal.call(this,dt);
  const before=tank.group.position.clone();
  const result=originalUpdateLocal.call(this,dt);
  // Conserva toda la lógica original de colisiones/hielo, pero reduce mucho el desplazamiento efectivo.
  tank.group.position.lerpVectors(before,tank.group.position,SPEED_FACTOR);
  updateCountdownFor(this,this.selfId);
  return result;
};

const originalUpdateRemote=BattleGame.prototype.updateRemote;
BattleGame.prototype.updateRemote=function(dt){
  const result=originalUpdateRemote.call(this,dt);
  for(const id of this.remote.keys())updateCountdownFor(this,id);
  return result;
};
