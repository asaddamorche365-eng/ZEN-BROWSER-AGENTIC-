// ZEN BROWSER - AUTOPILOT: runs the engines like a person would (scroll, own profile, post, search, engage, follow, rest).
// Lives on x.com next to x.js and uses its helpers through window.__ZAPI. State + settings live in the app job store "pjob",
// so it survives page loads. The Z1 app (Engine > Autopilot) starts / stops it. Decisions come from brainPick() (offline rules).
(function () {
  'use strict';
  if (window.top !== window || window.__ZPILOT) return;
  window.__ZPILOT = 1;

  var KEY = 'pjob', busy = false, lastMsg = '', lastMsgAt = 0;
  var STEPS = ['browse', 'feed', 'search', 'profile', 'post', 'follow'];
  function api() { return window.__ZAPI || null; }
  function now() { return Date.now(); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { a = Number(a) || 0; b = Number(b) || 0; if (b < a) b = a; return Math.round(a + Math.random() * (b - a)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function jg(k) { try { return JSON.parse((window.ZenEng && window.ZenEng.getJob && window.ZenEng.getJob(k || KEY)) || '{}') || {}; } catch (e) { return {}; } }
  function jp(p, k) { try { if (window.ZenEng && window.ZenEng.patchJob) window.ZenEng.patchJob(k || KEY, JSON.stringify(p)); } catch (e) {} }
  function pair(v, a, b) { return (v && v.length >= 2) ? [Number(v[0]) || 0, Number(v[1]) || 0] : [a, b]; }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function inQuiet(c, t) {
    if (!c.quietOn) return false;
    var d = new Date(t), h = d.getHours() + d.getMinutes() / 60, a = Number(c.quietFrom), b = Number(c.quietTo);
    if (isNaN(a) || isNaN(b) || a === b) return false;
    return a < b ? (h >= a && h < b) : (h >= a || h < b);
  }

  // ---------------- offline brain: which step next? (pure function, easy to test / replace) ----------------
  function eligible(id, j, c, t) {
    var s = (c.steps || {})[id]; if (!s || !s.on) return false;
    if (id === 'follow') {
      if (!(j.queue || []).length) return false;
      if ((j.cycleFollowed || 0) >= (Number(c.followCap) || 25)) return false;
      if ((j.followedToday || 0) >= (Number(c.dayFollowMax) || 100)) return false;
    }
    if (id === 'post') {
      if ((j.postsToday || 0) >= (Number(c.postsPerDay) || 3)) return false;
      if (t - (j.lastPostAt || 0) < (Number(c.postGapMin) || 90) * 60000) return false;
      if (!(j.postQueue || []).length && !c.aiPosts) return false;
    }
    if (id === 'search' && !(c.queries || []).length) return false;
    return true;
  }
  function brainPick(j, c, t, rng) {
    rng = rng || Math.random;
    var mode = c.mode || 'brain', cand = STEPS.filter(function (id) { return eligible(id, j, c, t); });
    if (!cand.length) return null;
    // per-step "skip chance": the person sometimes just does not do that thing this round
    var kept = cand.filter(function (id) { return rng() * 100 >= (Number(c.steps[id].skip) || 0); });
    if (kept.length) cand = kept;
    var last = j.lastPhase || '';
    if (mode === 'sequence') {
      var order = (c.order && c.order.length ? c.order : STEPS).filter(function (id) { return STEPS.indexOf(id) >= 0; });
      var cur = (j.seqIdx == null) ? -1 : j.seqIdx;
      for (var k = 1; k <= order.length; k++) { var ix = (((cur + k) % order.length) + order.length) % order.length, id = order[ix]; if (cand.indexOf(id) >= 0) return { step: id, seqIdx: ix }; }
      return { step: cand[0], seqIdx: cur < 0 ? 0 : cur };
    }
    var scores = cand.map(function (id) {
      var w = Number(c.steps[id].w); if (!isFinite(w) || w <= 0) w = 1;
      if (mode === 'brain') {
        var mins = (t - ((j.last || {})[id] || 0)) / 60000;          // the longer ago, the more likely
        w *= 1 + Math.min(mins / 30, 3);
        if (id === 'follow' && (j.queue || []).length > 20) w *= 1.2;
        if (id === 'post') w *= 0.7;                                     // posting is rarer than browsing
      }
      if (id === last && cand.length > 1) w *= 0.15;                      // do not repeat the same thing twice in a row
      return w * (0.75 + 0.5 * rng());
    });
    var sum = scores.reduce(function (a, b) { return a + b; }, 0), r = rng() * sum, i = 0;
    for (; i < scores.length - 1; i++) { r -= scores[i]; if (r <= 0) break; }
    return { step: cand[i] };
  }
  window.__ZPILOT_BRAIN = brainPick;   // for tests / a future smarter brain

  // ---------------- small human-like helpers ----------------
  function isHome() { return location.pathname === '/home' || location.pathname === '/'; }
  function isSearch() { return location.pathname.indexOf('/search') === 0; }
  function nav(url, j) {
    var t = now();
    if (j.navAt && t - j.navAt < 20000) return;      // already told the page to go there, wait
    jp({ navAt: t }); try { location.href = url; } catch (e) {}
  }
  async function smoothBy(px) {
    var steps = ri(9, 16), done = 0;
    for (var i = 1; i <= steps; i++) {
      var x = i / steps, e = x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2, d = px * e - done; done = px * e;
      window.scrollBy({ top: d, behavior: 'instant' }); await sleep(rnd(35, 90));
    }
  }
  async function humanScroll() {
    var r = Math.random(), vh = window.innerHeight || 700;
    if (r < 0.10) { await smoothBy(-vh * rnd(0.2, 0.6)); await sleep(rnd(1500, 4000)); }          // scroll back up a bit
    else if (r < 0.20) { await sleep(rnd(6000, 14000)); }                                           // stop and "read"
    else { await smoothBy(vh * rnd(0.4, 1.3)); await sleep(rnd(1200, 5200)); }
  }
  function setMsg(text) {
    var a = api(); if (a) a.setStat('PILOT - ' + text);
    var t = now(); if (text !== lastMsg && t - lastMsgAt > 4000) { lastMsg = text; lastMsgAt = t; jp({ msg: text }); }
  }
  function endPhase(j, name, extra) {
    var last = Object.assign({}, j.last || {}); last[name] = now();
    var p = { phase: '', phaseStart: 0, phaseEnd: 0, navAt: 0, eStarted: 0, fStarted: 0, lastPhase: name, last: last };
    if (extra) for (var k in extra) p[k] = extra[k];
    jp(p);
  }
  function stopEngines(force) {
    var a = api(); if (!a) return;
    var j = jg();
    if (!force && !j.engOwned) return;
    var c = a.getCfg(); if (c.auto || c.fed || c.sea) a.patchCfg({ fed: false, sea: false, auto: false });
    var fj = jg('fjob'); if (fj.running && j.fOwned) jp({ running: false, status: 'stopped', msg: 'Stopped', waitUntil: 0 }, 'fjob');
    jp({ engOwned: false, fOwned: false });
  }
  function finish(msg, kind) {
    stopEngines(true);
    jp({ running: false, status: 'done', msg: msg, phase: '', finishedAt: now() });
    var a = api(); if (a) { a.setStat(msg); a.toast('PILOT: ' + msg, kind || 'success'); }
  }

  // ---------------- phases ----------------
  async function runBrowse(j, c, t, where) {
    if (where === 'home' ? !isHome() : location.pathname.toLowerCase() !== '/' + String(where).toLowerCase()) {
      setMsg(where === 'home' ? 'opening feed' : 'opening own profile'); nav(where === 'home' ? 'https://x.com/home' : 'https://x.com/' + where, j); return;
    }
    if (t >= j.phaseEnd) { endPhase(j, where === 'home' ? 'browse' : 'profile'); return; }
    setMsg((where === 'home' ? 'scrolling feed' : 'on own profile') + ' - ' + Math.max(0, Math.round((j.phaseEnd - t) / 1000)) + 's left');
    await humanScroll();
  }
  async function runEngine(j, c, t, eng) {
    var a = api(), name = eng === 'FED' ? 'feed' : 'search', onPage = eng === 'FED' ? isHome() : isSearch();
    if (!j.eStarted) {
      var cnt = pair(c.steps[name].cnt, 5, 12), n = ri(cnt[0], cnt[1]), p = { auto: true, fed: false, sea: false };
      try { sessionStorage.removeItem('zenEngRun'); sessionStorage.removeItem('zenEngSafe'); } catch (e) {}
      if (eng === 'FED') { p.fed = true; p.fedMax = n; }
      else {
        var qs = c.queries || [], q = qs[ri(0, qs.length - 1)] || '', url = 'https://x.com/search?q=' + encodeURIComponent(q) + '&src=typed_query&f=live';
        p.sea = true; p.seaMax = n; p.seaUrl = url; jp({ curUrl: url });
      }
      a.patchCfg(p); jp({ eStarted: t, engOwned: true, navAt: 0, phaseEnd: Math.max(j.phaseEnd || 0, t + 20 * 60000) });
      return;
    }
    if (!onPage) { setMsg(eng === 'FED' ? 'opening feed' : 'opening search'); nav(eng === 'FED' ? 'https://x.com/home' : (j.curUrl || 'https://x.com/search?q=gm&f=live'), j); return; }
    var cfg = a.getCfg();
    if ((!cfg.auto && t - j.eStarted > 10000) || t >= j.phaseEnd) { a.patchCfg({ fed: false, sea: false, auto: false }); endPhase(j, name, { engOwned: false }); return; }
    // the engine itself shows its own live status in the X panel
  }
  async function runPost(j, c, t) {
    var a = api();
    if (j.postGuard && t - j.postGuard < 300000) { endPhase(j, 'post'); return; }            // one try per phase, never twice
    if (!isHome()) { setMsg('opening feed to post'); nav('https://x.com/home', j); return; }
    if (t - j.phaseStart > 60000) { endPhase(j, 'post'); return; }
    var ed = document.querySelector('[data-testid="tweetTextarea_0"]');
    if (!ed) {
      var fab = document.querySelector('[data-testid="FloatingActionButton_Tweet"],[data-testid="SideNav_NewTweet_Button"],a[href="/compose/post"]');
      if (fab) { setMsg('opening composer'); await a.tap(fab); await sleep(rnd(1500, 2500)); }
      return;
    }
    setMsg('writing a post');
    var text = '', q = (j.postQueue || []).slice();
    if (q.length) text = q.shift();
    else if (c.aiPosts) {
      try { text = await a.genRaw(postPrompt(c, j)); } catch (e) { setMsg('AI failed: ' + String(e && e.message || e).slice(0, 40)); endPhase(j, 'post'); return; }
    }
    text = String(text || '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 270);
    if (!text) { endPhase(j, 'post'); return; }
    jp({ postGuard: t, postQueue: q });
    await sleep(rnd(1200, 3000));
    if (!(await a.insertText(ed, text))) { endPhase(j, 'post'); return; }
    await sleep(rnd(2500, 6000));
    var btn = a.submitBtn(ed);
    if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') { endPhase(j, 'post'); return; }
    await a.tap(btn); await sleep(3500);
    var lp = (j.lastPosts || []).slice(-4).concat(text);
    endPhase(j, 'post', { postsToday: (j.postsToday || 0) + 1, lastPostAt: now(), lastPosts: lp });
    setMsg('posted');
  }
  function postPrompt(c, j) {
    var topic = String(c.aiTopic || '').trim();
    return 'Write ONE short original post for X (max 240 characters) in a natural, casual human voice.' +
      (topic ? ' Topic / niche: ' + topic + '.' : '') +
      ' No hashtags, no quotes around it, at most one emoji. Do not repeat or closely resemble these recent posts: ' + JSON.stringify((j.lastPosts || []).slice(-4)) +
      ' Output only the post text.';
  }
  async function runFollow(j, c, t) {
    var a = api();
    if (!j.fStarted) {
      var left = Math.max(0, (Number(c.followCap) || 25) - (j.cycleFollowed || 0)), ck = pair(c.followChunk, 5, 10), n = Math.min(left, ri(ck[0], ck[1]));
      var chunk = (j.queue || []).slice(0, n);
      if (!chunk.length) { endPhase(j, 'follow'); return; }
      var gap = pair(c.followGap, 120, 240);
      jp({ running: true, status: 'running', queue: chunk, idx: 0, done: 0, skipped: 0, failed: 0, consec: 0, gapMin: gap[0], gapMax: gap[1],
        followed: [], failedList: [], last: null, startedAt: t, msg: 'Starting', waitUntil: 0, navAt: 0, stepAt: 0 }, 'fjob');
      jp({ fStarted: t, fChunk: chunk.length, fOwned: true, engOwned: true });
      return;
    }
    var fj = jg('fjob');
    if (fj.running) { setMsg('following ' + ((fj.idx || 0) + 1) + '/' + (j.fChunk || '?')); return; }
    var msg = String(fj.msg || ''), done = fj.done || 0, processed = Math.min(j.fChunk || 0, fj.idx || 0);
    var limit = /X limit|failed in a row|logged out/i.test(msg);
    var queue = (j.queue || []).slice(processed), cyc = (j.cycleFollowed || 0) + done, today = (j.followedToday || 0) + done;
    var extra = { queue: queue, cycleFollowed: cyc, followedToday: today, fOwned: false };
    var capHit = cyc >= (Number(c.followCap) || 25) || today >= (Number(c.dayFollowMax) || 100);
    if (limit || capHit) {
      var rr = pair(c.restHours, 3, 4), ms = Math.round(rnd(rr[0], Math.max(rr[0], rr[1])) * 3600000);
      extra.restUntil = now() + ms; extra.restWhy = limit ? 'limit' : 'cap';
    }
    endPhase(j, 'follow', extra);
  }

  // ---------------- main tick ----------------
  async function tick() {
    if (busy) return;
    var a = api(); if (!a) return;
    var j = jg();
    if (!j.running) { if (j.engOwned) stopEngines(true); return; }
    var c = j.cfg || {}, t = now();
    if (a.loginWall()) { finish('X logged out - log in again', 'error'); return; }
    var dk = dayKey(t);
    if (j.dayKey !== dk) { jp({ dayKey: dk, followedToday: 0, postsToday: 0 }); return; }
    if (j.restUntil && t < j.restUntil) {
      stopEngines(false);
      setMsg((j.restWhy === 'limit' ? 'follow limit, resting until ' : j.restWhy === 'cap' ? 'follow cap reached, resting until ' : j.restWhy === 'break' ? 'short break until ' : 'idle until ') + hhmm(j.restUntil));
      return;
    }
    if (j.restUntil) { jp({ restUntil: 0, restWhy: '', sessionStart: 0, cycleFollowed: j.restWhy === 'limit' || j.restWhy === 'cap' ? 0 : (j.cycleFollowed || 0) }); return; }
    if (inQuiet(c, t)) { stopEngines(false); setMsg('quiet hours'); return; }
    if (!j.sessionStart) { var sm = pair(c.sessionMin, 40, 90); jp({ sessionStart: t, sessionLen: ri(sm[0], sm[1]) * 60000 }); return; }
    if (!j.phase && t - j.sessionStart > (j.sessionLen || 3600000)) {
      var bm = pair(c.breakMin, 10, 30); jp({ restUntil: t + ri(bm[0], bm[1]) * 60000, restWhy: 'break' }); return;
    }
    if (!j.phase) {
      var pick = brainPick(j, c, t);
      if (!pick) { jp({ restUntil: t + 10 * 60000, restWhy: 'idle' }); return; }
      var st = c.steps[pick.step] || {}, mm = pair(st.min, 3, 8), dur = ri(mm[0], mm[1]) * 60000;
      var np = { phase: pick.step, phaseStart: t, phaseEnd: t + Math.max(dur, 60000), navAt: 0, eStarted: 0, fStarted: 0 };
      if (pick.seqIdx != null) np.seqIdx = pick.seqIdx;
      jp(np); setMsg('next: ' + pick.step); return;
    }
    busy = true;
    try {
      if (j.phase === 'browse') await runBrowse(j, c, t, 'home');
      else if (j.phase === 'profile') {
        var h = String(a.ownHandle() || a.getCfg().myHandle || '').replace(/^@/, '');
        if (!h) endPhase(j, 'profile'); else await runBrowse(j, c, t, h);
      }
      else if (j.phase === 'feed') await runEngine(j, c, t, 'FED');
      else if (j.phase === 'search') await runEngine(j, c, t, 'SEA');
      else if (j.phase === 'post') await runPost(j, c, t);
      else if (j.phase === 'follow') await runFollow(j, c, t);
      else endPhase(j, j.phase);
    } catch (e) { jp({ msg: 'Error: ' + String(e && e.message || e).slice(0, 80) }); endPhase(j, j.phase || 'x'); }
    finally { busy = false; }
  }
  setInterval(function () { try { tick(); } catch (e) {} }, 1000);
})();
