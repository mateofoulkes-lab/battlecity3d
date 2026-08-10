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

// Texturas procedurales: quedan dentro del juego y no dependemos de licencias externas.
function canvasTexture(kind){
  const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  if(kind==='brick'){
    g.fillStyle='#7c3827';g.fillRect(0,0,128,128);const h=27;
    for(let y=-4,row=0;y<132;y+=h,row++){
      const off=row%2?-24:0;
      for(let x=off;x<132;x+=48){
        const shade=105+Math.floor(Math.random()*35);g.fillStyle=`rgb(${shade+45},${Math.floor(shade*.48)},${Math.floor(shade*.32)})`;g.fillRect(x+2,y+2,44,h-5);
        g.fillStyle='rgba(255,210,175,.13)';g.fillRect(x+4,y+4,39,3);
        g.fillStyle='rgba(40,12,8,.24)';g.fillRect(x+3,y+h-7,40,3);
      }
      g.fillStyle='#b6957d';g.fillRect(0,y+h-3,128,3);
    }
    g.globalAlpha=.13;for(let i=0;i<260;i++){g.fillStyle=Math.random()>.5?'#fff':'#000';g.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*2,1+Math.random()*2)}g.globalAlpha=1;
  }else if(kind==='steel'){
    const grad=g.createLinearGradient(0,0,128,128);grad.addColorStop(0,'#536171');grad.addColorStop(.45,'#aeb8c3');grad.addColorStop(.62,'#687685');grad.addColorStop(1,'#c4ccd4');g.fillStyle=grad;g.fillRect(0,0,128,128);
    g.globalAlpha=.24;for(let i=0;i<90;i++){g.strokeStyle=i%2?'#fff':'#1f2937';g.beginPath();g.moveTo(0,Math.random()*128);g.lineTo(128,Math.random()*128);g.stroke()}g.globalAlpha=1;
    [[13,13],[115,13],[13,115],[115,115]].forEach(([x,y])=>{g.fillStyle='#36414d';g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fill();g.fillStyle='#cdd5dc';g.beginPath();g.arc(x-1.5,y-1.5,1.5,0,Math.PI*2);g.fill()});
  }else if(kind==='floor'){
    g.fillStyle='#34475a';g.fillRect(0,0,128,128);g.globalAlpha=.18;for(let i=0;i<700;i++){const v=70+Math.floor(Math.random()*70);g.fillStyle=`rgb(${v},${v+7},${v+10})`;g.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*2,1+Math.random()*2)}g.globalAlpha=1;
    g.strokeStyle='rgba(10,18,28,.35)';g.lineWidth=2;for(let i=0;i<=128;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,128);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(128,i);g.stroke()}
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
const TEX={brick:canvasTexture('brick'),steel:canvasTexture('steel'),floor:canvasTexture('floor')};

// Cada ladrillo son cuatro secciones. Un disparo rompe una sección, no toda la pared.
BattleGame.prototype.addBlock=function(type,x,z,id){
  if(type==='S'){
    const tex=TEX.steel.clone();tex.needsUpdate=true;tex.repeat.set(1.2,1.2);
    const mat=new THREE.MeshStandardMaterial({map:tex,color:0xffffff,roughness:.58,metalness:.52});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.94,.76,.94),mat);mesh.position.set(x,.38,z);mesh.castShadow=mesh.receiveShadow=true;mesh.userData={id,type:'S'};this.scene.add(mesh);this.blocks.set(id,mesh);return;
  }
  const group=new THREE.Group();group.position.set(x,0,z);group.userData={id,type:'B',hp:4,pieces:[]};
  const coords=[[-.235,-.235],[.235,-.235],[-.235,.235],[.235,.235]];
  coords.forEach(([px,pz],idx)=>{
    const tex=TEX.brick.clone();tex.needsUpdate=true;tex.repeat.set(.72,.72);tex.offset.set((idx%2)*.13,idx>1?.19:0);
    const mat=new THREE.MeshStandardMaterial({map:tex,color:0xffffff,roughness:.92,metalness:0});
    const part=new THREE.Mesh(new THREE.BoxGeometry(.445,.66,.445),mat);part.position.set(px,.33,pz);part.castShadow=part.receiveShadow=true;part.userData={piece:idx};group.add(part);group.userData.pieces[idx]=part;
  });
  this.scene.add(group);this.blocks.set(id,group);
};

BattleGame.prototype._brickPieceAt=function(group,worldPos){
  let best=-1,bestD=Infinity;for(let i=0;i<group.userData.pieces.length;i++){const p=group.userData.pieces[i];if(!p?.parent)continue;const wx=group.position.x+p.position.x,wz=group.position.z+p.position.z,d=(worldPos.x-wx)**2+(worldPos.z-wz)**2;if(d<bestD){bestD=d;best=i}}
  return best;
};
BattleGame.prototype.damageBrick=function(id,piece,showDebris=true){
  const g=this.blocks.get(id);if(!g||g.userData.type!=='B')return false;let p=g.userData.pieces[piece];if(!p?.parent){piece=g.userData.pieces.findIndex(q=>q?.parent);p=g.userData.pieces[piece]}if(!p?.parent)return false;
  if(showDebris){const wp=new THREE.Vector3();p.getWorldPosition(wp);this.spawnDebris(wp,new THREE.Color(0xa94f32))}
  g.remove(p);g.userData.hp=Math.max(0,(g.userData.hp||1)-1);
  if(g.userData.hp<=0){this.scene.remove(g);this.blocks.delete(id);return true}
  return false;
};

// Destrucción completa robusta para acero y cualquier bloque restante.
BattleGame.prototype.destroyBlock=function(id,debris=true){
  const obj=this.blocks.get(id);if(!obj)return;this.blocks.delete(id);this.scene.remove(obj);
  if(debris){const col=obj.userData.type==='S'?new THREE.Color(0x8996a4):new THREE.Color(0xa94f32);this.spawnDebris(obj.position,col)}
};

// Sincroniza golpes parciales de ladrillo entre peers.
BattleGame.prototype.receiveDestroy=function(data){
  if(data?.kind==='brick-hit'){
    const gone=this.damageBrick(data.id,data.piece,true);
    if((gone||data.final)&&data.power&&data.x!=null)this.spawnPower(data.power,data.x,data.z,data.powerId||`block-${data.id}`,12);
    return;
  }
  this.destroyBlock(data.id,true);if(data.power&&data.x!=null)this.spawnPower(data.power,data.x,data.z,data.powerId||`block-${data.id}`,12);
};

// Regla clásica: 3 estrellas rompen acero. Proyectiles enemigos también se anulan entre sí.
BattleGame.prototype.updateBullets=function(dt){
  for(let i=this.bullets.length-1;i>=0;i--){
    const b=this.bullets[i];b.life-=dt;b.mesh.position.addScaledVector(b.vel,dt);
    for(let j=this.bullets.length-1;j>i;j--){const o=this.bullets[j];if(o.life>0&&b.owner!==o.owner&&b.mesh.position.distanceToSquared(o.mesh.position)<.035){b.life=0;o.life=0;break}}
    let hitBlock=null;for(const [id,m] of this.blocks)if(Math.abs(b.mesh.position.x-m.position.x)<.5&&Math.abs(b.mesh.position.z-m.position.z)<.5){hitBlock={id,m};break}
    if(hitBlock){
      const isBrick=hitBlock.m.userData.type==='B',stars=this.stats.get(b.owner)?.stars||0,isSteel=hitBlock.m.userData.type==='S';
      if(isBrick){
        const piece=this._brickPieceAt(hitBlock.m,b.mesh.position),willFinish=(hitBlock.m.userData.hp||4)<=1;
        let power=null;if(willFinish&&b.local&&this.hash(`${this.seed}-${hitBlock.id}`)%4===0)power=['star','shield','rapid','damage','speed','helmet','repair'][this.hash(`p-${this.seed}-${hitBlock.id}`)%7];
        const payload={kind:'brick-hit',id:hitBlock.id,piece,final:willFinish,power,x:hitBlock.m.position.x,z:hitBlock.m.position.z,powerId:`pb-${hitBlock.id}`};
        const gone=this.damageBrick(hitBlock.id,piece,true);if(gone&&power)this.spawnPower(power,payload.x,payload.z,payload.powerId,12);if(b.local)this.onDestroy(payload);
      }else if(isSteel&&stars>=3){
        const payload={kind:'destroy',id:hitBlock.id,power:null,x:hitBlock.m.position.x,z:hitBlock.m.position.z};this.destroyBlock(hitBlock.id,true);if(b.local)this.onDestroy(payload);
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
  // Textura también en el piso para sacar el aspecto de color plano.
  const floor=this.scene.children.find(o=>o.isMesh&&o.geometry?.parameters?.width===20&&o.geometry?.parameters?.depth===14);
  if(floor?.material){const ft=TEX.floor.clone();ft.needsUpdate=true;ft.repeat.set(10,7);floor.material.map=ft;floor.material.color.set(0xffffff);floor.material.needsUpdate=true}
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
