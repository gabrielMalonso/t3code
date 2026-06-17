package tools.t3code.mobile;

import android.content.ClipData;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.view.ContentInfoCompat;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;
import java.io.IOException;
import java.util.List;

public class MainActivity extends BridgeActivity {
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
        T3ClipboardLog.debug("Registered WebView OnReceiveContent listener for image/*");
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
            T3ClipboardLog.debug("receivePastedImage: payload had no clip");
            return payload;
        }

        try {
            T3ClipboardLog.debug(
                "receivePastedImage: source=" +
                payload.getSource() +
                " flags=" +
                payload.getFlags() +
                " itemCount=" +
                clip.getItemCount() +
                " description=" +
                clip.getDescription()
            );
            List<T3ClipboardImageReader.ImageData> imageDataList = T3ClipboardImageReader.readFromClip(this, clip, clip.getDescription());
            if (imageDataList.isEmpty()) {
                T3ClipboardLog.debug("receivePastedImage: no readable image in payload");
                return payload;
            }
            T3ClipboardLog.debug("receivePastedImage: dispatching imageCount=" + imageDataList.size());
            dispatchPastedImages(webView, imageDataList);
            return null;
        } catch (IOException | SecurityException error) {
            T3ClipboardLog.warn("receivePastedImage: failed to read image", error);
            return payload;
        }
    }

    private void dispatchPastedImages(WebView webView, List<T3ClipboardImageReader.ImageData> imageDataList) {
        String detail = T3ClipboardImagePayload.toJson(imageDataList).toString();
        String script =
            "window.dispatchEvent(new CustomEvent('t3code:android-clipboard-image',{detail:" + detail + "}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
