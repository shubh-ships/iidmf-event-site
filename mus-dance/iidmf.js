/*!
 * 12th India International Dance & Music Festival — landing page script
 * No dependencies. Everything is scoped to #iidmf.
 * Set the Supabase function URL with data-function-url on #iidmf.
 */
(function () {
  'use strict';

  var root = document.getElementById('iidmf');
  if (!root) return;

  var FUNCTION_URL = root.getAttribute('data-function-url') || '';
  var LOGO_URL = root.getAttribute('data-logo') || '';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DAY_LABELS = {
    '2026-12-04': { short: 'Fri, 4 Dec', long: 'Friday 4' },
    '2026-12-05': { short: 'Sat, 5 Dec', long: 'Saturday 5' },
    '2026-12-06': { short: 'Sun, 6 Dec', long: 'Sunday 6' }
  };

  function $(sel, ctx) { return (ctx || root).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || root).querySelectorAll(sel)); }
  function svgIcon(path) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  /* ------------------------------------------------------------------
   * In-page links: smooth scroll without touching the host's settings
   * ------------------------------------------------------------------ */
  root.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#iidmf-"]');
    if (!a) return;
    var target = document.getElementById(a.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', a.getAttribute('href'));
  });

  /* ------------------------------------------------------------------
   * Photo carousel inside each country card
   * ------------------------------------------------------------------ */
  $$('.iidmf-country__media').forEach(function (media) {
    var card = media.closest('.iidmf-country');
    var name = $('.iidmf-country__name', card).textContent.trim();
    var altBase = media.getAttribute('data-alt') || name;
    var character = media.getAttribute('data-character');
    var paths = (media.getAttribute('data-photos') || '')
      .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

    // Sunburst backdrop with the country name, shown until a slide covers it
    var placeholder = document.createElement('div');
    placeholder.className = 'iidmf-photo-ph';
    var phName = document.createElement('span');
    phName.textContent = name;
    placeholder.appendChild(phName);
    media.appendChild(placeholder);

    // Slides: the illustrated character first (if any), then the photos
    var sources = [];
    if (character) sources.push({ src: character, alt: media.getAttribute('data-character-alt') || 'Illustration: ' + altBase, character: true });
    paths.forEach(function (src, i) {
      sources.push({ src: src, alt: altBase + ', photo ' + (i + 1) });
    });
    if (!sources.length) return;

    var slides = [];
    var current = 0;

    var nav = document.createElement('div');
    nav.className = 'iidmf-photo-nav';
    nav.hidden = true;
    nav.innerHTML =
      '<button type="button" aria-label="Previous picture of ' + name + '">' + svgIcon('M15 5l-7 7 7 7') + '</button>' +
      '<span class="iidmf-photo-count" aria-live="polite"></span>' +
      '<button type="button" aria-label="Next picture of ' + name + '">' + svgIcon('M9 5l7 7-7 7') + '</button>';
    var buttons = nav.querySelectorAll('button');
    var count = nav.querySelector('.iidmf-photo-count');

    function refresh() {
      if (current >= slides.length) current = 0;
      slides.forEach(function (img, k) { img.classList.toggle('is-on', k === current); });
      var shown = slides[current];
      // hide the country name once the current picture has loaded
      placeholder.classList.toggle('is-covered', !!(shown && shown.complete && shown.naturalWidth > 0));
      nav.hidden = slides.length < 2;
      count.textContent = slides.length ? (current + 1) + ' / ' + slides.length : '';
    }

    sources.forEach(function (item) {
      var img = document.createElement('img');
      img.className = 'iidmf-photo' + (item.character ? ' iidmf-photo--character' : '');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = item.alt;
      img.addEventListener('load', refresh);
      img.addEventListener('error', function () {
        // a missing photo simply drops out of the slider
        var k = slides.indexOf(img);
        if (k > -1) { slides.splice(k, 1); if (k < current) current--; }
        img.remove();
        refresh();
      });
      img.src = item.src;
      slides.push(img);
      media.appendChild(img);
    });
    media.appendChild(nav);

    buttons[0].addEventListener('click', function () { current = (current - 1 + slides.length) % slides.length; refresh(); });
    buttons[1].addEventListener('click', function () { current = (current + 1) % slides.length; refresh(); });
    refresh();
  });

  /* ------------------------------------------------------------------
   * Overlapping country cards
   * ------------------------------------------------------------------ */
  (function () {
    var track = $('.iidmf-countries__track');
    if (!track) return;
    var cards = $$('.iidmf-country', track);
    var prev = $('[data-iidmf-prev]');
    var next = $('[data-iidmf-next]');
    var active = 0;
    var ticking = false;

    function stack() {
      cards.forEach(function (c, i) {
        c.style.zIndex = String(cards.length - Math.abs(i - active));
        c.classList.toggle('is-active', i === active);
      });
      if (prev) prev.disabled = active === 0;
      if (next) next.disabled = active === cards.length - 1;
    }

    function findActive() {
      ticking = false;
      var start = track.getBoundingClientRect().left + parseFloat(getComputedStyle(track).scrollPaddingLeft || 0);
      var best = 0, bestDist = Infinity;
      cards.forEach(function (c, i) {
        var d = Math.abs(c.getBoundingClientRect().left - start);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best !== active) { active = best; stack(); }
    }

    function go(i) {
      i = Math.max(0, Math.min(cards.length - 1, i));
      var start = parseFloat(getComputedStyle(track).scrollPaddingLeft || 0);
      track.scrollTo({ left: cards[i].offsetLeft - start, behavior: reduceMotion ? 'auto' : 'smooth' });
      active = i; stack();
    }

    track.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(findActive); }
    }, { passive: true });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
    });
    if (prev) prev.addEventListener('click', function () { go(active - 1); });
    if (next) next.addEventListener('click', function () { go(active + 1); });
    stack();
  })();

  /* ------------------------------------------------------------------
   * State-wise itinerary toggle
   * ------------------------------------------------------------------ */
  (function () {
    var btn = $('[data-iidmf-tour-toggle]');
    if (!btn) return;
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    var label = $('[data-iidmf-tour-label]', btn);
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      label.textContent = open ? 'Hide state-wise itinerary' : 'Explore state-wise itinerary';
      if (open) panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  })();

  /* ------------------------------------------------------------------
   * Programme: day tabs (shown on phones only, see the CSS)
   * ------------------------------------------------------------------ */
  (function () {
    var days = $('.iidmf-programme__days');
    if (!days) return;
    var panels = $$('.iidmf-day', days);
    if (panels.length < 2) return;
    var names = { '2026-12-04': 'Fri 4', '2026-12-05': 'Sat 5', '2026-12-06': 'Sun 6' };

    var bar = document.createElement('div');
    bar.className = 'iidmf-daytabs';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Choose an evening');

    var buttons = panels.map(function (panel, i) {
      var key = panel.id.replace('iidmf-day-', '');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'iidmf-daytab';
      b.setAttribute('aria-controls', panel.id);
      b.appendChild(document.createTextNode(names[key] || 'Day ' + (i + 1)));
      var small = document.createElement('small');
      small.textContent = 'December';
      b.appendChild(small);
      b.addEventListener('click', function () { select(i); });
      bar.appendChild(b);
      return b;
    });

    function select(i) {
      panels.forEach(function (p, k) { p.classList.toggle('is-current', k === i); });
      buttons.forEach(function (b, k) { b.setAttribute('aria-pressed', String(k === i)); });
    }

    // During the festival, open on today's evening (India time)
    var today = '';
    try { today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); } catch (e) {}
    var start = Math.max(0, panels.findIndex ? panels.findIndex(function (p) { return p.id === 'iidmf-day-' + today; }) : 0);

    days.parentNode.insertBefore(bar, days);
    days.setAttribute('data-tabs', '');
    select(start);
  })();

  /* ------------------------------------------------------------------
   * Registration form
   * ------------------------------------------------------------------ */
  var form = $('[data-iidmf-form]');
  if (!form) return;

  var startedAt = Date.now();
  var statusEl = $('[data-iidmf-status]');
  var submitBtn = $('[data-iidmf-submit]');
  var successEl = $('[data-iidmf-success]');
  var currentPassUrl = null;

  var FIELDS = {
    full_name: { el: form.elements.full_name, err: 'iidmf-name-err' },
    email:     { el: form.elements.email,     err: 'iidmf-email-err' },
    phone:     { el: form.elements.phone,     err: 'iidmf-phone-err' },
    days:      { el: $('.iidmf-days', form),  err: 'iidmf-days-err', focus: function () { form.querySelector('input[name="days"]').focus(); } },
    consent:   { el: form.elements.consent,   err: 'iidmf-consent-err' }
  };

  function setError(key, msg) {
    var f = FIELDS[key];
    if (!f) return;
    document.getElementById(f.err).textContent = msg || '';
    if (msg) f.el.setAttribute('aria-invalid', 'true'); else f.el.removeAttribute('aria-invalid');
  }
  function focusField(key) {
    var f = FIELDS[key];
    if (!f) return;
    if (f.focus) f.focus(); else f.el.focus();
  }
  function clearErrors() {
    Object.keys(FIELDS).forEach(function (k) { setError(k, ''); });
    statusEl.textContent = '';
  }

  function normalisePhone(v) {
    return String(v || '').replace(/[\s-]/g, '').replace(/^(\+91|0091|91|0)(?=\d{10}$)/, '');
  }

  function collect() {
    return {
      full_name: form.elements.full_name.value.trim().replace(/\s+/g, ' '),
      email: form.elements.email.value.trim().toLowerCase(),
      phone: normalisePhone(form.elements.phone.value),
      city: '',
      days: $$('input[name="days"]:checked', form).map(function (i) { return i.value; }),
      attendees: 1, // one invite per registration
      consent: form.elements.consent.checked,
      website: form.elements.website.value,
      elapsed_ms: Date.now() - startedAt
    };
  }

  function validate(d) {
    var errors = {};
    if (d.full_name.length < 2 || !/^[A-Za-z\u00C0-\u024F\u0900-\u097F][A-Za-z\u00C0-\u024F\u0900-\u097F .'-]*$/.test(d.full_name)) {
      errors.full_name = 'Enter your full name using letters only.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.email)) errors.email = 'Enter a valid email address, like name@example.com.';
    if (!/^[6-9]\d{9}$/.test(d.phone)) errors.phone = 'Enter a 10-digit Indian mobile number.';
    if (!d.days.length) errors.days = 'Choose at least one evening.';
    if (!d.consent) errors.consent = 'Please agree to the use of your details to issue your invite.';
    return errors;
  }

  // Clear a field's error as soon as the person fixes it
  form.addEventListener('input', function (e) {
    var name = e.target.name;
    if (name && FIELDS[name]) setError(name, '');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();

    var data = collect();
    var errors = validate(data);
    var keys = Object.keys(errors);
    if (keys.length) {
      keys.forEach(function (k) { setError(k, errors[k]); });
      focusField(keys[0]);
      return;
    }
    if (!FUNCTION_URL || FUNCTION_URL.indexOf('YOUR-PROJECT-REF') !== -1) {
      statusEl.textContent = 'Registration isn’t connected yet. Set data-function-url on the #iidmf element.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering…';

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 20000);

    fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (!r.ok || !r.body.ticket_code) {
          var msg = r.body.error || 'Could not register right now. Please try again in a few minutes.';
          if (r.body.field && FIELDS[r.body.field]) {
            setError(r.body.field, msg);
            focusField(r.body.field);
          } else {
            statusEl.textContent = msg;
          }
          return;
        }
        return showPass(r.body);
      })
      .catch(function (err) {
        statusEl.textContent = err && err.name === 'AbortError'
          ? 'The connection timed out. Check your internet connection and try again.'
          : 'Could not reach the registration service. Check your internet connection and try again.';
      })
      .then(function () {
        clearTimeout(timer);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Get my invite';
      });
  });

  $('[data-iidmf-again]').addEventListener('click', function () {
    form.reset();
    clearErrors();
    startedAt = Date.now();
    if (currentPassUrl) { URL.revokeObjectURL(currentPassUrl); currentPassUrl = null; }
    successEl.hidden = true;
    form.hidden = false;
    form.elements.full_name.focus();
  });

  function showPass(ticket) {
    return drawPass(ticket).then(function (canvas) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (currentPassUrl) URL.revokeObjectURL(currentPassUrl);
          currentPassUrl = URL.createObjectURL(blob);

          var img = $('[data-iidmf-pass-img]');
          img.src = currentPassUrl;
          img.alt = 'Invitation pass for ' + ticket.full_name + ', pass code ' + ticket.ticket_code +
            ', admits ' + ticket.attendees + ', for ' + formatDays(ticket.days, 'long') + ' December 2026.';

          var dl = $('[data-iidmf-download]');
          dl.href = currentPassUrl;
          dl.setAttribute('download', 'IIDMF-2026-pass-' + ticket.ticket_code.replace(/^IIDMF-/, '') + '.png');

          $('[data-iidmf-success-h]').textContent = ticket.existing ? 'You’re already registered' : 'Your invite is ready';
          $('[data-iidmf-success-p]').textContent = ticket.existing
            ? 'Here is the pass you registered for earlier. Download it and keep it handy for the entry gate.'
            : 'Download your pass and keep it handy for the entry gate. Your pass code is ' + ticket.ticket_code + '.';

          form.hidden = true;
          successEl.hidden = false;
          successEl.focus();
          successEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
          resolve();
        }, 'image/png');
      });
    });
  }

  function formatDays(days, kind) {
    var labels = (days || []).slice().sort().map(function (d) { return DAY_LABELS[d] ? DAY_LABELS[d][kind] : d; });
    if (labels.length <= 1) return labels.join('');
    return labels.slice(0, -1).join(', ') + ' & ' + labels[labels.length - 1];
  }

  /* ------------------------------------------------------------------
   * The pass: drawn on a canvas, saved as PNG
   * ------------------------------------------------------------------ */
  var C = {
    purple: '#440d9f', purpleInk: '#2e0874', magenta: '#f72973', magentaDeep: '#d4145f',
    sun: '#fed507', orange: '#ff7a1a', cyan: '#1577fc', violet: '#6112cf',
    indigo: '#4e09ba', paper: '#fff9e6', ink: '#22093f', muted: '#5d4b72'
  };
  var SERIF = '"Montserrat", "Segoe UI", Arial, sans-serif';           // headings (heavy weights)
  var SANS = '"Montserrat", "Segoe UI", Arial, sans-serif';
  var FUN = '"Luckiest Guy", "Arial Black", Impact, sans-serif';       // the poster's chunky lettering

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load('400 40px "Luckiest Guy"'),
      document.fonts.load('800 40px "Montserrat"'),
      document.fonts.load('500 20px "Montserrat"'),
      document.fonts.load('700 20px "Montserrat"')
    ]).catch(function () {});
  }

  var logoPromise = null;
  function loadLogo() {
    if (!LOGO_URL) return Promise.resolve(null);
    if (!logoPromise) {
      logoPromise = new Promise(function (resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = LOGO_URL;
      });
    }
    return logoPromise;
  }

  function wrap(ctx, text, maxWidth) {
    var words = String(text).split(' ');
    var lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function fitText(ctx, text, weightFamily, startSize, maxWidth, minSize) {
    var size = startSize;
    ctx.font = weightFamily.replace('{s}', size);
    while (ctx.measureText(text).width > maxWidth && size > minSize) {
      size -= 2;
      ctx.font = weightFamily.replace('{s}', size);
    }
    return size;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPortrait(t, logo) {
    var W = 900, H = 1600, R = 40, SPLIT = 590, BAND = 160, NOTCH = 30;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.save();
    roundRect(ctx, 0, 0, W, H, R);
    ctx.clip();
    var hg = ctx.createLinearGradient(0, 0, W, SPLIT);
    hg.addColorStop(0, C.indigo); hg.addColorStop(1, C.purple);
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, SPLIT);
    var glow = ctx.createRadialGradient(W / 2, -60, 20, W / 2, -60, 520);
    glow.addColorStop(0, 'rgba(229,9,127,0.45)'); glow.addColorStop(1, 'rgba(229,9,127,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, SPLIT);
    ctx.fillStyle = C.paper; ctx.fillRect(0, SPLIT, W, H - SPLIT - BAND);
    var sun = ctx.createRadialGradient(W - 40, SPLIT + 40, 10, W - 40, SPLIT + 40, 380);
    sun.addColorStop(0, 'rgba(255,229,0,0.5)'); sun.addColorStop(1, 'rgba(255,229,0,0)');
    ctx.fillStyle = sun; ctx.fillRect(0, SPLIT, W, H - SPLIT - BAND);
    ctx.fillStyle = C.magenta; ctx.fillRect(0, H - BAND, W, BAND);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(0, SPLIT, NOTCH, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W, SPLIT, NOTCH, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(61,10,114,0.55)'; ctx.lineWidth = 4; ctx.setLineDash([4, 14]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(NOTCH + 16, SPLIT); ctx.lineTo(W - NOTCH - 16, SPLIT); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Header: logo, pass code, admits
    var cx = W / 2, y = 60;
    ctx.textAlign = 'center';
    if (logo) {
      var lh = 116, lw = lh * logo.naturalWidth / logo.naturalHeight; // keep the emblem's proportions
      ctx.drawImage(logo, cx - lw / 2, y, lw, lh);
      y += lh + 58;
    } else { y += 40; }
    ctx.fillStyle = '#e9d6ff'; ctx.font = '600 30px ' + SANS;
    ctx.fillText('Pass code', cx, y);
    var code = String(t.ticket_code), parts = code.split('-');
    ctx.fillStyle = '#ffffff'; ctx.font = '600 38px ' + SERIF;
    ctx.fillText(parts[0] + '-', cx, y + 52);
    ctx.fillStyle = C.sun;
    var cs = fitText(ctx, parts[1] || code, '400 {s}px ' + FUN, 150, W - 140, 60);
    ctx.font = '400 ' + cs + 'px ' + FUN;
    ctx.fillText(parts[1] || code, cx, y + 52 + cs);
    var admits = t.attendees > 1 ? 'Admits ' + t.attendees + ' people' : 'Admits 1 person';
    ctx.font = '700 32px ' + SANS;
    var aw = ctx.measureText(admits).width + 64, ay = SPLIT - 100;
    ctx.strokeStyle = C.sun; ctx.lineWidth = 3;
    roundRect(ctx, cx - aw / 2, ay, aw, 60, 30); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(admits, cx, ay + 41);

    // Body
    var x = 70, cw = W - 140;
    ctx.textAlign = 'left';
    y = SPLIT + 92;
    ctx.fillStyle = C.magentaDeep; ctx.font = '700 28px ' + SANS;
    ctx.fillText('Invitation pass', x, y);
    ctx.fillStyle = C.purple; ctx.font = '800 54px ' + SERIF;
    var tl = wrap(ctx, '12th India International Dance & Music Festival', cw);
    tl.forEach(function (l, i) { ctx.fillText(l, x, y + 74 + i * 70); });
    y += 74 + (tl.length - 1) * 70 + 44;
    ctx.lineCap = 'round'; ctx.lineWidth = 7;
    [[C.cyan, 0, 18, 14, 8], [C.sun, 30, 20, 40, 4], [C.magenta, 58, 22, 58, 4], [C.orange, 74, 4, 84, 20], [C.violet, 98, 10, 112, 18]]
      .forEach(function (b) { ctx.strokeStyle = b[0]; ctx.beginPath(); ctx.moveTo(x + b[1], y + b[2] - 12); ctx.lineTo(x + b[3], y + b[4] - 12); ctx.stroke(); });

    function field(label, value, fy) {
      ctx.fillStyle = C.muted; ctx.font = '600 26px ' + SANS;
      ctx.fillText(label, x, fy);
      ctx.fillStyle = C.ink;
      // shrink slightly to keep one line; only very long values wrap (max two lines)
      var fs = fitText(ctx, value, '700 {s}px ' + SANS, 38, cw, 30);
      ctx.font = '700 ' + fs + 'px ' + SANS;
      var lines = ctx.measureText(value).width <= cw ? [value] : wrap(ctx, value, cw);
      lines.slice(0, 2).forEach(function (l, i) { ctx.fillText(l, x, fy + 48 + i * 44); });
      return fy + 48 + (Math.min(lines.length, 2) - 1) * 44 + 66;
    }
    y += 58;
    y = field('Name', t.full_name, y);
    y = field('Evenings', formatDays(t.days, 'long') + ' December 2026', y);
    y = field('Time', '5:30 PM onwards', y);
    y = field('Venue', 'Central Park, Connaught Place, New Delhi', y);

    ctx.fillStyle = C.muted; ctx.font = '500 24px ' + SANS;
    var es = fitText(ctx, 'Registered email: ' + t.email, '500 {s}px ' + SANS, 24, cw, 16);
    ctx.font = '500 ' + es + 'px ' + SANS;
    ctx.fillText('Registered email: ' + t.email, x, H - BAND - 40);

    // Band
    ctx.fillStyle = C.sun; ctx.font = '400 50px ' + FUN;
    ctx.fillText('Free entry', x, H - BAND + 68);
    ctx.fillStyle = '#ffffff';
    var note = 'Show this pass at the entry gate, on your phone or printed.';
    var ns = fitText(ctx, note, '600 {s}px ' + SANS, 26, cw, 18);
    ctx.font = '600 ' + ns + 'px ' + SANS;
    ctx.fillText(note, x, H - BAND + 116);

    return canvas;
  }

  function drawPass(t) {
    return Promise.all([fontsReady(), loadLogo()]).then(function (loaded) {
      var logo = loaded[1];
      // Phones get a tall pass that fills the screen at the gate; larger screens get a printable one
      if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) return drawPortrait(t, logo);
      var W = 1600, H = 760, STUB = 440, R = 28, NOTCH = 26;
      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d');
      var mainW = W - STUB;

      // Body shape with notches where the stub tears off
      ctx.save();
      roundRect(ctx, 0, 0, W, H, R);
      ctx.clip();
      ctx.fillStyle = C.paper; ctx.fillRect(0, 0, mainW, H);
      var sg = ctx.createLinearGradient(mainW, 0, W, H);
      sg.addColorStop(0, C.indigo); sg.addColorStop(1, C.purple);
      ctx.fillStyle = sg; ctx.fillRect(mainW, 0, STUB, H);

      // Magenta band at the bottom of the main part
      ctx.fillStyle = C.magenta; ctx.fillRect(0, H - 96, mainW, 96);
      // poster-style sun glow, top right of the main part
      var glow = ctx.createRadialGradient(mainW - 60, -40, 10, mainW - 60, -40, 360);
      glow.addColorStop(0, 'rgba(255,229,0,0.55)'); glow.addColorStop(1, 'rgba(255,229,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, mainW, H - 96);

      // Notches
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(mainW, 0, NOTCH, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mainW, H, NOTCH, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Perforation
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4; ctx.setLineDash([4, 14]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mainW, NOTCH + 14); ctx.lineTo(mainW, H - NOTCH - 14); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      var x = 80, contentW = mainW - 160;

      // Heading
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.magentaDeep;
      ctx.font = '700 28px ' + SANS;
      ctx.fillText('Invitation pass', x, 92);

      ctx.fillStyle = C.purple;
      ctx.font = '800 52px ' + SERIF;
      var titleLines = wrap(ctx, '12th India International Dance & Music Festival', contentW);
      titleLines.forEach(function (l, i) { ctx.fillText(l, x, 158 + i * 62); });
      var y = 158 + (titleLines.length - 1) * 62;

      // Confetti burst, as on the poster
      y += 40;
      ctx.lineCap = 'round'; ctx.lineWidth = 7;
      [[C.cyan, 0, 18, 14, 8], [C.sun, 30, 20, 40, 4], [C.magenta, 58, 22, 58, 4], [C.orange, 74, 4, 84, 20], [C.violet, 98, 10, 112, 18]]
        .forEach(function (b) { ctx.strokeStyle = b[0]; ctx.beginPath(); ctx.moveTo(x + b[1], y + b[2] - 12); ctx.lineTo(x + b[3], y + b[4] - 12); ctx.stroke(); });

      // Details grid
      function field(label, value, fx, fy, maxW, size) {
        ctx.fillStyle = C.muted; ctx.font = '600 22px ' + SANS;
        ctx.fillText(label, fx, fy);
        ctx.fillStyle = C.ink;
        var s = fitText(ctx, value, '700 {s}px ' + SANS, size || 36, maxW, 22);
        ctx.font = '700 ' + s + 'px ' + SANS;
        ctx.fillText(value, fx, fy + s + 8);
      }

      y += 66;
      field('Name', t.full_name, x, y, contentW);
      y += 104;
      field('Evenings', formatDays(t.days, 'long') + ' December 2026', x, y, contentW * 0.62, 30);
      field('Time', '5:30 PM onwards', x + contentW * 0.66, y, contentW * 0.34, 30);
      y += 100;
      field('Venue', 'Central Park, Connaught Place, New Delhi', x, y, contentW, 30);

      // Band text
      ctx.fillStyle = C.sun;
      ctx.font = '400 34px ' + FUN;
      ctx.fillText('Free entry', x, H - 36);
      var bandNote = 'Show this pass at the entry gate, on your phone or printed.';
      var noteX = x + ctx.measureText('Free entry').width + 36; // measured in the serif font set above
      var noteW = mainW - noteX - 50;
      ctx.fillStyle = '#ffffff';
      var noteSize = fitText(ctx, bandNote, '600 {s}px ' + SANS, 22, noteW, 15);
      ctx.font = '600 ' + noteSize + 'px ' + SANS;
      ctx.fillText(bandNote, noteX, H - 40);

      // Stub
      var sx = mainW + STUB / 2;
      var top = 70;
      if (logo) {
        var lh = 96, lw = lh * logo.naturalWidth / logo.naturalHeight; // keep the emblem's proportions
        ctx.drawImage(logo, sx - lw / 2, 48, lw, lh);
        top = 48 + lh + 30;
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9c9da';
      ctx.font = '500 24px ' + SANS;
      ctx.fillText('Pass code', sx, top + 24);

      var code = String(t.ticket_code);
      var parts = code.split('-');
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 28px ' + SERIF;
      ctx.fillText(parts[0] + '-', sx, top + 64);
      ctx.fillStyle = C.sun;
      var codeSize = fitText(ctx, parts[1] || code, '400 {s}px ' + FUN, 72, STUB - 70, 40);
      ctx.font = '400 ' + codeSize + 'px ' + FUN;
      ctx.fillText(parts[1] || code, sx, top + 64 + codeSize + 4);

      // Admits circle
      var cy = top + 64 + codeSize + 4 + 110;
      ctx.strokeStyle = 'rgba(255,229,0,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, cy, 72, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '400 80px ' + FUN;
      ctx.fillText(String(t.attendees), sx, cy + 27);
      ctx.fillStyle = '#e9c9da';
      ctx.font = '500 24px ' + SANS;
      ctx.fillText(t.attendees > 1 ? 'Admits ' + t.attendees + ' people' : 'Admits 1 person', sx, cy + 112);

      ctx.fillStyle = '#e9c9da';
      ctx.font = '400 18px ' + SANS;
      ctx.fillText('Registered email', sx, H - 76);
      ctx.fillStyle = '#ffffff';
      var emailSize = fitText(ctx, t.email, '500 {s}px ' + SANS, 22, STUB - 60, 13);
      ctx.font = '500 ' + emailSize + 'px ' + SANS;
      ctx.fillText(t.email, sx, H - 44);
      ctx.textAlign = 'left';

      return canvas;
    });
  }
})();
