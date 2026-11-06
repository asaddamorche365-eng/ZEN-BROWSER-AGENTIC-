// ZEN BROWSER - make the WebView look like normal Chrome (needed for Google login and other "is this a real browser" checks)
(function () {
  try {
    // 1) window.chrome (missing in WebView, present in Chrome)
    if (!window.chrome) window.chrome = {};
    var c = window.chrome, t0 = Date.now();
    if (!c.app) c.app = { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } };
    if (!c.csi) c.csi = function () { return { onloadT: t0, startE: t0, pageT: performance.now(), tran: 15 }; };
    if (!c.loadTimes) c.loadTimes = function () {
      var n = t0 / 1000;
      return { requestTime: n, startLoadTime: n, commitLoadTime: n, finishDocumentLoadTime: n, finishLoadTime: n, firstPaintTime: n, firstPaintAfterLoadTime: 0, navigationType: 'Other', wasFetchedViaSpdy: true, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2', wasAlternateProtocolAvailable: false, connectionInfo: 'h2' };
    };
    // 2) navigator.userAgentData brands: "Android WebView" -> "Google Chrome"
    var uad = navigator.userAgentData;
    if (uad && window.Navigator) {
      var m = /Chrome\/(\d+)\.([\d.]+)/.exec(navigator.userAgent) || [];
      var major = m[1] || '120', full = (m[1] ? m[1] + '.' + m[2] : '120.0.0.0');
      var brands = [{ brand: 'Not)A;Brand', version: '99' }, { brand: 'Google Chrome', version: major }, { brand: 'Chromium', version: major }];
      var origHE = uad.getHighEntropyValues ? uad.getHighEntropyValues.bind(uad) : null;
      var fake = {
        brands: brands, mobile: uad.mobile, platform: uad.platform,
        getHighEntropyValues: function (h) {
          if (!origHE) return Promise.resolve({ brands: brands, mobile: uad.mobile, platform: uad.platform });
          return origHE(h).then(function (r) {
            r.brands = brands;
            if (r.fullVersionList) r.fullVersionList = brands.map(function (b) { return { brand: b.brand, version: b.brand === 'Not)A;Brand' ? '99.0.0.0' : full }; });
            return r;
          });
        },
        toJSON: function () { return { brands: brands, mobile: uad.mobile, platform: uad.platform }; }
      };
      Object.defineProperty(Navigator.prototype, 'userAgentData', { get: function () { return fake; }, configurable: true });
    }
  } catch (e) {}
})();
