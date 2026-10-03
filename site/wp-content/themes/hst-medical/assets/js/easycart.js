/* HST Medical: WP EasyCart enhancements (product page + checkout). Progressive enhancement only:
   without this script EasyCart's own select, tabs, button and checkout form all still work. */
(function () {
  'use strict';
  var d = document;
  function fire(el) {
    // EasyCart listens with jQuery; trigger both so its price/option logic runs
    if (window.jQuery) window.jQuery(el).trigger('change');
    else el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function money(n) { return 'S$' + Number(n).toFixed(2); }

  /* ---------------- pack-size tiles drive EasyCart's option select ---------------- */
  d.querySelectorAll('.hst-packs').forEach(function (fs) {
    var page = fs.closest('.ec_product_details_page') || d;
    var select = page.querySelector('select.ec_option1, select[name="ec_option1"]');
    if (!select) return;
    page.classList.add('hst-has-tiles');
    var priceEls = page.querySelectorAll('.ec_details_price.ec_details_single_price');
    var bar = d.querySelector('.hst-buybar-price');
    var main = page.querySelector('.ec_details_main_image img');
    // each pack tile can carry its own photo (the live store's pack shot); fetched on first touch/hover of the tiles, not at load
    var warm = function () { fs.querySelectorAll('input[data-img]').forEach(function (r) { var im = new Image(); im.src = r.getAttribute('data-img'); }); warm = function () {}; };
    ['pointerenter', 'touchstart', 'focusin'].forEach(function (ev) { fs.addEventListener(ev, function () { warm(); }, { passive: true }); });
    function apply(radio, quiet) {
      fs.querySelectorAll('.hst-pack').forEach(function (l) { l.classList.toggle('is-on', l.contains(radio)); });
      select.value = radio.value;
      if (!quiet) fire(select); else fire(select);
      var p = money(radio.getAttribute('data-price'));
      priceEls.forEach(function (el) { el.textContent = p; });
      if (bar) bar.textContent = p;
      var src = radio.getAttribute('data-img');
      if (main && src && main.getAttribute('src') !== src) { main.removeAttribute('srcset'); main.setAttribute('src', src); }
    }
    fs.addEventListener('change', function (e) { if (e.target.matches('input[type=radio]')) apply(e.target); });
    var first = fs.querySelector('input[type=radio]:checked') || fs.querySelector('input[type=radio]');
    if (first) apply(first, true);
  });

  /* ---------------- tabs: EasyCart switches the panels; add keyboard access and ARIA state ---------------- */
  var tabs = d.querySelector('.ec_details_tabs');
  if (tabs) {
    var all = tabs.querySelectorAll('.ec_details_tab');
    tabs.setAttribute('role', 'tablist');
    all.forEach(function (t) {
      t.setAttribute('role', 'tab'); t.setAttribute('tabindex', '0');
      t.setAttribute('aria-selected', t.classList.contains('ec_active'));
      t.addEventListener('click', function () { all.forEach(function (x) { x.setAttribute('aria-selected', x === t); }); });
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } });
    });
  }
  /* ---------------- sticky add-to-cart bar on phones ---------------- */
  var barWrap = d.querySelector('.hst-buybar'), real = d.querySelector('.ec_details_add_to_cart input[type=submit], .ec_details_add_to_cart button');
  if (barWrap && real) {
    var mq = window.matchMedia('(max-width: 899px)');
    // shown only once the real button has scrolled up out of view, never before the shopper reaches it
    var upd = function () {
      var hide = !mq.matches || real.getBoundingClientRect().bottom > 0;
      if (barWrap.hidden !== hide) barWrap.hidden = hide;
    };
    window.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    upd();
    barWrap.querySelector('.hst-buybar-add').addEventListener('click', function () { real.click(); });
  }
  /* EasyCart injects the cart and checkout markup after load: run a setup once its element exists */
  function whenPresent(selector, fn) {
    if (d.querySelector(selector)) return fn();
    var mo = new MutationObserver(function () { if (d.querySelector(selector)) { mo.disconnect(); fn(); } });
    mo.observe(d.body, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 20000);
  }

  /* ---------------- cart: drop EasyCart's "( +S$x.xx )" pack-difference note (the line shows the full price) ---------------- */
  var DIFF = /\s*\(\s*[+-]\s*S\$\s?[\d.,]+\s*(per item)?\s*\)/g;
  function cleanDiffs() {
    var root = d.querySelector('.ec_cart_page') || d.querySelector('.ec-wrap');
    if (!root) return;
    var walk = d.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = walk.nextNode())) { if (DIFF.test(n.nodeValue)) { DIFF.lastIndex = 0; n.nodeValue = n.nodeValue.replace(DIFF, ''); } DIFF.lastIndex = 0; }
  }
  if (d.querySelector('.ec-wrap')) {
    cleanDiffs();
    var t = null; // EasyCart re-renders cart/checkout parts with AJAX: clean again after each change
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(cleanDiffs, 60); }).observe(d.querySelector('.ec-wrap'), { childList: true, subtree: true });
  }

  /* ---------------- checkout: Singapore defaults, postal code, phone ---------------- */
  if (/ec_page=checkout_info/.test(location.search)) whenPresent('#ec_cart_billing_country', setupCheckout);
  function setupCheckout() {
    ['billing', 'shipping'].forEach(function (k) {
      var country = d.getElementById('ec_cart_' + k + '_country');
      if (!country) return;
      var sg = [].filter.call(country.options, function (o) { return o.value === 'SG' || /^singapore$/i.test(o.text.trim()); })[0];
      if (sg && (country.value === '0' || country.value === '')) { country.value = sg.value; fire(country); }
      function singaporeFields() {
        var isSG = sg && country.value === sg.value;
        var state = d.getElementById('ec_cart_' + k + '_state');
        // State shares a row with the postal code: hide only the State half and let the postal code take the row
        var half = state && (state.closest('.ec_cart_input_left_half') || state.parentNode);
        if (half) half.classList.toggle('hst-hidden-sg', !!isSG);
        var row = state && state.closest('.ec_cart_input_row');
        if (row) row.classList.toggle('hst-zip-full', !!isSG);
        if (isSG && state && !state.value) state.value = 'Singapore';
        var city = d.getElementById('ec_cart_' + k + '_city');
        if (isSG && city && !city.value) city.value = 'Singapore';
        var zip = d.getElementById('ec_cart_' + k + '_zip');
        if (zip) {
          if (isSG) {
            zip.setAttribute('inputmode', 'numeric'); zip.setAttribute('maxlength', '6'); zip.setAttribute('pattern', '[0-9]{6}');
            zip.setAttribute('placeholder', '6-digit postal code'); zip.setAttribute('autocomplete', k + ' postal-code');
          } else { zip.removeAttribute('pattern'); zip.removeAttribute('maxlength'); }
        }
        var phone = d.getElementById('ec_cart_' + k + '_phone');
        if (phone) { phone.setAttribute('inputmode', 'tel'); phone.setAttribute('autocomplete', k + ' tel'); }
      }
      country.addEventListener('change', singaporeFields);
      singaporeFields();
    });
    d.querySelectorAll('#ec_cart_billing_zip, #ec_cart_shipping_zip').forEach(function (zip) {
      zip.addEventListener('input', function () { zip.value = zip.value.replace(/\D/g, '').slice(0, zip.getAttribute('maxlength') ? 6 : 12); zip.setCustomValidity(''); });
      zip.addEventListener('invalid', function () { zip.setCustomValidity('Please enter a 6-digit Singapore postal code.'); });
    });
  }
})();
