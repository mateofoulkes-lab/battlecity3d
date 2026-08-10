import * as THREE from 'https://esm.sh/three@0.180.0';
import { BattleGame } from './game.js';

// Tablero exactamente en 20 x 14 tiles.
BattleGame.prototype.buildMap=function(){
  const rows=[
    'SSSSSSSSSSSSSSSSSSSS',
    'S..B...B..TTB...B..S',
    'S.BB.B.B.SS.B.B.BB.S',
    'S....B..WWW..B.....S',
    'S.B.SS.B.WW.B.SS.B.S',
    'S.B....B...B....B...S',
    'S..IBB..SS...BBI....S',
    'S..IBB..SS...BBI....S',
    'S.B....B...B....B...S',
    'S.B.SS.B.BB.B.SS.B.S',
    'S....B...WWW..B.....S',
    'S.BB.B.B.SS.B.B.BB.S',
    'S..B...BTT..B...B..S',
    'SSSSSSSSSSSSSSSSSSSS'
  ];
  rows.forEach((row,z)=>[...row].forEach((type,x)=>{
    const wx=x-9.5,wz=z-6.5;
    if(type==='B'||type==='S')this.addBlock(type,wx,wz,`${x}-${z}`);
    else if(type!=='.')this.addTerrain(type,wx,wz);
  }));
};

// Siluetas bien distintas por clase, manteniendo el color como identidad del jugador.
BattleGame.prototype.createTank=function(id){
  const cls=this.classFor(id)||'assault';
  const group=new THREE.Group(),body=new THREE.Group();group.position.y=.05;group.scale.setScalar(.5);group.add(body);
  const c=new THREE.Color(this.colorFor(id)),dark=c.clone().multiplyScalar(.40),light=c.clone().lerp(new THREE.Color(0xffffff),.18);
  const bodyMat=new THREE.MeshStandardMaterial({color:c,roughness:.55,metalness:.14}),lightMat=new THREE.MeshStandardMaterial({color:light,roughness:.5,metalness:.12}),darkMat=new THREE.MeshStandardMaterial({color:dark,roughness:.83});
  const cfg={
    scout:{trackX:.43,trackW:.27,trackL:1.08,hullW:.72,hullL:.95,hullH:.27,turretR:.31,barrelL:.72,barrelW:.12},
    assault:{trackX:.48,trackW:.34,trackL:1.28,hullW:.82,hullL:1.16,hullH:.34,turretR:.40,barrelL:.85,barrelW:.15},
    hunter:{trackX:.45,trackW:.29,trackL:1.22,hullW:.76,hullL:1.18,hullH:.26,turretR:.32,barrelL:1.20,barrelW:.12},
    heavy:{trackX:.56,trackW:.40,trackL:1.42,hullW:.96,hullL:1.30,hullH:.42,turretR:.48,barrelL:.86,barrelW:.20}
  }[cls];
  [-cfg.trackX,cfg.trackX].forEach(x=>{const t=new THREE.Mesh(new THREE.BoxGeometry(cfg.trackW,.34,cfg.trackL),darkMat);t.position.set(x,.25,0);t.castShadow=true;body.add(t)});
  const hull=new THREE.Mesh(new THREE.BoxGeometry(cfg.hullW,cfg.hullH,cfg.hullL),bodyMat);hull.position.y=.34;hull.castShadow=true;body.add(hull);
  if(cls==='heavy'){const front=new THREE.Mesh(new THREE.BoxGeometry(.88,.20,.26),lightMat);front.position.set(0,.47,.52);front.rotation.x=-.18;body.add(front)}
  if(cls==='scout'){const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.65,6),darkMat);antenna.position.set(.22,.70,-.28);body.add(antenna)}
  const turretPivot=new THREE.Group();turretPivot.position.y=cls==='heavy'?.68:.58;group.add(turretPivot);
  const turret=new THREE.Mesh(new THREE.CylinderGeometry(cfg.turretR*.88,cfg.turretR,.27,8),bodyMat);turret.castShadow=true;turretPivot.add(turret);
  if(cls==='hunter'){turret.scale.z=.72;const sight=new THREE.Mesh(new THREE.BoxGeometry(.16,.13,.24),lightMat);sight.position.set(.18,.19,.02);turretPivot.add(sight)}
  const barrel=new THREE.Mesh(new THREE.BoxGeometry(cfg.barrelW,cfg.barrelW,cfg.barrelL),bodyMat);barrel.position.set(0,.07,cfg.barrelL*.58);barrel.castShadow=true;turretPivot.add(barrel);
  const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(cfg.barrelW*.68,cfg.barrelW*.68,.20,8),darkMat);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.07,cfg.barrelL+0.13);turretPivot.add(muzzle);
  const team=this.stats.get(id)?.team;if(this.mode!=='deathmatch'){const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.06,7,24),new THREE.MeshBasicMaterial({color:team==='A'?0x42d3ff:0xff8d42}));ring.rotation.x=Math.PI/2;ring.position.y=.03;group.add(ring)}
  const label=this.makeTextSprite(this.players.get(id)?.name||'Jugador',28);label.scale.set(2.4,.60,1);label.position.set(0,1.65,0);group.add(label);
  return{group,body,turretPivot,targetPos:new THREE.Vector3(),targetBodyRot:0,targetTurretRot:0};
};

// Evita atravesar otros tanques.
const baseCollides=BattleGame.prototype.collides;
BattleGame.prototype.collides=function(x,z){
  if(baseCollides.call(this,x,z))return true;
  for(const [id,s] of this.stats){if(id===this.selfId||!s.alive)continue;const t=this.tankFor(id);if(t&&Math.hypot(x-t.group.position.x,z-t.group.position.z)<.48)return true}
  return false;
};

// Regla clásica: con 3 estrellas se puede romper acero. También anulamos proyectiles que chocan entre sí.
BattleGame.prototype.updateBullets=function(dt){
  for(let i=this.bullets.length-1;i>=0;i--){
    const b=this.bullets[i];b.life-=dt;b.mesh.position.addScaledVector(b.vel,dt);
    for(let j=this.bullets.length-1;j>i;j--){const o=this.bullets[j];if(o.life>0&&b.owner!==o.owner&&b.mesh.position.distanceToSquared(o.mesh.position)<.035){b.life=0;o.life=0;break}}
    let hitBlock=null;for(const [id,m] of this.blocks)if(Math.abs(b.mesh.position.x-m.position.x)<.5&&Math.abs(b.mesh.position.z-m.position.z)<.5){hitBlock={id,m};break}
    if(hitBlock){
      const isBrick=hitBlock.m.userData.type==='B',stars=this.stats.get(b.owner)?.stars||0,isSteel=hitBlock.m.userData.type==='S';
      if(isBrick||(isSteel&&stars>=3)){
        let power=null;if(isBrick&&b.local&&this.hash(`${this.seed}-${hitBlock.id}`)%4===0)power=['star','shield','rapid','damage','speed','helmet','repair'][this.hash(`p-${this.seed}-${hitBlock.id}`)%7];
        const payload={id:hitBlock.id,power,x:hitBlock.m.position.x,z:hitBlock.m.position.z,powerId:`pb-${hitBlock.id}`};this.destroyBlock(hitBlock.id,true);if(power)this.spawnPower(power,payload.x,payload.z,payload.powerId,12);if(b.local)this.onDestroy(payload);
      }
      b.life=0;
    }
    if(b.local&&b.life>0){for(const [id,s] of this.stats){if(id===b.owner||!s.alive)continue;const t=this.tankFor(id);if(!t)continue;if(Math.hypot(b.mesh.position.x-t.group.position.x,b.mesh.position.z-t.group.position.z)<.32){const shooter=this.stats.get(b.owner),friendly=this.mode!=='deathmatch'&&shooter?.team===s.team;const data={victim:id,attacker:b.owner,damage:friendly?0:b.damage,friendly};this.applyHit(data);this.onHit(data);b.life=0;break}}}
    if(Math.abs(b.mesh.position.x)>10||Math.abs(b.mesh.position.z)>7)b.life=0;
    if(b.life<=0){this.scene.remove(b.mesh);this.bullets.splice(i,1)}
  }
};

// Temporizador de partida: 5 min DM/TDM, 7 min CTF. Si vence, gana quien vaya arriba.
const baseStart=BattleGame.prototype.start;
BattleGame.prototype.start=function(){
  baseStart.call(this);
  this.timeLimit=this.mode==='ctf'?420:300;
  this._timerLoop=setInterval(()=>{
    if(!this.running||this.ended)return;
    const remain=Math.max(0,Math.ceil(this.timeLimit-this.matchTime)),m=String(Math.floor(remain/60)).padStart(2,'0'),s=String(remain%60).padStart(2,'0'),el=document.querySelector('#hudTimer');if(el){el.textContent=`${m}:${s}`;el.classList.toggle('urgent',remain<=30)}
    if(remain<=0&&this.selfId===this.adminId){
      let winner;
      if(this.mode==='deathmatch'){const sorted=[...this.stats.entries()].sort((a,b)=>b[1].kills-a[1].kills||a[1].deaths-b[1].deaths);winner={type:'player',id:sorted[0]?.[0]}}
      else winner={type:'team',team:this.teamScore.A>=this.teamScore.B?'A':'B'};
      const result=this.makeResult(winner);result.title=(this.mode!=='deathmatch'&&this.teamScore.A===this.teamScore.B)?'🤝 Empate por tiempo':result.title+' · tiempo';this.onMatch(result);this.finishMatch(result);
    }
  },250);
  // Bases de CTF más legibles.
  if(this.mode==='ctf'){for(const team of ['A','B']){const f=this.flags[team],pad=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.06,24),new THREE.MeshStandardMaterial({color:team==='A'?0x42d3ff:0xff8d42,transparent:true,opacity:.36,emissive:team==='A'?0x42d3ff:0xff8d42,emissiveIntensity:.25}));pad.position.copy(f.home);pad.position.y=.02;this.scene.add(pad)}}
};
const baseStop=BattleGame.prototype.stop;
BattleGame.prototype.stop=function(){clearInterval(this._timerLoop);baseStop.call(this)};

// Sonido procedural liviano: no requiere assets y funciona en PC/móvil.
BattleGame.prototype._sound=function(freq=220,dur=.06,type='square',gain=.025){
  try{this.audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(this.audioCtx.state==='suspended')this.audioCtx.resume();const o=this.audioCtx.createOscillator(),g=this.audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.audioCtx.currentTime);g.gain.setValueAtTime(gain,this.audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.audioCtx.currentTime+dur);o.connect(g);g.connect(this.audioCtx.destination);o.start();o.stop(this.audioCtx.currentTime+dur)}catch{}
};
const baseShoot=BattleGame.prototype.shootLocal;
BattleGame.prototype.shootLocal=function(){const before=this.lastShot;baseShoot.call(this);if(this.lastShot!==before)this._sound(this.classFor(this.selfId)==='heavy'?110:180,.07,'square',.035)};
const baseExplosion=BattleGame.prototype.spawnExplosion;
BattleGame.prototype.spawnExplosion=function(pos){baseExplosion.call(this,pos);this._sound(72,.16,'sawtooth',.045)};
const baseGrant=BattleGame.prototype.applyPowerGrant;
BattleGame.prototype.applyPowerGrant=function(data){const existed=this.powers.has(data.id);baseGrant.call(this,data);if(existed&&data.player===this.selfId)this._sound(620,.12,'sine',.035)};

// Reaparición más visible, con pulso de protección temporal.
const baseRespawn=BattleGame.prototype.respawn;
BattleGame.prototype.respawn=function(id,initial=false){baseRespawn.call(this,id,initial);const t=this.tankFor(id);if(!t)return;const ring=new THREE.Mesh(new THREE.RingGeometry(.38,.62,28),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.copy(t.group.position);ring.position.y=.06;this.scene.add(ring);const born=performance.now(),tick=()=>{const a=(performance.now()-born)/1000;if(a>1.15||!this.running){this.scene?.remove(ring);return}ring.scale.setScalar(1+a*.9);ring.material.opacity=.75*(1-a/1.15);requestAnimationFrame(tick)};tick()};
