import { serve } from "std/server";

// send-digest Edge Function
// - Queries profiles with email_delivery = true
// - Builds search queries from categories / expertise / companies
// - Fetches Google News RSS via rss2json.com
// - Filters paywalled/blocked domains
// - Deduplicates across sections
// - Optionally summarizes via Anthropic (if ANTHROPIC_API_KEY set)
// - Renders an inline-table broadsheet HTML email
// - Sends via Resend
// - Saves digest to `digests` table with user_id, sections (jsonb), article_count

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || undefined;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Morning Brief <onboarding@resend.dev>";

const PAYWALLED = ["wsj.com", "ft.com", "nytimes.com", "bloomberg.com", "economist.com"];

type Profile = {
	id: string;
	categories?: string[];
	expertise?: string[];
	companies?: string[];
	paywalled_sources?: string[];
	blocked_sources?: string[];
	summary_style?: string;
	max_articles_per_section?: number;
	delivery_time?: string;
	timezone?: string;
	email_delivery?: boolean;
};

type Article = { title: string; link: string; source?: string; pubDate?: string; description?: string; domain?: string };

serve(async (req: Request) => {
	try {
		if (req.method === "GET") {
			return new Response(JSON.stringify({ ok: true, now: new Date().toISOString() }), { headers: { "content-type": "application/json" } });
		}
		if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

		const profiles = await fetchProfiles();
		const results: any[] = [];

		for (const p of profiles) {
			try {
				const r = await handleProfile(p);
				results.push({ user_id: p.id, ok: true, detail: r });
			} catch (err: any) {
				console.error("profile-error", p.id, err);
				results.push({ user_id: p.id, ok: false, error: String(err) });
			}
		}

		return new Response(JSON.stringify({ ok: true, results }), { headers: { "content-type": "application/json" } });
	} catch (err: any) {
		console.error(err);
		return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "content-type": "application/json" } });
	}
});

async function fetchProfiles(): Promise<Profile[]> {
	const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/profiles?email_delivery=eq.true&select=*`;
	const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
	if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
	return (await res.json()) as Profile[];
}

async function handleProfile(profile: Profile) {
	// Build queries
	const queries: Record<string, string> = {};
	for (const cat of profile.categories || []) queries[cat] = cat;
	for (const exp of profile.expertise || []) queries[exp] = `${exp} latest`;
	for (const co of profile.companies || []) queries[co] = `"${co}" news`;

	// Fetch per-section articles
	const sections: Record<string, Article[]> = {};
	for (const key of Object.keys(queries)) {
		const items = await fetchRSS(queries[key]);
		sections[key] = items.map((it) => ({ ...it, domain: extractDomain(it.link || it.source || "") }));
	}

	// Filter paywalled/blocked and dedupe across all sections
	const paywalledAllow = (profile.paywalled_sources || []).map(String);
	const blocked = (profile.blocked_sources || []).map(String);

	// Apply filtering per section
	for (const s of Object.keys(sections)) {
		sections[s] = sections[s].filter((a) => {
			const d = a.domain || "";
			if (blocked.some((b) => b && d.includes(b))) return false;
			const isPay = PAYWALLED.some((p) => d.includes(p));
			if (isPay && paywalledAllow.length && !paywalledAllow.some((p) => d.includes(p))) return false;
			return true;
		});
	}

	// Deduplicate across sections and within sections
	const seen: string[] = [];
	for (const k of Object.keys(sections)) {
		const out: Article[] = [];
		for (const a of sections[k]) {
			const norm = normalizeTitle(a.title || "");
			if (seen.some((s) => prefixMatch(s, norm) || s === norm)) continue;
			// also skip if a high-prefix match exists in same section
			if (out.some((o) => prefixMatch(normalizeTitle(o.title || ""), norm))) continue;
			out.push(a);
			seen.push(norm);
		}
		sections[k] = out;
	}

	// Summarize per-section: if ANTHROPIC_API_KEY present, batch per section
	const style = profile.summary_style || "brief";
	const sectionsSummaries: Record<string, any[]> = {};
	let totalCount = 0;
	for (const k of Object.keys(sections)) {
		const items = sections[k].slice(0, profile.max_articles_per_section || 6);
		totalCount += items.length;
		if (!items.length) { sectionsSummaries[k] = []; continue; }

		if (!ANTHROPIC_API_KEY) {
			// fallback: use raw description
			sectionsSummaries[k] = items.map((it) => ({ title: it.title, link: it.link, source: it.source, pubDate: it.pubDate, summary: it.description || "" }));
			continue;
		}

		// Build Anthropic prompt to return JSON array
		const prompts = items.map((it, idx) => ({ idx, title: it.title, description: it.description || "", source: it.source || "" }));
		const promptText = buildBatchPrompt(prompts, style, profile.expertise || [], profile.companies || []);
		try {
			const completion = await callAnthropic(promptText);
			const parsed = parseFirstJSONArray(completion);
			if (Array.isArray(parsed) && parsed.length) {
				// map results by index
				const mapped = parsed.map((p: any, i: number) => ({ ...p, title: items[i]?.title, link: items[i]?.link, source: items[i]?.source, pubDate: items[i]?.pubDate }));
				sectionsSummaries[k] = mapped;
			} else {
				sectionsSummaries[k] = items.map((it) => ({ title: it.title, link: it.link, source: it.source, pubDate: it.pubDate, summary: it.description || "" }));
			}
		} catch (err) {
			console.warn("anthropic-batch-failed", err);
			sectionsSummaries[k] = items.map((it) => ({ title: it.title, link: it.link, source: it.source, pubDate: it.pubDate, summary: it.description || "" }));
		}
		// Gentle pause
		await delay(200);
	}

	// Render HTML (table-based) and send email
	const emailHtml = renderEmailTable(profile, sections, sectionsSummaries, style);

	const userEmail = await getUserEmail(profile.id);
	if (!userEmail) throw new Error(`no email for user ${profile.id}`);

	await sendEmailViaResend(userEmail, `Your Morning Brief — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`, emailHtml);

	// Save digest to digests table: user_id, sections (jsonb), article_count
	await saveDigestRecord(profile.id, sectionsSummaries, totalCount);

	return { sentTo: userEmail, article_count: totalCount };
}

/* ---------- RSS fetching via rss2json.com ---------- */
async function fetchRSS(query: string) {
	const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
	const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
	const res = await fetch(apiUrl);
	if (!res.ok) return [];
	const data = await res.json().catch(() => null);
	if (!data) return [];
	return (data.items || []).map((item: any) => ({
		title: item.title?.replace(/<[^>]*>/g, "") || "Untitled",
		link: item.link || "",
		source: item.source || "",
		pubDate: item.pubDate || "",
		description: item.description?.replace(/<[^>]*>/g, "").slice(0, 300) || "",
	}));
}

function extractDomain(href?: string) {
	try { if (!href) return ""; const u = new URL(href); return u.hostname.replace(/^www\./, ""); } catch { return (href || "").split("/")[0] || ""; }
}

/* ---------- Dedupe helpers ---------- */
function normalizeTitle(t: string) { return (t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim(); }

function prefixMatch(a: string, b: string) {
	if (!a || !b) return false;
	const shorter = a.length < b.length ? a : b;
	const longer = a.length < b.length ? b : a;
	const prefix = longer.slice(0, shorter.length);
	if (!prefix) return false;
	// if prefix length covers >=80% of shorter
	return prefix === shorter && shorter.length / Math.max(1, longer.length) >= 0.8;
}

/* ---------- Anthropic batch call ---------- */
async function callAnthropic(prompt: string) {
	const payload = { prompt, model: "claude-2", max_tokens: 1000, temperature: 0.2 };
	const resp = await fetch("https://api.anthropic.com/v1/complete", { method: "POST", headers: { Authorization: `Bearer ${ANTHROPIC_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
	if (!resp.ok) throw new Error(`Anthropic error ${resp.status}`);
	const body = await resp.json().catch(async () => ({ completion: await resp.text() }));
	return body.completion || body.completion?.text || body.text || body.output || JSON.stringify(body);
}

function buildBatchPrompt(items: { idx: number; title: string; description: string; source: string }[], style: string, expertise: string[], companies: string[]) {
	const personalization = (companies.length || expertise.length) ? `Consider companies: ${companies.join(", ")}. Expertise: ${expertise.join(", ")}.` : "";
	const instr = style === "indepth" ? "Write 4-6 sentence in-depth summaries." : style === "relevance" ? "For each item return JSON object {summary: string, relevance: number, why: string} where relevance is 0-1 and why is a short personalized callout." : style === "scan" ? "Return titles and sources only." : "Write concise 2-4 sentence summaries.";
	const itemsText = items.map((it) => `### ITEM ${it.idx}\nTitle: ${it.title}\nSource: ${it.source}\nExcerpt: ${it.description}`).join("\n\n");
	const ask = style === "relevance" ? "Respond with a JSON array like [{\"summary\":...,\"relevance\":0.0,\"why\":...}, ...]" : style === "scan" ? "Respond with a JSON array like [{\"title\":...,\"source\":...}, ...]" : "Respond with a JSON array like [{\"summary\":...}, ...]";
	return `Human: You are a news summarizer. ${personalization}\n\n${instr}\n\n${itemsText}\n\nAssistant: ${ask}`;
}

function parseFirstJSONArray(text: any) {
	if (!text) return null;
	const s = typeof text === "string" ? text : JSON.stringify(text);
	const m = s.match(/\[[\s\S]*?\]/);
	if (!m) return null;
	try { return JSON.parse(m[0]); } catch { return null; }
}

/* ---------- Email render (table-based) ---------- */
function renderEmailTable(profile: Profile, sections: Record<string, Article[]>, summaries: Record<string, any[]>, style: string) {
	// colors for left borders per section (cycled)
	const colors = ["#b24a4a","#4a6fb2","#6fb24a","#b27c4a","#8b4ab2"];
	const bg = "#fdf9f3";

	const parts: string[] = [];
	parts.push(`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};padding:18px 0;">`);
	parts.push(`<tr><td align="center">`);
	parts.push(`<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">`);

	// masthead
	parts.push(`<tr><td style="padding:20px 24px;border-bottom:2px solid #eee;"><table width="100%"><tr><td style="font-family:Georgia, 'Times New Roman', serif;font-size:32px;color:#111;">Morning Brief</td><td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666;">${escapeHtml(profile.timezone || '')}</td></tr></table></td></tr>`);

	// sections
	let si = 0;
	for (const [key, items] of Object.entries(sections)) {
		const summaryList = summaries[key] || [];
		const color = colors[si % colors.length];
		si++;

		parts.push(`<tr><td style="padding:12px 24px;border-bottom:1px solid #f0eae0;"><table width="100%"><tr><td width="8" style="border-left:6px solid ${color};padding-right:12px;"></td><td style="padding-left:12px;">`);
		parts.push(`<div style="font-family:Georgia, serif;font-size:18px;color:#111;margin-bottom:8px;">${escapeHtml(key)}</div>`);

		// items as inline blocks
		for (let i = 0; i < items.length; i++) {
			const it = items[i];
			const s = summaryList[i] || {};
			if (style === "scan") {
				parts.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;margin-bottom:8px;"><a href="${escapeAttr(it.link || '#')}" style="color:#111;text-decoration:none;font-weight:700;">${escapeHtml(it.title)}</a> <span style="color:#666;font-size:12px;">— ${escapeHtml(it.source || '')}</span></div>`);
			} else {
				parts.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;margin-bottom:6px;"><a href="${escapeAttr(it.link || '#')}" style="color:#111;text-decoration:none;font-weight:700;">${escapeHtml(it.title)}</a></div>`);
				parts.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;margin-bottom:8px;">${escapeHtml(s.summary || it.description || '')}</div>`);
				if (style === "relevance" && s.why) {
					parts.push(`<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;background:#fff7e6;border-left:4px solid ${color};padding:8px;margin-bottom:10px;">Why this matters: ${escapeHtml(s.why)}</div>`);
				}
			}
		}

		parts.push(`</td></tr></table></td></tr>`);
	}

	// footer
	parts.push(`<tr><td style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666;">You are receiving this because you signed up for Morning Brief. Manage preferences on the site.</td></tr>`);

	parts.push(`</table></td></tr></table>`);

	return parts.join("");
}

/* ---------- Resend send ---------- */
async function sendEmailViaResend(to: string, subject: string, html: string) {
	const url = "https://api.resend.com/emails";
	const body = { from: EMAIL_FROM, to: [to], subject, html };
	const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
	if (!res.ok) {
		const t = await res.text();
		throw new Error(`Resend failed: ${res.status} ${t}`);
	}
	return res.json();
}

/* ---------- Supabase save digest ---------- */
async function saveDigestRecord(user_id: string, sections: any, article_count: number) {
	const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/digests`;
	const payload = { user_id, sections, article_count };
	const res = await fetch(url, { method: "POST", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(payload) });
	if (!res.ok) {
		const t = await res.text();
		throw new Error(`saveDigest failed ${res.status} ${t}`);
	}
	return res.json();
}

/* ---------- Get user email from Auth Admin API ---------- */
async function getUserEmail(userId: string) {
	const url = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`;
	const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
	if (!res.ok) return null;
	const body = await res.json().catch(() => null);
	return body?.email || null;
}

/* ---------- Utilities ---------- */
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function escapeHtml(s?: string) { if (!s) return ""; return s.replace(/[&<>"]+/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c] as string)); }
function escapeAttr(s?: string) { return escapeHtml(s); }

