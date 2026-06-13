package ai.hermes.webui;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Insets;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;

public class MainActivity extends android.app.Activity implements TextToSpeech.OnInitListener {
    private static final int FILE_CHOOSER_REQUEST = 301;
    private static final int PERMISSION_REQUEST = 302;
    private static final String CHANNEL_ID = "hermes_mobile";
    private static final String PREFS_NAME = "hermes_android";
    private static final String PREF_LAST_URL = "last_url";

    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout root;
    private LinearLayout floatingPanel;
    private TextView floatingKnob;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean menuOpen = false;
    private boolean dragMoved = false;
    private TextToSpeech textToSpeech;
    private boolean textToSpeechReady = false;
    private String activeSpeechMessageId = "";
    private float downRawX;
    private float downRawY;
    private int knobStartLeft;
    private int knobStartTop;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        buildLayout();
        configureWindowInsets();
        configureWebView();
        configureTextToSpeech();
        requestCorePermissions();
        webView.loadUrl(getStartUrl());
        checkUpdate(false);
    }

    private void configureWindowInsets() {
        Window window = getWindow();
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 21) {
            window.setStatusBarColor(Color.WHITE);
            window.setNavigationBarColor(Color.WHITE);
        }
        if (Build.VERSION.SDK_INT >= 23) {
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            window.getDecorView().setSystemUiVisibility(flags);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                int bottom = Math.max(bars.bottom, ime.bottom);
                view.setPadding(0, bars.top, 0, bottom);
                return insets;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
    }

    private void buildLayout() {
        root = new FrameLayout(this);
        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        root.addView(progressBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3),
            Gravity.TOP
        ));
        buildFloatingTools();
        setContentView(root);
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " HermesAndroid/0.1");

        webView.addJavascriptInterface(new HermesBridge(), "HermesAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                openExternal(uri.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url == null || url.trim().isEmpty()) return;
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(PREF_LAST_URL, url).apply();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });
        webView.setDownloadListener(buildDownloadListener());
    }

    private void configureTextToSpeech() {
        textToSpeech = new TextToSpeech(this, this);
    }

    @Override
    public void onInit(int status) {
        textToSpeechReady = status == TextToSpeech.SUCCESS;
        if (!textToSpeechReady || textToSpeech == null) return;
        int languageResult = textToSpeech.setLanguage(Locale.CHINA);
        if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            textToSpeech.setLanguage(Locale.getDefault());
        }
        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                dispatchSpeechEvent("start", activeSpeechMessageId, "");
            }

            @Override
            public void onDone(String utteranceId) {
                dispatchSpeechEvent("end", activeSpeechMessageId, "");
                activeSpeechMessageId = "";
            }

            @Override
            public void onError(String utteranceId) {
                dispatchSpeechEvent("error", activeSpeechMessageId, "TextToSpeech failed");
                activeSpeechMessageId = "";
            }
        });
    }

    private boolean speakNative(String messageId, String text, String lang) {
        if (!textToSpeechReady || textToSpeech == null || text == null || text.trim().isEmpty()) return false;
        if (lang != null && lang.toLowerCase(Locale.ROOT).startsWith("zh")) {
            textToSpeech.setLanguage(Locale.CHINA);
        }
        activeSpeechMessageId = messageId == null ? "" : messageId;
        String utteranceId = "hermes-tts-" + System.currentTimeMillis();
        int result;
        if (Build.VERSION.SDK_INT >= 21) {
            Bundle params = new Bundle();
            result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        } else {
            HashMap<String, String> params = new HashMap<>();
            params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
            result = textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params);
        }
        return result == TextToSpeech.SUCCESS;
    }

    private void stopNativeSpeech() {
        activeSpeechMessageId = "";
        if (textToSpeech != null) textToSpeech.stop();
    }

    private void dispatchSpeechEvent(String type, String messageId, String error) {
        String js = "window.dispatchEvent(new CustomEvent('hermes-android-tts',{detail:{"
            + "type:" + JSONObject.quote(type)
            + ",messageId:" + JSONObject.quote(messageId == null ? "" : messageId)
            + ",error:" + JSONObject.quote(error == null ? "" : error)
            + "}}));";
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private DownloadListener buildDownloadListener() {
        return (url, userAgent, contentDisposition, mimetype, contentLength) -> {
            String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
            enqueueDownload(url, filename, "Hermes 下载");
        };
    }

    private void buildFloatingTools() {
        floatingPanel = new LinearLayout(this);
        floatingPanel.setOrientation(LinearLayout.VERTICAL);
        floatingPanel.setPadding(dp(8), dp(8), dp(8), dp(8));
        floatingPanel.setBackground(roundedDrawable(Color.WHITE, 18));
        floatingPanel.setElevation(dp(10));
        floatingPanel.setVisibility(View.GONE);

        addToolRow("↻", "刷新页面", () -> webView.reload());
        addToolRow("✓", "申请权限", this::requestCorePermissions);
        addToolRow("↓", "下载内容", () -> fetchContentManifest(true));
        addToolRow("↑", "检查更新", () -> checkUpdate(true));
        addToolRow("⌂", "回到首页", () -> webView.loadUrl(BuildConfig.DEFAULT_WEB_URL));

        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(dp(188), ViewGroup.LayoutParams.WRAP_CONTENT);
        panelParams.gravity = Gravity.BOTTOM | Gravity.END;
        panelParams.setMargins(0, 0, dp(18), dp(84));
        root.addView(floatingPanel, panelParams);

        floatingKnob = new TextView(this);
        floatingKnob.setText("☰");
        floatingKnob.setGravity(Gravity.CENTER);
        floatingKnob.setTextSize(20);
        floatingKnob.setTypeface(Typeface.DEFAULT_BOLD);
        floatingKnob.setTextColor(Color.WHITE);
        floatingKnob.setBackground(roundedDrawable(Color.BLACK, 28));
        floatingKnob.setElevation(dp(12));
        FrameLayout.LayoutParams knobParams = new FrameLayout.LayoutParams(dp(56), dp(56));
        knobParams.gravity = Gravity.BOTTOM | Gravity.END;
        knobParams.setMargins(0, 0, dp(18), dp(22));
        root.addView(floatingKnob, knobParams);
        floatingKnob.setOnTouchListener(this::dragKnob);
    }

    private void addToolRow(String icon, String label, Runnable action) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(8), 0, dp(8), 0);
        row.setBackground(roundedDrawable(Color.TRANSPARENT, 14));
        row.setOnClickListener(v -> {
            toggleMenu(false);
            action.run();
        });

        TextView iconView = new TextView(this);
        iconView.setText(icon);
        iconView.setTextColor(Color.WHITE);
        iconView.setTextSize(14);
        iconView.setTypeface(Typeface.DEFAULT_BOLD);
        iconView.setGravity(Gravity.CENTER);
        iconView.setBackground(roundedDrawable(Color.BLACK, 15));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(30), dp(30));
        row.addView(iconView, iconParams);

        TextView labelView = new TextView(this);
        labelView.setText(label);
        labelView.setTextColor(Color.rgb(17, 24, 39));
        labelView.setTextSize(14);
        labelView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        labelParams.setMargins(dp(10), 0, 0, 0);
        row.addView(labelView, labelParams);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(44)
        );
        params.setMargins(0, 0, 0, dp(4));
        floatingPanel.addView(row, params);
    }

    private boolean dragKnob(View view, MotionEvent event) {
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) view.getLayoutParams();
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                knobStartLeft = view.getLeft();
                knobStartTop = view.getTop();
                dragMoved = false;
                return true;
            case MotionEvent.ACTION_MOVE:
                float dx = event.getRawX() - downRawX;
                float dy = event.getRawY() - downRawY;
                if (!dragMoved && Math.hypot(dx, dy) < dp(8)) return true;
                dragMoved = true;
                toggleMenu(false);
                params.gravity = Gravity.TOP | Gravity.START;
                int left = Math.max(0, Math.min(root.getWidth() - view.getWidth(), knobStartLeft + Math.round(dx)));
                int top = Math.max(0, Math.min(root.getHeight() - view.getHeight(), knobStartTop + Math.round(dy)));
                params.leftMargin = left;
                params.topMargin = top;
                params.rightMargin = 0;
                params.bottomMargin = 0;
                view.setLayoutParams(params);
                movePanelNearKnob(left, top);
                return true;
            case MotionEvent.ACTION_UP:
                if (!dragMoved) toggleMenu();
                return true;
            default:
                return true;
        }
    }

    private void movePanelNearKnob(int left, int top) {
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) floatingPanel.getLayoutParams();
        params.gravity = Gravity.TOP | Gravity.START;
        params.leftMargin = Math.max(dp(8), Math.min(root.getWidth() - dp(196), left - dp(132)));
        params.topMargin = Math.max(dp(8), Math.min(root.getHeight() - dp(260), top - dp(230)));
        params.rightMargin = 0;
        params.bottomMargin = 0;
        floatingPanel.setLayoutParams(params);
    }

    private void toggleMenu() {
        toggleMenu(!menuOpen);
    }

    private void toggleMenu(boolean open) {
        menuOpen = open;
        floatingPanel.setVisibility(open ? View.VISIBLE : View.GONE);
    }

    private void requestCorePermissions() {
        List<String> permissions = new ArrayList<>();
        addPermission(permissions, Manifest.permission.RECORD_AUDIO);
        addPermission(permissions, Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= 33) {
            addPermission(permissions, Manifest.permission.POST_NOTIFICATIONS);
            addPermission(permissions, Manifest.permission.READ_MEDIA_IMAGES);
            addPermission(permissions, Manifest.permission.READ_MEDIA_VIDEO);
            addPermission(permissions, Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            addPermission(permissions, Manifest.permission.READ_EXTERNAL_STORAGE);
        }
        if (!permissions.isEmpty()) {
            requestPermissions(permissions.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }

    private void addPermission(List<String> permissions, String permission) {
        if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) permissions.add(permission);
    }

    private void checkUpdate(boolean showWhenLatest) {
        new Thread(() -> {
            try {
                JSONObject json = fetchJson(BuildConfig.UPDATE_MANIFEST_URL);
                int latestCode = json.optInt("versionCode", 0);
                String versionName = json.optString("versionName", "");
                String apkUrl = json.optString("apkUrl", "");
                String notes = json.optString("notes", "发现新版本");
                if (latestCode > BuildConfig.VERSION_CODE && !apkUrl.isEmpty()) {
                    notifySimple("Hermes 有新版本", versionName.isEmpty() ? notes : versionName + " - " + notes);
                    runOnUiThread(() -> showUpdateDialog(versionName, notes, apkUrl));
                } else if (showWhenLatest) {
                    runOnUiThread(() -> Toast.makeText(this, "已经是最新版本", Toast.LENGTH_SHORT).show());
                }
            } catch (Exception e) {
                if (showWhenLatest) runOnUiThread(() -> Toast.makeText(this, "检查更新失败：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private void showUpdateDialog(String versionName, String notes, String apkUrl) {
        AlertDialog dialog = new AlertDialog.Builder(this).create();
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(20), dp(22), dp(18));
        content.setBackground(roundedDrawable(Color.WHITE, 22));

        TextView icon = new TextView(this);
        icon.setText("↑");
        icon.setGravity(Gravity.CENTER);
        icon.setTextSize(20);
        icon.setTypeface(Typeface.DEFAULT_BOLD);
        icon.setTextColor(Color.WHITE);
        icon.setBackground(roundedDrawable(Color.BLACK, 22));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(44), dp(44));
        iconParams.gravity = Gravity.CENTER_HORIZONTAL;
        content.addView(icon, iconParams);

        TextView title = new TextView(this);
        title.setText("发现新版本" + (versionName.isEmpty() ? "" : " " + versionName));
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTextSize(19);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.setMargins(0, dp(12), 0, dp(8));
        content.addView(title, titleParams);

        TextView message = new TextView(this);
        message.setText(notes == null || notes.trim().isEmpty() ? "可下载新的安装包。" : notes);
        message.setTextColor(Color.rgb(75, 85, 99));
        message.setTextSize(14);
        message.setLineSpacing(dp(2), 1.0f);
        message.setGravity(Gravity.CENTER);
        content.addView(message);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        actionsParams.setMargins(0, dp(18), 0, 0);
        content.addView(actions, actionsParams);

        TextView cancel = dialogButton("稍后", false);
        TextView download = dialogButton("下载更新", true);
        actions.addView(cancel, new LinearLayout.LayoutParams(0, dp(42), 1));
        LinearLayout.LayoutParams downloadParams = new LinearLayout.LayoutParams(0, dp(42), 1);
        downloadParams.setMargins(dp(10), 0, 0, 0);
        actions.addView(download, downloadParams);

        cancel.setOnClickListener(v -> dialog.dismiss());
        download.setOnClickListener(v -> {
            dialog.dismiss();
            downloadApk(apkUrl);
        });

        dialog.setView(content);
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) window.setBackgroundDrawableResource(android.R.color.transparent);
        });
        dialog.show();
    }

    private void downloadApk(String apkUrl) {
        String filename = URLUtil.guessFileName(apkUrl, null, "application/vnd.android.package-archive");
        long id = enqueueDownload(apkUrl, filename, "Hermes APK 更新");
        Toast.makeText(this, "更新包已开始下载，完成后可在下载通知中安装", Toast.LENGTH_LONG).show();
    }

    private void fetchContentManifest(boolean showEmpty) {
        new Thread(() -> {
            try {
                JSONObject json = fetchJson(BuildConfig.CONTENT_MANIFEST_URL);
                JSONArray items = json.optJSONArray("items");
                if (items == null || items.length() == 0) {
                    if (showEmpty) runOnUiThread(() -> Toast.makeText(this, "暂无可下载内容", Toast.LENGTH_SHORT).show());
                    return;
                }
                runOnUiThread(() -> showDownloadCenter(items));
            } catch (Exception e) {
                if (showEmpty) runOnUiThread(() -> Toast.makeText(this, "内容清单加载失败：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private void showDownloadCenter(JSONArray items) {
        AlertDialog dialog = new AlertDialog.Builder(this).create();
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(18), dp(18), dp(18), dp(14));
        content.setBackground(roundedDrawable(Color.WHITE, 20));

        TextView title = new TextView(this);
        title.setText("下载内容");
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        content.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("管理服务器提供的内容包。");
        subtitle.setTextColor(Color.rgb(107, 114, 128));
        subtitle.setTextSize(13);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.setMargins(0, dp(4), 0, dp(12));
        content.addView(subtitle, subtitleParams);

        ScrollView scrollView = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(list);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(330));
        content.addView(scrollView, scrollParams);

        Runnable[] render = new Runnable[1];
        render[0] = () -> {
            list.removeAllViews();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                list.addView(downloadRow(item, render[0]));
            }
        };
        render[0].run();

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        actionsParams.setMargins(0, dp(14), 0, 0);
        content.addView(actions, actionsParams);

        TextView clear = dialogButton("清空已下载", false);
        TextView close = dialogButton("关闭", true);
        actions.addView(clear, new LinearLayout.LayoutParams(0, dp(42), 1));
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(0, dp(42), 1);
        closeParams.setMargins(dp(10), 0, 0, 0);
        actions.addView(close, closeParams);

        clear.setOnClickListener(v -> {
            int count = clearDownloadedItems(items);
            Toast.makeText(this, count > 0 ? "已清空 " + count + " 个文件" : "没有可清空的文件", Toast.LENGTH_SHORT).show();
            render[0].run();
        });
        close.setOnClickListener(v -> dialog.dismiss());

        dialog.setView(content);
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) window.setBackgroundDrawableResource(android.R.color.transparent);
        });
        dialog.show();
    }

    private View downloadRow(JSONObject item, Runnable refresh) {
        String url = item.optString("url", "");
        String title = item.optString("title", safeFileName(url));
        File local = localDownloadFile(url);
        boolean downloaded = local.exists() && local.length() > 0;

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(12), dp(10), dp(12), dp(10));
        row.setBackground(roundedDrawable(Color.rgb(249, 250, 251), 14, Color.rgb(229, 231, 235), 1));
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.setMargins(0, 0, 0, dp(8));
        row.setLayoutParams(rowParams);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(top);

        TextView icon = new TextView(this);
        icon.setText(downloaded ? "✓" : "↓");
        icon.setTextColor(Color.WHITE);
        icon.setTextSize(13);
        icon.setTypeface(Typeface.DEFAULT_BOLD);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(roundedDrawable(Color.BLACK, 14));
        top.addView(icon, new LinearLayout.LayoutParams(dp(28), dp(28)));

        TextView name = new TextView(this);
        name.setText(title);
        name.setTextColor(Color.rgb(17, 24, 39));
        name.setTextSize(14);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setSingleLine(false);
        LinearLayout.LayoutParams nameParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        nameParams.setMargins(dp(10), 0, 0, 0);
        top.addView(name, nameParams);

        TextView status = new TextView(this);
        status.setText(downloaded ? "已下载 · " + readableBytes(local.length()) : "未下载");
        status.setTextColor(Color.rgb(107, 114, 128));
        status.setTextSize(12);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        statusParams.setMargins(dp(38), dp(4), 0, dp(8));
        row.addView(status, statusParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(actions);

        TextView download = smallButton(downloaded ? "重新下载" : "下载", true);
        TextView delete = smallButton("删除", false);
        actions.addView(download, new LinearLayout.LayoutParams(0, dp(34), 1));
        LinearLayout.LayoutParams deleteParams = new LinearLayout.LayoutParams(0, dp(34), 1);
        deleteParams.setMargins(dp(8), 0, 0, 0);
        actions.addView(delete, deleteParams);

        download.setOnClickListener(v -> {
            if (url.isEmpty()) {
                Toast.makeText(this, "下载地址为空", Toast.LENGTH_SHORT).show();
                return;
            }
            enqueueDownload(url, safeFileName(url), title);
            refresh.run();
        });
        delete.setEnabled(downloaded);
        delete.setAlpha(downloaded ? 1f : 0.45f);
        delete.setOnClickListener(v -> {
            if (!downloaded) return;
            boolean ok = local.delete();
            Toast.makeText(this, ok ? "已删除" : "删除失败", Toast.LENGTH_SHORT).show();
            refresh.run();
        });

        return row;
    }

    private int clearDownloadedItems(JSONArray items) {
        int count = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            File file = localDownloadFile(item.optString("url", ""));
            if (file.exists() && file.delete()) count++;
        }
        return count;
    }

    private File localDownloadFile(String url) {
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = getFilesDir();
        return new File(dir, safeFileName(url));
    }

    private String safeFileName(String url) {
        String guessed = URLUtil.guessFileName(url == null ? "" : url, null, null);
        if (guessed == null || guessed.trim().isEmpty()) return "hermes-content-" + System.currentTimeMillis();
        return guessed.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private String readableBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024) return String.format(Locale.CHINA, "%.1f KB", kb);
        return String.format(Locale.CHINA, "%.1f MB", kb / 1024.0);
    }

    private long enqueueDownload(String url, String filename, String title) {
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle(title);
        request.setDescription(filename);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, filename);
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        long id = manager.enqueue(request);
        Toast.makeText(this, "已开始下载：" + filename, Toast.LENGTH_SHORT).show();
        return id;
    }

    private TextView smallButton(String label, boolean primary) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setGravity(Gravity.CENTER);
        button.setTextSize(13);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(17, 24, 39));
        button.setBackground(roundedDrawable(
            primary ? Color.BLACK : Color.rgb(243, 244, 246),
            12,
            primary ? Color.BLACK : Color.rgb(229, 231, 235),
            1
        ));
        return button;
    }

    private TextView dialogButton(String label, boolean primary) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setGravity(Gravity.CENTER);
        button.setTextSize(14);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(primary ? Color.WHITE : Color.rgb(17, 24, 39));
        button.setBackground(roundedDrawable(
            primary ? Color.BLACK : Color.rgb(243, 244, 246),
            14,
            primary ? Color.BLACK : Color.rgb(229, 231, 235),
            1
        ));
        return button;
    }

    private GradientDrawable roundedDrawable(int fillColor, int radiusDp) {
        return roundedDrawable(fillColor, radiusDp, fillColor, 0);
    }

    private GradientDrawable roundedDrawable(int fillColor, int radiusDp, int strokeColor, int strokeWidthDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeWidthDp > 0) drawable.setStroke(dp(strokeWidthDp), strokeColor);
        return drawable;
    }

    private String getStartUrl() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String lastUrl = prefs.getString(PREF_LAST_URL, "");
        if (lastUrl == null || lastUrl.trim().isEmpty()) return BuildConfig.DEFAULT_WEB_URL;
        return lastUrl;
    }

    private JSONObject fetchJson(String urlText) throws Exception {
        URL url = new URL(urlText);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        int code = connection.getResponseCode();
        if (code < 200 || code >= 300) throw new IllegalStateException("HTTP " + code);
        BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) builder.append(line);
        reader.close();
        return new JSONObject(builder.toString());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Hermes", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Hermes 移动端更新与下载通知");
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private void notifySimple(String title, String text) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(1001, builder.build());
    }

    private void openExternal(String url) {
        if (url == null || url.trim().isEmpty()) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "无法打开：" + url, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (menuOpen) {
            toggleMenu(false);
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        stopNativeSpeech();
        if (textToSpeech != null) {
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    public class HermesBridge {
        @JavascriptInterface
        public void showTools() {
            runOnUiThread(() -> toggleMenu(true));
        }

        @JavascriptInterface
        public void requestPermissions() {
            runOnUiThread(MainActivity.this::requestCorePermissions);
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> MainActivity.this.checkUpdate(true));
        }

        @JavascriptInterface
        public void downloadContent() {
            runOnUiThread(() -> fetchContentManifest(true));
        }

        @JavascriptInterface
        public boolean isSpeechAvailable() {
            return textToSpeechReady;
        }

        @JavascriptInterface
        public boolean speakText(String messageId, String text, String lang) {
            return speakNative(messageId, text, lang);
        }

        @JavascriptInterface
        public void stopSpeech() {
            runOnUiThread(MainActivity.this::stopNativeSpeech);
        }
    }
}
