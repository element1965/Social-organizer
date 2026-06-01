package com.socialorganizer.app;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "InstallReferrer";
    private static final String PREFS = "install_referrer";
    private static final String KEY_PROCESSED = "processed";
    private static final String WEB_BASE = "https://www.orginizer.com";
    private static final String INVITE_PREFIX = "invite_";

    private InstallReferrerClient referrerClient;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_PROCESSED, false)) return;

        try {
            referrerClient = InstallReferrerClient.newBuilder(this).build();
            referrerClient.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int responseCode) {
                    if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                        try {
                            ReferrerDetails details = referrerClient.getInstallReferrer();
                            handleReferrer(details.getInstallReferrer());
                        } catch (Exception e) {
                            Log.w(TAG, "getInstallReferrer failed", e);
                        }
                    }
                    prefs.edit().putBoolean(KEY_PROCESSED, true).apply();
                    try { referrerClient.endConnection(); } catch (Exception ignored) {}
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    // No-op: don't retry; the OS will re-fire onInstallReferrerSetupFinished if it reconnects.
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "InstallReferrerClient init failed", e);
            prefs.edit().putBoolean(KEY_PROCESSED, true).apply();
        }
    }

    private void handleReferrer(String referrer) {
        if (referrer == null || !referrer.startsWith(INVITE_PREFIX)) return;
        String token = referrer.substring(INVITE_PREFIX.length());
        // tokens are hex (randomBytes(16).toString('hex')) or alphanumeric referral slugs
        if (!token.matches("[A-Za-z0-9_-]+")) return;
        String url = WEB_BASE + "/invite/" + token;
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().loadUrl(url);
            }
        });
    }
}
