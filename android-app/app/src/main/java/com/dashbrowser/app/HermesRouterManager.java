package com.dashbrowser.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;

public class HermesRouterManager {
    private final Activity act;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final SharedPreferences skillsPrefs;
    private final SharedPreferences memoryPrefs;
    private final List<JSONObject> conversationHistory = new ArrayList<JSONObject>();

    private Dialog chatDialog;
    private LinearLayout chatMessagesLayout;
    private ScrollView chatScrollView;
    private EditText inputChatPrompt;
    private Button btnSendPrompt;
    private TextView txtStatus;

    public HermesRouterManager(Activity act, WebView webView) {
        this.act = act;
        this.webView = webView;
        this.prefs = act.getSharedPreferences("dash_hermes_prefs", Context.MODE_PRIVATE);
        this.skillsPrefs = act.getSharedPreferences("dash_hermes_skills", Context.MODE_PRIVATE);
        this.memoryPrefs = act.getSharedPreferences("dash_hermes_memories", Context.MODE_PRIVATE);

        // Seed default starter skills if empty
        if (skillsPrefs.getAll().isEmpty()) {
            saveSkill("auto-login-check", "Periksa apakah ada selector login/form auth. Jika ada, laporkan input field yang tersedia.");
            saveSkill("youtube-scraper", "Cari video di halaman youtube, ekstrak judul dan link video ke dalam format daftar.");
        }
    }

    public String getBaseUrl() {
        return prefs.getString("router_url", "http://185.202.238.138:20128/v1");
    }

    public String getApiKey() {
        return prefs.getString("router_key", "");
    }

    public String getModel() {
        return prefs.getString("router_model", "gpt-4o");
    }

    // Skills & Memory Management
    public void saveSkill(String name, String content) {
        skillsPrefs.edit().putString(name.toLowerCase().trim(), content).apply();
    }

    public Map<String, ?> getAllSkills() {
        return skillsPrefs.getAll();
    }

    public void deleteSkill(String name) {
        skillsPrefs.edit().remove(name).apply();
    }

    public void saveMemory(String key, String value) {
        memoryPrefs.edit().putString(key.toLowerCase().trim(), value).apply();
    }

    public Map<String, ?> getAllMemories() {
        return memoryPrefs.getAll();
    }

    public void showSkillsDialog() {
        AlertDialog.Builder b = new AlertDialog.Builder(act);
        b.setTitle("📚 Koleksi Skill Hermes (Tersimpan di HP)");

        LinearLayout l = new LinearLayout(act);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(24, 16, 24, 16);

        Map<String, ?> skills = getAllSkills();
        if (skills.isEmpty()) {
            TextView empty = new TextView(act);
            empty.setText("Belum ada skill tersimpan.");
            empty.setTextColor(Color.GRAY);
            l.addView(empty);
        } else {
            for (Map.Entry<String, ?> entry : skills.entrySet()) {
                final String skillName = entry.getKey();
                final String skillContent = entry.getValue().toString();

                LinearLayout row = new LinearLayout(act);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setPadding(0, 8, 0, 8);

                TextView tv = new TextView(act);
                tv.setText("• " + skillName + "\n  " + (skillContent.length() > 60 ? skillContent.substring(0, 60) + "..." : skillContent));
                tv.setTextSize(11);
                tv.setTextColor(Color.WHITE);
                row.addView(tv, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                Button btnDel = new Button(act);
                btnDel.setText("🗑");
                btnDel.setTextSize(10);
                btnDel.setBackgroundColor(Color.TRANSPARENT);
                btnDel.setTextColor(Color.parseColor("#f87171"));
                btnDel.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) {
                        deleteSkill(skillName);
                        Toast.makeText(act, "Skill dihapus: " + skillName, Toast.LENGTH_SHORT).show();
                        showSkillsDialog();
                    }
                });
                row.addView(btnDel, new LinearLayout.LayoutParams(34, 30));

                l.addView(row);
            }
        }

        b.setView(l);
        b.setPositiveButton("+ Tambah Skill", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int w) {
                showAddSkillDialog();
            }
        });
        b.setNegativeButton("Tutup", null);
        b.show();
    }

    private void showAddSkillDialog() {
        AlertDialog.Builder b = new AlertDialog.Builder(act);
        b.setTitle("Tambah Skill Baru");

        LinearLayout l = new LinearLayout(act);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(30, 16, 30, 10);

        final EditText inName = new EditText(act);
        inName.setHint("Nama skill (e.g. shopee-checkout-bot)");
        l.addView(inName);

        final EditText inContent = new EditText(act);
        inContent.setHint("Instruksi / alur SOP yang harus dijalankan Hermes...");
        inContent.setLines(4);
        l.addView(inContent);

        b.setView(l);
        b.setPositiveButton("Simpan", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int w) {
                String n = inName.getText().toString().trim();
                String c = inContent.getText().toString().trim();
                if (!n.isEmpty() && !c.isEmpty()) {
                    saveSkill(n, c);
                    Toast.makeText(act, "Skill tersimpan permanen di HP!", Toast.LENGTH_SHORT).show();
                    showSkillsDialog();
                }
            }
        });
        b.setNegativeButton("Batal", null);
        b.show();
    }

    public void showSetupDialog(final Runnable onSaved) {
        AlertDialog.Builder b = new AlertDialog.Builder(act);
        b.setTitle("⚙️ Setup 9router & OpenAPI");

        LinearLayout l = new LinearLayout(act);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(36, 20, 36, 10);

        final EditText inUrl = createField(l, "Base URL (9router / OpenAI / OpenRouter):", getBaseUrl());
        final EditText inKey = createField(l, "API Key (dari 9router atau OpenAI/OpenRouter):", getApiKey());
        final EditText inModel = createField(l, "Model Name (e.g. gpt-4o, claude-3-5, gemini-1.5):", getModel());

        b.setView(l);
        b.setPositiveButton("Simpan", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int w) {
                prefs.edit()
                    .putString("router_url", inUrl.getText().toString().trim())
                    .putString("router_key", inKey.getText().toString().trim())
                    .putString("router_model", inModel.getText().toString().trim())
                    .apply();
                Toast.makeText(act, "Pengaturan 9router tersimpan!", Toast.LENGTH_SHORT).show();
                if (onSaved != null) onSaved.run();
            }
        });
        b.setNeutralButton("Test Ping", new DialogInterface.OnClickListener() {
            @Override public void onClick(DialogInterface d, int w) {
                testPing(inUrl.getText().toString().trim(), inKey.getText().toString().trim());
            }
        });
        b.setNegativeButton("Batal", null);
        b.show();
    }

    private EditText createField(LinearLayout l, String hint, String val) {
        TextView tv = new TextView(act);
        tv.setText(hint);
        tv.setTextSize(10.5f);
        tv.setTextColor(Color.parseColor("#9ca3af"));
        tv.setPadding(0, 8, 0, 2);
        l.addView(tv);

        EditText et = new EditText(act);
        et.setText(val);
        et.setTextSize(12);
        et.setPadding(10, 8, 10, 8);
        et.setBackgroundColor(Color.parseColor("#1a1d24"));
        et.setTextColor(Color.WHITE);
        l.addView(et);
        return et;
    }

    private void testPing(final String targetUrl, final String key) {
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    String clean = targetUrl.endsWith("/") ? targetUrl.substring(0, targetUrl.length() - 1) : targetUrl;
                    URL u = new URL(clean + "/models");
                    HttpURLConnection c = (HttpURLConnection) u.openConnection();
                    c.setRequestMethod("GET");
                    c.setConnectTimeout(4000);
                    c.setReadTimeout(4000);
                    if (!key.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + key);
                    final int code = c.getResponseCode();
                    c.disconnect();
                    act.runOnUiThread(new Runnable() {
                        @Override public void run() {
                            Toast.makeText(act, code >= 200 && code < 400 ? "✅ Terhubung! (" + code + ")" : "⚠️ Respon: " + code, Toast.LENGTH_LONG).show();
                        }
                    });
                } catch (final Exception e) {
                    act.runOnUiThread(new Runnable() {
                        @Override public void run() {
                            Toast.makeText(act, "❌ Gagal koneksi: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }).start();
    }

    public void showPromptDialog() {
        showChatDialog();
    }

    public void showChatDialog() {
        if (chatDialog != null && chatDialog.isShowing()) {
            chatDialog.dismiss();
        }

        chatDialog = new Dialog(act);
        chatDialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout root = new LinearLayout(act);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#111318"));
        root.setPadding(16, 16, 16, 16);

        // Header
        LinearLayout header = new LinearLayout(act);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(0, 0, 0, 10);

        TextView title = new TextView(act);
        title.setText("🤖 Hermes Agent Engine");
        title.setTextColor(Color.parseColor("#38bdf8"));
        title.setTextSize(13);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

        Button btnSkills = new Button(act);
        btnSkills.setText("📚 Skill");
        btnSkills.setTextSize(10.5f);
        btnSkills.setTextColor(Color.parseColor("#38bdf8"));
        btnSkills.setBackgroundColor(Color.parseColor("#1e293b"));
        btnSkills.setPadding(8, 0, 8, 0);
        btnSkills.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { showSkillsDialog(); }
        });
        header.addView(btnSkills, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, 28));

        Button btnSettings = new Button(act);
        btnSettings.setText("⚙️");
        btnSettings.setTextSize(11);
        btnSettings.setBackgroundColor(Color.TRANSPARENT);
        btnSettings.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                showSetupDialog(new Runnable() {
                    @Override public void run() {
                        if (txtStatus != null) txtStatus.setText(getModel());
                    }
                });
            }
        });
        header.addView(btnSettings, new LinearLayout.LayoutParams(34, 30));

        Button btnClose = new Button(act);
        btnClose.setText("✕");
        btnClose.setTextSize(12);
        btnClose.setTextColor(Color.parseColor("#9ca3af"));
        btnClose.setBackgroundColor(Color.TRANSPARENT);
        btnClose.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { chatDialog.dismiss(); }
        });
        header.addView(btnClose, new LinearLayout.LayoutParams(34, 30));

        root.addView(header);

        // Subtitle status
        txtStatus = new TextView(act);
        txtStatus.setText("Model: " + getModel() + " · " + getAllSkills().size() + " Skill Lokal Aktif");
        txtStatus.setTextColor(Color.parseColor("#9ca3af"));
        txtStatus.setTextSize(10);
        txtStatus.setPadding(0, 0, 0, 8);
        root.addView(txtStatus);

        // Quick action chips bar
        HorizontalScrollView chipScroll = new HorizontalScrollView(act);
        LinearLayout chipContainer = new LinearLayout(act);
        chipContainer.setOrientation(LinearLayout.HORIZONTAL);
        chipContainer.setPadding(0, 0, 0, 8);

        addQuickChip(chipContainer, "📄 Ringkas Halaman", "Ringkas isi halaman web ini secara singkat dan padat.");
        addQuickChip(chipContainer, "🔍 Cek Status Login", "Periksa apakah ada tanda login/akun di halaman ini.");
        addQuickChip(chipContainer, "⚡ Ekstrak Link & Judul", "Ekstrak semua judul dan link utama yang ada.");
        addQuickChip(chipContainer, "💾 Simpan SOP Halaman", "Analisa alur halaman ini dan simpan sebagai skill baru di memori lokal.");
        chipScroll.addView(chipContainer);
        root.addView(chipScroll);

        // Scrollable Chat Messages Container
        chatScrollView = new ScrollView(act);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f);
        chatScrollView.setLayoutParams(scrollLp);

        chatMessagesLayout = new LinearLayout(act);
        chatMessagesLayout.setOrientation(LinearLayout.VERTICAL);
        chatMessagesLayout.setPadding(4, 4, 4, 4);
        chatScrollView.addView(chatMessagesLayout);
        root.addView(chatScrollView);

        // Render existing conversation history or initial greeting
        if (conversationHistory.isEmpty()) {
            addMessageBubble("assistant", "Hermes Agent Engine aktif di Android. Memori & Skill tersimpan 100% lokal di HP tanpa membebani server.");
        } else {
            for (JSONObject msg : conversationHistory) {
                addMessageBubble(msg.optString("role"), msg.optString("content"));
            }
        }

        // Bottom Input Row
        LinearLayout inputRow = new LinearLayout(act);
        inputRow.setOrientation(LinearLayout.HORIZONTAL);
        inputRow.setGravity(Gravity.CENTER_VERTICAL);
        inputRow.setPadding(0, 10, 0, 0);

        inputChatPrompt = new EditText(act);
        inputChatPrompt.setHint("Ketik perintah tugas untuk Hermes...");
        inputChatPrompt.setHintTextColor(Color.parseColor("#6b7280"));
        inputChatPrompt.setTextColor(Color.WHITE);
        inputChatPrompt.setTextSize(11.5f);
        inputChatPrompt.setPadding(10, 8, 10, 8);
        inputChatPrompt.setBackgroundColor(Color.parseColor("#1c1f26"));
        LinearLayout.LayoutParams inLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        inputRow.addView(inputChatPrompt, inLp);

        btnSendPrompt = new Button(act);
        btnSendPrompt.setText("Kirim");
        btnSendPrompt.setTextSize(11);
        btnSendPrompt.setTextColor(Color.WHITE);
        btnSendPrompt.setBackgroundColor(Color.parseColor("#0A84FF"));
        btnSendPrompt.setPadding(12, 0, 12, 0);
        btnSendPrompt.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                String txt = inputChatPrompt.getText().toString().trim();
                if (!txt.isEmpty()) {
                    inputChatPrompt.setText("");
                    sendUserPrompt(txt);
                }
            }
        });
        inputRow.addView(btnSendPrompt, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, 36));

        root.addView(inputRow);

        chatDialog.setContentView(root);
        if (chatDialog.getWindow() != null) {
            chatDialog.getWindow().setLayout((int) (act.getResources().getDisplayMetrics().widthPixels * 0.85), (int) (act.getResources().getDisplayMetrics().heightPixels * 0.82));
            chatDialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }
        chatDialog.show();
    }

    private void addQuickChip(LinearLayout container, final String label, final String prompt) {
        Button b = new Button(act);
        b.setText(label);
        b.setTextSize(9.5f);
        b.setTextColor(Color.parseColor("#38bdf8"));
        b.setBackgroundColor(Color.parseColor("#1e293b"));
        b.setPadding(8, 0, 8, 0);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, 26);
        lp.setMargins(0, 0, 6, 0);
        b.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                sendUserPrompt(prompt);
            }
        });
        container.addView(b, lp);
    }

    private void addMessageBubble(String role, String text) {
        LinearLayout row = new LinearLayout(act);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, 4, 0, 4);

        TextView bubble = new TextView(act);
        bubble.setText(text);
        bubble.setTextSize(11.5f);
        bubble.setPadding(12, 8, 12, 8);

        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(10);

        if ("user".equals(role)) {
            row.setGravity(Gravity.END);
            bg.setColor(Color.parseColor("#0A84FF"));
            bubble.setTextColor(Color.WHITE);
        } else if ("error".equals(role)) {
            row.setGravity(Gravity.START);
            bg.setColor(Color.parseColor("#3b1c1c"));
            bubble.setTextColor(Color.parseColor("#f87171"));
        } else {
            row.setGravity(Gravity.START);
            bg.setColor(Color.parseColor("#1e222b"));
            bubble.setTextColor(Color.parseColor("#e2e8f0"));
        }

        bubble.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.weight = 0;
        row.addView(bubble, lp);

        chatMessagesLayout.addView(row);
        chatScrollView.post(new Runnable() {
            @Override public void run() { chatScrollView.fullScroll(View.FOCUS_DOWN); }
        });
    }

    private void sendUserPrompt(final String prompt) {
        addMessageBubble("user", prompt);
        try {
            JSONObject uObj = new JSONObject();
            uObj.put("role", "user");
            uObj.put("content", prompt);
            conversationHistory.add(uObj);
        } catch (Exception e) {}

        if (txtStatus != null) txtStatus.setText("Hermes berpikir & menganalisa DOM...");

        webView.evaluateJavascript(
            "(function() { return JSON.stringify({title: document.title, url: location.href, text: document.body.innerText.substring(0, 2500)}); })();",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(final String val) {
                    new Thread(new Runnable() {
                        @Override public void run() {
                            callAiAgent(prompt, val);
                        }
                    }).start();
                }
            }
        );
    }

    private void callAiAgent(String prompt, String pageDataJson) {
        try {
            String baseUrl = getBaseUrl().trim();
            if (baseUrl.endsWith("/")) baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
            URL u = new URL(baseUrl + "/chat/completions");

            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            String key = getApiKey();
            if (!key.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + key);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);

            JSONObject req = new JSONObject();
            req.put("model", getModel());
            req.put("stream", false);
            JSONArray msgs = new JSONArray();

            // Build Agent Context with local skills & memory
            StringBuilder skillsSummary = new StringBuilder();
            for (Map.Entry<String, ?> e : getAllSkills().entrySet()) {
                skillsSummary.append("- ").append(e.getKey()).append(": ").append(e.getValue()).append("\n");
            }

            JSONObject sys = new JSONObject();
            sys.put("role", "system");
            sys.put("content", "You are Hermes AI Agent running locally on DashBrowser Android.\n"
                + "You have access to persistent local skills:\n" + skillsSummary.toString() + "\n"
                + "Capabilities:\n"
                + "1. To interact with the page (click, input, scroll, navigate), write runnable JavaScript in a ```javascript ... ``` block.\n"
                + "2. To create a new reusable skill that persists in the user's phone, write ```save_skill:SKILL_NAME\ninstructions\n```.\n"
                + "3. To save a persistent fact/memory, write ```save_memory:KEY\nvalue\n```.\n"
                + "Always respond tersely in Indonesian with clear actions.");
            msgs.put(sys);

            for (JSONObject h : conversationHistory) {
                msgs.put(h);
            }

            req.put("messages", msgs);
            req.put("max_tokens", 800);

            OutputStream os = c.getOutputStream();
            os.write(req.toString().getBytes("UTF-8"));
            os.close();

            int code = c.getResponseCode();
            InputStream is = code >= 200 && code < 400 ? c.getInputStream() : c.getErrorStream();
            BufferedReader br = new BufferedReader(new InputStreamReader(is));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line).append("\n");
            }
            br.close();
            c.disconnect();

            String raw = sb.toString().trim();
            String replyText = "";
            boolean isError = false;

            // SSE stream unpack
            if (raw.contains("data:") || raw.startsWith("data:")) {
                StringBuilder parsedText = new StringBuilder();
                String[] lines = raw.split("\n");
                for (String l : lines) {
                    l = l.trim();
                    if (l.startsWith("data:")) l = l.substring(5).trim();
                    if (l.isEmpty() || l.equals("[DONE]")) continue;
                    try {
                        JSONObject cObj = new JSONObject(l);
                        if (cObj.has("choices")) {
                            JSONArray chArr = cObj.getJSONArray("choices");
                            if (chArr.length() > 0) {
                                JSONObject c0 = chArr.getJSONObject(0);
                                if (c0.has("delta")) {
                                    JSONObject delta = c0.getJSONObject("delta");
                                    if (delta.has("content") && !delta.isNull("content")) {
                                        parsedText.append(delta.getString("content"));
                                    }
                                } else if (c0.has("message")) {
                                    JSONObject msg = c0.getJSONObject("message");
                                    if (msg.has("content") && !msg.isNull("content")) {
                                        parsedText.append(msg.getString("content"));
                                    }
                                }
                            }
                        }
                    } catch (Exception ignore) {}
                }
                if (parsedText.length() > 0) replyText = parsedText.toString();
            }

            if (replyText.isEmpty()) {
                try {
                    JSONObject res = new JSONObject(raw);
                    if (res.has("choices")) {
                        JSONArray choices = res.getJSONArray("choices");
                        if (choices.length() > 0) {
                            JSONObject first = choices.getJSONObject(0);
                            if (first.has("message")) {
                                replyText = first.getJSONObject("message").optString("content", "");
                            } else if (first.has("text")) {
                                replyText = first.optString("text", "");
                            }
                        }
                    } else if (res.has("error")) {
                        Object errObj = res.get("error");
                        replyText = "⚠️ Error API: " + (errObj instanceof JSONObject ? ((JSONObject) errObj).optString("message", errObj.toString()) : errObj.toString());
                        isError = true;
                    } else {
                        replyText = raw;
                    }
                } catch (Exception pe) {
                    replyText = raw.isEmpty() ? "HTTP Status " + code : raw;
                    if (code >= 400) isError = true;
                }
            }

            final String fReply = replyText;
            final boolean fError = isError;

            act.runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (txtStatus != null) txtStatus.setText("Model: " + getModel() + " · " + getAllSkills().size() + " Skill Lokal");
                    if (fError) {
                        addMessageBubble("error", fReply);
                    } else {
                        addMessageBubble("assistant", fReply);
                        try {
                            JSONObject aObj = new JSONObject();
                            aObj.put("role", "assistant");
                            aObj.put("content", fReply);
                            conversationHistory.add(aObj);
                        } catch (Exception e) {}

                        // Process Skills auto-saving
                        if (fReply.contains("```save_skill:")) {
                            int s = fReply.indexOf("```save_skill:") + 14;
                            int e = fReply.indexOf("\n", s);
                            if (e > s) {
                                String skillName = fReply.substring(s, e).trim();
                                int endBlock = fReply.indexOf("```", e);
                                if (endBlock > e) {
                                    String skillBody = fReply.substring(e + 1, endBlock).trim();
                                    saveSkill(skillName, skillBody);
                                    Toast.makeText(act, "✨ Skill baru tersimpan: " + skillName, Toast.LENGTH_SHORT).show();
                                }
                            }
                        }

                        // Process JS Execution
                        if (fReply.contains("```javascript")) {
                            int start = fReply.indexOf("```javascript") + 13;
                            int end = fReply.indexOf("```", start);
                            if (end > start) {
                                String js = fReply.substring(start, end).trim();
                                webView.evaluateJavascript(js, null);
                                Toast.makeText(act, "⚡ Hermes menjalankan aksi JS di browser!", Toast.LENGTH_SHORT).show();
                            }
                        }
                    }
                }
            });
        } catch (final Exception e) {
            act.runOnUiThread(new Runnable() {
                @Override public void run() {
                    if (txtStatus != null) txtStatus.setText(getModel());
                    addMessageBubble("error", "❌ Koneksi Gagal: " + e.getMessage());
                }
            });
        }
    }
}
