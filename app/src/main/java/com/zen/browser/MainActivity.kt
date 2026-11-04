package com.zen.browser

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.PictureInPictureParams
import android.util.Rational
import android.content.ClipData
import android.content.ClipboardManager
import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
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
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONTokener

// ---------------- CONFIG (edit these) ----------------
private const val SEARCH_URL = "https://duckduckgo.com/?q="   // search engine used by the home search box
private const val X_URL = "https://x.com/home"
private const val APP_HOST = "appassets.androidplatform.net"
private const val ENG_URL = "https://$APP_HOST/assets/z1/index.html#engine"   // Engine settings = a tab inside Z1
private const val Z1_URL = "https://$APP_HOST/assets/z1/index.html"   // Z1 is bundled inside the app (assets/z1)
private const val TG_URL = "https://web.telegram.org/"
// Desktop mode = same system as Fulguris: desktop UA + wide viewport + injected meta viewport at N% of the real width (Fulguris default 200)
private const val DESKTOP_WIDTH_PERCENT = 200
// X bridge (hidden background WebViews used by Z1)
private const val XREADER_ASSET = "zenx/xreader.js"             // app/src/main/assets/zenx/xreader.js (all X selectors live there)
private const val HIDDEN_PARALLEL = 2                          // max hidden WebViews at once (1 = lighter on phone)
private const val HIDDEN_BLOCK_IMAGES = true                   // don't download images in hidden loads (set false if reading breaks)
private const val TWEET_TIMEOUT_MS = 15000L
private const val PROFILE_TIMEOUT_MS = 15000L
private const val SEARCH_TIMEOUT_MS = 30000L
private const val SETTLE_MS = 700L                             // extra wait after the tweet/profile appears, so parents/stats finish rendering
// -----------------------------------------------------

// Meta-viewport injector (port of Fulguris SetMetaViewport.js, CPAL-1.0: https://github.com/Slion/Fulguris)
private val SET_VIEWPORT_JS = """
(function () {
  'use strict';
  var pct = @@WIDTH@@;
  function viewportContent(w) {
    var cw = (w * pct) / 100;
    return 'width=' + cw + ', user-scalable=1, initial-scale=' + (w / cw);
  }
  function main() {
    var mine = null;
    document.querySelectorAll('meta[name="viewport"]').forEach(function (m) {
      if (m.hasAttribute('data-zen')) { mine = m; } else { m.remove(); }
    });
    var head = document.getElementsByTagName('head')[0];
    if (!head) return;
    var orig = window.innerWidth;
    if (mine) {
      orig = parseFloat(mine.getAttribute('data-zen')) || orig;
    } else {
      mine = document.createElement('meta');
      mine.setAttribute('name', 'viewport');
    }
    mine.setAttribute('content', viewportContent(orig));
    mine.setAttribute('data-zen', orig);
    head.appendChild(mine);
  }
  if (!window.__zenVpInit) {
    window.__zenVpInit = true;
    window.addEventListener('resize', main);
    window.addEventListener('load', main);
  }
  main();
})();
"""

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

// WebView that keeps running when the app is minimized: the window is always reported as visible to Chromium
class KeepAliveWebView(context: Context) : WebView(context) {
    override fun onWindowVisibilityChanged(visibility: Int) {
        if (visibility != View.GONE) super.onWindowVisibilityChanged(View.VISIBLE)
    }
}

class MainActivity : Activity() {

    // isZ1 = bundled Z1 app tab (always mobile). desktop = per-tab Desktop/Mobile switch (like Fulguris), changeable from Menu.
    private class Tab(val web: WebView, val isHome: Boolean, val isZ1: Boolean, var desktop: Boolean) {
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
        startBackground()
    }

    // ---------------- Background running ----------------

    private fun bgPrefs() = getSharedPreferences("zen_bridge", Context.MODE_PRIVATE)

    private fun bgEnabled(): Boolean = bgPrefs().getBoolean("bg_on", true)

    // pokes every WebView every few seconds so Chromium never idles them while the app is in the background
    private val keepHandler = Handler(Looper.getMainLooper())
    private val keepTick = object : Runnable {
        override fun run() {
            keepWebViewsRunning()
            keepHandler.postDelayed(this, 3000)
        }
    }

    private fun startBackground() {
        if (!bgEnabled()) return
        keepHandler.removeCallbacks(keepTick)
        keepHandler.postDelayed(keepTick, 3000)
        // 1) notification permission (Android 13+): needed only so the "running" notification is visible
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11)
        } else {
            askBatteryOnce()
        }
        // 2) the foreground service itself
        try {
            val i = Intent(this, KeepAliveService::class.java)
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i) else startService(i)
        } catch (e: Exception) {
            toast("Background service could not start")
        }
    }

    private fun stopBackground() {
        keepHandler.removeCallbacks(keepTick)
        try {
            stopService(Intent(this, KeepAliveService::class.java))
        } catch (e: Exception) {
        }
    }

    // asks once to be excluded from battery optimization (system dialog), so Android does not freeze the app
    private fun askBatteryOnce() {
        if (bgPrefs().getBoolean("batt_asked", false)) return
        bgPrefs().edit().putBoolean("batt_asked", true).apply()
        askBattery()
    }

    private fun askBattery() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                i.data = Uri.parse("package:" + packageName)
                startActivity(i)
            } else {
                toast("Battery: already unrestricted")
            }
        } catch (e: Exception) {
            toast("Open Settings > Battery and set ZEN BROWSER to Unrestricted")
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 11) askBatteryOnce()   // whatever the answer was, continue with the battery question
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
        val isZ1 = !isHome && Uri.parse(url ?: "").host == APP_HOST
        val desktop = !isHome && !isZ1          // new web tabs start in desktop mode; toggle in Menu
        val wv = createWebView(isHome, isZ1)
        val tab = Tab(wv, isHome, isZ1, desktop)
        tabs.add(tab)
        if (!isHome) applyDesktop(tab)
        content.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (isHome) {
            wv.loadDataWithBaseURL("https://zen.home/", homeHtml(), "text/html", "utf-8", null)
        } else if (url != null) {
            wv.loadUrl(url)
        }
        switchTo(tabs.size - 1)
    }

    // true while the SEA/FED engine is running in AUTO mode (cfg "auto")
    private fun engineAutoOn(): Boolean {
        return try {
            JSONObject(engCfgGetStr()).optBoolean("auto", false)
        } catch (e: Exception) {
            false
        }
    }

    // an x.com / twitter.com web tab (not Home, not Z1)
    private fun isXWebTab(t: Tab): Boolean {
        if (t.isHome || t.isZ1) return false
        val host: String? = try {
            Uri.parse(t.web.url ?: "").host
        } catch (e: Exception) {
            null
        }
        return isXHost(host)
    }

    private fun switchTo(i: Int) {
        if (i < 0 || i >= tabs.size) return
        cur = i
        val autoOn = engineAutoOn()
        for ((idx, t) in tabs.withIndex()) {
            if (idx == i) {
                t.web.visibility = View.VISIBLE
                t.web.bringToFront()
            } else if (autoOn && isXWebTab(t)) {
                // Engine AUTO is running in this X tab: keep it VISIBLE (it stays behind the active tab, which is opaque).
                // A GONE WebView gets no frames and X stops loading posts, so the engine would stall while you watch YouTube in another tab.
                t.web.visibility = View.VISIBLE
            } else {
                t.web.visibility = View.GONE
            }
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
        val ct = tabs[cur]
        val deskLabel = if (ct.isHome || ct.isZ1) "Desktop site (not for this tab)"
            else if (ct.desktop) "Desktop site: ON  (tap = mobile)" else "Desktop site: OFF  (tap = desktop)"
        val items = arrayOf(
            deskLabel,
            "DOM report (current tab)",
            "X selector self-test (current tab)",
            "Bridge test (hidden fetch)",
            "Copy URL",
            "Clear cookies & site data",
            if (bgEnabled()) "Background run: ON  (tap = off)" else "Background run: OFF  (tap = on)",
            "Battery: allow unrestricted",
            "Engine API keys (SEA/FED)",
            "Engine settings (SEA/FED)"
        )
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setItems(items) { _, i ->
                when (i) {
                    0 -> toggleDesktop()
                    1 -> domReport()
                    2 -> xSelfTest()
                    3 -> bridgeTest()
                    4 -> {
                        val u = tabs[cur].web.url
                        if (u != null) copy(u)
                    }
                    6 -> {
                        val on = !bgEnabled()
                        bgPrefs().edit().putBoolean("bg_on", on).apply()
                        if (on) startBackground() else stopBackground()
                        toast(if (on) "Background run: ON" else "Background run: OFF")
                    }
                    7 -> askBattery()
                    8 -> showEngKeys()
                    9 -> openEngSettings()
                    5 -> {
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

    // Mobile UA = system WebView UA without the "Build/..; wv" marker (same trick Fulguris uses)
    private fun mobileUa(): String {
        return Regex(" Build/.+; wv").replace(WebSettings.getDefaultUserAgent(this), "")
    }

    // Applies the tab's desktop/mobile state (UA + viewport mode). The meta viewport itself is injected by applyDesktopView().
    private fun applyDesktop(t: Tab) {
        val s = t.web.settings
        if (t.desktop) {
            s.userAgentString = desktopUa()
            s.useWideViewPort = true
            s.loadWithOverviewMode = false
            s.setSupportZoom(true)
            s.builtInZoomControls = true
            s.displayZoomControls = false
        } else {
            s.userAgentString = if (t.isZ1) WebSettings.getDefaultUserAgent(this) else mobileUa()
            s.useWideViewPort = false
            s.loadWithOverviewMode = false
        }
    }

    // Same as Fulguris applyDesktopModeIfNeeded(): called on page start / finish
    private fun applyDesktopView(view: WebView, desktop: Boolean) {
        view.settings.useWideViewPort = false
        if (desktop) {
            view.settings.useWideViewPort = true
            view.evaluateJavascript(SET_VIEWPORT_JS.replace("@@WIDTH@@", DESKTOP_WIDTH_PERCENT.toString()), null)
        }
    }

    private fun toggleDesktop() {
        val t = tabs[cur]
        if (t.isHome || t.isZ1) {
            toast("Not available for this tab")
            return
        }
        t.desktop = !t.desktop
        applyDesktop(t)
        t.web.reload()
        toast(if (t.desktop) "Desktop site: ON" else "Desktop site: OFF (mobile)")
    }

    private fun desktopUa(): String {
        val v = Regex("Chrome/([0-9.]+)").find(WebSettings.getDefaultUserAgent(this))?.groupValues?.get(1)
            ?: "120.0.0.0"
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$v Safari/537.36"
    }

    private fun installScripts(wv: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
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
    private fun createWebView(isHome: Boolean, isZ1: Boolean): WebView {
        val wv = KeepAliveWebView(this)
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
            // UA / viewport (desktop or mobile) is applied per tab by applyDesktop(tab)
            CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
            installScripts(wv)
            // X session bridge: ONLY the bundled Z1 tab. Never x.com / other sites.
            if (isZ1) wv.addJavascriptInterface(Z1Bridge(wv), "ZenX")
            // SEA/FED engine bridge: every web tab gets it, but each call checks the tab is really on x.com
            else wv.addJavascriptInterface(EngBridge(wv), "ZenEng")
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isHome) return true // home page never navigates away
                val sch = request.url.scheme ?: return true
                if (!(sch == "http" || sch == "https")) return true // ignore other schemes
                if (isZ1 && request.url.host != APP_HOST) {
                    // link clicked inside Z1 -> open it in a desktop tab (X etc.)
                    openUrl(request.url.toString(), true)
                    return true
                }
                return false
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                val tb = tabs.firstOrNull { it.web === view }
                if (tb != null && tb.desktop) applyDesktopView(view, true)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                // Fulguris applies desktop mode again here: the page head may not exist yet at start
                val tb = tabs.firstOrNull { it.web === view }
                if (tb != null && tb.desktop) applyDesktopView(view, true)
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
            // Z1 and the Engine page share one host, so host-based tab reuse would wrongly jump to the Z1 tab
            if (url == ENG_URL) {
                runOnUiThread { openEngSettings() }
                return
            }
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

        // ---- SEA/FED engine settings page (assets/zenx/engine.html) ----
        @JavascriptInterface
        fun engCfgGet(): String = engCfgGetStr()

        @JavascriptInterface
        fun engCfgSet(patchJson: String) {
            engCfgMerge(patchJson)
        }

        @JavascriptInterface
        fun engKeyInfo(): String {
            val sp = engPrefs()
            return JSONObject().put("gem", !(sp.getString("gem", "") ?: "").isEmpty())
                .put("groq", !(sp.getString("groq", "") ?: "").isEmpty())
                .put("oai", !(sp.getString("oai", "") ?: "").isEmpty()).toString()
        }

        @JavascriptInterface
        fun openEngKeys() {
            runOnUiThread { showEngKeys() }
        }

        // Profile page: keys live natively (the engine reads them from here). Only the Z1 tab has this bridge.
        @JavascriptInterface
        fun engKeysGet(): String {
            val sp = engPrefs()
            return JSONObject().put("gem", sp.getString("gem", "") ?: "")
                .put("groq", sp.getString("groq", "") ?: "")
                .put("oai", sp.getString("oai", "") ?: "").toString()
        }

        @JavascriptInterface
        fun engKeysSet(json: String) {
            try {
                val j = JSONObject(json)
                val ed = engPrefs().edit()
                for (k in arrayOf("gem", "groq", "oai")) if (j.has(k)) ed.putString(k, j.optString(k, "").trim())
                ed.apply()
            } catch (e: Exception) {
            }
        }

        // Engine history (written by x.js on x.com, read by the Z1 History/Stats tabs)
        @JavascriptInterface
        fun histGet(): String = engHistGet()

        @JavascriptInterface
        fun histClear() {
            engPrefs().edit().putString("hist", "[]").apply()
        }

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


    // =====================================================================
    //  SEA / FED ENGINE BRIDGE  (assets/scripts/x.js -> window.ZenEng)
    //  Only gen() is exposed. API keys stay in SharedPreferences "zen_eng" and never reach the page.
    //  Result: window.__zenEngCb(callbackId, jsonString)  ->  {ok:true,text} | {ok:false,error}
    // =====================================================================

    private fun engPrefs() = getSharedPreferences("zen_eng", Context.MODE_PRIVATE)

    private val engCfgKeys = arrayOf("sea", "fed", "auto", "like", "likePct", "target", "targetKw", "tone", "style",
        "keyword", "maxRun", "paceMin", "paceMax", "ageOn", "ageMinMin", "ageMaxMin", "myHandle",
        "grammar", "bigOn", "bigWords", "bigTone", "customTone", "customWords",
        "tUi", "tMode", "tPer", "tBreakEvery", "tBreakMin", "tBreakMax")

    private fun engCfgGetStr(): String = engPrefs().getString("cfg", "{}") ?: "{}"

    private fun engCfgMerge(patchJson: String) {
        try {
            val cur = JSONObject(engCfgGetStr())
            val p = JSONObject(patchJson)
            for (k in engCfgKeys) {
                if (p.has(k)) cur.put(k, p.get(k))
            }
            engPrefs().edit().putString("cfg", cur.toString()).apply()
            // AUTO switched on/off: re-apply tab visibility so the X tab keeps running (or is released) in the background
            if (p.has("auto")) runOnUiThread { switchTo(this.cur) }
        } catch (e: Exception) {
        }
    }

    private fun openEngSettings() {
        val idx = tabs.indexOfFirst { it.isZ1 }
        if (idx >= 0) {
            switchTo(idx)
            tabs[idx].web.evaluateJavascript("window.zlGo&&window.zlGo('engine')", null)
        } else newTab(false, ENG_URL)
    }

    private fun engDeliver(owner: WebView, cbId: String, json: String) {
        runOnUiThread {
            if (tabs.any { it.web === owner }) {
                val lit = JSONObject.quote(json).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
                val js = "(function(){try{var f=window.__zenEngCb;if(typeof f==='function')f(" +
                    JSONObject.quote(cbId) + "," + lit + ");}catch(e){}})();"
                owner.evaluateJavascript(js, null)
            }
        }
    }

    inner class EngBridge(private val owner: WebView) {
        // runtime toggles + settings live in SharedPreferences; the settings page edits the same store
        @JavascriptInterface
        fun getCfg(): String = engCfgGetStr()

        @JavascriptInterface
        fun setCfg(patchJson: String) {
            engCfgMerge(patchJson)
        }

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread { openEngSettings() }
        }

        @JavascriptInterface
        fun logEvent(json: String) {
            val latch = java.util.concurrent.CountDownLatch(1)
            var pageUrl = ""
            runOnUiThread {
                try { pageUrl = owner.url ?: "" } catch (e: Exception) { }
                latch.countDown()
            }
            latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
            val host = try { Uri.parse(pageUrl).host } catch (e: Exception) { null }
            if (!isXHost(host)) return
            engHistAdd(if (json.length > 3000) json.substring(0, 3000) else json)
        }

        @JavascriptInterface
        fun gen(prompt: String, callbackId: String) {
            // WebView.getUrl() must run on the UI thread; JS bridge calls arrive on a background thread
            val latch = java.util.concurrent.CountDownLatch(1)
            var pageUrl = ""
            runOnUiThread {
                try { pageUrl = owner.url ?: "" } catch (e: Exception) { }
                latch.countDown()
            }
            latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
            val host = try { Uri.parse(pageUrl).host } catch (e: Exception) { null }
            if (!isXHost(host)) {
                engDeliver(owner, callbackId, JSONObject().put("ok", false).put("error", "not_x_page").toString())
                return
            }
            val p = if (prompt.length > 6000) prompt.substring(0, 6000) else prompt
            Thread {
                val out = try {
                    JSONObject().put("ok", true).put("text", engGenerate(p)).toString()
                } catch (e: Exception) {
                    JSONObject().put("ok", false).put("error", e.message ?: "AI failed").toString()
                }
                engDeliver(owner, callbackId, out)
            }.start()
        }
    }

    private val histLock = Any()

    private fun engHistGet(): String = synchronized(histLock) { engPrefs().getString("hist", "[]") ?: "[]" }

    private fun engHistAdd(eventJson: String) {
        synchronized(histLock) {
            try {
                val ev = JSONObject(eventJson)
                val arr = JSONArray(engPrefs().getString("hist", "[]") ?: "[]")
                arr.put(ev)
                val keep = 3000
                val out = if (arr.length() > keep) {
                    val n = JSONArray()
                    for (i in (arr.length() - keep) until arr.length()) n.put(arr.get(i))
                    n
                } else arr
                engPrefs().edit().putString("hist", out.toString()).apply()
            } catch (e: Exception) {
            }
        }
    }

    private fun engHttpPost(url: String, bearer: String, body: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 15000
            c.readTimeout = 30000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            if (bearer.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer " + bearer)
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw Exception("API " + code + " " + text.take(120))
            return text
        } finally {
            c.disconnect()
        }
    }

    private fun engGeminiCall(key: String, prompt: String): String {
        val models = arrayOf("gemini-flash-lite-latest", "gemini-flash-latest")
        var last: Exception = Exception("Gemini failed")
        for (m in models) {
            try {
                val body = JSONObject().put("contents", JSONArray().put(JSONObject().put("parts", JSONArray().put(JSONObject().put("text", prompt))))).toString()
                val res = engHttpPost("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent?key=" + key, "", body)
                val t = JSONObject(res).getJSONArray("candidates").getJSONObject(0).getJSONObject("content").getJSONArray("parts").getJSONObject(0).getString("text").trim()
                if (t.isNotEmpty()) return t
            } catch (e: Exception) {
                last = e
            }
        }
        throw last
    }

    private fun engChatCall(url: String, key: String, model: String, prompt: String): String {
        val body = JSONObject().put("model", model).put("max_tokens", 120).put("temperature", 0.85)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", prompt))).toString()
        val res = engHttpPost(url, key, body)
        val t = JSONObject(res).getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content").trim()
        if (t.isEmpty()) throw Exception("empty reply")
        return t
    }

    // tries Gemini, then Groq, then OpenAI (whatever keys are saved)
    private fun engGenerate(prompt: String): String {
        val sp = engPrefs()
        val gem = sp.getString("gem", "") ?: ""
        val groq = sp.getString("groq", "") ?: ""
        val oai = sp.getString("oai", "") ?: ""
        if (gem.isEmpty() && groq.isEmpty() && oai.isEmpty()) throw Exception("No API key - Menu > Engine API keys")
        var last = "AI failed"
        if (gem.isNotEmpty()) {
            try { return engGeminiCall(gem, prompt) } catch (e: Exception) { last = "Gemini: " + (e.message ?: "") }
        }
        if (groq.isNotEmpty()) {
            for (m in arrayOf("llama-3.3-70b-versatile", "llama-3.1-8b-instant")) {
                try { return engChatCall("https://api.groq.com/openai/v1/chat/completions", groq, m, prompt) } catch (e: Exception) { last = "Groq: " + (e.message ?: "") }
            }
        }
        if (oai.isNotEmpty()) {
            try { return engChatCall("https://api.openai.com/v1/chat/completions", oai, "gpt-4o-mini", prompt) } catch (e: Exception) { last = "OpenAI: " + (e.message ?: "") }
        }
        throw Exception(last)
    }

    private fun showEngKeys() {
        val sp = engPrefs()
        val box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(dp(20), dp(10), dp(20), 0)
        fun field(hint: String, saved: String): EditText {
            val e = EditText(this)
            e.setTextColor(Color.WHITE)
            e.setHintTextColor(Color.GRAY)
            e.hint = if (saved.isNotEmpty()) hint + " (saved - type to replace)" else hint
            e.setSingleLine(true)
            box.addView(e, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            return e
        }
        val gem = field("Gemini key (AIza...)", sp.getString("gem", "") ?: "")
        val groq = field("Groq key (gsk_...)", sp.getString("groq", "") ?: "")
        val oai = field("OpenAI key (sk-...)", sp.getString("oai", "") ?: "")
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Engine API keys")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                val ed = sp.edit()
                if (gem.text.toString().trim().isNotEmpty()) ed.putString("gem", gem.text.toString().trim())
                if (groq.text.toString().trim().isNotEmpty()) ed.putString("groq", groq.text.toString().trim())
                if (oai.text.toString().trim().isNotEmpty()) ed.putString("oai", oai.text.toString().trim())
                ed.apply()
                toast("Saved")
            }
            .setNeutralButton("Import from Z1") { _, _ -> importZ1Keys() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // Z1 keeps keys in localStorage "zl_keys" of the appassets origin: a hidden page on that origin can read it
    private fun importZ1Keys() {
        val wv = WebView(this)
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true
        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript("localStorage.getItem('zl_keys')") { raw ->
                    var n = 0
                    try {
                        val s = JSONTokener(raw).nextValue() as? String
                        if (s != null) {
                            val o = JSONObject(s)
                            val ed = engPrefs().edit()
                            for (k in arrayOf("gem", "oai", "groq")) {
                                val v = o.optString(k, "")
                                if (v.isNotEmpty()) { ed.putString(k, v); n++ }
                            }
                            ed.apply()
                        }
                    } catch (e: Exception) {
                    }
                    toast(if (n > 0) "Imported $n key(s) from Z1" else "No keys found in Z1")
                    try { view.destroy() } catch (e: Exception) { }
                }
            }
        }
        wv.loadUrl("https://$APP_HOST/assets/z1/manifest.json")
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
        val wv = KeepAliveWebView(this)
        wv.setBackgroundColor(Color.BLACK)
        val s = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = true
        s.userAgentString = desktopUa()
        s.useWideViewPort = true
        s.loadWithOverviewMode = false
        s.blockNetworkImage = HIDDEN_BLOCK_IMAGES
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, true)
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme != "https") return true
                return !isXHost(u.host)
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                applyDesktopView(view, true)
            }

            override fun onPageFinished(view: WebView, url: String?) {
                applyDesktopView(view, true)
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
<div class="t" onclick="Z.open('$ENG_URL')"><div class="i" style="background:#15803d">ENG</div>Engine</div>
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
        keepWebViewsRunning()
    }

    // Home button while AUTO is running: shrink to a small floating window. A visible window keeps Android drawing frames,
    // which X needs to keep loading new posts (a fully hidden app gets no frames, so the feed stops loading).
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT < 26) return
        try {
            val running = JSONObject(engCfgGetStr()).optBoolean("auto", false)
            if (running) {
                enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(9, 16)).build())
            }
        } catch (e: Exception) {
        }
    }

    override fun onStop() {
        super.onStop()
        keepWebViewsRunning()
    }

    // WebViews must keep running (timers, rendering, network) while the app is minimized
    private fun keepWebViewsRunning() {
        if (!bgEnabled()) return
        for (t in tabs) {
            t.web.onResume()
            t.web.resumeTimers()
        }
    }

    override fun onDestroy() {
        stopBackground()
        hiddenQueue.clear()
        for (r in ArrayList(hiddenActive)) r.abort()
        hiddenActive.clear()
        for (t in tabs) t.web.destroy()
        super.onDestroy()
    }
}
