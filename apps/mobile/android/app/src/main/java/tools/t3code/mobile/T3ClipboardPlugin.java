package tools.t3code.mobile;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;

@CapacitorPlugin(name = "T3Clipboard")
public class T3ClipboardPlugin extends Plugin {
    private static final String TAG = "T3Clipboard";

    @PluginMethod
    public void readImage(PluginCall call) {
        try {
            Log.i(TAG, "readImage plugin call");
            T3ClipboardImageReader.ImageData imageData = T3ClipboardImageReader.readFromClipboard(getContext());
            Log.i(TAG, "readImage result type=" + imageData.type + " valueLength=" + imageData.value.length());
            call.resolve(result(imageData));
        } catch (IOException | SecurityException error) {
            Log.w(TAG, "readImage failed", error);
            call.reject("Unable to read image from clipboard", error);
        }
    }

    private JSObject result(T3ClipboardImageReader.ImageData imageData) {
        JSObject result = new JSObject();
        result.put("value", imageData.value);
        result.put("type", imageData.type);
        return result;
    }
}
