package com.cupid.player;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Bundle;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    private static final String CHANNEL_ID = "cupid_playback";
    private static final int NOTIF_ID = 7;
    private static final String ACT_PREV = "com.cupid.player.PREV";
    private static final String ACT_TOGGLE = "com.cupid.player.TOGGLE";
    private static final String ACT_NEXT = "com.cupid.player.NEXT";

    private volatile boolean isAudioPlaying = false;
    private volatile boolean inForeground = true;
    private boolean timersPaused = false;

    private MediaSessionCompat mediaSession;
    private String npTitle = "", npArtist = "", npArt = "";
    private boolean npPlaying = false;
    private Bitmap artBitmap = null;
    private String artBitmapUrl = "";

    private final BroadcastReceiver mediaButtons = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            String a = intent.getAction();
            if (ACT_PREV.equals(a)) js("prev");
            else if (ACT_TOGGLE.equals(a)) js("toggle");
            else if (ACT_NEXT.equals(a)) js("next");
        }
    };

    private class PlaybackBridge {
        @JavascriptInterface
        public void setPlaying(boolean playing) {
            isAudioPlaying = playing;
            if (!inForeground) {
                runOnUiThread(() -> { if (playing) resumeWebView(); else suspendWebView(); });
            }
        }

        @JavascriptInterface
        public void setNowPlaying(String json) {
            try {
                JSONObject o = new JSONObject(json);
                npTitle = o.optString("title", "");
                npArtist = o.optString("artist", "");
                npPlaying = o.optBoolean("playing", false);
                String art = o.optString("art", "");
                boolean artChanged = !art.equals(npArt);
                npArt = art;
                isAudioPlaying = npPlaying;
                runOnUiThread(() -> {
                    updateMediaSession();
                    if (artChanged) fetchArtThenNotify(); else showNotification();
                });
            } catch (Exception ignored) { }
        }
    }

    private void js(String cmd) {
        runOnUiThread(() -> {
            WebView w = getBridge() != null ? getBridge().getWebView() : null;
            if (w != null) {
                w.evaluateJavascript("window.__cupidMedia && window.__cupidMedia('" + cmd + "')", null);
            }
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new PlaybackBridge(), "CupidNative");

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }

        mediaSession = new MediaSessionCompat(this, "cupid-player");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { js("toggle"); }
            @Override public void onPause() { js("toggle"); }
            @Override public void onSkipToNext() { js("next"); }
            @Override public void onSkipToPrevious() { js("prev"); }
        });

        IntentFilter f = new IntentFilter();
        f.addAction(ACT_PREV); f.addAction(ACT_TOGGLE); f.addAction(ACT_NEXT);
        ContextCompat.registerReceiver(this, mediaButtons, f, ContextCompat.RECEIVER_NOT_EXPORTED);

        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this, new String[]{ Manifest.permission.POST_NOTIFICATIONS }, 42);
        }
    }

    private void updateMediaSession() {
        if (mediaSession == null) return;
        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, npTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, npArtist)
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artBitmap)
            .build());
        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
            .setState(npPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, npPlaying ? 1f : 0f)
            .build());
        mediaSession.setActive(!npTitle.isEmpty());
    }

    private void fetchArtThenNotify() {
        final String url = npArt;
        if (url == null || url.isEmpty() || !(url.startsWith("http://") || url.startsWith("https://"))
            || url.contains("//localhost")) {
            artBitmap = null; artBitmapUrl = "";
            showNotification();
            return;
        }
        if (url.equals(artBitmapUrl) && artBitmap != null) { showNotification(); return; }
        new Thread(() -> {
            Bitmap bmp = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(4000);
                c.setReadTimeout(4000);
                try (InputStream in = c.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(in);
                }
            } catch (Exception ignored) { }
            final Bitmap done = bmp;
            runOnUiThread(() -> {
                artBitmap = done; artBitmapUrl = url;
                updateMediaSession();
                showNotification();
            });
        }).start();
    }

    private void showNotification() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || mediaSession == null) return;
        if (npTitle.isEmpty()) { nm.cancel(NOTIF_ID); return; }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent piPrev = PendingIntent.getBroadcast(this, 1,
            new Intent(ACT_PREV).setPackage(getPackageName()), piFlags);
        PendingIntent piToggle = PendingIntent.getBroadcast(this, 2,
            new Intent(ACT_TOGGLE).setPackage(getPackageName()), piFlags);
        PendingIntent piNext = PendingIntent.getBroadcast(this, 3,
            new Intent(ACT_NEXT).setPackage(getPackageName()), piFlags);
        PendingIntent piOpen = PendingIntent.getActivity(this, 4,
            new Intent(this, MainActivity.class), piFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(npTitle)
            .setContentText(npArtist)
            .setLargeIcon(artBitmap)
            .setContentIntent(piOpen)
            .setOnlyAlertOnce(true)
            .setOngoing(npPlaying)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Previous", piPrev)
            .addAction(npPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                npPlaying ? "Pause" : "Play", piToggle)
            .addAction(android.R.drawable.ic_media_next, "Next", piNext)
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        nm.notify(NOTIF_ID, b.build());
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
    public void onPause() {
        super.onPause();
        inForeground = false;
        if (isAudioPlaying) resumeWebView(); else suspendWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        inForeground = true;
        resumeWebView();
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(mediaButtons); } catch (Exception ignored) { }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(NOTIF_ID);
        if (mediaSession != null) mediaSession.release();
        super.onDestroy();
    }
}
