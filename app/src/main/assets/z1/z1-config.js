// ZEN BROWSER: Z1 in-app config. Edit only Z1_API_BASE if your Z1 backend lives on another domain.
(function () {
  var Z1_API_BASE = 'https://zenone.stream'; // domain where Z1 /api/* and /.netlify/functions/* are hosted
  if (location.hostname !== 'appassets.androidplatform.net') return; // normal web: do nothing
  window.Z1_IN_APP = true;
  var of = window.fetch;
  window.fetch = function (u, o) {
    if (typeof u === 'string' && (u.indexOf('/api/') === 0 || u.indexOf('/.netlify/') === 0)) u = Z1_API_BASE + u;
    return of.call(this, u, o);
  };
})();
