// fx.js — interface effects (pairs with fx.css)
//   1. cursor spotlight on cards   2. featured beam (CSS only, @property check)
//   3. heading decode on scroll     4. data packets on architecture arrows
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

  // --- 2. Beam fallback: without @property the angle can't interpolate ---
  if (!(window.CSS && typeof CSS.registerProperty === 'function')) {
    root.classList.add('fx-noprop');
  }

  // --- 1. Cursor spotlight ---------------------------------------------
  const CARD_SEL = [
    '.project-card', '.now-card', '.pillar', '.stat', '.edu-card',
    '.cred-card', '.contact-card', '.timeline-card', '.thesis-spotlight',
  ].join(',');

  let spotReady = false;
  const initSpotlight = () => {
    if (spotReady || !hoverMQ.matches) return;
    spotReady = true;
    document.querySelectorAll(CARD_SEL).forEach((el) => {
      el.classList.add('fx-spot');
      if (getComputedStyle(el).position === 'static') el.classList.add('fx-rel');
    });

    let target = null;
    let x = 0;
    let y = 0;
    let queued = false;
    const paint = () => {
      queued = false;
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${(x - r.left).toFixed(1)}px`);
      target.style.setProperty('--my', `${(y - r.top).toFixed(1)}px`);
    };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const card = e.target instanceof Element ? e.target.closest('.fx-spot') : null;
      if (!card) { target = null; return; }
      target = card;
      x = e.clientX;
      y = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
  };
  initSpotlight();
  hoverMQ.addEventListener?.('change', initSpotlight);

  // --- 4. Data packets on architecture arrows ---------------------------
  document.querySelectorAll('.arch .arch-arrow').forEach((arrow) => {
    if (arrow.querySelector(':scope > .fx-packet')) return;
    for (let i = 0; i < 2; i++) {
      const p = document.createElement('i');
      p.className = 'fx-packet';
      p.setAttribute('aria-hidden', 'true');
      arrow.appendChild(p);
    }
  });

  // --- 3. Heading decode ---------------------------------------------------
  const HEAD_SEL = '.section-title, .page-header-title, .project-group-title';
  const GLYPHS = '<>/\\#$%01*+=_{}[]';
  const DURATION = 780;   // ms for the left→right resolve sweep
  const LEAD = 140;       // ms of pure scramble before the first char resolves
  const TICK = 45;        // ms between glyph swaps
  const rand = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  const headings = Array.from(document.querySelectorAll(HEAD_SEL))
    .filter((h) => !h.closest('.hero') && !h.classList.contains('hero-title'));

  headings.forEach((h) => {
    const label = h.textContent.replace(/\s+/g, ' ').trim();
    if (label && !h.hasAttribute('aria-label')) h.setAttribute('aria-label', label);
  });

  const running = new WeakSet();

  const decode = (h) => {
    if (running.has(h) || reduceMQ.matches) return;
    running.add(h);

    // Wrap each text node (including those inside child spans) in place.
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);

    const chars = [];
    const wraps = [];
    texts.forEach((node) => {
      const wrap = document.createElement('span');
      wrap.className = 'fx-dw';
      wrap.setAttribute('aria-hidden', 'true');
      for (const ch of node.nodeValue) {
        if (/\s/.test(ch)) { wrap.appendChild(document.createTextNode(ch)); continue; }
        const s = document.createElement('span');
        s.className = 'fx-ch is-scr';
        s.textContent = ch;
        s.dataset.g = rand();
        wrap.appendChild(s);
        chars.push(s);
      }
      node.replaceWith(wrap);
      wraps.push([wrap, node]);
    });

    const n = chars.length;
    const start = performance.now();
    let lastTick = 0;
    const done = () => {
      wraps.forEach(([wrap, node]) => wrap.replaceWith(node));
      running.delete(h);
    };
    const frame = (now) => {
      const t = now - start;
      const resolved = t < LEAD ? 0 : Math.min(n, Math.floor(((t - LEAD) / DURATION) * (n + 1)));
      const swap = now - lastTick >= TICK;
      if (swap) lastTick = now;
      for (let i = 0; i < n; i++) {
        const s = chars[i];
        if (i < resolved) {
          if (s.classList.contains('is-scr')) s.classList.remove('is-scr');
        } else if (swap) {
          s.dataset.g = rand();
        }
      }
      if (resolved >= n) { done(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  if ('IntersectionObserver' in window && headings.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) decode(e.target); });
    }, { threshold: 0.6 });
    headings.forEach((h) => io.observe(h));
  }
})();
