// Enzo Bonelli — hero: role typewriter + light pulses on the agent diagram
(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  if (!hero) return;

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches;
  const article = (s) => (/^[aeiou]/i.test(s) ? 'an' : 'a');

  // ---------------------------------------------------------------------
  // Role rotator — roles come from data-roles ("|" separated)
  // ---------------------------------------------------------------------
  const role = hero.querySelector('.hero-role');
  if (role) {
    const roles = (role.dataset.roles || '').split('|').map(s => s.trim()).filter(Boolean);
    const textEl = role.querySelector('.hero-role-text');
    const artEl  = role.querySelector('.hero-role-article');
    const ghost  = role.querySelector('.hero-role-ghost');
    const live   = role.querySelector('.hero-sr');

    if (roles.length && textEl && artEl) {
      // reserve space for the longest role so the line never jumps
      if (ghost) ghost.textContent = roles.reduce((a, b) => (b.length > a.length ? b : a));

      const show = (i) => {
        textEl.textContent = roles[i];
        artEl.textContent = article(roles[i]);
        if (live) live.textContent = `I'm ${article(roles[i])} ${roles[i]}`;
      };
      show(0);

      let idx = 0, pos = roles[0].length, deleting = true, timer = null;
      const TYPE = 62, DELETE = 32, HOLD = 2200, GAP = 380;

      const step = () => {
        timer = null;
        if (reduced()) { show(0); role.classList.remove('is-typing'); return; }
        const cur = roles[idx];
        if (deleting) {
          pos--;
          textEl.textContent = cur.slice(0, Math.max(pos, 0));
          role.classList.add('is-typing');
          if (pos <= 0) {
            deleting = false;
            idx = (idx + 1) % roles.length;
            artEl.textContent = article(roles[idx]);
            timer = setTimeout(step, GAP);
            return;
          }
          timer = setTimeout(step, DELETE);
        } else {
          pos++;
          textEl.textContent = cur.slice(0, pos);
          role.classList.add('is-typing');
          if (pos >= cur.length) {
            role.classList.remove('is-typing');
            if (live) live.textContent = `I'm ${article(cur)} ${cur}`;
            deleting = true;
            timer = setTimeout(step, HOLD);
            return;
          }
          timer = setTimeout(step, TYPE + Math.random() * 40);
        }
      };

      const start = () => {
        if (timer || reduced() || roles.length < 2) return;
        timer = setTimeout(step, HOLD + 600);
      };
      const stop = () => { clearTimeout(timer); timer = null; };

      mq.addEventListener?.('change', () => {
        stop();
        idx = 0; pos = roles[0].length; deleting = true;
        show(0);
        role.classList.remove('is-typing');
        start();
      });
      start();
    }
  }

  // ---------------------------------------------------------------------
  // Light pulses travelling core <-> nodes along the link paths
  // ---------------------------------------------------------------------
  const svg = hero.querySelector('svg.hx');
  const layer = svg && svg.querySelector('.hx-pulses');
  if (!svg || !layer) return;

  const NS = 'http://www.w3.org/2000/svg';
  // Each link path is sampled once into an evenly spaced (by arc length)
  // x/y table; frames interpolate from it instead of calling
  // getPointAtLength. Paths live in viewBox space, so resize and theme
  // changes don't alter them — the table is rebuilt only if a "d" changes.
  const SAMPLES = 128;
  const sample = (l) => {
    l.len = l.path.getTotalLength();
    for (let k = 0; k < SAMPLES; k++) {
      const pt = l.path.getPointAtLength(l.len * k / (SAMPLES - 1));
      l.pts[k * 2] = pt.x;
      l.pts[k * 2 + 1] = pt.y;
    }
  };
  const links = Array.from(svg.querySelectorAll('.hx-link')).map((path, i) => ({
    path,
    len: 0,
    pts: new Float32Array(SAMPLES * 2),
    node: svg.querySelectorAll('.hx-node')[i] || null,
    next: 1600 + i * 260 + Math.random() * 900, // first spawn after draw-in
  }));
  links.forEach(sample);
  if ('MutationObserver' in window) {
    links.forEach(l => new MutationObserver(() => sample(l)).observe(l.path, { attributes: true, attributeFilter: ['d'] }));
  }
  const pulses = [];
  let raf = 0, last = 0, clock = 0, visible = true;

  const spawn = (link) => {
    const back = Math.random() < 0.4; // node -> core (results flowing back)
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', back ? '2.6' : '3.2');
    c.setAttribute('class', back ? 'hx-pulse hx-pulse--back' : 'hx-pulse');
    layer.appendChild(c);
    pulses.push({ link, c, t: 0, back, dur: 1500 + Math.random() * 900 });
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 64) : 16;
    last = now;
    clock += dt;

    for (const l of links) {
      if (clock >= l.next) {
        spawn(l);
        l.next = clock + 1800 + Math.random() * 2600;
      }
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += dt / p.dur;
      if (p.t >= 1) {
        if (!p.back && p.link.node) {
          const n = p.link.node;
          n.classList.add('is-hot');
          setTimeout(() => n.classList.remove('is-hot'), 260);
        }
        p.c.remove();
        pulses.splice(i, 1);
        continue;
      }
      const e = p.t < 0.5 ? 2 * p.t * p.t : 1 - Math.pow(-2 * p.t + 2, 2) / 2; // easeInOut
      const f = (p.back ? 1 - e : e) * (SAMPLES - 1); // fractional table index
      const k = Math.min(f | 0, SAMPLES - 2), u = f - k, pts = p.link.pts;
      const x = pts[k * 2] + (pts[k * 2 + 2] - pts[k * 2]) * u;
      const y = pts[k * 2 + 1] + (pts[k * 2 + 3] - pts[k * 2 + 1]) * u;
      p.c.setAttribute('cx', x.toFixed(1));
      p.c.setAttribute('cy', y.toFixed(1));
      const fade = Math.min(1, p.t * 6, (1 - p.t) * 6);
      p.c.setAttribute('opacity', fade.toFixed(2));
    }
  };

  const clear = () => { pulses.splice(0).forEach(p => p.c.remove()); };
  const run = () => {
    if (raf || reduced() || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const halt = () => { cancelAnimationFrame(raf); raf = 0; };

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visible ? run() : halt();
    }).observe(svg);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
  mq.addEventListener?.('change', () => { if (reduced()) { halt(); clear(); } else run(); });
  run();
})();
