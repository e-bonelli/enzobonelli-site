/* ============================================================
   VoiceScene — isometric real-time voice agent architecture (Scene API v2)

   window.VoiceScene.mount(container, { reducedMotion?, mode? }) -> {
     steps: 5,
     setStep(index 0..4, progress 0..1),  // story mode; no-op in overview
     destroy()
   }
   - mode 'story' (default): state is a pure function of (index, progress);
     ambient motion only adds a time phase on top. p = 1 is a complete
     state for that step, so eased Next/Back transitions read cleanly.
   - mode 'overview': the finished call loop, every component on, fireflies
     on every edge (caller -> telephony -> STT -> LLM -> TTS -> telephony ->
     caller), no camera drift or parallax, compact title-only labels.
   The viewBox is fitted to the drawing + labels (labels keep a constant
   on-screen size), so the scene fills its container at any size.
   Inline SVG, true isometric projection (30deg), no 3D library, no filters.
   Every SVG node is created once in mount(); the rAF loop only mutates
   transforms / lengths / opacity on existing nodes.
   ============================================================ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var S = 46;                     // px per world unit
  var CX = 0.8660254 * S;         // cos 30
  var HY = 0.5 * S;               // sin 30
  var VB = { x: -440, y: -120, w: 1120, h: 720 };
  var RX1 = 1.2247449 * S;        // iso circle: rx per world radius
  var RY1 = 0.7071068 * S;        // iso circle: ry per world radius
  var uid = 0;
  var COMPACT_W = 600;            // story containers narrower than this use short labels

  function sx(x, y) { return (x - y) * CX; }
  function sy(x, y, z) { return (x + y) * HY - (z || 0) * S; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function P(x, y, z) { return r1(sx(x, y)) + ',' + r1(sy(x, y, z)); }
  function poly(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(P(list[i][0], list[i][1], list[i][2]));
    return out.join(' ');
  }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp(v); return v * v * (3 - 2 * v); }
  // matrix that maps a horizontal plane at height z (local u along +x,
  // v along +y, in px) onto the screen; origin at world (x, y, z)
  function planeMatrix(x, y, z) {
    return 'matrix(0.8660254 0.5 -0.8660254 0.5 ' + r1(sx(x, y)) + ' ' + r1(sy(x, y, z)) + ')';
  }

  /* ---------- world layout (iso floor units) ---------- */
  var B = {
    caller: { x0: 0, x1: 2.2, y0: 2.8, y1: 5.2, h: 0.18 },
    phone:  { x0: 0.85, x1: 1.1, y0: 3.45, y1: 4.55, z0: 0.18, h: 1.5 },
    tel:    { x0: 3, x1: 5, y0: 3, y1: 5, h: 1.2 },
    stt:    { x0: 7, x1: 9, y0: 1, y1: 3, h: 1.0 },
    llm:    { x0: 10.8, x1: 13.2, y0: 2.8, y1: 5.2, h: 2.0 },
    tts:    { x0: 7, x1: 9, y0: 5, y1: 7, h: 1.0 }
  };
  var PLATE = { x0: -0.6, x1: 14.9, y0: -0.2, y1: 8.3, t: 0.35 };
  var BOUND = { x0: 6, x1: 14.4, y0: 0.2, y1: 7.8 };
  // elevated arc between two block tops, sampled as a polyline
  function arc(a, b, peak) {
    var out = [];
    for (var i = 0; i <= 24; i++) {
      var u = i / 24;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + peak * 4 * u * (1 - u)]);
    }
    return out;
  }
  var ROUTES = {
    inb: [[2.2, 3.5], [6.5, 3.5], [6.5, 2], [7, 2]],          // caller -> telephony -> STT
    tx:  arc([8, 2, 1.0], [11.7, 3.5, 2.0], 1.25),            // STT -> LLM (transcript), elevated
    rt:  arc([11.7, 4.6, 2.0], [8, 6, 1.0], 1.05),            // LLM -> TTS (reply text), elevated
    out: [[8, 7], [8, 7.5], [4.2, 7.5], [4.2, 4.5], [2.2, 4.5]] // TTS -> telephony -> caller
  };
  var ORBIT = { x: 12, y: 4, z: 1.3, r: 1.95 };

  function makeRoute(pts) {
    var seg = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var ddx = pts[i][0] - pts[i - 1][0], ddy = pts[i][1] - pts[i - 1][1], ddz = (pts[i][2] || 0) - (pts[i - 1][2] || 0);
      var d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
      seg.push(d); total += d;
    }
    return { pts: pts, seg: seg, total: total };
  }
  var Q = { x: 0, y: 0, z: 0 };          // scratch point (no per-frame allocation)
  function at(route, s) {
    var p = route.pts, seg = route.seg;
    if (s <= 0) { Q.x = p[0][0]; Q.y = p[0][1]; Q.z = p[0][2] || 0; return Q; }
    for (var i = 0; i < seg.length; i++) {
      if (s <= seg[i]) {
        var k = s / seg[i];
        Q.x = p[i][0] + (p[i + 1][0] - p[i][0]) * k;
        Q.y = p[i][1] + (p[i + 1][1] - p[i][1]) * k;
        Q.z = (p[i][2] || 0) + ((p[i + 1][2] || 0) - (p[i][2] || 0)) * k;
        return Q;
      }
      s -= seg[i];
    }
    Q.x = p[p.length - 1][0]; Q.y = p[p.length - 1][1]; Q.z = p[p.length - 1][2] || 0; return Q;
  }
  function routeD(pts, z) {
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + P(pts[i][0], pts[i][1], (pts[i][2] || 0) + z);
    return d;
  }

  /* ---------- copy ---------- */
  // anchor = world point; o / c / v = [dx, dy, 'start'|'end'] in on-screen px
  // for story (wide), story (compact < 560px) and overview. Labels sit in the
  // empty triangles above and below the plate so they add height, not width.
  var LABELS = [
    { id: 'caller', anchor: [1, 4, 1.62], o: [-22, -16, 'end'], c: [-18, -12, 'end'], v: [-18, -10, 'end'],
      title: 'Caller', short: 'Caller', ov: 'Caller', sub: 'Technician on a phone line' },
    { id: 'tel', anchor: [3.45, 3.45, 2.05], o: [-16, -86, 'end'], c: [-10, -42, 'end'], v: [-10, -42, 'end'],
      title: 'Telephony', short: 'Telephony', ov: 'Telephony', sub: 'Twilio Media Streams over WebSocket' },
    { id: 'stt', anchor: [8, 2, 1.0], o: [12, -84, 'start'], c: [8, -58, 'start'], v: [8, -58, 'start'],
      title: 'Speech-to-text', short: 'STT', ov: 'Speech-to-text', sub: 'Whisper with VAD turn-taking' },
    { id: 'llm', anchor: [10.8, 2.8, 2.0], o: [12, -64, 'start'], c: [8, -46, 'start'], v: [8, -46, 'start'],
      title: 'LLM agent', short: 'LLM agent', ov: 'LLM agent', sub: 'Open-weight model' },
    { id: 'tts', anchor: [9, 7, 0], o: [-24, 44, 'end'], c: [-12, 28, 'end'], v: [-12, 28, 'end'],
      title: 'Text-to-speech', short: 'TTS', ov: 'Text-to-speech', sub: 'Low-latency synthesis, streamed back' },
    { id: 'bound', anchor: [14.4, 7.8, 0], o: [16, 26, 'start'], c: [10, 22, 'start'], v: [10, 22, 'start'],
      title: 'Self-hosted boundary', short: 'Self-hosted', ov: 'Self-hosted', sub: 'All three models run in-house' },
    { id: 'loop', anchor: [5.6, 7.5, 0], o: [-36, 22, 'end'], c: [-12, 20, 'end'], v: [-12, 20, 'end'], minor: true,
      title: 'Streaming end to end', short: 'Streaming', ov: 'Streaming', sub: '' }
  ];
  var CHECKS = ['intake', 'details', 'follow-up'];
  // camera focus per step (story only): [screen x, screen y, zoom]; kept
  // gentle so the fitted viewBox never clips
  var CAM = [[-60, 120, 1.015], [80, 150, 1.01], [250, 200, 1.015], [330, 250, 1.02], [120, 240, 1.0]];

  function mount(container, opts) {
    opts = opts || {};
    var id = 'vs' + (++uid);
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!opts.reducedMotion || !!(mq && mq.matches);
    var overview = opts.mode === 'overview';

    var root = document.createElement('div');
    root.className = overview ? 'vs is-overview' : 'vs';
    var svg = el('svg', {
      class: 'vs-svg', viewBox: VB.x + ' ' + VB.y + ' ' + VB.w + ' ' + VB.h,
      role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', preserveAspectRatio: 'xMidYMid meet'
    });
    var ttl = el('title', { id: id + '-t' }, svg);
    ttl.textContent = 'Real-time voice agent architecture';
    var dsc = el('desc', { id: id + '-d' }, svg);
    dsc.textContent = 'A field technician calls on a regular phone line. Telephony streams the call audio over a ' +
      'WebSocket (Twilio Media Streams) into a self-hosted boundary: speech-to-text (Whisper with voice-activity ' +
      'turn-taking) sends the transcript to an LLM agent on a self-hosted open-weight model, which handles intake, ' +
      'reasoning and negotiation; its reply is synthesized by low-latency text-to-speech and streamed back through ' +
      'telephony to the caller. Streaming end to end, no record-then-process round trips.';
    root.appendChild(svg);
    container.appendChild(root);

    /* ---------- defs ---------- */
    var defs = el('defs', null, svg);
    function halo(name, cls) {
      var g = el('radialGradient', { id: id + name }, defs);
      el('stop', { offset: '0', class: cls, 'stop-opacity': '0.6' }, g);
      el('stop', { offset: '0.4', class: cls, 'stop-opacity': '0.16' }, g);
      el('stop', { offset: '1', class: cls, 'stop-opacity': '0' }, g);
    }
    halo('hA', 'vs-st-a'); halo('hB', 'vs-st-b'); halo('hC', 'vs-st-c'); halo('hT', 'vs-st-t');
    var pg = el('linearGradient', { id: id + 'plate', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', class: 'vs-st-plate0' }, pg);
    el('stop', { offset: '1', class: 'vs-st-plate1' }, pg);
    var cg = el('linearGradient', { id: id + 'core', x1: '0', y1: '1', x2: '0', y2: '0' }, defs);
    el('stop', { offset: '0', class: 'vs-st-a', 'stop-opacity': '0.95' }, cg);
    el('stop', { offset: '1', class: 'vs-st-a', 'stop-opacity': '0.25' }, cg);

    var shade = el('linearGradient', { id: id + 'shade', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.07' }, shade);
    el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.22' }, shade);
    var drop = el('radialGradient', { id: id + 'drop' }, defs);
    el('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.55' }, drop);
    el('stop', { offset: '0.6', 'stop-color': '#000', 'stop-opacity': '0.22' }, drop);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' }, drop);

    // depth layers: drop shadow (far) -> camera { world, labels (near) }
    var gShadow = el('g', { 'aria-hidden': 'true', class: 'vs-shadow' }, svg);
    var pc = { x: (PLATE.x0 + PLATE.x1) / 2, y: (PLATE.y0 + PLATE.y1) / 2 };
    el('ellipse', { cx: r1(sx(pc.x, pc.y)), cy: r1(sy(pc.x, pc.y, -PLATE.t) + 34), rx: r1(10.4 * RX1), ry: r1(7.4 * RY1), fill: 'url(#' + id + 'drop)' }, gShadow);
    var gCam = el('g', { class: 'vs-cam' }, svg);
    var deco = el('g', { 'aria-hidden': 'true', class: 'vs-world' }, gCam);
    function addTr(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }
    var trShadow = addTr(gShadow), trWorld = addTr(deco);

    /* ---------- floor plate ---------- */
    var gFloor = el('g', { class: 'vs-floor' }, deco);
    el('polygon', { class: 'vs-plate-side vs-l', points: poly([[PLATE.x0, PLATE.y1, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y1, -PLATE.t], [PLATE.x0, PLATE.y1, -PLATE.t]]) }, gFloor);
    el('polygon', { class: 'vs-plate-side vs-r', points: poly([[PLATE.x1, PLATE.y0, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y1, -PLATE.t], [PLATE.x1, PLATE.y0, -PLATE.t]]) }, gFloor);
    el('polygon', { class: 'vs-plate', fill: 'url(#' + id + 'plate)', points: poly([[PLATE.x0, PLATE.y0, 0], [PLATE.x1, PLATE.y0, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x0, PLATE.y1, 0]]) }, gFloor);
    var gd = '';
    for (var gx = Math.ceil(PLATE.x0); gx <= PLATE.x1; gx++) gd += 'M' + P(gx, PLATE.y0, 0) + 'L' + P(gx, PLATE.y1, 0);
    for (var gy = Math.ceil(PLATE.y0); gy <= PLATE.y1; gy++) gd += 'M' + P(PLATE.x0, gy, 0) + 'L' + P(PLATE.x1, gy, 0);
    el('path', { class: 'vs-grid', d: gd }, gFloor);
    el('polyline', { class: 'vs-plate-rim', points: poly([[PLATE.x0, PLATE.y1, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y0, 0]]) }, gFloor);

    // phone ring pulses (iso circles on the floor around the caller tile)
    var ringC = { x: sx(1.1, 4), y: sy(1.1, 4, 0) };
    var rings = [];
    for (var ri = 0; ri < 3; ri++) {
      rings.push({ e: el('ellipse', { class: 'vs-ring', cx: r1(ringC.x), cy: r1(ringC.y), rx: 10, ry: 6 }, gFloor), o: -1 });
    }

    /* ---------- self-hosted boundary ---------- */
    var gBound = el('g', { class: 'vs-bound' }, deco);
    var bpts = poly([[BOUND.x0, BOUND.y0, 0], [BOUND.x1, BOUND.y0, 0], [BOUND.x1, BOUND.y1, 0], [BOUND.x0, BOUND.y1, 0]]);
    el('polygon', { class: 'vs-bound-fill', points: bpts }, gBound);
    el('polygon', { class: 'vs-bound-line', points: bpts }, gBound);
    // floor-printed tag along the front-left edge
    var ft = el('text', { class: 'vs-floortext vs-minor', transform: planeMatrix(10.4, BOUND.y1 - 0.28, 0) }, gBound);
    ft.textContent = 'self-hosted';

    /* ---------- wires ---------- */
    var gWire = el('g', { class: 'vs-wires' }, deco);
    var routes = {}, wires = {};
    var gArc = el('g', { class: 'vs-arcs' }), arcBase = [];        // attached after the blocks
    ['inb', 'tx', 'rt', 'out'].forEach(function (k) {
      routes[k] = makeRoute(ROUTES[k]);
      var elevated = k === 'tx' || k === 'rt';
      var d = routeD(ROUTES[k], 0.02), parent = elevated ? gArc : gWire;
      var base = el('path', { class: elevated ? 'vs-wire vs-arc' : 'vs-wire', d: d }, parent);
      if (elevated) arcBase.push(base);
      wires[k] = el('path', { class: 'vs-wire-on vs-w-' + k, d: d }, parent);
    });
    var loopPath = el('path', { class: 'vs-loop', d: routeD(ROUTES.inb, 0.02) + routeD(ROUTES.out, 0.02) + routeD([[2.2, 4.5], [2.2, 3.5]], 0.02) }, gWire);
    var loopArc = el('path', { class: 'vs-loop', d: routeD(ROUTES.tx, 0.02) + routeD(ROUTES.rt, 0.02) }, gArc);

    /* ---------- floor glows under blocks ---------- */
    var gGlow = el('g', { class: 'vs-glows' }, deco);
    function floorGlow(b, grad, scale) {
      var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = Math.max(b.x1 - b.x0, b.y1 - b.y0) * scale;
      return el('ellipse', { cx: r1(sx(cx, cy)), cy: r1(sy(cx, cy, 0)), rx: r1(r * RX1), ry: r1(r * RY1), fill: 'url(#' + id + grad + ')', class: 'vs-glow' }, gGlow);
    }
    var glow = {
      caller: floorGlow(B.caller, 'hA', 1.0), tel: floorGlow(B.tel, 'hT', 1.1),
      stt: floorGlow(B.stt, 'hB', 1.1), llm: floorGlow(B.llm, 'hA', 1.15), tts: floorGlow(B.tts, 'hC', 1.1)
    };

    /* ---------- packet layer (floor level, under blocks) ---------- */
    var gPk = el('g', { class: 'vs-packets' }, deco);
    function firefly(parent, grad, cls, r) {
      var g = el('g', { class: 'vs-ff' }, parent);
      el('circle', { r: r1(r * 3.3), fill: 'url(#' + id + grad + ')' }, g);
      var core = el('circle', { r: r, class: cls }, g);
      var tr = svg.createSVGTransform(); g.transform.baseVal.appendItem(tr);
      return { g: g, core: core, tr: tr, o: -1, rr: r };
    }
    function chip(parent, grad, cls) {
      var g = el('g', { class: 'vs-chip' }, parent);
      el('circle', { r: 17, fill: 'url(#' + id + grad + ')' }, g);
      el('rect', { x: -11, y: -6.5, width: 22, height: 13, rx: 3, class: cls }, g);
      el('rect', { x: -7, y: -3, width: 14, height: 1.8, rx: 0.9, class: 'vs-chip-line' }, g);
      el('rect', { x: -7, y: 1.2, width: 9, height: 1.8, rx: 0.9, class: 'vs-chip-line' }, g);
      var tr = svg.createSVGTransform(); g.transform.baseVal.appendItem(tr);
      return { g: g, tr: tr, o: -1 };
    }
    var SP_WAVE = 0.3, SP_CHIP = 0.95;
    function stream(route, sp, make) {
      var n = Math.ceil(route.total / sp) + 1, arr = [];
      for (var i = 0; i < n; i++) arr.push(make(i));
      return { route: route, sp: sp, n: n, period: n * sp, items: arr };
    }
    var sIn = stream(routes.inb, SP_WAVE, function () { return firefly(gPk, 'hA', 'vs-core-a', 2.3); });
    var sOut = stream(routes.out, SP_WAVE, function () { return firefly(gPk, 'hC', 'vs-core-c', 2.3); });
    var sTx = stream(routes.tx, SP_CHIP, function () { return chip(gArc, 'hB', 'vs-chip-b'); });
    var sRt = stream(routes.rt, SP_CHIP, function () { return chip(gArc, 'hC', 'vs-chip-c'); });

    /* ---------- orbit (back half, drawn before the LLM block) ---------- */
    var oc = { x: sx(ORBIT.x, ORBIT.y), y: sy(ORBIT.x, ORBIT.y, ORBIT.z) };
    var orx = ORBIT.r * RX1, ory = ORBIT.r * RY1;
    var gOrbBack = el('g', { class: 'vs-orbit' }, deco);
    el('path', { class: 'vs-orbit-ring', d: 'M' + r1(oc.x - orx) + ',' + r1(oc.y) + 'A' + r1(orx) + ',' + r1(ory) + ' 0 0 1 ' + r1(oc.x + orx) + ',' + r1(oc.y) }, gOrbBack);

    /* ---------- blocks ---------- */
    var gBlocks = el('g', { class: 'vs-blocks' }, deco);
    function box(parent, b, cls) {
      var z0 = b.z0 || 0, z1 = z0 + b.h;
      var g = el('g', { class: 'vs-block ' + (cls || '') }, parent);
      if (!b.z0) {
        var e = 0.14;
        el('polygon', { class: 'vs-ao', points: poly([[b.x0 - e, b.y0 - e, 0], [b.x1 + e, b.y0 - e, 0], [b.x1 + e, b.y1 + e, 0], [b.x0 - e, b.y1 + e, 0]]) }, g);
      }
      el('polygon', { class: 'vs-face-l', points: poly([[b.x0, b.y1, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x0, b.y1, z0]]) }, g);
      el('polygon', { class: 'vs-face-r', points: poly([[b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x1, b.y0, z0]]) }, g);
      el('polygon', { class: 'vs-face-shade', fill: 'url(#' + id + 'shade)', points: poly([[b.x0, b.y1, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x0, b.y1, z0]]) }, g);
      el('polygon', { class: 'vs-face-shade', fill: 'url(#' + id + 'shade)', points: poly([[b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x1, b.y0, z0]]) }, g);
      el('polygon', { class: 'vs-face-t', points: poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x0, b.y1, z1]]) }, g);
      el('polygon', { class: 'vs-tint', points: poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x0, b.y1, z1]]) }, g);
      el('path', {
        class: 'vs-edge',
        d: 'M' + P(b.x0, b.y1, z1) + 'L' + P(b.x0, b.y0, z1) + 'L' + P(b.x1, b.y0, z1) + 'L' + P(b.x1, b.y1, z1) + 'Z' +
           'M' + P(b.x1, b.y1, z1) + 'L' + P(b.x1, b.y1, z0)
      }, g);
      return g;
    }
    // ghost veil: an opaque-silhouette overlay so unintroduced blocks read
    // as dimmed solids instead of see-through glass
    function veil(parent, b) {
      var z0 = b.z0 || 0, z1 = z0 + b.h;
      return el('polygon', { class: 'vs-veil', points: poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y0, z0], [b.x1, b.y1, z0], [b.x0, b.y1, z0], [b.x0, b.y1, z1]]) }, parent);
    }
    function topPlane(parent, b) {
      return el('g', { transform: planeMatrix(b.x0, b.y0, (b.z0 || 0) + b.h) }, parent);
    }

    // caller tile + standing handset
    var gCaller = el('g', { class: 'vs-unit vs-u-caller' }, gBlocks);
    var bCaller = box(gCaller, B.caller, 'vs-b-caller');
    var tpC = topPlane(bCaller, B.caller);
    el('rect', { class: 'vs-pad', x: 8, y: 8, width: r1((B.caller.x1 - B.caller.x0) * S - 16), height: r1((B.caller.y1 - B.caller.y0) * S - 16), rx: 8 }, tpC);
    var bPhone = box(gCaller, B.phone, 'vs-b-phone');
    // phone screen on the front-right face (x = x1)
    var ph = B.phone, pz0 = ph.z0, pz1 = ph.z0 + ph.h;
    el('polygon', { class: 'vs-screen', points: poly([[ph.x1, ph.y0 + 0.12, pz1 - 0.14], [ph.x1, ph.y1 - 0.12, pz1 - 0.14], [ph.x1, ph.y1 - 0.12, pz0 + 0.22], [ph.x1, ph.y0 + 0.12, pz0 + 0.22]]) }, bPhone);
    // handset glyph on the screen: three call bars
    var fx = 'matrix(0.8660254 -0.5 0 1 ' + r1(sx(ph.x1, ph.y1 - 0.12)) + ' ' + r1(sy(ph.x1, ph.y1 - 0.12, pz1 - 0.14)) + ')';
    var scr = el('g', { transform: fx }, bPhone);
    el('path', { class: 'vs-handset', transform: 'translate(5 12) scale(1.25)', d: 'M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z' }, scr);

    // telephony gateway: vents, LEDs, antenna
    var gTel = el('g', { class: 'vs-unit vs-u-tel' }, gBlocks);
    var bTel = box(gTel, B.tel, 'vs-b-tel');
    var t_ = B.tel;
    for (var vz = 0; vz < 4; vz++) {
      var z = 0.28 + vz * 0.16;
      el('path', { class: 'vs-vent', d: 'M' + P(t_.x0 + 0.3, t_.y1, z) + 'L' + P(t_.x0 + 1.25, t_.y1, z) }, bTel);
    }
    var telLeds = [];
    for (var li = 0; li < 3; li++) {
      var ly = t_.y0 + 0.4 + li * 0.32;
      telLeds.push({ e: el('circle', { class: 'vs-led', cx: r1(sx(t_.x1, ly)), cy: r1(sy(t_.x1, ly, 0.9)), r: 2.6 }, bTel), o: -1, w: 2.3 + li * 0.9, ph: li * 1.7 });
    }
    el('path', { class: 'vs-port', d: 'M' + P(t_.x1, t_.y0 + 0.35, 0.42) + 'L' + P(t_.x1, t_.y1 - 0.35, 0.42) }, bTel);
    el('path', { class: 'vs-antenna', d: 'M' + P(3.45, 3.45, t_.h) + 'L' + P(3.45, 3.45, 2.0) }, bTel);
    el('ellipse', { class: 'vs-antenna-base', cx: r1(sx(3.45, 3.45)), cy: r1(sy(3.45, 3.45, t_.h)), rx: 7, ry: 4 }, bTel);
    var antTip = el('circle', { class: 'vs-antenna-tip', cx: r1(sx(3.45, 3.45)), cy: r1(sy(3.45, 3.45, 2.0)), r: 3.2 }, bTel);

    // STT: waveform glyph + VAD LED on the top face
    var gStt = el('g', { class: 'vs-unit vs-u-stt' }, gBlocks);
    var bStt = box(gStt, B.stt, 'vs-b-stt');
    var tpS = topPlane(bStt, B.stt);
    var wd = 'M14,46';
    for (var wi = 0; wi <= 24; wi++) {
      var wx = 14 + wi * 2.6, amp = Math.sin(wi * 0.9) * (6 + 8 * Math.sin(wi * 0.27));
      wd += 'L' + r1(wx) + ',' + r1(46 + amp);
    }
    el('path', { class: 'vs-glyph vs-glyph-b', d: wd }, tpS);
    el('rect', { class: 'vs-glyph-frame', x: 8, y: 22, width: 76, height: 48, rx: 6 }, tpS);
    var vadLed = { e: el('circle', { class: 'vs-led vs-led-b', cx: r1(sx(8.55, 1.35)), cy: r1(sy(8.55, 1.35, B.stt.h)), r: 3.4 }, bStt), o: -1 };
    var vadRing = el('ellipse', { class: 'vs-vad-ring', cx: r1(sx(8.55, 1.35)), cy: r1(sy(8.55, 1.35, B.stt.h)), rx: 9, ry: 5.2 }, bStt);

    // TTS: level bars glyph on the top face
    var gTts = el('g', { class: 'vs-unit vs-u-tts' }, gBlocks);
    var bTts = box(gTts, B.tts, 'vs-b-tts');
    var tpT = topPlane(bTts, B.tts);
    var bars = [];
    for (var bi = 0; bi < 9; bi++) {
      bars.push(el('rect', { class: 'vs-bar', x: 16 + bi * 7, y: 40, width: 3.6, height: 12, rx: 1.8 }, tpT));
    }
    el('rect', { class: 'vs-glyph-frame', x: 8, y: 22, width: 76, height: 48, rx: 6 }, tpT);

    // LLM agent: tall block, glowing core slots, checklist on the top face
    var gLlm = el('g', { class: 'vs-unit vs-u-llm' }, gBlocks);
    var bLlm = box(gLlm, B.llm, 'vs-b-llm');
    var L = B.llm, coreEls = [];
    var cz0 = 0.32, cz1 = L.h - 0.32;
    coreEls.push(el('polygon', { class: 'vs-core-slot', fill: 'url(#' + id + 'core)', points: poly([[L.x0 + 0.42, L.y1, cz1], [L.x1 - 0.42, L.y1, cz1], [L.x1 - 0.42, L.y1, cz0], [L.x0 + 0.42, L.y1, cz0]]) }, bLlm));
    coreEls.push(el('polygon', { class: 'vs-core-slot', fill: 'url(#' + id + 'core)', points: poly([[L.x1, L.y0 + 0.42, cz1], [L.x1, L.y1 - 0.42, cz1], [L.x1, L.y1 - 0.42, cz0], [L.x1, L.y0 + 0.42, cz0]]) }, bLlm));
    var slotLines = '';
    for (var sl = 1; sl < 6; sl++) {
      var szz = cz0 + (cz1 - cz0) * sl / 6;
      slotLines += 'M' + P(L.x0 + 0.42, L.y1, szz) + 'L' + P(L.x1 - 0.42, L.y1, szz) + 'M' + P(L.x1, L.y0 + 0.42, szz) + 'L' + P(L.x1, L.y1 - 0.42, szz);
    }
    el('path', { class: 'vs-core-lines', d: slotLines }, bLlm);
    var tpL = topPlane(bLlm, L);
    var coreTop = el('rect', { class: 'vs-core-top', x: 6, y: 6, width: r1((L.x1 - L.x0) * S - 12), height: r1((L.y1 - L.y0) * S - 12), rx: 6 }, tpL);
    var ticks = [];
    for (var ci = 0; ci < CHECKS.length; ci++) {
      var cy = 30 + ci * 25;
      var row = el('g', { class: 'vs-check' }, tpL);
      el('rect', { class: 'vs-check-box', x: 14, y: cy - 10, width: 11, height: 11, rx: 2.5 }, row);
      el('path', { class: 'vs-check-tick', d: 'M16.4,' + (cy - 4.6) + 'l2.6,2.8l4.6,-6' }, row);
      var tx = el('text', { class: 'vs-check-text', x: 32, y: cy }, row);
      tx.textContent = CHECKS[ci];
      ticks.push({ g: row, o: -1 });
    }

    /* ---------- orbit front half + pulses ---------- */
    var veils = {
      caller: [veil(gCaller, B.caller), veil(gCaller, B.phone)], tel: [veil(gTel, B.tel)],
      stt: [veil(gStt, B.stt)], tts: [veil(gTts, B.tts)], llm: [veil(gLlm, B.llm)]
    };
    var gOrbFront = el('g', { class: 'vs-orbit' }, deco);
    el('path', { class: 'vs-orbit-ring', d: 'M' + r1(oc.x - orx) + ',' + r1(oc.y) + 'A' + r1(orx) + ',' + r1(ory) + ' 0 0 0 ' + r1(oc.x + orx) + ',' + r1(oc.y) }, gOrbFront);
    deco.appendChild(gArc);
    var orb = [];
    for (var oi = 0; oi < 6; oi++) {
      orb.push({ b: firefly(gOrbBack, 'hA', 'vs-core-a', 2.6), f: firefly(gOrbFront, 'hA', 'vs-core-a', 2.6) });
    }

    /* ---------- labels (constant on-screen size, elbow leaders) ---------- */
    var gLab = el('g', { class: 'vs-labels' }, gCam);
    var trLab = addTr(gLab);
    var labels = {};
    LABELS.forEach(function (d) {
      var ax = sx(d.anchor[0], d.anchor[1]), ay = sy(d.anchor[0], d.anchor[1], d.anchor[2]);
      var g = el('g', { class: 'vs-label vs-l-' + d.id + (d.minor ? ' vs-minor' : ''), 'aria-hidden': 'true' }, gLab);
      var line = el('polyline', { class: 'vs-leader' }, g);
      var dot = el('circle', { class: 'vs-leader-dot', cx: r1(ax), cy: r1(ay), r: 2.2 }, g);
      var t = el('text', { class: 'vs-title' }, g);
      t.textContent = d.title;
      var s = null;
      if (d.sub) { s = el('text', { class: 'vs-sub' }, g); s.textContent = d.sub; }
      labels[d.id] = { d: d, g: g, t: t, s: s, line: line, dot: dot, ax: ax, ay: ay };
    });
    // legend (story, wide only): placed in the fitted box's top-right corner
    var gLeg = el('g', { class: 'vs-legend vs-minor', 'aria-hidden': 'true' }, svg);
    var legItems = [];
    [['vs-core-a', 'hA', 'audio in'], ['chip', 'hB', 'transcript'], ['vs-core-c', 'hC', 'reply audio']].forEach(function (it) {
      var g = el('g', null, gLeg);
      if (it[0] === 'chip') {
        el('rect', { x: -8, y: -5, width: 16, height: 10, rx: 2.5, class: 'vs-chip-b' }, g);
      } else {
        el('circle', { r: 9, fill: 'url(#' + id + it[1] + ')' }, g);
        el('circle', { r: 2.6, class: it[0] }, g);
      }
      var tt = el('text', { class: 'vs-legend-text', x: 18, y: 4 }, g); tt.textContent = it[2];
      legItems.push(g);
    });

    /* ---------- responsive fit: constant-size labels + viewBox fitted to content ---------- */
    var k = 1, compact = false, vb = { x: VB.x, y: VB.y, w: VB.w, h: VB.h };
    var VC = { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2 };
    function placeOne(l, dx, dy, endA, big) {
      var tPx = (overview ? 12 : compact ? 11 : 13) * k, sPx = 11.5 * k, gap = 4 * k;
      var lx = l.ax + dx * k, ly = l.ay + dy * k, ex = lx + (endA ? 5 : -5) * k;
      l.line.setAttribute('points', r1(l.ax) + ',' + r1(l.ay) + ' ' + r1(ex) + ',' + r1(ly) + ' ' + r1(lx) + ',' + r1(ly));
      var tx = lx + (endA ? -gap : gap), hasSub = l.s && big;
      l.t.setAttribute('x', r1(tx)); l.t.setAttribute('y', r1(ly + (hasSub ? -gap * 0.6 : tPx * 0.36)));
      if (l.s) { l.s.setAttribute('x', r1(tx)); l.s.setAttribute('y', r1(ly + sPx * 1.25)); }
    }
    function textBox(l, big) {
      var b = l.t.getBBox(), x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
      if (l.s && big) {
        var c = l.s.getBBox();
        x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.width); y1 = Math.max(y1, c.y + c.height);
      }
      return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }
    function placeLabels() {
      var big = !compact && !overview, boxes = [];
      for (var key in labels) {
        var l = labels[key], d = l.d, p = overview ? d.v : compact ? d.c : d.o, endA = p[2] === 'end';
        l.dot.setAttribute('r', r1((overview ? 1.8 : 2.2) * k));
        l.t.textContent = overview ? d.ov : compact ? d.short : d.title;
        l.t.setAttribute('text-anchor', endA ? 'end' : 'start');
        if (l.s) l.s.setAttribute('text-anchor', endA ? 'end' : 'start');
        var dy = p[1];
        placeOne(l, p[0], dy, endA, big);
        if (d.minor && !big) continue;
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
          placeOne(l, p[0], dy, endA, big);
          bx = textBox(l, big);
        }
        boxes.push(bx);
      }
    }
    function measure() {
      // rest pose: no camera, no parallax
      var camT = gCam.getAttribute('transform');
      gCam.removeAttribute('transform');
      trWorld.setTranslate(0, 0); trLab.setTranslate(0, 0);
      var w = deco.getBBox(); world.w = w.width; world.h = w.height;
      var b = gCam.getBBox();
      if (camT) gCam.setAttribute('transform', camT);
      if (!b || !b.width) return null;
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    var world = { w: 1, h: 1 }, fitRatio = 1;
    function fit() {
      root.classList.toggle('is-compact', compact && !overview);
      var cr = container.getBoundingClientRect();
      for (var pass = 0; pass < 10; pass++) {
        var r = svg.getBoundingClientRect(), prevW = vb.w, prevH = vb.h;
        var rw = r.width || cr.width, rh = r.height || rw * vb.h / vb.w;
        var scale = Math.min(rw / vb.w, rh / vb.h) || 1;
        k = 1 / scale;
        svg.style.setProperty('--vs-k', k.toFixed(3));
        placeLabels();
        var b;
        try { b = measure(); } catch (e) { return; }
        if (!b) return;
        // overview: a few px for halos/strokes; story: room for the gentle camera drift
        var px = overview ? 6 * k : b.w * 0.022 + 4 * k, py = overview ? 6 * k : b.h * 0.025 + 4 * k;
        vb = { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py };
        svg.setAttribute('viewBox', r1(vb.x) + ' ' + r1(vb.y) + ' ' + r1(vb.w) + ' ' + r1(vb.h));
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
      VC.x = vb.x + vb.w / 2; VC.y = vb.y + vb.h / 2;
      // legend rows in the top-right corner of the fitted box
      for (var li = 0; li < legItems.length; li++) {
        legItems[li].setAttribute('transform', 'translate(' + r1(vb.x + vb.w - 96 * k) + ' ' + r1(vb.y + (12 + li * 18) * k) + ') scale(' + k.toFixed(3) + ')');
      }
      if (ready) { if (overview) overviewState(); else setStep(st.idx, st.p); }
    }
    var ready = false;

    /* ---------- state ---------- */
    var st = { idx: 0, p: 0, g: 0 };
    var units = { caller: gCaller, tel: gTel, stt: gStt, llm: gLlm, tts: gTts };
    var blocks = { caller: bCaller, tel: bTel, stt: bStt, llm: bLlm, tts: bTts };
    function setO(obj, v) {           // write opacity only when it changes
      v = Math.round(v * 100) / 100;
      if (obj.o !== v) { obj.o = v; (obj.g || obj.e).style.opacity = v; }
    }
    function op(node, v) { node.style.opacity = Math.round(v * 100) / 100; }

    function setStep(index, progress) {
      var i = Math.max(0, Math.min(4, Math.floor(+index || 0)));
      var p = clamp(+progress || 0);
      var g = i + p;
      st.idx = i; st.p = p; st.g = g;
      // structure fades (pure functions of g)
      op(gFloor, 0.55 + 0.45 * ease(g / 0.35));
      var vCaller = 0.82 * (1 - ease(g / 0.45)), vTel = 0.82 * (1 - ease((g - 0.15) / 0.45));
      var vHosted = 0.78 * (1 - ease((g - 1) / 0.5));
      op(veils.caller[0], vCaller); op(veils.caller[1], vCaller); op(veils.tel[0], vTel);
      op(veils.stt[0], vHosted); op(veils.tts[0], vHosted); op(veils.llm[0], vHosted);
      op(gBound, ease((g - 1) / 0.6));
      st.ring = i === 0 ? 0.35 + 0.65 * ease(p / 0.3) : 1 - ease((g - 1) / 0.4);
      st.inReach = clamp((g - 1) / 0.75);
      st.inI = g < 3 ? 1 : g < 4 ? 0.6 : 0.42;
      st.txReach = clamp((g - 2) / 0.7);
      st.txI = i === 2 ? 1 : i === 3 ? 0.7 : 0.45;
      st.vad = ease((g - 2) / 0.3) * (i === 2 ? 1 : 0.55);
      st.core = 0.18 * ease((g - 1) / 0.5) + 0.82 * ease((g - 3) / 0.5) * (i === 4 ? 0.8 : 1);
      st.orbit = i === 3 ? ease(p / 0.35) : i === 4 ? 0.4 : 0;
      st.rtReach = clamp((g - 4) / 0.35);
      st.outReach = clamp((g - 4.25) / 0.6);
      st.loop = ease((g - 4.5) / 0.45);
      st.tel = ease((g - 0.2) / 0.4);
      // wires
      op(wires.inb, 0.9 * st.inReach * st.inI);
      op(wires.tx, 0.9 * st.txReach * st.txI);
      op(wires.rt, 0.9 * st.rtReach);
      op(wires.out, 0.9 * st.outReach);
      op(arcBase[0], ease((g - 1.2) / 0.6)); op(arcBase[1], ease((g - 1.2) / 0.6));
      op(loopPath, 0.7 * st.loop); op(loopArc, 0.7 * st.loop);
      // ticks appear one by one during step 3 and stay
      for (var c = 0; c < ticks.length; c++) setO(ticks[c], g >= 3 ? ease((g - 3.25 - c * 0.2) / 0.12) : 0);
      op(gOrbBack, st.orbit); op(gOrbFront, st.orbit);
      // floor glows + lit classes
      var lit = { caller: i === 0, tel: i === 1, stt: i === 2, llm: i === 3, tts: i === 4 };
      var on = { caller: g >= 0.3, tel: g >= 0.4, stt: g >= 2, llm: g >= 3, tts: g >= 4 };
      for (var u in units) {
        blocks[u].classList.toggle('is-lit', lit[u]);
        blocks[u].classList.toggle('is-on', on[u] && !lit[u]);
        labels[u].g.classList.toggle('is-lit', lit[u]);
      }
      if (blocks.caller) bPhone.classList.toggle('is-lit', lit.caller);
      labels.bound.g.style.opacity = Math.round(ease((g - 1) / 0.6) * 100) / 100;
      labels.loop.g.style.opacity = Math.round(st.loop * 100) / 100;
      ['stt', 'llm', 'tts'].forEach(function (u2) { labels[u2].g.style.opacity = Math.round((0.45 + 0.55 * ease((g - 1) / 0.5)) * 100) / 100; });
      op(glow.caller, lit.caller ? 0.8 : 0.15 * (g > 0.3));
      op(glow.tel, lit.tel ? 0.8 : 0.25 * st.tel);
      op(glow.stt, lit.stt ? 0.85 : on.stt ? 0.3 : 0);
      op(glow.llm, lit.llm ? 1 : on.llm ? 0.45 : 0);
      op(glow.tts, lit.tts ? 0.85 : 0);
      // camera: eases toward the component in focus for each step
      var c0 = CAM[Math.floor(g)] || CAM[4], c1 = CAM[Math.min(4, Math.floor(g) + 1)], cf = ease(g - Math.floor(g));
      var cz = c0[2] + (c1[2] - c0[2]) * cf;
      var fx = c0[0] + (c1[0] - c0[0]) * cf, fy = c0[1] + (c1[1] - c0[1]) * cf;
      if (compact) cz = 1 + (cz - 1) * 0.5;
      if (reduced) gCam.removeAttribute('transform');
      else {
        var dx = (VC.x - fx) * 0.03 * cz, dy = (VC.y - fy) * 0.03 * cz;
        gCam.setAttribute('transform', 'translate(' + r1(VC.x * (1 - cz) + dx) + ' ' + r1(VC.y * (1 - cz) + dy) + ') scale(' + cz.toFixed(4) + ')');
      }
      render(reduced ? 0 : time);
      kick();
    }

    /* ---------- overview: the finished loop, everything on, all edges flowing ---------- */
    function overviewState() {
      st.idx = 4; st.p = 1; st.g = 5;
      op(gFloor, 1);
      for (var vk in veils) for (var vi = 0; vi < veils[vk].length; vi++) op(veils[vk][vi], 0);
      op(gBound, 1);
      st.ring = 0.55; st.inReach = 1; st.inI = 1; st.txReach = 1; st.txI = 1;
      st.vad = 0.8; st.core = 0.9; st.orbit = 0.75; st.rtReach = 1; st.outReach = 1;
      st.loop = 0.5; st.tel = 1;
      op(wires.inb, 0.75); op(wires.tx, 0.75); op(wires.rt, 0.75); op(wires.out, 0.75);
      op(arcBase[0], 1); op(arcBase[1], 1);
      op(loopPath, 0.35); op(loopArc, 0.35);
      for (var c = 0; c < ticks.length; c++) setO(ticks[c], 1);
      op(gOrbBack, st.orbit); op(gOrbFront, st.orbit);
      for (var u in units) {
        blocks[u].classList.remove('is-lit');
        blocks[u].classList.add('is-on');
        labels[u].g.classList.remove('is-lit');
        labels[u].g.style.opacity = 1;
      }
      bPhone.classList.add('is-on');
      labels.bound.g.style.opacity = 1;
      labels.loop.g.style.opacity = 0;
      op(glow.caller, 0.45); op(glow.tel, 0.5); op(glow.stt, 0.55); op(glow.llm, 0.75); op(glow.tts, 0.55);
      gCam.removeAttribute('transform');
      render(reduced ? 0 : time);
      kick();
    }

    /* ---------- per-frame render (mutates existing nodes only) ---------- */
    function placeStream(sm, reach, inten, t, speed, wave, zBase) {
      var L = sm.route.total, head = reach * L;
      for (var j = 0; j < sm.n; j++) {
        var it = sm.items[j];
        var s = (j * sm.sp + t * speed) % sm.period;
        var o = 0;
        if (s <= L && s <= head && inten > 0) {
          o = inten * clamp(s / 0.45) * clamp((L - s) / 0.45) * clamp((head - s) / 0.6 + (reach >= 1 ? 1 : 0));
        }
        if (o > 0.005) {
          at(sm.route, s);
          var z = zBase + Q.z;
          if (wave) z += 0.14 * Math.sin(s * 2.1) * (0.55 + 0.45 * Math.sin(s * 0.63 + 1.2));
          it.tr.setTranslate(sx(Q.x, Q.y), sy(Q.x, Q.y, z));
          if (wave) {
            var blink = reduced ? 1 : 0.78 + 0.22 * Math.sin(t * (3.1 + (j % 5) * 0.7) + j * 1.3);
            o *= blink;
          }
        }
        setO(it, o);
      }
    }
    function render(t) {
      var still = reduced;
      // phone ring
      for (var r = 0; r < rings.length; r++) {
        var fr = ((still ? 0 : t * 0.5) + r / 3) % 1;
        var rad = 0.9 + fr * 2.0;
        rings[r].e.rx.baseVal.value = rad * RX1;
        rings[r].e.ry.baseVal.value = rad * RY1;
        setO(rings[r], st.ring * (1 - fr) * 0.85);
      }
      placeStream(sIn, st.inReach, st.inI, t, 1.35, true, 0.24);
      placeStream(sTx, st.txReach, st.txI, t, 0.85, false, 0.12);
      placeStream(sRt, st.rtReach, 1, t, 0.85, false, 0.12);
      placeStream(sOut, st.outReach, 1, t, 1.35, true, 0.24);
      // telephony LEDs + antenna
      for (var l = 0; l < telLeds.length; l++) {
        var b = still ? 1 : 0.55 + 0.45 * Math.sin(t * telLeds[l].w + telLeds[l].ph);
        setO(telLeds[l], 0.25 + 0.75 * st.tel * b);
      }
      op(antTip, 0.35 + 0.65 * st.tel * (still ? 1 : 0.7 + 0.3 * Math.sin(t * 1.7)));
      // VAD: speech / end-of-turn rhythm
      var vOn = still ? 1 : (Math.sin(t * 1.9) + 0.35 * Math.sin(t * 5.3) > -0.25 ? 1 : 0.2);
      setO(vadLed, 0.2 + 0.8 * st.vad * vOn);
      op(vadRing, st.vad * (vOn > 0.5 ? 0.7 : 0.1));
      // TTS level bars
      var ttsOn = st.idx === 4 ? 1 : 0.35;
      for (var bi2 = 0; bi2 < bars.length; bi2++) {
        var hgt = 4 + 14 * Math.abs(Math.sin(bi2 * 1.3 + (still ? 0.6 : t * (2.2 + bi2 * 0.21))));
        bars[bi2].height.baseVal.value = hgt;
        bars[bi2].y.baseVal.value = 46 - hgt / 2;
      }
      op(tpT, 0.4 + 0.6 * ttsOn * clamp(st.g - 3.9));
      // LLM core breathing
      var core = st.core * (still ? 1 : 0.82 + 0.18 * Math.sin(t * 1.4));
      op(coreEls[0], core); op(coreEls[1], core); op(coreTop, 0.25 + 0.75 * core);
      // orbit
      if (st.orbit > 0) {
        for (var o = 0; o < orb.length; o++) {
          var ph = (still ? 0.35 : t * 0.55) + o * (Math.PI * 2 / orb.length);
          var x = oc.x + orx * Math.cos(ph), y = oc.y + ory * Math.sin(ph);
          var front = Math.sin(ph) >= 0;
          orb[o].f.tr.setTranslate(x, y); orb[o].b.tr.setTranslate(x, y);
          var bl = still ? 1 : 0.7 + 0.3 * Math.sin(t * (2.4 + o * 0.5) + o);
          setO(orb[o].f, front ? bl : 0); setO(orb[o].b, front ? 0 : bl * 0.7);
        }
      }
      // streaming loop dashes
      var dash = still ? 0 : r1(-(t * 26) % 400);
      loopPath.style.strokeDashoffset = dash; loopArc.style.strokeDashoffset = dash;
    }

    /* ---------- ambient loop: only in viewport + tab visible ---------- */
    var time = 0, last = 0, raf = 0, inView = true, alive = true;
    function frame(ts) {
      raf = 0;
      if (!running()) { last = 0; return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts; time += dt;
      // pointer parallax (story only): eased, layered by depth (shadow far, labels near)
      if (!overview) {
        var e = 1 - Math.pow(0.0025, dt);
        par.x += (par.tx - par.x) * e; par.y += (par.ty - par.y) * e;
        trShadow.setTranslate(-par.x * 7, -par.y * 4);
        trWorld.setTranslate(par.x * 3, par.y * 2);
        trLab.setTranslate(par.x * 8, par.y * 5);
      }
      render(time);
      raf = requestAnimationFrame(frame);
    }
    function running() { return alive && !reduced && inView && !document.hidden; }
    function kick() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } last = 0; }

    var par = { x: 0, y: 0, tx: 0, ty: 0 };
    function onPointer(ev) {
      if (ev.pointerType === 'touch') return;
      var r = root.getBoundingClientRect();
      if (!r.width) return;
      par.tx = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width - 0.5) * 2));
      par.ty = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height - 0.5) * 2));
    }
    function onLeave() { par.tx = 0; par.ty = 0; }
    if (!overview) {
      root.addEventListener('pointermove', onPointer, { passive: true });
      root.addEventListener('pointerleave', onLeave, { passive: true });
    }
    var io = null, ro = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        inView = es[es.length - 1].isIntersecting;
        if (inView) kick(); else stop();
      }, { rootMargin: '80px' });
      io.observe(root);
    }
    if ('ResizeObserver' in window) { ro = new ResizeObserver(layout); ro.observe(container); }
    function onVis() { if (document.hidden) stop(); else kick(); }
    document.addEventListener('visibilitychange', onVis);
    function onMq() {
      reduced = !!opts.reducedMotion || !!(mq && mq.matches);
      root.classList.toggle('is-reduced', reduced);
      if (reduced) { stop(); par.x = par.y = par.tx = par.ty = 0; trShadow.setTranslate(0, 0); trWorld.setTranslate(0, 0); trLab.setTranslate(0, 0); render(0); } else kick();
    }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    root.classList.toggle('is-reduced', reduced);

    layout();
    ready = true;
    if (overview) overviewState(); else setStep(0, 0);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (alive) layout(); });

    return {
      steps: 5,
      setStep: function (index, progress) { if (!overview) setStep(index, progress); },
      destroy: function () {
        alive = false; stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        root.removeEventListener('pointermove', onPointer);
        root.removeEventListener('pointerleave', onLeave);
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  window.VoiceScene = { mount: mount };
})();
