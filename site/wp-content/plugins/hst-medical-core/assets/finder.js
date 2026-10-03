/* "Ask HST" shop assistant. Rule-based, no AI service: answers from the site's own data
   (/wp-json/hst/v1/finder, loaded on first open) and buys through the real WP EasyCart cart
   (/wp-json/hst/v1/cart). Payment always happens on EasyCart's secure checkout page, never in chat. */
(function () {
  'use strict';
  var d = document, cfg = window.HSTFinder || {}, D = null, loading = null;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ helpers */
  var ICON = {
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    send: '<path d="M4 12h14M13 6l6 6-6 6"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICON[n] + '</svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fold(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[®™]/g, '').toLowerCase(); }
  function money(n) { return 'S$' + Number(n).toFixed(2); }
  function num(p) { return parseFloat(String(p).replace(/[^0-9.]/g, '')) || 0; }

  /* ------------------------------------------------------------------ language tolerance */
  var SYN = {
    tummy: 'stomach', belly: 'stomach', ache: 'pain', aches: 'pain', aching: 'pain', painful: 'pain', sore: 'pain', hurt: 'pain', hurts: 'pain', hurting: 'pain',
    throte: 'throat', thoat: 'throat', coughing: 'cough', flue: 'flu', influenza: 'flu', sniffles: 'runny nose', congested: 'blocked nose', stuffy: 'blocked nose',
    insomnia: 'sleep', sleepless: 'sleep', sleeping: 'sleep', cant: 'cannot', kid: 'kids', child: 'kids', children: 'kids', baby: 'infant', bb: 'infant',
    vitamin: 'vitamins', vits: 'vitamins', supplement: 'supplements', ointment: 'balm', cream: 'creme', creams: 'creme', plaster: 'patch', plasters: 'patch',
    oil: 'oil', tablets: 'tablet', pills: 'capsule', pill: 'capsule', caps: 'capsule', capsules: 'capsule', vegicaps: 'capsule',
    tired: 'energy', fatigue: 'energy', exhausted: 'energy', lethargic: 'energy', stressed: 'stress', anxious: 'stress',
    cart: 'cart', basket: 'cart', bag: 'cart', trolley: 'cart', pay: 'payment', paying: 'payment', checkout: 'checkout',
    pcs: 'pieces', pc: 'pieces', qty: 'quantity', nos: 'quantity', thx: 'thanks', ty: 'thanks', tq: 'thanks', pls: 'please', plz: 'please',
    u: 'you', ur: 'your', wat: 'what', wht: 'what', hw: 'how', abt: 'about', dun: 'do not', dont: 'do not', wan: 'want', wanna: 'want to'
  };
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1, single: 1, couple: 2, pair: 2, dozen: 12 };
  var ORD = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4, last: -1 };
  var VOCAB = [];

  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var p = [], i, j;
    for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) {
      var prev = p[0]; p[0] = i;
      for (j = 1; j <= b.length; j++) {
        var tmp = p[j];
        p[j] = Math.min(p[j] + 1, p[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return p[b.length];
  }
  function stem(w) { return w.length > 4 ? w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '') : w; }
  /* normalise: fold, synonyms, typo-correct each word against the site's vocabulary */
  function norm(text) {
    var words = fold(text).replace(/[^a-z0-9$.\s-]/g, ' ').split(/\s+/).filter(Boolean);
    return words.map(function (w) {
      if (SYN[w]) return SYN[w];
      if (w.length < 4 || /\d/.test(w) || VOCAB.indexOf(w) > -1 || VOCAB.indexOf(stem(w)) > -1) return w;
      var best = w, bd = w.length <= 5 ? 1 : 2;
      for (var k = 0; k < VOCAB.length; k++) {
        var v = VOCAB[k];
        if (v[0] !== w[0] && v.length > 4) continue;
        var dd = lev(w, v);
        if (dd < bd || (dd === bd && best === w && dd <= (w.length <= 5 ? 1 : 2))) { if (dd <= (w.length <= 5 ? 1 : 2)) { best = v; bd = dd; } }
      }
      return best;
    }).join(' ');
  }
  function buildVocab() {
    var set = {};
    function addWords(s) { fold(s).replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).forEach(function (w) { if (w.length >= 4) set[w] = 1; }); }
    D.products.forEach(function (p) { addWords(p.name + ' ' + p.for + ' ' + p.tag + ' ' + p.brand); });
    Object.keys(D.cats).forEach(function (k) { addWords(D.cats[k].name); });
    addWords('telegram award awards winner rating review reviews genuine authentic fake promo promotion discount offer deal deals voucher coupon overseas shipping');
    addWords('pain joint muscle knee back neck shoulder sprain strain stiff rheumatism arthritis bruise sport cough throat phlegm lozenge sinus blocked nose runny sneeze cold flu fever sleep melatonin stress relax calm kids gummies school bone calcium cartilage glucosamine immune allergy antioxidant energy ginseng cordyceps lingzhi tonic stamina vitality eyes vision memory focus brain skin hair beauty pearl collagen heart liver cholesterol urinary prostate women libido delivery shipping deliver courier stockist guardian watsons pharmacy trade reseller wholesale distributor halal vegan quality certified contact email phone about company kowa price cost cheap expensive ingredients contain usage dosage apply take children pregnant pregnancy breastfeeding medication checkout payment proceed order purchase quantity cancel cart buy');
    VOCAB = Object.keys(set);
  }

  /* ------------------------------------------------------------------ widget */
  var root = d.createElement('div');
  root.className = 'hstf';
  root.innerHTML =
    '<button class="hstf-launch" type="button" aria-expanded="false" aria-controls="hstf-panel">' + icon('chat') + '<span>Ask HST</span></button>' +
    '<section class="hstf-panel" id="hstf-panel" role="dialog" aria-modal="false" aria-labelledby="hstf-title" hidden>' +
      '<header class="hstf-head"><div><h2 id="hstf-title">Ask HST</h2><p>Find a product, check prices and pack sizes, and order. General guidance, not medical advice.</p></div>' +
      '<button class="hstf-close" type="button" aria-label="Close chat">' + icon('close') + '</button></header>' +
      '<div class="hstf-log" aria-live="polite" aria-relevant="additions"></div>' +
      '<div class="hstf-chips" role="group" aria-label="Suggested replies"></div>' +
      '<form class="hstf-form"><label class="hstf-sr" for="hstf-input">Type your message</label>' +
      '<input id="hstf-input" type="text" autocomplete="off" maxlength="200" placeholder="Describe a symptom or product">' +
      '<button type="submit" aria-label="Send">' + icon('send') + '</button></form>' +
    '</section>';
  d.body.appendChild(root);
  var launch = root.querySelector('.hstf-launch'), panel = root.querySelector('.hstf-panel'),
      log = root.querySelector('.hstf-log'), chips = root.querySelector('.hstf-chips'),
      form = root.querySelector('.hstf-form'), input = root.querySelector('#hstf-input'), started = false;

  function setOpen(open) {
    launch.setAttribute('aria-expanded', open);
    root.classList.toggle('is-open', open);
    if (open) {
      panel.hidden = false;
      requestAnimationFrame(function () { panel.classList.add('is-in'); });
      if (!started) { started = true; greet(); }
      setTimeout(function () { input.focus(); }, reduce ? 0 : 200);
    } else {
      panel.classList.remove('is-in');
      setTimeout(function () { panel.hidden = true; }, reduce ? 0 : 200);
      launch.focus();
    }
  }
  launch.addEventListener('click', function () { setOpen(launch.getAttribute('aria-expanded') !== 'true'); });
  root.querySelector('.hstf-close').addEventListener('click', function () { setOpen(false); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('is-open')) setOpen(false); });

  function add(who, html) {
    var m = d.createElement('div');
    m.className = 'hstf-msg hstf-' + who;
    m.innerHTML = html;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }
  function say(html, chipList) {
    var t = add('bot hstf-typing', '<span></span><span></span><span></span>');
    setTimeout(function () {
      t.classList.remove('hstf-typing'); t.innerHTML = html;
      setChips(chipList || START);
      log.scrollTop = log.scrollHeight; // after the chips: they shrink the log, keep the newest message in view
    }, reduce ? 0 : 420);
  }
  function setChips(list) { chips.innerHTML = (list || []).map(function (c) { return '<button type="button">' + esc(c) + '</button>'; }).join(''); }
  chips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) ask(b.textContent); });
  log.addEventListener('click', function (e) {
    var b = e.target.closest('[data-buy]');
    if (b) { e.preventDefault(); add('user', 'Add ' + esc(b.getAttribute('data-name')) + ' to cart'); setChips([]); load().then(function () { startBuy(bySlug(b.getAttribute('data-buy'))); }); }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value.trim(); if (v) { input.value = ''; ask(v); } });

  var START = ['Joint or muscle pain', 'Sore throat or cough', 'Cold or flu', 'Sleep', 'Kids vitamins', 'Buy a product', 'Delivery'];
  function greet() {
    say('<p>Hello, I am the HST Medical shop assistant. Tell me what is bothering you or which product you want, and I can help you choose a pack size and add it to your cart.</p>');
  }
  function load() {
    if (D) return Promise.resolve(D);
    if (!loading) loading = fetch(cfg.endpoint, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { D = j; D.products.forEach(function (p) { if (p.buy === undefined) p.buy = !!p.price; p.packs = p.packs || []; }); buildVocab(); return j; });
    return loading;
  }
  function bySlug(s) { for (var i = 0; i < D.products.length; i++) if (D.products[i].s === s) return D.products[i]; return null; }

  /* ------------------------------------------------------------------ cart (real EasyCart cart) */
  function cartApi(path, body) {
    return fetch(cfg.cart + path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: Object.assign({ 'X-HST-Nonce': cfg.nonce, 'X-WP-Nonce': cfg.rest }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw j; return j; }); });
  }
  function paintHeader(c) {
    d.querySelectorAll('.bag').forEach(function (b) {
      var n = b.querySelector('.count'), s = b.querySelector('.sub');
      if (n) { n.textContent = c.items; n.hidden = !c.items; }
      if (s) { s.textContent = c.subtotal; s.hidden = !c.items; }
      b.setAttribute('aria-label', 'Cart, ' + c.items + ' item' + (c.items === 1 ? '' : 's'));
      b.classList.remove('hstf-bump'); void b.offsetWidth; if (!reduce) b.classList.add('hstf-bump');
    });
  }
  function cartLines(c) {
    return '<ul class="hstf-lines">' + c.lines.map(function (l) {
      return '<li><span>' + l.qty + ' × ' + esc(l.title) + (l.pack ? ' <small>' + esc(l.pack) + '</small>' : '') + '</span><b>' + esc(l.total) + '</b></li>';
    }).join('') + '</ul><p class="hstf-total"><span>Subtotal (' + c.items + ' item' + (c.items === 1 ? '' : 's') + ')</span><b>' + esc(c.subtotal) + '</b></p>' +
      (c.to_free ? '<p class="hstf-note">Add ' + esc(c.to_free) + ' more for free delivery. ' + esc(c.free_note || '') + '</p>' : (c.items ? '<p class="hstf-note">Your order qualifies for free island-wide delivery.</p>' : ''));
  }

  /* ------------------------------------------------------------------ understanding */
  var RED = /(chest pain|cannot breathe|can not breathe|difficulty breathing|short(ness)? of breath|faint|unconscious|seizure|stroke|bleeding|blood in|severe pain|suicid|overdose|allergic reaction|swollen (lips|face|tongue)|poison)/;
  var CAUTION = /(pregnan|breastfeed|infant|under 2|toddler|medication|blood thinner|warfarin|diabetes|high blood pressure|kidney|liver disease|surgery)/;
  var CANCEL = /^(cancel|never ?mind|stop|no thanks|no thank you|forget it|nope|exit|restart|start over)\b/;
  var YES = /^(yes|yep|yeah|ya|yah|ok|okay|sure|confirm|add( it)?|go ahead|correct|right|yes,? add to cart|please do)\b/;
  var BUY = /(^add\b|\b(buy|order|purchase|add .*cart|add to cart|put .*cart|i ?('?ll| will) take|take \d|get me|get \d|i want( to (buy|get|order))?|want to (buy|get|order)|can i (buy|get|order)|shop for)\b)/;
  var CHECKOUT = /\b(checkout|check out|payment|proceed|place (my |the )?order|complete (my |the )?order|ready to pay|pay now)\b/;
  var CARTQ = /\b(my cart|in (my|the) cart|view cart|show cart|cart total|what.*cart|cart)\b/;
  var ASPECT = [
    { k: 'price', re: /\b(price|prices|cost|how much|cheap|expensive|sgd|\$)\b/ },
    { k: 'packs', re: /\b(pack|packs|size|sizes|option|options|bundle|twin|triple|value pack|travel)\b/ },
    { k: 'use', re: /\b(how (to|do i|should i) (use|take|apply)|usage|dosage|dose|directions|apply|how often|how many|when to take)\b/ },
    { k: 'ing', re: /\b(ingredient|ingredients|contain|contains|made of|made from|what.*inside|active)\b/ },
    { k: 'halal', re: /\b(halal|vegan|vegetarian|gelatin|pork)\b/ },
    { k: 'origin', re: /\b(made in|origin|where.*made|manufactured)\b/ },
    { k: 'info', re: /\b(what is|tell me (about|more)|info|information|details|benefit|benefits|good for|what does|describe)\b/ }
  ];
  var INTENTS = [
    { re: /\btelegram\b/, key: 'telegram' },
    { re: /\b(promo|promos|promotion|discount|offer|offers|sale|voucher|coupon|deal|deals)\b/, key: 'promo' },
    { re: /\b(award|awards|winner|won|rating|ratings|review|reviews|rated|trustindex)\b/, key: 'awards' },
    { re: /\b(genuine|authentic|fake|fakes|counterfeit|original)\b/, key: 'genuine' },
    { re: /\b(deliver|delivery|shipping|ship|postage|courier|free delivery|how long)\b/, key: 'delivery' },
    { re: /\b(where.*buy|stockist|guardian|watsons|nhgp|pharmacy|shop near|in store|physical shop|retail)\b/, key: 'where' },
    { re: /\b(trade|reseller|wholesale|distribut|bulk|stock your|territory)\b/, key: 'trade' },
    { re: /\b(halal|vegan|vegetarian|gmp|quality|certified|certification|safe)\b/, key: 'quality' },
    { re: /\b(contact|email|phone|call|speak|human|customer service|agent)\b/, key: 'contact' },
    { re: /\b(about|who are you|company|kowa|since|history|brands?)\b/, key: 'about' },
    { re: /\b(gst|tax)\b/, key: 'gst' },
    { re: /\b(return|refund|exchange|damaged|wrong item|broken)\b/, key: 'returns' },
    { re: /\b(privacy|personal data|pdpa)\b/, key: 'privacy' },
    { re: /\b(article|articles|blog|health notes?|read|guide|guides)\b/, key: 'notes' },
    { re: /\b(credit card|card|paynow|paypal|grabpay|apple pay|google pay|payment method)\b/, key: 'payment' },
    { re: /^(hi|hello|hey|helo|hai|yo|good (morning|afternoon|evening))\b/, key: 'hello' },
    { re: /\b(thanks|thank you|great|awesome|cool)\b/, key: 'thanks' }
  ];
  var NEEDS = [
    { re: /\b(joint|muscle|back|neck|shoulder|knee|sprain|strain|pain|stiff|rheuma|rheumatism|arthritis|bruise|sport|aching)\b/, cat: 'pain-relief', also: 'traditional-pain-relief' },
    { re: /\b(cough|throat|phlegm|lozenge|sinus|blocked nose|runny nose|sneeze|sneezing|cold|flu|fever)\b/, cat: 'cough-cold-flu' },
    { re: /\b(sleep|melatonin|jet ?lag|stress|relax|calm|cannot sleep)\b/, cat: 'stress-sleep' },
    { re: /\b(kids|gummies|gummy|zoo-?vite|school|jelly)\b/, cat: 'kids' },
    { re: /\b(bone|bones|calcium|osteo|cartilage|glucosamine)\b/, cat: 'bones-joints' },
    { re: /\b(immune|immunity|allergy|allergies|hay ?fever|antioxidant|squalene)\b/, cat: 'immunity-allergy' },
    { re: /\b(energy|ginseng|cordyceps|lingzhi|tonic|stamina|vitality|deer)\b/, cat: 'immunity-energy' },
    { re: /\b(eye|eyes|vision|memory|focus|brain|alert|concentrat\w*)\b/, cat: 'alertness-memory-vision' },
    { re: /\b(skin|hair|beauty|pearl|collagen|complexion|nail|nmn)\b/, cat: 'beauty-wellness' },
    { re: /\b(heart|liver|cholesterol|urinary|prostate|women|libido|circulation)\b/, cat: 'heart-liver-vitality' }
  ];
  var GENERIC = { pain: 1, relief: 1, heritage: 1, medical: 1, hst: 1, herbal: 1, remedy: 1, health: 1, care: 1, plus: 1, forte: 1, gard: 0, drops: 0, oil: 0, balm: 0, creme: 0, patch: 0, stick: 0, syrup: 0 };

  /* product named in the text? returns {p, score} for a confident match */
  function findProduct(t) {
    var words = t.split(/\s+/).filter(function (w) { return w.length > 2; }), best = null, bs = 0, second = 0;
    D.products.forEach(function (p) {
      var nameW = fold(p.name).replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(function (w) { return w.length > 2; });
      var s = 0;
      nameW.forEach(function (nw) {
        if (words.indexOf(nw) > -1 || words.indexOf(stem(nw)) > -1) s += GENERIC[nw] === 1 ? 0.5 : 2;
      });
      if (t.indexOf(fold(p.name).replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()) > -1) s += 4;
      if (s > bs) { second = bs; bs = s; best = p; } else if (s > second) second = s;
    });
    return bs >= 2 && bs > second ? best : (bs >= 4 ? best : null);
  }
  function rankFor(t, need) {
    var words = t.split(/\s+/).filter(function (w) { return w.length > 2; });
    var pool = need ? D.products.filter(function (p) { return p.cat === need.cat || p.cat === need.also; }) : D.products;
    return pool.map(function (p) {
      var hay = fold(p.name + ' ' + p.for + ' ' + p.tag + ' ' + p.brand), s = need && p.cat === need.cat ? 1 : 0;
      words.forEach(function (w) { if (hay.indexOf(w) > -1) s += fold(p.name).indexOf(w) > -1 ? 3 : 1; });
      return { p: p, s: s };
    }).filter(function (x) { return need || x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.p; });
  }

  function cards(list) {
    return '<div class="hstf-cards">' + list.map(function (p) {
      return '<div class="hstf-card"><a class="hstf-card-main" href="' + esc(p.url) + '"><img src="' + esc(p.img) + '" alt="" width="64" height="64" loading="lazy">' +
        '<span><b>' + esc(p.name) + '</b><small>' + esc(p.for) + '</small><em>' + (p.price ? esc(p.price) + (p.packs.length > 1 ? ' · ' + p.packs.length + ' pack sizes' : '') : 'Price on request') + '</em></span></a>' +
        (p.buy ? '<button type="button" class="hstf-add" data-buy="' + esc(p.s) + '" data-name="' + esc(p.name) + '">' + icon('bag') + 'Add to cart</button>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function list(items) { return items && items.length ? '<ul class="hstf-ul"><li>' + items.map(esc).join('</li><li>') + '</li></ul>' : ''; }

  /* ------------------------------------------------------------------ conversation state */
  var st = { mode: null, p: null, pack: 0, qty: 1 }, lastP = null;
  function reset() { st = { mode: null, p: null, pack: 0, qty: 1 }; }
  function packChips(p) { return p.packs.map(function (k) { return k.label + (k.price ? ' · ' + k.price : ''); }); }

  function startBuy(p, presetQty) {
    if (!p) { st.mode = 'pick'; st.qty = presetQty || 0; say('<p>Which product would you like to buy? Type its name, for example <i>Rheuma-Salve balm</i> or <i>Flu Gard</i>.</p>', ['Rheuma-Salve Pain Relief Balm', 'Alievaid Herbal Drops', 'Flu Gard', 'Melatonin 5mg', 'Cancel']); return; }
    lastP = p;
    if (!p.buy) { reset(); say('<p><b>' + esc(p.name) + '</b> is price on request, so it cannot be ordered online yet. Please <a class="hstf-link" href="' + esc(D.links.contact) + '">contact us</a> or ask at Guardian, Watsons or NHGP pharmacies.</p>'); return; }
    st = { mode: 'pack', p: p, pack: 0, qty: presetQty || 0 };
    if (p.packs.length > 1) {
      say('<p>Good choice: <b>' + esc(p.name) + '</b>' + (st.qty ? ' (' + st.qty + ')' : '') + '. Which pack size would you like?</p>', packChips(p).concat(['Cancel']));
    } else { afterPack(); }
  }
  /* quantity already given in the first message ("buy 3 ivy leaf drops") skips straight to confirmation */
  function afterPack() { if (st.qty) askConfirm(); else askQty(); }
  function askQty() {
    st.mode = 'qty';
    var k = st.p.packs[st.pack] || st.p.packs[0];
    say('<p><b>' + esc(st.p.name) + '</b>' + (st.p.packs.length > 1 ? ', ' + esc(k.label) : '') + ' at ' + esc(k.price || st.p.price) + ' each. How many would you like?</p>', ['1', '2', '3', '4', 'Cancel']);
  }
  function askConfirm() {
    st.mode = 'confirm';
    var k = st.p.packs[st.pack] || st.p.packs[0], each = num(k.price || st.p.price);
    say('<p>Add <b>' + st.qty + ' × ' + esc(st.p.name) + '</b>' + (st.p.packs.length > 1 ? ' (' + esc(k.label) + ')' : '') + ' to your cart? That is ' + money(each * st.qty) + '.</p>',
      ['Yes, add to cart', st.p.packs.length > 1 ? 'Change pack size' : 'Change quantity', 'Cancel']);
  }
  function doAdd() {
    var p = st.p, pack = st.pack, qty = st.qty;
    reset();
    cartApi('/add', { slug: p.s, pack: pack, qty: qty }).then(function (c) {
      paintHeader(c);
      say('<p><b>Added to your cart.</b></p>' + cartLines(c) + '<p>Ready to pay, or would you like anything else?</p>', ['Proceed to payment', 'Keep shopping', 'View cart']);
    }).catch(function (err) {
      var why = err && err.code === 'hst_price_on_request' ? ' This product is price on request.' : '';
      say('<p>Sorry, I could not add that to your cart.' + why + ' Please refresh the page and try again, or add it on the <a class="hstf-link" href="' + esc(p.url) + '">product page</a>.</p>');
    });
  }
  function showCart(goPay) {
    cartApi('').then(function (c) {
      paintHeader(c);
      if (!c.items) { say('<p>Your cart is empty. What would you like to buy?</p>', ['Buy a product', 'Joint or muscle pain', 'Sore throat or cough', 'Kids vitamins']); return; }
      if (goPay) {
        say('<p><b>Your order</b></p>' + cartLines(c) +
          '<p>Checkout asks for your delivery details, then payment on a secure page. Card details are never typed into this chat.</p>' +
          '<p><a class="hstf-cta" href="' + esc(c.checkout) + '">Proceed to secure checkout</a></p><p><a class="hstf-link" href="' + esc(c.cart_url) + '">Review or edit cart</a></p>', ['Keep shopping', 'Delivery']);
      } else {
        say('<p><b>Your cart</b></p>' + cartLines(c) + '<p><a class="hstf-link" href="' + esc(c.cart_url) + '">Open cart</a></p>', ['Proceed to payment', 'Keep shopping']);
      }
    }).catch(function () { say('<p>Sorry, I could not read your cart just now. <a class="hstf-link" href="' + esc(D.links.cart) + '">Open the cart page</a>.</p>'); });
  }
  function pickPack(raw, t) {
    var p = st.p, i;
    for (i = 0; i < p.packs.length; i++) { var lab = fold(p.packs[i].label); if (fold(raw).indexOf(lab) === 0 || t.indexOf(lab) > -1) return i; }
    for (var o in ORD) { if (new RegExp('\\b' + o + '\\b').test(t)) return ORD[o] < 0 ? p.packs.length - 1 : Math.min(ORD[o], p.packs.length - 1); }
    var keys = ['single', 'twin', 'triple', 'value', 'travel', 'bundle', 'sachet', 'box'];
    for (i = 0; i < keys.length; i++) if (t.indexOf(keys[i]) > -1) for (var j = 0; j < p.packs.length; j++) if (fold(p.packs[j].label).indexOf(keys[i]) > -1) return j;
    var m = t.match(/^\s*(\d)\s*$/); if (m && +m[1] >= 1 && +m[1] <= p.packs.length) return +m[1] - 1;
    return -1;
  }
  function pickQty(t) {
    var m = t.match(/\b(\d{1,2})\b/); if (m) return Math.max(1, Math.min(20, +m[1]));
    for (var w in NUMW) if (new RegExp('\\b' + w + '\\b').test(t)) return NUMW[w];
    return 0;
  }

  /* ------------------------------------------------------------------ answers */
  function productAnswer(p, aspect, caution) {
    lastP = p;
    var h = '<p><b>' + esc(p.name) + '</b> · ' + esc(p.brand) + (p.size ? ' · ' + esc(p.size) : '') + '</p>';
    if (aspect === 'price' || aspect === 'packs') {
      h += p.buy ? '<ul class="hstf-ul">' + p.packs.map(function (k) { return '<li>' + esc(k.label) + ': <b>' + esc(k.price) + '</b></li>'; }).join('') + '</ul><p class="hstf-note">Prices in SGD, GST included.</p>' : '<p>Price on request: please contact us or ask at your pharmacy.</p>';
    } else if (aspect === 'use') {
      h += '<p><b>How to use</b></p>' + (list(p.use) || '<p>Use as directed on the label.</p>');
    } else if (aspect === 'ing') {
      h += '<p><b>Active ingredients</b></p>' + (list(p.ing) || '<p>See the pack for the full ingredient list.</p>');
    } else if (aspect === 'halal') {
      h += '<p>' + (p.halal ? 'Yes, this product carries Halal (Malaysia) certification.' : 'Halal certification is not listed for this product. Please check the pack or contact us to confirm.') + '</p>';
    } else if (aspect === 'origin') {
      h += '<p>' + esc(p.origin || 'Origin is printed on the pack.') + '</p>';
    } else {
      h += '<p>' + esc(p.desc || p.tag) + '</p>' + (p.ben && p.ben.length ? '<p><b>Benefits</b></p>' + list(p.ben.slice(0, 4)) : '');
    }
    h += caution + '<p class="hstf-note">' + (p.ext ? 'External use only. ' : '') + 'Always read the label and follow directions for use.</p>' + cards([p]);
    return h;
  }

  function ask(raw) {
    add('user', esc(raw));
    setChips([]);
    load().then(function () { reply(raw); }).catch(function () {
      say('<p>Sorry, the assistant could not load right now. Please browse <a class="hstf-link" href="' + esc((cfg.endpoint || '').replace(/wp-json.*$/, 'shop/')) + '">all products</a> or try again in a moment.</p>');
    });
  }

  function reply(raw) {
    var t = norm(raw), L = D.links;

    if (RED.test(t)) { reset(); return say('<p><b>That sounds like it needs a doctor, not an online shop.</b> If it is an emergency, call <b>995</b> now. Otherwise please see a doctor or visit a polyclinic today.</p>'); }
    if (CANCEL.test(t) && st.mode) { reset(); return say('<p>No problem, I have cancelled that. What else can I help with?</p>'); }

    /* ---- inside the buying flow ---- */
    if (st.mode === 'pick') {
      var pp = findProduct(t) || (rankFor(t, null)[0] || null);
      if (pp) return startBuy(pp, st.qty);
      return say('<p>I could not find that product. Try part of the name, for example <i>balm</i>, <i>ivy leaf</i> or <i>melatonin</i>.</p>', ['Cancel']);
    }
    if (st.mode === 'pack') {
      var i = pickPack(raw, t);
      if (i > -1) { st.pack = i; return afterPack(); }
      return say('<p>Please choose one of these pack sizes:</p>', packChips(st.p).concat(['Cancel']));
    }
    if (st.mode === 'qty') {
      var q = pickQty(t);
      if (q) { st.qty = q; return askConfirm(); }
      return say('<p>How many would you like? You can type a number from 1 to 20.</p>', ['1', '2', '3', 'Cancel']);
    }
    if (st.mode === 'confirm') {
      if (YES.test(t)) return doAdd();
      if (/change pack/.test(t)) { st.mode = 'pack'; return say('<p>Which pack size?</p>', packChips(st.p).concat(['Cancel'])); }
      if (/change (quantity|qty|amount)|quantity/.test(t)) return askQty();
      var q2 = pickQty(t); if (q2) { st.qty = q2; return askConfirm(); }
      return say('<p>Shall I add it to your cart?</p>', ['Yes, add to cart', 'Cancel']);
    }

    /* ---- shopping actions ---- */
    if (/^keep shopping$/.test(t)) return say('<p>Sure. What else are you looking for?</p>');
    // questions about HOW to pay / where we ship come before the "proceed to payment" action
    if (/\b(paynow|credit card|debit card|card|paypal|grabpay|apple pay|google pay|cash on delivery|cod|installment|method|methods|accept)\b/.test(t)) {
      return say('<p>' + esc(D.facts.payment) + '</p>', ['Proceed to payment', 'View cart', 'Delivery']);
    }
    if (/\b(overseas|international|abroad|outside singapore|malaysia|indonesia|philippines|hong kong|ship to)\b/.test(t)) {
      return say('<p>' + esc(D.facts.overseas) + '</p><p><a class="hstf-link" href="' + esc(L.shipping || L.trade) + '">Shipping terms</a></p>');
    }
    if (/\b(who is|who are|what is) (hst|hst medical|this company|your company)\b|\babout (hst|you|the company)\b/.test(t)) {
      var ab0 = D.pages.about;
      return say('<p>' + esc(D.facts.about) + '</p>' + (ab0 ? '<p><a class="hstf-link" href="' + esc(ab0.url) + '">About HST Medical</a></p>' : ''));
    }
    if (/^(buy a product|i want to buy)$/.test(t)) return startBuy(null);
    if (CHECKOUT.test(t)) return showCart(true);
    if (CARTQ.test(t) && !BUY.test(t)) return showCart(false);
    if (BUY.test(t) || /\b(add (it|this|that|one))\b/.test(t)) {
      var bp = findProduct(t);
      if (!bp && /\b(it|this|that|this one|that one|same)\b/.test(t)) bp = lastP;
      if (!bp) { var ranked = rankFor(t, null); if (ranked.length && ranked.length <= 3) bp = ranked[0]; }
      // a quantity in the same sentence ("buy 3 ...", "two packs"), ignoring strengths like 50g / 5mg / 10ml
      return startBuy(bp, pickQty(t.replace(/\b\d+\s?(g|mg|ml|mcg|iu|s|x)\b/g, ' ')));
    }

    var caution = CAUTION.test(t) ? '<p class="hstf-note"><b>Please check first:</b> because you mentioned pregnancy, a young child, a medical condition or other medicines, ask a pharmacist or doctor before using any product.</p>' : '';

    /* ---- questions about a specific product (or "it") ---- */
    var aspect = null;
    for (var a = 0; a < ASPECT.length; a++) if (ASPECT[a].re.test(t)) { aspect = ASPECT[a].k; break; }
    var fp = findProduct(t);
    if (!fp && aspect && lastP && /\b(it|this|that|they|them|these|one)\b/.test(t)) fp = lastP;
    if (fp) return say(productAnswer(fp, aspect, caution), fp.buy ? ['Buy ' + shortName(fp), 'How do I use it?', 'Delivery'] : START);

    /* ---- store and company questions ---- */
    for (var n = 0; n < INTENTS.length; n++) {
      if (!INTENTS[n].re.test(t)) continue;
      var k = INTENTS[n].key;
      if (k === 'hello') return say('<p>Hello. What can I help you find today? You can describe a symptom, like <i>knee pain</i> or <i>sore throat</i>, or name a product.</p>');
      if (k === 'thanks') return say('<p>You are welcome. Anything else I can help you with?</p>');
      if (k === 'notes') return say('<p>Our health notes, written with HST Medical\'s pharmacists:</p><ul class="hstf-ul">' + D.notes.map(function (x) { return '<li><a class="hstf-link" href="' + esc(x.url) + '">' + esc(x.title) + '</a></li>'; }).join('') + '</ul>');
      if (k === 'about') { var ab = D.pages.about, br = D.pages.brands; return say('<p>' + esc(D.facts.about) + '</p>' + (ab ? '<p><a class="hstf-link" href="' + esc(ab.url) + '">About HST Medical</a></p>' : '') + (br ? '<p><a class="hstf-link" href="' + esc(br.url) + '">Our brands</a></p>' : '')); }
      if (k === 'privacy') return say('<p>' + esc((D.pages.privacy && D.pages.privacy.text) || 'We handle personal data under Singapore\'s PDPA.') + '</p><p><a class="hstf-link" href="' + esc(L.privacy) + '">Privacy policy</a></p>');
      var link = { telegram: [L.telegram, 'Open @hstmedical on Telegram'], promo: [L.store, 'Shop all products'], awards: [(D.pages.about && D.pages.about.url) || L.store, 'About HST Medical'], genuine: [L.where, 'See where to buy'], delivery: [L.shipping || L.store, 'Shipping terms'], where: [L.where, 'See where to buy'], trade: [L.trade, 'Trade enquiry form'], quality: [L.store, 'Browse the range'], contact: [L.contact, 'Contact us'], gst: [L.store, 'Browse the range'], returns: [L.contact, 'Contact customer service'], payment: [L.cart, 'View your cart'] }[k];
      return say('<p>' + esc(D.facts[k] || '') + '</p>' + (link ? '<p><a class="hstf-link" href="' + esc(link[0]) + '">' + esc(link[1]) + '</a></p>' : ''));
    }

    /* ---- symptom / need -> FAQ + products ---- */
    var words = t.split(/\s+/);
    var bestFaq = null, bf = 0;
    D.faqs.forEach(function (f) { var q = fold(f.q), s = 0; words.forEach(function (w) { if (w.length > 3 && q.indexOf(w) > -1) s++; }); if (s > bf) { bf = s; bestFaq = f; } });
    var need = null;
    for (var m = 0; m < NEEDS.length; m++) if (NEEDS[m].re.test(t)) { need = NEEDS[m]; break; }
    var ranked2 = rankFor(t, need);
    if (bestFaq && bf >= 2) {
      if (ranked2[0]) lastP = ranked2[0];
      return say('<p><b>' + esc(bestFaq.q) + '</b></p><p>' + esc(bestFaq.a) + '</p>' + caution + (ranked2.length ? cards(ranked2.slice(0, 2)) : ''));
    }
    if (ranked2.length) {
      lastP = ranked2[0];
      var cat = need ? D.cats[need.cat] : D.cats[ranked2[0].cat];
      return say('<p>' + (need ? 'These may help:' : 'Here is what I found:') + '</p>' + caution + cards(ranked2.slice(0, 3)) +
        (cat ? '<p><a class="hstf-link" href="' + esc(cat.url) + '">See all ' + esc(cat.name) + '</a></p>' : '') +
        '<p class="hstf-note">Always read the label and follow directions for use.</p>', ['Buy ' + shortName(ranked2[0]), 'Delivery', 'Something else']);
    }

    /* ---- did you mean ---- */
    var guess = rankFor(t.split(/\s+/).map(function (w) { return w.slice(0, 4); }).join(' '), null).slice(0, 3);
    return say('<p>Sorry, I am not sure I understood. ' + (guess.length ? 'Did you mean one of these?' : 'Try describing a symptom in a few words, or name a product.') + '</p>' + (guess.length ? cards(guess) : '') +
      '<p>You can also browse <a class="hstf-link" href="' + esc(L.store) + '">all products</a> or <a class="hstf-link" href="' + esc(L.contact) + '">contact us</a>.</p>');
  }
  function shortName(p) { return p.name.replace(/®/g, '').replace(/\s*\(.*\)$/, '').split(' ').slice(0, 4).join(' '); }

  // "Buy <name>" chips route into the buying flow with that product
  var origReply = reply;
  reply = function (raw) {
    var m = /^buy (.+)$/i.exec(raw.trim());
    if (m && !st.mode) {
      var target = fold(m[1]);
      for (var i = 0; i < D.products.length; i++) if (fold(shortName(D.products[i])) === target) return startBuy(D.products[i]);
    }
    return origReply(raw);
  };
})();
