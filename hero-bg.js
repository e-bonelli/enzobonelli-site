/* ============================================================
   hero-bg.js — the homepage hero's living backdrop.
   A 3D constellation of the systems Enzo builds: five agents, a
   knowledge graph, a voice ring and an infrastructure lattice around an
   LLM core. Fireflies are data packets that travel real graph paths
   (BFS over the edge list). Not scroll-driven: the camera holds one
   overview, the world turns slowly, the pointer adds gentle parallax,
   and every few seconds the traffic shifts focus to a different part
   of the system.
   - three.js r128 (loaded before this file); 2D canvas still otherwise.
   - Renders only while the hero is on screen and the tab is visible.
   - Reduced motion: one static frame (re-drawn on resize / theme).
   - Small screens: fewer nodes and packets, lower pixel ratio.
   - Follows the site theme (html[data-theme], 'eb-themechange').
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('hero-bg');
  var hero = canvas && canvas.closest('.sh-hero');
  var holder = canvas && canvas.parentNode;
  var tagsEl = document.getElementById('hero-tags');
  if (!canvas || !hero) return;

  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var RM = reduceMQ.matches;
  var SMALL = window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(pointer: coarse)').matches;

  function themeName() { return root.getAttribute('data-theme') === 'light' ? 'starfield' : 'night'; }
  var PAL = {
    night: {
      cl: [0xc6f432, 0x7dd3fc, 0xf5c542, 0x9fb0d6, 0xf1ffd0], fog: 0x0a1630,
      pA: [0.86, 1.0, 0.42], pB: [1.0, 0.84, 0.36], fA: [0.78, 0.96, 0.2], fB: [0.96, 0.77, 0.26],
      coreA: [0.78, 0.96, 0.4], coreB: [1, 1, 0.92], ico: 0xe8eefc, ring: 0xf5c542,
      tags: ['#c6f432', '#7dd3fc', '#f5c542', '#a9b6d3', '#e8eefc']
    },
    starfield: {
      cl: [0x8b7bff, 0x22d3ee, 0xf0abfc, 0x98a2b8, 0xeef0ff], fog: 0x0a0d14,
      pA: [0.66, 0.6, 1.0], pB: [0.4, 0.91, 0.98], fA: [0.77, 0.71, 0.99], fB: [0.4, 0.91, 0.98],
      coreA: [0.6, 0.55, 1.0], coreB: [0.95, 0.95, 1], ico: 0xe8ecf4, ring: 0x22d3ee,
      tags: ['#a99cff', '#22d3ee', '#f0abfc', '#98a2b8', '#e8ecf4']
    }
  };

  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---- Visibility gating (shared by both renderers) ----------------- */
  var onScreen = true, onWake = function () {};
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      onScreen = es[es.length - 1].isIntersecting;
      onWake();
    }, { threshold: 0 }).observe(hero);
  }

  if (!window.THREE || !webglOK()) { fallback2D(); return; }

  var T = window.THREE;
  var V3 = T.Vector3;

  /* ---- Seeded randomness ------------------------------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(20260516);
  function rr(a, b) { return a + (b - a) * rand(); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

  // cluster ids: 0 agents, 1 graph, 2 voice, 3 infra, 4 core
  var CENTER = [new V3(-2.6, -0.4, 7.4), new V3(8.2, 0.9, -1.2), new V3(-8.4, 2.4, -2.6), new V3(0.6, -5.6, -0.6), new V3(0, 0, 0)];

  /* ---- Graph construction ------------------------------------------ */
  var S = SMALL ? 0.62 : 1;
  var nodes = [], edges = [];
  function addNode(p, c, size) { nodes.push({ p: p, c: c, size: size, phase: rand() }); return nodes.length - 1; }
  function addEdge(a, b, g) {
    if (a === b) return;
    for (var i = 0; i < edges.length; i++) { var e = edges[i]; if ((e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)) return; }
    edges.push([a, b, g]);
  }
  var CORE = addNode(new V3(0, 0, 0), 4, 0.9);

  // Agents: five orchestrated agents on a tilted pentagon, each with tool satellites
  var agentHubs = [];
  (function () {
    var c = CENTER[0], sats = SMALL ? 2 : 3;
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2 + 0.3;
      var p = new V3(Math.cos(a) * 2.3, Math.sin(a) * 2.3 * 0.55, Math.sin(a) * 1.1).add(c);
      var h = addNode(p, 0, 0.62); agentHubs.push(h);
      for (var s = 0; s < sats; s++) {
        var q = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize().multiplyScalar(rr(0.7, 1.15)).add(p);
        addEdge(h, addNode(q, 0, 0.26), 0);
      }
    }
    for (var k = 0; k < 5; k++) { addEdge(agentHubs[k], agentHubs[(k + 1) % 5], 0); addEdge(agentHubs[k], CORE, 4); }
  })();

  // Knowledge graph: jittered fibonacci sphere, k-nearest edges
  var graphIdx = [];
  (function () {
    var c = CENTER[1], n = Math.round(40 * S);
    for (var i = 0; i < n; i++) {
      var y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996, rad = rr(1.6, 3.2);
      graphIdx.push(addNode(new V3(Math.cos(th) * r * rad, y * rad * 0.85, Math.sin(th) * r * rad).add(c), 1, rr(0.24, 0.42)));
    }
    function byDist(from) { return function (a, b) { return nodes[from].p.distanceTo(nodes[a].p) - nodes[from].p.distanceTo(nodes[b].p); }; }
    graphIdx.forEach(function (i) {
      var near = graphIdx.filter(function (j) { return j !== i; }).sort(byDist(i));
      addEdge(i, near[0], 1); addEdge(i, near[1], 1); if (rand() < 0.35) addEdge(i, near[2], 1);
    });
    var byCore = graphIdx.slice().sort(function (a, b) { return nodes[a].p.length() - nodes[b].p.length(); });
    addEdge(byCore[0], CORE, 4);
    [0, 1, 4].forEach(function (k, m) { // three agents query the graph directly
      var h = agentHubs[k];
      addEdge(h, graphIdx.slice().sort(byDist(h))[m], 4);
    });
  })();

  // Voice: a waveform ring facing outward, with an intake hub at its centre
  var voiceIdx = [], VOICE_HUB;
  (function () {
    var c = CENTER[2], n = Math.round(24 * S);
    var out = new V3(c.x, 0, c.z).normalize();
    var u = new V3().crossVectors(out, new V3(0, 1, 0)).normalize(), v = new V3(0, 1, 0);
    VOICE_HUB = addNode(c.clone(), 2, 0.6);
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, r = 2.3 + 0.42 * Math.sin(a * 6);
      var p = c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).addScaledVector(out, 0.3 * Math.sin(a * 3));
      voiceIdx.push(addNode(p, 2, 0.27));
    }
    voiceIdx.forEach(function (id, i) { addEdge(id, voiceIdx[(i + 1) % n], 2); if (i % 4 === 0) addEdge(id, VOICE_HUB, 2); });
    addEdge(VOICE_HUB, CORE, 4);
    addEdge(VOICE_HUB, agentHubs[2], 4);
  })();

  // Infrastructure: a calm lattice under everything
  var infraIdx = [];
  (function () {
    var c = CENTER[3], g = SMALL ? 4 : 5, sp = 1.55, grid = [], x, z;
    for (x = 0; x < g; x++) for (z = 0; z < g; z++) {
      var id = addNode(new V3((x - (g - 1) / 2) * sp + rr(-0.12, 0.12), rr(-0.15, 0.15), (z - (g - 1) / 2) * sp + rr(-0.12, 0.12)).add(c), 3, 0.24);
      grid.push(id); infraIdx.push(id);
    }
    for (x = 0; x < g; x++) for (z = 0; z < g; z++) {
      var k = grid[x * g + z];
      if (x < g - 1) addEdge(k, grid[(x + 1) * g + z], 3);
      if (z < g - 1) addEdge(k, grid[x * g + z + 1], 3);
    }
    var mid = grid[Math.floor(g / 2) * g + Math.floor(g / 2)];
    nodes[mid].size = 0.5;
    addEdge(mid, CORE, 4);
    addEdge(grid[0], graphIdx[graphIdx.length - 1], 4);
  })();

  var adj = nodes.map(function () { return []; });
  edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
  function path(src, dst) {
    var prev = new Int32Array(nodes.length).fill(-1); prev[src] = src;
    var q = [src];
    for (var h = 0; h < q.length; h++) {
      var n = q[h]; if (n === dst) break;
      var nb = adj[n];
      for (var k = 0; k < nb.length; k++) { var m = nb[(k + h) % nb.length]; if (prev[m] < 0) { prev[m] = n; q.push(m); } }
    }
    if (prev[dst] < 0) return null;
    var out = [dst], c = dst;
    while (c !== src) { c = prev[c]; out.push(c); }
    return out.reverse();
  }

  /* ---- Renderer, scene, camera ------------------------------------- */
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !SMALL, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  } catch (e) { fallback2D(); return; }
  renderer.setClearColor(0x000000, 0);
  var scene = new T.Scene();
  scene.fog = new T.Fog(PAL.night.fog, 18, 58);
  var camera = new T.PerspectiveCamera(42, 1, 0.1, 200);
  var world = new T.Group();
  scene.add(world);

  var U = {
    uTime: { value: 0 }, uPR: { value: 1 }, uScale: { value: 400 },
    uHi: { value: [0.62, 0.62, 0.62, 0.5, 1] }, uFogNear: { value: 16 }, uFogFar: { value: 60 },
    uPA: { value: new V3() }, uPB: { value: new V3() }, uFA: { value: new V3() }, uFB: { value: new V3() }
  };
  // Glow sprites write premultiplied colour, with alpha from brightness, so
  // they add light over the page's own sky through a transparent canvas.
  var GLOW = {
    transparent: true, depthWrite: false, blending: T.CustomBlending,
    blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor,
    blendEquationAlpha: T.AddEquation, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneFactor
  };
  function glowMat(vs) { return new T.ShaderMaterial(Object.assign({ uniforms: U, vertexShader: vs, fragmentShader: glowFrag }, GLOW)); }
  var glowFrag = [
    'varying vec3 vColor; varying float vAlpha;',
    'void main() {',
    '  float r = length(gl_PointCoord - 0.5) * 2.0;',
    '  if (r > 1.0) discard;',
    '  float core = smoothstep(0.34, 0.0, r);',
    '  float halo = pow(1.0 - r, 2.6) * 0.55;',
    '  vec3 c = (vColor * (halo + core * 0.9) + vec3(1.0) * core * 0.32) * vAlpha;',
    '  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));',
    '}'
  ].join('\n');

  // nodes
  var nodeCol = new Float32Array(nodes.length * 3), nodeColAttr;
  var nodeFlash = new Float32Array(nodes.length), flashAttr;
  (function () {
    var n = nodes.length;
    var pos = new Float32Array(n * 3), size = new Float32Array(n), cl = new Float32Array(n), ph = new Float32Array(n);
    nodes.forEach(function (d, i) { d.p.toArray(pos, i * 3); size[i] = d.c === 4 ? 0 : d.size; cl[i] = d.c; ph[i] = d.phase; });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    nodeColAttr = new T.BufferAttribute(nodeCol, 3);
    g.setAttribute('aColor', nodeColAttr);
    g.setAttribute('aSize', new T.BufferAttribute(size, 1));
    g.setAttribute('aCluster', new T.BufferAttribute(cl, 1));
    g.setAttribute('aPhase', new T.BufferAttribute(ph, 1));
    flashAttr = new T.BufferAttribute(nodeFlash, 1); flashAttr.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aFlash', flashAttr);
    world.add(new T.Points(g, glowMat([
      'attribute vec3 aColor; attribute float aSize, aCluster, aPhase, aFlash;',
      'uniform float uTime, uPR, uScale, uFogNear, uFogFar; uniform float uHi[5];',
      'varying vec3 vColor; varying float vAlpha;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float hi = uHi[int(aCluster + 0.5)];',
      '  float tw = 0.86 + 0.14 * sin(uTime * 1.1 + aPhase * 6.2831);',
      '  float depth = -mv.z;',
      '  float fog = 1.0 - smoothstep(uFogNear, uFogFar, depth);',
      '  vAlpha = (mix(0.28, 1.0, hi) * tw + aFlash * 0.9) * fog;',
      '  vColor = aColor;',
      '  gl_PointSize = aSize * uPR * uScale * mix(0.85, 1.12, hi) * (1.0 + aFlash * 0.8) / depth;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'))));
  })();

  // edges: one LineSegments per group so each can fade with the focus
  var edgeMats = [], edgeSets = [];
  for (var gi = 0; gi < 5; gi++) {
    (function (gi) {
      var list = edges.filter(function (e) { return e[2] === gi; });
      var pos = new Float32Array(list.length * 6), col = new Float32Array(list.length * 6);
      list.forEach(function (e, i) { nodes[e[0]].p.toArray(pos, i * 6); nodes[e[1]].p.toArray(pos, i * 6 + 3); });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      var colAttr = new T.BufferAttribute(col, 3);
      g.setAttribute('color', colAttr);
      var m = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, depthWrite: false, fog: true });
      edgeMats.push(m); edgeSets.push({ list: list, col: col, attr: colAttr });
      world.add(new T.LineSegments(g, m));
    })(gi);
  }

  // LLM core: wireframe icosahedron, a tilted orbit ring, and a breathing glow
  var core = new T.Group(); world.add(core);
  var icoMat = new T.LineBasicMaterial({ color: 0xe8eefc, transparent: true, opacity: 0.32, depthWrite: false, fog: true });
  var ico = new T.LineSegments(new T.EdgesGeometry(new T.IcosahedronGeometry(1.05, 1)), icoMat);
  core.add(ico);
  var ringPts = [];
  for (var ri = 0; ri <= 128; ri++) { var ra = ri / 128 * Math.PI * 2; ringPts.push(new V3(Math.cos(ra) * 1.9, 0, Math.sin(ra) * 1.9)); }
  var ringMat = new T.LineBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.28, depthWrite: false, fog: true });
  var ring = new T.Line(new T.BufferGeometry().setFromPoints(ringPts), ringMat);
  ring.rotation.set(1.15, 0, 0.35); core.add(ring);
  var coreCol = new Float32Array(6), coreColAttr;
  (function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    g.setAttribute('aSize', new T.BufferAttribute(new Float32Array([4.2, 1.5]), 1));
    coreColAttr = new T.BufferAttribute(coreCol, 3);
    g.setAttribute('aColor', coreColAttr);
    core.add(new T.Points(g, glowMat([
      'attribute float aSize; attribute vec3 aColor;',
      'uniform float uTime, uPR, uScale, uFogNear, uFogFar;',
      'varying vec3 vColor; varying float vAlpha;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float breath = 0.82 + 0.18 * sin(uTime * 0.9);',
      '  vAlpha = (aSize > 2.0 ? 0.42 : 0.9) * breath * (1.0 - smoothstep(uFogNear, uFogFar, -mv.z));',
      '  vColor = aColor;',
      '  gl_PointSize = aSize * uPR * uScale * (0.94 + 0.06 * breath) / -mv.z;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'))));
  })();

  // ambient fireflies: drift and blink entirely in the vertex shader
  (function () {
    var n = SMALL ? 50 : 110;
    var pos = new Float32Array(n * 3), ph = new Float32Array(n), sp = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      pos[i * 3] = rr(-26, 26); pos[i * 3 + 1] = rr(-12, 14); pos[i * 3 + 2] = rr(-24, 20);
      ph[i] = rand(); sp[i] = rr(0.6, 1.4);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new T.BufferAttribute(ph, 1));
    g.setAttribute('aSpeed', new T.BufferAttribute(sp, 1));
    scene.add(new T.Points(g, glowMat([
      'attribute float aPhase, aSpeed;',
      'uniform float uTime, uPR, uScale, uFogNear, uFogFar; uniform vec3 uFA, uFB;',
      'varying vec3 vColor; varying float vAlpha;',
      'void main() {',
      '  float t = uTime * aSpeed;',
      '  vec3 p = position + vec3(sin(t * 0.13 + aPhase * 6.0), sin(t * 0.11 + aPhase * 4.0) * 0.6, cos(t * 0.12 + aPhase * 5.0)) * 1.4;',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  float blink = pow(max(0.0, sin(t * 0.55 + aPhase * 40.0)), 10.0);',
      '  vAlpha = (0.05 + blink * 0.85) * (1.0 - smoothstep(uFogNear + 6.0, uFogFar + 10.0, -mv.z));',
      '  vColor = mix(uFA, uFB, step(0.62, fract(aPhase * 7.0)));',
      '  gl_PointSize = 0.3 * uPR * uScale / -mv.z;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'))));
  })();

  /* ---- Packets (fireflies on edges) --------------------------------- */
  var NP = SMALL ? 22 : 40, TRAIL = 4;
  var packets = [];
  var pPos = new Float32Array(NP * TRAIL * 3), pAlpha = new Float32Array(NP * TRAIL), pSize = new Float32Array(NP * TRAIL), pHue = new Float32Array(NP * TRAIL);
  var pGeo = new T.BufferGeometry();
  var pPosAttr = new T.BufferAttribute(pPos, 3).setUsage(T.DynamicDrawUsage);
  var pAlphaAttr = new T.BufferAttribute(pAlpha, 1).setUsage(T.DynamicDrawUsage);
  var pHueAttr = new T.BufferAttribute(pHue, 1).setUsage(T.DynamicDrawUsage);
  pGeo.setAttribute('position', pPosAttr);
  pGeo.setAttribute('aAlpha', pAlphaAttr);
  pGeo.setAttribute('aSize', new T.BufferAttribute(pSize, 1));
  pGeo.setAttribute('aHue', pHueAttr);
  for (var pk0 = 0; pk0 < NP; pk0++) for (var j0 = 0; j0 < TRAIL; j0++) pSize[pk0 * TRAIL + j0] = [0.5, 0.34, 0.25, 0.18][j0];
  var packetPoints = new T.Points(pGeo, glowMat([
    'attribute float aAlpha, aSize, aHue;',
    'uniform float uPR, uScale, uFogNear, uFogFar; uniform vec3 uPA, uPB;',
    'varying vec3 vColor; varying float vAlpha;',
    'void main() {',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vAlpha = aAlpha * (1.0 - smoothstep(uFogNear, uFogFar, -mv.z));',
    '  vColor = mix(uPA, uPB, aHue);',
    '  gl_PointSize = aSize * uPR * uScale / -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n')));
  packetPoints.frustumCulled = false;
  world.add(packetPoints);

  var agentAll = [], anyNode = [];
  nodes.forEach(function (d, i) { if (d.c === 0) agentAll.push(i); if (i !== CORE) anyNode.push(i); });
  // Traffic patterns; the backdrop drifts between them on its own.
  function anyRoute() { var a = pick(anyNode), b = pick(anyNode); while (nodes[b].c === nodes[a].c) b = pick(anyNode); return [a, b]; }
  var ROUTES = [
    anyRoute,
    function () { return rand() < 0.68 ? [pick(voiceIdx), pick(agentAll)] : [pick(agentAll), pick(voiceIdx)]; },
    function () { return rand() < 0.5 ? [pick(agentAll), pick(graphIdx)] : [pick(graphIdx), pick(agentAll)]; },
    function () { return rand() < 0.3 ? [pick(infraIdx), pick(rand() < 0.5 ? graphIdx : agentAll)] : anyRoute(); }
  ];
  var HI = [
    [0.62, 0.62, 0.62, 0.5, 1],
    [0.38, 0.3, 1, 0.26, 0.85],
    [1, 1, 0.3, 0.26, 0.85],
    [0.75, 0.75, 0.75, 0.85, 1]
  ];
  var focus = 0, focusClock = 0, FOCUS_HOLD = 7.5;

  function launch(pk, delay) {
    var route = null, tries = 0;
    while (!route && tries++ < 6) { var ab = ROUTES[focus](); route = path(ab[0], ab[1]); if (route && route.length < 2) route = null; }
    if (!route) route = [agentHubs[0], CORE];
    pk.route = route; pk.seg = 0; pk.t = 0; pk.wait = delay;
    pk.speed = rr(3.0, 4.4); pk.hue = rand() < 0.3 ? 1 : 0; pk.life = 0;
    pk.len = 0; for (var i = 0; i < route.length - 1; i++) pk.len += nodes[route[i]].p.distanceTo(nodes[route[i + 1]].p);
  }
  for (var k0 = 0; k0 < NP; k0++) { var pk = {}; launch(pk, rr(0, 3)); packets.push(pk); }

  var tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), UP = new V3(0, 1, 0);
  function segPoint(a, b, t, out) {
    var pa = nodes[a].p, pb = nodes[b].p;
    tmpC.subVectors(pb, pa); var len = tmpC.length();
    tmpA.crossVectors(tmpC, UP); if (tmpA.lengthSq() < 1e-4) tmpA.set(1, 0, 0);
    tmpA.normalize().multiplyScalar(len * 0.07);
    var te = t + (t * t * (3 - 2 * t) - t) * 0.5;
    return out.lerpVectors(pa, pb, te).addScaledVector(tmpA, Math.sin(te * Math.PI));
  }
  var TRAIL_A = [1, 0.5, 0.28, 0.14];
  function updatePackets(dt) {
    for (var k = 0; k < NP; k++) {
      var pk = packets[k], base = k * TRAIL, j;
      if (pk.wait > 0) { pk.wait -= dt; for (j = 0; j < TRAIL; j++) pAlpha[base + j] = 0; continue; }
      var a = pk.route[pk.seg], b = pk.route[pk.seg + 1];
      var segLen = Math.max(0.3, nodes[a].p.distanceTo(nodes[b].p));
      pk.t += dt * pk.speed / segLen; pk.life += dt * pk.speed;
      if (pk.t >= 1) {
        nodeFlash[b] = Math.min(1, nodeFlash[b] + (pk.seg + 2 === pk.route.length ? 1 : 0.3));
        pk.seg++; pk.t = 0;
        if (pk.seg >= pk.route.length - 1) { launch(pk, rr(0.2, 1.6)); for (j = 0; j < TRAIL; j++) pAlpha[base + j] = 0; continue; }
      }
      var a2 = pk.route[pk.seg], b2 = pk.route[pk.seg + 1];
      segLen = Math.max(0.3, nodes[a2].p.distanceTo(nodes[b2].p));
      var fade = Math.min(1, pk.life / 1.2, (pk.len - pk.life + 1.2) / 1.2);
      var blink = 0.78 + 0.22 * Math.sin(pk.life * 5 + k);
      for (j = 0; j < TRAIL; j++) {
        var tj = Math.max(0, pk.t - j * 0.045 * (3.6 / segLen) * pk.speed / 3.6);
        segPoint(a2, b2, tj, tmpB).toArray(pPos, (base + j) * 3);
        pAlpha[base + j] = Math.max(0, fade) * blink * TRAIL_A[j];
        pHue[base + j] = pk.hue;
      }
    }
    pPosAttr.needsUpdate = true; pAlphaAttr.needsUpdate = true; pHueAttr.needsUpdate = true;
  }

  /* ---- Labels -------------------------------------------------------- */
  var TAGS = [
    { c: 0, text: 'Agents', off: new V3(0, 2.6, 0) },
    { c: 1, text: 'Knowledge graph', off: new V3(0, 3.7, 0) },
    { c: 2, text: 'Voice', off: new V3(0, 3.3, 0) },
    { c: 3, text: 'Infrastructure', off: new V3(3.6, 0.6, 0) },
    { c: 4, text: 'LLM core', off: new V3(0, 2.4, 0) }
  ].map(function (t) {
    var el = document.createElement('span'); el.className = 'hb-tag'; el.textContent = t.text;
    if (tagsEl) tagsEl.appendChild(el);
    t.el = el; t.w = new V3(); t.o = 0; return t;
  });

  /* ---- Theme ----------------------------------------------------------- */
  var tc = new T.Color();
  function applyTheme() {
    var p = PAL[themeName()];
    var cols = p.cl.map(function (h) { return new T.Color(h); });
    nodes.forEach(function (d, i) { cols[d.c].toArray(nodeCol, i * 3); });
    nodeColAttr.needsUpdate = true;
    edgeSets.forEach(function (s) {
      s.list.forEach(function (e, i) { cols[nodes[e[0]].c].toArray(s.col, i * 6); cols[nodes[e[1]].c].toArray(s.col, i * 6 + 3); });
      s.attr.needsUpdate = true;
    });
    coreCol.set(p.coreA, 0); coreCol.set(p.coreB, 3); coreColAttr.needsUpdate = true;
    U.uPA.value.fromArray(p.pA); U.uPB.value.fromArray(p.pB);
    U.uFA.value.fromArray(p.fA); U.uFB.value.fromArray(p.fB);
    icoMat.color.setHex(p.ico); ringMat.color.setHex(p.ring);
    scene.fog.color.copy(tc.setHex(p.fog));
    TAGS.forEach(function (t) { t.el.style.setProperty('--tc', p.tags[t.c]); });
  }
  applyTheme();
  window.addEventListener('eb-themechange', function () { applyTheme(); requestFrame(); });
  if ('MutationObserver' in window) new MutationObserver(function () { applyTheme(); requestFrame(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- Pointer parallax ------------------------------------------------ */
  var ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', function (e) {
    if (!onScreen || e.pointerType === 'touch') return;
    ptr.x = e.clientX / window.innerWidth * 2 - 1; ptr.y = e.clientY / window.innerHeight * 2 - 1;
  }, { passive: true });

  /* ---- Sizing ------------------------------------------------------------ */
  var W = 0, H = 0, WIDE = true, copyRight = 0, copyTop = 0, copyBottom = 0;
  var copyEl = hero.querySelector('.sh-hero-copy');
  var camPos = new V3(), camTgt = new V3(0, -0.4, 0);
  function resize() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    WIDE = W > 980;
    if (copyEl) {
      var cr = copyEl.getBoundingClientRect();
      copyRight = cr.right - r.left + 24; copyTop = cr.top - r.top - 64; copyBottom = cr.bottom - r.top + 24;
    }
    var pr = Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2);
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < H ? 58 : 42;
    // desktop: shift the scene to the right of the copy; narrow: centred above it
    if (WIDE) camera.setViewOffset(W, H, -W * 0.19, H * 0.03, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    var far = W < H ? 1.04 : 1;
    camPos.set(0, 5.2, WIDE ? 27.5 : 25).multiplyScalar(far);
    U.uPR.value = pr;
    U.uScale.value = H * 0.5 / Math.tan(camera.fov * Math.PI / 360);
    requestFrame(true);
  }
  var rT = 0;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(resize, 120); });

  /* ---- Loop -------------------------------------------------------------- */
  var hi = HI[0].slice();
  var last = 0, raf = 0, simTime = 3.2, frames = 0;
  var right = new V3(), upv = new V3();
  // a little warm-up so the first frame already has traffic in flight
  for (var w = 0; w < 40; w++) updatePackets(0.05);

  function live() { return onScreen && !document.hidden && !RM; }

  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    var motion = !RM;
    if (motion) {
      simTime += dt;
      focusClock += dt;
      if (focusClock > FOCUS_HOLD) {
        focusClock = 0; focus = (focus + 1) % ROUTES.length;
        packets.forEach(function (p, k) { if (k % 2 === 0) launch(p, rr(0, 1.2)); });
      }
    }
    U.uTime.value = simTime;
    if (motion) world.rotation.y += dt * 0.05;
    world.updateMatrixWorld();

    var hk = motion ? Math.min(1, dt * 1.6) : 1;
    var target = HI[motion ? focus : 0];
    for (var c = 0; c < 5; c++) {
      hi[c] += (target[c] - hi[c]) * hk;
      U.uHi.value[c] = hi[c];
      edgeMats[c].opacity = c < 4 ? 0.07 + 0.3 * hi[c] : 0.12 + 0.18 * Math.max(hi[0], hi[1], hi[2]);
    }

    var pk2 = motion ? Math.min(1, dt * 2.2) : 1;
    ptr.sx += (ptr.x - ptr.sx) * pk2; ptr.sy += (ptr.y - ptr.sy) * pk2;
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    right.setFromMatrixColumn(camera.matrix, 0); upv.setFromMatrixColumn(camera.matrix, 1);
    var amp = (motion ? 1 : 0) * camPos.distanceTo(camTgt) * 0.03;
    camera.position.addScaledVector(right, ptr.sx * amp).addScaledVector(upv, -ptr.sy * amp * 0.6);
    camera.lookAt(camTgt);

    if (motion) { ico.rotation.y += dt * 0.18; ico.rotation.x += dt * 0.05; ring.rotation.z += dt * 0.12; }

    packetPoints.visible = motion;
    if (motion) {
      updatePackets(dt);
      for (var i = 0; i < nodeFlash.length; i++) nodeFlash[i] *= Math.exp(-dt * 2.6);
      flashAttr.needsUpdate = true;
    }

    renderer.render(scene, camera);
    placeTags(!motion);
    frames++;
    if (frames === 1) holder.classList.add('is-on');
    if (live()) raf = requestAnimationFrame(frame);
  }

  function placeTags(snap) {
    for (var i = 0; i < TAGS.length; i++) {
      var t = TAGS[i];
      t.w.copy(CENTER[t.c]).add(t.off).applyMatrix4(world.matrixWorld).project(camera);
      var x = (t.w.x * 0.5 + 0.5) * W, y = (-t.w.y * 0.5 + 0.5) * H;
      var vis = t.w.z < 1 && y > 70 && y < H - 40 && x > 8 && x + (t.el.offsetWidth || 120) < W - 12;
      if (x < copyRight && y > copyTop && y < copyBottom) vis = false;   // keep labels off the copy
      var want = vis ? Math.min(1, 0.25 + 0.85 * hi[t.c]) * (t.c === 4 ? 0.7 : 1) : 0;
      t.o = snap ? want : t.o + (want - t.o) * 0.12;
      t.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      t.el.style.opacity = t.o.toFixed(3);
    }
  }

  // force: draw one frame even when paused (resize / theme / reduced motion)
  function requestFrame(force) {
    if (raf) return;
    if (live() || force || RM) { if (!live()) last = 0; raf = requestAnimationFrame(frame); }
  }
  onWake = function () { last = 0; requestFrame(); };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last = 0; requestFrame(); } });
  var onRM = function () { RM = reduceMQ.matches; last = 0; requestFrame(true); };
  if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onRM); else if (reduceMQ.addListener) reduceMQ.addListener(onRM);
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (raf) cancelAnimationFrame(raf); raf = 0; }, false);
  canvas.addEventListener('webglcontextrestored', function () { requestFrame(true); }, false);

  resize();
  window.__heroBg = { mode: 'webgl', nodes: nodes.length, edges: edges.length, packets: NP, get frames() { return frames; }, get running() { return live(); } };

  /* ---- 2D fallback: one still constellation ----------------------------- */
  function fallback2D() {
    var ctx = canvas.getContext('2d');
    window.__heroBg = { mode: '2d' };
    if (!ctx) return;
    function draw() {
      var r = canvas.getBoundingClientRect();
      var pr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, r.width), h = Math.max(1, r.height);
      canvas.width = Math.round(w * pr); canvas.height = Math.round(h * pr); ctx.setTransform(pr, 0, 0, pr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var p = PAL[themeName()];
      var cols = p.cl.slice(0, 4).map(function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); });
      var s = 7; function r2() { return (s = (s * 16807) % 2147483647) / 2147483647; }
      var wide = w > 980, cx = wide ? w * 0.7 : w * 0.5, cy = wide ? h * 0.46 : h * 0.4, m = Math.min(w, h);
      var pts = [];
      for (var c = 0; c < 4; c++) {
        var a = c / 4 * Math.PI * 2 + 0.5, ox = cx + Math.cos(a) * m * 0.26, oy = cy + Math.sin(a) * m * 0.18;
        for (var i = 0; i < 16; i++) pts.push({ x: ox + (r2() - 0.5) * m * 0.2, y: oy + (r2() - 0.5) * m * 0.15, c: c });
      }
      ctx.lineWidth = 1;
      pts.forEach(function (pt, i) {
        var q = pts[(i + 1) % pts.length];
        if (q.c === pt.c) { ctx.strokeStyle = cols[pt.c] + '40'; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        if (i % 16 === 0) { ctx.strokeStyle = cols[pt.c] + '26'; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(cx, cy); ctx.stroke(); }
      });
      pts.forEach(function (pt) { ctx.fillStyle = cols[pt.c]; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.9, 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
      g.addColorStop(0, 'rgba(241,255,224,0.9)'); g.addColorStop(1, 'rgba(198,244,50,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 46, cy - 46, 92, 92);
      holder.classList.add('is-on');
    }
    draw();
    var t = 0;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(draw, 150); });
    window.addEventListener('eb-themechange', draw);
  }
})();
