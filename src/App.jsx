import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const NOTE_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const CHORD_TYPES = {
  maj:  { intervals:[0,4,7],        label:"",      color:"#5bc8f5", cat:"major" },
  min:  { intervals:[0,3,7],        label:"m",     color:"#a78bfa", cat:"minor" },
  dom7: { intervals:[0,4,7,10],     label:"7",     color:"#fbbf24", cat:"dominant" },
  maj7: { intervals:[0,4,7,11],     label:"maj7",  color:"#34d399", cat:"major" },
  min7: { intervals:[0,3,7,10],     label:"m7",    color:"#c084fc", cat:"minor" },
  dim7: { intervals:[0,3,6,9],      label:"°7",    color:"#f87171", cat:"diminished" },
  dom9: { intervals:[0,4,7,10,14],  label:"9",     color:"#fb923c", cat:"dominant" },
  min9: { intervals:[0,3,7,10,14],  label:"m9",    color:"#e879f9", cat:"minor" },
  maj9: { intervals:[0,4,7,11,14],  label:"maj9",  color:"#6ee7b7", cat:"major" },
  sus2: { intervals:[0,2,7],        label:"sus2",  color:"#67e8f9", cat:"sus" },
  sus4: { intervals:[0,5,7],        label:"sus4",  color:"#67e8f9", cat:"sus" },
};
const MAJOR_SCALE    = [0,2,4,5,7,9,11];
const DIATONIC_TYPES = ["maj","min","min","maj","dom7","min","dim7"];
const DIATONIC_FANCY = ["maj9","min9","min7","maj9","dom9","min9","dim7"];
const DEGREES        = ["I","ii","iii","IV","V","vi","vii°"];

const MOOD_PROGRESSIONS = {
  afrobeats:  { label:"Afrobeats",  emoji:"🌍", progressions:{ 4:[0,3,5,4],     6:[0,5,3,0,4,5],   8:[0,3,5,4,0,3,2,4]  } },
  neosoul:    { label:"Neo-Soul",   emoji:"🎷", progressions:{ 4:[0,5,3,4],     6:[0,2,5,3,4,0],   8:[0,2,5,3,0,5,3,4]  } },
  deephouse:  { label:"Deep House", emoji:"🎛️", progressions:{ 4:[5,0,3,4],     6:[5,3,0,5,4,3],   8:[5,3,0,5,3,4,0,3]  } },
  rnb:        { label:"R&B",        emoji:"🎤", progressions:{ 4:[0,5,3,4],     6:[0,5,3,4,2,5],   8:[0,5,3,4,0,3,2,4]  } },
  jazz:       { label:"Jazz",       emoji:"🎺", progressions:{ 4:[1,4,0,5],     6:[1,4,0,5,2,4],   8:[0,2,5,1,4,0,5,3]  } },
  cinematic:  { label:"Cinematic",  emoji:"🎬", progressions:{ 4:[0,5,3,4],     6:[0,3,5,4,2,0],   8:[0,5,3,4,0,5,3,4]  } },
};

const KEYBOARD_KEYS = ["A","S","D","F","G","H","J","K","L",";","W","E","T","Y","U","I"];

// ─── Music Theory ──────────────────────────────────────────────────────────────
function buildDiatonic(rootIdx) {
  return MAJOR_SCALE.map((interval, i) => {
    const noteIdx = (rootIdx + interval) % 12;
    const type = DIATONIC_TYPES[i];
    return { id:`d${i}`, degree:DEGREES[i], degreeIdx:i, noteIdx, noteName:NOTE_NAMES[noteIdx], type, fancyType:DIATONIC_FANCY[i], label:NOTE_NAMES[noteIdx]+CHORD_TYPES[type].label, isSecondary:false };
  });
}
function buildSecondary(rootIdx, diatonic) {
  return diatonic.slice(1,6).map((target, i) => {
    const secIdx = (target.noteIdx + 7) % 12;
    return { id:`s${i}`, degree:`V/${diatonic[i+1].degree}`, degreeIdx:-1, noteIdx:secIdx, noteName:NOTE_NAMES[secIdx], type:"dom7", fancyType:"dom9", label:NOTE_NAMES[secIdx]+"7", isSecondary:true };
  });
}
function chordMidi(rootMidi, type, inv=0) {
  const ints = CHORD_TYPES[type]?.intervals || [0,4,7];
  let notes = ints.map(i => rootMidi + i);
  for (let i=0;i<inv;i++) { notes[i]+=12; notes.sort((a,b)=>a-b); }
  return notes;
}
function bestInversion(prev, rootMidi, type) {
  const ints = CHORD_TYPES[type]?.intervals || [0,4,7];
  if (!prev?.length) return 0;
  let best=0, bestD=Infinity;
  for (let inv=0;inv<ints.length;inv++) {
    const n = chordMidi(rootMidi,type,inv);
    const d = Math.abs(n[0]-prev[0]) + Math.abs(n[n.length-1]-prev[prev.length-1]);
    if (d<bestD) { bestD=d; best=inv; }
  }
  return best;
}
function layoutNodes(nodes, cx, cy) {
  const diatonic  = nodes.filter(n=>!n.isSecondary);
  const secondary = nodes.filter(n=>n.isSecondary);
  const r1=115, r2=220;
  const arcStart=-Math.PI*0.75, arcEnd=Math.PI*0.75;
  return [
    ...diatonic.map((n,i)=>{ const a=arcStart+(arcEnd-arcStart)*(i/(diatonic.length-1)); return {...n,x:cx+r1*Math.cos(a),y:cy+r1*Math.sin(a)}; }),
    ...secondary.map((n,i)=>{ const a=-Math.PI+(Math.PI*(i+1))/(secondary.length+1); return {...n,x:cx+r2*Math.cos(a),y:cy+r2*Math.sin(a)}; }),
  ];
}
const EDGES = [
  ["d4","d0"],["d1","d4"],["d3","d0"],["d5","d1"],["d2","d5"],["d6","d0"],
  ["d3","d4"],["d0","d3"],["d0","d4"],["d0","d5"],["d2","d6"],
  ["s0","d1"],["s1","d2"],["s2","d3"],["s3","d4"],["s4","d5"],
];

// ─── Audio (pre-warmed, zero lag) ─────────────────────────────────────────────
let _Tone=null, _synth=null, _audioReady=false;
async function getTone() {
  if (_Tone) return _Tone;
  return new Promise(res => {
    if (window.Tone) { _Tone=window.Tone; res(_Tone); return; }
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js";
    s.onload=()=>{ _Tone=window.Tone; res(_Tone); };
    document.head.appendChild(s);
  });
}
async function warmAudio() {
  if (_audioReady) return;
  const T = await getTone();
  await T.start();
  const reverb = new T.Reverb({ decay:4, wet:0.5 }).toDestination();
  const chorus  = new T.Chorus(2, 3.5, 0.4).connect(reverb).start();
  _synth = new T.PolySynth(T.FMSynth, {
    harmonicity:3, modulationIndex:8,
    oscillator:{ type:"sine" },
    envelope:{ attack:0.06, decay:0.8, sustain:0.3, release:2.8 },
    modulation:{ type:"triangle" },
    modulationEnvelope:{ attack:0.2, decay:0.4, sustain:0.2, release:2.0 },
    volume:-18,
  }).connect(chorus);
  _audioReady=true;
}
async function playNotes(midiNotes, dur="2n") {
  try {
    if (!_audioReady) await warmAudio();
    const T = await getTone();
    const freqs = midiNotes.map(n=>T.Frequency(n,"midi").toFrequency());
    _synth.triggerAttackRelease(freqs, dur);
  } catch(e) { console.warn(e); }
}

// ─── Shop data ─────────────────────────────────────────────────────────────────
function buildShopChords() {
  const chords=[]; const roots=[0,2,4,5,7,9,11]; const types=["maj","min","dom7","maj7","min7","dom9","min9","sus2","sus4"];
  roots.forEach(rIdx=>types.forEach(type=>{ const ct=CHORD_TYPES[type]; chords.push({id:`${rIdx}-${type}`,noteIdx:rIdx,noteName:NOTE_NAMES[rIdx],type,label:NOTE_NAMES[rIdx]+ct.label,color:ct.color,cat:ct.cat}); }));
  return chords;
}
const ALL_SHOP_CHORDS = buildShopChords();

// ─── Main App ──────────────────────────────────────────────────────────────────
const TABS=["graph","shop","builder"];
const TAB_LABELS={graph:"Navigator",shop:"Chord Shop",builder:"Phrase Builder"};

export default function App() {
  const [tab,setTab]                   = useState("graph");
  const [keyIdx,setKeyIdx]             = useState(0);
  const [fancyMode,setFancyMode]       = useState(false);
  const [activeId,setActiveId]         = useState(null);
  const [prevNotes,setPrevNotes]       = useState([]);
  const [midiStatus,setMidiStatus]     = useState("idle");
  const [lastNote,setLastNote]         = useState(null);
  const [favorites,setFavorites]       = useState([]);
  const [phrase,setPhrase]             = useState(Array(8).fill(null));
  const [phraseLen,setPhraseLen]       = useState(4);
  const [playingSlot,setPlayingSlot]   = useState(null);
  const [shopFilter,setShopFilter]     = useState("all");
  const [animKey,setAnimKey]           = useState(0);
  const [mood,setMood]                 = useState("neosoul");
  const [selectedSlot,setSelectedSlot] = useState(null);
  const prevKeyRef = useRef(0);

  const recommendedDegrees = useMemo(()=>{
    const prog=MOOD_PROGRESSIONS[mood]?.progressions; if (!prog) return [];
    const lens=Object.keys(prog).map(Number).sort((a,b)=>a-b);
    const best=lens.reduce((p,c)=>Math.abs(c-phraseLen)<Math.abs(p-phraseLen)?c:p,lens[0]);
    const base=prog[best]||[];
    return Array.from({length:phraseLen},(_,i)=>base[i%base.length]);
  },[mood,phraseLen]);

  const {nodes,nodeMap} = useMemo(()=>{
    const d=buildDiatonic(keyIdx), s=buildSecondary(keyIdx,d), raw=[...d,...s];
    const positioned=layoutNodes(raw,370,255); const map={};
    positioned.forEach(n=>{map[n.id]=n;}); return {nodes:positioned,nodeMap:map};
  },[keyIdx]);

  const midiMapping = useMemo(()=>{
    const diatonic=nodes.filter(n=>!n.isSecondary);
    return recommendedDegrees.map((degIdx,slotIdx)=>{
      const node=diatonic[degIdx];
      return {slotIdx,node,midiNote:60+(node?.noteIdx||0),key:KEYBOARD_KEYS[slotIdx]||`${slotIdx+1}`};
    });
  },[nodes,recommendedDegrees]);

  useEffect(()=>{ if(prevKeyRef.current!==keyIdx){setAnimKey(k=>k+1);prevKeyRef.current=keyIdx;} },[keyIdx]);

  // Pre-warm on first interaction
  useEffect(()=>{
    const warm=()=>warmAudio();
    window.addEventListener('click',warm,{once:true});
    window.addEventListener('keydown',warm,{once:true});
    return ()=>{ window.removeEventListener('click',warm); window.removeEventListener('keydown',warm); };
  },[]);

  const applyRecommendedToPhrase = useCallback(()=>{
    const diatonic=nodes.filter(n=>!n.isSecondary);
    const newPhrase=Array(phraseLen).fill(null).map((_,i)=>{
      const node=diatonic[recommendedDegrees[i]]; if(!node) return null;
      const type=fancyMode?node.fancyType:node.type; const ct=CHORD_TYPES[type];
      return {id:`${node.noteIdx}-${type}`,noteIdx:node.noteIdx,noteName:node.noteName,type,label:node.noteName+ct.label,color:ct.color,cat:ct.cat,degree:node.degree};
    });
    setPhrase([...newPhrase,...Array(8-phraseLen).fill(null)]);
  },[nodes,recommendedDegrees,phraseLen,fancyMode]);

  // MIDI
  useEffect(()=>{
    if(!navigator.requestMIDIAccess){setMidiStatus("unsupported");return;}
    navigator.requestMIDIAccess().then(access=>{
      setMidiStatus("connected");
      const onMsg=(e)=>{
        const [status,note,vel]=e.data;
        if((status&0xf0)===0x90&&vel>0){
          setLastNote(note);
          const noteIdx=note%12;
          const mapped=midiMapping.find(m=>m.midiNote%12===noteIdx);
          if(mapped?.node){ triggerNode(mapped.node,note,mapped.slotIdx); }
          else {
            const match=nodes.find(n=>n.noteIdx===noteIdx&&!n.isSecondary)||nodes.find(n=>n.noteIdx===noteIdx);
            if(match) triggerNode(match,note,null);
          }
        }
      };
      access.inputs.forEach(i=>i.onmidimessage=onMsg);
      access.onstatechange=()=>access.inputs.forEach(i=>i.onmidimessage=onMsg);
    }).catch(()=>setMidiStatus("error"));
  },[nodes,midiMapping,fancyMode,prevNotes]);

  const triggerNode = useCallback((node,midiRoot=null,slotIdx=null)=>{
    const type=fancyMode?node.fancyType:node.type;
    const root=midiRoot??(60+node.noteIdx);
    const inv=bestInversion(prevNotes,root,type);
    const midiNotes=chordMidi(root,type,inv);
    setActiveId(node.id); setPrevNotes(midiNotes);
    playNotes(midiNotes);
    const targetSlot=slotIdx!==null?slotIdx:selectedSlot;
    if(targetSlot!==null){
      const ct=CHORD_TYPES[type];
      setPhrase(p=>{ const n=[...p]; n[targetSlot]={id:`${node.noteIdx}-${type}`,noteIdx:node.noteIdx,noteName:node.noteName,type,label:node.noteName+ct.label,color:ct.color,cat:ct.cat,degree:node.degree}; return n; });
      if(slotIdx===null) setSelectedSlot(s=>s<phraseLen-1?s+1:null);
    }
    setTimeout(()=>setActiveId(null),2000);
  },[fancyMode,prevNotes,selectedSlot,phraseLen]);

  const playPhrase = useCallback(async()=>{
    const filled=phrase.slice(0,phraseLen).filter(Boolean); if(!filled.length) return;
    let prev=[];
    for(let i=0;i<filled.length;i++){
      setPlayingSlot(i); const c=filled[i];
      const root=60+c.noteIdx, inv=bestInversion(prev,root,c.type), midiNotes=chordMidi(root,c.type,inv);
      prev=midiNotes; playNotes(midiNotes,"2n");
      await new Promise(r=>setTimeout(r,900));
    }
    setPlayingSlot(null);
  },[phrase,phraseLen]);

  const toggleFav=useCallback((chord)=>setFavorites(f=>f.find(c=>c.id===chord.id)?f.filter(c=>c.id!==chord.id):[...f,chord]),[]);
  const addToPhrase=useCallback((chord,slotIdx=null)=>setPhrase(p=>{const n=[...p];if(slotIdx!==null){n[slotIdx]=chord;}else{const e=n.findIndex(s=>s===null);if(e!==-1)n[e]=chord;}return n;}),[]);
  const isFav=(id)=>favorites.some(c=>c.id===id);

  return (
    <div style={{minHeight:"100vh",background:"#070b10",fontFamily:"'SF Mono','Fira Code',monospace",color:"#e2e8f0",display:"flex",flexDirection:"column"}}>
      {/* Top Bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 18px 0",borderBottom:"1px solid #1a2535",background:"#090e16",flexWrap:"wrap",gap:"6px"}}>
        <div style={{display:"flex",alignItems:"baseline",gap:"8px"}}>
          <span style={{fontSize:"12px",letterSpacing:"4px",color:"#5bc8f5",opacity:0.8}}>HARMONIA</span>
          <span style={{fontSize:"9px",color:"#334155",letterSpacing:"2px"}}>v0.3</span>
        </div>
        <div style={{display:"flex",gap:"0"}}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:tab===t?"2px solid #5bc8f5":"2px solid transparent",color:tab===t?"#5bc8f5":"#475569",padding:"8px 14px",fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",cursor:"pointer",transition:"all 0.2s"}}>{TAB_LABELS[t]}</button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}>
          <select value={keyIdx} onChange={e=>setKeyIdx(Number(e.target.value))} style={{background:"#0d1520",border:"1px solid #1e3a5f",color:"#5bc8f5",padding:"3px 7px",borderRadius:"4px",fontSize:"11px",cursor:"pointer",outline:"none"}}>
            {NOTE_NAMES.map((n,i)=><option key={i} value={i}>{n} maj</option>)}
          </select>
          <select value={mood} onChange={e=>setMood(e.target.value)} style={{background:"#0d1520",border:"1px solid #2a1a3a",color:"#e879f9",padding:"3px 7px",borderRadius:"4px",fontSize:"11px",cursor:"pointer",outline:"none"}}>
            {Object.entries(MOOD_PROGRESSIONS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <div style={{display:"flex",alignItems:"center",gap:"3px"}}>
            <span style={{fontSize:"8px",color:"#475569",letterSpacing:"2px"}}>BARS</span>
            {[4,6,8].map(l=>(
              <button key={l} onClick={()=>setPhraseLen(l)} style={{background:phraseLen===l?"rgba(91,200,245,0.15)":"transparent",border:`1px solid ${phraseLen===l?"#5bc8f5":"#1e3a5f"}`,color:phraseLen===l?"#5bc8f5":"#475569",padding:"2px 7px",borderRadius:"3px",fontSize:"10px",cursor:"pointer"}}>{l}</button>
            ))}
          </div>
          <button onClick={()=>setFancyMode(f=>!f)} style={{background:fancyMode?"rgba(91,200,245,0.12)":"transparent",border:`1px solid ${fancyMode?"#5bc8f5":"#1e3a5f"}`,color:fancyMode?"#5bc8f5":"#475569",padding:"3px 9px",borderRadius:"4px",fontSize:"10px",cursor:"pointer"}}>{fancyMode?"✦ EXT":"EXT"}</button>
          <div style={{display:"flex",alignItems:"center",gap:"4px",padding:"3px 7px",border:`1px solid ${midiStatus==="connected"?"#1a4a2a":"#1e2a3a"}`,borderRadius:"4px",fontSize:"10px",color:midiStatus==="connected"?"#4ade80":"#334155"}}>
            <div style={{width:"4px",height:"4px",borderRadius:"50%",background:midiStatus==="connected"?"#4ade80":"#334155",animation:midiStatus==="connected"?"blink 2s infinite":"none"}}/>
            {midiStatus==="connected"?`MIDI${lastNote!==null?" "+NOTE_NAMES[lastNote%12]:""}` :"NO MIDI"}
          </div>
        </div>
      </div>

      <div style={{flex:1,overflow:"hidden"}}>
        {tab==="graph"&&<GraphTab nodes={nodes} nodeMap={nodeMap} edges={EDGES} activeId={activeId} fancyMode={fancyMode} triggerNode={triggerNode} animKey={animKey} keyName={NOTE_NAMES[keyIdx]} phrase={phrase} phraseLen={phraseLen} selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} recommendedDegrees={recommendedDegrees} midiMapping={midiMapping} mood={mood} applyRecommendedToPhrase={applyRecommendedToPhrase} playPhrase={playPhrase} playingSlot={playingSlot} setTab={setTab}/>}
        {tab==="shop"&&<ShopTab chords={ALL_SHOP_CHORDS} favorites={favorites} toggleFav={toggleFav} isFav={isFav} shopFilter={shopFilter} setShopFilter={setShopFilter} addToPhrase={addToPhrase}/>}
        {tab==="builder"&&<BuilderTab phrase={phrase} setPhrase={setPhrase} phraseLen={phraseLen} setPhraseLen={setPhraseLen} playPhrase={playPhrase} playingSlot={playingSlot} favorites={favorites} addToPhrase={addToPhrase} recommendedDegrees={recommendedDegrees} nodes={nodes} fancyMode={fancyMode} mood={mood}/>}
      </div>

      <style>{`
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{transform:scale(1);opacity:0.5}50%{transform:scale(1.2);opacity:1}}
        select option{background:#0d1520;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px;}
      `}</style>
    </div>
  );
}

// ─── Graph Tab ─────────────────────────────────────────────────────────────────
function GraphTab({nodes,nodeMap,edges,activeId,fancyMode,triggerNode,animKey,keyName,phrase,phraseLen,selectedSlot,setSelectedSlot,recommendedDegrees,midiMapping,mood,applyRecommendedToPhrase,playPhrase,playingSlot,setTab}){
  const [hoverId,setHoverId]=useState(null);
  const diatonic=nodes.filter(n=>!n.isSecondary);
  const slotNodeMap=recommendedDegrees.map(degIdx=>diatonic[degIdx]);

  return (
    <div style={{display:"flex",height:"calc(100vh - 53px)",overflow:"hidden"}}>
      <div style={{flex:1,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"14px",left:"18px",zIndex:5,fontSize:"26px",fontWeight:"bold",letterSpacing:"2px",color:"#5bc8f5",opacity:0.1,pointerEvents:"none"}}>{keyName}</div>
        <div style={{position:"absolute",top:"14px",right:"18px",zIndex:5,fontSize:"9px",color:"#e879f9",letterSpacing:"2px",opacity:0.5,pointerEvents:"none"}}>{MOOD_PROGRESSIONS[mood]?.emoji} {MOOD_PROGRESSIONS[mood]?.label?.toUpperCase()}</div>

        <svg key={animKey} viewBox="0 0 740 510" style={{width:"100%",height:"100%",display:"block"}}>
          <defs>
            <radialGradient id="bgG" cx="50%" cy="50%"><stop offset="0%" stopColor="#0d1a2a"/><stop offset="100%" stopColor="#070b10"/></radialGradient>
            <marker id="arr" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.8"/></marker>
            <marker id="arr-hot" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="none" stroke="#5bc8f5" strokeWidth="0.8" opacity="0.6"/></marker>
            <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="softglow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="recglow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <rect width="740" height="510" fill="url(#bgG)"/>
          {[85,160,235].map(r=><circle key={r} cx={370} cy={255} r={r} fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" strokeDasharray="3 9"/>)}

          {edges.map((e,i)=>{
            const from=nodeMap[e[0]],to=nodeMap[e[1]]; if(!from||!to) return null;
            const hot=activeId===e[0]||activeId===e[1]||hoverId===e[0]||hoverId===e[1];
            const dx=to.x-from.x,dy=to.y-from.y,len=Math.sqrt(dx*dx+dy*dy),nx=dx/len,ny=dy/len,r=22;
            return <line key={i} x1={from.x+nx*r} y1={from.y+ny*r} x2={to.x-nx*(r+7)} y2={to.y-ny*(r+7)} stroke={hot?"rgba(91,200,245,0.3)":"rgba(255,255,255,0.06)"} strokeWidth={hot?1.1:0.5} markerEnd={hot?"url(#arr-hot)":"url(#arr)"} style={{transition:"stroke 0.3s"}}/>;
          })}

          {nodes.map((node,idx)=>{
            const type=fancyMode?node.fancyType:node.type;
            const ct=CHORD_TYPES[type]||CHORD_TYPES.maj;
            const isActive=activeId===node.id, isHover=hoverId===node.id;
            const r=node.isSecondary?18:22;
            const mySlots=node.isSecondary?[]:slotNodeMap.reduce((acc,n,si)=>{if(n?.id===node.id)acc.push(si);return acc;},[]);
            const isRec=mySlots.length>0;
            const isSelSlot=selectedSlot!==null&&slotNodeMap[selectedSlot]?.id===node.id;

            return (
              <g key={`${node.id}-${animKey}`} style={{cursor:"pointer",animation:`fadeIn 0.4s ease both`,animationDelay:`${idx*0.04}s`}}
                onClick={()=>triggerNode(node)} onMouseEnter={()=>setHoverId(node.id)} onMouseLeave={()=>setHoverId(null)}>
                {isRec&&!isActive&&<circle cx={node.x} cy={node.y} r={r+9} fill="none" stroke="#e879f9" strokeWidth={isSelSlot?2:1.5} opacity={isSelSlot?0.9:0.3} strokeDasharray={isSelSlot?"none":"4 3"} filter="url(#recglow)" style={{animation:isSelSlot?"pulse 1.5s infinite":"none"}}/>}
                {isActive&&<circle cx={node.x} cy={node.y} r={r+11} fill="none" stroke={ct.color} strokeWidth="1.5" opacity="0.25" filter="url(#glow)"/>}
                <circle cx={node.x} cy={node.y} r={r}
                  fill={isActive?ct.color:isHover?`${ct.color}22`:"#0a1520"}
                  stroke={isRec?"#e879f9":ct.color}
                  strokeWidth={isActive?2.5:isRec?2:node.isSecondary?1:1.5}
                  strokeDasharray={node.isSecondary?"3 3":"none"}
                  opacity={node.isSecondary?0.7:1}
                  filter={isActive?"url(#glow)":isHover?"url(#softglow)":undefined}
                  style={{transition:"fill 0.2s,stroke-width 0.2s"}}
                />
                <text x={node.x} y={node.y-(node.label.length>4?3:2)} textAnchor="middle" dominantBaseline="middle" fill={isActive?"#060c14":ct.color} fontSize={node.label.length>4?"9":"11"} fontWeight="bold" fontFamily="'SF Mono','Fira Code',monospace" style={{transition:"fill 0.2s"}}>{node.label}</text>
                <text x={node.x} y={node.y+11} textAnchor="middle" fill={isActive?"#060c14":"rgba(255,255,255,0.2)"} fontSize="7" fontFamily="'SF Mono','Fira Code',monospace">{node.degree}</text>

                {/* Slot number badges */}
                {mySlots.map((slotNum,si)=>{
                  const totalAngSpread=Math.PI*0.5;
                  const startAng=-Math.PI/2-totalAngSpread/2;
                  const ang=mySlots.length>1?startAng+(totalAngSpread*si/(mySlots.length-1)):-Math.PI/2;
                  const bx=node.x+(r+14)*Math.cos(ang), by=node.y+(r+14)*Math.sin(ang);
                  return (
                    <g key={slotNum} onClick={e=>{e.stopPropagation();setSelectedSlot(slotNum===selectedSlot?null:slotNum);}}>
                      <circle cx={bx} cy={by} r={9} fill={selectedSlot===slotNum?"#e879f9":"#0d1520"} stroke="#e879f9" strokeWidth="1.2"/>
                      <text x={bx} y={by} textAnchor="middle" dominantBaseline="middle" fill={selectedSlot===slotNum?"#060c14":"#e879f9"} fontSize="8" fontWeight="bold">{slotNum+1}</text>
                    </g>
                  );
                })}

                {/* MIDI key hint above node */}
                {isRec&&midiMapping[mySlots[0]]&&(
                  <text x={node.x} y={node.y-r-8} textAnchor="middle" fill="#e879f944" fontSize="7" fontFamily="'SF Mono','Fira Code',monospace">{midiMapping[mySlots[0]]?.key?.trim()}</text>
                )}
              </g>
            );
          })}

          <circle cx={370} cy={255} r={3} fill="rgba(91,200,245,0.12)"/>
          <line x1={366} y1={255} x2={374} y2={255} stroke="rgba(91,200,245,0.12)" strokeWidth="1"/>
          <line x1={370} y1={251} x2={370} y2={259} stroke="rgba(91,200,245,0.12)" strokeWidth="1"/>
        </svg>
      </div>

      {/* Right Panel */}
      <div style={{width:"228px",borderLeft:"1px solid #0f1e30",background:"#090e16",display:"flex",flexDirection:"column",padding:"12px",gap:"12px",overflowY:"auto"}}>

        {/* Phrase slots */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"7px"}}>
            <span style={{fontSize:"9px",letterSpacing:"3px",color:"#334155"}}>PHRASE</span>
            <button onClick={applyRecommendedToPhrase} style={{background:"rgba(232,121,249,0.1)",border:"1px solid #e879f944",color:"#e879f9",padding:"2px 7px",borderRadius:"3px",fontSize:"8px",cursor:"pointer",letterSpacing:"1px"}}>AUTO FILL</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"3px"}}>
            {Array.from({length:phraseLen},(_,i)=>{
              const chord=phrase[i], isPlaying=playingSlot===i, isSel=selectedSlot===i;
              const recNode=diatonic[recommendedDegrees[i]];
              return (
                <div key={i} onClick={()=>setSelectedSlot(isSel?null:i)} style={{background:isPlaying?(chord?`${chord.color}22`:"#0f2030"):isSel?"rgba(232,121,249,0.1)":"#0a1520",border:`1px solid ${isPlaying?chord?.color:isSel?"#e879f9":chord?"#1e3a5f":"#0f1e2a"}`,borderRadius:"5px",padding:"5px 3px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",minHeight:"48px",position:"relative",transition:"all 0.2s"}}>
                  <div style={{fontSize:"7px",color:isSel?"#e879f9":"#334155",letterSpacing:"1px"}}>{i+1}</div>
                  {chord?(<>
                    <div style={{fontSize:"10px",fontWeight:"bold",color:chord.color}}>{chord.label}</div>
                    <div style={{fontSize:"6px",color:`${chord.color}66`}}>{chord.degree}</div>
                  </>):(<>
                    <div style={{fontSize:"8px",color:"#1e3a5f"}}>{recNode?.label}</div>
                    <div style={{fontSize:"6px",color:"#1a2a3a"}}>suggest</div>
                  </>)}
                  {isSel&&<div style={{position:"absolute",top:2,right:2,width:"3px",height:"3px",borderRadius:"50%",background:"#e879f9"}}/>}
                </div>
              );
            })}
          </div>
          {selectedSlot!==null&&<div style={{marginTop:"5px",fontSize:"8px",color:"#e879f9",letterSpacing:"1px",opacity:0.65}}>← tap node → slot {selectedSlot+1}</div>}
        </div>

        {/* Play / Builder */}
        <div style={{display:"flex",gap:"5px"}}>
          <button onClick={playPhrase} style={{flex:1,background:"rgba(91,200,245,0.07)",border:"1px solid #1e3a5f",color:"#5bc8f5",padding:"6px",borderRadius:"4px",fontSize:"10px",letterSpacing:"2px",cursor:"pointer"}}>▶ PLAY</button>
          <button onClick={()=>setTab("builder")} style={{flex:1,background:"transparent",border:"1px solid #1e3a5f",color:"#475569",padding:"6px",borderRadius:"4px",fontSize:"10px",letterSpacing:"1px",cursor:"pointer"}}>BUILD →</button>
        </div>

        {/* MIDI Map */}
        <div>
          <div style={{fontSize:"9px",letterSpacing:"3px",color:"#334155",marginBottom:"7px"}}>MIDI MAP</div>
          {midiMapping.map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"3px"}}>
              <div style={{width:"18px",height:"18px",background:"#0d1520",border:"1px solid #1e3a5f",borderRadius:"2px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",color:"#5bc8f5",fontWeight:"bold",flexShrink:0}}>{m.key.trim()}</div>
              <span style={{fontSize:"8px",color:"#334155"}}>→</span>
              <span style={{fontSize:"10px",fontWeight:"bold",color:m.node?CHORD_TYPES[fancyMode?m.node.fancyType:m.node.type]?.color:"#334155"}}>{m.node?m.node.label:"—"}</span>
              <span style={{fontSize:"7px",color:"#334155",marginLeft:"auto"}}>#{i+1}</span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div>
          <div style={{fontSize:"9px",letterSpacing:"3px",color:"#334155",marginBottom:"7px"}}>TYPES</div>
          {[{color:"#5bc8f5",label:"Major"},{color:"#a78bfa",label:"Minor"},{color:"#fbbf24",label:"Dominant"},{color:"#34d399",label:"Maj 7/9"},{color:"#f87171",label:"Dim"},{color:"#e879f9",label:"Recommended"}].map(({color,label})=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"4px"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:color,flexShrink:0,boxShadow:`0 0 4px ${color}55`}}/>
              <span style={{fontSize:"9px",color:"#475569"}}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Shop Tab ──────────────────────────────────────────────────────────────────
function ShopTab({chords,favorites,toggleFav,isFav,shopFilter,setShopFilter,addToPhrase}){
  const [playingId,setPlayingId]=useState(null);
  const cats=["all","major","minor","dominant","sus","diminished"];
  const filtered=shopFilter==="favs"?favorites:shopFilter==="all"?chords:chords.filter(c=>c.cat===shopFilter);
  const handlePlay=async(chord)=>{ setPlayingId(chord.id); await playNotes(chordMidi(60+chord.noteIdx,chord.type,0),"2n"); setTimeout(()=>setPlayingId(null),1200); };
  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 53px)",padding:"14px 18px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"14px",flexWrap:"wrap"}}>
        <span style={{fontSize:"9px",letterSpacing:"3px",color:"#334155",marginRight:"3px"}}>FILTER</span>
        {cats.map(cat=><button key={cat} onClick={()=>setShopFilter(cat)} style={{background:shopFilter===cat?"rgba(91,200,245,0.12)":"transparent",border:`1px solid ${shopFilter===cat?"#5bc8f5":"#1e3a5f"}`,color:shopFilter===cat?"#5bc8f5":"#475569",padding:"3px 9px",borderRadius:"3px",fontSize:"10px",cursor:"pointer"}}>{cat}</button>)}
        {favorites.length>0&&<button onClick={()=>setShopFilter("favs")} style={{background:shopFilter==="favs"?"rgba(251,191,36,0.12)":"transparent",border:`1px solid ${shopFilter==="favs"?"#fbbf24":"#1e3a5f"}`,color:shopFilter==="favs"?"#fbbf24":"#475569",padding:"3px 9px",borderRadius:"3px",fontSize:"10px",cursor:"pointer"}}>♥ {favorites.length}</button>}
      </div>
      <div style={{flex:1,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(96px,1fr))",gap:"5px",alignContent:"start"}}>
        {filtered.map(chord=>{
          const isPlaying=playingId===chord.id, faved=isFav(chord.id);
          return (
            <div key={chord.id} style={{background:isPlaying?`${chord.color}20`:"#0a1520",border:`1px solid ${isPlaying||faved?chord.color+"55":"#0f1e30"}`,borderRadius:"6px",padding:"9px 7px",display:"flex",flexDirection:"column",gap:"4px",transition:"all 0.2s"}}>
              <div style={{fontSize:"14px",fontWeight:"bold",color:chord.color,cursor:"pointer"}} onClick={()=>handlePlay(chord)}>{chord.label}</div>
              <div style={{fontSize:"7px",color:`${chord.color}66`,letterSpacing:"1px",textTransform:"uppercase"}}>{chord.cat}</div>
              <div style={{display:"flex",gap:"3px"}}>
                <button onClick={()=>handlePlay(chord)} style={{flex:1,background:"transparent",border:`1px solid ${chord.color}33`,color:chord.color,fontSize:"8px",padding:"2px 0",borderRadius:"2px",cursor:"pointer"}}>{isPlaying?"▶":"play"}</button>
                <button onClick={()=>toggleFav(chord)} style={{background:faved?`${chord.color}22`:"transparent",border:`1px solid ${faved?chord.color+"55":"#1e3a5f"}`,color:faved?chord.color:"#334155",fontSize:"9px",padding:"2px 4px",borderRadius:"2px",cursor:"pointer"}}>{faved?"♥":"♡"}</button>
                <button onClick={()=>addToPhrase(chord)} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#334155",fontSize:"8px",padding:"2px 3px",borderRadius:"2px",cursor:"pointer"}}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Builder Tab ───────────────────────────────────────────────────────────────
function BuilderTab({phrase,setPhrase,phraseLen,setPhraseLen,playPhrase,playingSlot,favorites,addToPhrase,recommendedDegrees,nodes,fancyMode,mood}){
  const [dragIdx,setDragIdx]=useState(null), [dropIdx,setDropIdx]=useState(null);
  const diatonic=nodes.filter(n=>!n.isSecondary);
  const slots=Array.from({length:phraseLen},(_,i)=>phrase[i]||null);
  const clearSlot=(i)=>setPhrase(p=>{const n=[...p];n[i]=null;return n;});
  const onDrop=(tIdx)=>{ if(dragIdx===null)return; setPhrase(p=>{const n=[...p];const tmp=n[tIdx];n[tIdx]=n[dragIdx];n[dragIdx]=tmp;return n;}); setDragIdx(null);setDropIdx(null); };
  const applyRec=()=>{
    const np=Array(phraseLen).fill(null).map((_,i)=>{
      const node=diatonic[recommendedDegrees[i]]; if(!node) return null;
      const type=fancyMode?node.fancyType:node.type; const ct=CHORD_TYPES[type];
      return {id:`${node.noteIdx}-${type}`,noteIdx:node.noteIdx,noteName:node.noteName,type,label:node.noteName+ct.label,color:ct.color,cat:ct.cat,degree:node.degree};
    });
    setPhrase([...np,...Array(8-phraseLen).fill(null)]);
  };
  const filled=slots.filter(Boolean).length;
  return (
    <div style={{padding:"18px",height:"calc(100vh - 53px)",overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"18px",flexWrap:"wrap"}}>
        <span style={{fontSize:"9px",letterSpacing:"3px",color:"#334155"}}>LENGTH</span>
        {[4,6,8,12].map(l=><button key={l} onClick={()=>setPhraseLen(l)} style={{background:phraseLen===l?"rgba(91,200,245,0.12)":"transparent",border:`1px solid ${phraseLen===l?"#5bc8f5":"#1e3a5f"}`,color:phraseLen===l?"#5bc8f5":"#475569",padding:"3px 10px",borderRadius:"3px",fontSize:"11px",cursor:"pointer"}}>{l}</button>)}
        <div style={{marginLeft:"auto",display:"flex",gap:"5px"}}>
          <button onClick={applyRec} style={{background:"rgba(232,121,249,0.1)",border:"1px solid #e879f944",color:"#e879f9",padding:"5px 12px",borderRadius:"4px",fontSize:"10px",cursor:"pointer"}}>{MOOD_PROGRESSIONS[mood]?.emoji} AUTO FILL</button>
          <button onClick={playPhrase} disabled={!filled} style={{background:filled?"rgba(91,200,245,0.09)":"transparent",border:`1px solid ${filled?"#5bc8f5":"#1e3a5f"}`,color:filled?"#5bc8f5":"#334155",padding:"5px 14px",borderRadius:"4px",fontSize:"10px",letterSpacing:"2px",cursor:filled?"pointer":"default"}}>▶ PLAY</button>
          <button onClick={()=>setPhrase(Array(8).fill(null))} style={{background:"transparent",border:"1px solid #1e3a5f",color:"#334155",padding:"5px 9px",borderRadius:"4px",fontSize:"10px",cursor:"pointer"}}>CLEAR</button>
        </div>
      </div>

      {/* Tension arc */}
      <div style={{marginBottom:"14px"}}>
        <div style={{fontSize:"9px",letterSpacing:"3px",color:"#334155",marginBottom:"5px"}}>TENSION ARC</div>
        <svg width="100%" height="40" viewBox={`0 0 ${phraseLen*60+20} 40`} preserveAspectRatio="none">
          {slots.map((chord,i)=>{
            const t=chord?(chord.type.includes("dim")?0.9:chord.type.includes("dom")?0.7:chord.type.includes("sus")?0.5:chord.type.includes("min")?0.4:0.2):0;
            const x=i*60+30,h=t*36,p=playingSlot===i;
            return <g key={i}><rect x={x-22} y={40-h} width={44} height={h} fill={chord?(p?chord.color:`${chord.color}44`):"#0f1e30"} rx="2" style={{transition:"all 0.3s"}}/>{p&&<rect x={x-22} y={0} width={44} height={40} fill={`${chord.color}15`} rx="2"/>}</g>;
          })}
        </svg>
      </div>

      {/* Slots */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(phraseLen,8)},1fr)`,gap:"5px",marginBottom:"18px"}}>
        {slots.map((chord,i)=>{
          const isPlaying=playingSlot===i,isDrop=dropIdx===i;
          const recNode=diatonic[recommendedDegrees[i]];
          return (
            <div key={i} onDragOver={e=>{e.preventDefault();setDropIdx(i);}} onDragLeave={()=>setDropIdx(null)} onDrop={()=>onDrop(i)} draggable={!!chord} onDragStart={()=>setDragIdx(i)} onDragEnd={()=>{setDragIdx(null);setDropIdx(null);}}
              style={{background:isPlaying?(chord?`${chord.color}22`:"#0f2030"):isDrop?"#0d2030":chord?"#0a1520":"#080d14",border:`1px solid ${isPlaying&&chord?chord.color:isDrop?"#5bc8f5":chord?"#1e3a5f":"#0f1e2a"}`,borderRadius:"6px",padding:"9px 5px",minHeight:"68px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",transition:"all 0.2s",cursor:chord?"grab":"default"}}>
              <div style={{fontSize:"7px",color:"#1e3a5f",marginBottom:"3px",letterSpacing:"1px"}}>{i+1}</div>
              {chord?(<>
                <div style={{fontSize:"12px",fontWeight:"bold",color:chord.color,marginBottom:"1px"}}>{chord.label}</div>
                <div style={{fontSize:"6px",color:`${chord.color}55`}}>{chord.degree}</div>
                <button onClick={()=>clearSlot(i)} style={{position:"absolute",top:"2px",right:"2px",background:"none",border:"none",color:"#334155",fontSize:"9px",cursor:"pointer",padding:"1px 3px",lineHeight:1}}>×</button>
              </>):(<>
                <div style={{fontSize:"7px",color:"#1e3a5f"}}>{recNode?.label}</div>
                <div style={{fontSize:"6px",color:"#1a2a3a"}}>suggest</div>
              </>)}
            </div>
          );
        })}
      </div>

      {favorites.length>0&&<div>
        <div style={{fontSize:"9px",letterSpacing:"3px",color:"#334155",marginBottom:"9px"}}>SAVED CHORDS</div>
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
          {favorites.map(chord=><button key={chord.id} onClick={()=>addToPhrase(chord)} style={{background:`${chord.color}12`,border:`1px solid ${chord.color}44`,color:chord.color,padding:"4px 9px",borderRadius:"4px",fontSize:"10px",fontWeight:"bold",cursor:"pointer"}}>{chord.label}</button>)}
        </div>
      </div>}
    </div>
  );
}
