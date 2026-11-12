/* ============================================================
   FIREFLIES / STARFIELD — ambient background
   Two night skies, keyed off <html data-theme>:
   'dark'  — Firefly night: fireflies that blink on irregular cycles,
             link up with faint lines when lit, drift toward the
             cursor, scatter on click, and now and then race across
             the sky. A few faint stars twinkle behind them.
   'light' — Starfield: a slow constellation network (violet to cyan
             points joined by thin lines that reach toward the
             cursor) over a field of tiny twinkling stars, with a
             shooting star streaking across the upper sky every few
             seconds.
   Colours come from --accent / --accent-2. Themes crossfade, the loop
   pauses when the tab is hidden, and reduced motion gets one still
   frame. One canvas, one rAF loop, sprites pre-rendered, no per-frame
   allocations.
   ============================================================ */
(function () {
  'use strict';

  // ---------- Tunables: firefly night ----------
  var AREA_PER_FLY   = 26000;  // CSS px^2 of viewport per firefly
  var MIN_FLIES      = 15;
  var MAX_FLIES      = 60;
  var DPR_CAP        = 2;

  var SPEED          = 14;     // base wander speed, px/s
  var TURN_RATE      = 1.1;    // how quickly the heading wanders, rad/s
  var DAMPING        = 1.6;    // velocity relaxation toward the wander speed, 1/s

  var GLOW_MIN       = 0.6;    // flash length range, s
  var GLOW_MAX       = 1.6;
  var GAP_MIN        = 1.8;    // dark gap range between flashes, s
  var GAP_MAX        = 7.0;
  var EMBER          = 0.05;   // faint glow while "dark"

  var WAVE_EVERY_MIN = 9;      // seconds between synchronized flash waves
  var WAVE_EVERY_MAX = 18;
  var WAVE_RADIUS    = 340;    // px reached by a wave
  var WAVE_SPEED     = 260;    // px/s the wave travels

  var LINK_DIST      = 150;    // px, links between lit fireflies
  var LINK_ALPHA     = 0.22;
  var LIT_THRESHOLD  = 0.25;   // glow needed before a firefly links

  var CURSOR_DIST    = 190;    // px, lines reach toward the pointer
  var CURSOR_ALPHA   = 0.28;
  var CURSOR_PULL    = 26;     // attraction, px/s^2 at the edge of range
  var CURSOR_IDLE    = 1.6;    // s after last move before pull fades out
  var SCATTER_FORCE  = 140;    // px/s impulse on click
  var SCATTER_DIST   = 220;

  var STREAK_MIN     = 10;     // seconds between night streaks
  var STREAK_MAX     = 22;

  var STAR_COUNT     = 70;
  var STAR_ALPHA     = 0.35;

  var PARALLAX       = 0.06;   // fireflies drift this fraction of scroll, opposite
  var STAR_PARALLAX  = 0.02;
  var FADE_MS        = 600;    // theme crossfade

  // ---------- Tunables: starfield ----------
  var SF_AREA_PER_PT = 22000;  // CSS px^2 per constellation point
  var SF_MIN_PTS     = 40;
  var SF_MAX_PTS     = 70;
  var SF_MOBILE_PTS  = 28;     // cap below 640px wide
  var SF_SPEED_MIN   = 4;      // drift speed range, px/s
  var SF_SPEED_MAX   = 11;
  var SF_LINK_DIST   = 150;    // px, constellation links
  var SF_LINK_ALPHA  = 0.42;
  var SF_CURSOR_DIST = 180;    // px, lines toward the pointer
  var SF_CURSOR_ALPHA= 0.38;
  var SF_CURSOR_PULL = 14;     // gentler than fireflies
  var SF_PARALLAX    = 0.035;

  var SF_AREA_PER_STAR = 4200; // tiny background stars
  var SF_MAX_STARS   = 340;
  var SF_MOBILE_STARS= 140;
  var SF_STAR_ALPHA  = 0.55;
  var SF_GLINTS      = 7;      // brighter stars with a soft cross glint
  var SF_STAR_PARALLAX = 0.012;

  var METEOR_MIN     = 3;      // seconds between shooting stars
  var METEOR_MAX     = 8;
  var METEOR_DOUBLE  = 0.2;    // chance a second one follows quickly
  var METEOR_DUR_MIN = 0.6;    // flight time, s
  var METEOR_DUR_MAX = 1.2;
  var METEOR_TAIL_MIN= 170;    // px
  var METEOR_TAIL_MAX= 300;
  var METEOR_ALPHA   = 0.95;

  var FALLBACK = {
    dark:  { accent: '#c6f432', accent2: '#f5c542', bg: '#0a1630' },
    light: { accent: '#8b7bff', accent2: '#22d3ee', bg: '#0a0d14' }
  };

  // ---------- Setup ----------
  if (!document.body || !window.HTMLCanvasElement) return;

  var root = document.documentElement;
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(reduceMQ && reduceMQ.matches);

  var canvas = document.createElement('canvas');
  canvas.className = 'fireflies-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;display:block;';
  // Insert right after the decorative grid so we paint above it but
  // below every piece of body content (all of which follows later).
  var grid = document.querySelector('.bg-grid') || document.querySelector('.bg-gradient');
  if (grid && grid.parentNode === document.body) {
    document.body.insertBefore(canvas, grid.nextSibling);
  } else {
    document.body.insertBefore(canvas, document.body.firstChild);
  }
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = 0, H = 0, dpr = 1;

  // ---------- Colours ----------
  function parseColor(str, fallback) {
    str = (str || '').trim() || fallback;
    var m;
    if (str.charAt(0) === '#') {
      var h = str.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h.slice(0, 6), 16);
      if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else if ((m = str.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/))) {
      return [+m[1], +m[2], +m[3]];
    }
    return str === fallback ? [200, 200, 200] : parseColor(fallback, fallback);
  }

  function rgba(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }

  function mixColor(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function isLight() {
    return root.dataset.theme === 'light';
  }

  // Current palette, sprites and line colours for each mode. Only the
  // active mode's colours are read from CSS (the other keeps its last
  // known values) since the variables only reflect the current theme.
  var pal = {
    dark:  { accent: parseColor('', FALLBACK.dark.accent),  accent2: parseColor('', FALLBACK.dark.accent2) },
    light: { accent: parseColor('', FALLBACK.light.accent), accent2: parseColor('', FALLBACK.light.accent2) }
  };
  var sprites = { dark: [null, null] };
  var lineColor = { dark: '' };

  // Starfield sprites / colours (violet -> cyan ramp).
  var SF_SHADES = 12;
  var sfPoint = new Array(SF_SHADES);     // glow dot per shade
  var sfLine = new Array(SF_SHADES);      // line colour string per shade
  var sfCursorLine = '';
  var sfStarColor = ['#ffffff', '#ffffff'];
  var sfGlint = null, meteorTail = null, meteorHead = null;

  function readPalette() {
    var mode = isLight() ? 'light' : 'dark';
    var cs = getComputedStyle(root);
    pal[mode].accent  = parseColor(cs.getPropertyValue('--accent'),   FALLBACK[mode].accent);
    pal[mode].accent2 = parseColor(cs.getPropertyValue('--accent-2'), FALLBACK[mode].accent2);
    buildSprites();
  }

  // Pre-render glow sprites to offscreen canvases so each frame is just drawImage.
  var SPRITE = 64; // CSS px

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil((h || w) * dpr);
    return c;
  }

  function nightSprite(core, tint) {
    var c = makeCanvas(SPRITE), g = c.getContext('2d');
    var r = c.width / 2;
    var warm = mixColor(core, [255, 255, 235], 0.75);
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0,    rgba(warm, 1));
    grd.addColorStop(0.06, rgba(warm, 0.95));
    grd.addColorStop(0.12, rgba(core, 0.75));
    grd.addColorStop(0.28, rgba(core, 0.28));
    grd.addColorStop(0.55, rgba(tint, 0.09));
    grd.addColorStop(1,    rgba(tint, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  var SF_POINT_SPRITE = 20; // CSS px

  function pointSprite(col) {
    var c = makeCanvas(SF_POINT_SPRITE), g = c.getContext('2d');
    var r = c.width / 2;
    var hot = mixColor(col, [255, 255, 255], 0.6);
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0,    rgba(hot, 1));
    grd.addColorStop(0.1,  rgba(hot, 0.95));
    grd.addColorStop(0.2,  rgba(col, 0.55));
    grd.addColorStop(0.45, rgba(col, 0.14));
    grd.addColorStop(1,    rgba(col, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function buildSprites() {
    var d = pal.dark, l = pal.light;
    sprites.dark[0]  = nightSprite(d.accent, d.accent2);
    sprites.dark[1]  = nightSprite(mixColor(d.accent, d.accent2, 0.55), d.accent2);
    lineColor.dark  = rgba(d.accent, 1);

    // ---- starfield ----
    var violet = l.accent, cyan = l.accent2, white = [255, 255, 255];
    for (var i = 0; i < SF_SHADES; i++) {
      var t = i / (SF_SHADES - 1);
      var col = mixColor(violet, cyan, t);
      sfPoint[i] = pointSprite(col);
      sfLine[i] = rgba(mixColor(col, white, 0.15), 1);
    }
    sfCursorLine = rgba(mixColor(cyan, white, 0.25), 1);
    sfStarColor[0] = rgba(mixColor(white, cyan, 0.12), 1);
    sfStarColor[1] = rgba(mixColor(white, violet, 0.3), 1);

    // Bright star with a soft four-point glint.
    var GS = 28, gc = makeCanvas(GS), g = gc.getContext('2d'), k = gc.width / GS;
    g.scale(k, k);
    var cr = g.createRadialGradient(GS / 2, GS / 2, 0, GS / 2, GS / 2, GS / 2);
    cr.addColorStop(0,    'rgba(255,255,255,1)');
    cr.addColorStop(0.08, 'rgba(255,255,255,0.9)');
    cr.addColorStop(0.2,  rgba(mixColor(white, violet, 0.4), 0.3));
    cr.addColorStop(1,    rgba(violet, 0));
    g.fillStyle = cr;
    g.fillRect(0, 0, GS, GS);
    var hz = g.createLinearGradient(0, 0, GS, 0);
    hz.addColorStop(0,   'rgba(255,255,255,0)');
    hz.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    hz.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = hz;
    g.fillRect(0, GS / 2 - 0.4, GS, 0.8);
    var vt = g.createLinearGradient(0, 0, 0, GS);
    vt.addColorStop(0,   'rgba(255,255,255,0)');
    vt.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    vt.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = vt;
    g.fillRect(GS / 2 - 0.4, 0, 0.8, GS);
    sfGlint = gc;

    // Meteor tail: a long tapered wedge, transparent violet at the far
    // end brightening to white-cyan at the head (right edge).
    var TW = METEOR_TAIL_W, TH = METEOR_TAIL_H;
    var tc = makeCanvas(TW, TH), tg = tc.getContext('2d'), tk = tc.width / TW;
    tg.scale(tk, tk);
    var lg = tg.createLinearGradient(0, 0, TW, 0);
    lg.addColorStop(0,    rgba(violet, 0));
    lg.addColorStop(0.45, rgba(violet, 0.22));
    lg.addColorStop(0.8,  rgba(mixColor(violet, cyan, 0.6), 0.6));
    lg.addColorStop(0.96, rgba(mixColor(cyan, white, 0.6), 0.95));
    lg.addColorStop(1,    'rgba(255,255,255,1)');
    tg.fillStyle = lg;
    tg.shadowColor = rgba(mixColor(violet, cyan, 0.5), 0.8);
    tg.shadowBlur = 5 * tk;
    tg.beginPath();
    tg.moveTo(0, TH / 2);
    tg.lineTo(TW, TH / 2 - 1.3);
    tg.lineTo(TW, TH / 2 + 1.3);
    tg.closePath();
    tg.fill();
    tg.shadowBlur = 0;
    tg.fill();
    meteorTail = tc;

    var HS = 26, hc = makeCanvas(HS), hg = hc.getContext('2d'), hr = hc.width / 2;
    var hd = hg.createRadialGradient(hr, hr, 0, hr, hr, hr);
    hd.addColorStop(0,    'rgba(255,255,255,1)');
    hd.addColorStop(0.12, 'rgba(255,255,255,0.95)');
    hd.addColorStop(0.28, rgba(mixColor(cyan, white, 0.4), 0.5));
    hd.addColorStop(0.6,  rgba(cyan, 0.12));
    hd.addColorStop(1,    rgba(cyan, 0));
    hg.fillStyle = hd;
    hg.fillRect(0, 0, hc.width, hc.height);
    meteorHead = hc;
  }
  var METEOR_TAIL_W = 320, METEOR_TAIL_H = 14; // sprite size, CSS px

  // ---------- State: fireflies ----------
  // Fireflies live in flat typed arrays so the hot loop allocates nothing.
  var N = 0;
  var px = new Float32Array(MAX_FLIES), py = new Float32Array(MAX_FLIES);
  var vx = new Float32Array(MAX_FLIES), vy = new Float32Array(MAX_FLIES);
  var heading = new Float32Array(MAX_FLIES);
  var ph1 = new Float32Array(MAX_FLIES), ph2 = new Float32Array(MAX_FLIES);
  var size = new Float32Array(MAX_FLIES);
  var tint = new Uint8Array(MAX_FLIES);
  var glowStart = new Float32Array(MAX_FLIES);  // time the current flash began
  var glowLen = new Float32Array(MAX_FLIES);    // length of current flash
  var nextFlash = new Float32Array(MAX_FLIES);  // time of next flash
  var waveAt = new Float32Array(MAX_FLIES);     // pending wave-triggered flash (-1 = none)
  var glow = new Float32Array(MAX_FLIES);       // current glow 0..1 (computed each frame)

  var stars = new Float32Array(STAR_COUNT * 4); // x, y, size, phase

  // Spatial grid for neighbour checks (cell = LINK_DIST).
  var cellHead = new Int32Array(1), cellNext = new Int32Array(MAX_FLIES);
  var cols = 1, rows = 1;

  var streak = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, next: 0 };
  var wave = { next: 0 };

  // ---------- State: starfield ----------
  var SN = 0;
  var sx = new Float32Array(SF_MAX_PTS), sy = new Float32Array(SF_MAX_PTS);
  var svx = new Float32Array(SF_MAX_PTS), svy = new Float32Array(SF_MAX_PTS);   // current velocity
  var sbx = new Float32Array(SF_MAX_PTS), sby = new Float32Array(SF_MAX_PTS);   // base drift
  var sshade = new Uint8Array(SF_MAX_PTS);     // index into the violet->cyan ramp
  var ssize = new Float32Array(SF_MAX_PTS);
  var sph = new Float32Array(SF_MAX_PTS);

  var TN = 0;  // tiny stars: x, y, size, phase, speed, colour
  var tstars = new Float32Array(SF_MAX_STARS * 6);
  var glints = new Float32Array(SF_GLINTS * 5); // x, y, size, phase, speed

  var METEORS = 2;
  var met = [];
  for (var mi = 0; mi < METEORS; mi++) {
    met.push({ on: false, x: 0, y: 0, cx: 0, cy: 0, sp: 0, life: 0, max: 0, len: 0 });
  }
  var meteorNext = 0;

  var pointer = { x: -9999, y: -9999, lastMove: -99, inside: false };
  var time = 0;              // seconds of animation time
  var mix = isLight() ? 1 : 0;  // 0 = firefly night, 1 = starfield
  var mixTarget = mix;
  var lastScroll = window.scrollY || 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var want = Math.round(Math.max(MIN_FLIES, Math.min(MAX_FLIES, (W * H) / AREA_PER_FLY)));
    if (W < 640) want = Math.min(want, 25);
    for (var i = N; i < want; i++) spawn(i, true);
    N = want;

    for (var s = 0; s < STAR_COUNT; s++) {
      stars[s * 4]     = Math.random() * W;
      stars[s * 4 + 1] = Math.random() * H;
      stars[s * 4 + 2] = Math.random() < 0.15 ? 1.6 : 1;
      stars[s * 4 + 3] = Math.random() * Math.PI * 2;
    }

    cols = Math.max(1, Math.ceil(W / LINK_DIST));
    rows = Math.max(1, Math.ceil(H / LINK_DIST));
    if (cellHead.length < cols * rows) cellHead = new Int32Array(cols * rows);

    // starfield
    var sw = Math.round(Math.max(SF_MIN_PTS, Math.min(SF_MAX_PTS, (W * H) / SF_AREA_PER_PT)));
    if (W < 640) sw = Math.min(sw, SF_MOBILE_PTS);
    for (var p = 0; p < sw; p++) {
      if (p >= SN || sx[p] > W + 30 || sy[p] > H + 30) spawnPoint(p);
    }
    SN = sw;

    var tw = Math.round(Math.min(SF_MAX_STARS, (W * H) / SF_AREA_PER_STAR));
    if (W < 640) tw = Math.min(tw, SF_MOBILE_STARS);
    TN = tw;
    for (var q = 0; q < TN; q++) {
      var o = q * 6;
      tstars[o]     = Math.random() * W;
      tstars[o + 1] = Math.random() * H;
      var r = Math.random();
      tstars[o + 2] = r < 0.6 ? 0.7 : r < 0.92 ? 1.1 : 1.6;
      tstars[o + 3] = Math.random() * Math.PI * 2;
      tstars[o + 4] = rand(0.25, 1.3);
      tstars[o + 5] = Math.random() < 0.3 ? 1 : 0;
    }
    for (var gI = 0; gI < SF_GLINTS; gI++) {
      var go = gI * 5;
      glints[go]     = Math.random() * W;
      glints[go + 1] = Math.random() * H * 0.85;
      glints[go + 2] = rand(14, 24);
      glints[go + 3] = Math.random() * Math.PI * 2;
      glints[go + 4] = rand(0.3, 0.8);
    }

    buildSprites();
  }

  function spawn(i, anywhere) {
    px[i] = Math.random() * W;
    py[i] = anywhere ? Math.random() * H : H + 20;
    heading[i] = Math.random() * Math.PI * 2;
    vx[i] = Math.cos(heading[i]) * SPEED;
    vy[i] = Math.sin(heading[i]) * SPEED;
    ph1[i] = Math.random() * 100;
    ph2[i] = Math.random() * 100;
    size[i] = rand(20, 34);
    tint[i] = Math.random() < 0.3 ? 1 : 0;
    glowStart[i] = -99;
    glowLen[i] = 1;
    nextFlash[i] = time + rand(0, GAP_MAX);
    waveAt[i] = -1;
  }

  function spawnPoint(i) {
    sx[i] = Math.random() * W;
    sy[i] = Math.random() * H;
    var a = Math.random() * Math.PI * 2, s = rand(SF_SPEED_MIN, SF_SPEED_MAX);
    sbx[i] = svx[i] = Math.cos(a) * s;
    sby[i] = svy[i] = Math.sin(a) * s;
    sshade[i] = (Math.random() * SF_SHADES) | 0;
    ssize[i] = Math.random() < 0.2 ? rand(15, 20) : rand(10, 14);
    sph[i] = Math.random() * Math.PI * 2;
  }

  // ---------- Glow cycle ----------
  // Rise quickly, hold a moment, fade slowly — like a real firefly.
  function flashCurve(t) {
    if (t <= 0 || t >= 1) return 0;
    if (t < 0.3) { var a = t / 0.3; return a * a * (3 - 2 * a); }
    var b = (t - 0.3) / 0.7;
    return 1 - b * b * (3 - 2 * b);
  }

  function startFlash(i) {
    glowStart[i] = time;
    glowLen[i] = rand(GLOW_MIN, GLOW_MAX);
    nextFlash[i] = time + glowLen[i] + rand(GAP_MIN, GAP_MAX);
  }

  function startWave() {
    var o = (Math.random() * N) | 0;
    var r2 = WAVE_RADIUS * WAVE_RADIUS;
    for (var i = 0; i < N; i++) {
      var dx = px[i] - px[o], dy = py[i] - py[o];
      var d2 = dx * dx + dy * dy;
      if (d2 < r2) waveAt[i] = time + Math.sqrt(d2) / WAVE_SPEED;
    }
  }

  // Launch a shooting star from the top edge / upper right, heading
  // 20-40 degrees below horizontal (mostly toward the lower left).
  function launchMeteor() {
    var m = null;
    for (var i = 0; i < METEORS; i++) if (!met[i].on) { m = met[i]; break; }
    if (!m) return;
    var ang = rand(20, 40) * Math.PI / 180;
    var leftward = Math.random() < 0.8;
    if (Math.random() < 0.6) {           // from just above the top edge
      m.x = leftward ? rand(W * 0.35, W * 1.0) : rand(0, W * 0.6);
      m.y = rand(-20, H * 0.08);
    } else {                             // from the upper side edge
      m.x = leftward ? W + rand(0, 20) : -rand(0, 20);
      m.y = rand(0, H * 0.3);
    }
    m.cx = Math.cos(ang) * (leftward ? -1 : 1);
    m.cy = Math.sin(ang);
    m.max = rand(METEOR_DUR_MIN, METEOR_DUR_MAX);
    // cover roughly 45-75% of the diagonal during the flight
    m.sp = Math.sqrt(W * W + H * H) * rand(0.45, 0.75) / m.max;
    m.len = rand(METEOR_TAIL_MIN, METEOR_TAIL_MAX) * (W < 640 ? 0.65 : 1);
    m.life = 0;
    m.on = true;
  }

  // ---------- Simulation ----------
  function update(dt) {
    // theme crossfade
    if (mix !== mixTarget) {
      var step = dt * 1000 / FADE_MS;
      mix = mix < mixTarget ? Math.min(mixTarget, mix + step) : Math.max(mixTarget, mix - step);
    }

    var pull = pointer.inside ? Math.max(0, 1 - (time - pointer.lastMove) / CURSOR_IDLE) : 0;
    var i, dx, dy, d2, d, f;

    // ---- fireflies (kept simulating so a crossfade back looks natural) ----
    if (mix < 1) {
      var cr2 = CURSOR_DIST * CURSOR_DIST * 1.6;
      var relax = Math.min(1, DAMPING * dt);

      if (time > wave.next) {
        if (mix < 0.5 && N > 3) startWave();
        wave.next = time + rand(WAVE_EVERY_MIN, WAVE_EVERY_MAX);
      }

      for (i = 0; i < N; i++) {
        // smooth wandering: heading follows two slow sine "noises"
        heading[i] += (Math.sin(time * 0.37 + ph1[i]) + Math.sin(time * 0.71 + ph2[i]) * 0.6) * TURN_RATE * dt;
        var tx = Math.cos(heading[i]) * SPEED;
        var ty = Math.sin(heading[i]) * SPEED - 2;  // tiny upward bias
        vx[i] += (tx - vx[i]) * relax;
        vy[i] += (ty - vy[i]) * relax;

        // gentle attraction toward a moving cursor (stronger with distance, capped by range)
        if (pull > 0) {
          dx = pointer.x - px[i]; dy = pointer.y - py[i];
          d2 = dx * dx + dy * dy;
          if (d2 < cr2 && d2 > 400) {
            d = Math.sqrt(d2);
            f = CURSOR_PULL * pull * (1 - d / Math.sqrt(cr2)) * dt * 3;
            vx[i] += dx / d * f;
            vy[i] += dy / d * f;
          }
        }

        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;

        // wrap softly around the edges
        if (px[i] < -40) px[i] += W + 80; else if (px[i] > W + 40) px[i] -= W + 80;
        if (py[i] < -40) py[i] += H + 80; else if (py[i] > H + 40) py[i] -= H + 80;

        // blink cycle
        if (waveAt[i] >= 0 && time >= waveAt[i]) {
          waveAt[i] = -1;
          if (time - glowStart[i] > glowLen[i]) startFlash(i);
        }
        if (time >= nextFlash[i]) startFlash(i);
        glow[i] = Math.max(EMBER, flashCurve((time - glowStart[i]) / glowLen[i]));
      }

      // night streak: one firefly-like spark racing across part of the sky
      if (streak.on) {
        streak.x += streak.vx * dt;
        streak.y += streak.vy * dt;
        streak.life += dt;
        if (streak.life > streak.max) streak.on = false;
      } else if (time > streak.next) {
        if (mix < 0.5) {
          streak.on = true;
          streak.x = rand(W * 0.1, W * 0.8);
          streak.y = rand(H * 0.05, H * 0.45);
          var ang = rand(0.15, 0.6) * (Math.random() < 0.5 ? 1 : -1);
          var sp = rand(550, 850);
          streak.vx = Math.cos(ang) * sp * (ang > 0 ? 1 : -1);
          streak.vy = Math.abs(Math.sin(ang)) * sp;
          streak.life = 0;
          streak.max = rand(0.5, 0.9);
        }
        streak.next = time + rand(STREAK_MIN, STREAK_MAX);
      }
    }

    // ---- starfield ----
    if (mix > 0) {
      var sr = SF_CURSOR_DIST * 1.3, sr2 = sr * sr;
      var srelax = Math.min(1, 0.8 * dt);
      for (i = 0; i < SN; i++) {
        svx[i] += (sbx[i] - svx[i]) * srelax;
        svy[i] += (sby[i] - svy[i]) * srelax;
        if (pull > 0) {
          dx = pointer.x - sx[i]; dy = pointer.y - sy[i];
          d2 = dx * dx + dy * dy;
          if (d2 < sr2 && d2 > 900) {
            d = Math.sqrt(d2);
            f = SF_CURSOR_PULL * pull * (1 - d / sr) * dt * 3;
            svx[i] += dx / d * f;
            svy[i] += dy / d * f;
          }
        }
        sx[i] += svx[i] * dt;
        sy[i] += svy[i] * dt;
        if (sx[i] < -30) sx[i] += W + 60; else if (sx[i] > W + 30) sx[i] -= W + 60;
        if (sy[i] < -30) sy[i] += H + 60; else if (sy[i] > H + 30) sy[i] -= H + 60;
      }

      for (i = 0; i < METEORS; i++) {
        var m = met[i];
        if (!m.on) continue;
        m.life += dt;
        m.x += m.cx * m.sp * dt;
        m.y += m.cy * m.sp * dt;
        if (m.life >= m.max) m.on = false;
      }
      if (time > meteorNext) {
        if (mix > 0.5) launchMeteor();
        meteorNext = time + (Math.random() < METEOR_DOUBLE ? rand(0.25, 0.7) : rand(METEOR_MIN, METEOR_MAX));
      }
    }
  }

  // ---------- Drawing: firefly night ----------
  function drawFlies(spr, alpha) {
    for (var i = 0; i < N; i++) {
      var a = alpha * glow[i];
      if (a < 0.01) continue;
      var s = size[i] * (0.75 + glow[i] * 0.5);
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(spr[tint[i]], px[i] - s, py[i] - s, s * 2, s * 2);
    }
  }

  function drawLinks(color, alpha) {
    // bucket fireflies into the spatial grid
    var n = cols * rows, i, j;
    for (i = 0; i < n; i++) cellHead[i] = -1;
    for (i = 0; i < N; i++) {
      if (glow[i] < LIT_THRESHOLD) continue;
      var cx = Math.min(cols - 1, Math.max(0, (px[i] / LINK_DIST) | 0));
      var cy = Math.min(rows - 1, Math.max(0, (py[i] / LINK_DIST) | 0));
      var c = cy * cols + cx;
      cellNext[i] = cellHead[c];
      cellHead[c] = i;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.7;
    var ld2 = LINK_DIST * LINK_DIST;
    for (i = 0; i < N; i++) {
      var gi = glow[i];
      if (gi < LIT_THRESHOLD) continue;
      var cxi = Math.min(cols - 1, Math.max(0, (px[i] / LINK_DIST) | 0));
      var cyi = Math.min(rows - 1, Math.max(0, (py[i] / LINK_DIST) | 0));
      // check this cell and the forward neighbours only, so each pair is seen once
      for (var k = 0; k < 5; k++) {
        var ox = k === 0 ? 0 : k === 1 ? 1 : k - 3;  // (0,0) (1,0) (-1,1) (0,1) (1,1)
        var oy = k < 2 ? 0 : 1;
        var nx = cxi + ox, ny = cyi + oy;
        if (nx < 0 || nx >= cols || ny >= rows) continue;
        for (j = cellHead[ny * cols + nx]; j !== -1; j = cellNext[j]) {
          if (k === 0 && j <= i) continue;
          var dx = px[j] - px[i], dy = py[j] - py[i];
          var d2 = dx * dx + dy * dy;
          if (d2 > ld2) continue;
          var gj = glow[j];
          var a = alpha * LINK_ALPHA * (gi < gj ? gi : gj) * (1 - d2 / ld2);
          if (a < 0.008) continue;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.moveTo(px[i], py[i]);
          ctx.lineTo(px[j], py[j]);
          ctx.stroke();
        }
      }
    }

    // lines reaching toward the cursor
    if (pointer.inside) {
      var cd2 = CURSOR_DIST * CURSOR_DIST;
      for (i = 0; i < N; i++) {
        var ddx = pointer.x - px[i], ddy = pointer.y - py[i];
        var dd2 = ddx * ddx + ddy * ddy;
        if (dd2 > cd2) continue;
        var ca = alpha * CURSOR_ALPHA * (1 - dd2 / cd2) * (0.35 + glow[i] * 0.65);
        if (ca < 0.008) continue;
        ctx.globalAlpha = ca;
        ctx.beginPath();
        ctx.moveTo(px[i], py[i]);
        // reach most of the way, not quite touching the pointer
        ctx.lineTo(px[i] + ddx * 0.85, py[i] + ddy * 0.85);
        ctx.stroke();
      }
    }
  }

  function drawStars(alpha) {
    ctx.fillStyle = '#ffffff';
    for (var s = 0; s < STAR_COUNT; s++) {
      var o = s * 4;
      var a = alpha * STAR_ALPHA * (0.45 + 0.55 * Math.sin(time * 0.8 + stars[o + 3]) * Math.sin(time * 0.31 + stars[o + 3] * 2));
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      var z = stars[o + 2];
      ctx.fillRect(stars[o], stars[o + 1], z, z);
    }
  }

  function drawStreak(alpha) {
    if (!streak.on) return;
    var t = streak.life / streak.max;
    var fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    var spr = sprites.dark[1];
    // a tail of shrinking sprites behind the head
    for (var k = 0; k < 10; k++) {
      var back = k * 0.012;
      var s = 9 * (1 - k / 11);
      ctx.globalAlpha = alpha * fade * (1 - k / 10) * 0.9;
      ctx.drawImage(spr, streak.x - streak.vx * back - s, streak.y - streak.vy * back - s, s * 2, s * 2);
    }
  }

  // ---------- Drawing: starfield ----------
  function drawSkyStars(alpha) {
    var c, o, s, a;
    for (c = 0; c < 2; c++) {
      ctx.fillStyle = sfStarColor[c];
      for (s = 0; s < TN; s++) {
        o = s * 6;
        if (tstars[o + 5] !== c) continue;
        // independent slow twinkle per star
        a = 0.5 + 0.5 * Math.sin(time * tstars[o + 4] + tstars[o + 3]);
        a = alpha * SF_STAR_ALPHA * (0.15 + 0.85 * a * a) * (tstars[o + 2] > 1.5 ? 1 : tstars[o + 2] > 1 ? 0.8 : 0.6);
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        var z = tstars[o + 2];
        ctx.fillRect(tstars[o], tstars[o + 1], z, z);
      }
    }
  }

  function drawGlints(alpha) {
    for (var g = 0; g < SF_GLINTS; g++) {
      var o = g * 5;
      var tw = 0.5 + 0.5 * Math.sin(time * glints[o + 4] + glints[o + 3]);
      var a = alpha * (0.25 + 0.6 * tw);
      if (a < 0.02) continue;
      var s = glints[o + 2] * (0.8 + 0.25 * tw);
      ctx.globalAlpha = a;
      ctx.drawImage(sfGlint, glints[o] - s / 2, glints[o + 1] - s / 2, s, s);
    }
  }

  function drawConstellation(alpha) {
    var i, j, dx, dy, d2, a;
    var ld2 = SF_LINK_DIST * SF_LINK_DIST;
    ctx.lineWidth = 0.7;
    for (i = 0; i < SN; i++) {
      for (j = i + 1; j < SN; j++) {
        dx = sx[j] - sx[i]; dy = sy[j] - sy[i];
        d2 = dx * dx + dy * dy;
        if (d2 > ld2) continue;
        a = 1 - Math.sqrt(d2) / SF_LINK_DIST;
        a = alpha * SF_LINK_ALPHA * a * (0.4 + 0.6 * a);
        if (a < 0.008) continue;
        ctx.globalAlpha = a;
        ctx.strokeStyle = sfLine[(sshade[i] + sshade[j]) >> 1];
        ctx.beginPath();
        ctx.moveTo(sx[i], sy[i]);
        ctx.lineTo(sx[j], sy[j]);
        ctx.stroke();
      }
    }

    // lines reaching from nearby points toward the cursor
    if (pointer.inside) {
      var cd2 = SF_CURSOR_DIST * SF_CURSOR_DIST;
      ctx.strokeStyle = sfCursorLine;
      ctx.lineWidth = 0.7;
      for (i = 0; i < SN; i++) {
        dx = pointer.x - sx[i]; dy = pointer.y - sy[i];
        d2 = dx * dx + dy * dy;
        if (d2 > cd2) continue;
        a = alpha * SF_CURSOR_ALPHA * (1 - d2 / cd2);
        if (a < 0.008) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(sx[i], sy[i]);
        ctx.lineTo(sx[i] + dx * 0.9, sy[i] + dy * 0.9);
        ctx.stroke();
      }
    }
  }

  function drawPoints(alpha) {
    for (var i = 0; i < SN; i++) {
      var a = alpha * (0.7 + 0.3 * Math.sin(time * 0.6 + sph[i]));
      var s = ssize[i];
      ctx.globalAlpha = a;
      ctx.drawImage(sfPoint[sshade[i]], sx[i] - s / 2, sy[i] - s / 2, s, s);
    }
  }

  function drawMeteors(alpha) {
    for (var i = 0; i < METEORS; i++) {
      var m = met[i];
      if (!m.on) continue;
      var t = m.life / m.max;
      var fade = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
      var a = alpha * METEOR_ALPHA * fade;
      if (a < 0.01) continue;
      // tail grows out behind the head as it gets going
      var len = m.len * (t < 0.35 ? 0.3 + 0.7 * t / 0.35 : 1);
      ctx.globalAlpha = a;
      // rotate into the direction of travel; head sits at the origin
      ctx.setTransform(dpr * m.cx, dpr * m.cy, -dpr * m.cy, dpr * m.cx, dpr * m.x, dpr * m.y);
      ctx.drawImage(meteorTail, -len, -METEOR_TAIL_H / 2, len, METEOR_TAIL_H);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var hs = 22;
      ctx.drawImage(meteorHead, m.x - hs / 2, m.y - hs / 2, hs, hs);
    }
  }

  function draw() {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    var night = 1 - mix, sky = mix;

    if (night > 0.01) {
      drawStars(night);
      drawLinks(lineColor.dark, night);
      ctx.globalCompositeOperation = 'lighter';
      drawFlies(sprites.dark, night);
      drawStreak(night);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (sky > 0.01) {
      drawSkyStars(sky);
      drawConstellation(sky);
      ctx.globalCompositeOperation = 'lighter';
      drawGlints(sky);
      drawPoints(sky);
      drawMeteors(sky);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  // ---------- Loop ----------
  var running = false, last = 0, rafId = 0;

  function ffFrame(now) {
    if (!running) return;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;
    time += dt;
    update(dt);
    draw();
    rafId = requestAnimationFrame(ffFrame);
  }

  function start() {
    if (running || reduced || document.hidden) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(ffFrame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  // Reduced motion: one still frame — a handful of lit fireflies, or the
  // constellation and stars (no shooting stars).
  function drawStatic() {
    mix = mixTarget;
    for (var i = 0; i < N; i++) {
      glow[i] = i % 4 === 0 ? 0.6 + (i % 3) * 0.15 : EMBER;
    }
    for (var m = 0; m < METEORS; m++) met[m].on = false;
    streak.on = false;
    var keep = pointer.inside;
    pointer.inside = false;
    draw();
    pointer.inside = keep;
  }

  // ---------- Events ----------
  function onTheme() {
    readPalette();
    mixTarget = isLight() ? 1 : 0;
    if (mixTarget === 1 && meteorNext < time + 1.2) meteorNext = time + rand(1.2, 2.5);
    if (reduced) drawStatic();
  }

  window.addEventListener('eb-themechange', onTheme);
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var t = isLight() ? 1 : 0;
      if (t !== mixTarget) onTheme();
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reduced) drawStatic();
    }, 120);
  }, { passive: true });

  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.lastMove = time;
    pointer.inside = e.pointerType !== 'touch';
  }, { passive: true });

  document.addEventListener('pointerleave', function () { pointer.inside = false; });
  window.addEventListener('blur', function () { pointer.inside = false; });

  window.addEventListener('pointerdown', function (e) {
    if (reduced) return;
    var r2 = SCATTER_DIST * SCATTER_DIST, i, dx, dy, d2, d, f;
    for (i = 0; i < N; i++) {
      dx = px[i] - e.clientX; dy = py[i] - e.clientY;
      d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1) continue;
      d = Math.sqrt(d2);
      f = SCATTER_FORCE * (1 - d / SCATTER_DIST);
      vx[i] += dx / d * f;
      vy[i] += dy / d * f;
      // startled fireflies flash
      if (mix < 0.5 && time - glowStart[i] > glowLen[i]) waveAt[i] = time + d / 900;
    }
    // constellation points get a softer nudge
    for (i = 0; i < SN; i++) {
      dx = sx[i] - e.clientX; dy = sy[i] - e.clientY;
      d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1) continue;
      d = Math.sqrt(d2);
      f = SCATTER_FORCE * 0.5 * (1 - d / SCATTER_DIST);
      svx[i] += dx / d * f;
      svy[i] += dy / d * f;
    }
  }, { passive: true });

  // Parallax: everything drifts slightly opposite to the scroll.
  window.addEventListener('scroll', function () {
    var y = window.scrollY || 0;
    var d = y - lastScroll;
    lastScroll = y;
    if (reduced || !d) return;
    var i, o;
    for (i = 0; i < N; i++) py[i] -= d * PARALLAX;
    for (i = 0; i < STAR_COUNT; i++) {
      o = i * 4 + 1;
      stars[o] -= d * STAR_PARALLAX;
      if (stars[o] < 0) stars[o] += H; else if (stars[o] > H) stars[o] -= H;
    }
    for (i = 0; i < SN; i++) sy[i] -= d * SF_PARALLAX;
    for (i = 0; i < TN; i++) {
      o = i * 6 + 1;
      tstars[o] -= d * SF_STAR_PARALLAX;
      if (tstars[o] < 0) tstars[o] += H; else if (tstars[o] > H) tstars[o] -= H;
    }
    for (i = 0; i < SF_GLINTS; i++) {
      o = i * 5 + 1;
      glints[o] -= d * SF_STAR_PARALLAX;
      if (glints[o] < 0) glints[o] += H; else if (glints[o] > H) glints[o] -= H;
    }
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  if (reduceMQ) {
    var onReduce = function () {
      reduced = reduceMQ.matches;
      if (reduced) { stop(); drawStatic(); } else start();
    };
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
  }

  // ---------- Go ----------
  resize();
  readPalette();
  wave.next = rand(3, 7);
  streak.next = rand(4, 9);
  meteorNext = rand(1.5, 3.5);
  if (reduced) drawStatic(); else start();
})();
