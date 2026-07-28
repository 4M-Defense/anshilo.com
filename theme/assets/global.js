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

  window.formatMoney = function (cents) {
    const amount = (cents / 100).toLocaleString('he-IL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    return '₪' + amount;
  };

  const trapFocusHandlers = {};

  window.trapFocus = function (container) {
    const focusable = container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    removeTrapFocus();

    trapFocusHandlers.keydown = function (e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocusHandlers.keydown);
    (container.querySelector('[autofocus]') || first).focus({ preventScroll: true });
  };

  window.removeTrapFocus = function () {
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

    ensureOverlay() {
      if (!this.overlay) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'overlay';
        this.overlay.addEventListener('click', () => this.close());
        document.body.appendChild(this.overlay);
      }
      return this.overlay;
    },

    open(id, opener) {
      const drawer = document.getElementById(id);
      if (!drawer) return;
      if (this.activeDrawer && this.activeDrawer !== drawer) this.close(true);

      this.activeDrawer = drawer;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      if (opener) drawer.dataset.openerId = opener.id || '';
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
      drawer.setAttribute('aria-hidden', 'true');
      this.activeDrawer = null;
      window.removeTrapFocus();
      document.removeEventListener('keydown', this.onKeydown);
      if (!keepOverlay) {
        if (this.overlay) this.overlay.classList.remove('is-open');
        document.body.classList.remove('scroll-locked');
      }
      const opener = drawer.dataset.openerId && document.getElementById(drawer.dataset.openerId);
      if (opener) opener.focus({ preventScroll: true });
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
        const message = data.description || data.message || window.cartStrings.error;
        throw new Error(message);
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
        const message = data.description || data.message || window.cartStrings.error;
        throw new Error(message);
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

    async afterChange(sections) {
      if (sections) {
        Object.entries(sections).forEach(([id, html]) => {
          if (!html) return;
          document.querySelectorAll('[data-cart-section="' + id + '"]').forEach((el) => {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const replacement = doc.querySelector('[data-cart-section="' + id + '"]') || doc.body.firstElementChild;
            if (replacement) el.innerHTML = replacement.innerHTML;
          });
        });
      }
      const cart = await this.getState();
      this.updateBubbles(cart.item_count);
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart } }));
      return cart;
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

        this.submitBtn.classList.add('btn--loading');
        this.submitBtn.setAttribute('aria-busy', 'true');

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
          window.ShiloToast(err.message || window.cartStrings.error, 'error');
        } finally {
          this.submitBtn.classList.remove('btn--loading');
          this.submitBtn.removeAttribute('aria-busy');
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
          this.closest('[data-cart-line]')?.classList.add('is-removing');
          Cart.change(line, 0).catch((err) => window.ShiloToast(err.message, 'error'));
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
            Cart.change(line, qty).catch((err) => {
              window.ShiloToast(err.message, 'error');
              Cart.afterChange();
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

  /* ---------- Sticky header helper ---------- */
  const header = () => document.querySelector('[data-sticky-header]');
  let lastScroll = 0;

  window.addEventListener(
    'scroll',
    () => {
      const el = header();
      if (!el) return;
      const y = window.scrollY;
      el.classList.toggle('is-stuck', y > 40);
      if (y > 320 && y > lastScroll + 8) {
        el.classList.add('is-hidden-up');
      } else if (y < lastScroll - 8 || y < 320) {
        el.classList.remove('is-hidden-up');
      }
      lastScroll = y;
    },
    { passive: true }
  );

  /* ---------- External links a11y ---------- */
  document.querySelectorAll('a[target="_blank"]:not([rel*="noopener"])').forEach((a) => {
    a.setAttribute('rel', (a.getAttribute('rel') || '') + ' noopener');
  });
})();
