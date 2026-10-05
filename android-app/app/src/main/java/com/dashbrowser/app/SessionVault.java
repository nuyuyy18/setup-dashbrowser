package com.dashbrowser.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebView;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Per-profile cookie vault.
 * Android WebView shares ONE CookieManager across every profile, so switching
 * profiles used to overwrite the previous session and force a fresh login.
 * This vault snapshots cookies per profile before a switch and restores them
 * after, plus wipes everything when the user closes a session.
 */
public class SessionVault {
    private final SharedPreferences prefs;
    private final WebView webView;
    private final CookieManager cm = CookieManager.getInstance();

    public SessionVault(Activity act, WebView webView) {
        this.prefs = act.getSharedPreferences("dash_session_vault", Context.MODE_PRIVATE);
        this.webView = webView;
    }

    public boolean autoCloseOnExit() {
        return prefs.getBoolean("auto_close_session", false);
    }

    public void setAutoCloseOnExit(boolean enabled) {
        prefs.edit().putBoolean("auto_close_session", enabled).apply();
    }

    /** Remember which host a profile touched so its cookies can be snapshotted later. */
    public void trackHost(String profileId, String url) {
        if (profileId == null || url == null) return;
        try {
            String host = Uri.parse(url).getHost();
            if (host == null || host.isEmpty()) return;
            Set<String> hosts = hostSet(profileId);
            if (hosts.add(host)) {
                prefs.edit().putString("hosts_" + profileId, join(hosts)).apply();
            }
        } catch (Exception ignored) {}
    }

    /** Snapshot live cookies of this profile into local storage. */
    public int persist(String profileId, String startUrl) {
        if (profileId == null) return 0;
        Set<String> hosts = hostSet(profileId);
        String host = hostOf(startUrl);
        if (host != null) hosts.add(host);

        SharedPreferences.Editor ed = prefs.edit();
        int saved = 0;
        StringBuilder list = new StringBuilder();
        for (String h : hosts) {
            list.append(h).append(",");
            String ck = cm.getCookie("https://" + h);
            if (ck != null && !ck.isEmpty()) {
                ed.putString("ck_" + profileId + "_" + h, ck);
                saved++;
            }
        }
        ed.putString("hosts_" + profileId, list.toString()).apply();
        return saved;
    }

    /** Write stored cookies back into the shared CookieManager for this profile. */
    public void restore(String profileId) {
        if (profileId == null) return;
        for (String h : hostSet(profileId)) {
            String ck = prefs.getString("ck_" + profileId + "_" + h, "");
            if (ck == null || ck.isEmpty()) continue;
            for (String pair : ck.split(";")) {
                pair = pair.trim();
                if (pair.isEmpty() || !pair.contains("=")) continue;
                // ponytail: cookie attributes (Secure/SameSite/expiry) are dropped,
                // host+path is enough for Gmail/IG/SNS web sessions. Upgrade to
                // CookieManager.setCookie with full attribute strings if a site
                // ever rejects them.
                cm.setCookie("https://" + h, pair + "; domain=" + h + "; path=/");
            }
        }
        cm.flush();
    }

    /** Drop the profile's stored snapshot so it can never be restored again. */
    public void forget(String profileId) {
        if (profileId == null) return;
        SharedPreferences.Editor ed = prefs.edit();
        for (String h : hostSet(profileId)) ed.remove("ck_" + profileId + "_" + h);
        ed.remove("hosts_" + profileId).apply();
    }

    /** Kill every live cookie + cached page. blankPage also detaches the renderer. */
    public void wipe(boolean blankPage) {
        try {
            cm.removeAllCookies(null);
            cm.removeSessionCookies(null);
            cm.flush();
        } catch (Exception ignored) {}
        try {
            webView.stopLoading();
            webView.clearCache(true);
            webView.clearHistory();
            if (blankPage) webView.loadUrl("about:blank");
        } catch (Exception ignored) {}
    }

    public void saveLastUrl(String profileId, String url) {
        if (profileId == null || url == null || url.isEmpty() || url.equals("about:blank")) return;
        prefs.edit().putString("last_url_" + profileId, url).apply();
    }

    public String getLastUrl(String profileId, String fallback) {
        if (profileId == null) return fallback;
        return prefs.getString("last_url_" + profileId, fallback);
    }

    public int cookieCount(String profileId) {
        if (profileId == null) return 0;
        int n = 0;
        for (String h : hostSet(profileId)) {
            if (!prefs.getString("ck_" + profileId + "_" + h, "").isEmpty()) n++;
        }
        return n;
    }

    private Set<String> hostSet(String profileId) {
        Set<String> set = new LinkedHashSet<String>();
        String raw = prefs.getString("hosts_" + profileId, "");
        for (String h : raw.split(",")) {
            h = h.trim();
            if (!h.isEmpty()) set.add(h);
        }
        return set;
    }

    private String hostOf(String url) {
        if (url == null || url.trim().isEmpty()) return null;
        try {
            String u = url.trim();
            if (!u.startsWith("http")) u = "https://" + u;
            return Uri.parse(u).getHost();
        } catch (Exception e) {
            return null;
        }
    }

    private String join(Set<String> hosts) {
        StringBuilder sb = new StringBuilder();
        for (String h : hosts) sb.append(h).append(",");
        return sb.toString();
    }
}