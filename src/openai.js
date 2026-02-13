import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Only for development - use a backend in production!
});

/**
 * Generate AI summaries for news articles using OpenAI
 * @param {Array} articles - Array of article objects with title, description, etc.
 * @param {string} style - Summary style: 'scan', 'brief', 'indepth', or 'relevance'
 * @param {Array} expertise - User's areas of expertise
 * @param {Array} companies - Companies the user is tracking
 * @returns {Promise<Array>} Array of summary objects with index, summary, and relevance
 */
export async function summarizeWithOpenAI(articles, style = 'brief', expertise = [], companies = []) {
  if (style === 'scan') {
    return articles.map((a, i) => ({ index: i, summary: null, relevance: null }));
  }

  try {
    const styleInstructions = {
      brief: "Provide a 2-4 sentence summary covering key facts and context.",
      indepth: "Provide a 4-6 sentence summary with background, implications, and what to watch.",
      relevance: "Provide a brief summary plus a personalized 'Why this matters' section based on the user's expertise."
    };

    const instruction = styleInstructions[style] || styleInstructions.brief;
    const expertiseText = expertise.length > 0 ? `\nUser expertise: ${expertise.join(', ')}` : '';
    const companiesText = companies.length > 0 ? `\nTracking companies: ${companies.join(', ')}` : '';

    const summaries = await Promise.all(
      articles.map(async (article, index) => {
        try {
          const prompt = `${instruction}${expertiseText}${companiesText}

Article Title: ${article.title}
Article Description: ${article.description || 'No description available'}
Source: ${article.source}

Please provide a clear, concise summary. If this article is relevant to the user's expertise or tracked companies, mention why it matters.`;

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Fast and cost-effective
            messages: [
              {
                role: "system",
                content: "You are a professional news summarizer. Provide clear, concise, and accurate summaries."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            max_tokens: style === 'brief' ? 150 : 250,
            temperature: 0.3
          });

          return {
            index,
            summary: response.choices[0].message.content.trim(),
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

    return summaries;
  } catch (error) {
    console.error('Error with OpenAI summarization:', error);
    // Fallback to original descriptions
    return articles.map((a, i) => ({
      index: i,
      summary: a.description || "AI summaries unavailable",
      relevance: null
    }));
  }
}

/**
 * Simple chat completion with OpenAI
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {Object} options - Optional parameters (model, temperature, etc.)
 * @returns {Promise<string>} The AI response
 */
export async function chat(prompt, options = {}) {
  const {
    model = "gpt-4o-mini",
    temperature = 0.7,
    maxTokens = 500,
    systemPrompt = "You are a helpful assistant."
  } = options;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens,
      temperature
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI chat error:', error);
    throw error;
  }
}

export default openai;
