# Vercel Deployment Guide

This guide will help you deploy your Morning Brief app to Vercel with secure OpenAI integration.

## 🚀 Quick Deploy

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add OpenAI integration with secure API routes"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository

3. **Add Environment Variable**
   - In the Vercel project settings, go to "Environment Variables"
   - Add a new variable:
     - **Name:** `OPENAI_API_KEY`
     - **Value:** Your OpenAI API key (starts with `sk-proj-...`)
     - **Environment:** Production, Preview, and Development
   - Click "Save"

4. **Deploy**
   - Vercel will automatically deploy your app
   - Your OpenAI API key is now securely stored server-side

## 🔒 Security Features

✅ **API Key Protection**
- The OpenAI API key is stored as an environment variable in Vercel
- It's only accessible in server-side API routes (`/api/summarize.js`)
- Never exposed to the client-side code or browser
- Not included in the JavaScript bundle

✅ **Secure API Routes**
- All OpenAI calls happen server-side
- Client calls `/api/summarize` endpoint
- API route processes the request and calls OpenAI
- No API key in the frontend code

## 📁 Project Structure

```
morning-brief/
├── api/
│   └── summarize.js          # Server-side OpenAI integration
├── src/
│   ├── api-client.js          # Client-side API wrapper
│   ├── openai.js              # (Optional) Direct OpenAI helper
│   └── App.jsx                # Uses api-client.js
├── vercel.json                # Vercel configuration
└── .env                       # Local environment variables (not committed)
```

## 🧪 Testing Locally

1. **Install Vercel CLI** (optional)
   ```bash
   npm i -g vercel
   ```

2. **Run with Vercel Dev**
   ```bash
   vercel dev
   ```
   This simulates the Vercel environment locally, including API routes.

3. **Or use Vite dev server**
   ```bash
   npm run dev
   ```
   Note: API routes won't work with plain Vite. Use Vercel CLI for full testing.

## 🔧 Environment Variables

### Local Development
- File: `.env`
- Variable: `OPENAI_API_KEY=sk-proj-...`

### Vercel Production
- Dashboard: Project Settings → Environment Variables
- Variable: `OPENAI_API_KEY`
- Environments: Production, Preview, Development

## 📊 API Route Details

### Endpoint: `/api/summarize`
- **Method:** POST
- **Body:**
  ```json
  {
    "articles": [...],
    "style": "brief",
    "expertise": ["AI", "Business"],
    "companies": ["Microsoft", "OpenAI"]
  }
  ```
- **Response:**
  ```json
  {
    "summaries": [
      {
        "index": 0,
        "summary": "...",
        "relevance": null
      }
    ]
  }
  ```

### Rate Limiting
- Processes articles in batches of 5
- Uses `gpt-4o-mini` for cost-effectiveness
- Max tokens: 150 (brief) or 250 (in-depth)

## 💰 Cost Optimization

The app uses **GPT-4o-mini** which is very cost-effective:
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

**Estimated costs per brief:**
- 5 topics × 5 articles = 25 summaries
- ~150 tokens per summary = 3,750 tokens
- Cost per brief: ~$0.002 (less than a penny!)

## 🐛 Troubleshooting

### API Routes not working locally
- Use `vercel dev` instead of `npm run dev`
- Or wait until deployed to Vercel

### "OpenAI API key not found" error
- Check environment variables in Vercel dashboard
- Ensure variable name is exactly `OPENAI_API_KEY`
- Redeploy after adding environment variables

### Summaries not generating
- Check Vercel function logs in the dashboard
- Verify OpenAI API key is valid
- Check if you have OpenAI credits

## 📚 Additional Resources

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)

## 🎉 Next Steps

After deploying:
1. Test the app with real news feeds
2. Monitor OpenAI usage in the [OpenAI Dashboard](https://platform.openai.com/usage)
3. Set up usage alerts in OpenAI to control costs
4. Customize summary styles to your preference
