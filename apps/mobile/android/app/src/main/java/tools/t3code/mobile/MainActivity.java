package tools.t3code.mobile;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.view.ViewCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);

        WebView webView = getBridge().getWebView();
        webView.setBackgroundColor(Color.BLACK);
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
}
