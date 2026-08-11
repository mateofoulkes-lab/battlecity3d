import { MeteredPeer } from 'https://esm.sh/@metered-ca/realtime';
import { BattleGame } from './game.js';

const METERED_KEY='pk_live_f3999f9364b91c8c878fe6d646063389eee28486';
const GLOBAL_CHANNEL='battlecity3d-global-v1';
const BUILD='v1.1';
const PALETTE=['#f4c542','#42c96f','#4da3ff','#ef5b5b','#b768ff','#ff8a38','#29d6cf','#f06bc2'];
const MODES={deathmatch:'Deathmatch','team-deathmatch':'Team Deathmatch',ctf:'Captura la bandera'};
const $=s=>document.querySelector(s);
const screens={home:$('#homeScreen'),lobby:$('#lobbyScreen'),game:$('#gameScreen')};
const state={name:'',peer:null,selfId:null,actions:{},handlers:new Map(),players:new Map(),adminId:null,mode:'deathmatch',game:null,joinedAt:0,color:localStorage.getItem('battlecity3d-color')||PALETTE[0],tankClass:localStorage.getItem('battlecity3d-class')||'assault',helloTimer:null};

function showScreen(name){Object.entries(screens).forEach(([k,el])=>el.classList.toggle('hidden',k!==name));}
function presence(){return{id:state.selfId,name:state.name,joinedAt:state.joinedAt,color:state.color,tankClass:state.tankClass,build:BUILD}}
function esc(s){return String(s).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]))}
function peerCount(){return state.peer?.remotePeers?.length||0}

$('#nameInput').value=localStorage.getItem('battlecity3d-name')||'';
$('#enterLobbyBtn').addEventListener('click',enterLobby);
$('#leaveRoomBtn').addEventListener('click',leaveRoom);
$('#backLobbyBtn').addEventListener('click',()=>{state.game?.stop();state.game=null;$('#matchOverlay').classList.add('hidden');showScreen('lobby');renderLobby()});

document.querySelectorAll('.mode-card').forEach(btn=>btn.addEventListener('click',()=>{if(state.selfId!==state.adminId)return;state.mode=btn.dataset.mode;sendAction('config',{mode:state.mode});renderLobby()}));
document.querySelectorAll('.class-card').forEach(btn=>btn.addEventListener('click',()=>{state.tankClass=btn.dataset.class;localStorage.setItem('battlecity3d-class',state.tankClass);if(state.selfId){state.players.set(state.selfId,presence());announcePresence()}renderLobby()}));

function buildColorPicker(){const root=$('#colorPicker');root.innerHTML='';PALETTE.forEach(color=>{const b=document.createElement('button');b.className='color-swatch';b.style.background=color;b.dataset.color=color;b.title=color;b.addEventListener('click',()=>selectColor(color));root.appendChild(b)})}
buildColorPicker();
function selectColor(color){const taken=[...state.players.entries()].some(([id,p])=>id!==state.selfId&&p.color===color);if(taken)return;state.color=color;localStorage.setItem('battlecity3d-color',color);if(state.selfId){state.players.set(state.selfId,presence());announcePresence()}renderLobby()}
function reconcileOwnColor(){const conflicts=[...state.players.entries()].filter(([id,p])=>id!==state.selfId&&p.color===state.color).map(([id])=>id);if(!conflicts.length)return;const winner=[state.selfId,...conflicts].sort()[0];if(winner===state.selfId)return;const used=new Set([...state.players.entries()].filter(([id])=>id!==state.selfId).map(([,p])=>p.color));state.color=PALETTE.find(c=>!used.has(c))||PALETTE[0];localStorage.setItem('battlecity3d-color',state.color);state.players.set(state.selfId,presence());announcePresence()}

$('#startGameBtn').addEventListener('click',()=>{if(state.selfId!==state.adminId||state.players.size<2)return;const payload={mode:state.mode,seed:crypto.getRandomValues(new Uint32Array(1))[0],startedAt:Date.now()};sendAction('start',payload);beginGame(payload)});

async function enterLobby(){
  const name=$('#nameInput').value.trim();if(!name){$('#homeStatus').textContent='Poné un nombre primero.';return}
  await cleanupRoom();
  state.name=name.slice(0,14);state.joinedAt=Date.now();localStorage.setItem('battlecity3d-name',state.name);$('#homeStatus').textContent='Entrando al lobby global…';
  try{
    const peer=new MeteredPeer({apiKey:METERED_KEY});state.peer=peer;
    peer.on('peer-joined',({peer:remote})=>{
      if(!state.players.has(remote.id))state.players.set(remote.id,{id:remote.id,name:'Conectando…',joinedAt:Date.now(),color:'#64748b',tankClass:'assault'});
      electAdmin();renderLobby();announcePresence(remote.id);
    });
    peer.on('peer-left',({peer:remote})=>{state.players.delete(remote.id);state.game?.removePeer(remote.id);electAdmin();renderLobby()});
    peer.on('data',({senderPeerId,data})=>handleNetworkData(senderPeerId,data));
    peer.on('state-change',({to})=>{if(to==='reconnecting')$('#lobbyStatus').textContent=`Reconectando… · ${BUILD}`;if(to==='joined')renderLobby()});
    peer.on('error',({err})=>{console.error('Metered error',err);$('#lobbyStatus').textContent=`ERROR DE RED · ${err?.message||err} · ${BUILD}`});
    await peer.join(GLOBAL_CHANNEL);
    state.selfId=peer.peerId;
    state.players.clear();state.players.set(state.selfId,presence());electAdmin();
    setupActions();showScreen('lobby');renderLobby();announcePresence();
    state.helloTimer=setInterval(()=>{if(state.peer){announcePresence();renderLobby()}},2500);
  }catch(err){console.error(err);$('#homeStatus').textContent='No se pudo entrar al lobby: '+(err?.message||err)}
}

function setupActions(){
  const names=['presence','config','start','tank','shoot','block','hit','power','flag','match'];
  state.actions={};
  names.forEach(name=>state.actions[name]={
    send:(payload,opts={})=>sendAction(name,payload,opts.target),
    set onMessage(fn){state.handlers.set(name,fn)},
    get onMessage(){return state.handlers.get(name)}
  });
  state.actions.presence.onMessage=(data,{peerId})=>{state.players.set(peerId,{...data,id:peerId});electAdmin();reconcileOwnColor();renderLobby()};
  state.actions.config.onMessage=(data,{peerId})=>{if(peerId!==state.adminId)return;state.mode=data.mode||state.mode;renderLobby()};
  state.actions.start.onMessage=(data,{peerId})=>{if(peerId!==state.adminId)return;beginGame(data)};
  state.actions.tank.onMessage=(data,{peerId})=>state.game?.receiveState(peerId,data);
  state.actions.shoot.onMessage=(data,{peerId})=>state.game?.receiveShoot(peerId,data);
  state.actions.block.onMessage=(data,{peerId})=>state.game?.receiveDestroy(data,peerId);
  state.actions.hit.onMessage=(data,{peerId})=>state.game?.receiveHit(data,peerId);
  state.actions.power.onMessage=(data,{peerId})=>state.game?.receivePower(data,peerId);
  state.actions.flag.onMessage=(data,{peerId})=>state.game?.receiveFlag(data,peerId);
  state.actions.match.onMessage=(data,{peerId})=>state.game?.receiveMatch(data,peerId);
}

function handleNetworkData(senderPeerId,msg){
  if(!msg||typeof msg!=='object'||typeof msg.action!=='string')return;
  const fn=state.handlers.get(msg.action);if(fn)fn(msg.payload,{peerId:senderPeerId});
}
function sendAction(action,payload,target){
  if(!state.peer||state.peer.state!=='joined')return Promise.resolve();
  const msg={action,payload};
  return (target?state.peer.sendTo(target,msg):state.peer.send(msg)).catch(err=>console.warn('network send failed',action,err));
}
function announcePresence(target){if(!state.selfId)return;sendAction('presence',presence(),target)}

function electAdmin(){const ids=[...state.players.keys()].sort();state.adminId=ids[0]||state.selfId}
function colorFor(id){return state.players.get(id)?.color||PALETTE[Math.max(0,[...state.players.keys()].sort().indexOf(id))%PALETTE.length]||PALETTE[0]}
function classFor(id){return state.players.get(id)?.tankClass||'assault'}

function renderLobby(){
  if(!state.peer)return;const list=$('#playersList');list.innerHTML='';
  [...state.players.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([id,p])=>{const row=document.createElement('div');row.className='player-row';row.innerHTML=`<span class="player-dot" style="background:${p.color||colorFor(id)}"></span><strong>${esc(p.name||'Jugador')} <span style="opacity:.55;font-size:11px">${esc((p.tankClass||'assault').toUpperCase())}</span></strong><small>${id===state.adminId?'ADMIN':''}</small>`;list.appendChild(row)});
  const used=new Map();for(const [id,p] of state.players)if(id!==state.selfId)used.set(p.color,id);document.querySelectorAll('.color-swatch').forEach(b=>{b.disabled=used.has(b.dataset.color);b.classList.toggle('selected',b.dataset.color===state.color)});
  document.querySelectorAll('.class-card').forEach(b=>b.classList.toggle('active',b.dataset.class===state.tankClass));
  const admin=state.selfId===state.adminId;document.querySelectorAll('.mode-card').forEach(btn=>{btn.disabled=!admin;btn.classList.toggle('active',btn.dataset.mode===state.mode)});
  const start=$('#startGameBtn');if(!admin){start.disabled=true;start.textContent='Esperando al admin…'}else if(state.players.size<2){start.disabled=true;start.textContent='Esperando otro jugador…'}else{start.disabled=false;start.textContent='Comenzar partida'}
  $('#lobbyStatus').textContent=`LOBBY GLOBAL · ${state.players.size} jugador${state.players.size===1?'':'es'} · ${peerCount()} peer${peerCount()===1?'':'s'} · Metered + TURN · ${BUILD}`;
}

function beginGame(data){
  if(state.game)return;state.mode=data.mode||state.mode;showScreen('game');$('#matchOverlay').classList.add('hidden');$('#hudMode').textContent=MODES[state.mode];$('#hudRoom').textContent='GLOBAL';
  state.game=new BattleGame({root:$('#gameRoot'),selfId:state.selfId,adminId:state.adminId,players:state.players,mode:state.mode,seed:data.seed,colorFor,classFor,
    onState:d=>sendAction('tank',d),onShoot:d=>sendAction('shoot',d),onDestroy:d=>sendAction('block',d),onHit:d=>sendAction('hit',d),onPower:d=>sendAction('power',d),onFlag:d=>sendAction('flag',d),onMatch:d=>sendAction('match',d),onEnd:showMatchEnd});
  state.game.start();
}

function showMatchEnd(result){$('#matchResult').textContent=result.title;const box=$('#matchScores');box.innerHTML='';(result.scores||[]).forEach(s=>{const r=document.createElement('div');r.className='score-row';r.innerHTML=`<span>${esc(s.name)}</span><strong>${esc(String(s.score))}</strong>`;box.appendChild(r)});$('#matchOverlay').classList.remove('hidden')}
async function cleanupRoom(){clearInterval(state.helloTimer);state.helloTimer=null;state.game?.stop();state.game=null;try{await state.peer?.close('leave')}catch{}state.peer=null;state.selfId=null;state.actions={};state.handlers.clear();state.players.clear();state.adminId=null}
async function leaveRoom(){await cleanupRoom();showScreen('home');$('#homeStatus').textContent=''}
window.addEventListener('beforeunload',()=>{try{state.peer?.close('unload')}catch{}});
