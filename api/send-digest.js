import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, sections, userName, generatedAt } = req.body;

    if (!email || !sections) {
      return res.status(400).json({ error: 'Email and sections required' });
    }

    // Generate email content
    const { htmlContent, textContent } = generateEmailContent(sections, generatedAt);

    // Send email via Resend with List-Unsubscribe header for better deliverability
    const result = await resend.emails.send({
      from: 'Morning Brief <noreply@petarivancevic.com>',
      to: email,
      subject: `Your Morning Brief – ${formatDate(generatedAt)}`,
      html: htmlContent,
      text: textContent,
      headers: {
        'List-Unsubscribe': `<https://morning-brief-weld.vercel.app>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': 'morning-brief'
      }
    });

    return res.status(200).json({
      success: true,
      messageId: result.id
    });
  } catch (error) {
    console.error('Error sending digest email:', error);
    return res.status(500).json({
      error: 'Failed to send email',
      message: error.message
    });
  }
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

                    ${articles.map((article, idx) => `
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
                        ` : article.summary ? `<p style="font-size: 15px; color: #1a1714; margin: 0 0 12px 0; line-height: 1.7;">${article.summary}</p>` : ''}
                        <p style="font-size: 12px; color: #5c554c; margin: 0; line-height: 1.6;">
                          ${article.source} · ${formatArticleDate(article.pubDate)}
                          ${isQualitySource(article.link) ? '<span style="display: inline-block; padding: 3px 8px; margin-left: 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #e8f5e9; color: #2a8c3e; border: 1px solid #a5d6a7;">Quality Source</span>' : ''}
                          ${isPaywalled(article.link) ? '<span style="display: inline-block; padding: 3px 8px; margin-left: 8px; border-radius: 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; background: #fff3e0; color: #c07830; border: 1px solid #ffcc80;">Paywall</span>' : ''}
                        </p>
                      </div>
                    `).join('')}
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
  const summaryText = article.relevance
    ? `Summary: ${article.summary}\n\n   Relevance: ${article.relevance}`
    : (article.summary || 'Read the full article for more details.');
  return `
${idx + 1}. ${article.title}

   ${summaryText}

   Source: ${article.source}
   Published: ${formatArticleDate(article.pubDate)}
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

function formatArticleDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return date;
  }
}

function isQualitySource(url) {
  const qualitySources = ['reuters.com', 'apnews.com', 'bloomberg.com', 'bbc.com', 'npr.org', 'techcrunch.com', 'arstechnica.com', 'theverge.com', 'ft.com', 'economist.com', 'wsj.com', 'nytimes.com'];
  return qualitySources.some(source => url?.toLowerCase().includes(source));
}

function isPaywalled(url) {
  const paywalledSources = ['wsj.com', 'ft.com', 'nytimes.com', 'washingtonpost.com', 'economist.com', 'bloomberg.com'];
  return paywalledSources.some(source => url?.toLowerCase().includes(source));
}
