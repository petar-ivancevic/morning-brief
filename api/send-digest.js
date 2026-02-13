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

    // Send email via Resend
    const result = await resend.emails.send({
      from: 'Morning Brief <noreply@petarivancevic.com>',
      to: email,
      subject: `Your Morning Brief – ${formatDate(generatedAt)}`,
      html: htmlContent,
      text: textContent,
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

  // HTML Email
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Morning Brief</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1714;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #fefcfa;
    }
    .header {
      text-align: center;
      padding: 30px 0;
      border-bottom: 3px double #ede8e0;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 40px;
      margin-bottom: 10px;
    }
    .title {
      font-family: 'Georgia', serif;
      font-size: 32px;
      font-weight: 400;
      margin: 10px 0;
      color: #1a1714;
    }
    .subtitle {
      font-size: 13px;
      color: #5c554c;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .section {
      margin: 30px 0;
    }
    .section-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      padding: 10px 0;
      margin-bottom: 15px;
      border-bottom: 2px solid #ee5a24;
      color: #ee5a24;
    }
    .article {
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 1px solid #ede8e0;
    }
    .article:last-child {
      border-bottom: none;
    }
    .article-title {
      font-family: 'Georgia', serif;
      font-size: 18px;
      font-weight: 600;
      color: #1a1714;
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .article-title a {
      color: #1a1714;
      text-decoration: none;
    }
    .article-title a:hover {
      color: #ee5a24;
    }
    .article-summary {
      font-size: 15px;
      color: #1a1714;
      margin-bottom: 10px;
      line-height: 1.7;
    }
    .article-meta {
      font-size: 12px;
      color: #5c554c;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      margin-left: 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .quality-badge {
      background: rgba(46, 160, 67, 0.1);
      color: #2a8c3e;
      border: 1px solid rgba(46, 160, 67, 0.2);
    }
    .paywall-badge {
      background: rgba(192, 120, 48, 0.1);
      color: #c07830;
      border: 1px solid rgba(192, 120, 48, 0.2);
    }
    .footer {
      text-align: center;
      padding: 30px 0;
      margin-top: 40px;
      border-top: 3px double #ede8e0;
      color: #5c554c;
      font-size: 13px;
    }
    .powered-by {
      margin-top: 10px;
      font-size: 11px;
      color: #a09888;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">☀️</div>
    <div class="title">The Morning Brief</div>
    <div class="subtitle">${date} · ${totalArticles} articles · ${sectionKeys.length} sections</div>
  </div>

  ${sectionKeys.map((sectionName, idx) => {
    const articles = sections[sectionName] || [];
    return `
      <div class="section">
        <div class="section-header">${sectionName}</div>
        ${articles.map(article => `
          <div class="article">
            <div class="article-title">
              <a href="${article.link}" target="_blank">${article.title}</a>
            </div>
            ${article.summary ? `<div class="article-summary">${article.summary}</div>` : ''}
            <div class="article-meta">
              ${article.source} · ${formatArticleDate(article.pubDate)}
              ${isQualitySource(article.link) ? '<span class="badge quality-badge">Quality Source</span>' : ''}
              ${isPaywalled(article.link) ? '<span class="badge paywall-badge">Paywall</span>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('')}

  <div class="footer">
    <div>End of Morning Brief · Generated by AI</div>
    <div class="powered-by">
      Sent from <strong>petarivancevic.com</strong> ·
      <a href="https://morning-brief.vercel.app" style="color: #ee5a24; text-decoration: none;">Manage Preferences</a>
    </div>
  </div>
</body>
</html>
  `;

  // Plain Text Email
  const textContent = `
MORNING BRIEF — ${date}
${'='.repeat(60)}

${sectionKeys.map(sectionName => {
  const articles = sections[sectionName] || [];
  return `
${sectionName.toUpperCase()}
${'-'.repeat(40)}

${articles.map(article => `
• ${article.title}
  ${article.summary || ''}
  ${article.source} · ${formatArticleDate(article.pubDate)}
  ${article.link}
`).join('\n')}
  `;
}).join('\n')}

${'='.repeat(60)}
End of Morning Brief · Generated by AI
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
