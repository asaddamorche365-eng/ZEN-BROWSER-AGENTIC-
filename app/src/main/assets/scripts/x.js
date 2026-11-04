// ZEN BROWSER — SEA + FED engine (port of Z EX eng_sea.js / eng_fed.js, local only, no CDP)
// Injected by MainActivity at document start on x.com / twitter.com (assets/scripts/x.js).
// SEA = x.com/search results, FED = x.com/home feed. AI calls go through the native bridge ZenEng (keys never touch the page).
(function () {
  'use strict';
  if (window.top !== window || window.__ZENG) return;
  window.__ZENG = 1;

  // ---------------- settings (localStorage of x.com) ----------------
  var CK = 'zenEngCfg', RK = 'zenEngReplied';
  var DEF = { sea: false, fed: false, auto: false, like: false, likePct: 100, target: false, targetKw: '',
    tone: 'Positive', style: '', keyword: '', maxRun: 40, paceMin: 4, paceMax: 9,
    ageOn: false, ageMinMin: 0, ageMaxMin: 60, skipReplies: true };
  function loadCfg() { var c = {}; try { c = JSON.parse(localStorage.getItem(CK) || '{}') || {}; } catch (e) {} var o = {}; for (var k in DEF) o[k] = (k in c) ? c[k] : DEF[k]; return o; }
  var cfg = loadCfg();
  function saveCfg() { try { localStorage.setItem(CK, JSON.stringify(cfg)); } catch (e) {} }
  var replied = {}; try { replied = JSON.parse(localStorage.getItem(RK) || '{}') || {}; } catch (e) {}
  function markReplied(id, eng) {
    if (!id) return; replied[id] = { e: eng, t: Date.now() };
    var ks = Object.keys(replied); if (ks.length > 3000) { ks.sort(function (a, b) { return replied[a].t - replied[b].t; }); ks.slice(0, 500).forEach(function (k) { delete replied[k]; }); }
    try { localStorage.setItem(RK, JSON.stringify(replied)); } catch (e) {}
  }
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
  var AD = ['ad', 'ads', 'promoted', 'sponsored', 'anzeige', 'publicidad', 'promocionado', 'publicité', 'реклама', 'reklam', 'iklan', 'বিজ্ঞাপন', '広告', '광고', '推广', '廣告'];
  function isAd(a) {
    if (a.dataset && a.dataset.zengAd === '1') return true;
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
  var ownH = null;
  function ownHandle() {
    if (ownH) return ownH;
    var b = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    var m = b && /@([A-Za-z0-9_]{1,15})/.exec(b.textContent || ''); if (m) ownH = m[1].toLowerCase();
    if (!ownH) { var p = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]'); var h = p && /^\/([A-Za-z0-9_]+)$/.exec(p.getAttribute('href') || ''); if (h) ownH = h[1].toLowerCase(); }
    return ownH;
  }
  function isOwn(a) { var o = ownHandle(), au = author(a); return !!(o && au && o === au); }
  var REPLYING = /^\s*(replying to|en réponse à|en respuesta a|antwort an|em resposta a|in risposta a|в ответ|yanıt olarak|membalas|balasan untuk)\b/i;
  function isReply(a) {   // search results can be comments; SEA is for original posts
    try {
      var head = a.querySelector('[data-testid="User-Name"]'); if (!head) return false;
      var body = a.querySelector('[data-testid="tweetText"]');
      var ls = a.querySelectorAll('a[href^="/"]');
      for (var i = 0; i < ls.length; i++) {
        var l = ls[i]; if ((l.textContent || '').trim().charAt(0) !== '@') continue;
        if (head.contains(l)) continue;
        if (!(head.compareDocumentPosition(l) & 4)) continue;
        if (body && (body.contains(l) || !(l.compareDocumentPosition(body) & 4))) continue;
        var row = l.parentElement, txt = '';
        while (row && row !== a && txt.length < 3) { txt = (row.parentElement ? row.parentElement.textContent : '') || ''; if (REPLYING.test(txt)) return true; row = row.parentElement; if (row && row.contains(head)) break; }
      }
      var sc = a.querySelector('[data-testid="socialContext"]');
      return !!(sc && REPLYING.test(sc.textContent || ''));
    } catch (e) { return false; }
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
  var cur = null, curHide = null;
  function cursorEl() {
    if (cur && cur.isConnected) return cur;
    cur = document.createElement('div'); cur.id = 'zeng-cursor';
    cur.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;z-index:2147483647;pointer-events:none;opacity:0;' +
      'background:radial-gradient(circle,#fff 0 18%,rgba(167,139,250,.95) 20% 45%,rgba(109,40,217,.35) 48% 100%);box-shadow:0 0 14px 4px rgba(139,92,246,.75);' +
      'transition:transform .45s cubic-bezier(.22,.8,.3,1),opacity .25s';
    cur._x = window.innerWidth / 2; cur._y = window.innerHeight * 0.7; cur.style.transform = 'translate(' + cur._x + 'px,' + cur._y + 'px)';
    document.documentElement.appendChild(cur); return cur;
  }
  async function moveCursor(el) {
    try {
      var c = cursorEl(), r = el.getBoundingClientRect();
      var x = r.left + r.width / 2 + rnd(-3, 3), y = r.top + r.height / 2 + rnd(-3, 3);
      c.style.opacity = '1'; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; c._x = x; c._y = y;
      await sleep(480);
      c.style.transition = 'transform .08s, opacity .25s'; c.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(.7)'; await sleep(90);
      c.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(1)'; c.style.transition = 'transform .45s cubic-bezier(.22,.8,.3,1),opacity .25s';
      var rp = document.createElement('div');
      rp.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;border:2px solid #a78bfa;z-index:2147483647;pointer-events:none;transition:all .5s ease-out;opacity:.9';
      document.documentElement.appendChild(rp);
      setTimeout(function () { rp.style.width = '46px'; rp.style.height = '46px'; rp.style.margin = '-23px 0 0 -23px'; rp.style.opacity = '0'; }, 20);
      setTimeout(function () { rp.remove(); }, 600);
      clearTimeout(curHide); curHide = setTimeout(function () { if (cur) cur.style.opacity = '0'; }, 3500);
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
      var modal = document.querySelector('[aria-modal="true"][role="dialog"],[data-testid="sheetDialog"]');
      var w = modal && modal.querySelector('[data-testid="tweetTextarea_0"]');
      if (!w && a.parentElement) w = a.parentElement.querySelector('[data-testid="tweetTextarea_0"]');
      if (!w && /\/compose\//.test(location.pathname)) w = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!w) w = document.querySelector('[data-testid="tweetTextarea_0"]');
      var ed = editorOf(w); if (ed) { await sleep(300); return liveEditor() || ed; }
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
    await sleep(rnd(2000, 3000));
    try { b.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
    await tap(b);
    var t1 = Date.now();
    while (Date.now() - t1 < 6000) {
      await sleep(150);
      if (!ed.isConnected && !document.querySelector('[data-testid="tweetTextarea_0"]')) return true;
      var tt = document.querySelector('[data-testid="toast"]'); if (tt && /something went wrong/i.test(tt.textContent || '')) throw new Error('X: something went wrong');
    }
    return !ed.isConnected;
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
  async function waitClose(ed) { var t0 = Date.now(); while (ed && ed.isConnected && Date.now() - t0 < 60000) await sleep(150); }

  // ---------------- AI (native bridge) ----------------
  var cbs = {}, cbN = 0;
  window.__zenEngCb = function (id, json) { var f = cbs[id]; delete cbs[id]; if (f) { try { f(JSON.parse(json)); } catch (e) { f({ ok: false, error: 'bad_json' }); } } };
  var TONES = {
    'Positive': 'React positively to the post. Short, natural, believable.',
    'Sarcasm': 'Light dry sarcasm based on the post. Not rude, not forced.',
    'Love': 'Warm natural reaction to the post. Short and not cringe.',
    'Helpful': 'Give a quick useful response related to the post. No extra talk.',
    'Question': 'Ask one short natural question about the post.',
    'Very Short': '1-3 word raw reaction to the post only.',
    'Positive & Question': 'Positive reaction + one short natural question.',
    'Praise': 'Short genuine praise based on the post. Keep it real.',
    'Angry': 'Short frustrated reaction to the post. Controlled tone.',
    'Thank You': 'Simple natural thanks based on the post context.',
    'Negative / No': 'Short calm disagreement or refusal. No aggression.',
    'Disagree': 'Direct but calm pushback related to the post.',
    'GenZ': 'You are a sharp, emotionally aware Gen Z person. Work out what the post really is (joke, win, question, emotional) and reply like a real person texting. Very short, lowercase is fine, no cringe slang overload.'
  };
  function buildPrompt(post) {
    var p = 'Post:\n' + post + '\n\n' + (TONES[cfg.tone] || TONES.Positive) +
      ' Write ONE short reply in the same language as the post. No hashtags, no links, no emojis spam, no quotes around the reply. Reply text only.';
    if (cfg.style && cfg.style.trim()) p += ' Use this replying style: ' + cfg.style.trim();
    if (cfg.keyword && cfg.keyword.trim()) p += ' Include this keyword naturally: ' + cfg.keyword.trim();
    return p;
  }
  function gen(post) {
    return new Promise(function (resolve, reject) {
      if (!window.ZenEng) { reject(new Error('Bridge missing (update app)')); return; }
      var id = 'g' + (++cbN), done = false;
      var to = setTimeout(function () { if (!done) { done = true; delete cbs[id]; reject(new Error('AI timeout')); } }, 45000);
      cbs[id] = function (r) { if (done) return; done = true; clearTimeout(to); if (r && r.ok && r.text) resolve(r.text); else reject(new Error((r && r.error) || 'AI failed')); };
      try { window.ZenEng.gen(buildPrompt(post), id); } catch (e) { done = true; clearTimeout(to); reject(e); }
    });
  }
  function cleanReply(t) {
    t = String(t || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
    if (!t || /https?:\/\/|www\./i.test(t)) return '';
    return t.slice(0, 270);
  }

  // ---------------- per-post flow ----------------
  var busy = new WeakSet(), done = new WeakSet(), autoSkip = new WeakSet(), lastEditor = null;
  var autoRunning = false, runCount = 0, oldSeen = {};

  async function handleClick(a, btn, eng) {
    if (busy.has(a)) return false;
    var sid = statusId(a);
    if (sid && replied[sid]) { btn.remove(); return false; }
    var te = a.querySelector('[data-testid="tweetText"]');
    var post = te ? txt(te).trim() : '';
    if (!post) { toast('No text on this post', 'warn'); return false; }
    if (!navigator.onLine) { toast('No internet connection', 'error'); return false; }
    busy.add(a);
    var html = btn.innerHTML; btn.textContent = '...'; btn.disabled = true;
    try {
      if (cfg.like && !a.querySelector('[data-testid="unlike"]') && Math.random() * 100 < cfg.likePct) {
        var lk = a.querySelector('[data-testid="like"]'); if (lk) { await tap(lk); await sleep(rnd(700, 1600)); }
      }
      var ed = await openReplyBox(a); if (!ed) throw new Error('Reply box did not open');
      lastEditor = ed;
      var reply = cleanReply(await gen(post)); if (!reply) throw new Error('AI gave an unsafe/empty reply');
      if (!(await insertText(ed, reply))) throw new Error('Text did not land in the box');
      var posted = false;
      if (cfg.auto) posted = await postReply(liveEditor() || ed);
      btn.textContent = 'DONE'; btn.classList.add('zen-done'); btn.style.opacity = '.6';
      if (posted) markReplied(sid, eng);
      toast(posted ? 'Reply posted' : 'Reply drafted — review & tap Reply', 'success');
      return true;
    } catch (err) {
      if (err && err.off) { skipped[sid] = 1; markReplied(sid, 'off'); btn.remove(); await closeComposer(); toast('Comments off — skipped', 'warn'); }
      else { btn.innerHTML = html; btn.disabled = false; toast(String((err && err.message) || 'Reply failed'), 'error'); await closeComposer(); }
      return false;
    } finally { busy.delete(a); }
  }

  function injectButton(a, eng) {
    if (done.has(a) || isAd(a)) return;
    if (a.querySelector('.' + tag[eng])) { done.add(a); return; }
    var bar = a.querySelector('[role="group"]'); if (!bar) return;
    var te = a.querySelector('[data-testid="tweetText"]');
    if (isOwn(a)) { done.add(a); return; }
    if (eng === 'SEA') {
      if (cfg.skipReplies && isReply(a)) { done.add(a); return; }
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

  // ---------------- auto loop ----------------
  function postIds() { var s = {}; articles().forEach(function (a) { var i = statusId(a); if (i) s[i] = 1; }); return s; }
  async function scrollDown() {
    var total = window.innerHeight * 1.5, steps = 12, done_ = 0;
    for (var i = 1; i <= steps; i++) { var t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, d = total * e - done_; done_ = total * e; window.scrollBy({ top: d, behavior: 'instant' }); await sleep(60); }
  }
  async function waitMore(prev) {
    var t0 = Date.now();
    while (Date.now() - t0 < 15000) { var c = postIds(); for (var k in c) if (!prev[k]) return true; await sleep(400); }
    return false;
  }
  async function autoLoop(eng) {
    if (autoRunning) return; autoRunning = true; runCount = 0;
    var none = 0, cls = tag[eng];
    try {
      while (cfg.auto && curMode() === eng && runCount < cfg.maxRun) {
        var target = articles().filter(function (a) { var b = a.querySelector('.' + cls); return b && !b.disabled && !autoSkip.has(a) && !busy.has(a); })[0];
        if (!target) {
          none++;
          if (eng === 'SEA' && cfg.ageOn && Object.keys(oldSeen).length >= 4) { toast('Reached posts older than the age limit — stopped', 'success'); break; }
          if (none > 6) { toast('No more posts — auto stopped', 'success'); break; }
          var prev = postIds(); await scrollDown(); await waitMore(prev); await sleep(1200); continue;
        }
        none = 0;
        var btn = target.querySelector('.' + cls);
        await ensureVisible(target);
        var ok = await handleClick(target, btn, eng);
        runCount++;
        if (!ok && !btn.classList.contains('zen-done')) { autoSkip.add(target); var s = statusId(target); if (s) skipped[s] = 1; await closeComposer(); await sleep(1200); continue; }
        await waitClose(lastEditor);
        await sleep(rnd(cfg.paceMin, Math.max(cfg.paceMin, cfg.paceMax)) * 1000);
      }
    } catch (e) { toast(String(e && e.message || e), 'error'); }
    finally {
      autoRunning = false;
      if (runCount >= cfg.maxRun && cfg.auto) toast('Max per run reached — auto stopped', 'success');
      if (cfg.auto && (runCount >= cfg.maxRun || none > 6 || Object.keys(oldSeen).length >= 4)) { cfg.auto = false; saveCfg(); renderPanel(); }
    }
  }

  // ---------------- scan timer ----------------
  var lastMode = null;
  function teardown() {
    done = new WeakSet(); autoSkip = new WeakSet(); oldSeen = {};
    $$('.zen-eng-btn').forEach(function (b) { b.remove(); });
  }
  function scan() {
    var m = curMode();
    if (m !== lastMode) { teardown(); lastMode = m; if (m) toast(m + ' engine ON — buttons appear on posts', 'success'); }
    if (!m) return;
    if (!ownHandle()) { /* keep going: own-post check just stays off until the handle is known */ }
    articles().forEach(function (a) { injectButton(a, m); });
    if (cfg.auto && !autoRunning) autoLoop(m);
  }

  // ---------------- control panel ----------------
  function renderPanel() {
    var p = document.getElementById('zeng-panel'); if (!p) return;
    var row = function (label, html) { return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0"><span>' + label + '</span>' + html + '</div>'; };
    var chk = function (k) { return '<input type="checkbox" data-k="' + k + '"' + (cfg[k] ? ' checked' : '') + ' style="width:20px;height:20px">'; };
    var inp = function (k, w, type) { return '<input data-k="' + k + '" type="' + (type || 'text') + '" value="' + String(cfg[k]).replace(/"/g, '&quot;') + '" style="width:' + w + 'px;background:#111;color:#fff;border:1px solid #444;border-radius:8px;padding:6px;font-size:13px">'; };
    var tones = Object.keys(TONES).map(function (t) { return '<option' + (t === cfg.tone ? ' selected' : '') + '>' + t + '</option>'; }).join('');
    p.innerHTML = '<div style="font-weight:800;letter-spacing:2px;margin-bottom:6px">ZEN ENGINE</div>' +
      row('SEA (search page)', chk('sea')) + row('FED (home feed)', chk('fed')) + row('<b>AUTO MODE</b>', chk('auto')) +
      row('Like first', chk('like')) + row('Like %', inp('likePct', 60, 'number')) +
      row('Tone', '<select data-k="tone" style="background:#111;color:#fff;border:1px solid #444;border-radius:8px;padding:6px">' + tones + '</select>') +
      row('Style', inp('style', 150)) + row('Keyword', inp('keyword', 150)) +
      row('FED target filter', chk('target')) + row('Target words (a,b,c)', inp('targetKw', 130)) +
      row('SEA skip comments', chk('skipReplies')) + row('SEA age limit', chk('ageOn')) +
      row('Age min / max (min)', inp('ageMinMin', 48, 'number') + inp('ageMaxMin', 48, 'number')) +
      row('Max per run', inp('maxRun', 60, 'number')) + row('Pause min / max (s)', inp('paceMin', 48, 'number') + inp('paceMax', 48, 'number')) +
      '<div style="font-size:11px;color:#999;margin-top:6px">SEA works on x.com/search, FED on x.com/home. API keys: Menu → Engine API keys.</div>';
    $$('[data-k]', p).forEach(function (el) {
      el.onchange = function () {
        var k = el.getAttribute('data-k'), v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        if (el.type === 'number' && !isFinite(v)) return; cfg[k] = v; saveCfg();
        if (k === 'sea' || k === 'fed' || k === 'auto' || k === 'ageOn') { lastMode = '#'; }
        scan();
      };
    });
  }
  function buildPanel() {
    if (document.getElementById('zeng-fab') || !document.body) return;
    var fab = document.createElement('div'); fab.id = 'zeng-fab'; fab.textContent = 'Z';
    fab.style.cssText = 'position:fixed;left:10px;bottom:70px;width:40px;height:40px;border-radius:20px;background:#6d28d9;color:#fff;font:800 16px sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483646;opacity:.85';
    var p = document.createElement('div'); p.id = 'zeng-panel';
    p.style.cssText = 'position:fixed;left:8px;bottom:118px;width:min(330px,92vw);max-height:60vh;overflow:auto;background:#0d0a14;color:#fff;border:1px solid #6d28d9;border-radius:14px;padding:12px;font:13px sans-serif;z-index:2147483646;display:none';
    fab.addEventListener('click', function () { p.style.display = p.style.display === 'none' ? 'block' : 'none'; if (p.style.display === 'block') renderPanel(); });
    document.body.appendChild(p); document.body.appendChild(fab);
  }

  function boot() { buildPanel(); setInterval(function () { try { buildPanel(); scan(); } catch (e) {} }, 1200); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
