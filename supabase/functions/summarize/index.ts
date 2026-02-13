import { serve } from "std/server";

// Simple placeholder summarization function for local testing.
// Accepts POST JSON: { articles: Array, style: string, expertise?: string[], companies?: string[] }
// Returns JSON array: [{ index, summary, relevance? }, ...]

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const { articles, style = 'brief', expertise = [], companies = [] } = body || {};
  if (!Array.isArray(articles)) {
    return new Response(JSON.stringify({ error: 'articles array required' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  // "scan" style short-circuits: return an empty array (front-end will render titles only)
  if (style === 'scan') {
    return new Response(JSON.stringify([]), { headers: { 'content-type': 'application/json' } });
  }

  const summaries = articles.map((a: any, i: number) => {
    const title = a.title || a.link || `Article ${i + 1}`;
    const source = a.source || a.site || '';
    const base = `${title}${source ? ` — ${source}` : ''}`;

    let summaryText = '';
    if (style === 'brief') {
      summaryText = `${base}: quick summary (2–4 sentences).`;
    } else if (style === 'indepth') {
      summaryText = `${base}: in-depth summary with background, implications, and what to watch (4–6 sentences).`;
    } else if (style === 'relevance') {
      summaryText = `${base}: brief summary. Why it matters: ...`;
    } else {
      summaryText = `${base}: summary.`;
    }

    const out: any = { index: i, summary: summaryText };
    if (style === 'relevance') {
      // simple heuristic: if title contains any company/expertise term, bump relevance
      const combined = (title + ' ' + (a.summary || '')).toLowerCase();
      const match = (companies || []).some((c: string) => c && combined.includes(c.toLowerCase())) || (expertise || []).some((e: string) => e && combined.includes(e.toLowerCase()));
      out.relevance = match ? 0.9 : 0.2;
    }
    return out;
  });

  return new Response(JSON.stringify(summaries), { headers: { 'content-type': 'application/json' } });
});
