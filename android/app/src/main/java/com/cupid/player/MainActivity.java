package com.cupid.player;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Updated from JS (window.CupidNative.setPlaying) whenever playback
    // starts or stops, so lifecycle decisions don't need async JS queries.
    private volatile boolean isAudioPlaying = false;
    private volatile boolean inForeground = true;
    private boolean timersPaused = false;

    private class PlaybackBridge {
        @JavascriptInterface
        public void setPlaying(boolean playing) {
            isAudioPlaying = playing;
            // If she pauses from the lock screen / notification while the app
            // is backgrounded, suspend the WebView right away instead of
            // waiting for the next lifecycle event (and vice versa on play).
            if (!inForeground) {
                runOnUiThread(() -> {
                    if (playing) resumeWebView();
                    else suspendWebView();
                });
            }
        }
    }

    private void suspendWebView() {
        WebView webView = getBridge().getWebView();
        if (webView == null || timersPaused) return;
        webView.onPause();
        webView.pauseTimers();
        timersPaused = true;
    }

    private void resumeWebView() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.onResume();
        webView.resumeTimers();
        timersPaused = false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        // Let audio start without an extra tap after loading
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new PlaybackBridge(), "CupidNative");
    }

    @Override
    public void onPause() {
        super.onPause();
        inForeground = false;
        if (isAudioPlaying) {
            // Music playing: keep JS + audio alive so playback continues in
            // the background with lock-screen controls.
            resumeWebView();
        } else {
            // Idle in background: fully suspend JS timers and rendering so
            // the app uses ~no CPU or battery until foregrounded again.
            suspendWebView();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        inForeground = true;
        resumeWebView();
    }
}
