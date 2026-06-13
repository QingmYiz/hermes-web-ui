package ai.hermes.webui;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.graphics.Color;
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

    private WebView webView;
    private ProgressBar progressBar;
    private FrameLayout root;
    private LinearLayout floatingPanel;
    private Button floatingKnob;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean menuOpen = false;
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
        webView.loadUrl(BuildConfig.DEFAULT_WEB_URL);
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
        floatingPanel.setBackgroundColor(Color.argb(235, 17, 24, 39));
        floatingPanel.setVisibility(View.GONE);

        addToolButton("刷新页面", () -> webView.reload());
        addToolButton("申请权限", this::requestCorePermissions);
        addToolButton("下载内容", () -> fetchContentManifest(true));
        addToolButton("检查更新", () -> checkUpdate(true));
        addToolButton("浏览器打开", () -> openExternal(webView.getUrl()));
        addToolButton("回到首页", () -> webView.loadUrl(BuildConfig.DEFAULT_WEB_URL));

        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(dp(150), ViewGroup.LayoutParams.WRAP_CONTENT);
        panelParams.gravity = Gravity.BOTTOM | Gravity.END;
        panelParams.setMargins(0, 0, dp(16), dp(86));
        root.addView(floatingPanel, panelParams);

        floatingKnob = new Button(this);
        floatingKnob.setText("⚙");
        floatingKnob.setTextSize(20);
        floatingKnob.setTextColor(Color.WHITE);
        floatingKnob.setBackgroundColor(Color.argb(235, 20, 184, 166));
        FrameLayout.LayoutParams knobParams = new FrameLayout.LayoutParams(dp(54), dp(54));
        knobParams.gravity = Gravity.BOTTOM | Gravity.END;
        knobParams.setMargins(0, 0, dp(16), dp(24));
        root.addView(floatingKnob, knobParams);
        floatingKnob.setOnClickListener(v -> toggleMenu());
        floatingKnob.setOnTouchListener(this::dragKnob);
    }

    private void addToolButton(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.argb(255, 31, 41, 55));
        button.setOnClickListener(v -> {
            toggleMenu(false);
            action.run();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(40)
        );
        params.setMargins(0, 0, 0, dp(6));
        floatingPanel.addView(button, params);
    }

    private boolean dragKnob(View view, MotionEvent event) {
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) view.getLayoutParams();
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                knobStartLeft = params.leftMargin;
                knobStartTop = params.topMargin;
                return false;
            case MotionEvent.ACTION_MOVE:
                float dx = event.getRawX() - downRawX;
                float dy = event.getRawY() - downRawY;
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
            default:
                return false;
        }
    }

    private void movePanelNearKnob(int left, int top) {
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) floatingPanel.getLayoutParams();
        params.gravity = Gravity.TOP | Gravity.START;
        params.leftMargin = Math.max(0, Math.min(root.getWidth() - dp(150), left - dp(96)));
        params.topMargin = Math.max(0, top - dp(260));
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
        new AlertDialog.Builder(this)
            .setTitle("发现新版本" + (versionName.isEmpty() ? "" : " " + versionName))
            .setMessage(notes)
            .setNegativeButton("取消", null)
            .setPositiveButton("下载更新", (dialog, which) -> downloadApk(apkUrl))
            .show();
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
                runOnUiThread(() -> showContentDialog(items));
            } catch (Exception e) {
                if (showEmpty) runOnUiThread(() -> Toast.makeText(this, "内容清单加载失败：" + e.getMessage(), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    private void showContentDialog(JSONArray items) {
        String[] labels = new String[items.length()];
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            labels[i] = item == null ? "内容 " + (i + 1) : item.optString("title", "内容 " + (i + 1));
        }
        new AlertDialog.Builder(this)
            .setTitle("下载内容")
            .setItems(labels, (dialog, which) -> {
                JSONObject item = items.optJSONObject(which);
                if (item == null) return;
                String url = item.optString("url", "");
                String title = item.optString("title", URLUtil.guessFileName(url, null, null));
                if (url.isEmpty()) {
                    Toast.makeText(this, "下载地址为空", Toast.LENGTH_SHORT).show();
                    return;
                }
                enqueueDownload(url, URLUtil.guessFileName(url, null, null), title);
            })
            .show();
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
