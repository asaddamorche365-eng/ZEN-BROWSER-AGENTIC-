/* Z EX — animated pixel cursor skins
   5 built-in chibi skins, each animated per agent state, with a pixel-font
   speech bubble ("SCROLLING...", "GOT THE POST!" ...).
   Pure canvas, no assets. Used by content.js (real cursor) and popup.js (picker).
   API: ZexCursorFX.create(canvas, {skin, u, bubble, arrow}) -> renderer
        renderer.setSkin(id) .setState(key, force) .setScale(u) .setFlip(bool)
        renderer.start() .stop() .width .height
        ZexCursorFX.SKINS · .STATE_KEYS · .STATES */
(function (root) {
  'use strict';

  var GW = 18, GH = 18, OX = 1, OY = 2;   // sprite grid + content offset (room for outline / ahoge)
  var INK = '#1d1530', SKIN = '#ffd9c4', SKIN_D = '#e8a99a', BLUSH = '#ff9db0';
  var MOUTH = '#8a2f4a', TONGUE = '#ff8fa3', PUPIL = '#14102a', WHITE = '#ffffff', GOLD = '#facc15';
  var MIN_MS = 500;      // each state stays visible at least this long (no flicker)
  var TYPE_MS = 42;      // typewriter speed per char
  var HOLD_MS = 1300;    // pause before the next line of a multi-line state

  /* ── 5x7 pixel font ─────────────────────────────────────────── */
  var FONT_SRC = {
    A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
    C: '01110/10001/10000/10000/10000/10001/01110', D: '11110/10001/10001/10001/10001/10001/11110',
    E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
    G: '01110/10001/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
    I: '01110/00100/00100/00100/00100/00100/01110', J: '00111/00010/00010/00010/00010/10010/01100',
    K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
    M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
    O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
    Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
    S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
    U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
    W: '10001/10001/10001/10101/10101/11011/10001', X: '10001/10001/01010/00100/01010/10001/10001',
    Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
    '0': '01110/10011/10101/10101/11001/10001/01110', '1': '00100/01100/00100/00100/00100/00100/01110',
    '2': '01110/10001/00001/00110/01000/10000/11111', '3': '11110/00001/00001/01110/00001/00001/11110',
    '.': '00000/00000/00000/00000/00000/01100/01100', '!': '00100/00100/00100/00100/00100/00000/00100',
    '?': '01110/10001/00001/00110/00100/00000/00100', "'": '00100/00100/01000/00000/00000/00000/00000',
    '-': '00000/00000/00000/11111/00000/00000/00000', ':': '00000/01100/01100/00000/01100/01100/00000',
    ' ': '00000/00000/00000/00000/00000/00000/00000'
  };
  var FONT = {};
  Object.keys(FONT_SRC).forEach(function (k) { FONT[k] = FONT_SRC[k].split('/'); });

  /* ── Skins ──────────────────────────────────────────────────── */
  var SKINS = [
    { id: 'navy', name: 'Navy', hair: '#2b3a8c', hairL: '#4a5cc0', eye: '#3aa0f0', eyeL: '#9bd6ff',
      outfit: '#f3f1fb', outfitD: '#c9c4e8', accent: '#9a94d6', long: true, acc: 'choker' },
    { id: 'teal', name: 'Teal', hair: '#2fc4b8', hairL: '#8ff0e6', eye: '#1e9fb4', eyeL: '#9ff2f7',
      outfit: '#4a5a66', outfitD: '#33414b', accent: '#ff5fa2', tails: true, acc: 'ties' },
    { id: 'gold', name: 'Gold', hair: '#f4d26a', hairL: '#fff3b0', eye: '#3a78d0', eyeL: '#a6cbff',
      outfit: '#2e4f9e', outfitD: '#203a78', accent: '#e8c14a', acc: 'ahoge' },
    { id: 'crim', name: 'Crimson', hair: '#2a2233', hairL: '#51426a', eye: '#ec4a86', eyeL: '#ffa8c8',
      outfit: '#3b2a45', outfitD: '#281c30', accent: '#e0353f', long: true, acc: 'pin' },
    { id: 'beat', name: 'Beats', hair: '#f59ac8', hairL: '#ffc9e4', eye: '#b3205a', eyeL: '#ff8fb5',
      outfit: '#8fd6ea', outfitD: '#63b3cb', accent: '#ff7eb6', long: true, acc: 'phones' }
  ];
  var SKIN_BY_ID = {};
  SKINS.forEach(function (s) { SKIN_BY_ID[s.id] = s; });

  /* ── Agent states → expression + prop + bubble text ─────────── */
  var STATES = {
    rest:    { lines: ['RESTING...'],                              eyes: 'closed', mouth: 'flat',  prop: 'zz',     bob: 900 },
    search:  { lines: ['SEARCHING...'],                            eyes: 'look',   mouth: 'flat',  prop: 'lens',   bob: 0 },
    scroll:  { lines: ['SCROLLING...'],                            eyes: 'updown', mouth: 'flat',  prop: 'chev',   bob: 220 },
    found:   { lines: ['GOT THE POST!'],                           eyes: 'wide',   mouth: 'open',  prop: 'bang',   bob: 160 },
    like:    { lines: ['CLICKING LIKE', 'LIKING THE POST...'],     eyes: 'happy',  mouth: 'smile', prop: 'heart',  bob: 300 },
    comment: { lines: ["LET'S OPEN THE COMMENT BOX", 'OPENING COMMENT...'], eyes: 'open', mouth: 'smile', prop: 'bubble', bob: 0 },
    type:    { lines: ['ZEX TYPING...'],                           eyes: 'down',   mouth: 'flap',  prop: 'dots',   bob: 180 },
    typed:   { lines: ['TYPING END'],                              eyes: 'happy',  mouth: 'smile', prop: 'check',  bob: 0 },
    reply:   { lines: ["LET'S REPLY", 'REPLY FOR YOU'],            eyes: 'open',   mouth: 'smile', prop: 'send',   bob: 260 },
    read:    { lines: ['AI READING...'],                          eyes: 'look',   mouth: 'flat',  prop: 'lens',   bob: 0 },
    done:    { lines: ['DONE!'],                                   eyes: 'happy',  mouth: 'open',  prop: 'stars',  bob: 200 }
  };
  var STATE_KEYS = ['scroll', 'search', 'found', 'like', 'comment', 'type', 'typed', 'reply', 'read', 'done', 'rest'];

  var PROPS = {
    heart:  ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'],
    lens:   ['01110000', '10001000', '10001000', '10001000', '01111000', '00000110', '00000011'],
    chev:   ['10001', '01010', '00100'],
    bang:   ['11', '11', '11', '11', '00', '11'],
    bubble: ['011111110', '111111111', '111111111', '111111111', '011111110', '000110000', '000100000'],
    check:  ['0000001', '0000011', '1000110', '1101100', '0111000', '0010000'],
    send:   ['00010000', '00011000', '11111100', '11111110', '11111100', '00011000', '00010000'],
    spark:  ['00100', '00100', '11111', '00100', '00100'],
    zz:     ['1111', '0010', '0100', '1111']
  };
  var ARROW = [
    '1..........', '11.........', '121........', '1221.......', '12221......', '122221.....',
    '1222221....', '12222221...', '122222221..', '1222211111.', '121221.....', '11.1221....',
    '1..1221....', '....1221...', '....1111...'
  ];

  /* ── Base sprite (hair / face / body / accessories) cached per skin ── */
  var baseCache = {};
  function buildBase(sk) {
    var g = new Array(GW * GH), x, y;
    function set(cx, cy, c) {
      var gx = cx + OX, gy = cy + OY;
      if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) g[gy * GW + gx] = c;
    }
    // hair dome
    for (y = 0; y <= 8; y++) for (x = 0; x < 16; x++) {
      var dx = (x - 7.5) / 7.2, dy = (y - 6.3) / 6.4;
      if (dx * dx + dy * dy <= 1) set(x, y, sk.hair);
    }
    // side locks / tails
    var lowest = sk.long ? 15 : 10;
    for (y = 6; y <= lowest; y++) { set(1, y, sk.hair); set(2, y, sk.hair); set(13, y, sk.hair); set(14, y, sk.hair); }
    if (sk.tails) for (y = 6; y <= 15; y++) { set(0, y, sk.hair); set(1, y, sk.hair); set(14, y, sk.hair); set(15, y, sk.hair); }
    // face
    for (y = 5; y <= 12; y++) for (x = 3; x <= 12; x++) {
      if (y === 12 && (x === 3 || x === 12)) continue;
      set(x, y, SKIN);
    }
    // bangs
    for (x = 3; x <= 12; x++) if (x !== 7 && x !== 8) set(x, 5, sk.hair);
    [3, 4, 5, 6, 10, 11, 12].forEach(function (bx) { set(bx, 6, sk.hair); });
    set(3, 7, sk.hair); set(12, 7, sk.hair);
    // highlights
    [[5, 1], [6, 1], [4, 2], [5, 2], [10, 2], [4, 6]].forEach(function (p) { set(p[0], p[1], sk.hairL); });
    // neck + body
    set(7, 13, SKIN_D); set(8, 13, SKIN_D);
    for (x = 4; x <= 11; x++) set(x, 14, sk.outfit);
    for (x = sk.long ? 3 : 2; x <= (sk.long ? 12 : 13); x++) set(x, 15, sk.outfit);
    set(3, 15, sk.outfitD); set(12, 15, sk.outfitD); set(4, 14, sk.outfitD); set(11, 14, sk.outfitD);
    set(7, 14, sk.accent); set(8, 14, sk.accent);
    // accessories
    if (sk.acc === 'choker') for (x = 6; x <= 9; x++) set(x, 13, sk.accent);
    if (sk.acc === 'ties') [0, 1, 14, 15].forEach(function (tx) { set(tx, 6, sk.accent); set(tx, 7, sk.accent); });
    if (sk.acc === 'ahoge') { set(7, -1, sk.hair); set(8, -1, sk.hair); set(8, 0, sk.hair); }
    if (sk.acc === 'pin') { set(11, 2, sk.accent); set(12, 3, sk.accent); set(12, 2, WHITE); set(11, 3, sk.accent); }
    if (sk.acc === 'phones') {
      var band = '#fff3e6';
      [[3, 3], [4, 2], [5, 1], [6, 0], [7, -1], [8, -1], [9, 0], [10, 1], [11, 2], [12, 3]].forEach(function (p) { set(p[0], p[1], band); });
      for (y = 7; y <= 10; y++) { set(1, y, band); set(2, y, band); set(13, y, band); set(14, y, band); }
      set(1, 8, sk.accent); set(1, 9, sk.accent); set(14, 8, sk.accent); set(14, 9, sk.accent);
    }
    // outline pass
    var out = g.slice(), i, n;
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      i = y * GW + x;
      if (g[i]) continue;
      n = (x > 0 && g[i - 1]) || (x < GW - 1 && g[i + 1]) || (y > 0 && g[i - GW]) || (y < GH - 1 && g[i + GW]);
      if (n) out[i] = INK;
    }
    return out;
  }
  function getBase(sk) { return baseCache[sk.id] || (baseCache[sk.id] = buildBase(sk)); }

  /* ── Renderer ───────────────────────────────────────────────── */
  function Renderer(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = { bubble: opts.bubble !== false, arrow: opts.arrow !== false };
    this.sk = SKIN_BY_ID[opts.skin] || SKINS[0];
    this.flipped = false;
    this.st = { key: 'rest', t0: 0, line: 0, lineT0: 0 };
    this.pending = null;
    this.timer = null;
    this.setScale(opts.u || 2);
  }
  var P = Renderer.prototype;

  P.setScale = function (u) {
    this.u = Math.max(1, Math.min(4, Math.round(u)));
    this.ts = 2;                                        // text cell = 2px, always crisp + readable on phones
    this.au = Math.max(1, Math.round(this.u / 2));      // arrow scale
    this.hx = this.opts.arrow ? 8 * this.au : 1;        // head left
    this.hy = this.opts.arrow ? 6 * this.au : 1;        // head top
    var headW = GW * this.u, headH = GH * this.u, ts = this.ts;
    var maxChars = 15;
    this.bubW = maxChars * 6 * ts - ts + 6 * ts + 2 * ts;    // text + padX*2 + border*2
    this.bubH = 2 * 8 * ts - ts + 4 * ts + 2 * ts;           // up to 2 lines
    this._lastSig = null;                               // canvas gets cleared by the resize → redraw
    this.W = this.hx + headW + 2 + (this.opts.bubble ? 4 + this.bubW : 0);
    this.H = Math.max(this.hy + headH + 1, this.opts.bubble ? this.bubH + 2 : 0);
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.width = this.W; this.height = this.H;
    if (this.canvas.style) { this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px'; }
  };
  P.setSkin = function (id) { this.sk = SKIN_BY_ID[id] || this.sk; this._lastSig = null; };
  P.setFlip = function (f) { f = !!f; if (f !== this.flipped) this._lastSig = null; this.flipped = f; };
  P.setState = function (key, force) {
    if (!STATES[key]) return;
    var now = nowMs();
    if (force || this.st.t0 === 0) { this._apply(key, now); return; }
    if (key === this.st.key) { this.pending = null; return; }
    this.pending = key;
  };
  // ---- added for ZEN BROWSER: free text bubble (Autopilot / engines talk to the user) ----
  P.say = function (text, base) {
    var s = String(text || '').toUpperCase().replace(/[^A-Z0-9.!?'\-: ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (!s) return;
    if (this._sayText === s && this.st && this.st.key === '_say') return;   // same words: do not restart the typewriter
    var b = STATES[base] || STATES.read;
    STATES._say = { lines: [s], eyes: b.eyes, mouth: b.mouth, prop: b.prop, bob: b.bob };
    this._sayText = s;
    this._apply('_say', nowMs());
  };
  P._apply = function (key, now) {
    this.st = { key: key, t0: now, line: 0, lineT0: now };
    this.pending = null;
  };
  P.start = function () {
    var self = this;
    if (this.timer) return;
    this._lastSig = null; this._lastDraw = 0;
    this._paint(nowMs());
    // Low-power: 10 Hz tick that only repaints when the picture really changed (blink / bob / typing step …),
    // plus a 600 ms safety repaint. Nothing runs while the tab is hidden. Idle cursor = almost no GPU/CPU work.
    this.timer = setInterval(function () { if (!document.hidden) self._paint(nowMs()); }, 100);
  };
  P._paint = function (now) {
    var g = this._sig(now);
    if (g === this._lastSig && now - this._lastDraw < 600) return;
    this._lastSig = g; this._lastDraw = now;
    this.draw(now);
  };
  // Everything draw() derives from the clock, as one string: same string → same picture → skip the repaint.
  P._sig = function (now) {
    var st = this.st, cfg = STATES[st.key], el = now - st.t0;
    if (this.pending && el >= MIN_MS) return 'P' + now;                    // a state switch is due → draw() applies it
    var s = st.key + '|' + st.line + '|' + (cfg.bob ? Math.floor(now / cfg.bob) % 2 : 0) + '|' + (Math.floor(now / 500) % 2) + '|' + ((now % 3200) < 140 ? 1 : 0);
    if (cfg.eyes === 'look') s += 'l' + (Math.floor(now / 380) % 4);
    else if (cfg.eyes === 'updown') s += 'u' + (Math.floor(now / 260) % 2);
    if (cfg.mouth === 'flap') s += 'm' + (Math.floor(now / 170) % 2);
    var k = cfg.prop, p, a;
    function zz(q) { return q > 0.9 ? -1 : Math.floor(q * 7); }
    if (k === 'heart') { p = (el % 1400) / 1400; s += 'h' + (p > 0.85 ? -1 : Math.floor(p * 5)); }
    else if (k === 'zz') { p = (el % 2400) / 2400; s += 'z' + zz(p) + ',' + zz((p + 0.5) % 1); }
    else if (k === 'lens') s += 'o' + Math.round(Math.sin(el / 350) * 2);
    else if (k === 'chev') s += 'c' + (Math.floor(el / 100) % 10);
    else if (k === 'bang') s += 'b' + (el < 80 ? -1 : Math.floor(el / 120) % 2);
    else if (k === 'bubble') s += 'u' + (Math.floor(el / 250) % 3);
    else if (k === 'dots') s += 'd' + (Math.floor(el / 200) % 3);
    else if (k === 'check') s += 'k' + (el < 120 ? 0 : 1);
    else if (k === 'send') s += 's' + Math.floor(((el % 900) / 900) * 6);
    else if (k === 'stars') s += 't' + (Math.floor(el / 250) % 2);
    if (this.opts.bubble) {
      var text = cfg.lines[Math.min(st.line, cfg.lines.length - 1)], dots = /\.\.\.$/.test(text), core = dots ? text.slice(0, -3) : text;
      var elL = now - st.lineT0, typed = Math.floor(elL / TYPE_MS);
      var shown = typed < core.length ? typed : (dots ? core.length + 1 + (Math.floor((elL - core.length * TYPE_MS) / 350) % 3) : core.length);
      s += '|t' + shown;
      if (typed < core.length) s += 'c' + (Math.floor(now / 200) % 2);     // blinking block cursor while typing
      if (st.line < cfg.lines.length - 1 && elL > text.length * TYPE_MS + HOLD_MS) s += 'A' + now;   // next line is due
    }
    return s;
  };
  P.stop = function () { if (this.timer) { clearInterval(this.timer); this.timer = null; } };

  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  P._r = function (x, y, w, h, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(this.flipped ? this.W - x - w : x, y, w, h);
  };
  P._bmp = function (rows, x, y, cell, color, outline) {
    var r, c, row, o;
    if (outline) {
      for (o = 0; o < 4; o++) {
        var ox = o === 0 ? -cell : o === 1 ? cell : 0, oy = o === 2 ? -cell : o === 3 ? cell : 0;
        for (r = 0; r < rows.length; r++) { row = rows[r];
          for (c = 0; c < row.length; c++) if (row.charAt(c) === '1') this._r(x + c * cell + ox, y + r * cell + oy, cell, cell, INK); }
      }
    }
    for (r = 0; r < rows.length; r++) { row = rows[r];
      for (c = 0; c < row.length; c++) if (row.charAt(c) === '1') this._r(x + c * cell, y + r * cell, cell, cell, color); }
  };
  // text: box anchored by its FULL width so the typewriter never shifts; glyphs are never mirrored
  P._text = function (str, x, y, fullW, color) {
    var ts = this.ts, left = this.flipped ? this.W - x - fullW : x, i, r, c, g, ch;
    this.ctx.fillStyle = color;
    for (i = 0; i < str.length; i++) {
      g = FONT[str.charAt(i)] || FONT[' '];
      for (r = 0; r < 7; r++) for (c = 0; c < 5; c++) {
        if (g[r].charAt(c) === '1') this.ctx.fillRect(left + (i * 6 + c) * ts, y + r * ts, ts, ts);
      }
    }
  };

  function wrap(text) {           // max 15 chars per line, 2 lines
    if (text.length <= 15) return [text];
    var words = text.split(' '), lines = [''], i;
    for (i = 0; i < words.length; i++) {
      var cur = lines[lines.length - 1];
      if ((cur + ' ' + words[i]).trim().length <= 15) lines[lines.length - 1] = (cur + ' ' + words[i]).trim();
      else lines.push(words[i]);
    }
    return lines;
  }

  P.draw = function (now) {
    var ctx = this.ctx, u = this.u, ts = this.ts, sk = this.sk, hx = this.hx, hy = this.hy;
    if (this.pending && now - this.st.t0 >= MIN_MS) this._apply(this.pending, now);
    var st = this.st, cfg = STATES[st.key], el = now - st.t0, i, x, y;
    ctx.clearRect(0, 0, this.W, this.H);

    // pointer arrow (hot-spot = top-left, or top-right when flipped)
    if (this.opts.arrow) {
      var au = this.au, row;
      for (y = 0; y < ARROW.length; y++) { row = ARROW[y];
        for (x = 0; x < row.length; x++) { var ch = row.charAt(x);
          if (ch !== '.') this._r(x * au, y * au, au, au, ch === '1' ? INK : WHITE); } }
    }

    // ── head ──
    var bob = cfg.bob ? (Math.floor(now / cfg.bob) % 2) : 0;
    var base = getBase(sk), c;
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      c = base[y * GW + x];
      if (c) this._r(hx + x * u, hy + (y + bob) * u, u, u, c);
    }
    var cell = function (self, cx, cy, col) { self._r(hx + (cx + OX) * u, hy + (cy + OY + bob) * u, u, u, col); };
    if (sk.acc === 'ahoge') cell(this, (Math.floor(now / 500) % 2) ? 9 : 8, -2, sk.hair);

    // eyes
    var mode = cfg.eyes, gx = 1;
    if (mode === 'look') { gx = [0, 1, 2, 1][Math.floor(now / 380) % 4]; mode = 'open'; }
    if (mode === 'updown') mode = (Math.floor(now / 260) % 2) ? 'open' : 'down';
    if ((mode === 'open') && (now % 3200) < 140) mode = 'closed';
    var ex, e0 = [4, 9];
    for (i = 0; i < 2; i++) {
      ex = e0[i];
      if (mode === 'open' || mode === 'wide') {
        var tall = mode === 'wide';
        for (x = 0; x < 3; x++) { cell(this, ex + x, 7, INK); cell(this, ex + x, 8, sk.eye); cell(this, ex + x, 9, sk.eyeL); if (tall) cell(this, ex + x, 10, sk.eyeL); }
        cell(this, ex + gx, 8, PUPIL);
        cell(this, ex + (gx === 0 ? 2 : 0), tall ? 9 : 8, WHITE);
        if (tall) cell(this, ex + (gx === 2 ? 0 : 2), 10, WHITE);
      } else if (mode === 'down') {
        for (x = 0; x < 3; x++) { cell(this, ex + x, 8, INK); cell(this, ex + x, 9, sk.eye); }
        cell(this, ex + 1, 9, PUPIL);
      } else if (mode === 'happy') {
        cell(this, ex, 8, INK); cell(this, ex + 1, 7, INK); cell(this, ex + 2, 8, INK);
      } else {
        for (x = 0; x < 3; x++) cell(this, ex + x, 8, INK);
      }
    }
    // blush
    cell(this, 3, 10, BLUSH); cell(this, 12, 10, BLUSH); cell(this, 4, 11, BLUSH); cell(this, 11, 11, BLUSH);
    // mouth
    var m = cfg.mouth;
    if (m === 'flap') m = (Math.floor(now / 170) % 2) ? 'open' : 'flat';
    if (m === 'flat') { cell(this, 7, 12, MOUTH); cell(this, 8, 12, MOUTH); }
    else if (m === 'smile') { cell(this, 6, 11, MOUTH); cell(this, 7, 12, MOUTH); cell(this, 8, 12, MOUTH); cell(this, 9, 11, MOUTH); }
    else { cell(this, 7, 11, MOUTH); cell(this, 8, 11, MOUTH); cell(this, 7, 12, TONGUE); cell(this, 8, 12, TONGUE); }

    // ── prop (top-right of head) ──
    this._prop(cfg.prop, el, now);

    // ── bubble ──
    if (this.opts.bubble) this._bubble(st, cfg, now);
  };

  P._prop = function (key, el, now) {
    var u = this.u, pu = Math.max(1, Math.round(u * 0.75)), hx = this.hx, hy = this.hy, rows, w, ax, ay, p, k;
    var right = hx + GW * u;
    function pos(rs) { return right - rs[0].length * pu; }
    if (key === 'heart') {
      rows = PROPS.heart; p = (el % 1400) / 1400; if (p > 0.85) return;
      this._bmp(rows, pos(rows), hy + 5 * pu - Math.floor(p * 5) * pu, pu, '#ff5c8a', true);
    } else if (key === 'zz') {
      rows = PROPS.zz; p = (el % 2400) / 2400;
      for (k = 0; k < 2; k++) { var pp = (p + k * 0.5) % 1; if (pp > 0.9) continue;
        this._bmp(rows, pos(rows) - k * 3 * pu, hy + 7 * pu - Math.floor(pp * 7) * pu, pu, '#b9c2ff', true); }
    } else if (key === 'lens') {
      rows = PROPS.lens; ax = pos(rows) - 2 * pu + Math.round(Math.sin(el / 350) * 2) * pu;
      this._bmp(rows, ax, hy + pu, pu, GOLD, true);
    } else if (key === 'chev') {
      rows = PROPS.chev;
      for (k = 0; k < 2; k++) this._bmp(rows, pos(rows), hy + ((Math.floor(el / 100) + k * 5) % 10) * pu, pu, '#7dd3fc', true);
    } else if (key === 'bang') {
      if (el < 80) return; rows = PROPS.bang;
      this._bmp(rows, pos(rows) - pu, hy + pu - (Math.floor(el / 120) % 2) * pu, pu, GOLD, true);
    } else if (key === 'bubble') {
      rows = PROPS.bubble; ax = pos(rows); ay = hy + pu;
      this._bmp(rows, ax, ay, pu, WHITE, true);
      var act = Math.floor(el / 250) % 3;
      for (k = 0; k < 3; k++) this._r(ax + (2 + k * 2) * pu, ay + 2 * pu, pu, pu, k === act ? INK : '#b8bcc8');
    } else if (key === 'dots') {
      var act2 = Math.floor(el / 200) % 3;
      for (k = 0; k < 3; k++) { var dsz = pu * 2; this._r(right - (3 - k) * (dsz + pu) + pu, hy + 2 * pu + (k === act2 ? 0 : pu), dsz, dsz, GOLD); }
    } else if (key === 'check') {
      if (el < 120) return; rows = PROPS.check;
      this._bmp(rows, pos(rows), hy + pu, pu, '#4ade80', true);
    } else if (key === 'send') {
      rows = PROPS.send; p = (el % 900) / 900;
      this._bmp(rows, pos(rows) - 4 * pu + Math.floor(p * 6) * pu, hy + 2 * pu, pu, '#60a5fa', true);
    } else if (key === 'stars') {
      rows = PROPS.spark; var ph = Math.floor(el / 250) % 2;
      if (ph === 0) this._bmp(rows, pos(rows), hy, pu, GOLD, true);
      else this._bmp(rows, pos(rows) - 4 * pu, hy + 4 * pu, pu, GOLD, true);
      this._bmp(rows, pos(rows) - 2 * pu, hy + 2 * pu, Math.max(1, pu - 1), ph ? '#fff3b0' : GOLD, false);
    }
  };

  P._bubble = function (st, cfg, now) {
    var ts = this.ts, lineIdx = Math.min(st.line, cfg.lines.length - 1), text = cfg.lines[lineIdx];
    var dots = /\.\.\.$/.test(text), core = dots ? text.slice(0, -3) : text;
    var elL = now - st.lineT0, typed = Math.floor(elL / TYPE_MS), full = text.length;
    var shown, i;
    if (typed < core.length) shown = core.slice(0, typed);
    else if (dots) shown = core + '...'.slice(0, 1 + (Math.floor((elL - core.length * TYPE_MS) / 350) % 3));
    else shown = core;
    // advance to the next line once fully typed + hold
    if (lineIdx < cfg.lines.length - 1 && elL > full * TYPE_MS + HOLD_MS) { st.line++; st.lineT0 = now; }
    var lines = wrap(text), shownLines = [], left = shown.length;
    // distribute revealed chars over wrapped lines
    var consumed = 0;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i], take = Math.max(0, Math.min(ln.length, shown.length - consumed));
      shownLines.push(ln.slice(0, take)); consumed += ln.length + (i < lines.length - 1 ? 1 : 0);
    }
    var maxLen = 0; for (i = 0; i < lines.length; i++) maxLen = Math.max(maxLen, lines[i].length);
    var textW = maxLen * 6 * ts - ts, lineH = 8 * ts;
    var bw = textW + 6 * ts + 2 * ts, bh = lines.length * lineH - ts + 4 * ts + 2 * ts;
    var bx = this.hx + GW * this.u + 4, by = Math.max(1, Math.round(this.hy + (GH * this.u - bh) / 2));
    var acc = this.sk.accent === '#ffffff' ? GOLD : this.sk.accent, dark = '#101114';
    // border + fill (chamfered corners)
    this._r(bx + ts, by, bw - 2 * ts, bh, acc);
    this._r(bx, by + ts, bw, bh - 2 * ts, acc);
    this._r(bx + ts, by + ts, bw - 2 * ts, bh - 2 * ts, dark);
    this._r(bx + ts, by + 2 * ts, bw - 2 * ts, bh - 4 * ts, dark);
    // tail toward the head
    var cy = by + Math.floor(bh / 2 / ts) * ts;
    this._r(bx - ts, cy - ts, ts, ts, acc); this._r(bx - 2 * ts, cy, 2 * ts, ts, acc); this._r(bx - ts, cy + ts, ts, ts, acc);
    this._r(bx, cy - ts, ts, 3 * ts, dark); this._r(bx - ts, cy, ts, ts, dark);
    // text
    for (i = 0; i < lines.length; i++) {
      var ty = by + 3 * ts + i * lineH, tx = bx + 4 * ts, lw = textW;
      if (shownLines[i]) { this._text(shownLines[i], tx + ts, ty + ts, lw, '#3a2f00'); this._text(shownLines[i], tx, ty, lw, GOLD); }
    }
    // blinking block cursor while typing
    if (typed < core.length && (Math.floor(now / 200) % 2)) {
      var li = 0, rem = shown.length, lw2, l0;
      while (li < lines.length - 1 && rem > lines[li].length) { rem -= lines[li].length + 1; li++; }
      lw2 = textW;
      l0 = this.flipped ? this.W - (bx + 4 * ts) - lw2 : bx + 4 * ts;
      ctx_fill(this.ctx, GOLD, l0 + rem * 6 * ts, by + 3 * ts + li * lineH, 4 * ts, 7 * ts);
    }
  };
  function ctx_fill(ctx, col, x, y, w, h) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

  root.ZexCursorFX = {
    SKINS: SKINS, STATES: STATES, STATE_KEYS: STATE_KEYS, FONT: FONT,
    create: function (canvas, opts) { return new Renderer(canvas, opts); }
  };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
