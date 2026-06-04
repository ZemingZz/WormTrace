# Launching WormTrace 🚀

This guide takes WormTrace from "a web app that runs on my machine" to:

1. **An app people can download** (App Store / Google Play, or install as a PWA)
2. **Accounts** — each user gets their own synced version
3. **Training data sent to a server** — anonymized measurements collected centrally

The **code for all three is already in the repo.** What's left is creating the
accounts/services that only you can own (a Supabase project, an Apple Developer
account) and pasting in the keys. This document is the checklist.

---

## Architecture at a glance

```
WormTrace web app (this repo, static HTML/JS — no build step)
   │
   ├── js/config.js ........ paste Supabase keys here to "turn on" the cloud
   ├── js/cloud.js ......... auth + sync + training-data upload (Supabase)
   ├── js/accountUI.js ..... the ☁ Account button on the Biotastic Lab launcher
   ├── supabase/schema.sql . run once to create the DB tables + security rules
   │
   └── Capacitor (capacitor.config.json) ... wraps the SAME web app into a
       native iOS/Android app for the App Store / Google Play
```

Until you add keys, the app runs exactly as it does today — 100% offline, all
data in the browser. The Account button just says **"Offline mode."** Nothing
breaks.

---

## Part 1 — Accounts + training-data server (Supabase)

This is the foundation; do it first. **Free tier is plenty to start.**

1. **Create the project**
   - Go to <https://supabase.com> → sign in → **New project**.
   - Pick a name (e.g. `wormtrace`), a strong database password, a region near your users.

2. **Create the tables + security rules**
   - In the project, open **SQL Editor → New query**.
   - Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.
   - This creates `profiles`, `user_state`, and `training_contributions`, and the
     Row-Level-Security policies that lock every row to its owner.

3. **Get your keys**
   - **Project Settings → API.**
   - Copy **Project URL** and the **`anon` `public`** key.
   - ⚠️ Use the **anon** key, *never* the `service_role` key, in the app. The anon
     key is safe to ship publicly — RLS (from step 2) is what protects the data.

4. **Paste them into the app**
   - Open [`js/config.js`](js/config.js) and fill in:
     ```js
     SUPABASE_URL:      'https://YOURPROJECT.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...your-anon-key...',
     ```
   - Edit `CONSENT_TEXT` to match your **IRB-approved** language (see Part 4).

5. **Email settings (optional but recommended)**
   - **Authentication → Providers → Email**: for a smoother first launch you can
     turn *off* "Confirm email" while testing, then turn it back on for production.

6. **Test**
   - Serve the app (`npm run serve`, then open <http://localhost:5173>).
   - Open the **Biotastic Lab** launcher → **☁ Account** (top-right) → **Create an
     account**, tick the research-consent box, sign up, then **Contribute training
     data**. Confirm a row appears in Supabase → **Table Editor →
     `training_contributions`**.

### Reading the collected data (the lab side)
Contributors can only see their own rows. To analyze the **whole** dataset, query
from a trusted place using the **`service_role`** key (it bypasses RLS — keep it
secret, never put it in the app or the repo). Example (Python):

```python
from supabase import create_client
sb = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)   # secret key, server-side only
rows = sb.table("training_contributions").select("payload").execute().data
# → feed rows into pandas / scikit-learn / your federated-averaging script
```

---

## Part 2 — Ship as an installable app (PWA — free, instant)

WormTrace is already a PWA. The fastest "download it" story needs **zero** app
stores:

- Host the folder on any static host (**GitHub Pages**, Netlify, Vercel, Cloudflare
  Pages — all free). It must be served over **HTTPS** for service workers + camera.
- On a phone, open the URL and choose **"Add to Home Screen."** It installs with an
  icon and runs full-screen like a native app, and updates the instant you redeploy.

This is the recommended way to **start**, even if you also pursue the App Store.

---

## Part 3 — Ship to the App Store & Google Play (Capacitor)

A real store listing wraps the same web app in a native shell. Tooling is already
configured in [`capacitor.config.json`](capacitor.config.json) and `package.json`.

### One-time setup
```bash
npm install                 # installs Capacitor
npx cap add ios             # creates the native iOS project  (needs macOS + Xcode)
npx cap add android         # creates the native Android project (needs Android Studio)
npx cap sync                # copies the web app into both
```

### Google Play (easiest — do this first)
- **Cost:** $25 one-time. **Review:** usually fast.
- `npx cap open android` → in **Android Studio**, set the app icon/version, then
  **Build → Generate Signed Bundle (.aab)**.
- Create a **Google Play Console** account, create the app, upload the `.aab`, fill
  in the store listing + data-safety form (declare the account email + research
  data you collect), and submit.

### Apple App Store (more gatekept — plan ahead)
- **Requirements:** an **Apple Developer Program** membership (**$99/year**) **and a
  Mac with Xcode** (Capacitor builds iOS only on macOS — if you don't have a Mac,
  use a Mac-in-the-cloud CI service like Codemagic or MacStadium).
- `npx cap open ios` → in **Xcode**, set the Bundle ID
  (`edu.fau.biotasticlab.wormtrace`), signing team, icon, and version → **Product →
  Archive → Distribute App**.
- In **App Store Connect**, create the app, upload the build, fill in privacy
  ("Account" + "Research/Other data"), screenshots, and submit for review.
- ⚠️ **Apple guideline 4.2** rejects apps that are "just a website." We're in good
  shape because WormTrace uses the **camera** (worm counter) and works offline, but
  emphasize native capability in the review notes. If you later add push
  notifications or native file handling, add the matching Capacitor plugin.

### Updating a published app
Web-only change? Re-host (PWA users get it instantly) **and** run `npx cap sync` +
re-archive to push the same change to the store builds.

---

## Part 4 — Before you collect real research data (don't skip)

You're gathering data from people for research, so:

- **IRB:** Check with FAU's IRB whether this needs review/approval. Put the
  approved consent language into `CONFIG.CONSENT_TEXT` in `js/config.js`. The app
  already **gates uploads on consent** (DB-enforced — see the contrib insert policy
  in `schema.sql`).
- **Privacy policy:** Both stores require a privacy-policy URL. State what's
  collected (account email; anonymized strain/temperature/timing measurements — no
  personal data in the payload), how it's stored (Supabase), and how to request
  deletion.
- **Right to withdraw:** deleting a user in Supabase cascades and removes their
  contributions (`on delete cascade`).

---

## Quick checklist

- [ ] Supabase project created
- [ ] `supabase/schema.sql` run successfully
- [ ] `SUPABASE_URL` + `SUPABASE_ANON_KEY` pasted into `js/config.js`
- [ ] Consent text set to IRB-approved language
- [ ] Tested: sign up → contribute → row appears in `training_contributions`
- [ ] App hosted over HTTPS (PWA install works)
- [ ] (Stores) `npm install && npx cap add ios/android && npx cap sync`
- [ ] (Stores) Google Play account ($25) / Apple Developer ($99/yr) + Mac
- [ ] Privacy policy URL + store data-safety forms completed
- [ ] IRB sign-off if required
```
