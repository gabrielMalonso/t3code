package tools.t3code.mobile;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.util.AttributeSet;
import android.util.Log;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;
import com.getcapacitor.CapacitorWebView;
import java.io.IOException;
import org.json.JSONObject;

public class T3CapacitorWebView extends CapacitorWebView {
    private static final String TAG = "T3Clipboard";
    private static final String[] SUPPORTED_CONTENT_MIME_TYPES = new String[] { "image/*" };

    public T3CapacitorWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection inputConnection = super.onCreateInputConnection(outAttrs);
        if (outAttrs == null) {
            Log.i(TAG, "onCreateInputConnection: EditorInfo missing");
            return inputConnection;
        }

        EditorInfoCompat.setContentMimeTypes(outAttrs, SUPPORTED_CONTENT_MIME_TYPES);
        Log.i(TAG, "onCreateInputConnection: advertised contentMimeTypes=image/*");

        if (inputConnection == null) {
            Log.i(TAG, "onCreateInputConnection: InputConnection missing");
            return null;
        }

        return InputConnectionCompat.createWrapper(inputConnection, outAttrs, this::handleCommitContent);
    }

    private boolean handleCommitContent(InputContentInfoCompat contentInfo, int flags, Bundle opts) {
        ClipDescription description = contentInfo.getDescription();
        Uri contentUri = contentInfo.getContentUri();
        Log.i(
            TAG,
            "commitContent: uri=" +
            sanitizeUri(contentUri) +
            " flags=" +
            flags +
            " optsPresent=" +
            (opts != null) +
            " description=" +
            description
        );

        boolean permissionRequested = false;
        if ((flags & InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0) {
            try {
                contentInfo.requestPermission();
                permissionRequested = true;
                Log.i(TAG, "commitContent: requested read permission");
            } catch (Exception error) {
                Log.w(TAG, "commitContent: failed to request read permission", error);
            }
        }

        try {
            ClipData clip = new ClipData(description, new ClipData.Item(contentUri));
            T3ClipboardImageReader.ImageData imageData = T3ClipboardImageReader.readFromClip(getContext(), clip, description);
            if (!imageData.isPresent()) {
                Log.i(TAG, "commitContent: no readable image");
                return false;
            }

            Log.i(TAG, "commitContent: dispatching image type=" + imageData.type + " valueLength=" + imageData.value.length());
            dispatchPastedImage(imageData);
            return true;
        } catch (IOException | SecurityException error) {
            Log.w(TAG, "commitContent: failed to read image", error);
            return false;
        } finally {
            if (permissionRequested) {
                try {
                    contentInfo.releasePermission();
                } catch (Exception error) {
                    Log.w(TAG, "commitContent: failed to release read permission", error);
                }
            }
        }
    }

    private void dispatchPastedImage(T3ClipboardImageReader.ImageData imageData) {
        String detail =
            "{\"value\":" + JSONObject.quote(imageData.value) + ",\"type\":" + JSONObject.quote(imageData.type) + "}";
        String script = "window.dispatchEvent(new CustomEvent('t3code:android-clipboard-image',{detail:" + detail + "}));";
        post(() -> evaluateJavascript(script, null));
    }

    private String sanitizeUri(Uri uri) {
        if (uri == null) {
            return "null";
        }
        return String.valueOf(uri.getScheme()) + "://" + String.valueOf(uri.getAuthority());
    }
}
