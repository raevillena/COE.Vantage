import axios, { type AxiosError } from "axios";
import { toast } from "react-hot-toast";

const baseURL = import.meta.env.VITE_API_URL ?? "/api";

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)));
  failedQueue = [];
}

/** Auth endpoints must not trigger refresh on 401 — reject so login page can show error. */
function isAuthEndpoint(config: { url?: string }): boolean {
  const url = config?.url ?? "";
  return url.includes("/auth/login") || url.includes("/auth/refresh");
}

apiClient.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config;
    if (!originalRequest || err.response?.status !== 401) {
      return Promise.reject(err);
    }
    // Never run refresh for login/refresh: let the caller handle 401 (e.g. show "Invalid password").
    if (isAuthEndpoint(originalRequest)) {
      return Promise.reject(err);
    }
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        })
        .catch((e) => Promise.reject(e));
    }
    isRefreshing = true;
    return apiClient
      .post<{ accessToken: string }>("/auth/refresh")
      .then(({ data }) => {
        const newToken = data.accessToken;
        setAccessToken(newToken);
        try {
          sessionStorage.setItem("accessToken", newToken);
        } catch {
          // ignore
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("authTokenRefreshed", { detail: newToken }));
        }
        (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      })
      .catch((refreshErr) => {
        processQueue(refreshErr, null);
        // Session likely expired: clear auth, remember reason, and send user to login.
        try {
          sessionStorage.removeItem("accessToken");
          sessionStorage.removeItem("user");
        } catch {
          // ignore storage errors
        }
        toast.error("Your session has expired. Please sign in again.");
        window.location.href = "/login";
        return Promise.reject(refreshErr);
      })
      .finally(() => {
        isRefreshing = false;
      });
  }
);

export function setAccessToken(token: string) {
  apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function clearAccessToken() {
  delete apiClient.defaults.headers.common.Authorization;
}
