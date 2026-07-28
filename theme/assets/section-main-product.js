/* =========================================================
   Shilo Pro — Product page JS
   Variant selection, price/stock/sku updates, media gallery,
   share button, sticky mobile add-to-cart bar
   ========================================================= */
(function () {
  'use strict';

  function readJSON(el) {
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  /* ---------- Media gallery ---------- */
  function initGallery(root) {
    const gallery = root.querySelector('[data-product-gallery]');
    if (!gallery) return null;

    const items = Array.from(gallery.querySelectorAll('.product-gallery__item'));
    const thumbs = Array.from(gallery.querySelectorAll('[data-thumb]'));

    function setActive(mediaId) {
      const id = String(mediaId);
      if (!items.some((item) => item.dataset.mediaId === id)) return;

      items.forEach((item) => {
        const active = item.dataset.mediaId === id;
        item.classList.toggle('is-active', active);
        if (active) {
          item.removeAttribute('aria-hidden');
        } else {
          item.setAttribute('aria-hidden', 'true');
          item.querySelectorAll('video').forEach((v) => {
            try { v.pause(); } catch (e) { /* noop */ }
          });
        }
      });

      thumbs.forEach((thumb) => {
        const active = thumb.dataset.mediaId === id;
        thumb.classList.toggle('is-active', active);
        thumb.setAttribute('aria-current', active ? 'true' : 'false');
        if (active) {
          const rect = gallery.getBoundingClientRect();
          const inViewport = rect.bottom > 0 && rect.top < window.innerHeight;
          if (inViewport) {
            thumb.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
          }
        }
      });
    }

    thumbs.forEach((thumb) => {
      thumb.addEventListener('click', () => setActive(thumb.dataset.mediaId));
    });

    const thumbsWrap = gallery.querySelector('[data-gallery-thumbs]');
    if (thumbsWrap) {
      thumbsWrap.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const focused = document.activeElement;
        const index = thumbs.indexOf(focused);
        if (index === -1) return;
        e.preventDefault();
        const rtl = document.documentElement.dir === 'rtl';
        let next = index;
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = thumbs.length - 1;
        else {
          const forward = (e.key === 'ArrowRight') !== rtl;
          next = forward ? index + 1 : index - 1;
        }
        next = Math.max(0, Math.min(thumbs.length - 1, next));
        thumbs[next].focus();
        setActive(thumbs[next].dataset.mediaId);
      });
    }

    return { setActive };
  }

  /* ---------- Main product section ---------- */
  function initMainProduct(root) {
    if (!root || root.dataset.jsInitialized) return;
    root.dataset.jsInitialized = 'true';

    const sectionId = root.dataset.sectionId;
    const lowStockThreshold = parseInt(root.dataset.lowStock, 10) || 5;
    const strings = readJSON(root.querySelector('[data-product-strings]')) || {};
    const variants = readJSON(root.querySelector('[data-variant-json]'));

    const picker = root.querySelector('[data-variant-picker]');
    const priceEl = root.querySelector('#ProductPrice-' + sectionId);
    const saveBadge = root.querySelector('[data-save-badge]');
    const skuWrap = root.querySelector('[data-sku-wrap]');
    const skuEl = root.querySelector('[data-sku]');
    const stockEl = root.querySelector('[data-stock-status]');
    const form = root.querySelector('#ProductForm-' + sectionId);
    const idInput = form ? form.querySelector('[data-variant-id]') : null;
    const addBtn = root.querySelector('[data-add-button]');
    const addBtnText = root.querySelector('[data-add-button-text]');
    const stickyBar = root.querySelector('[data-sticky-atc]');
    const stickyPrice = root.querySelector('[data-sticky-price]');
    const stickyBtn = root.querySelector('[data-sticky-add]');
    const stickyBtnText = root.querySelector('[data-sticky-add-text]');
    const stickyImage = root.querySelector('[data-sticky-image]');

    const gallery = initGallery(root);

    /* ----- Share button ----- */
    const shareBtn = root.querySelector('[data-share-button]');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const url = shareBtn.dataset.shareUrl || window.location.href;
        const title = shareBtn.dataset.shareTitle || document.title;
        if (navigator.share) {
          try {
            await navigator.share({ title: title, url: url });
            return;
          } catch (e) {
            if (e && e.name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          if (window.ShiloToast && strings.copied) window.ShiloToast(strings.copied, 'success');
        } catch (e) {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            if (window.ShiloToast && strings.copied) window.ShiloToast(strings.copied, 'success');
          } catch (err) { /* noop */ }
          ta.remove();
        }
      });
    }

    /* ----- Sticky mobile add-to-cart bar ----- */
    const buyAnchor = root.querySelector('[data-buy-buttons-anchor]');
    if (stickyBar && buyAnchor && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          const passed = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
          stickyBar.classList.toggle('is-visible', passed);
        },
        { threshold: 0 }
      );
      observer.observe(buyAnchor);
    }

    if (stickyBtn) {
      stickyBtn.addEventListener('click', () => {
        if (stickyBtn.disabled || stickyBtn.hasAttribute('aria-disabled')) return;
        stickyBtn.classList.add('btn--loading');
        setTimeout(() => stickyBtn.classList.remove('btn--loading'), 5000);
      });
      document.addEventListener('cart:updated', () => stickyBtn.classList.remove('btn--loading'));
    }

    /* ----- Variant selection ----- */
    if (!picker || !Array.isArray(variants) || !variants.length) return;

    const radios = Array.from(picker.querySelectorAll('input[type="radio"]'));
    const optionCount = radios.reduce(
      (max, r) => Math.max(max, parseInt(r.dataset.optionPosition, 10) || 0),
      0
    );

    function selectedOptions() {
      const options = [];
      for (let p = 1; p <= optionCount; p++) {
        const checked = radios.find(
          (r) => parseInt(r.dataset.optionPosition, 10) === p && r.checked
        );
        options.push(checked ? checked.value : null);
      }
      return options;
    }

    function findVariant(options) {
      return variants.find((v) =>
        v.options.every((value, i) => value === options[i])
      );
    }

    function renderPrice(variant) {
      if (!priceEl || typeof window.formatMoney !== 'function') return;
      const onSale =
        typeof variant.compare_at_price === 'number' &&
        variant.compare_at_price > variant.price;

      let html =
        '<div class="price price--large' + (onSale ? ' price--on-sale' : '') + '">' +
        '<span class="price__current">' +
        '<span class="visually-hidden">' +
        (onSale ? strings.salePrice || '' : strings.regularPrice || '') +
        '</span>' +
        window.formatMoney(variant.price) +
        '</span>';
      if (onSale) {
        html +=
          '<s class="price__compare">' +
          '<span class="visually-hidden">' + (strings.regularPrice || '') + '</span>' +
          window.formatMoney(variant.compare_at_price) +
          '</s>';
      }
      html += '</div>';
      priceEl.innerHTML = html;

      if (saveBadge) {
        if (onSale && strings.saveAmount) {
          saveBadge.textContent = strings.saveAmount.replace(
            '[amount]',
            window.formatMoney(variant.compare_at_price - variant.price)
          );
          saveBadge.hidden = false;
        } else {
          saveBadge.hidden = true;
        }
      }

      if (stickyPrice) stickyPrice.textContent = window.formatMoney(variant.price);
    }

    function renderStock(variant) {
      if (!stockEl) return;
      let cls = 'stock-dot';
      let text = strings.inStock || '';
      if (!variant.available) {
        cls = 'stock-dot stock-dot--out';
        text = strings.outOfStock || '';
      } else if (
        variant.inventory_management &&
        typeof variant.inventory_quantity === 'number' &&
        variant.inventory_quantity > 0 &&
        variant.inventory_quantity <= lowStockThreshold
      ) {
        cls = 'stock-dot stock-dot--low';
        text =
          variant.inventory_quantity === 1
            ? strings.lowStockOne || ''
            : (strings.lowStockOther || '').replace('[count]', variant.inventory_quantity);
      }
      stockEl.innerHTML = '';
      const dot = document.createElement('span');
      dot.className = cls;
      dot.textContent = text;
      stockEl.appendChild(dot);
    }

    function setButtonState(button, textEl, available, unavailableText) {
      if (!button) return;
      if (available) {
        button.disabled = false;
        button.removeAttribute('aria-disabled');
        if (textEl) textEl.textContent = strings.addToCart || '';
      } else {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        if (textEl) textEl.textContent = unavailableText;
      }
    }

    function renderSku(variant) {
      if (!skuWrap || !skuEl) return;
      if (variant.sku) {
        skuEl.textContent = variant.sku;
        skuWrap.hidden = false;
      } else {
        skuWrap.hidden = true;
      }
    }

    function updateUrl(variant) {
      if (!window.history || !window.history.replaceState) return;
      window.history.replaceState(
        {},
        '',
        window.location.pathname + '?variant=' + variant.id
      );
    }

    function updateStickyImage(variant) {
      if (!stickyImage || !variant.featured_media) return;
      const preview = variant.featured_media.preview_image;
      if (!preview || !preview.src) return;
      const sep = preview.src.indexOf('?') === -1 ? '?' : '&';
      stickyImage.src = preview.src + sep + 'width=88';
      stickyImage.srcset =
        preview.src + sep + 'width=88 1x, ' + preview.src + sep + 'width=176 2x';
    }

    /* Cross out combinations with no available variant (progressive:
       considers the selected values of the options before this one). */
    function markUnavailable() {
      const selected = selectedOptions();
      radios.forEach((radio) => {
        const position = parseInt(radio.dataset.optionPosition, 10);
        const exists = variants.some((v) => {
          if (!v.available) return false;
          if (v.options[position - 1] !== radio.value) return false;
          for (let i = 0; i < position - 1; i++) {
            if (selected[i] !== null && v.options[i] !== selected[i]) return false;
          }
          return true;
        });
        const pill = radio.closest('.variant-pill');
        if (pill) pill.classList.toggle('is-unavailable', !exists);
      });
    }

    function updateSelectedLabels() {
      picker.querySelectorAll('.product-variants__option').forEach((fieldset) => {
        const checked = fieldset.querySelector('input[type="radio"]:checked');
        const label = fieldset.querySelector('[data-selected-value]');
        if (checked && label) label.textContent = checked.value;
      });
    }

    function onVariantChange() {
      updateSelectedLabels();
      markUnavailable();

      const variant = findVariant(selectedOptions());

      if (!variant) {
        setButtonState(addBtn, addBtnText, false, strings.unavailable || '');
        setButtonState(stickyBtn, stickyBtnText, false, strings.unavailable || '');
        if (stockEl) stockEl.innerHTML = '';
        if (saveBadge) saveBadge.hidden = true;
        return;
      }

      if (idInput) idInput.value = variant.id;
      renderPrice(variant);
      renderStock(variant);
      renderSku(variant);
      setButtonState(addBtn, addBtnText, variant.available, strings.soldOut || '');
      setButtonState(stickyBtn, stickyBtnText, variant.available, strings.soldOut || '');
      updateUrl(variant);
      updateStickyImage(variant);
      if (gallery && variant.featured_media) {
        gallery.setActive(variant.featured_media.id);
      }
    }

    picker.addEventListener('change', (e) => {
      if (e.target.matches('input[type="radio"]')) onVariantChange();
    });

    markUnavailable();
  }

  function initAll() {
    document.querySelectorAll('[data-main-product]').forEach(initMainProduct);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', (e) => {
    const root = e.target && e.target.querySelector && e.target.querySelector('[data-main-product]');
    if (root) initMainProduct(root);
  });
})();
