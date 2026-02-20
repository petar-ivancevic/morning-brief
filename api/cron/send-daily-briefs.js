// Vercel Cron Job - Sends scheduled daily briefs
// Runs every hour and checks which users need their brief sent

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    console.log(`Cron running at UTC hour: ${currentHour}`);

    // Get all users with email_delivery enabled — requires service role key to bypass RLS
    const profilesResponse = await fetch(
      `${SB_URL}/rest/v1/profiles?email_delivery=eq.true&select=*`,
      {
        headers: {
          apikey: SB_SERVICE_KEY,
          Authorization: `Bearer ${SB_SERVICE_KEY}`,
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
              apikey: SB_SERVICE_KEY,
              Authorization: `Bearer ${SB_SERVICE_KEY}`
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

        // Check if user's delivery time matches target hour in their timezone
        const deliveryTime = profile.delivery_time || '08:00';
        const [deliveryHour] = deliveryTime.split(':').map(Number);
        const timezone = profile.timezone || 'UTC';

        // Convert current UTC hour to the user's local hour
        const targetUTCDate = new Date();
        targetUTCDate.setUTCHours(currentHour, 0, 0, 0);
        const localHourStr = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          hour12: false
        }).format(targetUTCDate);
        const localHour = parseInt(localHourStr, 10) % 24;

        if (localHour !== deliveryHour) {
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
          text: textContent,
          headers: {
            'List-Unsubscribe': `<https://morning-brief-weld.vercel.app>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Entity-Ref-ID': 'morning-brief'
          }
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

  // HTML Email with inline styles for better email client compatibility
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Morning Brief</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fefcfa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff;">

          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px; text-align: center; border-bottom: 3px double #ede8e0;">
              <div style="font-size: 48px; line-height: 1; margin-bottom: 15px;">☀️</div>
              <h1 style="font-family: Georgia, serif; font-size: 36px; font-weight: 400; margin: 15px 0 10px 0; color: #1a1714; line-height: 1.2;">The Morning Brief</h1>
              <p style="font-size: 13px; color: #5c554c; text-transform: uppercase; letter-spacing: 1px; margin: 10px 0 0 0; line-height: 1.4;">
                ${date}<br/>
                ${totalArticles} articles · ${sectionKeys.length} sections
              </p>
            </td>
          </tr>

          <!-- Content Sections -->
          <tr>
            <td style="padding: 30px;">
              ${sectionKeys.map((sectionName) => {
                const articles = sections[sectionName] || [];
                return `
                  <div style="margin-bottom: 35px;">
                    <h2 style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; padding: 10px 0; margin: 0 0 20px 0; border-bottom: 2px solid #ee5a24; color: #ee5a24;">${sectionName}</h2>

                    ${articles.map((article, idx) => {
                      const summary = article.summary || article.description || '';
                      return `
                        <div style="margin-bottom: ${idx < articles.length - 1 ? '25px' : '0'}; padding-bottom: ${idx < articles.length - 1 ? '25px' : '0'}; ${idx < articles.length - 1 ? 'border-bottom: 1px solid #ede8e0;' : ''}">
                          <h3 style="font-family: Georgia, serif; font-size: 18px; font-weight: 600; color: #1a1714; margin: 0 0 12px 0; line-height: 1.4;">
                            <a href="${article.link}" target="_blank" style="color: #1a1714; text-decoration: none;">${article.title}</a>
                          </h3>
                          ${article.relevance ? `
                            <p style="font-size: 15px; color: #1a1714; margin: 0 0 12px 0; line-height: 1.7;">
                              <strong>Summary</strong><br/>
                              ${article.summary}
                            </p>
                            <p style="font-size: 15px; color: #1a1714; margin: 0 0 12px 0; line-height: 1.7;">
                              <strong>Relevance</strong><br/>
                              ${article.relevance}
                            </p>
                          ` : summary ? `<p style="font-size: 15px; color: #1a1714; margin: 0 0 12px 0; line-height: 1.7;">${summary}</p>` : ''}
                          <p style="font-size: 12px; color: #5c554c; margin: 0; line-height: 1.6;">
                            ${article.source} · ${article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                            ${isQualitySource(article.link) ? '<span style="display: inline-block; padding: 3px 8px; margin-left: 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #e8f5e9; color: #2a8c3e; border: 1px solid #a5d6a7;">Quality Source</span>' : ''}
                            ${isPaywalled(article.link) ? '<span style="display: inline-block; padding: 3px 8px; margin-left: 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #fff3e0; color: #c07830; border: 1px solid #ffcc80;">Paywall</span>' : ''}
                          </p>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              }).join('')}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px; text-align: center; border-top: 3px double #ede8e0; background-color: #fefcfa;">
              <p style="font-size: 13px; color: #5c554c; margin: 0 0 15px 0; line-height: 1.6;">
                End of Morning Brief · Generated by AI
              </p>
              <p style="font-size: 12px; color: #a09888; margin: 0 0 15px 0; line-height: 1.6;">
                Sent from <strong>petarivancevic.com</strong>
              </p>
              <p style="font-size: 12px; margin: 0; line-height: 1.6;">
                <a href="https://morning-brief-weld.vercel.app" style="color: #ee5a24; text-decoration: none; font-weight: 600;">Manage Preferences</a>
                <span style="color: #d0cbc2; margin: 0 8px;">·</span>
                <a href="https://morning-brief-weld.vercel.app" style="color: #5c554c; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  // Plain Text Email
  const textContent = `
MORNING BRIEF — ${date}
${'='.repeat(70)}

Your personalized daily news digest with ${totalArticles} curated articles across ${sectionKeys.length} sections.

${sectionKeys.map(sectionName => {
  const articles = sections[sectionName] || [];
  return `
${sectionName.toUpperCase()}
${'-'.repeat(50)}

${articles.map((article, idx) => {
  const summary = article.summary || article.description || '';
  const summaryText = article.relevance
    ? `Summary: ${article.summary}\n\n   Relevance: ${article.relevance}`
    : (summary || 'Read the full article for more details.');
  return `
${idx + 1}. ${article.title}

   ${summaryText}

   Source: ${article.source}
   Published: ${article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
   ${isQualitySource(article.link) ? '✓ Quality Source  ' : ''}${isPaywalled(article.link) ? '⚠ Paywall' : ''}

   Read more: ${article.link}
`;
}).join('\n')}
  `;
}).join('\n')}

${'='.repeat(70)}

Thank you for reading your Morning Brief!

This digest was automatically generated using AI to help you stay informed
about the topics that matter most to you.

Manage your preferences: https://morning-brief-weld.vercel.app
Unsubscribe: https://morning-brief-weld.vercel.app

Sent from petarivancevic.com
  `.trim();

  return { htmlContent, textContent };
}

function isQualitySource(url) {
  const qualitySources = ['reuters.com', 'apnews.com', 'bloomberg.com', 'bbc.com', 'npr.org', 'techcrunch.com', 'arstechnica.com', 'theverge.com', 'ft.com', 'economist.com', 'wsj.com', 'nytimes.com'];
  return qualitySources.some(source => url?.toLowerCase().includes(source));
}
