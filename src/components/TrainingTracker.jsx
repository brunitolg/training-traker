"use client";
import { useState, useEffect, useRef } from "react";

const SPREADSHEET_ID = "1p3D7yHXGAUxVvzFrb--W0FFMG43xZvwxhAS1gNN25t4";
const POLL_INTERVAL = 30000;

const WORKOUT_TYPES = {
  LENTO:  { label: "Lento / Rigenerativo", emoji: "🟢", color: "#4ade80", bgColor: "#052e16", bpm: "< 140 bpm" },
  MEDIO:  { label: "Medio / Soglia",        emoji: "🟡", color: "#facc15", bgColor: "#422006", bpm: "~160 bpm"  },
  VO2MAX: { label: "VO₂Max / Intervalli",   emoji: "🔴", color: "#f87171", bgColor: "#450a0a", bpm: "> 175 bpm" },
  FORZA:  { label: "Forza / Palestra",      emoji: "💪", color: "#c084fc", bgColor: "#2e1065", bpm: "—"         },
};

const SPORTS_LIST = ["Corsa", "Bici", "Nuoto", "Camminata", "Palestra"];
const SPORTS_EMOJI = { Corsa:"🏃", Bici:"🚴", Nuoto:"🏊", Camminata:"🥾", Palestra:"🏋️" };
const ATHLETES = ["Bruno", "Achille"];

const RPE_LABELS = {
  1:"Facilissimo",2:"Molto facile",3:"Facile",4:"Abbastanza facile",
  5:"Moderato",6:"Abbastanza intenso",7:"Intenso",8:"Molto intenso",
  9:"Durissimo",10:"Massimo sforzo"
};
const RPE_COLOR = (v) => {
  if (v <= 3) return "#4ade80";
  if (v <= 5) return "#facc15";
  if (v <= 7) return "#fb923c";
  return "#f87171";
};

function generateWeekPlan(weekOffset = 0) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
  const plans = [
    { day:0, athlete:"Bruno",   type:"LENTO",  sport:"Corsa",    duration:"50 min", detail:"Corsa lenta zona 2, passo tranquillo." },
    { day:0, athlete:"Achille", type:"LENTO",  sport:"Nuoto",    duration:"45 min", detail:"Vasche lente, focus sulla tecnica." },
    { day:2, athlete:"Bruno",   type:"MEDIO",  sport:"Bici",     duration:"60 min", detail:"Uscita bici a ritmo medio. Mantieni 160 bpm." },
    { day:2, athlete:"Achille", type:"MEDIO",  sport:"Corsa",    duration:"45 min", detail:"Corsa a soglia. 2×10 min al ritmo gara." },
    { day:4, athlete:"Bruno",   type:"VO2MAX", sport:"Corsa",    duration:"40 min", detail:"6×800m intensi con 90s recupero." },
    { day:4, athlete:"Achille", type:"VO2MAX", sport:"Nuoto",    duration:"45 min", detail:"10×100m veloci con 30s recupero." },
    { day:6, athlete:"Bruno",   type:"FORZA",  sport:"Palestra", duration:"55 min", detail:"Squat, stacco, affondi, core. 3×12." },
    { day:6, athlete:"Achille", type:"FORZA",  sport:"Palestra", duration:"55 min", detail:"Upper body + core: push/pull, plank. 3×12." },
  ];
  return plans.map((w) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + w.day);
    const dateStr = date.toISOString().split("T")[0];
    return { ...w, date:dateStr, status:"planned", id:`${dateStr}-${w.athlete}-${w.type}`,
      distance:"", rpe:null, notes:"", link:"" };
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("it-IT", { weekday:"short", day:"numeric", month:"short" });
}
function isToday(dateStr) { return new Date().toISOString().split("T")[0] === dateStr; }
function isPast(dateStr)  { return new Date(dateStr) < new Date(new Date().toISOString().split("T")[0]); }

async function callClaude(systemPrompt, userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      model:"claude-sonnet-4-6", max_tokens:1500,
      system: systemPrompt,
      messages:[{ role:"user", content:userPrompt }],
      mcp_servers:[{ type:"url", url:"https://drivemcp.googleapis.com/mcp/v1", name:"gdrive" }],
    }),
  });
  const data = await res.json();
  return data.content.filter((b)=>b.type==="text").map((b)=>b.text).join("");
}

async function fetchFromSheet() {
  try {
    const text = await callClaude(
      "Sei un assistente che legge Google Sheets. Rispondi SOLO con JSON valido, nessun testo, nessun backtick.",
      `Leggi il foglio Google Sheets ID: ${SPREADSHEET_ID}, Foglio1.
Restituisci: {"workouts":[{"id":"...","date":"YYYY-MM-DD","athlete":"...","type":"LENTO|MEDIO|VO2MAX|FORZA","sport":"...","duration":"...","detail":"...","status":"planned|done|skipped","distance":"...","rpe":null,"notes":"...","link":"..."}]}
Se vuoto: {"workouts":[]}`
    );
    const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
    return parsed.workouts || [];
  } catch { return null; }
}

async function saveToSheet(workouts) {
  const header = ["ID","Data","Atleta","Tipo","Sport","Durata","Dettaglio","Stato","Distanza","RPE","Note","Link"];
  const rows = workouts.map((w)=>[w.id,w.date,w.athlete,w.type,w.sport,w.duration,w.detail,w.status,w.distance||"",w.rpe||"",w.notes||"",w.link||""]);
  const tsv = [header,...rows].map((r)=>r.join("\t")).join("\n");
  try {
    await callClaude(
      "Sei un assistente che scrive su Google Sheets. Rispondi SOLO con {\"ok\":true}.",
      `Scrivi nel foglio ID: ${SPREADSHEET_ID}, Foglio1, cella A1. Cancella prima il contenuto. Dati:\n${tsv}`
    );
    return true;
  } catch { return false; }
}

// ── RPE Slider ─────────────────────────────────────────────────────────────
function RPESlider({ value, onChange }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:1 }}>Fatica percepita (RPE)</span>
        {value && (
          <span style={{ fontSize:12, fontWeight:700, color: RPE_COLOR(value) }}>
            {value}/10 — {RPE_LABELS[value]}
          </span>
        )}
      </div>
      <div style={{ display:"flex", gap:4 }}>
        {[1,2,3,4,5,6,7,8,9,10].map((n) => (
          <button key={n} onClick={()=>onChange(value===n?null:n)} style={{
            flex:1, height:32, borderRadius:6, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
            background: value>=n ? RPE_COLOR(n) : "#1e293b",
            color: value>=n ? "#000" : "#475569",
            transition:"all 0.1s",
          }}>{n}</button>
        ))}
      </div>
      {!value && <div style={{ fontSize:11, color:"#475569", marginTop:4 }}>Tocca un numero per valutare</div>}
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────────────────
function EditModal({ workout, onSave, onClose }) {
  const [form, setForm] = useState({ ...workout });
  const set = (k,v) => setForm((f)=>({...f,[k]:v}));

  const inputStyle = {
    width:"100%", padding:"9px 12px", background:"#0f172a",
    border:"1px solid #334155", borderRadius:8, color:"#e2e8f0",
    fontSize:13, outline:"none", boxSizing:"border-box",
  };
  const labelStyle = { fontSize:11, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:5, display:"block" };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000cc", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        width:"100%", maxWidth:480, background:"#0f172a",
        borderRadius:"20px 20px 0 0", padding:"22px 20px 36px",
        border:"1px solid #1e293b", maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div style={{ fontWeight:700, fontSize:16, color:"#f1f5f9" }}>✏️ Modifica allenamento</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#64748b", fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo allenamento</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {Object.entries(WORKOUT_TYPES).map(([k,v])=>(
                <button key={k} onClick={()=>set("type",k)} style={{
                  padding:"7px 12px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                  background: form.type===k ? v.color : "#1e293b",
                  color: form.type===k ? "#000" : "#94a3b8",
                }}>{v.emoji} {v.label.split(" / ")[0]}</button>
              ))}
            </div>
          </div>

          {/* Sport */}
          <div>
            <label style={labelStyle}>Sport</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {SPORTS_LIST.map((s)=>(
                <button key={s} onClick={()=>set("sport",s)} style={{
                  padding:"7px 12px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12,
                  background: form.sport===s ? "#6366f1" : "#1e293b",
                  color: form.sport===s ? "#fff" : "#94a3b8",
                }}>{SPORTS_EMOJI[s]} {s}</button>
              ))}
            </div>
          </div>

          {/* Durata + Distanza */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <label style={labelStyle}>Durata</label>
              <input value={form.duration} onChange={(e)=>set("duration",e.target.value)} style={inputStyle} placeholder="es. 45 min" />
            </div>
            <div>
              <label style={labelStyle}>Distanza</label>
              <input value={form.distance||""} onChange={(e)=>set("distance",e.target.value)} style={inputStyle} placeholder="es. 10 km" />
            </div>
          </div>

          {/* RPE */}
          <div style={{ background:"#0a0a0f", padding:"12px 14px", borderRadius:12, border:"1px solid #1e293b" }}>
            <RPESlider value={form.rpe} onChange={(v)=>set("rpe",v)} />
          </div>

          {/* Dettaglio */}
          <div>
            <label style={labelStyle}>Descrizione allenamento</label>
            <textarea value={form.detail} onChange={(e)=>set("detail",e.target.value)}
              style={{ ...inputStyle, minHeight:70, resize:"vertical", fontFamily:"inherit", lineHeight:1.5 }}
              placeholder="Descrizione, obiettivi, struttura..." />
          </div>

          {/* Note post */}
          <div>
            <label style={labelStyle}>📓 Note post-allenamento</label>
            <textarea value={form.notes||""} onChange={(e)=>set("notes",e.target.value)}
              style={{ ...inputStyle, minHeight:80, resize:"vertical", fontFamily:"inherit", lineHeight:1.5, borderColor:"#6366f133" }}
              placeholder="Come ti sei sentito? Cosa ha funzionato? Cosa migliorare?" />
          </div>

          {/* Link */}
          <div>
            <label style={labelStyle}>🔗 Link allenamento</label>
            <input value={form.link||""} onChange={(e)=>set("link",e.target.value)}
              style={{ ...inputStyle, borderColor:"#0ea5e933" }}
              placeholder="es. https://www.strava.com/activities/..." />
            {form.link && (() => {
              let icon = "🔗"; let label = "Apri link";
              if (form.link.includes("strava.com"))  { icon="🟠"; label="Strava"; }
              if (form.link.includes("garmin.com"))  { icon="🔵"; label="Garmin Connect"; }
              if (form.link.includes("youtube.com") || form.link.includes("youtu.be")) { icon="▶️"; label="YouTube"; }
              if (form.link.includes("drive.google")) { icon="📄"; label="Google Drive"; }
              return (
                <a href={form.link} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:6, fontSize:12, color:"#38bdf8", textDecoration:"none", background:"#0ea5e922", padding:"4px 10px", borderRadius:8 }}>
                  {icon} {label} ↗
                </a>
              );
            })()}
          </div>
        </div>

        <button onClick={()=>onSave(form)} style={{
          width:"100%", marginTop:20, padding:"13px",
          background:"#6366f1", color:"#fff", border:"none",
          borderRadius:12, cursor:"pointer", fontWeight:700, fontSize:15,
        }}>💾 Salva modifiche</button>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function TrainingTracker() {
  const [workouts, setWorkouts]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [activeAthlete, setActiveAthlete] = useState("Bruno");
  const [weekOffset, setWeekOffset]       = useState(0);
  const [view, setView]                   = useState("week");
  const [toast, setToast]                 = useState(null);
  const [expandedId, setExpandedId]       = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [lastSync, setLastSync]           = useState(null);
  const pollRef = useRef(null);

  const showToast = (msg, ms=3000) => { setToast(msg); setTimeout(()=>setToast(null),ms); };

  useEffect(()=>{
    loadData(true);
    pollRef.current = setInterval(()=>loadData(false), POLL_INTERVAL);
    return ()=>clearInterval(pollRef.current);
  },[]);

  async function loadData(initial=false) {
    if (initial) setLoading(true);
    const data = await fetchFromSheet();
    if (data===null) {
      if (initial) { setWorkouts(generateWeekPlan(0)); showToast("⚠️ Drive offline — modalità locale"); }
    } else if (data.length===0 && initial) {
      const plan = generateWeekPlan(0);
      setWorkouts(plan);
      await saveToSheet(plan);
      showToast("📋 Piano creato e salvato su Drive!");
    } else if (data.length>0) {
      setWorkouts(data);
      if (!initial) setLastSync(new Date());
    }
    if (initial) setLoading(false);
  }

  async function persist(updated) {
    setSaving(true); setWorkouts(updated);
    const ok = await saveToSheet(updated);
    showToast(ok ? "✅ Sincronizzato con Drive" : "⚠️ Errore salvataggio");
    setLastSync(new Date()); setSaving(false);
  }

  function toggleStatus(id) {
    const cycle = { planned:"done", done:"skipped", skipped:"planned" };
    persist(workouts.map((w)=>w.id===id?{...w,status:cycle[w.status]||"planned"}:w));
  }
  function saveEdit(updated) { persist(workouts.map((w)=>w.id===updated.id?updated:w)); setEditingWorkout(null); }

  async function addWeekPlan() {
    const plan = generateWeekPlan(weekOffset);
    const ids = new Set(workouts.map((w)=>w.id));
    const toAdd = plan.filter((w)=>!ids.has(w.id));
    if (!toAdd.length) { showToast("✓ Piano già presente"); return; }
    await persist([...workouts,...toAdd]);
    showToast(`🗓️ ${toAdd.length} allenamenti aggiunti!`);
  }

  // Week bounds
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate()-today.getDay()+1+weekOffset*7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);

  const weekWorkouts = workouts
    .filter((w)=>{ const d=new Date(w.date); return d>=monday&&d<=sunday; })
    .filter((w)=>w.athlete===activeAthlete)
    .sort((a,b)=>a.date.localeCompare(b.date));

  const historyWorkouts = workouts
    .filter((w)=>isPast(w.date)&&w.status==="done"&&w.athlete===activeAthlete)
    .sort((a,b)=>b.date.localeCompare(a.date));

  const weekLabel = ()=>({"-1":"Sett. scorsa","0":"Questa settimana","1":"Prossima sett."}[String(weekOffset)]??`Settimana ${weekOffset>0?"+":""}${weekOffset}`);
  const stats = { done:weekWorkouts.filter((w)=>w.status==="done").length, total:weekWorkouts.length };

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", color:"#e2e8f0", fontFamily:"'Inter',system-ui,sans-serif" }}>

      {editingWorkout && <EditModal workout={editingWorkout} onSave={saveEdit} onClose={()=>setEditingWorkout(null)} />}

      {toast && (
        <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#e2e8f0", padding:"10px 18px", borderRadius:20, fontSize:13, zIndex:200, boxShadow:"0 4px 20px #00000088", border:"1px solid #334155", whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)", borderBottom:"1px solid #1e293b", padding:"20px 20px 0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:3, color:"#6366f1", textTransform:"uppercase", marginBottom:4 }}>Training Log</div>
            <h1 style={{ margin:0, fontSize:21, fontWeight:800, color:"#f1f5f9" }}>🏋️ Piano Allenamenti</h1>
            {lastSync && <div style={{ fontSize:10, color:"#475569", marginTop:3 }}>🔄 {lastSync.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</div>}
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:"#475569", marginBottom:6 }}>Atleta</div>
            <div style={{ display:"flex", gap:6 }}>
              {ATHLETES.map((a)=>(
                <button key={a} onClick={()=>setActiveAthlete(a)} style={{ padding:"5px 13px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, background:activeAthlete===a?"#6366f1":"#1e293b", color:activeAthlete===a?"#fff":"#64748b" }}>{a}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, marginTop:16 }}>
          {[["week","📅 Settimana"],["history","📚 Storico"]].map(([v,lbl])=>(
            <button key={v} onClick={()=>setView(v)} style={{ padding:"7px 14px", borderRadius:"8px 8px 0 0", border:"none", cursor:"pointer", fontSize:12, background:view===v?"#0a0a0f":"transparent", color:view===v?"#e2e8f0":"#64748b" }}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px 20px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#475569" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
            <div>Caricamento da Google Drive...</div>
          </div>
        ) : view==="week" ? (
          <>
            {/* Week nav */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <button onClick={()=>setWeekOffset(weekOffset-1)} style={{ background:"#1e293b", border:"none", color:"#94a3b8", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:18 }}>‹</button>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontWeight:700, fontSize:14, color:"#f1f5f9" }}>{weekLabel()}</div>
                <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>
                  {monday.toLocaleDateString("it-IT",{day:"numeric",month:"short"})} – {sunday.toLocaleDateString("it-IT",{day:"numeric",month:"short"})}
                </div>
              </div>
              <button onClick={()=>setWeekOffset(weekOffset+1)} style={{ background:"#1e293b", border:"none", color:"#94a3b8", padding:"6px 14px", borderRadius:8, cursor:"pointer", fontSize:18 }}>›</button>
            </div>

            {/* Stats bar */}
            <div style={{ display:"flex", gap:10, marginBottom:14, padding:"12px 14px", background:"#0f172a", borderRadius:12, border:"1px solid #1e293b" }}>
              <div style={{ flex:1, textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:800, color:"#6366f1" }}>{stats.done}/{stats.total}</div>
                <div style={{ fontSize:9, color:"#475569", textTransform:"uppercase", letterSpacing:1 }}>Completati</div>
              </div>
              {Object.entries(WORKOUT_TYPES).map(([k,v])=>{
                const done = weekWorkouts.filter((w)=>w.type===k&&w.status==="done").length;
                return (
                  <div key={k} style={{ flex:1, textAlign:"center", opacity:done>0?1:0.3 }}>
                    <div style={{ fontSize:18 }}>{v.emoji}</div>
                    <div style={{ fontSize:10, color:v.color }}>{done>0?"✓":"—"}</div>
                  </div>
                );
              })}
              {saving && <div style={{ fontSize:12, color:"#6366f1", alignSelf:"center" }}>💾</div>}
            </div>

            {weekWorkouts.length===0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#475569" }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🗓️</div>
                <div style={{ marginBottom:16, fontSize:14 }}>Nessun allenamento per questa settimana</div>
                <button onClick={addWeekPlan} style={{ background:"#6366f1", color:"#fff", border:"none", padding:"10px 22px", borderRadius:10, cursor:"pointer", fontWeight:700, fontSize:14 }}>+ Genera piano settimana</button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {weekWorkouts.map((w)=>{
                  const wt = WORKOUT_TYPES[w.type];
                  const expanded = expandedId===w.id;
                  const todayW = isToday(w.date);
                  return (
                    <div key={w.id} style={{ background:wt.bgColor, border:`1px solid ${todayW?wt.color:"#1e293b"}`, borderRadius:14, overflow:"hidden", opacity:w.status==="skipped"?0.5:1 }}>
                      <div onClick={()=>setExpandedId(expanded?null:w.id)} style={{ padding:"13px 14px", cursor:"pointer" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontSize:22 }}>{SPORTS_EMOJI[w.sport]||"🏃"}</span>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13, color:"#f1f5f9" }}>{wt.emoji} {wt.label}</div>
                              <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>
                                {formatDate(w.date)} · {w.sport}
                                {w.duration ? ` · ${w.duration}` : ""}
                                {w.distance ? ` · ${w.distance}` : ""}
                              </div>
                            </div>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            {todayW && <span style={{ background:wt.color, color:"#000", fontSize:8, fontWeight:800, padding:"2px 7px", borderRadius:10, textTransform:"uppercase", letterSpacing:1 }}>OGGI</span>}
                            {w.rpe && <span style={{ fontSize:11, fontWeight:700, color:RPE_COLOR(w.rpe), background:`${RPE_COLOR(w.rpe)}22`, padding:"2px 7px", borderRadius:8 }}>RPE {w.rpe}</span>}
                            <button onClick={(e)=>{e.stopPropagation();setEditingWorkout(w);}} style={{ width:28, height:28, borderRadius:8, border:"1px solid #334155", background:"#1e293b", color:"#94a3b8", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>✏️</button>
                            <button onClick={(e)=>{e.stopPropagation();toggleStatus(w.id);}} style={{ width:32, height:32, borderRadius:"50%", border:`2px solid ${w.status==="done"?wt.color:"#334155"}`, background:w.status==="done"?wt.color:"transparent", color:w.status==="done"?"#000":"#64748b", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {w.status==="done"?"✓":w.status==="skipped"?"✕":"○"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {expanded && (
                        <div style={{ padding:"0 14px 14px", borderTop:`1px solid ${wt.color}22` }}>
                          <div style={{ fontSize:13, color:"#cbd5e1", lineHeight:1.6, marginBottom:10 }}>{w.detail}</div>
                          <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom: w.notes ? 10 : 0 }}>
                            <span style={{ fontSize:11, color:wt.color, background:`${wt.color}22`, padding:"3px 10px", borderRadius:8 }}>{wt.bpm}</span>
                            {w.duration && <span style={{ fontSize:11, color:"#94a3b8", background:"#1e293b", padding:"3px 10px", borderRadius:8 }}>⏱ {w.duration}</span>}
                            {w.distance && <span style={{ fontSize:11, color:"#94a3b8", background:"#1e293b", padding:"3px 10px", borderRadius:8 }}>📏 {w.distance}</span>}
                            {w.rpe && <span style={{ fontSize:11, color:RPE_COLOR(w.rpe), background:`${RPE_COLOR(w.rpe)}22`, padding:"3px 10px", borderRadius:8 }}>💢 RPE {w.rpe}/10 — {RPE_LABELS[w.rpe]}</span>}
                          </div>
                          {w.notes && (
                            <div style={{ marginTop:10, padding:"10px 12px", background:"#0f172a", borderRadius:10, border:"1px solid #6366f133" }}>
                              <div style={{ fontSize:10, color:"#6366f1", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>📓 Note</div>
                              <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.6 }}>{w.notes}</div>
                            </div>
                          )}
                          {w.link && (() => {
                            let icon="🔗"; let label="Apri link";
                            if (w.link.includes("strava.com"))  { icon="🟠"; label="Vedi su Strava"; }
                            if (w.link.includes("garmin.com"))  { icon="🔵"; label="Vedi su Garmin"; }
                            if (w.link.includes("youtube.com")||w.link.includes("youtu.be")) { icon="▶️"; label="Guarda video"; }
                            if (w.link.includes("drive.google")) { icon="📄"; label="Apri documento"; }
                            return (
                              <a href={w.link} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:7, marginTop:10, fontSize:13, fontWeight:600, color:"#38bdf8", textDecoration:"none", background:"#0ea5e922", padding:"8px 14px", borderRadius:10, border:"1px solid #0ea5e933" }}>
                                {icon} {label} ↗
                              </a>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={addWeekPlan} disabled={saving} style={{ width:"100%", marginTop:14, padding:"11px", background:"#1e293b", border:"1px dashed #334155", color:"#64748b", borderRadius:12, cursor:"pointer", fontSize:12, fontWeight:500 }}>
              {saving?"⏳ Salvo...":"+ Aggiungi piano per questa settimana"}
            </button>
          </>
        ) : (
          <div>
            <div style={{ fontSize:12, color:"#475569", marginBottom:14 }}>Allenamenti completati — {activeAthlete}</div>
            {historyWorkouts.length===0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#475569" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
                <div>Nessun allenamento completato ancora</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {historyWorkouts.map((w)=>{
                  const wt = WORKOUT_TYPES[w.type];
                  return (
                    <div key={w.id} style={{ padding:"12px 14px", background:"#0f172a", borderRadius:12, border:"1px solid #1e293b" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span style={{ fontSize:20 }}>{SPORTS_EMOJI[w.sport]}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{wt.emoji} {w.sport}</div>
                          <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>
                            {formatDate(w.date)}
                            {w.duration ? ` · ${w.duration}` : ""}
                            {w.distance ? ` · ${w.distance}` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <span style={{ fontSize:11, color:wt.color, fontWeight:700 }}>✓ FATTO</span>
                          {w.rpe && <div style={{ fontSize:10, color:RPE_COLOR(w.rpe), marginTop:2 }}>RPE {w.rpe}/10</div>}
                        </div>
                      </div>
                      {w.notes && (
                        <div style={{ marginTop:8, padding:"8px 10px", background:"#0a0a0f", borderRadius:8, border:"1px solid #6366f122" }}>
                          <div style={{ fontSize:11, color:"#64748b", lineHeight:1.5 }}>📓 {w.notes}</div>
                        </div>
                      )}
                      {w.link && (
                        <a href={w.link} target="_blank" rel="noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:7, fontSize:11, color:"#38bdf8", textDecoration:"none", background:"#0ea5e922", padding:"4px 10px", borderRadius:8 }}>
                          🔗 Apri allenamento ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
