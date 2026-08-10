import * as THREE from 'https://esm.sh/three@0.180.0';

const SPAWNS=[[-8,5],[8,-5],[-8,-5],[8,5],[0,5],[0,-5]];

export class BattleGame{
  constructor({root,selfId,players,colorFor,onState,onShoot,onDestroy}){
    this.root=root;this.selfId=selfId;this.players=players;this.colorFor=colorFor;
    this.onState=onState;this.onShoot=onShoot;this.onDestroy=onDestroy;
    this.remote=new Map();this.blocks=new Map();this.bullets=[];this.debris=[];
    this.keys=new Set();this.moveInput=new THREE.Vector2();this.aimPoint=new THREE.Vector3(0,0,1);
    this.clock=new THREE.Clock();this.lastState=0;this.lastShot=0;this.running=false;
  }

  start(){
    this.running=true;this.root.innerHTML='';
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x151c27);this.scene.fog=new THREE.Fog(0x151c27,22,42);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.root.appendChild(this.renderer.domElement);
    this.camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100);this.fitCamera();

    this.scene.add(new THREE.HemisphereLight(0xbfdcff,0x263021,2));
    const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(-8,16,10);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;this.scene.add(sun);

    const floor=new THREE.Mesh(new THREE.BoxGeometry(20,.35,14),new THREE.MeshStandardMaterial({color:0x34465a,roughness:.92}));floor.position.y=-.22;floor.receiveShadow=true;this.scene.add(floor);
    this.addGrid();this.buildMap();

    const ids=[...this.players.keys()].sort(),i=Math.max(0,ids.indexOf(this.selfId)),p=SPAWNS[i%SPAWNS.length];
    this.local=this.createTank(this.colorFor(this.selfId));this.local.group.position.set(p[0],0,p[1]);this.scene.add(this.local.group);
    ids.filter(id=>id!==this.selfId).forEach(id=>this.ensureRemote(id));
    this.bindInput();this.clock.start();this.animate();
  }

  stop(){this.running=false;}

  fitCamera=()=>{
    if(!this.camera||!this.renderer)return;const aspect=innerWidth/innerHeight,worldW=22,worldH=16;let viewW=worldW,viewH=worldW/aspect;
    if(viewH<worldH){viewH=worldH;viewW=worldH*aspect;}const c=this.camera;c.left=-viewW/2;c.right=viewW/2;c.top=viewH/2;c.bottom=-viewH/2;
    c.position.set(0,23,9.7);c.lookAt(0,0,0);c.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight,false);
  }

  addGrid(){
    const mat=new THREE.LineBasicMaterial({color:0x546579,transparent:true,opacity:.22}),pts=[];
    for(let x=-10;x<=10;x++)pts.push(new THREE.Vector3(x,.01,-7),new THREE.Vector3(x,.01,7));
    for(let z=-7;z<=7;z++)pts.push(new THREE.Vector3(-10,.01,z),new THREE.Vector3(10,.01,z));
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),mat));
  }

  buildMap(){
    const rows=['SSSSSSSSSSSSSSSSSSSS','S..B...B....B...B..S','S.BB.B.B.SS.B.B.BB.S','S....B........B.....S','S.B.SS.B.BB.B.SS.B.S','S.B....B....B....B..S','S...BB...SS...BB....S','S...BB...SS...BB....S','S.B....B....B....B..S','S.B.SS.B.BB.B.SS.B.S','S.....B........B....S','S.BB.B.B.SS.B.B.BB.S','S..B...B....B...B..S','SSSSSSSSSSSSSSSSSSSS'];
    rows.forEach((row,z)=>[...row].forEach((type,x)=>{if(type!=='.')this.addBlock(type,x-9.5,z-6.5,`${x}-${z}`)}));
  }

  addBlock(type,x,z,id){
    const steel=type==='S',geo=new THREE.BoxGeometry(.94,steel?.76:.68,.94),mat=new THREE.MeshStandardMaterial({color:steel?0x7f8b99:0xa94f32,roughness:.78,metalness:steel?.35:0});
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,geo.parameters.height/2,z);mesh.castShadow=mesh.receiveShadow=true;mesh.userData={id,type};this.scene.add(mesh);this.blocks.set(id,mesh);
  }

  createTank(color){
    const group=new THREE.Group(),body=new THREE.Group();group.position.y=.05;group.add(body);const c=new THREE.Color(color),dark=c.clone().multiplyScalar(.48);
    const bodyMat=new THREE.MeshStandardMaterial({color:c,roughness:.58,metalness:.12}),darkMat=new THREE.MeshStandardMaterial({color:dark,roughness:.8});
    [-.48,.48].forEach(x=>{const t=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,1.28),darkMat);t.position.set(x,.25,0);t.castShadow=true;body.add(t)});
    const hull=new THREE.Mesh(new THREE.BoxGeometry(.82,.34,1.16),bodyMat);hull.position.y=.37;hull.castShadow=true;body.add(hull);
    const turretPivot=new THREE.Group();turretPivot.position.y=.58;group.add(turretPivot);const turret=new THREE.Mesh(new THREE.CylinderGeometry(.38,.44,.28,8),bodyMat);turret.castShadow=true;turretPivot.add(turret);
    const barrel=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,.85),bodyMat);barrel.position.set(0,.07,.55);barrel.castShadow=true;turretPivot.add(barrel);
    const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.22,8),darkMat);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.07,1.02);turretPivot.add(muzzle);
    return{group,body,turretPivot,targetPos:new THREE.Vector3(),targetBodyRot:0,targetTurretRot:0};
  }

  ensureRemote(id){
    let t=this.remote.get(id);if(t)return t;const ids=[...this.players.keys()].sort(),i=Math.max(0,ids.indexOf(id)),p=SPAWNS[i%SPAWNS.length];t=this.createTank(this.colorFor(id));t.group.position.set(p[0],0,p[1]);t.targetPos.copy(t.group.position);this.scene.add(t.group);this.remote.set(id,t);return t;
  }

  receiveState(id,data){const t=this.ensureRemote(id);t.targetPos.set(data.x,0,data.z);t.targetBodyRot=data.bodyRot;t.targetTurretRot=data.turretRot;}
  receiveShoot(id,data){this.spawnBullet(id,new THREE.Vector3(data.x,.48,data.z),data.angle,false);}
  receiveDestroy(id){this.destroyBlock(id,true);}
  removePeer(id){const t=this.remote.get(id);if(t)this.scene.remove(t.group);this.remote.delete(id);}

  bindInput(){
    const canvas=this.renderer.domElement,raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
    const point=e=>{const r=canvas.getBoundingClientRect();mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(mouse,this.camera);const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),out=new THREE.Vector3();raycaster.ray.intersectPlane(plane,out);return out};
    canvas.onpointermove=e=>{if(e.pointerType==='mouse')this.aimPoint.copy(point(e));};
    canvas.onpointerdown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;this.aimPoint.copy(point(e));this.shootLocal();};
    window.onkeydown=e=>this.keys.add(e.code);window.onkeyup=e=>this.keys.delete(e.code);window.addEventListener('resize',this.fitCamera);

    const joy=document.querySelector('#joystick'),knob=document.querySelector('#joystickKnob');let pointer=null,origin=new THREE.Vector2();
    joy.onpointerdown=e=>{e.preventDefault();e.stopPropagation();pointer=e.pointerId;joy.setPointerCapture(e.pointerId);origin.set(e.clientX,e.clientY)};
    joy.onpointermove=e=>{if(e.pointerId!==pointer)return;e.preventDefault();e.stopPropagation();const dx=e.clientX-origin.x,dy=e.clientY-origin.y,max=38,len=Math.hypot(dx,dy)||1,s=Math.min(1,max/len),x=dx*s,y=dy*s;knob.style.transform=`translate(${x}px,${y}px)`;this.moveInput.set(x/max,y/max)};
    const end=e=>{if(e.pointerId!==pointer)return;pointer=null;this.moveInput.set(0,0);knob.style.transform='translate(0,0)'};joy.onpointerup=end;joy.onpointercancel=end;
  }

  movement(){let x=this.moveInput.x,z=this.moveInput.y;if(this.keys.has('KeyA')||this.keys.has('ArrowLeft'))x--;if(this.keys.has('KeyD')||this.keys.has('ArrowRight'))x++;if(this.keys.has('KeyW')||this.keys.has('ArrowUp'))z--;if(this.keys.has('KeyS')||this.keys.has('ArrowDown'))z++;const v=new THREE.Vector2(x,z);if(v.lengthSq()>1)v.normalize();return v;}
  collides(x,z){if(x<-9.15||x>9.15||z<-6.15||z>6.15)return true;for(const m of this.blocks.values())if(Math.abs(x-m.position.x)<.7&&Math.abs(z-m.position.z)<.7)return true;return false;}

  updateLocal(dt){
    const t=this.local,mv=this.movement(),speed=4.1;if(mv.lengthSq()>.001){const nx=t.group.position.x+mv.x*speed*dt,nz=t.group.position.z+mv.y*speed*dt;if(!this.collides(nx,t.group.position.z))t.group.position.x=nx;if(!this.collides(t.group.position.x,nz))t.group.position.z=nz;t.body.rotation.y=this.lerpAngle(t.body.rotation.y,Math.atan2(mv.x,mv.y),Math.min(1,dt*10));}
    const dx=this.aimPoint.x-t.group.position.x,dz=this.aimPoint.z-t.group.position.z;if(dx*dx+dz*dz>.05)t.turretPivot.rotation.y=this.lerpAngle(t.turretPivot.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*14));
    const now=performance.now();if(now-this.lastState>55){this.lastState=now;this.onState({x:t.group.position.x,z:t.group.position.z,bodyRot:t.body.rotation.y,turretRot:t.turretPivot.rotation.y});}
  }

  shootLocal(){const now=performance.now();if(now-this.lastShot<420||!this.local)return;this.lastShot=now;const a=this.local.turretPivot.rotation.y,o=this.local.group.position.clone();o.x+=Math.sin(a)*1.05;o.z+=Math.cos(a)*1.05;o.y=.48;this.spawnBullet(this.selfId,o,a,true);this.onShoot({x:o.x,z:o.z,angle:a});}
  spawnBullet(owner,origin,angle,local){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.11,10,8),new THREE.MeshBasicMaterial({color:0xffdf62}));mesh.position.copy(origin);this.scene.add(mesh);this.bullets.push({mesh,owner,vel:new THREE.Vector3(Math.sin(angle)*10.5,0,Math.cos(angle)*10.5),life:2.1,local});}

  updateBullets(dt){
    for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.life-=dt;b.mesh.position.addScaledVector(b.vel,dt);let hit=null;for(const [id,m] of this.blocks)if(Math.abs(b.mesh.position.x-m.position.x)<.52&&Math.abs(b.mesh.position.z-m.position.z)<.52){hit={id,m};break}if(hit){if(hit.m.userData.type==='B'){this.destroyBlock(hit.id,true);if(b.local)this.onDestroy(hit.id)}b.life=0}if(Math.abs(b.mesh.position.x)>10||Math.abs(b.mesh.position.z)>7)b.life=0;if(b.life<=0){this.scene.remove(b.mesh);this.bullets.splice(i,1)}}
  }

  destroyBlock(id,debris=true){const mesh=this.blocks.get(id);if(!mesh)return;this.blocks.delete(id);this.scene.remove(mesh);if(debris)this.spawnDebris(mesh.position,mesh.material.color);}
  spawnDebris(pos,color){for(let i=0;i<8;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.18+Math.random()*.15,.12+Math.random()*.13,.18+Math.random()*.15),new THREE.MeshStandardMaterial({color,roughness:.9}));m.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*.45,.3+Math.random()*.4,(Math.random()-.5)*.45));m.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);this.scene.add(m);this.debris.push({mesh:m,vel:new THREE.Vector3((Math.random()-.5)*2.2,1.7+Math.random()*2,(Math.random()-.5)*2.2),age:0})}}
  updateDebris(dt){for(let i=this.debris.length-1;i>=0;i--){const d=this.debris[i];d.age+=dt;d.vel.y-=7.8*dt;d.mesh.position.addScaledVector(d.vel,dt);d.mesh.rotation.x+=dt*2;d.mesh.rotation.y+=dt*3;if(d.mesh.position.y<.08){d.mesh.position.y=.08;d.vel.y=Math.abs(d.vel.y)*.25;d.vel.x*=.7;d.vel.z*=.7}if(d.age>1.35)d.mesh.position.y-=dt*.55;if(d.age>2.1){this.scene.remove(d.mesh);this.debris.splice(i,1)}}}
  updateRemote(dt){for(const t of this.remote.values()){t.group.position.lerp(t.targetPos,Math.min(1,dt*12));t.body.rotation.y=this.lerpAngle(t.body.rotation.y,t.targetBodyRot,Math.min(1,dt*12));t.turretPivot.rotation.y=this.lerpAngle(t.turretPivot.rotation.y,t.targetTurretRot,Math.min(1,dt*14));}}
  lerpAngle(a,b,t){let d=((b-a+Math.PI)%(Math.PI*2))-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d*t;}
  animate=()=>{if(!this.running)return;requestAnimationFrame(this.animate);const dt=Math.min(.033,this.clock.getDelta());this.updateLocal(dt);this.updateRemote(dt);this.updateBullets(dt);this.updateDebris(dt);this.renderer.render(this.scene,this.camera);}
}
