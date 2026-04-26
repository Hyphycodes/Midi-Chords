import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// âââ Constants ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const NOTE_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

const CHORD_TYPES = {
  maj:  { intervals:[0,4,7],         label:"",      color:"#5bc8f5", cat:"major" },
  min:  { intervals:[0,3,7],         label:"m",     color:"#a78bfa", cat:"minor" },
  dom7: { intervals:[0,4,7,10],      label:"7",     color:"#fbbf24", cat:"dominant" },
  maj7: { intervals:[0,4,7,11],      label:"maj7",  color:"#34d399", cat:"major" },
  min7: { intervals:[0,3,7,10],      label:"m7",    color:"#c084fc", cat:"minor" },
  dim7: { intervals:[0,3,6,9],       label:"Â°7",    color:"#f87171", cat:"diminished" },
  dom9: { intervals:[0,4,7,10,14],   label:"9",     color:"#fb923c", cat:"dominant" },
  min9: { intervals:[0,3,7,10,14],   label:"m9",    color:"#e879f9", cat:"minor" },
  maj9: { intervals:[0,4,7,11,14],   label:"maj9",  color:"#6ee7b7", cat:"major" },
  sus2: { intervals:[0,2,7],         label:"sus2",  color:"#67e8f9", cat:"sus" },
  sus4: { intervals:[0,5,7],         label:"sus4",  color:"#67e8f9", cat:"sus" },
};

const MAJOR_SCALE = [0,2,4,5,7,9,11];
const DIATONIC_TYPES = ["maj","min","min","maj","dom7","min","dim7"];
const DIATONIC_FANCY = ["maj9","min9","min7","maj9","dom9","min9","dim7"];
const DEGREES = ["I","ii","iii","IV","V","vi","viiÂ°"];

// âââ Music Theory âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function buildDiatonic(rootIdx) {
  return MAJOR_SCALE.map((interval, i) => {
    const noteIdx = (rootIdx + interval) % 12;
    const type = DIATONIC_TYPES[i];
    return {
      id: `d${i}`, degree: DEGREES[i], noteIdx,
      noteName: NOTE_NAMES[noteIdx], type,
      fancyType: DIATONIC_FANCY[i],
      label: NOTE_NAMES[noteIdx] + CHORD_TYPES[type].label,
      isSecondary: false,
    };
  });
}

function buildSecondary(rootIdx, diatonic) {
  return diatonic.slice(1,6).map((target, i) => {
    const secIdx = (target.noteIdx + 7) % 12;
    return {
      id: `s${i}`, degree: `V/${diatonic[i+1].degree}`, noteIdx: secIdx,
      noteName: NOTE_NAMES[secIdx], type: "dom7", fancyType: "dom9",
      label: NOTE_NAMES[secIdx] + "7", isSecondary: true,
    };
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

// Graph positions â radial layout
function layoutNodes(nodes, cx, cy) {
  const diatonic = nodes.filter(n=>!n.isSecondary);
  const secondary = nodes.filter(n=>n.isSecondary);
  const r1=110, r2=215;
  // Diatonic: fan arc top-center
  const arcStart = -Math.PI*0.75;
  const arcEnd = Math.PI*0.75;
  return [
    ...diatonic.map((n,i)=> {
      const angle = arcStart + (arcEnd-arcStart)*(i/(diatonic.length-1));
      return { ...n, x: cx + r1*Math.cos(angle), y: cy + r1*Math.sin(angle) };
    }),
    ...secondary.map((n,i)=> {
      const angle = -Math.PI + (Math.PI*(i+1))/(secondary.length+1);
      return { ...n, x: cx + r2*Math.cos(angle), y: cy + r2*Math.sin(angle) };
    }),
  ];
}

const EDGES = [
  ["d4","d0"],["d1","d4"],["d3","d0"],["d5","d1"],
  ["d2","d5"],["d6","d0"],["d3","d4"],["d0","d3"],
  ["d0","d4"],["d0","d5"],["d2","d6"],
  ["s0","d1"],["s1","d2"],["s2","d3"],["s3","d4"],["s4","d5"],
];

// âââ Audio ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

let _Tone = null;
let _synth = null;

async function getTone() {
  if (_Tone) return _Tone;
  return new Promise(res => {
    if (window.Tone) { _Tone = window.Tone; res(_Tone); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js";
    s.onload = () => { _Tone = window.Tone; res(_Tone); };
    document.head.appendChild(s);
  });
}

async function playNotes(midiNotes, dur="1.5n") {
  try {
    const T = await getTone();
    await T.start();
    if (!_synth) {
      _synth = new T.PolySynth(T.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack:0.08, decay:0.4, sustain:0.35, release:1.8 },
        volume: -10,
      }).toDestination();
    }
    const freqs = midiNotes.map(n => T.Frequency(n,"midi").toFrequency());
    _synth.triggerAttackRelease(freqs, dur);
  } catch(e) { console.warn(e); }
}

// âââ Shop Chord Browser Data ââââââââââââââââââââââââââââââââââââââââââââââââââ

function buildShopChords() {
  const chords = [];
  const rootsToShow = [0,2,4,5,7,9,11]; // one octave of roots
  const typesToShow = ["maj","min","dom7","maj7","min7","dom9","min9","sus2","sus4"];
  rootsToShow.forEach(rIdx => {
    typesToShow.forEach(type => {
      const ct = CHORD_TYPES[type];
      chords.push({
        id: `${rIdx}-${type}`,
        noteIdx: rIdx,
        noteName: NOTE_NAMES[rIdx],
        type,
        label: NOTE_NAMES[rIdx] + ct.label,
        color: ct.color,
        cat: ct.cat,
      });
    });
  });
  return chords;
}

const ALL_SHOP_CHORDS = buildShopChords();

// âââ Main App âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const TABS = ["graph","shop","builder"];
const TAB_LABELS = { graph:"Navigator", shop:"Chord Shop", builder:"Phrase Builder" };

export default function App() {
  const [tab, setTab] = useState("graph");
  const [keyIdx, setKeyIdx] = useState(0);
  const [fancyMode, setFancyMode] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [prevNotes, setPrevNotes] = useState([]);
  const [progression, setProgression] = useState([]);
  const [midiStatus, setMidiStatus] = useState("idle");
  const [lastNote, setLastNote] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [phrase, setPhrase] = useState(Array(8).fill(null));
  const [phraseLen, setPhraseLen] = useState(8);
  const [playingSlot, setPlayingSlot] = useState(null);
  const [shopFilter, setShopFilter] = useState("all");
  const [animKey, setAnimKey] = useState(0);
  const prevKeyRef = useRef(0);

  // Graph nodes with animation trigger
  const { nodes, nodeMap } = useMemo(() => {
    const diatonic = buildDiatonic(keyIdx);
    const secondary = buildSecondary(keyIdx, diatonic);
    const raw = [...diatonic, ...secondary];
    const positioned = layoutNodes(raw, 370, 250);
    const map = {};
    positioned.forEach(n => { map[n.id] = n; });
    return { nodes: positioned, nodeMap: map };
  }, [keyIdx]);

  // Trigger key change animation
  useEffect(() => {
    if (prevKeyRef.current !== keyIdx) {
      setAnimKey(k => k+1);
      prevKeyRef.current = keyIdx;
    }
  }, [keyIdx]);

  // MIDI
  useEffect(() => {
    if (!navigator.requestMIDIAccess) { setMidiStatus("unsupported"); return; }
    navigator.requestMIDIAccess().then(access => {
      setMidiStatus("connected");
      const onMsg = (e) => {
        const [status, note, vel] = e.data;
        if ((status & 0xf0) === 0x90 && vel > 0) {
          setLastNote(note);
          const noteIdx = note % 12;
          const match = nodes.find(n => n.noteIdx === noteIdx && !n.isSecondary)
                     || nodes.find(n => n.noteIdx === noteIdx);
          if (match) triggerNode(match, note);
        }
      };
      access.inputs.forEach(i => i.onmidimessage = onMsg);
      access.onstatechange = () => access.inputs.forEach(i => i.onmidimessage = onMsg);
    }).catch(() => setMidiStatus("error"));
  }, [nodes, fancyMode, prevNotes]);

  const triggerNode = useCallback((node, midiRoot=null) => {
    const type = fancyMode ? node.fancyType : node.type;
    const root = midiRoot ?? (60 + node.noteIdx);
    const inv = bestInversion(prevNotes, root, type);
    const notes = chordMidi(root, type, inv);
    setActiveId(node.id);
    setPrevNotes(notes);
    playNotes(notes);
    const ct = CHORD_TYPES[type];
    setProgression(p => [...p.slice(-11), {
      label: node.noteName + ct.label,
      color: ct.color,
      degree: node.degree,
    }]);
    setTimeout(() => setActiveId(null), 2000);
  }, [fancyMode, prevNotes]);

  const addToPhrase = useCallback((chord, slotIdx=null) => {
    setPhrase(p => {
      const next = [...p];
      if (slotIdx !== null) {
        next[slotIdx] = chord;
      } else {
        const empty = next.findIndex(s => s === null);
        if (empty !== -1) next[empty] = chord;
      }
      return next;
    });
  }, []);

  const playPhrase = useCallback(async () => {
    const filled = phrase.slice(0, phraseLen).filter(Boolean);
    if (!filled.length) return;
    let prev = [];
    for (let i=0;i<filled.length;i++) {
      setPlayingSlot(i);
      const c = filled[i];
      const root = 60 + c.noteIdx;
      const inv = bestInversion(prev, root, c.type);
      const notes = chordMidi(root, c.type, inv);
      prev = notes;
      playNotes(notes, "2n");
      await new Promise(r => setTimeout(r, 900));
    }
    setPlayingSlot(null);
  }, [phrase, phraseLen]);

  const toggleFav = useCallback((chord) => {
    setFavorites(f => {
      const exists = f.find(c => c.id === chord.id);
      return exists ? f.filter(c => c.id !== chord.id) : [...f, chord];
    });
  }, []);

  const isFav = (id) => favorites.some(c => c.id === id);

  return (
    <div style={{
      minHeight:"100vh", background:"#070b10",
      fontFamily:"'SF Mono','Fira Code',monospace",
      color:"#e2e8f0", display:"flex", flexDirection:"column",
    }}>
      {/* Top Bar */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 24px 0", borderBottom:"1px solid #1a2535",
        background:"#090e16",
      }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:"10px" }}>
          <span style={{ fontSize:"13px", letterSpacing:"4px", color:"#5bc8f5", opacity:0.8 }}>HARMONIA</span>
          <span style={{ fontSize:"11px", color:"#334155", letterSpacing:"2px" }}>v0.2</span>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:"0" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background:"none", border:"none",
              borderBottom: tab===t ? "2px solid #5bc8f5" : "2px solid transparent",
              color: tab===t ? "#5bc8f5" : "#475569",
              padding:"10px 20px", fontSize:"11px", letterSpacing:"3px",
              textTransform:"uppercase", cursor:"pointer",
              transition:"all 0.2s",
            }}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <select value={keyIdx} onChange={e=>setKeyIdx(Number(e.target.value))} style={{
            background:"#0d1520", border:"1px solid #1e3a5f",
            color:"#5bc8f5", padding:"5px 10px", borderRadius:"6px",
            fontSize:"12px", cursor:"pointer", outline:"none", letterSpacing:"1px",
          }}>
            {NOTE_NAMES.map((n,i) => <option key={i} value={i}>{n} major</option>)}
          </select>

          <button onClick={()=>setFancyMode(f=>!f)} style={{
            background: fancyMode ? "rgba(91,200,245,0.12)" : "transparent",
            border:`1px solid ${fancyMode?"#5bc8f5":"#1e3a5f"}`,
            color: fancyMode ? "#5bc8f5" : "#475569",
            padding:"5px 12px", borderRadius:"6px", fontSize:"10px",
            letterSpacing:"2px", cursor:"pointer", transition:"all 0.2s",
          }}>
            {fancyMode ? "â¦ EXT" : "EXT"}
          </button>

          <div style={{
            display:"flex", alignItems:"center", gap:"6px",
            padding:"5px 10px",
            border:`1px solid ${midiStatus==="connected"?"#1a4a2a":"#1e2a3a"}`,
            borderRadius:"6px", fontSize:"10px", letterSpacing:"2px",
            color: midiStatus==="connected" ? "#4ade80" : "#334155",
          }}>
            <div style={{
              width:"5px", height:"5px", borderRadius:"50%",
              background: midiStatus==="connected" ? "#4ade80" : "#334155",
              animation: midiStatus==="connected" ? "blink 2s infinite" : "none",
            }}/>
            {midiStatus==="connected" ? `MIDI ${lastNote!==null?NOTE_NAMES[lastNote%12]:""}` : "NO MIDI"}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ flex:1, overflow:"hidden" }}>
        {tab==="graph" && (
          <GraphTab
            nodes={nodes} nodeMap={nodeMap} edges={EDGES}
            activeId={activeId} fancyMode={fancyMode}
            triggerNode={triggerNode} animKey={animKey}
            keyName={NOTE_NAMES[keyIdx]}
            progression={progression}
            setProgression={setProgression}
            addToPhrase={addToPhrase}
            favorites={favorites} toggleFav={toggleFav}
            isFav={isFav}
          />
        )}
        {tab==="shop" && (
          <ShopTab
            chords={ALL_SHOP_CHORDS}
            favorites={favorites} toggleFav={toggleFav} isFav={isFav}
            shopFilter={shopFilter} setShopFilter={setShopFilter}
            addToPhrase={addToPhrase}
          />
        )}
        {tab==="builder" && (
          <BuilderTab
            phrase={phrase} setPhrase={setPhrase}
            phraseLen={phraseLen} setPhraseLen={setPhraseLen}
            playPhrase={playPhrase} playingSlot={playingSlot}
            favorites={favorites}
            addToPhrase={addToPhrase}
          />
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        select option { background:#0d1520; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:2px; }
      `}</style>
    </div>
  );
}

// âââ Graph Tab ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function GraphTab({ nodes, nodeMap, edges, activeId, fancyMode, triggerNode, animKey, keyName, progression, setProgression, addToPhrase, favorites, toggleFav, isFav }) {
  const [hoverId, setHoverId] = useState(null);

  return (
    <div style={{ display:"flex", height:"calc(100vh - 57px)" }}>
      {/* SVG Graph */}
      <div style={{ flex:1, position:"relative", overflow:"hidden" }}>
        {/* Key indicator */}
        <div style={{
          position:"absolute", top:"20px", left:"24px", zIndex:10,
          fontSize:"32px", fontWeight:"bold", letterSpacing:"2px",
          color:"#5bc8f5", opacity:0.15,
          animation:`fadeIn 0.5s ease`,
          animationDelay: "0s",
          key: animKey,
        }}>
          {keyName}
        </div>

        <svg key={animKey} viewBox="0 0 740 500" style={{ width:"100%", height:"100%", display:"block" }}>
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%">
              <stop offset="0%" stopColor="#0d1a2a" stopOpacity="1"/>
              <stop offset="100%" stopColor="#070b10" stopOpacity="1"/>
            </radialGradient>
            <marker id="arr" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8"/>
            </marker>
            <marker id="arr-hot" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5" fill="none" stroke="#5bc8f5" strokeWidth="0.8" opacity="0.7"/>
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="softglow">
              <feGaussianBlur stdDeviation="2.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <rect width="740" height="500" fill="url(#bgGrad)"/>

          {/* Subtle grid rings */}
          {[80,160,230].map(r=>(
            <circle key={r} cx={370} cy={250} r={r}
              fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 9"/>
          ))}

          {/* Edges */}
          {edges.map((e,i) => {
            const from = nodeMap[e[0]], to = nodeMap[e[1]];
            if (!from||!to) return null;
            const hot = activeId===e[0] || activeId===e[1] || hoverId===e[0] || hoverId===e[1];
            const dx=to.x-from.x, dy=to.y-from.y;
            const len=Math.sqrt(dx*dx+dy*dy);
            const nx=dx/len, ny=dy/len;
            const r=22;
            return (
              <line key={i}
                x1={from.x+nx*r} y1={from.y+ny*r}
                x2={to.x-nx*(r+7)} y2={to.y-ny*(r+7)}
                stroke={hot?"rgba(91,200,245,0.4)":"rgba(255,255,255,0.08)"}
                strokeWidth={hot?1.2:0.6}
                markerEnd={hot?"url(#arr-hot)":"url(#arr)"}
                style={{ transition:"stroke 0.3s, stroke-width 0.3s" }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node, idx) => {
            const type = fancyMode ? node.fancyType : node.type;
            const ct = CHORD_TYPES[type] || CHORD_TYPES.maj;
            const isActive = activeId===node.id;
            const isHover = hoverId===node.id;
            const faved = isFav && isFav(`${node.noteIdx}-${node.type}`);
            const r = node.isSecondary ? 19 : 22;

            return (
              <g key={`${node.id}-${animKey}`}
                style={{
                  cursor:"pointer",
                  animation:`fadeIn 0.4s ease both`,
                  animationDelay:`${idx*0.04}s`,
                }}
                onClick={()=>triggerNode(node)}
                onMouseEnter={()=>setHoverId(node.id)}
                onMouseLeave={()=>setHoverId(null)}
              >
                {/* Active pulse ring */}
                {isActive && (
                  <circle cx={node.x} cy={node.y} r={r+12}
                    fill="none" stroke={ct.color} strokeWidth="1.5"
                    opacity="0.3" filter="url(#glow)"
                  />
                )}

                {/* Main circle */}
                <circle cx={node.x} cy={node.y} r={r}
                  fill={isActive ? ct.color : isHover ? `${ct.color}1a` : "#0a1520"}
                  stroke={ct.color}
                  strokeWidth={isActive ? 2 : node.isSecondary ? 1 : 1.5}
                  strokeDasharray={node.isSecondary ? "3 3" : "none"}
                  opacity={node.isSecondary ? 0.75 : 1}
                  filter={isActive ? "url(#glow)" : isHover ? "url(#softglow)" : undefined}
                  style={{ transition:"fill 0.25s, stroke-width 0.25s" }}
                />

                {/* Chord name */}
                <text x={node.x} y={node.y-(node.label.length>4?3:2)}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={isActive ? "#060c14" : ct.color}
                  fontSize={node.label.length>4?"9":"11"}
                  fontWeight="bold"
                  fontFamily="'SF Mono','Fira Code',monospace"
                  style={{ transition:"fill 0.25s" }}
                >
                  {node.label}
                </text>

                {/* Degree */}
                <text x={node.x} y={node.y+11}
                  textAnchor="middle"
                  fill={isActive ? "#060c14" : "rgba(255,255,255,0.25)"}
                  fontSize="7"
                  fontFamily="'SF Mono','Fira Code',monospace"
                >
                  {node.degree}
                </text>

                {/* Fav dot */}
                {faved && (
                  <circle cx={node.x+r-3} cy={node.y-r+3} r={3.5}
                    fill="#fbbf24" stroke="#060c14" strokeWidth="1"/>
                )}
              </g>
            );
          })}

          {/* Center pulse */}
          <circle cx={370} cy={250} r={4} fill="rgba(91,200,245,0.2)"/>
          <line x1={366} y1={250} x2={374} y2={250} stroke="rgba(91,200,245,0.2)" strokeWidth="1"/>
          <line x1={370} y1={246} x2={370} y2={254} stroke="rgba(91,200,245,0.2)" strokeWidth="1"/>
        </svg>
      </div>

      {/* Right Panel */}
      <div style={{
        width:"220px", borderLeft:"1px solid #0f1e30",
        background:"#090e16", display:"flex", flexDirection:"column",
        padding:"16px",
      }}>
        {/* Legend */}
        <div style={{ marginBottom:"20px" }}>
          <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#334155", marginBottom:"10px" }}>CHORD TYPES</div>
          {[
            { color:"#5bc8f5", label:"Major" },
            { color:"#a78bfa", label:"Minor" },
            { color:"#fbbf24", label:"Dominant" },
            { color:"#34d399", label:"Major 7/9" },
            { color:"#f87171", label:"Diminished" },
            { color:"#67e8f9", label:"Suspended" },
          ].map(({color,label})=>(
            <div key={label} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px" }}>
              <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:color, flexShrink:0, boxShadow:`0 0 5px ${color}55` }}/>
              <span style={{ fontSize:"10px", color:"#475569", letterSpacing:"1px" }}>{label}</span>
            </div>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginTop:"4px" }}>
            <div style={{ width:"16px", height:"1px", borderTop:"1px dashed #334155" }}/>
            <span style={{ fontSize:"10px", color:"#334155", letterSpacing:"1px" }}>Secondary</span>
          </div>
        </div>

        {/* Progression */}
        <div style={{ flex:1, overflow:"hidden" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
            <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#334155" }}>PROGRESSION</div>
            {progression.length>0 && (
              <button onClick={()=>setProgression([])} style={{
                background:"none", border:"none", color:"#334155",
                fontSize:"10px", cursor:"pointer", padding:"0",
              }}>clear</button>
            )}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"4px", overflowY:"auto", maxHeight:"200px" }}>
            {progression.length===0 && (
              <div style={{ fontSize:"10px", color:"#1e3a5f", lineHeight:"1.6", letterSpacing:"0.5px" }}>
                Play a note or click a chord to build your progression
              </div>
            )}
            {progression.map((c,i)=>(
              <div key={i} style={{
                display:"flex", alignItems:"center", gap:"8px",
                animation:"slideUp 0.2s ease",
              }}>
                <div style={{ fontSize:"9px", color:"#334155", width:"12px" }}>{i+1}</div>
                <div style={{
                  padding:"3px 8px", borderRadius:"4px",
                  background:`${c.color}15`, border:`1px solid ${c.color}33`,
                  color:c.color, fontSize:"11px", fontWeight:"bold",
                  letterSpacing:"0.5px",
                }}>
                  {c.label}
                </div>
                <div style={{ fontSize:"9px", color:"#334155" }}>{c.degree}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Add to builder */}
        {progression.length>0 && (
          <button onClick={()=>{
            progression.forEach(c => {
              const noteIdx = NOTE_NAMES.indexOf(c.label.replace(/[^A-G#b]/g,""));
              addToPhrase({ id:`${noteIdx}-maj`, noteIdx, noteName:c.label, type:"maj", label:c.label, color:c.color });
            });
          }} style={{
            marginTop:"12px", background:"rgba(91,200,245,0.08)",
            border:"1px solid #1e3a5f", color:"#5bc8f5",
            padding:"8px", borderRadius:"6px", fontSize:"10px",
            letterSpacing:"2px", cursor:"pointer", width:"100%",
          }}>
            â PHRASE BUILDER
          </button>
        )}

        {/* Hint */}
        <div style={{ marginTop:"16px", fontSize:"9px", color:"#1a2a3a", letterSpacing:"1px", lineHeight:"1.7" }}>
          {midiStatus==="connected"
            ? "Controller active â play single notes"
            : "Click nodes to play chords"}
        </div>
      </div>
    </div>
  );
}

// âââ Shop Tab âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function ShopTab({ chords, favorites, toggleFav, isFav, shopFilter, setShopFilter, addToPhrase }) {
  const [playingId, setPlayingId] = useState(null);
  const cats = ["all","major","minor","dominant","sus","diminished"];

  const filtered = shopFilter==="all" ? chords : chords.filter(c=>c.cat===shopFilter);

  const handlePlay = async (chord) => {
    setPlayingId(chord.id);
    const root = 60 + chord.noteIdx;
    await playNotes(chordMidi(root, chord.type, 0), "2n");
    setTimeout(() => setPlayingId(null), 1200);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 57px)", padding:"20px 24px" }}>
      {/* Filter bar */}
      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"20px", flexWrap:"wrap" }}>
        <span style={{ fontSize:"9px", letterSpacing:"3px", color:"#334155", marginRight:"4px" }}>FILTER</span>
        {cats.map(cat=>(
          <button key={cat} onClick={()=>setShopFilter(cat)} style={{
            background: shopFilter===cat ? "rgba(91,200,245,0.12)" : "transparent",
            border:`1px solid ${shopFilter===cat?"#5bc8f5":"#1e3a5f"}`,
            color: shopFilter===cat ? "#5bc8f5" : "#475569",
            padding:"4px 12px", borderRadius:"4px", fontSize:"10px",
            letterSpacing:"1px", cursor:"pointer", transition:"all 0.2s",
          }}>
            {cat}
          </button>
        ))}
        {favorites.length>0 && (
          <button onClick={()=>setShopFilter("favs")} style={{
            background: shopFilter==="favs" ? "rgba(251,191,36,0.12)" : "transparent",
            border:`1px solid ${shopFilter==="favs"?"#fbbf24":"#1e3a5f"}`,
            color: shopFilter==="favs" ? "#fbbf24" : "#475569",
            padding:"4px 12px", borderRadius:"4px", fontSize:"10px",
            letterSpacing:"1px", cursor:"pointer", transition:"all 0.2s",
          }}>
            â¥ saved ({favorites.length})
          </button>
        )}
      </div>

      {/* Chord grid */}
      <div style={{
        flex:1, overflowY:"auto",
        display:"grid",
        gridTemplateColumns:"repeat(auto-fill, minmax(110px, 1fr))",
        gap:"8px", alignContent:"start",
      }}>
        {(shopFilter==="favs" ? favorites : filtered).map(chord=>{
          const isPlaying = playingId===chord.id;
          const faved = isFav(chord.id);
          return (
            <div key={chord.id} style={{
              background: isPlaying ? `${chord.color}20` : "#0a1520",
              border:`1px solid ${isPlaying||faved ? chord.color+"55" : "#0f1e30"}`,
              borderRadius:"8px", padding:"12px 10px",
              display:"flex", flexDirection:"column", gap:"6px",
              cursor:"pointer", transition:"all 0.2s",
              animation: isPlaying ? "fadeIn 0.2s ease" : undefined,
            }}>
              {/* Chord name */}
              <div style={{
                fontSize:"16px", fontWeight:"bold", color:chord.color,
                letterSpacing:"0.5px",
              }} onClick={()=>handlePlay(chord)}>
                {chord.label}
              </div>

              {/* Cat badge */}
              <div style={{
                fontSize:"8px", color:`${chord.color}88`,
                letterSpacing:"1px", textTransform:"uppercase",
              }}>
                {chord.cat}
              </div>

              {/* Actions */}
              <div style={{ display:"flex", gap:"4px", marginTop:"2px" }}>
                <button onClick={()=>handlePlay(chord)} style={{
                  flex:1, background:"transparent",
                  border:`1px solid ${chord.color}33`, color:chord.color,
                  fontSize:"9px", padding:"3px 0", borderRadius:"3px",
                  cursor:"pointer", letterSpacing:"1px",
                }}>
                  {isPlaying?"â¶ï¸":"play"}
                </button>
                <button onClick={()=>toggleFav(chord)} style={{
                  background: faved ? `${chord.color}22` : "transparent",
                  border:`1px solid ${faved?chord.color+"55":"#1e3a5f"}`,
                  color: faved ? chord.color : "#334155",
                  fontSize:"11px", padding:"3px 6px", borderRadius:"3px",
                  cursor:"pointer",
                }}>
                  {faved?"â¥":"â¡"}
                </button>
                <button onClick={()=>addToPhrase(chord)} style={{
                  background:"transparent",
                  border:"1px solid #1e3a5f", color:"#334155",
                  fontSize:"9px", padding:"3px 5px", borderRadius:"3px",
                  cursor:"pointer", letterSpacing:"0px",
                }}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// âââ Builder Tab ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function BuilderTab({ phrase, setPhrase, phraseLen, setPhraseLen, playPhrase, playingSlot, favorites }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);

  const slots = Array.from({ length: phraseLen }, (_, i) => phrase[i] || null);

  const clearSlot = (i) => setPhrase(p => { const n=[...p]; n[i]=null; return n; });

  const onDrop = (targetIdx) => {
    if (dragIdx===null) return;
    setPhrase(p => {
      const n=[...p];
      const tmp=n[targetIdx];
      n[targetIdx]=n[dragIdx];
      n[dragIdx]=tmp;
      return n;
    });
    setDragIdx(null); setDropIdx(null);
  };

  const filled = slots.filter(Boolean).length;

  return (
    <div style={{ padding:"24px", height:"calc(100vh - 57px)", overflowY:"auto", boxSizing:"border-box" }}>
      {/* Header controls */}
      <div style={{ display:"flex", alignItems:"center", gap:"16px", marginBottom:"24px", flexWrap:"wrap" }}>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#334155" }}>PHRASE LENGTH</div>
        {[4,6,8,12,16].map(l=>(
          <button key={l} onClick={()=>setPhraseLen(l)} style={{
            background: phraseLen===l ? "rgba(91,200,245,0.12)" : "transparent",
            border:`1px solid ${phraseLen===l?"#5bc8f5":"#1e3a5f"}`,
            color: phraseLen===l ? "#5bc8f5" : "#475569",
            padding:"4px 12px", borderRadius:"4px", fontSize:"11px",
            cursor:"pointer", transition:"all 0.2s",
          }}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:"8px" }}>
          <button onClick={playPhrase} disabled={filled===0} style={{
            background: filled>0 ? "rgba(91,200,245,0.12)" : "transparent",
            border:`1px solid ${filled>0?"#5bc8f5":"#1e3a5f"}`,
            color: filled>0 ? "#5bc8f5" : "#334155",
            padding:"6px 20px", borderRadius:"6px", fontSize:"10px",
            letterSpacing:"2px", cursor:filled>0?"pointer":"default",
            transition:"all 0.2s",
          }}>
            â¶ PLAY PHRASE
          </button>
          <button onClick={()=>setPhrase(Array(phraseLen).fill(null))} style={{
            background:"transparent", border:"1px solid #1e3a5f",
            color:"#334155", padding:"6px 12px", borderRadius:"6px",
            fontSize:"10px", letterSpacing:"2px", cursor:"pointer",
          }}>
            CLEAR
          </button>
        </div>
      </div>

      {/* Tension arc visualization */}
      <div style={{ marginBottom:"20px" }}>
        <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#334155", marginBottom:"8px" }}>TENSION ARC</div>
        <svg width="100%" height="48" viewBox={`0 0 ${phraseLen*60+20} 48`} preserveAspectRatio="none">
          {slots.map((chord, i) => {
            const tension = chord
              ? (chord.type.includes("dim") ? 0.9
                : chord.type.includes("dom") ? 0.7
                : chord.type.includes("sus") ? 0.5
                : chord.type.includes("min") ? 0.4
                : 0.2)
              : 0;
            const x = i*60+30;
            const barH = tension*40;
            const playing = playingSlot===i;
            return (
              <g key={i}>
                <rect
                  x={x-20} y={48-barH} width={40} height={barH}
                  fill={chord ? (playing ? chord.color : `${chord.color}44`) : "#0f1e30"}
                  rx="2"
                  style={{ transition:"all 0.3s" }}
                />
                {playing && <rect x={x-20} y={0} width={40} height={48}
                  fill={`${chord.color}15`} rx="2"/>}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Chord slots */}
      <div style={{
        display:"grid",
        gridTemplateColumns:`repeat(${Math.min(phraseLen,8)}, 1fr)`,
        gap:"8px", marginBottom:"24px",
      }}>
        {slots.map((chord, i) => {
          const isPlaying = playingSlot===i;
          const isDrop = dropIdx===i;
          return (
            <div key={i}
              onDragOver={e=>{e.preventDefault();setDropIdx(i);}}
              onDragLeave={()=>setDropIdx(null)}
              onDrop={()=>onDrop(i)}
              style={{
                background: isPlaying ? (chord?`${chord.color}22`:"#0f2030")
                  : isDrop ? "#0d2030"
                  : chord ? "#0a1520" : "#080d14",
                border:`1px solid ${isPlaying&&chord?chord.color:isDrop?"#5bc8f5":chord?"#1e3a5f":"#0f1e2a"}`,
                borderRadius:"8px", padding:"12px 8px",
                minHeight:"80px", display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                position:"relative", transition:"all 0.2s",
                cursor: chord ? "grab" : "default",
              }}
              draggable={!!chord}
              onDragStart={()=>setDragIdx(i)}
              onDragEnd={()=>{setDragIdx(null);setDropIdx(null);}}
            >
              <div style={{ fontSize:"9px", color:"#1e3a5f", marginBottom:"4px", letterSpacing:"1px" }}>
                {i+1}
              </div>
              {chord ? (
                <>
                  <div style={{
                    fontSize:"15px", fontWeight:"bold",
                    color: isPlaying ? chord.color : chord.color,
                    letterSpacing:"0.5px", marginBottom:"2px",
                  }}>
                    {chord.label}
                  </div>
                  <div style={{ fontSize:"8px", color:`${chord.color}66` }}>
                    {chord.cat || CHORD_TYPES[chord.type]?.cat || ""}
                  </div>
                  <button onClick={()=>clearSlot(i)} style={{
                    position:"absolute", top:"4px", right:"4px",
                    background:"none", border:"none", color:"#334155",
                    fontSize:"10px", cursor:"pointer", padding:"2px 4px",
                    lineHeight:1,
                  }}>Ã</button>
                </>
              ) : (
                <div style={{ fontSize:"9px", color:"#1e3a5f", letterSpacing:"1px" }}>empty</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Favorites quick-add */}
      {favorites.length>0 && (
        <div>
          <div style={{ fontSize:"9px", letterSpacing:"3px", color:"#334155", marginBottom:"12px" }}>
            YOUR SAVED CHORDS â click to add to phrase
          </div>
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
            {favorites.map(chord=>(
              <button key={chord.id} onClick={()=>{
                setPhrase(p=>{
                  const n=[...p];
                  const empty=n.findIndex(s=>s===null);
                  if(empty!==-1) n[empty]=chord;
                  return n;
                });
              }} style={{
                background:`${chord.color}12`,
                border:`1px solid ${chord.color}44`,
                color:chord.color, padding:"6px 12px",
                borderRadius:"5px", fontSize:"11px", fontWeight:"bold",
                cursor:"pointer", transition:"all 0.2s", letterSpacing:"0.5px",
              }}>
                {chord.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {favorites.length===0 && (
        <div style={{ fontSize:"10px", color:"#1e3a5f", letterSpacing:"1px", lineHeight:"1.8" }}>
          Go to the Chord Shop, heart your favorite chords, and they'll appear here for quick-adding to your phrase.
        </div>
      )}
    </div>
  );
}
