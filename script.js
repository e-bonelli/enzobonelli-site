// Enzo Bonelli — Portfolio interactions (multi-page)
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --- Year in footer ---------------------------------------------------
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // --- Nav background on scroll -----------------------------------------
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => {
      if (window.scrollY > 24) nav.classList.add('scrolled');
      else                     nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // --- Mobile menu toggle -----------------------------------------------
  const toggle = $('#nav-toggle');
  const links  = $('#nav-links');
  toggle?.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-links a').forEach(a =>
    a.addEventListener('click', () => {
      links?.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    })
  );

  // --- Reveal on scroll -------------------------------------------------
  const revealTargets = [
    ...$$('.section-header'),
    ...$$('.timeline-item'),
    ...$$('.edu-card'),
    ...$$('.cred-card'),
    ...$$('.skill-cat'),
    ...$$('.contact-card'),
    ...$$('.stat'),
    ...$$('.about-prose'),
    ...$$('.pillar'),
    ...$$('.next-card'),
    ...$$('.tech-chip'),
    ...$$('.thesis-spotlight'),
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

  // --- Stagger reveal within grids --------------------------------------
  const stagger = (selector, step = 60) => {
    $$(selector).forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i * step, 400)}ms`;
    });
  };
  stagger('.pillar', 70);
  stagger('.edu-card');
  stagger('.cred-card');
  stagger('.contact-card');
  stagger('.stat');
  stagger('.next-card', 70);
  stagger('.tech-chip', 25);
  stagger('.timeline-item', 80);
})();
