# RxPlained

The pharmaceutical advertising dictionary — 283 terms from inside the industry, decoded with a sense of humor. Search, browse by category, and get a new Word of the Day, every day, automatically.

## What's here

```
rxplained/
├── index.html          # App shell
├── css/styles.css       # All styling — brand palette, WCAG AA-audited contrast
├── js/app.js             # Search (Fuse.js), filtering, word of day, modals
├── data/terms.json      # The 283-term dataset — source of truth
├── manifest.json        # PWA manifest (installable, standalone display)
├── sw.js                 # Service worker — offline caching of app + data
├── icons/                # PWA icons (192px, 512px)
└── README.md
```

No build step. No framework. No dependencies beyond Fuse.js (loaded from CDN) and two Google Fonts. This is intentional — it keeps the app fast, keeps it a true PWA, and keeps it trivial to host anywhere static files are served.

## Local preview

```
python3 -m http.server 8000
```
then visit `http://localhost:8000`. (Opening `index.html` directly via `file://` won't work — the `fetch()` call for `terms.json` needs an actual server, even a local one.)

## Deploying

1. Push this repo to GitHub.
2. Enable **GitHub Pages** (Settings → Pages → deploy from `main` branch), or connect the repo to **Netlify** / **Vercel** for a faster CDN and cleaner custom-domain setup.
3. In Porkbun's DNS settings for `rxplained.com`, point the domain at whichever host you chose (CNAME to Vercel/Netlify, or the `A`/`ALIAS` records GitHub Pages provides).
4. Confirm HTTPS is active on the new host (all three options above provide free SSL) — required for the service worker/PWA install prompt to work.

## Updating the dictionary

Everything the app displays comes from `data/terms.json`. To add, edit, or remove a term, edit that file directly — no other code changes needed. Each entry:

```json
{
  "term": "Example Term",
  "category": "Doctor Speak",
  "playful": "The fun, plain-language explanation.",
  "real": "The accurate, complete definition."
}
```

Valid `category` values: `Doctor Speak`, `Money Talk`, `Legal Says`, `Behind the Ad`, `Ask Your Doctor`.

## Known gaps before public launch

- **Submit-a-term form** currently falls back to a `mailto:` link (see `js/app.js`, in the form submit handler). It works, but every submission has to be manually copied back into `terms.json`. Wiring it to a real backend (Formspree, a small serverless function, an Airtable webhook) would make this scale.
- **Category balance**: "Ask Your Doctor" (DTC/consumer culture) has 17 entries versus 125 in "Behind the Ad" (agency operations). Accurate to the source material, but worth a second content pass if DTC content is meant to be a flagship section.
- **Icons** are a placeholder monogram, not final brand artwork — swap `icons/icon-192.png` and `icons/icon-512.png` before shipping.

## Accessibility

Contrast-audited against WCAG AA (4.5:1 text, 3:1 UI components) — see commit history for two fixes made during that audit (a failing teal focus ring, a borderline muted-gray text color). Skip link, visible focus states, `aria-live` search result announcements, and full keyboard operability (including modal focus trapping and Escape-to-close) are built in. Re-audit with a tool like axe DevTools before launch — this was a manual pass, not automated tooling.
