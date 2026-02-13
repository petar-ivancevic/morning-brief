// Vercel Cron Job - Sends scheduled daily briefs
// Runs every hour and checks which users need their brief sent

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;

export const config = {
  maxDuration: 300, // 5 minutes max
};

export default async function handler(req, res) {
  // Verify this is a cron request
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const currentHour = new Date().getUTCHours();
    console.log(`Cron running for hour: ${currentHour}`);

    // Get all users with email_delivery enabled
    const profilesResponse = await fetch(
      `${SB_URL}/rest/v1/profiles?email_delivery=eq.true&select=*`,
      {
        headers: {
          apikey: SB_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!profilesResponse.ok) {
      throw new Error('Failed to fetch profiles');
    }

    const profiles = await profilesResponse.json();
    console.log(`Found ${profiles.length} users with email delivery enabled`);

    let successCount = 0;
    let errorCount = 0;

    // Process each user
    for (const profile of profiles) {
      try {
        // Get user email from auth
        const userResponse = await fetch(
          `${SB_URL}/auth/v1/admin/users/${profile.id}`,
          {
            headers: {
              apikey: SB_KEY,
              Authorization: `Bearer ${SB_KEY}`
            }
          }
        );

        if (!userResponse.ok) {
          console.error(`Failed to get user ${profile.id}`);
          errorCount++;
          continue;
        }

        const userData = await userResponse.json();
        const userEmail = userData.email;

        if (!userEmail) {
          console.error(`No email for user ${profile.id}`);
          errorCount++;
          continue;
        }

        // Check if user's delivery time matches current hour
        const deliveryTime = profile.delivery_time || '08:00';
        const [deliveryHour] = deliveryTime.split(':').map(Number);

        // Simple hour matching (you can enhance with timezone support)
        if (deliveryHour !== currentHour) {
          continue; // Not time for this user yet
        }

        console.log(`Generating brief for ${userEmail}...`);

        // Generate digest for user
        const digest = await generateDigestForUser(profile);

        if (!digest || !digest.sections) {
          console.error(`Failed to generate digest for ${userEmail}`);
          errorCount++;
          continue;
        }

        // Send email
        const { htmlContent, textContent } = generateEmailContent(
          digest.sections,
          new Date().toISOString()
        );

        await resend.emails.send({
          from: 'Morning Brief <noreply@petarivancevic.com>',
          to: userEmail,
          subject: `Your Morning Brief – ${formatDate()}`,
          html: htmlContent,
          text: textContent
        });

        // Save digest to database
        await fetch(`${SB_URL}/rest/v1/digests`, {
          method: 'POST',
          headers: {
            apikey: SB_KEY,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            user_id: profile.id,
            sections: digest.sections,
            article_count: digest.article_count,
            generated_at: new Date().toISOString()
          })
        });

        console.log(`✓ Sent brief to ${userEmail}`);
        successCount++;
      } catch (error) {
        console.error(`Error processing user ${profile.id}:`, error);
        errorCount++;
      }
    }

    return res.status(200).json({
      success: true,
      processed: profiles.length,
      sent: successCount,
      errors: errorCount,
      hour: currentHour
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return res.status(500).json({
      error: 'Cron job failed',
      message: error.message
    });
  }
}

// Generate digest for a specific user
async function generateDigestForUser(profile) {
  try {
    const sections = {};

    // Fetch RSS for each category
    for (const category of profile.categories || ['Technology', 'Business']) {
      const articles = await fetchRSS(category);

      // Filter articles
      const blocked = (profile.blocked_sources || []).map(s => s.toLowerCase());
      const allowedPay = (profile.paywalled_sources || []).map(s => s.toLowerCase());

      const filtered = articles.filter(a => {
        const domain = extractDomain(a.link).toLowerCase();
        if (blocked.some(b => domain.includes(b))) return false;
        if (isPaywalled(a.link)) {
          return allowedPay.some(p => domain.includes(p));
        }
        return true;
      });

      // Deduplicate and rank
      const deduped = dedup(filtered);
      const ranked = rankArticles(deduped);
      sections[category] = ranked.slice(0, profile.max_articles_per_section || 5);
    }

    // Calculate article count
    const article_count = Object.values(sections).reduce((a, b) => a + b.length, 0);

    return { sections, article_count };
  } catch (error) {
    console.error('Error generating digest:', error);
    return null;
  }
}

async function fetchRSS(query) {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rss)}`;

  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || []).map(i => ({
      title: i.title?.replace(/<[^>]*>/g, '') || 'Untitled',
      link: i.link || '',
      source: i.source || extractDomain(i.link),
      pubDate: i.pubDate || '',
      description: i.description?.replace(/<[^>]*>/g, '').slice(0, 300) || ''
    }));
  } catch {
    return [];
  }
}

function dedup(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const norm = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(norm)) return false;
    for (const s of seen) {
      if (norm.startsWith(s.slice(0, 40)) || s.startsWith(norm.slice(0, 40))) return false;
    }
    seen.add(norm);
    return true;
  });
}

function rankArticles(articles) {
  const qualitySources = ['reuters.com', 'apnews.com', 'bloomberg.com', 'bbc.com', 'npr.org'];
  return [...articles].sort((a, b) => {
    const aq = qualitySources.some(s => a.link?.toLowerCase().includes(s)) ? 1 : 0;
    const bq = qualitySources.some(s => b.link?.toLowerCase().includes(s)) ? 1 : 0;
    if (aq !== bq) return bq - aq;
    return new Date(b.pubDate) - new Date(a.pubDate);
  });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

function isPaywalled(url) {
  const paywalled = ['wsj.com', 'ft.com', 'nytimes.com', 'washingtonpost.com', 'economist.com', 'bloomberg.com'];
  return paywalled.some(d => url?.toLowerCase().includes(d));
}

function formatDate(date) {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function generateEmailContent(sections, generatedAt) {
  const date = formatDate(generatedAt);
  const sectionKeys = Object.keys(sections);
  const totalArticles = Object.values(sections).reduce((a, b) => a + b.length, 0);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1714; max-width: 600px; margin: 0 auto; padding: 20px; background: #fefcfa; }
    .header { text-align: center; padding: 30px 0; border-bottom: 3px double #ede8e0; margin-bottom: 30px; }
    .logo { font-size: 40px; margin-bottom: 10px; }
    .title { font-family: Georgia, serif; font-size: 32px; margin: 10px 0; }
    .section { margin: 30px 0; }
    .section-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; padding: 10px 0; border-bottom: 2px solid #ee5a24; color: #ee5a24; }
    .article { margin: 20px 0; padding-bottom: 20px; border-bottom: 1px solid #ede8e0; }
    .article-title { font-family: Georgia, serif; font-size: 18px; font-weight: 600; margin-bottom: 10px; }
    .article-title a { color: #1a1714; text-decoration: none; }
    .article-meta { font-size: 12px; color: #5c554c; }
    .footer { text-align: center; padding: 30px 0; margin-top: 40px; border-top: 3px double #ede8e0; color: #5c554c; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">☀️</div>
    <div class="title">The Morning Brief</div>
    <div style="font-size: 13px; color: #5c554c;">${date} · ${totalArticles} articles</div>
  </div>
  ${sectionKeys.map(sectionName => {
    const articles = sections[sectionName] || [];
    return `
      <div class="section">
        <div class="section-header">${sectionName}</div>
        ${articles.map(article => `
          <div class="article">
            <div class="article-title"><a href="${article.link}">${article.title}</a></div>
            <div class="article-meta">${article.source} · ${article.pubDate ? new Date(article.pubDate).toLocaleDateString() : ''}</div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('')}
  <div class="footer">
    End of Morning Brief · Generated by AI<br>
    <a href="https://morning-brief.vercel.app">Manage Preferences</a>
  </div>
</body>
</html>
  `;

  const textContent = `
MORNING BRIEF — ${date}
${'='.repeat(60)}

${sectionKeys.map(sectionName => {
  const articles = sections[sectionName] || [];
  return `
${sectionName.toUpperCase()}
${'-'.repeat(40)}

${articles.map(article => `• ${article.title}
  ${article.source}
  ${article.link}
`).join('\n')}
  `;
}).join('\n')}

${'='.repeat(60)}
End of Morning Brief
  `.trim();

  return { htmlContent, textContent };
}
