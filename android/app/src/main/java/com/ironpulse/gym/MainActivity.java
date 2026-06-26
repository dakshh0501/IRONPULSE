package com.ironpulse.gym;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onStart() {
        super.onStart();

        // Extend Capacitor's BridgeWebViewClient to preserve all critical
        // functionality (asset serving via shouldInterceptRequest, bridge
        // lifecycle via onPageStarted/onPageFinished, error handling, etc.)
        // while adding intent:// URL handling for PhonePe deep links.
        bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();

                // Let Capacitor handle http/https URLs normally
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return super.shouldOverrideUrlLoading(view, request);
                }

                // For intent://, tel://, mailto:// and other custom schemes,
                // launch them externally via an Android Intent
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    return true;
                } catch (Exception e) {
                    // If no app can handle the intent, let Capacitor try
                    return super.shouldOverrideUrlLoading(view, request);
                }
            }
        });
    }
}
