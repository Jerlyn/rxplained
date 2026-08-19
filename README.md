# RxPlained

The pharmaceutical advertising dictionary — 354 terms from inside the industry, decoded with a sense of humor. Search, browse by category, and get a new Word of the Day, every day, automatically.

## What's here

```
rxplained/
├── index.html          # App shell — markup + Tailwind CDN config
├── css/styles.css       # Custom layer Tailwind can't do: glass panels, orbs, focus ring, reduced-motion override
├── js/app.js             # RxPlainedApp class — search (Fuse.js), filtering, Cmd+K palette, Word of the Day
├── data/terms.json      # The 354-term dataset — source of truth
├── scripts/
│   └── generate_term_pages.py  # Generates term/, sitemap.xml, robots.txt from terms.json — see below
├── term/                 # Generated — one static shim page per term, for social-preview crawlers
├── sitemap.xml            # Generated
├── robots.txt             # Generated
├── manifest.json        # PWA manifest (installable, standalone display)
├── sw.js                 # Service worker — offline caching of app shell + data
├── icons/                # PWA icons (192px, 512px)
└── README.md
```

**No build step** — Tailwind CSS is loaded via its CDN script (JIT-compiled in the browser), not a compiled stylesheet. That's a deliberate trade-off, not an oversight: it keeps the "no build step, edit and refresh" workflow intact, at the cost of full offline support (see *Known gaps* below) and a small runtime compile cost on first paint. Other dependencies: Fuse.js (fuzzy search fallback), canvas-confetti (save/submit micro-delight), and two Google Fonts — all from CDN, no package manager involved.

## Local preview

```
python3 -m http.server 8000
```
then visit `http://localhost:8000`. (Opening `index.html` directly via `file://` won't work — the `fetch()` call for `terms.json` needs an actual server, even a local one.)

## Deploying

1. Regenerate the per-term pages if `data/terms.json` has changed since the last deploy: `python3 scripts/generate_term_pages.py` (see *Per-term pages & social sharing* below). Commit the result — `term/`, `sitemap.xml`, and `robots.txt` are generated files checked into the repo, not built at deploy time.
2. Push this repo to GitHub.
3. Enable **GitHub Pages** (Settings → Pages → deploy from `main` branch), or connect the repo to **Netlify** / **Vercel** for a faster CDN and cleaner custom-domain setup.
4. In Porkbun's DNS settings for `rxplained.com`, point the domain at whichever host you chose (CNAME to Vercel/Netlify, or the `A`/`ALIAS` records GitHub Pages provides).
5. Confirm HTTPS is active on the new host (all three options above provide free SSL) — required for the service worker/PWA install prompt to work.

## Per-term pages & social sharing

Sharing a term used to be pointless: deep links use a URL *fragment* (`#term=slug`), and fragments are never sent to a server — not to a social-preview crawler (Facebook, Slack, Twitter/X…), not to anything. Every shared link showed the same generic site-wide preview no matter which term it was.

`scripts/generate_term_pages.py` fixes this by generating one lightweight static page per term at `term/<slug>/index.html`. Each one is *not* a duplicate of the app — it's a shim that carries that term's own `<title>`/description/Open Graph/Twitter tags for crawlers, then immediately redirects a real visitor into the full app at `/#term=<slug>` (the app's existing deep-link handling, unchanged). The "Copy Dose Link" button on every card now copies this `/term/<slug>/` URL instead of the old hash link.

Run it after editing `terms.json`:
```
python3 scripts/generate_term_pages.py
```
This also regenerates `sitemap.xml` and `robots.txt`. All of it is static output — no server, no framework, nothing installed beyond Python's standard library — but it *is* a real generation step you have to remember to re-run and commit, which is a deliberate, disclosed exception to this project's "no build step" rule. The alternative (a serverless/edge function to inject tags at request time) would avoid that, at the cost of ruling out GitHub Pages as a host. Static generation was chosen to keep hosting flexible.

One thing to check before relying on this in production: `BASE_URL` at the top of the script is hardcoded to `https://rxplained.com` for absolute canonical/OG URLs. Update it if the real deployed domain ends up different.

**Hash matching stays isolated from search.** The client-side handler for `#term=<slug>` is `checkDeepLink()` in `js/app.js` — a plain `Array.find()` against the canonical `this.terms` array (as loaded from `terms.json`), matching on `slugify(t.term)` or, as a fallback, `slugify()` of any of the term's `aliases`. It deliberately does *not* call `searchTerms()` or touch the Fuse index: those are fuzzy and rank-ordered, which is right for a search box but wrong for a deep link — a hash should resolve to exactly one term or none, never an approximate match. If this function is ever refactored, keep it a standalone exact-match lookup against the full terms array; routing it through the search-bar logic (even indirectly, e.g. via a shared "find best match" helper) risks resolving to the wrong term, since real term names contain spaces/parentheses that never literally match a hyphenated slug string, forcing every lookup through fuzzy fallback. `scripts/generate_term_pages.py` and `js/app.js` each implement their own `slugify()` — verified to produce identical output for all 354 terms, but there is no single shared source of truth, so re-verify parity (`python3 scripts/generate_term_pages.py` regenerates pages; compare against the client's `slugify()`) if either one changes.

## Updating the dictionary

Everything the app displays comes from `data/terms.json`. To add, edit, or remove a term, edit that file directly — no other code changes needed. Each entry:

```json
{
  "term": "Example Term",
  "aliases": ["alternate name", "abbreviation"],
  "category": "Doctor Speak",
  "playful": "The fun, plain-language explanation.",
  "real": "The accurate, complete definition.",
  "sponsored": false,
  "sponsoredBy": null
}
```

Valid `category` values: `Doctor Speak`, `Money Talk`, `Legal Says`, `Behind the Ad`, `Ask Your Doctor`.

`aliases` is an array of alternate names, abbreviations, or nicknames the term also goes by — omit or leave empty (`[]`) for terms with no common alternate names. Search checks `aliases` at the same first-pass priority as `term` itself (term-name matches rank first, alias matches second, both ahead of fuzzy fallback — see `searchTerms()` in `js/app.js`), so a term only surfaces for a synonym if that synonym is listed here. Mentioning a synonym in the `playful`/`real` prose is not enough on its own — search does not parse prose for alternate names. Keep aliases reasonably specific: a 2-letter alias (e.g. a bare `"OL"`) will substring-match all kinds of unrelated terms and does more harm than good; prefer the fuller form (`"Opinion Leader"`) instead.

`sponsored` / `sponsoredBy` are schema-only for now — every entry defaults to `false` / `null` and nothing in the UI reads them yet. They exist so a future sponsorship/ads decision is a data change, not a rebuild.

**354, `aliases` field added, August 2026**: search previously depended on a synonym happening to be mentioned in a term's prose (e.g. "detail aid" surfaced "Visual Aid" only because that phrase was written into its definition) — a real alternate name with no prose mention, like "eDetail", wouldn't surface at all. Added a structured `aliases` array so alternate names are explicit, searchable data instead of an accident of phrasing. Populated for `Visual Aid` (`detail aid`, `eDetail`, `visAid`, `iVis`, per the case that surfaced the gap) and for 7 other entries whose prose already signaled an alternate name ("also called," "goes by," etc.) — `Boxed Warning`, `Advisory Board`, `HCP (Healthcare Professional)`, `MA & MA-PD (Medicare Advantage Plans)`, `KOL (Key Opinion Leader)`, `Prescription (Rx)`, and `Help-Seeking Ad`. All other 346 entries have `aliases: []`. Existing prose synonyms were left in place — this was purely additive.

**283 → 298, August 2026**: 15 foundational terms — including `ISI`, `Fair Balance`, `OPDP`, and `DTC` — were shown during an early tone/voice pilot round but never actually committed to `terms.json`, a tracking error rather than a deliberate cut. If you're reading commit history and wondering why the count jumped outside a normal content-addition pass, that's why. The 283 pre-existing entries were untouched — verified byte-identical before the 15 were appended — and the per-term static pages (`term/`) and `sitemap.xml` were regenerated to include them.

**298 → 354, August 2026**: a second glossary source (141 terms) was cross-referenced against the dataset — 84 were already covered, sometimes under different phrasing (their "Off-Label" matched the existing "Off Label"; their "Detail Aid" was already folded into the existing "Visual Aid" entry). The 56 genuinely new terms were written in the established voice and added, several consolidated from multiple near-duplicate source rows the same way the original 511-term project handled them (e.g. `NRx`/`NBRx`/`TRx` as one entry, `Warning Letter` + `Untitled Letter` as one entry). The 298 pre-existing entries were untouched — verified byte-identical before the 56 were appended.

## Interface

- **Word of the Day** and every term card show both sides at once — 🎭 The Pitch (the playful, roasted take) and 📋 The Reality (the official definition) — side by side on desktop, stacked on mobile. No click needed to see the full definition.
- **Category filter** is a horizontal row of pill chips (including a "Saved" pill), each showing a live count. Search, sort (A–Z / Z–A / Random), and the pill row combine to narrow the list; when a category filter is hiding a real match elsewhere, the empty state says so and offers a one-click "See results in all categories" that clears just the category filter, preserving the search.
- **Cmd+K / ⌘K** opens a quick-search palette: type to filter, arrow keys to move the highlight, Enter to jump straight to that term (scrolls to it and gives it a brief highlight pulse). Built as a proper ARIA combobox/listbox (`aria-activedescendant`, `role="option"`), not just visual hints — Escape or a click outside closes it.
- **Save** (heart), **Copy Dose Link** (share), and **Listen** (text-to-speech via the browser's `speechSynthesis` API, where supported) are icon buttons on every card and on Word of the Day. Save persists to `localStorage`; deep links (`#term=slug`) find, scroll to, and highlight the matching card on load.
- **Submit a Term** posts to Formspree (`https://formspree.io/f/mvkpwkze`) with success/error states surfaced through the toast component — submissions land in the Formspree dashboard, not a local-only array.
- Small celebratory confetti burst on save and successful submit — skipped automatically for anyone with `prefers-reduced-motion` set.
- **Install prompt**: a dismissible bottom banner appears once the browser signals the app is installable (`beforeinstallprompt`, Chrome/Edge/Android) or, on iOS, shows "tap Share → Add to Home Screen" instead (iOS has no programmatic install trigger, so a button that did nothing would be worse than instructions). Dismissal is remembered in `localStorage`; already-installed visits (`display-mode: standalone`) never see it.
- **"More from [Category]"**: every card and Word of the Day link to a few other terms in the same category — the next ones alphabetically, wrapping around. Deliberately not a fabricated "related terms" claim; there's no data to support real semantic relatedness yet, so this only ever reflects the one relationship the data actually has (shared category).

## Known gaps before public launch

- **Tailwind CDN and full offline support don't fully coexist.** `cdn.tailwindcss.com` doesn't send CORS headers for `fetch()`/`cache.addAll()` (only plain `<script src>` loading works cross-origin without them), so the service worker can't precache it — trying to include it in the precache list made the *entire* install step fail silently (`cache.addAll` is all-or-nothing), which is worth knowing if this area gets touched again. Everything else (HTML, JS, data, fonts, Fuse, confetti) is cached and works offline after first visit; Tailwind's utility CSS itself needs network access, so styling degrades if the user is fully offline.
- **Category balance**: current breakdown is Behind the Ad 145, Doctor Speak 90, Money Talk 52, Legal Says 44, Ask Your Doctor 23. "Ask Your Doctor" (DTC/consumer culture) remains the smallest category by a wide margin — 6.5% of the dataset, up slightly from 6.0% at the original 283-entry baseline (17/283 → 23/354), so the two correction passes haven't changed the underlying imbalance in any meaningful way. Accurate to the source material, but worth a dedicated content pass if DTC/consumer-facing content is meant to be a bigger part of the product.
- **Icons** are a placeholder monogram, not final brand artwork — swap `icons/icon-192.png` and `icons/icon-512.png` before shipping.
- **Social preview image**: per-term OG/Twitter tags reuse `icon-512.png` (square) as a stopgap. Social platforms generally expect a wide banner (~1200×630); a square image often gets cropped oddly, especially for `summary_large_image`-style cards. Worth a proper branded OG image before launch — swap the image URL in `scripts/generate_term_pages.py` and regenerate.
- **Text-to-speech** relies on the browser's built-in `speechSynthesis` — not universal (no support shows a toast instead of failing silently), and voice quality varies by OS/browser.
- **Pagination**: not implemented. Not re-measured against this dual-pane layout's render cost yet — worth a quick check if the list ever feels sluggish, though 283 items previously measured well under a frame in the single-line list version.

## Accessibility

Contrast-audited against WCAG AA (4.5:1 text, 3:1 UI components) using the actual computed worst-case background (both ambient gradient orbs overlapping at peak opacity, composited through the glass-panel layers) — not eyeballed. Skip link, visible focus states, `aria-live` result-count announcements, and full keyboard operability are built in. Two real modals — Submit a Term and the Cmd+K palette — both get proper focus handling (Tab-cycling trap for the form; combobox/listbox pattern with `aria-activedescendant` for the palette, which is the more correct pattern for a type-ahead widget than a generic focus trap) and Escape-to-close with focus returned to whatever opened them. Re-audit with a tool like axe DevTools before launch — this was a manual pass, not automated tooling.

## Design history

This app went through several iterations before landing on the current dual-pane, pill-filtered, Cmd+K-equipped design — including a phase with single-column list rows, click-to-expand disclosure cards, and a category dropdown instead of pills. That direction was deliberately reversed in favor of the current one, which draws from a fuller prototype exploration. See commit history for the reasoning trail if any of these patterns come up for reconsideration again.
