package com.socialorganizer.app;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.net.Uri;
import android.util.Log;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "InstallReferrer";
    private static final String PREFS = "install_referrer";
    private static final String KEY_PROCESSED = "processed";
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
        if (referrer == null) return;
        Uri params = Uri.parse("https://localhost/?" + referrer);
        boolean tagged = "1".equals(params.getQueryParameter("so_campaign"));
        String token = referrer.startsWith(INVITE_PREFIX)
            ? referrer.substring(INVITE_PREFIX.length()) : tagged ? params.getQueryParameter("invite") : null;
        String baseUrl = getString(R.string.install_referrer_web_url);
        Uri.Builder destination = Uri.parse(baseUrl).buildUpon();
        boolean hasInvite = token != null && token.matches("[A-Za-z0-9_-]{1,128}");
        if (hasInvite) destination.appendPath("invite").appendPath(token);
        else destination.appendPath("login");

        boolean hasCampaign = false;
        for (String key : new String[]{"utm_source", "utm_medium", "utm_campaign"}) {
            String value = tagged ? params.getQueryParameter(key) : null;
            if (value == null || !value.matches("[A-Za-z0-9][A-Za-z0-9_-]{0,63}")) continue;
            destination.appendQueryParameter(key, value);
            hasCampaign = true;
        }
        if (!hasInvite && !hasCampaign) return;
        String url = destination.build().toString();
        runOnUiThread(() -> {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().loadUrl(url);
            }
        });
    }
}
