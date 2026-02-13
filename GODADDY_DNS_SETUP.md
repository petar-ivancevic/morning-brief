# GoDaddy DNS Setup for Resend Email

Detailed step-by-step instructions for adding Resend DNS records to your GoDaddy domain (petarivancevic.com).

## 📍 You Are Here

You should be on the DNS Records page for petarivancevic.com:
- URL: `dcc.godaddy.com/control/portfolio/petarivancevic.com/settings`
- Tab: **DNS Records**

---

## 🎯 Overview: What We're Adding

You need to add **3 TXT records** to verify your domain with Resend:

1. **SPF Record** - Authorizes Resend to send emails from your domain
2. **DKIM Record** - Cryptographically signs your emails
3. **DMARC Record** - Tells email providers how to handle failed authentication

---

## 📝 Step 1: Get Your DNS Records from Resend

### First, Get Records from Resend Dashboard

1. Go to [resend.com/domains](https://resend.com/domains)
2. Click on **petarivancevic.com** (or add it if you haven't)
3. You'll see a page with DNS records - **KEEP THIS PAGE OPEN**
4. You'll need to copy values from here

### What You'll See in Resend:

```
✓ SPF Record
  Type: TXT
  Name: @
  Value: v=spf1 include:amazonses.com ~all

✓ DKIM Record
  Type: TXT
  Name: resend._domainkey
  Value: p=MIGfMA0... (long string)

✓ DMARC Record (Optional)
  Type: TXT
  Name: _dmarc
  Value: v=DMARC1; p=none;
```

---

## 🔧 Step 2: Add SPF Record in GoDaddy

### 2.1 Click "Add New Record"

On your current GoDaddy DNS page, click the **"Add New Record"** button (gray button on the left).

### 2.2 Select TXT Record

In the dropdown menu under **"Type"**, select **"TXT"**

### 2.3 Fill in SPF Record

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Type** | TXT | _(already selected)_ |
| **Name** | `@` | Just the @ symbol |
| **Value** | `v=spf1 include:amazonses.com ~all` | Copy from Resend dashboard |
| **TTL** | 1 Hour | _(default is fine)_ |

### 2.4 Important Notes:

- **Name field:** Enter exactly `@` (this means "root domain")
- **Value field:** Must start with `v=spf1`
- **Don't include quotes** - GoDaddy adds them automatically

### 2.5 Click "Save"

Click the black **"Save"** button in the bottom right.

✅ **Result:** You should see a new TXT record with Name "@" in your records list.

---

## 🔧 Step 3: Add DKIM Record in GoDaddy

### 3.1 Click "Add New Record" Again

Click the **"Add New Record"** button again to add another record.

### 3.2 Select TXT Record

In the dropdown menu under **"Type"**, select **"TXT"**

### 3.3 Fill in DKIM Record

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Type** | TXT | _(already selected)_ |
| **Name** | `resend._domainkey` | Exactly this |
| **Value** | `p=MIGfMA0GCSqGSIb3D...` | **Copy from Resend dashboard** |
| **TTL** | 1 Hour | _(default is fine)_ |

### 3.4 Important Notes:

- **Name field:** Enter exactly `resend._domainkey`
- **Value field:** This is a LONG string starting with `p=`
- **Copy the ENTIRE value** from Resend - it's usually 300+ characters
- **Don't add extra spaces** at the beginning or end

### 3.5 Click "Save"

Click the black **"Save"** button.

✅ **Result:** You should see a new TXT record with Name "resend._domainkey" in your list.

---

## 🔧 Step 4: Add DMARC Record in GoDaddy

### 4.1 Click "Add New Record" One More Time

Click the **"Add New Record"** button again.

### 4.2 Select TXT Record

In the dropdown menu under **"Type"**, select **"TXT"**

### 4.3 Fill in DMARC Record

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Type** | TXT | _(already selected)_ |
| **Name** | `_dmarc` | Exactly this |
| **Value** | `v=DMARC1; p=none; rua=mailto:dmarc@petarivancevic.com` | Copy below |
| **TTL** | 1 Hour | _(default is fine)_ |

### 4.4 DMARC Value Options:

**Basic (Recommended for testing):**
```
v=DMARC1; p=none; rua=mailto:dmarc@petarivancevic.com
```

**Strict (After testing):**
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@petarivancevic.com
```

**Very Strict:**
```
v=DMARC1; p=reject; rua=mailto:dmarc@petarivancevic.com
```

### 4.5 What These Mean:

- `p=none` - Monitor only (recommended to start)
- `p=quarantine` - Put suspicious emails in spam
- `p=reject` - Block suspicious emails entirely

### 4.6 Click "Save"

Click the black **"Save"** button.

✅ **Result:** You should see a new TXT record with Name "_dmarc" in your list.

---

## 🕐 Step 5: Wait for DNS Propagation

DNS changes take time to spread across the internet.

### Typical Wait Times:

- **Minimum:** 5-15 minutes
- **Typical:** 30-60 minutes
- **Maximum:** 24-48 hours (rare)

### What to Do While Waiting:

1. ☕ Grab a coffee
2. 📧 Set up Supabase SMTP (see below)
3. 🎨 Customize your email templates
4. ⏰ Check back in 15-30 minutes

---

## ✅ Step 6: Verify DNS Records

### 6.1 Check in Resend Dashboard

1. Go back to [resend.com/domains](https://resend.com/domains)
2. Click on **petarivancevic.com**
3. Look for verification status:
   - ⏳ **Pending** - Still propagating, wait more
   - ✅ **Verified** - Success! You're done!
   - ❌ **Failed** - Check records (see troubleshooting)

### 6.2 Manually Check DNS Records

Use online tools to verify your records:

**MX Toolbox (Recommended):**
1. Go to [mxtoolbox.com/SuperTool.aspx](https://mxtoolbox.com/SuperTool.aspx)
2. Select "TXT Lookup" from dropdown
3. Enter: `petarivancevic.com`
4. Click "TXT Lookup"
5. Look for your SPF record starting with `v=spf1`

**Check DKIM:**
1. Same tool, select "TXT Lookup"
2. Enter: `resend._domainkey.petarivancevic.com`
3. Should show your DKIM key

**Check DMARC:**
1. Same tool, select "TXT Lookup"
2. Enter: `_dmarc.petarivancevic.com`
3. Should show your DMARC policy

---

## 📋 Your Final DNS Records Should Look Like:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| TXT | @ | v=spf1 include:amazonses.com ~all | 1 Hour |
| TXT | resend._domainkey | p=MIGfMA0... (long key) | 1 Hour |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:dmarc@petarivancevic.com | 1 Hour |
| A | @ | WebsiteBuilder Site | 1 Hour |

**Note:** Your existing "A" record for WebsiteBuilder Site should remain - don't delete it!

---

## 🔧 Step 7: Configure Supabase SMTP

Once your DNS is verified in Resend:

### 7.1 Get Your Resend API Key

1. Go to [resend.com/api-keys](https://resend.com/api-keys)
2. Click **"Create API Key"**
3. Name: `morning-brief-smtp`
4. Permission: **Sending access**
5. Click **"Create"**
6. **Copy the key** (starts with `re_...`)
7. **Save it** - you won't see it again!

### 7.2 Configure Supabase

1. Go to your Supabase project dashboard
2. Click **Settings** (gear icon) → **Auth**
3. Scroll to **SMTP Settings**
4. Click **"Enable Custom SMTP"**
5. Fill in:

```
Host: smtp.resend.com
Port: 465
Username: resend
Password: (paste your Resend API key - re_...)
Sender Email: noreply@petarivancevic.com
Sender Name: Morning Brief
```

6. Click **"Save"**

---

## 🧪 Step 8: Test Your Setup

### 8.1 Test from Resend

1. Go to [resend.com/emails](https://resend.com/emails)
2. Click **"Send test email"**
3. Enter your email address
4. Click **"Send"**
5. Check your inbox for email from `noreply@petarivancevic.com`

### 8.2 Test from Your App

1. Run your app: `npm run dev`
2. Go to http://localhost:5173
3. Enter your email on login page
4. Click "Send Magic Link"
5. Check your email - should come from your domain!
6. Verify it doesn't go to spam

---

## 🐛 Troubleshooting

### Problem: "DNS records not found"

**Solution:**
- Wait longer (DNS can take up to 24 hours)
- Check you entered the Name field correctly:
  - SPF: `@` (not blank, not "petarivancevic.com")
  - DKIM: `resend._domainkey` (exact spelling)
  - DMARC: `_dmarc` (starts with underscore)

### Problem: "SPF record already exists"

**Solution:**
- GoDaddy may have an existing SPF record
- Edit the existing one instead of adding new
- Combine like this: `v=spf1 include:amazonses.com include:otherprovider.com ~all`

### Problem: "Value too long" error

**Solution:**
- For DKIM, the value is very long (300+ chars)
- Make sure you copied the ENTIRE value
- GoDaddy can handle long TXT records - paste the whole thing

### Problem: Emails going to spam

**Solutions:**
1. Make sure all 3 records are verified
2. Wait 24 hours for full DNS propagation
3. Send test emails to yourself first (warm up domain)
4. Check [mail-tester.com](https://www.mail-tester.com) for score
5. Make sure you're using `p=none` in DMARC initially

### Problem: Can't find "Add New Record" button

**Solution:**
- You might be in "View Records" mode
- Look for a button that says "Manage" or "Edit"
- Make sure you're on the **DNS Records** tab
- Screenshot shows you're in the right place!

---

## 📞 Need More Help?

### GoDaddy Support:
- Phone: 1-480-505-8877
- Chat: Available in GoDaddy dashboard
- Help: [godaddy.com/help/add-a-txt-record-19232](https://www.godaddy.com/help/add-a-txt-record-19232)

### Resend Support:
- Email: support@resend.com
- Docs: [resend.com/docs](https://resend.com/docs)
- Discord: [resend.com/discord](https://resend.com/discord)

---

## ✅ Checklist

Use this to track your progress:

- [ ] Signed up for Resend
- [ ] Added petarivancevic.com to Resend
- [ ] Added SPF record in GoDaddy (Name: @)
- [ ] Added DKIM record in GoDaddy (Name: resend._domainkey)
- [ ] Added DMARC record in GoDaddy (Name: _dmarc)
- [ ] Waited 15-30 minutes for DNS propagation
- [ ] Verified domain in Resend dashboard (Status: Verified)
- [ ] Got Resend API key
- [ ] Configured Supabase SMTP settings
- [ ] Tested email from Resend dashboard
- [ ] Tested magic link from app
- [ ] Verified emails don't go to spam
- [ ] Updated .env with RESEND_API_KEY
- [ ] Added RESEND_API_KEY to Vercel

---

## 🎉 Success!

Once all checkboxes are complete, your Morning Brief app will send beautiful, professional emails from `noreply@petarivancevic.com`!

**Next:** Follow the main [RESEND_SETUP.md](RESEND_SETUP.md) for email template customization.
