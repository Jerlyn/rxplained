# RxPlained

The pharmaceutical advertising dictionary — 283 terms from inside the industry, decoded with a sense of humor. Search, browse by category, and get a new Word of the Day, every day, automatically.

## What's here

```
rxplained/
├── index.html          # App shell
├── css/styles.css       # All styling — brand palette, WCAG AA-audited contrast
├── js/app.js             # Search (Fuse.js), filtering, word of day, in-place term expansion
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
  "real": "The accurate, complete definition.",
  "sponsored": false,
  "sponsoredBy": null
}
```

Valid `category` values: `Doctor Speak`, `Money Talk`, `Legal Says`, `Behind the Ad`, `Ask Your Doctor`.

`sponsored` / `sponsoredBy` are schema-only for now — every entry defaults to `false` / `null` and nothing in the UI reads them yet. They exist so a future sponsorship/ads decision is a data change, not a rebuild.

## Known gaps before public launch

- **Category balance**: "Ask Your Doctor" (DTC/consumer culture) has 17 entries versus 125 in "Behind the Ad" (agency operations). Accurate to the source material, but worth a second content pass if DTC content is meant to be a flagship section.
- **Icons** are a placeholder monogram, not final brand artwork — swap `icons/icon-192.png` and `icons/icon-512.png` before shipping.
- **Pagination**: not implemented, and deliberately so — rendering all 283 filtered cards at once measured at ~9–11ms per full re-render (well under one frame), so a "Show More" control isn't earning its complexity yet. Re-measure if the dataset grows substantially past this size.

### Resolved

- **Submit-a-term form** now POSTs to Formspree (`https://formspree.io/f/mvkpwkze`) via `fetch`, with success/error states surfaced through the existing `.toast` component. Submissions land in the Formspree dashboard — no more manual copy-paste into `terms.json`.
- **Ko-fi link** points at the real account (`https://ko-fi.com/designlady`).
- **Voting/reactions** — deferred rather than built. In its place, each term has a localStorage-backed Save (heart) toggle on the card itself, plus a "Saved" option in the category dropdown to view them. No backend, no counts to moderate.
- **Copy Dose Link** (share) lives directly on each card as an icon button — same clipboard logic, reused.
- **Layout**: Word of the Day now renders above the search bar (previously buried below the category filters). The six category pill buttons are replaced by a single dropdown with counts in each option label, paired with a standalone A–Z / Z–A sort toggle. A floating back-to-top button appears after scrolling 400px, respects `prefers-reduced-motion`, and smooth-scrolls (or jumps) to the top.
- **Search zone**: search input, category dropdown, and sort toggle now share a single row on desktop/tablet. They stack only at narrow mobile widths — search full-width on its own line, category + sort side by side beneath it.
- **Surprise Dose** button is removed — no random-term entry point in the UI. The pick-a-random-term logic stays in `js/app.js` as an unused `randomTerm()` utility in case a future feature wants it.
- **Word of the Day** now matches the term-card reading order: category label → term name → playful definition → real meaning. The real meaning is hidden behind a "Tap to see what it actually means" toggle instead of always showing, consistent with how every grid card works.
- **Term detail modal is gone.** Clicking a term row now expands it in place — no overlay, no backdrop, no focus trap — using a standard disclosure pattern (`aria-expanded` on the trigger, `aria-controls` pointing at the associated content block, toggled via the `hidden` attribute). Deep links (`#term=slug`) now scroll to the matching row and expand it, rather than opening a dialog. Collapsed rows show only category, term, and a one-line teaser; the Save and Copy Dose Link icons are hidden until you hover/focus a row (desktop) or expand it (any viewport) — with 283 rows on screen at once, icons on all of them read as noise.
- **Quote-mark styling**: terms whose name is a quoted phrase (e.g. `"Results May Vary"`) now render the phrase in italics instead of literal quote characters, for a consistent look against terms that don't have quotes baked in. `terms.json` itself is untouched — this is a display-only transform.
- **Grid → list.** The multi-column card grid is now a single-column stacked list — a plain `border-bottom` divider between rows, no per-row box/shadow/left-border accent, no lift-on-hover. This follows the reference pattern for the whole project (urbandictionary.com, the original prototype, standard dictionary UX): content read in sequence belongs in a list, not a grid meant for browsing-to-choose. It also fixes a real layout bug the expand-in-place pattern exposed — a variable-height row in a multi-column grid broke its row, leaving short neighboring cards next to a tall expanded one. Rows only pick up a background tint (no shadow/blur) on hover, focus, or expansion. The content column is capped at 900px so list rows don't stretch into unreadably long lines at wide viewports.
- **Search relevance.** A plain case-insensitive substring match against the term name now always runs first (prefix matches ranked above mid-string matches); Fuse.js fuzzy search across `term`/`playful`/`real` only runs as a fallback when nothing in the term names matches at all. Previously, fuzzy search ran unconditionally with a loose 0.35 threshold, so a short query like "KOL" could return a wall of unrelated results fuzzily matched deep in other terms' body text — tightened to 0.25 for the fallback case. The A–Z/Z–A sort toggle now only governs browsing order; while a search is active, relevance ordering wins (previously the toggle re-sorted search results alphabetically too, silently discarding any relevance signal). When a search + category filter combination produces zero results, the empty state now says so honestly — "No matches in [Category] for '[query]'" — with a button that clears just the category filter and re-runs the same search across everything, rather than the old behavior of only ever showing "no results" with no indication a match exists outside the current filter.

## Accessibility

Contrast-audited against WCAG AA (4.5:1 text, 3:1 UI components) — see commit history for two fixes made during that audit (a failing teal focus ring, a borderline muted-gray text color). Skip link, visible focus states, `aria-live` search result announcements, and full keyboard operability are built in. The Submit-a-Term dialog is the only true modal left, with focus trapping and Escape-to-close; term cards use a lighter disclosure pattern (expand/collapse in place) that doesn't need either. Re-audit with a tool like axe DevTools before launch — this was a manual pass, not automated tooling.
