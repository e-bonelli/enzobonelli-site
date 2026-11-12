/* ============================================================
   PROJECT PAGES — step controller
   Markup owns the content (see projects/<slug>/index.html); this file
   turns the list of steps into a guided walkthrough:

   - The page names its scene: <body data-scene="VoiceScene"
     data-scene-alt="IsoScene">. The scene API (v2) is
       window.<Name>.mount(container, { reducedMotion, mode: 'story' })
         → { steps, setStep(index, progress), destroy() }
     If the scene is missing or fails, a placeholder stack stands in.
   - Steps 0..4 are the five steps; index 5 is the completion state
     (scene held at step 4, fully built).
   - Forward moves animate setStep(i, 0→1) over ~900ms; backward moves
     run a short reverse of the current step, then land on the
     previous step's completed state.
   - Back / Next, the step bar, ←/→ and Space, deep links (#step-3,
     #complete), and Play, which advances every 6s and pauses on any
     other interaction.
   - prefers-reduced-motion: steps land instantly; Play never starts
     by itself.
   ============================================================ */
(function () {
  'use strict';

  var FORWARD_MS = 900;
  var REVERSE_MS = 320;
  var DWELL_MS = 6000;
  var root = document.documentElement;
  var body = document.body;

  var stepEls = Array.prototype.slice.call(document.querySelectorAll('.pj-step'));
  var segs = Array.prototype.slice.call(document.querySelectorAll('.pj-seg'));
  var sceneEl = document.getElementById('pj-scene');
  var live = document.getElementById('pj-live');
  var backBtn = document.querySelector('.pj-back');
  var nextBtn = document.querySelector('.pj-next');
  var nextText = nextBtn && nextBtn.querySelector('.pj-btn-text');
  var playBtn = document.querySelector('.pj-play');
  if (!stepEls.length || !sceneEl || !backBtn || !nextBtn) return;

  var LAST = stepEls.length - 1;          // index of the completion state
  var STEPS = LAST;                        // number of real steps (5)
  var NAMES = stepEls.map(function (el) { return el.getAttribute('data-name') || ''; });

  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceMQ && reduceMQ.matches); }

  root.classList.add('is-js');
  body.style.setProperty('--dwell', DWELL_MS + 'ms');

  /* ---------- Scene ---------- */
  function sceneApi() {
    var names = [body.getAttribute('data-scene'), body.getAttribute('data-scene-alt')];
    for (var k = 0; k < names.length; k++) {
      var api = names[k] && window[names[k]];
      if (api && typeof api.mount === 'function') return api;
    }
    return null;
  }

  // Five plates that light up as the system is built: honest about
  // being a stand-in, but still tells the build order.
  function placeholderScene(container) {
    var wrap = document.createElement('div');
    wrap.className = 'pj-ph';
    wrap.setAttribute('aria-hidden', 'true');
    var stack = document.createElement('div');
    stack.className = 'pj-ph-stack';
    var labels = document.createElement('div');
    labels.className = 'pj-ph-labels';
    var plates = [], tags = [];
    for (var i = 0; i < STEPS; i++) {
      var pl = document.createElement('span');
      pl.className = 'pj-ph-plate';
      stack.appendChild(pl); plates.push(pl);
      var t = document.createElement('span');
      t.textContent = (i + 1) + ' ' + NAMES[i];
      labels.appendChild(t); tags.push(t);
    }
    wrap.appendChild(stack); wrap.appendChild(labels);
    container.appendChild(wrap);
    return {
      placeholder: true,
      setStep: function (idx, p) {
        for (var k = 0; k < plates.length; k++) {
          var on = k < idx || (k === idx && p >= 0.999);
          plates[k].classList.toggle('is-on', on);
          plates[k].classList.toggle('is-building', k === idx && !on);
          tags[k].classList.toggle('is-on', k <= idx);
        }
        plates[idx] && plates[idx].style.setProperty('--p', p.toFixed(3));
      },
      destroy: function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  var scene = null;
  var sceneIdx = 0, sceneP = 0;
  function mountScene() {
    if (scene) { try { scene.destroy(); } catch (e) {} scene = null; }
    sceneEl.textContent = '';
    var api = sceneApi();
    if (api) {
      try { scene = api.mount(sceneEl, { reducedMotion: reduced(), mode: 'story' }); }
      catch (e) {
        if (window.console) console.warn('[project] scene mount failed, using placeholder', e);
        scene = null;
      }
      if (!scene || typeof scene.setStep !== 'function') { scene = null; sceneEl.textContent = ''; }
    }
    if (!scene) scene = placeholderScene(sceneEl);
    sendScene(sceneIdx, sceneP);
  }
  function sendScene(i, p) {
    sceneIdx = i; sceneP = p;
    try { scene && scene.setStep(i, p); }
    catch (e) { if (window.console) console.warn('[project] setStep failed', e); }
  }
  function sceneStepFor(state) { return Math.min(state, STEPS - 1); }

  /* ---------- Tween ---------- */
  var raf = 0;
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function cancelTween() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function tween(i, from, to, ms, done) {
    cancelTween();
    var t0 = 0;
    function frame(now) {
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / ms);
      sendScene(i, from + (to - from) * easeInOut(k));
      if (k < 1) raf = requestAnimationFrame(frame);
      else { raf = 0; if (done) done(); }
    }
    raf = requestAnimationFrame(frame);
  }

  function buildScene(from, to) {
    var si = sceneStepFor(to);
    if (reduced()) { cancelTween(); sendScene(si, 1); return; }
    if (to > from || from < 0) {
      // Forward: hold the earlier steps built, grow this one.
      if (sceneIdx === si && sceneP >= 0.999) return;           // e.g. step 5 → complete
      var start = sceneIdx === si ? sceneP : 0;
      tween(si, start, 1, FORWARD_MS * (1 - start));
    } else if (to < from) {
      var cur = sceneIdx;
      if (cur === si) { tween(si, sceneP, 1, 200); return; }    // complete → step 5
      // Backward: briefly un-build the current step, then land on the
      // target step's finished state.
      tween(cur, sceneP, 0, REVERSE_MS, function () { sendScene(si, 1); });
    }
  }

  /* ---------- State ---------- */
  var state = -1;

  function labelNext() {
    var t = state === LAST ? 'Replay' : state === LAST - 1 ? 'Finish' : 'Next';
    if (nextText) nextText.textContent = t;
    nextBtn.setAttribute('aria-label',
      state === LAST ? 'Replay from step 1' : state === LAST - 1 ? 'Finish: see the full system' : 'Next step');
  }

  function render() {
    stepEls.forEach(function (el, k) {
      var on = k === state;
      el.classList.toggle('is-current', on);
      if (on) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');
      // Keep hidden steps' links out of the tab order.
      Array.prototype.forEach.call(el.querySelectorAll('a, button'), function (a) {
        if (on) a.removeAttribute('tabindex'); else a.setAttribute('tabindex', '-1');
      });
    });
    segs.forEach(function (b, k) {
      if (k === state) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('is-done', k < state);
    });
    backBtn.disabled = state <= 0;
    labelNext();
  }

  function hashFor(s) { return s === LAST ? '#complete' : '#step-' + (s + 1); }
  function parseHash(h) {
    var m = /^#step-(\d+)$/.exec(h || '');
    if (m) { var n = +m[1]; if (n >= 1 && n <= STEPS) return n - 1; }
    if (h === '#complete') return LAST;
    return -1;
  }

  function announce(s) {
    if (!live) return;
    var el = stepEls[s];
    var h = el.querySelector('h2');
    var p = el.querySelector('p:not(.pj-step-label)');
    var lead = s === LAST ? 'The full system. ' : 'Step ' + (s + 1) + ' of ' + STEPS + ', ' + NAMES[s] + '. ';
    live.textContent = '';
    // Next tick so repeated identical text is still announced.
    setTimeout(function () { live.textContent = lead + (h ? h.textContent + ' ' : '') + (p ? p.textContent : ''); }, 40);
  }

  // opts: { focus: move focus to the heading, announce: use the live region, auto: from Play }
  function go(s, opts) {
    opts = opts || {};
    s = Math.max(0, Math.min(LAST, s));
    var from = state;
    if (s === from && !opts.force) return;
    state = s;
    render();
    buildScene(from, s);
    if (history.replaceState) { try { history.replaceState(null, '', hashFor(s)); } catch (e) {} }
    if (opts.focus) {
      var h = stepEls[s].querySelector('h2');
      if (h) h.focus({ preventScroll: true });
    } else if (opts.announce) announce(s);
    if (backBtn.disabled && document.activeElement === backBtn) nextBtn.focus();
    if (playing) schedule();
  }

  /* ---------- Play ---------- */
  var playing = false, timer = 0;
  function schedule() {
    clearTimeout(timer);
    if (!playing) return;
    if (state >= LAST) { setPlaying(false); return; }
    timer = setTimeout(function () { go(state + 1, { auto: true, announce: false }); }, DWELL_MS);
  }
  function setPlaying(on) {
    playing = !!on;
    body.classList.toggle('is-playing', playing);
    if (playBtn) {
      playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      var t = playBtn.querySelector('.pj-btn-text');
      if (t) t.textContent = playing ? 'Pause' : 'Play';
    }
    if (playing) {
      if (state >= LAST) go(0, { force: true }); else schedule();
    } else clearTimeout(timer);
  }
  if (playBtn) playBtn.addEventListener('click', function () { setPlaying(!playing); });

  // Any interaction other than the Play button pauses autoplay.
  function interrupt(e) {
    if (!playing) return;
    if (playBtn && playBtn.contains(e.target)) return;
    setPlaying(false);
  }
  document.addEventListener('pointerdown', interrupt, true);
  document.addEventListener('keydown', function (e) {
    if (playBtn && e.target === playBtn && (e.key === ' ' || e.key === 'Enter')) return;
    interrupt(e);
  }, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden) setPlaying(false); });

  /* ---------- Controls ---------- */
  nextBtn.addEventListener('click', function () {
    if (state >= LAST) go(0, { announce: true });
    else go(state + 1, { announce: true });
  });
  backBtn.addEventListener('click', function () { go(state - 1, { announce: true }); });
  segs.forEach(function (b, k) {
    b.addEventListener('click', function () { go(k, { focus: true }); });
  });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === 'ArrowRight') {
      if (state < LAST) { e.preventDefault(); go(state + 1, { focus: true }); }
    } else if (e.key === 'ArrowLeft') {
      if (state > 0) { e.preventDefault(); go(state - 1, { focus: true }); }
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      // Let Space activate whatever control has focus.
      if (t && t.closest && t.closest('a, button')) return;
      if (e.shiftKey) return;
      e.preventDefault();
      if (state < LAST) go(state + 1, { focus: true });
    }
  });

  window.addEventListener('hashchange', function () {
    var s = parseHash(location.hash);
    if (s >= 0 && s !== state) go(s, { focus: true });
  });

  if (reduceMQ && reduceMQ.addEventListener) {
    reduceMQ.addEventListener('change', function () { cancelTween(); sendScene(sceneStepFor(state), 1); mountScene(); });
  }

  /* ---------- Start ---------- */
  var initial = parseHash(location.hash);
  var deep = initial >= 0;
  mountScene();
  sendScene(sceneStepFor(Math.max(0, initial)), 0);
  go(deep ? initial : 0, { force: true });

  // A scene that loads late (slow network) replaces the placeholder.
  if (scene && scene.placeholder) {
    window.addEventListener('load', function () { if (scene.placeholder && sceneApi()) mountScene(); });
  }

  if (!reduced() && !deep) setPlaying(true);

  // Test hook.
  window.__project = {
    go: function (s) { go(s, { focus: true }); },
    state: function () {
      return { state: state, scene: [sceneIdx, +sceneP.toFixed(3)], playing: playing, real: !(scene && scene.placeholder), names: NAMES };
    }
  };
})();
