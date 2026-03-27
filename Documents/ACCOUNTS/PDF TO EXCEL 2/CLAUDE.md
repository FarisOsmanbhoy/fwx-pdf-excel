# FWX PDF to CSV — Project Brief

## What this is
An internal tool for the Flightworx (FWX) accounts department. Deployed on
Netlify at https://fwx-pdf-excel.netlify.app — no login required. Users
select a template from a dropdown (or add their own), upload a PDF, and
Claude extracts the data into a filled CSV matching the template columns.

Built by Osman (Operations dept) to help accounts automate manual data entry.

---

## Who uses this
- **FWX Accounts Department** — primary users
- **Osman (Operations)** — maintains and extends the tool
- Document types: supplier invoices, fuel receipts, handling invoices, etc.
- Each document type maps to a specific Excel/CSV template

---

## Core User Flow

1. User visits the site (bookmarked, no login)
2. User selects a template from the dropdown
   - Preset templates are built-in (e.g. Xero Sales Invoice)
   - Users can add custom templates via file upload — these persist in localStorage
   - Last-used template is remembered and auto-selected on return
3. User uploads a PDF
4. User clicks "Extract & Fill CSV"
5. Claude reads the entire PDF with template-specific extraction hints
6. A filled CSV is returned and offered as a download

---

## Template System

### Preset Templates (hardcoded in app.js PRESETS array)
Each preset has:
- `id` — unique identifier
- `name` — display name
- `headers` — CSV header string
- `promptHints` — template-specific extraction instructions for Claude

Current presets:
1. **Xero Sales Invoice** — 29 columns, Xero accounting import format

### Custom Templates (user-added, stored in localStorage)
- Users upload a .csv or .xlsx file → headers are extracted
- User names the template via a modal
- Saved to localStorage key `fwx_custom_templates` as JSON array
- Can be deleted from the dropdown
- No prompt hints (uses generic extraction)

### Adding a New Preset Template
To add a new preset, add an entry to the `PRESETS` array in `app.js`:
```js
{
  id: "unique-id",
  name: "Display Name",
  headers: "Column1,Column2,Column3,...",
  promptHints: `Template-specific instructions for Claude...`
}
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML, CSS, vanilla JS (no framework) |
| Backend | Netlify Functions (serverless, Node.js) |
| AI | Anthropic API — claude-sonnet-4-6 |
| Deployment | Netlify (GitHub: FarisOsmanbhoy/fwx-pdf-excel) |
| Template storage | Browser localStorage (presets in code, custom in localStorage) |

---

## Project File Structure

```
project-root/
├── CLAUDE.md                          ← this file
├── netlify.toml                       ← Netlify config
├── index.html                         ← main UI
├── style.css                          ← dark mode styling with animations
├── app.js                             ← frontend logic, presets, template management
├── Excel template/
│   └── SalesInvoiceTemplate.csv       ← reference copy of Xero template
└── netlify/
    └── functions/
        └── process-pdf.js             ← serverless function, calls Anthropic API
```

---

## Frontend Design

**Vibe: Modern dark glassmorphism**

- Background: near-black (#0a0a0a) with ambient blue glow
- Cards: glass effect with backdrop-blur, subtle borders
- Accent: blue-to-purple gradient (#3b82f6 → #8b5cf6)
- Gradient animated header text
- Entrance animations: fade-in + slide-up, staggered
- Upload zones: dashed border, hover glow, green state when file loaded
- Extract button: gradient with pulse-glow animation when ready
- Download button: green gradient, slide-in animation
- Modal for naming custom templates
- Mobile responsive

---

## Netlify Function — process-pdf.js

Responsibilities:
- Receive PDF (base64), CSV template headers, and optional promptHints
- Build extraction prompt (generic rules + template-specific hints if provided)
- Call Anthropic API with PDF document block + prompt
- Return filled CSV as plain text string
- Handle errors gracefully

Environment variable required:
- `ANTHROPIC_API_KEY` — set in Netlify dashboard

The API key is NEVER exposed to the frontend or browser.

---

## Prompt Strategy

Base prompt: generic CSV extraction rules (headers, escaping, empty fields, all rows).

When `promptHints` is provided (from preset templates), it's appended as
"Additional extraction instructions" — giving Claude template-specific
guidance on field meanings, date formats, required fields, etc.

This means:
- Preset templates get high-quality, tuned extraction
- Custom templates get decent generic extraction
- New presets can be added with custom hints as accounts tests more document types

---

## Constraints & Rules

- No login, no accounts, no authentication
- No backend database — localStorage only
- API key never in frontend code
- Output is always a downloadable .csv
- Mobile responsive
- No frameworks — vanilla HTML/CSS/JS
- Netlify free tier (125k function calls/month)
- PDF size limit: 5MB warning

---

## Iterative Development

This tool is being developed iteratively:
1. Start with 1 preset template (Xero Sales Invoice) ← DONE
2. Test with real FWX PDFs → identify field issues
3. Tune promptHints based on real extraction failures
4. Add more preset templates as accounts requests them
5. Future: more automation tools beyond PDF-to-CSV

---

## Out of Scope (for now)

- User accounts or cloud sync
- Multiple PDFs at once
- In-browser CSV editing
- Password-protected PDFs
- Analytics or tracking
- Auto-detection of template type from PDF content
