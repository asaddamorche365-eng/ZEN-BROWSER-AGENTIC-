package com.zen.browser

import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.os.Process
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.security.SecureRandom

/**
 * Minimal Chrome DevTools Protocol client for this app's OWN WebViews.
 * Android WebView exposes a devtools socket "@webview_devtools_remote_<pid>" (MainActivity turns it on with
 * setWebContentsDebuggingEnabled). We connect to it as a plain unix-socket HTTP + WebSocket client (no libraries).
 * Every call blocks: use it from a background thread only.
 */
class CdpClient {
    class Target(val id: String, val url: String, val title: String)

    /** Could not reach the page target (wrong / stale id). The caller may re-resolve the id and retry. */
    class ConnectFail(msg: String) : IOException(msg)

    private val lock = Any()
    private val rnd = SecureRandom()

    private fun open(): LocalSocket {
        val s = LocalSocket()
        try {
            s.connect(LocalSocketAddress("webview_devtools_remote_" + Process.myPid(), LocalSocketAddress.Namespace.ABSTRACT))
            s.soTimeout = 10000
        } catch (e: Exception) {
            try { s.close() } catch (x: Exception) { }
            throw ConnectFail("devtools socket not reachable: " + (e.message ?: e.toString()))
        }
        return s
    }

    private fun readHeaders(ins: InputStream): String {
        val b = ByteArrayOutputStream()
        var last = 0
        while (true) {
            val c = ins.read()
            if (c < 0) break
            b.write(c)
            last = (last shl 8) or c
            if (last == 0x0D0A0D0A) break
            if (b.size() > 16384) break
        }
        return b.toString("UTF-8")
    }

    private fun readN(ins: InputStream, n: Int): ByteArray {
        val buf = ByteArray(n)
        var got = 0
        while (got < n) {
            val r = ins.read(buf, got, n - got)
            if (r < 0) throw IOException("socket closed")
            got += r
        }
        return buf
    }

    /** All page targets of this app's WebViews (every tab + hidden fetch WebViews). */
    fun listTargets(): List<Target> {
        val s = open()
        try {
            val out = s.outputStream
            val ins = s.inputStream
            out.write("GET /json HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n".toByteArray())
            out.flush()
            val head = readHeaders(ins)
            val m = Regex("(?i)content-length:\\s*(\\d+)").find(head)
            val body = if (m != null) readN(ins, m.groupValues[1].toInt()) else ins.readBytes()
            val arr = JSONArray(String(body, Charsets.UTF_8))
            val res = ArrayList<Target>()
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                if (o.optString("type") == "page") res.add(Target(o.optString("id"), o.optString("url"), o.optString("title")))
            }
            return res
        } finally {
            try { s.close() } catch (e: Exception) { }
        }
    }

    // ---------------- WebSocket (RFC 6455, client side, text frames) ----------------
    private inner class Ws(val s: LocalSocket) {
        val ins: InputStream = s.inputStream
        val out = s.outputStream

        fun handshake(path: String) {
            val key = ByteArray(16)
            rnd.nextBytes(key)
            val k = Base64.encodeToString(key, Base64.NO_WRAP)
            out.write(("GET $path HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
                "Sec-WebSocket-Key: $k\r\nSec-WebSocket-Version: 13\r\n\r\n").toByteArray())
            out.flush()
            val head = readHeaders(ins)
            if (!head.startsWith("HTTP/1.1 101")) throw ConnectFail("devtools handshake refused: " + head.lineSequence().firstOrNull())
        }

        fun sendFrame(op: Int, data: ByteArray) {
            val bo = ByteArrayOutputStream()
            bo.write(0x80 or op)
            val mask = ByteArray(4)
            rnd.nextBytes(mask)
            val n = data.size
            if (n < 126) {
                bo.write(0x80 or n)
            } else if (n < 65536) {
                bo.write(0x80 or 126)
                bo.write(n shr 8)
                bo.write(n and 0xff)
            } else {
                bo.write(0x80 or 127)
                for (i in 7 downTo 0) bo.write(((n.toLong() shr (8 * i)) and 0xff).toInt())
            }
            bo.write(mask)
            for (i in data.indices) bo.write(data[i].toInt() xor mask[i % 4].toInt())
            out.write(bo.toByteArray())
            out.flush()
        }

        fun send(text: String) = sendFrame(1, text.toByteArray(Charsets.UTF_8))

        private fun rd(): Int {
            val c = ins.read()
            if (c < 0) throw IOException("socket closed")
            return c
        }

        /** Next complete text message, or null when the peer closed. */
        fun recv(): String? {
            val msg = ByteArrayOutputStream()
            while (true) {
                val b0 = rd()
                val b1 = rd()
                val fin = (b0 and 0x80) != 0
                val op = b0 and 0x0f
                var len = (b1 and 0x7f).toLong()
                if (len == 126L) {
                    len = ((rd() shl 8) or rd()).toLong()
                } else if (len == 127L) {
                    len = 0
                    for (i in 0 until 8) len = (len shl 8) or rd().toLong()
                }
                val masked = (b1 and 0x80) != 0
                val mask = if (masked) readN(ins, 4) else null
                if (len > 8L * 1024 * 1024) throw IOException("frame too big")
                val p = readN(ins, len.toInt())
                if (mask != null) for (i in p.indices) p[i] = (p[i].toInt() xor mask[i % 4].toInt()).toByte()
                when (op) {
                    8 -> return null
                    9 -> sendFrame(10, p)
                    0, 1, 2 -> {
                        msg.write(p)
                        if (fin) return msg.toString("UTF-8")
                    }
                }
            }
        }

        fun close() {
            try { sendFrame(8, ByteArray(0)) } catch (e: Exception) { }
            try { s.close() } catch (e: Exception) { }
        }
    }

    // One long-lived session per page target (like chrome.debugger.attach): emulation set by one call, e.g.
    // Emulation.setFocusEmulationEnabled, stays active until the session is closed.
    private val sessions = HashMap<String, Ws>()
    private var nextId = 1

    /** Drop the session of one tab (target id) or, with null, every session. Emulation made by them is reset. */
    fun closeSessions(targetId: String? = null) {
        synchronized(lock) {
            if (targetId == null) {
                for (w in sessions.values) w.close()
                sessions.clear()
            } else {
                sessions.remove(targetId)?.close()
            }
        }
    }

    /**
     * Runs commands one after another on one page target. Each command: {"method": "...", "params": {...}, "delay": ms-before-it}.
     * Returns one raw CDP reply ({"id":..,"result":{..}} or {"id":..,"error":{..}}) per command.
     */
    fun batch(targetId: String, cmds: JSONArray): JSONArray {
        return synchronized(lock) {
            var ws = sessions[targetId]
            var reused = ws != null
            if (ws == null) {
                ws = Ws(open())
                ws.handshake("/devtools/page/$targetId")   // may throw ConnectFail: caller re-resolves the id
                sessions[targetId] = ws
            }
            val res = JSONArray()
            var i = 0
            while (i < cmds.length()) {
                val c = cmds.getJSONObject(i)
                val delay = c.optLong("delay", 0)
                if (delay > 0) Thread.sleep(if (delay > 5000) 5000 else delay)
                try {
                    val id = nextId++
                    val req = JSONObject().put("id", id).put("method", c.getString("method")).put("params", c.optJSONObject("params") ?: JSONObject())
                    ws!!.send(req.toString())
                    while (true) {
                        val m = ws.recv() ?: throw IOException("devtools closed")
                        val o = JSONObject(m)
                        if (o.optInt("id", -1) == id) {
                            res.put(o)
                            break
                        }
                    }
                    reused = false
                    i++
                } catch (e: IOException) {
                    sessions.remove(targetId)
                    try { ws?.close() } catch (x: Exception) { }
                    if (reused && i == 0) {
                        // old session was dead (tab reloaded / closed): open a fresh one once and redo the first command
                        reused = false
                        ws = Ws(open())
                        ws.handshake("/devtools/page/$targetId")
                        sessions[targetId] = ws
                    } else {
                        throw e
                    }
                }
            }
            res
        }
    }
}
