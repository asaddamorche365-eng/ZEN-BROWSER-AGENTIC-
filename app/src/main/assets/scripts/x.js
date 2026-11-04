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
    ageOn: false, ageMinMin: 0, ageMaxMin: 60, myHandle: '' };
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
      setStat('Opening reply');
      if (cfg.like && !a.querySelector('[data-testid="unlike"]') && Math.random() * 100 < cfg.likePct) {
        var lk = a.querySelector('[data-testid="like"]'); if (lk) { await tap(lk); await sleep(rnd(700, 1600)); }
      }
      var ed = await openReplyBox(a); if (!ed) throw new Error('Reply box did not open');
      lastEditor = ed;
      setStat('Generating reply');
      var reply = cleanReply(await gen(post)); if (!reply) throw new Error('AI gave an unsafe/empty reply');
      if (!(await insertText(ed, reply))) throw new Error('Text did not land in the box');
      ourTexts[normT(reply)] = 1;
      var posted = false;
      if (cfg.auto) { setStat('Posting'); posted = await postReply(liveEditor() || ed); }
      btn.textContent = 'DONE'; btn.classList.add('zen-done'); btn.style.opacity = '.6';
      if (posted) { markReplied(sid, eng); stat.done++; }
      toast(posted ? 'Reply posted' : 'Reply drafted — review & tap Reply', 'success');
      return true;
    } catch (err) {
      if (err && err.off) { skipped[sid] = 1; markReplied(sid, 'off'); btn.remove(); await closeComposer(); toast('Comments off — skipped', 'warn'); }
      else { btn.innerHTML = html; btn.disabled = false; toast(String((err && err.message) || 'Reply failed'), 'error'); await closeComposer(); }
      return false;
    } finally { busy.delete(a); }
  }

  function injectButton(a, eng) {
    if (done.has(a)) return;
    if (isAd(a)) { done.add(a); noteSkip(a); return; }
    if (a.querySelector('.' + tag[eng])) { done.add(a); return; }
    var bar = a.querySelector('[role="group"]'); if (!bar) return;
    var te = a.querySelector('[data-testid="tweetText"]');
    if (isOwn(a) || (te && ourTexts[normT(txt(te))])) { done.add(a); noteSkip(a); return; }   // own posts: always skipped
    if (isReply(a)) { done.add(a); noteSkip(a); return; }                                      // comments: always skipped
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
  // run state survives a page reload (sessionStorage), so "Replied x / max" keeps counting across feed refreshes
  function readRun() { try { var r = JSON.parse(sessionStorage.getItem('zenEngRun') || 'null'); if (r && Date.now() - r.t < 600000) return r; } catch (e) {} return null; }
  function writeRun(extra) { try { var r = readRun() || { done: 0, skip: 0, empty: 0 }; r.done = stat.done; r.skip = stat.skip; r.t = Date.now(); if (extra) for (var k in extra) r[k] = extra[k]; sessionStorage.setItem('zenEngRun', JSON.stringify(r)); } catch (e) {} }
  function clearRun() { try { sessionStorage.removeItem('zenEngRun'); } catch (e) {} }

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
      while (cfg.auto && curMode() === eng && runCount < cfg.maxRun) {
        var target = articles().filter(function (a) { var b = a.querySelector('.' + cls); return b && !b.disabled && !autoSkip.has(a) && !busy.has(a); })[0];
        if (!target) {
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
          setStat('Scrolling for new posts'); var prev = postIds(); await scrollDown(); await waitMore(prev); await sleep(1200); continue;
        }
        none = 0;
        var btn = target.querySelector('.' + cls);
        await ensureVisible(target);
        var ok = await handleClick(target, btn, eng);
        runCount++;
        if (ok) { emptyReloads = 0; writeRun({ empty: 0 }); }
        if (!ok && !btn.classList.contains('zen-done')) { autoSkip.add(target); var s2 = statusId(target); if (s2) skipped[s2] = 1; await closeComposer(); await sleep(1200); continue; }
        await waitClose(lastEditor);
        var pw = rnd(cfg.paceMin, Math.max(cfg.paceMin, cfg.paceMax)); setStat('Waiting ' + Math.round(pw) + 's'); await sleep(pw * 1000);
      }
      if (!stopMsg && runCount >= cfg.maxRun && cfg.auto) stopMsg = 'Max per run reached';
    } catch (e) { toast(String(e && e.message || e), 'error'); }
    finally {
      autoRunning = false;
      if (!reloading) {
        setStat(cfg.auto ? 'Stopped' : 'Idle');
        if (stopMsg) { toast(stopMsg + ' - auto stopped', 'success'); setStat(stopMsg); }
        if (cfg.auto && (stopMsg || runCount >= cfg.maxRun)) patchCfg({ auto: false });
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
      '<div style="font-size:12px;color:#9ca3af;margin-bottom:10px">Replied ' + stat.done + ' / ' + cfg.maxRun + ' · Skipped ' + stat.skip + '</div>' +
      '<div data-act="auto" style="text-align:center;padding:12px 0;border-radius:12px;font-weight:800;background:' + (cfg.auto ? '#b91c1c' : '#6d28d9') + ';margin-bottom:8px">' + (cfg.auto ? 'STOP' : 'START') + '</div>' +
      '<div data-act="settings" style="text-align:center;padding:8px 0;border-radius:10px;font-size:12px;border:1px solid #3a3260;color:#c4b5fd">Settings</div>';
  }
  function onPanelTap(e) {
    var t = e.target.closest ? e.target.closest('[data-act]') : null; if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'sea' || act === 'fed') { var p = {}; p[act] = !cfg[act]; patchCfg(p); lastMode = '#'; scan(); }
    else if (act === 'auto') {
      if (cfg.auto) { patchCfg({ auto: false }); setStat('Stopping'); }
      else if (!(cfg.sea || cfg.fed)) toast('Turn on SEA or FED first', 'warn');
      else if (!curMode()) toast('Open x.com/search (SEA) or x.com/home (FED)', 'warn');
      else { clearRun(); stat.done = 0; stat.skip = 0; patchCfg({ auto: true }); scan(); }
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

  function boot() {
    buildPanel();
    setInterval(function () { try { buildPanel(); scan(); renderPanel(); placeUi(); } catch (e) {} }, 1000);
    try { if (window.visualViewport) { window.visualViewport.addEventListener('resize', placeUi); window.visualViewport.addEventListener('scroll', placeUi); } } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
