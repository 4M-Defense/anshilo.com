/* =========================================================
   Shilo Pro — Faceted filtering & sorting (collection pages)
   Progressive enhancement over the GET form in snippets/facets.liquid:
   - input/sort changes -> fetch section via Section Rendering API
   - replaces #ProductGridContainer content + history.pushState
   - handles popstate, AJAX pagination, chip removal, loading overlay
   - collapses long filter option lists behind "show more"
   - also powers the collapsible collection description in the banner
   ========================================================= */
(function () {
  'use strict';

  if (window.ShiloFacetsInit) return;
  window.ShiloFacetsInit = true;

  var CONTAINER_ID = 'ProductGridContainer';
  var FORM_ID = 'FacetFiltersForm';
  var DRAWER_ID = 'FacetsDrawer';
  var DESKTOP = '(min-width: 990px)';

  var abortController = null;
  var lastQuery = null;

  /* Which long option lists the shopper has expanded, keyed by filter param.
     Survives the AJAX re-renders that rebuild the sidebar from scratch. */
  var expandedLists = Object.create(null);

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  function getSectionId() {
    var container = getContainer();
    return container ? container.getAttribute('data-section-id') : null;
  }

  /* ---------- Serialize the facets form ---------- */
  function buildParams() {
    var form = document.getElementById(FORM_ID);
    var params = new URLSearchParams();

    if (form) {
      var formData = new FormData(form);
      formData.forEach(function (value, key) {
        if (String(value).trim() !== '') params.append(key, value);
      });
    } else {
      // No facets form (filtering disabled) — keep current params, update sort.
      new URLSearchParams(window.location.search).forEach(function (value, key) {
        if (key !== 'page' && key !== 'section_id' && key !== 'sort_by') params.append(key, value);
      });
      var sortSelect = document.querySelector('[data-sort-select]');
      if (sortSelect) params.set('sort_by', sortSelect.value);
    }
    return params;
  }

  /* ---------- Fetch + swap ---------- */
  function renderPage(searchParams, options) {
    options = options || {};
    var container = getContainer();
    var sectionId = getSectionId();
    if (!container || !sectionId) return;

    var queryString = searchParams.toString();
    if (!options.force && queryString === lastQuery) return;
    lastQuery = queryString;

    if (abortController) abortController.abort();
    abortController = new AbortController();

    container.classList.add('is-loading');

    var fetchParams = new URLSearchParams(searchParams);
    fetchParams.set('section_id', sectionId);
    var fetchUrl = window.location.pathname + '?' + fetchParams.toString();

    fetch(fetchUrl, { signal: abortController.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (html) {
        updateDom(html);
        if (options.updateHistory !== false) {
          var newUrl = queryString
            ? window.location.pathname + '?' + queryString
            : window.location.pathname;
          history.pushState({ facets: queryString }, '', newUrl);
        }
        if (options.scrollTop) {
          var target = getContainer();
          if (target) {
            var top = target.getBoundingClientRect().top + window.scrollY - 90;
            window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
          }
        }
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return;
        var c = getContainer();
        if (c) c.classList.remove('is-loading');
        // Graceful fallback: full navigation.
        window.location.assign(
          queryString ? window.location.pathname + '?' + queryString : window.location.pathname
        );
      });
  }

  function updateDom(html) {
    var container = getContainer();
    if (!container) return;

    var doc = new DOMParser().parseFromString(html, 'text/html');
    var fresh = doc.getElementById(CONTAINER_ID);
    if (!fresh) {
      container.classList.remove('is-loading');
      return;
    }

    // Remember UI state that the server render would reset.
    var drawer = document.getElementById(DRAWER_ID);
    var drawerWasOpen = !!(drawer && drawer.classList.contains('is-open'));

    var openFacets = [];
    container.querySelectorAll('details[data-facet]').forEach(function (details) {
      if (details.open) openFacets.push(details.getAttribute('data-facet'));
    });
    var hadFacets = container.querySelector('details[data-facet]') !== null;

    var active = document.activeElement;
    var focusMemo = null;
    if (active && container.contains(active)) {
      focusMemo = {
        id: active.id || '',
        name: active.getAttribute('name') || '',
        value: active.value
      };
    }

    container.innerHTML = fresh.innerHTML;
    container.classList.remove('is-loading');

    // Restore accordion open/closed state exactly as the user left it.
    if (hadFacets) {
      container.querySelectorAll('details[data-facet]').forEach(function (details) {
        details.open = openFacets.indexOf(details.getAttribute('data-facet')) !== -1;
      });
    } else {
      openDesktopFacets(container);
    }

    initFacetLists(container);

    // Keep the filters drawer open across re-renders (mobile).
    if (drawerWasOpen) {
      var freshDrawer = document.getElementById(DRAWER_ID);
      if (freshDrawer) {
        freshDrawer.style.transition = 'none';
        freshDrawer.classList.add('is-open');
        freshDrawer.setAttribute('aria-hidden', 'false');
        void freshDrawer.offsetWidth;
        freshDrawer.style.transition = '';
        if (window.ShiloDrawers) window.ShiloDrawers.activeDrawer = freshDrawer;
        if (window.trapFocus) window.trapFocus(freshDrawer);
      }
    }

    // Restore focus to the control the user was interacting with.
    if (focusMemo) {
      var target = null;
      if (focusMemo.id) {
        target = container.querySelector('#' + CSS.escape(focusMemo.id));
      }
      if (!target && focusMemo.name) {
        var candidates = container.querySelectorAll('[name="' + CSS.escape(focusMemo.name) + '"]');
        candidates.forEach(function (el) {
          if (!target && el.value === focusMemo.value) target = el;
        });
        if (!target && candidates.length) target = candidates[0];
      }
      if (target) target.focus({ preventScroll: true });
    }

    // Reveal-on-scroll elements arrive without the observer — show them.
    container.querySelectorAll('.reveal:not(.reveal--visible)').forEach(function (el) {
      el.classList.add('reveal--visible');
    });

    announceResults(container);
  }

  /* The result count lives inside the swapped markup, so its own role="status"
     never fires on an AJAX update. Mirror it into a live region that persists. */
  function announceResults(container) {
    var count = container.querySelector('.collection-toolbar__count');
    if (!count) return;

    var region = document.getElementById('FacetsStatus');
    if (!region) {
      region = document.createElement('p');
      region.id = 'FacetsStatus';
      region.className = 'visually-hidden';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    var text = count.textContent.trim();
    if (text && text !== region.textContent) region.textContent = text;
  }

  /* ---------- Event wiring (delegated — content gets replaced) ---------- */
  var debouncedPriceUpdate = window.debounce
    ? window.debounce(function () { renderPage(buildParams()); }, 500)
    : function () { renderPage(buildParams()); };

  document.addEventListener('change', function (event) {
    var el = event.target;
    if (!el) return;

    var form = document.getElementById(FORM_ID);
    var belongsToForm = !!(form && el.form && el.form.id === FORM_ID);

    if (belongsToForm || el.matches('[data-sort-select]')) {
      renderPage(buildParams());
    }
  });

  document.addEventListener('input', function (event) {
    if (event.target && event.target.matches && event.target.matches('[data-price-input]')) {
      debouncedPriceUpdate();
    }
  });

  document.addEventListener('submit', function (event) {
    if (event.target && event.target.id === FORM_ID) {
      event.preventDefault();
      renderPage(buildParams());
      if (window.ShiloDrawers && window.ShiloDrawers.activeDrawer) {
        window.ShiloDrawers.close();
      }
    }
  });

  document.addEventListener('click', function (event) {
    var link = event.target.closest
      ? event.target.closest('[data-facet-remove], [data-facets-clear], .pagination a')
      : null;
    if (!link || !link.href) return;

    var container = getContainer();
    if (!container || !container.contains(link)) return;

    var url;
    try {
      url = new URL(link.href, window.location.origin);
    } catch (e) {
      return;
    }
    if (url.pathname !== window.location.pathname) return; // let the browser navigate

    event.preventDefault();
    var params = url.searchParams;
    params.delete('section_id');
    renderPage(params, { scrollTop: link.matches('.pagination a') });
  });

  window.addEventListener('popstate', function () {
    var params = new URLSearchParams(window.location.search);
    params.delete('section_id');
    renderPage(params, { updateHistory: false, force: true });
  });

  /* ---------- Desktop: open all facet groups ---------- */
  function openDesktopFacets(scope) {
    if (!window.matchMedia(DESKTOP).matches) return;
    (scope || document).querySelectorAll('details[data-facet][data-open-desktop]').forEach(function (details) {
      details.open = true;
    });
  }

  /* ---------- Long option lists: collapse past the first N ----------
     The server renders every option, so a no-JS shopper sees the full list and
     never meets a dead "show more" button. Here we fold the tail away and turn
     the button on. */
  function initFacetLists(scope) {
    (scope || document).querySelectorAll('[data-facet-list]').forEach(function (list) {
      if (list.dataset.listInit === 'true') return;
      list.dataset.listInit = 'true';

      var limit = parseInt(list.getAttribute('data-facet-limit'), 10) || 10;
      var rows = Array.prototype.slice.call(list.querySelectorAll('[data-facet-row]'));
      var toggle = list.parentNode
        ? list.parentNode.querySelector('[data-facet-more]')
        : null;

      if (rows.length <= limit) {
        if (toggle) toggle.remove();
        return;
      }

      var key = list.getAttribute('data-facet-key') || '';
      var expanded =
        list.hasAttribute('data-force-expanded') || expandedLists[key] === true;

      function apply() {
        list.classList.toggle('is-truncated', !expanded);
        for (var i = limit; i < rows.length; i++) rows[i].hidden = !expanded;
        if (!toggle) return;
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        var more = toggle.querySelector('[data-more]');
        var less = toggle.querySelector('[data-less]');
        if (more) more.hidden = expanded;
        if (less) less.hidden = !expanded;
      }

      if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener('click', function () {
          expanded = !expanded;
          expandedLists[key] = expanded;
          apply();
        });
      }

      apply();
    });
  }

  /* Sticky offsets are NOT measured here. section-header.js publishes the
     compressed header height as --sticky-header-height on :root, and that is
     exactly the value sticky collection UI needs (by the time anything is
     stuck, the page is scrolled and the header has collapsed). A previous
     version measured the header itself per scroll frame; at the top of the
     page that reads the EXPANDED header (~225px with a two-line nav row) and
     the sidebar's max-block-size arithmetic collapsed to nothing. */

  /* ---------- Collapsible collection description (banner) ---------- */
  function initCollapsibleDesc() {
    document.querySelectorAll('[data-collapsible-desc]').forEach(function (wrap) {
      if (wrap.dataset.collapsibleInit) return;
      wrap.dataset.collapsibleInit = 'true';

      var content = wrap.querySelector('[data-desc-content]');
      var toggle = wrap.querySelector('[data-desc-toggle]');
      if (!content || !toggle) return;

      // Collapse only when the description meaningfully overflows the clamp.
      if (content.scrollHeight <= 150) return;

      wrap.classList.add('is-collapsed');
      toggle.hidden = false;

      toggle.addEventListener('click', function () {
        var collapsed = wrap.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        var more = toggle.querySelector('[data-more]');
        var less = toggle.querySelector('[data-less]');
        if (more) more.hidden = !collapsed;
        if (less) less.hidden = collapsed;
      });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    var initial = new URLSearchParams(window.location.search);
    initial.delete('section_id');
    lastQuery = initial.toString();

    openDesktopFacets(document);
    initFacetLists(document);
    initCollapsibleDesc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', function () {
    openDesktopFacets(document);
    initFacetLists(document);
    initCollapsibleDesc();
  });
})();

/* ---------------------------------------------------------------------------
 * Price slider — draggable handles over the price track
 * -------------------------------------------------------------------------
 *
 * The two number inputs stay the source of truth. Dragging writes into them
 * and fires their `input` event, which the debounced handler above already
 * listens for — so the slider needs no render logic of its own.
 *
 * Everything is delegated from `document`, because the facets markup is
 * replaced wholesale on every AJAX re-render. A listener bound to a handle
 * would survive exactly one filter change.
 *
 * The direction handling is the part that matters on this store. The track
 * fills with `inset-inline-start`, so on an RTL page it grows from the right
 * and the low price sits on the right — which is what a Hebrew reader
 * expects. It also means a finger moving right must *lower* the value, so the
 * fraction is inverted whenever the computed direction is rtl. Hard-coding
 * left-to-right here would invert the whole control on the live site.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var DRAG = null;

  function sliderOf(el) {
    return el.closest ? el.closest('[data-price-slider]') : null;
  }

  function partsOf(slider) {
    return {
      max: parseFloat(slider.getAttribute('data-range-max')) || 0,
      track: slider.querySelector('.facet-price__track'),
      minHandle: slider.querySelector('[data-price-handle="min"]'),
      maxHandle: slider.querySelector('[data-price-handle="max"]'),
    };
  }

  /*
   * השדות נלקחים לפי סדר בתוך ה-facet ולא לפי id.
   *
   * ה-id נבנה בליקוויד מ-facet_id, שהוא ייחודי לכל מסנן ולא ידוע כאן. סדר
   * שני השדות בתוך .facet-price קבוע במבנה — מ' ואז עד — ולכן הוא המפתח
   * היציב היחיד בלי לשכפל את לוגיקת ה-id לצד הלקוח.
   */
  function inputs(slider) {
    var facet = slider.closest('.facet-price');
    var list = facet ? facet.querySelectorAll('[data-price-input]') : [];
    return { min: list[0] || null, max: list[1] || null };
  }

  /** הערך הנוכחי של שדה, או קצה הטווח כשהוא ריק — placeholder אינו ערך */
  function valueOf(input, fallback) {
    if (!input) return fallback;
    var v = parseFloat(input.value);
    return isNaN(v) ? fallback : v;
  }

  function paint(slider, minV, maxV) {
    var p = partsOf(slider);
    if (!p.max) return;
    var a = Math.max(0, Math.min(100, (minV / p.max) * 100));
    var b = Math.max(0, Math.min(100, (maxV / p.max) * 100));
    if (p.track) {
      p.track.style.setProperty('--range-start', a + '%');
      p.track.style.setProperty('--range-span', Math.max(0, b - a) + '%');
    }
    if (p.minHandle) {
      p.minHandle.style.setProperty('--handle-at', a + '%');
      p.minHandle.setAttribute('aria-valuenow', String(Math.round(minV)));
    }
    if (p.maxHandle) {
      p.maxHandle.style.setProperty('--handle-at', b + '%');
      p.maxHandle.setAttribute('aria-valuenow', String(Math.round(maxV)));
    }
  }

  /**
   * מיקום המצביע כשבר על הציר, עם היפוך ב-RTL.
   *
   * הכיוון נקרא מ-getComputedStyle ולא מבדיקה של dir על html: הוא יכול
   * להיות מוגדר על אב כלשהו, וזה מה שהדפדפן באמת מיישם.
   */
  function fractionAt(track, clientX) {
    var rect = track.getBoundingClientRect();
    if (!rect.width) return 0;
    var f = (clientX - rect.left) / rect.width;
    if (getComputedStyle(track).direction === 'rtl') f = 1 - f;
    return Math.max(0, Math.min(1, f));
  }

  /**
   * מעדכן שדה ומודיע עליו, כדי שהרענון המושהה הקיים יתפוס.
   *
   * ערך שנמצא על קצה הטווח נכתב כשדה **ריק** ולא כמספר. גרירה עד הסוף היא
   * "בלי הגבלה", ולכתוב 0 במינימום או 9000 במקסימום פירושו לשלוח פרמטר
   * סינון שאינו מסנן דבר: הכתובת מקבלת filter.v.price.gte=0, החנות מציגה
   * צ'יפ של מסנן פעיל, ו"נקה סינון" מופיע בלי שהמשתמש סינן משהו.
   */
  function commit(input, value, boundary) {
    if (!input) return;
    var atBoundary = boundary != null && Math.round(value) === Math.round(boundary);
    var next = atBoundary ? '' : String(Math.round(value));
    if (input.value === next) return;
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('pointerdown', function (event) {
    var handle = event.target.closest ? event.target.closest('[data-price-handle]') : null;
    var slider = handle ? sliderOf(handle) : sliderOf(event.target);
    if (!slider) return;
    var p = partsOf(slider);
    if (!p.max || !p.track) return;

    /*
     * נגיעה בפס עצמו, ולא בידית, מקרבת אליה את הידית הסמוכה וממשיכה משם
     * לגרירה.
     *
     * בלי זה הפס נראה אינטראקטיבי ואינו כזה: הידיות הן 22 פיקסלים על רקע
     * של פס לרוחב כל המסנן, ומשתמש מקיש על הפס במקום שהוא רוצה. סליידר
     * שמתעלם מהקשה כזאת נחשב שבור, לא מוגבל.
     */
    if (!handle) {
      var io0 = inputs(slider);
      var minNow = valueOf(io0.min, 0);
      var maxNow = valueOf(io0.max, p.max);
      var at = fractionAt(p.track, event.clientX) * p.max;
      var nearMin = Math.abs(at - minNow) <= Math.abs(at - maxNow);
      handle = nearMin ? p.minHandle : p.maxHandle;
      if (!handle) return;
      if (nearMin) commit(io0.min, Math.min(at, maxNow), 0);
      else commit(io0.max, Math.max(at, minNow), p.max);
      paint(slider, nearMin ? Math.min(at, maxNow) : minNow, nearMin ? maxNow : Math.max(at, minNow));
      /* הפוקוס עובר לידית כדי שחצי המקלדת ימשיכו מאותה נקודה */
      if (handle.focus) handle.focus();
    }

    event.preventDefault();
    /*
     * `engaged` מבחין בין גרירה לגלילת עמוד.
     *
     * הרצועה שמאזינה לנגיעה היא 44 פיקסלים בגובה, ועל הידיות יש
     * touch-action: none אבל על המעטפת pan-y — כדי שאפשר יהיה לגלול את
     * העמוד באצבע שמתחילה שם. בלי הסף הזה אותה תנועה אנכית גם גוללת וגם
     * מזיזה את המחיר, ומשתמש שגלל את הרשימה מגלה שסינן בטעות.
     *
     * נגיעה על ידית נחשבת מכוונת ומתחילה גרירה מיד; נגיעה על הפס ממתינה
     * לתנועה שהיא בעיקר אופקית.
     */
    var onHandle = event.target.closest && event.target.closest('[data-price-handle]');
    DRAG = {
      handle: handle,
      slider: slider,
      which: handle.getAttribute('data-price-handle'),
      startX: event.clientX,
      startY: event.clientY,
      engaged: !!onHandle,
    };
    handle.setAttribute('data-dragging', '');
    /*
     * לוכדים את המצביע כדי שהגרירה תמשיך גם כשהאצבע יוצאת מהידית — בלעדיו
     * כל תנועה מהירה מפילה את הגרירה אחרי כמה פיקסלים.
     */
    if (handle.setPointerCapture) {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (e) {
        /* לא קריטי, הגרירה עדיין עובדת דרך המאזין על document */
      }
    }
  });

  var ENGAGE_PX = 6;

  document.addEventListener('pointermove', function (event) {
    if (!DRAG) return;

    /* ראו ההערה ב-pointerdown: תנועה אנכית היא גלילה, ומבטלת את הגרירה */
    if (!DRAG.engaged) {
      var dx = Math.abs(event.clientX - DRAG.startX);
      var dy = Math.abs(event.clientY - DRAG.startY);
      if (dy > dx && dy > ENGAGE_PX) { endDrag(); return; }
      if (dx > ENGAGE_PX) DRAG.engaged = true;
      else return;
    }

    var p = partsOf(DRAG.slider);
    var io = inputs(DRAG.slider);
    if (!p.max || !p.track) return;

    var value = fractionAt(p.track, event.clientX) * p.max;
    var minV = valueOf(io.min, 0);
    var maxV = valueOf(io.max, p.max);

    /*
     * הידיות לא עוברות זו את זו. בלי זה מתקבל טווח הפוך, והשרת מחזיר אפס
     * מוצרים על משהו שנראה למשתמש כמו בחירה סבירה לגמרי.
     */
    if (DRAG.which === 'min') minV = Math.min(value, maxV);
    else maxV = Math.max(value, minV);

    paint(DRAG.slider, minV, maxV);
    commit(io.min, minV, 0);
    commit(io.max, maxV, p.max);
  });

  function endDrag() {
    if (!DRAG) return;
    DRAG.handle.removeAttribute('data-dragging');
    DRAG = null;
  }
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* מקלדת — סליידר בלי חצים אינו נגיש, ו-role="slider" מבטיח שיחפשו אותם */
  document.addEventListener('keydown', function (event) {
    var handle = event.target.closest ? event.target.closest('[data-price-handle]') : null;
    if (!handle) return;
    var slider = sliderOf(handle);
    if (!slider) return;
    var p = partsOf(slider);
    var io = inputs(slider);
    if (!p.max) return;

    var step = event.shiftKey ? p.max / 10 : Math.max(1, p.max / 100);
    var dir = 0;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') dir = 1;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') dir = -1;
    else if (event.key === 'Home') dir = 'min';
    else if (event.key === 'End') dir = 'max';
    else return;

    /* בעברית חץ ימינה מקטין, בדיוק כמו שהאצבע זזה */
    if (typeof dir === 'number' && getComputedStyle(slider).direction === 'rtl') dir = -dir;

    var minV = valueOf(io.min, 0);
    var maxV = valueOf(io.max, p.max);
    var which = handle.getAttribute('data-price-handle');

    if (dir === 'min') {
      if (which === 'min') minV = 0;
      else maxV = minV;
    } else if (dir === 'max') {
      if (which === 'min') minV = maxV;
      else maxV = p.max;
    } else if (which === 'min') {
      minV = Math.max(0, Math.min(minV + dir * step, maxV));
    } else {
      maxV = Math.min(p.max, Math.max(maxV + dir * step, minV));
    }

    event.preventDefault();
    paint(slider, minV, maxV);
    commit(io.min, minV, 0);
    commit(io.max, maxV, p.max);
  });

  /* הקלדה בשדות מזיזה את הידיות, אחרת הפס והמספרים מציגים דברים שונים */
  document.addEventListener('input', function (event) {
    if (!event.target.matches || !event.target.matches('[data-price-input]')) return;
    if (DRAG) return;
    var facet = event.target.closest('.facet-price');
    var slider = facet ? facet.querySelector('[data-price-slider]') : null;
    if (!slider) return;
    var p = partsOf(slider);
    var io = inputs(slider);
    paint(slider, valueOf(io.min, 0), valueOf(io.max, p.max));
  });
})();
