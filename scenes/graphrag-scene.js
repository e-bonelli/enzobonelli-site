/* ============================================================
   GraphragScene — isometric GraphRAG architecture (Scene API v2)
   Self-contained: inline SVG, true isometric projection, no deps.

   window.GraphragScene.mount(container, { reducedMotion?, mode? }) → {
     steps: 5,
     setStep(index 0..4, progress 0..1),   // story mode; no-op in overview
     destroy()
   }
   window.IsoScene is kept as an alias for older pages.

   - mode 'story' (default): all step visuals are a pure function of
     T = index + progress, so stepping backwards replays correctly and
     p = 1 is always a complete state for that step.
   - mode 'overview': the finished architecture, every component lit,
     fireflies flowing on every edge, no camera drift or parallax,
     compact title-only labels, viewBox fitted tightly to the drawing.
   - Depth: three rigid layers (floor, hovering graph slab, floating UI)
     with soft gradient shadows, face shading overlays, a gentle
     scroll-driven camera drift and pointer parallax (no clicking).
   - Ambient motion (packets, LEDs, hover bob, parallax easing) runs on
     rAF only while on-screen and the tab is visible. Reduced motion →
     one static frame per step, no drift, no parallax.
   - Per-frame work only writes attributes on pre-built elements.
   ============================================================ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var C30 = Math.cos(Math.PI / 6);
  var U = 22;                 // px per world unit
  var GHOST = 0.07;           // opacity of not-yet-introduced parts
  var VB = { x: -350, y: -46, w: 975, h: 590 };
  var uid = 0;
  var COMPACT_W = 600;        // story containers narrower than this use short labels
  var SHADE = '';             // per-mount gradient id prefix (set in mount)

  /* ---------- projection + tiny helpers ---------- */
  function sx(x, y) { return (x - y) * C30 * U; }
  function sy(x, y, z) { return (x + y) * 0.5 * U - z * U; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function pt(x, y, z) { return f1(sx(x, y)) + ',' + f1(sy(x, y, z)); }
  function poly(list) {
    var s = '';
    for (var i = 0; i < list.length; i++) s += (i ? ' ' : '') + pt(list[i][0], list[i][1], list[i][2]);
    return s;
  }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ramp(t, a, b) { return clamp((t - a) / (b - a)); }
  function smooth(s) { return s * s * (3 - 2 * s); }
  function ghost(a) { return GHOST + (1 - GHOST) * a; }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function txt(parent, x, y, str, cls, anchor) {
    var t = el('text', { x: f1(x), y: f1(y), 'class': cls }, parent);
    if (anchor) t.setAttribute('text-anchor', anchor);
    t.textContent = str;
    return t;
  }

  /* Extruded box: 3 visible faces ("left" = +y face, "right" = +x face),
     each with a shading overlay (ambient occlusion toward the floor). */
  function boxFaces(x, y, z, w, d, h) {
    return {
      top: poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]),
      left: poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]),
      right: poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])
    };
  }
  function box(parent, x, y, z, w, d, h, cls, flat) {
    var g = el('g', { 'class': 'iso-solid ' + (cls || '') }, parent);
    var f = boxFaces(x, y, z, w, d, h);
    var b = { g: g };
    b.left = el('polygon', { 'class': 'iso-face iso-left', points: f.left }, g);
    b.right = el('polygon', { 'class': 'iso-face iso-right', points: f.right }, g);
    if (!flat) {
      b.leftS = el('polygon', { 'class': 'iso-shade', points: f.left, fill: 'url(#' + SHADE + '-ao)' }, g);
      b.rightS = el('polygon', { 'class': 'iso-shade', points: f.right, fill: 'url(#' + SHADE + '-ao)' }, g);
    }
    b.top = el('polygon', { 'class': 'iso-face iso-top', points: f.top }, g);
    if (!flat) b.topS = el('polygon', { 'class': 'iso-shade', points: f.top, fill: 'url(#' + SHADE + '-sheen)' }, g);
    return b;
  }
  function setBox(b, x, y, z, w, d, h) {
    var f = boxFaces(x, y, z, w, d, h);
    b.top.setAttribute('points', f.top);
    b.left.setAttribute('points', f.left);
    b.right.setAttribute('points', f.right);
    if (b.leftS) { b.leftS.setAttribute('points', f.left); b.rightS.setAttribute('points', f.right); b.topS.setAttribute('points', f.top); }
  }
  // affine matrices mapping local px (u right, v down) onto iso planes
  function planeX(x, y, z) { return 'matrix(' + C30 + ',-0.5,0,1,' + f1(sx(x, y)) + ',' + f1(sy(x, y, z)) + ')'; }
  function planeY(x, y, z) { return 'matrix(' + C30 + ',0.5,0,1,' + f1(sx(x, y)) + ',' + f1(sy(x, y, z)) + ')'; }
  function planeZ(x, y, z) { return 'matrix(' + C30 + ',0.5,' + (-C30) + ',0.5,' + f1(sx(x, y)) + ',' + f1(sy(x, y, z)) + ')'; }
  // soft contact/drop shadow: radial-gradient rect lying on the floor (no filters)
  function shadow(parent, x, y, w, d, spread, cls) {
    return el('rect', {
      'class': 'iso-shadow ' + (cls || ''), transform: planeZ(x - spread, y - spread, 0),
      width: f1((w + 2 * spread) * U), height: f1((d + 2 * spread) * U), rx: f1(spread * U),
      fill: 'url(#' + SHADE + '-shadow)', 'aria-hidden': 'true'
    }, parent);
  }

  /* ---------- world layout (facts only: docs → ingestion → GraphRAG ⇄ 5 agents → UI) ---------- */
  var FLOOR = { x: 0.6, y: 1.5, w: 29.6, d: 13.4 };
  var BOUND = 0.9;
  var DOCS = { x: 2.2, y: 6.6, w: 3.0, d: 3.8 };
  var ING = { x: 7.6, y: 5.6, w: 3.4, d: 5.0, h: 3.4 };
  var SLAB = { x: 14, y: 3, w: 10, d: 10, z: 2.3, h: 0.42 };
  var STOP = SLAB.z + SLAB.h;
  var PANEL = { x: 28.4, y0: 2.8, y1: 12.2, z0: 8.6, z1: 14.4 };

  var NODES = [ // slab-local (u along +x, v along +y), size class
    [1.4, 2.2, 0], [1.0, 5.4, 0], [1.8, 8.4, 0], [3.4, 3.8, 1], [3.6, 6.9, 0],
    [4.9, 1.5, 0], [5.4, 5.0, 2], [5.0, 8.7, 1], [7.0, 2.9, 1], [7.3, 6.4, 2],
    [7.7, 9.0, 0], [8.9, 1.4, 0], [9.0, 4.6, 1], [8.8, 7.9, 0], [6.2, 7.3, 0]
  ];
  var EDGES = [
    [0, 1], [0, 3], [1, 3], [1, 4], [2, 4], [2, 7], [3, 5], [3, 6], [4, 6], [4, 7],
    [5, 8], [6, 8], [6, 9], [6, 14], [7, 14], [7, 10], [8, 11], [8, 12], [9, 12],
    [9, 13], [9, 14], [10, 13], [11, 12], [12, 13], [14, 10]
  ];
  var AGENTS = [];
  (function () {
    var hs = [3.7, 4.2, 4.7, 4.2, 3.7];
    for (var i = 0; i < 5; i++) {
      var y = 3.4 + i * 2.3, k = (y - 8) / 4.6;
      AGENTS.push({ x: 25.7 + 1.3 * (1 - k * k), y: y, w: 1.0, d: 1.0, h: hs[i] });
    }
  })();
  var PATHS = [[11, 8, 6], [12, 9, 6], [9, 14, 7], [13, 10, 7], [10, 7, 4]]; // per agent, multi-hop
  var CITES = [6, 9, 7];
  var LINEAGE = [0, 2, 5, 3];

  function nodeW(i) { return [SLAB.x + NODES[i][0], SLAB.y + NODES[i][1], STOP]; }
  function agentTop(a) { return [a.x + a.w / 2, a.y + a.d / 2, a.h + 0.3]; }

  /* ---------- routes (built once): points [x, y, z, slabWeight, uiWeight] ---------- */
  function makeRoute(pts) {
    var n = pts.length, r = {
      xs: new Float32Array(n), ys: new Float32Array(n), ws: new Float32Array(n),
      wu: new Float32Array(n), cl: new Float32Array(n), len: 0
    };
    for (var i = 0; i < n; i++) {
      r.xs[i] = sx(pts[i][0], pts[i][1]); r.ys[i] = sy(pts[i][0], pts[i][1], pts[i][2]);
      r.ws[i] = pts[i][3] || 0; r.wu[i] = pts[i][4] || 0;
      r.cl[i] = i ? r.cl[i - 1] + Math.hypot(r.xs[i] - r.xs[i - 1], r.ys[i] - r.ys[i - 1]) : 0;
    }
    r.len = r.cl[n - 1];
    return r;
  }
  function arc(a, b, lift, steps, ws0, ws1, wu0, wu1, out) {
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = Math.max(a[2], b[2]) + lift;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * mx + t * t * b[0],
        u * u * a[1] + 2 * u * t * my + t * t * b[1],
        u * u * a[2] + 2 * u * t * mz + t * t * b[2],
        ws0 + (ws1 - ws0) * t, wu0 + (wu1 - wu0) * t]);
    }
    return out;
  }
  function reversed(list) { return list.slice().reverse(); }

  /* ================================================================ */
  function mount(container, opts) {
    opts = opts || {};
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!opts.reducedMotion || !!(mq && mq.matches);
    var overview = opts.mode === 'overview';
    var id = 'iso' + (++uid);
    SHADE = id;
    var T = 0, stateSet = false;
    // live layer offsets (screen px): slab layer, UI layer
    var offS = new Float32Array(2), offU = new Float32Array(2);
    var bob = 0, bobUI = 0, uiRise = 0;
    var ptr = new Float32Array(4); // current x,y, target x,y  (−1..1)

    var svg = el('svg', {
      'class': 'iso-scene' + (overview ? ' iso-overview' : ''), viewBox: VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h,
      role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', preserveAspectRatio: 'xMidYMid meet'
    });
    el('title', { id: id + '-t' }, svg).textContent = 'Air-gapped GraphRAG architecture';
    el('desc', { id: id + '-d' }, svg).textContent =
      'Isometric diagram. Inside an air-gapped boundary where PII stays inside: tax and financial ' +
      'documents flow into ingestion services (FastAPI microservices in Docker), which load a Neo4j ' +
      'GraphRAG knowledge graph with lineage tracking. A five-agent system queries the graph and cites ' +
      'it, producing explainable output with traceable reasoning in a vanilla JS UI.';

    /* defs: glows, shading, shadows (gradients only — no per-frame filters) */
    var defs = el('defs', null, svg);
    ['a', 'b', 'c'].forEach(function (k) {
      var g = el('radialGradient', { id: id + '-glow-' + k }, defs);
      el('stop', { offset: '0', 'class': 'iso-stop-' + k, 'stop-opacity': '0.9' }, g);
      el('stop', { offset: '0.3', 'class': 'iso-stop-' + k, 'stop-opacity': '0.32' }, g);
      el('stop', { offset: '1', 'class': 'iso-stop-' + k, 'stop-opacity': '0' }, g);
    });
    var ao = el('linearGradient', { id: id + '-ao', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0' }, ao);
    el('stop', { offset: '0.55', 'stop-color': '#000', 'stop-opacity': '0.08' }, ao);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0.34' }, ao);
    var sheen = el('linearGradient', { id: id + '-sheen', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.10' }, sheen);
    el('stop', { offset: '0.6', 'stop-color': '#fff', 'stop-opacity': '0' }, sheen);
    var sh = el('radialGradient', { id: id + '-shadow' }, defs);
    el('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.55' }, sh);
    el('stop', { offset: '0.55', 'stop-color': '#000', 'stop-opacity': '0.32' }, sh);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' }, sh);
    var beamG = el('linearGradient', { id: id + '-beam', x1: '0', y1: '1', x2: '0', y2: '0' }, defs);
    el('stop', { offset: '0', 'class': 'iso-stop-a', 'stop-opacity': '0.30' }, beamG);
    el('stop', { offset: '1', 'class': 'iso-stop-a', 'stop-opacity': '0.03' }, beamG);
    var floorG = el('radialGradient', { id: id + '-floorlight', cx: '0.42', cy: '0.4', r: '0.75' }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.07' }, floorG);
    el('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' }, floorG);
    function glow(k) { return 'url(#' + id + '-glow-' + k + ')'; }

    var cam = el('g', { 'class': 'iso-cam' }, svg);
    var root = el('g', { 'class': 'iso-root' }, cam);

    /* ---- 0. floor plate + grid + boundary ---- */
    var gFloor = el('g', { 'class': 'iso-floor', 'aria-hidden': 'true' }, root);
    shadow(gFloor, FLOOR.x + 1.2, FLOOR.y + 1.6, FLOOR.w, FLOOR.d, 1.6, 'iso-shadow-plate');
    box(gFloor, FLOOR.x, FLOOR.y, -0.55, FLOOR.w, FLOOR.d, 0.55, 'iso-plate');
    el('rect', { transform: planeZ(FLOOR.x, FLOOR.y, 0), width: FLOOR.w * U, height: FLOOR.d * U, fill: 'url(#' + id + '-floorlight)' }, gFloor);
    var grid = el('g', { 'class': 'iso-grid' }, gFloor), gx;
    var fx0 = FLOOR.x, fy0 = FLOOR.y, fx1 = FLOOR.x + FLOOR.w, fy1 = FLOOR.y + FLOOR.d;
    for (gx = 2; gx < fx1; gx += 2) if (gx > fx0) el('line', { x1: f1(sx(gx, fy0)), y1: f1(sy(gx, fy0, 0)), x2: f1(sx(gx, fy1)), y2: f1(sy(gx, fy1, 0)) }, grid);
    for (gx = 2; gx < fy1; gx += 2) if (gx > fy0) el('line', { x1: f1(sx(fx0, gx)), y1: f1(sy(fx0, gx, 0)), x2: f1(sx(fx1, gx)), y2: f1(sy(fx1, gx, 0)) }, grid);

    var gBound = el('g', { 'class': 'iso-boundary' }, root);
    var bx0 = FLOOR.x + BOUND, by0 = FLOOR.y + BOUND, bx1 = FLOOR.x + FLOOR.w - BOUND, by1 = FLOOR.y + FLOOR.d - BOUND;
    var bPts = poly([[bx0, by0, 0], [bx1, by0, 0], [bx1, by1, 0], [bx0, by1, 0]]);
    el('polygon', { 'class': 'iso-bound-fill', points: bPts, 'aria-hidden': 'true' }, gBound);
    var boundLine = el('polygon', { 'class': 'iso-bound-line', points: bPts, 'aria-hidden': 'true' }, gBound);
    var cb = 1.4;
    [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx1, by1, -1, -1], [bx0, by1, 1, -1]].forEach(function (c) {
      el('polyline', { 'class': 'iso-bound-corner', 'aria-hidden': 'true', points: poly([[c[0] + c[2] * cb, c[1], 0], [c[0], c[1], 0], [c[0], c[1] + c[3] * cb, 0]]) }, gBound);
    });
    var floorLbl = el('g', { 'class': 'iso-floor-label', transform: planeZ(bx0 + 1.1, by1 - 0.4, 0) }, gBound);
    txt(floorLbl, 0, 0, 'Air-gapped boundary: PII stays inside', 'iso-floor-text');

    /* ---- 1. documents ---- */
    var gDocs = el('g', { 'class': 'iso-docs' }, root);
    shadow(gDocs, DOCS.x + 0.15, DOCS.y + 0.2, DOCS.w, DOCS.d, 0.55);
    var nSheets = 5, sheetT = 0.12, sheetGap = 0.1;
    for (var s = 0; s < nSheets; s++) {
      var off = (s % 2 ? 0.12 : -0.06);
      box(gDocs, DOCS.x + off, DOCS.y - off * 0.6, s * (sheetT + sheetGap), DOCS.w, DOCS.d, sheetT, 'iso-sheet', true);
    }
    var docTopZ = (nSheets - 1) * (sheetT + sheetGap) + sheetT;
    var lines = el('g', { 'class': 'iso-doc-lines', 'aria-hidden': 'true' }, gDocs);
    var lastOff = ((nSheets - 1) % 2 ? 0.12 : -0.06);
    for (var li = 0; li < 6; li++) {
      var ly = DOCS.y - lastOff * 0.6 + 0.6 + li * 0.5, lx0 = DOCS.x + lastOff + 0.45;
      var lx1 = lx0 + (li === 0 ? 1.1 : li % 3 === 2 ? 1.5 : 2.1);
      el('line', { x1: f1(sx(lx0, ly)), y1: f1(sy(lx0, ly, docTopZ)), x2: f1(sx(lx1, ly)), y2: f1(sy(lx1, ly, docTopZ)), 'class': li === 0 ? 'iso-doc-head' : '' }, lines);
    }
    var pii = el('g', { 'class': 'iso-pii', transform: planeZ(DOCS.x + lastOff + 0.45, DOCS.y - lastOff * 0.6 + 3.0, docTopZ), 'aria-hidden': 'true' }, gDocs);
    el('rect', { x: 0, y: -10, width: 26, height: 13, rx: 2 }, pii);
    txt(pii, 13, 0, 'PII', 'iso-pii-text', 'middle');

    var slot = [ING.x + ING.w / 2, ING.y + ING.d / 2, ING.h];
    var flyFrom = [DOCS.x + DOCS.w / 2, DOCS.y + DOCS.d / 2, docTopZ + 0.15];
    var flyRoute = makeRoute(arc(flyFrom, slot, 2.4, 16, 0, 0, 0, 0, []));
    var flyFaces = boxFaces(-DOCS.w * 0.35, -DOCS.d * 0.35, 0, DOCS.w * 0.7, DOCS.d * 0.7, 0.06);

    /* ---- 2. ingestion block ---- */
    var gIng = el('g', { 'class': 'iso-ing' }, root);
    shadow(gIng, ING.x + 0.25, ING.y + 0.3, ING.w, ING.d, 0.7);
    box(gIng, ING.x, ING.y, 0, ING.w, ING.d, ING.h, 'iso-server');
    var seams = el('g', { 'class': 'iso-seams', 'aria-hidden': 'true' }, gIng);
    [1.15, 2.3].forEach(function (z) {
      el('line', { x1: f1(sx(ING.x, ING.y + ING.d)), y1: f1(sy(ING.x, ING.y + ING.d, z)), x2: f1(sx(ING.x + ING.w, ING.y + ING.d)), y2: f1(sy(ING.x + ING.w, ING.y + ING.d, z)) }, seams);
      el('line', { x1: f1(sx(ING.x + ING.w, ING.y + ING.d)), y1: f1(sy(ING.x + ING.w, ING.y + ING.d, z)), x2: f1(sx(ING.x + ING.w, ING.y)), y2: f1(sy(ING.x + ING.w, ING.y, z)) }, seams);
    });
    var vents = el('g', { 'class': 'iso-vents', 'aria-hidden': 'true' }, gIng);
    var leds = [];
    for (var ru = 0; ru < 3; ru++) {
      var zc = 0.58 + ru * 1.15;
      for (var vi = 0; vi < 4; vi++) {
        var vy0 = ING.y + 0.5 + vi * 0.42;
        el('line', { x1: f1(sx(ING.x + ING.w, vy0)), y1: f1(sy(ING.x + ING.w, vy0, zc + 0.22)), x2: f1(sx(ING.x + ING.w, vy0)), y2: f1(sy(ING.x + ING.w, vy0, zc - 0.22)) }, vents);
      }
      for (var lj = 0; lj < 3; lj++) {
        var lx = ING.x + 0.45 + lj * 0.42;
        leds.push(el('ellipse', { 'class': 'iso-led ' + (lj === 2 ? 'iso-led-c' : 'iso-led-a'), cx: f1(sx(lx, ING.y + ING.d)), cy: f1(sy(lx, ING.y + ING.d, zc)), rx: 2.6, ry: 2.6, 'aria-hidden': 'true' }, gIng));
      }
      var bayX = ING.x + 1.9;
      el('polygon', { 'class': 'iso-bay', 'aria-hidden': 'true', points: poly([[bayX, ING.y + ING.d, zc - 0.14], [bayX + 1.2, ING.y + ING.d, zc - 0.14], [bayX + 1.2, ING.y + ING.d, zc + 0.14], [bayX, ING.y + ING.d, zc + 0.14]]) }, gIng);
    }
    var sl = 0.5;
    el('polygon', { 'class': 'iso-slot', 'aria-hidden': 'true', points: poly([[slot[0] - 1.1, slot[1] - sl, ING.h], [slot[0] + 1.1, slot[1] - sl, ING.h], [slot[0] + 1.1, slot[1] + sl, ING.h], [slot[0] - 1.1, slot[1] + sl, ING.h]]) }, gIng);
    var portZ = 2.3;
    el('polygon', { 'class': 'iso-port', 'aria-hidden': 'true', points: poly([[ING.x + ING.w, ING.y + 1.0, portZ - 0.18], [ING.x + ING.w, ING.y + ING.d - 1.0, portZ - 0.18], [ING.x + ING.w, ING.y + ING.d - 1.0, portZ + 0.18], [ING.x + ING.w, ING.y + 1.0, portZ + 0.18]]) }, gIng);
    // flying sheets (docs → intake slot), drawn above the server
    var gFly = el('g', { 'class': 'iso-fly', 'aria-hidden': 'true' }, root);
    var flyers = [];
    for (var fi = 0; fi < 3; fi++) {
      var fg = el('g', { 'class': 'iso-solid iso-sheet iso-flyer', opacity: 0 }, gFly);
      el('polygon', { 'class': 'iso-face iso-left', points: flyFaces.left }, fg);
      el('polygon', { 'class': 'iso-face iso-right', points: flyFaces.right }, fg);
      el('polygon', { 'class': 'iso-face iso-top', points: flyFaces.top }, fg);
      flyers.push(fg);
    }

    /* ---- 3. GraphRAG slab (hovering glass) ---- */
    var slabShadow = shadow(root, SLAB.x + 0.5, SLAB.y + 0.6, SLAB.w, SLAB.d, 1.1, 'iso-shadow-slab');
    var gLineage = el('g', { 'class': 'iso-lineage', 'aria-hidden': 'true' }, root);
    var portW = [ING.x + ING.w, ING.y + ING.d / 2, portZ];
    var lineageLines = LINEAGE.map(function (ni) {
      var nw = nodeW(ni);
      return { el: el('line', { x1: f1(sx(portW[0], portW[1])), y1: f1(sy(portW[0], portW[1], portW[2])) }, gLineage), x2: sx(nw[0], nw[1]), y2: sy(nw[0], nw[1], nw[2]) };
    });
    var gSlabWrap = el('g', { 'class': 'iso-slab-wrap' }, root);
    var gSlab = el('g', { 'class': 'iso-slab' }, gSlabWrap);
    box(gSlab, SLAB.x, SLAB.y, SLAB.z, SLAB.w, SLAB.d, SLAB.h, 'iso-glass', true);
    el('polygon', { 'class': 'iso-glass-sheen', 'aria-hidden': 'true', points: poly([[SLAB.x, SLAB.y, STOP], [SLAB.x + SLAB.w, SLAB.y, STOP], [SLAB.x + SLAB.w, SLAB.y + SLAB.d, STOP], [SLAB.x, SLAB.y + SLAB.d, STOP]]), fill: 'url(#' + id + '-sheen)' }, gSlab);
    el('polygon', { 'class': 'iso-glass-inset', 'aria-hidden': 'true', points: poly([[SLAB.x + 0.35, SLAB.y + 0.35, STOP], [SLAB.x + SLAB.w - 0.35, SLAB.y + 0.35, STOP], [SLAB.x + SLAB.w - 0.35, SLAB.y + SLAB.d - 0.35, STOP], [SLAB.x + 0.35, SLAB.y + SLAB.d - 0.35, STOP]]) }, gSlab);
    var gEdges = el('g', { 'class': 'iso-edges', 'aria-hidden': 'true' }, gSlab);
    var gRipples = el('g', { 'class': 'iso-ripples', 'aria-hidden': 'true' }, gSlab);
    var gNodes = el('g', { 'class': 'iso-nodes', 'aria-hidden': 'true' }, gSlab);
    function edgeLine(a, b, cls, parent) {
      return el('line', { 'class': cls || '', x1: f1(sx(a[0], a[1])), y1: f1(sy(a[0], a[1], a[2])), x2: f1(sx(b[0], b[1])), y2: f1(sy(b[0], b[1], b[2])), opacity: 0 }, parent);
    }
    var edgeEls = EDGES.map(function (e) { return edgeLine(nodeW(e[0]), nodeW(e[1]), '', gEdges); });
    var nodeEls = NODES.map(function (n, i) {
      var w = nodeW(i), r = [4.2, 5.4, 6.8][n[2]];
      var g = el('g', { 'class': 'iso-node', opacity: 0, transform: 'translate(' + f1(sx(w[0], w[1])) + ' ' + f1(sy(w[0], w[1], w[2])) + ')' }, gNodes);
      var halo = el('circle', { r: r * 3.2, fill: glow('a'), opacity: 0 }, g);
      el('ellipse', { 'class': 'iso-node-base', rx: r * 1.15, ry: r * 0.66, cy: 1.8 }, g);
      var core = el('ellipse', { 'class': 'iso-node-core', rx: r, ry: r * 0.62 }, g);
      return { g: g, halo: halo, core: core, lit: false };
    });
    var pathEdgeEls = [];
    PATHS.forEach(function (p) {
      for (var k = 0; k < p.length - 1; k++) pathEdgeEls.push(edgeLine(nodeW(p[k]), nodeW(p[k + 1]), 'iso-edge-lit', gEdges));
    });
    var order = NODES.map(function (n, i) { return i; }).sort(function (a, b) { return (NODES[a][0] + NODES[a][1] * 0.15) - (NODES[b][0] + NODES[b][1] * 0.15); });
    var rank = []; order.forEach(function (ni, r) { rank[ni] = r; });

    /* ---- 4. agents ---- */
    var gAgents = el('g', { 'class': 'iso-agents' }, root);
    var agentEls = AGENTS.map(function (a, i) { return { a: a, i: i }; })
      .sort(function (p, q) { return (p.a.x + p.a.y) - (q.a.x + q.a.y); })
      .map(function (o) {
        var a = o.a;
        var g = el('g', { 'class': 'iso-agent' }, gAgents);
        shadow(g, a.x + 0.1, a.y + 0.15, a.w, a.d, 0.55);
        box(g, a.x - 0.25, a.y - 0.25, 0, a.w + 0.5, a.d + 0.5, 0.18, 'iso-pad', true);
        var b = box(g, a.x, a.y, 0, a.w, a.d, a.h, 'iso-tower');
        var band = el('polygon', { 'class': 'iso-band', 'aria-hidden': 'true' }, g);
        var tag = el('g', { 'class': 'iso-agent-tag', 'aria-hidden': 'true' }, g);
        txt(tag, 11, 15, 'A' + (o.i + 1), 'iso-agent-text', 'middle');
        var halo = el('circle', { r: 17, fill: glow('a'), 'aria-hidden': 'true' }, g);
        var led = el('ellipse', { 'class': 'iso-tower-led', rx: 4.2, ry: 2.5, 'aria-hidden': 'true' }, g);
        return { a: a, i: o.i, g: g, b: b, band: band, tag: tag, led: led, halo: halo, hCur: -1, ledA: 0, flash: 0 };
      });
    var agentByIndex = []; agentEls.forEach(function (o) { agentByIndex[o.i] = o; });

    /* ---- 5. beam + UI panel ---- */
    var panelShadow = shadow(root, PANEL.x - 2.2, PANEL.y0 + 1.6, 1.6, PANEL.y1 - PANEL.y0, 1.2, 'iso-shadow-ui');
    var gBeam = el('g', { 'class': 'iso-beam', 'aria-hidden': 'true' }, root);
    var beamPoly = el('polygon', { fill: 'url(#' + id + '-beam)' }, gBeam);
    var beamLines = AGENTS.map(function () { return el('line', { 'class': 'iso-beam-line' }, gBeam); });
    var gCite = el('g', { 'class': 'iso-cites', 'aria-hidden': 'true' }, root);
    var gUIWrap = el('g', { 'class': 'iso-ui-wrap' }, root);
    var gUI = el('g', { 'class': 'iso-ui' }, gUIWrap);
    var PW = (PANEL.y1 - PANEL.y0) * U, PH = (PANEL.z1 - PANEL.z0) * U;
    box(gUI, PANEL.x - 0.3, PANEL.y0, PANEL.z0, 0.3, PANEL.y1 - PANEL.y0, PANEL.z1 - PANEL.z0, 'iso-screen', true);
    var face = el('g', { 'class': 'iso-screen-face', transform: planeX(PANEL.x, PANEL.y1, PANEL.z1) }, gUI);
    el('rect', { x: 8, y: 8, width: PW - 16, height: PH - 16, rx: 6, 'class': 'iso-screen-bezel' }, face);
    txt(face, 22, 33, 'Answer', 'iso-screen-title');
    var uiDot = el('circle', { cx: PW - 26, cy: 28, r: 3.5, 'class': 'iso-screen-dot' }, face);
    el('line', { x1: 22, y1: 43, x2: PW - 22, y2: 43, 'class': 'iso-screen-rule' }, face);
    [[0.86, 0], [0.66, 1]].forEach(function (b) {
      el('rect', { x: 22, y: 50 + b[1] * 10, width: (PW - 44) * b[0], height: 5, rx: 2.5, 'class': 'iso-screen-bar' }, face);
    });
    txt(face, 22, 76, 'Reasoning trace', 'iso-screen-sub');
    var trace = el('g', { 'class': 'iso-screen-trace' }, face);
    for (var tk = 0; tk < 3; tk++) {
      el('circle', { cx: 124 + tk * 24, cy: 72, r: 3.6 }, trace);
      if (tk < 2) el('line', { x1: 128 + tk * 24, y1: 72, x2: 144 + tk * 24, y2: 72 }, trace);
    }
    var chips = [], chipW = 48, chipH = 17;
    for (var ci = 0; ci < CITES.length; ci++) {
      var cxp = 22 + ci * (chipW + 8), cyp = PH - 16 - 8 - chipH;
      var cg = el('g', { 'class': 'iso-chip', opacity: 0.25 }, face);
      el('rect', { x: cxp, y: cyp, width: chipW, height: chipH, rx: 8.5 }, cg);
      txt(cg, cxp + chipW / 2, cyp + 12, 'cite ' + (ci + 1), 'iso-chip-text', 'middle');
      var u = (cxp + chipW / 2) / U, v = (cyp + chipH) / U;
      chips.push({ g: cg, w: [PANEL.x, PANEL.y1 - u, PANEL.z1 - v] });
    }
    var citeLines = chips.map(function (c, k) {
      var nw = nodeW(CITES[k]);
      return {
        el: el('line', { 'class': 'iso-cite-line' }, gCite),
        xa: sx(c.w[0], c.w[1]), ya: sy(c.w[0], c.w[1], c.w[2]), xb: sx(nw[0], nw[1]), yb: sy(nw[0], nw[1], nw[2]), a: 0
      };
    });
    // cite rings live in the slab layer so they ride its motion for free
    var citeRings = CITES.map(function (ni) {
      var w = nodeW(ni);
      return el('ellipse', { 'class': 'iso-cite-dot', cx: f1(sx(w[0], w[1])), cy: f1(sy(w[0], w[1], w[2])), rx: 10, ry: 6, opacity: 0 }, gSlab);
    });
    var panelBottom = [[PANEL.x, PANEL.y0 + 1.2, PANEL.z0], [PANEL.x, PANEL.y1 - 1.2, PANEL.z0]];

    // faint query lanes agent → first hop (end rides the slab layer)
    var gLanes = el('g', { 'class': 'iso-lanes', 'aria-hidden': 'true' }, root);
    var lanes = PATHS.map(function (p, i) {
      var at = agentTop(AGENTS[i]), n0 = nodeW(p[0]);
      var mx = (at[0] + n0[0]) / 2, my = (at[1] + n0[1]) / 2, mz = Math.max(at[2], n0[2]) + 1.4;
      // quadratic control point so the drawn curve matches the sampled arc
      return { el: el('path', { opacity: 0 }, gLanes), x0: f1(sx(at[0], at[1])), y0: f1(sy(at[0], at[1], at[2])), cx: f1(sx(mx, my)), cy: f1(sy(mx, my, mz)), x1: sx(n0[0], n0[1]), y1: sy(n0[0], n0[1], n0[2]) };
    });

    /* ---- packets (fireflies) ---- */
    var gPk = el('g', { 'class': 'iso-packets', 'aria-hidden': 'true' }, root);
    function pool(route, n, color, period, phase, ripple) {
      var out = { r: route, n: n, period: period, phase: phase, I: 0, items: [], ripple: ripple || null };
      for (var i = 0; i < n; i++) {
        var trail = el('circle', { r: 1.6, 'class': 'iso-pk-trail iso-pk-' + color, opacity: 0 }, gPk);
        var g = el('g', { opacity: 0 }, gPk);
        el('circle', { r: 12, fill: glow(color) }, g);
        el('circle', { r: 2.5, 'class': 'iso-pk-core' }, g);
        var tr = svg.createSVGTransform(); g.transform.baseVal.appendItem(tr);
        out.items.push({ g: g, tr: tr, trail: trail, tcx: trail.cx.baseVal, tcy: trail.cy.baseVal, o: -1 });
      }
      return out;
    }
    var R1 = [], R2 = [], R3q = [], R3c = [], R4 = [];
    [-1.2, 0, 1.2].forEach(function (dy, k) {
      var a = [flyFrom[0], flyFrom[1] + dy * 0.8, flyFrom[2]], b = [slot[0], slot[1] + dy * 0.35, slot[2]];
      R1.push(pool(makeRoute(arc(a, b, 1.6, 14, 0, 0, 0, 0, [])), 1, 'a', 2.6, k / 3));
    });
    [[0, 3], [1, 4], [2, 7]].forEach(function (p, k) {
      var y0 = ING.y + 1.3 + k * 1.2, n0 = nodeW(p[0]), n1 = nodeW(p[1]);
      var pts = [[ING.x + ING.w, y0, portZ, 0], [ING.x + ING.w + 1.4, y0, portZ + 0.15, 0], [SLAB.x - 0.4, n0[1], STOP + 0.25, 0.7], [n0[0], n0[1], STOP, 1], [n1[0], n1[1], STOP, 1]];
      R2.push(pool(makeRoute(pts), 1, 'c', 3.0, k / 3));
    });
    PATHS.forEach(function (p, i) {
      var at = agentTop(AGENTS[i]), n0 = nodeW(p[0]);
      var q = arc(at, n0, 1.4, 12, 0, 1, 0, 0, []);
      for (var k = 1; k < p.length; k++) { var nn = nodeW(p[k]); q.push([nn[0], nn[1], nn[2], 1, 0]); }
      // query lands on the last hop → ripple there; citation returns to the agent
      var last = nodeW(p[p.length - 1]);
      var rip = el('ellipse', { 'class': 'iso-ripple', cx: f1(sx(last[0], last[1])), cy: f1(sy(last[0], last[1], last[2])), rx: 6, ry: 3.6, opacity: 0 }, gRipples);
      // query and citation share one 2× period: out on the first half, back on the second
      R3q.push(pool(makeRoute(q), 1, 'a', 4.2, i * 0.17, rip));
      R3c.push(pool(makeRoute(reversed(q)), 1, 'b', 4.2, i * 0.17 + 0.5));
    });
    AGENTS.forEach(function (a, i) {
      var at = agentTop(a), pb = panelBottom[0], pe = panelBottom[1], t = i / 4;
      var end = [pb[0], pb[1] + (pe[1] - pb[1]) * t, pb[2]];
      R4.push(pool(makeRoute([[at[0], at[1], at[2], 0, 0], [end[0], end[1], end[2], 0, 1]]), 1, 'a', 2.4, i * 0.2));
    });
    var POOLS = [].concat(R1, R2, R3q, R3c, R4);

    /* ---- labels (screen-space, leader lines); slab/UI labels ride their layer ---- */
    var gLbl = el('g', { 'class': 'iso-labels' }, root);
    // Labels keep a constant on-screen size (k = viewBox units per CSS px),
    // so they are laid out in layout(), not here. o = desktop placement,
    // c = compact placement (offsets in on-screen px from the anchor).
    var labels = [];
    function label(parent, anchorW, title, short, sub, o, c, v, cls) {
      var g = el('g', { 'class': 'iso-label ' + (cls || ''), opacity: 0 }, parent);
      var L0 = {
        g: g, ax: sx(anchorW[0], anchorW[1]), ay: sy(anchorW[0], anchorW[1], anchorW[2]), o: o, c: c || o, v: v || c || o,
        title: title, short: short || title, ov: (v && v[3]) || short || title,
        line: el('polyline', { 'class': 'iso-leader', 'aria-hidden': 'true' }, g),
        dot: el('circle', { 'class': 'iso-leader-dot', cx: f1(sx(anchorW[0], anchorW[1])), cy: f1(sy(anchorW[0], anchorW[1], anchorW[2])), 'aria-hidden': 'true' }, g),
        key: txt(g, 0, 0, title, 'iso-lbl-key'),
        sub: sub ? txt(g, 0, 0, sub, 'iso-lbl-sub') : null
      };
      labels.push(L0);
      return g;
    }
    // placements: [dx, dy, 'start'|'end', overviewText?] in on-screen px
    // o = story (wide), c = story (compact < 560px), v = overview card
    var L = {
      docs: label(gLbl, [DOCS.x + DOCS.w / 2, DOCS.y + DOCS.d / 2, 1.0], 'Documents', null, 'Tax & financial records, PII', [-34, -26, 'end'], [-14, -18, 'end'], [-16, -18, 'end']),
      ing: label(gLbl, [ING.x + 0.3, ING.y + 0.3, ING.h], 'Ingestion', null, 'FastAPI services in Docker', [-10, -52, 'end'], [-6, -22, 'end'], [-6, -22, 'end']),
      graph: label(gSlab, [SLAB.x + 0.3, SLAB.y + 0.3, STOP], 'GraphRAG on Neo4j', 'GraphRAG', 'Knowledge graph with lineage', [8, -84, 'start'], [4, -28, 'start'], [4, -28, 'start', 'GraphRAG']),
      agents: label(gLbl, [AGENTS[4].x + AGENTS[4].w, AGENTS[4].y + AGENTS[4].d, 0], 'Five-agent system', 'Agents', 'Queries and cites the graph', [30, 44, 'start'], [12, 28, 'start'], [12, 28, 'start', 'Five agents']),
      ui: label(gUI, [PANEL.x, PANEL.y0 + 0.2, PANEL.z1 - 0.3], 'Explainable output', 'Output', 'Traceable reasoning in a JS UI', [-10, -56, 'end'], [-8, -12, 'end'], [-8, -12, 'end', 'Explainable UI']),
      lineage: label(gLbl, [ING.x + ING.w + 1.6, ING.y + ING.d / 2 - 0.4, portZ + 0.4], 'Lineage', null, null, [-16, 56, 'end'], null, null, 'iso-minor')
    };

    /* ---- camera focus per step (screen px), for the gentle scroll drift ---- */
    var CX = VB.x + VB.w / 2, CY = VB.y + VB.h / 2;   // re-centred on the fitted box in layout()
    var FOCUS = [
      null,
      [sx(6, 8), sy(6, 8, 1.5)],
      [sx(19, 8), sy(19, 8, 2.5)],
      [sx(23, 8), sy(23, 8, 3)],
      [sx(26, 7.5), sy(26, 7.5, 7)]
    ];

    var FOCUS0 = new Float32Array(2);

    /* ---------- step state (pure in T) ---------- */
    var tmp2 = new Float32Array(2);
    function routeAt(r, f, out) {
      var d = f * r.len, cl = r.cl, i = 1, n = cl.length;
      while (i < n - 1 && cl[i] < d) i++;
      var seg = cl[i] - cl[i - 1], t = seg > 0 ? (d - cl[i - 1]) / seg : 0;
      var w = r.ws[i - 1] + (r.ws[i] - r.ws[i - 1]) * t, wu = r.wu[i - 1] + (r.wu[i] - r.wu[i - 1]) * t;
      out[0] = r.xs[i - 1] + (r.xs[i] - r.xs[i - 1]) * t + w * offS[0] + wu * offU[0];
      out[1] = r.ys[i - 1] + (r.ys[i] - r.ys[i - 1]) * t + w * offS[1] + wu * offU[1];
    }
    var na = new Float32Array(NODES.length), nl = new Float32Array(NODES.length), lit = 0;

    function applyState() {
      var t = T, i, n;
      gFloor.setAttribute('opacity', (0.45 + 0.55 * ramp(t, 0, 0.45)).toFixed(3));
      gBound.setAttribute('opacity', (0.12 + 0.88 * ramp(t, 0.1, 0.8)).toFixed(3));

      // camera: drift toward the active stage (scroll-driven, so not under reduced motion)
      if (!reduced && !overview) {
        var seg = Math.min(3.999, t), si = Math.floor(seg), sp = smooth(seg - si);
        FOCUS0[0] = CX; FOCUS0[1] = CY;
        var fa = FOCUS[si] || FOCUS0, fb = FOCUS[si + 1];
        var fx = fa[0] + (fb[0] - fa[0]) * sp;
        var fy = fa[1] + (fb[1] - fa[1]) * sp;
        var sc = 1 + 0.012 * smooth(ramp(t, 0.5, 1.2));
        var tx = (CX - fx) * 0.03, ty = (CY - fy) * 0.03;
        cam.setAttribute('transform', 'translate(' + f1(CX + tx) + ' ' + f1(CY + ty) + ') scale(' + sc.toFixed(4) + ') translate(' + (-CX) + ' ' + (-CY) + ')');
      } else cam.removeAttribute('transform');

      var docsA = ramp(t, 1.0, 1.25), ingA = ramp(t, 1.05, 1.35);
      gDocs.setAttribute('opacity', ghost(docsA).toFixed(3));
      gIng.setAttribute('opacity', ghost(ingA).toFixed(3));
      L.docs.setAttribute('opacity', docsA.toFixed(3));
      L.ing.setAttribute('opacity', ingA.toFixed(3));
      for (i = 0; i < flyers.length; i++) {
        var s = ramp(t, 1.25 + i * 0.18, 1.55 + i * 0.18), g = flyers[i];
        if (s <= 0 || s >= 1) { g.setAttribute('opacity', 0); continue; }
        var e = smooth(s);
        routeAt(flyRoute, e, tmp2);
        g.setAttribute('transform', 'translate(' + f1(tmp2[0]) + ' ' + f1(tmp2[1]) + ') scale(' + (1 - 0.55 * e).toFixed(3) + ')');
        g.setAttribute('opacity', (Math.min(1, s * 6) * (1 - ramp(s, 0.82, 1))).toFixed(3));
      }

      var slabA = ramp(t, 2.0, 2.25);
      gSlabWrap.setAttribute('opacity', ghost(slabA).toFixed(3));
      slabShadow.setAttribute('opacity', (0.15 + 0.85 * slabA).toFixed(3));
      L.graph.setAttribute('opacity', slabA.toFixed(3));
      var gp = ramp(t, 2.12, 2.92) * NODES.length;
      for (n = 0; n < NODES.length; n++) {
        na[n] = clamp(gp - rank[n]);
        nodeEls[n].g.setAttribute('opacity', smooth(na[n]).toFixed(3));
      }
      for (var k = 0; k < EDGES.length; k++) edgeEls[k].setAttribute('opacity', (Math.min(na[EDGES[k][0]], na[EDGES[k][1]]) * 0.75).toFixed(3));
      gLineage.setAttribute('opacity', (ramp(t, 2.45, 2.85) * (1 - 0.65 * ramp(t, 3.0, 3.3))).toFixed(3));
      L.lineage.setAttribute('opacity', (ramp(t, 2.45, 2.85) * (1 - ramp(t, 3.0, 3.2))).toFixed(3));

      for (i = 0; i < agentEls.length; i++) {
        var o = agentEls[i];
        var r = smooth(ramp(t, 3.0 + o.i * 0.06, 3.32 + o.i * 0.06));
        o.g.setAttribute('opacity', ghost(Math.min(1, r * 1.6)).toFixed(3));
        var h = Math.max(0.25, o.a.h * (t < 3 ? 1 : r));
        if (Math.abs(h - o.hCur) > 0.001) {
          o.hCur = h;
          setBox(o.b, o.a.x, o.a.y, 0, o.a.w, o.a.d, h);
          var bz = h - 0.55, ax = o.a.x, ay = o.a.y, aw = o.a.w, ad = o.a.d;
          o.band.setAttribute('points', poly([[ax, ay + ad, bz - 0.11], [ax + aw, ay + ad, bz - 0.11], [ax + aw, ay, bz - 0.11], [ax + aw, ay, bz + 0.11], [ax + aw, ay + ad, bz + 0.11], [ax, ay + ad, bz + 0.11]]));
          o.tag.setAttribute('transform', planeY(ax, ay + ad, Math.max(0, h - 0.95)));
          var cx = f1(sx(ax + aw / 2, ay + ad / 2)), cy = f1(sy(ax + aw / 2, ay + ad / 2, h));
          o.led.setAttribute('cx', cx); o.led.setAttribute('cy', cy);
          o.halo.setAttribute('cx', cx); o.halo.setAttribute('cy', cy);
        }
        o.ledA = r;
      }
      L.agents.setAttribute('opacity', ramp(t, 3.05, 3.35).toFixed(3));

      lit = ramp(t, 3.35, 3.9) * PATHS.length;
      for (n = 0; n < NODES.length; n++) nl[n] = 0;
      var pe = 0;
      for (var p = 0; p < PATHS.length; p++) {
        var la = clamp(lit - p);
        for (var q = 0; q < PATHS[p].length; q++) nl[PATHS[p][q]] = Math.max(nl[PATHS[p][q]], la);
        for (q = 0; q < PATHS[p].length - 1; q++) pathEdgeEls[pe++].setAttribute('opacity', (la * 0.9).toFixed(3));
      }
      var cA = ramp(t, 4.45, 4.9);
      for (n = 0; n < NODES.length; n++) {
        var lv = nl[n], ix = CITES.indexOf(n);
        if (ix >= 0) lv = Math.max(lv, ramp(t, 4.45 + ix * 0.12, 4.7 + ix * 0.12));
        nodeEls[n].halo.setAttribute('opacity', (lv * 0.8).toFixed(3));
        var isLit = lv > 0.5;
        if (isLit !== nodeEls[n].lit) { nodeEls[n].lit = isLit; nodeEls[n].core.setAttribute('class', isLit ? 'iso-node-core is-lit' : 'iso-node-core'); }
      }

      gBeam.setAttribute('opacity', ramp(t, 4.0, 4.35).toFixed(3));
      var uiA = ramp(t, 4.05, 4.4);
      uiRise = (1 - smooth(ramp(t, 4.05, 4.55))) * 34;
      gUIWrap.setAttribute('opacity', ghost(uiA).toFixed(3));
      panelShadow.setAttribute('opacity', (0.1 + 0.5 * uiA).toFixed(3));
      gUI.setAttribute('class', uiA >= 1 ? 'iso-ui is-on' : 'iso-ui');
      L.ui.setAttribute('opacity', uiA.toFixed(3));
      for (var c = 0; c < chips.length; c++) {
        var ca = ramp(t, 4.45 + c * 0.12, 4.7 + c * 0.12);
        chips[c].g.setAttribute('opacity', (0.25 + 0.75 * ca).toFixed(3));
        citeLines[c].a = ca;
        citeRings[c].setAttribute('opacity', ca.toFixed(3));
      }
      gCite.setAttribute('opacity', cA > 0 ? 1 : 0);

      var i1 = ramp(t, 1.25, 1.5) * (1 - 0.55 * ramp(t, 2.0, 2.3));
      var i2 = ramp(t, 2.1, 2.3) * (1 - 0.55 * ramp(t, 3.0, 3.3));
      var i3 = ramp(t, 3.3, 3.5) * (1 - 0.35 * ramp(t, 4.0, 4.3));
      var i4 = ramp(t, 4.15, 4.4);
      if (overview) { i1 = 0.9; i2 = 0.9; i3 = 0.9; i4 = 0.85; }
      for (i = 0; i < 3; i++) { R1[i].I = i1; R2[i].I = i2; }
      for (i = 0; i < 5; i++) { var pa = clamp(lit - i); R3q[i].I = i3 * pa; R3c[i].I = i3 * pa; R4[i].I = i4; lanes[i].el.setAttribute('opacity', (i3 * pa * 0.7).toFixed(3)); }
      if (overview) gLineage.setAttribute('opacity', '0.3');
      stateSet = true;
    }

    /* ---------- per-frame (ambient) ---------- */
    function frame(time) {
      var tt = time * 0.001, i, k;
      if (reduced) { bob = 0; bobUI = 0; ptr[0] = ptr[1] = 0; }
      else {
        var amp = overview ? 0.6 : 1;
        bob = Math.sin(tt * 1.05) * 3 * amp;
        bobUI = Math.sin(tt * 0.85 + 1.2) * 3.5 * amp;
        ptr[0] += (ptr[2] - ptr[0]) * 0.06;
        ptr[1] += (ptr[3] - ptr[1]) * 0.06;
      }
      // parallax: higher layers move further with the pointer
      offS[0] = ptr[0] * 7; offS[1] = ptr[1] * 4 + bob;
      offU[0] = ptr[0] * 15; offU[1] = ptr[1] * 8 + bobUI + uiRise;
      gSlab.setAttribute('transform', 'translate(' + f1(offS[0]) + ' ' + f1(offS[1]) + ')');
      gUI.setAttribute('transform', 'translate(' + f1(offU[0]) + ' ' + f1(offU[1]) + ')');
      // hovering slab: shadow tightens as it dips
      slabShadow.setAttribute('fill-opacity', (0.9 - bob * 0.04).toFixed(3));
      boundLine.setAttribute('stroke-dashoffset', f1(-(tt * 8) % 104));

      for (i = 0; i < lanes.length; i++) {
        var ln = lanes[i];
        ln.el.setAttribute('d', 'M' + ln.x0 + ' ' + ln.y0 + 'Q' + f1(ln.cx + offS[0] * 0.5) + ' ' + f1(ln.cy + offS[1] * 0.5) + ' ' + f1(ln.x1 + offS[0]) + ' ' + f1(ln.y1 + offS[1]));
      }
      for (i = 0; i < lineageLines.length; i++) {
        var ll = lineageLines[i];
        ll.el.setAttribute('x2', f1(ll.x2 + offS[0])); ll.el.setAttribute('y2', f1(ll.y2 + offS[1]));
      }
      var bl0 = R4[0].r, bl4 = R4[4].r, m0 = bl0.xs.length - 1;
      beamPoly.setAttribute('points',
        f1(bl4.xs[0]) + ',' + f1(bl4.ys[0]) + ' ' + f1(bl0.xs[0]) + ',' + f1(bl0.ys[0]) + ' ' +
        f1(bl0.xs[m0] + offU[0]) + ',' + f1(bl0.ys[m0] + offU[1]) + ' ' + f1(bl4.xs[m0] + offU[0]) + ',' + f1(bl4.ys[m0] + offU[1]));
      for (i = 0; i < beamLines.length; i++) {
        var r = R4[i].r, n = r.xs.length - 1, b = beamLines[i];
        b.setAttribute('x1', f1(r.xs[0])); b.setAttribute('y1', f1(r.ys[0]));
        b.setAttribute('x2', f1(r.xs[n] + offU[0])); b.setAttribute('y2', f1(r.ys[n] + offU[1]));
      }
      for (i = 0; i < citeLines.length; i++) {
        var cl = citeLines[i];
        cl.el.setAttribute('x1', f1(cl.xa + offU[0])); cl.el.setAttribute('y1', f1(cl.ya + offU[1]));
        cl.el.setAttribute('x2', f1(cl.xb + offS[0])); cl.el.setAttribute('y2', f1(cl.yb + offS[1]));
        cl.el.setAttribute('opacity', cl.a.toFixed(3));
      }
      for (i = 0; i < leds.length; i++) {
        leds[i].setAttribute('opacity', reduced ? 1 : (Math.sin(tt * (1.3 + (i % 4) * 0.7) + i * 1.7) > -0.35 ? 1 : 0.25));
      }

      // packets: eased travel (gentle departure/arrival) + short trail
      for (k = 0; k < agentEls.length; k++) agentEls[k].flash = 0;
      for (var p = 0; p < POOLS.length; p++) {
        var pl = POOLS[p];
        for (k = 0; k < pl.n; k++) {
          var it = pl.items[k];
          if (pl.I <= 0.01) {
            if (it.o !== 0) { it.g.style.opacity = 0; it.trail.style.opacity = 0; it.o = 0; }
            continue;
          }
          var f = (tt / pl.period + pl.phase + k / pl.n) % 1;
          // R3 pools travel during the first half of their period, rest during the second
          var isR3 = p >= 6 && p < 16;
          var g = isR3 ? clamp(f * 2) : f;
          var e = g * g * (3 - 2 * g);
          routeAt(pl.r, e, tmp2);
          var op = pl.I * Math.min(1, g * 7, (1 - g) * 7);
          if (isR3 && f >= 0.5) op = 0;
          it.tr.setTranslate(tmp2[0], tmp2[1]);
          var eb = Math.max(0, e - 0.035);
          routeAt(pl.r, eb, tmp2);
          it.tcx.value = tmp2[0]; it.tcy.value = tmp2[1];
          op = Math.round(op * 100) / 100;
          if (op !== it.o) { it.g.style.opacity = op; it.trail.style.opacity = op * 0.55; }
          it.o = op;
          // arrival choreography
          if (pl.ripple) {
            var rk = isR3 ? clamp((f - 0.42) / 0.3) : 0;
            pl.ripple.setAttribute('opacity', (rk > 0 && rk < 1 ? pl.I * (1 - rk) : 0).toFixed(3));
            pl.ripple.setAttribute('rx', f1(5 + 16 * rk)); pl.ripple.setAttribute('ry', f1(3 + 9.6 * rk));
          }
          if (p >= 11 && p < 16 && g > 0.85 && f < 0.5) agentByIndex[p - 11].flash = pl.I * (1 - (g - 0.85) / 0.15) ;
        }
      }
      for (i = 0; i < agentEls.length; i++) {
        var o = agentEls[i], pulse = reduced ? 1 : 0.65 + 0.25 * Math.sin(tt * 2.1 + o.i * 1.3);
        o.led.setAttribute('opacity', (0.25 + 0.75 * o.ledA).toFixed(3));
        o.halo.setAttribute('opacity', Math.min(1, o.ledA * pulse + o.flash * 0.6).toFixed(3));
        o.halo.setAttribute('r', f1(17 + o.flash * 9));
      }
    }

    /* ---------- loop control ---------- */
    var raf = 0, inView = false, alive = true;
    function tick(now) { raf = 0; if (!alive) return; frame(now); schedule(); }
    function schedule() { if (!raf && alive && !reduced && inView && !document.hidden) raf = requestAnimationFrame(tick); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    // static frame: fixed time so reduced-motion layouts are deterministic
    function staticFrame() { frame(reduced ? 1150 : performance.now()); }

    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        inView = es[es.length - 1].isIntersecting;
        if (inView) schedule(); else stop();
      }, { rootMargin: '80px' });
      io.observe(container);
    } else inView = true;
    function onVis() { if (document.hidden) stop(); else schedule(); }
    document.addEventListener('visibilitychange', onVis);
    function onMQ(e) { reduced = !!opts.reducedMotion || e.matches; applyState(); if (reduced) { stop(); staticFrame(); } else schedule(); }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMQ); else if (mq.addListener) mq.addListener(onMQ); }
    // pointer parallax (story only; mouse/pen only so touch scrolling doesn't tilt the scene)
    function onPtr(e) {
      if (e.pointerType === 'touch') return;
      ptr[2] = clamp(e.clientX / (window.innerWidth || 1)) * 2 - 1;
      ptr[3] = clamp(e.clientY / (window.innerHeight || 1)) * 2 - 1;
    }
    function onLeave() { ptr[2] = 0; ptr[3] = 0; }
    if (!overview) {
      window.addEventListener('pointermove', onPtr, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }

    /* ---------- responsive fit: constant-size labels + viewBox fitted to content ----------
       Labels keep a constant on-screen size, so the content box depends on the
       scale and the scale on the box: iterate a few passes (converges fast).
       The box is measured with every moving layer at rest, so it does not
       change between steps or frames (no jumping). */
    var ro = null, compact = false, vb = { x: VB.x, y: VB.y, w: VB.w, h: VB.h };
    var FIT = [gFloor, gBound, gDocs, gIng, gSlabWrap, gAgents, gUIWrap, gLbl];
    function placeOne(l, k, dx, dy, endA, big) {
      var tPx = (overview ? 12 : compact ? 11.5 : 13) * k, sPx = 11.5 * k, gap = 4 * k;
      var lx = l.ax + dx * k, ly = l.ay + dy * k, ex = lx + (endA ? 5 : -5) * k;
      l.line.setAttribute('points', f1(l.ax) + ',' + f1(l.ay) + ' ' + f1(ex) + ',' + f1(ly) + ' ' + f1(lx) + ',' + f1(ly));
      var tx = lx + (endA ? -gap : gap), hasSub = l.sub && big;
      l.key.setAttribute('x', f1(tx)); l.key.setAttribute('y', f1(ly + (hasSub ? -gap * 0.6 : tPx * 0.36)));
      if (l.sub) { l.sub.setAttribute('x', f1(tx)); l.sub.setAttribute('y', f1(ly + sPx * 1.25)); }
    }
    function textBox(l, big) {
      var b = l.key.getBBox(), x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
      if (l.sub && big) {
        var c = l.sub.getBBox();
        x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.width); y1 = Math.max(y1, c.y + c.height);
      }
      return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }
    function placeLabels(k) {
      var big = !compact && !overview, boxes = [];
      for (var i = 0; i < labels.length; i++) {
        var l = labels[i], p = overview ? l.v : compact ? l.c : l.o, endA = p[2] === 'end';
        l.dot.setAttribute('r', f1((overview ? 1.8 : 2.2) * k));
        l.key.textContent = overview ? l.ov : compact ? l.short : l.title;
        l.key.setAttribute('text-anchor', endA ? 'end' : 'start');
        if (l.sub) l.sub.setAttribute('text-anchor', endA ? 'end' : 'start');
        var dy = p[1];
        placeOne(l, k, p[0], dy, endA, big);
        if ((overview || compact) && l.g.getAttribute('class').indexOf('iso-minor') >= 0) continue;
        // collision pass: nudge vertically (away from the label it hits) until clear
        var bx = textBox(l, big), m = 3 * k;
        for (var guard = 0; guard < 8; guard++) {
          var hit = null;
          for (var q = 0; q < boxes.length; q++) {
            var o = boxes[q];
            if (bx.x0 < o.x1 + m && bx.x1 > o.x0 - m && bx.y0 < o.y1 + m && bx.y1 > o.y0 - m) { hit = o; break; }
          }
          if (!hit) break;
          var up = (bx.y0 + bx.y1) < (hit.y0 + hit.y1);
          var shift = up ? (bx.y1 - hit.y0 + m) : (hit.y1 - bx.y0 + m);
          dy += (up ? -shift : shift) / k;
          placeOne(l, k, p[0], dy, endA, big);
          bx = textBox(l, big);
        }
        boxes.push(bx);
      }
    }
    function measure() {
      // rest pose: no camera, no bob/parallax, UI at its final height
      var camT = cam.getAttribute('transform'), sT = gSlab.getAttribute('transform'), uT = gUI.getAttribute('transform');
      cam.removeAttribute('transform'); gSlab.removeAttribute('transform'); gUI.removeAttribute('transform');
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < FIT.length; i++) {
        if (FIT[i] === gLbl) { world.w = x1 - x0; world.h = y1 - y0; }   // gLbl is last: world-only box so far
        var b = FIT[i].getBBox();
        if (!b.width && !b.height) continue;
        if (b.x < x0) x0 = b.x; if (b.y < y0) y0 = b.y;
        if (b.x + b.width > x1) x1 = b.x + b.width; if (b.y + b.height > y1) y1 = b.y + b.height;
      }
      if (camT) cam.setAttribute('transform', camT);
      if (sT) gSlab.setAttribute('transform', sT);
      if (uT) gUI.setAttribute('transform', uT);
      return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    }
    var world = { w: 1, h: 1 }, fitRatio = 1;
    function fit() {
      svg.classList.toggle('iso-compact', compact && !overview);
      var cr = container.getBoundingClientRect();
      for (var pass = 0; pass < 10; pass++) {
        var r = svg.getBoundingClientRect(), prevW = vb.w, prevH = vb.h;
        var rw = r.width || cr.width, rh = r.height || rw * vb.h / vb.w;
        var scale = Math.min(rw / vb.w, rh / vb.h) || 1;
        var k = 1 / scale;
        svg.style.setProperty('--iso-k', k.toFixed(3));
        placeLabels(k);
        var b;
        try { b = measure(); } catch (e) { return; }
        if (!b) return;
        // overview: a few px for halos/strokes; story: room for the gentle camera drift
        var px = overview ? 6 * k : b.w * 0.025 + 4 * k, py = overview ? 6 * k : b.h * 0.03 + 4 * k;
        vb = { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py };
        svg.setAttribute('viewBox', f1(vb.x) + ' ' + f1(vb.y) + ' ' + f1(vb.w) + ' ' + f1(vb.h));
        if (Math.abs(vb.w - prevW) < vb.w * 0.002 && Math.abs(vb.h - prevH) < vb.h * 0.002) break;   // converged
      }
      // drawing scale with labels vs. without (1 = labels cost nothing)
      fitRatio = Math.min(rw / vb.w, rh / vb.h) / Math.min(rw / world.w, rh / world.h);
    }
    function layout() {
      var cr = container.getBoundingClientRect();
      if (!cr.width) return;
      compact = cr.width < COMPACT_W;
      fit();
      // wide labels crowding a small drawing: fall back to short labels
      if (!compact && !overview && fitRatio < 0.8) { compact = true; fit(); }
      CX = vb.x + vb.w / 2; CY = vb.y + vb.h / 2;
      if (stateSet) { applyState(); if (!raf) staticFrame(); }
    }
    if ('ResizeObserver' in window) { ro = new ResizeObserver(layout); ro.observe(container); }
    else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (alive) layout(); });

    container.appendChild(svg);
    if (overview) T = 5;
    layout();
    applyState();
    staticFrame();
    schedule();

    return {
      steps: 5,
      setStep: function (index, progress) {
        if (overview) return;
        var i = Math.max(0, Math.min(4, Math.floor(+index || 0)));
        var nt = i + clamp(+progress || 0);
        if (nt === T && stateSet) return;
        T = nt;
        applyState();
        if (!raf) staticFrame();
      },
      destroy: function () {
        alive = false; stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
        document.removeEventListener('visibilitychange', onVis);
        if (!overview) {
          window.removeEventListener('pointermove', onPtr);
          document.removeEventListener('pointerleave', onLeave);
        }
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMQ); else if (mq.removeListener) mq.removeListener(onMQ); }
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      }
    };
  }

  var api = { mount: mount };
  window.GraphragScene = api;
  window.IsoScene = api;   // backward-compatible alias
})();
