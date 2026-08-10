import { joinRoom, selfId } from 'https://esm.sh/trystero@0.25.3';
import { BattleGame } from './game.js';

// Misma versión y forma de conexión que la prueba multiplayer de Soquetin que funciona.
// IMPORTANTE: APP_ID y versión de Trystero quedan fijos.
const APP_ID='battlecity3d-mateofoulkes-lab-v1';
const BUILD='v0.9';
const PALETTE=['#f4c542','#42c96f','#4da3ff','#ef5b5b','#b768ff','#ff8a38','#29d6cf','#f06bc2'];
const MODES={deathmatch:'Deathmatch','team-deathmatch':'Team Deathmatch',ctf:'Captura la bandera'};
const $=s=>document.querySelector(s);
const screens={home:$('#homeScreen'),lobby:$('#lobbyScreen'),game:$('#gameScreen')};
const state={name:'',roomCode:'',room:null,actions:{},isCreator:false,players:new Map(),adminId:null,mode:'deathmatch',game:null,joinedAt:0,color:localStorage.getItem('battlecity3d-color')||PALETTE[0],tankClass:localStorage.getItem('battlecity3d-class')||'assault',peerCount:0,helloTimer:null};

function showScreen(name){Object.entries(screens).forEach(([k,el])=>el.classList.toggle('hidden',k!==name));}
function normalizeCode(v){return v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',a=new Uint32Array(6);crypto.getRandomValues(a);return [...a].map(n=>chars[n%chars.length]).join('')}
function presence(){return{id:selfId,name:state.name,creator:state.isCreator,joinedAt:state.joinedAt,color:state.color,tankClass:state.tankClass,build:BUILD}}
function esc(s){return String(s).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
function peerCount(){try{return Object.keys(state.room?.getPeers?.()||{}).length}catch{return 0}}

$('#nameInput').value=localStorage.getItem('battlecity3d-name')||'';
$('#roomCodeInput').addEventListener('input',e=>e.target.value=normalizeCode(e.target.value));
$('#createRoomBtn').addEventListener('click',()=>enterRoom(true));
$('#joinRoomBtn').addEventListener('click',()=>enterRoom(false));
$('#leaveRoomBtn').addEventListener('click',leaveRoom);
$('#backLobbyBtn').addEventListener('click',()=>{state.game?.stop();state.game=null;$('#matchOverlay').classList.add('hidden');showScreen('lobby');renderLobby()});

document.querySelectorAll('.mode-card').forEach(btn=>btn.addEventListener('click',()=>{if(selfId!==state.adminId)return;state.mode=btn.dataset.mode;state.actions.config?.send({mode:state.mode});renderLobby()}));
document.querySelectorAll('.class-card').forEach(btn=>btn.addEventListener('click',()=>{state.tankClass=btn.dataset.class;localStorage.setItem('battlecity3d-class',state.tankClass);state.players.set(selfId,presence());state.actions.presence?.send(presence()).catch?.(()=>{});renderLobby()}));

function buildColorPicker(){const root=$('#colorPicker');root.innerHTML='';PALETTE.forEach(color=>{const b=document.createElement('button');b.className='color-swatch';b.style.background=color;b.dataset.color=color;b.title=color;b.addEventListener('click',()=>selectColor(color));root.appendChild(b)})}
buildColorPicker();
function selectColor(color){const taken=[...state.players.entries()].some(([id,p])=>id!==selfId&&p.color===color);if(taken)return;state.color=color;localStorage.setItem('battlecity3d-color',color);state.players.set(selfId,presence());state.actions.presence?.send(presence()).catch?.(()=>{});renderLobby()}
function reconcileOwnColor(){const conflicts=[...state.players.entries()].filter(([id,p])=>id!==selfId&&p.color===state.color).map(([id])=>id);if(!conflicts.length)return;const winner=[selfId,...conflicts].sort()[0];if(winner===selfId)return;const used=new Set([...state.players.entries()].filter(([id])=>id!==selfId).map(([,p])=>p.color));state.color=PALETTE.find(c=>!used.has(c))||PALETTE[0];localStorage.setItem('battlecity3d-color',state.color);state.players.set(selfId,presence());state.actions.presence?.send(presence()).catch?.(()=>{})}

$('#startGameBtn').addEventListener('click',()=>{if(selfId!==state.adminId||state.players.size<2)return;const payload={mode:state.mode,seed:crypto.getRandomValues(new Uint32Array(1))[0],startedAt:Date.now()};state.actions.start.send(payload);beginGame(payload)});

function enterRoom(create){
  const name=$('#nameInput').value.trim();if(!name){$('#homeStatus').textContent='Poné un nombre primero.';return}
  const code=create?makeCode():normalizeCode($('#roomCodeInput').value);if(!create&&code.length!==6){$('#homeStatus').textContent='El código debe tener 6 caracteres.';return}
  cleanupRoom();
  state.name=name.slice(0,14);state.roomCode=code;state.isCreator=create;state.joinedAt=Date.now();state.peerCount=0;
  localStorage.setItem('battlecity3d-name',state.name);$('#homeStatus').textContent='Conectando por WebRTC…';
  try{
    state.room=joinRoom({appId:APP_ID},code,{
      onJoinError:({error})=>{
        console.warn('BattleCity join error',error);
        $('#lobbyStatus').textContent='ERROR P2P · '+(error?.message||'falló la señalización');
      }
    });
    state.players.clear();state.players.set(selfId,presence());state.adminId=create?selfId:null;
    setupNetwork();
    showScreen('lobby');renderLobby();
    announcePresence();
    // Igual que Soquetin: el peer real manda. El heartbeat sólo cubre joins tardíos.
    state.helloTimer=setInterval(()=>{if(!state.room)return;announcePresence();state.peerCount=peerCount();renderLobby()},1800);
    setTimeout(()=>{if(state.room&&peerCount()===0){$('#lobbyStatus').textContent=`Esperando otro navegador en ${code} · 0 peers · ${BUILD}`}},3500);
  }catch(err){console.error(err);$('#homeStatus').textContent='No se pudo abrir la sala: '+(err?.message||err)}
}

function announcePresence(target){
  if(!state.actions.presence)return;
  const p=state.actions.presence.send(presence(),target?{target}:undefined);
  p?.catch?.(()=>{});
}

function setupNetwork(){
  const r=state.room;
  // Namespaces cortos y simples. Evitamos cualquier diferencia con la prueba estable.
  const presence=r.makeAction('presence');
  const config=r.makeAction('config');
  const start=r.makeAction('start');
  const tankState=r.makeAction('tank');
  const shoot=r.makeAction('shoot');
  const destroy=r.makeAction('block');
  const hit=r.makeAction('hit');
  const power=r.makeAction('power');
  const flag=r.makeAction('flag');
  const match=r.makeAction('match');
  state.actions={presence,config,start,tankState,shoot,destroy,hit,power,flag,match};

  presence.onMessage=(data,{peerId})=>{
    if(!peerId)return;
    state.players.set(peerId,{...data,id:peerId});state.peerCount=peerCount();electAdmin();reconcileOwnColor();renderLobby();
  };
  config.onMessage=(data,{peerId})=>{if(peerId!==state.adminId)return;state.mode=data.mode||state.mode;renderLobby()};
  start.onMessage=(data,{peerId})=>{if(peerId!==state.adminId)return;beginGame(data)};
  tankState.onMessage=(data,{peerId})=>state.game?.receiveState(peerId,data);
  shoot.onMessage=(data,{peerId})=>state.game?.receiveShoot(peerId,data);
  destroy.onMessage=(data,{peerId})=>state.game?.receiveDestroy(data,peerId);
  hit.onMessage=(data,{peerId})=>state.game?.receiveHit(data,peerId);
  power.onMessage=(data,{peerId})=>state.game?.receivePower(data,peerId);
  flag.onMessage=(data,{peerId})=>state.game?.receiveFlag(data,peerId);
  match.onMessage=(data,{peerId})=>state.game?.receiveMatch(data,peerId);

  r.onPeerJoin=peerId=>{
    console.log('P2P peer joined',peerId);
    state.peerCount=peerCount();
    announcePresence(peerId);
    if(selfId===state.adminId)config.send({mode:state.mode},{target:peerId}).catch?.(()=>{});
    renderLobby();
  };
  r.onPeerLeave=peerId=>{
    console.log('P2P peer left',peerId);
    state.players.delete(peerId);state.peerCount=peerCount();state.game?.removePeer(peerId);electAdmin();renderLobby();
  };
}

function electAdmin(){const all=[...state.players.values()],creators=all.filter(p=>p.creator),pool=creators.length?creators:all;pool.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||a.id.localeCompare(b.id));state.adminId=pool[0]?.id||selfId}
function colorFor(id){return state.players.get(id)?.color||PALETTE[[...state.players.keys()].sort().indexOf(id)%PALETTE.length]||PALETTE[0]}
function classFor(id){return state.players.get(id)?.tankClass||'assault'}

function renderLobby(){
  if(!state.room)return;$('#roomCodeLabel').textContent=state.roomCode;const list=$('#playersList');list.innerHTML='';
  [...state.players.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([id,p])=>{const row=document.createElement('div');row.className='player-row';row.innerHTML=`<span class="player-dot" style="background:${p.color||colorFor(id)}"></span><strong>${esc(p.name||'Jugador')} <span style="opacity:.55;font-size:11px">${esc((p.tankClass||'assault').toUpperCase())}</span></strong><small>${id===state.adminId?'ADMIN':''}</small>`;list.appendChild(row)});
  const used=new Map();for(const [id,p] of state.players)if(id!==selfId)used.set(p.color,id);document.querySelectorAll('.color-swatch').forEach(b=>{b.disabled=used.has(b.dataset.color);b.classList.toggle('selected',b.dataset.color===state.color)});
  document.querySelectorAll('.class-card').forEach(b=>b.classList.toggle('active',b.dataset.class===state.tankClass));
  const admin=selfId===state.adminId;document.querySelectorAll('.mode-card').forEach(btn=>{btn.disabled=!admin;btn.classList.toggle('active',btn.dataset.mode===state.mode)});
  const start=$('#startGameBtn');if(!admin){start.disabled=true;start.textContent='Esperando al admin…'}else if(state.players.size<2){start.disabled=true;start.textContent='Esperando otro jugador…'}else{start.disabled=false;start.textContent='Comenzar partida'}
  const peers=peerCount();
  $('#lobbyStatus').textContent=`${state.players.size} jugador${state.players.size===1?'':'es'} · ${peers} peer${peers===1?'':'s'} WebRTC · ${BUILD}`;
}

function beginGame(data){
  if(state.game)return;state.mode=data.mode||state.mode;showScreen('game');$('#matchOverlay').classList.add('hidden');$('#hudMode').textContent=MODES[state.mode];$('#hudRoom').textContent=state.roomCode;
  state.game=new BattleGame({root:$('#gameRoot'),selfId,adminId:state.adminId,players:state.players,mode:state.mode,seed:data.seed,colorFor,classFor,
    onState:d=>state.actions.tankState.send(d),onShoot:d=>state.actions.shoot.send(d),onDestroy:d=>state.actions.destroy.send(d),onHit:d=>state.actions.hit.send(d),onPower:d=>state.actions.power.send(d),onFlag:d=>state.actions.flag.send(d),onMatch:d=>state.actions.match.send(d),onEnd:showMatchEnd});
  state.game.start();
}

function showMatchEnd(result){$('#matchResult').textContent=result.title;const box=$('#matchScores');box.innerHTML='';(result.scores||[]).forEach(s=>{const r=document.createElement('div');r.className='score-row';r.innerHTML=`<span>${esc(s.name)}</span><strong>${esc(String(s.score))}</strong>`;box.appendChild(r)});$('#matchOverlay').classList.remove('hidden')}
function cleanupRoom(){clearInterval(state.helloTimer);state.helloTimer=null;state.game?.stop();state.game=null;try{state.room?.leave()}catch{}state.room=null;state.actions={};state.players.clear()}
function leaveRoom(){cleanupRoom();showScreen('home');$('#homeStatus').textContent=''}
window.addEventListener('beforeunload',()=>{try{state.room?.leave()}catch{}});
