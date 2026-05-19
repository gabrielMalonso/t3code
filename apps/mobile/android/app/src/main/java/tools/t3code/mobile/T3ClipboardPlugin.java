package tools.t3code.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.List;

@CapacitorPlugin(name = "T3Clipboard")
public class T3ClipboardPlugin extends Plugin {
    @PluginMethod
    public void readImage(PluginCall call) {
        try {
            T3ClipboardLog.debug("readImage plugin call");
            List<T3ClipboardImageReader.ImageData> imageDataList = T3ClipboardImageReader.readFromClipboard(getContext());
            T3ClipboardLog.debug("readImage result imageCount=" + imageDataList.size());
            call.resolve(T3ClipboardImagePayload.toJson(imageDataList));
        } catch (IOException | SecurityException error) {
            T3ClipboardLog.warn("readImage failed", error);
            call.reject("Unable to read image from clipboard", error);
        }
    }
}
