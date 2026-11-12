/* ============================================================
   ServerlessScene — isometric architecture scene for the serverless
   AI document-processing platform (CloudFront + S3 -> API Gateway ->
   Lambda -> Bedrock -> structured data, all on AWS).

   window.ServerlessScene.mount(container, { reducedMotion, mode })
     -> { steps: 5, setStep(index, progress), destroy() }
     mode 'story'    (default) state is a pure function of index+progress;
                     ambient motion only adds a time phase on top.
     mode 'overview' completed architecture, packets on every edge,
                     titles only, no camera drift, fitted to the card.
   Inline SVG, true isometric projection (30deg), no 3D library, no
   filters. Every node is created once in mount(); the rAF loop only
   mutates transforms / opacity / numeric attributes on existing nodes.
   ============================================================ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var S = 46;                     // px per world unit
  var CX = 0.8660254 * S;         // cos 30
  var HY = 0.5 * S;               // sin 30
  var RX1 = 1.2247449 * S;        // iso circle: rx per world radius
  var RY1 = 0.7071068 * S;        // iso circle: ry per world radius
  var uid = 0;

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
  function frac(v) { return v - Math.floor(v); }
  // maps a horizontal plane at height z (local u along +x, v along +y,
  // in px) onto the screen; origin at world (x, y, z)
  function planeMatrix(x, y, z) {
    return 'matrix(0.8660254 0.5 -0.8660254 0.5 ' + r1(sx(x, y)) + ' ' + r1(sy(x, y, z)) + ')';
  }

  /* ---------- world layout (iso floor units; flow runs along +x) ---------- */
  var PLATE = { x0: -0.9, x1: 21.8, y0: 1.5, y1: 6.7, t: 0.35 };
  var REGION = { x0: 1.9, x1: 21.3, y0: 1.9, y1: 6.3 };
  var DOCS = { x0: 0, x1: 1.2, y0: 2.5, y1: 3.7, n: 6 };
  var IMGS = { x0: 0.05, x1: 1.25, y0: 4.3, y1: 5.4, n: 4 };
  var PED = { x0: 2.3, x1: 3.4, y0: 3.45, y1: 4.55, h: 0.3 };
  var GLOBE = { x: 2.85, y: 4, z: 0.9, r: 0.58 };
  var BUCKET = { x: 5.4, y: 4, rT: 1.05, rB: 0.82, h: 1.35 };
  var GATE = {
    back:   { x0: 7.6, x1: 8.4, y0: 2.75, y1: 3.3, h: 1.55 },
    front:  { x0: 7.6, x1: 8.4, y0: 4.7, y1: 5.25, h: 1.55 },
    lintel: { x0: 7.5, x1: 8.5, y0: 2.65, y1: 5.35, z0: 1.55, h: 0.45 }
  };
  var GX = 8.0;                    // gateway passage plane
  var PAD = { x0: 9.7, x1: 12.5, y0: 2.6, y1: 5.4, h: 0.14 };
  var CUBE = 0.62, CUBE_STEP = 0.86, CUBE_X = 9.93, CUBE_Y = 2.83;
  var CUBE_ORDER = [4, 1, 3, 5, 7, 0, 2, 6, 8];     // spin-up order (centre first)
  var BED = {
    base: { x0: 14.0, x1: 16.8, y0: 2.6, y1: 5.4, h: 0.45 },
    mid:  { x0: 14.2, x1: 16.6, y0: 2.8, y1: 5.2, z0: 0.45, h: 1.05 },
    cap:  { x0: 14.45, x1: 16.35, y0: 3.05, y1: 4.95, z0: 1.5, h: 0.3 }
  };
  var GEM = { x: 15.4, y: 4, z: 2.55, r: 0.46, hz: 0.56 };
  var OUT = { x0: 18.2, x1: 20.9, y0: 2.7, y1: 5.3, h: 0.22 };
  var CARD = { x0: 18.4, x1: 20.7, y0: 2.9, y1: 5.1, h: 0.09, step: 0.135, n: 6 };

  function arc(a, b, peak, out) {
    for (var i = 0; i <= 20; i++) {
      var u = i / 20;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + peak * 4 * u * (1 - u)]);
    }
    return out;
  }
  var ROUTES = {
    up:   arc([2.85, 4, 0.95], [5.25, 4, 1.32], 0.95, [[1.4, 4, 0.05], [2.15, 4, 0.25]]), // docs -> edge -> bucket
    req:  [[6.45, 4, 0], [9.65, 4, 0]],                      // S3 -> API Gateway -> Lambda
    doc:  [[12.55, 4, 0], [13.95, 4, 0]],                    // Lambda -> Bedrock
    chip: [[16.85, 4, 0], [18.15, 4, 0]]                     // Bedrock -> structured data
  };

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
  // off: leader end offset from the anchor in on-screen px (kept constant)
  var LABELS = [
    { id: 'docs', anchor: [0.3, 5.4, 0.1], off: [-14, 32], place: 'below',
      title: 'PDFs and images', short: 'Documents', sub: 'Structured and unstructured' },
    { id: 'edge', anchor: [4.8, 3.35, 1.35], off: [-4, -40], place: 'above',
      title: 'CloudFront + S3', short: 'CloudFront + S3', sub: 'Upload PDFs and images' },
    { id: 'gate', anchor: [8.0, 5.25, 0.05], off: [-6, 34], place: 'below',
      title: 'API Gateway', short: 'API Gateway', sub: 'API entry point' },
    { id: 'lambda', anchor: [11.1, 2.9, 0.78], off: [0, -40], place: 'above',
      title: 'Lambda', short: 'Lambda', sub: 'Serverless compute' },
    { id: 'bed', anchor: [15.4, 5.4, 0.05], off: [-6, 34], place: 'below',
      title: 'Bedrock', short: 'Bedrock', sub: 'Foundation models for extraction' },
    { id: 'out', anchor: [20.9, 4.3, 0.12], off: [22, 14], place: 'right',
      title: 'Structured data', short: 'Structured data', sub: 'Extraction results' },
  ];
  var UNITS = ['docs', 'edge', 'gate', 'lambda', 'bed', 'out'];
  // camera focus per step: world point + zoom
  var CAM = [[2.85, 4, 1.04], [8.0, 4, 1.04], [11.1, 4, 1.045], [15.4, 4, 1.04], [10.5, 4, 1.0]];

  function mount(container, opts) {
    opts = opts || {};
    var id = 'ss' + (++uid);
    var overview = opts.mode === 'overview';
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!opts.reducedMotion || !!(mq && mq.matches);

    var root = document.createElement('div');
    root.className = 'ss' + (overview ? ' ss--overview' : ' ss--story');
    var svg = el('svg', {
      class: 'ss-svg', viewBox: '-100 -100 1200 700',
      role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', preserveAspectRatio: 'xMidYMid meet'
    });
    var ttl = el('title', { id: id + '-t' }, svg);
    ttl.textContent = 'Serverless AI document-processing architecture on AWS';
    var dsc = el('desc', { id: id + '-d' }, svg);
    dsc.textContent = 'PDFs and images are uploaded through CloudFront into S3. API Gateway is the API entry point; ' +
      'it hands each request to Lambda functions that spin up on demand and scale back to zero when idle. ' +
      'Lambda calls foundation models on Bedrock, which extract structured and unstructured data from each document, ' +
      'and the results land as structured records. The whole stack is serverless, with no idle servers, and ' +
      'serverless architecture plus model-utilization tuning cut processing costs by 20 to 30 percent.';
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
    halo('hA', 'ss-st-a'); halo('hB', 'ss-st-b'); halo('hC', 'ss-st-c'); halo('hT', 'ss-st-t');
    var pg = el('linearGradient', { id: id + 'plate', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', class: 'ss-st-plate0' }, pg);
    el('stop', { offset: '1', class: 'ss-st-plate1' }, pg);
    var cg = el('linearGradient', { id: id + 'core', x1: '0', y1: '1', x2: '0', y2: '0' }, defs);
    el('stop', { offset: '0', class: 'ss-st-a', 'stop-opacity': '0.95' }, cg);
    el('stop', { offset: '1', class: 'ss-st-a', 'stop-opacity': '0.2' }, cg);
    var shade = el('linearGradient', { id: id + 'shade', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.07' }, shade);
    el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.22' }, shade);
    var side = el('linearGradient', { id: id + 'side', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.05' }, side);
    el('stop', { offset: '0.45', 'stop-color': '#000000', 'stop-opacity': '0.04' }, side);
    el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.38' }, side);
    var sph = el('radialGradient', { id: id + 'sph', cx: '0.36', cy: '0.32', r: '0.75' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.2' }, sph);
    el('stop', { offset: '0.55', 'stop-color': '#000000', 'stop-opacity': '0.05' }, sph);
    el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.42' }, sph);
    var drop = el('radialGradient', { id: id + 'drop' }, defs);
    el('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.5' }, drop);
    el('stop', { offset: '0.6', 'stop-color': '#000', 'stop-opacity': '0.2' }, drop);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' }, drop);
    var bclip = el('clipPath', { id: id + 'bclip' }, defs);

    function addTr(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }

    // depth layers: drop shadow (far) -> camera { world, labels (near) }
    var gShadow = el('g', { 'aria-hidden': 'true', class: 'ss-shadow' }, svg);
    var pcx = (PLATE.x0 + PLATE.x1) / 2, pcy = (PLATE.y0 + PLATE.y1) / 2;
    el('ellipse', { cx: r1(sx(pcx, pcy)), cy: r1(sy(pcx, pcy, -PLATE.t) + 30), rx: r1(14.6 * CX), ry: r1(5.4 * RY1), fill: 'url(#' + id + 'drop)' }, gShadow);
    var gCam = el('g', { class: 'ss-cam' }, svg);
    var deco = el('g', { 'aria-hidden': 'true', class: 'ss-world' }, gCam);
    var trShadow = addTr(gShadow), trWorld = addTr(deco);

    /* ---------- floor plate ---------- */
    var gFloor = el('g', { class: 'ss-floor' }, deco);
    function rect(L, z) { return poly([[L.x0, L.y0, z], [L.x1, L.y0, z], [L.x1, L.y1, z], [L.x0, L.y1, z]]); }
    el('polygon', { class: 'ss-plate-side ss-l', points: poly([[PLATE.x0, PLATE.y1, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y1, -PLATE.t], [PLATE.x0, PLATE.y1, -PLATE.t]]) }, gFloor);
    el('polygon', { class: 'ss-plate-side ss-r', points: poly([[PLATE.x1, PLATE.y0, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y1, -PLATE.t], [PLATE.x1, PLATE.y0, -PLATE.t]]) }, gFloor);
    el('polygon', { class: 'ss-plate', fill: 'url(#' + id + 'plate)', points: rect(PLATE, 0) }, gFloor);
    var gd = '';
    for (var gx = Math.ceil(PLATE.x0); gx <= PLATE.x1; gx++) gd += 'M' + P(gx, PLATE.y0, 0) + 'L' + P(gx, PLATE.y1, 0);
    for (var gy = Math.ceil(PLATE.y0); gy <= PLATE.y1; gy++) gd += 'M' + P(PLATE.x0, gy, 0) + 'L' + P(PLATE.x1, gy, 0);
    el('path', { class: 'ss-grid', d: gd }, gFloor);
    el('polyline', { class: 'ss-plate-rim', points: poly([[PLATE.x0, PLATE.y1, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y0, 0]]) }, gFloor);

    // edge-delivery pulses around the CloudFront pedestal
    var ringC = { x: sx(GLOBE.x, GLOBE.y), y: sy(GLOBE.x, GLOBE.y, 0) };
    var rings = [];
    for (var ri = 0; ri < 3; ri++) rings.push({ e: el('ellipse', { class: 'ss-ring', cx: r1(ringC.x), cy: r1(ringC.y), rx: 10, ry: 6 }, gFloor), o: -1 });

    /* ---------- AWS serverless region ---------- */
    var gRegion = el('g', { class: 'ss-region' }, deco);
    var rpts = rect(REGION, 0);
    el('polygon', { class: 'ss-region-fill', points: rpts }, gRegion);
    el('polygon', { class: 'ss-region-line', points: rpts }, gRegion);
    var ft = el('text', { class: 'ss-floortext', transform: planeMatrix(9.9, REGION.y1 - 0.3, 0) }, gRegion);
    ft.textContent = 'AWS \u00b7 serverless';
    var ft2 = el('text', { class: 'ss-floortext ss-floortext-2', transform: planeMatrix(17.4, REGION.y1 - 0.3, 0) }, gRegion);
    ft2.textContent = 'No idle servers';

    /* ---------- wires ---------- */
    var gWire = el('g', { class: 'ss-wires' }, deco);
    var routes = {}, wires = {};
    var gArc = el('g', { class: 'ss-arcs' });                       // attached after the blocks
    var arcBase = null;
    ['up', 'req', 'doc', 'chip'].forEach(function (k) {
      routes[k] = makeRoute(ROUTES[k]);
      var elevated = k === 'up';
      var d = routeD(ROUTES[k], 0.02), parent = elevated ? gArc : gWire;
      var base = el('path', { class: elevated ? 'ss-wire ss-arc' : 'ss-wire', d: d }, parent);
      if (elevated) arcBase = base;
      wires[k] = el('path', { class: 'ss-wire-on ss-w-' + k, d: d }, parent);
    });

    /* ---------- floor glows under units ---------- */
    var gGlow = el('g', { class: 'ss-glows' }, deco);
    function floorGlow(cx, cy, r, grad) {
      return el('ellipse', { cx: r1(sx(cx, cy)), cy: r1(sy(cx, cy, 0)), rx: r1(r * RX1), ry: r1(r * RY1), fill: 'url(#' + id + grad + ')', class: 'ss-glow' }, gGlow);
    }
    var glow = {
      docs: floorGlow(0.65, 4, 1.6, 'hB'), edge: floorGlow(4.1, 4, 2.4, 'hB'), gate: floorGlow(GX, 4, 1.8, 'hA'),
      lambda: floorGlow(11.1, 4, 2.0, 'hA'), bed: floorGlow(15.4, 4, 2.2, 'hA'), out: floorGlow(19.55, 4, 1.9, 'hC')
    };

    /* ---------- solids ---------- */
    function box(parent, b, cls, noAo) {
      var z0 = b.z0 || 0, z1 = z0 + b.h;
      var g = el('g', { class: 'ss-block ' + (cls || '') }, parent);
      if (!z0 && !noAo) {
        var e = 0.12;
        el('polygon', { class: 'ss-ao', points: poly([[b.x0 - e, b.y0 - e, 0], [b.x1 + e, b.y0 - e, 0], [b.x1 + e, b.y1 + e, 0], [b.x0 - e, b.y1 + e, 0]]) }, g);
      }
      el('polygon', { class: 'ss-face-l', points: poly([[b.x0, b.y1, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x0, b.y1, z0]]) }, g);
      el('polygon', { class: 'ss-face-r', points: poly([[b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x1, b.y0, z0]]) }, g);
      if (b.h > 0.3) {
        el('polygon', { class: 'ss-face-shade', fill: 'url(#' + id + 'shade)', points: poly([[b.x0, b.y1, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x0, b.y1, z0]]) }, g);
        el('polygon', { class: 'ss-face-shade', fill: 'url(#' + id + 'shade)', points: poly([[b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x1, b.y0, z0]]) }, g);
      }
      el('polygon', { class: 'ss-face-t', points: poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x0, b.y1, z1]]) }, g);
      el('polygon', { class: 'ss-tint', points: poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x0, b.y1, z1]]) }, g);
      el('path', {
        class: 'ss-edge',
        d: 'M' + P(b.x0, b.y1, z1) + 'L' + P(b.x0, b.y0, z1) + 'L' + P(b.x1, b.y0, z1) + 'L' + P(b.x1, b.y1, z1) + 'Z' +
           'M' + P(b.x1, b.y1, z1) + 'L' + P(b.x1, b.y1, z0)
      }, g);
      return g;
    }
    // opaque silhouette overlay so unintroduced units read as dimmed solids
    function boxHull(b) {
      var z0 = b.z0 || 0, z1 = z0 + b.h;
      return poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y0, z0], [b.x1, b.y1, z0], [b.x0, b.y1, z0], [b.x0, b.y1, z1]]);
    }
    function veil(parent, b) { return el('polygon', { class: 'ss-veil', points: boxHull(b) }, parent); }
    function topPlane(parent, b) { return el('g', { transform: planeMatrix(b.x0, b.y0, (b.z0 || 0) + b.h) }, parent); }

    // painter's order (back to front by x + y), with each floor packet
    // layer slotted between the unit it leaves and the unit it enters
    var gBlocks = el('g', { class: 'ss-blocks' }, deco);
    var slot = {};
    ['docs', 'edge', 'gateBack', 'pkReq', 'gate', 'lambda', 'pkDoc', 'bed', 'pkChip', 'out'].forEach(function (n) {
      slot[n] = el('g', null, gBlocks);
    });

    /* --- documents + images --- */
    var gDocs = el('g', { class: 'ss-unit ss-u-docs' }, slot.docs);
    function sheetStack(src, img) {
      var top = null;
      for (var i = 0; i < src.n; i++) {
        var j = (i % 3 - 1) * 0.05, z0 = i * 0.075;
        var b = { x0: src.x0 + j, x1: src.x1 + j, y0: src.y0 - j * 0.6, y1: src.y1 - j * 0.6, z0: z0, h: 0.06 };
        top = box(gDocs, b, 'ss-sheet', i > 0);
        top._b = b;
      }
      var tp = topPlane(top, top._b), w = (src.x1 - src.x0) * S, h = (src.y1 - src.y0) * S;
      if (img) {
        el('rect', { class: 'ss-img-frame', x: 6, y: 6, width: r1(w - 12), height: r1(h - 12), rx: 3 }, tp);
        el('path', { class: 'ss-img-hill', d: 'M8,' + r1(h - 8) + 'L' + r1(w * 0.36) + ',' + r1(h * 0.42) + 'L' + r1(w * 0.55) + ',' + r1(h * 0.66) + 'L' + r1(w * 0.7) + ',' + r1(h * 0.5) + 'L' + r1(w - 8) + ',' + r1(h - 8) + 'Z' }, tp);
        el('circle', { class: 'ss-img-sun', cx: r1(w * 0.72), cy: r1(h * 0.26), r: 5 }, tp);
      } else {
        var dd = '';
        for (var l = 0; l < 5; l++) dd += 'M9,' + r1(10 + l * 8.5) + 'h' + r1((l === 4 ? 0.45 : l === 0 ? 0.6 : 0.82) * (w - 18));
        el('path', { class: 'ss-doc-lines', d: dd }, tp);
      }
    }
    sheetStack(DOCS, false);
    sheetStack(IMGS, true);

    /* --- CloudFront edge: pedestal + globe --- */
    var gEdge = el('g', { class: 'ss-unit ss-u-edge' }, slot.edge);
    var bPed = box(gEdge, PED, 'ss-b-edge');
    var gc = { x: sx(GLOBE.x, GLOBE.y), y: sy(GLOBE.x, GLOBE.y, GLOBE.z) }, GR = GLOBE.r * RX1;
    el('ellipse', { class: 'ss-ao', cx: r1(sx(GLOBE.x, GLOBE.y)), cy: r1(sy(GLOBE.x, GLOBE.y, PED.h)), rx: r1(GR * 0.62), ry: r1(GR * 0.36) }, gEdge);
    var gGlobe = el('g', { class: 'ss-block ss-b-globe' }, gEdge);
    el('circle', { class: 'ss-sphere', cx: r1(gc.x), cy: r1(gc.y), r: r1(GR) }, gGlobe);
    el('circle', { cx: r1(gc.x), cy: r1(gc.y), r: r1(GR), fill: 'url(#' + id + 'sph)' }, gGlobe);
    [-0.6, 0, 0.6].forEach(function (lat) {
      var c = Math.cos(lat);
      el('ellipse', { class: 'ss-lat', cx: r1(gc.x), cy: r1(gc.y - GR * Math.sin(lat) * 0.816), rx: r1(GR * c), ry: r1(GR * c * 0.577) }, gGlobe);
    });
    var meridians = [];
    for (var mi = 0; mi < 3; mi++) meridians.push(el('ellipse', { class: 'ss-lat ss-mer', cx: r1(gc.x), cy: r1(gc.y), rx: 4, ry: r1(GR * 0.99) }, gGlobe));
    el('circle', { class: 'ss-sphere-rim', cx: r1(gc.x), cy: r1(gc.y), r: r1(GR) }, gGlobe);
    var edgeDots = [];
    [[-0.45, -0.35], [0.3, -0.55], [0.5, 0.2], [-0.2, 0.42]].forEach(function (d, i) {
      edgeDots.push({ e: el('circle', { class: 'ss-edge-dot', cx: r1(gc.x + d[0] * GR), cy: r1(gc.y + d[1] * GR), r: 2.4 }, gGlobe), o: -1, ph: i * 1.9 });
    });

    /* --- S3 bucket --- */
    var bk = BUCKET;
    var tC = { x: sx(bk.x, bk.y), y: sy(bk.x, bk.y, bk.h) }, bC = { x: sx(bk.x, bk.y), y: sy(bk.x, bk.y, 0) };
    var rxT = bk.rT * RX1, ryT = bk.rT * RY1, rxB = bk.rB * RX1, ryB = bk.rB * RY1;
    var bodyD = 'M' + r1(tC.x - rxT) + ',' + r1(tC.y) + 'L' + r1(bC.x - rxB) + ',' + r1(bC.y) +
      'A' + r1(rxB) + ',' + r1(ryB) + ' 0 0 0 ' + r1(bC.x + rxB) + ',' + r1(bC.y) +
      'L' + r1(tC.x + rxT) + ',' + r1(tC.y) + 'A' + r1(rxT) + ',' + r1(ryT) + ' 0 0 1 ' + r1(tC.x - rxT) + ',' + r1(tC.y) + 'Z';
    var gBucket = el('g', { class: 'ss-block ss-b-bucket' }, gEdge);
    el('ellipse', { class: 'ss-ao', cx: r1(bC.x), cy: r1(bC.y), rx: r1(rxB + 8), ry: r1(ryB + 5) }, gBucket);
    el('path', { class: 'ss-face-l', d: bodyD }, gBucket);
    el('path', { class: 'ss-face-shade', fill: 'url(#' + id + 'side)', d: bodyD }, gBucket);
    var hoops = '';
    [0.3, 0.98].forEach(function (z) {
      var rr = bk.rB + (bk.rT - bk.rB) * z / bk.h, cyy = sy(bk.x, bk.y, z);
      hoops += 'M' + r1(tC.x - rr * RX1) + ',' + r1(cyy) + 'A' + r1(rr * RX1) + ',' + r1(rr * RY1) + ' 0 0 0 ' + r1(tC.x + rr * RX1) + ',' + r1(cyy);
    });
    el('path', { class: 'ss-hoop', d: hoops }, gBucket);
    el('ellipse', { cx: r1(tC.x), cy: r1(tC.y), rx: r1(rxT), ry: r1(ryT) }, bclip);
    el('ellipse', { class: 'ss-bucket-in', cx: r1(tC.x), cy: r1(tC.y), rx: r1(rxT), ry: r1(ryT) }, gBucket);
    var gFillClip = el('g', { 'clip-path': 'url(#' + id + 'bclip)' }, gBucket);
    var gFill = el('g', { class: 'ss-fill' }, gFillClip);
    var trFill = addTr(gFill);
    var lvR = bk.rT * 0.97;
    el('ellipse', { class: 'ss-fill-top', cx: r1(tC.x), cy: r1(bC.y), rx: r1(lvR * RX1), ry: r1(lvR * RY1) }, gFill);
    [[-0.45, -0.2, 0], [0.1, -0.35, 0.03], [-0.1, 0.25, 0.06], [0.38, 0.12, 0.02]].forEach(function (d) {
      var b = { x0: bk.x + d[0] - 0.3, x1: bk.x + d[0] + 0.3, y0: bk.y + d[1] - 0.22, y1: bk.y + d[1] + 0.22 };
      el('polygon', { class: 'ss-fill-sheet', points: poly([[b.x0, b.y0, d[2]], [b.x1, b.y0, d[2]], [b.x1, b.y1, d[2]], [b.x0, b.y1, d[2]]]) }, gFill);
    });
    el('ellipse', { class: 'ss-rim', cx: r1(tC.x), cy: r1(tC.y), rx: r1(rxT), ry: r1(ryT) }, gBucket);
    var bucketEdge = el('path', { class: 'ss-edge ss-bucket-edge', d: bodyD }, gBucket);

    /* --- API Gateway arch --- */
    var gGateBack = el('g', { class: 'ss-unit ss-u-gate' }, slot.gateBack);
    var bGateBack = box(gGateBack, GATE.back, 'ss-b-gate');
    var gGate = el('g', { class: 'ss-unit ss-u-gate' }, slot.gate);
    var scan = el('polygon', { class: 'ss-scan', points: poly([[GX, 3.3, 0], [GX, 4.7, 0], [GX, 4.7, 1.55], [GX, 3.3, 1.55]]) }, gGate);
    var bGateFront = box(gGate, GATE.front, 'ss-b-gate');
    var bLintel = box(gGate, GATE.lintel, 'ss-b-gate');
    var gateLeds = [];
    for (var gi = 0; gi < 6; gi++) {
      var ly = GATE.lintel.y0 + 0.4 + gi * 0.38;
      gateLeds.push({ e: el('circle', { class: 'ss-led', cx: r1(sx(GATE.lintel.x1, ly)), cy: r1(sy(GATE.lintel.x1, ly, 1.775)), r: 2.5 }, bLintel), o: -1 });
    }
    // chevron on the lintel top: direction of travel
    var tpG = topPlane(bLintel, GATE.lintel);
    el('path', { class: 'ss-chev', d: 'M14,' + r1(1.35 * S - 16) + 'L30,' + r1(1.35 * S) + 'L14,' + r1(1.35 * S + 16) }, tpG);

    /* --- Lambda: pad + function cubes --- */
    var gLam = el('g', { class: 'ss-unit ss-u-lambda' }, slot.lambda);
    var bPad = box(gLam, PAD, 'ss-b-pad');
    var tpP = topPlane(bPad, PAD);
    var cubes = [];
    for (var cr = 0; cr < 3; cr++) {
      for (var cc = 0; cc < 3; cc++) {
        var u0 = (CUBE_X - PAD.x0 + cc * CUBE_STEP) * S, v0 = (CUBE_Y - PAD.y0 + cr * CUBE_STEP) * S;
        el('rect', { class: 'ss-slot', x: r1(u0), y: r1(v0), width: r1(CUBE * S), height: r1(CUBE * S), rx: 3 }, tpP);
      }
    }
    var lam = el('text', { class: 'ss-lambda-glyph', x: r1(0.22 * S), y: r1((PAD.y1 - PAD.y0) * S - 10) }, tpP);
    lam.textContent = 'λ';
    // paint back-to-front: x + y ascending
    var cubeIdx = [];
    for (var ci = 0; ci < 9; ci++) cubeIdx.push(ci);
    cubeIdx.sort(function (a, b) { return ((a % 3) + Math.floor(a / 3)) - ((b % 3) + Math.floor(b / 3)); });
    var cubeById = [];
    for (var cj = 0; cj < 9; cj++) {
      var ci2 = cubeIdx[cj], c3 = ci2 % 3, rr3 = Math.floor(ci2 / 3);
      var cb = { x0: CUBE_X + c3 * CUBE_STEP, y0: CUBE_Y + rr3 * CUBE_STEP, z0: PAD.h, h: CUBE };
      cb.x1 = cb.x0 + CUBE; cb.y1 = cb.y0 + CUBE;
      var gCube = el('g', { class: 'ss-cube' }, gLam);
      var trC = addTr(gCube);
      box(gCube, cb, 'ss-b-cube is-on', true);
      cubeById[ci2] = { g: gCube, tr: trC, o: -1, lv: -1 };
    }
    for (var co = 0; co < 9; co++) cubes.push(cubeById[co]);
    var cubeRank = [];
    for (var cq = 0; cq < 9; cq++) cubeRank[CUBE_ORDER[cq]] = cq;

    /* --- Bedrock: strata + glowing core + floating gem --- */
    var gBed = el('g', { class: 'ss-unit ss-u-bed' }, slot.bed);
    var bBase = box(gBed, BED.base, 'ss-b-bed');
    var bMid = box(gBed, BED.mid, 'ss-b-bed2');
    var M = BED.mid, coreEls = [];
    var cz0 = M.z0 + 0.2, cz1 = M.z0 + M.h - 0.2;
    coreEls.push(el('polygon', { class: 'ss-core-slot', fill: 'url(#' + id + 'core)', points: poly([[M.x0 + 0.4, M.y1, cz1], [M.x1 - 0.4, M.y1, cz1], [M.x1 - 0.4, M.y1, cz0], [M.x0 + 0.4, M.y1, cz0]]) }, bMid));
    coreEls.push(el('polygon', { class: 'ss-core-slot', fill: 'url(#' + id + 'core)', points: poly([[M.x1, M.y0 + 0.4, cz1], [M.x1, M.y1 - 0.4, cz1], [M.x1, M.y1 - 0.4, cz0], [M.x1, M.y0 + 0.4, cz0]]) }, bMid));
    var slotLines = '';
    for (var sl = 1; sl < 4; sl++) {
      var szz = cz0 + (cz1 - cz0) * sl / 4;
      slotLines += 'M' + P(M.x0 + 0.4, M.y1, szz) + 'L' + P(M.x1 - 0.4, M.y1, szz) + 'M' + P(M.x1, M.y0 + 0.4, szz) + 'L' + P(M.x1, M.y1 - 0.4, szz);
    }
    el('path', { class: 'ss-core-lines', d: slotLines }, bMid);
    var bCap = box(gBed, BED.cap, 'ss-b-bed');
    var tpCap = topPlane(bCap, BED.cap);
    var capW = (BED.cap.x1 - BED.cap.x0) * S;
    var coreTop = el('circle', { class: 'ss-core-top', cx: r1(capW / 2), cy: r1(capW / 2), r: r1(capW * 0.32) }, tpCap);
    el('circle', { class: 'ss-core-top2', cx: r1(capW / 2), cy: r1(capW / 2), r: r1(capW * 0.18) }, tpCap);
    // gem: halo + 8 faces (only front-facing ones shown), points mutated in place
    var gGem = el('g', { class: 'ss-gem' }, gBed);
    var gemC = { x: sx(GEM.x, GEM.y), y: sy(GEM.x, GEM.y, GEM.z) };
    var gemHalo = el('circle', { cx: r1(gemC.x), cy: r1(gemC.y), r: 62, fill: 'url(#' + id + 'hA)', class: 'ss-gem-halo' }, gGem);
    var trGem = addTr(gGem);
    var gemFaces = [];
    for (var gf = 0; gf < 8; gf++) {
      var pf = el('polygon', { class: 'ss-gem-face', points: '0,0 0,0 0,0' }, gGem);
      var ps = el('polygon', { class: 'ss-gem-shade', points: '0,0 0,0 0,0' }, gGem);
      gemFaces.push({ f: pf, s: ps, fp: pf.points, sp: ps.points, vis: -1 });
    }
    var gemBeam = el('path', { class: 'ss-gem-beam', d: 'M' + r1(gemC.x) + ',' + r1(gemC.y + GEM.hz * S) + 'L' + r1(gemC.x) + ',' + r1(sy(GEM.x, GEM.y, 1.8)) }, gBed);
    gBed.insertBefore(gemBeam, gGem);

    /* --- Structured data: slab + record cards --- */
    var gOut = el('g', { class: 'ss-unit ss-u-out' }, slot.out);
    var bOut = box(gOut, OUT, 'ss-b-out');
    var tpO = topPlane(bOut, OUT);
    el('rect', { class: 'ss-pad-line', x: 7, y: 7, width: r1((OUT.x1 - OUT.x0) * S - 14), height: r1((OUT.y1 - OUT.y0) * S - 14), rx: 5 }, tpO);
    var cards = [];
    var cw = (CARD.x1 - CARD.x0) * S, chh = (CARD.y1 - CARD.y0) * S;
    for (var k2 = 0; k2 < CARD.n; k2++) {
      var cbx = { x0: CARD.x0, x1: CARD.x1, y0: CARD.y0, y1: CARD.y1, z0: OUT.h + k2 * CARD.step, h: CARD.h };
      var gCard = el('g', { class: 'ss-card' }, gOut);
      var trCard = addTr(gCard);
      var bc = box(gCard, cbx, 'ss-b-card', true);
      var tpc = topPlane(bc, cbx);
      // field rows: key + value
      for (var fr = 0; fr < 3; fr++) {
        var yy = 14 + fr * ((chh - 22) / 3);
        el('rect', { class: 'ss-field-key', x: 10, y: r1(yy), width: r1(cw * 0.2), height: 7, rx: 3.5 }, tpc);
        el('rect', { class: 'ss-field-v ss-fv' + fr, x: r1(cw * 0.2 + 18), y: r1(yy), width: r1(cw * (0.5 - fr * 0.1 + (k2 % 2) * 0.08)), height: 7, rx: 3.5 }, tpc);
      }
      cards.push({ g: gCard, tr: trCard, o: -1 });
    }

    // veils (drawn last inside each unit)
    var veils = {
      gate: [veil(gGateBack, GATE.back), veil(gGate, GATE.front), veil(gGate, GATE.lintel)],
      lambda: [veil(gLam, PAD)],
      bed: [el('polygon', { class: 'ss-veil', points: boxHull({ x0: BED.base.x0, x1: BED.base.x1, y0: BED.base.y0, y1: BED.base.y1, h: BED.base.h }) }, gBed),
            el('polygon', { class: 'ss-veil', points: boxHull(BED.mid) }, gBed), el('polygon', { class: 'ss-veil', points: boxHull(BED.cap) }, gBed)],
      out: [veil(gOut, OUT)]
    };
    gBed.appendChild(gGem); // gem stays above the veils (it is dimmed by opacity)

    /* ---------- packets ---------- */
    deco.appendChild(gArc);
    function firefly(parent, grad, r) {
      var trail = el('circle', { r: r1(r * 0.7), class: 'ss-trail ss-trail-' + grad }, parent);
      var ttr = addTr(trail);
      var g = el('g', { class: 'ss-ff' }, parent);
      el('circle', { r: r1(r * 4.2), fill: 'url(#' + id + grad + ')' }, g);
      el('circle', { r: r, class: 'ss-core' }, g);
      return { kind: 0, g: g, tr: addTr(g), trail: trail, ttr: ttr, o: -1 };
    }
    function sheet(parent, grad) {
      var g = el('g', { class: 'ss-pk' }, parent);
      el('circle', { r: 16, fill: 'url(#' + id + grad + ')' }, g);
      el('rect', { x: -6, y: -8, width: 12, height: 16, rx: 1.6, class: 'ss-pk-sheet' }, g);
      el('path', { d: 'M-3,-3.5h6M-3,0h6M-3,3.5h4', class: 'ss-pk-lines' }, g);
      return { kind: 1, g: g, tr: addTr(g), o: -1 };
    }
    function chips(parent) {
      var g = el('g', { class: 'ss-pk' }, parent);
      el('circle', { r: 17, fill: 'url(#' + id + 'hC)' }, g);
      el('rect', { x: -9, y: -7.5, width: 15, height: 4, rx: 2, class: 'ss-chip-c' }, g);
      el('rect', { x: -9, y: -2, width: 11, height: 4, rx: 2, class: 'ss-chip-b' }, g);
      el('rect', { x: -9, y: 3.5, width: 18, height: 4, rx: 2, class: 'ss-chip-a' }, g);
      return { kind: 1, g: g, tr: addTr(g), o: -1 };
    }
    function stream(route, sp, make) {
      var n = Math.ceil(route.total / sp) + 1, arr = [];
      for (var i = 0; i < n; i++) arr.push(make(i));
      return { route: route, sp: sp, n: n, period: n * sp, items: arr };
    }
    var sUp = stream(routes.up, 0.75, function () { return sheet(gArc, 'hB'); });
    var sReq = stream(routes.req, 0.42, function () { return firefly(slot.pkReq, 'hA', 2.3); });
    var sDoc = stream(routes.doc, 0.62, function () { return sheet(slot.pkDoc, 'hB'); });
    var sChip = stream(routes.chip, 0.62, function () { return chips(slot.pkChip); });

    /* ---------- labels ---------- */
    var gLab = el('g', { class: 'ss-labels' }, gCam);
    var trLab = addTr(gLab);
    var labels = {};
    LABELS.forEach(function (d) {
      var ax = sx(d.anchor[0], d.anchor[1]), ay = sy(d.anchor[0], d.anchor[1], d.anchor[2]);
      var g = el('g', { class: 'ss-label ss-l-' + d.id + (d.minor ? ' ss-minor' : ''), 'aria-hidden': 'true' }, gLab);
      var leader = el('path', { class: 'ss-leader' }, g);
      var dot = el('circle', { class: 'ss-leader-dot', cx: r1(ax), cy: r1(ay), r: 2.2 }, g);
      var anchor = d.place === 'right' ? 'start' : d.place === 'left' ? 'end' : 'middle';
      var t = el('text', { class: 'ss-title', 'text-anchor': anchor }, g);
      t.textContent = d.title;
      var s = el('text', { class: 'ss-sub', 'text-anchor': anchor }, g);
      s.textContent = d.sub;
      labels[d.id] = { d: d, g: g, t: t, s: s, leader: leader, dot: dot, ax: ax, ay: ay, o: -1 };
    });
    // cost tag (final step / overview): pill + before/after meter
    var gTag = el('g', { class: 'ss-tag', 'aria-hidden': 'true' }, gLab);
    var tagA = { x: sx(CARD.x1 - 0.15, CARD.y0 + 0.2), y: sy(CARD.x1 - 0.15, CARD.y0 + 0.2, OUT.h + CARD.n * CARD.step) };
    var tagLeader = el('path', { class: 'ss-leader' }, gTag);
    var tagDot = el('circle', { class: 'ss-leader-dot', cx: r1(tagA.x), cy: r1(tagA.y), r: 2.2 }, gTag);
    var gTagBody = el('g', null, gTag);
    var trTagT = addTr(gTagBody), trTagS = addTr(gTagBody);
    el('rect', { class: 'ss-tag-bg', x: 0, y: -15, width: 128, height: 40, rx: 8 }, gTagBody);
    var tagText = el('text', { class: 'ss-tag-text', x: 10, y: 0 }, gTagBody);
    tagText.textContent = '20–30% lower cost';
    el('rect', { class: 'ss-meter-was', x: 10, y: 8, width: 108, height: 4, rx: 2 }, gTagBody);
    var meterNow = el('rect', { class: 'ss-meter-now', x: 10, y: 15, width: 81, height: 4, rx: 2 }, gTagBody);
    // brace showing the 20-30% band on the meter
    el('rect', { class: 'ss-meter-band', x: 85.6, y: 14, width: 10.8, height: 6, rx: 1.5 }, gTagBody);

    /* ---------- layout: constant on-screen label size + fit to content ---------- */
    var vb = { x: -100, y: -100, w: 1200, h: 700 };
    var k = 1, compact = false, wide = true, tagOn = true;
    function placeLabels() {
      var tPx = (compact ? 11 : 13) * k, sPx = 11.5 * k, gap = 5 * k;
      for (var key in labels) {
        var l = labels[key], d = l.d;
        var ex = l.ax + d.off[0] * k, ey = l.ay + d.off[1] * k * (compact ? 0.82 : 1);
        l.dot.setAttribute('r', r1(2.2 * k));
        l.leader.setAttribute('d', 'M' + r1(l.ax) + ',' + r1(l.ay) + 'L' + r1(ex) + ',' + r1(ey));
        l.t.textContent = compact && !overview ? d.short : (overview && !wide ? d.short : d.title);
        var hasSub = !compact && !overview;
        l.s.style.display = hasSub ? '' : 'none';
        var ty, syy;
        var tx = ex;
        if (d.place === 'above') { syy = ey - gap; ty = hasSub ? syy - sPx * 1.4 : ey - gap; }
        else if (d.place === 'below') { ty = ey + gap + tPx * 0.8; syy = ty + sPx * 1.4; }
        else {                                     // 'right' / 'left': centred on the leader end
          tx = ex + (d.place === 'right' ? gap : -gap);
          ty = hasSub ? ey - 0.1 * tPx : ey + 0.36 * tPx; syy = ty + sPx * 1.4;
        }
        l.t.setAttribute('x', r1(tx)); l.t.setAttribute('y', r1(ty));
        l.s.setAttribute('x', r1(tx)); l.s.setAttribute('y', r1(syy));
      }
      // cost tag: fixed on-screen size via a scale transform
      var tx = tagA.x - 34 * k, ty2 = tagA.y - 64 * k;
      tagLeader.setAttribute('d', 'M' + r1(tagA.x) + ',' + r1(tagA.y) + 'L' + r1(tagA.x) + ',' + r1(ty2 + 25 * k));
      tagDot.setAttribute('r', r1(2.2 * k));
      trTagT.setTranslate(tx, ty2);
      trTagS.setScale(k, k);
      gTag.style.display = tagOn ? '' : 'none';
    }
    function layout() {
      var r0 = container.getBoundingClientRect();
      var cw0 = r0.width;
      if (!cw0) return;
      compact = cw0 < 560;
      wide = cw0 >= 480;
      tagOn = !overview || cw0 >= 560;
      root.classList.toggle('is-compact', compact);
      for (var pass = 0; pass < 3; pass++) {
        var r = svg.getBoundingClientRect();
        var W = r.width || cw0, H = r.height || (W * vb.h / vb.w);
        k = Math.max(vb.w / W, vb.h / H);
        svg.style.setProperty('--ss-k', k.toFixed(3));
        placeLabels();
        var b = unionBox();
        if (!b) return;
        var px = b.w * (overview ? 0.02 : 0.035) + 4 * k, py = b.h * (overview ? 0.03 : 0.045) + 4 * k;
        vb = { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py };
        svg.setAttribute('viewBox', r1(vb.x) + ' ' + r1(vb.y) + ' ' + r1(vb.w) + ' ' + r1(vb.h));
        if (!overview) svg.style.aspectRatio = r1(vb.w) + ' / ' + r1(vb.h);
      }
      VC.x = vb.x + vb.w / 2; VC.y = vb.y + vb.h / 2;
      if (ready) setStep(st.idx, st.p);
    }
    var VC = { x: 0, y: 0 };
    function unionBox() {
      var list = [gFloor, gDocs, gOut, gBed, gEdge, gGateBack, gGate, gLam, gLab], x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < list.length; i++) {
        var b;
        try { b = list[i].getBBox(); } catch (e) { return null; }
        if (!b || !b.width) continue;
        if (list[i] === gLab) {
          // label bboxes include hidden ones; walk visible children instead
          var ch = gLab.childNodes;
          for (var c = 0; c < ch.length; c++) {
            if (ch[c].style.display === 'none' || (ch[c].classList.contains('ss-minor') && compact)) continue;
            var bb = ch[c].getBBox();
            if (!bb.width) continue;
            var tx = 0, ty = 0;
            if (ch[c] === gTag) { /* body is transformed: include via its bbox in gLab space */
              var m = gTagBody.getCTM(), mg = gLab.getCTM();
              if (m && mg) {
                var bt = gTagBody.getBBox(), inv = mg.inverse().multiply(m);
                var ax0 = inv.a * bt.x + inv.c * bt.y + inv.e, ay0 = inv.b * bt.x + inv.d * bt.y + inv.f;
                var ax1 = inv.a * (bt.x + bt.width) + inv.c * (bt.y + bt.height) + inv.e, ay1 = inv.b * (bt.x + bt.width) + inv.d * (bt.y + bt.height) + inv.f;
                x0 = Math.min(x0, ax0); y0 = Math.min(y0, ay0); x1 = Math.max(x1, ax1); y1 = Math.max(y1, ay1);
              }
              continue;
            }
            x0 = Math.min(x0, bb.x + tx); y0 = Math.min(y0, bb.y + ty);
            x1 = Math.max(x1, bb.x + bb.width + tx); y1 = Math.max(y1, bb.y + bb.height + ty);
          }
          continue;
        }
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      if (!isFinite(x0)) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    var ready = false;

    /* ---------- state ---------- */
    var st = { idx: 0, p: 0, g: 0 };
    var unitG = { docs: gDocs, edge: gEdge, gate: gGate, lambda: gLam, bed: gBed, out: gOut };
    var litBlocks = {
      docs: [], edge: [bPed, gGlobe, gBucket], gate: [bGateBack, bGateFront, bLintel],
      lambda: [bPad], bed: [bBase, bMid, bCap], out: [bOut]
    };
    function setO(obj, v) {           // write opacity only when it changes
      v = Math.round(v * 100) / 100;
      if (obj.o !== v) { obj.o = v; obj.g.style.opacity = v; }
    }
    function op(node, v) { node.style.opacity = Math.round(v * 100) / 100; }

    function setStep(index, progress) {
      var i = Math.max(0, Math.min(4, Math.floor(+index || 0)));
      var p = clamp(+progress || 0);
      if (overview) { i = 4; p = 1; }
      var g = overview ? 5.5 : i + p;
      st.idx = i; st.p = p; st.g = g;
      var full = overview ? 1 : 0;
      op(gFloor, 0.6 + 0.4 * ease(g / 0.35));
      // ghost veils lift as each unit is introduced
      var vv = { gate: 1 - ease((g - 1) / 0.45), lambda: 1 - ease((g - 2) / 0.45), bed: 1 - ease((g - 3) / 0.45), out: 1 - ease((g - 4) / 0.45) };
      for (var vk in veils) for (var vi = 0; vi < veils[vk].length; vi++) op(veils[vk][vi], 0.8 * vv[vk]);
      // flows: reach along the route + intensity
      st.upR = clamp(g / 0.6);                st.upI = full || (i === 0 ? 1 : 0.5);
      st.reqR = clamp((g - 1) / 0.6);         st.reqI = full || (i === 1 || i === 2 ? 1 : 0.55);
      st.docR = clamp((g - 3) / 0.45);        st.docI = full || (i === 3 ? 1 : 0.6);
      st.chipR = clamp((g - 3.35) / 0.5);     st.chipI = full || 1;
      st.ring = overview ? 0.55 : i === 0 ? 0.4 + 0.6 * ease(p / 0.3) : 0.3 * (1 - ease((g - 1) / 0.5));
      st.gate = ease((g - 1) / 0.35) * (i === 1 || overview ? 1 : 0.55);
      st.cubeRamp = g;                         // used per cube
      st.churn = overview ? 1 : ease((g - 3) / 0.5);
      st.core = 0.12 * ease((g - 2) / 0.5) + 0.88 * ease((g - 3) / 0.45) * (i === 4 && !overview ? 0.75 : 1);
      st.gem = 0.35 + 0.65 * ease((g - 3) / 0.45);
      st.spin = i === 3 || overview ? 1 : 0.4;
      wires.up.style.opacity = r1(0.85 * st.upR * st.upI);
      op(wires.req, 0.85 * st.reqR * st.reqI);
      op(wires.doc, 0.85 * st.docR * st.docI);
      op(wires.chip, 0.85 * st.chipR);
      op(arcBase, 0.4 + 0.6 * ease(g / 0.5));
      // bucket fill level rises during upload and stays
      var lvl = 0.25 + 0.75 * ease(g / 0.9);
      trFill.setTranslate(0, -r1((0.15 + lvl * (bk.h - 0.3)) * S));
      op(gFill, 0.3 + 0.7 * ease(g / 0.4));
      // record cards drop in during step 4
      for (var c = 0; c < cards.length; c++) {
        var cl = overview ? 1 : ease((g - 4.05 - c * 0.11) / 0.22);
        cards[c].tr.setTranslate(0, -r1((1 - cl) * 26));
        setO(cards[c], cl);
      }
      op(gRegion, ease((g - 4) / 0.5));
      op(gTag, ease((g - 4.4) / 0.4));
      // lit / on classes + glows
      // step 0 lights docs then edge; later steps light their own unit
      var litU = i === 0 ? (p < 0.35 ? 'docs' : 'edge') : UNITS[i + 1];
      var onAt = { docs: 0, edge: 0.3, gate: 1, lambda: 2, bed: 3, out: 4 };
      for (var u in unitG) {
        var isLit = !overview && u === litU;
        var isOn = g >= onAt[u] && !isLit;
        for (var bi = 0; bi < litBlocks[u].length; bi++) {
          litBlocks[u][bi].classList.toggle('is-lit', isLit);
          litBlocks[u][bi].classList.toggle('is-on', isOn);
        }
        if (u === 'gate') { bGateBack.classList.toggle('is-lit', isLit); }
        labels[u].g.classList.toggle('is-lit', isLit);
        var lo = overview ? 1 : g >= onAt[u] - 0.4 ? 0.45 + 0.55 * ease((g - onAt[u] + 0.4) / 0.4) : 0.45;
        labels[u].g.style.opacity = r1(lo);
        op(glow[u], overview ? 0.35 : isLit ? 0.85 : isOn ? 0.25 : 0);
      }
      // camera: eases toward the unit in focus (story only)
      if (!overview && VC.x) {
        var f0 = Math.min(4, Math.floor(g)), f1 = Math.min(4, f0 + 1), cf = ease(g - f0);
        var c0 = CAM[f0], c1 = CAM[f1];
        var cz = c0[2] + (c1[2] - c0[2]) * cf;
        var fwx = c0[0] + (c1[0] - c0[0]) * cf, fwy = c0[1] + (c1[1] - c0[1]) * cf;
        var fx = sx(fwx, fwy), fy = sy(fwx, fwy, 0.8);
        if (compact) cz = 1 + (cz - 1) * 0.5;
        var dx = (VC.x - fx) * 0.08 * (cz - 1) / 0.04, dy = (VC.y - fy) * 0.06 * (cz - 1) / 0.04;
        gCam.setAttribute('transform', 'translate(' + r1(VC.x * (1 - cz) + dx) + ' ' + r1(VC.y * (1 - cz) + dy) + ') scale(' + cz.toFixed(4) + ')');
      }
      render(reduced ? STILL_T : time);
      kick();
    }

    /* ---------- per-frame render (mutates existing nodes only) ---------- */
    var STILL_T = 3.1;
    function placeStream(sm, reach, inten, t, speed, zBase, bob) {
      var L = sm.route.total, head = reach * L;
      for (var j = 0; j < sm.n; j++) {
        var it = sm.items[j];
        var s = (j * sm.sp + t * speed) % sm.period;
        var o = 0;
        if (s <= L && s <= head && inten > 0) {
          o = inten * clamp(s / 0.35) * clamp((L - s) / 0.35) * clamp((head - s) / 0.5 + (reach >= 1 ? 1 : 0));
        }
        if (o > 0.005) {
          at(sm.route, s);
          var z = zBase + Q.z + (bob ? 0.07 * Math.sin(s * 3.1 + j) : 0);
          it.tr.setTranslate(sx(Q.x, Q.y), sy(Q.x, Q.y, z));
          if (it.kind === 0) {
            at(sm.route, s - 0.2);
            it.ttr.setTranslate(sx(Q.x, Q.y), sy(Q.x, Q.y, zBase + Q.z));
            var blink = reduced ? 1 : 0.8 + 0.2 * Math.sin(t * (3.1 + (j % 5) * 0.7) + j * 1.3);
            o *= blink;
          }
        }
        if (it.kind === 0 && it.o !== Math.round(o * 100) / 100) it.trail.style.opacity = Math.round(o * 55) / 100;
        setO(it, o);
      }
    }
    // octahedron gem, rotated by angle a; only front-facing faces drawn
    var GV = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    function setPt(list, n, x, y) { var q = list.getItem(n); q.x = x; q.y = y; }
    function renderGem(a) {
      for (var v = 0; v < 4; v++) {
        var ang = a + v * Math.PI / 2;
        GV[v][0] = GEM.r * Math.cos(ang); GV[v][1] = GEM.r * Math.sin(ang);
      }
      for (var f = 0; f < 8; f++) {
        var up = f < 4, e0 = GV[f % 4], e1 = GV[(f + 1) % 4];
        var az = up ? GEM.hz : -GEM.hz;
        // face normal = (e0 - apex) x (e1 - apex)
        var ux = e0[0], uy = e0[1], uz = -az, vx = e1[0], vy = e1[1], vz = -az;
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (!up) { nx = -nx; ny = -ny; nz = -nz; }
        var dot = (nx + ny + nz);                 // view dir (1,1,1)
        var fc = gemFaces[f];
        var vis = dot > 0 ? 1 : 0;
        if (fc.vis !== vis) { fc.vis = vis; fc.f.style.display = fc.s.style.display = vis ? '' : 'none'; }
        if (!vis) continue;
        var ax0 = sx(GEM.x, GEM.y), ay0 = sy(GEM.x, GEM.y, GEM.z);
        var p0x = ax0 + sx(0, 0), p0y = ay0 - az * S;
        var p1x = ax0 + (e0[0] - e0[1]) * CX, p1y = ay0 + (e0[0] + e0[1]) * HY;
        var p2x = ax0 + (e1[0] - e1[1]) * CX, p2y = ay0 + (e1[0] + e1[1]) * HY;
        setPt(fc.fp, 0, p0x, p0y); setPt(fc.fp, 1, p1x, p1y); setPt(fc.fp, 2, p2x, p2y);
        setPt(fc.sp, 0, p0x, p0y); setPt(fc.sp, 1, p1x, p1y); setPt(fc.sp, 2, p2x, p2y);
        // light from upper-left-front: lit top, mid left, shaded right
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var lit = (-0.15 * nx + 0.55 * ny + 0.82 * nz) / len;
        fc.s.style.opacity = r1(clamp(0.55 - lit * 0.6) * 10) / 10;
      }
    }
    function cubeLevel(j, t) {
      // story ramp: centre-out spin-up during step 2
      var rank = cubeRank[j];
      var ramp = rank < 6 ? ease((st.cubeRamp - 2.05 - rank * 0.1) / 0.22) : 0;
      if (st.churn <= 0) return ramp;
      // demand-driven churn: functions start when work arrives, scale to zero when idle
      var duty = 0.5 + 0.18 * Math.sin(t * 0.37);
      var f = frac(t * 0.21 + j * 0.618034 + 0.07);
      var amb = clamp(f / 0.05) * clamp((duty - f) / 0.07);
      return ramp + (amb - ramp) * st.churn;
    }
    function render(t) {
      var still = reduced;
      // edge pulses
      for (var r = 0; r < rings.length; r++) {
        var fr2 = ((still ? 0.15 : t * 0.45) + r / 3) % 1, rad = 0.75 + fr2 * 1.7;
        rings[r].e.rx.baseVal.value = rad * RX1; rings[r].e.ry.baseVal.value = rad * RY1;
        if (rings[r].o !== Math.round(st.ring * (1 - fr2) * 70) / 100) { rings[r].o = Math.round(st.ring * (1 - fr2) * 70) / 100; rings[r].e.style.opacity = rings[r].o; }
      }
      // globe spin
      var gph = (still ? 0.5 : t * 0.6);
      for (var m = 0; m < meridians.length; m++) meridians[m].rx.baseVal.value = Math.max(0.5, GR * Math.abs(Math.sin(gph + m * Math.PI / 3)));
      for (var d = 0; d < edgeDots.length; d++) {
        var on = still ? 1 : 0.35 + 0.65 * (Math.sin(t * 2.2 + edgeDots[d].ph) > 0.2 ? 1 : 0.3);
        if (edgeDots[d].o !== on) { edgeDots[d].o = on; edgeDots[d].e.style.opacity = on; }
      }
      placeStream(sUp, st.upR, st.upI, t, 0.95, 0.2, false);
      placeStream(sReq, st.reqR, st.reqI, t, 1.3, 0.28, true);
      placeStream(sDoc, st.docR, st.docI, t, 0.8, 0.3, false);
      placeStream(sChip, st.chipR, st.chipI, t, 0.8, 0.3, false);
      // gateway LEDs: chase while requests pass
      for (var l = 0; l < gateLeds.length; l++) {
        var ch = still ? 1 : (Math.floor(t * 6) % gateLeds.length === l ? 1 : 0.45);
        var lv = Math.round((0.2 + 0.8 * st.gate * ch) * 100) / 100;
        if (gateLeds[l].o !== lv) { gateLeds[l].o = lv; gateLeds[l].e.style.opacity = lv; }
      }
      scan.style.opacity = r1(st.gate * (still ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(t * 2.6))) * 10) / 10;
      // lambda cubes
      for (var c = 0; c < cubes.length; c++) {
        var lvc = cubeLevel(c, still ? STILL_T : t);
        lvc = Math.round(lvc * 100) / 100;
        if (cubes[c].lv !== lvc) {
          cubes[c].lv = lvc;
          cubes[c].tr.setTranslate(0, r1((1 - lvc) * 14));
          setO(cubes[c], lvc);
          cubes[c].g.classList.toggle('is-hot', lvc > 0.05 && lvc < 0.98 && st.churn > 0.5);
        }
      }
      // bedrock core + gem
      var core = st.core * (still ? 1 : 0.8 + 0.2 * Math.sin(t * 1.5));
      op(coreEls[0], core); op(coreEls[1], core); op(coreTop, 0.2 + 0.8 * core);
      op(gemBeam, core * 0.8);
      op(gGem, st.gem);
      op(gemHalo, 0.15 + 0.85 * core);
      trGem.setTranslate(0, still ? 0 : r1(Math.sin(t * 1.2) * 4));
      renderGem(still ? 0.35 : 0.35 + t * (0.25 + 0.55 * st.spin));
    }

    /* ---------- ambient loop: only in viewport + tab visible ---------- */
    var time = 0, last = 0, raf = 0, inView = true, alive = true;
    function frame(ts) {
      raf = 0;
      if (!running()) { last = 0; return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts; time += dt;
      if (!overview) {
        var e = 1 - Math.pow(0.0025, dt);
        par.x += (par.tx - par.x) * e; par.y += (par.ty - par.y) * e;
        trShadow.setTranslate(-par.x * 7, -par.y * 4);
        trWorld.setTranslate(par.x * 3, par.y * 2);
        trLab.setTranslate(par.x * 6, par.y * 4);
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
    // defer to the next frame: layout() can change the container height
    var roRaf = 0, lastW = -1, lastH = -1;
    function onResize() {
      roRaf = 0;
      var r = container.getBoundingClientRect();
      var w = Math.round(r.width), h = overview ? Math.round(r.height) : 0;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      layout();
    }
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(function () { if (!roRaf) roRaf = requestAnimationFrame(onResize); });
      ro.observe(container);
    }
    else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (alive) layout(); });
    function onVis() { if (document.hidden) stop(); else kick(); }
    document.addEventListener('visibilitychange', onVis);
    function onMq() {
      reduced = !!opts.reducedMotion || !!(mq && mq.matches);
      root.classList.toggle('is-reduced', reduced);
      if (reduced) {
        stop(); par.x = par.y = par.tx = par.ty = 0;
        trShadow.setTranslate(0, 0); trWorld.setTranslate(0, 0); trLab.setTranslate(0, 0);
        render(STILL_T);
      } else kick();
    }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    root.classList.toggle('is-reduced', reduced);

    renderGem(0.35);
    layout();
    ready = true;
    setStep(0, 0);

    return {
      steps: 5,
      setStep: setStep,
      destroy: function () {
        alive = false; stop();
        if (io) io.disconnect();
        if (roRaf) cancelAnimationFrame(roRaf);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
        document.removeEventListener('visibilitychange', onVis);
        root.removeEventListener('pointermove', onPointer);
        root.removeEventListener('pointerleave', onLeave);
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  window.ServerlessScene = { mount: mount };
})();
