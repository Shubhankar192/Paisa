// Sprout — the Paisa mascot, as a reusable component with poses.
// poses: "happy" (default) · "wave" (animated arm) · "worried" · "party"
import React from "react";

export default function Sprout({pose="happy",size=120,style,className}){
  const wave=pose==="wave", worried=pose==="worried", party=pose==="party";
  const armsUp=wave||party;
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} style={style} className={className} aria-label="Sprout, the Paisa mascot">
      <defs>
        <linearGradient id="sp-body" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#0BA765"/><stop offset="1" stopColor="#05603A"/>
        </linearGradient>
        <linearGradient id="sp-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#32D583"/><stop offset="1" stopColor="#079455"/>
        </linearGradient>
        <clipPath id="sp-clip"><circle cx="120" cy="128" r="82"/></clipPath>
      </defs>

      {party&&(
        <g>
          <circle cx="34" cy="52" r="5" fill="#DC6803"/>
          <rect x="60" y="18" width="9" height="9" rx="2" fill="#175CD3" transform="rotate(20 64 22)"/>
          <circle cx="206" cy="44" r="5" fill="#D92D20"/>
          <rect x="176" y="14" width="9" height="9" rx="2" fill="#079455" transform="rotate(-15 180 18)"/>
          <circle cx="24" cy="96" r="4" fill="#444CE7"/>
          <circle cx="218" cy="88" r="4" fill="#C11574"/>
        </g>
      )}

      <ellipse cx="120" cy="216" rx="60" ry="9" fill="#101828" opacity="0.08"/>
      <ellipse cx="100" cy="206" rx="14" ry="8" fill="#054F31"/>
      <ellipse cx="140" cy="206" rx="14" ry="8" fill="#054F31"/>

      {/* left arm */}
      {party
        ? <ellipse cx="39" cy="98" rx="11" ry="16" fill="#05603A" transform="rotate(24 39 98)"/>
        : <circle cx="40" cy="144" r="12" fill="#05603A"/>}
      {/* right arm — raised and animated when waving/celebrating */}
      {armsUp
        ? <ellipse cx="202" cy="98" rx="11" ry="16" fill="#05603A" transform="rotate(-24 202 98)"
            className={wave?"sprout-wave-arm":undefined}/>
        : <circle cx="201" cy="112" r="12" fill="#05603A"/>}

      <circle cx="120" cy="128" r="82" fill="url(#sp-body)"/>
      <circle cx="120" cy="128" r="70" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="3" strokeDasharray="1 8" strokeLinecap="round"/>

      {/* sprout */}
      <path d="M120 48 C120 36 120 30 120 22" stroke="#05603A" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="M120 26 C106 26 97 17 96 6 C108 6 118 13 120 26 Z" fill="url(#sp-leaf)"/>
      <path d="M120 30 C134 30 143 21 144 9 C131 9 122 17 120 30 Z" fill="url(#sp-leaf)"/>

      {/* eyes */}
      {party?(
        <g>
          <path d="M87 110 Q99 98 111 110" stroke="#101828" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
          <path d="M129 110 Q141 98 153 110" stroke="#101828" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
        </g>
      ):(
        <g>
          <circle cx="99" cy="108" r="13" fill="#ffffff"/>
          <circle cx="141" cy="108" r="13" fill="#ffffff"/>
          <circle cx="102" cy="110" r="6.5" fill="#101828"/>
          <circle cx="138" cy="110" r="6.5" fill="#101828"/>
          <circle cx="104.4" cy="107" r="2.4" fill="#ffffff"/>
          <circle cx="140.4" cy="107" r="2.4" fill="#ffffff"/>
        </g>
      )}
      {worried&&(
        <g>
          <path d="M88 90 L110 97" stroke="#0B2E20" strokeWidth="4.5" strokeLinecap="round"/>
          <path d="M152 90 L130 97" stroke="#0B2E20" strokeWidth="4.5" strokeLinecap="round"/>
          <path d="M172 84 q9 13 0 18 q-9 -5 0 -18" fill="#7CD4FD"/>
        </g>
      )}

      {/* blush */}
      <ellipse cx="83" cy="126" rx="8" ry="5" fill="#7BE0AE" opacity="0.55"/>
      <ellipse cx="157" cy="126" rx="8" ry="5" fill="#7BE0AE" opacity="0.55"/>

      {/* mouth */}
      {worried
        ? <path d="M110 141 Q120 131 130 141" stroke="#0B2E20" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
        : party
          ? <path d="M102 126 Q120 152 138 126 Q120 140 102 126 Z" fill="#0B2E20"/>
          : <path d="M106 128 Q120 147 134 128 Q120 137 106 128 Z" fill="#0B2E20"/>}

      {/* ₹ watermark */}
      <g clipPath="url(#sp-clip)">
        <text x="120" y="172" fontFamily="Arial, Helvetica, sans-serif" fontSize="64" fontWeight="700"
          fill="#ffffff" fillOpacity="0.17" textAnchor="middle" dominantBaseline="central">₹</text>
      </g>
    </svg>
  );
}

/* Peek-in: Sprout slides up from the bottom corner, waves for a few
   seconds, then hides. First hello ~15s after load, then every ~4 min.
   Click him to say bye early. Skipped for reduced-motion users. */
export function SproutPeek(){
  const [show,setShow]=React.useState(false);
  React.useEffect(()=>{
    if(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    let hideT;
    const appear=()=>{setShow(true);clearTimeout(hideT);hideT=setTimeout(()=>setShow(false),6000);};
    let testMode=false;
    try{testMode=!!localStorage.getItem("paisa_peek_test");}catch(e){}
    const first=setTimeout(appear,testMode?1200:15000);
    const iv=setInterval(appear,testMode?8000:240000);
    return ()=>{clearTimeout(first);clearInterval(iv);clearTimeout(hideT);};
  },[]);
  return (
    <div onClick={()=>setShow(false)} title="Hi! — Sprout" aria-hidden={!show}
      style={{position:"fixed",right:20,bottom:0,zIndex:60,cursor:"pointer",lineHeight:0,
        transform:show?"translateY(30%)":"translateY(115%)",
        transition:"transform .6s cubic-bezier(.34,1.56,.64,1)",
        pointerEvents:show?"auto":"none",filter:"drop-shadow(0 -2px 10px rgba(16,24,40,.12))"}}>
      <Sprout pose="wave" size={104}/>
    </div>
  );
}
