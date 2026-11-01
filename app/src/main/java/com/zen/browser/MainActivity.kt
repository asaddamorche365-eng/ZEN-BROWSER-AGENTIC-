package com.zen.browser

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import org.json.JSONTokener

// ---------------- CONFIG (edit these) ----------------
private const val SEARCH_URL = "https://duckduckgo.com/?q="   // search engine used by the home search box
private const val X_URL = "https://x.com/home"
private const val APP_HOST = "appassets.androidplatform.net"
private const val Z1_URL = "https://$APP_HOST/assets/z1/index.html"   // Z1 is bundled inside the app (assets/z1)
private const val TG_URL = "https://web.telegram.org/"
private const val DESKTOP_WIDTH = 1024                         // desktop layout width in CSS px
// X bridge (hidden background WebViews used by Z1)
private const val XREADER_ASSET = "zenx/xreader.js"             // app/src/main/assets/zenx/xreader.js (all X selectors live there)
private const val HIDDEN_PARALLEL = 2                          // max hidden WebViews at once (1 = lighter on phone)
private const val HIDDEN_BLOCK_IMAGES = true                   // don't download images in hidden loads (set false if reading breaks)
private const val TWEET_TIMEOUT_MS = 15000L
private const val PROFILE_TIMEOUT_MS = 15000L
private const val SEARCH_TIMEOUT_MS = 30000L
private const val SETTLE_MS = 700L                             // extra wait after the tweet/profile appears, so parents/stats finish rendering
// -----------------------------------------------------

// Forces a desktop-width viewport so sites (X etc.) serve their desktop layout and DOM.
private val VIEWPORT_JS = """
(function () {
  var W = $DESKTOP_WIDTH;
  var mo = null;
  function apply() {
    var head = document.head || document.documentElement;
    if (!head) return;
    var m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'viewport');
      head.appendChild(m);
    }
    var s = Math.min(1, (window.screen.width || W) / W);
    var c = 'width=' + W + ', initial-scale=' + s + ', minimum-scale=' + (s / 2) + ', maximum-scale=5, user-scalable=yes';
    if (m.getAttribute('content') !== c) m.setAttribute('content', c);
  }
  apply();
  mo = new MutationObserver(apply);
  mo.observe(document, { childList: true, subtree: true });
  window.addEventListener('load', function () { apply(); if (mo) mo.disconnect(); });
})();
""".trimIndent()

// Quick DOM check: lists data-testid values found on the page (use on x.com to verify desktop DOM).
private val DOM_JS = """
(function () {
  var ids = {};
  document.querySelectorAll('[data-testid]').forEach(function (e) {
    var k = e.getAttribute('data-testid');
    ids[k] = (ids[k] || 0) + 1;
  });
  var keys = Object.keys(ids).sort(function (a, b) { return ids[b] - ids[a]; }).slice(0, 60);
  var out = {};
  keys.forEach(function (k) { out[k] = ids[k]; });
  return JSON.stringify({
    url: location.href,
    ua: navigator.userAgent,
    innerWidth: innerWidth,
    articles: document.querySelectorAll('article').length,
    tweets: document.querySelectorAll('article[data-testid="tweet"]').length,
    testids: out
  }, null, 1);
})();
""".trimIndent()

class MainActivity : Activity() {

    private class Tab(val web: WebView, val isHome: Boolean, val desktop: Boolean) {
        var title: String = ""
    }

    private class UserScript(val asset: String, val origins: Set<String>)

    private val tabs = ArrayList<Tab>()
    private var cur = 0
    private lateinit var content: FrameLayout
    private lateinit var tabsBtn: Button
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .setDomain(APP_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    // Scripts you add later: put files in app/src/main/assets/scripts/
    private val userScripts: List<UserScript> by lazy {
        val z1 = Uri.parse(Z1_URL)
        listOf(
            UserScript("scripts/all.js", setOf("*")),
            UserScript("scripts/x.js", setOf("https://x.com", "https://twitter.com")),
            UserScript("scripts/tg.js", setOf("https://web.telegram.org")),
            UserScript("scripts/z1.js", setOf("${z1.scheme}://${z1.host}"))
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(Color.BLACK)

        content = FrameLayout(this)
        root.addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(buildBar(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50)))
        setContentView(root)

        newTab(true, null)
    }

    // ---------------- UI ----------------

    private fun buildBar(): LinearLayout {
        val bar = LinearLayout(this)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.setBackgroundColor(Color.parseColor("#111111"))

        fun btn(label: String, onClick: () -> Unit): Button {
            val b = Button(this@MainActivity)
            b.text = label
            b.isAllCaps = false
            b.textSize = 14f
            b.setTextColor(Color.WHITE)
            b.setBackgroundColor(Color.TRANSPARENT)
            b.setOnClickListener { onClick() }
            bar.addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
            return b
        }

        btn("Home") { switchTo(0) }
        btn("Back") { handleBack(false) }
        btn("Reload") { tabs[cur].web.reload() }
        tabsBtn = btn("[1]") { showTabs() }
        btn("Menu") { showMenu() }
        return bar
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun updateTabsBtn() {
        tabsBtn.text = "[${tabs.size}]"
    }

    // ---------------- Tabs ----------------

    private fun newTab(isHome: Boolean, url: String?) {
        val desktop = !isHome && Uri.parse(url ?: "").host != APP_HOST
        val wv = createWebView(isHome, desktop)
        tabs.add(Tab(wv, isHome, desktop))
        content.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (isHome) {
            wv.loadDataWithBaseURL("https://zen.home/", homeHtml(), "text/html", "utf-8", null)
        } else if (url != null) {
            wv.loadUrl(url)
        }
        switchTo(tabs.size - 1)
    }

    private fun switchTo(i: Int) {
        if (i < 0 || i >= tabs.size) return
        cur = i
        for ((idx, t) in tabs.withIndex()) {
            t.web.visibility = if (idx == i) View.VISIBLE else View.GONE
        }
        updateTabsBtn()
    }

    private fun closeTab(i: Int) {
        if (i <= 0 || i >= tabs.size) return // home (0) cannot be closed
        val t = tabs.removeAt(i)
        content.removeView(t.web)
        t.web.destroy()
        switchTo((i - 1).coerceAtLeast(0))
    }

    private fun openUrl(url: String, reuse: Boolean) {
        if (reuse) {
            val host = Uri.parse(url).host
            val idx = tabs.indexOfFirst { !it.isHome && Uri.parse(it.web.url ?: "").host == host }
            if (idx >= 0) {
                switchTo(idx)
                return
            }
        }
        newTab(false, url)
    }

    private fun toUrl(q: String): String {
        val t = q.trim()
        if (t.startsWith("http://") || t.startsWith("https://")) return t
        if (!t.contains(' ') && t.contains('.')) return "https://$t"
        return SEARCH_URL + Uri.encode(t)
    }

    private fun handleBack(exitIfHome: Boolean) {
        val t = tabs[cur]
        if (!t.isHome && t.web.canGoBack()) {
            t.web.goBack()
        } else if (cur != 0) {
            switchTo(0)
        } else if (exitIfHome) {
            finish()
        }
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        handleBack(true)
    }

    private fun showTabs() {
        val names = tabs.mapIndexed { i, t ->
            val label = if (t.isHome) "Home" else t.title.ifEmpty { t.web.url ?: "Tab" }
            (if (i == cur) "● " else "") + label
        }.toTypedArray()
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Tabs")
            .setItems(names) { _, i -> switchTo(i) }
            .setNeutralButton("Close current") { _, _ -> closeTab(cur) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showMenu() {
        val items = arrayOf(
            "DOM report (current tab)",
            "X selector self-test (current tab)",
            "Bridge test (hidden fetch)",
            "Copy URL",
            "Clear cookies & site data"
        )
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setItems(items) { _, i ->
                when (i) {
                    0 -> domReport()
                    1 -> xSelfTest()
                    2 -> bridgeTest()
                    3 -> {
                        val u = tabs[cur].web.url
                        if (u != null) copy(u)
                    }
                    4 -> {
                        CookieManager.getInstance().removeAllCookies(null)
                        CookieManager.getInstance().flush()
                        WebStorage.getInstance().deleteAllData()
                        toast("Cleared")
                    }
                }
            }
            .show()
    }

    private fun domReport() {
        val t = tabs[cur]
        if (t.isHome) {
            toast("Open a page first")
            return
        }
        t.web.evaluateJavascript(DOM_JS) { raw ->
            val text = try {
                (JSONTokener(raw).nextValue() as? String) ?: raw
            } catch (e: Exception) {
                raw
            }
            AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle("DOM report")
                .setMessage(text)
                .setPositiveButton("Copy") { _, _ -> copy(text) }
                .setNegativeButton("Close", null)
                .show()
        }
    }

    private fun copy(text: String) {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("zen", text))
        toast("Copied")
    }

    private fun toast(m: String) {
        Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
    }

    // ---------------- WebView ----------------

    private fun desktopUa(): String {
        val v = Regex("Chrome/([0-9.]+)").find(WebSettings.getDefaultUserAgent(this))?.groupValues?.get(1)
            ?: "120.0.0.0"
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$v Safari/537.36"
    }

    private fun installScripts(wv: WebView, desktop: Boolean) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        if (desktop) WebViewCompat.addDocumentStartJavaScript(wv, VIEWPORT_JS, setOf("*"))
        for (s in userScripts) {
            val code = try {
                assets.open(s.asset).bufferedReader().use { it.readText() }
            } catch (e: Exception) {
                null
            }
            if (code != null) WebViewCompat.addDocumentStartJavaScript(wv, code, s.origins)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(isHome: Boolean, desktop: Boolean): WebView {
        val wv = WebView(this)
        wv.setBackgroundColor(Color.BLACK)
        val s = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.javaScriptCanOpenWindowsAutomatically = true
        s.mediaPlaybackRequiresUserGesture = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        if (isHome) {
            s.useWideViewPort = false
            s.loadWithOverviewMode = false
            wv.addJavascriptInterface(HomeBridge(), "Z")
        } else {
            if (desktop) {
                // Desktop mode: Windows Chrome UA + desktop-width viewport (X, Telegram, etc.)
                s.userAgentString = desktopUa()
                s.useWideViewPort = true
                s.loadWithOverviewMode = true
                s.setSupportZoom(true)
                s.builtInZoomControls = true
                s.displayZoomControls = false
            } else {
                // Mobile mode: bundled Z1 app
                s.useWideViewPort = false
                s.loadWithOverviewMode = false
            }
            CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
            installScripts(wv, desktop)
            // X session bridge: ONLY the bundled Z1 tab (mobile mode, appassets host). Never x.com / other sites.
            if (!desktop) wv.addJavascriptInterface(Z1Bridge(wv), "ZenX")
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isHome) return true // home page never navigates away
                val sch = request.url.scheme ?: return true
                if (!(sch == "http" || sch == "https")) return true // ignore other schemes
                if (!desktop && request.url.host != APP_HOST) {
                    // link clicked inside Z1 -> open it in a desktop tab (X etc.)
                    openUrl(request.url.toString(), true)
                    return true
                }
                return false
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                // Fallback when document-start scripts are unsupported on this WebView
                if (!isHome && !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    view.evaluateJavascript(VIEWPORT_JS, null)
                }
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) {
                tabs.firstOrNull { it.web === view }?.title = title ?: ""
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: WebChromeClient.FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                return try {
                    startActivityForResult(fileChooserParams!!.createIntent(), 1001)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }
        return wv
    }

    inner class HomeBridge {
        @JavascriptInterface
        fun open(url: String) {
            if (!url.startsWith("http")) return
            runOnUiThread { openUrl(url, true) }
        }

        @JavascriptInterface
        fun search(q: String) {
            runOnUiThread { openUrl(toUrl(q), false) }
        }
    }

    // =====================================================================
    //  X SESSION BRIDGE  (Z1 tab only)  — reads X through the shared cookie jar
    //  Z1 calls:  ZenX.xLoggedIn() / ZenX.xUsername() / ZenX.fetchTweet(url, id) ...
    //  Results come back async:  window.__zenBridgeCb(callbackId, jsonString)
    // =====================================================================

    private fun isXHost(h: String?): Boolean {
        if (h == null) return false
        return h == "x.com" || h == "twitter.com" || h.endsWith(".x.com") || h.endsWith(".twitter.com")
    }

    private fun xAuthToken(): String {
        val cm = CookieManager.getInstance()
        val all = (cm.getCookie("https://x.com") ?: "") + ";" + (cm.getCookie("https://twitter.com") ?: "")
        for (part in all.split(";")) {
            val p = part.trim()
            if (p.startsWith("auth_token=")) return p.removePrefix("auth_token=")
        }
        return ""
    }

    private fun isXLoggedIn(): Boolean = xAuthToken().isNotEmpty()

    // cached handle is only valid for the same login (we store a hash of auth_token, never the token)
    private fun cachedXUser(): String {
        val tok = xAuthToken()
        if (tok.isEmpty()) return ""
        val sp = getSharedPreferences("zen_bridge", Context.MODE_PRIVATE)
        if (sp.getString("xuser_tok", "") != tok.hashCode().toString()) return ""
        return sp.getString("xuser", "") ?: ""
    }

    private fun saveXUser(handle: String) {
        val tok = xAuthToken()
        if (tok.isEmpty() || handle.isEmpty()) return
        getSharedPreferences("zen_bridge", Context.MODE_PRIVATE).edit()
            .putString("xuser", handle)
            .putString("xuser_tok", tok.hashCode().toString())
            .apply()
    }

    private fun errJson(kind: String, error: String, hint: String): String {
        return JSONObject().put("ok", false).put("kind", kind).put("error", error).put("hint", hint).toString()
    }

    // send a JSON string to the Z1 page: window.__zenBridgeCb(callbackId, jsonString)
    private fun deliver(owner: WebView, cbId: String, json: String) {
        runOnUiThread {
            if (tabs.any { it.web === owner }) {
                val lit = JSONObject.quote(json).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
                val js = "(function(){try{var f=window.__zenBridgeCb;if(typeof f==='function')f(" +
                    JSONObject.quote(cbId) + "," + lit + ");}catch(e){}})();"
                owner.evaluateJavascript(js, null)
            }
        }
    }

    inner class Z1Bridge(private val owner: WebView) {
        @JavascriptInterface
        fun version(): String = "zenx-1"

        @JavascriptInterface
        fun xLoggedIn(): Boolean = isXLoggedIn()

        // cached handle ("" if unknown) — call fetchUsername() to read it from X
        @JavascriptInterface
        fun xUsername(): String = cachedXUser()

        // switch to the X tab (opens it if missing)
        @JavascriptInterface
        fun openX() {
            runOnUiThread { openUrl(X_URL, true) }
        }

        @JavascriptInterface
        fun fetchUsername(force: Boolean, callbackId: String) {
            runOnUiThread { startUserFetch(force) { json -> deliver(owner, callbackId, json) } }
        }

        @JavascriptInterface
        fun fetchTweet(url: String, callbackId: String) {
            runOnUiThread { startTweetFetch(url) { json -> deliver(owner, callbackId, json) } }
        }

        @JavascriptInterface
        fun fetchProfile(handle: String, callbackId: String) {
            runOnUiThread { startProfileFetch(handle) { json -> deliver(owner, callbackId, json) } }
        }

        // type: "top" or "live"
        @JavascriptInterface
        fun search(keyword: String, type: String, minLikes: Int, minViews: Int, maxResults: Int, callbackId: String) {
            runOnUiThread {
                startSearch(keyword, type, minLikes, minViews, maxResults) { json -> deliver(owner, callbackId, json) }
            }
        }
    }

    // ---------------- fetch starters (all on UI thread) ----------------

    private fun startTweetFetch(url: String, done: (String) -> Unit) {
        if (!isXLoggedIn()) { done(errJson("tweet", "not_logged_in", "")); return }
        val id = Regex("/status(?:es)?/(\\d{5,25})").find(url)?.groupValues?.get(1)
        if (id == null) { done(errJson("tweet", "bad_url", "")); return }
        val hm = Regex("(?:twitter|x)\\.com/([A-Za-z0-9_]{1,15})/status").find(url)?.groupValues?.get(1)
        val user = if (hm != null && !hm.equals("i", ignoreCase = true)) hm else "i"
        enqueueHidden(HiddenRun("tweet", "https://x.com/$user/status/$id", id, TWEET_TIMEOUT_MS, SETTLE_MS, done))
    }

    private fun startProfileFetch(handleRaw: String, done: (String) -> Unit) {
        if (!isXLoggedIn()) { done(errJson("profile", "not_logged_in", "")); return }
        val h = handleRaw.trim().removePrefix("@")
        if (!Regex("^[A-Za-z0-9_]{1,15}$").matches(h)) { done(errJson("profile", "bad_handle", "")); return }
        enqueueHidden(HiddenRun("profile", "https://x.com/$h", h, PROFILE_TIMEOUT_MS, SETTLE_MS, done))
    }

    private fun startUserFetch(force: Boolean, done: (String) -> Unit) {
        if (!isXLoggedIn()) { done(errJson("user", "not_logged_in", "")); return }
        if (!force) {
            val c = cachedXUser()
            if (c.isNotEmpty()) {
                done(JSONObject().put("ok", true).put("kind", "user")
                    .put("data", JSONObject().put("handle", c).put("cached", true)).toString())
                return
            }
        }
        val wrapped: (String) -> Unit = { json ->
            try {
                val o = JSONObject(json)
                if (o.optBoolean("ok")) {
                    val h = o.optJSONObject("data")?.optString("handle") ?: ""
                    saveXUser(h)
                }
            } catch (e: Exception) {
            }
            done(json)
        }
        enqueueHidden(HiddenRun("user", "https://x.com/home", "", PROFILE_TIMEOUT_MS, 0L, wrapped))
    }

    private fun startSearch(kw: String, type: String, minLikes: Int, minViews: Int, maxResults: Int, done: (String) -> Unit) {
        if (!isXLoggedIn()) { done(errJson("search", "not_logged_in", "")); return }
        val k = kw.trim()
        if (k.isEmpty() || k.length > 200) { done(errJson("search", "bad_keyword", "")); return }
        val url = "https://x.com/search?q=" + Uri.encode(k) + "&src=typed_query" +
            (if (type.equals("live", ignoreCase = true)) "&f=live" else "")
        val arg = JSONObject().put("minLikes", minLikes).put("minViews", minViews)
            .put("max", maxResults.coerceIn(1, 50)).toString()
        enqueueHidden(HiddenRun("search", url, arg, SEARCH_TIMEOUT_MS, 0L, done))
    }

    // ---------------- hidden WebView queue ----------------

    private val hiddenQueue = ArrayList<HiddenRun>()
    private val hiddenActive = ArrayList<HiddenRun>()

    private val xReaderJs: String by lazy {
        try {
            assets.open(XREADER_ASSET).bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            ""
        }
    }

    private fun enqueueHidden(run: HiddenRun) {
        if (hiddenQueue.size >= 40) {
            run.reject()
            return
        }
        hiddenQueue.add(run)
        pumpHidden()
    }

    private fun pumpHidden() {
        while (hiddenActive.size < HIDDEN_PARALLEL && hiddenQueue.isNotEmpty()) {
            val r = hiddenQueue.removeAt(0)
            hiddenActive.add(r)
            r.start()
        }
    }

    // Hidden desktop-mode WebView: same cookies, same desktop UA and viewport as the X tab.
    // It is added UNDER the visible tabs (index 0) at full size so X lays out and renders normally.
    @SuppressLint("SetJavaScriptEnabled")
    private fun createHiddenWebView(onFail: (String) -> Unit): WebView {
        val wv = WebView(this)
        wv.setBackgroundColor(Color.BLACK)
        val s = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = true
        s.userAgentString = desktopUa()
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.blockNetworkImage = HIDDEN_BLOCK_IMAGES
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(wv, VIEWPORT_JS, setOf("*"))
        }
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme != "https") return true
                return !isXHost(u.host)
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    view.evaluateJavascript(VIEWPORT_JS, null)
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) onFail("load_error")
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                onFail("render_gone")
                return true
            }
        }
        return wv
    }

    private inner class HiddenRun(
        val kind: String,
        val url: String,
        val arg: String,
        val timeoutMs: Long,
        val settleMs: Long,
        val done: (String) -> Unit
    ) {
        private val handler = Handler(Looper.getMainLooper())
        private var web: WebView? = null
        private var finished = false
        private var inFlight = false
        private var startedAt = 0L
        private var readySince = 0L
        private var goneCount = 0
        private var lastData: JSONObject? = null
        private var lastPartial: JSONObject? = null
        private var lastHint = ""
        private var lastSnip = ""
        private var lastError = ""
        private val pollTask = Runnable { poll() }

        fun start() {
            if (xReaderJs.isEmpty()) {
                finishErr("reader_missing", XREADER_ASSET)
                return
            }
            startedAt = SystemClock.uptimeMillis()
            val wv = createHiddenWebView { reason -> finishErr(reason, "") }
            web = wv
            content.addView(wv, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            wv.loadUrl(url)
            handler.postDelayed(pollTask, 800)
        }

        fun reject() {
            finishErr("busy", "")
        }

        fun abort() {
            finished = true
            handler.removeCallbacks(pollTask)
            destroyWeb()
        }

        private fun poll() {
            if (finished) return
            val w = web ?: return
            if (SystemClock.uptimeMillis() - startedAt > timeoutMs) {
                onTimeout()
                return
            }
            if (!inFlight) {
                inFlight = true
                val js = xReaderJs + "\n;window.__ZENX.poll(" + JSONObject.quote(kind) + "," + JSONObject.quote(arg) + ");"
                w.evaluateJavascript(js) { raw ->
                    inFlight = false
                    onPoll(raw)
                }
            }
            handler.postDelayed(pollTask, 400)
        }

        private fun onPoll(raw: String?) {
            if (finished) return
            if (raw == null) return
            val text: String? = try {
                JSONTokener(raw).nextValue() as? String
            } catch (e: Exception) {
                null
            }
            if (text == null) return
            val obj: JSONObject = try {
                JSONObject(text)
            } catch (e: Exception) {
                lastError = "bad_json"
                return
            }
            val state = obj.optString("state")
            val snip = obj.optString("snip")
            if (snip.isNotEmpty()) lastSnip = snip
            val part = obj.optJSONObject("partial")
            if (part != null) lastPartial = part
            val now = SystemClock.uptimeMillis()
            if (state == "ready") {
                goneCount = 0
                lastError = ""
                val d = obj.optJSONObject("data")
                if (d != null) lastData = d
                if (readySince == 0L) readySince = now
                if (now - readySince >= settleMs) finishOk()
            } else if (state == "gone") {
                lastHint = "gone"
                goneCount++
                if (goneCount >= 3) finishErr("unavailable", lastSnip)
            } else if (state == "error") {
                lastError = obj.optString("msg")
            } else {
                lastHint = obj.optString("hint")
            }
        }

        private fun onTimeout() {
            if (lastData != null && readySince != 0L) {
                finishOk()
                return
            }
            val p = lastPartial
            if (kind == "search" && p != null) {
                val items = p.optJSONArray("items")
                if (items != null && items.length() > 0) {
                    p.put("timedOut", true)
                    finishJson(JSONObject().put("ok", true).put("kind", kind).put("data", p).toString())
                    return
                }
            }
            if (lastError.isNotEmpty()) {
                finishErr("js_error", lastError)
                return
            }
            val e = if (lastHint == "login") "not_logged_in" else "timeout"
            finishErr(e, lastSnip)
        }

        private fun finishOk() {
            val d = lastData
            if (d == null) {
                finishErr("empty", lastSnip)
                return
            }
            finishJson(JSONObject().put("ok", true).put("kind", kind).put("data", d).toString())
        }

        private fun finishErr(error: String, hint: String) {
            finishJson(errJson(kind, error, hint))
        }

        private fun finishJson(json: String) {
            if (finished) return
            finished = true
            handler.removeCallbacks(pollTask)
            handler.post { destroyWeb() }
            hiddenActive.remove(this)
            try {
                done(json)
            } catch (e: Exception) {
            }
            pumpHidden()
        }

        private fun destroyWeb() {
            val w = web ?: return
            web = null
            try { w.stopLoading() } catch (e: Exception) { }
            try { content.removeView(w) } catch (e: Exception) { }
            try { w.destroy() } catch (e: Exception) { }
        }
    }

    // ---------------- menu tools: self-test + bridge test ----------------

    private fun showText(title: String, text: String) {
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle(title)
            .setMessage(text)
            .setPositiveButton("Copy") { _, _ -> copy(text) }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun xSelfTest() {
        val t = tabs[cur]
        if (t.isHome || !isXHost(Uri.parse(t.web.url ?: "").host)) {
            toast("Open an X page first (X tab)")
            return
        }
        if (xReaderJs.isEmpty()) {
            toast("assets/zenx/xreader.js missing")
            return
        }
        t.web.evaluateJavascript(xReaderJs + "\n;window.__ZENX.selfTest();") { raw ->
            val text = try {
                (JSONTokener(raw).nextValue() as? String) ?: raw
            } catch (e: Exception) {
                raw
            }
            showText("X selector self-test", text)
        }
    }

    private fun bridgeTest() {
        val et = EditText(this)
        et.setTextColor(Color.WHITE)
        et.setHintTextColor(Color.GRAY)
        et.hint = "tweet link | @handle | ?keywords | me"
        et.setSingleLine(true)
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Bridge test (hidden fetch)")
            .setView(et)
            .setPositiveButton("Run") { _, _ -> runBridgeTest(et.text.toString().trim()) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun runBridgeTest(inp: String) {
        if (inp.isEmpty()) return
        val cb: (String) -> Unit = { json ->
            val pretty = try {
                JSONObject(json).toString(1)
            } catch (e: Exception) {
                json
            }
            showText("Bridge result", pretty)
        }
        toast("Running... (up to ~30s)")
        if (inp.contains("/status/")) {
            startTweetFetch(inp, cb)
        } else if (inp.startsWith("@")) {
            startProfileFetch(inp, cb)
        } else if (inp.startsWith("?")) {
            startSearch(inp.substring(1), "top", 0, 0, 5, cb)
        } else if (inp == "me") {
            startUserFetch(true, cb)
        } else {
            toast("Use: tweet link | @handle | ?keywords | me")
        }
    }

    private fun homeHtml(): String = """
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:#000;color:#fff;font-family:sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:64px 20px 20px}
h1{font-size:22px;letter-spacing:5px;margin:0 0 28px}
form{width:100%;max-width:520px;display:flex;margin-bottom:44px}
input{flex:1;min-width:0;padding:14px 16px;border-radius:26px 0 0 26px;border:1px solid #333;background:#111;color:#fff;font-size:16px;outline:none}
button{padding:0 22px;border:1px solid #333;border-left:0;border-radius:0 26px 26px 0;background:#222;color:#fff;font-size:16px}
.g{display:flex;gap:30px;flex-wrap:wrap;justify-content:center}
.t{width:84px;text-align:center;font-size:13px;color:#ccc}
.i{width:72px;height:72px;margin:0 auto 8px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:#fff}
</style></head><body>
<h1>ZEN BROWSER</h1>
<form onsubmit="return s()"><input id="q" placeholder="Search or type URL" autocomplete="off" autocapitalize="off"><button type="submit">Go</button></form>
<div class="g">
<div class="t" onclick="Z.open('$X_URL')"><div class="i" style="background:#111;border:1px solid #333">X</div>X</div>
<div class="t" onclick="Z.open('$Z1_URL')"><div class="i" style="background:#6d28d9">Z1</div>Z1</div>
<div class="t" onclick="Z.open('$TG_URL')"><div class="i" style="background:#229ed9">TG</div>Telegram</div>
</div>
<script>
function s(){var q=document.getElementById('q').value.trim();if(q)Z.search(q);return false}
</script>
</body></html>
""".trimIndent()

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == 1001) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        hiddenQueue.clear()
        for (r in ArrayList(hiddenActive)) r.abort()
        hiddenActive.clear()
        for (t in tabs) t.web.destroy()
        super.onDestroy()
    }
}
