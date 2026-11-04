/* ===== ZEN Z1 UI (z1-ui.js): Home dashboard, History + Stats (engine events), bottom tab bar, generator on Engine tone settings =====
   Loaded by index.html AFTER the "ZEN PART 1" module (engine + profile, at the end of index.html). Plain ES5-style code, no libraries.
   Data: ZenX.histGet() (events {t,k,e,id,a,p,r,tone,m,done,skip}), ZenX.histClear(), ZenX.engCfgGet()/engCfgSet(), ZenX.openX(). */
(function () {
  'use strict';
  var B = window.ZenX;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function say(m, t) { try { if (typeof toast === 'function') toast(m, t || 'success'); } catch (e) {} }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------- data ----------
  function hist() {
    var a = [];
    try { a = JSON.parse((B && B.histGet && B.histGet()) || '[]') || []; } catch (e) { a = []; }
    if (!Array.isArray(a)) a = [];
    a.sort(function (x, y) { return (y.t || 0) - (x.t || 0); });
    return a;
  }
  function cfgGet() { var c = {}; try { c = JSON.parse((B && B.engCfgGet && B.engCfgGet()) || '{}') || {}; } catch (e) {} return c; }
  function cfgSet(p) { try { B.engCfgSet(JSON.stringify(p)); } catch (e) { say('Run Z1 inside ZEN browser', 'error'); } }
  function dayStart(off) { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - (off || 0) * 86400000; }
  function fmtTime(t) { var d = new Date(t); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function statusOf(ev) {
    if (ev.k === 'reply') return ['POSTED', 'ok'];
    if (ev.k === 'draft') return ['DRAFT', 'warn'];
    if (ev.k === 'off') return ['SKIPPED', 'warn'];
    if (ev.k === 'error') return ['ERROR', 'err'];
    if (ev.k === 'run') return ['RUN', 'dim'];
    return [String(ev.k || '?').toUpperCase(), 'dim'];
  }
  function todayReplies() { var s = dayStart(0), n = 0, h = hist(); for (var i = 0; i < h.length; i++) if (h[i].k === 'reply' && h[i].t >= s) n++; return n; }
  function xLogged() { try { if (window.zenx && window.zenx.loggedIn) return !!window.zenx.loggedIn(); } catch (e) {} try { return !!(B && B.xLoggedIn && B.xLoggedIn()); } catch (e2) { return false; } }
  function keysState() {
    var k = jget('zl_keys', {}), n = {};
    try { n = JSON.parse((B && B.engKeysGet && B.engKeysGet()) || '{}') || {}; } catch (e) {}
    var g = k.gem || n.gem, r = k.groq || n.groq, o = k.oai || n.oai;
    return { gem: !!g, groq: !!r, oai: !!o, n: (g ? 1 : 0) + (r ? 1 : 0) + (o ? 1 : 0) };
  }

  // ---------- css ----------
  var css = document.createElement('style');
  css.textContent = [
    '#zl-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:2147482500;display:flex;background:rgba(13,13,18,.96);border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom,0)}',
    '#zl-tabbar.hide{display:none}',
    '.zl-tb{flex:1;background:none;border:0;color:var(--muted);padding:8px 2px 7px;font:700 9px Space Mono,monospace;letter-spacing:.5px;display:flex;flex-direction:column;align-items:center;gap:3px}',
    '.zl-tb svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.zl-tb.on{color:var(--accent3)}',
    'body.zl-tb-on .screen{padding-bottom:62px}',
    '.zl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}',
    '.zl-st{background:var(--s1);border:1px solid var(--border);border-radius:14px;padding:11px 12px;min-height:72px}',
    '.zl-st .k{font:700 9px Space Mono,monospace;letter-spacing:1px;color:var(--muted)}',
    '.zl-st .v{font:800 24px DM Sans,sans-serif;color:var(--text);margin-top:4px}',
    '.zl-st .s{font:400 10px Space Mono,monospace;color:var(--muted);margin-top:2px}',
    '.zl-st.tap{cursor:pointer}',
    '.zl-st.on{border-color:rgba(16,185,129,.55)}',
    '.zl-st.on .v{color:#6ee7b7}',
    '.zl-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:linear-gradient(135deg,var(--accent),#5b3fd8);border:0;border-radius:14px;color:#fff;font:800 15px DM Sans,sans-serif;padding:15px;margin-bottom:12px}',
    '.zl-short{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}',
    '.zl-sc{background:var(--s1);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:11px 4px;font:700 10px Space Mono,monospace;letter-spacing:.5px;display:flex;flex-direction:column;align-items:center;gap:5px}',
    '.zl-sc svg{width:20px;height:20px;stroke:var(--accent3);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.zl-ev{padding:10px 0;border-bottom:1px solid var(--border)}',
    '.zl-ev:last-child{border-bottom:0}',
    '.zl-evh{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font:400 10px Space Mono,monospace;color:var(--muted)}',
    '.zl-evh a{color:var(--accent3);text-decoration:none;font-weight:700}',
    '.zl-tag{display:inline-block;padding:2px 7px;border-radius:7px;font:700 9px Space Mono,monospace;letter-spacing:.5px;background:var(--s3);color:var(--muted)}',
    '.zl-tag.ok{background:rgba(16,185,129,.18);color:#6ee7b7}',
    '.zl-tag.warn{background:rgba(245,158,11,.16);color:#fbbf24}',
    '.zl-tag.err{background:rgba(239,68,68,.16);color:#f87171}',
    '.zl-tag.eng{background:rgba(124,90,245,.18);color:var(--accent3)}',
    '.zl-p{font:400 12px DM Sans,sans-serif;color:var(--muted);margin-top:5px;line-height:1.45;word-break:break-word}',
    '.zl-r{font:500 13px DM Sans,sans-serif;color:var(--text);margin-top:4px;line-height:1.45;word-break:break-word}',
    '.zl-m{font:400 11px Space Mono,monospace;color:#f87171;margin-top:4px;word-break:break-word}',
    '.zl-bars{display:flex;align-items:flex-end;gap:5px;height:84px;margin-top:6px}',
    '.zl-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}',
    '.zl-bar i{display:block;width:100%;background:var(--accent);border-radius:4px 4px 0 0;min-height:2px}',
    '.zl-bar span{font:400 8px Space Mono,monospace;color:var(--muted);margin-top:3px}',
    '.zl-bar b{font:700 9px Space Mono,monospace;color:var(--text);margin-bottom:2px}',
    '.zl-hz{height:7px;border-radius:5px;background:var(--s3);overflow:hidden;flex:1}',
    '.zl-hz i{display:block;height:100%;background:var(--accent);border-radius:5px}',
    '.zl-cnt{display:flex;align-items:center;gap:8px;padding:5px 0;font:600 12px DM Sans,sans-serif;color:var(--text)}',
    '.zl-cnt .n{width:34px;text-align:right;font:700 11px Space Mono,monospace;color:var(--muted)}',
    '.zl-cnt .l{width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.zl-seg{display:flex;gap:6px;margin-bottom:12px}'
  ].join('\n');
  document.head.appendChild(css);

  // ---------- icons ----------
  var IC = {
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    engine: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v5l3 2"/></svg>',
    stats: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>'
  };

  // ---------- navigation ----------
  function closeProfile() { var p = $('zp-profile'); if (p) p.classList.remove('open'); }
  function goHome() { closeProfile(); try { closeMainMenu(); } catch (e) {} showScreen('home'); }
  function goEngine() { closeProfile(); if (window.zlGo) window.zlGo('engine'); }
  function goHistory() { closeProfile(); try { closeMainMenu(); } catch (e) {} showScreen('history'); }
  function goStats() { closeProfile(); try { closeMainMenu(); } catch (e) {} showScreen('zstats'); }
  function goProfile() { if (window.zlOpenProfile) window.zlOpenProfile(); setTimeout(markTabs, 30); }
  window.zlGoHome = goHome; window.zlGoHistory = goHistory; window.zlGoStats = goStats;

  var tabbar = null;
  function buildTabbar() {
    if ($('zl-tabbar')) { tabbar = $('zl-tabbar'); return; }
    tabbar = document.createElement('div'); tabbar.id = 'zl-tabbar';
    var T = [['home', 'HOME', goHome], ['engine', 'ENGINE', goEngine], ['history', 'HISTORY', goHistory], ['stats', 'STATS', goStats], ['profile', 'PROFILE', goProfile]];
    T.forEach(function (t) {
      var b = document.createElement('button'); b.className = 'zl-tb'; b.setAttribute('data-t', t[0]);
      b.innerHTML = IC[t[0]] + '<span>' + t[1] + '</span>';
      b.onclick = t[2]; tabbar.appendChild(b);
    });
    document.body.appendChild(tabbar);
    document.body.classList.add('zl-tb-on');
  }
  function curTab() {
    var p = $('zp-profile'); if (p && p.classList.contains('open')) return 'profile';
    var s = document.querySelector('.screen.active'), id = s ? s.id : '';
    if (id === 'home-screen') return 'home';
    if (id === 'engine-screen') return 'engine';
    if (id === 'history-screen') return 'history';
    if (id === 'zstats-screen') return 'stats';
    return '';
  }
  function markTabs() {
    if (!tabbar) return;
    var c = curTab(), s = document.querySelector('.screen.active');
    tabbar.classList.toggle('hide', !!(s && s.id === 'main-screen'));      // the generator has its own bottom bar
    document.body.classList.toggle('zl-tb-on', !(s && s.id === 'main-screen'));
    [].forEach.call(tabbar.querySelectorAll('.zl-tb'), function (b) { b.classList.toggle('on', b.getAttribute('data-t') === c); });
  }

  // wrap showScreen: render the new screens on entry, keep the tab bar in sync
  var _ss = window.showScreen;
  window.showScreen = function (name) {
    // deep-link z1/index.html#engine: boot routes to Home, send it to Engine once instead
    if (name === 'home' && /#engine/.test(location.hash) && !window.__zlHashDone && window.zlGo) { window.__zlHashDone = 1; window.zlGo('engine'); return; }
    var r = _ss.apply(this, arguments);
    try {
      if (name === 'home') renderHome();
      else if (name === 'history') renderHist();
      else if (name === 'zstats') renderStats();
      markTabs();
    } catch (e) { try { console.warn('z1-ui render', e); } catch (e2) {} }
    return r;
  };
  window.renderHistoryEngine = function () { renderHist(); };

  // ---------- HOME ----------
  function engStatus(c) { return { sea: !!c.sea, fed: !!c.fed }; }
  function renderHome() {
    var el = $('home-screen'); if (!el) return;
    var c = cfgGet(), e = engStatus(c), k = keysState(), lg = xLogged();
    var user = ''; try { user = (jget('zl_profile', {}).xUsername) || (B && B.xUsername && B.xUsername()) || ''; } catch (x) {}
    var h = hist().filter(function (v) { return v.k === 'reply' || v.k === 'draft' || v.k === 'error' || v.k === 'off'; }).slice(0, 5);
    var rec = h.length ? h.map(evHtml).join('') : '<div class="zp-note" style="margin:0">No replies yet. Start in X, the engine logs every reply here.</div>';
    el.innerHTML = '<div class="zp-wrap">' +
      '<div class="zp-h">Z.1</div><div class="zp-sub">HOME' + (user ? ' · @' + esc(user) : '') + '</div>' +
      '<button class="zl-go" id="hm-x">▶ Start in X</button>' +
      '<div class="zl-grid">' +
      '<div class="zl-st tap' + (e.sea ? ' on' : '') + '" id="hm-sea"><div class="k">SEA · SEARCH</div><div class="v">' + (e.sea ? 'ON' : 'OFF') + '</div><div class="s">tap to switch</div></div>' +
      '<div class="zl-st tap' + (e.fed ? ' on' : '') + '" id="hm-fed"><div class="k">FED · HOME FEED</div><div class="v">' + (e.fed ? 'ON' : 'OFF') + '</div><div class="s">tap to switch</div></div>' +
      '<div class="zl-st on" id="hm-today"><div class="k">REPLIES TODAY</div><div class="v" id="hm-todayv">' + todayReplies() + '</div><div class="s">live</div></div>' +
      '<div class="zl-st' + (k.n ? ' on' : '') + '" id="hm-keys"><div class="k">API KEYS</div><div class="v">' + k.n + '/3</div><div class="s">' + (k.n ? [k.gem ? 'Gemini' : '', k.groq ? 'Groq' : '', k.oai ? 'OpenAI' : ''].filter(Boolean).join(' · ') : 'add in Profile') + '</div></div>' +
      '<div class="zl-st' + (lg ? ' on' : '') + '" style="grid-column:1/3"><div class="k">X ACCOUNT</div><div class="v">' + (lg ? 'Logged in ✓' : 'Not logged in') + '</div><div class="s">' + (lg ? 'session found in the X tab' : 'open the X tab and log in first') + '</div></div>' +
      '</div>' +
      '<div class="zl-short">' +
      '<button class="zl-sc" id="hm-s-eng">' + IC.engine + 'ENGINE</button>' +
      '<button class="zl-sc" id="hm-s-his">' + IC.history + 'HISTORY</button>' +
      '<button class="zl-sc" id="hm-s-sta">' + IC.stats + 'STATS</button>' +
      '<button class="zl-sc" id="hm-s-pro">' + IC.profile + 'PROFILE</button></div>' +
      '<div class="zp-card"><div class="zp-lbl">RECENT</div>' + rec + '</div>' +
      '<button class="zp-btn ghost" id="hm-gen">File generator (upload posts)</button>' +
      '</div>';
    $('hm-x').onclick = function () { try { if (B && B.openX) B.openX(); else say('Open the X tab', 'error'); } catch (x) {} };
    $('hm-sea').onclick = function () { var n = !cfgGet().sea; cfgSet({ sea: n }); renderHome(); };
    $('hm-fed').onclick = function () { var n = !cfgGet().fed; cfgSet({ fed: n }); renderHome(); };
    $('hm-keys').onclick = goProfile;
    $('hm-s-eng').onclick = goEngine; $('hm-s-his').onclick = goHistory; $('hm-s-sta').onclick = goStats; $('hm-s-pro').onclick = goProfile;
    $('hm-gen').onclick = function () { try { showScreen((typeof fileQueue !== 'undefined' && fileQueue.length) ? 'dashboard' : 'upload'); } catch (x) {} };
  }

  // ---------- event row (History + Home recent) ----------
  function evHtml(ev) {
    var st = statusOf(ev), link = ev.a && ev.id ? 'https://x.com/' + encodeURIComponent(ev.a) + '/status/' + encodeURIComponent(ev.id) : '';
    var who = ev.a ? (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">@' + esc(ev.a) + '</a>' : '@' + esc(ev.a)) : '';
    return '<div class="zl-ev"><div class="zl-evh"><span>' + fmtTime(ev.t || 0) + '</span>' +
      (ev.e ? '<span class="zl-tag eng">' + esc(ev.e) + '</span>' : '') +
      '<span class="zl-tag ' + st[1] + '">' + st[0] + '</span>' + (ev.tone ? '<span class="zl-tag">' + esc(ev.tone) + '</span>' : '') + who + '</div>' +
      (ev.p ? '<div class="zl-p">' + esc(ev.p) + '</div>' : '') +
      (ev.r ? '<div class="zl-r">' + esc(ev.r) + '</div>' : '') +
      (ev.m && ev.k === 'error' ? '<div class="zl-m">' + esc(ev.m) + '</div>' : '') + '</div>';
  }

  // ---------- HISTORY (engine events on top, old file-generator history under the FILE switch) ----------
  var hf = { src: 'engine', eng: 'all', day: 'all', st: 'all' };
  function ensureHistRoot() {
    var scr = $('history-screen'); if (!scr) return null;
    var root = $('zl-hist-root');
    if (!root) {
      root = document.createElement('div'); root.id = 'zl-hist-root';
      var old = document.createElement('div'); old.id = 'zl-hist-file';
      while (scr.firstChild) old.appendChild(scr.firstChild);
      scr.appendChild(root); scr.appendChild(old);
    }
    return root;
  }
  function chips(name, list, cur) {
    return '<div class="zp-chips" style="margin-bottom:8px">' + list.map(function (x) { return '<button class="zp-chip' + (cur === x[0] ? ' on' : '') + '" data-f="' + name + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  }
  function renderHist() {
    var root = ensureHistRoot(); if (!root) return;
    var old = $('zl-hist-file');
    old.style.display = hf.src === 'file' ? '' : 'none';
    var seg = '<div class="zl-seg"><button class="zp-tab' + (hf.src === 'engine' ? ' on' : '') + '" data-src="engine">ENGINE (SEA · FED)</button><button class="zp-tab' + (hf.src === 'file' ? ' on' : '') + '" data-src="file">FILE GENERATOR</button></div>';
    if (hf.src === 'file') {
      root.innerHTML = '<div class="zp-wrap" style="padding-bottom:0"><div class="zp-h">History</div>' + seg + '</div>';
      wireHist(root);
      try { if (typeof renderHistory === 'function') renderHistory(); } catch (e) {}
      return;
    }
    var all = hist(), s7 = dayStart(0), list = all.filter(function (v) { return v.k !== 'run'; });
    if (hf.eng !== 'all') list = list.filter(function (v) { return v.e === hf.eng; });
    if (hf.day === 'today') list = list.filter(function (v) { return v.t >= s7; });
    else if (hf.day === '7') list = list.filter(function (v) { return v.t >= dayStart(6); });
    if (hf.st === 'reply') list = list.filter(function (v) { return v.k === 'reply'; });
    else if (hf.st === 'draft') list = list.filter(function (v) { return v.k === 'draft'; });
    else if (hf.st === 'skip') list = list.filter(function (v) { return v.k === 'off'; });
    else if (hf.st === 'error') list = list.filter(function (v) { return v.k === 'error'; });
    var shown = list.slice(0, 300);
    var errs = all.filter(function (v) { return v.k === 'error'; }).length;
    root.innerHTML = '<div class="zp-wrap" style="padding-bottom:20px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><div class="zp-h">History</div><button class="zp-chip" id="hs-clear">Clear all</button></div>' +
      '<div class="zp-sub">' + list.length + ' events' + (list.length > shown.length ? ' · latest ' + shown.length + ' shown' : '') + (errs ? ' · ' + errs + ' errors in total' : '') + '</div>' + seg +
      chips('eng', [['all', 'All'], ['SEA', 'SEA'], ['FED', 'FED']], hf.eng) +
      chips('day', [['all', 'All time'], ['today', 'Today'], ['7', '7 days']], hf.day) +
      chips('st', [['all', 'All'], ['reply', 'Posted'], ['draft', 'Draft'], ['skip', 'Skipped'], ['error', 'Errors']], hf.st) +
      '<div class="zp-card">' + (shown.length ? shown.map(evHtml).join('') : '<div class="zp-note" style="margin:0">No events for this filter.</div>') + '</div></div>';
    wireHist(root);
    $('hs-clear').onclick = function () {
      if (!confirm('Delete all engine history on this device?')) return;
      try { B.histClear(); } catch (e) {} renderHist(); say('History cleared');
    };
  }
  function wireHist(root) {
    [].forEach.call(root.querySelectorAll('[data-src]'), function (b) { b.onclick = function () { hf.src = b.getAttribute('data-src'); renderHist(); }; });
    [].forEach.call(root.querySelectorAll('[data-f]'), function (b) { b.onclick = function () { hf[b.getAttribute('data-f')] = b.getAttribute('data-v'); renderHist(); }; });
  }

  // ---------- STATS ----------
  var sf = { range: '7' };
  function ensureStatsRoot() {
    var scr = $('zstats-screen'); if (!scr) return null;
    var root = $('zl-stats-root');
    if (!root) {
      root = document.createElement('div'); root.id = 'zl-stats-root';
      scr.insertBefore(root, scr.firstChild);
      var old = scr.children[1];
      if (old) { old.id = 'zl-stats-file'; old.style.display = 'none'; }
    }
    return root;
  }
  function renderStats() {
    var root = ensureStatsRoot(); if (!root) return;
    var days = sf.range === 'today' ? 1 : sf.range === '30' ? 30 : 7, from = dayStart(days - 1), all = hist();
    var ev = all.filter(function (v) { return v.t >= from; });
    var rep = 0, err = 0, off = 0, runSkip = 0, drafts = 0, byTone = {}, byEng = { SEA: 0, FED: 0 };
    ev.forEach(function (v) {
      if (v.k === 'reply') { rep++; if (v.tone) byTone[v.tone] = (byTone[v.tone] || 0) + 1; if (v.e) byEng[v.e] = (byEng[v.e] || 0) + 1; }
      else if (v.k === 'error') err++;
      else if (v.k === 'off') off++;
      else if (v.k === 'draft') drafts++;
      else if (v.k === 'run') runSkip += Number(v.skip) || 0;
    });
    var skipped = Math.max(off, runSkip);
    // per-day bars (replies), up to 14 bars; 30-day range is grouped by day too but only last 14 are drawn
    var nb = Math.min(days === 1 ? 24 : days, 14), bars = [], i;
    for (i = 0; i < nb; i++) bars.push(0);
    ev.forEach(function (v) {
      if (v.k !== 'reply') return;
      var idx;
      if (days === 1) idx = new Date(v.t).getHours(); else idx = nb - 1 - Math.floor((dayStart(0) - new Date(v.t).setHours(0, 0, 0, 0)) / 86400000);
      if (idx >= 0 && idx < nb) bars[idx]++;
    });
    var mx = Math.max.apply(null, bars.concat([1]));
    var barHtml = bars.map(function (n, ix) {
      var lbl = days === 1 ? (ix % 6 === 0 ? ix + 'h' : '') : (function () { var d = new Date(dayStart(nb - 1 - ix)); return d.getDate(); })();
      return '<div class="zl-bar"><b>' + (n || '') + '</b><i style="height:' + Math.round(n / mx * 62) + 'px"></i><span>' + lbl + '</span></div>';
    }).join('');
    function cnt(map) {
      var ks = Object.keys(map).filter(function (k) { return map[k] > 0; }).sort(function (a, b) { return map[b] - map[a]; });
      if (!ks.length) return '<div class="zp-note" style="margin:0">No data in this range.</div>';
      var m = map[ks[0]];
      return ks.map(function (k) { return '<div class="zl-cnt"><span class="l">' + esc(k) + '</span><div class="zl-hz"><i style="width:' + Math.round(map[k] / m * 100) + '%"></i></div><span class="n">' + map[k] + '</span></div>'; }).join('');
    }
    var tl = ev.filter(function (v) { return v.k !== 'run'; }).slice(0, 12).map(function (v) {
      var st = statusOf(v);
      return '<div class="zl-cnt" style="align-items:flex-start"><span class="n" style="width:78px;text-align:left;font-weight:400">' + fmtTime(v.t) + '</span><span class="zl-tag ' + st[1] + '">' + st[0] + '</span><span class="l" style="width:auto;flex:1;white-space:normal;font-weight:400;color:var(--muted)">' + (v.e ? esc(v.e) + ' · ' : '') + (v.a ? '@' + esc(v.a) : '') + (v.k === 'error' && v.m ? ' ' + esc(v.m) : '') + '</span></div>';
    }).join('') || '<div class="zp-note" style="margin:0">Nothing yet.</div>';
    root.innerHTML = '<div class="zp-wrap" style="padding-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><div class="zp-h">Stats</div><button class="zp-chip" id="st-clear">Clear</button></div>' +
      '<div class="zp-sub">ENGINE · SEA + FED</div>' +
      '<div class="zp-chips" style="margin-bottom:12px">' + [['today', 'Today'], ['7', '7 days'], ['30', '30 days']].map(function (r) { return '<button class="zp-chip' + (sf.range === r[0] ? ' on' : '') + '" data-r="' + r[0] + '">' + r[1] + '</button>'; }).join('') + '</div>' +
      '<div class="zl-grid"><div class="zl-st on"><div class="k">REPLIES</div><div class="v">' + rep + '</div><div class="s">' + (drafts ? drafts + ' drafts' : 'posted') + '</div></div>' +
      '<div class="zl-st"><div class="k">ERRORS</div><div class="v" style="color:' + (err ? '#f87171' : 'var(--text)') + '">' + err + '</div><div class="s">failed replies</div></div>' +
      '<div class="zl-st"><div class="k">SKIPPED</div><div class="v">' + skipped + '</div><div class="s">comments off / filtered</div></div>' +
      '<div class="zl-st"><div class="k">TODAY</div><div class="v">' + todayReplies() + '</div><div class="s">replies</div></div></div>' +
      '<div class="zp-card"><div class="zp-lbl">REPLIES ' + (days === 1 ? 'PER HOUR' : 'PER DAY') + '</div><div class="zl-bars">' + barHtml + '</div></div>' +
      '<div class="zp-card"><div class="zp-lbl">BY ENGINE</div>' + cnt(byEng) + '</div>' +
      '<div class="zp-card"><div class="zp-lbl">BY TONE</div>' + cnt(byTone) + '</div>' +
      '<div class="zp-card"><div class="zp-lbl">TIMELINE</div>' + tl + '</div>' +
      '<div class="zp-fold" id="st-fold"><span>GENERATOR LIVE LOG (FILE MODE)</span><span id="st-arrow">▼</span></div></div>';
    [].forEach.call(root.querySelectorAll('[data-r]'), function (b) { b.onclick = function () { sf.range = b.getAttribute('data-r'); renderStats(); }; });
    $('st-clear').onclick = function () { if (!confirm('Delete all engine history on this device?')) return; try { B.histClear(); } catch (e) {} renderStats(); say('Cleared'); };
    $('st-fold').onclick = function () {
      var f = $('zl-stats-file'); if (!f) return; var o = f.style.display === 'none';
      f.style.display = o ? '' : 'none'; $('st-arrow').textContent = o ? '▲' : '▼';
      if (o) { try { if (typeof zsOpen === 'function') zsOpen(); } catch (e) {} }
    };
  }

  // ---------- live refresh: counter on Home, Engine tab re-render when the X panel changed settings ----------
  var lastCfg = null;
  function liveTick() {
    if (document.hidden) return;
    var s = document.querySelector('.screen.active'), id = s ? s.id : '';
    if (id === 'home-screen') { var v = $('hm-todayv'); if (v) { var n = String(todayReplies()); if (v.textContent !== n) v.textContent = n; } }
    if (id === 'engine-screen') { var c = ''; try { c = B.engCfgGet(); } catch (e) {} if (lastCfg !== null && c !== lastCfg && !isTyping()) { lastCfg = c; if (window.zlGo) window.zlGo('engine'); } lastCfg = c; }
    else { try { lastCfg = B.engCfgGet(); } catch (e2) {} }
  }
  function isTyping() { var a = document.activeElement; return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')); }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    var s = document.querySelector('.screen.active'), id = s ? s.id : '';
    if (id === 'engine-screen') { if (window.zlGo) window.zlGo('engine'); }
    else if (id === 'home-screen') renderHome();
    else if (id === 'history-screen') renderHist();
    else if (id === 'zstats-screen') renderStats();
  });
  setInterval(liveTick, 3000);

  // ---------- GENERATOR: same tone / grammar / big reply / custom / style logic as the Engine (copy of x.js) ----------
  var TONE_LIST = ['Smart', 'Funny', 'Professional', 'Supportive', 'Witty', 'Curious', 'Short', 'Human', 'Alpha', 'Positive', 'PositiveQuestion', 'Helpful', 'Master', 'Custom', 'Auto'];
  var AUTO_POOL = ['Smart', 'Witty', 'Human', 'Alpha', 'Curious', 'Positive', 'PositiveQuestion', 'Helpful'];
  var lastAuto = null;
  function resolveAuto() {
    var av = AUTO_POOL.filter(function (t) { return t !== lastAuto; });
    lastAuto = av[Math.floor(Math.random() * av.length)]; return lastAuto;
  }
  var TONES = {
    'Smart': 'Add a sharp, insightful point that shows you understood the post. Natural, confident, no filler.',
    'Funny': 'Make a quick, genuinely funny remark based on the post. Light humour, not forced, not rude.',
    'Professional': 'Reply in a polished, respectful, professional voice. Clear and to the point.',
    'Supportive': 'Reply warmly and encouragingly, backing the author up. Sincere, not over the top.',
    'Witty': 'Reply with clever wordplay or a dry witty twist on the post. Short and sharp.',
    'Curious': 'Ask one thoughtful, specific question about the post that invites an answer.',
    'Short': 'Reply with a very short reaction, 1 to 8 words, based on the post.',
    'Human': 'Reply like a real person casually typing on a phone. Relaxed, a little imperfect, believable.',
    'Alpha': 'Reply with calm, confident, direct energy. Bold take, no hedging, no cringe.',
    'Positive': 'React positively and genuinely to the post. Natural and believable.',
    'PositiveQuestion': 'Give a short positive reaction and then ask one short natural question.',
    'Helpful': 'Add one quick, genuinely useful point or tip related to the post. No extra talk.',
    'Master': 'Reply like an expert who has seen it all: concise, authoritative, adds real value.'
  };
  function pickTone(cfg) {
    var t = TONE_LIST.indexOf(cfg.tone) >= 0 ? cfg.tone : 'Smart';
    if (t === 'Auto') t = resolveAuto();
    if (cfg.bigOn && TONES[cfg.bigTone]) t = cfg.bigTone;
    return t;
  }
  function buildPrompt(cfg, post, tone) {
    var big = !!cfg.bigOn && String(cfg.bigWords || '').trim();
    var p = 'Post:\n' + post + '\n\n';
    if (tone === 'Custom' && String(cfg.customTone || '').trim()) p += 'Reply instructions: ' + String(cfg.customTone).trim() + ' ';
    else p += 'Tone: ' + (TONES[tone] || TONES.Smart) + ' ';
    if (big) p += 'Write a longer reply of about ' + String(cfg.bigWords).trim() + ' words. ';
    else if (tone === 'Custom' && String(cfg.customWords || '').trim()) p += 'Keep it within ' + String(cfg.customWords).trim() + ' words. ';
    else if (tone !== 'Short') p += 'Keep it short (under 30 words). ';
    p += 'Write ONE reply in the same language as the post. No hashtags, no links, no emoji spam, no quotes around the reply. Reply text only.';
    var useGrammar = !(cfg.grammar && cfg.grammar[tone] === false);
    p += useGrammar ? ' Use correct grammar and punctuation.' : ' Write naturally like real typing: relaxed punctuation, grammar fixing is OFF.';
    if (cfg.style && String(cfg.style).trim()) p += ' Use this replying style (your voice): ' + String(cfg.style).trim();
    if (cfg.keyword && String(cfg.keyword).trim()) p += ' Include this keyword naturally: ' + String(cfg.keyword).trim();
    return p;
  }
  function cleanReply(t) {
    t = String(t || '').trim().replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, '').trim();
    if (!t || /https?:\/\/|www\./i.test(t)) return '';
    return t.slice(0, 270);
  }
  window.zlPickTone = function () { return pickTone(cfgGet()); };
  window.zlBuildPrompt = function (post, tone) { return buildPrompt(cfgGet(), post, tone); };
  window.zlGenReply = async function (p) {
    var cfg = cfgGet(), tone = pickTone(cfg);
    var post = (p.tweetText && String(p.tweetText).trim().length > 10) ? String(p.tweetText) : ('[Tweet by ' + (p.handle || '') + '] ' + (p.link || ''));
    var prompt = buildPrompt(cfg, post, tone);
    try { if (typeof _buildEmojiInstructionLine === 'function') prompt += _buildEmojiInstructionLine(); } catch (e) {}
    var lastErr = null, out = '';
    if (_apiVault.hasGem()) {
      try { out = cleanReply(await fetchReplyWithFallback(prompt, '', GEMINI_MODEL_CHAIN[0], true)); if (out) { p._via = 'Gemini'; try { incrementApiUsage('gemini'); } catch (e) {} } } catch (e1) { lastErr = e1; }
    }
    if (!out && _apiVault.hasGroq()) {
      try { out = cleanReply(await _secureGroqCall([{ role: 'system', content: 'You write replies to posts on X. Output the reply text only.' }, { role: 'user', content: prompt }], big(cfg) ? 400 : 120)); if (out) { p._via = 'Groq'; try { incrementApiUsage('groq'); } catch (e) {} } } catch (e2) { lastErr = e2; }
    }
    if (!out && _apiVault.hasOai()) {
      try {
        var d = await _secureOpenAICall([{ role: 'system', content: 'You write replies to posts on X. Output the reply text only.' }, { role: 'user', content: prompt }], big(cfg) ? 400 : 120);
        out = cleanReply(d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
        if (out) { p._via = 'OpenAI'; try { incrementApiUsage('openai'); } catch (e) {} }
      } catch (e3) { lastErr = e3; }
    }
    if (!out) throw new Error(lastErr ? (lastErr.message || 'AI failed') : 'No API key. Add keys in Profile');
    p._tone = tone;
    try { _trackComment(out); } catch (e4) {}
    return out;
  };
  function big(cfg) { return !!cfg.bigOn && String(cfg.bigWords || '').trim(); }

  // ---------- boot ----------
  function boot() {
    buildTabbar();
    var m = $('home-screen'); if (!m) { var host = $('main-screen') ? $('main-screen').parentNode : $('app'); m = document.createElement('div'); m.className = 'screen'; m.id = 'home-screen'; host.appendChild(m); }
    ensureHistRoot(); ensureStatsRoot();
    try { lastCfg = B.engCfgGet(); } catch (e) {}
    var s = document.querySelector('.screen.active');
    if (s && s.id === 'home-screen') renderHome();
    // old menu "Stats" / "History" / "Dashboard" entries now open the new screens
    markTabs();
    setInterval(markTabs, 1500);
  }
  window.zlHomeRender = renderHome;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 80); }); else setTimeout(boot, 80);
})();
