// Paisa — pure logic & data layer (no React).
import { createClient } from "@supabase/supabase-js";

export const APP_VERSION = "v3.0.0";

/* ---------------- helpers ---------------- */
const INR=(n)=>"₹"+Math.round(n).toLocaleString("en-IN");
const INR2=(n)=>"₹"+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const titleCase=(s)=>s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

const CATEGORIES=["Food & Dining","Groceries & Quick-commerce","Rent & Utilities",
 "Travel & Transport","Fuel","Shopping","Health & Pharmacy","Subscriptions",
 "Sports & Leisure","Electronics & Repairs","Friends & Splitwise","Govt & Fees",
 "Credit Card Bill","Other / Misc","Investments","Savings/FD","Income"];
const NONSPEND=new Set(["Investments","Savings/FD","Income"]);
const CAT_COLOR={
 "Food & Dining":"#F97949","Groceries & Quick-commerce":"#31C48D","Rent & Utilities":"#26C296",
 "Travel & Transport":"#2DD4A7","Fuel":"#4D9FFF","Shopping":"#F4506E","Health & Pharmacy":"#5FD0C0",
 "Subscriptions":"#F5B84D","Sports & Leisure":"#56CCF2","Electronics & Repairs":"#C49A6C",
 "Friends & Splitwise":"#FF77A9","Govt & Fees":"#8794B8","Credit Card Bill":"#E0B84D",
 "Other / Misc":"#6E7BA0","Investments":"#31C48D","Savings/FD":"#2DD4A7","Income":"#10B981"};
const colorFor=(c)=>CAT_COLOR[c]||"#6E7BA0";

const SUB_SERVICES=[
 {k:["NETFLIX"],name:"Netflix"},{k:["YOUTUBE"],name:"YouTube Premium"},
 {k:["APPLE MEDIA","APPLESERVICES","APPLE SERVICES"],name:"Apple Services"},
 {k:["SPOTIFY"],name:"Spotify"},{k:["AMAZON PRIME","PRIME VIDEO"],name:"Amazon Prime"},
 {k:["HOTSTAR","DISNEY"],name:"Disney+ Hotstar"},{k:["JIOCINEMA"],name:"JioCinema"},
 {k:["GOOGLE ONE","GOOGLE STORAGE"],name:"Google One"},{k:["CHATGPT","OPENAI"],name:"ChatGPT"},
 {k:["LINKEDIN"],name:"LinkedIn"},{k:["NORD","VPN"],name:"VPN"},
];
function detectSub(s){
  const u=s.toUpperCase();
  for(const sv of SUB_SERVICES){ if(sv.k.some(k=>u.includes(k))) return sv.name; }
  if(u.includes("AUTOPAY")||u.includes("MANDATE")||u.includes("SI ")) return "Recurring";
  return null;
}

function autoCategory(n){
  const s=(n||"").toUpperCase(); const segs=s.split("-");
  const note=(segs[segs.length-1]||"").trim();
  const has=a=>a.some(k=>s.includes(k)); const nh=a=>a.some(k=>note.includes(k));
  if(has(["GROWW","MUTUAL FUNDS ICCL","MONTHLY SIP","GROWW.BRK"]))return"Investments";
  if(has(["FD THROUGH MOBILE","RD THROUGH MOBILE"]))return"Savings/FD";
  if(has(["SALARY","PAYROLL","WAGES"]))return"Income";
  if(detectSub(s))return"Subscriptions";
  if(has(["CRED CLUB"])||nh(["PAYMENT ON CRED"]))return"Credit Card Bill";
  if(has(["SWIGGY","ZOMATO","DOMINOS","KFC","CAFE COFFEE","CHAI","TEA SHOP","TIFFINS","RESTAURANT","FOODS","BENE DOSA","CJB","FRIED AND BUN"]))return"Food & Dining";
  if(nh(["ICECREAM","ICE CREAM","COFFEE","POPCORN","POLAR BEAR","CHOCLATES","SNACKS","DINNER","BREAKFAST","LUNCH","MOJITO","JUICE","GATORADE","WATER","CILANTRO"]))return"Food & Dining";
  if(has(["BLINKIT","ZEPTO","SUPER M","SUPER MARKET","GREEN LAND"]))return"Groceries & Quick-commerce";
  if(has(["APOLLO","PHARMAC"]))return"Health & Pharmacy";
  if(has(["REDBUS","MAKEMYTRIP","INDIAN RAILWAYS","IRCTC","UBER","OLA","RAPIDO"]))return"Travel & Transport";
  if(nh(["PETROL","FUEL"]))return"Fuel";
  if(has(["LENSKART","MYNTRA","AMAZON","FLIPKART","AJIO"]))return"Shopping";
  if(has(["SPORTS ARENA"])||nh(["SHUTTLE"]))return"Sports & Leisure";
  if(nh(["RENT"]))return"Rent & Utilities";
  if(has(["PASSPORT"]))return"Govt & Fees";
  if(has(["INFO SYSTEMS"])||nh(["BATTERY"]))return"Electronics & Repairs";
  if(nh(["SPLITWISE"]))return"Friends & Splitwise";
  return"Other / Misc";
}
function cleanMerchant(n){
  n=(n||"").toString();
  const sub=detectSub(n); if(sub&&sub!=="Recurring")return sub;
  if(n.toUpperCase().startsWith("UPI-")){const p=n.split("-"); if(p.length>1)return titleCase(p[1].trim());}
  return titleCase(n.split("-")[0].trim());
}
const monthKey=(iso)=>(typeof iso==="string"&&iso.length>=7)?iso.slice(0,7):"0000-00";

// A credit counts as real income only if it's salary or bank interest.
function isIncome(t){
  if(t.amount<=0) return false;
  if(t.category==="Income") return true;            // explicit manual income
  const s=((t.merchant||"")+" "+(t.note||"")).toUpperCase();
  return /\bSALARY\b|\bSAL\b|INTEREST PAID|INTEREST CREDIT|\bPAYROLL\b|\bWAGES\b/.test(s);
}
// Compute income / credits / balances per month from the transactions.
function monthlyFinancials(txns){
  const out={}; // mk -> {income, credits, lastBal, lastDate}
  txns.forEach(t=>{
    const mk=monthKey(t.date);
    if(!out[mk]) out[mk]={income:0,credits:0,lastBal:null,lastDate:""};
    if(t.amount>0){ out[mk].credits+=t.amount; if(isIncome(t)) out[mk].income+=t.amount; }
    if(typeof t.balance==="number" && t.date>=out[mk].lastDate){ out[mk].lastBal=t.balance; out[mk].lastDate=t.date; }
  });
  // opening balance = previous month's closing
  const keys=Object.keys(out).sort();
  keys.forEach((mk,i)=>{ out[mk].closing=out[mk].lastBal; out[mk].opening=i>0?out[keys[i-1]].lastBal:null; });
  return out;
}

/* Single source of truth for a month's income. */
function resolveIncome(income, fin, mk){
  if(income && typeof income[mk]==="number") return income[mk];
  if(income && typeof income.default==="number") return income.default;
  if(fin && fin[mk] && fin[mk].income>0) return fin[mk].income;
  return 0;
}

/* ============================================================
   SINGLE SOURCE OF TRUTH for month math. Used by Overview,
   Trends, Insights and Health so every tab agrees to the rupee.
   - Refunds (credits in spend categories) NET against spending.
   - Investments / Savings-FD tracked separately, also netted.
   ============================================================ */
function monthMetrics(txns, mk){
  let spend=0,invest=0,savings=0,ccbill=0,subs=0,refunds=0; const byCat={};
  txns.forEach(t=>{
    if(monthKey(t.date)!==mk) return;
    if(t.category==="Income") return;
    if(t.category==="Investments"){ invest+=-t.amount; return; }   // credit = redemption, nets out
    if(t.category==="Savings/FD"){ savings+=-t.amount; return; }
    // spend categories: debits add, credits (refunds) subtract
    const signed=-t.amount;            // debit -> positive spend, credit -> negative
    if(signed<0) refunds+=-signed;
    if(t.category==="Credit Card Bill") ccbill+=signed;
    if(t.category==="Subscriptions") subs+=signed;
    spend+=signed;
    byCat[t.category]=(byCat[t.category]||0)+signed;
  });
  // clamp category noise: drop categories that netted to ~0 or negative
  Object.keys(byCat).forEach(k=>{ if(byCat[k]<1) delete byCat[k]; });
  return{spend:Math.max(spend,0),invest:Math.max(invest,0),savings:Math.max(savings,0),
    ccbill:Math.max(ccbill,0),subs:Math.max(subs,0),refunds,byCat};
}
/* One consistent savings-rate definition: what fraction of income
   didn't get consumed. (income − spending) / income, clamped 0-100. */
function savingsRate(inc, spend){
  if(!(inc>0)) return 0;
  return Math.max(0, Math.min(100, Math.round(((inc-spend)/inc)*100)));
}
const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthLabel=(k)=>{if(typeof k!=="string"||k.indexOf("-")<0)return"—";const[y,m]=k.split("-");return`${MN[+m-1]||"?"} ${y}`;};

function toISODate(s){
  s=(s||"").trim();
  let m=s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if(m){let[,d,mo,y]=m; if(y.length===2)y="20"+y; return`${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;}
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m)return`${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  const dt=new Date(s); if(!isNaN(dt))return dt.toISOString().slice(0,10);
  return null;
}
const num=(x)=>{if(x==null)return NaN; const v=parseFloat(String(x).replace(/[, ]/g,"")); return isNaN(v)?NaN:v;};

function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim()!=="");
  if(!lines.length)return[];
  const delim=(lines[0].match(/\t/g)||[]).length>=(lines[0].match(/,/g)||[]).length?"\t":",";
  return lines.map(line=>{
    const out=[];let cur="";let q=false;
    for(let i=0;i<line.length;i++){const ch=line[i];
      if(ch==='"'){q=!q;continue;}
      if(ch===delim&&!q){out.push(cur);cur="";continue;}
      cur+=ch;}
    out.push(cur); return out.map(c=>c.trim());
  });
}
function rowsToTxns(rows){
  if(!rows.length)return{txns:[],skipped:0};
  let hi=rows.findIndex(r=>r.some(c=>/date/i.test(c))&&r.some(c=>/narration|description|particular|details|remark/i.test(c)));
  let header=hi>=0?rows[hi].map(c=>c.toLowerCase()):null;
  const body=hi>=0?rows.slice(hi+1):rows;
  const col=names=>{if(!header)return -1; for(const n of names){const i=header.findIndex(h=>h.includes(n)); if(i>=0)return i;} return -1;};
  const ci={date:col(["date"]),narr:col(["narration","description","particular","details","remark"]),
    ref:col(["ref","chq","cheque"]),
    withdraw:col(["withdrawal","debit","dr"]),deposit:col(["deposit","credit","cr"]),amount:col(["amount"]),
    balance:col(["closing balance","balance"])};
  const txns=[];let skipped=0;
  body.forEach((r,idx)=>{
    if(!r.length||r.every(c=>c===""||/^\*+$/.test(c)))return;
    let dateStr=ci.date>=0?r[ci.date]:r.find(c=>toISODate(c));
    const iso=toISODate(dateStr); if(!iso){skipped++;return;}
    let amount=NaN;
    if(ci.withdraw>=0||ci.deposit>=0){const w=num(r[ci.withdraw]);const d=num(r[ci.deposit]);
      if(!isNaN(d)&&d!==0)amount=d; else if(!isNaN(w)&&w!==0)amount=-w;}
    else if(ci.amount>=0)amount=num(r[ci.amount]);
    else{const ns=r.map(num).map((v,i)=>({v,i})).filter(x=>!isNaN(x.v)); if(ns.length)amount=-Math.abs(ns[0].v);}
    if(isNaN(amount)||amount===0){skipped++;return;}
    const narr=ci.narr>=0?r[ci.narr]:r.join(" ");
    const segs=narr.split("-");
    const ref=(ci.ref>=0&&r[ci.ref])?String(r[ci.ref]).trim():"";
    const bal=(ci.balance>=0)?num(r[ci.balance]):NaN;
    txns.push({id:`imp-${Date.now()}-${idx}-${Math.random().toString(36).slice(2,6)}`,
      date:iso,merchant:cleanMerchant(narr),note:(segs[segs.length-1]||"").trim().slice(0,30),
      amount:Math.round(amount*100)/100,category:autoCategory(narr),ref:ref,
      balance:isNaN(bal)?null:bal});
  });
  return{txns,skipped};
}

/* ============================================================
   PORTFOLIO (Groww holdings statements)
   Handles both Groww exports:
   - Stocks:  "Stock Name | ISIN | Quantity | Average buy price | Buy value
               | Closing price | Closing value | Unrealised P&L"
   - Mutual funds: "Scheme Name | AMC | Category | Sub-category | Folio No.
               | Source | Units | Invested Value | Current Value | Returns | XIRR"
   Each import is a full snapshot: it REPLACES the stocks (or funds)
   section and appends a point to the history trend.
   ============================================================ */
const EMPTY_PORTFOLIO={stocks:[],funds:[],stocksAsOf:null,fundsAsOf:null,history:[]};

function sanitizePortfolio(p){
  if(!p||typeof p!=="object")return{...EMPTY_PORTFOLIO};
  return{stocks:Array.isArray(p.stocks)?p.stocks:[],funds:Array.isArray(p.funds)?p.funds:[],
    stocksAsOf:p.stocksAsOf||null,fundsAsOf:p.fundsAsOf||null,
    history:Array.isArray(p.history)?p.history:[]};
}

function parseHoldingsRows(rows){
  if(!Array.isArray(rows)||!rows.length)return null;
  // "as on" date appears in a preamble row in both formats
  let asOf=null;
  for(const r of rows.slice(0,30)){
    const line=(r||[]).map(c=>c==null?"":String(c)).join(" ");
    let m=line.match(/as on (\d{2}-\d{2}-\d{4})/i);
    if(m){asOf=`${m[1].slice(6,10)}-${m[1].slice(3,5)}-${m[1].slice(0,2)}`;break;}
    m=line.match(/as on (\d{4}-\d{2}-\d{2})/i);
    if(m){asOf=m[1];break;}
  }
  const low=r=>(r||[]).map(c=>String(c==null?"":c).toLowerCase().trim());

  const si=rows.findIndex(r=>{const l=low(r);return l.includes("stock name")&&l.includes("isin");});
  if(si>=0){
    const h=low(rows[si]); const col=n=>h.findIndex(c=>c.includes(n));
    const ci={name:col("stock name"),isin:col("isin"),qty:col("quantity"),avg:col("average buy"),
      buyVal:col("buy value"),ltp:col("closing price"),curVal:col("closing value"),pnl:col("unrealised")};
    const out=[];
    rows.slice(si+1).forEach(r=>{
      if(!r||r[ci.name]==null||String(r[ci.name]).trim()==="")return;
      const qty=num(r[ci.qty]); if(isNaN(qty)||qty===0)return;
      out.push({name:titleCase(String(r[ci.name]).trim()),isin:String(r[ci.isin]||"").trim(),qty,
        avg:num(r[ci.avg])||0,buyValue:num(r[ci.buyVal])||0,ltp:num(r[ci.ltp])||0,
        curValue:num(r[ci.curVal])||0,pnl:num(r[ci.pnl])||0});
    });
    if(out.length)return{kind:"stocks",rows:out,asOf};
  }

  const fi=rows.findIndex(r=>{const l=low(r);return l.some(c=>c.includes("scheme name"))&&l.includes("units");});
  if(fi>=0){
    const h=low(rows[fi]); const col=n=>h.findIndex(c=>c.includes(n));
    const ci={name:col("scheme name"),amc:col("amc"),cat:col("category"),sub:col("sub-category"),
      folio:col("folio"),units:col("units"),inv:col("invested"),cur:col("current"),ret:col("returns"),xirr:col("xirr")};
    const out=[];
    rows.slice(fi+1).forEach(r=>{
      if(!r||r[ci.name]==null||String(r[ci.name]).trim()==="")return;
      const units=num(r[ci.units]); if(isNaN(units)||units===0)return;
      out.push({name:String(r[ci.name]).trim(),amc:String(r[ci.amc]||"").trim(),
        category:String(r[ci.cat]||"").trim(),subCategory:String(r[ci.sub]||"").trim(),
        folio:String(r[ci.folio]||"").trim(),units,invested:num(r[ci.inv])||0,
        current:num(r[ci.cur])||0,returns:num(r[ci.ret])||0,xirr:String(r[ci.xirr]||"").trim()});
    });
    if(out.length)return{kind:"funds",rows:out,asOf};
  }
  return null;
}

function mergePortfolio(prev,parsed){
  const p={...EMPTY_PORTFOLIO,...sanitizePortfolio(prev)};
  const asOf=parsed.asOf||new Date().toISOString().slice(0,10);
  if(parsed.kind==="stocks"){p.stocks=parsed.rows;p.stocksAsOf=asOf;}
  else{p.funds=parsed.rows;p.fundsAsOf=asOf;}
  const invested=parsed.rows.reduce((a,r)=>a+(parsed.kind==="stocks"?r.buyValue:r.invested),0);
  const current=parsed.rows.reduce((a,r)=>a+(parsed.kind==="stocks"?r.curValue:r.current),0);
  p.history=p.history.filter(x=>!(x.type===parsed.kind&&x.date===asOf));
  p.history.push({type:parsed.kind,date:asOf,invested:Math.round(invested),current:Math.round(current)});
  p.history.sort((a,b)=>a.date.localeCompare(b.date));
  if(p.history.length>104)p.history=p.history.slice(-104);
  return p;
}


/* ============================================================
   DECISION INSIGHTS — rule-based, computed entirely on-device
   from the user's own holdings. No backend, no API keys, works
   offline. Every card cites the user's actual numbers; phrased
   as considerations, never instructions.
   ============================================================ */
function computeDecisionInsights(port){
  const p=sanitizePortfolio(port);
  const out=[];
  const sCur=p.stocks.reduce((a,r)=>a+r.curValue,0);
  const fCur=p.funds.reduce((a,r)=>a+r.current,0);
  const total=sCur+fCur;
  if(total<=0)return out;
  const pct=(x,base)=>base>0?x/base*100:0;

  // single-stock concentration
  if(p.stocks.length>=3){
    const top=[...p.stocks].sort((a,b)=>b.curValue-a.curValue)[0];
    const share=pct(top.curValue,sCur);
    if(share>=20)out.push({id:"conc",tone:"warn",icon:"⚖️",title:`${top.name} is ${Math.round(share)}% of your stocks`,
      body:`If it fell 30%, that's ${INR(top.curValue*0.3)} gone from one name. A common guardrail is capping single stocks near 10–15% — trimming toward that and moving the excess to a broad index fund reduces single-company risk without leaving the market.`});
  }

  // deep losers → thesis check + loss harvesting
  p.stocks.filter(r=>r.buyValue>0&&r.pnl/r.buyValue<=-0.20).forEach(r=>{
    out.push({id:"loss-"+(r.isin||r.name),tone:"bad",icon:"🩹",title:`${r.name} is down ${Math.round(-r.pnl/r.buyValue*100)}%`,
      body:`The honest question: would you buy it fresh today at ₹${r.ltp}? If the reason you bought broke, exiting frees ${INR(r.curValue)} for better ideas — and the booked loss can offset capital-gains tax (loss harvesting). If the thesis is intact, fine — but avoid averaging down just to fix the average.`});
  });

  // strong winners → rebalancing consideration
  p.stocks.filter(r=>r.buyValue>0&&r.pnl/r.buyValue>=0.40).forEach(r=>{
    out.push({id:"win-"+(r.isin||r.name),tone:"good",icon:"🏆",title:`${r.name} is up ${Math.round(r.pnl/r.buyValue*100)}%`,
      body:`${INR(r.pnl)} of gain is still on paper. Selling a slice back to your original position size locks some profit while staying invested — winners that ran often become the concentration risk of next year.`});
  });

  // dust positions
  const dust=p.stocks.filter(r=>r.curValue>0&&r.curValue<sCur*0.02);
  if(dust.length>=2){
    out.push({id:"dust",tone:"neutral",icon:"🧹",title:`${dust.length} positions are under 2% each`,
      body:`${dust.map(d=>d.name).join(", ")} add up to just ${INR(dust.reduce((a,d)=>a+d.curValue,0))}. Even a double in any of them barely moves your portfolio — consider consolidating into your highest-conviction holdings or your index fund.`});
  }

  // equity vs debt buffer
  const debtish=p.funds.filter(f=>/debt|arbitrage|liquid|overnight|money market|gilt/i.test(f.category+" "+f.subCategory)).reduce((a,f)=>a+f.current,0);
  const equityShare=pct(total-debtish,total);
  if(equityShare>=90){
    out.push({id:"alloc",tone:"warn",icon:"🛟",title:`${Math.round(equityShare)}% of this portfolio is equity`,
      body:`Only ${INR(debtish)} sits in debt/arbitrage. A normal 30% equity drawdown would show as ${INR((total-debtish)*0.3)} of red — survivable only if none of this money is needed within ~3 years. If some is, building the FD/debt side first is the boring, correct move.`});
  }

  // small-cap tilt
  const smallCap=p.funds.filter(f=>/small/i.test(f.subCategory)).reduce((a,f)=>a+f.current,0);
  const scShare=pct(smallCap,fCur);
  if(fCur>0&&scShare>=35){
    out.push({id:"smallcap",tone:"warn",icon:"🎢",title:`${Math.round(scShare)}% of your MF money is in small-caps`,
      body:`Small-caps have delivered the best long-run returns and the worst crashes (50%+ drawdowns happen). This tilt is great with a 7+ year horizon and strong nerves; if not, pointing new SIPs at flexi-cap/index funds rebalances gradually without selling.`});
  }

  // duplicate funds in the same sub-category
  const bySub={};
  p.funds.forEach(f=>{const k=(f.subCategory||"other").toLowerCase(); (bySub[k]=bySub[k]||new Set()).add(f.name);});
  Object.entries(bySub).filter(([,names])=>names.size>=2).forEach(([k,names])=>{
    out.push({id:"dupe-"+k,tone:"neutral",icon:"👯",title:`${names.size} funds in the same category (${titleCase(k)})`,
      body:`${[...names].join(" and ")} very likely hold overlapping stocks — two funds in one category isn't double diversification, it's double paperwork. One well-chosen fund per category is usually enough.`});
  });

  // sector cluster: banks
  const banks=p.stocks.filter(r=>/bank/i.test(r.name));
  const bankVal=banks.reduce((a,r)=>a+r.curValue,0);
  if(banks.length>=2&&pct(bankVal,sCur)>=25){
    out.push({id:"banks",tone:"neutral",icon:"🏦",title:`Banking is ${Math.round(pct(bankVal,sCur))}% of your stocks`,
      body:`${banks.map(b=>b.name).join(", ")} all ride the same rate cycle and credit environment — they tend to fall together. Worth knowing that your "diversified" stock list has a sector bet inside it.`});
  }

  // index core check
  const hasIndex=p.funds.some(f=>/index|nifty|sensex/i.test(f.name));
  if(fCur>0&&!hasIndex){
    out.push({id:"index",tone:"neutral",icon:"🧱",title:"No index fund in the portfolio",
      body:`Most active funds trail their index over 10 years after fees. A low-cost Nifty 50 / Nifty 500 index fund as the core, with your active picks around it, keeps costs down and removes fund-manager risk from the base.`});
  }

  const rank={bad:0,warn:1,good:2,neutral:3};
  return out.sort((a,b)=>rank[a.tone]-rank[b.tone]);
}

/* ============================================================
   LIVE MF NAVs via api.mfapi.in — free, keyless, CORS-open,
   updated daily from AMFI. Best-effort: any failure just means
   we keep showing statement values.
   ============================================================ */
const navNorm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
async function fetchLiveNAVs(funds){
  const names=[...new Set((funds||[]).map(f=>f.name))];
  const out={};
  await Promise.all(names.map(async name=>{
    try{
      const q=navNorm(name).split(" ").slice(0,4).join(" ");
      const res=await fetch("https://api.mfapi.in/mf/search?q="+encodeURIComponent(q));
      if(!res.ok)return;
      const list=await res.json();
      if(!Array.isArray(list))return;
      const tokens=navNorm(name).split(" ").filter(t=>t.length>1);
      let best=null,bestScore=0;
      for(const c of list){
        const cn=navNorm(c.schemeName);
        let score=tokens.filter(t=>cn.includes(t)).length/Math.max(tokens.length,1);
        if(/direct/.test(navNorm(name))!==/direct/.test(cn))score-=0.5;
        if(/idcw|dividend|bonus/.test(cn))score-=0.4;
        if(score>bestScore){bestScore=score;best=c;}
      }
      if(!best||bestScore<0.75)return;
      const nres=await fetch("https://api.mfapi.in/mf/"+best.schemeCode+"/latest");
      if(!nres.ok)return;
      const nj=await nres.json();
      const nav=parseFloat(nj&&nj.data&&nj.data[0]&&nj.data[0].nav);
      if(!isFinite(nav)||nav<=0)return;
      out[name]={nav,date:nj.data[0].date,matched:best.schemeName};
    }catch(e){/* best-effort */}
  }));
  return out;
}

/* ---------------- storage (localStorage, retains years) ---------------- */
/* ============================================================
   CONFIG — paste your Supabase project values here.
   Both are PUBLIC keys, safe to commit. Row-Level Security
   (set up via the SQL in the README) is what protects data.
   ============================================================ */
// Supplied at build time (GitHub Actions secrets → VITE_* env vars; locally
// via a .env file). Note: the anon key is still PUBLIC by design — it ships
// in the built JS either way. RLS is what protects the data; keeping it out
// of the repo is hygiene, not secrecy.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const SUPABASE_READY = SUPABASE_URL.indexOf("http")===0 && SUPABASE_ANON_KEY.length>20;

let sb = null;
if(SUPABASE_READY){
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* local cache (offline + migration source) */
const LS={
  get(k,def){try{const v=localStorage.getItem("paisa_"+k);return v?JSON.parse(v):def;}catch{return def;}},
  set(k,v){try{localStorage.setItem("paisa_"+k,JSON.stringify(v));}catch(e){console.error(e);}},
  del(k){try{localStorage.removeItem("paisa_"+k);}catch(e){}}
};

/* ---------------- cloud data layer ----------------
   One row per user in table `paisa_data` (columns: user_id uuid PK,
   txns jsonb, income jsonb, budgets jsonb, updated_at). Simple and
   atomic for a personal app — the whole blob is saved together.    */
const Cloud = {
  // Set false automatically when the `portfolio` column doesn't exist yet
  // (older Supabase setups) — the app keeps working, portfolio stays local.
  portfolioCol:true,
  async load(userId){
    let res=await sb.from("paisa_data").select("txns,income,budgets,portfolio").eq("user_id",userId).maybeSingle();
    if(res.error && /portfolio/i.test(res.error.message||"")){
      Cloud.portfolioCol=false;
      res=await sb.from("paisa_data").select("txns,income,budgets").eq("user_id",userId).maybeSingle();
    }
    if(res.error) throw res.error;
    return res.data;
  },
  async save(userId, payload){
    const row={user_id:userId, txns:payload.txns, income:payload.income, budgets:payload.budgets,
      updated_at:new Date().toISOString()};
    if(Cloud.portfolioCol) row.portfolio=payload.portfolio||EMPTY_PORTFOLIO;
    let {error}=await sb.from("paisa_data").upsert(row,{onConflict:"user_id"});
    if(error && /portfolio/i.test(error.message||"")){
      Cloud.portfolioCol=false; delete row.portfolio;
      ({error}=await sb.from("paisa_data").upsert(row,{onConflict:"user_id"}));
    }
    if(error) throw error;
  }
};


/* ---------------- SEED ---------------- */
const SEED=[];

/* ---------------- App: auth + data orchestration ---------------- */
const DEFAULTS={
  txns:SEED,
  income:{},  // no preset salary; user sets it via Overview → Income → Set
  budgets:{"Food & Dining":8000,"Groceries & Quick-commerce":3000,"Shopping":5000,"Subscriptions":2000,"Travel & Transport":4000},
  portfolio:EMPTY_PORTFOLIO
};
function sanitizeTxns(arr){
  if(!Array.isArray(arr)) return [];
  return arr.filter(t=>t && typeof t.date==="string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.amount==="number" && !isNaN(t.amount))
    .map(t=>({id:t.id||("fix-"+Math.random().toString(36).slice(2,8)),
      date:t.date, merchant:t.merchant||"Unknown", note:t.note||"", amount:t.amount,
      category:CATEGORIES.indexOf(t.category)>=0?t.category:"Other / Misc", ref:t.ref||"",
      balance:(typeof t.balance==="number")?t.balance:null, manual:!!t.manual}));
}
function loadLocal(userId){
  const ns = userId ? ("u_"+userId+"_") : "anon_";
  return {
    txns:sanitizeTxns(LS.get(ns+"txns",null)||(userId?[]:DEFAULTS.txns)),
    income:LS.get(ns+"income",null)||(userId?{}:DEFAULTS.income),
    budgets:LS.get(ns+"budgets",null)||DEFAULTS.budgets,
    portfolio:sanitizePortfolio(LS.get(ns+"portfolio",null))
  };
}
function saveLocal(userId,d){
  const ns = userId ? ("u_"+userId+"_") : "anon_";
  LS.set(ns+"txns",d.txns); LS.set(ns+"income",d.income); LS.set(ns+"budgets",d.budgets);
  LS.set(ns+"portfolio",sanitizePortfolio(d.portfolio));
}

// One-time: remove legacy shared cache keys from the buggy version so an
// old account's data can never be read by a different account.
(function cleanupLegacyCache(){
  try{
    if(!localStorage.getItem("paisa_migrated_v2")){
      ["paisa_txns","paisa_income","paisa_budgets"].forEach(k=>localStorage.removeItem(k));
      localStorage.setItem("paisa_migrated_v2","1");
    }
  }catch(e){}
})();


export {
  INR, INR2, titleCase, CATEGORIES, NONSPEND, CAT_COLOR, colorFor,
  SUB_SERVICES, detectSub, autoCategory, cleanMerchant, monthKey, isIncome,
  monthlyFinancials, resolveIncome, monthMetrics, savingsRate, MN, monthLabel,
  toISODate, num, parseCSV, rowsToTxns,
  EMPTY_PORTFOLIO, sanitizePortfolio, parseHoldingsRows, mergePortfolio,
  SUPABASE_URL, SUPABASE_READY, sb, LS, Cloud,
  SEED, DEFAULTS, sanitizeTxns, loadLocal, saveLocal,
  computeDecisionInsights, fetchLiveNAVs,
};
