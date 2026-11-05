// ZEN BROWSER — Telegram engines: GROUP ENGAGE + LINK SWEEP (port of the Z EX extension's telegram.js + eng_tg_core / eng_tg_engage / eng_tg_sweep)
// Injected by MainActivity at document start on web.telegram.org (assets/scripts/tg.js). Telegram side only: it finds / collects the X post links.
// The per-link work (open the post on X, like, AI reply, post, gap / break) is done by x.js on the X tab. Both talk through the app's job store:
//   ZenEng.getTgJob() / startTgJob(json) / patchTgJob(json)  +  ZenEng.openX(url, front)
// GROUP ENGAGE : walks the open chat top -> down from a start post (ID or link), one link at a time (next link is found live in the chat).
// LINK SWEEP   : scrolls from a start post down to the newest message, collects every X post link, then runs the whole list as a queue.
(function () {
  'use strict';
  if (window.top !== window || window.__ZTG) return;
  window.__ZTG = 1;

  // ---------------- helpers ----------------
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var B = function () { return window.ZenEng || null; };
  function jget(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function cfgGet() { try { return jget(B() && B().getCfg ? B().getCfg() : '{}', {}); } catch (e) { return {}; } }
  function cfgSet(p) { try { B().setCfg(JSON.stringify(p)); } catch (e) {} }
  function jobGet() { try { return jget(B() && B().getTgJob ? B().getTgJob() : '{}', {}); } catch (e) { return {}; } }
  function jobPatch(p) { try { B().patchTgJob(JSON.stringify(p)); } catch (e) {} }
  function jobStart(o) { try { B().startTgJob(JSON.stringify(o)); return true; } catch (e) { return false; } }
  function openX(url, front) { try { B().openX(url, !!front); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k, d) { try { return jget(localStorage.getItem(k), d); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function toast(text, ms) {
    var el = document.getElementById('ztg-toast');
    if (!el) {
      el = document.createElement('div'); el.id = 'ztg-toast';
      el.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);max-width:86%;padding:10px 14px;border-radius:12px;background:#111;color:#fff;border:1px solid #6d28d9;font:600 13px sans-serif;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .2s;line-height:1.4';
      document.body.appendChild(el);
    }
    el.textContent = text; el.style.opacity = '1'; clearTimeout(el._t); el._t = setTimeout(function () { el.style.opacity = '0'; }, ms || 3500);
  }

  // ---------------- X link parsing ----------------
  var X_LINK_RE = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/[a-zA-Z0-9_]+\/status\/\d{5,19}/i;
  function normalizeLink(text) {
    if (!text) return null; var m = String(text).match(X_LINK_RE); if (!m) return null;
    var l = m[0].replace(/[)\].,;]+$/, ''); if (!/^https?:\/\//i.test(l)) l = 'https://' + l; return l;
  }
  function allLinksIn(text) {
    var out = [], re = new RegExp(X_LINK_RE.source, 'gi'), m;
    while ((m = re.exec(text || ''))) { var l = normalizeLink(m[0]); if (l) out.push(l); }
    return out;
  }
  function statusId(link) { var m = link && String(link).match(/status\/(\d+)/); return m ? m[1] : link; }
  function sameLink(a, b) { return !!a && !!b && statusId(a) === statusId(b); }
  function linkUser(link) { var m = link && String(link).match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status\//i); return m ? m[1].toLowerCase() : ''; }
  function extractPostId(text) {   // bare ID or anything containing one (link, user/status/ID, ...?s=20)
    var t = String(text || '').trim(), m = t.match(/status(?:es)?\/+(\d{5,19})/i);
    if (m) return m[1];
    m = t.match(/(?:^|\D)(\d{5,19})(?!\d)/); return m ? m[1] : '';
  }
  function ownHandle() { return String(cfgGet().myHandle || '').replace(/^@/, '').trim().toLowerCase(); }   // x.js double-checks with the handle it learns from X
  function isOwnLink(link) { var o = ownHandle(); return !!o && linkUser(link) === o; }
  function handleSet(a) { var o = {}; (Array.isArray(a) ? a : []).forEach(function (h) { h = String(h || '').replace(/^@/, '').trim().toLowerCase(); if (h) o[h] = 1; }); return o; }

  // ---------------- Telegram message DOM (Web K: .bubble[data-mid] · Web A: .Message / data-message-id) ----------------
  function messageEls() {
    var els = document.querySelectorAll('.bubble[data-mid]');
    if (!els.length) els = Array.prototype.filter.call(document.querySelectorAll('[data-mid]'), function (e) { return !e.parentElement || !e.parentElement.closest('[data-mid]'); });
    if (els.length) return Array.prototype.slice.call(els);
    return Array.prototype.slice.call(document.querySelectorAll('.bubble, .Message, [class*="message-list"] [class*="message" i]'));
  }
  function messageId(el) {
    if (!el || !el.getAttribute) return null;
    var raw = el.getAttribute('data-mid'); if (raw == null) raw = el.getAttribute('data-message-id'); if (raw == null) raw = el.getAttribute('data-msg-id');
    var n = raw != null ? Number(raw) : NaN; return isFinite(n) ? n : null;
  }
  function getGroupName() {
    var clean = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };
    try {
      var pick = function (sels) { for (var i = 0; i < sels.length; i++) { var el = document.querySelector(sels[i]); var t = el && clean(el.textContent); if (t) return t; } return ''; };
      var top = pick(['.chat-info .peer-title', '#column-center .chat-info .title', '.topbar .peer-title', '.chat-info .user-title', '.chat-info .person .peer-title', '#column-center .chat-info [class*="title"]', '.MiddleHeader .ChatInfo .title', '.MiddleHeader .fullName']);
      return top.slice(0, 80);
    } catch (e) { return ''; }
  }
  function linksInMessage(el) {
    var out = [], seen = {};
    var add = function (raw) { var l = normalizeLink(raw); if (!l) return; var id = statusId(l); if (seen[id]) return; seen[id] = 1; out.push(l); };
    Array.prototype.forEach.call(el.querySelectorAll('a[href]'), function (a) { var h = a.getAttribute('href') || ''; if (/intent/i.test(h)) return; add(h); });
    allLinksIn(el.textContent || '').forEach(add);
    return out;
  }
  // every X post link in the chat sorted by Telegram message id (oldest -> newest): "next" never depends on DOM order / what is scrolled out
  function serialItems() {
    var items = [], prevMid = 0, order = 0;
    messageEls().forEach(function (el) {
      var mid = messageId(el); if (mid == null) mid = prevMid; else prevMid = mid;
      var idx = 0; linksInMessage(el).forEach(function (link) { items.push({ el: el, link: link, id: statusId(link), mid: mid, idx: idx++, order: order++ }); });
    });
    items.sort(function (x, y) { return (x.mid - y.mid) || (x.idx - y.idx) || (x.order - y.order); });
    return items;
  }
  function findScroller(fromEl) {
    var cands = Array.prototype.filter.call(document.querySelectorAll(
      '#column-center .scrollable-y, #column-center .scrollable, #column-center .bubbles, #column-center .bubbles-inner,' +
      '.scrollable-y, .scrollable, .bubbles, .bubbles-inner, [class*="MessageList"], [class*="message-list"], [class*="Messages"]'), function (e) { return e.scrollHeight > e.clientHeight + 40; })
      .sort(function (a, b) { return b.clientHeight - a.clientHeight; });
    if (cands[0]) return cands[0];
    var chain = [], n = fromEl;
    for (var i = 0; i < 12 && n; i++) { if (n.scrollHeight > n.clientHeight + 40) chain.push(n); n = n.parentElement; }
    chain.push(document.scrollingElement || document.documentElement);
    for (var k = 0; k < chain.length; k++) {
      var c = chain[k], top = c.scrollTop, moved = false;
      try { c.scrollTop = top + 50; moved = c.scrollTop !== top; } catch (e) { continue; }
      if (!moved) { try { c.scrollTop = top - 50; moved = c.scrollTop !== top; } catch (e) {} }
      try { c.scrollTop = top; } catch (e) {}
      if (moved) return c;
    }
    return chain[chain.length - 1];
  }
  function lockScrollBehavior(scroller) {   // stop Telegram's scroll anchoring from fighting our scrolling
    var els = [scroller].concat(Array.prototype.slice.call(scroller.querySelectorAll('[style*="overflow"]')));
    var saved = els.map(function (el) { return { el: el, a: el.style.getPropertyValue('overflow-anchor'), o: el.style.getPropertyValue('overscroll-behavior'), b: el.style.getPropertyValue('scroll-behavior') }; });
    els.forEach(function (el) { el.style.setProperty('overflow-anchor', 'none'); el.style.setProperty('overscroll-behavior', 'contain'); el.style.setProperty('scroll-behavior', 'auto'); });
    return function () { saved.forEach(function (s) { s.el.style.setProperty('overflow-anchor', s.a); s.el.style.setProperty('overscroll-behavior', s.o); s.el.style.setProperty('scroll-behavior', s.b); }); };
  }
  function scrollInfo(sc) {
    if (sc) return { top: sc.scrollTop, max: Math.max(0, sc.scrollHeight - sc.clientHeight), step: Math.max(360, sc.clientHeight * 0.85) };
    return { top: window.scrollY, max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), step: Math.max(360, window.innerHeight * 0.85) };
  }
  async function scrollByAmount(sc, dy) {
    var cur = function () { return sc ? sc.scrollTop : window.scrollY; }, before = cur();
    try { (sc || window).scrollBy(0, dy); } catch (e) { if (sc) sc.scrollTop = before + dy; else window.scrollTo(0, before + dy); }
    await sleep(80);
    if (Math.abs(cur() - before) < 2) { try { if (sc) sc.scrollTop = before + dy; else window.scrollTo(0, before + dy); } catch (e) {} await sleep(80); }
    try { (sc || window).dispatchEvent(new Event('scroll', { bubbles: true })); } catch (e) {}
  }
  async function stepChat(dir) {   // Telegram only keeps a window of messages in the DOM: nudge it so the neighbours load (+1 newer/down, -1 older/up)
    try { var sc = findScroller(messageEls()[0] || document.body); await scrollByAmount(sc, dir * scrollInfo(sc).step); } catch (e) {}
  }
  function loadedMidRange() {
    var mids = messageEls().map(messageId).filter(function (m) { return m != null; });
    return mids.length ? { min: Math.min.apply(null, mids), max: Math.max.apply(null, mids) } : null;
  }
  // scroll UP until the message carrying this post ID is on screen. -> serial item or null
  async function locate(id, cancelled) {
    var find = function () { return serialItems().filter(function (x) { return x.id === String(id); })[0] || null; };
    var it = find(); if (it) return it;
    var sc = findScroller(messageEls()[0] || document.body);
    for (var i = 0; i < 150 && !(cancelled && cancelled()); i++) {
      var before = scrollInfo(sc); await scrollByAmount(sc, -before.step); await sleep(250);
      it = find(); if (it) return it;
      var after = scrollInfo(sc); if (after.top === before.top && before.top <= 0) break;
    }
    return null;
  }
  // next link strictly after the last engaged message (never goes back up)
  function findNextSerial(engaged, lastMid, endLink) {
    var done = {}; (engaged || []).forEach(function (i) { done[String(i)] = 1; });
    var items = serialItems();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (lastMid != null && it.mid < lastMid) continue;
      if (done[it.id]) continue;
      if (isOwnLink(it.link)) { if (endLink && sameLink(it.link, endLink)) return { ownEnd: true }; continue; }
      return it;
    }
    return null;
  }

  // ---------------- state ----------------
  var P = { open: false, tab: 'engage', viewKey: '' };
  var sw = { phase: 'idle', collected: [], skipped: 0, stopCountdown: 0 };
  var swBusy = false, swCancel = false, swLastInput = '', swCarry = [];
  var engBusy = false, noLinkSince = 0, gapScrolls = 0, lastNotFound = 0;

  // ---------------- LINK SWEEP ----------------
  async function runSweep(inputText) {
    if (swBusy) return;
    var startLink = allLinksIn(inputText)[0] || null, startId = startLink ? statusId(startLink) : extractPostId(inputText);
    if (!startId) { toast('No X link or post ID in that. Paste one from the message you want to start at.', 3500); return; }
    swLastInput = inputText; swBusy = true; swCancel = false;
    sw = { phase: 'searching', collected: [], skipped: 0, stopCountdown: 0 }; render(true);
    var startItem = await locate(startId, function () { return swCancel; });
    if (!startItem) {
      var cancelled = swCancel; swBusy = false; sw.phase = 'idle'; render(true);
      if (!cancelled) toast('Could not find that message anywhere in this chat.', 4500);
      return;
    }
    var startMid = startItem.mid, startIdx = startItem.idx;
    sw.phase = 'scanning'; render(true);
    var scroller = findScroller(startItem.el), unlock = lockScrollBehavior(scroller);
    var got = {}, order = [], stuck = 0, lastTop = -1;
    var collect = function () {
      var changed = false;
      serialItems().forEach(function (it) {
        if (it.mid < startMid) return; if (it.mid === startMid && it.idx < startIdx) return;
        if (got[it.id]) return;
        if (isOwnLink(it.link)) return;                    // my own post: left out
        got[it.id] = { link: it.link, mid: it.mid, idx: it.idx }; order.push(it.id); changed = true;
      });
      sw.collected = order.map(function (i) { return got[i]; }).sort(function (a, b) { return (a.mid - b.mid) || (a.idx - b.idx); }).map(function (x) { return x.link; });
      return changed;
    };
    while (!swCancel) {
      var changed = collect(); tickUI();
      var si = scrollInfo(scroller), atBottom = si.top >= si.max - 4;
      if (atBottom && si.top === lastTop && !changed) stuck++; else stuck = 0;
      lastTop = si.top;
      if (atBottom && stuck === 3) { await scrollByAmount(scroller, si.step * 1.6); await sleep(500); }
      if (stuck >= 5) break;
      await scrollByAmount(scroller, si.step); await sleep(atBottom ? 500 : 250);
    }
    if (!swCancel) { await sleep(900); collect(); }
    unlock(); swBusy = false;
    if (sw.phase !== 'stopping') finishSweep();
  }
  function finishSweep() {
    if (swCarry.length) { var seen = {}, all = swCarry.concat(sw.collected).filter(function (l) { var i = statusId(l); if (seen[i]) return false; seen[i] = 1; return true; }); sw.collected = all; swCarry = []; }
    sw.phase = 'done'; render(true);
  }
  function stopSweepScan() {
    if (sw.phase !== 'scanning' && sw.phase !== 'searching') return;
    swCancel = true; sw.phase = 'stopping'; sw.stopCountdown = 3; render(true);
    var step = function () { sw.stopCountdown--; if (sw.stopCountdown <= 0) { finishSweep(); return; } render(true); setTimeout(step, 1000); };
    setTimeout(step, 1000);
  }
  function getFolders() { var l = lsGet('zenTgFolders', []); return Array.isArray(l) ? l : []; }
  function saveFolder(name) {
    var links = sw.collected.slice(); if (!links.length) { toast('Nothing to save - no links were caught.', 3000); return false; }
    var list = getFolders(), label = (name || '').trim() || 'Sweep ' + new Date().toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    list.unshift({ id: 'f' + Date.now().toString(36), name: label.slice(0, 60), links: links, createdAt: Date.now() });
    lsSet('zenTgFolders', list.slice(0, 50));
    toast('Saved "' + label.slice(0, 60) + '" - ' + links.length + ' links. Run it anytime from the Sweep tab.', 4000); return true;
  }
  // start the queue: blacklist dropped, whitelist first (stable), own posts dropped, duplicates dropped. The X tab does the rest.
  function startQueue(links, name) {
    var c = cfgGet(), j = jobGet();
    if (j.running) { toast('A Telegram run is already going - stop it first.', 3500); return false; }
    if (c.auto) { toast('Stop SEA/FED AUTO first - only one engine can reply at a time.', 4000); return false; }
    var bl = handleSet(c.blackList), wl = handleSet(c.whiteList), seen = {}, items = [];
    (links || []).forEach(function (u) { var id = statusId(u), us = linkUser(u); if (!u || seen[id]) return; if (isOwnLink(u) || (us && bl[us])) return; seen[id] = 1; items.push(u); });
    if (Object.keys(wl).length) { var hot = items.filter(function (u) { return wl[linkUser(u)]; }); if (hot.length && hot.length < items.length) items = hot.concat(items.filter(function (u) { return !wl[linkUser(u)]; })); }
    if (!items.length) { toast('Nothing to send - no links were caught.', 3000); return false; }
    if (items.length > 1500) { items = items.slice(0, 1500); toast('Queue capped at 1500 links.', 3500); }
    var now = Date.now();
    jobStart({ running: true, mode: 'sweep', gen: now, name: name || '', queue: items, idx: 0, done: 0, failed: 0, skipped: 0, consec: 0, sinceBreak: 0, phase: 'X', navAt: now, stepAt: now, waitUntil: 0, msg: 'Opening the first link', startedAt: now });
    toast('Queue started - ' + items.length + ' link' + (items.length === 1 ? '' : 's') + ' will be engaged on X.', 4000);
    openX(items[0], true); return true;
  }

  // ---------------- GROUP ENGAGE ----------------
  function startEngage(o) {
    var c = cfgGet(), j = jobGet();
    if (j.running) { toast('A Telegram run is already going - stop it first.', 3500); return; }
    if (c.auto) { toast('Stop SEA/FED AUTO first - only one engine can reply at a time.', 4000); return; }
    var now = Date.now();
    noLinkSince = 0; gapScrolls = 0;
    jobStart({ running: true, mode: 'engage', gen: now, phase: 'FIND_START', startId: o.startId, endLink: o.endLink || '', group: o.group || '', done: 0, failed: 0, skipped: 0, consec: 0, sinceBreak: 0, engaged: [], lastMid: null, startMid: null, waitUntil: 0, msg: 'Looking for the start link', startedAt: now, opened: false });
    render(true);
  }
  async function engageTick() {
    if (engBusy) return; engBusy = true;
    try {
      var j = jobGet(); if (!j.running || j.mode !== 'engage') { noLinkSince = 0; return; }
      if (j.waitUntil && Date.now() < j.waitUntil) return;
      if (j.phase === 'X' || j.phase === 'DONE') return;
      var cancelled = function () { var q = jobGet(); return !q.running; };
      if (j.phase === 'FIND_START') {
        var id = String(j.startId), it = serialItems().filter(function (x) { return x.id === id; })[0] || await locate(id, cancelled);
        if (cancelled()) return;
        if (!it) {
          if (Date.now() - lastNotFound > 8000) { lastNotFound = Date.now(); toast(messageEls().length ? 'Could not find that link in this chat yet. Still checking...' : 'No chat is open on Telegram yet. Open the group, then this picks up automatically.', 4500); }
          return;
        }
        if (isOwnLink(it.link)) { toast('That starting link is your own post - continuing from the next one.', 3500); jobPatch({ phase: 'FIND_NEXT', lastMid: it.mid, startMid: it.mid, engaged: [id], skipped: (j.skipped || 0) + 1 }); return; }
        try { it.el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
        await sleep(300);
        var now0 = Date.now();
        jobPatch({ phase: 'X', cur: it.link, curMid: it.mid, startMid: it.mid, navAt: now0, stepAt: now0, opened: true, msg: 'Opening the link on X' });
        openX(it.link, !j.opened); return;
      }
      // FIND_NEXT
      var anchor = j.lastMid != null ? j.lastMid : j.startMid, rng = loadedMidRange();
      if (anchor != null && rng && rng.min > anchor && gapScrolls < 8) { gapScrolls++; await stepChat(-1); return; }   // anchor not loaded: scroll up so nothing in between is missed
      var found = findNextSerial(j.engaged, anchor, j.endLink);
      if (found && found.ownEnd) { jobPatch({ running: false, phase: 'DONE', msg: 'Reached the end link' }); toast('Reached the end link (your own post).', 3500); return; }
      if (!found) {
        if (!noLinkSince) noLinkSince = Date.now();
        if (Date.now() - noLinkSince > 600000) { jobPatch({ running: false, phase: 'DONE', msg: 'No new link in the chat for 10 minutes' }); toast('No new link in the chat for 10 minutes - stopped.', 4000); noLinkSince = 0; return; }
        jobPatch({ msg: 'Waiting for the next link in the chat' });
        await stepChat(1); return;   // nothing after the anchor is loaded: load newer messages and look again
      }
      noLinkSince = 0; gapScrolls = 0;
      try { found.el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
      await sleep(300);
      var now1 = Date.now();
      jobPatch({ phase: 'X', cur: found.link, curMid: found.mid, navAt: now1, stepAt: now1, msg: 'Opening the next link on X' });
      openX(found.link, false);
    } catch (e) {} finally { engBusy = false; }
  }
  function stopRun() {
    var j = jobGet();
    if (j.running) {
      jobPatch({ running: false, phase: 'DONE', msg: 'Stopped', waitUntil: 0 });
      if (j.mode === 'engage' && j.cur) lsSet('zenTgLast', { link: j.cur, id: statusId(j.cur), ts: Date.now() });
    }
    swCancel = true; render(true);
  }

  // ---------------- UI ----------------
  var C = { bg: '#0d0a14', br: '#6d28d9', tx: '#fff', dim: '#9ca3af', acc: '#a78bfa' };
  var INP = 'width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 8px;border-radius:10px;border:1px solid #3a3260;background:#16122a;color:#fff;font:13px sans-serif;outline:none;';
  var BTN = function (primary) { return 'text-align:center;padding:11px 0;margin:0 0 8px;border-radius:10px;font:800 12px sans-serif;letter-spacing:.8px;cursor:pointer;' + (primary ? 'background:#6d28d9;color:#fff;' : 'border:1px solid #3a3260;color:#c4b5fd;background:transparent;'); };
  var RED = 'text-align:center;padding:11px 0;margin:0 0 8px;border-radius:10px;font:800 12px sans-serif;letter-spacing:.8px;cursor:pointer;background:#b91c1c;color:#fff;';
  var HINT = 'font-size:11px;line-height:1.5;color:' + '#9ca3af' + ';margin:0 0 9px;';
  function tabBtn(k, label) { var on = P.tab === k; return '<div data-act="tab" data-v="' + k + '" style="flex:1;text-align:center;padding:9px 0;border-radius:10px;font:800 11px sans-serif;letter-spacing:.6px;cursor:pointer;border:1px solid ' + (on ? C.br : '#333') + ';background:' + (on ? '#2a1a52' : '#16122a') + ';color:' + (on ? '#fff' : '#9ca3af') + '">' + label + '</div>'; }
  function head(title) { return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="letter-spacing:2px;font-size:12px">' + title + '</b><span data-act="close" style="color:#9ca3af;font-size:18px;padding:0 4px;cursor:pointer">&times;</span></div>'; }
  function likeBlock() {
    var c = cfgGet(), on = c.tgLike == null ? !!c.like : !!c.tgLike, pct = c.tgLikePct == null ? (c.likePct == null ? 100 : c.likePct) : c.tgLikePct;
    return '<div style="display:flex;align-items:center;gap:8px;margin:2px 0 10px;font-size:12px;color:#ddd"><label style="display:flex;align-items:center;gap:6px;flex:1"><input type="checkbox" id="ztg-like"' + (on ? ' checked' : '') + '> Like before comment</label>' +
      '<input id="ztg-likepct" type="number" min="1" max="100" value="' + esc(pct) + '" style="width:58px;box-sizing:border-box;padding:6px;border-radius:8px;border:1px solid #3a3260;background:#16122a;color:#fff"><span>%</span></div>';
  }
  function liveText() {   // the dynamic part (status + counters) of the current view
    var j = jobGet(), now = Date.now();
    if (j.running) {
      var st = j.msg || '', left = j.waitUntil && j.waitUntil > now ? Math.ceil((j.waitUntil - now) / 1000) : 0;
      if (left) st = (j.brk ? 'Break' : 'Next link') + ' in ' + left + 's';
      var tot = j.mode === 'sweep' ? ' / ' + (j.queue || []).length : '';
      return '<div style="font-size:12px;color:#ddd;margin-bottom:6px">' + esc(st || 'Running') + '</div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-bottom:10px"><b style="color:#4ade80">' + (j.done || 0) + '</b>' + tot + ' done · <b style="color:#f87171">' + (j.failed || 0) + '</b> failed · <b style="color:#fbbf24">' + (j.skipped || 0) + '</b> skipped</div>';
    }
    if (sw.phase === 'scanning' || sw.phase === 'searching' || sw.phase === 'stopping' || sw.phase === 'done') {
      var n = sw.collected.length;
      if (sw.phase === 'searching') return '<div style="' + HINT + '">Locating that message...</div>';
      if (sw.phase === 'stopping') return '<div style="' + HINT + '">Stopping in <b>' + sw.stopCountdown + '</b>... keeping <b>' + n + '</b> link' + (n === 1 ? '' : 's') + '.</div>';
      return '<div style="font-size:12px;color:#ddd;margin-bottom:10px">' + (sw.phase === 'done' ? 'Swept clean. ' : 'Sweeping... ') + '<b style="color:#fde047">' + n + '</b> link' + (n === 1 ? '' : 's') + ' caught' + (sw.phase === 'done' ? '.' : ' so far.') + '</div>';
    }
    return '';
  }
  function lastRunLine() {   // result of the run that just ended
    var j = jobGet(); if (j.running || j.phase !== 'DONE' || !j.msg || !j.finishedAt || Date.now() - j.finishedAt > 6 * 3600000) return '';
    return '<div style="font-size:11px;color:#c4b5fd;margin:0 0 10px;padding:8px;border:1px solid #3a3260;border-radius:10px">Last run (' + (j.mode === 'sweep' ? 'sweep' : 'engage') + '): ' + esc(j.msg) + ' · ' + (j.done || 0) + ' done · ' + (j.failed || 0) + ' failed · ' + (j.skipped || 0) + ' skipped</div>';
  }
  function viewKey() {
    var j = jobGet(); if (j.running) return 'run:' + j.mode;
    if (P.tab === 'sweep') return 'sweep:' + sw.phase;
    return 'engage';
  }
  function viewHtml(key) {
    var live = '<div id="ztg-live">' + liveText() + '</div>';
    if (key.indexOf('run:') === 0) {
      var j = jobGet(), eng = j.mode === 'engage';
      return head(eng ? 'TG · GROUP ENGAGE' : 'TG · LINK SWEEP') + live +
        (eng && j.cur ? '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px;word-break:break-all">Now: ' + esc(j.cur) + '</div>' : '') +
        '<div data-act="openx" style="' + BTN(false) + '">Show X tab</div><div data-act="stoprun" style="' + RED + '">STOP</div>';
    }
    var tabs = '<div style="display:flex;gap:6px;margin-bottom:10px">' + tabBtn('engage', 'GROUP ENGAGE') + tabBtn('sweep', 'LINK SWEEP') + '</div>';
    if (key === 'engage') {
      var last = lsGet('zenTgLast', null), showLast = last && last.link && Date.now() - last.ts < 86400000;
      return head('ZEN TELEGRAM') + tabs + lastRunLine() +
        '<div style="' + HINT + '">Open the group you want to work through, then give it a starting point. It goes down the chat in order from there, one link at a time.</div>' +
        (showLast ? '<div data-act="eng-last" style="' + BTN(false) + '">Continue from the last link</div>' : '') +
        '<input id="ztg-group" style="' + INP + '" placeholder="Group name (auto-detected)" value="' + esc(getGroupName()) + '">' +
        '<input id="ztg-startid" style="' + INP + '" placeholder="Start ID or whole link / message" autocomplete="off" spellcheck="false">' +
        '<input id="ztg-end" style="' + INP + '" placeholder="End link, optional" autocomplete="off" spellcheck="false">' +
        likeBlock() + '<div data-act="eng-start" style="' + BTN(true) + '">START</div>';
    }
    if (key === 'sweep:idle') {
      var fl = getFolders(), opts = fl.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + ' (' + f.links.length + ')</option>'; }).join('');
      return head('ZEN TELEGRAM') + tabs + lastRunLine() +
        '<div style="' + HINT + '">Drop a link, a post ID or a whole message from where you want to start. Every X link from there down to the newest message gets swept up in chat order, then runs as a queue.</div>' +
        '<input id="ztg-swin" style="' + INP + '" placeholder="Link or post ID to start from" autocomplete="off" spellcheck="false">' +
        likeBlock() + '<div data-act="sw-start" style="' + BTN(true) + '">START SWEEP</div>' +
        (fl.length ? '<div style="font-size:10px;letter-spacing:1.4px;color:#9ca3af;margin:4px 0 6px">SAVED FOLDERS</div><select id="ztg-fsel" style="' + INP + '">' + opts + '</select><div data-act="f-run" style="' + BTN(false) + '">Run selected folder</div><div data-act="f-del" style="' + BTN(false) + '">Delete selected folder</div>' : '');
    }
    if (key === 'sweep:searching' || key === 'sweep:scanning') return head('ZEN TELEGRAM') + tabs + live + '<div data-act="sw-stop" style="' + RED + '">STOP &amp; KEEP WHAT\'S CAUGHT</div>';
    if (key === 'sweep:stopping') return head('ZEN TELEGRAM') + tabs + live;
    if (key === 'sweep:done') {
      return head('ZEN TELEGRAM') + tabs + live + likeBlock() +
        '<div data-act="sw-send" style="' + BTN(true) + '">SEND TO QUEUE</div>' +
        '<input id="ztg-fname" style="' + INP + '" placeholder="Folder name (optional)" autocomplete="off" spellcheck="false">' +
        '<div data-act="sw-save" style="' + BTN(false) + '">Save to folder</div><div data-act="sw-again" style="' + BTN(false) + '">Sweep again (keep these)</div><div data-act="sw-new" style="' + BTN(false) + '">Start over</div>';
    }
    return head('ZEN TELEGRAM') + tabs;
  }
  function render(force) {
    var p = document.getElementById('ztg-panel'), fab = document.getElementById('ztg-fab'); if (!p || !fab) return;
    var j = jobGet(); fab.style.background = j.running ? '#15803d' : '#2563eb';
    if (!P.open) { p.style.display = 'none'; return; }
    p.style.display = 'block';
    var key = viewKey();
    if (force || key !== P.viewKey) { P.viewKey = key; p.innerHTML = viewHtml(key); bindInputs(p); placeUi(); }
  }
  function tickUI() { var el = document.getElementById('ztg-live'); if (el && P.open) { var h = liveText(); if (el.innerHTML !== h) el.innerHTML = h; } }
  function bindInputs(p) {
    var lk = p.querySelector('#ztg-like'), lp = p.querySelector('#ztg-likepct');
    if (lk) lk.onchange = function () { cfgSet({ tgLike: lk.checked }); };
    if (lp) lp.onchange = function () { var v = Math.min(100, Math.max(1, Math.round(Number(lp.value) || 100))); lp.value = v; cfgSet({ tgLikePct: v }); };
    var id = p.querySelector('#ztg-startid');
    if (id) { var clean = function () { var raw = id.value.trim(); if (!raw) return; var x = extractPostId(raw); if (x && x !== raw && /^\d+$/.test(raw) === false) id.value = x; }; id.addEventListener('paste', function () { setTimeout(clean, 0); }); }
  }
  function onTap(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null; if (!t) return;
    var act = t.getAttribute('data-act'), p = document.getElementById('ztg-panel'), q = function (s) { return p.querySelector(s); };
    if (act === 'close') { P.open = false; render(true); return; }
    if (act === 'tab') { P.tab = t.getAttribute('data-v'); render(true); return; }
    if (act === 'openx') { var jj = jobGet(); if (jj.cur || (jj.queue && jj.queue[jj.idx || 0])) openX(jj.cur || jj.queue[jj.idx || 0], true); return; }
    if (act === 'stoprun') { stopRun(); return; }
    if (act === 'eng-start') {
      var raw = q('#ztg-startid').value.trim(), end = q('#ztg-end').value.trim(), id = extractPostId(raw);
      if (!/^\d{5,19}$/.test(id)) { toast('Enter an X post ID or paste the post link.', 3500); return; }
      var endLink = end ? normalizeLink(end) : '';
      if (end && !endLink) { toast('The end link is not a valid x.com post link.', 3500); return; }
      startEngage({ startId: id, endLink: endLink, group: q('#ztg-group').value.trim() || getGroupName() }); return;
    }
    if (act === 'eng-last') { var l = lsGet('zenTgLast', null); if (l && l.id) startEngage({ startId: l.id, endLink: '', group: getGroupName() }); return; }
    if (act === 'sw-start') { swCarry = []; runSweep(q('#ztg-swin').value); return; }
    if (act === 'sw-stop') { stopSweepScan(); return; }
    if (act === 'sw-send') { if (startQueue(sw.collected.slice(), '')) { sw = { phase: 'idle', collected: [], skipped: 0 }; render(true); } return; }
    if (act === 'sw-save') { var inp = q('#ztg-fname'); if (saveFolder(inp ? inp.value : '') && inp) inp.value = ''; return; }
    if (act === 'sw-again') { if (!swLastInput) { sw = { phase: 'idle', collected: [] }; render(true); return; } swCarry = sw.collected.slice(); runSweep(swLastInput); return; }
    if (act === 'sw-new') { sw = { phase: 'idle', collected: [] }; swCarry = []; swLastInput = ''; render(true); return; }
    if (act === 'f-run' || act === 'f-del') {
      var sel = q('#ztg-fsel'), list = getFolders(), f = list.filter(function (x) { return sel && x.id === sel.value; })[0];
      if (!f) { toast('That folder is missing.', 3000); return; }
      if (act === 'f-del') { lsSet('zenTgFolders', list.filter(function (x) { return x.id !== f.id; })); render(true); return; }
      if (startQueue(f.links.slice(), f.name)) render(true);
    }
  }
  function placeUi() {   // keep the button/panel on the visible screen even when the page is zoomed (desktop-mode viewport)
    var fab = document.getElementById('ztg-fab'), p = document.getElementById('ztg-panel'); if (!fab || !p) return;
    var vv = window.visualViewport, sc = vv ? 1 / vv.scale : 1, ox = vv ? vv.offsetLeft : 0, oy = vv ? vv.offsetTop : 0, vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    fab.style.transformOrigin = 'top left'; fab.style.transform = 'scale(' + sc + ')';
    fab.style.left = (ox + vw - 52 * sc) + 'px'; fab.style.top = (oy + vh * 0.5) + 'px';
    p.style.transformOrigin = 'top left'; p.style.transform = 'scale(' + sc + ')';
    var pw = Math.min(300, Math.max(220, vw / sc - 16));
    p.style.width = pw + 'px';
    p.style.left = (ox + vw - (pw + 8) * sc) + 'px';
    var maxH = Math.max(160, vh / sc - 20); p.style.maxHeight = maxH + 'px';
    p.style.top = (oy + 8 * sc) + 'px';
  }
  function build() {
    if (document.getElementById('ztg-fab') || !document.body) return;
    var fab = document.createElement('div'); fab.id = 'ztg-fab'; fab.textContent = 'TG';
    fab.style.cssText = 'position:fixed;left:0;top:0;width:42px;height:42px;border-radius:21px;background:#2563eb;color:#fff;font:800 14px sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483646;opacity:.92;box-shadow:0 4px 14px rgba(0,0,0,.5)';
    var p = document.createElement('div'); p.id = 'ztg-panel';
    p.style.cssText = 'position:fixed;left:0;top:0;background:' + C.bg + ';color:#fff;border:1px solid ' + C.br + ';border-radius:14px;padding:12px;font:13px sans-serif;z-index:2147483646;display:none;overflow-y:auto;-webkit-overflow-scrolling:touch';
    fab.addEventListener('click', function () { P.open = !P.open; render(true); });
    p.addEventListener('click', onTap);
    ['keydown', 'keyup', 'keypress', 'paste', 'copy', 'cut', 'input', 'mousedown', 'touchstart'].forEach(function (ev) { p.addEventListener(ev, function (e) { e.stopPropagation(); }); });   // Telegram must not steal typing / focus from our inputs
    document.body.appendChild(p); document.body.appendChild(fab);
    render(true); placeUi();
  }
  function boot() {
    build();
    setInterval(function () {
      try { build(); render(false); tickUI(); placeUi(); engageTick(); } catch (e) {}
    }, 1500);
    try { if (window.visualViewport) { window.visualViewport.addEventListener('resize', placeUi); window.visualViewport.addEventListener('scroll', placeUi); } } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
