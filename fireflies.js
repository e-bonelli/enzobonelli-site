/* ============================================================
   FIREFLIES — ambient background
   Night: fireflies that blink on irregular cycles, link up with
   faint lines when lit, drift toward the cursor, and now and then
   race across the sky. A few faint stars twinkle behind them.
   Day: the same system turns into soft daylight motes, with the
   odd seed drifting past on a breeze.
   One canvas, one rAF loop, no per-frame allocations.
   ============================================================ */
(function () {
  'use strict';

  // ---------- Tunables ----------
  var AREA_PER_FLY   = 26000;  // CSS px^2 of viewport per firefly
  var MIN_FLIES      = 15;
  var MAX_FLIES      = 60;
  var DAY_FRACTION   = 0.5;    // share of fireflies that stay visible as day motes
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
  var SEED_MIN       = 9;      // seconds between day seeds
  var SEED_MAX       = 20;

  var STAR_COUNT     = 70;
  var STAR_ALPHA     = 0.35;

  var PARALLAX       = 0.06;   // fireflies drift this fraction of scroll, opposite
  var STAR_PARALLAX  = 0.02;
  var FADE_MS        = 600;    // theme crossfade

  var FALLBACK = {
    dark:  { accent: '#c6f432', accent2: '#f5c542', bg: '#0a1630' },
    light: { accent: '#2f6fd6', accent2: '#b8860b', bg: '#e8f3ff' }
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
  var sprites = { dark: [null, null], light: [null, null] };
  var lineColor = { dark: '', light: '' };
  var seedSprite = null;

  function readPalette() {
    var mode = isLight() ? 'light' : 'dark';
    var cs = getComputedStyle(root);
    pal[mode].accent  = parseColor(cs.getPropertyValue('--accent'),   FALLBACK[mode].accent);
    pal[mode].accent2 = parseColor(cs.getPropertyValue('--accent-2'), FALLBACK[mode].accent2);
    buildSprites();
  }

  // Pre-render glow sprites to offscreen canvases so each frame is just drawImage.
  var SPRITE = 64; // CSS px

  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * dpr);
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

  function daySprite(main, edge) {
    var c = makeCanvas(SPRITE), g = c.getContext('2d');
    var r = c.width / 2;
    var pale = mixColor(main, [255, 255, 255], 0.35);
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0,    rgba(pale, 0.42));
    grd.addColorStop(0.35, rgba(main, 0.22));
    grd.addColorStop(0.7,  rgba(edge, 0.08));
    grd.addColorStop(1,    rgba(edge, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  function buildSprites() {
    var d = pal.dark, l = pal.light;
    sprites.dark[0]  = nightSprite(d.accent, d.accent2);
    sprites.dark[1]  = nightSprite(mixColor(d.accent, d.accent2, 0.55), d.accent2);
    sprites.light[0] = daySprite(l.accent, l.accent2);
    sprites.light[1] = daySprite(mixColor(l.accent2, [255, 230, 160], 0.4), l.accent);
    lineColor.dark  = rgba(d.accent, 1);
    lineColor.light = rgba(l.accent, 1);

    // A small dandelion seed for daytime breezes.
    var s = makeCanvas(28), g = s.getContext('2d');
    var k = s.width / 28;
    g.scale(k, k);
    g.strokeStyle = rgba(mixColor(l.accent2, [120, 90, 40], 0.3), 0.55);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(14, 26); g.lineTo(14, 13);
    g.stroke();
    g.strokeStyle = rgba([255, 255, 255], 0.85);
    g.lineWidth = 0.6;
    g.beginPath();
    for (var i = 0; i < 9; i++) {
      var a = -Math.PI * 0.95 + (i / 8) * Math.PI * 0.9;
      g.moveTo(14, 13);
      g.lineTo(14 + Math.cos(a) * 10, 13 + Math.sin(a) * 10);
    }
    g.stroke();
    g.fillStyle = rgba(l.accent2, 0.7);
    g.beginPath(); g.ellipse(14, 26, 1.2, 2, 0, 0, Math.PI * 2); g.fill();
    seedSprite = s;
  }

  // ---------- State ----------
  // Fireflies live in flat typed arrays so the hot loop allocates nothing.
  var N = 0;
  var px = new Float32Array(MAX_FLIES), py = new Float32Array(MAX_FLIES);
  var vx = new Float32Array(MAX_FLIES), vy = new Float32Array(MAX_FLIES);
  var heading = new Float32Array(MAX_FLIES);
  var ph1 = new Float32Array(MAX_FLIES), ph2 = new Float32Array(MAX_FLIES);
  var size = new Float32Array(MAX_FLIES), daySize = new Float32Array(MAX_FLIES);
  var tint = new Uint8Array(MAX_FLIES);
  var glowStart = new Float32Array(MAX_FLIES);  // time the current flash began
  var glowLen = new Float32Array(MAX_FLIES);    // length of current flash
  var nextFlash = new Float32Array(MAX_FLIES);  // time of next flash
  var waveAt = new Float32Array(MAX_FLIES);     // pending wave-triggered flash (-1 = none)
  var glow = new Float32Array(MAX_FLIES);       // current glow 0..1 (computed each frame)
  var dayVis = new Float32Array(MAX_FLIES);     // 1 if this firefly survives as a day mote

  var stars = new Float32Array(STAR_COUNT * 4); // x, y, size, phase

  // Spatial grid for neighbour checks (cell = LINK_DIST).
  var cellHead = new Int32Array(1), cellNext = new Int32Array(MAX_FLIES);
  var cols = 1, rows = 1;

  var streak = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, next: 0 };
  var seed = { on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, spin: 0, ph: 0, next: 0 };
  var wave = { next: 0 };

  var pointer = { x: -9999, y: -9999, lastMove: -99, inside: false };
  var time = 0;              // seconds of animation time
  var mix = isLight() ? 1 : 0;  // 0 = night, 1 = day
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
    var dayN = Math.max(6, Math.round(N * DAY_FRACTION));
    for (var j = 0; j < N; j++) dayVis[j] = j < dayN ? 1 : 0;

    for (var s = 0; s < STAR_COUNT; s++) {
      stars[s * 4]     = Math.random() * W;
      stars[s * 4 + 1] = Math.random() * H;
      stars[s * 4 + 2] = Math.random() < 0.15 ? 1.6 : 1;
      stars[s * 4 + 3] = Math.random() * Math.PI * 2;
    }

    cols = Math.max(1, Math.ceil(W / LINK_DIST));
    rows = Math.max(1, Math.ceil(H / LINK_DIST));
    if (cellHead.length < cols * rows) cellHead = new Int32Array(cols * rows);

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
    daySize[i] = rand(34, 78);
    tint[i] = Math.random() < 0.3 ? 1 : 0;
    glowStart[i] = -99;
    glowLen[i] = 1;
    nextFlash[i] = time + rand(0, GAP_MAX);
    waveAt[i] = -1;
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

  // ---------- Simulation ----------
  function update(dt) {
    // theme crossfade
    if (mix !== mixTarget) {
      var step = dt * 1000 / FADE_MS;
      mix = mix < mixTarget ? Math.min(mixTarget, mix + step) : Math.max(mixTarget, mix - step);
    }

    var pull = pointer.inside ? Math.max(0, 1 - (time - pointer.lastMove) / CURSOR_IDLE) : 0;
    var cr2 = CURSOR_DIST * CURSOR_DIST * 1.6;
    var speed = SPEED * (1 - mix * 0.45);  // motes drift slower by day
    var relax = Math.min(1, DAMPING * dt);

    if (time > wave.next) {
      if (mix < 0.5 && N > 3) startWave();
      wave.next = time + rand(WAVE_EVERY_MIN, WAVE_EVERY_MAX);
    }

    for (var i = 0; i < N; i++) {
      // smooth wandering: heading follows two slow sine "noises"
      heading[i] += (Math.sin(time * 0.37 + ph1[i]) + Math.sin(time * 0.71 + ph2[i]) * 0.6) * TURN_RATE * dt;
      var tx = Math.cos(heading[i]) * speed;
      var ty = Math.sin(heading[i]) * speed - 2;  // tiny upward bias
      vx[i] += (tx - vx[i]) * relax;
      vy[i] += (ty - vy[i]) * relax;

      // gentle attraction toward a moving cursor (stronger with distance, capped by range)
      if (pull > 0) {
        var dx = pointer.x - px[i], dy = pointer.y - py[i];
        var d2 = dx * dx + dy * dy;
        if (d2 < cr2 && d2 > 400) {
          var d = Math.sqrt(d2);
          var f = CURSOR_PULL * pull * (1 - d / Math.sqrt(cr2)) * dt * 3;
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
      var nightGlow = Math.max(EMBER, flashCurve((time - glowStart[i]) / glowLen[i]));
      var dayGlow = 0.6 + 0.4 * Math.sin(time * 0.5 + ph1[i]);
      glow[i] = nightGlow + (dayGlow - nightGlow) * mix;
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

    // day seed on a breeze
    if (seed.on) {
      seed.ph += dt;
      seed.x += (seed.vx + Math.sin(seed.ph * 1.3) * 18) * dt;
      seed.y += (seed.vy + Math.sin(seed.ph * 0.9) * 14) * dt;
      seed.rot = Math.sin(seed.ph * 1.1) * 0.5 + seed.spin * seed.ph;
      if (seed.x > W + 60 || seed.y < -60 || seed.y > H + 60) seed.on = false;
    } else if (time > seed.next) {
      if (mix > 0.5) {
        seed.on = true;
        seed.x = -40;
        seed.y = rand(H * 0.2, H * 0.85);
        seed.vx = rand(45, 75);
        seed.vy = rand(-14, 4);
        seed.spin = rand(-0.15, 0.15);
        seed.ph = 0;
      }
      seed.next = time + rand(SEED_MIN, SEED_MAX);
    }
  }

  // ---------- Drawing ----------
  function drawFlies(spr, alpha, day) {
    var vis = alpha;
    for (var i = 0; i < N; i++) {
      var a = vis * glow[i] * (day ? dayVis[i] : 1);
      if (a < 0.01) continue;
      var s = day ? daySize[i] : size[i] * (0.75 + glow[i] * 0.5);
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(spr[tint[i]], px[i] - s, py[i] - s, s * 2, s * 2);
    }
  }

  function drawLinks(color, alpha, day) {
    // bucket fireflies into the spatial grid
    var n = cols * rows, i, j;
    for (i = 0; i < n; i++) cellHead[i] = -1;
    for (i = 0; i < N; i++) {
      var g = glow[i] * (day ? dayVis[i] : 1);
      if (g < LIT_THRESHOLD) continue;
      var cx = Math.min(cols - 1, Math.max(0, (px[i] / LINK_DIST) | 0));
      var cy = Math.min(rows - 1, Math.max(0, (py[i] / LINK_DIST) | 0));
      var c = cy * cols + cx;
      cellNext[i] = cellHead[c];
      cellHead[c] = i;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = day ? 1 : 0.7;
    var ld2 = LINK_DIST * LINK_DIST;
    for (i = 0; i < N; i++) {
      var gi = glow[i] * (day ? dayVis[i] : 1);
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
          var gj = glow[j] * (day ? dayVis[j] : 1);
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
        var vis = day ? dayVis[i] : 1;
        if (!vis) continue;
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

  function drawSeed(alpha) {
    if (!seed.on || !seedSprite) return;
    ctx.globalAlpha = alpha * 0.8;
    ctx.save();
    ctx.translate(seed.x, seed.y);
    ctx.rotate(seed.rot);
    ctx.drawImage(seedSprite, -14, -14, 28, 28);
    ctx.restore();
  }

  function draw() {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    var night = 1 - mix, day = mix;

    if (night > 0.01) {
      drawStars(night);
      drawLinks(lineColor.dark, night, false);
      ctx.globalCompositeOperation = 'lighter';
      drawFlies(sprites.dark, night, false);
      drawStreak(night);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (day > 0.01) {
      drawLinks(lineColor.light, day * 0.7, true);
      drawFlies(sprites.light, day * 0.75, true);
      drawSeed(day);
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

  // Reduced motion: one still frame with a handful of lit fireflies.
  function drawStatic() {
    mix = mixTarget;
    for (var i = 0; i < N; i++) {
      glow[i] = mix ? 0.75 : (i % 4 === 0 ? 0.6 + (i % 3) * 0.15 : EMBER);
    }
    var keep = pointer.inside;
    pointer.inside = false;
    draw();
    pointer.inside = keep;
  }

  // ---------- Events ----------
  function onTheme() {
    readPalette();
    mixTarget = isLight() ? 1 : 0;
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
    var r2 = SCATTER_DIST * SCATTER_DIST;
    for (var i = 0; i < N; i++) {
      var dx = px[i] - e.clientX, dy = py[i] - e.clientY;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 < 1) continue;
      var d = Math.sqrt(d2);
      var f = SCATTER_FORCE * (1 - d / SCATTER_DIST);
      vx[i] += dx / d * f;
      vy[i] += dy / d * f;
      // startled fireflies flash
      if (mix < 0.5 && time - glowStart[i] > glowLen[i]) waveAt[i] = time + d / 900;
    }
  }, { passive: true });

  // Parallax: everything drifts slightly opposite to the scroll.
  window.addEventListener('scroll', function () {
    var y = window.scrollY || 0;
    var d = y - lastScroll;
    lastScroll = y;
    if (reduced || !d) return;
    for (var i = 0; i < N; i++) py[i] -= d * PARALLAX;
    for (var s = 0; s < STAR_COUNT; s++) {
      var o = s * 4 + 1;
      stars[o] -= d * STAR_PARALLAX;
      if (stars[o] < 0) stars[o] += H; else if (stars[o] > H) stars[o] -= H;
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
  seed.next = rand(3, 7);
  if (reduced) drawStatic(); else start();
})();
