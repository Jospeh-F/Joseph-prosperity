// ══════════════════════════════════════════════════════════════
//  FAMILLE JOSEPH — Audio Complet avec Firebase + WebRTC
// ══════════════════════════════════════════════════════════════

// ── FIREBASE ──────────────────────────────────────────────────
const firebaseConfig={
  apiKey:"AIzaSyDjS0w9LzFmlmS60wPfbkNQn52pXnuAqu4",
  authDomain:"famille-joseph.firebaseapp.com",
  databaseURL:"https://famille-joseph-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"famille-joseph",
  storageBucket:"famille-joseph.firebasestorage.app",
  messagingSenderId:"947111202335",
  appId:"1:947111202335:web:80bb0a25cf46b7311d0f2a"
};
firebase.initializeApp(firebaseConfig);
const db=firebase.database();

// ── STATE ──────────────────────────────────────────────────────
let myName='',myId='',myRole='member',roomCode='';
let localStream=null,processedStream=null;
let peerConnections={},audioElements={};
let participants={};
let roomRef=null;
let isMuted=false,isSpeakerOn=true,handRaised=false;
let durationTimer=null,callStart=null,analyserInterval=null;
let mediaRecorder=null,recordedChunks=[],isRecording=false;
let selectedPeerForAction=null;
let connQuality={};  // peerId → 'good'|'warn'|'bad'
let connCheckTimers={};
let bipCtx=null;

// VERSETS BIBLIQUES
const VERSES=[
  {ref:"Jean 3:16",text:"Car Dieu a tant aimé le monde qu'il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu'il ait la vie éternelle."},
  {ref:"Philippiens 4:13",text:"Je puis tout par celui qui me fortifie."},
  {ref:"Jérémie 29:11",text:"Car je connais les projets que j'ai formés sur vous, dit l'Éternel, projets de paix et non de malheur, afin de vous donner un avenir et de l'espérance."},
  {ref:"Psaume 23:1",text:"L'Éternel est mon berger: je ne manquerai de rien."},
  {ref:"Romains 8:28",text:"Nous savons, du reste, que toutes choses concourent au bien de ceux qui aiment Dieu."},
  {ref:"Proverbes 3:5-6",text:"Confie-toi en l'Éternel de tout ton cœur, et ne t'appuie pas sur ta sagesse. Reconnais-le dans toutes tes voies, et il aplanira tes sentiers."},
  {ref:"Matthieu 6:33",text:"Cherchez premièrement le royaume et la justice de Dieu; et toutes ces choses vous seront données par-dessus."},
  {ref:"Esaïe 40:31",text:"Ceux qui se confient en l'Éternel renouvellent leur force. Ils prennent le vol comme les aigles; ils courent et ne se lassent point, ils marchent et ne se fatiguent pas."},
  {ref:"Josué 1:9",text:"Sois fort et courageux! Ne t'effraie point et ne t'épouvante point, car l'Éternel, ton Dieu, est avec toi dans tout ce que tu entreprendras."},
  {ref:"1 Corinthiens 13:4",text:"L'amour est patient, il est plein de bonté; l'amour n'est point envieux; l'amour ne se vante point, il ne s'enfle point d'orgueil."},
  {ref:"Genèse 1:1",text:"Au commencement, Dieu créa les cieux et la terre."},
  {ref:"Apocalypse 3:20",text:"Voici, je me tiens à la porte, et je frappe. Si quelqu'un entend ma voix et ouvre la porte, j'entrerai chez lui, je souperai avec lui, et lui avec moi."},
];

const ICE_CONFIG={iceServers:[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'},
  {urls:'stun:stun2.l.google.com:19302'},
]};

// ── UTILS ──────────────────────────────────────────────────────
function rndId(n){return Math.random().toString(36).substring(2,2+n).toUpperCase();}
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join('');}
function toast(msg,dur=3200){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),dur);}
function setStatus(txt,state=''){document.getElementById('stext').textContent=txt;document.getElementById('sdot').className='sdot'+(state?' '+state:'');}
function showPanel(id){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));if(id)document.getElementById(id)?.classList.add('active');}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── BIP son connexion faible ────────────────────────────────────
function playBip(){
  try{
    if(!bipCtx) bipCtx=new AudioContext();
    const osc=bipCtx.createOscillator();
    const gain=bipCtx.createGain();
    osc.connect(gain);gain.connect(bipCtx.destination);
    osc.type='sine';osc.frequency.setValueAtTime(880,bipCtx.currentTime);
    gain.gain.setValueAtTime(.3,bipCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,bipCtx.currentTime+.4);
    osc.start(bipCtx.currentTime);osc.stop(bipCtx.currentTime+.4);
  }catch(e){}
}

// ── PUSH NOTIFICATION ──────────────────────────────────────────
async function requestNotifPerm(){
  if('Notification' in window && Notification.permission==='default'){
    await Notification.requestPermission();
  }
}
function pushNotif(title,body){
  if('Notification' in window && Notification.permission==='granted'){
    new Notification(title,{body,icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✝</text></svg>'});
  }
}

// ── STEP 1: NOM ────────────────────────────────────────────────
function saveName(){
  const v=document.getElementById('inp-name').value.trim();
  if(!v){toast('⚠️ Veuillez entrer votre nom');return;}
  myName=v;myId=rndId(12);
  myRole=document.getElementById('inp-role').value;
  document.getElementById('greet').textContent=myName.split(' ')[0];
  const roleLabels={host:'👑 Animateur',member:'👤 Membre',guest:'🙋 Invité'};
  document.getElementById('my-role-disp').textContent=roleLabels[myRole]||'Membre';
  showPanel('p-lobby');
  setStatus('Prêt — Créez ou rejoignez un appel');
  requestNotifPerm();
  // URL auto-join
  const urlCode=new URLSearchParams(location.search).get('room');
  if(urlCode){document.getElementById('inp-code').value=urlCode.toUpperCase();showPanel('p-join');toast('🔗 Code détecté: '+urlCode.toUpperCase(),4000);}
}

// ── MICROPHONE + NOISE REDUCTION ───────────────────────────────
async function getMic(){
  try{
    // Contraintes avancées avec réduction de bruit
    localStream=await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:true,
        noiseSuppression:true,    // Réduction de bruit auto
        autoGainControl:true,     // Gain automatique
        sampleRate:48000,
        channelCount:1
      },
      video:false
    });
    // Traitement audio supplémentaire via Web Audio API
    applyAudioProcessing();
    return true;
  }catch(e){
    document.getElementById('mic-modal').classList.remove('hidden');
    return false;
  }
}

function applyAudioProcessing(){
  try{
    const ctx=new AudioContext();
    const src=ctx.createMediaStreamSource(localStream);
    const dest=ctx.createMediaStreamDestination();
    // Compresseur dynamique pour equaliser les volumes
    const comp=ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-50,ctx.currentTime);
    comp.knee.setValueAtTime(40,ctx.currentTime);
    comp.ratio.setValueAtTime(12,ctx.currentTime);
    comp.attack.setValueAtTime(0,ctx.currentTime);
    comp.release.setValueAtTime(.25,ctx.currentTime);
    // Filtre passe-haut (coupe les basses fréquences — bruit de fond)
    const hpf=ctx.createBiquadFilter();
    hpf.type='highpass';
    hpf.frequency.setValueAtTime(100,ctx.currentTime);
    src.connect(hpf);hpf.connect(comp);comp.connect(dest);
    processedStream=dest.stream;
  }catch(e){processedStream=localStream;}
}

async function requestMicAccess(){
  closeModal('mic-modal');
  const ok=await getMic();
  if(ok)toast('🎙️ Microphone autorisé !');
}

// ── CRÉER ──────────────────────────────────────────────────────
async function createRoom(){
  if(!await getMic())return;
  roomCode=genCode();
  await enterRoom();
  // Notif push "réunion commencée"
  pushNotif('✝ Famille Joseph','La réunion a commencé ! Code: '+roomCode);
}

// ── REJOINDRE ──────────────────────────────────────────────────
async function joinRoom(){
  const code=document.getElementById('inp-code').value.trim().toUpperCase();
  if(code.length<4){toast('⚠️ Code invalide');return;}
  if(!await getMic())return;
  roomCode=code;
  await enterRoom();
}

// ── ENTRER DANS LA SALLE ───────────────────────────────────────
async function enterRoom(){
  setStatus('Connexion à Firebase...','yellow');
  document.getElementById('badge-wait').classList.remove('hidden');
  showPanel(null);
  document.getElementById('room-panel').style.display='flex';
  document.getElementById('room-panel').style.flexDirection='column';
  document.getElementById('room-code-disp').textContent=roomCode;
  document.getElementById('share-code').textContent=roomCode;
  document.getElementById('hdr-pcount').style.display='block';

  participants[myId]={name:myName,muted:false,speaking:false,self:true,role:myRole};
  renderParticipants();

  roomRef=db.ref('rooms/'+roomCode);
  const myRef=roomRef.child('members/'+myId);
  await myRef.set({name:myName,muted:false,role:myRole,joinedAt:Date.now()});
  myRef.onDisconnect().remove();

  // Membres existants
  roomRef.child('members').on('child_added',async snap=>{
    const peerId=snap.key;
    if(peerId===myId)return;
    const d=snap.val();
    if(!participants[peerId]){
      participants[peerId]={name:d.name,muted:d.muted||false,speaking:false,role:d.role||'member'};
      renderParticipants();
      sysChat(d.name+' a rejoint la réunion');
      toast('✅ '+d.name+' a rejoint',2500);
      pushNotif('✝ Famille Joseph',d.name+' a rejoint la réunion');
    }
    if(!peerConnections[peerId]) await createOffer(peerId);
    startConnQualityCheck(peerId);
  });

  roomRef.child('members').on('child_removed',snap=>{
    const peerId=snap.key;
    if(peerId===myId)return;
    const pname=participants[peerId]?.name||'Un membre';
    closePeer(peerId);
    delete participants[peerId];
    renderParticipants();
    sysChat(pname+' a quitté la réunion');
    toast('👋 '+pname+' a quitté',2500);
  });

  roomRef.child('members').on('child_changed',snap=>{
    const peerId=snap.key;
    if(peerId===myId||!participants[peerId])return;
    const d=snap.val();
    participants[peerId].muted=d.muted||false;
    // Commande mute de l'animateur
    if(d.forceMute&&d.forceMuteTarget===myId&&!isMuted){
      isMuted=true;
      if(localStream)localStream.getAudioTracks().forEach(t=>t.enabled=false);
      document.getElementById('ci-mute').textContent='🔇';
      document.getElementById('cl-mute').textContent='Activer micro';
      document.getElementById('cbtn-mute').className='cbtn red';
      if(participants[myId])participants[myId].muted=true;
      toast('🔇 L\'animateur a coupé votre micro');
      if(roomRef)roomRef.child('members/'+myId+'/muted').set(true);
    }
    renderParticipants();
  });

  // Signaux WebRTC
  roomRef.child('signals/'+myId).on('child_added',async snap=>{
    const sig=snap.val();snap.ref.remove();
    if(!sig||!sig.from)return;
    const from=sig.from;
    if(sig.type==='offer')await handleOffer(from,sig);
    else if(sig.type==='answer'&&peerConnections[from])
      await peerConnections[from].setRemoteDescription(new RTCSessionDescription({type:'answer',sdp:sig.sdp}));
    else if(sig.type==='ice'&&peerConnections[from]&&sig.candidate)
      try{await peerConnections[from].addIceCandidate(new RTCIceCandidate(sig.candidate));}catch(e){}
  });

  // Chat
  roomRef.child('chat').on('child_added',snap=>{
    const m=snap.val();
    if(m&&m.id!==myId) addChat(m.name,m.text,m.type||'text');
  });

  // Réactions
  roomRef.child('reactions').on('child_added',snap=>{
    const m=snap.val();
    if(m){showFloatingReaction(m.emoji);snap.ref.remove();}
  });

  // Mains levées
  roomRef.child('hands').on('child_added',snap=>{
    const m=snap.val();
    if(m&&m.id!==myId)sysChat('✋ '+m.name+' lève la main');
    snap.ref.remove();
  });

  callStart=Date.now();
  durationTimer=setInterval(updateDuration,1000);
  startAudioAnalysis();

  setStatus('En direct · Code: '+roomCode,'green');
  document.getElementById('badge-wait').classList.add('hidden');
  document.getElementById('badge-live').classList.remove('hidden');
  sysChat('✝ Bienvenue dans la réunion Famille Joseph · Code: '+roomCode);
  toast('✅ Réunion démarrée ! Code: '+roomCode,4000);
}

// ── WEBRTC ────────────────────────────────────────────────────
async function createOffer(peerId){
  const pc=createPC(peerId);
  try{
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal(peerId,{type:'offer',sdp:offer.sdp,from:myId});
  }catch(e){console.warn('createOffer:',e);}
}
async function handleOffer(peerId,sig){
  if(!participants[peerId]) participants[peerId]={name:'Participant',muted:false,speaking:false,role:'member'};
  const pc=createPC(peerId);
  try{
    await pc.setRemoteDescription(new RTCSessionDescription({type:'offer',sdp:sig.sdp}));
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(peerId,{type:'answer',sdp:answer.sdp,from:myId});
  }catch(e){console.warn('handleOffer:',e);}
}
function createPC(peerId){
  if(peerConnections[peerId])return peerConnections[peerId];
  const pc=new RTCPeerConnection(ICE_CONFIG);
  peerConnections[peerId]=pc;
  const stream=processedStream||localStream;
  if(stream)stream.getTracks().forEach(t=>pc.addTrack(t,stream));
  pc.onicecandidate=e=>{if(e.candidate)sendSignal(peerId,{type:'ice',candidate:e.candidate.toJSON(),from:myId});};
  pc.ontrack=e=>{
    if(!audioElements[peerId]){
      const audio=document.createElement('audio');
      audio.autoplay=true;audio.playsInline=true;
      audio.srcObject=e.streams[0];document.body.appendChild(audio);
      audioElements[peerId]=audio;
    }
  };
  pc.onconnectionstatechange=()=>{
    const state=pc.connectionState;
    if(state==='connected') updateConnQuality(peerId,'good');
    if(state==='failed'||state==='disconnected'){closePeer(peerId);}
  };
  // ICE state pour qualité connexion
  pc.oniceconnectionstatechange=()=>{
    const s=pc.iceConnectionState;
    if(s==='connected'||s==='completed') updateConnQuality(peerId,'good');
    if(s==='checking') updateConnQuality(peerId,'warn');
    if(s==='failed') updateConnQuality(peerId,'bad');
  };
  return pc;
}
async function sendSignal(targetId,data){
  try{await roomRef.child('signals/'+targetId).push(data);}catch(e){}
}
function closePeer(peerId){
  if(peerConnections[peerId]){peerConnections[peerId].close();delete peerConnections[peerId];}
  if(audioElements[peerId]){audioElements[peerId].remove();delete audioElements[peerId];}
  if(connCheckTimers[peerId]){clearInterval(connCheckTimers[peerId]);delete connCheckTimers[peerId];}
  delete connQuality[peerId];
}

// ── CONNEXION QUALITY CHECK ────────────────────────────────────
function startConnQualityCheck(peerId){
  connCheckTimers[peerId]=setInterval(async()=>{
    const pc=peerConnections[peerId];
    if(!pc)return;
    try{
      const stats=await pc.getStats();
      let rtt=null;
      stats.forEach(s=>{
        if(s.type==='candidate-pair'&&s.state==='succeeded')
          rtt=s.currentRoundTripTime||s.roundTripTime;
      });
      if(rtt!==null){
        const prev=connQuality[peerId];
        let q='good';
        if(rtt>0.3)q='warn';
        if(rtt>0.8)q='bad';
        updateConnQuality(peerId,q);
        // Bip si mauvaise connexion et changement d'état
        if(q==='bad'&&prev!=='bad'){
          playBip();
          const pname=participants[peerId]?.name||'Un participant';
          sysChat('⚠️ Connexion instable pour '+pname);
          toast('⚠️ Connexion instable: '+pname,3000);
        }
      }
    }catch(e){}
  },4000);
}
function updateConnQuality(peerId,quality){
  connQuality[peerId]=quality;
  renderParticipants();
}

// ── RENDER ────────────────────────────────────────────────────
function renderParticipants(){
  const grid=document.getElementById('pgrid');
  const count=Object.keys(participants).length;
  grid.innerHTML='';
  document.getElementById('part-count').textContent=count;
  document.getElementById('hdr-num').textContent=count;
  document.getElementById('info-pcount').textContent=count;
  if(count===0){grid.innerHTML='<div class="empty-state"><div class="ei">🎙️</div><div>En attente...</div></div>';return;}

  for(const [id,p] of Object.entries(participants)){
    const init=p.name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase()||'?';
    const q=connQuality[id]||'good';
    const roleLabel={host:'👑 Animateur',member:'👤 Membre',guest:'🙋 Invité'}[p.role||'member'];
    const isHost=myRole==='host'&&!p.self;

    const tile=document.createElement('div');
    tile.className='ptile'+(p.speaking?' speaking':'')+(p.muted?' muted-p':'')+(q==='bad'?' poor-conn':'');
    tile.innerHTML=`
      <div class="wave-wrap">
        <div class="wave-ring"></div>
        <div class="wave-ring"></div>
        <div class="wave-ring"></div>
        <div class="pavatar">${init}</div>
      </div>
      <div class="pname">${esc(p.name)}${p.self?' (Vous)':''}</div>
      <div class="role-badge role-${p.role||'member'}">${roleLabel}</div>
      <div class="conn-bars">
        <div class="bar ${q!=='bad'?'active '+q:''}"></div>
        <div class="bar ${q!=='bad'?'active '+q:''}"></div>
        <div class="bar ${q==='good'?'active '+q:''}"></div>
        <div class="bar ${q==='good'?'active '+q:''}"></div>
      </div>
      <div class="pstat">${p.speaking?'🎙️ parle...':p.muted?'silencieux':'🎧 écoute'}</div>
      ${p.muted?'<div class="pmicon">🔇</div>':''}
    `;
    // Click pour animateur
    if(isHost){
      tile.style.cursor='pointer';
      tile.title='Cliquez pour gérer ce participant';
      tile.onclick=()=>openRoleModal(id,p);
    }
    grid.appendChild(tile);
  }
}

// ── ANIMATEUR : COUPER MICRO ──────────────────────────────────
function openRoleModal(peerId,p){
  selectedPeerForAction=peerId;
  document.getElementById('role-modal-name').textContent=p.name;
  document.getElementById('role-mute-btn').textContent=p.muted?'🎙️ Réactiver le micro':'🔇 Couper le micro';
  document.getElementById('role-modal').classList.remove('hidden');
}
async function hostMutePeer(){
  if(!selectedPeerForAction||!roomRef)return;
  const p=participants[selectedPeerForAction];
  if(!p)return;
  const newMuted=!p.muted;
  // Envoyer commande via Firebase
  await roomRef.child('members/'+myId).update({forceMute:true,forceMuteTarget:selectedPeerForAction});
  setTimeout(()=>roomRef.child('members/'+myId).update({forceMute:false,forceMuteTarget:''}),2000);
  toast(newMuted?'🔇 Commande envoyée à '+p.name:'🎙️ Micro réactivé pour '+p.name);
  closeModal('role-modal');
}

// ── AUDIO ANALYSIS ────────────────────────────────────────────
function startAudioAnalysis(){
  if(!localStream)return;
  try{
    const ctx=new AudioContext();
    const src=ctx.createMediaStreamSource(localStream);
    const analyser=ctx.createAnalyser();
    analyser.fftSize=512;src.connect(analyser);
    const data=new Uint8Array(analyser.frequencyBinCount);
    let prev=false;
    analyserInterval=setInterval(()=>{
      if(isMuted){if(prev){prev=false;updateMyState(false);}return;}
      analyser.getByteFrequencyData(data);
      const avg=data.reduce((a,b)=>a+b,0)/data.length;
      const speaking=avg>10;
      if(speaking!==prev){prev=speaking;updateMyState(speaking);}
    },200);
  }catch(e){}
}
function updateMyState(speaking){
  if(participants[myId])participants[myId].speaking=speaking;
  renderParticipants();
}

// ── CONTROLS ─────────────────────────────────────────────────
function toggleMute(){
  isMuted=!isMuted;
  if(localStream)localStream.getAudioTracks().forEach(t=>t.enabled=!isMuted);
  document.getElementById('ci-mute').textContent=isMuted?'🔇':'🎙️';
  document.getElementById('cl-mute').textContent=isMuted?'Activer micro':'Couper micro';
  document.getElementById('cbtn-mute').className='cbtn'+(isMuted?' red':'');
  if(participants[myId])participants[myId].muted=isMuted;
  renderParticipants();
  if(roomRef)roomRef.child('members/'+myId+'/muted').set(isMuted);
  toast(isMuted?'🔇 Micro coupé':'🎙️ Micro activé');
}
function toggleSpeaker(){
  isSpeakerOn=!isSpeakerOn;
  Object.values(audioElements).forEach(a=>a.muted=!isSpeakerOn);
  document.getElementById('cbtn-spk').className='cbtn'+(isSpeakerOn?'':' red');
  toast(isSpeakerOn?'🔊 Haut-parleur activé':'🔈 Son coupé');
}
function raiseHand(){
  handRaised=!handRaised;
  document.getElementById('ci-hand').textContent=handRaised?'🙌':'✋';
  document.getElementById('cbtn-hand').className='cbtn'+(handRaised?' active':'');
  if(handRaised&&roomRef){roomRef.child('hands').push({id:myId,name:myName,t:Date.now()});toast('✋ Main levée');}
  else toast('Main baissée');
}

// ── ENREGISTREMENT ────────────────────────────────────────────
function toggleRecording(){
  if(!isRecording) startRecording();
  else stopRecording();
}
function startRecording(){
  if(!localStream)return;
  try{
    recordedChunks=[];
    const stream=new MediaStream([...localStream.getTracks()]);
    // Mixer aussi les audio distants si possible
    mediaRecorder=new MediaRecorder(stream,{mimeType:'audio/webm'});
    mediaRecorder.ondataavailable=e=>{if(e.data.size>0)recordedChunks.push(e.data);};
    mediaRecorder.onstop=downloadRecording;
    mediaRecorder.start(1000);
    isRecording=true;
    document.getElementById('ci-rec').textContent='⏹️';
    document.getElementById('cl-rec').textContent='Arrêter';
    document.getElementById('cbtn-rec').className='cbtn red';
    document.getElementById('rec-indicator').classList.add('active');
    toast('⏺️ Enregistrement démarré');
  }catch(e){toast('❌ Enregistrement non supporté sur ce navigateur');}
}
function stopRecording(){
  if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();
  isRecording=false;
  document.getElementById('ci-rec').textContent='⏺️';
  document.getElementById('cl-rec').textContent='Enregistrer';
  document.getElementById('cbtn-rec').className='cbtn';
  document.getElementById('rec-indicator').classList.remove('active');
  toast('✅ Enregistrement sauvegardé');
}
function downloadRecording(){
  const blob=new Blob(recordedChunks,{type:'audio/webm'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const date=new Date().toLocaleDateString('fr-FR').replace(/\//g,'-');
  a.href=url;a.download='FamilleJoseph-Reunion-'+date+'.webm';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── RÉACTIONS ────────────────────────────────────────────────
function sendReaction(emoji){
  showFloatingReaction(emoji);
  if(roomRef)roomRef.child('reactions').push({emoji,id:myId,name:myName,t:Date.now()});
}
function showFloatingReaction(emoji){
  const el=document.createElement('div');
  el.className='float-reaction';
  el.textContent=emoji;
  el.style.left=(20+Math.random()*60)+'vw';
  el.style.bottom='120px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2500);
}

// ── VERSETS BIBLIQUES ─────────────────────────────────────────
function openVersePicker(){
  const list=document.getElementById('verse-list');
  list.innerHTML=VERSES.map((v,i)=>`
    <div class="verse-item" onclick="shareVerse(${i})">
      <div class="verse-ref">${v.ref}</div>
      <div class="verse-text">${v.text}</div>
    </div>
  `).join('');
  document.getElementById('verse-modal').classList.remove('hidden');
}
function shareVerse(idx){
  const v=VERSES[idx];
  const txt='📖 '+v.ref+' — '+v.text;
  addChat(myName,txt,'verse');
  if(roomRef)roomRef.child('chat').push({id:myId,name:myName,text:txt,type:'verse',t:Date.now()});
  closeModal('verse-modal');
}

// ── CHAT ─────────────────────────────────────────────────────
function sendChat(){
  const inp=document.getElementById('chat-inp');
  const txt=inp.value.trim();
  if(!txt)return;
  addChat(myName,txt,'text');
  if(roomRef)roomRef.child('chat').push({id:myId,name:myName,text:txt,type:'text',t:Date.now()});
  inp.value='';
}
function addChat(name,text,type='text'){
  const box=document.getElementById('chat-msgs');
  const d=document.createElement('div');
  d.className='cmsg'+(type==='verse'?' verse':type==='system'?' sys':'');
  d.innerHTML=`<span class="cn">${esc(name)}: </span><span class="ct">${esc(text)}</span>`;
  box.appendChild(d);box.scrollTop=box.scrollHeight;
}
function sysChat(txt){
  const box=document.getElementById('chat-msgs');
  const d=document.createElement('div');
  d.className='cmsg sys';
  d.innerHTML=`<span class="ct">— ${txt}</span>`;
  box.appendChild(d);box.scrollTop=box.scrollHeight;
}

// ── DURÉE ────────────────────────────────────────────────────
function updateDuration(){
  const s=Math.floor((Date.now()-callStart)/1000);
  const m=String(Math.floor(s/60)).padStart(2,'0');
  const sec=String(s%60).padStart(2,'0');
  document.getElementById('dur').textContent=m+':'+sec;
}

// ── PARTAGE ──────────────────────────────────────────────────
function getLink(){return location.origin+location.pathname+'?room='+roomCode;}
function shareWA(){
  const txt='✝ *Famille Joseph* — Réunion Audio\n\nRejoignez-nous !\n\n🔗 '+getLink()+'\n📌 Code: *'+roomCode+'*\n\nÀ tout de suite 🙏';
  window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');
}
function shareFB(){window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(getLink()),'_blank');}
function copyLink(){navigator.clipboard.writeText(getLink()).then(()=>toast('📋 Lien copié!')).catch(()=>prompt('Copiez:',getLink()));}

// ── QUITTER ──────────────────────────────────────────────────
function leaveRoom(){
  if(isRecording)stopRecording();
  if(roomRef){roomRef.child('members/'+myId).remove();roomRef.off();roomRef=null;}
  Object.keys(peerConnections).forEach(closePeer);
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  if(durationTimer){clearInterval(durationTimer);durationTimer=null;}
  if(analyserInterval){clearInterval(analyserInterval);analyserInterval=null;}
  document.getElementById('room-panel').style.display='none';
  document.getElementById('badge-live').classList.add('hidden');
  document.getElementById('badge-wait').classList.add('hidden');
  document.getElementById('rec-indicator').classList.remove('active');
  document.getElementById('hdr-pcount').style.display='none';
  participants={};peerConnections={};audioElements={};connQuality={};
  isMuted=false;handRaised=false;isRecording=false;
  document.getElementById('ci-mute').textContent='🎙️';
  document.getElementById('cl-mute').textContent='Couper micro';
  document.getElementById('cbtn-mute').className='cbtn';
  document.getElementById('cbtn-hand').className='cbtn';
  document.getElementById('cbtn-rec').className='cbtn';
  document.getElementById('chat-msgs').innerHTML='';
  showPanel('p-lobby');
  setStatus('Prêt — Créez ou rejoignez un appel');
  toast('👋 Vous avez quitté la réunion');
}

// ── PLANNING ──────────────────────────────────────────────────
function saveSchedule(){
  const title=document.getElementById('sched-title').value.trim();
  const date=document.getElementById('sched-date').value;
  const time=document.getElementById('sched-time').value;
  const slug=document.getElementById('sched-slug').value.trim().toLowerCase().replace(/\s+/g,'-');
  const reminder=parseInt(document.getElementById('sched-reminder').value);
  if(!title||!date||!time){toast('⚠️ Remplissez tous les champs obligatoires');return;}
  const dt=new Date(date+'T'+time);
  const code=slug||genCode();
  const schedules=JSON.parse(localStorage.getItem('fj-schedules')||'[]');
  schedules.push({id:rndId(8),title,date,time,code,reminder,ts:dt.getTime()});
  localStorage.setItem('fj-schedules',JSON.stringify(schedules));
  // Planifier rappel
  const msUntil=dt.getTime()-Date.now()-(reminder*60000);
  if(msUntil>0){
    setTimeout(()=>{
      pushNotif('✝ Famille Joseph — Rappel','La réunion "'+title+'" commence dans '+reminder+' minutes ! Code: '+code);
      toast('🔔 Rappel: "'+title+'" commence bientôt !',6000);
    },msUntil);
  }
  closeModal('schedule-modal');
  renderSchedules();
  toast('✅ Réunion planifiée ! Code: '+code,4000);
  document.getElementById('sched-title').value='';
  document.getElementById('sched-date').value='';
  document.getElementById('sched-time').value='';
  document.getElementById('sched-slug').value='';
}

function renderSchedules(){
  const schedules=JSON.parse(localStorage.getItem('fj-schedules')||'[]');
  const grid=document.getElementById('plan-grid');
  if(!schedules.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;font-size:.9rem;">Aucune réunion planifiée. Créez-en une !</div>';
    return;
  }
  // Trier par date
  schedules.sort((a,b)=>a.ts-b.ts);
  grid.innerHTML=schedules.map(s=>{
    const dt=new Date(s.ts);
    const isPast=dt<new Date();
    const dateStr=dt.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
    const timeStr=dt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    return `
      <div class="plan-card" style="${isPast?'opacity:.55':''}">
        <div class="plan-card-header">
          <div class="plan-date-badge">${dateStr}</div>
          <div>
            <div class="plan-title">${esc(s.title)}</div>
            <div class="plan-time">🕐 ${timeStr}</div>
          </div>
        </div>
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:.5rem;">Code: <span style="color:var(--gold);font-weight:700;letter-spacing:.1em;">${s.code}</span></div>
        <div class="plan-actions">
          <button class="plan-btn plan-btn-join" onclick="joinScheduled('${s.code}')">🎙️ Rejoindre</button>
          <button class="plan-btn plan-btn-share" onclick="shareScheduled('${s.code}','${esc(s.title)}')">📤 Partager</button>
          <button class="plan-btn plan-btn-del" onclick="deleteSchedule('${s.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function joinScheduled(code){
  document.getElementById('inp-code').value=code;
  document.getElementById('app').scrollIntoView({behavior:'smooth'});
  if(myName) showPanel('p-join');
  else toast('Entrez d\'abord votre nom dans la section Appel Audio');
}
function shareScheduled(code,title){
  const link=location.origin+location.pathname+'?room='+code;
  const txt='✝ *Famille Joseph* — '+title+'\n\n🔗 '+link+'\n📌 Code: *'+code+'*\n\nÀ tout de suite 🙏';
  window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');
}
function deleteSchedule(id){
  let schedules=JSON.parse(localStorage.getItem('fj-schedules')||'[]');
  schedules=schedules.filter(s=>s.id!==id);
  localStorage.setItem('fj-schedules',JSON.stringify(schedules));
  renderSchedules();
}

// ── INIT ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  // Pré-remplir date minimale
  const today=new Date().toISOString().split('T')[0];
  document.getElementById('sched-date').min=today;
  document.getElementById('sched-date').value=today;
  // Charger planning
  renderSchedules();
  // Programmer les rappels sauvegardés
  const schedules=JSON.parse(localStorage.getItem('fj-schedules')||'[]');
  schedules.forEach(s=>{
    const msUntil=s.ts-Date.now()-(s.reminder*60000);
    if(msUntil>0){
      setTimeout(()=>{
        pushNotif('✝ Famille Joseph — Rappel','La réunion "'+s.title+'" commence dans '+s.reminder+' minutes !');
        toast('🔔 Rappel: "'+s.title+'" commence bientôt !',6000);
      },msUntil);
    }
  });
  // URL auto-join
  const urlCode=new URLSearchParams(location.search).get('room');
  if(urlCode){
    document.getElementById('inp-code').value=urlCode.toUpperCase();
    toast('🔗 Code détecté: '+urlCode.toUpperCase(),4000);
  }
});