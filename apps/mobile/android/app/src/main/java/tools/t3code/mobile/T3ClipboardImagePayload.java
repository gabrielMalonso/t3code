package tools.t3code.mobile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.List;

final class T3ClipboardImagePayload {
    private T3ClipboardImagePayload() {}

    static JSObject toJson(List<T3ClipboardImageReader.ImageData> imageDataList) {
        JSObject result = new JSObject();
        JSArray items = new JSArray();
        for (T3ClipboardImageReader.ImageData imageData : imageDataList) {
            items.put(toJson(imageData));
        }

        T3ClipboardImageReader.ImageData first = imageDataList.isEmpty() ? null : imageDataList.get(0);
        result.put("value", first == null ? "" : first.value);
        result.put("type", first == null ? "" : first.type);
        result.put("items", items);
        return result;
    }

    private static JSObject toJson(T3ClipboardImageReader.ImageData imageData) {
        JSObject item = new JSObject();
        item.put("value", imageData.value);
        item.put("type", imageData.type);
        return item;
    }
}
