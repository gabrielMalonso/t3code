package tools.t3code.mobile;

import android.content.ClipData;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.view.ContentInfoCompat;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;
import java.io.IOException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "T3Clipboard";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        registerPlugin(T3ClipboardPlugin.class);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);

        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.BLACK);
        ViewCompat.setOnReceiveContentListener(webView, new String[] { "image/*" }, (view, payload) -> receivePastedImage(webView, payload));
        Log.i(TAG, "Registered WebView OnReceiveContent listener for image/*");
        View webViewParent = (View) webView.getParent();
        if (webViewParent != null) {
            webViewParent.setBackgroundColor(Color.BLACK);
            ViewCompat.setOnApplyWindowInsetsListener(webViewParent, (view, insets) -> {
                view.setPadding(0, 0, 0, 0);
                return insets;
            });
            ViewCompat.requestApplyInsets(webViewParent);
        }
    }

    private ContentInfoCompat receivePastedImage(WebView webView, ContentInfoCompat payload) {
        ClipData clip = payload.getClip();
        if (clip == null) {
            Log.i(TAG, "receivePastedImage: payload had no clip");
            return payload;
        }

        try {
            Log.i(
                TAG,
                "receivePastedImage: source=" +
                payload.getSource() +
                " flags=" +
                payload.getFlags() +
                " itemCount=" +
                clip.getItemCount() +
                " description=" +
                clip.getDescription()
            );
            T3ClipboardImageReader.ImageData imageData = T3ClipboardImageReader.readFromClip(this, clip, clip.getDescription());
            if (!imageData.isPresent()) {
                Log.i(TAG, "receivePastedImage: no readable image in payload");
                return payload;
            }
            Log.i(TAG, "receivePastedImage: dispatching image type=" + imageData.type + " valueLength=" + imageData.value.length());
            dispatchPastedImage(webView, imageData);
            return null;
        } catch (IOException | SecurityException error) {
            Log.w(TAG, "receivePastedImage: failed to read image", error);
            return payload;
        }
    }

    private void dispatchPastedImage(WebView webView, T3ClipboardImageReader.ImageData imageData) {
        String detail =
            "{\"value\":" + JSONObject.quote(imageData.value) + ",\"type\":" + JSONObject.quote(imageData.type) + "}";
        String script =
            "window.dispatchEvent(new CustomEvent('t3code:android-clipboard-image',{detail:" + detail + "}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
