/* ============================================================
   enzobonelli.com homepage — scroll is the only required interaction.
   Drives: chapter indicator + progress line, the hero's one entrance,
   the career arc line, the experience toggle, and the four Systems
   cards. Each card mounts its architecture scene in overview mode
   (the finished system, no scroll playback). Scene files load lazily
   as the Systems chapter approaches; a missing or failing scene gets
   a static plate-row illustration instead.
   The theme toggle is owned by script.js (html[data-theme],
   sessionStorage 'eb-theme', window 'eb-themechange').
   ============================================================ */
(function () {
  'use strict';

  var doc = document.documentElement;
  doc.classList.add('sh-js');
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(mq && mq.matches);
  var V = '20261112d';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------- chapters + progress ---------- */
  var chapters = $$('.sh-ch');
  var links = $$('.sh-chapters a');
  var nowN = $('.sh-now-n'), nowName = $('.sh-now-name'), bar = $('.sh-progress span');
  var current = '';
  function driveChapters() {
    var line = window.innerHeight * 0.4, on = chapters[0];
    chapters.forEach(function (c) { if (c.getBoundingClientRect().top <= line) on = c; });
    var max = doc.scrollHeight - window.innerHeight;
    if (max > 0 && window.scrollY >= max - 4) on = chapters[chapters.length - 1];
    if (bar) bar.style.setProperty('--p', max > 0 ? clamp(window.scrollY / max, 0, 1).toFixed(4) : 0);
    if (!on || on.id === current) return;
    current = on.id;
    links.forEach(function (a) {
      var hit = a.getAttribute('data-ch') === current;
      a.classList.toggle('is-on', hit);
      if (hit) { a.setAttribute('aria-current', 'location'); if (nowName) nowName.textContent = a.textContent; }
      else a.removeAttribute('aria-current');
    });
    if (nowN) nowN.textContent = (chapters.indexOf(on) + 1) + ' of ' + chapters.length;
  }

  /* ---------- arc: line fills as the chapter scrolls past ---------- */
  var arcPath = $('.sh-arc-path');
  var stops = $$('.sh-stop');
  function driveArc() {
    if (!arcPath) return;
    var r = arcPath.getBoundingClientRect(), vh = window.innerHeight;
    var t = reduced ? (r.top < vh ? 1 : 0) : clamp((vh * 0.85 - r.top) / (vh * 0.55), 0, 1);
    arcPath.style.setProperty('--arc', t.toFixed(3));
    stops.forEach(function (s, k) { s.classList.toggle('is-lit', t > 0 && t >= k / (stops.length - 1) - 0.001); });
  }

  var queued = false;
  function tick() { queued = false; driveChapters(); driveArc(); }
  function request() { if (!queued) { queued = true; requestAnimationFrame(tick); } }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  if (mq) {
    var onMq = function () { reduced = mq.matches; request(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }
  tick();

  /* ---------- hero entrance (one orchestrated moment) ---------- */
  var hero = $('.sh-hero');
  requestAnimationFrame(function () { requestAnimationFrame(function () { if (hero) hero.classList.add('is-in'); }); });

  /* ---------- experience: one toggle for everything ---------- */
  var toggle = $('.sh-toggle'), roles = $('#sh-roles');
  if (toggle && roles) {
    toggle.addEventListener('click', function () {
      var open = !roles.classList.contains('is-open');
      roles.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Show less' : 'Show all details';
    });
  }

  /* ============================================================
     Systems cards
     ============================================================ */
  var ICONS = {
    phone: '<path d="M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
    stream: '<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 16c3-3 6 3 9 0s6 3 9 0"/>',
    wave: '<path d="M12 3v18M8 7v10M16 7v10M4 10v4M20 10v4"/>',
    agent: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
    speaker: '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 0 1 0 8"/>',
    doc: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/>',
    gear: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 10h8M8 14h5"/>',
    graph: '<circle cx="6" cy="7" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="17" r="2"/><path d="M8 7.5l8-1M7 9l4 6.5M17 8l-4 7"/>',
    agents: '<circle cx="7" cy="8" r="2.2"/><circle cx="17" cy="8" r="2.2"/><circle cx="12" cy="16" r="2.2"/><path d="M9 8h6M8 10l3 4M16 10l-3 4"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 9l3 3 6-5"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    api: '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6M14 4l-4 16"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 9z"/>',
    gate: '<path d="M4 20V8l8-4 8 4v12M9 20v-6h6v6"/>',
    lambda: '<path d="M6 4h3l9 16M12 11l-6 9"/>',
    model: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14h16M10 5v14"/>'
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The finished system as a static row of isometric plates.
  function buildFallback(slot) {
    var nodes = (slot.getAttribute('data-nodes') || '').split(';').map(function (s) { return s.split('|'); });
    var icons = (slot.getAttribute('data-icons') || '').split('|');
    var html = '<div class="sh-flow">';
    nodes.forEach(function (n, i) {
      html += '<div class="sh-flow-node"><span class="sh-tile"><span class="sh-tile-top"><svg viewBox="0 0 24 24">' +
        (ICONS[icons[i]] || ICONS.gear) + '</svg></span></span><span class="sh-flow-name">' + esc(n[0]) +
        '</span><span class="sh-flow-desc">' + esc(n[1] || '') + '</span></div>';
    });
    slot.innerHTML = html + '</div>';
    slot.setAttribute('data-mounted', 'fallback');
  }

  var SCENES = {
    voice: { file: 'voice-scene', globals: ['VoiceScene'] },
    graphrag: { file: 'graphrag-scene', globals: ['GraphragScene', 'IsoScene'] },
    public: { file: 'public-sector-scene', globals: ['PublicSectorScene'] },
    serverless: { file: 'serverless-scene', globals: ['ServerlessScene'] }
  };
  function findAPI(def) {
    for (var i = 0; i < def.globals.length; i++) {
      var g = window[def.globals[i]];
      if (g && typeof g.mount === 'function') return { api: g, name: def.globals[i] };
    }
    return null;
  }
  function loadCSS(href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    l.onerror = function () { l.remove(); };
    document.head.appendChild(l);
  }
  function loadJS(src) {
    return new Promise(function (resolve) {
      var done = false, s = document.createElement('script');
      function fin(ok) { if (!done) { done = true; resolve(ok); } }
      s.src = src; s.async = true;
      s.onload = function () { fin(true); };
      s.onerror = function () { s.remove(); fin(false); };
      document.body.appendChild(s);
      setTimeout(function () { fin(false); }, 8000);
    });
  }

  var cards = $$('.sh-card[data-scene]').map(function (el) {
    return { el: el, kind: el.getAttribute('data-scene'), slot: $('.sh-card-slot', el), scene: null };
  });

  function mountCard(card) {
    var def = SCENES[card.kind], hit = def && findAPI(def);
    if (hit) {
      try {
        card.slot.innerHTML = '';
        var s = hit.api.mount(card.slot, { reducedMotion: reduced, mode: 'overview' });
        if (!s || !card.slot.firstChild) throw new Error('empty scene');
        // Scenes from before overview mode have no `steps`: park them on the finished frame.
        if (typeof s.steps !== 'number' && typeof s.setStep === 'function') s.setStep(4, 1);
        card.scene = s;
        card.slot.setAttribute('data-mounted', hit.name);
        return;
      } catch (e) {
        if (card.scene && card.scene.destroy) { try { card.scene.destroy(); } catch (e2) {} }
        card.scene = null;
        if (window.console) console.warn('[home] ' + hit.name + ' failed in overview mode; showing the static diagram.', e);
      }
    }
    buildFallback(card.slot);
  }

  var started = false;
  function startScenes() {
    if (started) return;
    started = true;
    var kinds = cards.map(function (c) { return c.kind; });
    kinds.forEach(function (k) {
      var def = SCENES[k];
      if (!def || findAPI(def)) return;
      loadCSS('scenes/' + def.file + '.css?v=' + V);
    });
    Promise.all(kinds.map(function (k) {
      var def = SCENES[k];
      if (!def) return Promise.resolve(false);
      return findAPI(def) ? Promise.resolve(true) : loadJS('scenes/' + def.file + '.js?v=' + V);
    })).then(function () { cards.forEach(mountCard); });
  }

  // Static illustration first so the stage is never empty, then upgrade.
  cards.forEach(function (c) { buildFallback(c.slot); });
  var systems = $('#projects');
  if (systems && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); startScenes(); }
    }, { rootMargin: '900px 0px 900px 0px' });
    io.observe(systems);
  } else {
    startScenes();
  }
})();
