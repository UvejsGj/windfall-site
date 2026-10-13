// Motion and the lab-notes index. Everything here is an extra: each page reads in full
// without it. The page head sets the "js" class only when this can run and the reader
// has not asked for less motion, and takes it back if this file never arrives.
(function () {
  'use strict';
  window.windfallReady = true;

  var moving = document.documentElement.classList.contains('js');

  // Rise into place on scroll. Things that arrive together follow one another.
  if (moving) {
    var rise = new IntersectionObserver(function (entries) {
      var shown = entries.filter(function (e) { return e.isIntersecting; });
      shown.forEach(function (entry, i) {
        var el = entry.target;
        var step = el.parentElement && el.parentElement.classList.contains('bytes') ? 45 : 70;
        el.style.setProperty('--d', (i * step) + 'ms');
        el.classList.add('in');
        rise.unobserve(el);
        var count = el.querySelector('[data-count]');
        if (count) countUp(count, i * step);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });

    document.querySelectorAll('[data-rise]').forEach(function (el) { rise.observe(el); });
  }

  // A figure counts up to its value once, when it is first seen.
  function countUp(el, delay) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    var start = null;
    el.textContent = '0';
    function frame(now) {
      if (start === null) start = now + delay;
      var t = Math.min(1, Math.max(0, (now - start) / 1100));
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // "Drop it again" replays the fall down the drop line.
  var again = document.querySelector('.again');
  if (again) {
    again.addEventListener('click', function () {
      document.querySelectorAll('.drop li').forEach(function (el) {
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      });
    });
  }

  // ----- the lab notes -----
  var index = document.querySelector('.index');
  if (!index) return;

  var fold = index.querySelector('details');
  if (fold && window.matchMedia('(max-width: 1000px)').matches) fold.open = false;

  // Show only one kind of entry in the list.
  var buttons = index.querySelectorAll('.filters button');
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var kind = button.getAttribute('data-kind');
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      index.querySelectorAll('li[data-kind]').forEach(function (li) {
        li.hidden = kind !== 'all' && li.getAttribute('data-kind') !== kind;
      });
      index.querySelectorAll('.group').forEach(function (group) {
        group.hidden = !group.querySelector('li:not([hidden])');
      });
    });
  });

  // Mark the entry being read, and keep it in sight in the list.
  if (!('IntersectionObserver' in window)) return;
  var links = {};
  index.querySelectorAll('li a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var current = null;
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var link = links[entry.target.id];
      if (!link || link === current) return;
      if (current) current.classList.remove('now');
      link.classList.add('now');
      current = link;
      if (index.scrollHeight > index.clientHeight) {
        var top = link.offsetTop - index.clientHeight / 2;
        index.scrollTo({ top: top, behavior: moving ? 'smooth' : 'auto' });
      }
    });
  }, { rootMargin: '0px 0px -70% 0px' });
  document.querySelectorAll('.prose .eh').forEach(function (h) { spy.observe(h); });
})();
