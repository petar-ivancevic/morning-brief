# Supabase Setup Guide

This guide will help you set up Supabase for authentication, database, and email functionality.

## 🚀 Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New Project"
5. Fill in:
   - **Name:** morning-brief
   - **Database Password:** (generate a secure password)
   - **Region:** Choose closest to your users
6. Click "Create new project"
7. Wait 2-3 minutes for setup to complete

## 🔑 Step 2: Get Your API Keys

1. Go to **Project Settings** (gear icon)
2. Navigate to **API** section
3. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (starts with `eyJ...`)

## 📧 Step 3: Configure Email Authentication

### Enable Magic Links

1. Go to **Authentication** → **Providers**
2. Find **Email** provider
3. Enable it if not already enabled
4. Configure settings:
   - ✅ **Enable Email provider**
   - ✅ **Confirm email** (optional, but recommended)
   - ✅ **Secure email change** (recommended)

### Configure Email Templates

1. Go to **Authentication** → **Email Templates**

2. **Magic Link** template:
```html
<h2>Sign in to Morning Brief</h2>
<p>Click the link below to sign in to your account:</p>
<p><a href="{{ .ConfirmationURL }}">Magic Link</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{ .ConfirmationURL }}</p>
<p>This link expires in 60 minutes.</p>
<p>If you didn't request this email, you can safely ignore it.</p>
```

3. **Confirm Signup** template (optional):
```html
<h2>Confirm your email for Morning Brief</h2>
<p>Click the link below to confirm your email address:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm Email</a></p>
<p>Or copy and paste this URL into your browser:</p>
<p>{{ .ConfirmationURL }}</p>
```

### Configure Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Add your site URLs to **Redirect URLs**:
   - `http://localhost:5173` (local development)
   - `https://your-app.vercel.app` (production)

### Rate Limiting (Important for Security)

1. Go to **Authentication** → **Rate Limits**
2. Configure limits:
   - **Email/Password sign-in:** 30 per hour
   - **Email sign-up:** 10 per hour
   - **Magic link:** 5 per hour (to prevent spam)

## 🗄️ Step 4: Create Database Tables

Go to **SQL Editor** and run this SQL:

\`\`\`sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  categories TEXT[] DEFAULT ARRAY['Technology', 'Business'],
  expertise TEXT[] DEFAULT ARRAY[]::TEXT[],
  companies TEXT[] DEFAULT ARRAY[]::TEXT[],
  paywalled_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
  blocked_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
  max_articles_per_section INTEGER DEFAULT 5,
  summary_style TEXT DEFAULT 'brief',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Digests table
CREATE TABLE IF NOT EXISTS public.digests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sections JSONB NOT NULL,
  article_count INTEGER NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Policies for digests
CREATE POLICY "Users can view their own digests"
  ON public.digests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own digests"
  ON public.digests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_digests_user_id ON public.digests(user_id);
CREATE INDEX IF NOT EXISTS idx_digests_generated_at ON public.digests(generated_at DESC);

-- Function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
\`\`\`

Click **Run** to execute the SQL.

## 📧 Step 5: Configure SMTP (Optional but Recommended)

By default, Supabase uses their email service, but it has limits. For production, use your own SMTP:

1. Go to **Project Settings** → **Auth**
2. Scroll to **SMTP Settings**
3. Enable **Use custom SMTP server**
4. Configure your SMTP provider (Gmail, SendGrid, etc.)

### Example with Gmail:
- **Host:** smtp.gmail.com
- **Port:** 587
- **Username:** your-email@gmail.com
- **Password:** your-app-password (not regular password!)
- **Sender name:** Morning Brief
- **Sender email:** your-email@gmail.com

### Example with SendGrid:
- **Host:** smtp.sendgrid.net
- **Port:** 587
- **Username:** apikey
- **Password:** Your SendGrid API key
- **Sender name:** Morning Brief
- **Sender email:** your-verified@sendgrid-email.com

## 🔧 Step 6: Update Environment Variables

Update your `.env` file:

\`\`\`env
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-anon-key

# OpenAI (already configured)
OPENAI_API_KEY=sk-proj-...
\`\`\`

Update `.env.example`:

\`\`\`env
# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# OpenAI
OPENAI_API_KEY=your-openai-api-key-here
\`\`\`

## 🧪 Step 7: Test Authentication

1. **Start your dev server:**
   \`\`\`bash
   npm run dev
   \`\`\`

2. **Test magic link flow:**
   - Open http://localhost:5173
   - Enter your email
   - Click "Send Magic Link"
   - Check your email (might be in spam)
   - Click the link in the email
   - You should be signed in!

3. **Check Supabase Dashboard:**
   - Go to **Authentication** → **Users**
   - You should see your user listed

## 🚀 Step 8: Deploy to Vercel

1. **Add Supabase environment variables to Vercel:**
   - Go to your Vercel project
   - Settings → Environment Variables
   - Add:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `OPENAI_API_KEY` (already added)

2. **Update redirect URLs in Supabase:**
   - Go to Supabase → Authentication → URL Configuration
   - Add your Vercel URL: `https://your-app.vercel.app`

3. **Redeploy from Vercel dashboard**

## 🐛 Troubleshooting

### Magic link not sending
- Check spam folder
- Verify email provider is enabled in Supabase
- Check rate limits (Auth → Rate Limits)
- View logs in Supabase Dashboard → Logs

### "Invalid login credentials" error
- Make sure you clicked the magic link in your email
- Check if the link expired (60 min timeout)
- Try requesting a new magic link

### "Row Level Security" errors
- Make sure you ran the SQL in Step 4
- Verify policies are enabled (SQL Editor → run: `SELECT * FROM pg_policies;`)

### User can't see their data
- Check RLS policies
- Verify `auth.uid()` matches the user's ID
- Check browser console for errors

## 📚 Additional Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Magic Link Guide](https://supabase.com/docs/guides/auth/auth-magic-link)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)

## 🎯 Next Steps

After setup:
1. Test user registration and login
2. Create a profile and generate a brief
3. Verify data is saving to Supabase
4. Set up email notifications (optional)
5. Monitor usage in Supabase dashboard
