// Phone pick-list panel (John, 2026-11-27). On phones, every type-to-search
// picker opens this panel instead of a small list under the box: big rows,
// grouped headings, a search box at the top that narrows the list as you type
// (no keyboard until you tap it), a close X, tap outside to close. Desktop
// keeps the inline lists. Native <select>s already get the iOS picker and are
// left alone.
//
// PhonePicker.open({
//   title:       'Add a role',
//   placeholder: 'Search roles',
//   groups:      function (query) { return [{ label, items: [{ id, label, meta }] }]; },
//   actions:     function (query) { return [{ label, run: function (query) {} }]; },  // optional rows at the bottom ("+ Add ...", 'Use "..."')
//   selectedId:  id,                    // optional: checkmark on the current value
//   clearLabel:  'Clear', onClear: fn,  // optional row at the top (field has a value)
//   emptyText:   'No roles match',       // optional
//   onPick:      function (id) {},
// })
//
// PhonePicker.bind(input, getOpts, wants): on phones the input becomes a
//   tap target (read-only, so no keyboard) that opens the panel with
//   getOpts(). wants() (optional) is asked on each tap: false = behave as a
//   normal text box this time (e.g. State for a country with no state list).
// PhonePicker.bindText(input, cfg): bind() for free-text boxes with
//   suggestions (old <datalist>s): picking, 'Use "typed"' or Clear set the
//   box's value and fire input + change, so the page's own handlers save it.
//   cfg = { title, placeholder, options: fn -> [{ value, meta }], groupLabel, clearLabel }
window.PhonePicker = (function () {
  var MQ = '(max-width:768px), (max-height:500px) and (pointer:coarse)'; // same as PHONE_MQ in app.js
  var el = null, opts = null, query = '';

  function isPhone() { return window.matchMedia(MQ).matches; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function build() {
    el = document.createElement('div');
    el.className = 'pp-overlay';
    el.innerHTML =
      '<div class="pp-sheet" role="dialog" aria-modal="true">' +
        '<div class="pp-head"><div class="pp-title"></div>' +
          '<button type="button" class="close-x pp-close" aria-label="Close" title="Close"><i data-lucide="x" class="lucide"></i></button></div>' +
        '<div class="pp-search"><input type="search" class="pp-q" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"></div>' +
        '<div class="pp-list"></div>' +
      '</div>';
    document.body.appendChild(el);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [el] });
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target.closest('.pp-close')) return close();
      var row = e.target.closest('[data-pp]');
      if (!row) return;
      var o = opts, q = query.trim(), kind = row.getAttribute('data-pp');
      var acts = kind === 'act' && o.actions ? o.actions(q) : null; // read before close() clears opts
      close();
      if (kind === 'clear') { if (o.onClear) o.onClear(); return; }
      if (kind === 'act') { var a = acts && acts[Number(row.getAttribute('data-i'))]; if (a) a.run(q); return; }
      var id = row.getAttribute('data-id');
      o.onPick(row.getAttribute('data-num') === '1' ? Number(id) : id);
    });
    el.querySelector('.pp-q').addEventListener('input', function (e) { query = e.target.value; render(); el.querySelector('.pp-list').scrollTop = 0; });
    el.querySelector('.pp-q').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } // "Done" on the keyboard: hide it, keep the list
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    // iOS doesn't shrink the page for the keyboard: fit the panel to the
    // visible area so the list stays above the keyboard.
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', fit);
      visualViewport.addEventListener('scroll', fit);
    }
  }
  function fit() {
    if (!el || !el.classList.contains('open') || !window.visualViewport) return;
    el.style.top = visualViewport.offsetTop + 'px';
    el.style.height = visualViewport.height + 'px';
  }

  function render() {
    var list = el.querySelector('.pp-list');
    var q = query.trim();
    var groups = opts.groups(q) || [];
    var html = '', n = 0;
    if (opts.clearLabel && !q) html += '<button type="button" class="pp-row pp-clear" data-pp="clear">' + esc(opts.clearLabel) + '</button>';
    groups.forEach(function (g) {
      if (!g.items.length) return;
      if (g.label) html += '<div class="pp-group">' + esc(g.label) + '</div>';
      g.items.forEach(function (it) {
        n++;
        var sel = opts.selectedId != null && opts.selectedId !== '' && String(it.id) === String(opts.selectedId);
        html += '<button type="button" class="pp-row' + (sel ? ' selected' : '') + '" data-pp="pick" data-id="' + esc(it.id) + '" data-num="' + (typeof it.id === 'number' ? 1 : 0) + '">' +
          '<span class="pp-label">' + esc(it.label) + '</span>' +
          (it.meta ? '<span class="pp-meta">' + esc(it.meta) + '</span>' : '') +
          (sel ? '<span class="pp-check" aria-hidden="true">&#x2713;</span>' : '') + '</button>';
      });
    });
    var acts = opts.actions ? opts.actions(q) || [] : [];
    acts.forEach(function (a, i) { html += '<button type="button" class="pp-row pp-act" data-pp="act" data-i="' + i + '">' + esc(a.label) + '</button>'; });
    if (!n && !acts.length) html += '<div class="pp-empty">' + esc(opts.emptyText || 'Nothing matches') + '</div>';
    list.innerHTML = html;
  }

  function open(o) {
    if (!el) build();
    opts = o; query = '';
    el.querySelector('.pp-title').textContent = o.title || '';
    var q = el.querySelector('.pp-q');
    q.value = ''; q.placeholder = o.placeholder || 'Search';
    render();
    el.classList.add('open');
    document.documentElement.classList.add('pp-lock');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // no keyboard until the search box is tapped
    fit();
    el.querySelector('.pp-list').scrollTop = 0;
    var sel = el.querySelector('.pp-row.selected');
    if (sel) sel.scrollIntoView({ block: 'center' });
  }
  function close() {
    if (!el) return;
    el.querySelector('.pp-q').blur();
    el.classList.remove('open');
    el.style.top = ''; el.style.height = '';
    document.documentElement.classList.remove('pp-lock');
    opts = null;
  }
  function isOpen() { return !!(el && el.classList.contains('open')); }

  function bind(input, getOpts, wants) {
    if (!input || input._ppBound) return;
    input._ppBound = true;
    input.classList.add('pp-field');
    // Read-only only while it's ours to open (decided again on every tap), so
    // other code's own readonly/disabled use is left alone.
    function decide() {
      var want = isPhone() && !input.disabled && (!wants || wants());
      if (want && !input.readOnly) { input.readOnly = true; input._ppRO = true; }
      else if (want) input._ppRO = true;
      else if (input._ppRO) { input.readOnly = false; input._ppRO = false; }
    }
    decide();
    input.addEventListener('touchstart', decide, { passive: true });
    input.addEventListener('mousedown', decide);
    input.addEventListener('click', function (e) {
      if (!input._ppRO || !isPhone()) return;
      e.preventDefault(); e.stopPropagation();
      var o = getOpts();
      if (o) open(o);
    });
  }

  function setValue(input, v) {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function bindText(input, cfg) {
    bind(input, function () {
      var cur = input.value.trim();
      function has(v) { var k = v.toLowerCase(); return cfg.options().some(function (o) { return o.value.toLowerCase() === k; }); }
      return {
        title: cfg.title, placeholder: cfg.placeholder || 'Search or type',
        selectedId: cur,
        clearLabel: cur ? (cfg.clearLabel || 'Clear') : null,
        onClear: function () { setValue(input, ''); },
        groups: function (q) {
          var k = q.toLowerCase();
          var items = cfg.options().filter(function (o) { return !k || (o.value + ' ' + (o.meta || '')).toLowerCase().indexOf(k) !== -1; })
            .map(function (o) { return { id: o.value, label: o.value, meta: o.meta }; });
          var out = [];
          if (cur && !k && !has(cur)) out.push({ label: 'Current', items: [{ id: cur, label: cur }] });
          out.push({ label: cfg.groupLabel || 'Suggestions', items: items });
          return out;
        },
        actions: function (q) { return q && !has(q) && q.toLowerCase() !== cur.toLowerCase() ? [{ label: 'Use "' + q + '"', run: function () { setValue(input, q); } }] : []; },
        onPick: function (v) { setValue(input, v); },
      };
    });
  }

  return { open: open, close: close, isOpen: isOpen, isPhone: isPhone, bind: bind, bindText: bindText, setValue: setValue };
})();
