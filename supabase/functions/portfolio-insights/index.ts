// Paisa — deep fundamental portfolio analysis (runs on the 1st and 15th)
//
// For every user with imported holdings it:
//   1. reads the portfolio snapshot from paisa_data.portfolio
//   2. pulls per-stock fundamentals from Yahoo Finance (best-effort):
//      valuation (P/E, P/B), profitability (ROE, margins), balance sheet
//      (debt/equity), growth, 52-week range, 6-month momentum, analyst targets
//   3. pulls recent headlines per holding from Google News RSS
//   4. asks Claude — with live web search enabled — for a deep,
//      fundamentals-grounded review with per-holding verdicts
//   5. stores the report in paisa_insights (shown in the Portfolio tab)
//
// Secrets required (supabase secrets set KEY=value):
//   ANTHROPIC_API_KEY  — your Anthropic API key
//   CRON_SECRET        — shared secret; requests must send x-cron-secret header
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

type Stock = { name: string; isin: string; qty: number; avg: number; buyValue: number; ltp: number; curValue: number; pnl: number };
type Fund = { name: string; amc: string; category: string; subCategory: string; units: number; invested: number; current: number };
type Portfolio = { stocks?: Stock[]; funds?: Fund[]; stocksAsOf?: string; fundsAsOf?: string };

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const pct = (x: unknown) => typeof x === "number" ? (x * 100).toFixed(1) + "%" : "n/a";
const num = (x: unknown) => typeof x === "number" ? x.toFixed(2) : "n/a";

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (paisa-insights)" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const symbolCache = new Map<string, string | null>();
async function resolveSymbol(name: string): Promise<string | null> {
  if (symbolCache.has(name)) return symbolCache.get(name)!;
  const s = await fetchJson(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=3&newsCount=0`,
  );
  const quotes: any[] = s?.quotes ?? [];
  const sym = quotes.find((q) => typeof q.symbol === "string" && q.symbol.endsWith(".NS"))?.symbol ?? quotes[0]?.symbol ?? null;
  symbolCache.set(name, sym);
  return sym;
}

// Fundamental snapshot for one stock — every field best-effort.
async function fundamentalsFor(name: string): Promise<string> {
  const sym = await resolveSymbol(name);
  if (!sym) return "  fundamentals: unavailable (symbol not resolved)";
  const lines: string[] = [`  symbol: ${sym}`];

  const qs = await fetchJson(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=price,summaryDetail,financialData,defaultKeyStatistics`,
  );
  const r = qs?.quoteSummary?.result?.[0];
  if (r) {
    const sd = r.summaryDetail ?? {}, fd = r.financialData ?? {}, ks = r.defaultKeyStatistics ?? {}, pr = r.price ?? {};
    const g = (o: any) => o?.raw;
    lines.push(
      `  live price: ₹${num(g(pr.regularMarketPrice))} · 52w range: ₹${num(g(sd.fiftyTwoWeekLow))}–₹${num(g(sd.fiftyTwoWeekHigh))}`,
      `  valuation: trailing P/E ${num(g(sd.trailingPE))}, forward P/E ${num(g(sd.forwardPE))}, P/B ${num(g(ks.priceToBook))}, div yield ${pct(g(sd.dividendYield))}`,
      `  profitability: ROE ${pct(g(fd.returnOnEquity))}, operating margin ${pct(g(fd.operatingMargins))}, profit margin ${pct(g(fd.profitMargins))}`,
      `  growth: revenue ${pct(g(fd.revenueGrowth))}, earnings ${pct(g(fd.earningsGrowth))}`,
      `  balance sheet: debt/equity ${num(g(fd.debtToEquity))}, current ratio ${num(g(fd.currentRatio))}`,
      `  analyst view: mean target ₹${num(g(fd.targetMeanPrice))}, recommendation ${fd.recommendationKey ?? "n/a"}`,
    );
  } else {
    lines.push("  fundamentals: quoteSummary unavailable");
  }

  // 6-month momentum
  const ch = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=6mo&interval=1d`);
  const closes: number[] = ch?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((x: any) => typeof x === "number") ?? [];
  if (closes.length > 20) {
    const chg = (closes[closes.length - 1] / closes[0] - 1) * 100;
    lines.push(`  6-month price change: ${chg.toFixed(1)}%`);
  }
  return lines.join("\n");
}

async function newsFor(query: string, max = 4): Promise<string[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " stock India")}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const xml = await res.text();
    const titles = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].map((m) =>
      m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()
    );
    return titles.slice(0, max);
  } catch {
    return [];
  }
}

async function buildContext(p: Portfolio): Promise<string> {
  const stocks = p.stocks ?? [];
  const funds = p.funds ?? [];
  const lines: string[] = [];

  if (stocks.length) {
    const total = stocks.reduce((a, s) => a + s.curValue, 0);
    lines.push(`## Direct stocks (statement as on ${p.stocksAsOf ?? "unknown"}, total ${inr(total)})`);
    for (const s of stocks) {
      const news = await newsFor(s.name);
      lines.push(
        `\n### ${s.name}`,
        `  position: qty ${s.qty}, avg buy ₹${s.avg}, invested ${inr(s.buyValue)}, statement value ${inr(s.curValue)} (${total > 0 ? ((s.curValue / total) * 100).toFixed(1) : "0"}% of stock book), unrealised P&L ${inr(s.pnl)} (${s.buyValue > 0 ? ((s.pnl / s.buyValue) * 100).toFixed(1) : "0"}%)`,
        await fundamentalsFor(s.name),
        news.length ? `  recent headlines: ${news.map((h) => `"${h}"`).join("; ")}` : "  recent headlines: none found",
      );
    }
  }
  if (funds.length) {
    lines.push(`\n## Mutual funds (statement as on ${p.fundsAsOf ?? "unknown"})`);
    const agg = new Map<string, { category: string; subCategory: string; invested: number; current: number }>();
    for (const f of funds) {
      const g = agg.get(f.name) ?? { category: f.category, subCategory: f.subCategory, invested: 0, current: 0 };
      g.invested += f.invested;
      g.current += f.current;
      agg.set(f.name, g);
    }
    for (const [name, g] of agg) {
      lines.push(`- ${name} (${g.category} / ${g.subCategory}): invested ${inr(g.invested)}, current ${inr(g.current)}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are the twice-monthly portfolio analyst inside Paisa, a personal finance app for an Indian retail investor. You receive the user's actual holdings with pre-fetched fundamentals (valuation, profitability, growth, balance sheet, momentum, analyst targets) and recent headlines. You also have web search: use it to verify the latest quarterly results, order-book and management developments, and anything material you would otherwise be guessing about — especially for holdings where the pre-fetched data looks stale, or where the position is large or deeply red/green.

Write a deep, precise report in markdown (## headings, bullets, **bold** for key numbers). Structure:

1. **Portfolio verdict** — 3-4 sentences: overall health, the single biggest risk, the single biggest opportunity. Cite actual rupee figures.
2. **Per-holding analysis** — for EVERY stock, a short block:
   - One-line thesis status: **Strong / Holding up / Weakening / Broken**, with the fundamental reason (valuation vs growth, margin trend, order book, balance sheet).
   - The 2-3 numbers that matter most for this name right now.
   - A consideration (add / hold / trim / exit / watch level) framed as reasoning, not instruction — and what would change your mind.
3. **Mutual funds** — brief: category tilts, overlap, whether each fund is earning its keep; only flag funds needing attention.
4. **Watch list for the next fortnight** — dated and specific: earnings dates, sector events, macro data relevant to THESE holdings.
5. **Actions to consider** — max 4, ranked, each with the fundamental justification and rough rupee impact.

Rules: ground every claim in the provided data or your web-search findings, and when you rely on searched information say what you found. Never invent numbers. Be direct about weak positions — precision beats politeness. Aim for 900-1200 words. End with a one-line disclaimer that this is educational analysis, not SEBI-registered investment advice.`;

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

  const { data: rows, error } = await supabase.from("paisa_data").select("user_id,portfolio").not("portfolio", "is", null);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results: Record<string, string> = {};
  for (const row of rows ?? []) {
    const p = row.portfolio as Portfolio;
    if (!(p?.stocks?.length || p?.funds?.length)) continue;

    try {
      const context = await buildContext(p);
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Today is ${new Date().toISOString().slice(0, 10)}. Here is my portfolio with pre-fetched fundamentals and headlines. Please write my deep fortnightly review.\n\n${context}`,
        }],
      });
      const text = msg.content.filter((b) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      if (!text) { results[row.user_id] = "empty response"; continue; }

      const { error: insErr } = await supabase.from("paisa_insights").insert({ user_id: row.user_id, content: text });
      results[row.user_id] = insErr ? `insert failed: ${insErr.message}` : "ok";
    } catch (e) {
      results[row.user_id] = `failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return new Response(JSON.stringify({ processed: results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
