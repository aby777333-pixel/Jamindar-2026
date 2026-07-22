# Jamindar — Jamin Properties Mobile App

A premium, mobile-first property platform for **Jamin Properties** ("Signature for Fortune"), with
**Jamindar** — a multilingual voice assistant powered by Sarvam AI — woven throughout.

Built with **Expo (SDK 56) + expo-router + Supabase**. Modular and additive: new modules plug in
without restructuring.

## Modules (Increment 1)

| Module | Status |
| --- | --- |
| **Auth** — mobile-number OTP only, no passwords, persistent sessions | ✅ |
| **Buyers** — guided preference onboarding, property browse, favourites, site visits, callbacks | ✅ |
| **Jamin Listed Properties** — company-owned lands/plots with detail, brochure, map, share | ✅ |
| **Promoters** — digital vCard + QR + referral link, leads & site-visit dashboard | ✅ |
| **Super Admin** — ecosystem dashboard, live stats, voice-log monitor | ✅ |
| **Jamindar voice** — chat, TTS, STT, translate, auto language detect (Sarvam) | ✅ |

## Architecture

```
app/                     expo-router screens
  _layout.tsx            root: fonts, providers, session bootstrap
  index.tsx              gate → welcome / role / home
  welcome · login · verify · role · profile
  (tabs)/                Home · Properties · Jamindar · Account (bottom nav)
  property/[id].tsx      property detail (all actions wired to DB)
  admin/ · promoter/ · buyer/onboarding
components/              Brand (SVG logo), ui, Field, Jamindar (voice sheet + FAB)
lib/                     supabase, store (zustand auth), jamindar (voice client),
                         types, theme, format, env
supabase/                migrations + edge functions (source of truth)
```

## Backend (Supabase project `zmxqozvivdluuxvvcegs`)

- **Tables**: profiles, otp_codes, properties, buyer_preferences, favorites, site_visits,
  leads, brochure_downloads, promoter_profiles, voice_logs, activity_log, app_secrets.
  RLS on every table; role checks via a `SECURITY DEFINER` helper (no recursion).
- **Edge functions**:
  - `send-otp` — generates a hashed 6-digit code (5-min expiry, rate-limited). MSG91 slot for
    production SMS; falls back to dev-log (`devCode`) when unconfigured.
  - `verify-otp` — validates the code, creates/gets the auth user, returns session credentials.
  - `jamindar-voice` — secure Sarvam proxy (chat `sarvam-105b`, TTS, STT, translate, LID);
    the Sarvam key never leaves the server. Logs transcripts to `voice_logs`.

## Configuration

Client config is in `app.json → expo.extra` (Supabase URL + publishable key).

Server secrets live in the `app_secrets` table / edge-function env:

| Key | Purpose |
| --- | --- |
| `SARVAM_API_KEY` | Jamindar voice (stored in `app_secrets`) |
| `MSG91_AUTHKEY`, `MSG91_TEMPLATE_ID` | production OTP SMS (edge-function env) |
| `OTP_PEPPER` | OTP hashing pepper (edge-function env) |
| `OTP_DEV_MODE` | `true` returns the code in the response for testing |

> ⚠️ Rotate the Sarvam key before public launch — it was shared in chat during setup.

## Develop

```bash
npm install --legacy-peer-deps
npm run start        # Expo dev server (scan with Expo Go / dev build)
npm run typecheck    # tsc --noEmit
```

Build for stores with **EAS** (`eas build`). This is a native app — it is **not** deployed to
Netlify; a companion web admin can be added later.

## Roadmap (next increments)

- Property compare, virtual tours, video gallery, distance calculator
- Admin: full user/property CRUD screens, analytics charts, PDF/Excel/CSV export
- Promoter: commission dashboard, referral network
- Jamindar: voice-driven form filling & navigation, brochure read-aloud
- Push notifications, offline resilience, full i18n catalogue
