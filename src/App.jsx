import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { summarizeArticles } from './api-client';

// ═══════════════════════════════════════════
//  SUPABASE
// ═══════════════════════════════════════════
const SB_URL = import.meta.env.VITE_SUPABASE_URL || "https://lsufycmbidtvhynhajrd.supabase.co";
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzdWZ5Y21iaWR0dmh5bmhhanJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NTE2MTAsImV4cCI6MjA4NjMyNzYxMH0.GrIwPjIJWGD2YAoCWqhSLNOg4beyQFxuv3IWoCQn5dY";
const hdrs = (token) => ({ apikey:SB_KEY, Authorization:`Bearer ${token||SB_KEY}`, "Content-Type":"application/json", Prefer:"return=representation" });

const authApi = {
  async sendMagicLink(email) { const r = await fetch(`${SB_URL}/auth/v1/magiclink`,{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({email})}); if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.msg||e.error_description||"Failed");} },
  async refreshSession(rt) { const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:rt})}); return r.ok?r.json():null; },
  async getUser(at) { const r=await fetch(`${SB_URL}/auth/v1/user`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${at}`}}); return r.ok?r.json():null; },
  async signOut(t) { await fetch(`${SB_URL}/auth/v1/logout`,{method:"POST",headers:{apikey:SB_KEY,Authorization:`Bearer ${t}`}}).catch(()=>{}); },
};

const saveSession=(d)=>{try{localStorage.setItem("mb_at",d.access_token);localStorage.setItem("mb_rt",d.refresh_token);localStorage.setItem("mb_u",JSON.stringify(d.user));}catch{}};
const loadSession=()=>{try{const a=localStorage.getItem("mb_at"),r=localStorage.getItem("mb_rt"),u=JSON.parse(localStorage.getItem("mb_u")||"null");if(a&&r&&u)return{access_token:a,refresh_token:r,user:u};}catch{}return null;};
const clearSession=()=>{try{["mb_at","mb_rt","mb_u"].forEach(k=>localStorage.removeItem(k));}catch{}};

const dbApi = {
  async select(table,token,filters={}) { let url=`${SB_URL}/rest/v1/${table}?select=*`;for(const[k,v]of Object.entries(filters))url+=`&${k}=eq.${encodeURIComponent(v)}`;const r=await fetch(url,{headers:hdrs(token)});return r.ok?r.json():[]; },
  async upsert(table,data,token) { const r=await fetch(`${SB_URL}/rest/v1/${table}`,{method:"POST",headers:{...hdrs(token),Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(data)});if(!r.ok)throw new Error(await r.text());return r.json(); },
  async insert(table,data,token) { const r=await fetch(`${SB_URL}/rest/v1/${table}`,{method:"POST",headers:hdrs(token),body:JSON.stringify(data)});if(!r.ok)throw new Error(await r.text());return r.json(); },
  async delete(table,filters,token){ let url=`${SB_URL}/rest/v1/${table}?`; for(const[k,v]of Object.entries(filters))url+=`${k}=eq.${encodeURIComponent(v)}&`; const r=await fetch(url,{method:"DELETE",headers:{...hdrs(token),Prefer:"return=representation"}}); if(!r.ok)throw new Error(await r.text()); return r.json(); },
};

// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
const PAYWALLED=["wsj.com","ft.com","nytimes.com","washingtonpost.com","economist.com","bloomberg.com","barrons.com","theathletic.com","thetimes.co.uk","telegraph.co.uk","hbr.org","newyorker.com","wired.com","businessinsider.com","seekingalpha.com","stratechery.com"];
const PAYWALLED_DISPLAY = {"wsj.com":"Wall Street Journal","ft.com":"Financial Times","nytimes.com":"New York Times","washingtonpost.com":"Washington Post","economist.com":"The Economist","bloomberg.com":"Bloomberg","barrons.com":"Barron's","theathletic.com":"The Athletic","thetimes.co.uk":"The Times (UK)","telegraph.co.uk":"The Telegraph","hbr.org":"Harvard Business Review","newyorker.com":"The New Yorker","wired.com":"Wired","businessinsider.com":"Business Insider","seekingalpha.com":"Seeking Alpha","stratechery.com":"Stratechery"};
const QUALITY_SOURCES=["reuters.com","apnews.com","bloomberg.com","bbc.com","bbc.co.uk","npr.org","nature.com","science.org","techcrunch.com","arstechnica.com","theverge.com","wired.com","ft.com","economist.com","wsj.com","nytimes.com","washingtonpost.com","cnbc.com","theguardian.com"];
const isPaywalled=(url)=>PAYWALLED.some(d=>url?.toLowerCase().includes(d));
const isQualitySource=(url)=>QUALITY_SOURCES.some(d=>url?.toLowerCase().includes(d));
const extractDomain=(url)=>{try{return new URL(url).hostname.replace("www.","");}catch{return"unknown";}};
const fmtDate=(d)=>{try{return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}catch{return d;}};
const fmtTime=(d)=>{try{return new Date(d).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}catch{return"";}};
const todayStr=()=>new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
const ICONS={Technology:"◈",Business:"◆",Finance:"◇",Health:"✦",Science:"✧",Politics:"◉",Sports:"◎",Entertainment:"✹",AI:"◈",Climate:"❋",Crypto:"◇",Startups:"✦"};
const getIcon=(s)=>ICONS[s]||ICONS[Object.keys(ICONS).find(k=>s.toLowerCase().includes(k.toLowerCase()))]||"▸";
const DEFAULT_PROFILE={categories:["Technology","Business"],expertise:[],companies:[],paywalled_sources:[],blocked_sources:[],max_articles_per_section:5,summary_style:"brief",email_delivery:false,delivery_time:"08:00"};
const QUICK_CATS=["Technology","Business","Finance","Health","Science","Politics","Sports","AI","Climate","Crypto","Startups","Entertainment"];

const SUMMARY_STYLES=[
  {key:"scan",label:"Scan",desc:"Titles and sources only. Fastest way to catch up.",icon:"⚡"},
  {key:"brief",label:"Brief",desc:"2\u20134 sentences covering key facts and context.",icon:"◈",isDefault:true},
  {key:"indepth",label:"In-Depth",desc:"4\u20136 sentences with background, implications, and what to watch.",icon:"◆"},
  {key:"relevance",label:"Relevance",desc:"Brief summary + personalized \"Why this matters\" for your expertise.",icon:"◉"},
];

function StylePicker({value,setValue,t}){
  return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
    {SUMMARY_STYLES.map(s=>{
      const sel = s.key===value;
      return <div key={s.key} onClick={()=>setValue(s.key)} style={{padding:12,borderRadius:t.r,background:sel?t.accentBg:t.bgCard,border:sel?`2px solid ${t.accentSolid}`:`1px solid ${t.border}`,cursor:"pointer",boxShadow:sel?t.accentShadow:"none",position:"relative",fontFamily:t.fb}}>
        {s.isDefault&&<div style={{position:"absolute",right:8,top:8,fontSize:11,fontWeight:700,color:t.textSec}}>Default</div>}
        <div style={{fontSize:20,marginBottom:6}}>{s.icon}</div>
        <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:6}}>{s.label}</div>
        <div style={{fontSize:13,color:t.textMut,lineHeight:1.4}}>{s.desc}</div>
      </div>;
    })}
  </div>;
}

const dedup=(articles)=>{
  const seen=new Set();
  return articles.filter(a=>{
    const norm=a.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,60);
    if(seen.has(norm))return false;
    for(const s of seen){if(norm.startsWith(s.slice(0,40))||s.startsWith(norm.slice(0,40)))return false;}
    seen.add(norm);return true;
  });
};

const rankArticles=(articles)=>{
  return[...articles].sort((a,b)=>{
    const aq=isQualitySource(a.link)?1:0, bq=isQualitySource(b.link)?1:0;
    if(aq!==bq)return bq-aq;
    return new Date(b.pubDate)-new Date(a.pubDate);
  });
};

const matchesCompany=(article,companies)=>{
  const text=(article.title+" "+article.description).toLowerCase();
  return companies.filter(c=>text.includes(c.toLowerCase()));
};

const fetchRSS=async(query)=>{
  const rss=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const url=`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;
  try{const r=await fetch(url);if(!r.ok)return[];const d=await r.json();return(d.items||[]).map(i=>({title:i.title?.replace(/<[^>]*>/g,"")||"Untitled",link:i.link||"",source:i.source||extractDomain(i.link),pubDate:i.pubDate||"",description:i.description?.replace(/<[^>]*>/g,"").slice(0,300)||""}));}catch{return[];}
};

const parseHashTokens=()=>{const h=window.location.hash.substring(1);if(!h)return null;const p=new URLSearchParams(h);const a=p.get("access_token"),r=p.get("refresh_token");if(a&&r){window.history.replaceState(null,"",window.location.pathname);return{access_token:a,refresh_token:r};}return null;};

const digestToText=(sections)=>{
  let text=`MORNING BRIEF \u2014 ${todayStr()}\n${"═".repeat(40)}\n\n`;
  for(const[section,articles]of Object.entries(sections)){
    text+=`${getIcon(section)} ${section.toUpperCase()}\n${"-".repeat(30)}\n`;
    for(const a of articles){
      text+=`\u2022 ${a.title}\n  ${a.summary||''}\n  ${a.source} \u00b7 ${fmtDate(a.pubDate)}\n  ${a.link}\n\n`;
    }
  }
  return text;
};

// ═══════════════════════════════════════════
//  THEMES
// ═══════════════════════════════════════════
const themes = {
  light: {
    bg:"#fefcfa",bgAlt:"#f5f0ea",bgInput:"#ffffff",bgCard:"#ffffff",
    text:"#1a1714",textSec:"#1a1714",textMut:"#5c554c",textFaint:"#a09888",
    border:"#ede8e0",borderFocus:"#e0a050",
    accent:"linear-gradient(135deg,#ff9f43,#ee5a24)",accentSolid:"#ee5a24",accentText:"#fff",accentShadow:"0 4px 16px rgba(238,90,36,0.2)",accentBg:"rgba(238,90,36,0.06)",accentBorder:"rgba(238,90,36,0.12)",
    tagBg:"#f5f0ea",tagText:"#8a7e6e",tagOnBg:"linear-gradient(135deg,#ff9f43,#ee5a24)",tagOnText:"#ffffff",tagOnShadow:"0 2px 8px rgba(238,90,36,0.2)",
    toggleBg:"#ede8e0",toggleDot:"#c4bdb2",toggleOnBg:"linear-gradient(135deg,#ff9f43,#ee5a24)",toggleOnDot:"#fff",
    cardShadow:"0 1px 3px rgba(0,0,0,0.04)",
    alertBg:"rgba(238,90,36,0.06)",alertBorder:"rgba(238,90,36,0.15)",alertText:"#c06020",
    qualityBg:"rgba(46,160,67,0.06)",qualityBorder:"rgba(46,160,67,0.12)",qualityText:"#2a8c3e",
    errBg:"rgba(220,80,60,0.06)",errBorder:"rgba(220,80,60,0.1)",errText:"#c05040",
    successBg:"rgba(46,160,67,0.06)",successBorder:"rgba(46,160,67,0.12)",successText:"#2a8c3e",
    r:12,rPill:20,logoR:8,
    fd:"'Playfair Display',serif",fb:"'Nunito Sans',sans-serif",fm:"'JetBrains Mono',monospace",
    logo:"\u2600",logoBg:"linear-gradient(135deg,#ff9f43,#ee5a24)",
    spinner:"#ee5a24",spinnerTrack:"rgba(238,90,36,0.12)",
    artBorder:"rgba(238,90,36,0.1)",artBorderH:"rgba(238,90,36,0.3)",linkH:"#ee5a24",secIcon:"#ee5a24",
    paywallText:"#c07830",pillBorder:"#e0d9cf",
  },
  dark: {
    bg:"#0a0a0f",bgAlt:"#0f1016",bgInput:"#0f1016",bgCard:"#11121a",
    text:"#f0f0f0",textSec:"#f0f0f0",textMut:"#f0f0f0",textFaint:"#404850",
    border:"rgba(255,255,255,0.12)",borderFocus:"#00d4aa",
    accent:"linear-gradient(135deg,#00d4aa,#00b894)",accentSolid:"#00d4aa",accentText:"#0a0a0f",accentShadow:"0 4px 16px rgba(0,212,170,0.15)",accentBg:"rgba(0,212,170,0.06)",accentBorder:"rgba(0,212,170,0.15)",
    tagBg:"rgba(255,255,255,0.04)",tagText:"#808890",
    tagOnBg:"#00d4aa",tagOnText:"#0a0a0f",tagOnShadow:"0 8px 28px rgba(0,212,170,0.18)",
    toggleBg:"#1a1d24",toggleDot:"#3a3f48",toggleOnBg:"linear-gradient(135deg,#00d4aa,#00b894)",toggleOnDot:"#0a0a0f",
    cardShadow:"0 1px 3px rgba(0,0,0,0.2)",
    alertBg:"rgba(0,212,170,0.06)",alertBorder:"rgba(0,212,170,0.15)",alertText:"#00d4aa",
    qualityBg:"rgba(0,212,170,0.04)",qualityBorder:"rgba(0,212,170,0.1)",qualityText:"#00b894",
    errBg:"rgba(220,60,60,0.08)",errBorder:"rgba(220,60,60,0.15)",errText:"#e06050",
    successBg:"rgba(0,212,170,0.06)",successBorder:"rgba(0,212,170,0.12)",successText:"#00d4aa",
    r:12,rPill:20,logoR:8,
    fd:"'Playfair Display',serif",fb:"'Nunito Sans',sans-serif",fm:"'JetBrains Mono',monospace",
    logo:"\u25b6",logoBg:"#00d4aa",
    spinner:"#00d4aa",spinnerTrack:"rgba(0,212,170,0.12)",
    artBorder:"rgba(0,212,170,0.08)",artBorderH:"rgba(0,212,170,0.3)",linkH:"#00d4aa",secIcon:"#00d4aa",
    paywallText:"#d4a020",pillBorder:"#1e2028",
  },
};

// ═══════════════════════════════════════════
//  SMALL COMPONENTS
// ═══════════════════════════════════════════

function ThemeToggle({dark,setDark,t}){
  return <button onClick={()=>setDark(!dark)} title={dark?"Light mode":"Dark mode"} style={{
    width:34,height:34,borderRadius:t.r,background:t.bgAlt,border:`1px solid ${t.border}`,
    display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:15,
    color:t.accentSolid,transition:"all 0.3s",flexShrink:0,
  }}>{dark?"\u263e":"\u2600"}</button>;
}

function Toggle({value,onChange,label,t}){
  return <div style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer"}} onClick={()=>onChange(!value)}>
    <div style={{width:42,height:22,borderRadius:t.r,position:"relative",background:value?t.toggleOnBg:t.toggleBg,transition:"background 0.3s",flexShrink:0}}>
      <div style={{width:16,height:16,borderRadius:8,position:"absolute",top:3,left:value?23:3,background:value?t.toggleOnDot:t.toggleDot,transition:"left 0.2s,background 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.1)"}}/>
    </div>
    <span style={{fontSize:13,color:t.textSec,fontFamily:t.fb}}>{label}</span>
  </div>;
}

function TagInput({tags,setTags,placeholder,t}){
  const[val,setVal]=useState("");
  const add=()=>{const v=val.trim();if(v&&!tags.includes(v)){setTags([...tags,v]);setVal("");}};
  return <div>
    {tags.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
      {tags.map(tag=><span key={tag} style={{background:t.bgAlt,color:t.tagText,padding:"5px 12px",borderRadius:t.rPill,fontSize:12.5,fontWeight:600,display:"flex",alignItems:"center",gap:6,fontFamily:t.fb}}>
        {tag}<span onClick={()=>setTags(tags.filter(x=>x!==tag))} style={{cursor:"pointer",opacity:0.4,fontSize:14}}>×</span>
      </span>)}
    </div>}
    <div style={{display:"flex",gap:8}}>
      <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&(e.preventDefault(),add())} placeholder={placeholder} style={{flex:1,padding:"10px 14px",fontSize:14,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,background:t.bgInput,color:t.text,outline:"none",fontFamily:t.fb,boxSizing:"border-box",transition:"border-color 0.2s"}}/>
      <button onClick={add} style={{padding:"10px 16px",fontSize:13,fontWeight:600,background:"transparent",color:t.textSec,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>Add</button>
    </div>
  </div>;
}

function SkeletonCard({t}){
  return <div style={{padding:"16px 18px",background:t.bgCard,borderRadius:t.r,border:`1px solid ${t.border}`,marginBottom:12,animation:"pulse 1.5s ease-in-out infinite"}}>
    <div style={{height:16,width:"85%",background:t.bgAlt,borderRadius:8,marginBottom:10}}/>
    <div style={{height:12,width:"100%",background:t.bgAlt,borderRadius:8,marginBottom:6}}/>
    <div style={{height:12,width:"60%",background:t.bgAlt,borderRadius:8}}/>
  </div>;
}

function Badge({label,bg,border,color,t}){
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:0.5,padding:"2px 8px",borderRadius:t.rPill,background:bg,border:`1px solid ${border}`,color:color,fontFamily:t.fm,textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>;
}

// ═══════════════════════════════════════════
//  AUTH SCREEN
// ═══════════════════════════════════════════
function AuthScreen({t,dark,setDark}){
  const[email,setEmail]=useState("");
  const[sent,setSent]=useState(false);
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");
  const send=async()=>{
    if(!email) return;
    const key = `mb_magic_${email.toLowerCase()}`;
    const COOLDOWN = 1000 * 60 * 2; // 2 minutes client-side cooldown
    try{
      const last = parseInt(localStorage.getItem(key) || "0", 10) || 0;
      const now = Date.now();
      const delta = now - last;
      if(last && delta < COOLDOWN){
        const secs = Math.ceil((COOLDOWN - delta) / 1000);
        setErr(`Please wait ${secs}s before requesting another sign-in link.`);
        return;
      }
    }catch{}

    setBusy(true);
    setErr("");
    try{
      await authApi.sendMagicLink(email);
      // mark timestamp to avoid immediate re-sends
      try{ localStorage.setItem(key, String(Date.now())); }catch{}
      setSent(true);
    }catch(e){
      // friendly messages for rate-limit like responses
      const msg = String(e?.message || e || "Failed to send link");
      if(/rate/i.test(msg) || /limit/i.test(msg)){
        setErr("Email rate limit exceeded. Please wait a few minutes and try again.");
        try{ localStorage.setItem(key, String(Date.now())); }catch{}
      } else {
        setErr(msg);
      }
    }
    setBusy(false);
  };
  return <div style={{maxWidth:400,margin:"0 auto",paddingTop:60,animation:"fadeUp 0.6s ease-out"}}>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:24}}><ThemeToggle dark={dark} setDark={setDark} t={t}/></div>
    <div style={{textAlign:"center",marginBottom:40}}>
      <div style={{width:52,height:52,borderRadius:t.logoR,margin:"0 auto 16px",background:t.logoBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:t.accentText,boxShadow:t.accentShadow}}>{t.logo}</div>
      <h1 style={{fontFamily:t.fd,fontSize:26,fontWeight:700,color:t.text,margin:"0 0 8px"}}>Morning Brief</h1>
      <p style={{color:t.textMut,fontSize:14,margin:0,lineHeight:1.6,fontFamily:t.fb}}>AI-curated news, delivered daily.</p>
    </div>
    {!sent?<>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Email address</label>
      <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="you@company.com" type="email" style={{width:"100%",padding:"13px 16px",fontSize:15,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,background:t.bgInput,color:t.text,outline:"none",fontFamily:t.fb,boxSizing:"border-box",marginBottom:16,transition:"border-color 0.2s"}}/>
      <button onClick={send} disabled={busy||!email} style={{width:"100%",padding:"14px 0",fontSize:14,fontWeight:700,background:t.accent,color:t.accentText,border:"none",borderRadius:t.r,cursor:busy||!email?"not-allowed":"pointer",boxShadow:t.accentShadow,fontFamily:t.fb,opacity:busy||!email?0.6:1,transition:"all 0.2s"}}>{busy?"Sending\u2026":"Send Magic Link"}</button>
    </>:<div style={{textAlign:"center"}}>
      <div style={{background:t.successBg,border:`1px solid ${t.successBorder}`,borderRadius:t.r,padding:"24px",marginBottom:24,color:t.successText,fontSize:14,lineHeight:1.6,fontFamily:t.fb}}>
        <div style={{fontSize:32,marginBottom:12}}>{"\u2709"}</div>
        Check <strong>{email}</strong> for a sign-in link.
        <div style={{marginTop:8,fontSize:13,color:t.textMut}}>Click the link in the email to continue.</div>
      </div>
      <button onClick={()=>{setSent(false);setEmail("");}} style={{width:"100%",padding:"12px 0",fontSize:13,fontWeight:600,background:"transparent",color:t.textSec,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>Use different email</button>
    </div>}
    {err&&<div style={{marginTop:16,padding:"12px 16px",background:t.errBg,border:`1px solid ${t.errBorder}`,borderRadius:t.r,color:t.errText,fontSize:13,fontFamily:t.fb}}>{err}</div>}
  </div>;
}

// ═══════════════════════════════════════════
//  ONBOARDING WIZARD
// ═══════════════════════════════════════════
function Onboarding({profile,setProfile,onComplete,t}){
  const[step,setStep]=useState(0);
  const up=(k,v)=>setProfile(p=>({...p,[k]:v}));
  const steps=[
    {title:"What topics interest you?",sub:"Select at least one to get started.",content:(
      <div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {QUICK_CATS.map(c=>{
            const on=profile.categories.includes(c);
            return <button key={c} onClick={()=>up("categories",on?profile.categories.filter(x=>x!==c):[...profile.categories,c])} style={{
              padding:"10px 20px",fontSize:14,fontWeight:on?700:500,
              background:on?t.tagOnBg:t.tagBg,color:on?t.tagOnText:t.tagText,
              border:on?"none":`1px solid ${t.pillBorder||t.border}`,borderRadius:t.rPill,cursor:"pointer",
              boxShadow:on?t.tagOnShadow:"none",fontFamily:t.fb,transition:"all 0.2s",
            }}>{c}</button>;
          })}
        </div>
        <div style={{marginTop:16}}><TagInput tags={profile.categories.filter(c=>!QUICK_CATS.includes(c))} setTags={custom=>up("categories",[...profile.categories.filter(c=>QUICK_CATS.includes(c)),...custom])} placeholder="Add custom topic\u2026" t={t}/></div>
      </div>
    )},
    {title:"Add companies & expertise",sub:"Personalize your brief further (optional).",content:(
      <div>
        <div style={{marginBottom:18}}>
          <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Companies <span style={{fontWeight:400,color:t.textMut}}>(optional)</span></label>
          <TagInput tags={profile.companies||[]} setTags={v=>up("companies",v)} placeholder="e.g. Microsoft, Stripe" t={t}/>
        </div>
        <div>
          <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Expertise <span style={{fontWeight:400,color:t.textMut}}>(optional)</span></label>
          <TagInput tags={profile.expertise||[]} setTags={v=>up("expertise",v)} placeholder="e.g. Machine Learning, M&A" t={t}/>
        </div>
      </div>
    )},
    {title:"Configure sources & settings",sub:"Fine-tune your news digest.",content:(
      <div>
        <div style={{marginBottom:18}}>
          <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Paywalled sources \u2014 select any to include</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
            {PAYWALLED.map(d=>{const on=(profile.paywalled_sources||[]).includes(d);return <button key={d} onClick={()=>up("paywalled_sources",on?(profile.paywalled_sources||[]).filter(x=>x!==d):[...(profile.paywalled_sources||[]),d])} style={{padding:"8px 12px",fontSize:13,fontWeight:on?700:500,background:on?t.tagOnBg:t.tagBg,color:on?t.tagOnText:t.tagText,border:on?"none":`1px solid ${t.pillBorder||t.border}`,borderRadius:t.rPill,cursor:"pointer",fontFamily:t.fb,transition:"all 0.15s"}}>{PAYWALLED_DISPLAY[d]||d}</button>;})}
          </div>
          <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Blocked sources <span style={{fontWeight:400,color:t.textMut}}>(domains to exclude)</span></label>
          <TagInput tags={profile.blocked_sources||[]} setTags={v=>up("blocked_sources",v)} placeholder="e.g. foxnews.com, dailymail.co.uk" t={t}/>
        </div>
        <div>
          <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Articles per section \u2014 <span style={{color:t.accentSolid}}>{profile.max_articles_per_section}</span></label>
          <input type="range" min={2} max={10} value={profile.max_articles_per_section} onChange={e=>up("max_articles_per_section",+e.target.value)} style={{width:"100%",accentColor:t.accentSolid}}/>
        </div>
      </div>
    )},
  ];
  const canNext=step===0?profile.categories.length>0:true;
  return <div style={{maxWidth:520,margin:"0 auto",animation:"fadeUp 0.5s ease-out"}}>
    <div style={{display:"flex",gap:6,marginBottom:32}}>
      {steps.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:6,background:i<=step?t.accentSolid:t.bgAlt,transition:"background 0.3s"}}/>)}
    </div>
    <div style={{fontSize:12,color:t.textMut,fontFamily:t.fb,marginBottom:8}}>Step {step+1} of {steps.length}</div>
    <h2 style={{fontFamily:t.fb,fontSize:22,fontWeight:700,color:t.text,margin:"0 0 6px"}}>{steps[step].title}</h2>
    <p style={{color:t.textMut,fontSize:14,margin:"0 0 28px",fontFamily:t.fb}}>{steps[step].sub}</p>
    {steps[step].content}
    <div style={{display:"flex",gap:10,marginTop:32}}>
      {step>0&&<button onClick={()=>setStep(step-1)} style={{padding:"12px 24px",fontSize:13,fontWeight:600,background:"transparent",color:t.textSec,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>Back</button>}
      {step===1&&<button onClick={()=>setStep(step+1)} style={{padding:"12px 24px",fontSize:13,fontWeight:600,background:"transparent",color:t.textMut,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>Skip</button>}
      <button onClick={()=>{if(step<steps.length-1)setStep(step+1);else onComplete();}} disabled={!canNext} style={{flex:1,padding:"13px 0",fontSize:14,fontWeight:700,background:canNext?t.accent:t.bgAlt,color:canNext?t.accentText:t.textFaint,border:"none",borderRadius:t.r,cursor:canNext?"pointer":"not-allowed",boxShadow:canNext?t.accentShadow:"none",fontFamily:t.fb,transition:"all 0.2s"}}>{step<steps.length-1?"Continue":"Generate My First Brief \u2192"}</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════
//  PROFILE SETTINGS
// ═══════════════════════════════════════════
function ProfileSettings({profile,setProfile,onGenerate,onSave,saving,t}){
  const up=(k,v)=>setProfile(p=>({...p,[k]:v}));
  return <div style={{maxWidth:580,margin:"0 auto",animation:"fadeUp 0.5s ease-out"}}>
    <h2 style={{fontFamily:t.fb,fontSize:22,fontWeight:700,color:t.text,margin:"0 0 6px"}}>Preferences</h2>
    <p style={{fontSize:14,color:t.textMut,margin:"0 0 28px",fontFamily:t.fb}}>Update your topics, companies, and settings.</p>

    <div style={{marginBottom:24}}>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:10,fontFamily:t.fb}}>Topics</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {QUICK_CATS.map(c=>{const on=profile.categories.includes(c);return <button key={c} onClick={()=>up("categories",on?profile.categories.filter(x=>x!==c):[...profile.categories,c])} style={{padding:"8px 16px",fontSize:13,fontWeight:on?700:500,background:on?t.tagOnBg:t.tagBg,color:on?t.tagOnText:t.tagText,border:on?"none":`1px solid ${t.pillBorder||t.border}`,borderRadius:t.rPill,cursor:"pointer",boxShadow:on?t.tagOnShadow:"none",fontFamily:t.fb,transition:"all 0.2s"}}>{c}</button>;})}
      </div>
      <TagInput tags={profile.categories.filter(c=>!QUICK_CATS.includes(c))} setTags={custom=>up("categories",[...profile.categories.filter(c=>QUICK_CATS.includes(c)),...custom])} placeholder="Add custom topic\u2026" t={t}/>
    </div>

    <div style={{marginBottom:24}}>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Companies <span style={{fontWeight:400,color:t.textMut}}>(optional)</span></label>
      <TagInput tags={profile.companies} setTags={v=>up("companies",v)} placeholder="e.g. Microsoft, Stripe" t={t}/>
    </div>

    <div style={{marginBottom:24}}>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Expertise <span style={{fontWeight:400,color:t.textMut}}>(optional)</span></label>
      <TagInput tags={profile.expertise} setTags={v=>up("expertise",v)} placeholder="e.g. Machine Learning, M&A" t={t}/>
    </div>

    <div style={{marginBottom:18}}>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Paywalled sources \u2014 select any to include</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
        {PAYWALLED.map(d=>{const on=(profile.paywalled_sources||[]).includes(d);return <button key={d} onClick={()=>setProfile(p=>({...p,paywalled_sources:on?(p.paywalled_sources||[]).filter(x=>x!==d):[...(p.paywalled_sources||[]),d]}))} style={{padding:"8px 12px",fontSize:13,fontWeight:on?700:500,background:on?t.tagOnBg:t.tagBg,color:on?t.tagOnText:t.tagText,border:on?"none":`1px solid ${t.pillBorder||t.border}`,borderRadius:t.rPill,cursor:"pointer",fontFamily:t.fb,transition:"all 0.15s"}}>{PAYWALLED_DISPLAY[d]||d}</button>;})}
      </div>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Blocked sources <span style={{fontWeight:400,color:t.textMut}}>(domains to exclude)</span></label>
      <TagInput tags={profile.blocked_sources||[]} setTags={v=>setProfile(p=>({...p,blocked_sources:v}))} placeholder="e.g. foxnews.com" t={t}/>
    </div>

    <div style={{marginBottom:32}}>
      <label style={{fontSize:13,fontWeight:700,color:t.textSec,display:"block",marginBottom:8,fontFamily:t.fb}}>Articles per section \u2014 <span style={{color:t.accentSolid}}>{profile.max_articles_per_section}</span></label>
      <input type="range" min={2} max={10} value={profile.max_articles_per_section} onChange={e=>up("max_articles_per_section",+e.target.value)} style={{width:"100%",accentColor:t.accentSolid}}/>
    </div>

    <div style={{display:"flex",gap:10}}>
      <button onClick={onSave} disabled={saving} style={{padding:"12px 24px",fontSize:13,fontWeight:600,background:"transparent",color:t.textSec,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>{saving?"Saving\u2026":"Save"}</button>
      <button onClick={onGenerate} disabled={profile.categories.length===0} style={{flex:1,padding:"13px 0",fontSize:14,fontWeight:700,background:profile.categories.length>0?t.accent:t.bgAlt,color:profile.categories.length>0?t.accentText:t.textFaint,border:"none",borderRadius:t.r,cursor:profile.categories.length>0?"pointer":"not-allowed",boxShadow:profile.categories.length>0?t.accentShadow:"none",fontFamily:t.fb,transition:"all 0.2s"}}>Generate Brief</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════
//  LOADING
// ═══════════════════════════════════════════
function GeneratingScreen({progress,stage,t}){
  return <div style={{maxWidth:580,margin:"0 auto",animation:"fadeUp 0.4s ease-out"}}>
    <div style={{textAlign:"center",marginBottom:32}}>
      <div style={{width:40,height:40,border:`2px solid ${t.spinnerTrack}`,borderTop:`2px solid ${t.spinner}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 20px"}}/>
      <div style={{color:t.textSec,fontSize:14,fontFamily:t.fb,marginBottom:12}}>{stage}</div>
      <div style={{width:220,height:4,background:t.bgAlt,borderRadius:2,overflow:"hidden",margin:"0 auto"}}>
        <div style={{width:`${progress}%`,height:"100%",background:t.accent,transition:"width 0.3s",borderRadius:2}}/>
      </div>
      <div style={{color:t.textMut,fontSize:12,fontFamily:t.fb,marginTop:8}}>{progress}%</div>
    </div>
    <div style={{opacity:0.5}}>
      <div style={{height:14,width:"40%",background:t.bgAlt,borderRadius:8,marginBottom:16}}/>
      <SkeletonCard t={t}/><SkeletonCard t={t}/><SkeletonCard t={t}/>
    </div>
  </div>;
}

// ═══════════════════════════════════════════
//  DIGEST VIEW
// ═══════════════════════════════════════════
function DigestView({digest,profile,onBack,onSettings,aiEnabled,t,session}){
  const sections=digest.sections||{};
  const sectionKeys=Object.keys(sections);
  const total=Object.values(sections).reduce((a,b)=>a+b.length,0);
  const[copied,setCopied]=useState(false);
  const[emailing,setEmailing]=useState(false);
  const[emailSent,setEmailSent]=useState(false);
  const copyDigest=()=>{navigator.clipboard.writeText(digestToText(sections)).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}).catch(()=>{});};
  const emailDigest=async()=>{setEmailing(true);try{const r=await fetch('/api/send-digest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:session?.user?.email,sections:sections,userName:session?.user?.email?.split('@')[0],generatedAt:digest.generated_at||new Date().toISOString()})});if(r.ok){setEmailSent(true);setTimeout(()=>setEmailSent(false),3000);}else{throw new Error('Failed to send');}}catch(e){console.error(e);alert('Failed to send email. Please try again.');}finally{setEmailing(false);}};
  const companyMentions=useMemo(()=>{const counts={};for(const arts of Object.values(sections)){for(const a of arts){const matches=matchesCompany(a,profile.companies);matches.forEach(c=>{counts[c]=(counts[c]||0)+1;});}}return counts;},[sections,profile.companies]);

  const SECTION_COLORS_LIGHT=["#c05020","#1a5276","#6b4c2a","#2a6b4c","#6b2a5a","#5a1a6b","#1a6b6b","#6b5a1a"];
  const SECTION_COLORS_DARK=["#00d4aa","#4da6ff","#d4a020","#20d480","#d45020","#a040d4","#20c4d4","#d4c020"];
  const isDark=t.bg.startsWith("#0a");
  const SECTION_COLORS=isDark?SECTION_COLORS_DARK:SECTION_COLORS_LIGHT;

  const leadSection=sectionKeys[0];
  const leadArticle=leadSection?(sections[leadSection]||[])[0]:null;
  const otherSections=sectionKeys.map((k,idx)=>({key:k,articles:(sections[k]||[]).slice(leadSection===k?1:0),index:idx})).filter(s=>s.articles.length>0);

  const titleColor=isDark?'#f0f0f0':'#1a1714';
  const summaryColor=isDark?'#f0f0f0':'#1a1714';
  const metaColor=isDark?'#f0f0f0':'#1a1714';

  return <div style={{maxWidth:980,margin:"0 auto",animation:"fadeUp 0.5s ease-out",fontFamily:`'Source Sans 3',${t.fb},sans-serif`}}>
    <style>{`
      .mb-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
      @media(max-width:600px){.mb-grid{grid-template-columns:1fr;}}
    `}</style>

    <div style={{position:"relative"}}>
      <div style={{textAlign:"center",paddingBottom:18,borderBottom:`3px double ${t.border}`,marginBottom:18}}>
        <div style={{fontVariant:"small-caps",color:metaColor,fontSize:13,letterSpacing:1}}>{todayStr()} \u00b7 {total} articles \u00b7 {sectionKeys.length} sections</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:400,margin:"8px 0",color:titleColor}}>The Morning Brief</div>
        <div style={{fontVariant:"small-caps",color:metaColor,fontSize:13}}>Your personalized daily intelligence</div>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginTop:14}}>
          {sectionKeys.map((s,i)=>{const sc=SECTION_COLORS[i%SECTION_COLORS.length];return <span key={s} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:sc}}>
            <span style={{width:8,height:8,borderRadius:2,background:sc}}/>{s}
          </span>;})}
        </div>
      </div>
      <div style={{position:"absolute",right:12,top:8,display:"flex",gap:8}}>
        <button onClick={emailDigest} disabled={emailing} style={{padding:"6px 10px",fontSize:12,background:emailSent?t.successBg:"transparent",color:emailSent?t.successText:t.textSec,border:`1px solid ${t.pillBorder||t.border}`,borderRadius:6,cursor:emailing?"wait":"pointer",fontFamily:t.fb}}>{emailSent?"\u2713 Emailed":emailing?"Sending\u2026":"Email This"}</button>
        <button onClick={copyDigest} style={{padding:"6px 10px",fontSize:12,background:copied?t.successBg:"transparent",color:copied?t.successText:t.textSec,border:`1px solid ${t.pillBorder||t.border}`,borderRadius:6,cursor:"pointer",fontFamily:t.fb}}>{copied?"\u2713 Copied":"Copy"}</button>
        <button onClick={onSettings} style={{padding:"6px 10px",fontSize:12,background:"transparent",color:t.textSec,border:`1px solid ${t.pillBorder||t.border}`,borderRadius:6,cursor:"pointer",fontFamily:t.fb}}>Settings</button>
      </div>
    </div>

    {leadArticle&&(()=>{
      const lc=matchesCompany(leadArticle,profile.companies);
      return <div style={{margin:"20px 0 28px",paddingBottom:18,borderBottom:`1px solid ${t.border}`}}>
        {lc.length>0&&<div style={{fontSize:11,fontWeight:700,color:t.alertText,textTransform:"uppercase",marginBottom:6}}>{"\u26a1"} {lc[0]}</div>}
        <a href={leadArticle.link} target="_blank" rel="noopener noreferrer" style={{fontFamily:"'Playfair Display',serif",fontSize:26,fontWeight:500,color:titleColor,marginBottom:12,textDecoration:"none",display:"block"}}>{leadArticle.title}</a>
        {leadArticle.summary&&<div style={{fontFamily:`'Source Sans 3',${t.fb},sans-serif`,fontSize:15,color:summaryColor,lineHeight:1.7,marginBottom:12}}>{leadArticle.summary}</div>}
        <div style={{fontSize:12,color:metaColor}}>{leadArticle.source}{leadArticle.pubDate?` \u00b7 ${fmtDate(leadArticle.pubDate)}`:""}{isQualitySource(leadArticle.link)?<span style={{marginLeft:8,color:t.qualityText}}>{"\u2726"} Quality source</span>:""}{isPaywalled(leadArticle.link)?<span style={{marginLeft:8,color:t.paywallText}}>{"\u25c6"} paywall</span>:""}</div>
      </div>;
    })()}

    <div className="mb-grid">
      {otherSections.map((sec)=>{
        const color=SECTION_COLORS[sec.index%SECTION_COLORS.length];
        return <div key={sec.key}>
          <div style={{fontVariant:"small-caps",fontSize:12,fontWeight:700,padding:"8px 10px",marginBottom:8,borderBottom:`2px solid ${color}`,color:color}}>{sec.key}</div>
          {sec.articles.map((a,ai)=>{
            const companies=matchesCompany(a,profile.companies);
            return <div key={ai} style={{padding:"8px 6px",borderBottom:`1px solid ${t.border}`}}>
              {companies.length>0&&<div style={{fontSize:11,fontWeight:700,color:t.alertText,textTransform:"uppercase",marginBottom:6}}>{"\u26a1"} {companies[0]}</div>}
              <a href={a.link} target="_blank" rel="noopener noreferrer" style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:500,color:titleColor,marginBottom:6,textDecoration:"none",display:"block"}}>{a.title}</a>
              {a.summary&&<div style={{fontFamily:`'Source Sans 3',${t.fb},sans-serif`,fontSize:13,color:summaryColor,lineHeight:1.7,marginBottom:8}}>{a.summary}</div>}
              <div style={{fontSize:10,color:metaColor}}>{a.source}{a.pubDate?` \u00b7 ${fmtDate(a.pubDate)}`:""}{isQualitySource(a.link)?<span style={{marginLeft:8,color:t.qualityText}}>{"\u2726"}</span>:""}{isPaywalled(a.link)?<span style={{marginLeft:8,color:t.paywallText}}>{"\u25c6"}</span>:""}</div>
            </div>;
          })}
        </div>;
      })}
    </div>

    <div style={{textAlign:"center",paddingTop:18,borderTop:`3px double ${t.border}`,marginTop:28,color:t.textMut,fontSize:13}}>End of morning brief \u00b7 Generated by AI</div>
    <div style={{marginTop:18}}>
      <button onClick={onBack} style={{padding:"10px 16px",fontSize:13,fontWeight:600,background:"transparent",color:t.textSec,border:`2px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>{"\u2190"} Back</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════
//  DIGEST HISTORY
// ═══════════════════════════════════════════
function DigestHistory({digests,onView,onClear,t}){
  if(!digests.length)return null;
  return <div style={{maxWidth:580,margin:"20px auto 0"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <h3 style={{fontFamily:t.fb,fontSize:16,fontWeight:700,color:t.text,margin:0}}>Past Briefs</h3>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {digests.slice(0,5).map((d,i)=>(
        <button key={i} onClick={()=>onView(d)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:t.bgCard,border:`1px solid ${t.pillBorder||t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb,fontSize:13,color:t.textSec,boxShadow:t.cardShadow,textAlign:"left"}}>
          <span>{fmtDate(d.generated_at)}{d.generated_at&&" \u00b7 "+fmtTime(d.generated_at)}</span>
          <span style={{color:t.textMut}}>{d.article_count} articles \u2192</span>
        </button>
      ))}
    </div>
  </div>;
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function Dashboard({profile,onGenerate,onSettings,digests,onViewDigest,t}){
  return <div style={{maxWidth:580,margin:"0 auto",animation:"fadeUp 0.5s ease-out"}}>
    <div style={{marginBottom:28}}>
      <h2 style={{fontFamily:t.fb,fontSize:24,fontWeight:700,color:t.text,margin:"0 0 6px"}}>Good morning</h2>
      <p style={{color:t.textMut,fontSize:14,margin:0,fontFamily:t.fb}}>{todayStr()}</p>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:28}}>
      {[{label:"Topics",value:profile.categories.length},{label:"Companies",value:profile.companies.length},{label:"Per section",value:profile.max_articles_per_section}].map(s=>(
        <div key={s.label} style={{padding:"16px",background:t.bgCard,border:`1px solid ${t.border}`,borderRadius:t.r,textAlign:"center",boxShadow:t.cardShadow}}>
          <div style={{fontSize:24,fontWeight:700,color:t.accentSolid,fontFamily:t.fd}}>{s.value}</div>
          <div style={{fontSize:11,color:t.textMut,fontFamily:t.fb,marginTop:4,textTransform:"uppercase",letterSpacing:1}}>{s.label}</div>
        </div>
      ))}
    </div>
    <div style={{marginBottom:24}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {profile.categories.map(c=><span key={c} style={{padding:"5px 12px",fontSize:12,fontWeight:600,background:t.accentBg,color:t.accentSolid,borderRadius:t.rPill,fontFamily:t.fb}}>{c}</span>)}
        {profile.companies.map(c=><span key={c} style={{padding:"5px 12px",fontSize:12,fontWeight:600,background:t.alertBg,color:t.alertText,borderRadius:t.rPill,fontFamily:t.fb}}>{c}</span>)}
      </div>
    </div>
    <button onClick={onGenerate} style={{width:"100%",padding:"16px 0",fontSize:15,fontWeight:700,background:t.accent,color:t.accentText,border:"none",borderRadius:t.r,cursor:"pointer",boxShadow:t.accentShadow,fontFamily:t.fb,marginBottom:10}}>Generate Today's Brief</button>
    <button onClick={onSettings} style={{width:"100%",padding:"12px 0",fontSize:13,fontWeight:600,background:"transparent",color:t.textSec,border:`2px solid ${t.border}`,borderRadius:t.r,cursor:"pointer",fontFamily:t.fb}}>Edit Preferences</button>
    <DigestHistory digests={digests} onView={onViewDigest} t={t}/>
  </div>;
}

// ═══════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════
export default function App(){
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const skipLogin = typeof window !== "undefined" && (params.get("skip_login") === "1" || localStorage.getItem("mb_skip_auth") === "1");
  const skipTarget = params.get("skip_to") || "dashboard"; // use ?skip_to=settings to open Preferences
  const[dark,setDark]=useState(()=>{try{return localStorage.getItem("mb_theme")==="dark";}catch{return false;}});
  const t=dark?themes.dark:themes.light;
  useEffect(()=>{try{localStorage.setItem("mb_theme",dark?"dark":"light");}catch{}},[dark]);

  const[view,setView]=useState(skipLogin?skipTarget:"loading");
  const[session,setSession]=useState(skipLogin?{access_token:"",refresh_token:"",user:{id:"dev",email:"dev@example.com"}}:null);
  const[profile,setProfile]=useState(skipLogin?{...DEFAULT_PROFILE}:{...DEFAULT_PROFILE});
  const[digest,setDigest]=useState(null);
  const[allDigests,setAllDigests]=useState([]);
  const[progress,setProgress]=useState(0);
  const[stage,setStage]=useState("");
  const[error,setError]=useState(null);
  const[saving,setSaving]=useState(false);
  const[aiEnabled,setAiEnabled]=useState(false);
  const[isNewUser,setIsNewUser]=useState(false);

  const loadUserData=useCallback(async(at,uid)=>{
    const rows=await dbApi.select("profiles",at,{id:uid});
    if(rows.length>0){
      const p=rows[0];
      setProfile({categories:p.categories||["Technology","Business"],expertise:p.expertise||[],companies:p.companies||[],paywalled_sources:p.paywalled_sources||[],blocked_sources:p.blocked_sources||[],max_articles_per_section:p.max_articles_per_section||5,summary_style:p.summary_style||"brief"});
      setIsNewUser(false);
    }else{setIsNewUser(true);}
    const digs=await dbApi.select("digests",at,{user_id:uid});
    if(digs.length>0)setAllDigests(digs.sort((a,b)=>new Date(b.generated_at)-new Date(a.generated_at)));
  },[]);

  useEffect(()=>{
    const init=async()=>{
      if(skipLogin){ setView(skipTarget); return; }
      const ht=parseHashTokens();
      if(ht){const u=await authApi.getUser(ht.access_token);if(u){const s={access_token:ht.access_token,refresh_token:ht.refresh_token,user:u};saveSession(s);setSession(s);await loadUserData(s.access_token,s.user.id);setView(null);return;}}
      const saved=loadSession();
      if(saved){
        let u=await authApi.getUser(saved.access_token);
        if(u){setSession({...saved,user:u});await loadUserData(saved.access_token,u.id);setView(null);return;}
        const ref=await authApi.refreshSession(saved.refresh_token);
        if(ref?.access_token){u=await authApi.getUser(ref.access_token);if(u){const s={access_token:ref.access_token,refresh_token:ref.refresh_token,user:u};saveSession(s);setSession(s);await loadUserData(s.access_token,u.id);setView(null);return;}}
        clearSession();
      }
      setView("auth");
    };
    init();
  },[loadUserData]);

  useEffect(()=>{if(view===null&&session){setView(isNewUser?"onboarding":"dashboard");}},[view,session,isNewUser]);

  const saveProfileToDb=useCallback(async()=>{
    if(!session)return;setSaving(true);
    try{await dbApi.upsert("profiles",{id:session.user.id,...profile,updated_at:new Date().toISOString()},session.access_token);}catch(e){console.error(e);}
    setSaving(false);
  },[session,profile]);

  const onboardingComplete=useCallback(async()=>{
    if(!session)return;
    try{await dbApi.upsert("profiles",{id:session.user.id,...profile,updated_at:new Date().toISOString()},session.access_token);}catch(e){console.error(e);}
    setIsNewUser(false);generate();
  },[session,profile]);

  const generate=useCallback(async()=>{
    if(!session)return;
    setView("generating");setProgress(0);setError(null);
    try{
      const queries={};
      for(const c of profile.categories)queries[c]=c;
      for(const e of profile.expertise)queries[`${e}`]=`${e} latest`;
      for(const c of profile.companies)queries[`${c}`]=`"${c}" news`;

      setStage("Fetching articles from "+Object.keys(queries).length+" sources\u2026");
      const sections={};
      const entries=Object.entries(queries);
      for(let i=0;i<entries.length;i++){
        const[label,q]=entries[i];
        let arts=await fetchRSS(q);
        const blocked=(profile.blocked_sources||[]).map(s=>s.toLowerCase());
        const allowedPay=(profile.paywalled_sources||[]).map(s=>s.toLowerCase());
        arts=arts.filter(a=>{
          const d=extractDomain(a.link).toLowerCase();
          if(blocked.some(b=>d.includes(b)||a.link.toLowerCase().includes(b)))return false;
          if(isPaywalled(a.link)){return allowedPay.some(p=>d.includes(p));}
          return true;
        });
        arts=dedup(arts);arts=rankArticles(arts);
        sections[label]=arts.slice(0,profile.max_articles_per_section);
        setProgress(Math.round(((i+1)/entries.length)*40));
      }
      for(const k of Object.keys(sections))if(!sections[k].length)delete sections[k];
      if(!Object.keys(sections).length){setError("No articles found. Try adding more topics.");setView("dashboard");return;}

      const globalSeen=new Set();
      for(const[label,arts]of Object.entries(sections)){
        sections[label]=arts.filter(a=>{
          const norm=a.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,50);
          if(globalSeen.has(norm))return false;
          for(const s of globalSeen){if(norm.startsWith(s.slice(0,35))||s.startsWith(norm.slice(0,35)))return false;}
          globalSeen.add(norm);return true;
        });
        if(!sections[label].length)delete sections[label];
      }

      setStage("Generating AI summaries\u2026");
      const result={};const sEntries=Object.entries(sections);let done=0;
      for(const[label,arts]of sEntries){
        const sums=await summarizeArticles(arts,profile.summary_style,profile.expertise,profile.companies);
        result[label]=arts.map((a,i)=>{const s=sums.find(s=>s.index===i)||{};return{...a,summary:s.summary===null?null:(s.summary||a.description),relevance:s.relevance||null};});
        done++;setProgress(40+Math.round((done/sEntries.length)*55));
      }

      const first=Object.values(result)[0]?.[0];
      setAiEnabled(first?.summary&&first.summary!==first.description);
      const count=Object.values(result).reduce((a,b)=>a+b.length,0);

      setStage("Saving digest\u2026");setProgress(96);
      try{await dbApi.insert("digests",{user_id:session.user.id,sections:result,article_count:count},session.access_token);}catch(e){console.warn(e);}

      setDigest({sections:result,article_count:count,generated_at:new Date().toISOString()});
      setAllDigests(prev=>[{sections:result,article_count:count,generated_at:new Date().toISOString()},...prev]);
      setProgress(100);setView("digest");
    }catch(e){console.error(e);setError(`Failed: ${e.message}`);setView("dashboard");}
  },[session,profile]);

  const signOut=useCallback(async()=>{
    if(session)await authApi.signOut(session.access_token);
    clearSession();setSession(null);setProfile(DEFAULT_PROFILE);setDigest(null);setAllDigests([]);setView("auth");
  },[session]);

  const viewHistoricDigest=(d)=>{setDigest(d);setAiEnabled(true);setView("digest");};

  return <div style={{minHeight:"100vh",background:t.bg,color:t.text,fontFamily:t.fb,padding:"28px 20px 60px",transition:"background 0.3s,color 0.3s"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;700&family=Source+Sans+3:wght@300;400;500;600;700&family=Nunito+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap');
      @keyframes spin{to{transform:rotate(360deg);}}
      @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
      @keyframes pulse{0%,100%{opacity:0.4;}50%{opacity:0.7;}}
      ::selection{background:${dark?"rgba(0,212,170,0.25)":"rgba(238,90,36,0.2)"};color:${dark?"#fff":"#000"};}
      input::placeholder{color:${t.textFaint} !important;}
      input:focus{border-color:${t.borderFocus} !important;}
      *{box-sizing:border-box;}
      @media(max-width:600px){h1{font-size:22px !important;}h2{font-size:20px !important;}}
    `}</style>

    {session&&!["auth","loading","onboarding"].includes(view)&&(
      <div style={{maxWidth:680,margin:"0 auto 24px",display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:12,borderBottom:`1px solid ${t.border}`,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,borderRadius:t.logoR,background:t.logoBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:t.accentText}}>{t.logo}</div>
          <span style={{fontFamily:t.fd,fontSize:14,fontWeight:700,color:t.text}}>Morning Brief</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <ThemeToggle dark={dark} setDark={setDark} t={t}/>
          <span style={{fontSize:12,color:t.text,fontFamily:t.fb,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.user.email}</span>
          <button onClick={signOut} style={{background:"transparent",border:"none",color:t.accentSolid,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:t.fb}}>Sign Out</button>
        </div>
      </div>
    )}

    {view==="loading"&&<div style={{display:"flex",justifyContent:"center",paddingTop:120}}><div style={{width:32,height:32,border:`2px solid ${t.spinnerTrack}`,borderTop:`2px solid ${t.spinner}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/></div>}

    {error&&["dashboard","settings"].includes(view)&&(
      <div style={{maxWidth:580,margin:"0 auto 20px",padding:"12px 16px",background:t.errBg,border:`1px solid ${t.errBorder}`,borderRadius:t.r,color:t.errText,fontSize:13,fontFamily:t.fb,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {error}<button onClick={()=>setError(null)} style={{background:"transparent",border:"none",color:t.errText,cursor:"pointer",fontSize:16,padding:0}}>{"\u00d7"}</button>
      </div>
    )}

    {view==="auth"&&<AuthScreen t={t} dark={dark} setDark={setDark}/>}
    {view==="onboarding"&&<Onboarding profile={profile} setProfile={setProfile} onComplete={onboardingComplete} t={t}/>}
    {view==="dashboard"&&<Dashboard profile={profile} onGenerate={generate} onSettings={()=>setView("settings")} digests={allDigests} onViewDigest={viewHistoricDigest} t={t}/>}
    {view==="settings"&&<ProfileSettings profile={profile} setProfile={setProfile} onGenerate={generate} onSave={saveProfileToDb} saving={saving} t={t}/>}
    {view==="generating"&&<GeneratingScreen progress={progress} stage={stage} t={t}/>}
    {view==="digest"&&digest&&<DigestView digest={digest} profile={profile} onBack={()=>setView("dashboard")} onSettings={()=>setView("settings")} aiEnabled={aiEnabled} t={t} session={session}/>}
  </div>;
}
