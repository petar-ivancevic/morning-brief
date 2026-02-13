/**
 * Client-side API wrapper for calling backend summarization endpoints
 * This keeps the OpenAI API key secure on the server
 */

/**
 * Generate AI summaries for news articles via backend API
 * @param {Array} articles - Array of article objects with title, description, etc.
 * @param {string} style - Summary style: 'scan', 'brief', 'indepth', or 'relevance'
 * @param {Array} expertise - User's areas of expertise
 * @param {Array} companies - Companies the user is tracking
 * @returns {Promise<Array>} Array of summary objects with index, summary, and relevance
 */
export async function summarizeArticles(articles, style = 'brief', expertise = [], companies = []) {
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        articles,
        style,
        expertise,
        companies
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to generate summaries');
    }

    const data = await response.json();
    return data.summaries || [];
  } catch (error) {
    console.error('Error calling summarize API:', error);
    // Fallback to original descriptions
    return articles.map((a, i) => ({
      index: i,
      summary: a.description || "AI summaries unavailable",
      relevance: null
    }));
  }
}
