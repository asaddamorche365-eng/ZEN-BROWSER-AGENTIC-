// ZEN BROWSER - window.ZCDP : trusted input (isTrusted = true) through the app's CDP bridge (ZenEng.cdpBatch). x.com / telegram web only.
// Coordinates are CSS pixels inside the viewport (same numbers as getBoundingClientRect()).
(function () {
  if (window.ZCDP) return;
  function run(cmds) {
    try { return JSON.parse(window.ZenEng.cdpBatch(JSON.stringify(cmds))); } catch (e) { return { error: String(e) }; }
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mouse(type, x, y, o) {
    var p = { type: type, x: x, y: y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' };
    for (var k in (o || {})) p[k] = o[k];
    return { method: 'Input.dispatchMouseEvent', params: p };
  }
  var Z = {
    available: function () { try { return !!(window.ZenEng && window.ZenEng.cdpBatch && window.ZenEng.cdpOn()); } catch (e) { return false; } },
    // one raw CDP command (only input-type commands are allowed by the app)
    send: function (method, params) { return run([{ method: method, params: params || {} }]); },
    // run several commands in one go: [{method, params, delay}]
    batch: run,
    click: function (x, y) {
      return run([
        mouse('mouseMoved', x, y, { button: 'none', clickCount: 0 }),
        Object.assign(mouse('mousePressed', x, y, { buttons: 1 }), { delay: Math.round(rnd(30, 70)) }),
        Object.assign(mouse('mouseReleased', x, y), { delay: Math.round(rnd(50, 110)) })
      ]);
    },
    // click a DOM element at a random point inside its middle area
    clickEl: function (el) {
      if (!el) return { error: 'no element' };
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { error: 'element has no size' };
      return Z.click(r.left + r.width * rnd(0.3, 0.7), r.top + r.height * rnd(0.3, 0.7));
    },
    // paste text into the focused field in one step (works for inputs and contenteditable)
    type: function (text) { return run([{ method: 'Input.insertText', params: { text: String(text) } }]); },
    // real key presses, one char at a time (gap = ms between chars)
    typeKeys: function (text, gap) {
      var cmds = [], g = gap || 60;
      String(text).split('').forEach(function (ch, i) {
        cmds.push({ method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch }, delay: i ? Math.round(rnd(g * 0.5, g * 1.5)) : 0 });
        cmds.push({ method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: ch }, delay: Math.round(rnd(15, 40)) });
      });
      return run(cmds);
    },
    // special key, e.g. key('Enter', 'Enter', 13)
    key: function (key, code, vk) {
      var p = { key: key, code: code || key, windowsVirtualKeyCode: vk || 0, nativeVirtualKeyCode: vk || 0 };
      return run([
        { method: 'Input.dispatchKeyEvent', params: Object.assign({ type: 'rawKeyDown' }, p) },
        { method: 'Input.dispatchKeyEvent', params: Object.assign({ type: 'keyUp' }, p), delay: Math.round(rnd(30, 80)) }
      ]);
    },
    // finger tap / scroll (touch style, like a real phone)
    tap: function (x, y) { return run([{ method: 'Input.synthesizeTapGesture', params: { x: x, y: y } }]); },
    scroll: function (dy, x, y) {
      return run([{ method: 'Input.synthesizeScrollGesture', params: { x: x || innerWidth / 2, y: y || innerHeight / 2, yDistance: -dy, speed: 1200, gestureSourceType: 'touch' } }]);
    },
    // keep the page "focused" even when another tab is in front (stays on until you call focusEmu(false), CDP is switched OFF or the tab closes)
    focusEmu: function (on) { return run([{ method: 'Emulation.setFocusEmulationEnabled', params: { enabled: on !== false } }]); }
  };
  window.ZCDP = Z;
})();
