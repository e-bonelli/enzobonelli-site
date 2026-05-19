// Enzo Bonelli — Portfolio interactions
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --- Year in footer ----------------------------------------------------
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --- Nav background on scroll -----------------------------------------
  const nav = $('#nav');
  const onScroll = () => {
    if (window.scrollY > 24) nav.classList.add('scrolled');
    else                     nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Mobile menu toggle ------------------------------------------------
  const toggle = $('#nav-toggle');
  const links  = $('#nav-links');
  toggle?.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  // Close menu when a link is tapped on mobile
  $$('.nav-links a').forEach(a =>
    a.addEventListener('click', () => {
      links.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    })
  );

  // --- Active section highlighting in nav -------------------------------
  const sections = $$('section[id], header[id]');
  const navLinks = $$('.nav-links a');
  const setActive = (id) => {
    navLinks.forEach(a => {
      const href = a.getAttribute('href');
      if (href === `#${id}`) a.classList.add('active');
      else                   a.classList.remove('active');
    });
  };
  const navObserver = new IntersectionObserver((entries) => {
    // Pick the entry closest to the top that's intersecting
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setActive(visible[0].target.id);
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
  sections.forEach(s => navObserver.observe(s));

  // --- Reveal on scroll --------------------------------------------------
  const revealTargets = [
    ...$$('.section-header'),
    ...$$('.timeline-item'),
    ...$$('.edu-card'),
    ...$$('.cred-card'),
    ...$$('.skill-cat'),
    ...$$('.contact-card'),
    ...$$('.stat'),
    ...$$('.about-prose'),
  ];
  revealTargets.forEach(el => el.classList.add('reveal'));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach(el => revealObserver.observe(el));

  // --- Stagger reveal for siblings inside a grid ------------------------
  const stagger = (selector, step = 60) => {
    $$(selector).forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i * step, 400)}ms`;
    });
  };
  stagger('.edu-card');
  stagger('.cred-card');
  stagger('.skill-cat');
  stagger('.contact-card');
  stagger('.stat');
  stagger('.timeline-item', 80);
})();
