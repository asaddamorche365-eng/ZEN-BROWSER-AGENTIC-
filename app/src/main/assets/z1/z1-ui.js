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
    '.zl-back{display:inline-flex;align-items:center;gap:4px;background:var(--s2);border:1px solid var(--border2);border-radius:20px;color:var(--text);font:700 11px Space Mono,monospace;letter-spacing:.5px;padding:7px 13px 7px 9px;margin:12px 0 0 14px}',
    '.zl-nav{display:flex;align-items:center;gap:12px;margin:10px 14px 0;padding-bottom:10px;border-bottom:1px solid var(--border)}',
    '.zl-nav .zl-back{margin:0}',
    '.zl-pt{font:800 17px DM Sans,sans-serif;color:var(--accent3);letter-spacing:.3px}',
    '.zl-back svg{width:14px;height:14px;stroke:var(--accent3);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}',
    '.zl-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:9px}',
    '.zl-st{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:8px 10px;min-height:0}',
    '.zl-st .k{font:700 8px Space Mono,monospace;letter-spacing:.8px;color:var(--muted)}',
    '.zl-st .v{font:800 17px DM Sans,sans-serif;color:var(--text);margin-top:2px}',
    '.zl-st .s{font:400 8.5px Space Mono,monospace;color:var(--muted);margin-top:1px}',
    '.zl-st.tap{cursor:pointer}',
    '.zl-st.on{border-color:rgba(16,185,129,.55)}',
    '.zl-st.on .v{color:#6ee7b7}',
    '.zl-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:linear-gradient(135deg,var(--accent),#5b3fd8);border:0;border-radius:14px;color:#fff;font:800 13px DM Sans,sans-serif;padding:11px;margin-bottom:9px}',
    '.zl-short{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:9px}',
    '.zl-sc{background:var(--s1);border:1px solid var(--border);border-radius:11px;color:var(--text);padding:8px 2px;font:700 8.5px Space Mono,monospace;letter-spacing:.4px;display:flex;flex-direction:column;align-items:center;gap:3px}',
    '.zl-sc svg{width:16px;height:16px;stroke:var(--accent3);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '#home-screen .zp-wrap{padding:10px 12px 70px}',
    '#home-screen .zp-h{font-size:16px;margin:0}',
    '#home-screen .zp-sub{font-size:9.5px;margin-bottom:8px}',
    '#home-screen .zp-card{padding:9px 11px;margin-bottom:9px;border-radius:12px}',
    '#home-screen .zp-lbl{font-size:8.5px;margin-bottom:5px}',
    '.zl-files{margin-bottom:9px}',
    '.zl-files .upload-box{margin:0 0 9px;padding:10px 12px;gap:10px;border-radius:12px}',
    '.zl-files .upload-box-icon{font-size:20px}',
    '.zl-files .upload-box-title{font-size:12px}',
    '.zl-files .upload-box-sub{font-size:9.5px}',
    '.zl-files .dash-header{padding:6px 2px 8px;border-bottom:0;background:transparent}',
    '.zl-files .dash-title{font-size:10px}',
    '.zl-files .dash-add-btn{padding:6px 12px!important;font-size:11px!important;border-radius:10px!important}',
    '.zl-files .dash-list{padding-left:0;padding-right:0}',
    '.zl-files .dash-empty{display:none}',
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
    '.zl-seg{display:flex;gap:6px;margin-bottom:12px}',
    /* Home: file header (Done / All Files / Add) */
    '.zl-files .dash-header.zl-fh{flex-wrap:wrap;gap:6px}',
    '.zl-fb{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
    /* Home: compact RECENT (3 rows, small text) */
    '.zl-rechead{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}',
    '.zl-rechead .zp-lbl{margin-bottom:0!important}',
    '.zl-more{background:none;border:0;color:var(--accent3);font:700 10px DM Sans,sans-serif;letter-spacing:.3px;padding:2px 0}',
    '.zl-rec .zl-ev{padding:7px 0}',
    '.zl-rec .zl-evh{font-size:9px;gap:5px}',
    '.zl-rec .zl-tag{font-size:8px;padding:1px 6px;border-radius:6px}',
    '.zl-rec .zl-p{font-size:10.5px;margin-top:3px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}',
    '.zl-rec .zl-r{font-size:11.5px;margin-top:2px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    /* Profile sheet: one clean font (DM Sans) instead of mixed mono */
    '#profile-sheet .profile-username{font:500 13px DM Sans,sans-serif;letter-spacing:.2px;color:var(--muted)}',
    '#profile-sheet .xp-stats{font:500 12px DM Sans,sans-serif;gap:24px;align-items:baseline}',
    '#profile-sheet .xp-stats span{display:inline-flex;align-items:baseline;gap:5px}',
    '#profile-sheet .xp-stats b{font:800 15px DM Sans,sans-serif;color:var(--text);margin:0}',
    '#profile-sheet .xp-sync{font:600 11px DM Sans,sans-serif;padding:5px 12px;border-radius:10px}',
    '#profile-sheet .profile-badge{font-family:DM Sans,sans-serif}',
    '#profile-sheet .profile-section-label{font:800 11px DM Sans,sans-serif;letter-spacing:1.2px}',
    '#profile-sheet .z1tf-section-title{font:800 12px DM Sans,sans-serif;letter-spacing:1px}',
    '#profile-sheet .field-label{font:600 12px DM Sans,sans-serif;letter-spacing:.2px;color:var(--muted)}',
    '#profile-sheet .field-input{font:500 14px DM Sans,sans-serif}'
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
  function goHome() { try { closeMainMenu(); } catch (e) {} showScreen('home'); }
  function goEngine() { if (window.zlGo) window.zlGo('engine'); }
  function goHistory() { try { closeMainMenu(); } catch (e) {} showScreen('history'); }
  function goStats() { try { closeMainMenu(); } catch (e) {} showScreen('zstats'); }
  function goProfile() { try { closeMainMenu(); } catch (e) {} if (typeof openProfileSheet === 'function') openProfileSheet(); }
  function goFiles() { try { closeMainMenu(); } catch (e) {} try { showScreen('files'); } catch (x) {} }
  window.zlGoFiles = goFiles; window.zlGoHome = goHome; window.zlGoHistory = goHistory; window.zlGoStats = goStats;

  // ---------- back pill: every sub screen gets a "< Home" button at the top (no bottom tab bar any more) ----------
  var BACK_SCREENS = ['engine-screen', 'history-screen', 'zstats-screen', 'dashboard-screen'];
  var TITLES = { 'engine-screen': 'Engine', 'history-screen': 'History', 'zstats-screen': 'Stats', 'dashboard-screen': 'All Files' };
  function ensureBack(el) {
    if (!el || el.querySelector('.zl-nav')) return;
    var bar = document.createElement('div'); bar.className = 'zl-nav';
    var b = document.createElement('button'); b.className = 'zl-back'; b.type = 'button';
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg> Home';
    b.onclick = goHome;
    var t = document.createElement('div'); t.className = 'zl-pt'; t.textContent = TITLES[el.id] || '';
    bar.appendChild(b); bar.appendChild(t);
    el.insertBefore(bar, el.firstChild);
  }
  function markTabs() {
    BACK_SCREENS.forEach(function (id) { var el = $(id); if (el) ensureBack(el); });
  }
  var obs = null;
  function watchBack() {
    if (obs || !window.MutationObserver) return;
    obs = new MutationObserver(function () { markTabs(); });
    ['engine-screen', 'history-screen', 'zstats-screen', 'dashboard-screen'].forEach(function (id) { var el = $(id); if (el) obs.observe(el, { childList: true }); });
  }

  // wrap showScreen: render the new screens on entry, keep the tab bar in sync
  var _ss = window.showScreen;
  window.showScreen = function (name) {
    // 'files' = the All Files tab (the old dashboard screen). Old callers that ask for 'dashboard' / 'upload'
    // land on Home, except when the user is already on All Files or came from a file opened there.
    var curEl = document.querySelector('.screen.active'), curId = curEl ? curEl.id : '';
    if (name === 'files') name = 'dashboard';
    else if (name === 'upload' || name === 'dashboard') name = (name === 'dashboard' && (curId === 'dashboard-screen' || window.__zlFromFiles)) ? 'dashboard' : 'home';
    window.__zlFromFiles = (name === 'main') ? (curId === 'dashboard-screen') : false;
    // deep-link z1/index.html#engine: boot routes to Home, send it to Engine once instead
    if (name === 'home' && /#engine/.test(location.hash) && !window.__zlHashDone && window.zlGo) { window.__zlHashDone = 1; window.zlGo('engine'); return; }
    var r = _ss.apply(this, [name]);
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
  // ---------- Home + Upload + file queue = one screen ----------
  var FILE_NODES = [['drop-zone', 'upload-screen'], ['file-input', 'upload-screen']];
  function stashFiles() {   // move the upload box back out before home is re-rendered (keeps its listeners)
    FILE_NODES.forEach(function (n) { var el = $(n[0]), host = $(n[1]); if (el && host && !host.contains(el)) host.appendChild(el); });
  }
  function hasQueue() { try { return typeof fileQueue !== 'undefined' && fileQueue.length > 0; } catch (e) { return false; } }
  function latestFile() {   // newest uploaded file (ties: the one added last)
    var q; try { q = fileQueue; } catch (e) { return null; }
    if (!q || !q.length) return null;
    var best = q[0], bt = best.uploadedAt || 0;
    for (var i = 1; i < q.length; i++) { var t = q[i].uploadedAt || 0; if (t >= bt) { best = q[i]; bt = t; } }
    return best;
  }
  function mountFiles() {
    var slot = $('hm-files'); if (!slot) return;
    var q = hasQueue();
    FILE_NODES.forEach(function (n) {
      var el = $(n[0]); if (!el) return;
      if (n[0] === 'drop-zone') el.style.display = q ? 'none' : '';
      slot.appendChild(el);
    });
    if (q) {   // Home shows ONLY the latest file; everything else lives in the All Files tab
      var lf = latestFile(), list = $('hm-list');
      try { if (lf && list && typeof _renderFileCards === 'function') _renderFileCards(list, [lf]); } catch (e) { try { console.warn('z1-ui home file', e); } catch (e2) {} }
    }
  }
  var qSig = '';
  setInterval(function () {   // keep the queue live while Home or All Files is open
    var h = $('home-screen'), d = $('dashboard-screen');
    var onHome = !!(h && h.classList.contains('active')), onFiles = !!(d && d.classList.contains('active'));
    if (!onHome && !onFiles) return;
    var sig = ''; try { sig = fileQueue.map(function (f) { return f.id + ':' + (f.posts || []).length + ':' + (f.posts || []).filter(function (p) { return p.done; }).length; }).join('|'); } catch (e) {}
    if (sig !== qSig) { var first = qSig === '' ; qSig = sig; if (!first || sig) { try { if (onFiles) { if (typeof renderDashboard === 'function') renderDashboard(); } else renderHome(); } catch (e) {} } }
  }, 1500);

  function renderHome() {
    var el = $('home-screen'); if (!el) return;
    var c = cfgGet(), e = engStatus(c), k = keysState(), lg = xLogged();
    var user = ''; try { user = (jget('zl_profile', {}).xUsername) || (B && B.xUsername && B.xUsername()) || ''; } catch (x) {}
    var h = hist().filter(function (v) { return v.k === 'reply' || v.k === 'draft' || v.k === 'error' || v.k === 'off'; }).slice(0, 3);
    var rec = h.length ? h.map(evHtml).join('') : '<div class="zp-note" style="margin:0">No replies yet. Start in X, the engine logs every reply here.</div>';
    stashFiles();
    var q = hasQueue(), nq = 0; try { nq = fileQueue.length; } catch (x2) {}
    var fhead = q ? '<div class="dash-header zl-fh"><span class="dash-title">// FILE QUEUE</span><div class="zl-fb">' +
      '<button class="dash-add-btn" id="hm-done" style="background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.4);color:#4ade80;">✅ Done</button>' +
      '<button class="dash-add-btn" id="hm-all">📂 All Files' + (nq > 1 ? ' (' + nq + ')' : '') + '</button>' +
      '<button class="dash-add-btn" id="hm-add">+ Add File</button></div></div><div class="dash-list" id="hm-list"></div>' : '';
    el.innerHTML = '<div class="zp-wrap">' +
      '<div class="zp-h">Z.1 <span style="font:400 9.5px Space Mono,monospace;color:var(--muted)">HOME' + (user ? ' · @' + esc(user) : '') + '</span></div>' +
      '<div style="height:8px"></div>' +
      '<button class="zl-go" id="hm-x">▶ Start in X</button>' +
      '<div class="zl-grid">' +
      '<div class="zl-st tap' + (e.sea ? ' on' : '') + '" id="hm-sea"><div class="k">SEA · SEARCH</div><div class="v">' + (e.sea ? 'ON' : 'OFF') + '</div><div class="s">tap to switch</div></div>' +
      '<div class="zl-st tap' + (e.fed ? ' on' : '') + '" id="hm-fed"><div class="k">FED · HOME FEED</div><div class="v">' + (e.fed ? 'ON' : 'OFF') + '</div><div class="s">tap to switch</div></div>' +
      '<div class="zl-st on" id="hm-today"><div class="k">REPLIES TODAY</div><div class="v" id="hm-todayv">' + todayReplies() + '</div><div class="s">live</div></div>' +
      '<div class="zl-st' + (k.n ? ' on' : '') + '" id="hm-keys"><div class="k">API KEYS</div><div class="v">' + k.n + '/3</div><div class="s">' + (k.n ? [k.gem ? 'Gemini' : '', k.groq ? 'Groq' : '', k.oai ? 'OpenAI' : ''].filter(Boolean).join(' · ') : 'add in Profile') + '</div></div>' +
      '<div class="zl-st' + (lg ? ' on' : '') + '" style="grid-column:1/3;display:flex;align-items:center;justify-content:space-between"><div><div class="k">X ACCOUNT</div><div class="s" style="font-size:9px">' + (lg ? 'session found in the X tab' : 'open the X tab and log in first') + '</div></div><div class="v" style="font-size:13px;margin:0">' + (lg ? 'Logged in ✓' : 'Not logged in') + '</div></div>' +
      '</div>' +
      '<div class="zl-short">' +
      '<button class="zl-sc" id="hm-s-eng">' + IC.engine + 'ENGINE</button>' +
      '<button class="zl-sc" id="hm-s-his">' + IC.history + 'HISTORY</button>' +
      '<button class="zl-sc" id="hm-s-sta">' + IC.stats + 'STATS</button>' +
      '<button class="zl-sc" id="hm-s-pro">' + IC.profile + 'PROFILE</button></div>' +
      '<div class="zp-lbl" style="margin:4px 2px 6px">// POST LIST</div>' +
      '<div class="zl-files" id="hm-files">' + fhead + '</div>' +
      '<div class="zp-card zl-rec"><div class="zl-rechead"><div class="zp-lbl">RECENT</div><button class="zl-more" id="hm-more">View all ›</button></div>' + rec + '</div>' +
      '</div>';
    mountFiles();
    $('hm-x').onclick = function () { try { if (B && B.openX) B.openX(); else say('Open the X tab', 'error'); } catch (x) {} };
    $('hm-sea').onclick = function () { var n = !cfgGet().sea; cfgSet({ sea: n }); renderHome(); };
    $('hm-fed').onclick = function () { var n = !cfgGet().fed; cfgSet({ fed: n }); renderHome(); };
    $('hm-keys').onclick = goProfile;
    $('hm-more').onclick = goHistory;
    if (q) {
      $('hm-done').onclick = function () { try { openDoneReview('timeline'); } catch (x) {} };
      $('hm-all').onclick = goFiles;
      $('hm-add').onclick = function () { var fi = $('file-input'); if (fi) fi.click(); };
    }
    $('hm-s-eng').onclick = goEngine; $('hm-s-his').onclick = goHistory; $('hm-s-sta').onclick = goStats; $('hm-s-pro').onclick = goProfile;
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

  // ---------- PROFILE: the old profile sheet (as before) + the new settings added in the same style ----------
  var PF_P = 'zl_profile', PF_K = 'zl_keys', PF_G = 'zl_z1g', PF_SP = 'zl_splash_off';
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function nativeKeys() { try { return JSON.parse(B.engKeysGet()) || {}; } catch (e) { return {}; } }
  function pfFld(id, label, val, type, ph) {
    return '<div class="field-label" style="margin:8px 0 5px">' + label + '</div>' +
      '<input class="field-input" id="' + id + '" type="' + type + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%">';
  }
  function pfBadge(on, name) { return '<span class="profile-badge" style="display:inline-flex;margin:0 6px 6px 0;' + (on ? 'color:#6ee7b7' : '') + '">' + name + (on ? ' ✓' : '') + '</span>'; }
  function pfBlock() {
    var box = document.querySelector('#profile-sheet .sheet-box'); if (!box) return;
    var card = box.querySelector('.profile-card'); if (!card) return;
    var p = jget(PF_P, {}), k = jget(PF_K, {}), g = jget(PF_G, {}), n = nativeKeys();
    ['gem', 'groq', 'oai'].forEach(function (x) { if (n[x] && !k[x]) k[x] = n[x]; });
    var host = $('zl-pf-block');
    if (!host) { host = document.createElement('div'); host.id = 'zl-pf-block'; card.parentNode.insertBefore(host, card.nextSibling); }
    host.innerHTML = '<div class="profile-section-label" style="margin-bottom:6px;">Connections</div>' +
      '<div class="z1tf-section">' +
      '<div class="z1tf-section-title">🔑 X ACCOUNT + API KEYS</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.6;">Saved on this device only. Used by Z1 and the Engine.</div>' +
      '<div>' + pfBadge(!!k.gem, 'Gemini') + pfBadge(!!k.groq, 'Z1-G / Groq') + pfBadge(!!k.oai, 'OpenAI') + '</div>' +
      pfFld('zl-pf-user', 'X username (without @)', p.xUsername || '', 'text', 'yourhandle') +
      pfFld('zl-pf-gem', 'Gemini API key', k.gem || '', 'password', 'AIza...') +
      pfFld('zl-pf-groq', 'Z1-G (Groq) API key', k.groq || '', 'password', 'gsk_...') +
      pfFld('zl-pf-oai', 'OpenAI API key', k.oai || '', 'password', 'sk-...') +
      '<div id="zl-pf-err" style="display:none;color:#f87171;font-size:12px;margin-top:8px"></div>' +
      '<button id="zl-pf-save" class="field-btn" style="width:100%;padding:11px;margin-top:10px">Save</button>' +
      '</div>';
    $('zl-pf-save').onclick = function () {
      var u = $('zl-pf-user').value.trim().replace(/^@/, '');
      if (u && !/^[A-Za-z0-9_]{1,15}$/.test(u)) { var er = $('zl-pf-err'); er.style.display = 'block'; er.textContent = 'Enter a valid X username (letters, numbers, underscore).'; return; }
      var pr = jget(PF_P, {}); if (u) { pr.xUsername = u; pr.manual = true; } jset(PF_P, pr);
      var kk = { gem: $('zl-pf-gem').value.trim(), groq: $('zl-pf-groq').value.trim(), oai: $('zl-pf-oai').value.trim() };
      jset(PF_K, kk); try { if (B && B.engKeysSet) B.engKeysSet(JSON.stringify(kk)); } catch (e) {}
      try { if (typeof zlApply === 'function') zlApply(); } catch (e) {}
      say('Saved'); pfBlock(); try { renderHome(); } catch (e) {}
    };
  }
  function pfExtraRows() {
    // Splash toggle: Preferences, right after the 12-hour clock row
    var ck = $('profile-clock-toggle');
    if (ck && !$('profile-splash-toggle')) {
      var row = ck.parentNode, r = document.createElement('div');
      r.className = 'profile-row'; r.style.cssText = 'cursor:default;margin-bottom:7px;';
      r.innerHTML = '<div class="profile-row-left"><span class="profile-row-icon">🖼</span> <span>Splash Images</span></div><button class="profile-toggle" id="profile-splash-toggle"><div class="profile-toggle-knob"></div></button>';
      row.parentNode.insertBefore(r, row.nextSibling);
      $('profile-splash-toggle').onclick = function () {
        var on = !this.classList.contains('on'); this.classList.toggle('on', on);
        try { localStorage.setItem(PF_SP, on ? '0' : '1'); } catch (e) {}
        say(on ? 'Splash images ON' : 'Splash images OFF');
      };
    }
    var sp = $('profile-splash-toggle'); if (sp) sp.classList.toggle('on', localStorage.getItem(PF_SP) !== '1');
    // Account: Engine settings row + working Support row
    var rows = document.querySelectorAll('#profile-sheet .profile-row');
    for (var i = 0; i < rows.length; i++) {
      var oc = rows[i].getAttribute('onclick') || '';
      if (/openSettings\(\)/.test(oc) && !$('zl-pf-engine')) {
        var e = document.createElement('div'); e.className = 'profile-row'; e.id = 'zl-pf-engine';
        e.innerHTML = '<div class="profile-row-left"><span class="profile-row-icon">⚡</span> Engine Settings</div><span class="profile-row-arrow">›</span>';
        e.onclick = function () { closeProfileSheet(); goEngine(); };
        rows[i].parentNode.insertBefore(e, rows[i]);
      }
      if (/openSupport\(\)/.test(oc)) {
        rows[i].setAttribute('onclick', 'zlSupport()');
      }
    }
  }
  window.zlSupport = function () {
    try { closeProfileSheet(); } catch (e) {}
    try {
      showProfileInfoModal('Support', 'Z1 now runs fully on this device, so there is no support server or ticket system. If something does not work: 1) Profile → check your X username and API keys are saved. 2) Open the X tab and make sure you are logged in. 3) Engine → check SEA/FED and Tone. 4) History shows the error line for every failed reply.');
    } catch (e) {}
  };

  // Z1EN TF code: stored on this device (the old server database is gone)
  function tfCode() {
    var c = ''; try { c = localStorage.getItem('zl_tf_code') || ''; } catch (e) {}
    if (!c) {
      try { c = (typeof _genTFCode === 'function') ? _genTFCode() : ''; } catch (e) {}
      if (!c) { var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (var i = 0; i < 8; i++) c += A.charAt(Math.floor(Math.random() * A.length)); }
      try { localStorage.setItem('zl_tf_code', c); } catch (e) {}
    }
    return c;
  }
  window.loadZ1TFProfile = function () {
    var c = $('z1tf-profile-code'); if (c) c.textContent = tfCode();
    var st = $('z1tf-profile-status'); if (st) { st.textContent = 'Extension not connected'; st.style.color = 'var(--muted)'; }
  };
  window.regenZ1TFCode = function () {
    try { localStorage.removeItem('zl_tf_code'); } catch (e) {}
    window.loadZ1TFProfile(); say('New code generated');
  };

  var _ops = window.openProfileSheet;
  window.openProfileSheet = function () {
    var r = _ops.apply(this, arguments);
    try { pfBlock(); pfExtraRows(); window.loadZ1TFProfile(); } catch (e) { try { console.warn('z1-ui profile', e); } catch (e2) {} }
    return r;
  };

  // menu: Upload Post List entry under Home
  function menuExtra() {
    if ($('mmenu-upload')) return;
    var h = $('home-btn'); if (!h || !h.parentNode) return;
    var it = document.createElement('div'); it.className = 'mmenu-item'; it.id = 'mmenu-upload';
    it.innerHTML = '<div class="mmenu-icon" style="display:flex;align-items:center;justify-content:center;font-size:18px">📁</div><div class="mmenu-text"><div class="mmenu-label">Show All Files</div><div class="mmenu-sub">File queue · add a .txt file</div></div>';
    it.onclick = goFiles;
    h.parentNode.insertBefore(it, h.nextSibling);
  }

  // ---------- boot ----------
  function boot() {
    var m = $('home-screen'); if (!m) { var host = $('main-screen') ? $('main-screen').parentNode : $('app'); m = document.createElement('div'); m.className = 'screen'; m.id = 'home-screen'; host.appendChild(m); }
    ensureHistRoot(); ensureStatsRoot();
    try { lastCfg = B.engCfgGet(); } catch (e) {}
    var s = document.querySelector('.screen.active');
    if (s && s.id === 'home-screen') renderHome();
    // old menu "Stats" / "History" / "Dashboard" entries now open the new screens
    markTabs(); watchBack(); menuExtra();
    try { var sl = $('session-label'), pu = jget('zl_profile', {}).xUsername; if (sl && pu && /^@?me$/i.test(sl.textContent.trim())) sl.textContent = '@' + pu; } catch (e) {}
    setInterval(function () { markTabs(); watchBack(); }, 1500);
  }
  window.zlHomeRender = renderHome;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 80); }); else setTimeout(boot, 80);
})();

/* ===== Settings sheet: old Z1 design for Tone / Grammar / Big Reply / Custom / Style, data = Engine cfg (same as the X engine) ===== */
(function () {
  var B = window.ZenX;
  var TONES = ['Smart', 'Funny', 'Professional', 'Supportive', 'Witty', 'Curious', 'Short', 'Human', 'Alpha', 'Positive', 'PositiveQuestion', 'Helpful', 'Master', 'Custom', 'Auto'];
  var LBL = { Professional: 'Pro', Supportive: 'Support', PositiveQuestion: 'Pos.Q', Auto: 'Auto Mix' };
  var GRAM = TONES.filter(function (t) { return t !== 'Custom'; });
  var BIGT = TONES.filter(function (t) { return t !== 'Custom' && t !== 'Auto'; });
  var cfg = {}, gramOpen = false;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() {
    var c = {}; try { c = JSON.parse((B && B.engCfgGet && B.engCfgGet()) || '{}') || {}; } catch (e) {}
    cfg = {
      tone: TONES.indexOf(c.tone) >= 0 ? c.tone : 'Smart', style: c.style || '',
      grammar: (c.grammar && typeof c.grammar === 'object') ? c.grammar : {},
      bigOn: !!c.bigOn, bigWords: c.bigWords || '', bigTone: BIGT.indexOf(c.bigTone) >= 0 ? c.bigTone : 'Smart',
      customTone: c.customTone || '', customWords: c.customWords || ''
    };
  }
  function save(p) {
    for (var k in p) cfg[k] = p[k];
    try { B.engCfgSet(JSON.stringify(p)); } catch (e) { try { toast('Run Z1 inside ZEN browser', 'error'); } catch (x) {} }
  }
  var INP = 'width:100%;margin-top:6px;background:var(--s2);border:1.5px solid var(--border2);border-radius:12px;padding:10px 12px;color:var(--text);font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;';
  function tog(id, on) { return '<label class="toggle-switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="toggle-slider"></span></label>'; }
  function render() {
    var el = $('zl-set-engine'); if (!el) return;
    load();
    var chips = TONES.map(function (t) { return '<div class="tone-chip' + (cfg.tone === t ? ' active' : '') + '" data-tone="' + t + '">' + (LBL[t] && t !== 'Auto' ? LBL[t] : t === 'Auto' ? 'Auto Mix' : t) + '</div>'; }).join('');
    var gr = GRAM.map(function (t) {
      return '<div class="toggle-row"><div><div class="toggle-label">' + (t === 'Auto' ? 'Auto Mix' : t) + '</div></div>' + tog('zs-g-' + t, cfg.grammar[t] !== false) + '</div>';
    }).join('');
    var bt = BIGT.map(function (t) { return '<option value="' + t + '"' + (cfg.bigTone === t ? ' selected' : '') + '>' + t + '</option>'; }).join('');
    el.innerHTML =
      '<div class="setting-block"><span class="field-label">// TONE</span><div class="tone-grid" id="zs-tones">' + chips + '</div>' +
      '<div style="font-size:10px;color:#facc15;margin-top:6px;line-height:1.5;">Auto Mix = random tone every reply, never the same one twice in a row.</div>' +
      '<div id="zs-custom" style="display:' + (cfg.tone === 'Custom' ? 'block' : 'none') + ';margin-top:10px;"><span class="field-label">// CUSTOM TONE — YOUR INSTRUCTIONS</span>' +
      '<textarea id="zs-cprompt" rows="4" placeholder="e.g. Reply like a sarcastic crypto trader. Max one sentence." style="' + INP + 'resize:vertical;">' + esc(cfg.customTone) + '</textarea>' +
      '<input id="zs-cwords" type="number" min="1" max="60" placeholder="Words (optional)" value="' + esc(cfg.customWords) + '" style="' + INP + '"></div></div>' +

      '<div class="setting-block"><div class="toggle-row" id="zs-gfold" style="cursor:pointer"><div><div class="toggle-label">// USE GRAMMAR</div>' +
      '<div style="font-size:10px;color:#facc15;margin-top:3px;line-height:1.5;">Turn a tone OFF to let the AI write naturally without fixing grammar.</div></div><span id="zs-garrow" style="color:var(--muted)">' + (gramOpen ? '▲' : '▼') + '</span></div>' +
      '<div id="zs-glist" style="display:' + (gramOpen ? 'block' : 'none') + '">' + gr + '</div></div>' +

      '<div class="setting-block"><span class="field-label">// BIG REPLY</span>' +
      '<div style="font-size:10px;color:#facc15;margin-bottom:4px;line-height:1.5;">Replies are short by default. Turn this on for your own word count and tone.</div>' +
      '<div class="toggle-row"><div><div class="toggle-label">Big Reply Mode</div></div>' + tog('zs-bigon', cfg.bigOn) + '</div>' +
      '<input id="zs-bwords" placeholder="Word count, e.g. 50-80 or 100" value="' + esc(cfg.bigWords) + '" style="' + INP + '">' +
      '<select id="zs-btone" style="' + INP + '">' + bt + '</select>' +
      '<div class="tone-chip" id="zs-breset" style="margin-top:8px;">↺ Reset to default</div></div>' +

      '<div class="setting-block"><span class="field-label">// REPLY STYLE (YOUR VOICE)</span>' +
      '<textarea id="zs-style" rows="3" placeholder="Describe yourself like you would describe a friend." style="' + INP + 'resize:vertical;">' + esc(cfg.style) + '</textarea></div>';
    wire(el);
  }
  function wire(el) {
    [].forEach.call(el.querySelectorAll('[data-tone]'), function (b) {
      b.onclick = function () { save({ tone: b.getAttribute('data-tone') }); render(); };
    });
    el.querySelector('#zs-gfold').onclick = function () { gramOpen = !gramOpen; $('zs-glist').style.display = gramOpen ? 'block' : 'none'; $('zs-garrow').textContent = gramOpen ? '▲' : '▼'; };
    GRAM.forEach(function (t) {
      var e = el.querySelector('#zs-g-' + t);
      if (e) e.onchange = function () { var g = {}; for (var k in cfg.grammar) g[k] = cfg.grammar[k]; g[t] = e.checked; save({ grammar: g }); };
    });
    el.querySelector('#zs-bigon').onchange = function () { save({ bigOn: this.checked }); };
    el.querySelector('#zs-bwords').onchange = function () { save({ bigWords: this.value.trim() }); };
    el.querySelector('#zs-btone').onchange = function () { save({ bigTone: this.value }); };
    el.querySelector('#zs-breset').onclick = function () { save({ bigOn: false, bigWords: '', bigTone: 'Smart' }); render(); try { toast('Big Reply reset', 'success'); } catch (e) {} };
    el.querySelector('#zs-cprompt').onchange = function () { save({ customTone: this.value.trim() }); };
    el.querySelector('#zs-cwords').onchange = function () { save({ customWords: this.value.trim() }); };
    el.querySelector('#zs-style').onchange = function () { save({ style: this.value.trim() }); };
  }
  function init() {
    var sh = $('settings-sheet'); if (!sh) return;
    new MutationObserver(function () { if (sh.classList.contains('open')) render(); }).observe(sh, { attributes: true, attributeFilter: ['class'] });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 100); }); else setTimeout(init, 100);
})();
