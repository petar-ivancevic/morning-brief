import OpenAI from 'openai';

// Initialize OpenAI with server-side API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { articles, style = 'brief', expertise = [], companies = [] } = req.body;

    if (!articles || !Array.isArray(articles)) {
      return res.status(400).json({ error: 'Invalid articles array' });
    }

    // Return early for scan mode
    if (style === 'scan') {
      return res.json({
        summaries: articles.map((_, i) => ({ index: i, summary: null, relevance: null }))
      });
    }

    const styleInstructions = {
      brief: "Provide a 2-4 sentence summary covering key facts and context.",
      indepth: "Provide a 4-6 sentence summary with background, implications, and what to watch.",
      relevance: "Provide a JSON response with two fields: 'summary' (2-3 sentence summary of the article) and 'relevance' (2-3 sentences explaining why this matters to someone in the user's role/expertise)."
    };

    const instruction = styleInstructions[style] || styleInstructions.brief;
    const expertiseText = expertise.length > 0 ? `\nUser's role/expertise: ${expertise.join(', ')}` : '';
    const companiesText = companies.length > 0 ? `\nTracking companies: ${companies.join(', ')}` : '';

    // Process articles in batches to avoid rate limits
    const batchSize = 5;
    const summaries = [];

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (article, batchIndex) => {
          const index = i + batchIndex;

          try {
            const prompt = `${instruction}${expertiseText}${companiesText}

Article Title: ${article.title}
Article Description: ${article.description || 'No description available'}
Source: ${article.source}

Please provide a clear, concise summary. If this article is relevant to the user's expertise or tracked companies, mention why it matters.`;

            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: style === 'relevance'
                    ? "You are a professional news summarizer. Return your response as valid JSON with 'summary' and 'relevance' fields."
                    : "You are a professional news summarizer. Provide clear, concise, and accurate summaries."
                },
                {
                  role: "user",
                  content: prompt
                }
              ],
              max_tokens: style === 'brief' ? 150 : 250,
              temperature: 0.3,
              response_format: style === 'relevance' ? { type: "json_object" } : undefined
            });

            const content = response.choices[0].message.content.trim();

            // For relevance mode, parse JSON response
            if (style === 'relevance') {
              try {
                const parsed = JSON.parse(content);
                return {
                  index,
                  summary: parsed.summary || content,
                  relevance: parsed.relevance || null
                };
              } catch (e) {
                // Fallback if JSON parsing fails
                return {
                  index,
                  summary: content,
                  relevance: null
                };
              }
            }

            return {
              index,
              summary: content,
              relevance: null
            };
          } catch (error) {
            console.error(`Error summarizing article ${index}:`, error);
            return {
              index,
              summary: article.description || "Summary unavailable",
              relevance: null
            };
          }
        })
      );

      summaries.push(...batchResults);
    }

    return res.json({ summaries });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return res.status(500).json({
      error: 'Failed to generate summaries',
      message: error.message
    });
  }
}
