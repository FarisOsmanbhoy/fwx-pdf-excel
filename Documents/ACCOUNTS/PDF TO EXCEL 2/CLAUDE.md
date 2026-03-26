# PDF to CSV Tool — Project Brief

## What this is
A no-login, open-access web tool deployed on Netlify. Users upload a PDF
and an Excel/CSV template. Claude intelligently reads the entire PDF,
maps whatever content is on the page to the template's columns, and
returns a filled downloadable CSV file.

No accounts. No sign-in. Just upload and download.

---

## Core User Flow

1. User visits the site (bookmarked, no login required)
2. User uploads their Excel/CSV template (first time or returning)
   - Template is saved in browser localStorage with a 7-day TTL
   - If the user returns within 7 days, the template is pre-loaded automatically
   - If 7 days pass without use, the template is cleared from storage
   - User can manually replace/clear the template at any time
3. User uploads a PDF
4. User clicks "Extract & Fill"
5. Claude reads the entire PDF, intelligently maps all content to the
   template's column headers
6. A filled CSV file is returned and offered as a download
7. The 7-day TTL resets on every use

---

## Template Persistence Logic (localStorage)

```
On template upload:
  - Save file content to localStorage key: "csv_template"
  - Save timestamp to localStorage key: "csv_template_saved_at"
  - Display: "Template saved — will be remembered for 7 days"

On page load:
  - Check if "csv_template" exists in localStorage
  - Check if (now - csv_template_saved_at) < 7 days
  - If valid: pre-load template, show "Template loaded from memory (X days left)"
  - If expired or missing: show empty template upload slot

On every successful extraction:
  - Reset "csv_template_saved_at" to now (rolls the 7-day window)

Manual clear:
  - Small "Forget my template" link clears both localStorage keys
```

No backend storage. No database. No user accounts. Entirely client-side
persistence via localStorage. This means it is device-specific — the
template is remembered on the device/browser the user uploaded from.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, vanilla JS (no framework) |
| Backend | Netlify Functions (serverless, Node.js) |
| AI | Anthropic API — claude-sonnet-4-6 |
| Deployment | Netlify (via GitHub) |
| Template memory | Browser localStorage (client-side only) |

---

## Project File Structure

```
project-root/
├── CLAUDE.md                          ← this file
├── netlify.toml                       ← Netlify config
├── index.html                         ← main UI
├── style.css                          ← dark mode styling
├── app.js                             ← frontend logic + localStorage
└── netlify/
    └── functions/
        └── process-pdf.js             ← serverless function, calls Anthropic API
```

---

## Frontend Design

**Vibe: Modern dark mode**

- Background: near-black (#0f0f0f or #111111)
- Surface cards: dark grey (#1a1a1a or #1e1e1e)
- Accent: a single vibrant colour (e.g. electric blue #3b82f6 or purple #8b5cf6)
- Text: off-white (#f1f1f1), muted text (#888)
- Font: Inter or Geist (load from Google Fonts or Fontsource CDN)
- Upload zones: dashed border, drag-and-drop supported, subtle hover glow
- Button: solid accent colour, rounded, slight shadow
- Status messages: inline, colour-coded (blue = info, green = success, red = error)
- No unnecessary animations — clean, fast, purposeful
- Mobile responsive

**UI Sections (single page, no scroll ideally):**
1. Header — site name + one-line description
2. Template zone — upload or shows "Template loaded (X days left)" + forget link
3. PDF zone — upload area
4. Action button — "Extract & Fill CSV"
5. Status/progress indicator
6. Download button (appears after processing)

---

## Netlify Function — process-pdf.js

Responsibilities:
- Receive PDF (as base64) and CSV template (as text) from frontend
- Call Anthropic API with both
- Prompt instructs Claude to: read the entire PDF intelligently,
  identify all data on the page, and map it to the CSV template columns
- Return the filled CSV as a plain text string
- Handle errors gracefully (PDF unreadable, API failure, etc.)

Environment variable required:
- `ANTHROPIC_API_KEY` — set in Netlify dashboard under Site Settings → Environment Variables

The API key is NEVER exposed to the frontend or browser.

---

## Anthropic API Prompt Strategy

The function sends Claude:
1. The PDF as a base64-encoded document block
2. The CSV template headers as text
3. This instruction:

```
You are a data extraction assistant. Read the entire PDF document
provided. Intelligently identify all structured and unstructured
content on every page. Map the extracted content to the column
headers in the CSV template below.

CSV Headers:
[INSERT HEADERS HERE]

Return ONLY a valid CSV string. First row must be the headers exactly
as given. Following rows are the extracted data. No explanation, no
markdown, no code fences. Just the raw CSV.
```

---

## Skills to Reference (do not copy — reference by path)

Claude Code should read these skill files only when performing the
relevant task. Do not load all at once.

| Task | Skill path |
|---|---|
| Building/iterating this skill | /mnt/skills/examples/skill-creator/SKILL.md |
| PDF reading & extraction logic | /mnt/skills/public/pdf-reading/SKILL.md |
| PDF manipulation details | /mnt/skills/public/pdf/SKILL.md |
| Understanding spreadsheet/CSV structure | /mnt/skills/public/xlsx/SKILL.md |
| Handling uploaded files | /mnt/skills/public/file-reading/SKILL.md |
| Frontend UI implementation | /mnt/skills/public/frontend-design/SKILL.md |

---

## Constraints & Rules

- No login, no accounts, no authentication ever
- No backend database — localStorage only for template persistence
- Template persistence is device/browser specific (acceptable)
- API key must never appear in frontend code
- Output must always be a downloadable .csv file
- Site must work on mobile
- Keep dependencies minimal — no React, no Vue, no build tools
- Netlify free tier must be sufficient (125k function calls/month)
- PDF size limit: warn user if PDF exceeds 5MB (Anthropic API limit)

---

## Out of Scope (for now)

- User accounts or cloud sync of templates
- Processing multiple PDFs at once
- Editing the CSV in-browser before downloading
- Support for password-protected PDFs
- Any analytics or tracking

---

## How to Start (Claude Code instructions)

1. Read /mnt/skills/examples/skill-creator/SKILL.md first
2. Scaffold the project structure listed above
3. Build the Netlify function first (process-pdf.js) and test it
4. Then build the frontend (index.html, style.css, app.js)
5. Wire them together
6. Use Netlify MCP to deploy when ready
