/* ============================================================
   PublicSectorScene — isometric architecture scene for the
   public-sector agentic GraphRAG story: an agent crew grounded in a
   knowledge graph, reasoning with an air-gapped LLM, served through an
   API to users — all inside an accredited (IL4+) air-gapped network.

   window.PublicSectorScene.mount(container, { reducedMotion, mode })
     -> { steps: 5, setStep(index 0..4, progress 0..1), destroy() }
   mode 'story' (default): state is a pure function of index + progress.
   mode 'overview': the completed architecture, packets on every edge,
                    titles only, no step choreography.

   Inline SVG, true isometric projection (30deg), no 3D library, no
   filters. Every SVG node is created once in mount(); the rAF loop only
   mutates transforms / lengths / opacity on existing nodes.
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
  function rect(x0, x1, y0, y1, z) { return poly([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]); }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp(v); return v * v * (3 - 2 * v); }
  // maps a horizontal plane at height z (local u along +x, v along +y,
  // in px) onto the screen; origin at world (x, y, z)
  function planeMatrix(x, y, z) {
    return 'matrix(0.8660254 0.5 -0.8660254 0.5 ' + r1(sx(x, y)) + ' ' + r1(sy(x, y, z)) + ')';
  }

  /* ---------- world layout (iso floor units) ---------- */
  var PLATE = { x0: 0, x1: 15.2, y0: 0, y1: 10, t: 0.4 };
  var IN1 = 0.24, IN2 = 0.5;                       // double boundary insets
  var GT = { x0: 0.9, x1: 3.7, y0: 5.7, y1: 8.5, h: 0.3 };   // graph tower plinth
  var LAYERS = [                                    // schema layers (z, inset)
    { z: 0.78, i: 0.0, n: [[0.2, 0.25], [0.55, 0.18], [0.82, 0.4], [0.3, 0.7], [0.62, 0.62], [0.8, 0.85], [0.18, 0.88]] },
    { z: 1.58, i: 0.22, n: [[0.22, 0.3], [0.7, 0.22], [0.5, 0.58], [0.25, 0.8], [0.8, 0.78]] },
    { z: 2.38, i: 0.44, n: [[0.3, 0.3], [0.75, 0.35], [0.4, 0.75], [0.78, 0.78]] }
  ];
  var LTH = 0.09;                                   // layer slab thickness
  var LEDGES = [
    [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [4, 5], [3, 6], [1, 4]],
    [[0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [3, 4]],
    [[0, 1], [0, 2], [1, 3], [2, 3], [0, 3]]
  ];
  var VLINKS = [[[1, 0], [4, 2], [5, 4]], [[0, 0], [2, 3], [4, 3]]]; // layer j node -> layer j+1 node
  var TABLE = { x: 7.3, y: 4.7, r: 0.95, h: 0.46 };
  var AG_R = 1.42;                                  // agent offset along each diagonal
  var AGENTS = [[-1, -1], [-1, 1], [1, -1], [1, 1]]; // back, left, right, front (draw order)
  var LLM = { x0: 10.7, x1: 12.9, y0: 0.7, y1: 2.9, h: 2.45 };
  var API = { x0: 10.1, x1: 12.1, y0: 6.3, y1: 8.1, h: 0.95 };
  var USERS = [4.9, 6.8, 8.7];                      // terminal centres (y), x fixed
  var UX = 13.85;
  var CI = { x0: 9.7, x1: 12.5, y0: 8.75, y1: 9.15 };

  function arc(a, b, peak) {
    var out = [];
    for (var i = 0; i <= 20; i++) {
      var u = i / 20;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u + peak * 4 * u * (1 - u)]);
    }
    return out;
  }
  function rev(pts) { return pts.slice().reverse(); }
  var ROUTES = {
    gq: arc([6.45, 5.05, 0.62], [3.7, 6.75, 1.62], 0.9),        // agents -> graph (query)
    gc: rev(arc([6.65, 5.45, 0.62], [3.7, 7.35, 1.3], 0.65)),    // graph -> agents (context)
    lp: arc([7.95, 3.85, 0.62], [11.05, 2.9, 1.55], 1.15),       // agents -> LLM (prompt)
    lc: rev(arc([8.25, 4.15, 0.62], [11.6, 2.9, 1.2], 0.85)),    // LLM -> agents (completion)
    ap: arc([8.05, 5.45, 0.62], [10.1, 7.2, 0.7], 0.75),         // agents -> API (answer)
    u0: [[12.1, 6.75, 0.22], [12.85, 6.75, 0.22], [12.85, USERS[0], 0.22], [UX - 0.38, USERS[0], 0.22]],
    u1: [[12.1, 7.2, 0.22], [UX - 0.38, 7.2, 0.22], [UX - 0.38, USERS[1], 0.22]],
    u2: [[12.1, 7.65, 0.22], [12.85, 7.65, 0.22], [12.85, USERS[2], 0.22], [UX - 0.38, USERS[2], 0.22]]
  };
  var STUB = [[12.9, 1.8, 0.03], [PLATE.x1 - IN2 - 0.28, 1.8, 0.03]];

  function makeRoute(pts) {
    var seg = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], dz = pts[i][2] - pts[i - 1][2];
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      seg.push(d); total += d;
    }
    return { pts: pts, seg: seg, total: total };
  }
  var Q = { x: 0, y: 0, z: 0 };                     // scratch point (no per-frame allocation)
  function at(route, u) {
    var p = route.pts, seg = route.seg, s = clamp(u) * route.total;
    for (var i = 0; i < seg.length; i++) {
      if (s <= seg[i] || i === seg.length - 1) {
        var k = seg[i] ? Math.min(1, s / seg[i]) : 0;
        Q.x = p[i][0] + (p[i + 1][0] - p[i][0]) * k;
        Q.y = p[i][1] + (p[i + 1][1] - p[i][1]) * k;
        Q.z = p[i][2] + (p[i + 1][2] - p[i][2]) * k;
        return Q;
      }
      s -= seg[i];
    }
    return Q;
  }
  function routeD(pts) {
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + P(pts[i][0], pts[i][1], pts[i][2]);
    return d;
  }

  /* ---------- copy ----------
     o = wide placement [dx, dy, anchor] in on-screen px from the anchor,
     c = compact / overview placement. */
  var LABELS = [
    { id: 'bound', anchor: [PLATE.x1 - IN1, PLATE.y0 + 3.4, 0], o: [30, 16, 'start'], c: [12, 12, 'start'],
      title: 'Accredited network (IL4+)', short: 'IL4+ air-gapped', sub: 'Air-gapped: nothing crosses the line' },
    { id: 'users', anchor: [UX + 0.08, USERS[2] - 0.3, 0.86], o: [44, 40, 'start'], c: [14, 12, 'start'],
      title: 'Users on the network', short: 'Users', sub: 'Inside the boundary, at its edge' },
    { id: 'graph', anchor: [GT.x0 + 0.9, GT.y0 + 0.9, LAYERS[2].z + LTH], o: [-34, -44, 'end'], c: [-14, -24, 'end'],
      title: 'Knowledge graph', short: 'Knowledge graph', sub: 'Neo4j, knowledge-service data model' },
    { id: 'agents', anchor: [TABLE.x - AG_R, TABLE.y - AG_R, 1.2], o: [40, -96, 'start'], c: [14, -40, 'start'],
      title: 'Agent crew', short: 'Agent crew', sub: 'CrewAI + LangChain' },
    { id: 'llm', anchor: [LLM.x1, LLM.y0, LLM.h], o: [28, -30, 'start'], c: [12, -18, 'start'],
      title: 'Air-gapped LLM', short: 'Air-gapped LLM', sub: 'No external model APIs' },
    { id: 'api', anchor: [API.x0 + 0.5, API.y1, 0.45], o: [-40, 52, 'end'], c: [-30, 8, 'end'],
      title: 'API service', short: 'API', sub: 'FastAPI in Docker, shipped by GitLab CI' }
  ];
  var LEGEND = [['b', 'retrieval query'], ['a', 'graph context, answers'], ['c', 'model prompts']];

  function mount(container, opts) {
    opts = opts || {};
    var id = 'ps' + (++uid);
    var overview = opts.mode === 'overview';
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!opts.reducedMotion || !!(mq && mq.matches);

    var root = document.createElement('div');
    root.className = 'ps' + (overview ? ' is-overview' : '');
    var svg = el('svg', {
      class: 'ps-svg', viewBox: '-460 -80 1120 720',
      role: 'img', 'aria-labelledby': id + '-t ' + id + '-d', preserveAspectRatio: 'xMidYMid meet'
    });
    el('title', { id: id + '-t' }, svg).textContent = 'Agentic GraphRAG for an air-gapped LLM, public sector';
    el('desc', { id: id + '-d' }, svg).textContent =
      'Inside an accredited, air-gapped government network (IL4+), a crew of agents built with CrewAI and ' +
      'LangChain retrieves context from a Neo4j knowledge graph organised by a knowledge-service data model, ' +
      'prompts a self-contained LLM that calls no external model APIs, and returns answers through a FastAPI ' +
      'service in Docker, shipped with GitLab CI and ported from Python to Go, to users on the same network. ' +
      'Nothing crosses the network boundary.';
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
    halo('hA', 'ps-st-a'); halo('hB', 'ps-st-b'); halo('hC', 'ps-st-c');
    var pg = el('linearGradient', { id: id + 'plate', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', class: 'ps-st-plate0' }, pg);
    el('stop', { offset: '1', class: 'ps-st-plate1' }, pg);
    var shade = el('linearGradient', { id: id + 'shade', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.07' }, shade);
    el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.22' }, shade);
    var cyl = el('linearGradient', { id: id + 'cyl', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.06' }, cyl);
    el('stop', { offset: '0.55', 'stop-color': '#000000', 'stop-opacity': '0.05' }, cyl);
    el('stop', { offset: '1', 'stop-color': '#000000', 'stop-opacity': '0.32' }, cyl);
    var seam = el('linearGradient', { id: id + 'seam', x1: '0', y1: '1', x2: '0', y2: '0' }, defs);
    el('stop', { offset: '0', class: 'ps-st-c', 'stop-opacity': '0.95' }, seam);
    el('stop', { offset: '1', class: 'ps-st-c', 'stop-opacity': '0.2' }, seam);
    var drop = el('radialGradient', { id: id + 'drop' }, defs);
    el('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '0.55' }, drop);
    el('stop', { offset: '0.6', 'stop-color': '#000', 'stop-opacity': '0.2' }, drop);
    el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' }, drop);

    function addTr(node) { var t = svg.createSVGTransform(); node.transform.baseVal.appendItem(t); return t; }

    // gFit holds everything the viewBox is fitted to (packets ride inside it)
    var gFit = el('g', { class: 'ps-fit' }, svg);
    var pc = { x: (PLATE.x0 + PLATE.x1) / 2, y: (PLATE.y0 + PLATE.y1) / 2 };
    el('ellipse', { class: 'ps-drop', cx: r1(sx(pc.x, pc.y)), cy: r1(sy(pc.x, pc.y, -PLATE.t) + 30), rx: r1(9.6 * RX1), ry: r1(6.6 * RY1), fill: 'url(#' + id + 'drop)' }, gFit);
    var deco = el('g', { 'aria-hidden': 'true', class: 'ps-world' }, gFit);

    /* ---------- floor plate ---------- */
    var gFloor = el('g', { class: 'ps-floor' }, deco);
    el('polygon', { class: 'ps-plate-side ps-l', points: poly([[PLATE.x0, PLATE.y1, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y1, -PLATE.t], [PLATE.x0, PLATE.y1, -PLATE.t]]) }, gFloor);
    el('polygon', { class: 'ps-plate-side ps-r', points: poly([[PLATE.x1, PLATE.y0, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y1, -PLATE.t], [PLATE.x1, PLATE.y0, -PLATE.t]]) }, gFloor);
    el('polygon', { class: 'ps-plate', fill: 'url(#' + id + 'plate)', points: rect(PLATE.x0, PLATE.x1, PLATE.y0, PLATE.y1, 0) }, gFloor);
    var gd = '';
    for (var gx = 1; gx < PLATE.x1; gx++) gd += 'M' + P(gx, PLATE.y0 + IN2, 0) + 'L' + P(gx, PLATE.y1 - IN2, 0);
    for (var gy = 1; gy < PLATE.y1; gy++) gd += 'M' + P(PLATE.x0 + IN2, gy, 0) + 'L' + P(PLATE.x1 - IN2, gy, 0);
    el('path', { class: 'ps-grid', d: gd }, gFloor);
    el('polyline', { class: 'ps-plate-rim', points: poly([[PLATE.x0, PLATE.y1, 0], [PLATE.x1, PLATE.y1, 0], [PLATE.x1, PLATE.y0, 0]]) }, gFloor);

    /* ---------- hardened boundary: double dashed line + corner locks ---------- */
    var gBound = el('g', { class: 'ps-bound' }, deco);
    el('polygon', { class: 'ps-bound-fill', points: rect(PLATE.x0 + IN2, PLATE.x1 - IN2, PLATE.y0 + IN2, PLATE.y1 - IN2, 0) }, gBound);
    var bOuter = el('polygon', { class: 'ps-bound-line ps-bound-outer', points: rect(PLATE.x0 + IN1, PLATE.x1 - IN1, PLATE.y0 + IN1, PLATE.y1 - IN1, 0) }, gBound);
    var bInner = el('polygon', { class: 'ps-bound-line ps-bound-inner', points: rect(PLATE.x0 + IN2, PLATE.x1 - IN2, PLATE.y0 + IN2, PLATE.y1 - IN2, 0) }, gBound);
    var ft = el('text', { class: 'ps-floortext ps-minor', transform: planeMatrix(4.4, PLATE.y1 - IN2 - 0.22, 0) }, gBound);
    ft.textContent = 'Accredited network · IL4+ · air-gapped';
    // locks sit on the boundary corners at a constant on-screen size
    var locks = [];
    var lc = [[PLATE.x0 + 0.37, PLATE.y0 + 0.37], [PLATE.x1 - 0.37, PLATE.y0 + 0.37], [PLATE.x0 + 0.37, PLATE.y1 - 0.37], [PLATE.x1 - 0.37, PLATE.y1 - 0.37]];
    for (var li = 0; li < lc.length; li++) {
      var lg = el('g', { class: 'ps-lock' }, gBound);
      var lt = addTr(lg); lt.setTranslate(r1(sx(lc[li][0], lc[li][1])), r1(sy(lc[li][0], lc[li][1], 0)));
      var ls = addTr(lg);
      el('circle', { class: 'ps-lock-disc', r: 10 }, lg);
      el('path', { class: 'ps-lock-shackle', d: 'M-3.4,-1.2V-3.6a3.4,3.4 0 0 1 6.8,0V-1.2' }, lg);
      el('rect', { class: 'ps-lock-body', x: -5, y: -1.6, width: 10, height: 7.4, rx: 1.6 }, lg);
      el('circle', { class: 'ps-lock-hole', cy: 1.8, r: 1.1 }, lg);
      locks.push({ g: lg, s: ls, o: -1 });
    }

    /* ---------- floor glows ---------- */
    var gGlow = el('g', { class: 'ps-glows' }, deco);
    function floorGlow(cx, cy, r, grad) {
      return el('ellipse', { cx: r1(sx(cx, cy)), cy: r1(sy(cx, cy, 0)), rx: r1(r * RX1), ry: r1(r * RY1), fill: 'url(#' + id + grad + ')', class: 'ps-glow' }, gGlow);
    }
    var glow = {
      graph: floorGlow((GT.x0 + GT.x1) / 2, (GT.y0 + GT.y1) / 2, 2.3, 'hA'),
      agents: floorGlow(TABLE.x, TABLE.y, 2.6, 'hB'),
      llm: floorGlow((LLM.x0 + LLM.x1) / 2, (LLM.y0 + LLM.y1) / 2, 2.4, 'hC'),
      api: floorGlow((API.x0 + API.x1) / 2, (API.y0 + API.y1) / 2, 2.0, 'hA'),
      users: floorGlow(UX, USERS[1], 2.4, 'hA')
    };

    /* ---------- floor wiring (API -> users) + CI strip + blocked egress ---------- */
    var gWire = el('g', { class: 'ps-wires' }, deco);
    var routes = {}, wires = {};
    ['u0', 'u1', 'u2'].forEach(function (k) {
      routes[k] = makeRoute(ROUTES[k]);
      el('path', { class: 'ps-wire', d: routeD(ROUTES[k]) }, gWire);
      wires[k] = el('path', { class: 'ps-wire-on ps-w-a', d: routeD(ROUTES[k]) }, gWire);
    });
    var gCi = el('g', { class: 'ps-ci' }, deco);
    el('polygon', { class: 'ps-ci-strip', points: rect(CI.x0, CI.x1, CI.y0, CI.y1, 0.02) }, gCi);
    el('text', { class: 'ps-floortext ps-ci-text ps-minor', transform: planeMatrix(CI.x0 + 0.3, CI.y1 + 0.42, 0) }, gCi).textContent = 'GitLab CI pipeline';
    var ciStages = [];
    for (var cs = 0; cs < 5; cs++) {
      var cxw = CI.x0 + 0.35 + cs * ((CI.x1 - CI.x0 - 0.7) / 4), cyw = (CI.y0 + CI.y1) / 2;
      if (cs) el('path', { class: 'ps-ci-link', d: 'M' + P(cxw - (CI.x1 - CI.x0 - 0.7) / 4 + 0.12, cyw, 0.02) + 'L' + P(cxw - 0.12, cyw, 0.02) }, gCi);
      ciStages.push({ e: el('ellipse', { class: 'ps-ci-dot', cx: r1(sx(cxw, cyw)), cy: r1(sy(cxw, cyw, 0.02)), rx: 5.2, ry: 3 }, gCi), o: -1 });
    }
    var gStub = el('g', { class: 'ps-stub' }, deco);
    el('path', { class: 'ps-stub-line', d: routeD(STUB) }, gStub);
    var se = STUB[1], sxe = r1(sx(se[0], se[1])), sye = r1(sy(se[0], se[1], 0));
    var stubMark = el('g', { class: 'ps-stub-mark' }, gStub);
    addTr(stubMark).setTranslate(sxe, sye);
    var stubSc = addTr(stubMark);
    el('circle', { class: 'ps-stub-ring', r: 7 }, stubMark);
    el('path', { class: 'ps-stub-bar', d: 'M-4.6,-4.6L4.6,4.6' }, stubMark);

    /* ---------- solids ---------- */
    var gBlocks = el('g', { class: 'ps-blocks' }, deco);
    function box(parent, b, cls) {
      var z0 = b.z0 || 0, z1 = z0 + b.h;
      var g = el('g', { class: 'ps-block ' + (cls || '') }, parent);
      if (!z0) {
        var e = 0.14;
        el('polygon', { class: 'ps-ao', points: rect(b.x0 - e, b.x1 + e, b.y0 - e, b.y1 + e, 0) }, g);
      }
      var fl = poly([[b.x0, b.y1, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x0, b.y1, z0]]);
      var fr = poly([[b.x1, b.y0, z1], [b.x1, b.y1, z1], [b.x1, b.y1, z0], [b.x1, b.y0, z0]]);
      el('polygon', { class: 'ps-face-l', points: fl }, g);
      el('polygon', { class: 'ps-face-r', points: fr }, g);
      el('polygon', { class: 'ps-face-shade', fill: 'url(#' + id + 'shade)', points: fl }, g);
      el('polygon', { class: 'ps-face-shade', fill: 'url(#' + id + 'shade)', points: fr }, g);
      el('polygon', { class: 'ps-face-t', points: rect(b.x0, b.x1, b.y0, b.y1, z1) }, g);
      el('polygon', { class: 'ps-tint', points: rect(b.x0, b.x1, b.y0, b.y1, z1) }, g);
      el('path', {
        class: 'ps-edge',
        d: 'M' + P(b.x0, b.y1, z1) + 'L' + P(b.x0, b.y0, z1) + 'L' + P(b.x1, b.y0, z1) + 'L' + P(b.x1, b.y1, z1) + 'Z' +
           'M' + P(b.x1, b.y1, z1) + 'L' + P(b.x1, b.y1, z0)
      }, g);
      return g;
    }
    function veil(parent, b) {
      var z0 = b.z0 || 0, z1 = z0 + b.h;
      return el('polygon', { class: 'ps-veil', points: poly([[b.x0, b.y0, z1], [b.x1, b.y0, z1], [b.x1, b.y0, z0], [b.x1, b.y1, z0], [b.x0, b.y1, z0], [b.x0, b.y1, z1]]) }, parent);
    }
    function cylinder(parent, cx, cy, r, z0, h, cls) {
      var g = el('g', { class: 'ps-block ' + (cls || '') }, parent);
      var X = sx(cx, cy), Yb = sy(cx, cy, z0), Yt = sy(cx, cy, z0 + h), rx = r * RX1, ry = r * RY1;
      el('ellipse', { class: 'ps-ao', cx: r1(X), cy: r1(Yb + 2), rx: r1(rx + 8), ry: r1(ry + 5) }, g);
      var side = 'M' + r1(X - rx) + ',' + r1(Yt) + 'L' + r1(X - rx) + ',' + r1(Yb) + 'A' + r1(rx) + ',' + r1(ry) + ' 0 0 0 ' + r1(X + rx) + ',' + r1(Yb) + 'L' + r1(X + rx) + ',' + r1(Yt) + 'Z';
      el('path', { class: 'ps-face-l', d: side }, g);
      el('path', { class: 'ps-face-shade', fill: 'url(#' + id + 'cyl)', d: side }, g);
      el('ellipse', { class: 'ps-face-t', cx: r1(X), cy: r1(Yt), rx: r1(rx), ry: r1(ry) }, g);
      el('ellipse', { class: 'ps-edge', cx: r1(X), cy: r1(Yt), rx: r1(rx), ry: r1(ry) }, g);
      return g;
    }

    // --- graph tower: plinth, glass schema layers, posts, nodes ---
    function buildGraph(parent) {
      var g = el('g', { class: 'ps-unit ps-u-graph' }, parent);
      var plinth = box(g, GT, 'ps-b-graph');
      var layers = [];
      var px0 = GT.x0 + 0.62, px1 = GT.x1 - 0.62, py0 = GT.y0 + 0.62, py1 = GT.y1 - 0.62;
      var posts = [[px0, py0], [px1, py0], [px0, py1], [px1, py1]];
      for (var j = 0; j < LAYERS.length; j++) {
        var Ld = LAYERS[j], lb = { x0: GT.x0 + Ld.i, x1: GT.x1 - Ld.i, y0: GT.y0 + Ld.i, y1: GT.y1 - Ld.i, z0: Ld.z, h: LTH };
        var wrap = el('g', { class: 'ps-layer' }, g);
        var tr = addTr(wrap);
        // posts rising from the level below up to this layer
        var zb = j ? LAYERS[j - 1].z + LTH : GT.h, pd = '';
        for (var q = 0; q < posts.length; q++) pd += 'M' + P(posts[q][0], posts[q][1], zb) + 'L' + P(posts[q][0], posts[q][1], Ld.z);
        el('path', { class: 'ps-post', d: pd }, wrap);
        if (j) {
          var vd = '', Lp = LAYERS[j - 1], Lpb = { x0: GT.x0 + Lp.i, y0: GT.y0 + Lp.i, w: GT.x1 - GT.x0 - 2 * Lp.i };
          var w = GT.x1 - GT.x0 - 2 * Ld.i;
          VLINKS[j - 1].forEach(function (v) {
            var a = Lp.n[v[0]], b2 = Ld.n[v[1]];
            vd += 'M' + P(Lpb.x0 + a[0] * Lpb.w, Lpb.y0 + a[1] * Lpb.w, Lp.z + LTH) + 'L' + P(lb.x0 + b2[0] * w, lb.y0 + b2[1] * w, Ld.z);
          });
          el('path', { class: 'ps-vlink', d: vd }, wrap);
        }
        box(wrap, lb, 'ps-b-layer');
        var tp = el('g', { transform: planeMatrix(lb.x0, lb.y0, Ld.z + LTH) }, wrap);
        var Wpx = (lb.x1 - lb.x0) * S, ed = '';
        LEDGES[j].forEach(function (e2) {
          var a = Ld.n[e2[0]], b2 = Ld.n[e2[1]];
          ed += 'M' + r1(a[0] * Wpx) + ',' + r1(a[1] * Wpx) + 'L' + r1(b2[0] * Wpx) + ',' + r1(b2[1] * Wpx);
        });
        el('path', { class: 'ps-gedge', d: ed }, tp);
        for (var n = 0; n < Ld.n.length; n++) {
          var nr = n % 3 === 0 ? 5.6 : 4.2;
          el('circle', { class: 'ps-gnode-base', cx: r1(Ld.n[n][0] * Wpx), cy: r1(Ld.n[n][1] * Wpx + 1.6), r: nr }, tp);
          el('circle', { class: 'ps-gnode', cx: r1(Ld.n[n][0] * Wpx), cy: r1(Ld.n[n][1] * Wpx), r: nr }, tp);
        }
        layers.push({ g: wrap, tr: tr, o: -1 });
      }
      return { g: g, plinth: plinth, layers: layers };
    }

    // --- agent: body + head with a visor and status LED ---
    var agentEls = [];
    function buildAgent(parent, k) {
      var d = AGENTS[k], ax = TABLE.x + d[0] * AG_R, ay = TABLE.y + d[1] * AG_R;
      var g = el('g', { class: 'ps-unit ps-agent' }, parent);
      var tr = addTr(g);
      var inner = el('g', null, g);
      var body = box(inner, { x0: ax - 0.3, x1: ax + 0.3, y0: ay - 0.3, y1: ay + 0.3, h: 0.62 }, 'ps-b-agent');
      var head = box(inner, { x0: ax - 0.24, x1: ax + 0.24, y0: ay - 0.24, y1: ay + 0.24, z0: 0.7, h: 0.38 }, 'ps-b-agent-head');
      el('path', { class: 'ps-neck', d: 'M' + P(ax + 0.02, ay + 0.02, 0.62) + 'L' + P(ax + 0.02, ay + 0.02, 0.7) }, inner);
      // visor on both visible faces of the head
      var vz0 = 0.84, vz1 = 0.96;
      var visor = el('g', { class: 'ps-visor' }, inner);
      el('polygon', { points: poly([[ax - 0.17, ay + 0.24, vz1], [ax + 0.17, ay + 0.24, vz1], [ax + 0.17, ay + 0.24, vz0], [ax - 0.17, ay + 0.24, vz0]]) }, visor);
      el('polygon', { points: poly([[ax + 0.24, ay - 0.17, vz1], [ax + 0.24, ay + 0.17, vz1], [ax + 0.24, ay + 0.17, vz0], [ax + 0.24, ay - 0.17, vz0]]) }, visor);
      // chest badge on the front-left face
      el('polygon', { class: 'ps-badge', points: poly([[ax - 0.14, ay + 0.3, 0.46], [ax + 0.14, ay + 0.3, 0.46], [ax + 0.14, ay + 0.3, 0.36], [ax - 0.14, ay + 0.3, 0.36]]) }, inner);
      var hx = sx(ax, ay), hy = sy(ax, ay, 1.08);
      el('path', { class: 'ps-antenna', d: 'M' + r1(hx) + ',' + r1(hy) + 'L' + r1(hx) + ',' + r1(hy - 9) }, inner);
      var led = el('circle', { class: 'ps-agent-led', cx: r1(hx), cy: r1(hy - 10.5), r: 2.4 }, inner);
      // radial unit vector on screen for the arrival slide (outward from table)
      var ox = sx(d[0], d[1]), oy = sy(d[0], d[1], 0), ol = Math.sqrt(ox * ox + oy * oy) || 1;
      var a = { g: g, tr: tr, ux: ox / ol, uy: oy / ol, o: -1, led: { e: led, o: -1 }, visor: { e: visor, o: -1 }, blocks: [body, head], k: k };
      agentEls.push(a);
      return a;
    }

    var units = {};
    // draw order, back to front
    buildAgent(gBlocks, 0);
    var graph = buildGraph(gBlocks);
    buildAgent(gBlocks, 1);
    var gTable = el('g', { class: 'ps-unit ps-u-table' }, gBlocks);
    var tableB = cylinder(gTable, TABLE.x, TABLE.y, TABLE.r, 0, TABLE.h, 'ps-b-table');
    var tpTable = el('g', { transform: planeMatrix(TABLE.x - TABLE.r, TABLE.y - TABLE.r, TABLE.h) }, gTable);
    var tw = TABLE.r * 2 * S, tc = tw / 2;
    el('circle', { class: 'ps-table-ring', cx: r1(tc), cy: r1(tc), r: r1(tc * 0.72) }, tpTable);
    // a small task plan on the table: steps joined into a graph
    var plan = [[0.3, 0.36], [0.52, 0.3], [0.7, 0.46], [0.46, 0.62], [0.66, 0.7]];
    el('path', { class: 'ps-plan-edge', d: 'M' + r1(plan[0][0] * tw) + ',' + r1(plan[0][1] * tw) + 'L' + r1(plan[1][0] * tw) + ',' + r1(plan[1][1] * tw) + 'L' + r1(plan[2][0] * tw) + ',' + r1(plan[2][1] * tw) + 'M' + r1(plan[1][0] * tw) + ',' + r1(plan[1][1] * tw) + 'L' + r1(plan[3][0] * tw) + ',' + r1(plan[3][1] * tw) + 'L' + r1(plan[4][0] * tw) + ',' + r1(plan[4][1] * tw) + 'M' + r1(plan[2][0] * tw) + ',' + r1(plan[2][1] * tw) + 'L' + r1(plan[4][0] * tw) + ',' + r1(plan[4][1] * tw) }, tpTable);
    var planDots = [];
    for (var pi = 0; pi < plan.length; pi++) planDots.push({ e: el('circle', { class: 'ps-plan-dot', cx: r1(plan[pi][0] * tw), cy: r1(plan[pi][1] * tw), r: 3.6 }, tpTable), o: -1 });
    buildAgent(gBlocks, 2);

    // --- air-gapped LLM appliance: sealed rack ---
    var gLlm = el('g', { class: 'ps-unit ps-u-llm' }, gBlocks);
    var bLlm = box(gLlm, LLM, 'ps-b-llm');
    var ru = '';
    for (var u = 1; u < 8; u++) {
      var zz = LLM.h * u / 8;
      ru += 'M' + P(LLM.x0 + 0.12, LLM.y1, zz) + 'L' + P(LLM.x0 + 0.62, LLM.y1, zz) + 'M' + P(LLM.x1 - 0.62, LLM.y1, zz) + 'L' + P(LLM.x1 - 0.12, LLM.y1, zz);
      ru += 'M' + P(LLM.x1, LLM.y0 + 0.12, zz) + 'L' + P(LLM.x1, LLM.y1 - 0.12, zz);
    }
    el('path', { class: 'ps-rack-lines', d: ru }, bLlm);
    var sz0 = 0.3, sz1 = LLM.h - 0.3;
    var seamEl = el('polygon', { class: 'ps-seam', fill: 'url(#' + id + 'seam)', points: poly([[LLM.x0 + 0.8, LLM.y1, sz1], [LLM.x1 - 0.8, LLM.y1, sz1], [LLM.x1 - 0.8, LLM.y1, sz0], [LLM.x0 + 0.8, LLM.y1, sz0]]) }, bLlm);
    var llmLeds = [];
    for (var lj = 0; lj < 6; lj++) {
      var lyy = LLM.y0 + 0.35 + (lj % 3) * 0.28, lzz = LLM.h - 0.38 - Math.floor(lj / 3) * 0.3;
      llmLeds.push({ e: el('circle', { class: 'ps-led ps-led-c', cx: r1(sx(LLM.x1, lyy)), cy: r1(sy(LLM.x1, lyy, lzz)), r: 2.3 }, bLlm), o: -1, w: 1.6 + lj * 0.55, ph: lj * 1.9 });
    }
    var tpL = el('g', { transform: planeMatrix(LLM.x0, LLM.y0, LLM.h) }, bLlm);
    var lw = (LLM.x1 - LLM.x0) * S;
    var sealTop = el('rect', { class: 'ps-seal', x: 9, y: 9, width: r1(lw - 18), height: r1(lw - 18), rx: 7 }, tpL);
    // sealed: padlock printed on the top face
    var lp = el('g', { class: 'ps-seal-lock', transform: 'translate(' + r1(lw / 2) + ' ' + r1(lw / 2) + ') scale(2.2)' }, tpL);
    el('path', { class: 'ps-lock-shackle', d: 'M-3.4,-1.2V-3.6a3.4,3.4 0 0 1 6.8,0V-1.2' }, lp);
    el('rect', { class: 'ps-lock-body', x: -5, y: -1.6, width: 10, height: 7.4, rx: 1.6 }, lp);
    buildAgent(gBlocks, 3);

    // --- API gateway + Docker containers ---
    var gApi = el('g', { class: 'ps-unit ps-u-api' }, gBlocks);
    var bApi = box(gApi, API, 'ps-b-api');
    var vents = '';
    for (var vz = 0; vz < 3; vz++) {
      var vzz = 0.3 + vz * 0.18;
      vents += 'M' + P(API.x0 + 0.3, API.y1, vzz) + 'L' + P(API.x0 + 1.1, API.y1, vzz);
    }
    el('path', { class: 'ps-vent', d: vents }, bApi);
    var apiLeds = [];
    for (var aj = 0; aj < 3; aj++) {
      var ayy = API.y0 + 0.5 + aj * 0.4;
      apiLeds.push({ e: el('circle', { class: 'ps-led ps-led-a', cx: r1(sx(API.x1, ayy)), cy: r1(sy(API.x1, ayy, 0.62)), r: 2.4 }, bApi), o: -1, w: 2.2 + aj * 0.8, ph: aj * 1.4 });
    }
    el('path', { class: 'ps-port', d: 'M' + P(API.x1, API.y0 + 0.4, 0.3) + 'L' + P(API.x1, API.y1 - 0.4, 0.3) }, bApi);
    var containers = [];
    for (var ci = 0; ci < 3; ci++) {
      var cx0 = API.x0 + 0.22 + ci * 0.6;
      var cg = el('g', { class: 'ps-container' }, gApi);
      var ctr = addTr(cg);
      box(cg, { x0: cx0, x1: cx0 + 0.5, y0: API.y0 + 0.5, y1: API.y0 + 1.3, z0: API.h, h: 0.3 }, 'ps-b-container');
      containers.push({ g: cg, tr: ctr, o: -1 });
    }

    // --- user terminals on the network edge ---
    var gUsers = el('g', { class: 'ps-unit ps-u-users' }, gBlocks);
    var screens = [];
    for (var ui = 0; ui < USERS.length; ui++) {
      var uy = USERS[ui];
      box(gUsers, { x0: UX - 0.38, x1: UX + 0.38, y0: uy - 0.38, y1: uy + 0.38, h: 0.12 }, 'ps-b-desk');
      box(gUsers, { x0: UX - 0.06, x1: UX + 0.06, y0: uy - 0.06, y1: uy + 0.06, z0: 0.12, h: 0.22 }, 'ps-b-desk');
      var mon = { x0: UX - 0.04, x1: UX + 0.08, y0: uy - 0.36, y1: uy + 0.36, z0: 0.34, h: 0.52 };
      box(gUsers, mon, 'ps-b-monitor');
      screens.push({ e: el('polygon', { class: 'ps-screen', points: poly([[mon.x1, mon.y0 + 0.06, mon.z0 + mon.h - 0.06], [mon.x1, mon.y1 - 0.06, mon.z0 + mon.h - 0.06], [mon.x1, mon.y1 - 0.06, mon.z0 + 0.06], [mon.x1, mon.y0 + 0.06, mon.z0 + 0.06]]) }, gUsers), o: -1 });
    }

    var veils = {
      llm: veil(gLlm, LLM), api: veil(gApi, API), graph: veil(graph.g, GT)
    };
    var tableVeil = el('path', { class: 'ps-veil', d: (function () {
      var X = sx(TABLE.x, TABLE.y), Yb = sy(TABLE.x, TABLE.y, 0), Yt = sy(TABLE.x, TABLE.y, TABLE.h), rx = TABLE.r * RX1, ry = TABLE.r * RY1;
      return 'M' + r1(X - rx) + ',' + r1(Yt) + 'A' + r1(rx) + ',' + r1(ry) + ' 0 0 1 ' + r1(X + rx) + ',' + r1(Yt) + 'L' + r1(X + rx) + ',' + r1(Yb) + 'A' + r1(rx) + ',' + r1(ry) + ' 0 0 1 ' + r1(X - rx) + ',' + r1(Yb) + 'Z';
    })() }, gTable);
    units = { graph: graph.g, table: gTable, llm: gLlm, api: gApi, users: gUsers };

    /* ---------- elevated lanes + packets ---------- */
    var gArc = el('g', { class: 'ps-arcs' }, deco);
    var arcKeys = { gq: 'b', gc: 'a', lp: 'c', lc: 'c', ap: 'a' };
    for (var ak in arcKeys) {
      routes[ak] = makeRoute(ROUTES[ak]);
      el('path', { class: 'ps-wire ps-arc', d: routeD(ROUTES[ak]) }, gArc);
      wires[ak] = el('path', { class: 'ps-wire-on ps-w-' + arcKeys[ak], d: routeD(ROUTES[ak]) }, gArc);
    }
    var gPk = el('g', { class: 'ps-packets' }, gArc);
    function pool(key, color, n, period, phase) {
      var out = { r: routes[key], n: n, period: period, phase: phase, I: 0, items: [] };
      for (var i = 0; i < n; i++) {
        var trail = el('circle', { r: 1.7, class: 'ps-pk-trail ps-pk-' + color }, gPk);
        var g = el('g', { class: 'ps-pk' }, gPk);
        el('circle', { r: 11, fill: 'url(#' + id + 'h' + color.toUpperCase() + ')' }, g);
        el('circle', { r: 2.5, class: 'ps-pk-core' }, g);
        out.items.push({ g: g, tr: addTr(g), trail: trail, o: -1, to: -1 });
      }
      return out;
    }
    var pools = {
      gq: pool('gq', 'b', 3, 2.4, 0), gc: pool('gc', 'a', 3, 2.4, 0.5),
      lp: pool('lp', 'c', 3, 2.6, 0.15), lc: pool('lc', 'c', 3, 2.6, 0.65),
      ap: pool('ap', 'a', 2, 2.2, 0.3),
      u0: pool('u0', 'a', 2, 2.4, 0.1), u1: pool('u1', 'a', 2, 2.4, 0.45), u2: pool('u2', 'a', 2, 2.4, 0.8)
    };
    var poolList = [];
    for (var pk in pools) poolList.push(pools[pk]);

    /* ---------- labels (constant on-screen size) ---------- */
    var gLab = el('g', { class: 'ps-labels', 'aria-hidden': 'true' }, gFit);
    var labels = {};
    LABELS.forEach(function (d) {
      var g = el('g', { class: 'ps-label ps-l-' + d.id }, gLab);
      var lab = {
        d: d, g: g, wx: sx(d.anchor[0], d.anchor[1]), wy: sy(d.anchor[0], d.anchor[1], d.anchor[2]),
        cx: sx((d.ca || d.anchor)[0], (d.ca || d.anchor)[1]), cy: sy((d.ca || d.anchor)[0], (d.ca || d.anchor)[1], (d.ca || d.anchor)[2]),
        line: el('polyline', { class: 'ps-leader' }, g),
        dot: el('circle', { class: 'ps-leader-dot' }, g),
        key: el('text', { class: 'ps-title' }, g),
        sub: el('text', { class: 'ps-sub' }, g), o: -1
      };
      lab.sub.textContent = d.sub;
      labels[d.id] = lab;
    });
    // "Python -> Go" service tag (story only) + CI caption
    var goTag = { g: el('g', { class: 'ps-tag' }, gLab), o: -1 };
    var goTr = addTr(goTag.g), goSc = addTr(goTag.g);
    var goRect = el('rect', { class: 'ps-tag-pill', x: 0, y: -10, height: 20, rx: 10 }, goTag.g);
    var goTxt = el('text', { class: 'ps-tag-text', x: 10, y: 4 }, goTag.g);
    goTxt.textContent = 'Python \u2192 Go service';
    // legend (story, wide only)
    var gLeg = el('g', { class: 'ps-legend ps-minor' }, gLab);
    var legTr = addTr(gLeg), legSc = addTr(gLeg);
    LEGEND.forEach(function (it, i) {
      var y = i * 20;
      el('circle', { cx: 0, cy: y, r: 8, fill: 'url(#' + id + 'h' + it[0].toUpperCase() + ')' }, gLeg);
      el('circle', { cx: 0, cy: y, r: 2.3, class: 'ps-pk-core' }, gLeg);
      el('text', { class: 'ps-legend-text', x: 14, y: y + 4 }, gLeg).textContent = it[1];
    });

    /* ---------- responsive fit ---------- */
    var compact = false, k = 1, ready = false, vb = { x: -460, y: -80, w: 1120, h: 720 };
    function placeLabels() {
      var tPx = (compact ? 11 : 13) * k, sPx = 11.5 * k, gap = 4 * k;
      for (var key in labels) {
        var l = labels[key], d = l.d, p = compact ? d.c : d.o, endA = p[2] === 'end';
        l.ax = compact ? l.cx : l.wx; l.ay = compact ? l.cy : l.wy;
        var lx = l.ax + p[0] * k, ly = l.ay + p[1] * k, ex = lx + (endA ? 6 : -6) * k;
        l.line.setAttribute('points', r1(l.ax) + ',' + r1(l.ay) + ' ' + r1(ex) + ',' + r1(ly) + ' ' + r1(lx) + ',' + r1(ly));
        l.dot.setAttribute('cx', r1(l.ax)); l.dot.setAttribute('cy', r1(l.ay)); l.dot.setAttribute('r', r1(2.2 * k));
        var tx = lx + (endA ? -gap : gap), hasSub = !compact;
        l.key.textContent = compact ? d.short : d.title;
        l.key.setAttribute('x', r1(tx)); l.key.setAttribute('y', r1(ly + (hasSub ? -gap * 0.6 : tPx * 0.36)));
        l.key.setAttribute('text-anchor', endA ? 'end' : 'start');
        l.sub.setAttribute('x', r1(tx)); l.sub.setAttribute('y', r1(ly + sPx * 1.25));
        l.sub.setAttribute('text-anchor', endA ? 'end' : 'start');
      }
      var lsc = k * (compact ? 0.72 : 0.95);
      for (var i = 0; i < locks.length; i++) locks[i].s.setScale(lsc, lsc);
      stubSc.setScale(k, k);
      var gw = 0; try { gw = goTxt.getComputedTextLength(); } catch (e) { gw = 0; }
      gw = (gw || 120) + 20;
      goRect.setAttribute('width', r1(gw));
      var al = labels.api, ap = compact ? al.d.c : al.d.o;
      goTr.setTranslate(r1(al.ax + ap[0] * k - gap - gw * k), r1(al.ay + ap[1] * k + (compact ? 22 : 36) * k));
      goSc.setScale(k, k);
      var gl = labels.graph, gp = gl.d.o;
      legTr.setTranslate(r1(gl.ax + gp[0] * k - gap - 200 * k), r1(gl.ay + gp[1] * k + 40 * k));
      legSc.setScale(k, k);
    }
    function layout() {
      var cw = container.getBoundingClientRect().width;
      if (!cw || !alive) return;
      compact = overview || cw < 560;
      root.classList.toggle('is-compact', compact);
      // measure with agents seated so the fit doesn't depend on the step
      for (var a = 0; a < agentEls.length; a++) agentEls[a].tr.setTranslate(0, 0);
      for (var j = 0; j < graph.layers.length; j++) graph.layers[j].tr.setTranslate(0, 0);
      for (var pass = 0; pass < 2; pass++) {
        var r = svg.getBoundingClientRect();
        var scale = Math.min(r.width / vb.w, (r.height || r.width * vb.h / vb.w) / vb.h) || 1;
        k = 1 / scale;
        svg.style.setProperty('--ps-k', k.toFixed(3));
        placeLabels();
        var b;
        try { b = gFit.getBBox(); } catch (e) { b = null; }
        if (!b || !b.width) break;
        var px = b.width * 0.02 + 4 * k, py = b.height * 0.03 + 4 * k;
        vb = { x: b.x - px, y: b.y - py, w: b.width + 2 * px, h: b.height + 2 * py };
        svg.setAttribute('viewBox', r1(vb.x) + ' ' + r1(vb.y) + ' ' + r1(vb.w) + ' ' + r1(vb.h));
      }
      if (ready) apply();
    }

    /* ---------- state (pure function of g = index + progress) ---------- */
    var st = { idx: overview ? 4 : 0, p: overview ? 1 : 0, g: overview ? 5 : 0, ci: 0, scr: 0, seam: 0, agentsLed: 0, apiLed: 0 };
    function setO(obj, v) {
      v = Math.round(v * 100) / 100;
      if (obj.o !== v) { obj.o = v; (obj.g || obj.e).style.opacity = v; }
    }
    function op(node, v) { node.style.opacity = Math.round(v * 100) / 100; }
    function lit(node, isLit, isOn) {
      node.classList.toggle('is-lit', !!isLit);
      node.classList.toggle('is-on', !!isOn && !isLit);
    }

    function apply() {
      var i = st.idx, g = st.g, ov = overview;
      // boundary + network edge
      op(gFloor, ov ? 1 : 0.6 + 0.4 * ease(g / 0.35));
      op(gBound, ov ? 1 : 0.25 + 0.75 * ease(g / 0.5));
      for (var lk = 0; lk < locks.length; lk++) setO(locks[lk], ov ? 1 : ease((g - 0.35 - lk * 0.08) / 0.3));
      op(gUsers, ov ? 1 : 0.35 + 0.65 * ease((g - 0.15) / 0.45));
      // graph tower: layers build bottom-up during step 1
      op(veils.graph, ov ? 0 : 0.8 * (1 - ease((g - 1) / 0.25)));
      for (var j = 0; j < graph.layers.length; j++) {
        var lv = ov ? 1 : ease((g - 1.12 - j * 0.24) / 0.3);
        setO(graph.layers[j], lv);
        graph.layers[j].tr.setTranslate(0, r1(-(1 - lv) * 34));
      }
      // agent crew arrives during step 2
      op(tableVeil, ov ? 0 : 0.8 * (1 - ease((g - 1.9) / 0.3)));
      for (var a = 0; a < agentEls.length; a++) {
        var A = agentEls[a], av = ov ? 1 : ease((g - 2.02 - a * 0.1) / 0.4);
        setO(A, av);
        var dd = (1 - av) * 70;
        A.tr.setTranslate(r1(A.ux * dd), r1(A.uy * dd));
      }
      st.agentsLed = ov ? 1 : ease((g - 2.4) / 0.3);
      // LLM appliance lights during step 3
      op(veils.llm, ov ? 0 : 0.82 * (1 - ease((g - 3) / 0.35)));
      st.seam = ov ? 0.9 : 0.12 * ease((g - 1) / 0.5) + 0.88 * ease((g - 3.15) / 0.4);
      op(sealTop, ov ? 0.8 : 0.2 + 0.8 * ease((g - 3.15) / 0.4));
      op(gStub, ov ? 0.7 : ease((g - 3.45) / 0.35) * (i === 3 ? 1 : 0.6));
      // API + users during step 4
      op(veils.api, ov ? 0 : 0.82 * (1 - ease((g - 4) / 0.3)));
      for (var c = 0; c < containers.length; c++) {
        var cv = ov ? 1 : ease((g - 4.1 - c * 0.08) / 0.25);
        setO(containers[c], cv);
        containers[c].tr.setTranslate(0, r1(-(1 - cv) * 22));
      }
      op(gCi, ov ? 1 : 0.35 + 0.65 * ease((g - 4.2) / 0.3));
      st.ci = ov ? 1 : ease((g - 4.2) / 0.3);
      st.apiLed = ov ? 1 : ease((g - 4.1) / 0.3);
      st.scr = ov ? 1 : ease((g - 4.55) / 0.3);
      // packet intensities
      pools.gq.I = pools.gc.I = ov ? 1 : ease((g - 2.35) / 0.4) * (i === 2 ? 1 : 0.6);
      pools.lp.I = pools.lc.I = ov ? 1 : ease((g - 3.3) / 0.4) * (i === 3 ? 1 : 0.6);
      pools.ap.I = ov ? 1 : ease((g - 4.15) / 0.35);
      pools.u0.I = pools.u1.I = pools.u2.I = ov ? 1 : ease((g - 4.35) / 0.35);
      op(wires.gq, 0.7 * pools.gq.I); op(wires.gc, 0.7 * pools.gc.I);
      op(wires.lp, 0.7 * pools.lp.I); op(wires.lc, 0.7 * pools.lc.I);
      op(wires.ap, 0.7 * pools.ap.I);
      op(wires.u0, 0.7 * pools.u0.I); op(wires.u1, 0.7 * pools.u1.I); op(wires.u2, 0.7 * pools.u2.I);
      // focus: lit (current step) vs on (introduced)
      var L = { bound: i === 0, graph: i === 1, agents: i === 2, llm: i === 3, api: i === 4, users: i === 4 || i === 0 };
      var O = { bound: true, graph: g >= 1.3, agents: g >= 2.3, llm: g >= 3.2, api: g >= 4.1, users: true };
      if (ov) { L = {}; O = { bound: 1, graph: 1, agents: 1, llm: 1, api: 1, users: 1 }; }
      lit(graph.plinth, L.graph, O.graph);
      for (var gl = 0; gl < graph.layers.length; gl++) lit(graph.layers[gl].g, L.graph, O.graph);
      lit(tableB, L.agents, O.agents);
      for (var aa = 0; aa < agentEls.length; aa++) { lit(agentEls[aa].blocks[0], L.agents, O.agents); lit(agentEls[aa].blocks[1], L.agents, O.agents); }
      lit(bLlm, L.llm, O.llm); lit(bApi, L.api, O.api); lit(gUsers, L.users, O.users);
      lit(gBound, L.bound, true);
      op(glow.graph, ov ? 0.35 : L.graph ? 0.9 : O.graph ? 0.3 : 0);
      op(glow.agents, ov ? 0.35 : L.agents ? 0.9 : O.agents ? 0.3 : 0);
      op(glow.llm, ov ? 0.45 : L.llm ? 1 : O.llm ? 0.4 : 0);
      op(glow.api, ov ? 0.3 : L.api ? 0.8 : 0);
      op(glow.users, ov ? 0.25 : i === 4 ? 0.7 * st.scr : 0);
      // labels
      var vis = ov ? { bound: 1, users: 1, graph: 1, agents: 1, llm: 1, api: 1 } : {
        bound: ease(g / 0.5), users: 0.4 + 0.6 * ease((g - 0.15) / 0.45),
        graph: ease((g - 1) / 0.35), agents: ease((g - 2) / 0.35), llm: ease((g - 3) / 0.35), api: ease((g - 4) / 0.35)
      };
      for (var key in labels) {
        setO(labels[key], vis[key]);
        labels[key].g.classList.toggle('is-lit', !ov && !!L[key]);
      }
      setO(goTag, ov ? 0 : ease((g - 4.5) / 0.3));
      op(gLeg, ov ? 0 : ease((g - 2.3) / 0.4));
      render(reduced ? 1.3 : time);
      kick();
    }
    function setStep(index, progress) {
      if (overview) return;
      var i = Math.max(0, Math.min(4, Math.floor(+index || 0)));
      var p = clamp(+progress || 0);
      st.idx = i; st.p = p; st.g = i + p;
      apply();
    }

    /* ---------- per-frame render (mutates existing nodes only) ---------- */
    function render(t) {
      var still = reduced;
      for (var q = 0; q < poolList.length; q++) {
        var pl = poolList[q];
        for (var n = 0; n < pl.n; n++) {
          var it = pl.items[n];
          if (pl.I <= 0.01) {
            if (it.o !== 0) { it.o = 0; it.g.style.opacity = 0; it.trail.style.opacity = 0; }
            continue;
          }
          var f = (t / pl.period + pl.phase + n / pl.n) % 1;
          var e = f * f * (3 - 2 * f);
          at(pl.r, e);
          it.tr.setTranslate(sx(Q.x, Q.y), sy(Q.x, Q.y, Q.z));
          var o = pl.I * Math.min(1, f * 7, (1 - f) * 7);
          setO(it, o);
          at(pl.r, e - 0.04);
          it.trail.cx.baseVal.value = sx(Q.x, Q.y);
          it.trail.cy.baseVal.value = sy(Q.x, Q.y, Q.z);
          var to = Math.round(o * 55) / 100;
          if (it.to !== to) { it.to = to; it.trail.style.opacity = to; }
        }
      }
      // boundary: slow, opposed march of the double line
      if (!still) {
        bOuter.style.strokeDashoffset = r1((t * 6) % 400);
        bInner.style.strokeDashoffset = r1(-(t * 6) % 400);
      }
      // agent LEDs + visors
      for (var a = 0; a < agentEls.length; a++) {
        var A = agentEls[a], b = still ? 1 : 0.6 + 0.4 * Math.sin(t * (1.8 + a * 0.45) + a * 1.7);
        setO(A.led, 0.2 + 0.8 * st.agentsLed * b);
        setO(A.visor, 0.35 + 0.65 * st.agentsLed);
      }
      for (var d = 0; d < planDots.length; d++) {
        var on = still ? 1 : ((t * 1.1) % planDots.length) >= d ? 1 : 0.35;
        setO(planDots[d], (0.25 + 0.75 * on) * (0.3 + 0.7 * st.agentsLed));
      }
      // LLM: breathing seam + rack LEDs
      op(seamEl, st.seam * (still ? 1 : 0.8 + 0.2 * Math.sin(t * 1.3)));
      for (var l = 0; l < llmLeds.length; l++) {
        var lb = still ? 1 : 0.55 + 0.45 * Math.sin(t * llmLeds[l].w + llmLeds[l].ph);
        setO(llmLeds[l], 0.2 + 0.8 * st.seam * lb);
      }
      for (var m = 0; m < apiLeds.length; m++) {
        var mb = still ? 1 : 0.55 + 0.45 * Math.sin(t * apiLeds[m].w + apiLeds[m].ph);
        setO(apiLeds[m], 0.2 + 0.8 * st.apiLed * mb);
      }
      // CI pipeline: stages light in sequence
      var stage = still ? 5 : (t * 1.2) % 6.5;
      for (var s = 0; s < ciStages.length; s++) setO(ciStages[s], 0.25 + 0.75 * st.ci * (stage >= s ? 1 : 0.15));
      // terminal screens flicker on as answers arrive
      for (var u = 0; u < screens.length; u++) {
        var sb = still ? 1 : 0.8 + 0.2 * Math.sin(t * 2.3 + u * 2.1);
        setO(screens[u], 0.2 + 0.8 * st.scr * sb);
      }
    }

    /* ---------- loop: only while visible ---------- */
    var time = 0, last = 0, raf = 0, inView = true, alive = true;
    function frame(ts) {
      raf = 0;
      if (!running()) { last = 0; return; }
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts; time += dt;
      render(time);
      raf = requestAnimationFrame(frame);
    }
    function running() { return alive && !reduced && inView && !document.hidden; }
    function kick() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } last = 0; }

    var io = null, ro = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        inView = es[es.length - 1].isIntersecting;
        if (inView) kick(); else stop();
      }, { rootMargin: '80px' });
      io.observe(root);
    }
    if ('ResizeObserver' in window) { ro = new ResizeObserver(layout); ro.observe(container); }
    else window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (alive) layout(); });
    function onVis() { if (document.hidden) stop(); else kick(); }
    document.addEventListener('visibilitychange', onVis);
    function onMq() {
      reduced = !!opts.reducedMotion || !!(mq && mq.matches);
      root.classList.toggle('is-reduced', reduced);
      if (reduced) { stop(); render(1.3); } else kick();
    }
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    root.classList.toggle('is-reduced', reduced);

    layout();
    ready = true;
    apply();

    return {
      steps: 5,
      setStep: setStep,
      destroy: function () {
        alive = false; stop();
        if (io) io.disconnect();
        if (ro) ro.disconnect(); else window.removeEventListener('resize', layout);
        document.removeEventListener('visibilitychange', onVis);
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  window.PublicSectorScene = { mount: mount };
})();
