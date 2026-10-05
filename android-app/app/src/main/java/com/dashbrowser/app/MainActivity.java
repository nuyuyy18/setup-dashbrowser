package com.dashbrowser.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.*;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.*;

public class MainActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout sidebarPanel;
    private LinearLayout profilesContainer;
    private EditText inputUrl;
    private TextView txtActiveName, txtActiveDetails, txtSidebarTitle;
    private LinearLayout cardActiveProfile;
    private View topToolbar, rootLayout;
    private Button btnToggleTheme, btnToggleSidebar;
    
    // FAB tracking views
    private LinearLayout fabContainer, fabSheet;
    private EditText fabInputUrl, fabInputNote;
    private Spinner fabSpinnerAction;
    private Button fabMainButton;

    private boolean isDarkMode = true;
    private boolean isSidebarVisible = true;
    private SharedPreferences prefs;
    private HermesRouterManager hermesManager;
    private TextView txtHermesModel;

    static class LocalProfile {
        String id;
        String name;
        String startUrl;
        String userAgent;
        String color;
        String cookiesJson; // Raw or JSON array string
        String proxyHost;
        int proxyPort;

        LocalProfile(String id, String name, String startUrl, String color, String cookiesJson) {
            this.id = id;
            this.name = name;
            this.startUrl = startUrl != null && !startUrl.isEmpty() ? startUrl : "https://www.google.com";
            this.color = color != null ? color : "#0A84FF";
            this.cookiesJson = cookiesJson != null ? cookiesJson : "[]";
            this.userAgent = "";
            this.proxyHost = "";
            this.proxyPort = 0;
        }
    }

    private final List<LocalProfile> profileList = new ArrayList<LocalProfile>();
    private LocalProfile activeProfile;
    private SessionVault vault;
    private boolean switchedOnce = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("dash_local_prefs", Context.MODE_PRIVATE);

        initViews();
        setupWebView();
        vault = new SessionVault(this, webView);
        loadSavedData();
        renderProfilesList();

        if (!profileList.isEmpty()) {
            selectProfile(profileList.get(0));
        } else {
            LocalProfile def = new LocalProfile(UUID.randomUUID().toString(), "Main Account", "https://www.google.com", "#0A84FF", "[]");
            profileList.add(def);
            saveData();
            selectProfile(def);
        }
    }

    private void initViews() {
        rootLayout = findViewById(R.id.root_layout);
        topToolbar = findViewById(R.id.top_toolbar);
        sidebarPanel = findViewById(R.id.sidebar_panel);
        profilesContainer = findViewById(R.id.profiles_list_container);
        webView = findViewById(R.id.native_webview);
        progressBar = findViewById(R.id.page_progress);
        inputUrl = findViewById(R.id.input_url);
        txtActiveName = findViewById(R.id.txt_active_name);
        txtActiveDetails = findViewById(R.id.txt_active_details);
        txtSidebarTitle = findViewById(R.id.txt_sidebar_title);
        cardActiveProfile = findViewById(R.id.card_active_profile);
        btnToggleTheme = findViewById(R.id.btn_toggle_theme);
        btnToggleSidebar = findViewById(R.id.btn_toggle_sidebar);

        fabContainer = findViewById(R.id.fab_container);
        fabSheet = findViewById(R.id.fab_sheet);
        fabInputUrl = findViewById(R.id.fab_input_post_url);
        fabInputNote = findViewById(R.id.fab_input_note);
        fabSpinnerAction = findViewById(R.id.fab_spinner_action);
        fabMainButton = findViewById(R.id.fab_main_button);

        // Setup spinner actions
        String[] actions = new String[]{"Komentar (Comment)", "Sukai (Like)", "Follow Akun", "Unggah Konten (Post)", "Share / Repost"};
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, actions);
        fabSpinnerAction.setAdapter(adapter);

        // Navigation
        findViewById(R.id.btn_nav_back).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { if (webView.canGoBack()) webView.goBack(); }
        });
        findViewById(R.id.btn_nav_forward).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { if (webView.canGoForward()) webView.goForward(); }
        });
        findViewById(R.id.btn_nav_reload).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { webView.reload(); }
        });

        findViewById(R.id.btn_go).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { navigateToUrl(inputUrl.getText().toString()); }
        });
        inputUrl.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                navigateToUrl(inputUrl.getText().toString());
                return true;
            }
        });

        // Sidebar Toggle
        btnToggleSidebar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                isSidebarVisible = !isSidebarVisible;
                sidebarPanel.setVisibility(isSidebarVisible ? View.VISIBLE : View.GONE);
                btnToggleSidebar.setText(isSidebarVisible ? "☰" : "▶");
            }
        });

        // Theme Toggle
        btnToggleTheme.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                isDarkMode = !isDarkMode;
                applyTheme();
            }
        });

        // Add Profile
        findViewById(R.id.btn_add_profile).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showAddProfileDialog(); }
        });

        // Inject Cookie Modal
        findViewById(R.id.btn_top_inject).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showInjectCookieDialog(); }
        });

        // Spreadsheet Modal
        findViewById(R.id.btn_top_spreadsheet).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showSpreadsheetDialog(); }
        });

        // VPN / Proxy Modal
        findViewById(R.id.btn_top_vpn).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showVpnDialog(); }
        });

        // Activity Logs Dialog
        findViewById(R.id.btn_top_logs).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showLogsDialog(); }
        });

        // Hermes & 9router Manager Setup
        hermesManager = new HermesRouterManager(this, webView);
        txtHermesModel = findViewById(R.id.txt_hermes_model);
        if (txtHermesModel != null) {
            txtHermesModel.setText("Model: " + hermesManager.getModel() + " · Lokal");
        }

        View btnHermesSetup = findViewById(R.id.btn_hermes_setup);
        if (btnHermesSetup != null) {
            btnHermesSetup.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    hermesManager.showSetupDialog(new Runnable() {
                        @Override public void run() {
                            if (txtHermesModel != null) {
                                txtHermesModel.setText("Model: " + hermesManager.getModel() + " · Lokal");
                            }
                        }
                    });
                }
            });
        }

        View btnHermesCopilot = findViewById(R.id.btn_hermes_copilot);
        if (btnHermesCopilot != null) {
            btnHermesCopilot.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { hermesManager.showPromptDialog(); }
            });
        }

        // Close Session Manual
        Button btnCloseSession = findViewById(R.id.btn_close_session);
        if (btnCloseSession != null) {
            btnCloseSession.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Tutup Sesi Browser")
                        .setMessage("Tutup proses browser dan hapus cache/kuki aktif saat ini?\n\nKredensial profil Anda tetap tersimpan aman di vault lokal.")
                        .setPositiveButton("Tutup & Bersihkan", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                if (vault != null && activeProfile != null) {
                                    vault.persist(activeProfile.id, activeProfile.startUrl);
                                    vault.wipe(true);
                                    txtActiveDetails.setText("Sesi Ditutup · Cache Dibersihkan");
                                    Toast.makeText(MainActivity.this, "Sesi ditutup & dibersihkan", Toast.LENGTH_SHORT).show();
                                }
                            }
                        })
                        .setNegativeButton("Batal", null)
                        .show();
                }
            });
        }

        // Toggle Auto-Close On Exit
        Button btnAutoClose = findViewById(R.id.btn_auto_close);
        if (btnAutoClose != null) {
            btnAutoClose.setText(vault != null && vault.autoCloseOnExit() ? "⏱ Auto-close: ON" : "⏱ Auto-close: OFF");
            btnAutoClose.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (vault == null) return;
                    boolean next = !vault.autoCloseOnExit();
                    vault.setAutoCloseOnExit(next);
                    btnAutoClose.setText(next ? "⏱ Auto-close: ON" : "⏱ Auto-close: OFF");
                    Toast.makeText(MainActivity.this, next ? "Auto-close aktif saat keluar aplikasi" : "Auto-close dinonaktifkan", Toast.LENGTH_SHORT).show();
                }
            });
        }

        View btnTopHermes = findViewById(R.id.btn_top_hermes);
        if (btnTopHermes != null) {
            btnTopHermes.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { hermesManager.showPromptDialog(); }
            });
        }

        // FAB Handlers
        fabMainButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (fabSheet.getVisibility() == View.VISIBLE) {
                    fabSheet.setVisibility(View.GONE);
                } else {
                    fabSheet.setVisibility(View.VISIBLE);
                    fabInputUrl.setText(webView.getUrl() != null ? webView.getUrl() : "");
                    fabInputNote.requestFocus();
                }
            }
        });

        findViewById(R.id.fab_btn_cancel).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { fabSheet.setVisibility(View.GONE); }
        });

        findViewById(R.id.fab_btn_hide_all).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                fabSheet.setVisibility(View.GONE);
                fabContainer.setVisibility(View.GONE);
                Toast.makeText(MainActivity.this, "FAB disembunyikan. Buka menu Laporan di atas bila perlu.", Toast.LENGTH_SHORT).show();
            }
        });

        findViewById(R.id.fab_btn_submit).setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { saveActivityReport(); }
        });

        // Search Profile filter
        EditText searchInput = findViewById(R.id.input_search_profile);
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { filterProfiles(s.toString()); }
            @Override public void afterTextChanged(Editable s) {}
        });
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                inputUrl.setText(url);
                if (vault != null && activeProfile != null && url != null) {
                    vault.trackHost(activeProfile.id, url);
                    vault.persist(activeProfile.id, url);
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                view.post(new Runnable() {
                    @Override public void run() { view.reload(); }
                });
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });
    }

    private void selectProfile(LocalProfile p) {
        // 1. Snapshot URL and cookies of current profile before switching
        if (switchedOnce && activeProfile != null && !activeProfile.id.equals(p.id)) {
            String currentUrl = webView.getUrl();
            if (currentUrl != null && !currentUrl.isEmpty() && !currentUrl.equals("about:blank")) {
                vault.saveLastUrl(activeProfile.id, currentUrl);
            }
            int saved = vault.persist(activeProfile.id, currentUrl != null ? currentUrl : activeProfile.startUrl);
            if (saved > 0) {
                Toast.makeText(this, "Sesi " + activeProfile.name + " tersimpan (" + saved + " domain)", Toast.LENGTH_SHORT).show();
            }
            // Wipe shared CookieManager so incoming profile starts completely isolated
            vault.wipe(false);
        }
        switchedOnce = true;
        activeProfile = p;

        // 2. Restore vault cookies for the new profile
        vault.restore(p.id);

        // 3. Also inject any manually-stored cookies from profile data
        injectCookiesToManager(p.startUrl, p.cookiesJson);

        int vaultCount = vault.cookieCount(p.id);
        int manualCount = countCookies(p.cookiesJson);
        txtActiveName.setText(p.name);
        txtActiveDetails.setText((vaultCount + manualCount) + " Sesi Aktif · Lokal GPU Native");

        renderProfilesList();

        // 4. Navigate to LAST OPENED URL for this profile (fall back to startUrl)
        String targetUrl = vault.getLastUrl(p.id, p.startUrl);
        navigateToUrl(targetUrl);
    }

    private void navigateToUrl(String url) {
        if (url == null || url.trim().isEmpty()) return;
        String target = url.trim();
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
            target = target.contains(".") && !target.contains(" ") ? "https://" + target : "https://www.google.com/search?q=" + Uri.encode(target);
        }
        inputUrl.setText(target);
        webView.loadUrl(target);
    }

    private void injectCookiesToManager(String url, String cookiesStr) {
        if (cookiesStr == null || cookiesStr.trim().isEmpty() || cookiesStr.equals("[]")) return;
        try {
            CookieManager cm = CookieManager.getInstance();
            Uri uri = Uri.parse(url.startsWith("http") ? url : "https://" + url);
            String domain = uri.getHost() != null ? uri.getHost() : "google.com";

            if (cookiesStr.trim().startsWith("[")) {
                JSONArray arr = new JSONArray(cookiesStr);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    String name = obj.optString("name", "");
                    String value = obj.optString("value", "");
                    String cDomain = obj.optString("domain", domain);
                    if (!name.isEmpty()) {
                        String cookieVal = name + "=" + value + "; domain=" + cDomain + "; path=/; Secure";
                        cm.setCookie(cDomain, cookieVal);
                    }
                }
            } else {
                String[] lines = cookiesStr.split("\\r?\\n");
                for (String line : lines) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) continue;
                    String[] parts = line.split("\\t");
                    if (parts.length >= 7) {
                        String cDomain = parts[0];
                        String name = parts[5];
                        String value = parts[6];
                        cm.setCookie(cDomain, name + "=" + value + "; domain=" + cDomain + "; path=/; Secure");
                    } else if (line.contains("=")) {
                        String[] pairs = line.split(";");
                        for (String pair : pairs) {
                            String trimmed = pair.trim();
                            if (!trimmed.isEmpty() && trimmed.contains("=")) {
                                cm.setCookie(domain, trimmed + "; path=/; Secure");
                            }
                        }
                    }
                }
            }
            cm.flush();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private int countCookies(String cookiesStr) {
        if (cookiesStr == null || cookiesStr.trim().isEmpty() || cookiesStr.equals("[]")) return 0;
        try {
            if (cookiesStr.trim().startsWith("[")) {
                return new JSONArray(cookiesStr).length();
            }
            int c = 0;
            for (String l : cookiesStr.split("\\r?\\n")) {
                if (!l.trim().isEmpty() && !l.startsWith("#")) c++;
            }
            return Math.max(1, c);
        } catch (Exception e) {
            return 1;
        }
    }

    private void renderProfilesList() {
        profilesContainer.removeAllViews();
        for (int i = 0; i < profileList.size(); i++) {
            final LocalProfile p = profileList.get(i);
            boolean isCur = activeProfile != null && activeProfile.id.equals(p.id);
            
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.HORIZONTAL);
            item.setGravity(Gravity.CENTER_VERTICAL);
            item.setPadding(12, 10, 12, 10);
            item.setBackgroundColor(isCur ? (isDarkMode ? Color.parseColor("#242831") : Color.parseColor("#E0E0E6")) : Color.TRANSPARENT);
            item.setClickable(true);
            item.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { selectProfile(p); }
            });

            // Color dot
            View dot = new View(this);
            dot.setBackgroundColor(Color.parseColor(p.color));
            LinearLayout.LayoutParams dotLp = new LinearLayout.LayoutParams(14, 14);
            dotLp.setMargins(0, 0, 12, 0);
            item.addView(dot, dotLp);

            // Title & cookie count
            LinearLayout textCol = new LinearLayout(this);
            textCol.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams textLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);

            TextView txtTitle = new TextView(this);
            txtTitle.setText(p.name);
            txtTitle.setTextSize(11);
            txtTitle.setTextColor(isDarkMode ? Color.WHITE : Color.parseColor("#1D1D1F"));
            textCol.addView(txtTitle);

            TextView txtSub = new TextView(this);
            int cc = countCookies(p.cookiesJson);
            txtSub.setText(cc + " Cookie");
            txtSub.setTextSize(9);
            txtSub.setTextColor(isDarkMode ? Color.parseColor("#9ca3af") : Color.parseColor("#6e6e73"));
            textCol.addView(txtSub);

            item.addView(textCol, textLp);

            // Edit button
            Button btnEdit = new Button(this);
            btnEdit.setText("✎");
            btnEdit.setTextSize(10);
            btnEdit.setTextColor(Color.parseColor("#60a5fa"));
            btnEdit.setBackgroundColor(Color.TRANSPARENT);
            btnEdit.setPadding(4, 0, 4, 0);
            btnEdit.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { showEditProfileDialog(p); }
            });
            item.addView(btnEdit, new LinearLayout.LayoutParams(34, 30));

            // Delete button
            Button btnDel = new Button(this);
            btnDel.setText("🗑");
            btnDel.setTextSize(10);
            btnDel.setTextColor(Color.parseColor("#f87171"));
            btnDel.setBackgroundColor(Color.TRANSPARENT);
            btnDel.setPadding(4, 0, 4, 0);
            btnDel.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { deleteProfile(p); }
            });
            item.addView(btnDel, new LinearLayout.LayoutParams(34, 30));

            profilesContainer.addView(item, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
    }

    private void filterProfiles(String query) {
        String q = query.toLowerCase().trim();
        for (int i = 0; i < profilesContainer.getChildCount(); i++) {
            View child = profilesContainer.getChildAt(i);
            if (i < profileList.size()) {
                LocalProfile p = profileList.get(i);
                child.setVisibility(p.name.toLowerCase().contains(q) ? View.VISIBLE : View.GONE);
            }
        }
    }

    private void showAddProfileDialog() {
        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("Tambah Profil Baru");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(30, 20, 30, 10);

        final EditText inputName = new EditText(this);
        inputName.setHint("Nama Akun (e.g. Akun Shopee/YouTube 1)");
        layout.addView(inputName);

        final EditText inputStartUrl = new EditText(this);
        inputStartUrl.setHint("Start URL (e.g. https://www.youtube.com)");
        inputStartUrl.setText("https://www.google.com");
        layout.addView(inputStartUrl);

        b.setView(layout);
        b.setPositiveButton("Simpan", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String name = inputName.getText().toString().trim();
                if (name.isEmpty()) name = "Profil " + (profileList.size() + 1);
                String sUrl = inputStartUrl.getText().toString().trim();
                LocalProfile p = new LocalProfile(UUID.randomUUID().toString(), name, sUrl, "#0A84FF", "[]");
                profileList.add(p);
                saveData();
                selectProfile(p);
            }
        });
        b.setNegativeButton("Batal", null);
        b.show();
    }

    private void showEditProfileDialog(final LocalProfile p) {
        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("Edit Profil");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(30, 20, 30, 10);

        final EditText inputName = new EditText(this);
        inputName.setText(p.name);
        layout.addView(inputName);

        final EditText inputStartUrl = new EditText(this);
        inputStartUrl.setText(p.startUrl);
        layout.addView(inputStartUrl);

        b.setView(layout);
        b.setPositiveButton("Update", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                p.name = inputName.getText().toString().trim();
                p.startUrl = inputStartUrl.getText().toString().trim();
                saveData();
                renderProfilesList();
                if (activeProfile != null && activeProfile.id.equals(p.id)) {
                    txtActiveName.setText(p.name);
                }
            }
        });
        b.setNegativeButton("Batal", null);
        b.show();
    }

    private void deleteProfile(final LocalProfile p) {
        if (profileList.size() <= 1) {
            Toast.makeText(this, "Minimal harus ada 1 profil aktif.", Toast.LENGTH_SHORT).show();
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Hapus Profil")
            .setMessage("Yakin ingin menghapus profil \"" + p.name + "\"?")
            .setPositiveButton("Hapus", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    profileList.remove(p);
                    saveData();
                    if (activeProfile != null && activeProfile.id.equals(p.id)) {
                        selectProfile(profileList.get(0));
                    } else {
                        renderProfilesList();
                    }
                }
            })
            .setNegativeButton("Batal", null)
            .show();
    }

    private void showInjectCookieDialog() {
        if (activeProfile == null) return;
        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("Inject Cookie ke: " + activeProfile.name);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(30, 20, 30, 10);

        TextView tip = new TextView(this);
        tip.setText("Paste Cookie (Format JSON Array, Netscape .txt, atau string k=v):");
        tip.setTextSize(11);
        tip.setTextColor(Color.GRAY);
        layout.addView(tip);

        final EditText inputCookie = new EditText(this);
        inputCookie.setHint("[{\"name\":\"sessionid\",\"value\":\"...\"}]");
        inputCookie.setLines(6);
        inputCookie.setGravity(Gravity.TOP);
        inputCookie.setText(activeProfile.cookiesJson.equals("[]") ? "" : activeProfile.cookiesJson);
        layout.addView(inputCookie);

        b.setView(layout);
        b.setPositiveButton("Inject Sekarang", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String raw = inputCookie.getText().toString().trim();
                if (!raw.isEmpty()) {
                    activeProfile.cookiesJson = raw;
                    saveData();
                    injectCookiesToManager(activeProfile.startUrl, raw);
                    webView.reload();
                    selectProfile(activeProfile);
                    Toast.makeText(MainActivity.this, "Cookie berhasil diinjeksi ke profil lokal!", Toast.LENGTH_SHORT).show();
                }
            }
        });
        b.setNegativeButton("Tutup", null);
        b.show();
    }

    private void showVpnDialog() {
        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("🌐 Cek Status IP, Proxy & Jaringan");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(35, 20, 35, 10);

        final TextView statusView = new TextView(this);
        statusView.setText("Memeriksa alamat IP dan parameter jaringan...");
        statusView.setTextSize(12);
        statusView.setTextColor(Color.WHITE);
        statusView.setPadding(0, 10, 0, 15);
        layout.addView(statusView);

        // Fetch IP & Proxy Status asynchronously
        new Thread(new Runnable() {
            @Override
            public void run() {
                String resultText = "";
                try {
                    java.net.URL url = new java.net.URL("https://ipapi.co/json/");
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0");
                    
                    java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    org.json.JSONObject obj = new org.json.JSONObject(sb.toString());
                    final String ip = obj.optString("ip", "-");
                    final String city = obj.optString("city", "-");
                    final String region = obj.optString("region", "-");
                    final String country = obj.optString("country_name", "-");
                    final String org = obj.optString("org", "-");
                    final String timezone = obj.optString("timezone", "-");

                    resultText = "• Profil Aktif: " + (activeProfile != null ? activeProfile.name : "Default") + "\n"
                               + "• IP Publik: " + ip + "\n"
                               + "• Lokasi: " + city + ", " + region + " (" + country + ")\n"
                               + "• Operator/ISP: " + org + "\n"
                               + "• Zona Waktu: " + timezone + "\n"
                               + "• Waktu Cek: " + new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(new java.util.Date()) + "\n"
                               + "• Status: Terhubung Normal ✓";
                } catch (Exception e) {
                    try {
                        java.net.URL url2 = new java.net.URL("https://api.ipify.org?format=json");
                        java.net.HttpURLConnection conn2 = (java.net.HttpURLConnection) url2.openConnection();
                        conn2.setConnectTimeout(5000);
                        java.io.BufferedReader r2 = new java.io.BufferedReader(new java.io.InputStreamReader(conn2.getInputStream()));
                        StringBuilder sb2 = new StringBuilder();
                        String l2;
                        while ((l2 = r2.readLine()) != null) sb2.append(l2);
                        r2.close();
                        org.json.JSONObject o2 = new org.json.JSONObject(sb2.toString());
                        resultText = "• Profil: " + (activeProfile != null ? activeProfile.name : "Default") + "\n"
                                   + "• IP Publik: " + o2.optString("ip", "-") + "\n"
                                   + "• Status: Terhubung (Simple IP Mode)";
                    } catch (Exception err2) {
                        resultText = "Gagal memindai jaringan: " + err2.getMessage() + "\nPastikan koneksi internet atau hotspot aktif.";
                    }
                }

                final String finalReport = resultText;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        statusView.setText(finalReport);
                    }
                });
            }
        }).start();

        b.setView(layout);

        b.setPositiveButton("Ekspor Laporan", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String report = statusView.getText().toString();
                android.content.Intent share = new android.content.Intent(android.content.Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(android.content.Intent.EXTRA_SUBJECT, "Laporan Status Jaringan & Proxy DashBrowser");
                share.putExtra(android.content.Intent.EXTRA_TEXT, "=== LAPORAN JARINGAN & PROXY DASHBROWSER ===\n\n" + report);
                startActivity(android.content.Intent.createChooser(share, "Bagikan / Ekspor Laporan"));
            }
        });

        b.setNeutralButton("Salin Teks", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("Laporan Jaringan", statusView.getText().toString()));
                    Toast.makeText(MainActivity.this, "Laporan disalin ke clipboard!", Toast.LENGTH_SHORT).show();
                }
            }
        });

        b.setNegativeButton("Tutup", null);
        b.show();
    }

    private void showSpreadsheetDialog() {
        AlertDialog.Builder b = new AlertDialog.Builder(this);
        b.setTitle("📊 Batch Import Spreadsheet Cookie");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(30, 20, 30, 10);

        TextView tip = new TextView(this);
        tip.setText("Copy-Paste tabel dari Google Sheets / Excel (Kolom: Nama | Start URL | Cookie):");
        tip.setTextSize(11);
        tip.setTextColor(Color.GRAY);
        layout.addView(tip);

        final EditText inputTable = new EditText(this);
        inputTable.setHint("Akun 1\thttps://www.youtube.com\tsessionid=abc; ds_user_id=123\nAkun 2\thttps://www.instagram.com\t[{\"name\":\"sessionid\",\"value\":\"xyz\"}]");
        inputTable.setLines(8);
        inputTable.setGravity(Gravity.TOP);
        layout.addView(inputTable);

        b.setView(layout);
        b.setPositiveButton("Proses & Buat Profil", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String raw = inputTable.getText().toString().trim();
                if (raw.isEmpty()) return;
                String[] rows = raw.split("\\r?\\n");
                int created = 0;
                for (String row : rows) {
                    row = row.trim();
                    if (row.isEmpty() || row.toLowerCase().startsWith("nama") || row.toLowerCase().startsWith("account")) continue;
                    String[] cols = row.split("\\t|,");
                    if (cols.length >= 1) {
                        String name = cols[0].trim();
                        String sUrl = cols.length >= 2 && cols[1].contains(".") ? cols[1].trim() : "https://www.google.com";
                        String cookie = cols.length >= 3 ? cols[2].trim() : "[]";
                        LocalProfile p = new LocalProfile(UUID.randomUUID().toString(), name, sUrl, "#30D158", cookie);
                        profileList.add(p);
                        created++;
                    }
                }
                saveData();
                renderProfilesList();
                Toast.makeText(MainActivity.this, "Berhasil membuat " + created + " profil dari spreadsheet!", Toast.LENGTH_SHORT).show();
            }
        });
        b.setNegativeButton("Batal", null);
        b.show();
    }

    private void saveActivityReport() {
        String postUrl = fabInputUrl.getText().toString().trim();
        String note = fabInputNote.getText().toString().trim();
        String action = fabSpinnerAction.getSelectedItem().toString();
        String account = activeProfile != null ? activeProfile.name : "Local";

        if (postUrl.isEmpty()) {
            Toast.makeText(this, "Link postingan tidak boleh kosong.", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            String savedLogs = prefs.getString("dash_local_logs", "[]");
            JSONArray arr = new JSONArray(savedLogs);
            JSONObject log = new JSONObject();
            log.put("id", UUID.randomUUID().toString());
            log.put("accountName", account);
            log.put("action", action);
            log.put("postUrl", postUrl);
            log.put("note", note);
            log.put("timestamp", System.currentTimeMillis());

            // Otomatis tangkap cookie aktif saat aktivitas dicatat
            String liveCookie = android.webkit.CookieManager.getInstance().getCookie(postUrl);
            if (liveCookie == null || liveCookie.isEmpty()) {
                liveCookie = (activeProfile != null) ? activeProfile.cookiesJson : "";
            }
            log.put("cookie", liveCookie != null ? liveCookie : "");

            arr.put(log);

            prefs.edit().putString("dash_local_logs", arr.toString()).apply();
            fabInputNote.setText("");
            fabSheet.setVisibility(View.GONE);
            Toast.makeText(this, "Laporan aktivitas + Cookie otomatis tersimpan!", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Gagal menyimpan laporan: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void showLogsDialog() {
        try {
            String savedLogs = prefs.getString("dash_local_logs", "[]");
            final JSONArray arr = new JSONArray(savedLogs);
            final StringBuilder sb = new StringBuilder();
            if (arr.length() == 0) {
                sb.append("Belum ada laporan aktivitas tersimpan.");
            } else {
                for (int i = arr.length() - 1; i >= 0; i--) {
                    JSONObject obj = arr.getJSONObject(i);
                    String acc = obj.optString("accountName", "-");
                    String act = obj.optString("action", "-");
                    String url = obj.optString("postUrl", "-");
                    String note = obj.optString("note", "");
                    String cookie = obj.optString("cookie", "");

                    sb.append("• ").append(acc).append(" | ").append(act).append("\n");
                    sb.append("  URL: ").append(url).append("\n");
                    if (!note.isEmpty()) {
                        sb.append("  Catatan: ").append(note).append("\n");
                    }
                    if (!cookie.isEmpty()) {
                        String cookieShort = cookie.length() > 45 ? cookie.substring(0, 45) + "..." : cookie;
                        sb.append("  Cookie: ").append(cookieShort).append("\n");
                    }
                    sb.append("\n");
                }
            }

            AlertDialog.Builder b = new AlertDialog.Builder(this);
            b.setTitle("📋 Laporan & Tracking Aktivitas (" + arr.length() + ")");
            b.setMessage(sb.toString());

            // Tombol Ekspor CSV / Teks Lengkap
            b.setPositiveButton("Ekspor Laporan", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    if (arr.length() == 0) {
                        Toast.makeText(MainActivity.this, "Tidak ada data untuk diekspor.", Toast.LENGTH_SHORT).show();
                        return;
                    }

                    // Format CSV lengkap dengan Cookie
                    StringBuilder csv = new StringBuilder();
                    csv.append("Timestamp,Nama Profil,Aktivitas,URL,Catatan,Cookie\n");
                    for (int i = 0; i < arr.length(); i++) {
                        try {
                            JSONObject obj = arr.getJSONObject(i);
                            long ts = obj.optLong("timestamp", System.currentTimeMillis());
                            String timeStr = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(new java.util.Date(ts));
                            String acc = obj.optString("accountName", "").replace(",", ";");
                            String act = obj.optString("action", "").replace(",", ";");
                            String url = obj.optString("postUrl", "").replace(",", ";");
                            String note = obj.optString("note", "").replace(",", ";");
                            String cookie = obj.optString("cookie", "").replace("\"", "\"\"");

                            csv.append(timeStr).append(",")
                               .append(acc).append(",")
                               .append(act).append(",")
                               .append(url).append(",")
                               .append(note).append(",")
                               .append("\"").append(cookie).append("\"\n");
                        } catch (Exception ignored) {}
                    }

                    android.content.Intent share = new android.content.Intent(android.content.Intent.ACTION_SEND);
                    share.setType("text/plain");
                    share.putExtra(android.content.Intent.EXTRA_SUBJECT, "Laporan Aktivitas & Cookie DashBrowser");
                    share.putExtra(android.content.Intent.EXTRA_TEXT, csv.toString());
                    startActivity(android.content.Intent.createChooser(share, "Ekspor / Bagikan Laporan (CSV)"));
                }
            });

            b.setNeutralButton("Salin Teks", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("Laporan Aktivitas", sb.toString()));
                        Toast.makeText(MainActivity.this, "Ringkasan laporan disalin ke clipboard!", Toast.LENGTH_SHORT).show();
                    }
                }
            });

            b.setNegativeButton("Hapus Semua", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    prefs.edit().putString("dash_local_logs", "[]").apply();
                    Toast.makeText(MainActivity.this, "Log aktivitas dibersihkan.", Toast.LENGTH_SHORT).show();
                }
            });
            b.show();
        } catch (Exception e) {
            Toast.makeText(this, "Error membaca log: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void applyTheme() {
        btnToggleTheme.setText(isDarkMode ? "☀️" : "🌙");
        int bgRoot = isDarkMode ? Color.parseColor("#0d0e12") : Color.parseColor("#F5F5F7");
        int bgToolbar = isDarkMode ? Color.parseColor("#16181d") : Color.parseColor("#FFFFFF");
        int bgSidebar = isDarkMode ? Color.parseColor("#13151a") : Color.parseColor("#EBEBF0");
        int bgCard = isDarkMode ? Color.parseColor("#1a1d24") : Color.parseColor("#FFFFFF");
        int txtPrimary = isDarkMode ? Color.WHITE : Color.parseColor("#1D1D1F");
        int txtSecondary = isDarkMode ? Color.parseColor("#9ca3af") : Color.parseColor("#6e6e73");

        rootLayout.setBackgroundColor(bgRoot);
        topToolbar.setBackgroundColor(bgToolbar);
        sidebarPanel.setBackgroundColor(bgSidebar);
        cardActiveProfile.setBackgroundColor(bgCard);
        txtActiveName.setTextColor(txtPrimary);
        txtActiveDetails.setTextColor(txtSecondary);
        txtSidebarTitle.setTextColor(txtSecondary);
        inputUrl.setBackgroundColor(isDarkMode ? Color.parseColor("#0d0e12") : Color.parseColor("#E5E5EA"));
        inputUrl.setTextColor(txtPrimary);

        renderProfilesList();
    }

    private void loadSavedData() {
        try {
            String profilesJson = prefs.getString("dash_local_profiles", "");
            if (!profilesJson.isEmpty()) {
                JSONArray arr = new JSONArray(profilesJson);
                profileList.clear();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    LocalProfile p = new LocalProfile(
                        obj.optString("id", UUID.randomUUID().toString()),
                        obj.optString("name", "Profil"),
                        obj.optString("startUrl", "https://www.google.com"),
                        obj.optString("color", "#0A84FF"),
                        obj.optString("cookiesJson", "[]")
                    );
                    p.proxyHost = obj.optString("proxyHost", "");
                    p.proxyPort = obj.optInt("proxyPort", 0);
                    profileList.add(p);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void saveData() {
        try {
            JSONArray arr = new JSONArray();
            for (LocalProfile p : profileList) {
                JSONObject obj = new JSONObject();
                obj.put("id", p.id);
                obj.put("name", p.name);
                obj.put("startUrl", p.startUrl);
                obj.put("color", p.color);
                obj.put("cookiesJson", p.cookiesJson);
                obj.put("proxyHost", p.proxyHost);
                obj.put("proxyPort", p.proxyPort);
                arr.put(obj);
            }
            prefs.edit().putString("dash_local_profiles", arr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (vault != null && activeProfile != null) {
            vault.persist(activeProfile.id, activeProfile.startUrl);
            if (vault.autoCloseOnExit()) {
                vault.wipe(true);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
