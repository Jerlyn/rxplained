(async function () {
  'use strict';

  const grid = document.getElementById('terms-grid');
  const resultCount = document.getElementById('result-count');
  const emptyState = document.getElementById('empty-state');
  const emptyQuery = document.getElementById('empty-query');
  const emptyStateDefault = document.getElementById('empty-state-default');
  const emptyStateSaved = document.getElementById('empty-state-saved');
  const emptyStateFiltered = document.getElementById('empty-state-filtered');
  const emptyFilteredCat = document.getElementById('empty-filtered-cat');
  const emptyFilteredQuery = document.getElementById('empty-filtered-query');
  const emptyStateCta = document.getElementById('empty-state-cta');
  const emptyClearCategoryBtn = document.getElementById('empty-clear-category-btn');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const catSelect = document.getElementById('cat-select');
  const sortToggle = document.getElementById('sort-toggle');
  const sortLabel = document.getElementById('sort-label');
  const toast = document.getElementById('toast');

  let terms = [];
  let fuse = null;
  let activeCategory = 'all';
  let query = '';
  let sortDir = 'asc';

  // ---------- Saved terms (localStorage) ----------
  const SAVED_KEY = 'rxplained:saved-terms';
  let savedSlugs = new Set();

  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      savedSlugs = new Set(raw ? JSON.parse(raw) : []);
    } catch (err) {
      savedSlugs = new Set();
    }
  }

  function persistSaved() {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify([...savedSlugs]));
    } catch (err) {
      // localStorage unavailable (e.g. private browsing quota) — saves won't persist, but app still works.
    }
  }

  function isSaved(t) {
    return savedSlugs.has(slugify(t.term));
  }

  function toggleSaved(t) {
    const slug = slugify(t.term);
    if (savedSlugs.has(slug)) savedSlugs.delete(slug);
    else savedSlugs.add(slug);
    persistSaved();
    renderBadgeCounts();

    if (activeCategory === 'saved') {
      // membership in the currently-filtered list actually changed — needs a full rebuild
      render();
    } else {
      // just refresh this one button in place so any other expanded cards stay expanded
      const btn = grid.querySelector(`.term-card-save[data-slug="${CSS.escape(slug)}"]`);
      if (btn) {
        const saved = isSaved(t);
        btn.setAttribute('aria-pressed', String(saved));
        btn.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${t.term}`);
      }
    }
  }

  // ---------- Load data ----------
  try {
    const res = await fetch('data/terms.json');
    terms = await res.json();
  } catch (err) {
    grid.innerHTML = '<p>Couldn\'t load the dictionary right now. Try refreshing.</p>';
    console.error('Failed to load terms.json', err);
    return;
  }

  fuse = new Fuse(terms, {
    keys: [
      { name: 'term', weight: 0.6 },
      { name: 'playful', weight: 0.2 },
      { name: 'real', weight: 0.2 },
    ],
    threshold: 0.25,
    ignoreLocation: true,
  });

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // ---------- Category dropdown counts ----------
  const catOptionBaseLabels = new Map(
    [...catSelect.options].map(opt => [opt.value, opt.textContent])
  );

  function renderBadgeCounts() {
    const counts = { all: terms.length, saved: terms.filter(isSaved).length };
    terms.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    [...catSelect.options].forEach(opt => {
      const base = catOptionBaseLabels.get(opt.value);
      opt.textContent = `${base} (${counts[opt.value] || 0})`;
    });
  }

  // ---------- Search ----------
  // A plain substring match on the term name is a stronger, more predictable signal than
  // fuzzy scoring — "KOL" should always surface "KOL (Key Opinion Leader)" before anything
  // fuzzily matched inside unrelated definition text. Fuzzy search (across term/playful/real)
  // only runs as a fallback when no term name contains the query at all.
  function searchTerms(q) {
    const needle = q.toLowerCase();
    const direct = terms.filter(t => t.term.toLowerCase().includes(needle));
    if (direct.length > 0) {
      return direct.sort((a, b) => {
        const aIdx = a.term.toLowerCase().indexOf(needle);
        const bIdx = b.term.toLowerCase().indexOf(needle);
        if (aIdx !== bIdx) return aIdx - bIdx; // prefix matches (idx 0) before mid-string
        if (a.term.length !== b.term.length) return a.term.length - b.term.length; // closer to exact first
        return a.term.localeCompare(b.term);
      });
    }
    return fuse.search(q).map(r => r.item);
  }

  // ---------- Rendering ----------
  function currentResults() {
    const trimmedQuery = query.trim();
    let base = trimmedQuery ? searchTerms(trimmedQuery) : terms.slice();

    if (activeCategory === 'saved') {
      base = base.filter(isSaved);
    } else if (activeCategory !== 'all') {
      base = base.filter(t => t.category === activeCategory);
    }

    // The A–Z/Z–A toggle governs browsing order. While a search is active, relevance
    // (exact/prefix match, then fuzzy score) matters more than alphabetical order, so leave it be.
    if (!trimmedQuery) {
      base.sort((a, b) => sortDir === 'asc' ? a.term.localeCompare(b.term) : b.term.localeCompare(a.term));
    }
    return base;
  }

  const HEART_PATH = 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
  const LINK_ICON_SVG = `<svg class="link-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;

  async function copyTermLink(t) {
    const url = `${window.location.origin}${window.location.pathname}#term=${slugify(t.term)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied — go spread the word.');
    } catch (err) {
      showToast('Couldn\'t copy automatically — link is in your address bar.');
    }
  }

  function render() {
    const results = currentResults();
    searchClear.classList.toggle('is-visible', query.trim().length > 0);

    grid.innerHTML = '';
    if (results.length === 0) {
      emptyState.hidden = false;
      const trimmed = query.trim();
      const variant = (activeCategory === 'saved' && !trimmed) ? 'saved'
        : (trimmed && activeCategory !== 'all') ? 'filtered'
        : 'default';

      emptyStateDefault.hidden = variant !== 'default';
      emptyStateSaved.hidden = variant !== 'saved';
      emptyStateFiltered.hidden = variant !== 'filtered';
      emptyStateCta.hidden = variant !== 'default';
      emptyClearCategoryBtn.hidden = variant !== 'filtered';

      if (variant === 'default') {
        emptyQuery.textContent = trimmed || activeCategory;
      } else if (variant === 'filtered') {
        emptyFilteredCat.textContent = categoryDisplayName(activeCategory);
        emptyFilteredQuery.textContent = trimmed;
      }

      resultCount.textContent = 'No matches.';
      return;
    }
    emptyState.hidden = true;

    const frag = document.createDocumentFragment();
    results.forEach(t => {
      const slug = slugify(t.term);
      const detailId = `term-detail-${slug}`;

      const card = document.createElement('div');
      card.className = 'term-card';
      card.dataset.cat = t.category;
      card.dataset.slug = slug;

      const actions = document.createElement('div');
      actions.className = 'term-card-actions';

      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'term-card-share';
      shareBtn.setAttribute('aria-label', `Copy link to ${t.term}`);
      shareBtn.innerHTML = LINK_ICON_SVG;
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyTermLink(t);
      });

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'term-card-save';
      saveBtn.dataset.slug = slug;
      saveBtn.setAttribute('aria-pressed', String(isSaved(t)));
      saveBtn.setAttribute('aria-label', `${isSaved(t) ? 'Remove' : 'Save'} ${t.term}`);
      saveBtn.innerHTML = `<svg class="heart-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}"></path></svg>`;
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSaved(t);
      });

      actions.appendChild(shareBtn);
      actions.appendChild(saveBtn);

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'term-card-main';
      main.setAttribute('aria-expanded', 'false');
      main.setAttribute('aria-controls', detailId);
      main.innerHTML = `
        <span class="card-cat">${escapeHtml(t.category)}</span>
        <h3>${formatTermHTML(t.term)}</h3>
        <p class="card-teaser">${escapeHtml(t.playful)}</p>
      `;

      const detail = document.createElement('div');
      detail.className = 'term-card-detail';
      detail.id = detailId;
      detail.hidden = true;
      detail.innerHTML = `
        <p class="card-real-label">What it actually means</p>
        <p class="card-real-text">${escapeHtml(t.real)}</p>
      `;

      main.addEventListener('click', () => {
        const expanded = main.getAttribute('aria-expanded') === 'true';
        main.setAttribute('aria-expanded', String(!expanded));
        detail.hidden = expanded;
        card.classList.toggle('is-expanded', !expanded);
        if (!expanded) {
          history.replaceState(null, '', `#term=${slug}`);
        } else if (window.location.hash === `#term=${slug}`) {
          history.replaceState(null, '', window.location.pathname);
        }
      });

      card.appendChild(main);
      card.appendChild(detail);
      card.appendChild(actions);
      frag.appendChild(card);
    });
    grid.appendChild(frag);

    const label = query.trim() ? `matching "${query.trim()}"` : (activeCategory === 'saved' ? 'saved' : (activeCategory !== 'all' ? `in ${activeCategory}` : 'total'));
    resultCount.textContent = `${results.length} term${results.length === 1 ? '' : 's'} ${label}`;
  }

  function categoryDisplayName(cat) {
    return cat === 'saved' ? 'Saved' : cat;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Some term names carry literal quote marks around a quoted phrase (e.g. "Results May Vary").
  // Render the quoted portion in italics instead, for a consistent look across terms that do and don't have them.
  function formatTermHTML(term) {
    const match = term.match(/^"([^"]+)"(.*)$/);
    if (!match) return escapeHtml(term);
    return `<em>${escapeHtml(match[1])}</em>${escapeHtml(match[2])}`;
  }

  // ---------- Search & filter events ----------
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      query = e.target.value;
      render();
    }, 120);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      query = '';
      render();
      searchInput.blur();
    }
  });

  catSelect.addEventListener('change', () => {
    activeCategory = catSelect.value;
    render();
  });

  sortToggle.addEventListener('click', () => {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    sortToggle.classList.toggle('is-desc', sortDir === 'desc');
    sortToggle.setAttribute('aria-pressed', String(sortDir === 'desc'));
    sortLabel.textContent = sortDir === 'asc' ? 'Sort: A–Z' : 'Sort: Z–A';
    render();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    query = '';
    render();
    searchInput.focus();
  });

  document.getElementById('empty-state-cta').addEventListener('click', () => {
    openModal(submitModal);
    document.getElementById('term-name').value = query.trim();
  });

  emptyClearCategoryBtn.addEventListener('click', () => {
    activeCategory = 'all';
    catSelect.value = 'all';
    render();
  });

  // ---------- Global keyboard shortcut: Cmd/Ctrl+K or "/" focuses search ----------
  document.addEventListener('keydown', (e) => {
    const isTypingElsewhere = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (e.key === '/' && !isTypingElsewhere) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // No visible entry point currently, but cheap to keep for a future randomizer feature.
  function randomTerm() {
    return terms[Math.floor(Math.random() * terms.length)];
  }

  // ---------- Word of the Day ----------
  function wordOfDay() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const dayOfYear = Math.floor(diff / 86400000);
    const index = dayOfYear % terms.length;
    return terms[index];
  }

  function renderWotd() {
    const t = wordOfDay();
    document.getElementById('wotd-term').innerHTML = formatTermHTML(t.term);
    document.getElementById('wotd-cat').textContent = t.category;
    document.getElementById('wotd-playful').textContent = t.playful;
    document.getElementById('wotd-real-text').textContent = t.real;
  }

  // ---------- WOTD reveal-on-click ----------
  const wotdRevealBtn = document.getElementById('wotd-reveal-btn');
  const wotdRevealLabel = document.getElementById('wotd-reveal-label');
  const wotdRealBlock = document.getElementById('wotd-real-block');

  wotdRevealBtn.addEventListener('click', () => {
    const expanded = wotdRevealBtn.getAttribute('aria-expanded') === 'true';
    wotdRevealBtn.setAttribute('aria-expanded', String(!expanded));
    wotdRealBlock.hidden = expanded;
    wotdRevealLabel.textContent = expanded ? 'Tap to see what it actually means' : 'Tap to hide the real meaning';
  });

  let toastTimer;
  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.classList.toggle('is-error', isError);
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), isError ? 4200 : 2600);
  }

  // ---------- Deep link on load ----------
  function openFromHash() {
    const match = window.location.hash.match(/#term=(.+)/);
    if (!match) return;
    const slug = match[1];
    const cardEl = grid.querySelector(`.term-card[data-slug="${CSS.escape(slug)}"]`);
    if (!cardEl) return;

    const trigger = cardEl.querySelector('.term-card-main');
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardEl.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  }

  // ---------- Submit-a-term modal ----------
  const submitModal = document.getElementById('submit-modal');
  document.getElementById('open-submit').addEventListener('click', () => openModal(submitModal));
  document.getElementById('open-submit-footer').addEventListener('click', () => openModal(submitModal));
  document.getElementById('close-submit-modal').addEventListener('click', () => closeModal(submitModal));

  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mvkpwkze';

  document.getElementById('submit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' },
      });

      if (res.ok) {
        showToast('Thanks — we read every submission.');
        closeModal(submitModal);
        form.reset();
      } else {
        const data = await res.json().catch(() => null);
        const msg = data && Array.isArray(data.errors) && data.errors.length
          ? data.errors.map(err => err.message).join(', ')
          : 'Something went wrong — try again in a bit.';
        showToast(msg, true);
      }
    } catch (err) {
      showToast('Network error — check your connection and try again.', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // ---------- Modal accessibility helpers ----------
  let lastFocusedEl = null;

  function openModal(modal) {
    lastFocusedEl = document.activeElement;
    modal.hidden = false;
    const focusable = modal.querySelectorAll('button, input, select, textarea, [href]');
    if (focusable.length) focusable[0].focus();
    document.addEventListener('keydown', trapFocus);
  }

  function closeModal(modal) {
    modal.hidden = true;
    document.removeEventListener('keydown', trapFocus);
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  function trapFocus(e) {
    if (submitModal.hidden) return;

    if (e.key === 'Escape') {
      closeModal(submitModal);
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = Array.from(submitModal.querySelectorAll('button, input, select, textarea, [href]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  submitModal.addEventListener('click', (e) => {
    if (e.target === submitModal) closeModal(submitModal);
  });

  // ---------- Back to top ----------
  const backToTop = document.getElementById('back-to-top');
  const BACK_TO_TOP_THRESHOLD = 400;
  let scrollTicking = false;

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      backToTop.hidden = window.scrollY < BACK_TO_TOP_THRESHOLD;
      scrollTicking = false;
    });
  });

  backToTop.addEventListener('click', () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  // ---------- PWA: register service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    });
  }

  // ---------- Init ----------
  loadSaved();
  renderBadgeCounts();
  renderWotd();
  render();
  openFromHash();
})();
