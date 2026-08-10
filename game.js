import * as THREE from 'https://esm.sh/three@0.180.0';

const SPAWNS=[[-8,5],[8,-5],[-8,-5],[8,5],[-8,0],[8,0],[0,5],[0,-5]];
const CLASS_STATS={
  scout:{speed:5.5,turret:16,cooldown:.30,damage:1,hp:2,bullet:12.8,label:'Scout'},
  assault:{speed:4.5,turret:14,cooldown:.40,damage:1,hp:3,bullet:11.2,label:'Assault'},
  hunter:{speed:3.8,turret:17,cooldown:.72,damage:2,hp:2,bullet:14.2,label:'Hunter'},
  heavy:{speed:3.25,turret:10,cooldown:.52,damage:1,hp:5,bullet:9.8,label:'Heavy'}
};
const POWERUPS={
  star:{icon:'⭐',name:'MEJORA',color:0xffd54a},
  shield:{icon:'🛡️',name:'ESCUDO +1',color:0x55b7ff},
  rapid:{icon:'⚡',name:'DISPARO RÁPIDO',color:0xff8b3d},
  damage:{icon:'💥',name:'DAÑO +1',color:0xff5050},
  speed:{icon:'🚀',name:'VELOCIDAD',color:0x44e087},
  helmet:{icon:'🪖',name:'INVULNERABLE',color:0xd98cff},
  repair:{icon:'🔧',name:'REPARADO',color:0x76e4f7}
};
const POWER_KEYS=Object.keys(POWERUPS);

export class BattleGame{
  constructor({root,selfId,adminId,players,mode,seed,colorFor,classFor,onState,onShoot,onDestroy,onHit,onPower,onFlag,onMatch,onEnd}){
    Object.assign(this,{root,selfId,adminId,players,mode,seed,colorFor,classFor,onState,onShoot,onDestroy,onHit,onPower,onFlag,onMatch,onEnd});
    this.remote=new Map();this.blocks=new Map();this.terrain=[];this.bullets=[];this.debris=[];this.powers=new Map();this.keys=new Set();this.moveInput=new THREE.Vector2();this.aimPoint=new THREE.Vector3(0,0,1);this.clock=new THREE.Clock();this.lastState=0;this.lastShot=0;this.running=false;this.ended=false;this.nextPowerAt=8+Math.random()*6;this.matchTime=0;this.toastTimer=0;
    this.stats=new Map();this.flags={A:{team:'A',home:new THREE.Vector3(-8.35,0,-5.25),carrier:null,dropped:null},B:{team:'B',home:new THREE.Vector3(8.35,0,5.25),carrier:null,dropped:null}};this.flagMeshes={};
    const ids=[...players.keys()].sort();ids.forEach((id,i)=>{const cls=classFor(id),base=CLASS_STATS[cls]||CLASS_STATS.assault;this.stats.set(id,{kills:0,deaths:0,hp:base.hp,maxHp:base.hp,alive:true,team:i%2===0?'A':'B',stars:0,stunUntil:0,invulnUntil:0,speedUntil:0,rapidUntil:0,damageUntil:0,spawnShieldUntil:0})});
    this.teamScore={A:0,B:0};
  }

  start(){
    this.running=true;this.root.innerHTML='';
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x151c27);this.scene.fog=new THREE.Fog(0x151c27,25,46);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.root.appendChild(this.renderer.domElement);
    this.camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100);this.fitCamera();
    this.scene.add(new THREE.HemisphereLight(0xc9e1ff,0x243322,2.15));const sun=new THREE.DirectionalLight(0xffffff,2.7);sun.position.set(-8,17,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;this.scene.add(sun);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(20,.35,14),new THREE.MeshStandardMaterial({color:0x33465b,roughness:.95}));floor.position.y=-.22;floor.receiveShadow=true;this.scene.add(floor);this.addGrid();this.buildMap();
    if(this.mode==='ctf')this.buildFlags();
    const ids=[...this.players.keys()].sort(),i=Math.max(0,ids.indexOf(this.selfId)),p=SPAWNS[i%SPAWNS.length];this.local=this.createTank(this.selfId);this.local.group.position.set(p[0],0,p[1]);this.scene.add(this.local.group);ids.filter(id=>id!==this.selfId).forEach(id=>this.ensureRemote(id));
    this.respawn(this.selfId,true);this.bindInput();this.clock.start();this.animate();this.updateHud();
  }
  stop(){this.running=false;window.removeEventListener('resize',this.fitCamera);window.onkeydown=null;window.onkeyup=null;}

  fitCamera=()=>{if(!this.camera||!this.renderer)return;const aspect=innerWidth/innerHeight,worldW=22,worldH=16;let viewW=worldW,viewH=worldW/aspect;if(viewH<worldH){viewH=worldH;viewW=worldH*aspect}const c=this.camera;c.left=-viewW/2;c.right=viewW/2;c.top=viewH/2;c.bottom=-viewH/2;c.position.set(0,24,8.7);c.lookAt(0,0,0);c.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight,false)};
  addGrid(){const mat=new THREE.LineBasicMaterial({color:0x61758b,transparent:true,opacity:.18}),pts=[];for(let x=-10;x<=10;x++)pts.push(new THREE.Vector3(x,.01,-7),new THREE.Vector3(x,.01,7));for(let z=-7;z<=7;z++)pts.push(new THREE.Vector3(-10,.01,z),new THREE.Vector3(10,.01,z));this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),mat))}

  buildMap(){
    const rows=['SSSSSSSSSSSSSSSSSSSS','S..B...B..TTB...B..S','S.BB.B.B.SS.B.B.BB.S','S....B..WWW...B.....S','S.B.SS.B.WW.B.SS.B.S','S.B....B....B....B..S','S..IBB...SS...BBI...S','S..IBB...SS...BBI...S','S.B....B....B....B..S','S.B.SS.B.BB.B.SS.B.S','S.....B...WWW..B....S','S.BB.B.B.SS.B.B.BB.S','S..B...BTT..B...B..S','SSSSSSSSSSSSSSSSSSSS'];
    rows.forEach((row,z)=>[...row].forEach((type,x)=>{const wx=x-9.5,wz=z-6.5;if(type==='B'||type==='S')this.addBlock(type,wx,wz,`${x}-${z}`);else if(type!=='.')this.addTerrain(type,wx,wz)}));
  }
  addBlock(type,x,z,id){const steel=type==='S',geo=new THREE.BoxGeometry(.94,steel?.76:.68,.94),mat=new THREE.MeshStandardMaterial({color:steel?0x8795a5:0xb35637,roughness:.8,metalness:steel?.38:0});const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,geo.parameters.height/2,z);mesh.castShadow=mesh.receiveShadow=true;mesh.userData={id,type};this.scene.add(mesh);this.blocks.set(id,mesh)}
  addTerrain(type,x,z){
    if(type==='W'){const m=new THREE.Mesh(new THREE.BoxGeometry(.94,.08,.94),new THREE.MeshStandardMaterial({color:0x2f87b9,roughness:.25,metalness:.08,transparent:true,opacity:.82}));m.position.set(x,.01,z);m.userData={type:'W',solid:true};this.scene.add(m);this.terrain.push(m);return}
    if(type==='I'){const m=new THREE.Mesh(new THREE.BoxGeometry(.94,.05,.94),new THREE.MeshStandardMaterial({color:0xbce9f5,roughness:.18,metalness:.15,transparent:true,opacity:.8}));m.position.set(x,.02,z);m.userData={type:'I',solid:false};this.scene.add(m);this.terrain.push(m);return}
    if(type==='T'){const g=new THREE.Group();for(let i=0;i<3;i++){const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,.5,6),new THREE.MeshStandardMaterial({color:0x6c4a2f}));trunk.position.set((i-1)*.22,.25,(i%2)*.12-.05);g.add(trunk);const crown=new THREE.Mesh(new THREE.SphereGeometry(.27,7,5),new THREE.MeshStandardMaterial({color:0x2f7e4e,roughness:1,transparent:true,opacity:.88}));crown.position.set((i-1)*.22,.62,(i%2)*.12-.05);g.add(crown)}g.position.set(x,0,z);g.userData={type:'T',solid:false};this.scene.add(g);this.terrain.push(g)}
  }

  createTank(id){
    const group=new THREE.Group(),body=new THREE.Group();group.position.y=.05;group.scale.setScalar(.5);group.add(body);const c=new THREE.Color(this.colorFor(id)),dark=c.clone().multiplyScalar(.42),bodyMat=new THREE.MeshStandardMaterial({color:c,roughness:.55,metalness:.14}),darkMat=new THREE.MeshStandardMaterial({color:dark,roughness:.83});
    [-.48,.48].forEach(x=>{const t=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,1.28),darkMat);t.position.set(x,.25,0);t.castShadow=true;body.add(t)});const hull=new THREE.Mesh(new THREE.BoxGeometry(.82,.34,1.16),bodyMat);hull.position.y=.37;hull.castShadow=true;body.add(hull);
    const turretPivot=new THREE.Group();turretPivot.position.y=.58;group.add(turretPivot);const turret=new THREE.Mesh(new THREE.CylinderGeometry(.38,.44,.28,8),bodyMat);turret.castShadow=true;turretPivot.add(turret);const barrel=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,.85),bodyMat);barrel.position.set(0,.07,.55);barrel.castShadow=true;turretPivot.add(barrel);const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.22,8),darkMat);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.07,1.02);turretPivot.add(muzzle);
    const team=this.stats.get(id)?.team;if(this.mode!=='deathmatch'){const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.06,7,24),new THREE.MeshBasicMaterial({color:team==='A'?0x42d3ff:0xff8d42}));ring.rotation.x=Math.PI/2;ring.position.y=.03;group.add(ring)}
    return{group,body,turretPivot,targetPos:new THREE.Vector3(),targetBodyRot:0,targetTurretRot:0};
  }
  ensureRemote(id){let t=this.remote.get(id);if(t)return t;const ids=[...this.players.keys()].sort(),i=Math.max(0,ids.indexOf(id)),p=SPAWNS[i%SPAWNS.length];t=this.createTank(id);t.group.position.set(p[0],0,p[1]);t.targetPos.copy(t.group.position);this.scene.add(t.group);this.remote.set(id,t);return t}
  tankFor(id){return id===this.selfId?this.local:this.remote.get(id)}

  receiveState(id,data){const t=this.ensureRemote(id);t.targetPos.set(data.x,0,data.z);t.targetBodyRot=data.bodyRot;t.targetTurretRot=data.turretRot}
  receiveShoot(id,data){this.spawnBullet(id,new THREE.Vector3(data.x,.3,data.z),data.angle,false,data.damage,data.speed)}
  receiveDestroy(data){this.destroyBlock(data.id,true);if(data.power&&data.x!=null)this.spawnPower(data.power,data.x,data.z,data.powerId||`block-${data.id}`,12)}
  receiveHit(data){this.applyHit(data)}
  receivePower(data,peerId){
    if(data.kind==='spawn'){this.spawnPower(data.type,data.x,data.z,data.id,data.ttl||9);return}
    if(data.kind==='claim'&&this.selfId===this.adminId){const p=this.powers.get(data.id),tank=this.tankFor(data.player);if(p&&tank&&tank.group.position.distanceTo(p.mesh.position)<.75){const grant={kind:'grant',id:data.id,player:data.player,type:p.type};this.applyPowerGrant(grant);this.onPower(grant)}return}
    if(data.kind==='grant')this.applyPowerGrant(data)
  }
  receiveFlag(data){this.applyFlag(data)}
  receiveMatch(data,peerId){if(peerId!==this.adminId)return;this.finishMatch(data)}
  removePeer(id){const t=this.remote.get(id);if(t)this.scene.remove(t.group);this.remote.delete(id);this.stats.delete(id)}

  bindInput(){
    const canvas=this.renderer.domElement,raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();const point=e=>{const r=canvas.getBoundingClientRect();mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(mouse,this.camera);const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),out=new THREE.Vector3();raycaster.ray.intersectPlane(plane,out);return out};
    canvas.onpointermove=e=>{if(e.pointerType==='mouse')this.aimPoint.copy(point(e))};canvas.onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;this.aimPoint.copy(point(e));this.shootLocal()};window.onkeydown=e=>this.keys.add(e.code);window.onkeyup=e=>this.keys.delete(e.code);window.addEventListener('resize',this.fitCamera);
    const joy=document.querySelector('#joystick'),knob=document.querySelector('#joystickKnob');let pointer=null,origin=new THREE.Vector2();joy.onpointerdown=e=>{e.preventDefault();e.stopPropagation();pointer=e.pointerId;joy.setPointerCapture(e.pointerId);origin.set(e.clientX,e.clientY)};joy.onpointermove=e=>{if(e.pointerId!==pointer)return;e.preventDefault();e.stopPropagation();const dx=e.clientX-origin.x,dy=e.clientY-origin.y,max=38,len=Math.hypot(dx,dy)||1,s=Math.min(1,max/len),x=dx*s,y=dy*s;knob.style.transform=`translate(${x}px,${y}px)`;this.moveInput.set(x/max,y/max)};const end=e=>{if(e.pointerId!==pointer)return;pointer=null;this.moveInput.set(0,0);knob.style.transform='translate(0,0)'};joy.onpointerup=end;joy.onpointercancel=end;
  }

  movement(){let x=this.moveInput.x,z=this.moveInput.y;if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x--;if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x++;if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))z--;if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))z++;const v=new THREE.Vector2(x,z);if(v.lengthSq()>1)v.normalize();return v}
  solidAt(x,z){for(const m of this.blocks.values())if(Math.abs(x-m.position.x)<.55&&Math.abs(z-m.position.z)<.55)return true;for(const m of this.terrain)if(m.userData.solid&&Math.abs(x-m.position.x)<.52&&Math.abs(z-m.position.z)<.52)return true;return false}
  collides(x,z){if(x<-9.28||x>9.28||z<-6.28||z>6.28)return true;return this.solidAt(x,z)}
  onIce(x,z){return this.terrain.some(m=>m.userData.type==='I'&&Math.abs(x-m.position.x)<.48&&Math.abs(z-m.position.z)<.48)}

  updateLocal(dt){
    const t=this.local,s=this.stats.get(this.selfId);if(!t||!s||!s.alive)return;const now=performance.now();const mv=this.movement();if(now<s.stunUntil)return;const cls=CLASS_STATS[this.classFor(this.selfId)]||CLASS_STATS.assault,speed=cls.speed*(now<s.speedUntil?1.35:1);
    if(!this.slideVel)this.slideVel=new THREE.Vector2();if(mv.lengthSq()>.001){if(this.onIce(t.group.position.x,t.group.position.z))this.slideVel.lerp(mv,.12);else this.slideVel.copy(mv);t.body.rotation.y=this.lerpAngle(t.body.rotation.y,Math.atan2(mv.x,mv.y),Math.min(1,dt*11))}else if(!this.onIce(t.group.position.x,t.group.position.z))this.slideVel.multiplyScalar(Math.max(0,1-dt*12));else this.slideVel.multiplyScalar(Math.max(0,1-dt*.7));
    const vel=this.slideVel,nx=t.group.position.x+vel.x*speed*dt,nz=t.group.position.z+vel.y*speed*dt;if(!this.collides(nx,t.group.position.z))t.group.position.x=nx;else this.slideVel.x=0;if(!this.collides(t.group.position.x,nz))t.group.position.z=nz;else this.slideVel.y=0;
    const dx=this.aimPoint.x-t.group.position.x,dz=this.aimPoint.z-t.group.position.z;if(dx*dx+dz*dz>.03)t.turretPivot.rotation.y=this.lerpAngle(t.turretPivot.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*cls.turret));
    if(now-this.lastState>55){this.lastState=now;this.onState({x:t.group.position.x,z:t.group.position.z,bodyRot:t.body.rotation.y,turretRot:t.turretPivot.rotation.y})}
    this.checkPowerPickup();if(this.mode==='ctf')this.updateCTFLocal();
  }

  shootLocal(){const s=this.stats.get(this.selfId);if(!this.local||!s?.alive||performance.now()<s.stunUntil)return;const cls=CLASS_STATS[this.classFor(this.selfId)]||CLASS_STATS.assault,now=performance.now(),cool=cls.cooldown*Math.pow(.88,s.stars)*(now<s.rapidUntil?.65:1);if(now-this.lastShot<cool*1000)return;this.lastShot=now;const a=this.local.turretPivot.rotation.y,o=this.local.group.position.clone();o.x+=Math.sin(a)*.58;o.z+=Math.cos(a)*.58;o.y=.3;const damage=cls.damage+(now<s.damageUntil?1:0),speed=cls.bullet;this.spawnBullet(this.selfId,o,a,true,damage,speed);this.onShoot({x:o.x,z:o.z,angle:a,damage,speed})}
  spawnBullet(owner,origin,angle,local,damage=1,speed=11){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.075,9,7),new THREE.MeshBasicMaterial({color:0xffe16a}));mesh.position.copy(origin);this.scene.add(mesh);this.bullets.push({mesh,owner,vel:new THREE.Vector3(Math.sin(angle)*speed,0,Math.cos(angle)*speed),life:2.2,local,damage})}

  updateBullets(dt){
    for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.life-=dt;b.mesh.position.addScaledVector(b.vel,dt);let hitBlock=null;for(const [id,m] of this.blocks)if(Math.abs(b.mesh.position.x-m.position.x)<.5&&Math.abs(b.mesh.position.z-m.position.z)<.5){hitBlock={id,m};break}
      if(hitBlock){if(hitBlock.m.userData.type==='B'){let power=null;if(b.local&&this.hash(`${this.seed}-${hitBlock.id}`)%4===0)power=POWER_KEYS[this.hash(`p-${this.seed}-${hitBlock.id}`)%POWER_KEYS.length];const payload={id:hitBlock.id,power,x:hitBlock.m.position.x,z:hitBlock.m.position.z,powerId:`pb-${hitBlock.id}`};this.destroyBlock(hitBlock.id,true);if(power)this.spawnPower(power,payload.x,payload.z,payload.powerId,12);if(b.local)this.onDestroy(payload)}b.life=0}
      if(b.local&&b.life>0){for(const [id,s] of this.stats){if(id===b.owner||!s.alive)continue;const t=this.tankFor(id);if(!t)continue;if(Math.hypot(b.mesh.position.x-t.group.position.x,b.mesh.position.z-t.group.position.z)<.32){const shooter=this.stats.get(b.owner),friendly=this.mode!=='deathmatch'&&shooter?.team===s.team;const data={victim:id,attacker:b.owner,damage:friendly?0:b.damage,friendly};this.applyHit(data);this.onHit(data);b.life=0;break}}}
      if(Math.abs(b.mesh.position.x)>10||Math.abs(b.mesh.position.z)>7)b.life=0;if(b.life<=0){this.scene.remove(b.mesh);this.bullets.splice(i,1)}}
  }

  applyHit(data){
    const s=this.stats.get(data.victim);if(!s||!s.alive)return;const now=performance.now();if(data.friendly){s.stunUntil=Math.max(s.stunUntil,now+850);if(data.victim===this.selfId)this.toast('⚡ PARALIZADO');return}if(now<s.invulnUntil||now<s.spawnShieldUntil)return;s.hp-=Math.max(1,data.damage||1);this.flashTank(data.victim);if(s.hp<=0){s.hp=0;s.alive=false;s.deaths++;const killer=this.stats.get(data.attacker);if(killer&&data.attacker!==data.victim)killer.kills++;const t=this.tankFor(data.victim);if(t)t.group.visible=false;this.spawnExplosion(t?.group.position||new THREE.Vector3());this.addKillfeed(`${this.players.get(data.attacker)?.name||'Jugador'} → ${this.players.get(data.victim)?.name||'Jugador'}`);if(this.flags.A.carrier===data.victim||this.flags.B.carrier===data.victim){const key=this.flags.A.carrier===data.victim?'A':'B';this.flags[key].carrier=null;this.flags[key].dropped=t?.group.position.clone()||this.flags[key].home.clone()}setTimeout(()=>this.respawn(data.victim),2400);this.checkWin()}this.updateHud()
  }
  respawn(id,initial=false){const s=this.stats.get(id);if(!s||this.ended)return;s.alive=true;s.stars=0;const cls=CLASS_STATS[this.classFor(id)]||CLASS_STATS.assault;s.maxHp=cls.hp;s.hp=cls.hp;s.spawnShieldUntil=performance.now()+(initial?1800:2200);const ids=[...this.players.keys()].sort(),i=Math.max(0,ids.indexOf(id)),p=SPAWNS[i%SPAWNS.length],t=this.tankFor(id);if(t){t.group.position.set(p[0],0,p[1]);t.targetPos.copy(t.group.position);t.group.visible=true}if(id===this.selfId)this.toast('🛡️ REAPARECISTE');this.updateHud()}
  flashTank(id){const t=this.tankFor(id);if(!t)return;t.group.traverse(o=>{if(o.material?.emissive){const old=o.material.emissive.clone();o.material.emissive.set(0xffffff);setTimeout(()=>o.material?.emissive?.copy(old),90)}})}

  destroyBlock(id,debris=true){const mesh=this.blocks.get(id);if(!mesh)return;this.blocks.delete(id);this.scene.remove(mesh);if(debris)this.spawnDebris(mesh.position,mesh.material.color)}
  spawnDebris(pos,color){for(let i=0;i<9;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.12+Math.random()*.15,.10+Math.random()*.12,.12+Math.random()*.15),new THREE.MeshStandardMaterial({color,roughness:.9}));m.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*.5,.25+Math.random()*.45,(Math.random()-.5)*.5));m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);this.scene.add(m);this.debris.push({mesh:m,vel:new THREE.Vector3((Math.random()-.5)*2.4,1.5+Math.random()*2.2,(Math.random()-.5)*2.4),age:0})}}
  spawnExplosion(pos){for(let i=0;i<12;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.045+Math.random()*.06,6,4),new THREE.MeshBasicMaterial({color:i%2?0xffa23d:0xffdf6a}));m.position.copy(pos).add(new THREE.Vector3(0,.25,0));this.scene.add(m);this.debris.push({mesh:m,vel:new THREE.Vector3((Math.random()-.5)*3.5,1+Math.random()*2.8,(Math.random()-.5)*3.5),age:.25})}}
  updateDebris(dt){for(let i=this.debris.length-1;i>=0;i--){const d=this.debris[i];d.age+=dt;d.vel.y-=7.8*dt;d.mesh.position.addScaledVector(d.vel,dt);d.mesh.rotation.x+=dt*2;d.mesh.rotation.y+=dt*3;if(d.mesh.position.y<.07){d.mesh.position.y=.07;d.vel.y=Math.abs(d.vel.y)*.22;d.vel.x*=.7;d.vel.z*=.7}if(d.age>1.25)d.mesh.position.y-=dt*.6;if(d.age>2){this.scene.remove(d.mesh);this.debris.splice(i,1)}}}

  spawnPower(type,x,z,id,ttl=9){if(this.powers.has(id)||!POWERUPS[type])return;const def=POWERUPS[type],g=new THREE.Group(),base=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.08,12),new THREE.MeshStandardMaterial({color:def.color,emissive:def.color,emissiveIntensity:.25,roughness:.35}));base.position.y=.08;g.add(base);const sprite=this.makeTextSprite(def.icon,42);sprite.position.y=.46;sprite.scale.set(.72,.72,.72);g.add(sprite);g.position.set(x,0,z);this.scene.add(g);this.powers.set(id,{id,type,mesh:g,age:0,ttl})}
  makeTextSprite(text,size=42){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.font=`${size}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,67);const tex=new THREE.CanvasTexture(c);return new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}))}
  checkPowerPickup(){const p=this.local.group.position;for(const power of this.powers.values())if(Math.hypot(p.x-power.mesh.position.x,p.z-power.mesh.position.z)<.48){if(this.selfId===this.adminId){const grant={kind:'grant',id:power.id,player:this.selfId,type:power.type};this.applyPowerGrant(grant);this.onPower(grant)}else this.onPower({kind:'claim',id:power.id,player:this.selfId});break}}
  applyPowerGrant(data){const p=this.powers.get(data.id);if(!p)return;this.scene.remove(p.mesh);this.powers.delete(data.id);const s=this.stats.get(data.player);if(!s)return;const now=performance.now();switch(data.type){case'star':s.stars=Math.min(3,s.stars+1);break;case'shield':s.hp=Math.min(s.maxHp+2,s.hp+1);s.maxHp=Math.max(s.maxHp,s.hp);break;case'rapid':s.rapidUntil=now+10000;break;case'damage':s.damageUntil=now+10000;break;case'speed':s.speedUntil=now+10000;break;case'helmet':s.invulnUntil=now+6500;break;case'repair':s.hp=s.maxHp;break}if(data.player===this.selfId)this.toast(`${POWERUPS[data.type].icon} ${POWERUPS[data.type].name}`);this.updateHud()}
  updatePowers(dt){for(const [id,p] of this.powers){p.age+=dt;p.mesh.rotation.y+=dt*1.7;p.mesh.position.y=Math.sin(p.age*3)*.06;if(p.age>p.ttl){this.scene.remove(p.mesh);this.powers.delete(id)}}if(this.selfId===this.adminId&&!this.ended&&this.matchTime>this.nextPowerAt){this.nextPowerAt=this.matchTime+12+Math.random()*9;for(let tries=0;tries<25;tries++){const x=Math.floor(Math.random()*17)-8,z=Math.floor(Math.random()*11)-5;if(!this.solidAt(x,z)){const type=POWER_KEYS[Math.floor(Math.random()*POWER_KEYS.length)],data={kind:'spawn',id:`rnd-${Date.now()}`,type,x,z,ttl:8};this.spawnPower(type,x,z,data.id,8);this.onPower(data);break}}}}

  buildFlags(){['A','B'].forEach(team=>{const f=this.flags[team],g=new THREE.Group(),pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.72,8),new THREE.MeshStandardMaterial({color:0xd7dde5,metalness:.65,roughness:.35}));pole.position.y=.36;g.add(pole);const geo=new THREE.PlaneGeometry(.52,.30,5,2),mat=new THREE.MeshStandardMaterial({color:team==='A'?0x42d3ff:0xff8d42,side:THREE.DoubleSide,roughness:.65});const cloth=new THREE.Mesh(geo,mat);cloth.position.set(.28,.58,0);cloth.userData.base=Float32Array.from(geo.attributes.position.array);g.add(cloth);g.position.copy(f.home);this.scene.add(g);this.flagMeshes[team]={group:g,cloth}})}
  applyFlag(data){const f=this.flags[data.team];if(!f)return;if(data.type==='pickup'){if(f.carrier||f.dropped&&data.player===undefined)return;f.carrier=data.player;f.dropped=null}else if(data.type==='drop'){f.carrier=null;f.dropped=new THREE.Vector3(data.x,0,data.z)}else if(data.type==='return'){f.carrier=null;f.dropped=null}else if(data.type==='score'){this.teamScore[data.scoringTeam]=(this.teamScore[data.scoringTeam]||0)+1;this.flags.A.carrier=this.flags.B.carrier=null;this.flags.A.dropped=this.flags.B.dropped=null;this.toast(`🚩 PUNTO EQUIPO ${data.scoringTeam}`);this.checkWin()}this.updateHud()}
  updateCTFLocal(){const s=this.stats.get(this.selfId),pos=this.local.group.position;if(!s?.alive)return;const enemy=s.team==='A'?'B':'A',ef=this.flags[enemy],own=this.flags[s.team];if(!ef.carrier){const ep=ef.dropped||ef.home;if(pos.distanceTo(ep)<.48){const d={type:'pickup',team:enemy,player:this.selfId};this.applyFlag(d);this.onFlag(d);this.toast('🚩 BANDERA ROBADA')}}if(ef.carrier===this.selfId&&pos.distanceTo(own.home)<.58&&!own.carrier&&!own.dropped){const d={type:'score',team:enemy,scoringTeam:s.team,player:this.selfId};this.applyFlag(d);this.onFlag(d)}}
  updateFlags(t){if(this.mode!=='ctf')return;for(const team of ['A','B']){const f=this.flags[team],fm=this.flagMeshes[team];let pos=f.home,visible=true;if(f.carrier){const tank=this.tankFor(f.carrier);if(tank)pos=tank.group.position.clone().add(new THREE.Vector3(0,.65,0));else visible=false}else if(f.dropped)pos=f.dropped;fm.group.visible=visible;fm.group.position.lerp(pos,.35);const attr=fm.cloth.geometry.attributes.position,base=fm.cloth.userData.base;for(let i=0;i<attr.count;i++){const x=base[i*3],y=base[i*3+1];attr.setZ(i,Math.sin(t*4+x*7+y*2)*.035*(x+.27))}attr.needsUpdate=true}}

  updateRemote(dt){for(const [id,t] of this.remote){const s=this.stats.get(id);t.group.visible=!!s?.alive;t.group.position.lerp(t.targetPos,Math.min(1,dt*12));t.body.rotation.y=this.lerpAngle(t.body.rotation.y,t.targetBodyRot,Math.min(1,dt*12));t.turretPivot.rotation.y=this.lerpAngle(t.turretPivot.rotation.y,t.targetTurretRot,Math.min(1,dt*14))}}
  updateHud(){const s=this.stats.get(this.selfId);if(!s)return;document.querySelector('#hudShields').textContent='🛡️'.repeat(Math.max(0,s.hp))||'💀';if(this.mode==='deathmatch')document.querySelector('#hudScore').textContent=`${s.kills}/10`;else document.querySelector('#hudScore').textContent=`🔵 ${this.teamScore.A} · ${this.mode==='ctf'?3:20} · ${this.teamScore.B} 🟠`}
  toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.classList.remove('show'),1450)}
  addKillfeed(text){const root=document.querySelector('#killfeed'),d=document.createElement('div');d.textContent=text;root.prepend(d);setTimeout(()=>d.remove(),3300);while(root.children.length>4)root.lastChild.remove()}
  checkWin(){if(this.selfId!==this.adminId||this.ended)return;let winner=null;if(this.mode==='deathmatch'){for(const [id,s] of this.stats)if(s.kills>=10)winner={type:'player',id}}else{const target=this.mode==='ctf'?3:20;if(this.teamScore.A>=target)winner={type:'team',team:'A'};if(this.teamScore.B>=target)winner={type:'team',team:'B'}}if(!winner)return;const result=this.makeResult(winner);this.onMatch(result);this.finishMatch(result)}
  makeResult(winner){let title;if(winner.type==='player')title=`🏆 ${this.players.get(winner.id)?.name||'Jugador'} gana`;else title=`🏆 Equipo ${winner.team} gana`;const scores=[...this.stats.entries()].map(([id,s])=>({name:`${this.players.get(id)?.name||'Jugador'} · ${s.team}`,score:`${s.kills} bajas / ${s.deaths} muertes`})).sort((a,b)=>String(b.score).localeCompare(String(a.score)));return{title,scores,winner}}
  finishMatch(result){if(this.ended)return;this.ended=true;this.onEnd?.(result)}
  hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
  lerpAngle(a,b,t){let d=((b-a+Math.PI)%(Math.PI*2))-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t}
  animate=()=>{if(!this.running)return;requestAnimationFrame(this.animate);const dt=Math.min(.033,this.clock.getDelta());this.matchTime+=dt;this.updateLocal(dt);this.updateRemote(dt);this.updateBullets(dt);this.updateDebris(dt);this.updatePowers(dt);this.updateFlags(this.matchTime);this.renderer.render(this.scene,this.camera)}
}
