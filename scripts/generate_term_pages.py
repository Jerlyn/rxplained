#!/usr/bin/env python3
"""
Generates one static, lightweight HTML page per term at term/<slug>/index.html.

Why this exists: RxPlained is a single-page app that deep-links via a URL
*fragment* (#term=slug). Fragments are never sent to a server — not to a
social-preview crawler (Facebook, Slack, Twitter/X, etc.), not to an edge
function, nothing — so there's no way for anything server-side to know which
term was shared, and every shared link showed the same generic site-wide
preview no matter what.

Each generated page here is NOT a duplicate app — it's a minimal shim that:
  1. Carries the correct <title>/description/OG/Twitter tags for that one term,
     so a share unfurl actually shows the right term.
  2. Immediately redirects a real visitor into the full interactive app at
     /#term=<slug>, reusing the app's existing (unchanged) deep-link handling.

Static output only — no server, no framework. Re-run this whenever
data/terms.json changes, and commit the regenerated term/ directory (GitHub
Pages and friends serve whatever's in the repo; there's no build step at
deploy time to run this for you).

Usage:
    python3 scripts/generate_term_pages.py
"""
import json
import re
import shutil
from pathlib import Path
from html import escape

ROOT = Path(__file__).resolve().parent.parent
TERMS_JSON = ROOT / "data" / "terms.json"
OUTPUT_DIR = ROOT / "term"

# Update this if the deployed domain ends up different from what's in the README's
# deploy instructions — OG/canonical URLs must be absolute, so this can't be inferred
# from the request the way a server-rendered app could.
BASE_URL = "https://rxplained.com"

MAX_DESCRIPTION_LENGTH = 200


def slugify(s: str) -> str:
    # Must exactly match js/app.js's slugify() — same regex semantics — so that
    # generated page URLs line up with the hashes the app itself produces/expects.
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"(^-|-$)", "", s)
    return s


def truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rsplit(" ", 1)[0] + "…"


PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical_url}">
<meta http-equiv="refresh" content="0; url={redirect_url}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="RxPlained">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{canonical_url}">
<meta property="og:image" content="{base_url}/icons/icon-512.png">

<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{description}">
<meta name="twitter:image" content="{base_url}/icons/icon-512.png">

<meta name="theme-color" content="#020C28">
<link rel="icon" href="{base_url}/icons/icon-192.png">
<style>
  body {{
    background: #020C28; color: #C4C9D4; margin: 0; padding: 24px; min-height: 100vh;
    display: flex; align-items: center; justify-content: center; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }}
  a {{ color: #4ADEDE; }}
</style>
<script>location.replace({redirect_url_js});</script>
</head>
<body>
  <p>Redirecting to <a href="{redirect_url}">{term_escaped}</a> on RxPlained…</p>
</body>
</html>
"""


def build_page(term: dict) -> str:
    slug = slugify(term["term"])
    canonical_url = f"{BASE_URL}/term/{slug}/"
    redirect_url = f"/#term={slug}"
    title = f"{term['term']} — RxPlained"
    description = truncate(term["playful"], MAX_DESCRIPTION_LENGTH)

    return PAGE_TEMPLATE.format(
        title=escape(title),
        description=escape(description),
        canonical_url=escape(canonical_url),
        redirect_url=escape(redirect_url),
        redirect_url_js=json.dumps(redirect_url),
        base_url=BASE_URL,
        term_escaped=escape(term["term"]),
    )


SITEMAP_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>{base_url}/</loc></url>
{term_urls}</urlset>
"""

ROBOTS_TEMPLATE = """User-agent: *
Allow: /

Sitemap: {base_url}/sitemap.xml
"""


def write_sitemap(slugs):
    term_urls = "".join(
        f"  <url><loc>{escape(BASE_URL)}/term/{slug}/</loc></url>\n" for slug in slugs
    )
    content = SITEMAP_TEMPLATE.format(base_url=escape(BASE_URL), term_urls=term_urls)
    (ROOT / "sitemap.xml").write_text(content, encoding="utf-8")


def write_robots():
    (ROOT / "robots.txt").write_text(ROBOTS_TEMPLATE.format(base_url=BASE_URL), encoding="utf-8")


def main():
    with open(TERMS_JSON, encoding="utf-8") as f:
        terms = json.load(f)

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    seen_slugs = {}
    for term in terms:
        slug = slugify(term["term"])
        if slug in seen_slugs:
            raise SystemExit(
                f"Slug collision: '{term['term']}' and '{seen_slugs[slug]}' both slugify to '{slug}'. "
                "Fix the duplicate before regenerating."
            )
        seen_slugs[slug] = term["term"]

        page_dir = OUTPUT_DIR / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / "index.html").write_text(build_page(term), encoding="utf-8")

    write_sitemap(seen_slugs.keys())
    write_robots()

    print(f"Generated {len(terms)} term pages in {OUTPUT_DIR.relative_to(ROOT)}/, plus sitemap.xml and robots.txt")


if __name__ == "__main__":
    main()
