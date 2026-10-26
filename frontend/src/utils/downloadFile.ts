import toast from "react-hot-toast";
import { apiClient } from "../api/apiClient";

/**
 * Downloads a file from an API endpoint through the shared client (so the session and refresh logic apply).
 * Uses the server's file name when it is exposed. On failure shows the server's message, which arrives as a blob.
 */
export async function downloadFromApi(path: string, params: Record<string, string>, fallbackName: string): Promise<boolean> {
  try {
    const res = await apiClient.get<Blob>(path, { params, responseType: "blob" });
    const disposition = String(res.headers?.["content-disposition"] ?? "");
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(res.data);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Download started");
    return true;
  } catch (err: unknown) {
    const blob = (err as { response?: { data?: unknown } })?.response?.data;
    let message = "Export failed";
    if (blob instanceof Blob) {
      try {
        message = (JSON.parse(await blob.text()) as { message?: string }).message ?? message;
      } catch {
        /* keep the default */
      }
    }
    toast.error(message);
    return false;
  }
}
