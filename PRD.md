# PRD: Jeweality Apps API

**Version:** 1.0
**Owner:** Mahesh (MTVerse / JEWEALITY)
**Status:** Ready for implementation

---

## 1. Overview

**Jeweality Apps API** ek free, serverless, read-only JSON API hai jo Google Play Store par published JEWEALITY developer ke saare apps ki information deta hai. Data roz automatically GitHub Actions se refresh hota hai aur Cloudflare Pages se CDN par static `apps.json` file ki tarah serve hota hai.

Is API ko website ke "More Apps" section aur future mein apps ke andar "More Apps" screen mein use kiya jayega.

### Goals
- Developer ke saare apps ka data ek hi endpoint par dena.
- Data roz bina manual kaam ke update ho.
- Poora setup 100% free ho (koi server, database ya paid service nahi).
- Naya app Play Store par aate hi agle daily run mein API mein aa jaye.

### Non-Goals
- Koi authentication, user accounts ya database nahi.
- Real-time data nahi (daily refresh kaafi hai).
- Reviews, screenshots ya ratings history nahi.
- Official Google API nahi, sirf `google-play-scraper` (unofficial).

---

## 2. Users

| User | Use |
|---|---|
| Website visitors | "More Apps" page par apps dekhte aur install karte hain |
| Android apps (JEWEALITY / MTVerse) | In-app "More Apps" screen ke liye JSON fetch karte hain |
| Owner (Mahesh) | Bina maintenance ke updated list chahiye |

---

## 3. System Architecture

```
GitHub Actions (daily cron, 21:30 UTC = 3:00 AM IST)
        |
        v
fetch-apps.js  --->  google-play-scraper  --->  Google Play Store
        |
        v
public/apps.json  (commit to repo only if data changed)
        |
        v
Cloudflare Pages (auto-deploy on commit, CDN)
        |
        v
https://<project>.pages.dev/apps.json   -->  Website / Android apps
```

### Tech Stack
- **Runtime:** Node.js 20, ES modules (`"type": "module"`)
- **Scraper:** `google-play-scraper` (only dependency)
- **Scheduler:** GitHub Actions (`schedule` + `workflow_dispatch`)
- **Hosting:** Cloudflare Pages (static, free)
- **Frontend demo:** Vanilla HTML/CSS/JS, no framework

---

## 4. Functional Requirements

### 4.1 Data Fetcher (`fetch-apps.js`)

| ID | Requirement |
|---|---|
| F1 | `DEV_ID` environment variable se developer ID le, default `JEWEALITY`. |
| F2 | `gplay.developer({ devId, num: 100, lang: "en", country: "us" })` se saare apps ki list laye. |
| F3 | Har app ke liye `gplay.app({ appId })` call karke full detail laye (long description ke liye). |
| F4 | Har app call ke beech 1.5 sec ka delay rakhe (rate limit se bachne ke liye). |
| F5 | Har Google call fail hone par 3 baar retry kare (3s, 6s backoff). |
| F6 | Agar kisi ek app ki detail fail ho, to us app ka purana data use kare; purana na ho to basic info (title, appId, url, icon, summary) use kare. |
| F7 | Agar developer list hi fail ho ya khaali aaye, to script error ke saath exit kare aur purani `apps.json` ko **na chhede**. |
| F8 | Agar naya data purane data se same hai, to file na likhe (faltu commit se bache). |
| F9 | Output `public/apps.json` mein pretty-printed JSON likhe. |

### 4.2 Scheduler (GitHub Actions)

| ID | Requirement |
|---|---|
| S1 | Roz `30 21 * * *` (UTC) par chale, yani 3:00 AM IST. |
| S2 | `workflow_dispatch` se manual run ho sake. |
| S3 | Steps: checkout, setup-node 20 (npm cache), `npm ci`, `node fetch-apps.js`, commit-if-changed. |
| S4 | Sirf `public/apps.json` stage kare; changes ho tabhi commit + push (`apps-bot`). |
| S5 | Workflow ko `contents: write` permission ho. |

### 4.3 Hosting (Cloudflare Pages)

| ID | Requirement |
|---|---|
| H1 | Build command khaali, output directory `public`. |
| H2 | Har commit par auto-deploy. |
| H3 | `public/_headers` se `/apps.json` par `Access-Control-Allow-Origin: *` aur `Cache-Control: public, max-age=3600` set ho. |
| H4 | Optional: custom domain (e.g. `apps.yourdomain.com`). |

### 4.4 Demo "More Apps" Page (`public/index.html`)

| ID | Requirement |
|---|---|
| U1 | Page load par `apps.json` fetch kare. |
| U2 | Responsive grid: 1 column (mobile), 2 (>=600px), 3 (>=900px), 4 (>=1200px). |
| U3 | Har card mein: icon (`loading="lazy"`, alt text), app name, short description, "Read more" (long description, `white-space: pre-line`), "Install" button. |
| U4 | Install button Play Store URL par `target="_blank"` aur `rel="noopener noreferrer"` ke saath khule. |
| U5 | Loading skeleton, error message ("Could not load apps...") aur empty state ("No apps found.") ho. |
| U6 | Light/dark theme `prefers-color-scheme` se auto-switch ho, CSS variables se. |
| U7 | Sab text `textContent` se set ho (XSS safe, innerHTML nahi). |

---

## 5. API Specification

**Endpoint:** `GET /apps.json`
**Base URL:** `https://<project>.pages.dev` (ya custom domain)
**Auth:** None
**Format:** JSON (UTF-8)

### Response

```json
{
  "developer": "JEWEALITY",
  "count": 19,
  "updatedAt": "2026-11-09T21:30:12.000Z",
  "apps": [
    {
      "name": "Charger Tester: Ampere & Watts",
      "package": "com.jeweality.chargertester",
      "url": "https://play.google.com/store/apps/details?id=com.jeweality.chargertester&hl=en&gl=us",
      "icon": "https://play-lh.googleusercontent.com/...",
      "shortDescription": "Measure charging current and power.",
      "description": "Full long description...\nWith newlines.",
      "score": 4.5,
      "installs": "10,000+",
      "version": "1.0.0",
      "updated": 1731000000000
    }
  ]
}
```

### Field Reference

| Field | Type | Source (gplay) | Notes |
|---|---|---|---|
| `name` | string | `title` | App name |
| `package` | string | `appId` | Package name |
| `url` | string | `url` | Play Store link |
| `icon` | string | `icon` | Icon image URL |
| `shortDescription` | string | `summary` | ~80 chars |
| `description` | string | `description` | Long text, may contain `\n` |
| `score` | number or null | `score` | Rating |
| `installs` | string | `installs` | e.g. "10,000+" |
| `version` | string | `version` | |
| `updated` | number or null | `updated` | Unix ms |

### Headers
- `Access-Control-Allow-Origin: *`
- `Cache-Control: public, max-age=3600`

### Errors
Static file hai, isliye custom error codes nahi. Agar file missing ho to Cloudflare 404 dega. Clients ko error state handle karna hoga.

---

## 6. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Cost | 0 (GitHub free tier + Cloudflare Pages free) |
| Availability | Cloudflare CDN, practically always-on |
| Freshness | Max 24 ghante purana data |
| Performance | `apps.json` < 200 KB, CDN cached |
| Reliability | Failure par purana data safe rehna chahiye |
| Security | Koi secret/API key nahi; sirf public data |
| Maintainability | Ek script, ek dependency, comments ke saath minimal code |

---

## 7. Repository Structure

```
jeweality-apps-api/
├── .github/workflows/update.yml
├── public/
│   ├── _headers
│   ├── index.html
│   └── apps.json            (auto-generated)
├── fetch-apps.js
├── package.json
├── package-lock.json
├── .gitignore
└── PRD.md
```

`package.json` mein `"name": "jeweality-apps-api"` ho aur `"type": "module"`.

---

## 8. Setup & Deployment Steps

1. Repo banao, files add karo, `npm install` chalao (lockfile ke liye), push karo.
2. GitHub: Settings, Actions, General, Workflow permissions mein **Read and write** select karo.
3. Actions tab se "Update apps data" ko **Run workflow** karke pehli `apps.json` generate karo.
4. Cloudflare: Workers & Pages, Create, Pages, Connect to Git, repo select, build command khaali, output dir `public`, Deploy.
5. Verify: `curl https://<project>.pages.dev/apps.json`
6. Website/app mein `API` constant is URL par set karo.

---

## 9. Acceptance Criteria

- [ ] Workflow manual run ke baad `public/apps.json` repo mein commit hoti hai.
- [ ] `apps.json` mein saare JEWEALITY apps hain, har ek mein name, package, url, icon, shortDescription, description.
- [ ] Cloudflare URL par JSON publicly accessible hai aur CORS header present hai.
- [ ] Agle din bina manual kaam ke workflow chalti hai; data same ho to koi commit nahi.
- [ ] Google fail kare to purani `apps.json` unchanged rehti hai aur workflow fail dikhata hai.
- [ ] Demo page par grid, skeleton, error, empty state, lazy icons aur dark mode sahi kaam karte hain.
- [ ] Install button naye tab mein Play Store kholta hai.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Google GitHub IPs ko block kare | Script purana data safe rakhti hai; fallback: Oracle VM par same script `cron` se chalao aur push karo |
| Scraper break ho (Google HTML change) | `npm update google-play-scraper`, workflow logs check karo |
| 60 din inactivity par GitHub schedule disable kare | Kabhi kabhi manual run karo ya workflow re-enable karo |
| GitHub cron late chale (10-30 min) | Acceptable, freshness requirement 24h hai |
| Unofficial scraper ka ToS risk | Roz sirf 1 run, delay ke saath, low traffic |

---

## 11. Future Enhancements (Out of Scope for v1)

- Alag `apps-lite.json` (sirf name, icon, url, short description) jo chhota ho, in-app use ke liye.
- Category/tags field (manual mapping file se).
- Screenshots aur feature graphic URLs.
- Multi-language (`lang`) support, e.g. `apps.hi.json`.
- Failure par GitHub issue ya email/Telegram notification.
- Android app ke liye Kotlin (Retrofit/Ktor) "More Apps" screen sample.

---

## 12. Instructions for AI Code Editor

Is PRD ke hisaab se poora project implement karo:
1. Sab files section 7 ke structure mein banao.
2. Sirf `google-play-scraper` dependency use karo, koi extra library nahi.
3. Code minimal aur commented rakho, existing project ko na todo.
4. Section 9 ke acceptance criteria se verify karo.
5. Kaam ke baad list do ki kaunsi files bani/badli aur test kaise karna hai.
