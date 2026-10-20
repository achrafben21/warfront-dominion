package com.warfront.dominion;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;

/**
 * Native Android shell for WARFRONT: DOMINION.
 * Hosts the game (bundled offline in assets/) in a fullscreen hardware-accelerated
 * WebView and exposes a small file-based storage bridge so saves survive reliably.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(10, 14, 12));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new NativeBridge(this), "WarfrontNative");
        setContentView(web);
        hideSystemUi();
        web.loadUrl("file:///android_asset/game/index.html");
    }

    private void hideSystemUi() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.evaluateJavascript("window.WF_onAppPause && window.WF_onAppPause();", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("window.WF_onAppResume && window.WF_onAppResume();", null);
        }
        hideSystemUi();
    }

    @Override
    public void onBackPressed() {
        if (web != null) {
            web.evaluateJavascript("(window.WF_onBack && window.WF_onBack()) ? '1' : '0'",
                    new android.webkit.ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String v) {
                            if (v == null || !v.contains("1")) finish();
                        }
                    });
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** File storage bridge: atomic writes (tmp + rename) so an interrupted save never corrupts the old one. */
    public static class NativeBridge {
        private final Context ctx;

        NativeBridge(Context c) { ctx = c.getApplicationContext(); }

        private File fileFor(String key) {
            String safe = key.replaceAll("[^A-Za-z0-9_\\-]", "_");
            File dir = new File(ctx.getFilesDir(), "wf");
            if (!dir.exists()) dir.mkdirs();
            return new File(dir, safe + ".json");
        }

        @JavascriptInterface
        public boolean save(String key, String data) {
            try {
                File f = fileFor(key);
                File tmp = new File(f.getPath() + ".tmp");
                FileOutputStream o = new FileOutputStream(tmp);
                o.write(data.getBytes("UTF-8"));
                o.getFD().sync();
                o.close();
                if (f.exists() && !f.delete()) return false;
                return tmp.renameTo(f);
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String load(String key) {
            try {
                File f = fileFor(key);
                if (!f.exists()) return null;
                FileInputStream in = new FileInputStream(f);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] b = new byte[16384];
                int n;
                while ((n = in.read(b)) > 0) bo.write(b, 0, n);
                in.close();
                return new String(bo.toByteArray(), "UTF-8");
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public boolean remove(String key) {
            File f = fileFor(key);
            return !f.exists() || f.delete();
        }

        @JavascriptInterface
        public String platform() { return "android-" + Build.VERSION.SDK_INT; }
    }
}
