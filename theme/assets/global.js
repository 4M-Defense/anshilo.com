/* =========================================================
   Shilo Pro — Global JS
   Cart API, drawers, toasts, quantity inputs, reveal, menus
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Utilities ---------- */
  window.debounce = function (fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  /* Mirrors Liquid's `| money`, because the same price is rendered by Liquid on
     load and by JS on every variant change — hardcoding '₪' + 0-2 decimals made
     the two disagree. layout/theme.liquid already passes shop.money_format in;
     the tag strip is there because a merchant's format can carry markup
     (`<span class=money>…</span>`) and callers insert this into textContent.

     This is the single implementation in the theme: assets/quick-order.js used to
     carry a copy, and the two were kept in step by comment. They are not any
     more — quick-order.js calls this one.

     Each of Shopify's six placeholders names its own grouping AND decimal
     symbol, so the mapping has to be explicit. An earlier version read the name
     only to decide whether decimals were wanted and then always formatted with
     toLocaleString('he-IL'), which yields comma grouping and a period decimal.
     That is right for {{amount}} and {{amount_no_decimals}} and wrong for the
     other four: a shop on {{amount_with_comma_separator}} rendered ₪1.134,65
     from Liquid and ₪1,134.65 from JS on the same screen, and on the
     no-decimals comma format 1.135 became 1,135 — which reads as a thousand
     times the price. */
  const MONEY_FORMATS = {
    amount: { group: ',', decimal: '.', decimals: 2 },
    amount_no_decimals: { group: ',', decimal: '', decimals: 0 },
    amount_with_comma_separator: { group: '.', decimal: ',', decimals: 2 },
    amount_no_decimals_with_comma_separator: { group: '.', decimal: '', decimals: 0 },
    amount_with_apostrophe_separator: { group: "'", decimal: '.', decimals: 2 },
    amount_with_period_and_space_separator: { group: ' ', decimal: '.', decimals: 2 }
  };

  window.formatMoney = function (cents) {
    const format = (window.themeSettings && window.themeSettings.moneyFormat) || '₪{{amount}}';
    const match = format.match(/\{\{\s*(amount[a-z_]*)\s*\}\}/);
    const spec = (match && MONEY_FORMATS[match[1]]) || MONEY_FORMATS.amount;

    const value = Number(cents) || 0;
    const negative = value < 0;
    const units = Math.abs(value) / 100;
    const fixed = spec.decimals === 0 ? String(Math.round(units)) : units.toFixed(2);
    const parts = fixed.split('.');

    let amount = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, spec.group);
    if (spec.decimals > 0) amount += spec.decimal + parts[1];
    if (negative) amount = '-' + amount;

    /* If no placeholder matches at all, fall back to a formatted number instead
       of returning the raw format — a wrong separator is a blemish, echoing
       template syntax at the customer is a bug. */
    if (!match) return '₪' + amount;
    /* Strip markup last: a merchant format can carry a wrapper such as
       <span class=money>…</span>, and every caller writes this into textContent. */
    return format.replace(match[0], amount).replace(/<[^>]*>/g, '');
  };

  const trapFocusHandlers = {};
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  window.focusableIn = function (container) {
    return container ? Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE_SELECTOR)) : [];
  };

  /* The trapped container is held as state and its focusable list is recomputed
     on every Tab, rather than captured once at open time. Cart.afterChange
     replaces the cart drawer's entire innerHTML on each line change, so a list
     captured at open time pointed at detached nodes: the
     `activeElement === last` test could never be true again and the trap
     silently stopped trapping, letting Tab walk the page behind an
     aria-modal dialog. */
  let trapContainer = null;

  window.trapFocus = function (container) {
    if (!container) return;
    removeTrapFocus();
    trapContainer = container;

    trapFocusHandlers.keydown = function (e) {
      if (e.key !== 'Tab' || !trapContainer) return;
      const items = window.focusableIn(trapContainer);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      /* A re-render can leave focus on <body>. Pull it back in rather than
         letting the next Tab start at the top of the document. */
      if (!trapContainer.contains(document.activeElement)) {
        e.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocusHandlers.keydown);

    const initial = container.querySelector('[autofocus]') || window.focusableIn(container)[0];
    if (initial) initial.focus({ preventScroll: true });
  };

  window.removeTrapFocus = function () {
    trapContainer = null;
    if (trapFocusHandlers.keydown) {
      document.removeEventListener('keydown', trapFocusHandlers.keydown);
      trapFocusHandlers.keydown = null;
    }
  };

  /* ---------- Toast ---------- */
  window.ShiloToast = function (message, type = 'success', duration = 3200) {
    const region = document.querySelector('[data-toast-region]');
    if (!region) return;
    const toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  };

  /* ---------- Drawer / overlay controller ---------- */
  const Drawers = {
    activeDrawer: null,
    overlay: null,
    /* The element, not its id. Storing `opener.id || ''` never worked: not one of
       the theme's drawer triggers carries an id (the burger, the cart button and
       the collection filter button are all plain buttons), so the lookup resolved
       to getElementById('') === null and focus was dropped to <body> on every
       close — the next Tab restarted at the skip link. */
    lastOpener: null,

    ensureOverlay() {
      if (!this.overlay) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'overlay';
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);
      }
      return this.overlay;
    },

    /* #FacetsDrawer is one node with two presentations: a modal drawer on mobile
       and a static sidebar on desktop (assets/section-collection.css un-hides it
       there). It used to carry role="dialog" aria-modal="true" aria-hidden="true"
       straight from the Liquid, so on desktop the whole filter sidebar was
       missing from the accessibility tree while its checkboxes stayed focusable —
       on a ~1,900-SKU catalogue that blocks the primary way to find a product.
       The dialog semantics now belong to the open state and nothing else, and
       facets.js calls clearDialogState() after every AJAX swap re-injects the
       server markup. */
    applyDialogState(drawer) {
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-hidden', 'false');
    },

    clearDialogState(drawer) {
      if (!drawer || drawer === this.activeDrawer) return;
      drawer.removeAttribute('role');
      drawer.removeAttribute('aria-modal');
      drawer.removeAttribute('aria-hidden');
    },

    open(id, opener) {
      const drawer = document.getElementById(id);
      if (!drawer) return;
      if (this.activeDrawer && this.activeDrawer !== drawer) this.close(true);

      this.activeDrawer = drawer;
      if (opener) this.lastOpener = opener;
      drawer.classList.add('is-open');
      this.applyDialogState(drawer);
      this.ensureOverlay().classList.add('is-open');
      document.body.classList.add('scroll-locked');
      window.trapFocus(drawer);
      document.addEventListener('keydown', this.onKeydown);
      drawer.dispatchEvent(new CustomEvent('drawer:open', { bubbles: true }));
    },

    close(keepOverlay) {
      if (!this.activeDrawer) return;
      const drawer = this.activeDrawer;
      drawer.classList.remove('is-open');
      this.activeDrawer = null;
      this.clearDialogState(drawer);
      window.removeTrapFocus();
      document.removeEventListener('keydown', this.onKeydown);
      if (!keepOverlay) {
        if (this.overlay) this.overlay.classList.remove('is-open');
        document.body.classList.remove('scroll-locked');
      }
      /* An AJAX swap can replace the opener (the filters button lives inside the
         re-rendered grid container), so fall back to whatever now answers to the
         same [data-drawer-open] before giving up. */
      let opener = this.lastOpener;
      if (!opener || !document.contains(opener)) {
        opener = document.querySelector('[data-drawer-open="' + drawer.id + '"]');
      }
      if (opener) opener.focus({ preventScroll: true });
      this.lastOpener = null;
      drawer.dispatchEvent(new CustomEvent('drawer:close', { bubbles: true }));
    },

    onKeydown(e) {
      if (e.key === 'Escape') Drawers.close();
    }
  };

  window.ShiloDrawers = Drawers;

  document.addEventListener('click', (e) => {
    const openTrigger = e.target.closest('[data-drawer-open]');
    if (openTrigger) {
      e.preventDefault();
      Drawers.open(openTrigger.getAttribute('data-drawer-open'), openTrigger);
      return;
    }
    const closeTrigger = e.target.closest('[data-drawer-close]');
    if (closeTrigger) {
      e.preventDefault();
      Drawers.close();
    }
  });

  /* ---------- Cart errors ----------
     Shopify's Ajax Cart API answers in English — a 422 from /cart/add.js carries
     `message: "Cart Error"` and `description: "You can only add 3 of X to the
     cart."` — so the theme's own Hebrew strings have to win the precedence, not
     lose it. The one thing worth salvaging from the English text is the NUMBER in
     a quantity cap: cart.errors.quantity_error is the Hebrew sentence shipped for
     exactly that case (layout/theme.liquid publishes it as
     cartStrings.quantityError with a [quantity] placeholder) and nothing read it
     until now. 422 alone is not enough to identify the cap — a sold-out variant
     answers 422 too — so the text has to corroborate it. If Shopify ever
     localizes the body the regex stops matching and we fall back to the generic
     Hebrew sentence, which is the right way to fail. */
  function cartErrorMessage(data, status) {
    const strings = window.cartStrings || {};
    const description = data && typeof data.description === 'string' ? data.description : '';
    const capped = status === 422 && /can only add|only\s+\d+/i.test(description);
    const quantity = description.match(/(\d+)/);
    if (capped && quantity && strings.quantityError) {
      return strings.quantityError.replace('[quantity]', quantity[1]);
    }
    return strings.error || '';
  }

  /* Errors thrown from here are already Hebrew, and `cartMessage` marks them as
     such. A network failure produces a plain Error whose message is the browser's
     own English text ("Failed to fetch"), so callers must never toast
     `err.message` blind — they go through cartErrorText instead. */
  function cartError(message) {
    const err = new Error(message);
    err.cartMessage = message;
    return err;
  }

  window.cartErrorText = function (err) {
    return (err && err.cartMessage) || (window.cartStrings && window.cartStrings.error) || '';
  };

  /* ---------- Cart API ---------- */
  const Cart = {
    sectionsToRender() {
      const ids = [];
      document.querySelectorAll('[data-cart-section]').forEach((el) => {
        const id = el.getAttribute('data-cart-section');
        if (id && !ids.includes(id)) ids.push(id);
      });
      return ids;
    },

    async getState() {
      const res = await fetch(window.routes.cart_url + '.js');
      return res.json();
    },

    async add(items, openDrawer = true) {
      const body = {
        items: Array.isArray(items) ? items : [items],
        sections: this.sectionsToRender(),
        sections_url: window.location.pathname
      };
      const res = await fetch(window.routes.cart_add_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        throw cartError(cartErrorMessage(data, res.status));
      }
      await this.afterChange(data.sections);
      if (openDrawer && window.themeSettings.cartType === 'drawer') {
        Drawers.open('CartDrawer');
      }
      return data;
    },

    async change(line, quantity) {
      const res = await fetch(window.routes.cart_change_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          line,
          quantity,
          sections: this.sectionsToRender(),
          sections_url: window.location.pathname
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw cartError(cartErrorMessage(data, res.status));
      }
      await this.afterChange(data.sections);
      return data;
    },

    async updateNote(note) {
      await fetch(window.routes.cart_update_url + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ note })
      });
    },

    /* Re-render the cart from the server without mutating it. The failure paths
       below used to call afterChange() with no argument, and its whole re-render
       block is gated on that argument — so a rejected change updated the header
       bubble from the true cart while leaving the quantity the server refused, the
       old line total and the stale subtotal on screen. A shopper who typed 10
       against a stock cap of 3 saw "10" and a bubble saying 3, and went to
       checkout believing they had ordered 10. */
    async refresh() {
      const ids = this.sectionsToRender();
      if (!ids.length) return this.afterChange();
      try {
        const res = await fetch(
          window.location.pathname + '?sections=' + encodeURIComponent(ids.join(','))
        );
        if (!res.ok) return this.afterChange();
        return this.afterChange(await res.json());
      } catch (e) {
        return this.afterChange();
      }
    },

    async afterChange(sections) {
      if (sections) {
        /* The swap destroys whatever the shopper was on — inside an open drawer
           that means focus lands on <body> mid-interaction. Note it first. */
        const active = document.activeElement;
        const host = active && active.closest ? active.closest('[data-line]') : null;
        const memo = host
          ? {
              line: host.dataset.line || '',
              /* <cart-line-qty> and <cart-remove-button> both carry data-line, so
                 the host's tag name is what distinguishes the stepper from the
                 trash button on the same row. */
              host: host.tagName.toLowerCase(),
              inDrawer: !!(Drawers.activeDrawer && Drawers.activeDrawer.contains(active))
            }
          : null;

        Object.entries(sections).forEach(([id, html]) => {
          if (!html) return;
          document.querySelectorAll('[data-cart-section="' + id + '"]').forEach((el) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const replacement = doc.querySelector('[data-cart-section="' + id + '"]') || doc.body.firstElementChild;
            if (replacement) el.innerHTML = replacement.innerHTML;
          });
        });

        this.restoreFocus(memo);
      }
      const cart = await this.getState();
      this.updateBubbles(cart.item_count);
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));
      return cart;
    },

    /* Re-arm the focus trap on the swapped subtree and put focus back on the
       equivalent control, the way facets.js already does for the filters drawer. */
    restoreFocus(memo) {
      const drawer = Drawers.activeDrawer;
      if (drawer) window.trapFocus(drawer);
      if (!memo) return;

      const scope = drawer && memo.inDrawer ? drawer : document;
      if (!memo.line || !memo.host) return;
      const host = scope.querySelector(memo.host + '[data-line="' + memo.line + '"]');
      if (!host) return;
      const target = window.focusableIn(host)[0];
      if (target) target.focus({ preventScroll: true });
    },

    updateBubbles(count) {
      document.querySelectorAll('[data-cart-bubble]').forEach((bubble) => {
        bubble.textContent = count > 99 ? '99+' : count;
        bubble.classList.toggle('is-empty', count === 0);
        bubble.classList.remove('bump');
        void bubble.offsetWidth;
        bubble.classList.add('bump');
      });
    }
  };

  window.ShiloCart = Cart;

  /* ---------- <product-form> — AJAX add to cart ---------- */
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      connectedCallback() {
        this.form = this.querySelector('form');
        if (!this.form) return;
        this.submitBtn = this.form.querySelector('[type="submit"]');
        this.form.addEventListener('submit', this.onSubmit.bind(this));
      }

      async onSubmit(e) {
        e.preventDefault();
        if (!this.submitBtn || this.submitBtn.hasAttribute('aria-disabled')) return;
        /* aria-disabled only marks a sold-out variant, and .btn--loading is purely
           cosmetic (it makes the label transparent) — so the button stayed
           clickable for the whole round trip and an impatient second tap on
           mobile, or a click on the sticky bar's duplicate submit button, added
           the item twice. Guard the in-flight state explicitly. */
        if (this.loading) return;
        this.loading = true;

        this.submitBtn.classList.add('btn--loading');
        this.submitBtn.setAttribute('aria-busy', 'true');
        this.submitBtn.disabled = true;
        /* The sticky bar's button submits this same form from outside it. */
        const linked = this.form.id
          ? document.querySelectorAll('[type="submit"][form="' + this.form.id + '"]')
          : [];
        linked.forEach((btn) => {
          btn.disabled = true;
        });

        const formData = new FormData(this.form);
        const item = {
          id: parseInt(formData.get('id'), 10),
          quantity: parseInt(formData.get('quantity') || '1', 10)
        };
        const properties = {};
        for (const [key, value] of formData.entries()) {
          const match = key.match(/^properties\[(.+)\]$/);
          if (match && value) properties[match[1]] = value;
        }
        if (Object.keys(properties).length) item.properties = properties;

        try {
          await Cart.add(item, true);
          if (window.themeSettings.cartType !== 'drawer') {
            window.ShiloToast(window.cartStrings.added, 'success');
          }
        } catch (err) {
          window.ShiloToast(window.cartErrorText(err), 'error');
        } finally {
          this.loading = false;
          this.submitBtn.classList.remove('btn--loading');
          this.submitBtn.removeAttribute('aria-busy');
          /* Re-enable only what this handler disabled: a variant that is genuinely
             unavailable keeps aria-disabled and must stay disabled. */
          if (!this.submitBtn.hasAttribute('aria-disabled')) this.submitBtn.disabled = false;
          linked.forEach((btn) => {
            if (!btn.hasAttribute('aria-disabled')) btn.disabled = false;
          });
        }
      }
    }
  );

  /* ---------- <quantity-input> ---------- */
  customElements.define(
    'quantity-input',
    class QuantityInput extends HTMLElement {
      connectedCallback() {
        this.input = this.querySelector('input');
        if (!this.input) return;
        this.changeEvent = new Event('change', { bubbles: true });
        this.querySelectorAll('button').forEach((btn) =>
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const prev = this.input.value;
            if (btn.name === 'plus') this.input.stepUp();
            else this.input.stepDown();
            if (prev !== this.input.value) this.input.dispatchEvent(this.changeEvent);
          })
        );
      }
    }
  );

  /* ---------- <cart-remove-button> ---------- */
  customElements.define(
    'cart-remove-button',
    class CartRemoveButton extends HTMLElement {
      connectedCallback() {
        this.addEventListener('click', (e) => {
          e.preventDefault();
          const line = parseInt(this.dataset.line, 10);
          const row = this.closest('[data-cart-line]');
          /* .is-removing is not cosmetic: section-cart.css and cart-drawer.css both
             give it pointer-events: none. It used to be added before the request
             and never taken back, so a request that failed on flaky mobile data
             left the line greyed out and completely dead — trash button, stepper
             and product link all inert — with the item still in the cart and no
             way to touch it short of a page reload. */
          row?.classList.add('is-removing');
          Cart.change(line, 0).catch((err) => {
            row?.classList.remove('is-removing');
            window.ShiloToast(window.cartErrorText(err), 'error');
            Cart.refresh();
          });
        });
      }
    }
  );

  /* ---------- <cart-line-qty> — quantity change on cart lines ---------- */
  customElements.define(
    'cart-line-qty',
    class CartLineQty extends HTMLElement {
      connectedCallback() {
        this.addEventListener(
          'change',
          window.debounce((e) => {
            const input = e.target;
            if (!input.matches('input')) return;
            const line = parseInt(this.dataset.line, 10);
            const qty = parseInt(input.value, 10);

            /* An emptied number input yields '', parseInt('') is NaN, and
               JSON.stringify(NaN) is null — so backspacing a quantity and
               clicking away used to POST {"quantity":null}, which the Ajax Cart
               API either coerces to 0 (silently deleting the line) or rejects.
               <product-form> already guards the same input; this path did not.
               Restore the last server-rendered value and send nothing. */
            if (!Number.isFinite(qty) || qty < 0) {
              input.value = input.defaultValue || '1';
              return;
            }

            /* Respect the input's own bounds before asking the server. */
            const max = parseInt(input.getAttribute('max'), 10);
            const min = parseInt(input.getAttribute('min'), 10);
            let next = qty;
            if (Number.isFinite(min) && next < min) next = min;
            if (Number.isFinite(max) && next > max) next = max;
            if (next !== qty) input.value = next;

            Cart.change(line, next).catch((err) => {
              window.ShiloToast(window.cartErrorText(err), 'error');
              /* refresh(), not afterChange() — see Cart.refresh. Without the
                 sections payload the rejected quantity stayed on screen. */
              Cart.refresh();
            });
          }, 350)
        );
      }
    }
  );

  /* ---------- Details disclosure (dropdown menus) ---------- */
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details[data-disclosure][open]').forEach((details) => {
      if (!details.contains(e.target)) details.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('details[data-disclosure][open]').forEach((details) => {
        details.removeAttribute('open');
        details.querySelector('summary')?.focus();
      });
    }
  });

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    const elements = document.querySelectorAll('.reveal:not(.reveal--visible)');
    if (!elements.length) return;
    if (!('IntersectionObserver' in window) || document.documentElement.classList.contains('no-animations')) {
      elements.forEach((el) => el.classList.add('reveal--visible'));
      return;
    }
    /* base.css only hides .reveal once this class is on <html>, so a slow or
       failed global.js can never leave content invisible — it just arrives
       without the animation. */
    document.documentElement.classList.add('reveal-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            entry.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
            entry.target.classList.add('reveal--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    elements.forEach((el) => observer.observe(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }
  document.addEventListener('shopify:section:load', initReveal);

  /* ---------- Sticky header helper ----------
     Every class flip here invalidates style for the whole header subtree (12
     departments plus every mega panel), so the work is coalesced to one update
     per frame and classList is only touched on an actual state change — the old
     handler re-queried the DOM and re-wrote both classes on every scroll event.

     The stuck threshold is hysteretic (crosses at 48, releases at 32) because a
     trackpad fling and iOS rubber-banding both re-cross a single threshold
     several times inside one gesture, and each crossing costs a relayout of the
     header. `is-hidden-up` keeps its own ±8px dead zone for the same reason. */
  let headerEl = document.querySelector('[data-sticky-header]');
  let lastScroll = window.scrollY;
  let stuck = false;
  let hiddenUp = false;
  let ticking = false;

  function updateHeader() {
    ticking = false;
    if (!headerEl) return;
    const y = window.scrollY;

    const nextStuck = stuck ? y > 32 : y > 48;
    if (nextStuck !== stuck) {
      stuck = nextStuck;
      headerEl.classList.toggle('is-stuck', stuck);
    }

    let nextHidden = hiddenUp;
    if (y > 320 && y > lastScroll + 8) nextHidden = true;
    else if (y < lastScroll - 8 || y < 320) nextHidden = false;
    if (nextHidden !== hiddenUp) {
      hiddenUp = nextHidden;
      headerEl.classList.toggle('is-hidden-up', hiddenUp);
    }

    lastScroll = y;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateHeader);
    },
    { passive: true }
  );

  /* A section re-render in the theme editor hands back a header without the
     state classes, so the tracked state has to be reset and re-applied. */
  document.addEventListener('shopify:section:load', () => {
    headerEl = document.querySelector('[data-sticky-header]');
    stuck = false;
    hiddenUp = false;
    updateHeader();
  });

  /* Reloading half-way down a page must not start with an expanded header. */
  updateHeader();

  /* ---------- External links a11y ---------- */
  document.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])').forEach((a) => {
    a.setAttribute('rel', (a.getAttribute('rel') || '') + ' noopener');
  });
})();
