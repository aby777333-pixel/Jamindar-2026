# Jamin Bazaar — Google Play submission pack

Everything the Play Console asks for, answered from the actual code and schema
rather than from guesswork. Written 5 August 2026 against version **1.3.0
(versionCode 11)**, package `app.jamindar.mobile`.

> The readiness report inspected a build labelled 1.2.7 (10). That version came
> from a hand-edited `build.gradle`, and an `expo prebuild` silently reset it to
> 1.0.0 (1). The version now lives in `app.json` (`version` + `android.versionCode`),
> which is the only place prebuild will not overwrite — so this cannot drift again.
> **Every upload to Play must increase `android.versionCode` in `app.json`.**

---

## 1. The two blockers — resolved

| Blocker | Status |
|---|---|
| Debug-signed | **Fixed.** A 4096-bit RSA upload key was generated and release builds are signed with it. |
| `.apk` not `.aab` | **Fixed.** `./gradlew bundleRelease` now produces a signed App Bundle. |

### Signing — read this once, carefully

The keystore and its password are **outside this repository** (the repo is public):

```
C:\Users\GIO4X\Documents\jamin-keystore\jamin-bazaar-release.jks
C:\Users\GIO4X\Documents\jamin-keystore\keystore-password.txt
```

Gradle reads the credentials from `~/.gradle/gradle.properties` (also outside the
repo) via `JAMIN_STORE_FILE`, `JAMIN_STORE_PASSWORD`, `JAMIN_KEY_ALIAS`,
`JAMIN_KEY_PASSWORD`. The wiring is re-applied on every `expo prebuild` by
`plugins/withReleaseSigning.js`, so it cannot be lost the way the version was.
If those properties are missing the build falls back to debug signing rather
than failing — deliberate, so a fresh clone still builds.

> **Back up that folder now, in two places.** Until the app is published, a lost
> key costs nothing — generate another. **After** the first release, losing it
> means you can never update this listing again. Enrolling in **Play App Signing**
> at upload (recommended, and the default for new apps) makes Google hold the
> distribution key, which turns a lost upload key from fatal into a support ticket.

### Build commands

```bash
cd android && ./gradlew bundleRelease     # → app/build/outputs/bundle/release/app-release.aab   (upload this)
cd android && ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk      (sideload testing only)
```

---

## 2. Permissions — what the app now asks for, and why

`expo-notifications` and `expo-secure-store` were installed but **never called
anywhere in the app**. Between them they were adding `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `READ_APP_BADGE`, `USE_BIOMETRIC`,
`USE_FINGERPRINT` and around twenty launcher-badge permissions — every one of
which Play would have asked you to justify for a feature that does not exist.
They were removed. `SYSTEM_ALERT_WINDOW` (the overlay permission Google
scrutinises hardest) is blocked in `app.json` → `android.blockedPermissions`.

Re-adding push later is one command (`npx expo install expo-notifications`); the
permission returns with it.

### What remains, with the justification to paste into the Console

| Permission | Feature that needs it | Declaration |
|---|---|---|
| `CAMERA` | Photographing a KYC document, a property, or a community post | Users take photos in-app for identity verification and property/community uploads. |
| `RECORD_AUDIO` | Speaking to the Jamindar assistant; voice notes in the community | Voice input for the in-app AI property advisor and voice notes. Recording only while the user holds/taps the mic. |
| `MODIFY_AUDIO_SETTINGS` | Routing assistant speech to the speaker after recording | Required to reset the audio route so replies play aloud. |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | "Projects near me"; GPS-tagging a property a promoter submits | Foreground only, requested at the moment of use. **No background location.** |
| `FOREGROUND_SERVICE` / `..._MEDIA_PLAYBACK` | Property walkthrough video playback | Keeps video/audio playing while the user reads the listing. |
| `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` | Choosing an existing photo/video/PDF to upload (older Android only) | Media selection for uploads; scoped away on modern Android. |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` | Normal operation | Not sensitive; no declaration form required. |

**Prominent-disclosure note:** location is the only permission in the sensitive
group here, it is foreground-only, and it is requested contextually — so the
standard runtime prompt is sufficient. There is no background location, no
"All files" access, no SMS/Call Log, and no `QUERY_ALL_PACKAGES`.

---

## 3. Data Safety form — answers

Derived from the live schema. **Yes**, data is collected; **yes**, it is
transmitted off-device; **encrypted in transit: yes**; **users can request
deletion: yes** (see §4).

| Data type | Collected | Shared | Required? | Purpose |
|---|---|---|---|---|
| Name | Yes | No | Optional | Account, addressing the user |
| Email address | Yes | No | Optional | Account, contact |
| **Phone number** | Yes | No | **Required** | It *is* the sign-in identity (OTP) |
| User IDs | Yes | No | Required | Member/Promoter ID, referral code |
| Address | Yes | No | Optional | Courier address, KYC only |
| Photos | Yes | No | Optional | Profile photo, property and community uploads |
| Videos | Yes | No | Optional | Property and community uploads |
| Voice or sound recordings | Yes | Yes | Optional | Assistant speech-to-text (processed by Sarvam AI) |
| Files and docs | Yes | No | Optional | KYC documents, property paperwork |
| Messages (in-app) | Yes | No | Optional | Member-to-member inbox |
| Approximate / precise location | Yes | No | Optional | Nearby projects; GPS tag on a submitted property |
| **Financial info** (bank account, UPI) | Yes | No | Optional | Paying commission to verified partners |
| **Government IDs** (PAN, Aadhaar) | Yes | No | Optional | Partner identity verification (KYC) |
| App interactions | Yes | No | Required | Saved projects, enquiries, visits, referral attribution |
| Crash logs / diagnostics | No | — | — | Not collected |
| Advertising data | No | — | — | No ads, no ad IDs, no profiling |

Security practices to tick: **encrypted in transit**, **users can request data
deletion**, **data access is restricted** (row-level security enforces per-user
access; KYC files sit in a private bucket reached only by short-lived signed URLs).

**"Shared" is answered No except for voice** — the other providers (Supabase for
database/storage, the SMS gateway for OTP delivery, Netlify for hosting) are
processors acting on our instructions, which Play treats as *processing*, not
*sharing*. Sarvam AI receives voice/text to transcribe and translate, so that one
is declared as shared.

---

## 4. Mandatory URLs — live now

| Purpose | URL |
|---|---|
| Privacy Policy | `https://merry-begonia-4c3cd1.netlify.app/privacy` |
| Account deletion (required for apps with accounts) | `https://merry-begonia-4c3cd1.netlify.app/delete-account` |
| Terms of Use | `https://merry-begonia-4c3cd1.netlify.app/terms` |

Both required pages resolve without the app installed, which is what the
reviewer checks. If a custom domain is set up later, update the Console.

---

## 5. Store listing copy

**App name (30 max)** — `Jamin Bazaar` *(12)*

**Short description (80 max)**
```
Verified plots and land in Tamil Nadu — with an advisor who speaks your language.
```
*(79 characters)*

**Full description (4000 max)**
```
Jamin Bazaar is where you find verified plotted developments and land from Jamin
Property Developers — with the paperwork checked, the layout approved, and a real
person to talk to.

BROWSE WITH CONFIDENCE
• DTCP-approved layouts with plot-by-plot availability you can actually see
• Real photographs, walkthrough videos and master plans — not stock imagery
• Clear title, approval status and road access stated on every project
• Interactive plot plans: pick a plot, check its size, facing and price

TALK TO JAMINDAR, YOUR PROPERTY ADVISOR
Ask a question by voice or text in English, Hindi, Tamil, Telugu, Kannada,
Malayalam, Marathi, Gujarati, Bengali or Punjabi. Jamindar answers from live
inventory — never invented listings — and can explain the legal terms, work out
your EMI and eligibility, and pull up the projects that match your budget.

PLAN THE PURCHASE
• EMI, eligibility, purchase-cost and rental-yield calculators
• A plain-language guide to patta, DTCP, encumbrance and the rest
• Compare up to three projects side by side
• Book a site visit and get a callback from a verified Jamin partner

JOIN THE COMMUNITY
Ask questions, share what you have learned, and read what other buyers are
finding — with contact details masked automatically so nobody gets spammed.

FOR PROMOTERS
Become a Jamin promoter from inside the app and get a digital card with your own
QR, a referral link that credits every enquiry to you, a dashboard for your leads
and site visits, and a transparent view of what you have earned. Complete KYC to
become a Verified Jamin Partner.

Jamin Bazaar · Signature for Fortune
```

**Category** — Lifestyle *(alternative: House & Home)*
**Tags** — real estate, property, land, plots
**Contact** — info@jaminproperties.com · +91 93848 18895

---

## 6. Content rating (IARC) — expected answers

Everything below is **No**: violence, sexual content, profanity, controlled
substances, gambling/simulated gambling, in-app purchases, unrestricted internet
browsing. **Yes**: users can interact/share content (the community and the
inbox), and the app shares the user's location with other users — *no*, it does
not; location is used only to find projects, never shown to another member.
Expected outcome: rated for everyone / PEGI 3.

Also answer:
- **Ads** — the app contains **no ads**.
- **Target audience** — 18 and over. Not designed for children.
- **Government app** — No.
- **Financial features** — the app does **not** take payments. Plot bookings and
  commission are settled out of band by bank transfer; there is no payment
  gateway, no in-app purchase and no billing library.

---

## 7. App access — the reviewer must be able to sign in

Sign-in is OTP to an Indian mobile number, which a Google reviewer cannot
receive. **You must give test credentials under "App access → All functionality
is restricted"**, or the review will be rejected for being unable to log in.

Two options:
1. **Preferred** — provide a mobile number you control that can receive the OTP,
   plus a note explaining that the code is delivered by SMS and asking the
   reviewer to contact you at review time for the current code.
2. Provide a demo account and temporarily enable the dev OTP path
   (`app_secrets.otp_expose_code = 'on'`), which makes `send-otp` return the code
   directly so the reviewer can sign in unaided.

> ⚠️ Option 2 is an **account-takeover path for every account on the platform**
> while it is switched on. If you use it, use it only for the review window and
> switch it back to `'off'` the moment the review clears.

---

## 8. Assets in this folder

| File | Use |
|---|---|
| `icon-512.png` | Hi-res store icon, 512×512 |
| `feature-graphic-1024x500.png` | Feature graphic, 1024×500 |

**Still needed from you: at least 2 phone screenshots** (Play wants 2–8, min
1080px on the short side). Take them from the built APK on a real phone — Home,
a project detail with the plot plan, the Jamindar assistant, and the promoter
dashboard would show the app at its best.

---

## 9. Order of work

1. ✅ Release keystore generated and backed up *(back it up again, off this machine)*
2. ✅ Signed `.aab` built
3. Register the release key's SHA-1 / SHA-256 in Firebase **only if you add
   Firebase later** — the app does not currently use it, despite what the
   readiness report inferred from the Expo/RN stack. There is no
   `google-services.json` in this project.
4. ✅ Privacy Policy and deletion URLs published
5. Complete the Console listing, Data Safety and content rating using §3, §5, §6
6. Upload to **Internal testing** first and confirm it installs and runs
7. Closed testing — a new personal developer account needs **12 testers for 14
   continuous days** before Production
8. Submit for Production review
