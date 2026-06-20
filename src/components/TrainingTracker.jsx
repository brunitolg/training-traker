"use client";
import { useState, useEffect, useRef } from "react";

// ─── CONFIGURAZIONE SUPABASE ────────────────────────────────────────────────
// Sostituisci questi valori con quelli del tuo progetto Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://gyxppchhqtqkmysgqyky.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_lc_s2qmMK-cK7F4KL-Gcpg_mz-eVXuD";

async function dbFetch(method, body) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/workouts${method === "GET" ? "?select=*&order=date.asc" : ""}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": method === "POST" ? "resolution=merge-duplicates" : "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (method === "GET") return await res.json();
    return res.ok;
  } catch { return null; }
}

async function dbLoad()         { return await dbFetch("GET"); }
async function dbUpsert(items)  { return await dbFetch("POST", Array.isArray(items) ? items : [items]); }
async function dbDelete(id)     {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/workouts?id=eq.${id}`, {
      method: "DELETE",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    return res.ok;
  } catch { return false; }
}

// ─── COSTANTI ───────────────────────────────────────────────────────────────
const WORKOUT_TYPES = {
  LENTO:  { label: "Lento / Rigenerativo", emoji: "🟢", color: "#4ade80", bgColor: "#052e16", bpm: "< 140 bpm" },
  MEDIO:  { label: "Medio / Soglia",        emoji: "🟡", color: "#facc15", bgColor: "#422006", bpm: "~160 bpm"  },
  VO2MAX: { label: "VO₂Max / Intervalli",   emoji: "🔴", color: "#f87171", bgColor: "#450a0a", bpm: "> 175 bpm" },
  FORZA:  { label: "Forza / Palestra",      emoji: "💪", color: "#c084fc", bgColor: "#2e1065", bpm: "—"         },
};
const SPORTS_LIST  = ["Corsa","Bici","MTB","Nuoto","Camminata","Palestra"];
const SPORTS_EMOJI = { Corsa:"🏃",Bici:"🚴",MTB:"🚵",Nuoto:"🏊",Camminata:"🥾",Palestra:"🏋️" };
const ATHLETES     = ["Bruno","Achille"];
const RPE_LABELS   = { 1:"Facilissimo",2:"Molto facile",3:"Facile",4:"Abbastanza facile",5:"Moderato",6:"Abbastanza intenso",7:"Intenso",8:"Molto intenso",9:"Durissimo",10:"Massimo sforzo" };
const RPE_COLOR    = v => v<=3?"#4ade80":v<=5?"#facc15":v<=7?"#fb923c":"#f87171";
const STORAGE_KEY  = "training-tracker-v3";

// ─── HELPERS ────────────────────────────────────────────────────────────────
const todayStr   = () => new Date().toISOString().split("T")[0];
const formatDate = d  => new Date(d+"T12:00:00").toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"short"});
const isToday    = d  => todayStr()===d;
const isPast     = d  => new Date(d)<new Date(todayStr());
const makeId     = () => `w-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

function lsLoad() { try { const d=localStorage.getItem(STORAGE_KEY); return d?JSON.parse(d):null; } catch{ return null; } }
function lsSave(w) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(w)); } catch{} }

// Converte minuti da stringhe tipo "45 min", "1h30", "90"
function parseMins(s) {
  if (!s) return 0;
  const h = s.match(/(\d+)\s*h/i); const m = s.match(/(\d+)\s*m/i); const n = s.match(/^(\d+)$/);
  if (h || m) return (h?parseInt(h[1])*60:0)+(m?parseInt(m[1]):0);
  if (n) return parseInt(n[1]);
  return 0;
}

function emptyWorkout(athlete) {
  return { id:makeId(), date:todayStr(), athlete, type:"LENTO", sport:"Corsa", duration:"", detail:"", status:"planned", custom:true, distance:"", duration_actual:"", bpm_avg:"", bpm_max:"", pace:"", dislivello:"", calorie:"", rpe:null, notes:"", link:"" };
}

function generateWeekPlan(weekOffset=0) {
  const today=new Date(); const monday=new Date(today);
  monday.setDate(today.getDate()-today.getDay()+1+weekOffset*7);
  const plans=[
    {day:0,athlete:"Bruno",  type:"LENTO", sport:"Corsa",   duration:"50 min",detail:"Corsa lenta zona 2, passo tranquillo."},
    {day:0,athlete:"Achille",type:"LENTO", sport:"Nuoto",   duration:"45 min",detail:"Vasche lente, focus sulla tecnica."},
    {day:2,athlete:"Bruno",  type:"MEDIO", sport:"Bici",    duration:"60 min",detail:"Uscita bici a ritmo medio. Mantieni 160 bpm."},
    {day:2,athlete:"Achille",type:"MEDIO", sport:"Corsa",   duration:"45 min",detail:"Corsa a soglia. 2×10 min al ritmo gara."},
    {day:4,athlete:"Bruno",  type:"VO2MAX",sport:"Corsa",   duration:"40 min",detail:"6×800m intensi con 90s recupero."},
    {day:4,athlete:"Achille",type:"VO2MAX",sport:"Nuoto",   duration:"45 min",detail:"10×100m veloci con 30s recupero."},
    {day:6,athlete:"Bruno",  type:"FORZA", sport:"Palestra",duration:"55 min",detail:"Squat, stacco, affondi, core. 3×12."},
    {day:6,athlete:"Achille",type:"FORZA", sport:"Palestra",duration:"55 min",detail:"Upper body + core: push/pull, plank. 3×12."},
  ];
  return plans.map(w=>{
    const date=new Date(monday); date.setDate(monday.getDate()+w.day);
    const dateStr=date.toISOString().split("T")[0];
    return {...w,date:dateStr,status:"planned",id:`${dateStr}-${w.athlete}-${w.type}`,custom:false,distance:"",duration_actual:"",bpm_avg:"",bpm_max:"",pace:"",dislivello:"",calorie:"",rpe:null,notes:"",link:""};
  });
}

// ─── UI ATOMS ───────────────────────────────────────────────────────────────
function RPESlider({value,onChange}) {
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <span style={{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:1}}>Fatica percepita (RPE)</span>
        {value&&<span style={{fontSize:12,fontWeight:700,color:RPE_COLOR(value)}}>{value}/10 — {RPE_LABELS[value]}</span>}
      </div>
      <div style={{display:"flex",gap:4}}>
        {[1,2,3,4,5,6,7,8,9,10].map(n=>(
          <button key={n} onClick={()=>onChange(value===n?null:n)} style={{flex:1,height:32,borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:value>=n?RPE_COLOR(n):"#1e293b",color:value>=n?"#000":"#475569"}}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function SF({label,value,onChange,placeholder,unit}) {
  return (
    <div>
      <label style={{fontSize:10,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:4,display:"block"}}>{label}{unit&&<span style={{color:"#475569",marginLeft:4,textTransform:"none"}}>({unit})</span>}</label>
      <input value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"8px 10px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"}} placeholder={placeholder}/>
    </div>
  );
}

// ─── MODAL ──────────────────────────────────────────────────────────────────
function WorkoutModal({workout,onSave,onDelete,onClose,isNew}) {
  const [form,setForm]=useState({...workout});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const inp={width:"100%",padding:"9px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#e2e8f0",fontSize:13,outline:"none",boxSizing:"border-box"};
  const lbl={fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:1,marginBottom:5,display:"block"};
  return (
    <div style={{position:"fixed",inset:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:"#0f172a",borderRadius:"20px 20px 0 0",padding:"22px 20px 36px",border:"1px solid #1e293b",maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontWeight:700,fontSize:16,color:"#f1f5f9"}}>{isNew?"➕ Nuovo allenamento":"✏️ Modifica allenamento"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {isNew&&(
            <div>
              <label style={lbl}>Atleta</label>
              <div style={{display:"flex",gap:6}}>
                {ATHLETES.map(a=><button key={a} onClick={()=>set("athlete",a)} style={{flex:1,padding:"8px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:form.athlete===a?"#6366f1":"#1e293b",color:form.athlete===a?"#fff":"#64748b"}}>{a}</button>)}
              </div>
            </div>
          )}
          <div>
            <label style={lbl}>📅 Data</label>
            <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={{...inp,colorScheme:"dark"}}/>
          </div>
          <div>
            <label style={lbl}>Tipo allenamento</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(WORKOUT_TYPES).map(([k,v])=><button key={k} onClick={()=>set("type",k)} style={{padding:"7px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:form.type===k?v.color:"#1e293b",color:form.type===k?"#000":"#94a3b8"}}>{v.emoji} {v.label.split(" / ")[0]}</button>)}
            </div>
          </div>
          <div>
            <label style={lbl}>Sport</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {SPORTS_LIST.map(s=><button key={s} onClick={()=>set("sport",s)} style={{padding:"7px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,background:form.sport===s?"#6366f1":"#1e293b",color:form.sport===s?"#fff":"#94a3b8"}}>{SPORTS_EMOJI[s]} {s}</button>)}
            </div>
          </div>
          <div>
            <label style={lbl}>Stato</label>
            <div style={{display:"flex",gap:6}}>
              {[["planned","⏳ Pianificato","#94a3b8"],["done","✓ Completato","#4ade80"],["skipped","✕ Saltato","#f87171"]].map(([val,l,col])=>(
                <button key={val} onClick={()=>set("status",val)} style={{flex:1,padding:"8px 6px",borderRadius:10,border:`1px solid ${form.status===val?col:"transparent"}`,cursor:"pointer",fontSize:11,fontWeight:600,background:form.status===val?col+"33":"#1e293b",color:form.status===val?col:"#64748b"}}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{background:"#0a0a0f",borderRadius:12,padding:"12px 14px",border:"1px solid #1e293b"}}>
            <div style={{fontSize:11,color:"#6366f1",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>📋 Pianificato</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <SF label="Durata prevista" value={form.duration} onChange={v=>set("duration",v)} placeholder="es. 45 min"/>
              <SF label="Distanza prevista" value={form.distance} onChange={v=>set("distance",v)} placeholder="es. 10 km"/>
            </div>
            <label style={lbl}>Descrizione</label>
            <textarea value={form.detail} onChange={e=>set("detail",e.target.value)} style={{...inp,minHeight:60,resize:"vertical",fontFamily:"inherit",lineHeight:1.5}} placeholder="Obiettivi, struttura, indicazioni..."/>
          </div>
          <div style={{background:"#0a0a0f",borderRadius:12,padding:"12px 14px",border:`1px solid ${form.status==="done"?"#4ade8044":"#1e293b"}`}}>
            <div style={{fontSize:11,color:form.status==="done"?"#4ade80":"#475569",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
              📊 Dati reali{form.status!=="done"&&<span style={{color:"#334155",fontWeight:400}}> — dopo l'allenamento</span>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <SF label="Durata effettiva" value={form.duration_actual} onChange={v=>set("duration_actual",v)} placeholder="es. 48 min"/>
              <SF label="Distanza" value={form.distance} onChange={v=>set("distance",v)} placeholder="es. 10.2 km"/>
              <SF label="BPM medi" value={form.bpm_avg} onChange={v=>set("bpm_avg",v)} placeholder="es. 158" unit="bpm"/>
              <SF label="BPM max" value={form.bpm_max} onChange={v=>set("bpm_max",v)} placeholder="es. 178" unit="bpm"/>
              <SF label="Passo / Ritmo" value={form.pace} onChange={v=>set("pace",v)} placeholder="es. 5:20/km"/>
              <SF label="Dislivello" value={form.dislivello} onChange={v=>set("dislivello",v)} placeholder="es. 320 m"/>
              <SF label="Calorie" value={form.calorie} onChange={v=>set("calorie",v)} placeholder="es. 540" unit="kcal"/>
            </div>
          </div>
          <div style={{background:"#0a0a0f",padding:"12px 14px",borderRadius:12,border:"1px solid #1e293b"}}>
            <RPESlider value={form.rpe} onChange={v=>set("rpe",v)}/>
          </div>
          <div>
            <label style={lbl}>📓 Note post-allenamento</label>
            <textarea value={form.notes||""} onChange={e=>set("notes",e.target.value)} style={{...inp,minHeight:70,resize:"vertical",fontFamily:"inherit",lineHeight:1.5,borderColor:"#6366f133"}} placeholder="Come ti sei sentito? Cosa ha funzionato?"/>
          </div>
          <div>
            <label style={lbl}>🔗 Link allenamento</label>
            <input value={form.link||""} onChange={e=>set("link",e.target.value)} style={{...inp,borderColor:"#0ea5e933"}} placeholder="https://www.strava.com/activities/..."/>
            {form.link&&(()=>{
              let icon="🔗",label="Apri";
              if(form.link.includes("strava.com")){icon="🟠";label="Strava";}
              if(form.link.includes("garmin.com")){icon="🔵";label="Garmin";}
              return <a href={form.link} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:6,fontSize:12,color:"#38bdf8",textDecoration:"none",background:"#0ea5e922",padding:"4px 10px",borderRadius:8}}>{icon} {label} ↗</a>;
            })()}
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:20}}>
          {!isNew&&onDelete&&<button onClick={()=>onDelete(form.id)} style={{padding:"13px 18px",background:"#450a0a",color:"#f87171",border:"1px solid #f8717144",borderRadius:12,cursor:"pointer",fontWeight:600,fontSize:14}}>🗑️</button>}
          <button onClick={()=>onSave(form)} style={{flex:1,padding:"13px",background:"#6366f1",color:"#fff",border:"none",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:15}}>
            💾 {isNew?"Aggiungi":"Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── GRAFICO ────────────────────────────────────────────────────────────────
function StatsChart({workouts}) {
  // Ultimi 8 mesi
  const months=[];
  for(let i=7;i>=0;i--){
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    months.push({
      key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,
      label:d.toLocaleDateString("it-IT",{month:"short",year:"2-digit"}),
    });
  }

  const data=months.map(m=>{
    const filter=(a)=>workouts.filter(w=>w.athlete===a&&w.status==="done"&&w.date.startsWith(m.key));
    const mins=(a)=>filter(a).reduce((acc,w)=>acc+parseMins(w.duration_actual||w.duration),0);
    const count=(a)=>filter(a).length;
    return { ...m, brunoMins:mins("Bruno"), achilleMins:mins("Achille"), brunoCount:count("Bruno"), achilleCount:count("Achille") };
  });

  const maxMins=Math.max(...data.map(d=>Math.max(d.brunoMins,d.achilleMins)),60);
  const maxCount=Math.max(...data.map(d=>Math.max(d.brunoCount,d.achilleCount)),1);

  const [tab,setTab]=useState("ore");

  return (
    <div style={{background:"#0f172a",borderRadius:14,border:"1px solid #1e293b",overflow:"hidden",marginBottom:16}}>
      <div style={{padding:"14px 16px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>📊 Confronto Bruno vs Achille</div>
          <div style={{display:"flex",gap:4}}>
            {[["ore","⏱ Ore"],["num","🏅 N°"]].map(([v,l])=>(
              <button key={v} onClick={()=>setTab(v)} style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:tab===v?"#1e293b":"transparent",color:tab===v?"#e2e8f0":"#64748b"}}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:12,marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#6366f1"}}></div><span style={{fontSize:11,color:"#94a3b8"}}>Bruno</span></div>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:10,height:10,borderRadius:2,background:"#f97316"}}></div><span style={{fontSize:11,color:"#94a3b8"}}>Achille</span></div>
        </div>
      </div>
      <div style={{padding:"0 16px 16px"}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:6,height:120}}>
          {data.map(m=>{
            const bVal=tab==="ore"?m.brunoMins:m.brunoCount*60;
            const aVal=tab==="ore"?m.achilleMins:m.achilleCount*60;
            const max=tab==="ore"?maxMins:maxCount*60;
            const bH=max>0?Math.max((bVal/max)*100,bVal>0?4:0):0;
            const aH=max>0?Math.max((aVal/max)*100,aVal>0?4:0):0;
            const bLabel=tab==="ore"?`${Math.floor(bVal/60)}h${bVal%60>0?bVal%60+"m":""}`:`${m.brunoCount}`;
            const aLabel=tab==="ore"?`${Math.floor(aVal/60)}h${aVal%60>0?aVal%60+"m":""}`:`${m.achilleCount}`;
            return (
              <div key={m.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:100}}>
                  <div title={`Bruno: ${bLabel}`} style={{flex:1,height:`${bH}%`,background:"#6366f1",borderRadius:"3px 3px 0 0",minHeight:bVal>0?4:0,transition:"height 0.3s"}}></div>
                  <div title={`Achille: ${aLabel}`} style={{flex:1,height:`${aH}%`,background:"#f97316",borderRadius:"3px 3px 0 0",minHeight:aVal>0?4:0,transition:"height 0.3s"}}></div>
                </div>
                <div style={{fontSize:9,color:"#475569",textAlign:"center",lineHeight:1.2}}>{m.label}</div>
              </div>
            );
          })}
        </div>
        {/* Totali */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
          {ATHLETES.map((a,i)=>{
            const done=workouts.filter(w=>w.athlete===a&&w.status==="done");
            const totalMins=done.reduce((acc,w)=>acc+parseMins(w.duration_actual||w.duration),0);
            const h=Math.floor(totalMins/60); const m=totalMins%60;
            return (
              <div key={a} style={{background:"#0a0a0f",borderRadius:10,padding:"10px 12px",border:`1px solid ${i===0?"#6366f144":"#f9731644"}`}}>
                <div style={{fontSize:10,color:i===0?"#6366f1":"#f97316",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{a}</div>
                <div style={{fontSize:18,fontWeight:800,color:"#f1f5f9"}}>{h}h{m>0?` ${m}m`:""}</div>
                <div style={{fontSize:11,color:"#475569"}}>{done.length} allenamenti totali</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CARD ───────────────────────────────────────────────────────────────────
function WorkoutCard({w,expanded,onExpand,onEdit,onToggle}) {
  const wt=WORKOUT_TYPES[w.type];
  const hasStats=w.bpm_avg||w.bpm_max||w.pace||w.dislivello||w.calorie||w.duration_actual;
  return (
    <div style={{background:wt.bgColor,border:`1px solid ${isToday(w.date)?wt.color:w.custom?"#6366f144":"#1e293b"}`,borderRadius:14,overflow:"hidden",opacity:w.status==="skipped"?0.5:1}}>
      <div onClick={onExpand} style={{padding:"13px 14px",cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>{SPORTS_EMOJI[w.sport]||"🏃"}</span>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:700,fontSize:13,color:"#f1f5f9"}}>{wt.emoji} {wt.label}</span>
                {w.custom&&<span style={{fontSize:9,color:"#6366f1",background:"#6366f122",padding:"1px 6px",borderRadius:6,fontWeight:600}}>EXTRA</span>}
              </div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>{formatDate(w.date)} · {w.sport}{w.duration?` · ${w.duration}`:""}{w.distance?` · ${w.distance}`:""}</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {isToday(w.date)&&<span style={{background:wt.color,color:"#000",fontSize:8,fontWeight:800,padding:"2px 7px",borderRadius:10,textTransform:"uppercase",letterSpacing:1}}>OGGI</span>}
            {w.rpe&&<span style={{fontSize:11,fontWeight:700,color:RPE_COLOR(w.rpe),background:`${RPE_COLOR(w.rpe)}22`,padding:"2px 7px",borderRadius:8}}>RPE {w.rpe}</span>}
            <button onClick={e=>{e.stopPropagation();onEdit();}} style={{width:28,height:28,borderRadius:8,border:"1px solid #334155",background:"#1e293b",color:"#94a3b8",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>
            <button onClick={e=>{e.stopPropagation();onToggle();}} style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${w.status==="done"?wt.color:"#334155"}`,background:w.status==="done"?wt.color:"transparent",color:w.status==="done"?"#000":"#64748b",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {w.status==="done"?"✓":w.status==="skipped"?"✕":"○"}
            </button>
          </div>
        </div>
      </div>
      {expanded&&(
        <div style={{padding:"0 14px 14px",borderTop:`1px solid ${wt.color}22`}}>
          {w.detail&&<div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,marginBottom:10}}>{w.detail}</div>}
          {hasStats&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>
              {w.bpm_avg&&<div style={{background:"#0f172a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#ef4444",textTransform:"uppercase",letterSpacing:1}}>BPM med</div><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{w.bpm_avg}</div></div>}
              {w.bpm_max&&<div style={{background:"#0f172a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#ef4444",textTransform:"uppercase",letterSpacing:1}}>BPM max</div><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{w.bpm_max}</div></div>}
              {w.pace&&<div style={{background:"#0f172a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#38bdf8",textTransform:"uppercase",letterSpacing:1}}>Ritmo</div><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{w.pace}</div></div>}
              {w.dislivello&&<div style={{background:"#0f172a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#a78bfa",textTransform:"uppercase",letterSpacing:1}}>Dislivello</div><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{w.dislivello}</div></div>}
              {w.calorie&&<div style={{background:"#0f172a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#fb923c",textTransform:"uppercase",letterSpacing:1}}>Calorie</div><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{w.calorie}</div></div>}
              {w.duration_actual&&<div style={{background:"#0f172a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}><div style={{fontSize:9,color:"#4ade80",textTransform:"uppercase",letterSpacing:1}}>Durata</div><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{w.duration_actual}</div></div>}
            </div>
          )}
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:wt.color,background:`${wt.color}22`,padding:"3px 10px",borderRadius:8}}>{wt.bpm}</span>
            {w.rpe&&<span style={{fontSize:11,color:RPE_COLOR(w.rpe),background:`${RPE_COLOR(w.rpe)}22`,padding:"3px 10px",borderRadius:8}}>💢 RPE {w.rpe}/10 — {RPE_LABELS[w.rpe]}</span>}
          </div>
          {w.notes&&<div style={{marginTop:10,padding:"10px 12px",background:"#0f172a",borderRadius:10,border:"1px solid #6366f133"}}><div style={{fontSize:10,color:"#6366f1",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>📓 Note</div><div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>{w.notes}</div></div>}
          {w.link&&(()=>{let icon="🔗",label="Apri";if(w.link.includes("strava.com")){icon="🟠";label="Strava";}if(w.link.includes("garmin.com")){icon="🔵";label="Garmin";}return <a href={w.link} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:10,fontSize:13,fontWeight:600,color:"#38bdf8",textDecoration:"none",background:"#0ea5e922",padding:"8px 14px",borderRadius:10,border:"1px solid #0ea5e933"}}>{icon} {label} ↗</a>;})()}
        </div>
      )}
    </div>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
export default function TrainingTracker() {
  const [workouts,setWorkouts]           = useState([]);
  const [loaded,setLoaded]               = useState(false);
  const [syncing,setSyncing]             = useState(false);
  const [dbOk,setDbOk]                   = useState(false);
  const [activeAthlete,setActiveAthlete] = useState("Bruno");
  const [weekOffset,setWeekOffset]       = useState(0);
  const [view,setView]                   = useState("week");
  const [toast,setToast]                 = useState(null);
  const [expandedId,setExpandedId]       = useState(null);
  const [modalWorkout,setModalWorkout]   = useState(null);
  const [isNew,setIsNew]                 = useState(false);
  const pollRef                          = useRef(null);

  const showToast=(msg,ms=2500)=>{setToast(msg);setTimeout(()=>setToast(null),ms);};

  async function loadData(silent=false) {
    if(!silent) setSyncing(true);
    const remote = await dbLoad();
    if(remote && Array.isArray(remote) && remote.length>=0) {
      setDbOk(true);
      if(remote.length===0) {
        const plan=generateWeekPlan(0);
        setWorkouts(plan); lsSave(plan);
        await dbUpsert(plan);
      } else {
        setWorkouts(remote); lsSave(remote);
      }
    } else {
      // fallback localStorage
      const local=lsLoad();
      if(local&&local.length>0){ setWorkouts(local); }
      else { const p=generateWeekPlan(0); setWorkouts(p); lsSave(p); }
    }
    if(!silent) setSyncing(false);
    setLoaded(true);
  }

  useEffect(()=>{
    loadData();
    pollRef.current=setInterval(()=>loadData(true),30000);
    return ()=>clearInterval(pollRef.current);
  },[]);

  async function persist(updated, deletedId=null) {
    setWorkouts(updated); lsSave(updated);
    if(dbOk) {
      setSyncing(true);
      if(deletedId) await dbDelete(deletedId);
      else await dbUpsert(updated);
      setSyncing(false);
    }
    showToast(dbOk?"✅ Salvato e sincronizzato!":"✅ Salvato in locale");
  }

  function toggleStatus(id){
    const c={planned:"done",done:"skipped",skipped:"planned"};
    persist(workouts.map(w=>w.id===id?{...w,status:c[w.status]||"planned"}:w));
  }

  async function handleSave(updated) {
    const next=isNew?[...workouts,updated]:workouts.map(w=>w.id===updated.id?updated:w);
    await persist(next);
    setModalWorkout(null);
  }

  async function handleDelete(id) {
    if(!confirm("Eliminare questo allenamento?")) return;
    await persist(workouts.filter(w=>w.id!==id), id);
    setModalWorkout(null);
  }

  function addWeekPlan() {
    const plan=generateWeekPlan(weekOffset);
    const ids=new Set(workouts.map(w=>w.id));
    const toAdd=plan.filter(w=>!ids.has(w.id));
    if(!toAdd.length){showToast("✓ Piano già presente");return;}
    persist([...workouts,...toAdd]);
  }

  // Settimana
  const today=new Date();
  const monday=new Date(today); monday.setDate(today.getDate()-today.getDay()+1+weekOffset*7);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);
  const weekWorkouts=workouts.filter(w=>{const d=new Date(w.date);return d>=monday&&d<=sunday;}).filter(w=>w.athlete===activeAthlete).sort((a,b)=>a.date.localeCompare(b.date));
  const historyWorkouts=workouts.filter(w=>isPast(w.date)&&w.status==="done"&&w.athlete===activeAthlete).sort((a,b)=>b.date.localeCompare(a.date));
  const weekLabel=()=>({"-1":"Sett. scorsa","0":"Questa settimana","1":"Prossima sett."}[String(weekOffset)]??`Sett. ${weekOffset>0?"+":""}${weekOffset}`);
  const stats={done:weekWorkouts.filter(w=>w.status==="done").length,total:weekWorkouts.length};

  if(!loaded) return <div style={{minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontSize:14}}>⏳ Caricamento...</div>;

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",color:"#e2e8f0",fontFamily:"system-ui,sans-serif"}}>
      {modalWorkout&&<WorkoutModal workout={modalWorkout} onSave={handleSave} onDelete={!isNew?handleDelete:null} onClose={()=>setModalWorkout(null)} isNew={isNew}/>}
      {toast&&<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"#e2e8f0",padding:"10px 18px",borderRadius:20,fontSize:13,zIndex:200,boxShadow:"0 4px 20px #00000088",border:"1px solid #334155",whiteSpace:"nowrap"}}>{toast}</div>}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)",borderBottom:"1px solid #1e293b",padding:"20px 20px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:4}}>Training Log</div>
            <h1 style={{margin:0,fontSize:21,fontWeight:800,color:"#f1f5f9"}}>🏋️ Piano Allenamenti</h1>
            <div style={{fontSize:10,marginTop:3,color:dbOk?"#4ade80":"#475569"}}>{syncing?"⏳ Sync...":dbOk?"🟢 Sincronizzato":"🔴 Locale"}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
            <div style={{display:"flex",gap:6}}>
              {ATHLETES.map(a=><button key={a} onClick={()=>setActiveAthlete(a)} style={{padding:"5px 13px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:activeAthlete===a?"#6366f1":"#1e293b",color:activeAthlete===a?"#fff":"#64748b"}}>{a}</button>)}
            </div>
            <button onClick={()=>{setIsNew(true);setModalWorkout(emptyWorkout(activeAthlete));}} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700,background:"#4ade8022",color:"#4ade80",border:"1px solid #4ade8044"}}>
              ➕ Nuovo allenamento
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginTop:16}}>
          {[["week","📅 Settimana"],["history","📚 Storico"]].map(([v,l])=>(
            <button key={v} onClick={()=>setView(v)} style={{padding:"7px 14px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontSize:12,background:view===v?"#0a0a0f":"transparent",color:view===v?"#e2e8f0":"#64748b"}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"16px 20px"}}>
        {view==="week"?(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <button onClick={()=>setWeekOffset(weekOffset-1)} style={{background:"#1e293b",border:"none",color:"#94a3b8",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:18}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{weekLabel()}</div>
                <div style={{fontSize:10,color:"#475569",marginTop:2}}>{monday.toLocaleDateString("it-IT",{day:"numeric",month:"short"})} – {sunday.toLocaleDateString("it-IT",{day:"numeric",month:"short"})}</div>
              </div>
              <button onClick={()=>setWeekOffset(weekOffset+1)} style={{background:"#1e293b",border:"none",color:"#94a3b8",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:18}}>›</button>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:14,padding:"12px 14px",background:"#0f172a",borderRadius:12,border:"1px solid #1e293b"}}>
              <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:"#6366f1"}}>{stats.done}/{stats.total}</div><div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:1}}>Completati</div></div>
              {Object.entries(WORKOUT_TYPES).map(([k,v])=>{const done=weekWorkouts.filter(w=>w.type===k&&w.status==="done").length;return <div key={k} style={{flex:1,textAlign:"center",opacity:done>0?1:0.3}}><div style={{fontSize:18}}>{v.emoji}</div><div style={{fontSize:10,color:v.color}}>{done>0?"✓":"—"}</div></div>;})}
            </div>
            {weekWorkouts.length===0?(
              <div style={{textAlign:"center",padding:40,color:"#475569"}}>
                <div style={{fontSize:32,marginBottom:10}}>🗓️</div>
                <div style={{marginBottom:16,fontSize:14}}>Nessun allenamento per questa settimana</div>
                <button onClick={addWeekPlan} style={{background:"#6366f1",color:"#fff",border:"none",padding:"10px 22px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:14}}>+ Genera piano settimana</button>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {weekWorkouts.map(w=><WorkoutCard key={w.id} w={w} expanded={expandedId===w.id} onExpand={()=>setExpandedId(expandedId===w.id?null:w.id)} onEdit={()=>{setIsNew(false);setModalWorkout(w);}} onToggle={()=>toggleStatus(w.id)}/>)}
              </div>
            )}
            <button onClick={addWeekPlan} style={{width:"100%",marginTop:14,padding:"11px",background:"#1e293b",border:"1px dashed #334155",color:"#64748b",borderRadius:12,cursor:"pointer",fontSize:12,fontWeight:500}}>
              + Aggiungi piano settimana
            </button>
          </>
        ):(
          <div>
            <StatsChart workouts={workouts}/>
            <div style={{fontSize:12,color:"#475569",marginBottom:12}}>Storico completati — {activeAthlete}</div>
            {historyWorkouts.length===0?(
              <div style={{textAlign:"center",padding:40,color:"#475569"}}><div style={{fontSize:32,marginBottom:8}}>📊</div><div>Nessun allenamento completato ancora</div></div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {historyWorkouts.map(w=>{
                  const wt=WORKOUT_TYPES[w.type];
                  const hasStats=w.bpm_avg||w.bpm_max||w.pace||w.dislivello||w.calorie;
                  return (
                    <div key={w.id} onClick={()=>{setIsNew(false);setModalWorkout(w);}} style={{padding:"12px 14px",background:"#0f172a",borderRadius:12,border:"1px solid #1e293b",cursor:"pointer"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <span style={{fontSize:20}}>{SPORTS_EMOJI[w.sport]}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{wt.emoji} {w.sport}{w.custom&&<span style={{fontSize:9,color:"#6366f1",background:"#6366f122",padding:"1px 6px",borderRadius:6,marginLeft:6}}>EXTRA</span>}</div>
                          <div style={{fontSize:11,color:"#475569",marginTop:2}}>{formatDate(w.date)}{(w.duration_actual||w.duration)?` · ${w.duration_actual||w.duration}`:""}{w.distance?` · ${w.distance}`:""}</div>
                        </div>
                        <div style={{textAlign:"right"}}><span style={{fontSize:11,color:wt.color,fontWeight:700}}>✓</span>{w.rpe&&<div style={{fontSize:10,color:RPE_COLOR(w.rpe),marginTop:2}}>RPE {w.rpe}</div>}</div>
                      </div>
                      {hasStats&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>{w.bpm_avg&&<span style={{fontSize:11,color:"#ef4444",background:"#ef444422",padding:"3px 8px",borderRadius:8}}>❤️ {w.bpm_avg} bpm</span>}{w.pace&&<span style={{fontSize:11,color:"#38bdf8",background:"#38bdf822",padding:"3px 8px",borderRadius:8}}>⚡ {w.pace}</span>}{w.dislivello&&<span style={{fontSize:11,color:"#a78bfa",background:"#a78bfa22",padding:"3px 8px",borderRadius:8}}>⛰️ {w.dislivello}</span>}{w.calorie&&<span style={{fontSize:11,color:"#fb923c",background:"#fb923c22",padding:"3px 8px",borderRadius:8}}>🔥 {w.calorie}</span>}</div>}
                      {w.notes&&<div style={{marginTop:8,padding:"8px 10px",background:"#0a0a0f",borderRadius:8}}><div style={{fontSize:11,color:"#64748b",lineHeight:1.5}}>📓 {w.notes}</div></div>}
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
