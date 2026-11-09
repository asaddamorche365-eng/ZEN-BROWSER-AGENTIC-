// ZEN BROWSER — SEA + FED engine (port of Z EX eng_sea.js / eng_fed.js, local only, no CDP)
// Injected by MainActivity at document start on x.com / twitter.com (assets/scripts/x.js).
// SEA = x.com/search results, FED = x.com/home feed. AI calls go through the native bridge ZenEng (keys never touch the page).
(function () {
  'use strict';
  if (window.top !== window || window.__ZENG) return;
  window.__ZENG = 1;

  // ---------------- settings (localStorage of x.com) ----------------
  var CK = 'zenEngCfg', RK = 'zenEngReplied';
  var DEF = { cursorFx: false, cursorSkin: 'navy', cursorText: false, sea: false, fed: false, auto: false, like: false, likePct: 100, target: false, targetKw: '',
    tone: 'Smart', style: '', keyword: '', maxRun: 40, paceMin: 4, paceMax: 9,
    ageOn: false, ageMinMin: 0, ageMaxMin: 60, myHandle: '',
    grammar: {}, bigOn: false, bigWords: '', bigTone: 'Smart', customTone: '', customWords: '',
    // timing (Engine -> Timing): CLASSIC = Reply Speed + like->comment delay, ADVANCED = FLASH / FLASH LITE / FAST / SLOW / CUSTOM (same as the extension's Timing Hub)
    tUi: 'classic', tMode: 'fast', tMethod: 'per', tPer: 40, tN: 50, tTotal: 1200, tBreakEvery: 50, tBreakMin: 30, tBreakMax: 50,
    cSpeed: 'normal', cGap: 5, ldMin: 0, ldMax: 0,
    // per-engine settings (null = fall back to the old shared key above)
    seaLike: null, seaLikePct: null, seaMax: null, seaKeyword: null, fedLike: null, fedLikePct: null, fedMax: null, fedKeyword: null,
    // SEA search: the Engine screen builds the final search URL (keywords + filters, or the ON custom query) into seaUrl
    seaUrl: '',
    // Extra Safety 2 (open the post first), separate for each engine
    seaEs2: false, seaEs2Pct: 30, fedEs2: false, fedEs2Pct: 30,
    // Keyword Reply (port of the extension's Keywords tab): short posts (Gm / Gn / HHM ...) get a short human-style reply, no AI call.
    // kwAuto = built-in keywords on/off · kwCustomOn + kwCustom = your own keywords (comma separated) · kwMode = 'both' (custom + built-in) | 'custom' (only custom)
    kwAuto: true, kwCustomOn: true, kwCustom: '', kwMode: 'both',
    // Account list (extension's Blacklist): never comment on these accounts. Array of lowercase handles (no @).
    blackList: [], whiteList: [],
    // Telegram engines (tg.js panel): like before comment, null = use the shared Like setting
    tgLike: null, tgLikePct: null,
    // Follow engine + Auto Unfollow settings (Engine screen); the run itself lives in the app job store (fjob / ujob)
    folSpeed: 'safe', folMin: 120, folMax: 240,
    unfMode: 'nonfollowers', unfLimit: 0, unfMin: 15, unfMax: 20, unfBreakEvery: 15, unfBreakSec: 120 };
  // settings + runtime toggles live in the app (SharedPreferences) so the Engine settings page and this panel share them
  function loadCfg() {
    var c = {};
    try { var raw = (window.ZenEng && window.ZenEng.getCfg) ? window.ZenEng.getCfg() : localStorage.getItem(CK); c = JSON.parse(raw || '{}') || {}; } catch (e) {}
    var o = {}; for (var k in DEF) o[k] = (k in c) ? c[k] : DEF[k]; return o;
  }
  var cfg = loadCfg();
  function patchCfg(p) {
    for (var k in p) cfg[k] = p[k];
    try { if (window.ZenEng && window.ZenEng.setCfg) window.ZenEng.setCfg(JSON.stringify(p)); else localStorage.setItem(CK, JSON.stringify(cfg)); } catch (e) {}
  }
  var SHARED = { Like: 'like', LikePct: 'likePct', Max: 'maxRun', Keyword: 'keyword' };
  function ecfg(eng, k) {   // per-engine value (seaLike / fedMax ...) with fallback to the old shared key
    var v = cfg[String(eng || '').toLowerCase() + k];
    return (v === undefined || v === null) ? cfg[SHARED[k]] : v;
  }
  var replied = {}; try { replied = JSON.parse(localStorage.getItem(RK) || '{}') || {}; } catch (e) {}
  function markReplied(id, eng) {
    if (!id) return; replied[id] = { e: eng, t: Date.now() };
    var ks = Object.keys(replied); if (ks.length > 3000) { ks.sort(function (a, b) { return replied[a].t - replied[b].t; }); ks.slice(0, 500).forEach(function (k) { delete replied[k]; }); }
    try { localStorage.setItem(RK, JSON.stringify(replied)); } catch (e) {}
  }
  var stat = { msg: 'Idle', done: 0, skip: 0 }, skipSeen = {};
  function setStat(m) { stat.msg = m; }
  function noteSkip(a) { var i = statusId(a); if (i && !skipSeen[i]) { skipSeen[i] = 1; stat.skip++; } }
  var skipped = {};   // this page session: status ids that failed / comment-off
  var tag = { SEA: 'zen-sea-btn', FED: 'zen-fed-btn' };

  // ---------------- tiny helpers ----------------
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function txt(el) { return (el && (el.innerText != null ? el.innerText : el.textContent)) || ''; }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function toast(msg, kind) {
    try {
      var t = document.getElementById('zeng-toast');
      if (!t) { t = document.createElement('div'); t.id = 'zeng-toast';
        t.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:2147483647;max-width:86%;padding:9px 14px;border-radius:12px;font:600 13px sans-serif;color:#fff;pointer-events:none;opacity:0;transition:opacity .2s';
        document.documentElement.appendChild(t); }
      t.textContent = msg; t.style.background = kind === 'error' ? '#b91c1c' : kind === 'warn' ? '#b45309' : '#15803d'; t.style.opacity = '1';
      clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = '0'; }, 2600);
    } catch (e) {}
  }
  function isSearchUrl() { return location.pathname.indexOf('/search') === 0; }
  function isHomeUrl() { return location.pathname === '/home' || location.pathname === '/'; }
  function curMode() { if (cfg.sea && isSearchUrl()) return 'SEA'; if (cfg.fed && isHomeUrl()) return 'FED'; return null; }

  // ---------------- article helpers ----------------
  function articles() { return $$('article[data-testid="tweet"]'); }
  function statusId(a) { var l = a.querySelector('a[href*="/status/"]'); var m = l && /\/status\/(\d+)/.exec(l.getAttribute('href') || ''); return m ? m[1] : null; }
  function author(a) {
    var b = a.querySelector('[data-testid="User-Name"]'); if (!b) return null;
    var ls = b.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < ls.length; i++) { var m = /^\/([A-Za-z0-9_]+)$/.exec(ls[i].getAttribute('href') || ''); if (m) return m[1].toLowerCase(); }
    return null;
  }
  var AD = ['boosted', 'ad', 'ads', 'promoted', 'sponsored', 'anzeige', 'publicidad', 'promocionado', 'publicité', 'реклама', 'reklam', 'iklan', 'বিজ্ঞাপন', '広告', '광고', '推广', '廣告'];
  function isAd(a) {
    if (a.dataset && a.dataset.zengAd === '1') return true;
    if (a.closest('[data-testid="placementTracking"]')) { a.dataset.zengAd = '1'; return true; }
    var ns = a.querySelectorAll('span,div');
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i]; if (n.children.length) continue;
      var t = (n.textContent || '').trim().toLowerCase();
      if (!t || t.length > 20 || AD.indexOf(t) < 0) continue;
      if (n.closest('[data-testid="tweetText"],[data-testid="card.layoutLarge.detail"]')) continue;
      a.dataset.zengAd = '1'; return true;
    }
    return false;
  }
  var ownH = null, ownLearned = null;
  function ownHandle() {
    if (ownLearned) return ownLearned;
    try { var cached = localStorage.getItem('zenEngOwn'); if (cached) { ownLearned = cached; return ownLearned; } } catch (e) {}   // composer avatar = ground truth
    var mh = String(cfg.myHandle || '').replace(/^@/, '').trim().toLowerCase();
    if (mh) return mh;
    if (ownH) return ownH;
    try {   // X keeps the session user in its page state
      var st = window.__INITIAL_STATE__, uid = st && st.session && (st.session.user_id || (st.session.user && st.session.user.id_str));
      var u = uid && st.entities && st.entities.users && st.entities.users.entities && st.entities.users.entities[uid];
      if (u && u.screen_name) ownH = String(u.screen_name).toLowerCase();
    } catch (e) {}
    if (!ownH) {
      var b = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
      var m = b && /@([A-Za-z0-9_]{1,15})/.exec(b.textContent || ''); if (m) ownH = m[1].toLowerCase();
    }
    if (!ownH) { var p = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]'); var h = p && /^\/([A-Za-z0-9_]+)$/.exec(p.getAttribute('href') || ''); if (h) ownH = h[1].toLowerCase(); }
    if (!ownH) {
      var av = document.querySelector('[data-testid="DashButton_ProfileIcon_Link"] [data-testid^="UserAvatar-Container-"], header [data-testid^="UserAvatar-Container-"]');
      var id = av && (av.getAttribute('data-testid') || '').replace('UserAvatar-Container-', '').toLowerCase();
      if (id && /^[a-z0-9_]{1,15}$/.test(id)) ownH = id;
    }
    return ownH;
  }
  function learnOwnFromComposer() {   // the composer's own avatar is the last avatar in the reply box
    var d = document.querySelector('[aria-modal="true"]') || document;
    var av = $$('[data-testid^="UserAvatar-Container-"]', d); if (!av.length) return;
    var id = (av[av.length - 1].getAttribute('data-testid') || '').replace('UserAvatar-Container-', '').toLowerCase();
    if (/^[a-z0-9_]{1,15}$/.test(id) && id !== ownLearned) {
      var had = ownHandle(); ownLearned = id; try { localStorage.setItem('zenEngOwn', id); } catch (e) {}
      if (had !== id) toast('Your account detected: @' + id, 'success');
    }
  }
  async function probeOwnHandle() {
    if (ownHandle()) return true;
    var link = document.querySelector('a[href="/compose/post"],[data-testid="FloatingActionButton_Tweet"],[data-testid="SideNav_NewTweet_Button"]');
    if (!link) return false;
    await tap(link);
    var t0 = Date.now();
    while (Date.now() - t0 < 7000 && !document.querySelector('[data-testid="tweetTextarea_0"]')) await sleep(150);
    await sleep(500); learnOwnFromComposer();
    await closeComposer();
    if (document.querySelector('[data-testid="tweetTextarea_0"]')) { try { history.back(); } catch (e) {} await sleep(600); }
    return !!ownHandle();
  }
  var ourTexts = {};   // replies we wrote: never reply to a post carrying our own text
  function normT(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function isOwn(a) { var o = ownHandle(), au = author(a); return !!(o && au && o === au); }
  var REPLYING = /^\s*(replying to|en réponse à|en respuesta a|antwort an|em resposta a|in risposta a|в ответ|yanıt olarak|membalas|balasan untuk)\b/i;
  function isReply(a) {   // a comment: the "Replying to @x" line sits between the name row and the post text
    try {
      var head = a.querySelector('[data-testid="User-Name"]'); if (!head) return false;
      var body = a.querySelector('[data-testid="tweetText"]');
      var sc = a.querySelector('[data-testid="socialContext"]');
      if (sc && REPLYING.test(sc.textContent || '')) return true;
      var ls = a.querySelectorAll('a[href^="/"]');
      for (var i = 0; i < ls.length; i++) {
        var l = ls[i]; if ((l.textContent || '').trim().charAt(0) !== '@') continue;
        if (head.contains(l)) continue;
        if (!(head.compareDocumentPosition(l) & 4)) continue;                    // must come after the name row
        if (body && (body.contains(l) || !(l.compareDocumentPosition(body) & 4))) continue;   // and before the post text
        if (l.closest('[data-testid="card.wrapper"],[data-testid="quoteTweet"],[role="group"]')) continue;
        return true;   // language independent: an @link between name row and text = "Replying to"
      }
    } catch (e) {}
    return false;
  }
  function ageVerdict(a) {   // SEA post age window (minutes)
    if (!cfg.ageOn) return 'ok';
    var t = a.querySelector('time[datetime]'); var ms = t ? Date.parse(t.getAttribute('datetime')) : NaN;
    if (!isFinite(ms)) return 'ok';
    var age = (Date.now() - ms) / 60000;
    if (age > cfg.ageMaxMin) return 'old';
    if (age < cfg.ageMinMin) return 'skip';
    return 'ok';
  }
  function targetOk(text) {   // FED target keyword filter (OR, case-insensitive)
    if (!cfg.target) return true;
    var kws = String(cfg.targetKw || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    if (!kws.length) return true;
    text = text.toLowerCase(); return kws.some(function (k) { return text.indexOf(k) >= 0; });
  }

  // ---------------- Keyword Reply (port of the extension) ----------------
  // Short posts like "GM guys" get a short human-style reply built locally (no AI). The built-in list is shown in Settings -> Keywords.
  var BUILTIN_KW = ['gm', 'gn', 'hhm', 'gmm', 'gnnn', 'gmmm', 'happy mutant monday', 'happy mutant', 'good morning', 'good night', 'morning', 'night'];
  var GM_REPLIES = ['Gmm {name}', 'Gm {name}', 'Gmmm {name}', 'morning {name}', 'morning legend {name}', 'Gm boss', 'Gm fam', 'Gm ser', 'gm gm', 'rise n grind {name}', 'morning vibes {name}', 'Gm Gm {name}'];
  var GN_REPLIES = ['Gn {name}', 'Gnnn {name}', 'sleep well {name}', 'Gn fam', 'rest up {name}', 'Gn ser', 'gn gn', 'night {name}', 'sweet dreams {name}'];
  var HHM_REPLIES = ['HHM {name}', 'HHM ser', 'happy mutant {name}', 'HHM fam', 'mutant monday {name}', 'hhm hhm', 'Mutants stay wild {name}'];
  var GENERIC_SHORT_REPLIES = ['Gm {name}', 'letsgooo {name}', 'based {name}', 'fr {name}', 'say less {name}', 'W {name}', 'real one {name}', 'facts {name}', 'this {name}', 'always {name}'];
  var KW_MAX_LEN = 120;   // only short posts are keyword posts
  function kwWord(t, kw) {   // whole-word / whole-phrase match ("gn" must not hit "design")
    var i = 0, L = /[\p{L}\p{N}]/u;
    while ((i = t.indexOf(kw, i)) >= 0) {
      var b = i === 0 || !L.test(t.charAt(i - 1)), e = i + kw.length >= t.length || !L.test(t.charAt(i + kw.length));
      if (b && e) return true; i++;
    }
    return false;
  }
  function customKws() { return String(cfg.kwCustom || '').split(/[,\n]/).map(function (k) { return k.trim().toLowerCase(); }).filter(Boolean); }
  function kwBuiltInActive() { return cfg.kwAuto !== false && !(cfg.kwCustomOn !== false && cfg.kwMode === 'custom'); }   // "only custom" turns the built-in list off
  function kwMatch(post) {
    var t = String(post || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!t || t.length > KW_MAX_LEN) return false;
    if (kwBuiltInActive() && BUILTIN_KW.some(function (k) { return kwWord(t, k); })) return true;
    if (cfg.kwCustomOn !== false && customKws().some(function (k) { return kwWord(t, k); })) return true;
    return false;
  }
  function firstName(a) {
    try {
      var n = a.querySelector('[data-testid="User-Name"] span'); var raw = n ? txt(n).trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, '') : '';
      return raw.length > 1 ? raw : '';
    } catch (e) { return ''; }
  }
  function shortReply(post, name) {
    var t = String(post || '').toLowerCase(), pool;
    if (/\bgn\b|good night|gnnn|sleep well/.test(t)) pool = GN_REPLIES;
    else if (/hhm|happy mutant/.test(t)) pool = HHM_REPLIES;
    else if (/\bgm\b|good morning|gmm|morning/.test(t)) pool = GM_REPLIES;
    else pool = GENERIC_SHORT_REPLIES;
    return pool[Math.floor(Math.random() * pool.length)].replace('{name}', name || '').replace(/\s+/g, ' ').trim();
  }

  // ---------------- Blacklist (port of the extension's Account Lists) ----------------
  var blKey = null, blSet = {};
  function isBlocked(a) {
    try {
      var raw = cfg.blackList, key = Array.isArray(raw) ? raw.join(',') : String(raw || '');
      if (key !== blKey) {
        blKey = key; blSet = {};
        (Array.isArray(raw) ? raw : key.split(/[\s,]+/)).forEach(function (h) { h = String(h || '').trim().replace(/^@/, '').toLowerCase(); if (h) blSet[h] = 1; });
      }
      var au = author(a); return !!au && blSet[au] === 1;
    } catch (e) { return false; }
  }

  // ---------------- clicking / typing ----------------
  function pointerClick(el) {
    var r = el.getBoundingClientRect(), x = r.left + r.width / 2 + rnd(-2, 2), y = r.top + r.height / 2 + rnd(-2, 2);
    var o = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    function pe(n, bub) { try { el.dispatchEvent(new PointerEvent(n, bub === false ? Object.assign({}, o, { bubbles: false }) : o)); } catch (e) {} }
    function me(n, bub) { el.dispatchEvent(new MouseEvent(n, bub === false ? Object.assign({}, o, { bubbles: false }) : o)); }
    pe('pointerover'); pe('pointerenter', false); me('mouseover'); me('mouseenter', false); me('mousemove');
    pe('pointerdown'); me('mousedown'); pe('pointerup'); me('mouseup'); me('click');
  }
  // ---------------- animated cursor ----------------
  var cur = null, curHide = null, skFx = null, fxCv = null, chip = null, chipTxt = '', chipHideT = null;
  function useSkin() { return !!cfg.cursorFx && !!window.ZexCursorFX; }
  function cursorWanted() { return !!(cfg.cursorFx || cfg.cursorText); }
  function cursorEl() {
    var sk = useSkin();
    if (cur && cur.isConnected && cur._skin === sk) {
      if (sk && skFx && cur._skinId !== (cfg.cursorSkin || 'navy')) { cur._skinId = cfg.cursorSkin || 'navy'; skFx.setSkin(cur._skinId); }
      return cur;
    }
    if (cur) { try { cur.remove(); } catch (e) {} }
    if (skFx) { try { skFx.stop(); } catch (e) {} skFx = null; fxCv = null; }
    chip = null; chipTxt = '';
    cur = document.createElement('div'); cur.id = 'zeng-cursor'; cur._skin = sk;
    if (sk) {
      cur.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;opacity:0;will-change:transform;transition:transform .45s cubic-bezier(.22,.8,.3,1),opacity .25s';
      fxCv = document.createElement('canvas'); fxCv.style.cssText = 'display:block;image-rendering:pixelated;';
      cur._skinId = cfg.cursorSkin || 'navy';
      skFx = window.ZexCursorFX.create(fxCv, { skin: cur._skinId, u: 2, bubble: true, arrow: true });
      cur.appendChild(fxCv); cur.style.width = skFx.width + 'px'; cur.style.height = skFx.height + 'px';
    } else {
      cur.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;z-index:2147483647;pointer-events:none;opacity:0;' +
        'background:radial-gradient(circle,#fff 0 18%,rgba(167,139,250,.95) 20% 45%,rgba(109,40,217,.35) 48% 100%);box-shadow:0 0 14px 4px rgba(139,92,246,.75);' +
        'transition:transform .45s cubic-bezier(.22,.8,.3,1),opacity .25s';
    }
    cur._x = window.innerWidth / 2; cur._y = window.innerHeight * 0.7; cursorPlace(cur._x, cur._y, '');
    document.documentElement.appendChild(cur); return cur;
  }
  // the skin sits right of the pointer; near the right edge it flips to the left (same as the extension)
  function cursorPlace(x, y, extra) {
    var c = cur; if (!c) return;
    if (c._skin && skFx) {
      var f = (x + skFx.width + 6) > window.innerWidth; skFx.setFlip(f);
      c.style.transform = 'translate(' + (f ? Math.max(0, x - skFx.width + 1) : x) + 'px,' + y + 'px)' + (extra || '');
    } else c.style.transform = 'translate(' + x + 'px,' + y + 'px)' + (extra || '');
    chipPlace();
  }
  function cursorShow() { var c = cursorEl(); c.style.opacity = '1'; if (skFx) { try { skFx.start(); } catch (e) {} } return c; }
  function cursorHide() { if (cur) { cur.style.opacity = '0'; if (skFx) { try { skFx.stop(); } catch (e) {} } } chipHide(); }
  function cursorJobOn() { try { return !!(jGet('pjob').running || jGet('fjob').running); } catch (e) { return false; } }
  function cursorTick() {   // called every second: while an engine / Autopilot runs, the cursor stays on screen
    var want = cursorWanted() && (cfg.auto || cursorJobOn());
    if (want) { cursorShow(); clearTimeout(curHide); curHide = null; }
    else if (cur && cur.style.opacity === '1' && !curHide) curHide = setTimeout(function () { curHide = null; cursorHide(); }, 1500);
  }
  // ----- status text: skin = its pixel speech bubble, plain cursor = small coloured pill (Engine > Cursor) -----
  var CHIP_BG = { clicking: '#c2410c', typing: '#a21caf', submitting: '#1d4ed8', thinking: '#0369a1', reading: '#15803d', scrolling: '#4338ca', liking: '#be185d', success: '#047857', resting: '#475569' };
  var CHIP_POOL = {
    scroll: ['scrolling', ['Browsing the feed', 'Scrolling through', 'Scanning the timeline']],
    search: ['reading', ['Looking for something interesting', 'Searching posts']],
    found: ['reading', ['Reading the tweet', 'Getting the context', 'Taking it in', 'Checking this post']],
    read: ['thinking', ['Reading the post for AI', 'Thinking about a reply']],
    like: ['liking', ['Liking this one', 'Tapping the heart']],
    comment: ['clicking', ['Opening reply box', 'Getting ready to reply']],
    type: ['typing', ['Crafting a response', 'Writing a reply', 'Finding the right words']],
    typed: ['reading', ['Reading it over', 'One last look']],
    reply: ['submitting', ['Posting now', 'Hitting send']],
    done: ['success', ['Reply posted', 'Done, reply is up']],
    rest: ['resting', ['Taking a short rest', 'Waiting a bit']]
  };
  var chipLast = '';
  function chipPlace() {
    if (!chip || !cur || cur._skin) return;
    var f = (cur._x || 0) > window.innerWidth - 220; chip.style.left = f ? 'auto' : '30px'; chip.style.right = f ? '30px' : 'auto';
  }
  function chipHide() { clearTimeout(chipHideT); if (chip) { var c = chip; c.style.opacity = '0'; setTimeout(function () { if (c.style.opacity === '0') c.remove(); }, 300); chip = null; chipTxt = ''; } }
  function chipPaint(text, look, hold) {
    if (!cur || cur._skin || cur.style.opacity !== '1' || text === chipTxt) return;
    chipTxt = text;
    if (!chip) {
      chip = document.createElement('div');
      chip.style.cssText = 'position:absolute;top:3px;white-space:nowrap;padding:3px 9px;border-radius:999px;color:#fff;font:600 11px/1.3 system-ui,sans-serif;opacity:0;transition:opacity .2s;box-shadow:0 2px 8px rgba(0,0,0,.35)';
      cur.appendChild(chip);
    }
    chip.style.backgroundColor = CHIP_BG[look] || '#4338ca'; chip.textContent = text; chipPlace();
    requestAnimationFrame(function () { if (chip) chip.style.opacity = '1'; });
    clearTimeout(chipHideT); if (hold) chipHideT = setTimeout(chipHide, hold);
  }
  // key = state name (scroll search found read like comment type typed reply done rest)
  function cursorState(key) {
    try {
      if (!cursorWanted() || !cur || cur.style.opacity !== '1') return;
      if (useSkin()) { if (skFx) skFx.setState(key); return; }
      var m = CHIP_POOL[key]; if (!m) return;
      var t = m[1][Math.floor(Math.random() * m[1].length)]; if (m[1].length > 1 && t === chipLast) t = m[1][(m[1].indexOf(t) + 1) % m[1].length];
      chipLast = t; chipPaint(t, m[0], key === 'done' ? 2500 : 0);
    } catch (e) {}
  }
  // free words (skin: max ~30 letters, A-Z 0-9 only; plain cursor: any text). base = which face / prop the skin shows
  function cursorSay(text, base, look) {
    try {
      if (!cursorWanted()) return;
      if (!cur || cur.style.opacity !== '1') { if (!(cfg.auto || cursorJobOn())) return; cursorShow(); }
      if (useSkin()) { if (skFx) skFx.say(text, base || 'read'); return; }
      chipPaint(String(text), look || (CHIP_POOL[base] || [])[0] || 'reading', 0);
    } catch (e) {}
  }
  function cursorWander() {   // idle drift, like a finger moving around the screen
    try {
      if (!cursorWanted() || !cur || cur.style.opacity !== '1') return;
      var x = rnd(30, window.innerWidth - 80), y = rnd(90, window.innerHeight - 140); cur._x = x; cur._y = y; cursorPlace(x, y, '');
    } catch (e) {}
  }
  async function moveCursor(el) {
    try {
      var c = cursorEl(), r = el.getBoundingClientRect();
      var x = r.left + r.width / 2 + rnd(-3, 3), y = r.top + r.height / 2 + rnd(-3, 3);
      c.style.opacity = '1'; if (skFx) { try { skFx.start(); } catch (e) {} }
      c._x = x; c._y = y; cursorPlace(x, y, '');
      await sleep(480);
      c.style.transition = 'transform .08s, opacity .25s'; cursorPlace(x, y, ' scale(.7)'); await sleep(90);
      cursorPlace(x, y, ' scale(1)'); c.style.transition = 'transform .45s cubic-bezier(.22,.8,.3,1),opacity .25s';
      var rp = document.createElement('div');
      rp.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;border:2px solid #a78bfa;z-index:2147483647;pointer-events:none;transition:all .5s ease-out;opacity:.9';
      document.documentElement.appendChild(rp);
      setTimeout(function () { rp.style.width = '46px'; rp.style.height = '46px'; rp.style.margin = '-23px 0 0 -23px'; rp.style.opacity = '0'; }, 20);
      setTimeout(function () { rp.remove(); }, 600);
      clearTimeout(curHide); curHide = setTimeout(function () { curHide = null; if (!(cursorWanted() && (cfg.auto || cursorJobOn()))) cursorHide(); }, 3500);
    } catch (e) {}
  }
  async function tap(el) { await moveCursor(el); pointerClick(el); }

  async function ensureVisible(el) {
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
    for (var i = 0; i < 12; i++) { var r = el.getBoundingClientRect(); if (r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight) break; await sleep(100); }
    await sleep(200);
  }
  function editorOf(w) { if (!w) return null; if (w.tagName === 'TEXTAREA' || w.getAttribute('contenteditable') === 'true') return w; return w.querySelector('[contenteditable="true"]') || w.querySelector('textarea') || w; }
  function liveEditor() {
    var all = $$('[data-testid="tweetTextarea_0"]'); if (!all.length) return null;
    var m = all.filter(function (w) { return w.closest('[aria-modal="true"],[data-testid="sheetDialog"]'); })[0];
    return editorOf(m || all[all.length - 1]);
  }
  function editorText(ed) { return ((ed && (ed.value != null && ed.tagName === 'TEXTAREA' ? ed.value : txt(ed))) || '').trim(); }
  function editorEmpty(ed) { var t = editorText(ed); return !t || t === 'Post your reply' || t === 'What is happening?!'; }
  function replyOffDialog() {
    var d = document.querySelector('[role="dialog"],[aria-modal="true"]'); if (!d) return false;
    if (d.querySelector('[data-testid="tweetTextarea_0"]')) return false;
    return /who can reply|can reply|only .* can reply/i.test(d.textContent || '');
  }
  async function openReplyBox(a) {
    await ensureVisible(a);
    var icon = a.querySelector('[data-testid="reply"]'); if (!icon) return null;
    await tap(icon);
    var t0 = Date.now();
    while (Date.now() - t0 < 9500) {
      await sleep(100);
      if (replyOffDialog()) { var e = new Error('comments off'); e.off = true; throw e; }
      if (toastDead() || pageDead()) { var ed1 = new Error('Post deleted / unavailable'); ed1.dead = true; throw ed1; }
      if (limitShowing()) { var el1 = new Error('X limit reached (too many replies)'); el1.limit = true; throw el1; }
      var modal = document.querySelector('[aria-modal="true"][role="dialog"],[data-testid="sheetDialog"]');
      var w = modal && modal.querySelector('[data-testid="tweetTextarea_0"]');
      if (!w && a.parentElement) w = a.parentElement.querySelector('[data-testid="tweetTextarea_0"]');
      if (!w && /\/compose\//.test(location.pathname)) w = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!w) w = document.querySelector('[data-testid="tweetTextarea_0"]');
      var ed = editorOf(w); if (ed) { await sleep(300); learnOwnFromComposer(); return liveEditor() || ed; }
    }
    return null;
  }
  async function insertText(ed, text) {
    ed = (ed && ed.isConnected) ? ed : liveEditor(); if (!ed) return false;
    for (var attempt = 0; attempt < 3; attempt++) {
      ed = (ed.isConnected ? ed : liveEditor()); if (!ed) return false;
      try { ed.focus(); } catch (e) {}
      if (ed.tagName === 'TEXTAREA') {
        var set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(ed, text);
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        try { var s = window.getSelection(), r = document.createRange(); r.selectNodeContents(ed); s.removeAllRanges(); s.addRange(r); } catch (e) {}
        try { ed.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true })); ed.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true })); } catch (e) {}
        await sleep(120);
        if (editorEmpty(ed)) {
          try { document.execCommand('selectAll', false); document.execCommand('delete', false); document.execCommand('insertText', false, text); } catch (e) {}
          await sleep(120);
        }
        if (editorEmpty(ed)) {
          try { var dt = new DataTransfer(); dt.setData('text/plain', text); ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); } catch (e) {}
          await sleep(200);
        }
      }
      if (!editorEmpty(ed)) return true;
      await sleep(250 + attempt * 250);
    }
    return false;
  }
  function submitBtn(ed) {
    var el = ed;
    for (var i = 0; i < 25 && el; i++) { el = el.parentElement; if (!el) break; var b = el.querySelector('[data-testid="tweetButtonInline"],[data-testid="tweetButton"]'); if (b) return b; }
    return document.querySelector('[data-testid="tweetButton"],[data-testid="tweetButtonInline"]');
  }
  async function postReply(ed) {   // auto mode only: click Reply, wait until the box closes
    var t0 = Date.now(), b = null;
    while (Date.now() - t0 < 7500) { b = submitBtn(ed); if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') break; b = null; await sleep(100); }
    if (!b) return false;
    await sleep(fx(rnd(2000, 3000), 400));
    try { b.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
    await tap(b);
    var t1 = Date.now();
    while (Date.now() - t1 < 6000) {
      await sleep(150);
      if (postErrorShowing()) {
        var ex = new Error('X: something went wrong'); ex.xerr = true;
        if (limitShowing()) { ex.limit = true; ex.message = 'X: daily reply limit reached'; return await failPost(ed, ex, false); }
        var es = await es1Retry(ed);
        if (es === 'ok') return true;
        if (es === 'routine') { ex.routine = true; ex.message = 'X blocked as automated - cool-down routine started'; }
        return await failPost(ed, ex, es === 'routine');
      }
      if (!ed.isConnected && !document.querySelector('[data-testid="tweetTextarea_0"]')) return true;
      if (ed.isConnected && Date.now() - t1 > 1500 && editorEmpty(ed)) return true;   // inline composer on a post page: it stays, but its text is gone
    }
    return !ed.isConnected;
  }
  async function failPost(ed, ex, routine) {   // count the safety hit, discard the draft (Back -> Discard), then let the caller move to the next post
    if (ex.limit) { patchCfg({ auto: false }); fatalMsg = 'X says the daily reply limit is reached - auto stopped'; }
    else if (safetyHit()) { ex.safety = true; }
    if (!routine) await recoverPostError();
    throw ex;
  }
  async function closeComposer() {
    try {
      var close = document.querySelector('[data-testid="app-bar-close"]') || document.querySelector('[aria-label="Close"]');
      if (close && document.querySelector('[data-testid="tweetTextarea_0"]')) {
        await tap(close); await sleep(500);
        var disc = document.querySelector('[data-testid="confirmationSheetConfirm"]'); if (disc) { await tap(disc); await sleep(400); }
      }
    } catch (e) {}
  }

  // ---------------- X error handling (port of the extension: zenPostErrorShowing / zenRecoverPostError / zexXPageDeleted /
  // zexTimelineError / zexReloadForError / Safety stop / Extra Safety 1) ----------------
  var ERR_RE = /something went wrong|(reply|post) (was )?not sent|couldn.?t (send|post)|could not (send|post)|failed to (send|post)|over the (daily )?limit|daily limit/i;
  var LIMIT_RE = /over the (daily )?limit|daily limit|rate limit exceeded|too many (requests|posts)/i;
  var AUTO_RE = /might be automated|looks like it might be automated/i;
  var DEAD_RE = /this page doesn.?t exist|(this|that) (post|tweet) (was|has been) deleted|(this|that) (post|tweet) (is|was) unavailable|post is unavailable|(this|that) (post|tweet) (doesn.?t|does not) exist|no longer (exists|available)|account suspended|account no longer exists|hmm\.\.\./i;
  var fatalMsg = '', goodUrl = '', es1Busy = false;
  function errTextNow() {   // short alert / toast / error nodes only (never whole-page text)
    var out = '';
    try {
      var nodes = document.querySelectorAll('[role="alert"], [data-testid="toast"], [data-testid="error-detail"], main div, [role="dialog"] div');
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i]; if (n.children.length > 4) continue;
        if (n.closest && n.closest('article')) continue;   // a post's own text can never count as an X error
        var t = (n.textContent || '').trim(); if (t.length && t.length < 160 && (ERR_RE.test(t) || DEAD_RE.test(t))) out += ' ' + t;
      }
    } catch (e) {}
    return out;
  }
  function postErrorShowing() { return ERR_RE.test(errTextNow()); }
  function limitShowing() { return LIMIT_RE.test(errTextNow()); }
  function automatedShowing() { try { return AUTO_RE.test(document.body.innerText || ''); } catch (e) { return false; } }
  function pageDead() {   // "Hmm... this page doesn't exist" / post deleted / account suspended (permanent, not a retry case)
    try {
      if (document.querySelector('article[data-testid="tweet"]')) return false;
      var roots = document.querySelectorAll('[data-testid="error-detail"], main [role="alert"], [data-testid="primaryColumn"]');
      for (var i = 0; i < roots.length; i++) { var t = (roots[i].innerText || roots[i].textContent || '').trim(); if (t.length && t.length <= 400 && DEAD_RE.test(t)) return true; }
    } catch (e) {}
    return false;
  }
  function toastDead() { try { var t = $$('[data-testid="toast"],[role="alert"]').map(function (x) { return x.textContent || ''; }).join(' '); return DEAD_RE.test(t); } catch (e) { return false; } }
  function timelineError() {   // X's "Something went wrong. Try reloading." + Retry button (the button does not really work -> full reload)
    try {
      var col = document.querySelector('[data-testid="primaryColumn"]') || document.body, btns = col.querySelectorAll('button, [role="button"]');
      for (var i = 0; i < btns.length; i++) if (/^\s*retry\s*$/i.test(btns[i].innerText || '')) return true;
    } catch (e) {}
    return false;
  }
  function loginWall() { return /^\/(login|i\/flow\/login|i\/flow\/signup|i\/flow\/logout)/.test(location.pathname); }
  async function waitOnline(ms) { var end = Date.now() + ms; while (!navigator.onLine && Date.now() < end && cfg.auto) await sleep(1000); return navigator.onLine; }
  async function reloadForError(why) {   // cap: 3 reloads / 10 min so it can never loop forever
    try {
      var now = Date.now(), log = [];
      try { log = JSON.parse(sessionStorage.getItem('zenEngReloadLog') || '[]').filter(function (t) { return now - t < 600000; }); } catch (e) {}
      if (log.length >= 3) { toast('Feed keeps failing - reload limit reached (3 / 10 min)', 'warn'); return false; }
      log.push(now); try { sessionStorage.setItem('zenEngReloadLog', JSON.stringify(log)); } catch (e) {}
      writeRun(); toast('Feed failed to load (' + (why || 'error') + ') - refreshing page...', 'warn');
      logEv({ k: 'error', e: curMode() || '', m: 'Feed error (' + (why || 'error') + ') - page reloaded' });
      await sleep(800); location.reload(); return true;
    } catch (e) { return false; }
  }
  function byText(root, re) {
    var els = (root || document).querySelectorAll('button, [role="button"]');
    for (var i = 0; i < els.length; i++) if (re.test((els[i].innerText || els[i].textContent || '').trim())) return els[i];
    return null;
  }
  async function recoverPostError() {   // Back arrow -> "Save post?" -> Discard
    try {
      var back = document.querySelector('[data-testid="app-bar-back"], [aria-label="Back"], [data-testid="app-bar-close"], [aria-label="Close"]');
      if (back) await tap(back);
      for (var i = 0; i < 20; i++) {
        await sleep(250);
        var dlg = document.querySelector('[role="alertdialog"], [data-testid="confirmationSheetDialog"], [role="dialog"], [aria-modal="true"]');
        var disc = byText(dlg || document, /^discard$/i) || document.querySelector('[data-testid="confirmationSheetConfirm"]');
        if (disc) { await tap(disc); break; }
        if (!document.querySelector('[data-testid="tweetTextarea_0"]') && !/\/compose\//.test(location.pathname)) break;
      }
      await sleep(700);
    } catch (e) {}
  }
  // Safety: 3x "Something went wrong" after Reply in ONE run (SEA + FED together) -> stop everything
  function safetyHit() {
    var n = 0; try { n = Number(sessionStorage.getItem('zenEngSafe') || 0) || 0; } catch (e) {}
    n++; try { sessionStorage.setItem('zenEngSafe', String(n)); } catch (e) {}
    if (n >= 3) {
      patchCfg({ auto: false }); fatalMsg = 'SAFETY STOP: 3x "Something went wrong" in one run - take a break';
      logEv({ k: 'error', e: curMode() || '', m: fatalMsg }); toast('System auto stopped for safety reasons, take some break buddy', 'warn'); return true;
    }
    return false;
  }
  // Extra Safety 1: after "Something went wrong" click Reply once more. If X still blocks it with "might be automated" ->
  // discard, reload, Home -> scroll -> like 2-3 -> Profile -> scroll -> back to the saved page.
  async function es1Retry(ed) {   // -> 'ok' | 'fail' | 'routine'
    try {
      toast('Error - trying Reply once more...', 'warn'); await sleep(rnd(1800, 3200));
      var b = submitBtn(ed); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return 'fail';
      await tap(b);
      var t0 = Date.now(); while (Date.now() - t0 < 5000) { await sleep(150); if (postErrorShowing()) break; }
      if (!postErrorShowing()) return 'ok';
      await sleep(600); if (!automatedShowing()) return 'fail';
      logEv({ k: 'error', e: curMode() || '', m: 'Automated-request block - running cool-down routine' });
      var url = goodUrl || 'https://x.com/home';
      await recoverPostError(); writeRun();
      try { sessionStorage.setItem('zenEs1Job', JSON.stringify({ ts: Date.now(), url: url })); } catch (e) {}
      es1Busy = true; location.href = url; return 'routine';
    } catch (e) { return 'fail'; }
  }
  async function es1Scroll(ms) { var end = Date.now() + ms; while (Date.now() < end) { window.scrollBy({ top: rnd(250, 520), behavior: 'smooth' }); await sleep(rnd(700, 1300)); } }
  async function es1Routine(job) {
    es1Busy = true;
    try {
      toast('Cooling down like a normal user...', 'warn');
      await waitFor(function () { return document.querySelector('article'); }, 15000); await sleep(rnd(1500, 2500));
      var home = document.querySelector('a[data-testid="AppTabBar_Home_Link"], a[href="/home"]');
      if (home) { await tap(home); await waitFor(function () { return /\/home/.test(location.pathname) && document.querySelector('article'); }, 10000); }
      await sleep(rnd(1500, 2500)); await es1Scroll(rnd(5000, 8000));
      var liked = 0, want = 2 + Math.floor(Math.random() * 2);
      for (var t = 0; t < 10 && liked < want; t++) {
        var btns = $$('article [data-testid="like"]').filter(function (b) { var r = b.getBoundingClientRect(); return r.width > 0 && r.top > 90 && r.bottom < window.innerHeight - 70; });
        if (btns.length) { await tap(btns[Math.floor(Math.random() * btns.length)]); liked++; await sleep(rnd(1500, 3000)); }
        window.scrollBy({ top: rnd(300, 600), behavior: 'smooth' }); await sleep(rnd(1200, 2200));
      }
      var prof = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      if (prof) { await tap(prof); await waitFor(function () { return document.querySelector('[data-testid="UserName"], [data-testid="primaryColumn"] article'); }, 10000); await sleep(rnd(1000, 1800)); await es1Scroll(rnd(3000, 4000)); }
    } catch (e) {}
    try { sessionStorage.removeItem('zenEs1Job'); } catch (e) {}
    location.href = (job && job.url) || 'https://x.com/home';
  }
  function es1Check() {
    try {
      var raw = sessionStorage.getItem('zenEs1Job'); if (!raw) return;
      var job = JSON.parse(raw); es1Busy = true;
      if (!job || Date.now() - job.ts > 240000) { sessionStorage.removeItem('zenEs1Job'); es1Busy = false; return; }
      setTimeout(function () { es1Routine(job); }, 2500);
    } catch (e) {}
  }
  async function waitClose(ed) { var t0 = Date.now(); while (ed && ed.isConnected && Date.now() - t0 < 60000) await sleep(150); }

  // ---------------- AI (native bridge) ----------------
  var cbs = {}, cbN = 0;
  window.__zenEngCb = function (id, json) { var f = cbs[id]; delete cbs[id]; if (f) { try { f(JSON.parse(json)); } catch (e) { f({ ok: false, error: 'bad_json' }); } } };
  // ---- tone system (same structure as the Z EX extension) ----
  // Extension prompts live on its server, so the instruction text per tone is written here. Everything else is the same:
  // 15 tones, Auto = random pool without repeating the same tone twice, Use Grammar per tone (default ON),
  // Big Reply (word count + its own tone overrides the normal tone), Custom tone (own prompt + word limit).
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
  function pickTone() {
    var t = TONE_LIST.indexOf(cfg.tone) >= 0 ? cfg.tone : 'Smart';
    if (t === 'Auto') t = resolveAuto();
    if (cfg.bigOn && TONES[cfg.bigTone]) t = cfg.bigTone;       // Big Reply mode: its own tone wins (like the extension)
    return t;
  }
  function buildPrompt(post, tone, eng) {
    var big = !!cfg.bigOn && String(cfg.bigWords || '').trim();
    var p = 'Post:\n' + post + '\n\n';
    if (tone === 'Custom' && String(cfg.customTone || '').trim()) p += 'Reply instructions: ' + cfg.customTone.trim() + ' ';
    else p += 'Tone: ' + (TONES[tone] || TONES.Smart) + ' ';
    if (big) p += 'Write a longer reply of about ' + String(cfg.bigWords).trim() + ' words. ';
    else if (tone === 'Custom' && String(cfg.customWords || '').trim()) p += 'Keep it within ' + String(cfg.customWords).trim() + ' words. ';
    else if (tone !== 'Short') p += 'Keep it short (under 30 words). ';
    p += 'Write ONE reply in the same language as the post. No hashtags, no links, no emoji spam, no quotes around the reply. Reply text only.';
    var useGrammar = !(cfg.grammar && cfg.grammar[tone] === false);
    p += useGrammar ? ' Use correct grammar and punctuation.' : ' Write naturally like real typing: relaxed punctuation, grammar fixing is OFF.';
    if (cfg.style && cfg.style.trim()) p += ' Use this replying style (your voice): ' + cfg.style.trim();
    var kw = String(ecfg(eng, 'Keyword') || '').trim(); if (kw) p += ' Include this keyword naturally: ' + kw;
    return p;
  }
  function gen(post, tone, eng) {
    return new Promise(function (resolve, reject) {
      if (!window.ZenEng) { reject(new Error('Bridge missing (update app)')); return; }
      var id = 'g' + (++cbN), done = false;
      var to = setTimeout(function () { if (!done) { done = true; delete cbs[id]; reject(new Error('AI timeout')); } }, 45000);
      cbs[id] = function (r) { if (done) return; done = true; clearTimeout(to); if (r && r.ok && r.text) resolve(r.text); else reject(new Error((r && r.error) || 'AI failed')); };
      try { window.ZenEng.gen(buildPrompt(post, tone, eng), id); } catch (e) { done = true; clearTimeout(to); reject(e); }
    });
  }
  function genRaw(prompt) {   // plain AI text (used by Autopilot to write posts)
    return new Promise(function (resolve, reject) {
      if (!window.ZenEng) { reject(new Error('Bridge missing (update app)')); return; }
      var id = 'g' + (++cbN), done = false;
      var to = setTimeout(function () { if (!done) { done = true; delete cbs[id]; reject(new Error('AI timeout')); } }, 45000);
      cbs[id] = function (r) { if (done) return; done = true; clearTimeout(to); if (r && r.ok && r.text) resolve(r.text); else reject(new Error((r && r.error) || 'AI failed')); };
      try { window.ZenEng.gen(String(prompt), id); } catch (e) { done = true; clearTimeout(to); reject(e); }
    });
  }
  // ---- timing: copy of the extension's Timing Hub (comment group) ----
  // CLASSIC  = Reply Speed (Normal 4-7 s / Fast 2-3.5 s / Custom gap) + "comment after like" delay.
  // ADVANCED = FLASH / FLASH LITE / FAST / SLOW / CUSTOM (per post or total time). Numbers are in seconds.
  var T_FAST = { view: [1, 2], like: [1, 2], gen: [1, 2], post: [1, 2], next: [5, 7], target: null, breakEvery: 50, breakLen: [30, 50] };
  var T_SLOW = { view: [3, 5], like: [3, 5], gen: [3, 5], post: [3, 5], next: [12, 18], target: null, breakEvery: 25, breakLen: [75, 125] };
  var T_FLASH = { view: [0.1, 0.3], like: [0.1, 0.3], gen: [0.1, 0.3], post: [0.1, 0.3], next: [0.3, 0.8], target: null, breakEvery: 0, breakLen: [0, 0], flash: true };
  var T_LITE = { view: [0.3, 0.8], like: [0.3, 0.8], gen: [0.2, 0.6], post: [0.2, 0.6], next: [0.8, 1.6], target: 12.5, breakEvery: 0, breakLen: [0, 0], flash: true, lite: true };
  function clampN(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function advRes() {   // null in CLASSIC
    if (cfg.tUi !== 'advanced') return null;
    var m = cfg.tMode;
    if (m === 'flash') return T_FLASH;
    if (m === 'flashlite') return T_LITE;
    if (m === 'slow') return T_SLOW;
    if (m !== 'custom') return T_FAST;
    var T = cfg.tMethod === 'total' ? Math.max(1, (Number(cfg.tTotal) || 1200) / Math.max(1, Number(cfg.tN) || 50)) : Math.max(1, Number(cfg.tPer) || 40);
    var s = clampN(T * 0.06, 1, 20), st = [r1(s * 0.7), r1(s * 1.3)], b1 = Number(cfg.tBreakMin) || 0, b2 = Number(cfg.tBreakMax) || 0;
    return { view: st, like: st, gen: st, post: st, next: [Math.max(2, Math.round(T * 0.5)), Math.max(2, Math.round(T))], target: T,
      breakEvery: Math.max(0, Math.floor(Number(cfg.tBreakEvery) || 0)), breakLen: [Math.min(b1, b2), Math.max(b1, b2)] };
  }
  function rrange(r) { var a = Number(r && r[0]) || 0, b = Number(r && r[1]) || 0; return Math.min(a, b) + Math.random() * Math.abs(b - a); }
  function fx(ms, min) {   // Flash shrinks fixed internal waits (Lite keeps 40%, Flash 20%)
    var r = advRes(); if (!r) return ms;
    return r.lite ? Math.max(min || 0, Math.round(ms * 0.4)) : (r.flash ? Math.max(min || 0, Math.round(ms * 0.2)) : ms);
  }
  async function likeWait() {   // after a like lands, before the reply box opens
    var r = advRes();
    if (r) { var ms = Math.round(rrange(r.like) * 1000); if (ms > 0) { setStat('Like -> comment ' + r1(ms / 1000) + 's'); await sleep(ms); } return; }
    var a = Number(cfg.ldMin) || 0, b = Number(cfg.ldMax) || 0;
    if (b > 0 || a > 0) await sleep(rrange([a, b]) * 1000); else await sleep(rnd(700, 1600));
  }
  async function genWait() { var r = advRes(); if (!r) return; var ms = Math.round(rrange(r.gen) * 1000); if (ms > 0) { setStat('After reply is generated ' + r1(ms / 1000) + 's'); await sleep(ms); } }
  var cycleT0 = 0;   // start of the current post's cycle (custom mode fills the rest of the target time)
  function classicNext() {
    var ms;
    if (cfg.cSpeed === 'fast') ms = 2000 + Math.random() * 1500;
    else if (cfg.cSpeed === 'custom') ms = Math.max(1, Number(cfg.cGap) || 5) * 1000;
    else ms = 4000 + Math.random() * 3000;
    return ms * (0.8 + Math.random() * 0.4);   // +-20% jitter, fixed intervals are detectable
  }
  async function countdown(ms, label) {
    var end = Date.now() + ms;
    var lastC = 0;
    while (cfg.auto) { var left = end - Date.now(); if (left <= 0) break; setStat(label + ' ' + Math.ceil(left / 1000) + 's'); if (ms >= 6000 && Date.now() - lastC > 4000) { lastC = Date.now(); if (useSkin()) cursorState('rest'); else cursorSay(label + ' ' + Math.ceil(left / 1000) + 's', 'rest', 'resting'); } await sleep(Math.min(left, 1000)); }
  }
  // everything after a reply lands: "after clicking Reply" wait, optional break, then the gap before the next post
  async function paceWait() {
    var r = advRes();
    if (!r) { await countdown(classicNext(), 'Waiting'); return; }
    var pm = Math.round(rrange(r.post) * 1000); if (pm > 0) await countdown(pm, 'After reply');
    if (r.breakEvery > 0 && runCount > 0 && runCount % r.breakEvery === 0 && r.breakLen[1] > 0) {
      await countdown(Math.round(rrange(r.breakLen)) * 1000, 'Break'); return;
    }
    var gap, elapsed = cycleT0 ? Date.now() - cycleT0 : 0;
    if (r.target && r.lite) gap = clampN(elapsed * 0.17 * (0.85 + Math.random() * 0.3), 300, 3000);
    else if (r.target) gap = Math.max(r.flash ? 300 : 2000, r.target * 1000 * (0.85 + Math.random() * 0.3) - elapsed);
    else gap = rrange(r.next) * 1000;
    await countdown(gap, 'Next post in');
  }
  // ---- history log (stored in the app, shown in Z1 → History / Stats) ----
  function logEv(o) { try { if (window.ZenEng && window.ZenEng.logEvent) { o.t = Date.now(); window.ZenEng.logEvent(JSON.stringify(o)); } } catch (e) {} }
  function cleanReply(t) {
    t = String(t || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (!t || /https?:\/\/|www\./i.test(t)) return '';
    return t.slice(0, 270);
  }

  // ---------------- Extra Safety 2 (port of the extension's zexEs2*) ----------------
  // AUTO only, separate switch + % for SEA and FED. Draw by % (a shuffled deck, so the real share stays close to the %):
  // "open" = tap the post's own permalink (time link), do the whole reply from the post page, then go back to the list.
  var es2Back = null, es2Iv = null;
  function statusPageId() { var m = location.pathname.match(/\/status\/(\d+)/); return m ? m[1] : ''; }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function es2On(eng) { return !!cfg[String(eng).toLowerCase() + 'Es2']; }
  function es2Pct(eng) { var v = Number(cfg[String(eng).toLowerCase() + 'Es2Pct']); return isFinite(v) ? v : 30; }
  function es2Roll(eng) {
    var c = Math.min(100, Math.max(0, Math.round(es2Pct(eng)) || 0));
    if (c >= 100) return true; if (c <= 0) return false;
    var g = gcd(c, 100), size = 100 / g, yes = c / g, k = Math.max(1, Math.ceil(20 / size)); size *= k; yes *= k;
    var sk = 'zenEs2Deck:' + eng + ':' + c, deck = [];
    try { deck = JSON.parse(sessionStorage.getItem(sk) || '[]'); } catch (e) {}
    if (!Array.isArray(deck) || !deck.length) {
      deck = []; for (var n = 0; n < size; n++) deck.push(n < yes ? 1 : 0);
      for (var i = deck.length - 1; i > 0; i--) { var r = Math.floor(Math.random() * (i + 1)), t = deck[i]; deck[i] = deck[r]; deck[r] = t; }
    }
    var v = deck.pop() === 1;
    try { sessionStorage.setItem(sk, JSON.stringify(deck)); } catch (e) {}
    return v;
  }
  async function waitFor(fn, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) { try { var v = fn(); if (v) return v; } catch (e) {} await sleep(300); }
    return null;
  }
  function es2Abort() { es2Back = null; }
  function postPageReplyOff() {   // "only people ... can reply" banner on the post page
    try {
      var col = document.querySelector('[data-testid="primaryColumn"]') || document.body, t = (col.innerText || '');
      return /(only\s[^\n]{0,90}can reply|people\s[^\n]{0,90}can reply)/i.test(t) && !/everyone can reply/i.test(t);
    } catch (e) { return false; }
  }
  // -> { art } post page article | { off:true } comments limited | null (do it the normal way from the list)
  async function es2Enter(a, eng) {
    if (!es2Roll(eng)) return null;
    var sid = statusId(a), listUrl = location.href; if (!sid) return null;
    var exact = new RegExp('/status/' + sid + '$');
    var links = $$('a[href*="/status/' + sid + '"]', a).filter(function (x) { return exact.test((x.getAttribute('href') || '').split('?')[0]); });
    var link = links.filter(function (x) { return x.querySelector('time'); })[0] || links[0];
    if (!link) return null;
    es2Back = { url: listUrl, sid: sid, ts: Date.now(), ts2: 0 }; es2Watch();
    setStat('Opening the post first');
    try { await moveCursor(link); link.click(); } catch (e) { es2Abort(); return null; }
    var landed = await waitFor(function () { return statusPageId() !== '' && !/\/compose\//.test(location.pathname); }, 6000);
    if (!landed) { es2Abort(); return null; }
    if (statusPageId() !== sid) {   // wrong post opened: step back out, reply the normal way
      es2Abort(); history.back(); await waitFor(function () { return statusPageId() === ''; }, 5000); await sleep(800); return null;
    }
    var dead = await waitFor(function () { return pageDead() || toastDead(); }, 1500);
    if (dead) return { dead: true };
    var art = await waitFor(function () {
      var x = articles().filter(function (y) { return statusId(y) === sid; })[0];
      return x && x.querySelector('[data-testid="reply"]') ? x : null;
    }, 8000);
    if (!art) { es2Abort(); history.back(); await waitFor(function () { return statusPageId() === ''; }, 5000); await sleep(800); return null; }
    await sleep(fx(rnd(1500, 3500), 300));
    if (postPageReplyOff()) return { off: true };
    return { art: art };
  }
  // reply flow is over (posted / failed / discarded): leave the post page and wait until the list is back
  async function es2Return() {
    var b = es2Back; if (!b) return;
    try {
      var t0 = Date.now();
      while (/\/compose\//.test(location.pathname) && Date.now() - t0 < 8000) await sleep(250);
      await sleep(fx(rnd(1200, 2200), 300));
      if (statusPageId()) {
        history.back();
        await waitFor(function () { return statusPageId() === '' && !/\/compose\//.test(location.pathname); }, 8000);
        if (statusPageId()) { location.href = b.url; await sleep(1500); }   // last resort: reload the list page
      }
      await waitFor(function () { return document.querySelector('article'); }, 8000);
      await sleep(fx(rnd(700, 1400), 200));
    } catch (e) {} finally { es2Back = null; }
  }
  function es2WatchTick() {   // safety net: a post page with no reply flow for 40 s -> leave it
    try {
      var b = es2Back;
      if (!b) { clearInterval(es2Iv); es2Iv = null; return; }
      if (Date.now() - b.ts > 240000) { es2Back = null; return; }
      if (/\/compose\//.test(location.pathname)) { b.ts2 = Date.now(); return; }
      if (statusPageId() && Date.now() - (b.ts2 || b.ts) > 40000) { es2Back = null; history.back(); }
    } catch (e) {}
  }
  function es2Watch() { if (!es2Iv) es2Iv = setInterval(es2WatchTick, 2000); }

  // ---------------- per-post flow ----------------
  var busy = new WeakSet(), done = new WeakSet(), autoSkip = new WeakSet(), lastEditor = null;
  var autoRunning = false, runCount = 0, oldSeen = {};

  async function handleClick(a, btn, eng) {
    if (busy.has(a)) return false;
    var sid = statusId(a);
    if (sid && replied[sid]) { btn.remove(); return false; }
    if (isBlocked(a)) { btn.remove(); noteSkip(a); toast('Blacklisted account - skipped', 'warn'); return false; }
    var te = a.querySelector('[data-testid="tweetText"]');
    var post = te ? txt(te).trim() : '';
    if (!post) { toast('No text on this post', 'warn'); return false; }
    if (!navigator.onLine) { toast('No internet connection', 'error'); return false; }
    busy.add(a);
    var html = btn.innerHTML; btn.textContent = '...'; btn.disabled = true;
    var usedTone = '';
    try {
      setStat('Opening reply');
      cursorState('found'); if (cursorWanted()) await sleep(rnd(700, 1500));   // the post is being "read": status text stays readable
      if (ecfg(eng, 'Like') && !a.querySelector('[data-testid="unlike"]') && Math.random() * 100 < Number(ecfg(eng, 'LikePct'))) {
        var lk = a.querySelector('[data-testid="like"]'); if (lk) { cursorState('like'); await tap(lk); await likeWait(); }
      }
      // Extra Safety 2 (AUTO only): sometimes open the post itself first and reply from its page
      var ar = a;
      if (cfg.auto && es2On(eng) && !statusPageId()) {
        try {
          var r2 = await es2Enter(a, eng);
          if (r2 && r2.off) { var e2 = new Error('comments off'); e2.off = true; throw e2; }
          if (r2 && r2.dead) { var e4 = new Error('Post deleted / unavailable'); e4.dead = true; throw e4; }
          if (r2 && r2.art) ar = r2.art;
          else if (!a.isConnected) {   // we stepped back out: the feed re-rendered, find this post again
            var re = await waitFor(function () { return articles().filter(function (y) { return statusId(y) === sid; })[0]; }, 5000);
            if (re) ar = re;
          }
        } catch (e3) {
          if (e3 && (e3.off || e3.dead)) throw e3;
          es2Abort(); if (statusPageId()) { history.back(); await waitFor(function () { return statusPageId() === ''; }, 5000); }
        }
      }
      cursorState('comment');
      var ed = await openReplyBox(ar); if (!ed) throw new Error('Reply box did not open');
      lastEditor = ed;
      setStat('Generating reply'); cursorState('read');
      var reply = '';
      if (kwMatch(post)) { reply = cleanReply(shortReply(post, firstName(a))); if (reply) usedTone = 'Keyword'; }   // short keyword post: local short reply, no AI call
      if (!reply) {
        usedTone = pickTone();
        reply = cleanReply(await gen(post, usedTone, eng)); if (!reply) throw new Error('AI gave an unsafe/empty reply');
      }
      await genWait();
      cursorState('type');
      if (!(await insertText(ed, reply))) throw new Error('Text did not land in the box');
      cursorState('typed');
      ourTexts[normT(reply)] = 1;
      var posted = false;
      if (cfg.auto || eng === 'TG') {
        if (eng === 'TG' && !tgGet().running) throw new Error('Stopped');   // Stop pressed while the reply was being written
        setStat('Posting'); cursorState('reply'); posted = await postReply(liveEditor() || ed); if (posted) cursorState('done');
      }
      btn.textContent = 'DONE'; btn.classList.add('zen-done'); btn.style.opacity = '.6';
      if (posted) { markReplied(sid, eng); stat.done++; }
      logEv({ k: posted ? 'reply' : 'draft', e: eng, id: sid, a: author(a) || '', p: post.slice(0, 160), r: reply, tone: usedTone });
      toast(posted ? 'Reply posted' : 'Reply drafted — review & tap Reply', 'success');
      return true;
    } catch (err) {
      if (err && err.dead) { skipped[sid] = 1; markReplied(sid, 'deleted'); btn.remove(); logEv({ k: 'error', e: eng, id: sid, a: author(a) || '', m: 'Post deleted / unavailable - skipped' }); toast('Post deleted / unavailable - skipped', 'warn'); if (!statusPageId()) await closeComposer(); }
      else if (err && (err.xerr || err.limit)) { logEv({ k: 'error', e: eng, id: sid, a: author(a) || '', m: String(err.message).slice(0, 120), tone: usedTone }); btn.innerHTML = html; btn.disabled = false; toast(err.safety ? 'Safety stop: 3x Something went wrong' : String(err.message), 'error'); }
      else if (err && err.off) { skipped[sid] = 1; markReplied(sid, 'off'); btn.remove(); await closeComposer(); logEv({ k: 'off', e: eng, id: sid, a: author(a) || '' }); toast('Comments off — skipped', 'warn'); }
      else { logEv({ k: 'error', e: eng, id: sid, a: author(a) || '', m: String((err && err.message) || 'Reply failed').slice(0, 120), tone: usedTone }); btn.innerHTML = html; btn.disabled = false; toast(String((err && err.message) || 'Reply failed'), 'error'); await closeComposer(); }
      return false;
    } finally { busy.delete(a); if (es2Back) await es2Return(); }
  }

  function injectButton(a, eng) {
    if (done.has(a)) return;
    if (isAd(a)) { done.add(a); noteSkip(a); return; }
    if (a.querySelector('.' + tag[eng])) { done.add(a); return; }
    var bar = a.querySelector('[role="group"]'); if (!bar) return;
    var te = a.querySelector('[data-testid="tweetText"]');
    if (isOwn(a) || (te && ourTexts[normT(txt(te))])) { done.add(a); noteSkip(a); return; }   // own posts: always skipped
    if (isReply(a)) { done.add(a); noteSkip(a); return; }                                      // comments: always skipped
    if (isBlocked(a)) { done.add(a); noteSkip(a); return; }                                    // blacklisted account: never commented on
    if (eng === 'SEA') {
      var v = ageVerdict(a); if (v !== 'ok') { done.add(a); if (v === 'old') { var o = statusId(a); if (o) oldSeen[o] = 1; } return; }
    } else {
      if (!te || !txt(te).trim()) { done.add(a); return; }
      if (!targetOk(txt(te))) { done.add(a); return; }
    }
    done.add(a);
    var sid = statusId(a); if (sid && (replied[sid] || skipped[sid])) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'zen-eng-btn ' + tag[eng]; b.textContent = eng; b.title = 'Generate a short reply';
    b.style.cssText = 'margin-left:8px;padding:2px 10px;border-radius:12px;border:1px solid #7c5af5;background:#1a1330;color:#c4b5fd;font:700 12px sans-serif';
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); handleClick(a, b, eng); });
    bar.appendChild(b);
  }

  // ---------------- Telegram jobs: TG SWEEP + TG ENGAGE (port of the extension's Telegram engines) ----------------
  // tg.js (web.telegram.org) collects / finds the links and writes the job (ZenEng.startTgJob / patchTgJob). This X side does the per-link work:
  // open the post -> like (optional) -> reply (same tone / style / keyword reply as SEA + FED) -> post -> gap / break -> next link.
  // The job lives in the app (not in the page), so a reload never loses the place. Result of a link: done | failed | skipped | off | gone | blacklist | own.
  //   SWEEP : job.queue[] + job.idx (this side walks the whole list by itself)
  //   ENGAGE: job.phase 'X' + job.cur (tg.js finds each next link in the chat; this side reports back with phase 'FIND_NEXT' + job.waitUntil)
  var tgBusy = false;
  function tgGet() { try { return JSON.parse((window.ZenEng && window.ZenEng.getTgJob && window.ZenEng.getTgJob()) || '{}') || {}; } catch (e) { return {}; } }
  function tgPatch(p) { try { if (window.ZenEng && window.ZenEng.patchTgJob) window.ZenEng.patchTgJob(JSON.stringify(p)); } catch (e) {} }
  function linkId(u) { var m = /status\/(\d+)/.exec(String(u || '')); return m ? m[1] : ''; }
  function tgLabel(j) { return j.mode === 'engage' ? 'TG ENGAGE' : 'TG SWEEP'; }
  function tgTarget(j) { return j.mode === 'sweep' ? ((j.queue || [])[j.idx || 0] || '') : (j.phase === 'X' ? (j.cur || '') : ''); }
  function tgGapSec(j, skipped) {   // seconds after a link. Advanced timing wins (like the extension's Telegram numbers); classic: Group Engage 8-20 s, Sweep 30-60 s
    var r = advRes();
    if (skipped) return (r && r.flash) ? 0.3 : 1.5 + Math.random() * 1.5;
    if (r) return rrange(r.next);
    return j.mode === 'engage' ? rnd(8, 20) : rnd(30, 60);
  }
  function tgBreakSec(j) {   // longer break every N replies (Advanced timing: its numbers; classic: Group Engage every 5 replies, 60-120 s; Sweep none)
    var r = advRes(), every = 0, len = null;
    if (r) { every = Math.floor(Number(r.breakEvery) || 0); len = r.breakLen; }
    else if (j.mode === 'engage') { every = 5; len = [60, 120]; }
    if (every > 0 && (j.sinceBreak || 0) >= every && len && len[1] > 0) return Math.round(rrange(len));
    return 0;
  }
  function tgFinish(j, msg, kind) {
    tgPatch({ running: false, phase: 'DONE', msg: msg, waitUntil: 0, finishedAt: Date.now() });
    setStat(msg); toast(tgLabel(j) + ': ' + msg, kind || 'success');
    logEv({ k: 'run', e: 'TG', done: j.done || 0, skip: (j.skipped || 0) + (j.failed || 0), m: msg });
  }
  function tgStop() { var j = tgGet(); if (j.running) { tgPatch({ running: false, phase: 'DONE', msg: 'Stopped', waitUntil: 0 }); setStat('Stopped'); } }
  async function tgAfter(j0, id, outcome, why) {
    var j = tgGet(); if (!j.running || tgTarget(j) !== tgTarget(j0) && linkId(tgTarget(j)) !== id) return;
    var now = Date.now(), okRes = outcome === 'done', failed = outcome === 'failed', skip = !okRes && !failed;
    var p = { done: (j.done || 0) + (okRes ? 1 : 0), failed: (j.failed || 0) + (failed ? 1 : 0), skipped: (j.skipped || 0) + (skip ? 1 : 0),
      consec: failed ? (j.consec || 0) + 1 : (okRes ? 0 : (j.consec || 0)), sinceBreak: (j.sinceBreak || 0) + (okRes ? 1 : 0),
      last: { id: id, s: outcome, why: why || '', t: now }, msg: '' };
    if (failed) { var fu = (j.failedUrls || []).slice(-199); fu.push(tgTarget(j0) || j.cur || ''); p.failedUrls = fu; }
    var merged = Object.assign({}, j, p), end = '';
    if (j.mode === 'sweep') { p.idx = (j.idx || 0) + 1; if (p.idx >= (j.queue || []).length) end = 'Sweep finished'; }
    else { p.phase = 'FIND_NEXT'; p.lastMid = j.curMid; p.engaged = (j.engaged || []).slice(-1500).concat(id); if (j.endLink && linkId(j.endLink) === id) end = 'Reached the end link'; }
    if (!end && p.consec >= 5) end = 'Stopped: 5 failed links in a row';
    if (end) { tgPatch(p); tgFinish(Object.assign({}, merged, p), end, p.consec >= 5 ? 'error' : 'success'); return; }
    var wait, brk = tgBreakSec(merged);
    if (brk > 0) { wait = brk; p.sinceBreak = 0; p.brk = true; } else { wait = tgGapSec(j, skip); p.brk = false; }
    p.waitUntil = now + Math.round(wait * 1000); p.navAt = 0; p.stepAt = p.waitUntil;
    tgPatch(p);
  }
  async function tgWork(j, link, id) {
    tgBusy = true; var outcome = 'failed', why = '';
    try {
      tgPatch({ msg: 'Replying on X' }); setStat(tgLabel(j) + ' - reading post');
      var art = await waitFor(function () {
        if (pageDead() || toastDead()) return 'dead';
        var x = articles().filter(function (y) { return statusId(y) === id; })[0];
        return x && x.querySelector('[data-testid="reply"]') ? x : null;
      }, 15000);
      if (art === 'dead') outcome = 'gone';
      else if (!art) { outcome = 'failed'; why = 'Post did not load'; }
      else if (replied[id]) outcome = 'skipped';            // already replied by SEA / FED / an earlier TG run
      else if (isBlocked(art)) outcome = 'blacklist';
      else if (isOwn(art)) outcome = 'own';
      else {
        var b = document.createElement('button'); b.textContent = 'TG';
        if (await handleClick(art, b, 'TG')) outcome = 'done';
        else { var rec = replied[id]; outcome = (rec && rec.e === 'off') ? 'off' : (rec && rec.e === 'deleted') ? 'gone' : 'failed'; if (outcome === 'failed') why = 'Reply failed'; }
      }
      if (fatalMsg) { var fm = fatalMsg; fatalMsg = ''; tgFinish(Object.assign({}, tgGet()), fm, 'error'); return; }
      await tgAfter(j, id, outcome, why);
    } catch (e) { try { await tgAfter(j, id, 'failed', String(e && e.message || e).slice(0, 80)); } catch (e2) {} }
    finally { tgBusy = false; }
  }
  function tgTick() {
    if (tgBusy || autoRunning) return;
    var j = tgGet(); if (!j.running) return;
    var now = Date.now(), lab = tgLabel(j);
    if (j.waitUntil && now < j.waitUntil) { setStat(lab + ' - ' + (j.brk ? 'break' : 'next link') + ' in ' + Math.ceil((j.waitUntil - now) / 1000) + 's'); return; }
    if (loginWall()) { tgFinish(j, 'X logged out - log in again', 'error'); return; }
    if (j.mode === 'sweep' && (j.idx || 0) >= (j.queue || []).length) { tgFinish(j, 'Sweep finished'); return; }
    var target = tgTarget(j);
    if (!target) { setStat(lab + ' - waiting for Telegram'); return; }
    var id = linkId(target);
    if (j.stepAt && now - j.stepAt > 240000) {   // X never finished this link (4 min): count it failed and move on
      tgBusy = true; tgAfter(j, id, 'failed', 'Timed out').then(function () { tgBusy = false; }, function () { tgBusy = false; }); return;
    }
    if (statusPageId() === id) { tgWork(j, target, id); return; }
    setStat(lab + ' - opening post');
    if ((!j.navAt || now - j.navAt > 30000) && /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/.test(target)) {
      tgPatch({ navAt: now, stepAt: j.stepAt || now });
      try { location.href = target; } catch (e) {}
    }
  }

  // ---------------- FOLLOW engine + AUTO UNFOLLOW (port of the extension's eng_follow.js + eng_unfollow.js) ----------------
  // Jobs live in the app (fjob / ujob, started from the Engine screen), so a page reload never loses the place.
  //   FOLLOW  : fjob.queue[] of usernames, fjob.idx. Opens x.com/<user>, clicks Follow, confirms it flipped, waits the gap, next profile.
  //   UNFOLLOW: ujob. Runs on x.com/<you>/following: clicks Following -> confirm on each row (non-followers only, or everyone), gap + breaks.
  var folBusy = false, unfBusy = false;
  function jGet(name) { try { return JSON.parse((window.ZenEng && window.ZenEng.getJob && window.ZenEng.getJob(name)) || '{}') || {}; } catch (e) { return {}; } }
  function jPatch(name, p) { try { if (window.ZenEng && window.ZenEng.patchJob) window.ZenEng.patchJob(name, JSON.stringify(p)); } catch (e) {} }
  var FU_LIMIT_RE = /(daily limit|over the (daily )?limit|reached (the |your )?(daily )?limit|rate limit|limit (on|for) (following|unfollowing)|unable to (follow|unfollow)|too many (follows|requests)|temporarily (restricted|limited|locked)|(account|profile) (has been )?(locked|restricted|limited)|automated behavio|suspicious activity)/i;
  function fuLimitText() {
    var els = $$('[data-testid="toast"], [role="alert"], [aria-live="assertive"], [role="alertdialog"], [data-testid="sheetDialog"], [data-testid="confirmationSheetDialog"]');
    for (var i = 0; i < els.length; i++) { var t = String(els[i].innerText || els[i].textContent || '').slice(0, 400); if (t && FU_LIMIT_RE.test(t)) return t.trim().slice(0, 160); }
    return '';
  }
  function fuFinish(name, j, msg, kind) {
    jPatch(name, { running: false, status: 'done', msg: msg, waitUntil: 0, finishedAt: Date.now() });
    setStat(msg); toast((name === 'fjob' ? 'FOLLOW: ' : 'UNFOLLOW: ') + msg, kind || 'success');
  }
  function folButton() {
    var b = document.querySelector('button[data-testid$="-follow"], [role="button"][data-testid$="-follow"]'); if (b) return b;
    var all = $$('div[data-testid="placementTracking"] button, main button, main [role="button"]');
    for (var i = 0; i < all.length; i++) if (String(all[i].textContent || '').trim().toLowerCase() === 'follow') return all[i];
    return null;
  }
  function folDoneOrUnavailable() {   // already following / unblock / unmute / account gone: nothing to do (not a failure)
    var bs = $$('button, [role="button"]');
    for (var i = 0; i < bs.length; i++) { var t = String(bs[i].textContent || '').trim().toLowerCase(); if (t === 'following' || t === 'unblock' || t === 'unmute') return true; }
    return /this account doesn.?t exist|account suspended/i.test(document.body ? document.body.innerText || '' : '');
  }
  function profileOf(u) { var m = /^\/([A-Za-z0-9_]{1,15})\/?$/.exec(location.pathname); return !!m && m[1].toLowerCase() === String(u).toLowerCase(); }
  async function folWork(j, u) {
    folBusy = true; var outcome = 'failed', why = '';
    var wanted = function () { var q = jGet('fjob'); return !!q.running && (q.queue || [])[q.idx || 0] === u; };
    try {
      jPatch('fjob', { msg: 'Following @' + u }); setStat('FOLLOW - @' + u); cursorSay('Following @' + u, 'like', 'clicking');
      await sleep(rnd(1500, 2500)); if (!wanted()) return;
      if (folDoneOrUnavailable()) outcome = 'already';
      else {
        var btn = await waitFor(function () { return folButton(); }, 4000);
        if (!btn) { outcome = 'failed'; why = 'No Follow button'; }
        else if (folDoneOrUnavailable()) outcome = 'already';
        else {
          try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
          await sleep(rnd(200, 500));
          if (!wanted()) return;                       // last gate: Stop = never click Follow afterwards
          await tap(btn);
          var ok = await waitFor(function () {
            var nb = folButton(); var t = nb ? String(nb.textContent || '').trim().toLowerCase() : '';
            var any = $$('button, [role="button"]').some(function (b) { var x = String(b.textContent || '').trim().toLowerCase(); return x === 'following' || x === 'requested' || x === 'pending'; });
            return (t === 'following' || t === 'requested' || t === 'pending' || any) ? true : null;
          }, 3500);
          if (ok) outcome = 'done'; else { outcome = 'failed'; why = fuLimitText() || 'Follow did not land'; }
        }
      }
      var lim = outcome === 'failed' ? fuLimitText() : '';
      await folAfter(u, outcome, why, lim);
    } catch (e) { try { await folAfter(u, 'failed', String(e && e.message || e).slice(0, 80), ''); } catch (e2) {} }
    finally { folBusy = false; }
  }
  async function folAfter(u, outcome, why, lim) {
    var j = jGet('fjob'); if (!j.running || (j.queue || [])[j.idx || 0] !== u) return;
    var now = Date.now(), okRes = outcome === 'done', failed = outcome === 'failed';
    var p = { idx: (j.idx || 0) + 1, done: (j.done || 0) + (okRes ? 1 : 0), skipped: (j.skipped || 0) + (outcome === 'already' ? 1 : 0), failed: (j.failed || 0) + (failed ? 1 : 0),
      consec: failed ? (j.consec || 0) + 1 : 0, last: { u: u, s: outcome, why: why || '', t: now }, msg: '', navAt: 0 };
    if (okRes || outcome === 'already') p.followed = (j.followed || []).slice(-4999).concat(u);
    if (failed) p.failedList = (j.failedList || []).slice(-499).concat(u);
    var merged = Object.assign({}, j, p), end = '';
    if (lim) end = 'X limit: ' + lim; else if (p.consec >= 5) end = 'Stopped: 5 follows failed in a row - try again later';
    else if (p.idx >= (j.queue || []).length) end = 'Finished the list - ' + p.done + ' followed';
    if (end) { jPatch('fjob', p); fuFinish('fjob', merged, end, lim || p.consec >= 5 ? 'error' : 'success'); return; }
    var gap = outcome === 'already' ? rnd(1.5, 3) : (function () { var a = Number(j.gapMin) || 120, b = Number(j.gapMax) || 240; return a + Math.random() * Math.max(0, b - a); })();
    p.waitUntil = now + Math.round(gap * 1000); p.stepAt = p.waitUntil; jPatch('fjob', p);
  }
  function folTick() {
    if (folBusy) return;
    var j = jGet('fjob'); if (!j.running) return;
    var now = Date.now();
    if (j.waitUntil && now < j.waitUntil) { setStat('FOLLOW - next in ' + Math.ceil((j.waitUntil - now) / 1000) + 's'); return; }
    if (loginWall()) { fuFinish('fjob', j, 'X logged out - log in again', 'error'); return; }
    var q = j.queue || [], idx = j.idx || 0;
    while (idx < q.length && (j.followed || []).indexOf(q[idx]) >= 0) idx++;          // already followed in an earlier run
    if (idx !== (j.idx || 0)) { jPatch('fjob', { idx: idx, skipped: (j.skipped || 0) + (idx - (j.idx || 0)) }); return; }
    if (idx >= q.length) { fuFinish('fjob', j, 'Finished the list - ' + (j.done || 0) + ' followed'); return; }
    var u = q[idx];
    if (j.stepAt && now - j.stepAt > 90000 && !profileOf(u)) {   // the profile never opened (90 s): skip it
      folBusy = true; folAfter(u, 'failed', 'Timed out', '').then(function () { folBusy = false; }, function () { folBusy = false; }); return;
    }
    if (profileOf(u)) { folWork(j, u); return; }
    setStat('FOLLOW - opening @' + u);
    if (!j.navAt || now - j.navAt > 30000) { jPatch('fjob', { navAt: now, stepAt: j.stepAt || now }); try { location.href = 'https://x.com/' + u; } catch (e) {} }
  }

  // ----- Auto Unfollow -----
  var unfSeen = {};
  function ucells() { return $$('[data-testid="UserCell"]'); }
  function ucellUser(c) {
    var a = c.querySelector('a[href^="/"]'), h = a ? a.getAttribute('href') : '', u = (h || '').replace('/', '');
    return (!u || u === 'i' || u.indexOf('/') >= 0) ? null : u;
  }
  function ufollowingBtn(c) { var bs = $$('[role="button"]', c); for (var i = 0; i < bs.length; i++) if (String(bs[i].textContent || '').indexOf('Following') >= 0) return bs[i]; return null; }
  function ufindCell(u) { u = String(u).toLowerCase(); var cs = ucells(); for (var i = 0; i < cs.length; i++) if ((ucellUser(cs[i]) || '').toLowerCase() === u) return cs[i]; return null; }
  function onFollowingPage(h) { var m = /^\/([^/]+)\/following\/?$/i.exec(location.pathname); return !!m && m[1].toLowerCase() === String(h).toLowerCase(); }
  async function unfollowUser(u) {   // -> {ok, attempted, strong}
    var cell = ufindCell(u); if (!cell) return { ok: false, attempted: false };
    var btn = ufollowingBtn(cell); if (!btn) return { ok: false, attempted: false };
    try { cell.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
    await sleep(rnd(250, 650));
    await tap(btn);
    var confirm = null;
    for (var w = 0; w < 1800 && !confirm; w += 150) { await sleep(150); confirm = document.querySelector('[data-testid="confirmationSheetConfirm"]'); }
    if (!confirm) return { ok: false, attempted: true, strong: fuLimitText() };
    await sleep(rnd(300, 800)); await tap(confirm); await sleep(rnd(1000, 1900));
    var after = ufindCell(u);
    if (after && ufollowingBtn(after)) return { ok: false, attempted: true, strong: fuLimitText() };
    return { ok: true, attempted: true };
  }
  async function unfPause(ms, label) {   // wait, wake early on Stop. false = stopped
    var end = Date.now() + ms;
    while (Date.now() < end) {
      if (!jGet('ujob').running) return false;
      setStat(label + ' ' + Math.max(0, Math.ceil((end - Date.now()) / 1000)) + 's');
      jPatch('ujob', { waitUntil: end, msg: label });
      await sleep(Math.min(1000, Math.max(50, end - Date.now())));
    }
    jPatch('ujob', { waitUntil: 0 });
    return true;
  }
  async function unfRun(j0) {
    unfBusy = true;
    var reason = 'Done';
    try {
      var j = jGet('ujob'), handle = String(j.handle || '').toLowerCase(), limit = Math.min(2000, Number(j.limit) || 2000);
      var processed = {}, seen = {}, stall = 0, consec = 0, sinceBreak = 0, c = { u: j.unfollowed || 0, s: j.skipped || 0, f: j.failed || 0 };
      var sync = function (msg) { jPatch('ujob', { unfollowed: c.u, skipped: c.s, failed: c.f, msg: msg || '' }); };
      var collectSeen = function () { ucells().forEach(function (x) { var u = ucellUser(x); if (u) seen[u] = 1; }); };
      setStat('UNFOLLOW - loading list'); sync('Loading your Following list'); await sleep(2500);
      while (jGet('ujob').running) {
        if (!onFollowingPage(handle)) { reason = 'Left the Following page'; break; }
        var rows = ucells().map(function (x) { var u = ucellUser(x); return u ? { u: u, followsYou: String(x.textContent || '').indexOf('Follows you') >= 0, following: !!ufollowingBtn(x) } : null; })
          .filter(function (r) { return r && !processed[r.u]; });
        if (!rows.length) {
          stall++; setStat('UNFOLLOW - scrolling (' + stall + '/10)'); collectSeen();
          var before = Object.keys(seen).length; window.scrollBy(0, window.innerHeight * 1.5); await sleep(2500); collectSeen();
          if (Object.keys(seen).length > before) { stall = 0; continue; }
          if (stall >= 10) { window.scrollTo(0, document.documentElement.scrollHeight); await sleep(5000); var b2 = Object.keys(seen).length; collectSeen(); if (Object.keys(seen).length > b2) { stall = 0; continue; } break; }
          continue;
        }
        stall = 0; var stop = false;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!onFollowingPage(handle)) break;
          if (!jGet('ujob').running) { stop = true; reason = 'Stopped'; break; }
          processed[row.u] = 1;
          if (c.u >= limit) { reason = 'Target reached - ' + limit; stop = true; break; }
          if (!row.following) continue;
          if (row.u.toLowerCase() === handle) continue;                                  // never my own row
          if (j.mode !== 'all' && row.followsYou) { c.s++; sync(); continue; }              // keep mutuals unless Everyone mode
          setStat('UNFOLLOW - @' + row.u); sync('Unfollowing @' + row.u);
          var r = await unfollowUser(row.u);
          if (r.ok) { c.u++; consec = 0; sinceBreak++; sync(); }
          else if (r.attempted) {
            c.f++; consec++; sync();
            if (r.strong) { reason = 'X limit: ' + r.strong; stop = true; break; }
            if (consec >= 3) { reason = 'X refused 3 unfollows in a row - stopped. Try again later.'; stop = true; break; }
          } else continue;                                                                    // row vanished before we got to it
          if (c.u >= limit) { reason = 'Target reached - ' + limit; stop = true; break; }
          if (j.breakEvery > 0 && sinceBreak >= j.breakEvery) { sinceBreak = 0; if (!(await unfPause((Number(j.breakSec) || 0) * 1000, 'Break'))) { reason = 'Stopped'; stop = true; break; } }
          else if (!(await unfPause(Math.round(rnd(Number(j.minSec) || 15, Math.max(Number(j.minSec) || 15, Number(j.maxSec) || 20)) * 1000), 'Next in'))) { reason = 'Stopped'; stop = true; break; }
        }
        if (stop) break;
      }
      jPatch('ujob', { unfollowed: c.u, skipped: c.s, failed: c.f });
    } catch (e) { reason = 'Stopped: ' + String(e && e.message || e).slice(0, 80); }
    finally {
      unfBusy = false;
      var jj = jGet('ujob'); if (jj.running || reason !== 'Stopped') fuFinish('ujob', jj, reason, /limit|refused/i.test(reason) ? 'error' : 'success');
    }
  }
  function unfTick() {
    if (unfBusy) return;
    var j = jGet('ujob'); if (!j.running) return;
    var now = Date.now(), h = String(j.handle || '').replace(/^@/, '').toLowerCase();
    if (!h) { fuFinish('ujob', j, 'Set My @handle in the Engine screen first', 'error'); return; }
    if (loginWall()) { fuFinish('ujob', j, 'X logged out - log in again', 'error'); return; }
    if (onFollowingPage(h)) { unfRun(j); return; }
    setStat('UNFOLLOW - opening your Following list');
    if (!j.navAt || now - j.navAt > 30000) { jPatch('ujob', { navAt: now }); try { location.href = 'https://x.com/' + h + '/following'; } catch (e) {} }
  }

  // ---------------- auto loop ----------------
  function postIds() { var s = {}; articles().forEach(function (a) { var i = statusId(a); if (i) s[i] = 1; }); return s; }
  async function scrollDown() {
    var total = window.innerHeight * 1.5, steps = 12, done_ = 0;
    for (var i = 1; i <= steps; i++) { var t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, d = total * e - done_; done_ = total * e; window.scrollBy({ top: d, behavior: 'instant' }); await sleep(60); }
  }
  async function waitMore(prev) {
    var t0 = Date.now();
    while (Date.now() - t0 < 15000) { var c = postIds(); for (var k in c) if (!prev[k]) return true; if (timelineError()) return false; await sleep(400); }
    return false;
  }
  // run state survives a page reload (sessionStorage), so "Replied x / max" keeps counting across feed refreshes
  function readRun() { try { var r = JSON.parse(sessionStorage.getItem('zenEngRun') || 'null'); if (r && Date.now() - r.t < 600000) return r; } catch (e) {} return null; }
  function writeRun(extra) { try { var r = readRun() || { done: 0, skip: 0, empty: 0 }; r.done = stat.done; r.skip = stat.skip; r.t = Date.now(); if (extra) for (var k in extra) r[k] = extra[k]; sessionStorage.setItem('zenEngRun', JSON.stringify(r)); } catch (e) {} }
  function clearRun() { try { sessionStorage.removeItem('zenEngRun'); sessionStorage.removeItem('zenEngSafe'); } catch (e) {} }

  async function autoLoop(eng) {
    if (autoRunning) return;
    autoRunning = true; skipSeen = {};
    var rs = readRun(); stat.done = rs ? rs.done : 0; stat.skip = rs ? rs.skip : 0; runCount = stat.done;
    var emptyReloads = rs ? (rs.empty || 0) : 0;
    setStat('Detecting your account');
    if (!(await probeOwnHandle())) { autoRunning = false; patchCfg({ auto: false }); setStat('Stopped'); toast('Could not detect your account. Set My @handle in Engine settings.', 'warn'); return; }
    setStat('Running');
    var none = 0, cls = tag[eng], reloading = false, stopMsg = '';
    try {
      while (cfg.auto && curMode() === eng && runCount < ecfg(eng, 'Max')) {
        if (loginWall()) { stopMsg = 'X logged out - log in again'; break; }
        if (!navigator.onLine) { setStat('Offline - waiting for connection'); if (!(await waitOnline(300000))) { stopMsg = 'No internet for 5 min'; break; } }
        if (fatalMsg) { stopMsg = fatalMsg; fatalMsg = ''; break; }
        var target = articles().filter(function (a) { var b = a.querySelector('.' + cls); return b && !b.disabled && !autoSkip.has(a) && !busy.has(a) && !isBlocked(a); })[0];
        if (!target) {
          if (timelineError()) {
            await sleep(1500);
            if (timelineError()) { if (await reloadForError('Something went wrong')) { reloading = true; return; } stopMsg = 'Feed keeps failing (3 reloads / 10 min)'; break; }
          }
          none++;
          if (eng === 'SEA' && cfg.ageOn && Object.keys(oldSeen).length >= 4) { stopMsg = 'Reached posts older than the age limit'; break; }
          if (none > 3) {
            // nothing new after scrolling (also happens when the page is not being rendered in background): reload the feed and continue
            if (emptyReloads >= 5) { stopMsg = 'Nothing new to reply to after 5 refreshes'; break; }
            var rw = Math.round(rnd(12, 25)); setStat('No new posts, refreshing in ' + rw + 's');
            for (var q = 0; q < rw && cfg.auto; q++) await sleep(1000);
            if (!cfg.auto) break;
            emptyReloads++; writeRun({ empty: emptyReloads }); reloading = true; location.reload(); return;
          }
          setStat('Scrolling for new posts'); cursorState('scroll'); var prev = postIds(); await scrollDown(); await waitMore(prev); await sleep(1200); continue;
        }
        none = 0;
        var btn = target.querySelector('.' + cls);
        await ensureVisible(target);
        cycleT0 = Date.now();
        var ok = await handleClick(target, btn, eng);
        runCount++;
        if (fatalMsg) { stopMsg = fatalMsg; fatalMsg = ''; break; }
        if (es1Busy) { reloading = true; return; }
        if (ok) { emptyReloads = 0; writeRun({ empty: 0 }); }
        if (!ok && !btn.classList.contains('zen-done')) { autoSkip.add(target); var s2 = statusId(target); if (s2) skipped[s2] = 1; await closeComposer(); await sleep(1200); continue; }
        await waitClose(lastEditor);
        await paceWait();
      }
      if (!stopMsg && runCount >= ecfg(eng, 'Max') && cfg.auto) stopMsg = 'Max per run reached';
    } catch (e) { toast(String(e && e.message || e), 'error'); }
    finally {
      autoRunning = false;
      if (!reloading) {
        logEv({ k: 'run', e: eng, done: stat.done, skip: stat.skip, m: stopMsg || '' });
        setStat(cfg.auto ? 'Stopped' : 'Idle');
        if (stopMsg) { toast(stopMsg + ' - auto stopped', 'success'); setStat(stopMsg); }
        if (cfg.auto && (stopMsg || runCount >= ecfg(eng, 'Max'))) patchCfg({ auto: false });
        if (!cfg.auto) clearRun();
      }
    }
  }

  // ---------------- scan timer ----------------
  var lastMode = null;
  function teardown() {
    done = new WeakSet(); autoSkip = new WeakSet(); oldSeen = {};
    $$('.zen-eng-btn').forEach(function (b) { b.remove(); });
  }
  function scan() {
    cfg = loadCfg();
    if (!/\/compose\/|\/status\//.test(location.pathname) && !loginWall()) goodUrl = location.href;
    if (es1Busy) return;   // Extra Safety 1 cool-down routine is running
    if (es2Back && Date.now() - es2Back.ts < 240000) return;   // Extra Safety 2 detour: do not touch the page
    try { tgTick(); if (!tgGet().running) { folTick(); unfTick(); } } catch (e) {}
    var m = curMode();
    if (m !== lastMode) { teardown(); lastMode = m; if (m) toast(m + ' engine ON — buttons appear on posts', 'success'); }
    if (!m) return;
    if (!ownHandle()) { /* keep going: own-post check just stays off until the handle is known */ }
    articles().forEach(function (a) { injectButton(a, m); });
    if (cfg.auto && !autoRunning) autoLoop(m);
  }

  // ---------------- floating panel (runtime only: engines, start/stop, live status) ----------------
  var panelOpen = false;
  function renderPanel() {
    var fab = document.getElementById('zeng-fab'), p = document.getElementById('zeng-panel'); if (!fab || !p) return;
    fab.style.background = autoRunning ? '#15803d' : '#6d28d9';
    if (!panelOpen) { p.style.display = 'none'; return; }
    p.style.display = 'block';
    var m = curMode(), chip = function (k, label) { return '<div data-act="' + k + '" style="flex:1;text-align:center;padding:9px 0;border-radius:10px;font-weight:800;border:1px solid ' + (cfg[k] ? '#22c55e' : '#444') + ';background:' + (cfg[k] ? '#14532d' : '#16122a') + ';color:' + (cfg[k] ? '#bbf7d0' : '#aaa') + '">' + label + (cfg[k] ? ' ON' : ' OFF') + '</div>'; };
    var where = isSearchUrl() ? 'on search page (SEA)' : isHomeUrl() ? 'on home feed (FED)' : 'open x.com/search or x.com/home';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:2px;margin-bottom:8px"><span>ZEN ENGINE</span><span style="font-size:11px;color:' + (autoRunning ? '#4ade80' : '#9ca3af') + '">' + (autoRunning ? 'RUNNING' : 'IDLE') + '</span></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' + chip('sea', 'SEA') + chip('fed', 'FED') + '</div>' +
      '<div style="font-size:12px;color:#c4b5fd;margin-bottom:2px">' + (m ? m + ' active' : 'No engine active') + ' · ' + where + '</div>' +
      '<div style="font-size:12px;color:#ddd;margin-bottom:2px">' + stat.msg + '</div>' +
      '<div style="font-size:12px;color:#9ca3af;margin-bottom:10px">Replied ' + stat.done + ' / ' + (m ? ecfg(m, 'Max') : cfg.maxRun) + ' · Skipped ' + stat.skip + '</div>' +
      (cfg.sea && cfg.seaUrl && !isSearchUrl() ? '<div data-act="gosea" style="text-align:center;padding:8px 0;border-radius:10px;font-size:12px;border:1px solid #3a3260;color:#c4b5fd;margin-bottom:8px">Open my search (SEA)</div>' : '') +
      (cfg.fed && !isHomeUrl() ? '<div data-act="gofed" style="text-align:center;padding:8px 0;border-radius:10px;font-size:12px;border:1px solid #3a3260;color:#c4b5fd;margin-bottom:8px">Open home feed (FED)</div>' : '') +
      tgPanelLine() +
      '<div data-act="auto" style="text-align:center;padding:12px 0;border-radius:12px;font-weight:800;background:' + (cfg.auto ? '#b91c1c' : '#6d28d9') + ';margin-bottom:8px">' + (cfg.auto ? 'STOP' : 'START') + '</div>' +
      '<div data-act="settings" style="text-align:center;padding:8px 0;border-radius:10px;font-size:12px;border:1px solid #3a3260;color:#c4b5fd">Settings</div>';
  }
  function fuPanelLine() {
    var f = jGet('fjob'), u = jGet('ujob'), out = '';
    if (f.running) out += '<div style="border:1px solid #15803d;border-radius:10px;padding:8px;margin-bottom:8px;font-size:12px;color:#bbf7d0"><b>FOLLOW</b> running · ' + (f.done || 0) + ' followed · ' + (f.skipped || 0) + ' skipped · ' + (f.failed || 0) + ' failed · ' + (f.idx || 0) + ' / ' + (f.queue || []).length + '<div data-act="fustop" data-v="fjob" style="text-align:center;padding:8px 0;margin-top:6px;border-radius:8px;font-weight:800;background:#b91c1c;color:#fff">STOP FOLLOW</div></div>';
    if (u.running) out += '<div style="border:1px solid #b45309;border-radius:10px;padding:8px;margin-bottom:8px;font-size:12px;color:#fde68a"><b>UNFOLLOW</b> running · ' + (u.unfollowed || 0) + (u.limit ? ' / ' + u.limit : '') + ' unfollowed · ' + (u.skipped || 0) + ' skipped · ' + (u.failed || 0) + ' failed<div data-act="fustop" data-v="ujob" style="text-align:center;padding:8px 0;margin-top:6px;border-radius:8px;font-weight:800;background:#b91c1c;color:#fff">STOP UNFOLLOW</div></div>';
    return out;
  }
  function tgPanelLine() {
    var j = tgGet(); if (!j.running) return fuPanelLine();
    var tot = j.mode === 'sweep' ? ' / ' + (j.queue || []).length : '';
    return '<div style="border:1px solid #1d4ed8;border-radius:10px;padding:8px;margin-bottom:8px;font-size:12px;color:#bfdbfe"><b>' + tgLabel(j) + '</b> running · ' + (j.done || 0) + tot + ' done · ' + (j.failed || 0) + ' failed · ' + (j.skipped || 0) + ' skipped' +
      '<div data-act="tgstop" style="text-align:center;padding:8px 0;margin-top:6px;border-radius:8px;font-weight:800;background:#b91c1c;color:#fff">STOP TELEGRAM RUN</div></div>';
  }
  function onPanelTap(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null; if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'sea' || act === 'fed') { var p = {}; p[act] = !cfg[act]; patchCfg(p); lastMode = '#'; scan(); }
    else if (act === 'tgstop') { tgStop(); }
    else if (act === 'fustop') { var nm = t.getAttribute('data-v') === 'ujob' ? 'ujob' : 'fjob'; jPatch(nm, { running: false, status: 'stopped', msg: 'Stopped', waitUntil: 0 }); setStat('Stopped'); }
    else if (act === 'auto') {
      if (tgGet().running) { toast('A Telegram run is active - stop it first', 'warn'); }
      else if (cfg.auto) { patchCfg({ auto: false }); setStat('Stopping'); }
      else if (!(cfg.sea || cfg.fed)) toast('Turn on SEA or FED first', 'warn');
      else if (!curMode()) toast('Open x.com/search (SEA) or x.com/home (FED)', 'warn');
      else { clearRun(); stat.done = 0; stat.skip = 0; patchCfg({ auto: true }); scan(); }
    } else if (act === 'gosea') {
      if (/^https:\/\/(x|twitter)\.com\/search/.test(String(cfg.seaUrl || ''))) location.href = cfg.seaUrl;
    } else if (act === 'gofed') { location.href = '/home';
    } else if (act === 'settings') {
      if (window.ZenEng && window.ZenEng.openSettings) window.ZenEng.openSettings(); else toast('Update the app to open Engine settings', 'warn');
    }
    renderPanel();
  }
  function placeUi() {   // keep the button/panel on the visible screen even when the page is zoomed or shifted
    var fab = document.getElementById('zeng-fab'), p = document.getElementById('zeng-panel'); if (!fab || !p) return;
    var vv = window.visualViewport, sc = vv ? 1 / vv.scale : 1, ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0, vh = vv ? vv.height : window.innerHeight;
    fab.style.transformOrigin = 'top left'; fab.style.transform = 'scale(' + sc + ')';
    fab.style.left = (ox + 10 * sc) + 'px'; fab.style.top = (oy + vh - 120 * sc) + 'px';
    p.style.transformOrigin = 'top left'; p.style.transform = 'scale(' + sc + ')';
    p.style.left = (ox + 8 * sc) + 'px'; p.style.top = (oy + vh - (128 * sc) - p.offsetHeight * sc) + 'px';
  }
  function buildPanel() {
    if (document.getElementById('zeng-fab') || !document.body) return;
    var fab = document.createElement('div'); fab.id = 'zeng-fab'; fab.textContent = 'Z';
    fab.style.cssText = 'position:fixed;left:10px;top:0;width:40px;height:40px;border-radius:20px;background:#6d28d9;color:#fff;font:800 16px sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483646;opacity:.9';
    var p = document.createElement('div'); p.id = 'zeng-panel';
    p.style.cssText = 'position:fixed;left:8px;top:0;width:230px;background:#0d0a14;color:#fff;border:1px solid #6d28d9;border-radius:14px;padding:12px;font:13px sans-serif;z-index:2147483646;display:none';
    fab.addEventListener('click', function () { panelOpen = !panelOpen; renderPanel(); placeUi(); });
    p.addEventListener('click', onPanelTap);
    document.body.appendChild(p); document.body.appendChild(fab);
    renderPanel(); placeUi();
  }

  // small API for pilot.js (Autopilot)
  window.__ZAPI = { sleep: sleep, rnd: rnd, toast: toast, setStat: setStat, patchCfg: patchCfg, getCfg: loadCfg, ownHandle: ownHandle, tap: tap,
    insertText: insertText, submitBtn: submitBtn, loginWall: loginWall, genRaw: genRaw,
    cursorSay: cursorSay, cursorState: cursorState, cursorWander: cursorWander };
  function boot() {
    es1Check();
    buildPanel();
    setInterval(function () { try { buildPanel(); scan(); renderPanel(); placeUi(); cursorTick(); } catch (e) {} }, 1000);
    try { if (window.visualViewport) { window.visualViewport.addEventListener('resize', placeUi); window.visualViewport.addEventListener('scroll', placeUi); } } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
