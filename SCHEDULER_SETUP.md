# Scheduled Email Delivery Setup

This guide explains how the automatic daily email delivery works and how to configure it.

## 🎯 How It Works

The Morning Brief uses **Vercel Cron Jobs** to automatically send daily digests to users who have enabled email delivery.

### Flow:
1. **Cron runs every hour** (configured in `vercel.json`)
2. **Checks which users** have `email_delivery` enabled
3. **Matches delivery time** with current hour (UTC)
4. **Generates brief** for each user
5. **Sends email** via Resend
6. **Saves to database** for history

---

## 🔧 Configuration

### 1. Vercel Cron Setup

The cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-daily-briefs",
      "schedule": "0 * * * *"
    }
  ]
}
```

**Schedule:** `0 * * * *` = Every hour at minute 0

### 2. Cron Secret (Security)

Add a `CRON_SECRET` environment variable in Vercel:

1. Go to Vercel → Settings → Environment Variables
2. Add:
   - **Name:** `CRON_SECRET`
   - **Value:** Generate a random secret (e.g., `openssl rand -base64 32`)
   - **Environments:** Production, Preview, Development

This prevents unauthorized access to your cron endpoint.

### 3. Required Environment Variables

Make sure these are set in Vercel:

```
VITE_SUPABASE_URL=https://...
VITE_SUPABASE_ANON_KEY=eyJ...
RESEND_API_KEY=re_...
CRON_SECRET=your-random-secret
OPENAI_API_KEY=sk-proj-... (if using AI summaries)
```

---

## 👤 User Settings

Users can enable scheduled delivery in their Settings:

1. **Toggle:** "Automatically email me my daily brief"
2. **Time:** Choose delivery time (e.g., 8:00 AM)
3. **Save:** Preferences saved to database

### Database Fields:
- `email_delivery` (boolean) - Whether to send daily emails
- `delivery_time` (string) - Time in HH:MM format (e.g., "08:00")

---

## 🕐 Timezone Handling

**Current Implementation:**
- Uses UTC time matching
- User sets time in their local timezone
- Cron compares delivery_time hour with UTC hour

**Limitation:**
- Simple hour matching (doesn't account for timezones perfectly)

**To Improve:**
- Add `timezone` field to user profile
- Convert delivery_time to UTC when comparing
- Example: User in EST sets 8 AM → Convert to 1 PM UTC

### Example Timezone Implementation:

```sql
-- Add timezone to profiles table
ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'America/New_York';
```

```javascript
// In cron job: Convert user time to UTC
const userTimezone = profile.timezone || 'America/New_York';
const userTime = moment.tz(profile.delivery_time, 'HH:mm', userTimezone);
const utcHour = userTime.utc().hour();
```

---

## 📊 Monitoring

### Vercel Logs

1. Go to Vercel → Deployments → Functions
2. Click on `/api/cron/send-daily-briefs`
3. View logs to see:
   - How many users were processed
   - How many emails were sent
   - Any errors

### Example Log Output:

```
Cron running for hour: 13
Found 5 users with email delivery enabled
Generating brief for user@example.com...
✓ Sent brief to user@example.com
Processed: 5, Sent: 5, Errors: 0
```

### Resend Dashboard

Monitor email delivery:
1. Go to [resend.com/emails](https://resend.com/emails)
2. See all sent emails
3. Check delivery status, opens, clicks

---

## 🐛 Troubleshooting

### Cron Not Running

**Check:**
1. Vercel cron is only available on **Pro plans** (paid)
2. Cron secret matches in code and Vercel settings
3. Deployment succeeded without errors

**Test Manually:**
```bash
curl -X POST https://your-app.vercel.app/api/cron/send-daily-briefs \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Emails Not Sending

**Check:**
1. User has `email_delivery = true` in database
2. User's `delivery_time` matches current UTC hour
3. RESEND_API_KEY is set in Vercel
4. Domain is verified in Resend

**Debug:**
```sql
-- Check which users have email delivery enabled
SELECT id, email_delivery, delivery_time
FROM profiles
WHERE email_delivery = true;
```

### Wrong Delivery Time

**Issue:** User sets 8 AM but receives at different time

**Cause:** Timezone mismatch

**Solution:**
1. Add timezone field to user profile
2. Convert delivery_time to UTC
3. Match UTC hour with cron hour

---

## 🚀 Upgrading to Timezone Support

### Step 1: Update Database

```sql
-- Add timezone column
ALTER TABLE profiles ADD COLUMN timezone TEXT DEFAULT 'UTC';

-- Update existing users (example)
UPDATE profiles
SET timezone = 'America/New_York'
WHERE id = 'user-id';
```

### Step 2: Update UI

Add timezone selector in Settings:

```javascript
<select value={profile.timezone} onChange={e => setProfile({...profile, timezone: e.target.value})}>
  <option value="America/New_York">Eastern Time (ET)</option>
  <option value="America/Chicago">Central Time (CT)</option>
  <option value="America/Denver">Mountain Time (MT)</option>
  <option value="America/Los_Angeles">Pacific Time (PT)</option>
  <option value="Europe/London">London (GMT)</option>
  {/* Add more timezones */}
</select>
```

### Step 3: Update Cron Logic

Install `moment-timezone`:
```bash
npm install moment-timezone
```

Update cron job:
```javascript
import moment from 'moment-timezone';

// In cron job loop
const userTimezone = profile.timezone || 'UTC';
const deliveryTime = profile.delivery_time || '08:00';
const [hour, minute] = deliveryTime.split(':').map(Number);

// Create moment in user's timezone
const userMoment = moment.tz({ hour, minute }, userTimezone);
const utcHour = userMoment.utc().hour();

if (utcHour === currentHour) {
  // Send email
}
```

---

## 💰 Cost Considerations

### Vercel Cron

- **Free:** Not available on Hobby plan
- **Pro:** $20/month (includes cron jobs)
- **Enterprise:** Custom pricing

### Alternative: GitHub Actions (Free)

If you don't want to pay for Vercel Pro:

1. Create `.github/workflows/daily-brief.yml`
2. Run on schedule (cron)
3. Call your API endpoint

Example:
```yaml
name: Send Daily Briefs
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger cron
        run: |
          curl -X POST https://your-app.vercel.app/api/cron/send-daily-briefs \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

---

## 📈 Scaling Considerations

### Current Limits:
- **Resend:** 3,000 emails/month (free)
- **Vercel Function:** 5-minute max duration
- **Processing:** Sequential (one user at a time)

### If You Grow:
1. **Batch processing:** Process users in parallel
2. **Queue system:** Use Redis or Vercel KV
3. **Separate workers:** Dedicated service for digest generation
4. **Upgrade Resend:** Pro plan for more emails

---

## ✅ Checklist

- [ ] Vercel Pro plan activated (or GitHub Actions set up)
- [ ] CRON_SECRET added to Vercel
- [ ] All environment variables configured
- [ ] Cron job deployed successfully
- [ ] Test with one user first
- [ ] Monitor logs for first 24 hours
- [ ] Add timezone support (optional)
- [ ] Set up error alerting (optional)

---

## 🎯 Next Steps

1. **Deploy to Vercel** (auto-deploys from GitHub)
2. **Add CRON_SECRET** environment variable
3. **Enable email delivery** in your user settings
4. **Wait for delivery time** and check your inbox!
5. **Monitor Vercel logs** to ensure it's working

---

**Questions?** Check the logs in Vercel or Resend dashboard for debugging!
