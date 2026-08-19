(function () {
  'use strict';

  const SAVED_KEY = 'rxplained:saved-terms';
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mvkpwkze';

  const CATEGORIES = [
    { id: 'all', label: 'All Terms', icon: '⚡' },
    { id: 'Doctor Speak', label: 'Doctor Speak', icon: '🩺' },
    { id: 'Money Talk', label: 'Money Talk', icon: '💰' },
    { id: 'Legal Says', label: 'Legal Says', icon: '⚖️' },
    { id: 'Behind the Ad', label: 'Behind the Ad', icon: '🎬' },
    { id: 'Ask Your Doctor', label: 'Ask Your Doctor', icon: '📺' },
    { id: 'saved', label: 'Saved', icon: '♥' },
  ];

  const HEART_PATH = 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-1.293-6.364 4.5 4.5 0 00-6.364 0L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z';
  const SHARE_PATH = 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z';
  const SPEAK_PATH = 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';

  class RxPlainedApp {
    constructor(terms) {
      this.terms = terms;
      this.savedSlugs = this.loadSaved();
      this.currentCategory = 'all';
      this.searchQuery = '';
      this.sortOrder = 'az';
      this.wotdIndex = this.dayOfYearIndex();
      this.cmdHighlightIndex = -1;
      this.cmdMatches = [];
      this.lastFocusedEl = null;

      this.fuse = new Fuse(this.terms, {
        keys: [
          { name: 'term', weight: 0.6 },
          { name: 'aliases', weight: 0.6 },
          { name: 'playful', weight: 0.2 },
          { name: 'real', weight: 0.2 },
        ],
        threshold: 0.25,
        ignoreLocation: true,
      });

      this.initDOM();
      this.initEvents();
      this.renderWotd();
      this.renderCategoryChips();
      this.renderTerms();
      this.updateSavedBadge();
      this.checkDeepLink();
    }

    // ---------- Utilities ----------
    slugify(str) {
      return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // Some term names carry literal quote marks around a quoted phrase (e.g. "Results May Vary").
    // Render the quoted portion in italics instead, for a consistent look across terms that do and don't have them.
    formatTermHTML(term) {
      const match = term.match(/^"([^"]+)"(.*)$/);
      if (!match) return this.escapeHtml(term);
      return `<em>${this.escapeHtml(match[1])}</em>${this.escapeHtml(match[2])}`;
    }

    dayOfYearIndex() {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const dayOfYear = Math.floor((now - start) / 86400000);
      return dayOfYear % this.terms.length;
    }

    prefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // ---------- Saved terms (localStorage) ----------
    loadSaved() {
      try {
        const raw = localStorage.getItem(SAVED_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch (err) {
        return new Set();
      }
    }

    persistSaved() {
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify([...this.savedSlugs]));
      } catch (err) {
        // localStorage unavailable (e.g. private browsing quota) — saves won't persist, but app still works.
      }
    }

    isSaved(t) {
      return this.savedSlugs.has(this.slugify(t.term));
    }

    toggleSave(t) {
      const slug = this.slugify(t.term);
      const nowSaved = !this.savedSlugs.has(slug);
      if (nowSaved) {
        this.savedSlugs.add(slug);
        this.showToast(`❤️ Saved "${t.term}"`);
        this.fireConfetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
      } else {
        this.savedSlugs.delete(slug);
        this.showToast(`Removed "${t.term}" from saved`);
      }
      this.persistSaved();
      this.updateSavedBadge();
      this.renderCategoryChips();
      if (this.currentCategory === 'saved') {
        this.renderTerms();
      } else {
        this.updateSaveButtonsUI(slug, nowSaved, t.term);
      }
      if (this.wotdTerm() === t) this.updateWotdBookmarkState();
    }

    updateSaveButtonsUI(slug, saved, termName) {
      document.querySelectorAll(`[data-save-slug="${CSS.escape(slug)}"]`).forEach((btn) => {
        btn.setAttribute('aria-pressed', String(saved));
        btn.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${termName}`);
        const svg = btn.querySelector('svg');
        svg.setAttribute('fill', saved ? 'currentColor' : 'none');
        btn.classList.toggle('text-pink-500', saved);
        btn.classList.toggle('border-pink-500/50', saved);
        if (!this.prefersReducedMotion()) {
          svg.classList.remove('animate-heart');
          void svg.offsetWidth; // restart animation
          svg.classList.add('animate-heart');
        }
      });
    }

    // ---------- Search ----------
    // A plain substring match on the term name (or a known alias, e.g. "eDetail" for
    // "Visual Aid") is a stronger, more predictable signal than fuzzy scoring — "KOL" should
    // always surface "KOL (Key Opinion Leader)" before anything fuzzily matched inside
    // unrelated definition text. Term-name matches rank above alias-only matches, but both
    // sit ahead of fuzzy results. Fuzzy search only runs as a fallback when nothing matches
    // a term name or alias at all.
    searchTerms(q) {
      const needle = q.toLowerCase();
      const direct = this.terms
        .map((t) => {
          const termIdx = t.term.toLowerCase().indexOf(needle);
          if (termIdx !== -1) {
            return { item: t, rank: 0, idx: termIdx, matchLength: t.term.length };
          }
          let bestIdx = -1;
          let bestLength = Infinity;
          for (const alias of t.aliases || []) {
            const idx = alias.toLowerCase().indexOf(needle);
            if (idx !== -1 && alias.length < bestLength) {
              bestIdx = idx;
              bestLength = alias.length;
            }
          }
          return bestIdx !== -1 ? { item: t, rank: 1, idx: bestIdx, matchLength: bestLength } : null;
        })
        .filter(Boolean);

      if (direct.length > 0) {
        return direct
          .sort((a, b) => {
            if (a.rank !== b.rank) return a.rank - b.rank;
            if (a.idx !== b.idx) return a.idx - b.idx;
            if (a.matchLength !== b.matchLength) return a.matchLength - b.matchLength;
            return a.item.term.localeCompare(b.item.term);
          })
          .map((r) => r.item);
      }
      return this.fuse.search(q).map((r) => r.item);
    }

    getFilteredTerms() {
      const trimmed = this.searchQuery.trim();
      let list = trimmed ? this.searchTerms(trimmed) : this.terms.slice();

      if (this.currentCategory === 'saved') {
        list = list.filter((t) => this.isSaved(t));
      } else if (this.currentCategory !== 'all') {
        list = list.filter((t) => t.category === this.currentCategory);
      }

      // Relevance ordering wins while actively searching; the sort control only
      // governs browsing order once there's no query to rank against.
      if (!trimmed) {
        if (this.sortOrder === 'az') list.sort((a, b) => a.term.localeCompare(b.term));
        else if (this.sortOrder === 'za') list.sort((a, b) => b.term.localeCompare(a.term));
        else if (this.sortOrder === 'random') list.sort(() => 0.5 - Math.random());
      }

      return list;
    }

    // ---------- DOM refs ----------
    initDOM() {
      this.dom = {
        termsContainer: document.getElementById('terms-container'),
        mainInput: document.getElementById('main-search-input'),
        clearSearchBtn: document.getElementById('clear-search-btn'),
        sortSelect: document.getElementById('sort-select'),
        chipsContainer: document.getElementById('category-chips-container'),
        visibleCount: document.getElementById('visible-count'),
        savedCount: document.getElementById('saved-count'),
        emptyState: document.getElementById('empty-state'),
        emptyStateMsg: document.getElementById('empty-state-msg'),

        cmdModal: document.getElementById('cmd-k-modal'),
        cmdInput: document.getElementById('cmd-k-input'),
        cmdResults: document.getElementById('cmd-k-results'),
        cmdBtn: document.getElementById('cmd-k-btn'),

        submitModal: document.getElementById('submit-modal'),
        openSubmitBtns: [document.getElementById('open-submit'), document.getElementById('open-submit-footer'), document.getElementById('empty-submit-btn')],
        closeSubmitBtn: document.getElementById('close-submit-modal'),
        submitForm: document.getElementById('submit-form'),

        wotdTitle: document.getElementById('wotd-term-title'),
        wotdCat: document.getElementById('wotd-cat-badge'),
        wotdPlayful: document.getElementById('wotd-playful-text'),
        wotdReal: document.getElementById('wotd-real-text'),
        wotdSpeakBtn: document.getElementById('wotd-speak-btn'),
        wotdBookmarkBtn: document.getElementById('wotd-bookmark-btn'),
        wotdShuffleBtn: document.getElementById('random-wotd-btn'),

        backToTop: document.getElementById('back-to-top'),
        toastContainer: document.getElementById('toast-container'),
      };
    }

    // ---------- Events ----------
    initEvents() {
      let debounceTimer;
      this.dom.mainInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.searchQuery = e.target.value;
          this.dom.clearSearchBtn.classList.toggle('hidden', !this.searchQuery.trim());
          this.renderTerms();
        }, 120);
      });

      this.dom.clearSearchBtn.addEventListener('click', () => {
        this.dom.mainInput.value = '';
        this.searchQuery = '';
        this.dom.clearSearchBtn.classList.add('hidden');
        this.renderTerms();
        this.dom.mainInput.focus();
      });

      this.dom.sortSelect.addEventListener('change', (e) => {
        this.sortOrder = e.target.value;
        this.renderTerms();
      });

      document.getElementById('saved-filter-badge').addEventListener('click', () => this.selectCategory('saved'));

      document.addEventListener('keydown', (e) => {
        const isTypingElsewhere = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement !== this.dom.mainInput;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          this.openCmdModal();
        } else if (e.key === 'Escape') {
          if (!this.dom.cmdModal.classList.contains('hidden')) this.closeCmdModal();
          else if (!this.dom.submitModal.classList.contains('hidden')) this.closeSubmitModal();
        } else if (e.key === '/' && !isTypingElsewhere && this.dom.cmdModal.classList.contains('hidden') && this.dom.submitModal.classList.contains('hidden')) {
          e.preventDefault();
          this.dom.mainInput.focus();
        }
      });

      this.dom.cmdBtn.addEventListener('click', () => this.openCmdModal());
      this.dom.cmdModal.addEventListener('click', (e) => { if (e.target === this.dom.cmdModal) this.closeCmdModal(); });
      this.dom.cmdInput.addEventListener('input', (e) => this.renderCmdResults(e.target.value));
      this.dom.cmdInput.addEventListener('keydown', (e) => this.handleCmdKeydown(e));

      this.dom.openSubmitBtns.forEach((btn) => btn && btn.addEventListener('click', () => this.openSubmitModal()));
      this.dom.closeSubmitBtn.addEventListener('click', () => this.closeSubmitModal());
      this.dom.submitModal.addEventListener('click', (e) => { if (e.target === this.dom.submitModal) this.closeSubmitModal(); });
      this.dom.submitModal.addEventListener('keydown', (e) => this.trapFocus(e, this.dom.submitModal));
      this.dom.submitForm.addEventListener('submit', (e) => { e.preventDefault(); this.handleFormSubmit(); });

      this.dom.wotdShuffleBtn.addEventListener('click', () => {
        this.wotdIndex = Math.floor(Math.random() * this.terms.length);
        this.renderWotd();
      });
      this.dom.wotdSpeakBtn.addEventListener('click', () => {
        const t = this.wotdTerm();
        this.speakText(`${t.term}. Definition: ${t.real}`);
      });
      this.dom.wotdBookmarkBtn.addEventListener('click', () => this.toggleSave(this.wotdTerm()));

      document.getElementById('reset-filters-btn').addEventListener('click', () => {
        this.searchQuery = '';
        this.dom.mainInput.value = '';
        this.dom.clearSearchBtn.classList.add('hidden');
        this.selectCategory('all');
      });

      window.addEventListener('scroll', () => {
        if (this._scrollTicking) return;
        this._scrollTicking = true;
        requestAnimationFrame(() => {
          this.dom.backToTop.classList.toggle('hidden', window.scrollY < 400);
          this._scrollTicking = false;
        });
      });
      this.dom.backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: this.prefersReducedMotion() ? 'auto' : 'smooth' });
      });
    }

    // ---------- Word of the Day ----------
    wotdTerm() { return this.terms[this.wotdIndex]; }

    renderWotd() {
      const t = this.wotdTerm();
      if (!t) return;
      this.dom.wotdTitle.innerHTML = this.formatTermHTML(t.term);
      this.dom.wotdCat.textContent = t.category;
      this.dom.wotdPlayful.textContent = t.playful;
      this.dom.wotdReal.textContent = t.real;
      this.updateWotdBookmarkState();

      const relatedEl = document.getElementById('wotd-related');
      relatedEl.innerHTML = this.renderRelatedTerms(t);
      relatedEl.querySelectorAll('[data-related-slug]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const related = this.terms.find((x) => this.slugify(x.term) === chip.dataset.relatedSlug);
          if (related) this.jumpToTerm(related);
        });
      });
    }

    updateWotdBookmarkState() {
      const saved = this.isSaved(this.wotdTerm());
      const svg = this.dom.wotdBookmarkBtn.querySelector('svg');
      svg.setAttribute('fill', saved ? 'currentColor' : 'none');
      this.dom.wotdBookmarkBtn.setAttribute('aria-pressed', String(saved));
      this.dom.wotdBookmarkBtn.classList.toggle('text-pink-500', saved);
      this.dom.wotdBookmarkBtn.classList.toggle('border-pink-500/50', saved);
    }

    speakText(text) {
      if (!('speechSynthesis' in window)) {
        this.showToast('Speech playback not supported in this browser.', true);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
      this.showToast('🔊 Playing audio definition');
    }

    // ---------- Category chips ----------
    renderCategoryChips() {
      this.dom.chipsContainer.innerHTML = CATEGORIES.map((cat) => {
        const count = cat.id === 'all' ? this.terms.length
          : cat.id === 'saved' ? this.savedSlugs.size
          : this.terms.filter((t) => t.category === cat.id).length;
        const isActive = this.currentCategory === cat.id;
        return `
          <button type="button" data-cat-id="${this.escapeHtml(cat.id)}" aria-pressed="${isActive}"
            class="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-full font-semibold text-xs whitespace-nowrap transition-all border ${
              isActive
                ? 'bg-teal-400 text-navy-950 border-teal-400 shadow-md shadow-teal-400/20'
                : 'bg-navy-900/80 text-slate-300 border-slate-700/60 hover:border-teal-400/50 hover:text-white'
            }">
            <span aria-hidden="true">${cat.icon}</span>
            <span>${this.escapeHtml(cat.label)}</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? 'bg-navy-950/30 text-navy-950 font-bold' : 'bg-navy-950 text-slate-400'}">${count}</span>
          </button>`;
      }).join('');

      this.dom.chipsContainer.querySelectorAll('[data-cat-id]').forEach((btn) => {
        btn.addEventListener('click', () => this.selectCategory(btn.dataset.catId));
      });
    }

    selectCategory(catId) {
      this.currentCategory = catId;
      this.renderCategoryChips();
      this.renderTerms();
    }

    // ---------- Term list ----------
    renderTerms() {
      const list = this.getFilteredTerms();
      this.dom.visibleCount.textContent = list.length;

      if (list.length === 0) {
        this.dom.termsContainer.innerHTML = '';
        this.dom.emptyState.classList.remove('hidden');
        const trimmed = this.searchQuery.trim();
        if (trimmed && this.currentCategory !== 'all') {
          const catLabel = this.currentCategory === 'saved' ? 'Saved' : this.currentCategory;
          this.dom.emptyStateMsg.innerHTML = `No matches in <strong class="text-white">${this.escapeHtml(catLabel)}</strong> for "${this.escapeHtml(trimmed)}." <button type="button" id="empty-clear-cat-btn" class="block mx-auto mt-3 text-teal-400 hover:underline font-semibold min-h-[44px]">See results in all categories →</button>`;
          const clearBtn = document.getElementById('empty-clear-cat-btn');
          if (clearBtn) clearBtn.addEventListener('click', () => this.selectCategory('all'));
        } else if (this.currentCategory === 'saved' && !trimmed) {
          this.dom.emptyStateMsg.textContent = 'No saved terms yet. Tap the heart on any word to add it here.';
        } else {
          this.dom.emptyStateMsg.textContent = `We couldn't find any pharma terms matching "${trimmed || catLabelFor(this.currentCategory)}".`;
        }
        return;
      }

      this.dom.emptyState.classList.add('hidden');
      this.dom.termsContainer.innerHTML = list.map((t) => this.renderTermCard(t)).join('');
      this.wireTermCardEvents();
    }

    renderTermCard(t) {
      const isSaved = this.isSaved(t);
      const slug = this.slugify(t.term);
      return `
        <article id="term-${slug}" data-slug="${slug}" class="glass-panel rounded-2xl p-5 sm:p-6 transition-all hover:border-teal-400/50">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
            <div>
              <span class="text-xs font-mono font-semibold uppercase px-2.5 py-0.5 rounded-md bg-teal-400/10 text-teal-300 border border-teal-400/20">${this.escapeHtml(t.category)}</span>
              <h3 class="text-xl sm:text-2xl font-display font-bold text-white mt-1.5">${this.formatTermHTML(t.term)}</h3>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" data-action="speak" class="p-2 min-w-[44px] min-h-[44px] rounded-lg bg-navy-900 border border-slate-700 text-slate-400 hover:text-teal-300 hover:border-teal-400 transition-all" aria-label="Listen to ${this.escapeHtml(t.term)}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${SPEAK_PATH}"/></svg>
              </button>
              <button type="button" data-action="share" class="p-2 min-w-[44px] min-h-[44px] rounded-lg bg-navy-900 border border-slate-700 text-slate-400 hover:text-teal-300 hover:border-teal-400 transition-all" aria-label="Copy link to ${this.escapeHtml(t.term)}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${SHARE_PATH}"/></svg>
              </button>
              <button type="button" data-action="save" data-save-slug="${slug}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove' : 'Save'} ${this.escapeHtml(t.term)}" class="p-2 min-w-[44px] min-h-[44px] rounded-lg bg-navy-900 border border-slate-700 ${isSaved ? 'text-pink-500 border-pink-500/50' : 'text-slate-400'} hover:text-pink-400 transition-all">
                <svg class="w-4 h-4" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${HEART_PATH}"/></svg>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 rounded-xl bg-navy-950/60 border border-purple-400/20 space-y-1.5">
              <span class="text-xs font-mono font-bold text-pink-400 uppercase tracking-wider block">🎭 The Pitch (Playful)</span>
              <p class="text-slate-200 text-sm leading-relaxed">${this.escapeHtml(t.playful)}</p>
            </div>
            <div class="p-4 rounded-xl bg-navy-950/60 border border-teal-400/20 space-y-1.5">
              <span class="text-xs font-mono font-bold text-teal-300 uppercase tracking-wider block">📋 The Reality (Official)</span>
              <p class="text-slate-300 text-sm leading-relaxed">${this.escapeHtml(t.real)}</p>
            </div>
          </div>

          ${this.renderRelatedTerms(t)}
        </article>`;
    }

    renderRelatedTerms(t) {
      const related = this.getRelatedTerms(t);
      if (related.length === 0) return '';
      const chips = related.map((r) => `
        <button type="button" data-related-slug="${this.slugify(r.term)}"
          class="px-3 py-2 rounded-full bg-navy-900/60 border border-slate-700/60 text-slate-300 text-xs hover:border-teal-400/50 hover:text-teal-300 transition-all">
          ${this.formatTermHTML(r.term)}
        </button>`).join('');
      return `
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
          <span class="text-slate-400 font-mono text-[11px] uppercase tracking-wider">More from ${this.escapeHtml(t.category)}:</span>
          ${chips}
        </div>`;
    }

    wireTermCardEvents() {
      this.dom.termsContainer.querySelectorAll('article[data-slug]').forEach((card) => {
        const slug = card.dataset.slug;
        const t = this.terms.find((x) => this.slugify(x.term) === slug);
        if (!t) return;
        card.querySelector('[data-action="speak"]').addEventListener('click', () => this.speakText(`${t.term}. ${t.real}`));
        card.querySelector('[data-action="share"]').addEventListener('click', () => this.shareTerm(t));
        card.querySelector('[data-action="save"]').addEventListener('click', () => this.toggleSave(t));
        card.querySelectorAll('[data-related-slug]').forEach((chip) => {
          chip.addEventListener('click', () => {
            const related = this.terms.find((x) => this.slugify(x.term) === chip.dataset.relatedSlug);
            if (related) this.jumpToTerm(related);
          });
        });
      });
    }

    // ---------- Share / deep link ----------
    shareTerm(t) {
      // Points at the generated static term page (see scripts/generate_term_pages.py),
      // which carries this term's own social-preview tags and redirects here — not the
      // old #hash link, which social crawlers can never see since fragments never reach
      // a server. basePath handles both root and subpath deployments.
      const slug = this.slugify(t.term);
      const basePath = window.location.pathname.replace(/index\.html$/, '');
      const url = `${window.location.origin}${basePath}term/${slug}/`;
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('🔗 Link copied to clipboard!');
      }).catch(() => {
        this.showToast("Couldn't copy automatically — link is in your address bar.", true);
      });
    }

    // Deliberately isolated from searchTerms()/Fuse: a deep link must resolve to exactly
    // one term or none, never an approximate/ranked match. Do not route this through the
    // search bar's matching logic even if it seems like reusable code — that logic is fuzzy
    // and rank-ordered by design, which is correct for a search box and wrong for a hash
    // lookup. Matches against the canonical `this.terms` array as loaded from terms.json,
    // never a filtered/sorted view of it.
    checkDeepLink() {
      const match = window.location.hash.match(/#term=(.+)/);
      if (!match) return;
      const slug = match[1];
      const found = this.terms.find(
        (t) => this.slugify(t.term) === slug || (t.aliases || []).some((a) => this.slugify(a) === slug)
      );
      if (found) this.jumpToTerm(found);
    }

    // Clears filters so the target is guaranteed visible, scrolls to it, and gives it a
    // brief highlight pulse. Shared by deep links, the Cmd+K palette, and related-term links.
    jumpToTerm(t) {
      this.currentCategory = 'all';
      this.searchQuery = '';
      this.dom.mainInput.value = '';
      this.renderCategoryChips();
      this.renderTerms();

      const el = document.getElementById(`term-${this.slugify(t.term)}`);
      if (!el) return;
      el.scrollIntoView({ behavior: this.prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
      el.classList.add('deep-link-highlight');
      setTimeout(() => el.classList.remove('deep-link-highlight'), 1700);
    }

    // Deterministic, not fabricated: the next N terms alphabetically within the same
    // category, wrapping around. Real category membership only — never invents a
    // semantic relationship the data doesn't actually support.
    getRelatedTerms(t, count = 3) {
      const sameCategory = this.terms.filter((x) => x.category === t.category && x !== t);
      if (sameCategory.length === 0) return [];
      sameCategory.sort((a, b) => a.term.localeCompare(b.term));
      const startIndex = sameCategory.findIndex((x) => x.term.localeCompare(t.term) > 0);
      const start = startIndex === -1 ? 0 : startIndex;
      const picks = [];
      for (let i = 0; i < Math.min(count, sameCategory.length); i++) {
        picks.push(sameCategory[(start + i) % sameCategory.length]);
      }
      return picks;
    }

    updateSavedBadge() {
      this.dom.savedCount.textContent = this.savedSlugs.size;
    }

    // ---------- Cmd+K palette ----------
    openCmdModal() {
      this.lastFocusedEl = document.activeElement;
      this.dom.cmdModal.classList.remove('hidden');
      this.dom.cmdInput.value = '';
      this.dom.cmdInput.focus();
      this.renderCmdResults('');
    }

    closeCmdModal() {
      this.dom.cmdModal.classList.add('hidden');
      if (this.lastFocusedEl) this.lastFocusedEl.focus();
    }

    renderCmdResults(query) {
      const trimmed = query.trim();
      this.cmdMatches = (trimmed ? this.searchTerms(trimmed) : this.terms).slice(0, 8);
      this.cmdHighlightIndex = this.cmdMatches.length ? 0 : -1;

      if (this.cmdMatches.length === 0) {
        this.dom.cmdResults.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">No terms found for "${this.escapeHtml(trimmed)}"</div>`;
        this.dom.cmdInput.removeAttribute('aria-activedescendant');
        return;
      }

      this.dom.cmdResults.innerHTML = this.cmdMatches.map((t, i) => `
        <div id="cmd-opt-${i}" role="option" aria-selected="${i === this.cmdHighlightIndex}" data-index="${i}"
          class="p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border ${i === this.cmdHighlightIndex ? 'bg-navy-950 border-teal-400/30' : 'border-transparent hover:bg-navy-950/60'}">
          <div class="min-w-0">
            <span class="text-xs font-mono text-teal-400">${this.escapeHtml(t.category)}</span>
            <h4 class="text-white font-bold text-sm">${this.formatTermHTML(t.term)}</h4>
            <p class="text-slate-400 text-xs truncate max-w-md">${this.escapeHtml(t.real)}</p>
          </div>
          <kbd class="text-[10px] font-mono text-slate-500 px-2 py-1 bg-navy-900 border border-slate-700 rounded shrink-0">Select</kbd>
        </div>`).join('');

      this.dom.cmdResults.querySelectorAll('[data-index]').forEach((el) => {
        el.addEventListener('click', () => this.selectCmdTerm(this.cmdMatches[Number(el.dataset.index)]));
        el.addEventListener('mouseenter', () => { this.cmdHighlightIndex = Number(el.dataset.index); this.updateCmdHighlight(); });
      });
      this.updateCmdHighlight();
    }

    updateCmdHighlight() {
      this.dom.cmdResults.querySelectorAll('[data-index]').forEach((el) => {
        const active = Number(el.dataset.index) === this.cmdHighlightIndex;
        el.setAttribute('aria-selected', String(active));
        el.classList.toggle('bg-navy-950', active);
        el.classList.toggle('border-teal-400/30', active);
        el.classList.toggle('border-transparent', !active);
      });
      if (this.cmdHighlightIndex >= 0) {
        this.dom.cmdInput.setAttribute('aria-activedescendant', `cmd-opt-${this.cmdHighlightIndex}`);
      } else {
        this.dom.cmdInput.removeAttribute('aria-activedescendant');
      }
    }

    handleCmdKeydown(e) {
      if (!this.cmdMatches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.cmdHighlightIndex = (this.cmdHighlightIndex + 1) % this.cmdMatches.length;
        this.updateCmdHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.cmdHighlightIndex = (this.cmdHighlightIndex - 1 + this.cmdMatches.length) % this.cmdMatches.length;
        this.updateCmdHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.cmdHighlightIndex >= 0) this.selectCmdTerm(this.cmdMatches[this.cmdHighlightIndex]);
      }
    }

    selectCmdTerm(t) {
      this.closeCmdModal();
      this.jumpToTerm(t);
    }

    // ---------- Submit-a-term modal ----------
    openSubmitModal() {
      this.lastFocusedEl = document.activeElement;
      this.dom.submitModal.classList.remove('hidden');
      const focusable = this.dom.submitModal.querySelectorAll('button, input, select, textarea, [href]');
      if (focusable.length) focusable[0].focus();
    }

    closeSubmitModal() {
      this.dom.submitModal.classList.add('hidden');
      if (this.lastFocusedEl) this.lastFocusedEl.focus();
    }

    trapFocus(e, modal) {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(modal.querySelectorAll('button, input, select, textarea, [href]'));
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

    async handleFormSubmit() {
      const form = this.dom.submitForm;
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      try {
        const res = await fetch(FORMSPREE_ENDPOINT, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          this.showToast('🎉 Thanks — we read every submission.');
          this.fireConfetti({ particleCount: 80, spread: 80, origin: { y: 0.6 } });
          this.closeSubmitModal();
          form.reset();
        } else {
          const data = await res.json().catch(() => null);
          const msg = data && Array.isArray(data.errors) && data.errors.length
            ? data.errors.map((err) => err.message).join(', ')
            : 'Something went wrong — try again in a bit.';
          this.showToast(msg, true);
        }
      } catch (err) {
        this.showToast('Network error — check your connection and try again.', true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    // ---------- Toast ----------
    showToast(message, isError = false) {
      const toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.className = `px-4 py-3 rounded-full text-sm font-bold shadow-xl backdrop-blur-md transition-all transform translate-y-4 opacity-0 pointer-events-auto flex items-center gap-2 ${isError ? 'bg-pink-500 text-navy-950' : 'bg-teal-400 text-navy-950'}`;
      toast.textContent = message;
      this.dom.toastContainer.appendChild(toast);

      requestAnimationFrame(() => toast.classList.remove('translate-y-4', 'opacity-0'));
      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        setTimeout(() => toast.remove(), 300);
      }, isError ? 4200 : 2600);
    }

    fireConfetti(opts) {
      if (this.prefersReducedMotion() || typeof confetti !== 'function') return;
      confetti(opts);
    }
  }

  function catLabelFor(catId) {
    const found = CATEGORIES.find((c) => c.id === catId);
    return found ? found.label : catId;
  }

  // Registered independently of the (async) data load below — the `load` event may well
  // have already fired by the time terms.json resolves and the app constructs, and an
  // addEventListener('load', ...) attached after that point would never fire.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
  registerServiceWorker();

  // Also independent of the data load — nothing here depends on the term list.
  function initInstallPrompt() {
    const INSTALL_DISMISS_KEY = 'rxplained:install-dismissed';
    const banner = document.getElementById('install-banner');
    const text = document.getElementById('install-banner-text');
    const actionBtn = document.getElementById('install-banner-action');
    const dismissBtn = document.getElementById('install-banner-dismiss');
    const backToTop = document.getElementById('back-to-top');
    const toastContainer = document.getElementById('toast-container');

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return; // already installed — nothing to prompt

    let dismissed = false;
    try { dismissed = !!localStorage.getItem(INSTALL_DISMISS_KEY); } catch (err) { /* private-browsing quota — treat as not dismissed */ }
    if (dismissed) return;

    const showBanner = () => {
      banner.classList.remove('hidden');
      backToTop.classList.add('banner-visible');
      toastContainer.classList.add('banner-visible');
    };
    const hideBanner = () => {
      banner.classList.add('hidden');
      backToTop.classList.remove('banner-visible');
      toastContainer.classList.remove('banner-visible');
    };
    const dismiss = () => {
      try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch (err) { /* app still works without persistence */ }
      hideBanner();
    };
    dismissBtn.addEventListener('click', dismiss);

    // iOS never fires beforeinstallprompt and has no programmatic install trigger —
    // "Add to Home Screen" only exists in the share sheet. Show instructions instead
    // of a button that would do nothing.
    // iPadOS since iOS 13 reports as desktop Mac Safari in the UA string (no "iPad" in
    // it at all), so that alone isn't enough — platform === 'MacIntel' + touch points is
    // the standard follow-up check, but vendor narrows it to actually-Apple devices too
    // (some non-Apple environments report MacIntel without being one).
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && /apple/i.test(navigator.vendor || ''));
    if (isIOS) {
      text.textContent = 'Install RxPlained: tap Share, then "Add to Home Screen."';
      actionBtn.classList.add('hidden');
      showBanner();
      return;
    }

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showBanner();
    });

    actionBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      hideBanner();
    });

    window.addEventListener('appinstalled', () => {
      hideBanner();
      try { localStorage.setItem(INSTALL_DISMISS_KEY, '1'); } catch (err) { /* not critical */ }
    });
  }
  initInstallPrompt();

  fetch('data/terms.json')
    .then((res) => res.json())
    .then((terms) => { window.app = new RxPlainedApp(terms); })
    .catch((err) => {
      document.getElementById('terms-container').innerHTML = '<p class="text-center text-slate-300 py-16">Couldn\'t load the dictionary right now. Try refreshing.</p>';
      console.error('Failed to load terms.json', err);
    });
})();
