import { joinRoom, selfId } from 'https://esm.sh/trystero@0.25.3';
import { BattleGame } from './game.js';

// PRUEBA DE LOBBY ÚNICO: todos entran SIEMPRE a este mismo roomId.
// Esto replica la idea del multiplayer de Soquetin: una sala fija conocida por todos.
const APP_ID='battlecity3d-mateofoulkes-lab-v1';
const GLOBAL_ROOM_ID='battlecity-global-lobby-v1';
const BUILD='v1.0';
const PALETTE=['#f4c542','#42c96f','#4da3ff','#ef5b5b','#b768ff','#ff8a38','#29d6cf','#f06bc2'];
const MODES={deathmatch:'Deathmatch','team-deathmatch':'Team Deathmatch',ctf:'Captura la bandera'};
const $=s=>document.querySelector(s);
const screens={home:$('#homeScreen'),lobby:$('#lobbyScreen'),game:$('#gameScreen')};
const state={name:'',room:null,actions:{},players:new Map(),adminId:null,mode:'deathmatch',game:null,color:localStorage.getItem('battlecity3d-color')||PALETTE[0],tankClass:localStorage.getItem('battlecity3d-class')||'assault',helloTimer:null};

function showScreen(name){Object.entries(screens).forEach(([k,el])=>el.classList.toggle('hidden',k!==name));}
function presence(){return{id:selfId,name:state.name,color:state.color,tankClass:state.tankClass,build:BUILD}}
function esc(s){return String(s).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
function peerCount(){try{return Object.keys(state.room?.getPeers?.()||{}).length}catch{return 0}}

$('#nameInput').value=localStorage.getItem('battlecity3d-name')||'';
$('#enterLobbyBtn').addEventListener('click',enterLobby);
$('#leaveRoomBtn').addEventListener('click',leaveRoom);
$('#backLobbyBtn').addEventListener('click',()=>{state.game?.stop();state.game=null;$('#matchOverlay').classList.add('hidden');showScreen('lobby');renderLobby()});

document.querySelectorAll('.mode-card').forEach(btn=>btn.addEventListener('click',()=>{if(selfId!==state.adminId)return;state.mode=btn.dataset.mode;state.actions.config?.send({mode:state.mode}).catch?.(()=>{});renderLobby()}));
document.querySelectorAll('.class-card').forEach(btn=>btn.addEventListener('click',()=>{state.tankClass=btn.dataset.class;localStorage.setItem('battlecity3d-class',state.tankClass);state.players.set(selfId,presence());announcePresence();renderLobby()}));

function buildColorPicker(){const root=$('#colorPicker');root.innerHTML='';PALETTE.forEach(color=>{const b=document.createElement('button');b.className='color-swatch';b.style.background=color;b.dataset.color=color;b.title=color;b.addEventListener('click',()=>selectColor(color));root.appendChild(b)})}
buildColorPicker();
function selectColor(color){const taken=[...state.players.entries()].some(([id,p])=>id!==selfId&&p.color===color);if(taken)return;state.color=color;localStorage.setItem('battlecity3d-color',color);state.players.set(selfId,presence());announcePresence();renderLobby()}
function reconcileOwnColor(){const conflicts=[...state.players.entries()].filter(([id,p])=>id!==selfId&&p.color===state.color).map(([id])=>id);if(!conflicts.length)return;const winner=[selfId,...conflicts].sort()[0];if(winner===selfId)return;const used=new Set([...state.players.entries()].filter(([id])=>id!==selfId).map(([,p])=>p.color));state.color=PALETTE.find(c=>!used.has(c))||PALETTE[0];localStorage.setItem('battlecity3d-color',state.color);state.players.set(selfId,presence());announcePresence()}

$('#startGameBtn').addEventListener('click',()=>{if(selfId!==state.adminId||state.players.size<2)return;const payload={mode:state.mode,seed:crypto.getRandomValues(new Uint32Array(1))[0],startedAt:Date.now()};state.actions.start.send(payload);beginGame(payload)});

function enterLobby(){
  const name=$('#nameInput').value.trim();if(!name){$('#homeStatus').textContent='Poné un nombre primero.';return}
  cleanupRoom();
  state.name=name.slice(0,14);localStorage.setItem('battlecity3d-name',state.name);$('#homeStatus').textContent='Entrando al lobby global…';
  try{
    state.room=joinRoom({appId:APP_ID},GLOBAL_ROOM_ID,{
      onJoinError:({error})=>{
        console.warn('BattleCity join error',error);
        $('#lobbyStatus').textContent='ERROR P2P · '+(error?.message||'falló la señalización');
      }
    });
    state.players.clear();state.players.set(selfId,presence());
    setupNetwork();electAdmin();showScreen('lobby');renderLobby();announcePresence();
    state.helloTimer=setInterval(()=>{if(!state.room)return;announcePresence();electAdmin();renderLobby()},1600);
  }catch(err){console.error(err);$('#homeStatus').textContent='No se pudo abrir el lobby: '+(err?.message||err)}
}

function announcePresence(target){
  if(!state.actions.presence)return;
  const p=state.actions.presence.send(presence(),target?{target}:undefined);p?.catch?.(()=>{});
}

function setupNetwork(){
  const r=state.room;
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
    state.players.set(peerId,{...data,id:peerId});electAdmin();reconcileOwnColor();renderLobby();
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
    console.log('GLOBAL LOBBY peer joined',peerId);
    // El peer WebRTC ya existe: lo mostramos inmediatamente aunque su presencia tarde unos ms.
    if(!state.players.has(peerId))state.players.set(peerId,{id:peerId,name:'Conectando…',color:'#94a3b8',tankClass:'assault',build:'…'});
    electAdmin();renderLobby();announcePresence(peerId);
    if(selfId===state.adminId)config.send({mode:state.mode},{target:peerId}).catch?.(()=>{});
  };
  r.onPeerLeave=peerId=>{
    console.log('GLOBAL LOBBY peer left',peerId);
    state.players.delete(peerId);state.game?.removePeer(peerId);electAdmin();renderLobby();
  };
}

// Sin "creador" de sala: el admin se elige de manera determinista entre los peers visibles.
// Todos los navegadores que se ven eligen al mismo ID más bajo.
function electAdmin(){const ids=[...state.players.keys()].sort();state.adminId=ids[0]||selfId}
function colorFor(id){return state.players.get(id)?.color||PALETTE[[...state.players.keys()].sort().indexOf(id)%PALETTE.length]||PALETTE[0]}
function classFor(id){return state.players.get(id)?.tankClass||'assault'}

function renderLobby(){
  if(!state.room)return;const list=$('#playersList');list.innerHTML='';
  [...state.players.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([id,p])=>{const row=document.createElement('div');row.className='player-row';row.innerHTML=`<span class="player-dot" style="background:${p.color||colorFor(id)}"></span><strong>${esc(p.name||'Jugador')} <span style="opacity:.55;font-size:11px">${esc((p.tankClass||'assault').toUpperCase())}</span></strong><small>${id===state.adminId?'ADMIN':''}</small>`;list.appendChild(row)});
  const used=new Map();for(const [id,p] of state.players)if(id!==selfId)used.set(p.color,id);document.querySelectorAll('.color-swatch').forEach(b=>{b.disabled=used.has(b.dataset.color);b.classList.toggle('selected',b.dataset.color===state.color)});
  document.querySelectorAll('.class-card').forEach(b=>b.classList.toggle('active',b.dataset.class===state.tankClass));
  const admin=selfId===state.adminId;document.querySelectorAll('.mode-card').forEach(btn=>{btn.disabled=!admin;btn.classList.toggle('active',btn.dataset.mode===state.mode)});
  const start=$('#startGameBtn');if(!admin){start.disabled=true;start.textContent='Esperando al admin…'}else if(state.players.size<2){start.disabled=true;start.textContent='Esperando otro jugador…'}else{start.disabled=false;start.textContent='Comenzar partida'}
  const peers=peerCount();
  $('#lobbyStatus').textContent=`LOBBY GLOBAL · ${state.players.size} jugador${state.players.size===1?'':'es'} · ${peers} peer${peers===1?'':'s'} WebRTC · ${BUILD}`;
}

function beginGame(data){
  if(state.game)return;state.mode=data.mode||state.mode;showScreen('game');$('#matchOverlay').classList.add('hidden');$('#hudMode').textContent=MODES[state.mode];$('#hudRoom').textContent='GLOBAL';
  state.game=new BattleGame({root:$('#gameRoot'),selfId,adminId:state.adminId,players:state.players,mode:state.mode,seed:data.seed,colorFor,classFor,
    onState:d=>state.actions.tankState.send(d),onShoot:d=>state.actions.shoot.send(d),onDestroy:d=>state.actions.destroy.send(d),onHit:d=>state.actions.hit.send(d),onPower:d=>state.actions.power.send(d),onFlag:d=>state.actions.flag.send(d),onMatch:d=>state.actions.match.send(d),onEnd:showMatchEnd});
  state.game.start();
}

function showMatchEnd(result){$('#matchResult').textContent=result.title;const box=$('#matchScores');box.innerHTML='';(result.scores||[]).forEach(s=>{const r=document.createElement('div');r.className='score-row';r.innerHTML=`<span>${esc(s.name)}</span><strong>${esc(String(s.score))}</strong>`;box.appendChild(r)});$('#matchOverlay').classList.remove('hidden')}
function cleanupRoom(){clearInterval(state.helloTimer);state.helloTimer=null;state.game?.stop();state.game=null;try{state.room?.leave()}catch{}state.room=null;state.actions={};state.players.clear();state.adminId=null}
function leaveRoom(){cleanupRoom();showScreen('home');$('#homeStatus').textContent=''}
window.addEventListener('beforeunload',()=>{try{state.room?.leave()}catch{}});
