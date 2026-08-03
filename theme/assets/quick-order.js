/* =========================================================
   Quick order by catalogue number (SKU / barcode)
   Resolves each SKU through the JSON search view
   (templates/search.quick-order.liquid) and adds every resolved
   line to the cart through window.ShiloCart.
   ========================================================= */
(function () {
  'use strict';

  var DEBOUNCE = 320;
  var MAX_ROWS = 40;
  /* Paste used to fire one fetch per line in a forEach — up to 40 simultaneous
     uncached /search requests, exactly the burst Shopify's per-IP storefront
     throttle answers with 429/430. Those responses were folded into "no results"
     and the rows were labelled "מקט לא נמצא בקטלוג", so a contractor pasting a
     40-line order was told the store does not carry items that are in stock.
     Drain the list through a small pool instead. */
  var MAX_IN_FLIGHT = 4;

  function formatMoney(cents) {
    /* One implementation, in global.js. This file used to carry a copy kept in
       step by comment; both were wrong for six of Shopify's eight money formats.
       global.js ships from the layout <head>, so it has always run first. */
    if (typeof window.formatMoney === 'function') return window.formatMoney(cents);
    return '₪' + (cents / 100).toFixed(2);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function QuickOrder(root) {
    this.root = root;
    this.rowsHost = root.querySelector('[data-quick-order-rows]');
    this.template = root.querySelector('[data-quick-order-row-template]');
    this.status = root.querySelector('[data-quick-order-status]');
    this.countEl = root.querySelector('[data-quick-order-count]');
    this.grandEl = root.querySelector('[data-quick-order-grand]');
    this.submitBtn = root.querySelector('[data-quick-order-submit]');
    this.emptySummary = this.countEl ? this.countEl.textContent : '';
    this.strings = this.readStrings();

    /* Bounded lookup pool + progress accounting for the paste path.
       runId invalidates work that belongs to rows this instance has since thrown
       away: parsePaste and clear() wipe rowsHost, but neither the in-flight
       lookups nor the per-row debounce timers know that, so a stray response
       counted towards the new paste's tally ("11 נמצאו" for a 10-line paste) and a
       late timer could push a detached row back into the pool and hold up
       finishBatch. */
    this.queue = [];
    this.inFlight = 0;
    this.batch = null;
    this.runId = 0;

    if (!this.rowsHost || !this.template) return;

    this.bind();
    this.addRow();
    this.addRow();
    this.addRow();
  }

  QuickOrder.prototype.readStrings = function () {
    var node = this.root.querySelector('[data-quick-order-strings]');
    if (!node) return {};
    try {
      return JSON.parse(node.textContent) || {};
    } catch (e) {
      return {};
    }
  };

  QuickOrder.prototype.bind = function () {
    var self = this;

    this.root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-quick-order-tab]');
      if (tab) { self.switchTab(tab.dataset.quickOrderTab); return; }

      if (event.target.closest('[data-quick-order-add-row]')) { self.addRow(true); return; }
      if (event.target.closest('[data-quick-order-parse]')) { self.parsePaste(); return; }
      if (event.target.closest('[data-quick-order-clear]')) { self.clear(); return; }
      if (event.target.closest('[data-quick-order-submit]')) { self.submit(); return; }
      var retry = event.target.closest('[data-quick-order-retry]');
      if (retry) {
        var retryRow = retry.closest('[data-quick-order-row]');
        if (retryRow) self.enqueue(retryRow);
        return;
      }

      var step = event.target.closest('[data-quick-order-step]');
      if (step) {
        var row = step.closest('[data-quick-order-row]');
        var input = row.querySelector('[data-quick-order-qty]');
        var next = (parseInt(input.value, 10) || 1) + parseInt(step.dataset.quickOrderStep, 10);
        input.value = Math.max(1, next);
        self.refreshRow(row);
        return;
      }

      var remove = event.target.closest('[data-quick-order-remove]');
      if (remove) {
        var target = remove.closest('[data-quick-order-row]');
        if (self.rowsHost.children.length > 1) target.remove();
        else self.resetRow(target);
        self.refreshTotals();
      }
    });

    this.rowsHost.addEventListener('input', function (event) {
      var row = event.target.closest('[data-quick-order-row]');
      if (!row) return;
      if (event.target.matches('[data-quick-order-sku]')) {
        /* Clear the whole resolved state, not just the ids. Only these two were
           reset here and the visible parts (the product name, the line total, the
           green is-resolved styling) were cleared later inside lookup() — which a
           shared debounce timer could stop from ever running. The row then looked
           resolved while carrying no variant id, so it was silently dropped from
           both the totals and the submitted order. */
        self.clearRowState(row);
        /* One timer per row. A single shared timer meant typing in row 2 within
           320ms cancelled row 1's pending lookup outright — a barcode scanner
           feeding rows faster than that dropped every line but the last. */
        if (!row._lookup) row._lookup = debounce(function () { self.enqueue(row); }, DEBOUNCE);
        row._lookup();
      }
      if (event.target.matches('[data-quick-order-qty]')) self.refreshRow(row);
    });

    this.rowsHost.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' || !event.target.matches('[data-quick-order-sku]')) return;
      event.preventDefault();
      var row = event.target.closest('[data-quick-order-row]');
      if (row === self.rowsHost.lastElementChild) self.addRow(true);
      else {
        var nextInput = row.nextElementSibling.querySelector('[data-quick-order-sku]');
        if (nextInput) nextInput.focus();
      }
    });
  };

  QuickOrder.prototype.switchTab = function (name) {
    this.root.querySelectorAll('[data-quick-order-tab]').forEach(function (tab) {
      var active = tab.dataset.quickOrderTab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.root.querySelectorAll('[data-quick-order-panel]').forEach(function (panel) {
      panel.hidden = panel.dataset.quickOrderPanel !== name;
    });
  };

  QuickOrder.prototype.addRow = function (focus) {
    if (this.rowsHost.children.length >= MAX_ROWS) return null;
    var frag = this.template.content.cloneNode(true);
    var row = frag.querySelector('[data-quick-order-row]');
    this.rowsHost.appendChild(frag);
    if (focus) {
      var input = row.querySelector('[data-quick-order-sku]');
      if (input) input.focus();
    }
    return row;
  };

  QuickOrder.prototype.clearRowState = function (row) {
    row.dataset.variantId = '';
    row.dataset.price = '';
    row.classList.remove('is-resolved', 'is-missing', 'is-loading', 'is-failed', 'is-quote');
    var match = row.querySelector('[data-quick-order-match]');
    if (match) match.textContent = '';
    var total = row.querySelector('[data-quick-order-line-total]');
    if (total) total.textContent = '';
  };

  QuickOrder.prototype.resetRow = function (row) {
    row.querySelector('[data-quick-order-sku]').value = '';
    row.querySelector('[data-quick-order-qty]').value = 1;
    this.clearRowState(row);
  };

  /* ---------- Bounded lookup queue ---------- */

  QuickOrder.prototype.enqueue = function (row) {
    /* A row that is no longer in the list cannot be resolved and must not occupy a
       slot or a tally. */
    if (!this.rowsHost.contains(row)) return;
    var term = (row.querySelector('[data-quick-order-sku]').value || '').trim();
    this.clearRowState(row);
    if (!term) { this.refreshTotals(); return; }

    row.classList.add('is-loading');
    var match = row.querySelector('[data-quick-order-match]');
    if (match) {
      match.textContent = '';
      var spinnerWrap = el('span', 'quick-order__match-loading');
      var spinner = el('span', 'spinner');
      spinner.setAttribute('aria-hidden', 'true');
      spinnerWrap.appendChild(spinner);
      match.appendChild(spinnerWrap);
    }

    this.queue.push({ row: row, term: term, runId: this.runId });
    this.drain();
  };

  QuickOrder.prototype.drain = function () {
    var self = this;
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      var job = this.queue.shift();
      this.inFlight += 1;
      this.lookup(job.row, job.term, job.runId).then(function () {
        self.inFlight -= 1;
        self.drain();
        if (!self.inFlight && !self.queue.length) self.finishBatch();
      });
    }
  };

  QuickOrder.prototype.lookup = function (row, term, runId) {
    var self = this;
    var url = '/search?type=product&view=quick-order&q=' + encodeURIComponent(term);

    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        row.classList.remove('is-loading');
        /* The row may have been thrown away, or its SKU retyped, while this request
           was in flight. Either way the response is stale and must not be rendered
           or counted. */
        if (!self.isCurrent(row, runId)) return;
        var current = (row.querySelector('[data-quick-order-sku]').value || '').trim();
        if (current !== term) return;

        var results = (data && data.results) || [];
        var exact = results.filter(function (r) { return r.exact; });
        var hit = exact[0] || null;

        if (hit) { self.applyMatch(row, hit); self.tally('found'); return; }
        if (results.length) { self.applySuggestions(row, results); self.tally('fuzzy'); return; }

        self.applyMissing(row, term);
        self.tally('missing');
      })
      .catch(function () {
        row.classList.remove('is-loading');
        if (!self.isCurrent(row, runId)) return;
        /* A throttled or dropped request is NOT a missing catalogue number.
           Collapsing the two told buyers the store does not stock items it does. */
        self.applyFailed(row);
        self.tally('failed');
      });
  };

  /** Is this response still about a row this instance cares about? */
  QuickOrder.prototype.isCurrent = function (row, runId) {
    if (runId !== this.runId) return false;
    return this.rowsHost.contains(row);
  };

  /* ---------- Row states ---------- */

  QuickOrder.prototype.applyMissing = function (row, term) {
    var match = row.querySelector('[data-quick-order-match]');
    row.classList.add('is-missing');
    row.dataset.variantId = '';
    row.dataset.price = '';
    if (match) {
      match.textContent = '';
      var wrap = el('span', 'quick-order__miss');
      wrap.appendChild(el('span', 'quick-order__miss-title', this.strings.notFound || 'מקט לא נמצא בקטלוג'));
      var link = el('a', 'link fs-xs', this.strings.freeSearch || 'חיפוש חופשי');
      link.href = '/search?q=' + encodeURIComponent(term);
      wrap.appendChild(link);
      match.appendChild(wrap);
    }
    this.refreshTotals();
  };

  QuickOrder.prototype.applyFailed = function (row) {
    var match = row.querySelector('[data-quick-order-match]');
    row.classList.add('is-failed');
    row.dataset.variantId = '';
    row.dataset.price = '';
    if (match) {
      match.textContent = '';
      var wrap = el('span', 'quick-order__miss');
      wrap.appendChild(el('span', 'quick-order__miss-title', this.strings.lookupFailed || 'הבדיקה נכשלה'));
      var retry = el('button', 'link fs-xs', this.strings.retry || 'נסו שוב');
      retry.type = 'button';
      retry.setAttribute('data-quick-order-retry', '');
      wrap.appendChild(retry);
      match.appendChild(wrap);
    }
    this.refreshTotals();
  };

  /* Built with DOM APIs, not by concatenating an HTML string. hit.title and
     hit.variant_title are product titles and variant option values straight out
     of the admin (search.quick-order.liquid emits them through `| json`, which
     makes them valid JSON, not HTML-safe), and they used to be interpolated into
     matchCell.innerHTML. A title carrying markup — one bad ERP/CSV import into a
     ~1,900-SKU catalogue is enough — executed in the session of whichever trade
     account looked that SKU up. textContent cannot do that. */
  QuickOrder.prototype.applyMatch = function (row, hit) {
    var match = row.querySelector('[data-quick-order-match]');
    var price = Number(hit.price);
    /* A ₪0 item is quoted by phone, never sold — the rule the product page and
       the collection cards both enforce. This route round the back was the one
       contractors are actually pointed at. */
    var quoteOnly = !Number.isFinite(price) || price === 0;

    if (match) {
      match.textContent = '';

      if (hit.image) {
        var thumb = el('span', 'quick-order__thumb');
        var img = document.createElement('img');
        img.src = hit.image;
        img.alt = '';
        img.width = 44;
        img.height = 44;
        img.loading = 'lazy';
        thumb.appendChild(img);
        match.appendChild(thumb);
      } else {
        var empty = el('span', 'quick-order__thumb quick-order__thumb--empty');
        empty.setAttribute('aria-hidden', 'true');
        match.appendChild(empty);
      }

      var text = el('span', 'quick-order__match-text');
      var title = el('a', 'quick-order__match-title', hit.title || '');
      title.href = hit.url || '#';
      text.appendChild(title);

      if (hit.variant_title && hit.variant_title !== 'Default Title') {
        text.appendChild(el('span', 'quick-order__match-variant', hit.variant_title));
      }

      if (quoteOnly) {
        text.appendChild(el('span', 'stock-dot stock-dot--out', this.strings.callForPrice || 'מחיר בטלפון'));
      } else if (hit.available) {
        text.appendChild(el('span', 'stock-dot', this.strings.inStock || 'במלאי'));
      } else {
        text.appendChild(el('span', 'stock-dot stock-dot--out', this.strings.soldOut || 'אזל מהמלאי'));
      }

      match.appendChild(text);
    }

    var buyable = hit.available && !quoteOnly;
    row.dataset.variantId = buyable ? String(hit.variant_id) : '';
    row.dataset.price = quoteOnly ? '' : String(price);
    row.classList.toggle('is-resolved', !!buyable);
    row.classList.toggle('is-missing', !buyable);
    row.classList.toggle('is-quote', quoteOnly);
    this.refreshRow(row);
  };

  QuickOrder.prototype.applySuggestions = function (row, results) {
    var match = row.querySelector('[data-quick-order-match]');
    if (!match) return;
    var self = this;

    match.textContent = '';
    var wrap = el('span', 'quick-order__suggest');
    wrap.appendChild(el('span', 'text-meta', this.strings.noExactMatch || 'אין התאמה מדויקת - התכוונתם ל:'));
    var list = el('span', 'quick-order__suggest-list');

    results.slice(0, 4).forEach(function (r) {
      var label = r.title || '';
      if (r.variant_title && r.variant_title !== 'Default Title') label += ' · ' + r.variant_title;
      /* The hit rides on the element, not through a JSON-in-an-attribute round
         trip that had to be quote-escaped by hand. */
      var chip = el('button', 'chip chip--suggestion', label);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        var skuInput = row.querySelector('[data-quick-order-sku]');
        if (r.sku) skuInput.value = r.sku;
        self.applyMatch(row, r);
      });
      list.appendChild(chip);
    });

    wrap.appendChild(list);
    match.appendChild(wrap);
    this.refreshTotals();
  };

  QuickOrder.prototype.refreshRow = function (row) {
    var price = parseInt(row.dataset.price, 10);
    var qty = parseInt(row.querySelector('[data-quick-order-qty]').value, 10) || 1;
    var cell = row.querySelector('[data-quick-order-line-total]');
    if (row.dataset.variantId && !isNaN(price)) cell.textContent = formatMoney(price * qty);
    else cell.textContent = '';
    this.refreshTotals();
  };

  QuickOrder.prototype.resolvedRows = function () {
    return Array.prototype.filter.call(this.rowsHost.children, function (row) {
      return !!row.dataset.variantId;
    });
  };

  QuickOrder.prototype.refreshTotals = function () {
    var rows = this.resolvedRows();
    var items = 0;
    var total = 0;

    rows.forEach(function (row) {
      var qty = parseInt(row.querySelector('[data-quick-order-qty]').value, 10) || 1;
      var price = parseInt(row.dataset.price, 10) || 0;
      items += qty;
      total += price * qty;
    });

    if (this.countEl) {
      this.countEl.textContent = rows.length
        ? rows.length + ' ' + (this.strings.skusWord || 'מקטים') + ' · ' + items + ' ' + (this.strings.unitsWord || 'יחידות')
        : this.emptySummary;
    }
    if (this.grandEl) this.grandEl.textContent = rows.length ? formatMoney(total) : '';
    if (this.submitBtn) this.submitBtn.disabled = rows.length === 0;
  };

  /* ---------- Paste ---------- */

  QuickOrder.prototype.tally = function (outcome) {
    if (!this.batch) return;
    this.batch[outcome] = (this.batch[outcome] || 0) + 1;
  };

  /* The status line used to end at "עובד על N שורות…" and stay there forever:
     refreshTotals never touches it, so there was no signal that the run had
     finished or that any row had failed. */
  QuickOrder.prototype.finishBatch = function () {
    if (!this.batch) return;
    var b = this.batch;
    this.batch = null;

    var found = (b.found || 0) + (b.fuzzy || 0);
    var parts = [];
    parts.push((this.strings.batchFound || '[n] נמצאו').replace('[n]', found));
    if (b.missing) parts.push((this.strings.batchMissing || '[n] לא נמצאו').replace('[n]', b.missing));
    if (b.failed) parts.push((this.strings.batchFailed || '[n] נכשלו - נסו שוב').replace('[n]', b.failed));

    this.setStatus(parts.join(' · '), b.failed ? 'error' : 'success');
  };

  QuickOrder.prototype.parsePaste = function () {
    var textarea = this.root.querySelector('[data-quick-order-paste]');
    if (!textarea) return;

    var lines = (textarea.value || '')
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(Boolean);

    if (!lines.length) {
      this.setStatus(this.strings.pasteEmpty || 'הדביקו רשימת מקטים ואז לחצו על "אתרו את המוצרים".', 'error');
      return;
    }

    this.rowsHost.innerHTML = '';
    this.queue.length = 0;
    this.runId += 1;
    this.batch = { found: 0, fuzzy: 0, missing: 0, failed: 0 };

    var self = this;
    var added = 0;

    lines.slice(0, MAX_ROWS).forEach(function (line) {
      var parts = line.split(/[\s,;\t]+/).filter(Boolean);
      var sku = parts[0];
      var qty = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : 1;
      if (isNaN(qty) || qty < 1) qty = 1;

      var row = self.addRow();
      if (!row) return;
      row.querySelector('[data-quick-order-sku]').value = sku;
      row.querySelector('[data-quick-order-qty]').value = qty;
      self.enqueue(row);
      added += 1;
    });

    var skipped = lines.length - added;
    this.switchTab('rows');
    var working = (this.strings.working || 'עובד על [n] שורות…').replace('[n]', added);
    if (skipped > 0) {
      working += ' ' + (this.strings.skipped || '([n] שורות מעל המקסימום דולגו)').replace('[n]', skipped);
    }
    this.setStatus(working, 'info');
  };

  QuickOrder.prototype.clear = function () {
    this.rowsHost.innerHTML = '';
    this.queue.length = 0;
    this.runId += 1;
    this.batch = null;
    var paste = this.root.querySelector('[data-quick-order-paste]');
    if (paste) paste.value = '';
    this.addRow();
    this.addRow();
    this.addRow();
    this.setStatus('', '');
    this.refreshTotals();
  };

  QuickOrder.prototype.setStatus = function (message, kind) {
    if (!this.status) return;
    this.status.textContent = message || '';
    this.status.className = 'quick-order__status' + (kind ? ' quick-order__status--' + kind : '');
  };

  QuickOrder.prototype.submit = function () {
    var rows = this.resolvedRows();
    if (!rows.length) return;

    var items = rows.map(function (row) {
      return {
        id: parseInt(row.dataset.variantId, 10),
        quantity: parseInt(row.querySelector('[data-quick-order-qty]').value, 10) || 1
      };
    });

    var self = this;
    this.submitBtn.classList.add('btn--loading');
    this.submitBtn.disabled = true;

    function done() {
      self.submitBtn.classList.remove('btn--loading');
      self.submitBtn.disabled = false;
    }

    /* Go through ShiloCart.add, which asks for the cart sections in the same
       request and swaps them in. The private fetch this used to do sent
       `sections_url` without `sections`, so nothing came back to render: it then
       dispatched a `cart:refresh` event no code in the theme listens for and
       opened the drawer, which was still the page-load snapshot. A contractor who
       pasted 30 catalogue numbers got "30 מקטים נוספו לעגלה בהצלחה" over an empty
       cart drawer and a bubble reading 0 — and either abandoned or submitted
       again and doubled every line. */
    if (window.ShiloCart && typeof window.ShiloCart.add === 'function') {
      window.ShiloCart.add(items, true)
        .then(function () {
          done();
          self.setStatus(
            (self.strings.addedToCart || '[n] מקטים נוספו לעגלה בהצלחה.').replace('[n]', items.length),
            'success'
          );
          if (!window.themeSettings || window.themeSettings.cartType !== 'drawer') {
            window.location.href = (window.routes && window.routes.cart_url) || '/cart';
          }
        })
        .catch(function (err) {
          done();
          self.setStatus(
            (window.cartErrorText && window.cartErrorText(err)) ||
              self.strings.addFailed ||
              'לא הצלחנו להוסיף את הפריטים. נסו שוב.',
            'error'
          );
        });
      return;
    }

    /* global.js absent (it never is — the layout loads it first) — fall back to a
       plain navigation so the order is not lost. */
    done();
    window.location.href = (window.routes && window.routes.cart_url) || '/cart';
  };

  function init() {
    document.querySelectorAll('[data-quick-order]').forEach(function (root) {
      if (root.dataset.quickOrderReady) return;
      root.dataset.quickOrderReady = '1';
      new QuickOrder(root);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('shopify:section:load', init);
})();
