(async function () {
  'use strict';

  const grid = document.getElementById('terms-grid');
  const resultCount = document.getElementById('result-count');
  const emptyState = document.getElementById('empty-state');
  const emptyQuery = document.getElementById('empty-query');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const catButtons = document.querySelectorAll('.cat-btn');
  const toast = document.getElementById('toast');

  let terms = [];
  let fuse = null;
  let activeCategory = 'all';
  let query = '';

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
    threshold: 0.35,
    ignoreLocation: true,
  });

  function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // ---------- Category badge counts ----------
  function renderBadgeCounts() {
    const counts = { all: terms.length };
    terms.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    Object.keys(counts).forEach(cat => {
      const el = document.getElementById(`count-${cat}`);
      if (el) el.textContent = `(${counts[cat]})`;
    });
  }

  // ---------- Rendering ----------
  function currentResults() {
    let base = query.trim()
      ? fuse.search(query.trim()).map(r => r.item)
      : terms.slice().sort((a, b) => a.term.localeCompare(b.term));

    if (activeCategory !== 'all') {
      base = base.filter(t => t.category === activeCategory);
    }
    return base;
  }

  function render() {
    const results = currentResults();
    searchClear.classList.toggle('is-visible', query.trim().length > 0);

    grid.innerHTML = '';
    if (results.length === 0) {
      emptyState.hidden = false;
      emptyQuery.textContent = query.trim() || activeCategory;
      resultCount.textContent = 'No matches.';
      return;
    }
    emptyState.hidden = true;

    const frag = document.createDocumentFragment();
    results.forEach(t => {
      const card = document.createElement('button');
      card.className = 'term-card';
      card.type = 'button';
      card.dataset.cat = t.category;
      card.setAttribute('aria-haspopup', 'dialog');
      card.innerHTML = `
        <span class="card-cat">${escapeHtml(t.category)}</span>
        <h3>${escapeHtml(t.term)}</h3>
        <p>${escapeHtml(t.playful)}</p>
      `;
      card.addEventListener('click', () => openTermModal(t));
      frag.appendChild(card);
    });
    grid.appendChild(frag);

    const label = query.trim() ? `matching "${query.trim()}"` : (activeCategory !== 'all' ? `in ${activeCategory}` : 'total');
    resultCount.textContent = `${results.length} term${results.length === 1 ? '' : 's'} ${label}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeCategory = btn.dataset.cat;
      render();
    });
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

  // ---------- Surprise Dose (randomizer) ----------
  document.getElementById('surprise-btn').addEventListener('click', () => {
    const pick = terms[Math.floor(Math.random() * terms.length)];
    openTermModal(pick);
  });

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
    document.getElementById('wotd-term').textContent = t.term;
    document.getElementById('wotd-cat').textContent = t.category;
    document.getElementById('wotd-playful').textContent = t.playful;
    document.getElementById('wotd-real-text').textContent = t.real;
  }

  // ---------- Term detail modal ----------
  const termModal = document.getElementById('term-modal');
  let lastFocusedEl = null;
  let currentModalTerm = null;

  function openTermModal(t) {
    currentModalTerm = t;
    document.getElementById('term-modal-cat').textContent = t.category;
    document.getElementById('term-modal-title').textContent = t.term;
    document.getElementById('term-modal-playful').textContent = t.playful;
    document.getElementById('term-modal-real').textContent = t.real;
    openModal(termModal);
    history.replaceState(null, '', `#term=${slugify(t.term)}`);
  }

  document.getElementById('close-term-modal').addEventListener('click', () => {
    closeModal(termModal);
    history.replaceState(null, '', window.location.pathname);
  });

  // ---------- Copy shareable link ----------
  document.getElementById('copy-link-btn').addEventListener('click', async () => {
    if (!currentModalTerm) return;
    const url = `${window.location.origin}${window.location.pathname}#term=${slugify(currentModalTerm.term)}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied — go spread the word.');
    } catch (err) {
      showToast('Couldn\'t copy automatically — link is in your address bar.');
    }
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  // ---------- Deep link on load ----------
  function openFromHash() {
    const match = window.location.hash.match(/#term=(.+)/);
    if (!match) return;
    const slug = match[1];
    const found = terms.find(t => slugify(t.term) === slug);
    if (found) openTermModal(found);
  }

  // ---------- Submit-a-term modal ----------
  const submitModal = document.getElementById('submit-modal');
  document.getElementById('open-submit').addEventListener('click', () => openModal(submitModal));
  document.getElementById('open-submit-footer').addEventListener('click', () => openModal(submitModal));
  document.getElementById('close-submit-modal').addEventListener('click', () => closeModal(submitModal));

  document.getElementById('submit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const term = document.getElementById('term-name').value.trim();
    const def = document.getElementById('term-def').value.trim();
    const cat = document.getElementById('term-cat').value;
    // No backend wired up yet — falls back to a pre-filled mailto.
    // Replace this with a real endpoint (Formspree, a serverless function, etc.) before launch.
    const subject = encodeURIComponent(`RxPlained term submission: ${term}`);
    const body = encodeURIComponent(`Term: ${term}\nCategory: ${cat}\nDefinition: ${def}`);
    window.location.href = `mailto:submissions@rxplained.com?subject=${subject}&body=${body}`;
    closeModal(submitModal);
    e.target.reset();
  });

  // ---------- Modal accessibility helpers ----------
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
    const openModalEl = [termModal, submitModal].find(m => !m.hidden);
    if (!openModalEl) return;

    if (e.key === 'Escape') {
      closeModal(openModalEl);
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = Array.from(openModalEl.querySelectorAll('button, input, select, textarea, [href]'));
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

  [termModal, submitModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // ---------- PWA: register service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    });
  }

  // ---------- Init ----------
  renderBadgeCounts();
  renderWotd();
  render();
  openFromHash();
})();
