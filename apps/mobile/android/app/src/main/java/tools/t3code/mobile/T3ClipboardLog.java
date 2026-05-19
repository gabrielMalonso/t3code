package tools.t3code.mobile;

import android.util.Log;

final class T3ClipboardLog {
    private static final String TAG = "T3Clipboard";

    private T3ClipboardLog() {}

    static void debug(String message) {
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            Log.i(TAG, message);
        }
    }

    static void warn(String message, Throwable error) {
        Log.w(TAG, message, error);
    }
}
