package se.gunning.valhalla;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** Full-screen WebView around the Valhalla browser client, plus the touch / gamepad overlay (assets/overlay.js). */
public class MainActivity extends Activity {
    private WebView web;
    private String overlay;
    private final String host = Uri.parse(BuildConfig.SERVER_URL).getHost();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        overlay = readAsset("overlay.js");
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        setContentView(web);
        highRefresh();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest r) { r.deny(); }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (host != null && host.equals(u.getHost()) || "about".equals(u.getScheme())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (overlay != null) v.evaluateJavascript(overlay, null);
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                v.loadData("<body style='background:#000;color:#e0b84a;font:20px sans-serif;text-align:center;padding-top:15vh'>"
                    + "Can't reach the server.<br><br><a style='color:#fff' href='" + BuildConfig.SERVER_URL + "'>Retry</a></body>", "text/html", "utf-8");
            }
        });

        web.loadUrl(BuildConfig.SERVER_URL);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            for (int n; (n = in.read(b)) > 0; ) out.write(b, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) { return null; }
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) immersive(); }
    @Override protected void onPause() { super.onPause(); web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }

    // ---------- gamepad: Android's own events are authoritative (no reliance on the browser Gamepad API's mapping) ----------
    // Bit layout matches the W3C "standard" gamepad that overlay.js expects:
    // 0 A 1 B 2 X 3 Y 4 L1 5 R1 6 L2 7 R2 8 Select 9 Start 10 L3 11 R3 12 Up 13 Down 14 Left 15 Right
    private int keyMask, axisMask;
    private float lx, ly, rx, ry;
    private String lastPad = "";

    private static int bit(int kc) {
        switch (kc) {
            case KeyEvent.KEYCODE_BUTTON_A: return 0;
            case KeyEvent.KEYCODE_BUTTON_B: return 1;
            case KeyEvent.KEYCODE_BUTTON_X: return 2;
            case KeyEvent.KEYCODE_BUTTON_Y: return 3;
            case KeyEvent.KEYCODE_BUTTON_L1: return 4;
            case KeyEvent.KEYCODE_BUTTON_R1: return 5;
            case KeyEvent.KEYCODE_BUTTON_L2: return 6;
            case KeyEvent.KEYCODE_BUTTON_R2: return 7;
            case KeyEvent.KEYCODE_BUTTON_SELECT: return 8;
            case KeyEvent.KEYCODE_BUTTON_START: return 9;
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return 10;
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return 11;
            case KeyEvent.KEYCODE_DPAD_UP: return 12;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 13;
            case KeyEvent.KEYCODE_DPAD_LEFT: return 14;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 15;
            default: return -1;
        }
    }

    private static boolean isPad(InputDevice d) {
        return d != null && (d.getSources() & (InputDevice.SOURCE_GAMEPAD | InputDevice.SOURCE_JOYSTICK)) != 0;
    }

    private void pushPad() {
        int mask = keyMask | axisMask;
        String s = mask + "," + String.format(java.util.Locale.US, "%.2f,%.2f,%.2f,%.2f", lx, ly, rx, ry);
        if (s.equals(lastPad)) return;
        lastPad = s;
        web.evaluateJavascript("window.__vhPad&&window.__vhPad(" + s + ")", null);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        int b = bit(e.getKeyCode());
        if (b >= 0 && isPad(e.getDevice())) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) keyMask |= 1 << b;
            else if (e.getAction() == KeyEvent.ACTION_UP) keyMask &= ~(1 << b);
            pushPad();
            return true;   // never let the WebView turn A into Enter or the d-pad into focus moves
        }
        return super.dispatchKeyEvent(e);
    }

    private static float stronger(float a, float b) { return Math.abs(a) >= Math.abs(b) ? a : b; }

    @Override public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if ((e.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK && e.getAction() == MotionEvent.ACTION_MOVE) {
            lx = e.getAxisValue(MotionEvent.AXIS_X);
            ly = e.getAxisValue(MotionEvent.AXIS_Y);
            rx = stronger(e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RX));
            ry = stronger(e.getAxisValue(MotionEvent.AXIS_RZ), e.getAxisValue(MotionEvent.AXIS_RY));
            float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X), hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
            float lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
            float rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
            int m = 0;
            if (hy < -.5f) m |= 1 << 12;
            if (hy > .5f) m |= 1 << 13;
            if (hx < -.5f) m |= 1 << 14;
            if (hx > .5f) m |= 1 << 15;
            if (lt > .5f) m |= 1 << 6;
            if (rt > .5f) m |= 1 << 7;
            axisMask = m;
            pushPad();
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    /** Ask for the display's fastest mode at the current resolution (120 Hz on the Odin 3). */
    private void highRefresh() {
        try {
            Display d = Build.VERSION.SDK_INT >= 30 ? getDisplay() : getWindowManager().getDefaultDisplay();
            Display.Mode cur = d.getMode(), best = cur;
            for (Display.Mode m : d.getSupportedModes())
                if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight() && m.getRefreshRate() > best.getRefreshRate()) best = m;
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            getWindow().setAttributes(lp);
        } catch (Exception ignored) { }
    }

    /** Back = Escape (close panel / open pause menu); on the title screens it leaves the app. */
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.__vhBack ? window.__vhBack() : 'exit'", r -> {
            if (r == null || r.contains("exit")) finish();
        });
    }
}
