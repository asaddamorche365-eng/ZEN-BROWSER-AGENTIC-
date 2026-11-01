/* ============================================================================
 * ZENX reader  (assets/zenx/xreader.js)
 * Runs INSIDE an x.com page (desktop DOM) via evaluateJavascript. Nothing here
 * talks to the network. When X changes its DOM: edit ONLY the CONFIG block.
 *
 * Entry points (called from MainActivity.kt):
 *   window.__ZENX.poll(kind, arg)  -> JSON string  {state:'ready'|'wait'|'gone'|'error', ...}
 *   window.__ZENX.selfTest()       -> plain-text report (menu: "X selector self-test")
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__ZENX && window.__ZENX.v === 1) return;

  // ==========================  CONFIG  (edit here)  ==========================
  // Every key is a LIST of selectors: first one that matches anything wins,
  // the others are fallbacks. Self-test shows counts per selector (* = used).
  var CONFIG = {
    SEL: {
      // ---- tweet article ----
      tweet:         ['article[data-testid="tweet"]', 'article[role="article"]'],
      tweetText:     ['[data-testid="tweetText"]', 'div[lang][dir="auto"]'],
      userName:      ['[data-testid="User-Name"]'],
      time:          ['time'],
      group:         ['[role="group"]'],
      replyBtn:      ['[data-testid="reply"]'],
      repostBtn:     ['[data-testid="retweet"]', '[data-testid="unretweet"]'],
      likeBtn:       ['[data-testid="like"]', '[data-testid="unlike"]'],
      viewsLink:     ['a[href$="/analytics"]'],
      socialContext: ['[data-testid="socialContext"]'],
      photo:         ['[data-testid="tweetPhoto"] img'],
      video:         ['[data-testid="videoPlayer"]', 'video'],
      card:          ['[data-testid="card.wrapper"]'],
      showMore:      ['[data-testid="tweet-text-show-more-link"]'],
      quoteBox:      ['div[role="link"]'],           // only counts if it contains a 2nd User-Name
      ad:            ['[data-testid="placementTracking"]'],
      // ---- profile page ----
      profName:      ['[data-testid="UserName"]'],
      profBio:       ['[data-testid="UserDescription"]'],
      profAvatar:    ['[data-testid^="UserAvatar-Container-"]'],   // filtered by handle in code
      profAvatarImg: ['a[href$="/photo"]'],                        // fallback, filtered by handle in code
      profBanner:    ['a[href$="/header_photo"]'],                 // filtered by handle in code
      profLinks:     ['a[href]'],                                  // followers/following links, filtered by href in code
      // ---- logged-in user / page state ----
      profileLink:   ['a[data-testid="AppTabBar_Profile_Link"]'],
      accountSwitch: ['[data-testid="SideNav_AccountSwitcher_Button"]'],
      loginBtn:      ['[data-testid="loginButton"]', 'a[href="/login"]'],
      mainCol:       ['main', '[data-testid="primaryColumn"]']
    },
    TEXT: {
      // English UI. If your X language is different, add the words here.
      replyingTo: /^\s*(Replying to|Replied to)\b/i,
      repost:     /\b(reposted|retweeted)\b/i,
      gone: [
        /this page doesn.t exist/i,
        /this account doesn.t exist/i,
        /account (?:has been )?suspended/i,
        /(?:post|tweet) (?:was deleted|is unavailable|doesn.t exist)/i,
        /from an account that no longer exists/i,
        /unable to view this post/i,
        /these posts are protected/i
      ],
      noResults:  /no results for/i,
      // aria-label of the action bar, e.g. "5 replies, 2 reposts, 40 likes, 1 bookmark, 900 views"
      labelWords: {
        replies:   'repl(?:y|ies)',
        reposts:   '(?:repost|retweet)s?',
        likes:     'likes?',
        bookmarks: 'bookmarks?',
        views:     'views?'
      }
    },
    RESERVED_PATHS: ['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings',
                     'compose', 'login', 'logout', 'tos', 'privacy', 'jobs']
  };
  // ============================  END CONFIG  ================================

  // ---------- small helpers ----------
  function arr(list) { return Array.prototype.slice.call(list); }
  function qa(root, key) {
    var L = CONFIG.SEL[key];
    for (var i = 0; i < L.length; i++) {
      var n;
      try { n = root.querySelectorAll(L[i]); } catch (e) { n = []; }
      if (n.length) return arr(n);
    }
    return [];
  }
  function q(root, key) { var a = qa(root, key); return a.length ? a[0] : null; }
  function matchesAny(el, key) {
    var L = CONFIG.SEL[key];
    for (var i = 0; i < L.length; i++) { try { if (el.matches(L[i])) return true; } catch (e) {} }
    return false;
  }
  function closestAny(el, key) {
    var L = CONFIG.SEL[key];
    for (var i = 0; i < L.length; i++) { try { var c = el.closest(L[i]); if (c) return c; } catch (e) {} }
    return null;
  }
  function txt(node) {            // text with emoji (<img alt>) and line breaks
    var out = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out += c.data;
        else if (c.nodeType === 1) {
          var tn = c.tagName;
          if (tn === 'IMG') out += c.getAttribute('alt') || '';
          else if (tn === 'BR') out += '\n';
          else walk(c);
        }
      }
    })(node);
    return out.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function num(s) {               // "1,234" "12.3K" "1.2M" -> number
    if (s == null) return null;
    var m = String(s).replace(/\u00a0/g, ' ').match(/(\d[\d.,]*)([KMBkmb]?)/);
    if (!m) return null;
    var suf = m[2].toUpperCase();
    var mult = suf === 'K' ? 1e3 : suf === 'M' ? 1e6 : suf === 'B' ? 1e9 : 1;
    var n = mult > 1 ? parseFloat(m[1].replace(/,/g, '.')) : parseFloat(m[1].replace(/,/g, ''));
    return isNaN(n) ? null : Math.round(n * mult);
  }
  function idFromHref(h) { var m = /\/status(?:es)?\/(\d+)/.exec(h || ''); return m ? m[1] : null; }
  function handleFromHref(h) { var m = /^\/([A-Za-z0-9_]{1,15})(?:$|[\/?#])/.exec(h || ''); return m ? m[1] : null; }
  function snippet(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 160); }
  function pageText() { var m = q(document, 'mainCol') || document.body; return m ? (m.innerText != null ? m.innerText : (m.textContent || '')) : ''; }
  function isGone() {
    var t = pageText();
    for (var i = 0; i < CONFIG.TEXT.gone.length; i++) if (CONFIG.TEXT.gone[i].test(t)) return true;
    return false;
  }
  function waitState() {
    return { state: 'wait',
             hint: q(document, 'loginBtn') ? 'login' : '',
             snip: snippet(pageText(), 160) };
  }

  // ---------- quote-box logic (a quoted post is a role=link box holding a 2nd User-Name) ----------
  function quoteBoxOf(el, art) {
    var mainUser = q(art, 'userName');
    var p = el.parentElement;
    while (p && p !== art) {
      if (matchesAny(p, 'quoteBox') && q(p, 'userName') && !(mainUser && p.contains(mainUser))) return p;
      p = p.parentElement;
    }
    return null;
  }
  function own(art, key) {        // matches inside the article but NOT inside its quoted post
    return qa(art, key).filter(function (e) { return !quoteBoxOf(e, art); });
  }
  function findQuoteBox(art) {
    var L = CONFIG.SEL.quoteBox, mainUser = q(art, 'userName');
    for (var i = 0; i < L.length; i++) {
      var n = art.querySelectorAll(L[i]);
      for (var j = 0; j < n.length; j++) {
        if (q(n[j], 'userName') && !(mainUser && n[j].contains(mainUser))) return n[j];
      }
    }
    return null;
  }

  function parseUser(el) {
    var res = { handle: '', name: '' };
    if (!el) return res;
    var as = arr(el.querySelectorAll('a[href]'));
    for (var i = 0; i < as.length; i++) {
      var t = (as[i].textContent || '').trim();
      var hh = handleFromHref(as[i].getAttribute('href'));
      if (t.charAt(0) === '@') { res.handle = t.slice(1); }
      else if (!res.name && t) { res.name = txt(as[i]); if (!res.handle && hh) res.handle = hh; }
    }
    if (!res.handle) {
      var m = /@([A-Za-z0-9_]{1,15})/.exec(el.textContent || '');
      if (m) res.handle = m[1];
    }
    if (!res.name) {
      var lines = (el.innerText || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      for (var k = 0; k < lines.length; k++) if (lines[k].charAt(0) !== '@' && lines[k] !== '·') { res.name = lines[k]; break; }
    }
    return res;
  }

  function collectHandles(scope) {
    var out = [];
    arr(scope.querySelectorAll('a[href]')).forEach(function (a) {
      var t = (a.textContent || '').trim();
      if (t.charAt(0) === '@' && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }
  function replyLabel(art) {      // "Replying to @x" label (English)
    var w = document.createTreeWalker(art, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (!CONFIG.TEXT.replyingTo.test(n.data)) continue;
      var el = n.parentElement;
      if (!el || quoteBoxOf(el, art) || closestAny(el, 'tweetText')) continue;
      var scope = el.parentElement || el;
      var hs = collectHandles(scope);
      if (!hs.length && scope.parentElement && scope.parentElement !== art) hs = collectHandles(scope.parentElement);
      return { label: true, handles: hs };
    }
    return { label: false, handles: [] };
  }

  function countsOf(art) {
    var out = { replies: null, reposts: null, likes: null, bookmarks: null, views: null, source: 'none' };
    var groups = own(art, 'group');
    var label = '';
    for (var i = 0; i < groups.length; i++) {
      var l = groups[i].getAttribute('aria-label') || '';
      if (l && /\d/.test(l)) { label = l; break; }
    }
    if (label) {
      var W = CONFIG.TEXT.labelWords;
      Object.keys(W).forEach(function (k) {
        var m = new RegExp('(\\d[\\d.,]*[KMBkmb]?)\\s+(?:' + W[k] + ')\\b', 'i').exec(label);
        if (m) out[k] = num(m[1]);
      });
      out.source = 'group-label';
    }
    function btn(key) {
      var b = own(art, key)[0];
      if (!b) return null;
      var t = (b.innerText || b.textContent || '').trim();
      return t ? num(t) : 0;
    }
    if (out.replies == null)  { var a = btn('replyBtn');  if (a != null) { out.replies = a;  if (out.source === 'none') out.source = 'buttons'; } }
    if (out.reposts == null)  { var b = btn('repostBtn'); if (b != null) { out.reposts = b;  if (out.source === 'none') out.source = 'buttons'; } }
    if (out.likes == null)    { var c = btn('likeBtn');   if (c != null) { out.likes = c;    if (out.source === 'none') out.source = 'buttons'; } }
    if (out.views == null) {
      var v = own(art, 'viewsLink')[0];
      if (v) { var vn = num(v.innerText || v.textContent); if (vn != null) out.views = vn; }
    }
    return out;
  }

  function bigImg(src) {
    try {
      var u = new URL(src, location.href);
      if (u.hostname === 'pbs.twimg.com' && u.pathname.indexOf('/media/') === 0) { u.searchParams.set('name', 'large'); return u.toString(); }
    } catch (e) {}
    return src;
  }

  // ---------- extract one tweet article ----------
  // ctx (optional): { status:true, index:n }  -> we are on the tweet's own page, n = position among articles
  function extractArticle(art, ctx) {
    var d = { source: 'x-session' };
    // id / time (first <time> that sits in a /status/ link and is not inside the quoted post)
    var times = qa(art, 'time');
    for (var i = 0; i < times.length; i++) {
      if (quoteBoxOf(times[i], art)) continue;
      var a = times[i].closest('a');
      var id = a ? idFromHref(a.getAttribute('href')) : null;
      if (id) { d.id = id; d.time = times[i].getAttribute('datetime') || ''; break; }
    }
    var u = parseUser(own(art, 'userName')[0]);
    d.handle = u.handle; d.name = u.name;
    d.url = d.id ? 'https://x.com/' + (u.handle || 'i') + '/status/' + d.id : '';

    var tEl = own(art, 'tweetText')[0];
    d.text = tEl ? txt(tEl) : '';
    d.lang = tEl ? (tEl.getAttribute('lang') || '') : '';
    d.truncated = own(art, 'showMore').length > 0;

    // reply (two signals), quote, repost
    var rl = replyLabel(art);
    var parentAbove = !!(ctx && ctx.status && ctx.index > 0);
    d.isReply = rl.label || parentAbove;
    d.replyingTo = rl.handles;
    d.replyBasis = (rl.label ? 'label' : '') + (rl.label && parentAbove ? '+' : '') + (parentAbove ? 'parent-above' : '');
    if (!d.replyBasis) d.replyBasis = 'none';

    var qb = findQuoteBox(art);
    d.isQuote = !!qb;
    d.quote = ''; d.quote_author = ''; d.quote_name = ''; d.quoteId = '';
    if (qb) {
      var qu = parseUser(q(qb, 'userName'));
      var qt = q(qb, 'tweetText');
      d.quote = qt ? txt(qt) : '';
      d.quote_author = qu.handle; d.quote_name = qu.name;
      var qa1 = qb.querySelector('a[href*="/status/"]');
      d.quoteId = qa1 ? (idFromHref(qa1.getAttribute('href')) || '') : '';
    }

    var sc = own(art, 'socialContext')[0];
    d.socialContext = sc ? snippet(sc.textContent, 80) : '';
    d.isRepost = !!(sc && CONFIG.TEXT.repost.test(sc.textContent || ''));
    d.kind = d.isReply ? 'reply' : d.isQuote ? 'quote' : d.isRepost ? 'repost' : 'post';

    var c = countsOf(art);
    d.replies = c.replies; d.reposts = c.reposts; d.likes = c.likes; d.bookmarks = c.bookmarks; d.views = c.views;
    d.countsSource = c.source;

    var photos = own(art, 'photo');
    d.images = [];
    photos.forEach(function (im) { var s = bigImg(im.getAttribute('src') || ''); if (s && d.images.indexOf(s) < 0) d.images.push(s); });
    d.media = { photos: photos.length, video: own(art, 'video').length > 0, card: own(art, 'card').length > 0 };
    return d;
  }

  function isAd(art) {
    return !!(closestAny(art, 'ad') || q(art, 'ad'));
  }

  // ---------- tweet page ----------
  function focalArticle(id) {
    var list = qa(document, 'tweet');
    for (var i = 0; i < list.length; i++) {
      var ts = qa(list[i], 'time');
      for (var j = 0; j < ts.length; j++) {
        if (quoteBoxOf(ts[j], list[i])) continue;
        var a = ts[j].closest('a');
        if (a && idFromHref(a.getAttribute('href')) === id) return { el: list[i], index: i, total: list.length };
      }
    }
    return null;
  }
  function pollTweet(id) {
    var f = focalArticle(id);
    if (f) return { state: 'ready', data: extractArticle(f.el, { status: true, index: f.index }) };
    if (isGone()) return { state: 'gone', snip: snippet(pageText(), 160) };
    return waitState();
  }

  // ---------- profile page ----------
  function upAvatar(s) { return (s || '').replace(/_(?:normal|bigger|mini|200x200|reasonably_small)(\.[a-z0-9]+)(\?.*)?$/i, '_400x400$1$2'); }
  function bgUrl(el) {
    var all = [el].concat(arr(el.querySelectorAll('*')));
    for (var i = 0; i < all.length; i++) {
      var m = /url\(["']?(.*?)["']?\)/.exec((all[i].style && all[i].style.backgroundImage) || '');
      if (m) return m[1];
    }
    return '';
  }
  function readProfile(handle) {
    var h = String(handle).toLowerCase();
    var nameEl = q(document, 'profName');
    if (!nameEl) return null;
    var full = txt(nameEl), at = full.toLowerCase().lastIndexOf('@' + h);
    if (at < 0) return null;       // stale page (another profile)
    var d = { handle: handle, name: full.slice(0, at).trim(), source: 'x-session', t: Date.now() };
    var bio = q(document, 'profBio');
    d.bio = bio ? txt(bio) : '';

    d.avatar = '';
    qa(document, 'profAvatar').forEach(function (c) {
      if (d.avatar) return;
      if ((c.getAttribute('data-testid') || '').toLowerCase() === 'useravatar-container-' + h) {
        var im = c.querySelector('img'); if (im) d.avatar = im.getAttribute('src') || '';
      }
    });
    if (!d.avatar) qa(document, 'profAvatarImg').forEach(function (a) {
      if (d.avatar) return;
      if (handleFromHref(a.getAttribute('href')) && (a.getAttribute('href') || '').toLowerCase() === '/' + h + '/photo') {
        var im = a.querySelector('img'); if (im) d.avatar = im.getAttribute('src') || '';
      }
    });
    d.avatar = upAvatar(d.avatar);

    d.banner = '';
    qa(document, 'profBanner').forEach(function (a) {
      if (d.banner) return;
      if ((a.getAttribute('href') || '').toLowerCase() === '/' + h + '/header_photo') {
        var im = a.querySelector('img');
        d.banner = (im && im.getAttribute('src')) || bgUrl(a);
      }
    });

    d.followers = null; d.following = null; d.followersText = ''; d.followingText = '';
    var reFol = new RegExp('^/' + h + '/(?:verified_followers|followers)$', 'i');
    var reIng = new RegExp('^/' + h + '/following$', 'i');
    qa(document, 'profLinks').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (d.followers == null && reFol.test(href)) { d.followersText = snippet(a.textContent, 40); d.followers = num(a.textContent); }
      if (d.following == null && reIng.test(href)) { d.followingText = snippet(a.textContent, 40); d.following = num(a.textContent); }
    });
    return d;
  }
  function pollProfile(handle) {
    var d = readProfile(handle);
    if (d) return { state: 'ready', data: d };
    if (isGone()) return { state: 'gone', snip: snippet(pageText(), 160) };
    return waitState();
  }

  // ---------- logged-in user ----------
  function readUser() {
    var a = q(document, 'profileLink');
    if (a) { var h = handleFromHref(a.getAttribute('href')); if (h) return { state: 'ready', data: { handle: h, via: 'profileLink' } }; }
    var sw = q(document, 'accountSwitch');
    if (sw) {
      var av = sw.querySelector('[data-testid^="UserAvatar-Container-"]');
      if (av) { var hh = (av.getAttribute('data-testid') || '').replace('UserAvatar-Container-', ''); if (hh) return { state: 'ready', data: { handle: hh, via: 'switcher-avatar' } }; }
      var m = /@([A-Za-z0-9_]{1,15})/.exec(sw.textContent || '');
      if (m) return { state: 'ready', data: { handle: m[1], via: 'switcher-text' } };
    }
    return waitState();
  }

  // ---------- search (scrolls and collects; X virtualizes the list so we accumulate) ----------
  function compact(d) {
    return { link: d.url, handle: '@' + d.handle, text: d.text, likes: d.likes || 0, retweets: d.reposts || 0,
             replies: d.replies || 0, views: d.views || 0, postedAt: d.time || null, isReply: d.isReply, kind: d.kind };
  }
  function pollSearch(o) {
    var st = window.__ZENX_S || (window.__ZENX_S = { acc: {}, order: [], stalls: 0 });
    var before = st.order.length;
    qa(document, 'tweet').forEach(function (art) {
      if (isAd(art)) return;
      var d = extractArticle(art, null);
      if (!d.id || !d.handle || st.acc[d.id]) return;
      st.acc[d.id] = d; st.order.push(d.id);
    });
    var items = [];
    for (var i = 0; i < st.order.length; i++) {
      var d = st.acc[st.order[i]];
      if ((d.likes || 0) >= (o.minLikes || 0) && (d.views || 0) >= (o.minViews || 0)) items.push(compact(d));
    }
    var max = o.max || 10;
    if (items.length >= max) return { state: 'ready', data: { items: items.slice(0, max), seen: st.order.length, done: true } };
    st.stalls = (st.order.length === before) ? st.stalls + 1 : 0;
    if (st.order.length === 0 && CONFIG.TEXT.noResults.test(pageText())) return { state: 'ready', data: { items: [], seen: 0, done: true } };
    if (st.stalls >= 8 && st.order.length > 0) return { state: 'ready', data: { items: items, seen: st.order.length, done: true, endReached: true } };
    window.scrollBy(0, Math.max(400, Math.round(window.innerHeight * 0.85)));
    var w = waitState();
    w.partial = { items: items, seen: st.order.length, done: false };
    return w;
  }

  // ---------- public: poll ----------
  function poll(kind, arg) {
    try {
      var r;
      if (kind === 'tweet') r = pollTweet(String(arg));
      else if (kind === 'profile') r = pollProfile(String(arg));
      else if (kind === 'user') r = readUser();
      else if (kind === 'search') r = pollSearch(JSON.parse(arg));
      else r = { state: 'error', msg: 'unknown kind ' + kind };
      return JSON.stringify(r);
    } catch (e) {
      return JSON.stringify({ state: 'error', msg: String((e && e.message) || e) });
    }
  }

  // ---------- public: self-test ----------
  function pageKind() {
    var p = location.pathname;
    if (!/(^|\.)(x|twitter)\.com$/.test(location.hostname)) return { k: 'not-x' };
    var m = /\/status(?:es)?\/(\d+)/.exec(p);
    if (m) return { k: 'status', id: m[1] };
    if (/^\/search/.test(p)) return { k: 'search' };
    var h = /^\/([A-Za-z0-9_]{1,15})\/?$/.exec(p);
    if (h && CONFIG.RESERVED_PATHS.indexOf(h[1].toLowerCase()) < 0) return { k: 'profile', handle: h[1] };
    return { k: 'other' };
  }
  function selfTest() {
    var L = [], pk = pageKind();
    L.push('ZENX reader v1');
    L.push('url: ' + location.href);
    L.push('page: ' + pk.k + '   innerWidth: ' + innerWidth + '   desktopUA: ' + /Windows NT/.test(navigator.userAgent));
    L.push('');
    L.push('--- selectors: [match count per selector], * = the one in use ---');
    L.push('(MISS is normal for keys that belong to another page type)');
    Object.keys(CONFIG.SEL).forEach(function (k) {
      var used = -1, parts = CONFIG.SEL[k].map(function (s, i) {
        var n; try { n = document.querySelectorAll(s).length; } catch (e) { n = 'ERR'; }
        if (used < 0 && n && n !== 'ERR') { used = i; return n + '*'; }
        return String(n);
      });
      L.push((used < 0 ? 'MISS ' : 'ok   ') + k + ': [' + parts.join(', ') + ']');
    });
    L.push('');
    var u = readUser();
    L.push('logged-in handle: ' + (u.state === 'ready' ? '@' + u.data.handle + ' (via ' + u.data.via + ')' : 'NOT FOUND'));
    L.push('');
    try {
      if (pk.k === 'status') {
        var f = focalArticle(pk.id);
        L.push('focal tweet ' + pk.id + ': ' + (f ? 'found (article ' + (f.index + 1) + ' of ' + f.total + ')' : 'NOT FOUND'));
        if (f) L.push(JSON.stringify(extractArticle(f.el, { status: true, index: f.index }), null, 1));
      } else if (pk.k === 'profile') {
        var p = readProfile(pk.handle);
        L.push('profile @' + pk.handle + ': ' + (p ? 'found' : 'NOT FOUND'));
        if (p) L.push(JSON.stringify(p, null, 1));
      } else if (pk.k !== 'not-x') {
        var list = qa(document, 'tweet').slice(0, 8);
        L.push('first ' + list.length + ' tweets on screen (no parent-above signal here, label only):');
        list.forEach(function (art, i) {
          var d = extractArticle(art, null);
          L.push('#' + (i + 1) + ' @' + d.handle + ' id=' + d.id + ' kind=' + d.kind + ' basis=' + d.replyBasis +
                 (d.isQuote ? ' quote@' + d.quote_author : '') + (d.isRepost ? ' [' + d.socialContext + ']' : '') +
                 ' L=' + d.likes + ' R=' + d.reposts + ' V=' + d.views + ' src=' + d.countsSource +
                 ' img=' + d.media.photos + (d.media.video ? ' vid' : '') + '\n    "' + snippet(d.text, 70) + '"');
        });
      }
    } catch (e) { L.push('ERROR: ' + (e && e.message)); }
    return L.join('\n');
  }

  window.__ZENX = { v: 1, CONFIG: CONFIG, poll: poll, selfTest: selfTest };
})();
