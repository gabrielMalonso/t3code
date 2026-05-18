package tools.t3code.mobile;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

final class T3ClipboardImageReader {
    private static final String TAG = "T3Clipboard";

    static final class ImageData {
        final String value;
        final String type;

        ImageData(String value, String type) {
            this.value = value;
            this.type = type;
        }

        boolean isPresent() {
            return !value.isEmpty() && !type.isEmpty();
        }
    }

    private T3ClipboardImageReader() {}

    static ImageData readFromClipboard(Context context) throws IOException {
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip()) {
            Log.i(TAG, "readFromClipboard: clipboard missing or empty");
            return empty();
        }
        Log.i(TAG, "readFromClipboard: primary clip description=" + clipboard.getPrimaryClipDescription());
        return readFromClip(context, clipboard.getPrimaryClip(), clipboard.getPrimaryClipDescription());
    }

    static ImageData readFromClip(Context context, ClipData clip, ClipDescription description) throws IOException {
        if (clip == null || clip.getItemCount() == 0) {
            Log.i(TAG, "readFromClip: clip missing or empty");
            return empty();
        }

        Log.i(TAG, "readFromClip: itemCount=" + clip.getItemCount() + " description=" + description);
        for (int index = 0; index < clip.getItemCount(); index += 1) {
            Log.i(TAG, "readFromClip: reading item index=" + index);
            ImageData imageData = readFromItem(context, clip.getItemAt(index), description);
            if (imageData.isPresent()) {
                Log.i(TAG, "readFromClip: found image item index=" + index + " type=" + imageData.type);
                return imageData;
            }
        }

        Log.i(TAG, "readFromClip: no image found");
        return empty();
    }

    private static ImageData readFromItem(Context context, ClipData.Item item, ClipDescription description) throws IOException {
        ImageData textResult = imageResultFromText(item.getText());
        if (textResult.isPresent()) {
            Log.i(TAG, "readFromItem: item text was image data URL type=" + textResult.type);
            return textResult;
        }

        Uri imageUri = item.getUri();
        if (imageUri == null && item.getIntent() != null) {
            imageUri = item.getIntent().getData();
            Log.i(TAG, "readFromItem: using intent data uri=" + sanitizeUri(imageUri));
        }
        if (imageUri == null) {
            CharSequence coerced = item.coerceToText(context);
            Log.i(TAG, "readFromItem: uri missing; coerced text length=" + (coerced == null ? 0 : coerced.length()));
            textResult = imageResultFromText(coerced);
            if (textResult.isPresent()) {
                Log.i(TAG, "readFromItem: coerced text was image data URL type=" + textResult.type);
                return textResult;
            }
            imageUri = uriFromClipboardText(coerced);
        }
        if (imageUri == null) {
            Log.i(TAG, "readFromItem: no image uri");
            return empty();
        }

        Log.i(TAG, "readFromItem: reading uri=" + sanitizeUri(imageUri));
        byte[] bytes = readUriBytes(context, imageUri);
        if (bytes.length == 0) {
            Log.i(TAG, "readFromItem: uri read returned empty bytes");
            return empty();
        }

        String mimeType = resolveImageMimeType(context, description, imageUri, bytes);
        Log.i(TAG, "readFromItem: bytes=" + bytes.length + " resolvedMimeType=" + mimeType);
        if (!isImageMimeType(mimeType)) {
            return empty();
        }

        String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
        return new ImageData("data:" + mimeType + ";base64," + base64, mimeType);
    }

    private static ImageData imageResultFromText(CharSequence text) {
        if (text == null) {
            return empty();
        }

        String value = text.toString().trim();
        if (!isImageDataUrl(value)) {
            return empty();
        }

        return new ImageData(value, mimeTypeFromDataUrl(value));
    }

    private static Uri uriFromClipboardText(CharSequence text) {
        if (text == null) {
            return null;
        }

        String value = text.toString().trim();
        if (value.isEmpty()) {
            return null;
        }

        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        if ("content".equals(scheme) || "file".equals(scheme)) {
            return uri;
        }
        return null;
    }

    private static byte[] readUriBytes(Context context, Uri uri) throws IOException {
        try (
            InputStream input = context.getContentResolver().openInputStream(uri);
            ByteArrayOutputStream output = new ByteArrayOutputStream()
        ) {
            if (input == null) {
                throw new IOException("Clipboard image URI could not be opened");
            }

            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
            return output.toByteArray();
        }
    }

    private static String sanitizeUri(Uri uri) {
        if (uri == null) {
            return "null";
        }
        String scheme = uri.getScheme();
        String authority = uri.getAuthority();
        return String.valueOf(scheme) + "://" + String.valueOf(authority);
    }

    private static String resolveImageMimeType(Context context, ClipDescription description, Uri uri, byte[] bytes) {
        String resolverType = context.getContentResolver().getType(uri);
        if (isSpecificImageMimeType(resolverType)) {
            return resolverType.toLowerCase(Locale.US);
        }

        String extension = MimeTypeMap.getFileExtensionFromUrl(uri.toString());
        if (extension != null) {
            String extensionType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase(Locale.US));
            if (isSpecificImageMimeType(extensionType)) {
                return extensionType.toLowerCase(Locale.US);
            }
        }

        if (description != null) {
            for (int index = 0; index < description.getMimeTypeCount(); index += 1) {
                String describedType = description.getMimeType(index);
                if (isSpecificImageMimeType(describedType)) {
                    return describedType.toLowerCase(Locale.US);
                }
            }
        }

        return sniffImageMimeType(bytes);
    }

    private static String sniffImageMimeType(byte[] bytes) {
        if (
            bytes.length >= 8 &&
            (bytes[0] & 0xff) == 0x89 &&
            bytes[1] == 0x50 &&
            bytes[2] == 0x4e &&
            bytes[3] == 0x47
        ) {
            return "image/png";
        }
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8 && (bytes[2] & 0xff) == 0xff) {
            return "image/jpeg";
        }
        if (
            bytes.length >= 6 &&
            bytes[0] == 0x47 &&
            bytes[1] == 0x49 &&
            bytes[2] == 0x46 &&
            bytes[3] == 0x38 &&
            (bytes[4] == 0x37 || bytes[4] == 0x39) &&
            bytes[5] == 0x61
        ) {
            return "image/gif";
        }
        if (
            bytes.length >= 12 &&
            bytes[0] == 0x52 &&
            bytes[1] == 0x49 &&
            bytes[2] == 0x46 &&
            bytes[3] == 0x46 &&
            bytes[8] == 0x57 &&
            bytes[9] == 0x45 &&
            bytes[10] == 0x42 &&
            bytes[11] == 0x50
        ) {
            return "image/webp";
        }
        if (
            bytes.length >= 12 &&
            bytes[4] == 0x66 &&
            bytes[5] == 0x74 &&
            bytes[6] == 0x79 &&
            bytes[7] == 0x70
        ) {
            String brand = new String(bytes, 8, 4);
            if (brand.startsWith("avif")) {
                return "image/avif";
            }
            if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("hevc") || brand.startsWith("hevx")) {
                return "image/heic";
            }
        }
        if (bytes.length >= 2 && bytes[0] == 0x42 && bytes[1] == 0x4d) {
            return "image/bmp";
        }
        if (
            bytes.length >= 4 &&
            ((bytes[0] == 0x49 && bytes[1] == 0x49 && bytes[2] == 0x2a && bytes[3] == 0x00) ||
                (bytes[0] == 0x4d && bytes[1] == 0x4d && bytes[2] == 0x00 && bytes[3] == 0x2a))
        ) {
            return "image/tiff";
        }
        return "";
    }

    private static boolean isImageDataUrl(String value) {
        String normalized = value.toLowerCase(Locale.US);
        return normalized.startsWith("data:image/") && normalized.contains(";base64,");
    }

    private static boolean isImageMimeType(String mimeType) {
        return mimeType != null && mimeType.toLowerCase(Locale.US).startsWith("image/");
    }

    private static boolean isSpecificImageMimeType(String mimeType) {
        return isImageMimeType(mimeType) && !mimeType.toLowerCase(Locale.US).endsWith("/*");
    }

    private static String mimeTypeFromDataUrl(String dataUrl) {
        int start = dataUrl.indexOf(':');
        int end = dataUrl.indexOf(';');
        if (start < 0 || end <= start) {
            return "image/png";
        }
        String mimeType = dataUrl.substring(start + 1, end).toLowerCase(Locale.US);
        return isImageMimeType(mimeType) ? mimeType : "image/png";
    }

    private static ImageData empty() {
        return new ImageData("", "");
    }
}
