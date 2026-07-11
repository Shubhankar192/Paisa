// Paisa — all React components.
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as RC from "recharts";
import {
  APP_VERSION, INR, INR2, titleCase, CATEGORIES, NONSPEND, colorFor, detectSub,
  monthKey, monthlyFinancials, resolveIncome, monthMetrics, savingsRate, monthLabel,
  parseCSV, rowsToTxns,
  EMPTY_PORTFOLIO, sanitizePortfolio, parseHoldingsRows, mergePortfolio,
  SUPABASE_READY, sb, Cloud, DEFAULTS, sanitizeTxns, loadLocal, saveLocal,
  computeDecisionInsights, fetchLiveNAVs,
} from "./lib.js";

const MASCOT=import.meta.env.BASE_URL+"mascot.svg";

/* ---------------- Auth screen ---------------- */
function Auth({onAuthed}){
  const [mode,setMode]=useState("signin"); // signin | signup
  const [email,setEmail]=useState(""); const [pw,setPw]=useState("");
  const [busy,setBusy]=useState(false); const [msg,setMsg]=useState(""); const [err,setErr]=useState("");

  const submit=async()=>{
    setErr(""); setMsg(""); 
    if(!email||!pw){setErr("Enter email and password.");return;}
    if(pw.length<6){setErr("Password must be at least 6 characters.");return;}
    setBusy(true);
    try{
      if(mode==="signup"){
        const {data,error}=await sb.auth.signUp({email,password:pw});
        if(error)throw error;
        if(data.user && !data.session){ setMsg("Check your email to confirm your account, then sign in."); setMode("signin"); }
        else if(data.session){ onAuthed(data.session.user); }
      }else{
        const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
        if(error)throw error;
        onAuthed(data.user);
      }
    }catch(e){ setErr(e.message||"Authentication failed."); }
    setBusy(false);
  };

  const google=async()=>{
    setErr("");
    try{
      const {error}=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.href.split("#")[0]}});
      if(error)throw error;
    }catch(e){ setErr(e.message||"Google sign-in failed."); }
  };

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",padding:20}}>
      <div className="aurora"><b className="a1"/><b className="a2"/><b className="a3"/></div>
      <div className="glass fade" style={{position:"relative",zIndex:1,width:"100%",maxWidth:400,padding:30}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div className="brand" style={{justifyContent:"center"}}>
            <span className="brand-badge" style={{width:46,height:46,borderRadius:14,fontSize:25}}>₹</span>
            <span className="brand-word" style={{fontSize:33}}>paisa</span>
          </div>
          <div style={{fontSize:13,color:"var(--txt3)",marginTop:10}}>{mode==="signin"?"Welcome back":"Create your account"}</div>
        </div>

        <button className="chip" onClick={google} style={{width:"100%",background:"#fff",color:"#101828",border:"1px solid var(--line2)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:14,padding:"12px"}}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z"/><path fill="#FBBC05" d="M10.3 28.4c-.5-1.5-.8-3.1-.8-4.4s.3-3 .8-4.4l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.6l7.8-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6.2C6.4 42.6 14.6 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 16px"}}>
          <div style={{flex:1,height:1,background:"var(--line)"}}/><span style={{fontSize:11,color:"var(--txt3)"}}>or email</span><div style={{flex:1,height:1,background:"var(--line)"}}/>
        </div>

        <input className="inp" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={{marginBottom:10}}/>
        <input className="inp" type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&submit()} style={{marginBottom:14}}/>

        {err&&<div style={{padding:"10px 13px",background:"rgba(217,45,32,.12)",color:"#D92D20",borderRadius:10,fontSize:13,marginBottom:12}}>{err}</div>}
        {msg&&<div style={{padding:"10px 13px",background:"rgba(7,148,85,.12)",color:"#079455",borderRadius:10,fontSize:13,marginBottom:12}}>{msg}</div>}

        <button className="chip primary" onClick={submit} disabled={busy} style={{width:"100%",padding:"12px",opacity:busy?.6:1}}>
          {busy?"Please wait…":(mode==="signin"?"Sign in":"Create account")}
        </button>

        <div style={{textAlign:"center",marginTop:16,fontSize:13,color:"var(--txt3)"}}>
          {mode==="signin"?"New here? ":"Already have an account? "}
          <span style={{color:"var(--accent2)",cursor:"pointer",fontWeight:600}}
            onClick={()=>{setMode(mode==="signin"?"signup":"signin");setErr("");setMsg("");}}>
            {mode==="signin"?"Create account":"Sign in"}
          </span>
        </div>
      </div>
    </div>
  );
}



/* ---------------- app ---------------- */
/* ---------------- Tracker (main app, data comes from parent) ---------------- */
/* ============================================================
   INSIGHTS ENGINE
   Pure analysis over all transactions -> ranked insight cards.
   ============================================================ */
function computeInsights(txns, fin, income){
  const ins=[];
  const months=[...new Set(txns.map(t=>monthKey(t.date)))].sort();
  if(months.length===0) return ins;
  const cur=months[months.length-1];
  const prev=months.length>1?months[months.length-2]:null;
  const N=(o)=>o||0;

  const spendOf=(mk)=>monthMetrics(txns,mk).spend;
  const catOf=(mk)=>monthMetrics(txns,mk).byCat;

  const curM=monthMetrics(txns,cur);
  const curSpend=curM.spend;
  const avgSpend=months.length>1?months.slice(0,-1).reduce((a,m)=>a+spendOf(m),0)/(months.length-1):curSpend;
  const curCats=curM.byCat, prevCats=prev?catOf(prev):{};

  const f=fin[cur]||{income:0}; const incVal=resolveIncome(income,fin,cur);
  const inv=curM.invest+curM.savings;
  const rate=savingsRate(incVal,curSpend);
  ins.push({id:"rate",tier:1,icon:"◈",tone:rate>=30?"good":rate>=15?"neutral":"warn",
    title:"Savings rate",value:rate+"%",
    body:rate>=30?`Strong. You're channeling ${rate}% of income into savings & investments this month.`:
         rate>=15?`Decent — ${rate}% saved. Pushing past 30% would accelerate your goal.`:
         `Only ${rate}% saved this month. Worth a look at the movers below.`});

  if(months.length>1){
    const diff=curSpend-avgSpend; const pct=avgSpend>0?Math.round(diff/avgSpend*100):0;
    ins.push({id:"vsavg",tier:1,icon:pct>0?"▲":"▼",tone:pct>15?"bad":pct< -10?"good":"neutral",
      title:"Spending vs your average",value:(pct>=0?"+":"")+pct+"%",
      body:pct>15?`You spent ${INR(Math.abs(diff))} more than your ${months.length-1}-month average. See which categories below.`:
           pct< -10?`Nicely under budget — ${INR(Math.abs(diff))} below your usual monthly spend.`:
           `Right around your typical monthly spend (${INR(avgSpend)}).`});
  }

  if(prev){
    const movers=Object.keys({...curCats,...prevCats}).map(c=>({c,diff:N(curCats[c])-N(prevCats[c])}))
      .filter(x=>Math.abs(x.diff)>200).sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff));
    if(movers[0]){const m=movers[0];const base=N(prevCats[m.c]);const pct=base>0?Math.round(m.diff/base*100):100;
      ins.push({id:"mover",tier:2,icon:m.diff>0?"📈":"📉",tone:m.diff>0?"warn":"good",
        title:`${m.c} ${m.diff>0?"jumped":"dropped"}`,value:(m.diff>0?"+":"−")+INR(Math.abs(m.diff)),
        body:`${m.c} went from ${INR(base)} to ${INR(N(curCats[m.c]))} vs last month${base>0?` (${pct>0?"+":""}${pct}%)`:""}.`});}
  }

  const topCat=Object.entries(curCats).sort((a,b)=>b[1]-a[1])[0];
  if(topCat){ins.push({id:"top",tier:2,icon:"🏷️",tone:"neutral",title:"Biggest category",value:INR(topCat[1]),
    body:`${topCat[0]} is your largest spend this month — ${curSpend>0?Math.round(topCat[1]/curSpend*100):0}% of total spending.`});}

  const curTxns=txns.filter(t=>monthKey(t.date)===cur&&t.amount<0&&!NONSPEND.has(t.category)).map(t=>({...t,abs:-t.amount}));
  if(curTxns.length>3){
    const mean=curTxns.reduce((a,t)=>a+t.abs,0)/curTxns.length;
    const big=curTxns.sort((a,b)=>b.abs-a.abs)[0];
    if(big.abs>mean*4&&big.abs>2000){ins.push({id:"anom",tier:2,icon:"⚡",tone:"warn",title:"Large transaction",value:INR(big.abs),
      body:`${big.merchant} (${big.note||big.category}) on ${big.date.slice(8)}/${big.date.slice(5,7)} — well above your typical ${INR(mean)} transaction.`});}
  }

  const subs=txns.filter(t=>t.category==="Subscriptions"&&t.amount<0);
  if(subs.length){const subMonths=new Set(subs.map(t=>monthKey(t.date))).size;
    const subTotal=subs.reduce((a,t)=>a+(-t.amount),0);const perMonth=subTotal/Math.max(1,subMonths);
    ins.push({id:"subs",tier:3,icon:"🔁",tone:"neutral",title:"Subscriptions run-rate",value:INR(perMonth)+"/mo",
      body:`Recurring services cost about ${INR(perMonth*12)} a year. Trim one you don't use and it compounds.`});}

  const balMonths=months.filter(m=>fin[m]&&typeof fin[m].closing==="number");
  if(balMonths.length>=3){
    const first=fin[balMonths[0]].closing, last=fin[balMonths[balMonths.length-1]].closing;
    const growth=last-first; const perMonth=growth/(balMonths.length-1);
    ins.push({id:"traj",tier:1,icon:"🚀",tone:perMonth>0?"good":"warn",
      title:"Balance trajectory",value:(perMonth>=0?"+":"−")+INR(Math.abs(perMonth))+"/mo",
      body:perMonth>0?`Your balance grew ${INR(growth)} over ${balMonths.length} months — about ${INR(perMonth)}/month. At this pace you'll add ${INR(perMonth*12)} in a year.`:
        `Your balance dipped over this period. Worth checking the high-spend months.`,
      spark:balMonths.map(m=>fin[m].closing)});
  }

  if(months.length>2){
    const ranked=months.map(m=>({m,s:spendOf(m)})).sort((a,b)=>a.s-b.s);
    ins.push({id:"best",tier:3,icon:"🏆",tone:"good",title:"Leanest month",value:monthLabel(ranked[0].m),
      body:`${monthLabel(ranked[0].m)} was your lowest-spend month at ${INR(ranked[0].s)}. ${monthLabel(ranked[ranked.length-1].m)} was highest at ${INR(ranked[ranked.length-1].s)}.`});
  }

  const today=new Date(); const liveMk=today.toISOString().slice(0,7);
  if(cur===liveMk){
    const day=today.getDate(); const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
    const burn=curSpend/day; const projected=burn*daysInMonth;
    ins.push({id:"burn",tier:2,icon:"🔥",tone:projected>avgSpend*1.1?"warn":"neutral",title:"Projected month-end spend",value:INR(projected),
      body:`At ${INR(burn)}/day so far, you're on track for ${INR(projected)} by month-end${avgSpend>0?` vs your ${INR(avgSpend)} average`:""}.`});
  }

  let we=0,wd=0,wec=0,wdc=0;
  txns.filter(t=>monthKey(t.date)===cur&&t.amount<0&&!NONSPEND.has(t.category)).forEach(t=>{
    const d=new Date(t.date).getDay(); if(d===0||d===6){we+=-t.amount;wec++;}else{wd+=-t.amount;wdc++;}});
  if(wec>0&&wdc>0){const weAvg=we/wec,wdAvg=wd/wdc;
    if(weAvg>wdAvg*1.3)ins.push({id:"weekend",tier:3,icon:"🎉",tone:"neutral",title:"Weekend spender",value:INR(weAvg)+"/txn",
      body:`Your weekend transactions average ${INR(weAvg)} vs ${INR(wdAvg)} on weekdays — the fun adds up.`});}

  const toneRank={bad:0,warn:1,good:2,neutral:3};
  return ins.sort((a,b)=>a.tier-b.tier || toneRank[a.tone]-toneRank[b.tone]);
}

/* ---------------- Insights dashboard ---------------- */
function Sparkline({data,color}){
  if(!data||data.length<2)return null;
  const w=120,h=34,min=Math.min(...data),max=Math.max(...data),rng=max-min||1;
  const pts=data.map((v,i)=>`${(i/(data.length-1))*w},${h-((v-min)/rng)*h}`).join(" ");
  return (
    <svg width={w} height={h} style={{display:"block"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={w} cy={h-((data[data.length-1]-min)/rng)*h} r="3" fill={color}/>
    </svg>
  );
}

function HealthRing({score}){
  const r=54,c=2*Math.PI*r,off=c-(score/100)*c;
  const col=score>=70?"#079455":score>=45?"#DC6803":"#D92D20";
  return (
    <div style={{position:"relative",width:140,height:140,flexShrink:0}}>
      <svg width="140" height="140" style={{transform:"rotate(-90deg)"}}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#EEF1F5" strokeWidth="11"/>
        <circle cx="70" cy="70" r={r} fill="none" stroke={col} strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{transition:"stroke-dashoffset 1s cubic-bezier(.2,.7,.3,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontFamily:"Inter, sans-serif",fontSize:38,fontWeight:700,color:col,lineHeight:1}}>{score}</div>
        <div style={{fontSize:10,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:1}}>health</div>
      </div>
    </div>
  );
}

function computeHealth(txns,fin,income){
  const months=[...new Set(txns.map(t=>monthKey(t.date)))].sort();
  if(!months.length)return{score:50,label:"—"};
  const cur=months[months.length-1]; const incVal=resolveIncome(income,fin,cur);
  const hm=monthMetrics(txns,cur); const spend=hm.spend;
  const rate=savingsRate(incVal,spend)/100;
  let sc=0;
  sc+=Math.min(45,rate*100*1.5);
  if(months.length>1){const avg=months.slice(0,-1).reduce((a,m)=>a+monthMetrics(txns,m).spend,0)/(months.length-1);
    const dev=avg>0?Math.abs(spend-avg)/avg:0; sc+=Math.max(0,25-dev*40);}else sc+=15;
  const bm=months.filter(m=>fin[m]&&typeof fin[m].closing==="number");
  if(bm.length>=2){const g=fin[bm[bm.length-1]].closing-fin[bm[0]].closing; sc+=g>0?30:5;}else sc+=15;
  const score=Math.max(5,Math.min(99,Math.round(sc)));
  const label=score>=70?"Excellent":score>=55?"Healthy":score>=40?"Fair":"Needs attention";
  return{score,label};
}

const TONE={good:{bg:"rgba(7,148,85,.10)",bd:"rgba(7,148,85,.30)",c:"#079455"},
  warn:{bg:"rgba(220,104,3,.10)",bd:"rgba(220,104,3,.30)",c:"#DC6803"},
  bad:{bg:"rgba(217,45,32,.10)",bd:"rgba(217,45,32,.30)",c:"#D92D20"},
  neutral:{bg:"rgba(7,148,85,.08)",bd:"rgba(7,148,85,.22)",c:"#079455"}};

function Insights({txns,fin,income,setTab}){
  const insights=useMemo(()=>computeInsights(txns,fin,income),[txns,fin,income]);
  const health=useMemo(()=>computeHealth(txns,fin,income),[txns,fin,income]);
  const months=[...new Set(txns.map(t=>monthKey(t.date)))].sort();
  const heat=months.slice(-12).map(m=>({m,s:monthMetrics(txns,m).spend}));
  const maxHeat=Math.max(...heat.map(h=>h.s),1);

  if(txns.length===0)return (
    <div className="glass fade" style={{padding:40,textAlign:"center"}}>
      <img src={MASCOT} alt="Paisa mascot" width="96" height="96" style={{display:"block",margin:"0 auto"}}/>
      <h3 style={{fontFamily:"Inter, sans-serif",marginTop:10}}>No insights yet</h3>
      <p style={{color:"var(--txt2)",fontSize:14}}>Import a statement and your personalized financial intelligence appears here.</p>
      <button className="chip primary" style={{marginTop:8}} onClick={()=>setTab("import")}>↑ Import a statement</button>
    </div>
  );

  return (
    <div className="fade">
      <div className="glass hero-card" style={{padding:26,marginBottom:18,display:"flex",gap:26,alignItems:"center",flexWrap:"wrap",
        background:"linear-gradient(135deg,rgba(7,148,85,.16),rgba(14,147,132,.07))",border:"1px solid rgba(7,148,85,.22)"}}>
        <HealthRing score={health.score}/>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontSize:12,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:1.2}}>Financial health</div>
          <div style={{fontFamily:"Inter, sans-serif",fontSize:30,fontWeight:800,letterSpacing:-.5,margin:"2px 0 6px"}}>{health.label}</div>
          <p style={{fontSize:13.5,color:"var(--txt2)",lineHeight:1.6,margin:0,maxWidth:460}}>
            A blend of your savings rate, spending consistency and balance growth. {months.length} month{months.length>1?"s":""} analyzed —
            every card below is computed from your real transactions.
          </p>
        </div>
      </div>

      {heat.length>1&&(
        <div className="glass" style={{padding:"16px 20px",marginBottom:18}}>
          <div style={{fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>Spending intensity · last {heat.length} months</div>
          <div style={{display:"flex",gap:5,alignItems:"flex-end",height:64}}>
            {heat.map(h=>{const pct=h.s/maxHeat;const col=pct>.8?"#D92D20":pct>.55?"#EF6820":pct>.3?"#DC6803":"#079455";
              return (
                <div key={h.m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                  <div title={INR(h.s)} style={{width:"100%",height:`${Math.max(8,pct*48)}px`,borderRadius:5,
                    background:`linear-gradient(180deg,${col},${col}99)`,transition:"height .5s"}}/>
                  <div style={{fontSize:9,color:"var(--txt3)"}}>{monthLabel(h.m).split(" ")[0]}</div>
                </div>
              );})}
          </div>
        </div>
      )}

      <div className="insight-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
        {insights.map((it,i)=>{const t=TONE[it.tone]||TONE.neutral;
          return (
            <div key={it.id} className="glass pop" style={{padding:18,border:`1px solid ${t.bd}`,background:t.bg,
              animationDelay:`${i*0.04}s`,position:"relative",overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:20}}>{it.icon}</span>
                  <span style={{fontSize:13,fontWeight:600,color:"var(--txt2)"}}>{it.title}</span>
                </div>
                {it.tier===1&&<span style={{fontSize:9,fontWeight:700,color:t.c,border:`1px solid ${t.bd}`,
                  borderRadius:20,padding:"2px 8px",textTransform:"uppercase",letterSpacing:.5}}>key</span>}
              </div>
              <div style={{fontFamily:"Inter, sans-serif",fontSize:26,fontWeight:700,color:t.c,margin:"10px 0 6px",letterSpacing:-.5}}>{it.value}</div>
              <p style={{fontSize:13,color:"var(--txt2)",lineHeight:1.55,margin:0}}>{it.body}</p>
              {it.spark&&<div style={{marginTop:12}}><Sparkline data={it.spark} color={t.c}/></div>}
            </div>
          );})}
      </div>
    </div>
  );
}

function Tracker({initial, persist, user, onSignOut, cloud}){
  const [txns,setTxns]=useState(initial.txns);
  const [income,setIncome]=useState(initial.income);
  const [budgets,setBudgets]=useState(initial.budgets);
  const [portfolio,setPortfolio]=useState(sanitizePortfolio(initial.portfolio));
  const [activeMonth,setActiveMonth]=useState(null);
  const [tab,setTab]=useState("insights");
  const [toast,setToast]=useState(null);

  useEffect(()=>{
    const ms=[...new Set(txns.map(x=>monthKey(x.date)))].sort();
    setActiveMonth(ms[ms.length-1]||new Date().toISOString().slice(0,7));
  },[]);

  const pTxns=n=>{setTxns(n);persist({txns:n,income,budgets,portfolio});};
  const pTxnsNow=n=>{setTxns(n);persist({txns:n,income,budgets,portfolio},true);};
  const pInc=n=>{setIncome(n);persist({txns,income:n,budgets,portfolio});};
  const pBud=n=>{setBudgets(n);persist({txns,income,budgets:n,portfolio});};
  const pPort=n=>{setPortfolio(n);persist({txns,income,budgets,portfolio:n},true);};
  const flash=m=>{setToast(m);setTimeout(()=>setToast(null),2200);};

  const months=useMemo(()=>[...new Set(txns.map(x=>monthKey(x.date)))].sort(),[txns]);
  const monthTxns=useMemo(()=>txns.filter(x=>monthKey(x.date)===activeMonth).sort((a,b)=>b.date.localeCompare(a.date)),[txns,activeMonth]);
  const fin=useMemo(()=>monthlyFinancials(txns),[txns]);
  const stats=useMemo(()=>{
    const f=fin[activeMonth]||{income:0,credits:0,opening:null,closing:null};
    const inc=resolveIncome(income,fin,activeMonth);
    const incomeSource=(typeof income[activeMonth]==="number")?"month override":
      (typeof income.default==="number")?"set salary":(f.income>0?"auto-detected":"not set");
    const mm=monthMetrics(txns,activeMonth);
    return{inc,incomeSource,spend:mm.spend,invest:mm.invest,savings:mm.savings,
      ccbill:mm.ccbill,subs:mm.subs,byCat:mm.byCat,refunds:mm.refunds,
      credits:f.credits||0, opening:f.opening, closing:f.closing,
      otherCredits:Math.max((f.credits||0)-(f.income||0),0), autoIncome:f.income||0};
  },[monthTxns,income,activeMonth,fin]);

  return (
    <div style={{position:"relative",minHeight:"100vh"}}>
      <div className="aurora"><b className="a1"/><b className="a2"/><b className="a3"/></div>
      <div style={{position:"relative",zIndex:1}}>
        <Header months={months} activeMonth={activeMonth} setActiveMonth={setActiveMonth}
          txns={txns} flash={flash} user={user} onSignOut={onSignOut} cloud={cloud} setTab={setTab}/>
        <div style={{maxWidth:980,margin:"0 auto",padding:"0 16px"}}>
          <nav className="tabs-nav" style={{display:"flex",gap:22,borderBottom:"1px solid var(--line)",overflowX:"auto"}}>
            {[["insights","Insights"],["overview","Overview"],["transactions","Transactions"],["portfolio","Portfolio"],
              ["subscriptions","Subscriptions"],["budgets","Budgets"],["goals","Goals"],["trends","Trends"],["import","Import"]].map(([k,l])=>(
              <button key={k} className={"tabBtn"+(tab===k?" on":"")} onClick={()=>setTab(k)}>{l}</button>
            ))}
          </nav>
        </div>
        <main className="app-main" style={{maxWidth:980,margin:"0 auto",padding:"22px 16px 80px"}}>
          {tab==="insights"&&<Insights txns={txns} fin={fin} income={income} setTab={setTab}/>}
          {tab==="overview"&&<Overview stats={stats} label={monthLabel(activeMonth)} income={income}
            activeMonth={activeMonth} pInc={pInc} flash={flash}/>}
          {tab==="transactions"&&<Transactions txns={monthTxns} all={txns} pTxns={pTxns} flash={flash} monthLabel={monthLabel(activeMonth)}/>}
          {tab==="portfolio"&&<Portfolio portfolio={portfolio} pPort={pPort} flash={flash} user={user}/>}
          {tab==="subscriptions"&&<Subscriptions all={txns}/>}
          {tab==="budgets"&&<Budgets budgets={budgets} pBud={pBud} byCat={stats.byCat} flash={flash}/>}
          {tab==="goals"&&<Goals txns={txns} fin={fin} income={income} budgets={budgets} pBud={pBud} flash={flash}/>}
          {tab==="trends"&&<Trends txns={txns} income={income}/>}
          {tab==="import"&&<Importer all={txns} pTxns={pTxnsNow} setActiveMonth={setActiveMonth} setTab={setTab} flash={flash}/>}
        </main>
      </div>
      {toast&&<div style={{position:"fixed",bottom:26,left:"50%",transform:"translateX(-50%)",
        background:"#101828",color:"#fff",padding:"12px 22px",
        borderRadius:10,fontSize:14,fontWeight:600,zIndex:100,boxShadow:"0 8px 24px rgba(16,24,40,.3)",
        animation:"slideUp .3s ease"}}>{toast}</div>}
    </div>
  );
}

/* ---------------- Header ---------------- */
function Header({months,activeMonth,setActiveMonth,txns,flash,user,onSignOut,cloud,setTab}){
  const [menu,setMenu]=useState(false);
  const idx=months.indexOf(activeMonth);
  const go=d=>{const n=idx+d; if(n>=0&&n<months.length)setActiveMonth(months[n]);};
  const exportCSV=()=>{
    const rows=[["Date","Merchant","Note","Category","Type","Amount"]];
    [...txns].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
      rows.push([t.date,t.merchant,t.note||"",t.category,t.amount>0?"Credit":"Debit",Math.abs(t.amount)]);
    });
    const csv=rows.map(r=>r.map(c=>{const s=String(c); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`paisa-export-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    flash("CSV exported");
  };
  return (
    <header className="app-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"18px 16px",maxWidth:980,margin:"0 auto",gap:12,flexWrap:"wrap"}}>
      <div className="brand">
        <span className="brand-badge">₹</span>
        <span>
          <span className="brand-word">paisa</span>
          <span className="brand-tag" style={{display:"block",fontSize:9.5,color:"var(--txt3)",letterSpacing:1.2,textTransform:"uppercase",marginTop:2}}>personal finance</span>
        </span>
        <span style={{fontSize:10,fontWeight:700,color:"var(--txt3)",border:"1px solid var(--line2)",borderRadius:20,padding:"2px 8px",marginLeft:4}}>{APP_VERSION}</span>
      </div>
      <div className="header-actions" style={{display:"flex",alignItems:"center",gap:8}}>
        <button className="chip primary" onClick={()=>setTab("import")} style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>↑</span> Import
        </button>
        <button className="chip ghost" onClick={exportCSV} style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>↓</span> CSV
        </button>
        <button className="icoBtn" disabled={idx<=0} onClick={()=>go(-1)}>‹</button>
        <select className="inp" value={activeMonth} onChange={e=>setActiveMonth(e.target.value)}
          style={{width:"auto",fontWeight:700,fontFamily:"Inter, sans-serif",textAlign:"center",padding:"9px 12px"}}>
          {months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button className="icoBtn" disabled={idx>=months.length-1} onClick={()=>go(1)}>›</button>
        {user&&(
          <div style={{position:"relative"}}>
            <button className="icoBtn" onClick={()=>setMenu(!menu)} title={user.email}
              style={{background:"linear-gradient(135deg,#079455,#0E9384)",color:"#fff",fontWeight:700,border:"none"}}>
              {(user.email||"?")[0].toUpperCase()}
            </button>
            {menu&&(
              <div className="glass pop" style={{position:"absolute",right:0,top:46,width:230,padding:14,zIndex:50}}>
                <div style={{fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.5}}>Signed in as</div>
                <div style={{fontSize:13,fontWeight:600,wordBreak:"break-all",marginTop:2}}>{user.email}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,margin:"10px 0",fontSize:12,
                  color:cloud==="synced"?"#079455":cloud==="syncing"?"#DC6803":"var(--txt3)"}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:"currentColor"}}/>
                  {cloud==="synced"?"Synced to cloud":cloud==="syncing"?"Syncing…":cloud==="local"?"Local only":"Offline"}
                </div>
                <button className="chip ghost" style={{width:"100%"}} onClick={()=>{setMenu(false);onSignOut();}}>Sign out</button>
                <div style={{fontSize:10,color:"var(--txt3)",textAlign:"center",marginTop:8}}>Paisa {APP_VERSION}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/* ---------------- Overview ---------------- */
function Overview({stats,label,income,activeMonth,pInc,flash}){
  const {inc,incomeSource,spend,invest,savings,ccbill,subs,byCat,refunds,credits,opening,closing,otherCredits,autoIncome}=stats;
  const net=inc-spend-invest-savings;   // cash left after spending & putting money away
  const rate=savingsRate(inc,spend);    // % of income not consumed
  const [edit,setEdit]=useState(false);
  const [salary,setSalary]=useState(income.default||"");
  const [monthVal,setMonthVal]=useState(income[activeMonth]||"");
  useEffect(()=>{setSalary(income.default||"");setMonthVal(income[activeMonth]||"");},[income,activeMonth]);
  const pie=Object.entries(byCat).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);

  const saveSalary=()=>{const c={...income}; if(Number(salary)>0)c.default=Number(salary); else delete c.default; pInc(c); flash("Default salary set for all months");};
  const saveMonth=()=>{const c={...income}; if(Number(monthVal)>0)c[activeMonth]=Number(monthVal); else delete c[activeMonth]; pInc(c); flash("This month's income updated");};
  const clearMonth=()=>{const c={...income}; delete c[activeMonth]; pInc(c); setMonthVal(""); flash("Month override cleared");};
  const balDelta=(typeof closing==="number"&&typeof opening==="number")?closing-opening:null;

  return (
    <div className="fade">
      <div className="stat-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:18}}>
        <Hero label="Net flow this month" value={INR(net)} accent="#079455" big
          sub={`Savings rate ${Math.round(rate)}%`} icon="◈"/>
        <Stat label="Income" value={INR(inc)} accent="#079455" icon="↗"
          sub={`${incomeSource}${otherCredits>0?` · +${INR(otherCredits)} other`:""}`}
          action={<button className="chip ghost" style={{padding:"5px 12px",fontSize:12}} onClick={()=>setEdit(!edit)}>{edit?"Close":"Set"}</button>}/>
        <Stat label="Spending" value={INR(spend)} accent="#EF6820" icon="↘"
          sub={`${inc>0?Math.round((spend/inc)*100)+"% of income":""}${refunds>0?` · ${INR(refunds)} refunds netted`:""}`}/>
        <Stat label="Invested + Saved" value={INR(invest+savings)} accent="#079455" icon="✦"
          sub={`MF ${INR(invest)} · FD/RD ${INR(savings)}`}/>
      </div>

      {edit&&(
        <div className="glass pop" style={{padding:20,marginBottom:18,border:"1px solid rgba(7,148,85,.25)"}}>
          <h3 style={{fontFamily:"Inter, sans-serif",fontSize:15,margin:"0 0 4px"}}>Set income</h3>
          <p style={{fontSize:12.5,color:"var(--txt3)",margin:"0 0 16px",lineHeight:1.6}}>
            Priority: a month override beats your default salary, which beats auto-detected income. Set a default once and every month is covered.
          </p>
          <div className="form-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:16}}>
            <div>
              <label style={lbl}>Monthly salary (all months)</label>
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <input className="inp" type="number" placeholder="e.g. 50000" value={salary} onChange={e=>setSalary(e.target.value)}/>
                <button className="chip primary" onClick={saveSalary}>Save</button>
              </div>
              <div style={{fontSize:11,color:"var(--txt3)",marginTop:6}}>{income.default?`Currently ${INR(income.default)} for every month`:"Not set"}</div>
            </div>
            <div>
              <label style={lbl}>Override for {label} only</label>
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <input className="inp" type="number" placeholder="this month only" value={monthVal} onChange={e=>setMonthVal(e.target.value)}/>
                <button className="chip primary" onClick={saveMonth}>Save</button>
              </div>
              <div style={{fontSize:11,color:"var(--txt3)",marginTop:6}}>
                {typeof income[activeMonth]==="number"?<span>Override active · <span style={{color:"var(--accent2)",cursor:"pointer"}} onClick={clearMonth}>clear</span></span>:"Using default / auto"}
              </div>
            </div>
          </div>
        </div>
      )}

      {(typeof closing==="number")&&(
        <div className="glass balance-band" style={{padding:"16px 20px",marginBottom:18,display:"flex",alignItems:"center",
          gap:24,flexWrap:"wrap",background:"linear-gradient(135deg,rgba(14,147,132,.10),rgba(7,148,85,.05))"}}>
          <div>
            <div style={{fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.6}}>Opening balance</div>
            <div style={{fontFamily:"Inter, sans-serif",fontSize:22,fontWeight:700}}>{opening!=null?INR(opening):"—"}</div>
          </div>
          <div style={{fontSize:22,color:"var(--txt3)"}}>→</div>
          <div>
            <div style={{fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.6}}>Closing balance</div>
            <div style={{fontFamily:"Inter, sans-serif",fontSize:22,fontWeight:700}}>{INR(closing)}</div>
          </div>
          {balDelta!=null&&(
            <div style={{marginLeft:"auto",textAlign:"right"}}>
              <div style={{fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.6}}>Net change</div>
              <div style={{fontFamily:"Inter, sans-serif",fontSize:22,fontWeight:700,color:balDelta>=0?"#079455":"#D92D20"}}>
                {balDelta>=0?"+":"−"}{INR(Math.abs(balDelta))}</div>
            </div>
          )}
        </div>
      )}
      <div className="ov-charts" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16}}>
        <div className="glass" style={{padding:22}}>
          <h3 style={ti}>Where it went · {label}</h3>
          {pie.length===0?<Empty msg="No spending recorded this month."/>:(
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10}}>
              <div style={{width:210,height:210,flexShrink:0,position:"relative"}}>
                <RC.ResponsiveContainer>
                  <RC.PieChart>
                    <RC.Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={62} outerRadius={96} paddingAngle={2} stroke="none">
                      {pie.map(d=><RC.Cell key={d.name} fill={colorFor(d.name)}/>)}
                    </RC.Pie>
                    <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                  </RC.PieChart>
                </RC.ResponsiveContainer>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                  <div style={{fontSize:11,color:"var(--txt3)"}}>total spent</div>
                  <div style={{fontFamily:"Inter, sans-serif",fontSize:20,fontWeight:700}}>{INR(spend)}</div>
                </div>
              </div>
              <div style={{flex:1,minWidth:190}}>
                {pie.map(d=>(
                  <div key={d.name} style={{display:"flex",alignItems:"center",gap:9,padding:"6px 0",borderBottom:"1px solid var(--line)"}}>
                    <span style={{width:10,height:10,borderRadius:3,background:colorFor(d.name),flexShrink:0}}/>
                    <span style={{flex:1,fontSize:13,color:"var(--txt2)"}}>{d.name}</span>
                    <span style={{fontSize:13,fontWeight:700,fontFamily:"Inter, sans-serif"}}>{INR(d.value)}</span>
                    <span style={{fontSize:11,color:"var(--txt3)",width:34,textAlign:"right"}}>{Math.round(d.value/spend*100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass" style={{padding:22}}>
          <h3 style={ti}>Money flow</h3>
          <Flow label="Income" value={inc} max={inc} color="#079455"/>
          <Flow label="Spending" value={spend} max={inc} color="#EF6820"/>
          <Flow label="Investments (MF/SIP)" value={invest} max={inc} color="#079455"/>
          <Flow label="FD / RD" value={savings} max={inc} color="#0E9384"/>
          <Flow label="Subscriptions" value={subs} max={inc} color="#DC6803"/>
          <Flow label="Credit-card bills" value={ccbill} max={inc} color="#E0B84D"/>
          <div style={{fontSize:11.5,color:"var(--txt3)",marginTop:14,lineHeight:1.6}}>
            Investments, FD/RD and card-bill payments are tracked apart from lifestyle spending — so "spending" reflects real consumption.
          </div>
        </div>
      </div>
    </div>
  );
}
function Hero({label,value,sub,accent,icon}){
  // bank-card style balance hero: deep emerald gradient, subtle sheen
  return (
    <div style={{padding:"22px 24px",gridColumn:"1 / -1",borderRadius:16,
      background:"linear-gradient(130deg,#0E3B2E 0%,#11543F 45%,#0C2C36 100%)",
      border:"1px solid rgba(14,147,132,.22)",position:"relative",overflow:"hidden",
      boxShadow:"0 12px 32px -16px rgba(0,0,0,.6)"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(120% 140% at 85% -20%, rgba(255,255,255,.08), transparent 55%)",pointerEvents:"none"}}/>
      <div style={{fontSize:11.5,color:"rgba(242,245,250,.66)",fontWeight:600,textTransform:"uppercase",letterSpacing:1.2}}>{label}</div>
      <div style={{fontFamily:"Inter, sans-serif",fontSize:40,fontWeight:700,letterSpacing:-1,marginTop:6,color:"#fff"}}>{value}</div>
      <div style={{fontSize:13,color:"rgba(242,245,250,.72)",marginTop:4}}>{sub}</div>
    </div>
  );
}
function Stat({label,value,sub,accent,action,icon}){
  return (
    <div className="glass" style={{padding:"16px 18px",borderTop:`3px solid ${accent}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",minHeight:26}}>
        <span style={{fontSize:11.5,color:"var(--txt3)",fontWeight:700,textTransform:"uppercase",letterSpacing:.6}}>
          <span style={{color:accent,marginRight:5}}>{icon}</span>{label}</span>{action}
      </div>
      <div style={{fontFamily:"Inter, sans-serif",fontSize:27,fontWeight:700,marginTop:5,letterSpacing:-.5}}>{value}</div>
      {sub&&<div style={{fontSize:12,color:"var(--txt2)",marginTop:2}}>{sub}</div>}
    </div>
  );
}
function Flow({label,value,max,color}){
  const pct=max>0?Math.min(value/max*100,100):0;
  return (
    <div style={{margin:"11px 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5,color:"var(--txt2)"}}>
        <span>{label}</span><span style={{fontWeight:700,fontFamily:"Inter, sans-serif",color:"var(--txt)"}}>{INR(value)}</span>
      </div>
      <div style={{height:9,background:"var(--track)",borderRadius:6,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,borderRadius:6,transition:"width .5s cubic-bezier(.2,.7,.3,1)",
          background:`linear-gradient(90deg,${color},${color}cc)`}}/>
      </div>
    </div>
  );
}

/* ---------------- Transactions ---------------- */
function Transactions({txns,all,pTxns,flash,monthLabel}){
  const [filter,setFilter]=useState("All"); const [q,setQ]=useState(""); const [adding,setAdding]=useState(false);
  const cats=["All",...CATEGORIES.filter(c=>txns.some(t=>t.category===c))];
  const shown=txns.filter(t=>(filter==="All"||t.category===filter)&&(q===""||(t.merchant+t.note).toLowerCase().includes(q.toLowerCase())));
  const setCat=(id,cat)=>pTxns(all.map(t=>t.id===id?{...t,category:cat}:t));
  const remove=id=>{pTxns(all.filter(t=>t.id!==id));flash("Deleted");};
  return (
    <div className="fade">
      <div style={{display:"flex",gap:9,marginBottom:14,flexWrap:"wrap"}}>
        <input className="inp" placeholder="Search merchant or note…" value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,minWidth:160}}/>
        <select className="inp" value={filter} onChange={e=>setFilter(e.target.value)} style={{width:"auto"}}>
          {cats.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button className="chip primary" onClick={()=>setAdding(true)}>+ Add</button>
      </div>
      {adding&&<AddRow onAdd={t=>{pTxns([t,...all]);setAdding(false);flash("Added");}} onCancel={()=>setAdding(false)} defMonth={txns[0]?.date?.slice(0,7)}/>}
      <div className="glass" style={{overflow:"hidden",padding:"4px 0"}}>
        {shown.length===0&&<Empty msg="No transactions match."/>}
        {shown.map(t=>{const credit=t.amount>0; return (
          <div key={t.id} className="row" style={{display:"flex",alignItems:"center",gap:11,padding:"12px 16px 12px 0",borderBottom:"1px solid var(--line)"}}>
            <span style={{width:4,height:40,borderRadius:4,background:colorFor(t.category),flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {t.merchant}{t.manual&&<span style={{fontSize:9,fontWeight:700,color:"var(--accent2)",border:"1px solid rgba(14,147,132,.3)",borderRadius:6,padding:"1px 5px",marginLeft:6,verticalAlign:"middle"}}>manual</span>}
              </div>
              <div style={{fontSize:12,color:"var(--txt3)",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.date.slice(8)}/{t.date.slice(5,7)} · {t.note||"—"}</div>
            </div>
            <select className="miniSel txn-cat" value={t.category} onChange={e=>setCat(t.id,e.target.value)} style={{color:colorFor(t.category),maxWidth:140}}>
              {CATEGORIES.map(c=><option key={c} value={c} style={{color:"#101828"}}>{c}</option>)}
            </select>
            <span className="txn-amt" style={{fontSize:14,fontWeight:700,fontFamily:"Inter, sans-serif",width:104,textAlign:"right",
              color:credit?"#079455":"var(--txt)"}}>{credit?"+":"−"}{INR2(Math.abs(t.amount))}</span>
            <button className="del" onClick={()=>remove(t.id)}>×</button>
          </div>
        );})}
      </div>
      <div style={{textAlign:"center",fontSize:12,color:"var(--txt3)",marginTop:12}}>{shown.length} transactions · {monthLabel}</div>
    </div>
  );
}
function AddRow({onAdd,onCancel,defMonth}){
  const todayISO=new Date().toISOString().slice(0,10);
  const def=(defMonth&&defMonth!==todayISO.slice(0,7))?defMonth+"-15":todayISO;
  const [f,setF]=useState({date:def,merchant:"",note:"",amount:"",category:"Food & Dining",type:"debit"});
  const submit=()=>{const amt=Math.abs(Number(f.amount)||0); if(!amt||!f.merchant)return;
    onAdd({id:`man-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,date:f.date,merchant:titleCase(f.merchant),
      note:f.note,amount:f.type==="credit"?amt:-amt,category:f.category,ref:"",balance:null,manual:true});};
  return (
    <div className="glass pop" style={{padding:18,marginBottom:14,border:"1px dashed var(--line2)"}}>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {["debit","credit"].map(ty=>(
          <button key={ty} className={"chip "+(f.type===ty?"primary":"ghost")} style={{flex:1,fontSize:13}}
            onClick={()=>setF({...f,type:ty,category:ty==="credit"?"Income":"Food & Dining"})}>
            {ty==="debit"?"💸 Expense":"💰 Income / received"}
          </button>
        ))}
      </div>
      <div className="form-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:9}}>
        <input className="inp" type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/>
        <input className="inp" placeholder={f.type==="credit"?"Source (e.g. Salary)":"Merchant / payee"} value={f.merchant} onChange={e=>setF({...f,merchant:e.target.value})}/>
        <input className="inp" placeholder="Note (optional)" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/>
        <input className="inp" type="number" placeholder="Amount ₹" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/>
        <select className="inp" value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
      </div>
      <div style={{display:"flex",gap:8,marginTop:11}}>
        <button className="chip primary" onClick={submit}>Add {f.type==="credit"?"income":"expense"}</button>
        <button className="chip ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------------- Subscriptions ---------------- */
function Subscriptions({all}){
  const subTxns=all.filter(t=>t.category==="Subscriptions");
  // group by detected service
  const groups={};
  subTxns.forEach(t=>{
    const name=detectSub(t.merchant+" "+t.note)||t.merchant||"Other";
    const key=name==="Recurring"?t.merchant:name;
    if(!groups[key])groups[key]={name:key,txns:[],total:0};
    groups[key].txns.push(t); groups[key].total+=Math.abs(t.amount);
  });
  // recurring detection across ALL categories: same merchant appearing in 2+ distinct months w/ similar amount
  const byMerchant={};
  all.filter(t=>t.amount<0).forEach(t=>{
    const m=t.merchant.toLowerCase();
    (byMerchant[m]=byMerchant[m]||[]).push(t);
  });
  const recurring=[];
  Object.values(byMerchant).forEach(arr=>{
    const months=new Set(arr.map(t=>monthKey(t.date)));
    if(months.size>=2){
      const amts=arr.map(t=>Math.abs(t.amount));
      const avg=amts.reduce((a,b)=>a+b,0)/amts.length;
      const spread=Math.max(...amts)-Math.min(...amts);
      if(spread<avg*0.25){ recurring.push({merchant:arr[0].merchant,months:months.size,avg,category:arr[0].category}); }
    }
  });
  recurring.sort((a,b)=>b.avg-a.avg);
  const list=Object.values(groups).sort((a,b)=>b.total-a.total);
  const monthlyEst=list.reduce((s,g)=>s+g.total/Math.max(1,new Set(g.txns.map(t=>monthKey(t.date))).size),0);

  return (
    <div className="fade">
      <div className="stat-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:18}}>
        <Stat label="Active subscriptions" value={list.length} accent="#DC6803" icon="✦"/>
        <Stat label="Monthly run-rate" value={INR(monthlyEst)} accent="#EF6820" icon="↻"
          sub={`~${INR(monthlyEst*12)} / year`}/>
        <Stat label="Recurring detected" value={recurring.length} accent="#0E9384" icon="◉"
          sub="across all categories"/>
      </div>

      <div className="glass" style={{padding:22,marginBottom:16}}>
        <h3 style={ti}>Your subscriptions</h3>
        {list.length===0?<Empty msg="No subscriptions detected yet."/>:list.map(g=>{
          const ms=new Set(g.txns.map(t=>monthKey(t.date))).size;
          const per=g.total/Math.max(1,ms);
          return (
            <div key={g.name} className="row" style={{display:"flex",alignItems:"center",gap:13,padding:"13px 0",borderBottom:"1px solid var(--line)"}}>
              <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${colorFor("Subscriptions")},#EF6820)`,
                display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,color:"#fff",flexShrink:0,fontFamily:"Inter, sans-serif"}}>
                {g.name[0]}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:600}}>{g.name}</div>
                <div style={{fontSize:12,color:"var(--txt3)"}}>{g.txns.length} charge{g.txns.length>1?"s":""} · {ms} month{ms>1?"s":""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:16}}>{INR(per)}<span style={{fontSize:11,color:"var(--txt3)"}}>/mo</span></div>
                <div style={{fontSize:11,color:"var(--txt3)"}}>{INR(g.total)} total</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass" style={{padding:22}}>
        <h3 style={ti}>Auto-detected recurring payments</h3>
        <p style={{fontSize:12.5,color:"var(--txt3)",margin:"0 0 14px",lineHeight:1.6}}>
          Merchants you paid in 2+ months with a steady amount. Add more months to sharpen this — rent, SIPs and gym-type payments will surface here.
        </p>
        {recurring.length===0?<Empty msg="Need at least 2 months of data to spot recurring patterns. Import another statement."/>:
          recurring.map((r,i)=>(
            <div key={i} className="row" style={{display:"flex",alignItems:"center",gap:11,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
              <span style={{width:9,height:9,borderRadius:3,background:colorFor(r.category),flexShrink:0}}/>
              <span style={{flex:1,fontSize:14}}>{r.merchant}</span>
              <span style={{fontSize:11,color:"var(--txt3)"}}>{r.category}</span>
              <span style={{fontSize:11,color:"var(--accent2)",fontWeight:600}}>{r.months}× months</span>
              <span style={{fontFamily:"Inter, sans-serif",fontWeight:700,width:90,textAlign:"right"}}>~{INR(r.avg)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------------- Budgets ---------------- */
function Budgets({budgets,pBud,byCat,flash}){
  const [d,setD]=useState(budgets); useEffect(()=>setD(budgets),[budgets]);
  const cats=CATEGORIES.filter(c=>!NONSPEND.has(c));
  const save=()=>{const clean=budgets._goals?{_goals:budgets._goals}:{};
    Object.entries(d).forEach(([k,v])=>{if(k!=="_goals"&&Number(v)>0)clean[k]=Number(v);}); pBud(clean); flash("Budgets saved");};
  return (
    <div className="fade">
      <div className="glass" style={{padding:22}}>
        <h3 style={ti}>Monthly budgets</h3>
        <p style={{fontSize:13,color:"var(--txt3)",margin:"0 0 16px"}}>Set a cap per category. Bars fill as you spend this month; they glow red when you cross the line.</p>
        {cats.map(c=>{
          const spent=byCat[c]||0; const cap=Number(d[c])||0;
          const pct=cap>0?Math.min(spent/cap*100,100):0; const over=cap>0&&spent>cap;
          return (
            <div key={c} className="budget-row" style={{display:"grid",gridTemplateColumns:"160px 1fr 96px",alignItems:"center",gap:13,padding:"11px 0",borderBottom:"1px solid var(--line)"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                <span style={{width:10,height:10,borderRadius:3,background:colorFor(c),flexShrink:0}}/>
                <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:"var(--txt2)"}}>{c}</span>
              </div>
              <div>
                <div style={{height:9,background:"var(--track)",borderRadius:6,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,borderRadius:6,transition:"width .5s",
                    background:over?"linear-gradient(90deg,#D92D20,#EF6820)":`linear-gradient(90deg,${colorFor(c)},${colorFor(c)}cc)`,
                    }}/>
                </div>
                <div style={{fontSize:11.5,color:"var(--txt3)",marginTop:4}}>
                  {INR(spent)}{cap>0?` / ${INR(cap)}`:" spent"}
                  {over&&<span style={{color:"#D92D20",fontWeight:700}}> · over by {INR(spent-cap)}</span>}
                </div>
              </div>
              <input className="inp budget-input" type="number" placeholder="—" value={d[c]||""} onChange={e=>setD({...d,[c]:e.target.value})} style={{textAlign:"right",padding:"8px 10px"}}/>
            </div>
          );
        })}
        <button className="chip primary" style={{marginTop:16}} onClick={save}>Save budgets</button>
      </div>
    </div>
  );
}

/* ---------------- Trends ---------------- */
/* ---------------- Goals: target corpus with live projection ---------------- */
function Goals({txns,fin,income,budgets,pBud,flash}){
  const goal=(budgets._goals&&budgets._goals[0])||null;
  const [name,setName]=useState(goal?goal.name:"");
  const [target,setTarget]=useState(goal?goal.target:"");
  const [by,setBy]=useState(goal?goal.by:"");
  const months=[...new Set(txns.map(t=>monthKey(t.date)))].sort();

  // current corpus = latest known closing balance
  const balMonths=months.filter(m=>fin[m]&&typeof fin[m].closing==="number");
  const corpus=balMonths.length?fin[balMonths[balMonths.length-1]].closing:0;
  // savings pace = average (income - spend) across known months
  const paces=months.map(m=>resolveIncome(income,fin,m)-monthMetrics(txns,m).spend).filter(v=>isFinite(v));
  const pace=paces.length?paces.reduce((a,b)=>a+b,0)/paces.length:0;

  const save=()=>{
    if(!(Number(target)>0)){flash("Enter a target amount");return;}
    const g=[{name:name||"My goal",target:Number(target),by:by||null,created:new Date().toISOString().slice(0,10)}];
    pBud({...budgets,_goals:g}); flash("Goal saved");
  };
  const clear=()=>{const b={...budgets}; delete b._goals; pBud(b); setName("");setTarget("");setBy(""); flash("Goal removed");};

  const pct=goal&&goal.target>0?Math.min(100,Math.round(corpus/goal.target*100)):0;
  const remaining=goal?Math.max(goal.target-corpus,0):0;
  const monthsNeeded=(pace>0&&remaining>0)?Math.ceil(remaining/pace):null;
  const eta=monthsNeeded!=null?(()=>{const d=new Date();d.setMonth(d.getMonth()+monthsNeeded);return monthLabel(d.toISOString().slice(0,7));})():null;
  let onTrack=null;
  if(goal&&goal.by&&monthsNeeded!=null){
    const tgt=new Date(goal.by+"-01"); const etaD=new Date(); etaD.setMonth(etaD.getMonth()+monthsNeeded);
    onTrack=etaD<=tgt;
  }

  return (
    <div className="fade">
      {goal&&(
        <div className="glass" style={{padding:26,marginBottom:18,background:"linear-gradient(135deg,rgba(7,148,85,.16),rgba(220,104,3,.06))",border:"1px solid rgba(7,148,85,.28)"}}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:12,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:1}}>🎯 {goal.name}</div>
              <div style={{fontFamily:"Inter, sans-serif",fontSize:34,fontWeight:700,letterSpacing:-1,margin:"4px 0"}}>{INR(corpus)} <span style={{fontSize:16,color:"var(--txt3)"}}>of {INR(goal.target)}</span></div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"Inter, sans-serif",fontSize:30,fontWeight:700,color:"#DC6803"}}>{pct}%</div>
              {goal.by&&<div style={{fontSize:12,color:"var(--txt3)"}}>target: {monthLabel(goal.by)}</div>}
            </div>
          </div>
          <div style={{height:14,background:"var(--track)",borderRadius:8,overflow:"hidden",margin:"14px 0 10px"}}>
            <div style={{height:"100%",width:pct+"%",borderRadius:8,transition:"width 1s cubic-bezier(.2,.7,.3,1)",
              background:"linear-gradient(90deg,#079455,#DC6803)"}}/>
          </div>
          <div style={{fontSize:13.5,color:"var(--txt2)",lineHeight:1.7}}>
            {remaining>0?<>
              {INR(remaining)} to go. At your average pace of <b style={{color:"var(--txt)"}}>{INR(pace)}/month</b>{eta?<>, you'll reach it around <b style={{color:"#DC6803"}}>{eta}</b></>:", set a positive savings pace to project an arrival date"}.
              {onTrack!=null&&<span style={{marginLeft:6,fontWeight:700,color:onTrack?"#079455":"#D92D20"}}>{onTrack?"✓ On track":"⚠ Behind schedule"}</span>}
            </>:<b style={{color:"#079455"}}>Goal reached! 🎉</b>}
          </div>
          <div style={{fontSize:11,color:"var(--txt3)",marginTop:10}}>Corpus = latest account closing balance · pace = avg(income − spending) across {paces.length} months. Investments held elsewhere aren't counted.</div>
        </div>
      )}
      <div className="glass" style={{padding:22}}>
        <h3 style={ti}>{goal?"Edit goal":"Set a goal"}</h3>
        <div className="form-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
          <div><label style={lbl}>Goal name</label><input className="inp" style={{marginTop:6}} placeholder="e.g. Wedding fund" value={name} onChange={e=>setName(e.target.value)}/></div>
          <div><label style={lbl}>Target amount ₹</label><input className="inp" style={{marginTop:6}} type="number" placeholder="e.g. 1500000" value={target} onChange={e=>setTarget(e.target.value)}/></div>
          <div><label style={lbl}>Target month (optional)</label><input className="inp" style={{marginTop:6}} type="month" value={by||""} onChange={e=>setBy(e.target.value)}/></div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <button className="chip primary" onClick={save}>Save goal</button>
          {goal&&<button className="chip ghost" onClick={clear}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

function Trends({txns,income}){
  const months=[...new Set(txns.map(x=>monthKey(x.date)))].sort();
  const fin=monthlyFinancials(txns);
  const data=months.map(m=>{
    const mm=monthMetrics(txns,m);
    const mInc=resolveIncome(income,fin,m);
    return{month:monthLabel(m).split(" ")[0],Spending:Math.round(mm.spend),Invested:Math.round(mm.invest+mm.savings),Income:Math.round(mInc)};
  });
  const single=months.length<2;
  return (
    <div className="fade">
      <div className="glass" style={{padding:22,marginBottom:16}}>
        <h3 style={ti}>Income · Spending · Invested</h3>
        {single&&<Empty msg="One month loaded. Import more statements to unlock month-over-month trend lines."/>}
        <div className="chart-box" style={{height:300}}>
          <RC.ResponsiveContainer>
            {single?(
              <RC.BarChart data={data}>
                <RC.CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" vertical={false}/>
                <RC.XAxis dataKey="month" tick={{fontSize:12,fill:"#667085"}}/>
                <RC.YAxis tickFormatter={v=>"₹"+v/1000+"k"} tick={{fontSize:11,fill:"#98A2B3"}}/>
                <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                <RC.Bar dataKey="Income" fill="#079455" radius={[6,6,0,0]}/>
                <RC.Bar dataKey="Spending" fill="#EF6820" radius={[6,6,0,0]}/>
                <RC.Bar dataKey="Invested" fill="#079455" radius={[6,6,0,0]}/>
              </RC.BarChart>
            ):(
              <RC.LineChart data={data}>
                <RC.CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" vertical={false}/>
                <RC.XAxis dataKey="month" tick={{fontSize:12,fill:"#667085"}}/>
                <RC.YAxis tickFormatter={v=>"₹"+v/1000+"k"} tick={{fontSize:11,fill:"#98A2B3"}}/>
                <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                <RC.Line dataKey="Income" stroke="#079455" strokeWidth={3} dot={{r:4,fill:"#079455"}}/>
                <RC.Line dataKey="Spending" stroke="#EF6820" strokeWidth={3} dot={{r:4,fill:"#EF6820"}}/>
                <RC.Line dataKey="Invested" stroke="#079455" strokeWidth={3} dot={{r:4,fill:"#079455"}}/>
              </RC.LineChart>
            )}
          </RC.ResponsiveContainer>
        </div>
      </div>
      {!single&&(
        <div className="glass" style={{padding:22}}>
          <h3 style={ti}>Spending by month</h3>
          <div className="chart-box" style={{height:240}}>
            <RC.ResponsiveContainer>
              <RC.BarChart data={data}>
                <RC.CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" vertical={false}/>
                <RC.XAxis dataKey="month" tick={{fontSize:12,fill:"#667085"}}/>
                <RC.YAxis tickFormatter={v=>"₹"+v/1000+"k"} tick={{fontSize:11,fill:"#98A2B3"}}/>
                <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                <RC.Bar dataKey="Spending" fill="#EF6820" radius={[6,6,0,0]}/>
              </RC.BarChart>
            </RC.ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Importer ---------------- */
function Importer({all,pTxns,setActiveMonth,setTab,flash}){
  const [preview,setPreview]=useState(null); const [err,setErr]=useState(""); const fileRef=useRef();
  const handleText=text=>{
    setErr("");
    try{
      const rows=parseCSV(text); const {txns,skipped}=rowsToTxns(rows);
      if(!txns.length){setErr("Couldn't find transactions. Need Date + Description + Amount (or Withdrawal/Deposit) columns.");return;}
      // Dedup key: prefer the bank's unique ref number; otherwise fall back to
      // date + amount + FULL narration so distinct same-amount payments survive.
      const keyOf=t=>t.ref?("ref:"+t.ref):(t.date+"|"+t.amount+"|"+(t.merchant+t.note));
      const ex=new Set(all.map(keyOf));
      const seen=new Set();
      const fresh=txns.filter(t=>{const k=keyOf(t); if(ex.has(k)||seen.has(k))return false; seen.add(k); return true;});
      const months=[...new Set(fresh.map(t=>t.date.slice(0,7)))].sort();
      setPreview({txns:fresh,dupes:txns.length-fresh.length,skipped,months});
    }catch(e){setErr("Parse error: "+e.message);}
  };
  const onFile=e=>{const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>handleText(r.result); r.readAsText(f);};
  const confirm=()=>{const next=[...all,...preview.txns]; pTxns(next);
    const months=preview.months||[];
    const m=months[months.length-1]; if(m)setActiveMonth(m);
    flash(`Imported ${preview.txns.length} transactions across ${months.length} month${months.length>1?"s":""}`); setPreview(null); setTab("transactions");};
  return (
    <div className="fade">
      <div className="glass" style={{padding:22,marginBottom:16}}>
        <h3 style={ti}>Import a statement</h3>
        <p style={{fontSize:13,color:"var(--txt3)",margin:"0 0 16px",lineHeight:1.6}}>
          Export your bank statement as <b style={{color:"var(--txt2)"}}>CSV</b> and drop it here, or paste rows below.
          HDFC Withdrawal/Deposit columns auto-detected · everything auto-categorized · duplicates skipped.
        </p>
        <div className="drop" onClick={()=>fileRef.current.click()}>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={onFile} style={{display:"none"}}/>
          <div style={{fontSize:36}}>📄</div>
          <div style={{fontWeight:700,marginTop:6}}>Tap to choose a CSV file</div>
          <div style={{fontSize:12,color:"var(--txt3)"}}>works on iPad — pick from the Files app</div>
        </div>
        <div style={{textAlign:"center",color:"var(--txt3)",fontSize:12,margin:"14px 0"}}>— or paste rows —</div>
        <PasteBox onParse={handleText}/>
        {err&&<div style={{marginTop:12,padding:"11px 15px",background:"rgba(217,45,32,.12)",color:"#D92D20",borderRadius:12,fontSize:13}}>{err}</div>}
      </div>
      {preview&&(
        <div className="glass pop" style={{padding:22}}>
          <h3 style={ti}>Preview · {preview.txns.length} new across {(preview.months||[]).length} months</h3>
          {(preview.months||[]).length>0&&(
            <div style={{fontSize:12,color:"var(--accent2)",marginBottom:8}}>
              {monthLabel(preview.months[0])} → {monthLabel(preview.months[preview.months.length-1])}
            </div>
          )}
          <div style={{fontSize:13,color:"var(--txt2)",marginBottom:12}}>
            {preview.dupes>0&&<>Skipped {preview.dupes} likely duplicates. </>}
            {preview.skipped>0&&<>Ignored {preview.skipped} non-transaction rows. </>}Review, then confirm.
          </div>
          <div style={{maxHeight:340,overflow:"auto"}}>
            {preview.txns.slice(0,250).map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--line)"}}>
                <span style={{width:9,height:9,borderRadius:3,background:colorFor(t.category),flexShrink:0}}/>
                <span style={{flex:1,fontSize:13}}>{t.merchant}</span>
                <span style={{fontSize:12,color:"var(--txt3)"}}>{t.date}</span>
                <span style={{fontSize:11.5,color:"var(--txt2)",width:120}}>{t.category}</span>
                <span style={{fontSize:13,fontWeight:700,fontFamily:"Inter, sans-serif",color:t.amount>0?"#079455":"var(--txt)"}}>{t.amount>0?"+":"−"}{INR(Math.abs(t.amount))}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginTop:13}}>
            <button className="chip primary" onClick={confirm}>Import {preview.txns.length}</button>
            <button className="chip ghost" onClick={()=>setPreview(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
function PasteBox({onParse}){
  const [v,setV]=useState("");
  return (
    <div>
      <textarea className="inp" value={v} onChange={e=>setV(e.target.value)} rows={5}
        placeholder={"01/06/26\tUPI-MERCHANT-...-NOTE\t...\t250\t\t12345"}
        style={{fontFamily:"monospace",fontSize:12,resize:"vertical"}}/>
      <button className="chip primary" style={{marginTop:9}} disabled={!v.trim()} onClick={()=>onParse(v)}>Parse pasted rows</button>
    </div>
  );
}

/* ---------------- Portfolio (Groww stocks + mutual funds) ---------------- */
const PIE_COLORS=["#175CD3","#067647","#DC6803","#5925DC","#B42318","#0E9384","#3E4784","#C11574","#475467","#087443","#B54708","#444CE7"];
const pnlColor=v=>v>0?"#079455":v<0?"#D92D20":"var(--txt2)";
const signedINR=v=>(v>=0?"+":"−")+INR(Math.abs(v));
const pctStr=(part,base)=>base>0?((part/base*100)>=0?"+":"")+ (part/base*100).toFixed(1)+"%":"—";

function PortfolioImport({onParsed,compact}){
  const fileRef=useRef(); const [err,setErr]=useState("");
  const onFile=async e=>{
    const f=e.target.files&&e.target.files[0]; if(!f)return; setErr("");
    try{
      let sheets=[];
      if(/\.(xlsx|xls)$/i.test(f.name)){
        const XLSX=await import("xlsx");
        const wb=XLSX.read(await f.arrayBuffer(),{type:"array"});
        sheets=wb.SheetNames.map(n=>XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null}));
      }else{
        sheets=[parseCSV(await f.text())];
      }
      let found=null;
      for(const rows of sheets){const r=parseHoldingsRows(rows); if(r){found=r;break;}}
      if(!found){setErr("Couldn't recognize this file. Expected a Groww holdings statement — stocks (Stock Name/ISIN/Quantity…) or mutual funds (Scheme Name/Units…).");}
      else onParsed(found);
    }catch(ex){setErr("Couldn't read the file: "+ex.message);}
    e.target.value="";
  };
  return (
    <div>
      <div className="drop" onClick={()=>fileRef.current.click()} style={compact?{padding:"16px"}:null}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" onChange={onFile} style={{display:"none"}}/>
        <div style={{fontSize:compact?24:36}}>📊</div>
        <div style={{fontWeight:700,marginTop:6}}>Tap to import a Groww holdings statement</div>
        <div style={{fontSize:12,color:"var(--txt3)"}}>.xlsx straight from Groww (Reports → Holdings) — stocks and mutual funds both work</div>
      </div>
      {err&&<div style={{marginTop:12,padding:"11px 15px",background:"rgba(217,45,32,.12)",color:"#D92D20",borderRadius:12,fontSize:13}}>{err}</div>}
    </div>
  );
}

/* tiny markdown renderer for AI insight text (headings, bullets, **bold**) */
function MiniMarkdown({text}){
  const fmt=s=>{const parts=String(s).split(/\*\*(.+?)\*\*/g);
    return parts.map((x,i)=>i%2?<b key={i} style={{color:"var(--txt)"}}>{x}</b>:x);};
  return (
    <div style={{fontSize:13.5,lineHeight:1.7,color:"var(--txt2)"}}>
      {String(text||"").split(/\r?\n/).map((l,i)=>{
        if(/^#{1,3}\s/.test(l))return <div key={i} style={{fontFamily:"Inter, sans-serif",fontWeight:700,fontSize:15,color:"var(--txt)",margin:"14px 0 4px"}}>{l.replace(/^#+\s*/,"")}</div>;
        if(/^\s*[-•*]\s/.test(l))return <div key={i} style={{display:"flex",gap:8,margin:"3px 0"}}><span style={{color:"var(--accent2)"}}>•</span><span>{fmt(l.replace(/^\s*[-•*]\s/,""))}</span></div>;
        if(l.trim()==="")return <div key={i} style={{height:8}}/>;
        return <div key={i}>{fmt(l)}</div>;
      })}
    </div>
  );
}

function AIInsightPanel({user}){
  const [state,setState]=useState({loading:true,row:null});
  useEffect(()=>{
    let alive=true;
    if(!sb||!user){setState({loading:false,row:null});return;}
    sb.from("paisa_insights").select("content,created_at").order("created_at",{ascending:false}).limit(1)
      .then(({data,error})=>{if(alive)setState({loading:false,row:(!error&&data&&data[0])?data[0]:null});})
      .catch(()=>{if(alive)setState({loading:false,row:null});});
    return ()=>{alive=false;};
  },[user]);
  return (
    <div className="glass" style={{padding:22,marginBottom:16,border:"1px solid rgba(14,147,132,.25)",
      background:"linear-gradient(135deg,rgba(7,148,85,.10),rgba(77,168,255,.05))"}}>
      <h3 style={{...ti,display:"flex",alignItems:"center",gap:8}}>🤖 AI portfolio analysis
        {state.row&&<span style={{fontSize:10,fontWeight:600,color:"var(--txt3)",border:"1px solid var(--line2)",borderRadius:20,padding:"2px 8px"}}>
          {new Date(state.row.created_at).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span>}
      </h3>
      {state.loading?<div style={{fontSize:13,color:"var(--txt3)"}}>Checking for your latest analysis…</div>:
       state.row?<MiniMarkdown text={state.row.content}/>:
       <div style={{fontSize:13,color:"var(--txt2)",lineHeight:1.7}}>
         No AI analysis yet. Once the weekly insights function is set up (see the <b>AI insights</b> section of the README —
         a Supabase Edge Function that reads your holdings, pulls live prices &amp; news, and asks Claude for a
         fundamentals-grounded review), your weekly report will appear here automatically.
       </div>}
    </div>
  );
}

function Portfolio({portfolio,pPort,flash,user}){
  const p=sanitizePortfolio(portfolio);
  const hasData=p.stocks.length>0||p.funds.length>0;
  const onParsed=parsed=>{
    pPort(mergePortfolio(p,parsed));
    flash(`Imported ${parsed.rows.length} ${parsed.kind==="stocks"?"stock":"mutual fund"} holdings${parsed.asOf?` (as on ${parsed.asOf})`:""}`);
  };

  const sInv=p.stocks.reduce((a,r)=>a+r.buyValue,0), sCur=p.stocks.reduce((a,r)=>a+r.curValue,0);
  const fInv=p.funds.reduce((a,r)=>a+r.invested,0), fCur=p.funds.reduce((a,r)=>a+r.current,0);
  const inv=sInv+fInv, cur=sCur+fCur, pnl=cur-inv;

  // funds aggregated by scheme (Groww lists one row per folio)
  const fundAgg=useMemo(()=>{
    const g={};
    p.funds.forEach(f=>{const k=f.name;
      if(!g[k])g[k]={name:f.name,category:f.category,subCategory:f.subCategory,invested:0,current:0,folios:0};
      g[k].invested+=f.invested; g[k].current+=f.current; g[k].folios++;});
    return Object.values(g).sort((a,b)=>b.current-a.current);
  },[p.funds]);

  const stockPie=useMemo(()=>{
    const s=[...p.stocks].sort((a,b)=>b.curValue-a.curValue);
    const top=s.slice(0,8).map(r=>({name:r.name,value:Math.round(r.curValue)}));
    const rest=s.slice(8).reduce((a,r)=>a+r.curValue,0);
    if(rest>0)top.push({name:"Others",value:Math.round(rest)});
    return top;
  },[p.stocks]);

  const catPie=useMemo(()=>{
    const g={};
    p.funds.forEach(f=>{const k=f.category||"Other"; g[k]=(g[k]||0)+f.current;});
    if(sCur>0)g["Direct stocks"]=(g["Direct stocks"]||0)+sCur;
    return Object.entries(g).map(([name,value])=>({name,value:Math.round(value)})).sort((a,b)=>b.value-a.value);
  },[p.funds,sCur]);

  const movers=useMemo(()=>{
    const rows=p.stocks.filter(r=>r.buyValue>0).map(r=>({name:r.name,pct:r.pnl/r.buyValue*100,pnl:r.pnl}));
    rows.sort((a,b)=>b.pct-a.pct);
    return{best:rows[0],worst:rows[rows.length-1]};
  },[p.stocks]);
  const concentration=useMemo(()=>{
    if(!p.stocks.length||sCur<=0)return null;
    const top=[...p.stocks].sort((a,b)=>b.curValue-a.curValue)[0];
    return{name:top.name,share:top.curValue/sCur*100};
  },[p.stocks,sCur]);

  const sortedStocks=[...p.stocks].sort((a,b)=>b.curValue-a.curValue);

  // on-device decision insights — no backend needed
  const decisions=useMemo(()=>computeDecisionInsights(p),[portfolio]);

  // live NAV refresh (api.mfapi.in, best-effort)
  const [live,setLive]=useState(null);
  const [liveBusy,setLiveBusy]=useState(false);
  const unitsBy=useMemo(()=>{
    const u={}; p.funds.forEach(f=>{u[f.name]=(u[f.name]||0)+f.units;}); return u;
  },[p.funds]);
  const refreshNAVs=async()=>{
    if(liveBusy)return; setLiveBusy(true);
    try{
      const navs=await fetchLiveNAVs(p.funds,{force:true});
      const matched=Object.keys(navs).length;
      if(matched===0){flash("Couldn't fetch live NAVs — showing statement values");}
      else{setLive(navs);flash(`Live NAVs loaded for ${matched} of ${fundAgg.length} schemes`);}
    }catch(e){flash("Couldn't fetch live NAVs — showing statement values");}
    setLiveBusy(false);
  };
  // auto-load NAVs when the tab opens (cache-first, silent on failure)
  useEffect(()=>{
    if(!p.funds.length)return;
    let alive=true;
    (async()=>{
      setLiveBusy(true);
      try{
        const navs=await fetchLiveNAVs(p.funds);
        if(alive&&Object.keys(navs).length)setLive(navs);
      }catch(e){/* statement values remain */}
      if(alive)setLiveBusy(false);
    })();
    return ()=>{alive=false;};
  },[p.funds.length]);
  const liveValueOf=name=>live&&live[name]?live[name].nav*(unitsBy[name]||0):null;
  const liveFCur=live?fundAgg.reduce((a,f)=>a+(liveValueOf(f.name)??f.current),0):null;

  if(!hasData)return (
    <div className="fade">
      <div className="glass" style={{padding:40,textAlign:"center",marginBottom:16}}>
        <img src={MASCOT} alt="Paisa mascot" width="104" height="104" style={{display:"block",margin:"0 auto"}}/>
        <h3 style={{fontFamily:"Inter, sans-serif",marginTop:10}}>Bring in your investments</h3>
        <p style={{color:"var(--txt2)",fontSize:14,maxWidth:520,margin:"6px auto 0",lineHeight:1.6}}>
          Export your holdings from Groww (<b>Profile → Reports → Stocks / Mutual funds holdings</b>) and drop the
          .xlsx here — no conversion needed. Stocks and mutual funds are tracked separately and merged into one view.
        </p>
      </div>
      <div className="glass" style={{padding:22}}><PortfolioImport onParsed={onParsed}/></div>
    </div>
  );

  return (
    <div className="fade">
      <div className="stat-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:18}}>
        <Hero label="Portfolio value" value={INR(cur)} accent="#079455" icon="📈"
          sub={`${signedINR(pnl)} (${pctStr(pnl,inv)}) on ${INR(inv)} invested`}/>
        <Stat label="Stocks" value={INR(sCur)} accent="#2E90FA" icon="◧"
          sub={p.stocks.length?`${p.stocks.length} holdings · ${signedINR(sCur-sInv)}${p.stocksAsOf?` · as on ${p.stocksAsOf.slice(8)}/${p.stocksAsOf.slice(5,7)}`:""}`:"not imported yet"}/>
        <Stat label="Mutual funds" value={INR(liveFCur??fCur)} accent="#DC6803" icon="◨"
          sub={p.funds.length?`${fundAgg.length} schemes · ${signedINR((liveFCur??fCur)-fInv)}${liveFCur!=null?" · live NAV":(p.fundsAsOf?` · as on ${p.fundsAsOf.slice(8)}/${p.fundsAsOf.slice(5,7)}`:"")}`:"not imported yet"}/>
        <Stat label="Unrealised P&L" value={signedINR(pnl)} accent={pnl>=0?"#079455":"#D92D20"} icon={pnl>=0?"▲":"▼"}
          sub={`${pctStr(pnl,inv)} overall`}/>
      </div>

      {user&&!Cloud.portfolioCol&&(
        <div style={{padding:"11px 15px",background:"rgba(220,104,3,.12)",color:"#DC6803",borderRadius:12,fontSize:13,marginBottom:16}}>
          Portfolio is saved on this device only — add the <b>portfolio</b> column to your Supabase table
          (one line of SQL in the README) to sync it across devices.
        </div>
      )}

      <AIInsightPanel user={user}/>

      {decisions.length>0&&(
        <div className="glass" style={{padding:22,marginBottom:16}}>
          <h3 style={{...ti,marginBottom:6}}>Decision insights</h3>
          <p style={{fontSize:12.5,color:"var(--txt3)",margin:"0 0 14px",lineHeight:1.6}}>
            Computed on your device from your actual holdings — nothing leaves the browser. Considerations, not instructions.
          </p>
          <div className="insight-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
            {decisions.map(d=>{const t=TONE[d.tone]||TONE.neutral; return (
              <div key={d.id} style={{padding:16,borderRadius:12,border:`1px solid ${t.bd}`,background:t.bg}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:18}}>{d.icon}</span>
                  <span style={{fontSize:13.5,fontWeight:700,color:t.c}}>{d.title}</span>
                </div>
                <p style={{fontSize:12.5,color:"var(--txt2)",lineHeight:1.6,margin:0}}>{d.body}</p>
              </div>);})}
          </div>
          <div style={{fontSize:10.5,color:"var(--txt3)",marginTop:12}}>
            Educational analysis of your own data — not SEBI-registered investment advice.
          </div>
        </div>
      )}

      {(movers.best||concentration)&&(
        <div className="insight-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14,marginBottom:16}}>
          {movers.best&&movers.best.pnl>0&&(
            <div className="glass" style={{padding:16,border:"1px solid rgba(7,148,85,.3)",background:"rgba(7,148,85,.08)"}}>
              <div style={{fontSize:12,color:"var(--txt3)"}}>🏆 Best performer</div>
              <div style={{fontWeight:700,marginTop:3}}>{movers.best.name}</div>
              <div style={{fontFamily:"Inter, sans-serif",fontWeight:700,color:"#079455"}}>+{movers.best.pct.toFixed(1)}% · {signedINR(movers.best.pnl)}</div>
            </div>)}
          {movers.worst&&movers.worst.pnl<0&&(
            <div className="glass" style={{padding:16,border:"1px solid rgba(217,45,32,.3)",background:"rgba(217,45,32,.08)"}}>
              <div style={{fontSize:12,color:"var(--txt3)"}}>🩹 Biggest drag</div>
              <div style={{fontWeight:700,marginTop:3}}>{movers.worst.name}</div>
              <div style={{fontFamily:"Inter, sans-serif",fontWeight:700,color:"#D92D20"}}>{movers.worst.pct.toFixed(1)}% · {signedINR(movers.worst.pnl)}</div>
            </div>)}
          {concentration&&concentration.share>15&&(
            <div className="glass" style={{padding:16,border:"1px solid rgba(220,104,3,.3)",background:"rgba(220,104,3,.08)"}}>
              <div style={{fontSize:12,color:"var(--txt3)"}}>⚖️ Concentration</div>
              <div style={{fontWeight:700,marginTop:3}}>{concentration.name}</div>
              <div style={{fontFamily:"Inter, sans-serif",fontWeight:700,color:"#DC6803"}}>{concentration.share.toFixed(0)}% of your stock portfolio</div>
            </div>)}
        </div>
      )}

      {catPie.length>0&&(
        <div className="ov-charts" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:16}}>
          <div className="glass" style={{padding:22}}>
            <h3 style={ti}>Asset allocation</h3>
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10}}>
              <div style={{width:190,height:190,flexShrink:0}}>
                <RC.ResponsiveContainer>
                  <RC.PieChart>
                    <RC.Pie data={catPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={86} paddingAngle={2} stroke="none">
                      {catPie.map((d,i)=><RC.Cell key={d.name} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </RC.Pie>
                    <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                  </RC.PieChart>
                </RC.ResponsiveContainer>
              </div>
              <div style={{flex:1,minWidth:170}}>
                {catPie.map((d,i)=>(
                  <div key={d.name} style={{display:"flex",alignItems:"center",gap:9,padding:"5px 0",borderBottom:"1px solid var(--line)"}}>
                    <span style={{width:10,height:10,borderRadius:3,background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                    <span style={{flex:1,fontSize:13,color:"var(--txt2)"}}>{d.name}</span>
                    <span style={{fontSize:13,fontWeight:700,fontFamily:"Inter, sans-serif"}}>{INR(d.value)}</span>
                    <span style={{fontSize:11,color:"var(--txt3)",width:36,textAlign:"right"}}>{cur>0?Math.round(d.value/cur*100):0}%</span>
                  </div>))}
              </div>
            </div>
          </div>
          {stockPie.length>0&&(
            <div className="glass" style={{padding:22}}>
              <h3 style={ti}>Stock allocation</h3>
              <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:10}}>
                <div style={{width:190,height:190,flexShrink:0}}>
                  <RC.ResponsiveContainer>
                    <RC.PieChart>
                      <RC.Pie data={stockPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={86} paddingAngle={2} stroke="none">
                        {stockPie.map((d,i)=><RC.Cell key={d.name} fill={PIE_COLORS[(i+3)%PIE_COLORS.length]}/>)}
                      </RC.Pie>
                      <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                    </RC.PieChart>
                  </RC.ResponsiveContainer>
                </div>
                <div style={{flex:1,minWidth:170}}>
                  {stockPie.map((d,i)=>(
                    <div key={d.name} style={{display:"flex",alignItems:"center",gap:9,padding:"5px 0",borderBottom:"1px solid var(--line)"}}>
                      <span style={{width:10,height:10,borderRadius:3,background:PIE_COLORS[(i+3)%PIE_COLORS.length],flexShrink:0}}/>
                      <span style={{flex:1,fontSize:12.5,color:"var(--txt2)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.name}</span>
                      <span style={{fontSize:12.5,fontWeight:700,fontFamily:"Inter, sans-serif"}}>{INR(d.value)}</span>
                    </div>))}
                </div>
              </div>
            </div>)}
        </div>
      )}

      {sortedStocks.length>0&&(
        <div className="glass" style={{padding:22,marginBottom:16}}>
          <h3 style={ti}>Stocks · {p.stocks.length} holdings{p.stocksAsOf?` · as on ${p.stocksAsOf}`:""}</h3>
          <div style={{overflowX:"auto"}}>
            <div style={{minWidth:560}}>
              <div style={{display:"grid",gridTemplateColumns:"minmax(160px,2fr) 60px 90px 100px 100px 110px",gap:8,padding:"6px 0",
                fontSize:10.5,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.6,borderBottom:"1px solid var(--line2)"}}>
                <span>Stock</span><span style={{textAlign:"right"}}>Qty</span><span style={{textAlign:"right"}}>Avg</span>
                <span style={{textAlign:"right"}}>LTP</span><span style={{textAlign:"right"}}>Value</span><span style={{textAlign:"right"}}>P&L</span>
              </div>
              {sortedStocks.map(r=>(
                <div key={r.isin||r.name} style={{display:"grid",gridTemplateColumns:"minmax(160px,2fr) 60px 90px 100px 100px 110px",gap:8,
                  padding:"10px 0",borderBottom:"1px solid var(--line)",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:13.5,fontWeight:600}}>{r.name}</div>
                    <div style={{fontSize:11,color:"var(--txt3)"}}>{INR(r.buyValue)} invested</div>
                  </div>
                  <span style={{textAlign:"right",fontSize:13,fontFamily:"Inter, sans-serif"}}>{r.qty}</span>
                  <span style={{textAlign:"right",fontSize:13,fontFamily:"Inter, sans-serif"}}>{INR2(r.avg)}</span>
                  <span style={{textAlign:"right",fontSize:13,fontFamily:"Inter, sans-serif"}}>{INR2(r.ltp)}</span>
                  <span style={{textAlign:"right",fontSize:13,fontWeight:700,fontFamily:"Inter, sans-serif"}}>{INR(r.curValue)}</span>
                  <span style={{textAlign:"right",fontSize:12.5,fontWeight:700,fontFamily:"Inter, sans-serif",color:pnlColor(r.pnl)}}>
                    {signedINR(r.pnl)}<div style={{fontSize:10.5,fontWeight:600}}>{pctStr(r.pnl,r.buyValue)}</div>
                  </span>
                </div>))}
            </div>
          </div>
        </div>
      )}

      {fundAgg.length>0&&(
        <div className="glass" style={{padding:22,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:16}}>
            <h3 style={{...ti,margin:0}}>Mutual funds · {fundAgg.length} schemes{p.fundsAsOf&&!live?` · as on ${p.fundsAsOf}`:""}</h3>
            <button className="chip ghost" style={{padding:"7px 14px",fontSize:12.5,opacity:liveBusy?.6:1}} onClick={refreshNAVs} disabled={liveBusy}>
              {liveBusy?"Fetching NAVs…":live?"↻ Refresh live NAV":"↻ Get live NAV"}
            </button>
          </div>
          {fundAgg.map((f,i)=>{
            const lv=liveValueOf(f.name);
            const shown=lv??f.current;
            const gain=shown-f.invested;
            return (
            <div key={f.name} className="row" style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:"1px solid var(--line)"}}>
              <span style={{width:4,height:40,borderRadius:4,background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13.5,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.name}</div>
                <div style={{fontSize:11.5,color:"var(--txt3)"}}>{f.category}{f.subCategory?` · ${f.subCategory}`:""}{f.folios>1?` · ${f.folios} folios`:""}
                  {lv!=null&&<span style={{color:"var(--accent2)",fontWeight:700}}> · NAV ₹{live[f.name].nav} ({live[f.name].date})</span>}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:14,fontWeight:700,fontFamily:"Inter, sans-serif"}}>{INR(shown)}
                  {lv!=null&&<span style={{fontSize:9,fontWeight:800,color:"#fff",background:"var(--accent2)",borderRadius:5,padding:"1.5px 5px",marginLeft:6,verticalAlign:"middle"}}>LIVE</span>}
                </div>
                <div style={{fontSize:11.5,fontWeight:600,color:pnlColor(gain)}}>{signedINR(gain)} ({pctStr(gain,f.invested)})</div>
              </div>
            </div>);})}
        </div>
      )}

      {p.history.length>1&&(
        <div className="glass" style={{padding:22,marginBottom:16}}>
          <h3 style={ti}>Portfolio over time</h3>
          <p style={{fontSize:12,color:"var(--txt3)",margin:"0 0 12px"}}>One point per imported statement — keep importing weekly to grow the trend.</p>
          <div className="chart-box" style={{height:220}}>
            <RC.ResponsiveContainer>
              <RC.LineChart data={p.history.map(h=>({...h,label:`${h.date.slice(8)}/${h.date.slice(5,7)}`}))}>
                <RC.CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" vertical={false}/>
                <RC.XAxis dataKey="label" tick={{fontSize:11,fill:"#667085"}}/>
                <RC.YAxis tickFormatter={v=>"₹"+Math.round(v/1000)+"k"} tick={{fontSize:11,fill:"#98A2B3"}}/>
                <RC.Tooltip contentStyle={tip} formatter={v=>INR(v)}/>
                <RC.Line dataKey="current" name="Value" stroke="#0E9384" strokeWidth={3} dot={{r:4,fill:"#0E9384"}}/>
                <RC.Line dataKey="invested" name="Invested" stroke="#8794B8" strokeWidth={2} strokeDasharray="5 4" dot={{r:3,fill:"#8794B8"}}/>
              </RC.LineChart>
            </RC.ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="glass" style={{padding:22}}>
        <h3 style={ti}>Update holdings</h3>
        <p style={{fontSize:12.5,color:"var(--txt3)",margin:"0 0 14px",lineHeight:1.6}}>
          Import a fresh statement anytime — it replaces the matching section (stocks or funds) with the new snapshot
          and adds a point to the trend above.
        </p>
        <PortfolioImport onParsed={onParsed} compact/>
      </div>
    </div>
  );
}

/* ---------------- bits ---------------- */
function Empty({msg}){return <div style={{padding:"30px 16px",textAlign:"center",color:"var(--txt3)",fontSize:13.5,lineHeight:1.6}}>{msg}</div>;}
const ti={margin:"0 0 16px",fontFamily:"Inter, sans-serif",fontSize:16,fontWeight:700,letterSpacing:-.2};
const lbl={fontSize:11,color:"var(--txt3)",textTransform:"uppercase",letterSpacing:.6,fontWeight:600};
const tip={background:"#101828",border:"1px solid #101828",borderRadius:12,color:"#F2F5FA",fontSize:13};


function App(){
  const [phase,setPhase]=useState("boot"); // boot | auth | ready | localonly
  const [user,setUser]=useState(null);
  const [data,setData]=useState(null);
  const [cloud,setCloud]=useState("local");
  const saveTimer=useRef(null);

  // If Supabase isn't configured, run in local-only mode (no login).
  useEffect(()=>{
    if(!SUPABASE_READY || !sb){
      setData(loadLocal(null)); setPhase("localonly"); return;
    }
    sb.auth.getSession().then(({data:{session}})=>{
      if(session && session.user){ enter(session.user); }
      else { setPhase("auth"); }
    });
    const {data:sub}=sb.auth.onAuthStateChange((_e,session)=>{
      if(session && session.user){ if(phase!=="ready") enter(session.user); }
      else { setUser(null); setData(null); setPhase("auth"); }
    });
    return ()=>{ sub && sub.subscription && sub.subscription.unsubscribe(); };
  },[]);

  async function enter(u){
    setUser(u); setPhase("boot"); setCloud("syncing");
    try{
      let remote=await Cloud.load(u.id);
      if(!remote){
        // Brand-new account: start EMPTY. Never inherit another user's
        // device cache. (Migration is an explicit opt-in action elsewhere.)
        const fresh={txns:[],income:{},budgets:DEFAULTS.budgets,portfolio:EMPTY_PORTFOLIO};
        await Cloud.save(u.id, fresh);
        remote=fresh;
      }
      const d={
        txns:sanitizeTxns(remote.txns||[]),
        income:remote.income||{},
        budgets:remote.budgets||DEFAULTS.budgets,
        portfolio:sanitizePortfolio(remote.portfolio)
      };
      setData(d); saveLocal(u.id,d); setCloud("synced"); setPhase("ready");
    }catch(e){
      console.error(e);
      // fall back to THIS user's own cache only
      setData(loadLocal(u.id)); setCloud("offline"); setPhase("ready");
    }
  }

  // persist: cache locally (per-user) + push to cloud. immediate=true skips
  // the debounce so large imports commit atomically right away.
  const persist=(d,immediate)=>{
    setData(d); saveLocal(user?user.id:null,d);
    if(user && sb){
      setCloud("syncing");
      clearTimeout(saveTimer.current);
      const doSave=async()=>{
        try{ await Cloud.save(user.id,d); setCloud("synced"); }
        catch(e){ console.error(e); setCloud("offline"); }
      };
      if(immediate){ doSave(); }
      else { saveTimer.current=setTimeout(doSave,800); }
    }
  };

  const signOut=async()=>{ if(sb) await sb.auth.signOut(); setUser(null); setData(null); setCloud("local"); setPhase("auth"); };

  if(phase==="boot") return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      <div className="aurora"><b className="a1"/><b className="a2"/></div>
      <div style={{position:"relative",textAlign:"center"}}>
        <div className="brand" style={{justifyContent:"center"}}>
          <span className="brand-badge" style={{width:50,height:50,borderRadius:15,fontSize:27}}>₹</span>
          <span className="brand-word" style={{fontSize:38}}>paisa</span>
        </div>
        <div style={{color:"#98A2B3",fontSize:13,marginTop:12}}>loading your money…</div>
      </div>
    </div>
  );
  if(phase==="auth") return <Auth onAuthed={enter}/>;
  if(!data) return null;
  if(phase==="localonly")
    return <Tracker initial={data} persist={persist} user={null} onSignOut={()=>{}} cloud="local"/>;
  return <Tracker initial={data} persist={persist} user={user} onSignOut={signOut} cloud={cloud}/>;
}


export default App;
