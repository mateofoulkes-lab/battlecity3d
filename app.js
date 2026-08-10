import { joinRoom, selfId } from 'https://esm.run/trystero';
import { BattleGame } from './game.js';

const APP_ID='battlecity3d-mateofoulkes-lab-v1';
const PALETTE=['#f4c542','#42c96f','#4da3ff','#ef5b5b','#b768ff','#ff8a38','#29d6cf','#f06bc2'];
const MODES={deathmatch:'Deathmatch','team-deathmatch':'Team Deathmatch',ctf:'Captura la bandera'};
const $=s=>document.querySelector(s);
const screens={home:$('#homeScreen'),lobby:$('#lobbyScreen'),game:$('#gameScreen')};

const state={name:'',roomCode:'',room:null,actions:{},isCreator:false,players:new Map(),adminId:null,mode:'deathmatch',game:null,colorMap:new Map(),joinedAt:0};

function showScreen(name){Object.entries(screens).forEach(([k,el])=>el.classList.toggle('hidden',k!==name));}
function normalizeCode(v){return v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',a=new Uint32Array(6);crypto.getRandomValues(a);return [...a].map(n=>chars[n%chars.length]).join('')}
function presence(){return{id:selfId,name:state.name,creator:state.isCreator,joinedAt:state.joinedAt}}
function esc(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

$('#nameInput').value=localStorage.getItem('battlecity3d-name')||'';
$('#roomCodeInput').addEventListener('input',e=>e.target.value=normalizeCode(e.target.value));
$('#createRoomBtn').addEventListener('click',()=>enterRoom(true));
$('#joinRoomBtn').addEventListener('click',()=>enterRoom(false));
$('#leaveRoomBtn').addEventListener('click',leaveRoom);

document.querySelectorAll('.mode-card').forEach(btn=>btn.addEventListener('click',()=>{
  if(selfId!==state.adminId)return;state.mode=btn.dataset.mode;state.actions.config.send({mode:state.mode});renderLobby();
}));

$('#startGameBtn').addEventListener('click',()=>{
  if(selfId!==state.adminId||state.players.size<2)return;
  const payload={mode:state.mode,seed:crypto.getRandomValues(new Uint32Array(1))[0]};
  state.actions.start.send(payload);beginGame(payload);
});

async function enterRoom(create){
  const name=$('#nameInput').value.trim();if(!name){$('#homeStatus').textContent='Poné un nombre primero.';return}
  const code=create?makeCode():normalizeCode($('#roomCodeInput').value);if(!create&&code.length<4){$('#homeStatus').textContent='Ingresá el código de la sala.';return}
  state.name=name.slice(0,14);state.roomCode=code;state.isCreator=create;state.joinedAt=Date.now();localStorage.setItem('battlecity3d-name',state.name);$('#homeStatus').textContent='Conectando por WebRTC…';
  try{
    state.room=joinRoom({appId:APP_ID},code);state.players.clear();state.players.set(selfId,presence());state.adminId=create?selfId:null;setupNetwork();renderLobby();showScreen('lobby');state.actions.presence.send(presence());
    setTimeout(()=>{electAdmin();renderLobby();state.actions.presence.send(presence())},700);
  }catch(err){console.error(err);$('#homeStatus').textContent='No se pudo abrir la sala.'}
}

function setupNetwork(){
  const r=state.room;
  const presenceAction=r.makeAction('presence'),config=r.makeAction('config'),start=r.makeAction('start-game'),tankState=r.makeAction('tank-state'),shoot=r.makeAction('shoot'),destroy=r.makeAction('destroy-block');
  state.actions={presence:presenceAction,config,start,tankState,shoot,destroy};
  presenceAction.onMessage=(data,{peerId})=>{state.players.set(peerId,{...data,id:peerId});electAdmin();renderLobby()};
  config.onMessage=(data,{peerId})=>{if(peerId!==state.adminId)return;state.mode=data.mode||state.mode;renderLobby()};
  start.onMessage=(data,{peerId})=>{if(peerId!==state.adminId)return;beginGame(data)};
  tankState.onMessage=(data,{peerId})=>state.game?.receiveState(peerId,data);
  shoot.onMessage=(data,{peerId})=>state.game?.receiveShoot(peerId,data);
  destroy.onMessage=data=>state.game?.receiveDestroy(data.id);
  r.onPeerJoin=peerId=>{presenceAction.send(presence(),{target:peerId});if(selfId===state.adminId)config.send({mode:state.mode},{target:peerId})};
  r.onPeerLeave=peerId=>{state.players.delete(peerId);state.game?.removePeer(peerId);electAdmin();renderLobby()};
}

function electAdmin(){
  const all=[...state.players.values()],creators=all.filter(p=>p.creator),pool=creators.length?creators:all;
  pool.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)||a.id.localeCompare(b.id));state.adminId=pool[0]?.id||selfId;
}

function freezeColors(){state.colorMap.clear();[...state.players.keys()].sort().forEach((id,i)=>state.colorMap.set(id,PALETTE[i%PALETTE.length]));}
function colorFor(id){if(state.colorMap.has(id))return state.colorMap.get(id);const ids=[...state.players.keys()].sort(),i=Math.max(0,ids.indexOf(id));return PALETTE[i%PALETTE.length]}

function renderLobby(){
  if(!state.room)return;$('#roomCodeLabel').textContent=state.roomCode;const list=$('#playersList');list.innerHTML='';
  [...state.players.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([id,p])=>{const row=document.createElement('div');row.className='player-row';row.innerHTML=`<span class="player-dot" style="background:${colorFor(id)}"></span><strong>${esc(p.name||'Jugador')}</strong><small>${id===state.adminId?'ADMIN':''}</small>`;list.appendChild(row)});
  const admin=selfId===state.adminId;document.querySelectorAll('.mode-card').forEach(btn=>{btn.disabled=!admin;btn.classList.toggle('active',btn.dataset.mode===state.mode)});
  const start=$('#startGameBtn');if(!admin){start.disabled=true;start.textContent='Esperando al admin…'}else if(state.players.size<2){start.disabled=true;start.textContent='Esperando otro jugador…'}else{start.disabled=false;start.textContent='Comenzar partida'}
  $('#lobbyStatus').textContent=`${state.players.size} jugador${state.players.size===1?'':'es'} conectado${state.players.size===1?'':'s'} · P2P`;
}

function beginGame(data){
  if(state.game)return;state.mode=data.mode||state.mode;freezeColors();showScreen('game');$('#hudMode').textContent=MODES[state.mode];$('#hudRoom').textContent=state.roomCode;$('#hudPlayer').textContent=state.name;
  state.game=new BattleGame({root:$('#gameRoot'),selfId,players:state.players,colorFor,onState:data=>state.actions.tankState.send(data),onShoot:data=>state.actions.shoot.send(data),onDestroy:id=>state.actions.destroy.send({id})});state.game.start();
}

function leaveRoom(){state.game?.stop();state.game=null;state.room?.leave();state.room=null;state.players.clear();showScreen('home');$('#homeStatus').textContent=''}
window.addEventListener('beforeunload',()=>state.room?.leave());
