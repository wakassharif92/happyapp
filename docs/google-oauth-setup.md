# Google Sign-In — setup

Covers configuring Google OAuth credentials and Supabase's Google provider.
Code-side details (callback route, onboarding, invite claims) are in
`qa-agent-spec.md`'s Google Sign-In section and `PROGRESS.md`'s
corresponding entry — this file is only the "what to click" half. Unlike
Slack (which this app hand-rolls the OAuth token exchange for), Supabase
handles the Google token exchange itself server-side using credentials you
configure in its own dashboard — no client secret ever touches this app's
own env vars.

## 1. Create OAuth credentials in Google Cloud Console

1. Go to <https://console.cloud.google.com/> → create a project (or pick an
   existing one) → **APIs & Services** → **OAuth consent screen**.
   - User type: **External** (unless every signer-inner is inside your own
     Google Workspace org, in which case Internal is fine).
   - Fill in the app name, support email, and developer contact — that's
     enough to get through this screen for now.
2. **APIs & Services** → **Credentials** → **Create Credentials** →
   **OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs** → add your Supabase project's callback URL:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
     Find `<your-project-ref>` in Supabase Dashboard → **Settings** →
     **API** → **Project URL**. This is Supabase's own callback, not this
     app's `/auth/callback` route — Supabase sits in the middle of the
     OAuth round-trip and forwards the result to this app afterward.
3. Save — you'll get a **Client ID** and **Client Secret**.

## 2. Configure the provider in Supabase

Supabase Dashboard → **Authentication** → **Providers** → **Google**:

1. Toggle it **on**.
2. Paste the **Client ID** and **Client Secret** from step 1.
3. Save.

That's it on Supabase's side — no migration, no env var. The
`redirectTo` this app passes when starting the flow
(`app/login/actions.ts`'s `signInWithGoogle`/`linkGoogleAccount`) points
back at this app's own `/auth/callback` route, which is where
`exchangeCodeForSession` actually runs.

## 3. Verify

1. `npm run dev`, go to `/login`, click **Continue with Google**.
2. You should land on Google's real consent screen, approve, and land back
   on `/dashboard` (or `/onboarding` for a brand new identity with no
   company yet).
3. If you land back on `/login?error=...` instead, the error message names
   what failed — the most common cause is the redirect URI in step 1.2 not
   exactly matching your Supabase project's callback URL (trailing slash,
   http vs https, etc.).

## 4. Migrating the existing account

Before removing the password login entirely, the account already in
production needs to link a Google identity to its *existing* `auth.users`
row (not create a separate one) — see `PROGRESS.md`'s Google Sign-In
section for why this order matters. Once steps 1–3 above are done:

1. Sign in with the old email/password one last time.
2. Visit `/link-google` and click **Link Google account**.
3. Sign out, sign back in with **Continue with Google** — confirm you land
   in the same account (same projects, same data).
4. Only after that's confirmed: the password form on `/login` and the
   `/link-google` page itself get removed.
