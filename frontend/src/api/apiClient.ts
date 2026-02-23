import axios, { type AxiosError } from "axios";

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

apiClient.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config;
    if (!originalRequest || err.response?.status !== 401) {
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
        (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);
        return apiClient(originalRequest);
      })
      .catch((refreshErr) => {
        processQueue(refreshErr, null);
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
