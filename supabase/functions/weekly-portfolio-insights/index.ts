// Paisa — weekly AI portfolio insights
//
// Runs on a schedule (see README → "AI portfolio insights"). For every user
// with imported holdings it:
//   1. reads the portfolio snapshot from paisa_data.portfolio
//   2. fetches live prices from Yahoo Finance (best-effort)
//   3. fetches recent news headlines per holding from Google News RSS
//   4. asks Claude for a fundamentals-grounded weekly review
//   5. stores the result in paisa_insights (shown in the app's Portfolio tab)
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

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (paisa-insights)" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Best-effort live price via Yahoo Finance (symbol search → chart meta).
const symbolCache = new Map<string, string | null>();
async function livePrice(name: string): Promise<{ symbol: string; price: number } | null> {
  let symbol = symbolCache.get(name);
  if (symbol === undefined) {
    const s = await fetchJson(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=3&newsCount=0`,
    );
    const quotes: any[] = s?.quotes ?? [];
    symbol = quotes.find((q) => typeof q.symbol === "string" && q.symbol.endsWith(".NS"))?.symbol ?? quotes[0]?.symbol ?? null;
    symbolCache.set(name, symbol);
  }
  if (!symbol) return null;
  const c = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`);
  const price = c?.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === "number" ? { symbol, price } : null;
}

// Recent headlines via Google News RSS (no API key needed).
async function newsFor(query: string, max = 3): Promise<string[]> {
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
    lines.push(`## Direct stocks (statement as on ${p.stocksAsOf ?? "unknown"})`);
    for (const s of stocks) {
      const live = await livePrice(s.name);
      const news = await newsFor(s.name);
      lines.push(
        `- ${s.name}: qty ${s.qty}, avg buy ₹${s.avg}, invested ${inr(s.buyValue)}, ` +
          `statement price ₹${s.ltp} (value ${inr(s.curValue)}, unrealised P&L ${inr(s.pnl)})` +
          (live ? `, live price now ₹${live.price} (${live.symbol})` : "") +
          (news.length ? `\n  Recent headlines: ${news.map((h) => `"${h}"`).join("; ")}` : ""),
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

const SYSTEM_PROMPT = `You are the weekly portfolio analyst inside Paisa, a personal finance app for an Indian retail investor. You are given the user's actual holdings (stocks and mutual funds), unrealised P&L, best-effort live prices, and recent news headlines.

Write a weekly review in markdown (use ## headings, bullet points, **bold** for key numbers). Cover:
- **Portfolio health**: overall P&L, equity/debt split, diversification and concentration risks — cite the actual numbers given.
- **Holding-level notes**: for holdings that moved materially or have relevant news, one or two grounded sentences each. Connect news to fundamentals (order books, margins, valuations) where you can; if a headline is noise, say so.
- **Watch items for the week ahead**: earnings, sector events, or risks relevant to these specific holdings.
- **Suggestions**: 2-4 concrete, fundamentally-reasoned ideas (e.g. rebalancing, SIP continuation, position sizing). Frame as considerations, not instructions.

Ground every claim in the data provided or clearly flag it as general knowledge. Do not invent prices or news. Keep it under ~600 words. End with a one-line disclaimer that this is not SEBI-registered investment advice.`;

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
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Here is my current portfolio with live prices and recent news. Today is ${new Date().toISOString().slice(0, 10)}. Please write my weekly review.\n\n${context}`,
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
