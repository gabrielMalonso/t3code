/**
 * Classify a browser File into an attachment type based on its MIME type or
 * file extension.
 *
 * Returns `null` for unsupported/unrecognised file types.
 */
export function classifyFile(file: File): "image" | "document" | "text_file" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "document";
  if (file.type.startsWith("text/")) return "text_file";

  // Fallback: check file extension for text files
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext && ["txt", "md", "csv", "json", "log", "xml"].includes(ext)) return "text_file";

  return null;
}
