/* =========================================================
   Shilo Pro — Header group JS
   Announcement rotation, predictive search, menu drawer adoption
   Loaded (deferred) by both announcement-bar and header sections,
   so the whole module is guarded against double execution.
   ========================================================= */
(function () {
  'use strict';

  if (window.__shiloHeaderInit) return;
  window.__shiloHeaderInit = true;

  var debounce = window.debounce || function (fn, wait) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  };

  var searchInstances = [];

  /* ---------- Menu drawer: move to <body> ----------
     The header section wrapper is position:sticky with a z-index, which
     creates a stacking context below the global overlay (z-index 90).
     Re-parenting the drawer to <body> lets it layer above the overlay. */
  function adoptMenuDrawer(scope) {
    var drawer = scope.querySelector('[data-menu-drawer]');
    if (!drawer) return;
    document.querySelectorAll('body > [data-menu-drawer]').forEach(function (old) {
      if (old !== drawer) old.remove();
    });
    if (drawer.parentElement !== document.body) document.body.appendChild(drawer);
  }

  /* ---------- Announcement rotation ---------- */
  function initAnnouncements(track) {
    if (!track || track.dataset.initialized === 'true') return;
    track.dataset.initialized = 'true';

    var items = Array.prototype.slice.call(track.querySelectorAll('[data-announcement]'));
    if (items.length < 2) return;

    var interval = parseInt(track.getAttribute('data-rotate-interval'), 10) || 5000;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var index = 0;
    var timer = null;

    function show(i) {
      index = i;
      items.forEach(function (item, n) {
        item.classList.toggle('is-active', n === i);
        item.setAttribute('aria-hidden', n === i ? 'false' : 'true');
      });
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      if (reduced) return;
      stop();
      timer = setInterval(function () {
        show((index + 1) % items.length);
      }, interval);
    }

    /* Exposed for the theme editor (block select/deselect) */
    track._pin = function (item) {
      stop();
      var i = items.indexOf(item);
      if (i > -1) show(i);
    };
    track._resume = start;

    var bar = track.closest('.announcement-bar') || track;
    bar.addEventListener('mouseenter', stop);
    bar.addEventListener('mouseleave', start);
    bar.addEventListener('focusin', stop);
    bar.addEventListener('focusout', start);

    show(0);
    start();
  }

  /* ---------- Predictive search ---------- */
  function initSearchForm(form) {
    if (!form || form.dataset.initialized === 'true') return;
    form.dataset.initialized = 'true';

    var input = form.querySelector('[data-search-input]');
    var panel = form.querySelector('[data-search-panel]');
    if (!input || !panel) return;

    var slot = form.querySelector('[data-search-results]');
    var popular = form.querySelector('[data-search-popular]');
    var clearBtn = form.querySelector('[data-search-clear]');
    var predictiveOn = !!(window.themeSettings && window.themeSettings.predictiveSearch) && !!slot;
    var cache = {};
    var cacheSize = 0;
    var controller = null;

    function openPanel() {
      panel.hidden = false;
      form.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
    }

    function closePanel() {
      if (controller) {
        controller.abort();
        controller = null;
      }
      form.classList.remove('is-searching');
      panel.hidden = true;
      form.classList.remove('is-open');
      input.setAttribute('aria-expanded', 'false');
    }

    function showPopular() {
      if (slot) {
        slot.hidden = true;
        slot.innerHTML = '';
      }
      if (popular) {
        popular.hidden = false;
        openPanel();
      } else {
        closePanel();
      }
    }

    function renderResults(html) {
      if (!slot) return;
      if (!html || !html.trim()) {
        closePanel();
        return;
      }
      slot.innerHTML = html;
      slot.hidden = false;
      if (popular) popular.hidden = true;
      openPanel();
    }

    function fetchResults(q) {
      if (Object.prototype.hasOwnProperty.call(cache, q)) {
        renderResults(cache[q]);
        return;
      }
      if (controller) controller.abort();
      controller = new AbortController();
      form.classList.add('is-searching');

      var url = window.routes.predictive_search_url +
        '?q=' + encodeURIComponent(q) +
        '&resources[type]=product,collection,page,article' +
        '&resources[limit]=6' +
        '&resources[limit_scope]=each' +
        '&section_id=predictive-search';

      fetch(url, { signal: controller.signal })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (text) {
          form.classList.remove('is-searching');
          var doc = new DOMParser().parseFromString(text, 'text/html');
          var results = doc.getElementById('PredictiveSearchResults');
          var html = results ? results.innerHTML : '';
          if (cacheSize > 40) {
            cache = {};
            cacheSize = 0;
          }
          cache[q] = html;
          cacheSize++;
          if (input.value.trim() === q) renderResults(html);
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          form.classList.remove('is-searching');
          closePanel();
        });
    }

    function onQueryChange() {
      var q = input.value.trim();
      if (clearBtn) clearBtn.hidden = q.length === 0;
      if (q.length === 0) {
        showPopular();
        return;
      }
      if (!predictiveOn || q.length < 2) {
        closePanel();
        return;
      }
      fetchResults(q);
    }

    input.addEventListener('input', debounce(onQueryChange, 250));

    input.addEventListener('focus', function () {
      var q = input.value.trim();
      if (q.length === 0) {
        if (popular) showPopular();
      } else if (predictiveOn && q.length >= 2) {
        fetchResults(q);
      }
    });

    if (clearBtn) {
      clearBtn.hidden = input.value.trim().length === 0;
      clearBtn.addEventListener('click', function () {
        input.value = '';
        clearBtn.hidden = true;
        input.focus();
        showPopular();
      });
    }

    form.addEventListener('submit', function (e) {
      if (input.value.trim().length === 0) {
        e.preventDefault();
        input.focus();
      }
    });

    /* Keyboard: combobox-style navigation into the results panel */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closePanel();
        return;
      }
      if (e.key === 'ArrowDown' && !panel.hidden) {
        var first = panel.querySelector('a[href], button:not([disabled])');
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    panel.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') return;
      var focusables = Array.prototype.slice.call(panel.querySelectorAll('a[href], button:not([disabled])'))
        .filter(function (el) { return el.offsetParent !== null; });
      if (e.key === 'Escape') {
        closePanel();
        input.focus();
        return;
      }
      if (!focusables.length) return;
      var idx = focusables.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (focusables[idx + 1] || focusables[0]).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0) input.focus();
        else focusables[idx - 1].focus();
      }
    });

    searchInstances.push({ form: form, close: closePanel });
  }

  /* Close open search panels on outside click */
  document.addEventListener('click', function (e) {
    searchInstances.forEach(function (inst) {
      if (!document.documentElement.contains(inst.form)) return;
      if (inst.form.classList.contains('is-open') && !inst.form.contains(e.target)) {
        inst.close();
      }
    });
  });

  /* ---------- Init ---------- */
  function initAll(scope) {
    var root = scope || document;
    adoptMenuDrawer(root);
    root.querySelectorAll('[data-announcements]').forEach(initAnnouncements);
    root.querySelectorAll('[data-header-search]').forEach(initSearchForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(document); });
  } else {
    initAll(document);
  }

  /* Theme editor support */
  document.addEventListener('shopify:section:load', function (e) {
    initAll(e.target);
  });

  document.addEventListener('shopify:block:select', function (e) {
    var item = e.target && e.target.closest ? e.target.closest('[data-announcement]') : null;
    if (!item) return;
    var track = item.closest('[data-announcements]');
    if (track && typeof track._pin === 'function') track._pin(item);
  });

  document.addEventListener('shopify:block:deselect', function (e) {
    var item = e.target && e.target.closest ? e.target.closest('[data-announcement]') : null;
    if (!item) return;
    var track = item.closest('[data-announcements]');
    if (track && typeof track._resume === 'function') track._resume();
  });
})();
