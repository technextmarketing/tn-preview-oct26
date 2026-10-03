/* HST Medical theme. Progressive enhancement only, no dependencies (~3 KB).
   Without JS every link, category, sort and form still works (server-rendered).
   With JS: mobile category menu, sticky-header shadow, sort auto-submit, in-place store filter/search,
   inline form validation with aria-live. Cart, pack sizes and checkout are WP EasyCart's own scripts. */
(function () {
  'use strict';
  var d = document, live = d.getElementById('live');
  function say(t) { if (live) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); } }

  /* mobile category menu */
  var tg = d.querySelector('.nav-toggle'), nav = d.getElementById('site-nav');
  function setNav(open) {
    nav.classList.toggle('open', open); tg.setAttribute('aria-expanded', open);
    tg.setAttribute('aria-label', open ? 'Close categories menu' : 'Open categories menu');
  }
  if (tg && nav) {
    tg.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setNav(false); tg.focus(); } });
  }

  /* sticky header: hairline shadow once the page scrolls under it */
  var mh = d.querySelector('.masthead');
  if (mh && 'IntersectionObserver' in window) {
    var sentinel = d.createElement('div'); sentinel.setAttribute('aria-hidden', 'true'); sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px';
    d.body.prepend(sentinel);
    new IntersectionObserver(function (en) { mh.classList.toggle('is-stuck', !en[0].isIntersecting); }, { rootMargin: '-60px 0px 0px 0px' }).observe(sentinel);
  }

  /* sort select submits on change (a noscript Apply button covers no-JS) */
  d.querySelectorAll('select[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });

  /* store page: category filter + search in place (every category is also a real URL) */
  var grid = d.getElementById('shop-grid');
  if (grid) {
    var tabs = d.querySelectorAll('.filters [data-cat]'), q = d.getElementById('q'), out = d.getElementById('result'), emptyEl = d.getElementById('shop-empty'), cat = 'all';
    var fold = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    var apply = function () {
      var term = fold(q && q.value || '').trim(), n = 0, cards = grid.querySelectorAll('.plabel');
      cards.forEach(function (p) {
        var ok = (cat === 'all' || p.getAttribute('data-cat') === cat) && (!term || fold(p.getAttribute('data-search')).indexOf(term) > -1);
        p.hidden = !ok; if (ok) n++;
      });
      if (out) out.textContent = 'Showing ' + n + ' of ' + cards.length + ' products' + (term ? ' for “' + q.value + '”' : '');
      if (emptyEl) emptyEl.hidden = n > 0;
    };
    tabs.forEach(function (t) {
      t.addEventListener('click', function (e) {
        e.preventDefault(); tabs.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        t.setAttribute('aria-pressed', 'true'); cat = t.getAttribute('data-cat'); apply();
        if (history.replaceState) history.replaceState(null, '', cat === 'all' ? location.pathname : '?cat=' + cat);
      });
    });
    if (q) q.addEventListener('input', apply);
    var m = location.search.match(/cat=([\w-]+)/); if (m) tabs.forEach(function (t) { if (t.getAttribute('data-cat') === m[1]) t.click(); });
    var qs = location.search.match(/[?&]q=([^&]+)/); if (qs && q) q.value = decodeURIComponent(qs[1].replace(/\+/g, ' '));
    apply();
  }

  /* forms: inline validation (trade and contact forms) */
  function validate(scope) {
    var ok = true;
    scope.querySelectorAll('input,select,textarea').forEach(function (f) {
      if (f.closest('[hidden]')) return;
      var bad = !f.checkValidity();
      f.setAttribute('aria-invalid', bad ? 'true' : 'false');
      var wrap = f.closest('.lbl') || f.closest('label'); if (wrap) wrap.classList.toggle('is-error', bad);
      if (bad && ok) { ok = false; f.focus(); }
    });
    return ok;
  }
  // real forms ([hst_contact_form], [hst_trade_form]): same inline checks, then a normal submit
  d.querySelectorAll('form[data-validate]').forEach(function (f) {
    f.addEventListener('submit', function (e) { if (!validate(f)) { e.preventDefault(); say('Please complete the highlighted fields.'); } });
    f.addEventListener('input', function (e) {
      var t = e.target;
      if (t.getAttribute('aria-invalid') === 'true' && t.checkValidity()) { t.setAttribute('aria-invalid', 'false'); var w = t.closest('.lbl') || t.closest('label'); if (w) w.classList.remove('is-error'); }
    });
  });
  d.querySelectorAll('form[data-demo]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(f)) { say('Please complete the highlighted fields.'); return; }
      f.classList.add('sent'); var okEl = f.querySelector('.ok'); if (okEl) { okEl.scrollIntoView({ block: 'nearest' }); say(okEl.textContent); }
    });
    f.addEventListener('input', function (e) {
      var t = e.target;
      if (t.getAttribute('aria-invalid') === 'true' && t.checkValidity()) { t.setAttribute('aria-invalid', 'false'); var w = t.closest('.lbl') || t.closest('label'); if (w) w.classList.remove('is-error'); }
    });
  });
})();

/* TV commercial: a plain YouTube link until clicked, then the privacy-enhanced player (no third-party load before that). */
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-yt]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var box = document.createElement('div'), f = document.createElement('iframe');
    box.className = 'tvc-frame';
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(a.getAttribute('data-yt')) + '?autoplay=1&rel=0';
    f.title = a.getAttribute('data-yt-title') || 'Video';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.setAttribute('allowfullscreen', '');
    box.appendChild(f);
    a.replaceWith(box);
    f.focus();
  });
})();
