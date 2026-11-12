// Enzo Bonelli — Portfolio interactions (multi-page)
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --- Year in footer ---------------------------------------------------
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --- Live clock in San Antonio (Central Time) -------------------------
  const timeEl = $('#local-time');
  if (timeEl) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
    const tick = () => {
      const parts = formatter.formatToParts(new Date());
      const hh = parts.find(p => p.type === 'hour').value;
      const mm = parts.find(p => p.type === 'minute').value;
      const tz = parts.find(p => p.type === 'timeZoneName').value;
      timeEl.textContent = `${hh}:${mm} ${tz}`;
    };
    tick();
    setInterval(tick, 30000);
  }

  // --- Theme toggle (night default; contract shared with other modules) ---
  // <html data-theme="dark|light">, persisted in localStorage 'eb-theme',
  // and an 'eb-themechange' event on window with detail.theme.
  const root = document.documentElement;
  const themeBtn = $('#theme-toggle');
  const themeMeta = $('meta[name="theme-color"]');
  const syncThemeUI = (theme) => {
    if (themeMeta) themeMeta.setAttribute('content', theme === 'light' ? '#e8f3ff' : '#0a1630');
    if (!themeBtn) return;
    const next = theme === 'light' ? 'dark' : 'light';
    themeBtn.setAttribute('aria-label', `Switch to ${next} theme`);
    themeBtn.setAttribute('aria-pressed', String(theme === 'light'));
    themeBtn.title = `Switch to ${next} theme`;
  };
  const setTheme = (theme) => {
    root.dataset.theme = theme;
    try { localStorage.setItem('eb-theme', theme); } catch (e) { /* storage blocked */ }
    syncThemeUI(theme);
    window.dispatchEvent(new CustomEvent('eb-themechange', { detail: { theme } }));
  };
  if (root.dataset.theme !== 'light' && root.dataset.theme !== 'dark') root.dataset.theme = 'dark';
  syncThemeUI(root.dataset.theme);
  themeBtn?.addEventListener('click', () => {
    setTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
  });

  // --- Nav background on scroll -----------------------------------------
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 24) nav.classList.add('scrolled');
      else                     nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // --- Mobile menu toggle -----------------------------------------------
  const toggle = $('#nav-toggle');
  const links  = $('#nav-links');
  toggle?.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-links a').forEach(a =>
    a.addEventListener('click', () => {
      links?.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    })
  );

  // --- Reveal on scroll -------------------------------------------------
  const revealTargets = [
    ...$$('.section-header'),
    ...$$('.timeline-item'),
    ...$$('.edu-card'),
    ...$$('.cred-card'),
    ...$$('.contact-card'),
    ...$$('.stat'),
    ...$$('.pillar'),
    ...$$('.next-card'),
    ...$$('.thesis-spotlight'),
    ...$$('.now-card'),
    ...$$('.stack-row'),
    ...$$('.project-card'),
  ];
  revealTargets.forEach(el => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach(el => revealObserver.observe(el));

  // Safety net: if a reveal target is still hidden after 1.5s (e.g. printing,
  // screenshot tooling, or assistive tech), make it visible.
  window.setTimeout(() => {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }, 1500);

  // --- Stagger reveal within grids --------------------------------------
  const stagger = (selector, step = 60) => {
    $$(selector).forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i * step, 400)}ms`;
    });
  };
  stagger('.pillar', 70);
  stagger('.edu-card');
  stagger('.cred-card');
  stagger('.contact-card');
  stagger('.stat');
  stagger('.next-card', 70);
  stagger('.timeline-item', 80);
  stagger('.now-card', 80);
  stagger('.stack-row', 60);

  // --- Project architecture filter ----------------------------------------
  const chips = $$('.filter-chip');
  const cards = $$('.project-card');
  const groups = $$('.project-group');
  const empty = $('.project-empty');
  chips.forEach(chip =>
    chip.addEventListener('click', () => {
      const f = chip.dataset.filter;
      chips.forEach(c => {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      cards.forEach(card => {
        card.hidden = f !== 'all' && !card.dataset.kind.split(' ').includes(f);
      });
      groups.forEach(g => {
        g.hidden = !$$('.project-card', g).some(c => !c.hidden);
      });
      if (empty) empty.hidden = cards.some(c => !c.hidden);
    })
  );

  // --- Scroll-spy: highlight the nav link for the section in view ----------
  const navLinks = $$('.nav-links a[href^="#"]');
  const spyTargets = navLinks
    .map(a => document.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);
  const setActive = (id) => {
    navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  };
  if (spyTargets.length) {
    const onSpy = () => {
      const line = window.innerHeight * 0.3;
      let current = 'top';
      spyTargets.forEach(el => {
        if (el.id !== 'top' && el.getBoundingClientRect().top <= line) current = el.id;
      });
      setActive(current);
    };
    window.addEventListener('scroll', onSpy, { passive: true });
    onSpy();
  }
})();
