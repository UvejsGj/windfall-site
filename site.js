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

  // ----- the phone-page film -----
  // The film keeps the browser's own controls. Beside it hangs a second drop line with a
  // stop for each of the film's nine steps. Each stop links to the film file at that
  // moment; here it becomes a button that plays the film on the page from there. While the
  // film runs, the apple lets go just before the film moves on and lands on the next stop
  // with the bounce from the opening. When less motion is asked for it moves without
  // falling. Nothing here starts the film by itself, or loads it before it is played.
  var film = document.querySelector('.film video');
  if (film) reel(film);

  function reel(video) {
    var wrap = document.querySelector('.reel-wrap');
    var frame = video.parentNode;
    var line = wrap.querySelector('.reel-line');
    var apple = line.querySelector('.apple');
    var stops = [].slice.call(line.querySelectorAll('li[data-at]'));
    var at = stops.map(function (li) { return parseFloat(li.getAttribute('data-at')); });
    var sources = [].slice.call(video.querySelectorAll('source'));
    var dark = window.matchMedia('(prefers-color-scheme: dark)');
    var DOT = 11;     // the middle of a stop's dot, below the top of the stop (site.css)
    var FALL = 0.55;  // seconds the apple takes to drop to the next stop (site.css)
    var now = -2, falling = -1, cue = null, worn = null, cueing = null;

    var buttons = stops.map(function (li, i) {
      var link = li.querySelector('a');
      var button = document.createElement('button');
      button.type = 'button';
      while (link.firstChild) button.appendChild(link.firstChild);
      li.replaceChild(button, link);
      button.addEventListener('click', function () { go(i); });
      return button;
    });
    line.setAttribute('aria-label', 'Play the film from a step');

    // A stop plays the film from its step. On a phone the stops sit below the film, so if
    // it is out of sight it is brought into view first. If that leaves the stop itself out
    // of sight, the film takes the focus, so that Space pauses it rather than starting the
    // step again where nobody can see.
    function go(i) {
      if (video.error) video.src = pick(worn);   // an earlier load failed: start again from the best file
      if (video.readyState) video.currentTime = at[i]; else cue = at[i];
      sync();
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
      var y = show(), b = buttons[i], top = pageTop(b);
      if (top < y || top + b.offsetHeight > y + window.innerHeight) video.focus({ preventScroll: true });
    }

    // Where an element sits in the page, rather than where it is drawn: a film that has not
    // risen into place yet is drawn lower than it will end up.
    function pageTop(el) {
      var top = 0;
      for (; el; el = el.offsetParent) top += el.offsetTop;
      return top;
    }

    // Scroll the least distance that puts the whole film in view, and say where the page
    // will rest.
    function show() {
      var top = pageTop(frame), bottom = top + frame.offsetHeight, y = window.pageYOffset, h = window.innerHeight;
      if (top >= y && bottom <= y + h) return y;
      var to = top < y || bottom - top > h ? top : bottom - h;
      window.scrollTo({ top: to, behavior: moving ? 'smooth' : 'auto' });
      return to;
    }

    // Which step the film is on: the last stop it has reached, or -1 on the title card.
    function step(t) {
      var i = -1;
      while (i + 1 < at.length && t >= at[i + 1]) i++;
      return i;
    }

    // The apple hangs under the twig before the first step and rests on the dot of the step
    // being shown. On the last step it sits where the line ends, as in the opening.
    function y(i) {
      if (i < 0) return -8;
      var li = stops[i];
      if (li.classList.contains('land')) return li.offsetTop + li.offsetHeight - apple.offsetHeight;
      return li.offsetTop + DOT - apple.offsetHeight / 2;
    }
    // Measuring comes first: it settles the apple where it is now, so a fall always starts
    // from the stop it was placed on, never from wherever it was before a jump.
    function place(i, fall) {
      var to = y(i);
      apple.classList.toggle('falling', fall);
      apple.style.transform = 'translateY(' + to + 'px)';
    }
    apple.addEventListener('transitionend', function () {
      apple.classList.remove('falling', 'landed');
      void apple.offsetWidth;
      apple.classList.add('landed');
    });

    function mark(i) {
      stops.forEach(function (li, k) {
        li.classList.toggle('past', k < i);
        li.classList.toggle('now', k === i);
        if (k === i) buttons[k].setAttribute('aria-current', 'step');
        else buttons[k].removeAttribute('aria-current');
      });
      if (i < 0 || falling !== i) place(i, false);   // already on its way down: let it land
      falling = -1;
      now = i;
    }

    // While the film runs, the apple lets go just before the next step, so that it lands as
    // the step's caption appears. A jump in the film puts it in place at once.
    function sync() {
      var t = cue !== null ? cue : video.currentTime;
      var i = step(t);
      if (i !== now) mark(i);
      var next = i + 1;
      if (moving && !video.paused && !video.seeking && next < at.length && falling !== next && t >= at[next] - FALL) {
        falling = next;
        place(next, true);
      }
    }

    video.addEventListener('loadedmetadata', function () {
      if (cue !== null) { video.currentTime = cue; cue = null; }
    });
    video.addEventListener('timeupdate', sync);
    video.addEventListener('seeking', function () { falling = -1; now = -2; });
    video.addEventListener('seeked', function () { uncue(); sync(); });
    // Until a jump to a step has landed, the film is hidden and the still shows through, so
    // that its opening frame does not flash first. That hides the controls too, so it lasts
    // at most a moment and ends with a pause.
    video.addEventListener('play', function () {
      wrap.classList.add('playing');
      if (cue !== null) {
        frame.classList.add('cueing');
        clearTimeout(cueing);
        cueing = setTimeout(uncue, 1500);
      }
      sync();
    });
    function uncue() {
      clearTimeout(cueing);
      frame.classList.remove('cueing');
    }

    // If a render will not play, try the other file for the same theme from the same moment.
    // It plays on only if it was playing: a reader who paused first is not overruled.
    video.addEventListener('error', function () {
      var resume = wrap.classList.contains('playing');
      wrap.classList.remove('playing');
      uncue();
      var mine = sources.filter(function (s) { return s.getAttribute('data-theme') === worn; })
        .map(function (s) { return s.getAttribute('src'); });
      var k = mine.indexOf(video.getAttribute('src'));
      if (k < 0 || k + 1 >= mine.length) return;
      if (cue === null && video.currentTime > 0) cue = video.currentTime;
      video.src = mine[k + 1];
      if (!resume) return;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    });
    video.addEventListener('pause', function () { wrap.classList.remove('playing'); uncue(); dress(); });

    // Two renders, one for each theme. The film offered is the one that matches the page. If
    // the theme changes, the film follows at the next pause, from the same moment.
    function theme() {
      var scheme = getComputedStyle(document.documentElement).colorScheme;
      return (scheme ? scheme.indexOf('dark') > -1 : dark.matches) ? 'dark' : 'light';
    }
    function pick(want) {
      var mine = sources.filter(function (s) { return s.getAttribute('data-theme') === want; });
      var playable = mine.filter(function (s) { return video.canPlayType(s.type) !== ''; });
      return (playable[0] || mine[mine.length - 1]).getAttribute('src');
    }
    function dress() {
      var want = theme();
      if (want === worn || !video.paused) return;
      var t = cue !== null ? cue : video.ended ? 0 : video.currentTime;
      worn = want;
      video.src = pick(want);   // with preload="none" this fetches nothing
      cue = t > 0 ? t : null;
    }
    if (dark.addEventListener) dark.addEventListener('change', dress);
    else if (dark.addListener) dark.addListener(dress);
    new MutationObserver(dress).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { falling = -1; place(now, false); }).observe(line);
    } else {
      window.addEventListener('resize', function () { falling = -1; place(now, false); });
    }

    dress();
    wrap.classList.add('on');
    sync();
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
