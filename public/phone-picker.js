// Phone pick-list panel (John, 2026-11-27). On phones, type-to-search pickers
// open this panel instead of the small list under the box: big rows, grouped
// headings, a search box at the top that narrows the list as you type (no
// keyboard until you tap it), a close X, tap outside to close. One shared
// piece so every picker can use it. Desktop keeps the old inline lists.
//
// PhonePicker.open({
//   title:       'Add a role',
//   placeholder: 'Search roles',
//   groups:      function (query) { return [{ label, items: [{ id, label, meta }] }]; },
//   createLabel: function (query) { return '+ Create role "x"' or null; },   // optional
//   selectedId:  id,                       // optional: checkmark on the current value
//   emptyText:   'No roles match',          // optional
//   onPick:      function (id) {},
//   onCreate:    function (query) {},       // optional, with createLabel
// })
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
      var o = opts;
      if (row.getAttribute('data-pp') === 'create') { var q = query.trim(); close(); if (o.onCreate) o.onCreate(q); return; }
      var id = row.getAttribute('data-id');
      close();
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
    var groups = opts.groups(query) || [];
    var html = '', n = 0;
    groups.forEach(function (g) {
      if (!g.items.length) return;
      if (g.label) html += '<div class="pp-group">' + esc(g.label) + '</div>';
      g.items.forEach(function (it) {
        n++;
        var sel = opts.selectedId != null && String(it.id) === String(opts.selectedId);
        html += '<button type="button" class="pp-row' + (sel ? ' selected' : '') + '" data-pp="pick" data-id="' + esc(it.id) + '" data-num="' + (typeof it.id === 'number' ? 1 : 0) + '">' +
          '<span class="pp-label">' + esc(it.label) + '</span>' +
          (it.meta ? '<span class="pp-meta">' + esc(it.meta) + '</span>' : '') +
          (sel ? '<span class="pp-check" aria-hidden="true">&#x2713;</span>' : '') + '</button>';
      });
    });
    var create = opts.createLabel ? opts.createLabel(query.trim()) : null;
    if (create) html += '<button type="button" class="pp-row pp-create" data-pp="create">' + esc(create) + '</button>';
    if (!n && !create) html = '<div class="pp-empty">' + esc(opts.emptyText || 'Nothing matches') + '</div>';
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
    var sel = el.querySelector('.pp-row.selected');
    el.querySelector('.pp-list').scrollTop = 0;
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

  return { open: open, close: close, isOpen: isOpen, isPhone: isPhone };
})();
