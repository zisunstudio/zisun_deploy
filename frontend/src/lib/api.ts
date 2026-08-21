/**
 * Axios instance with automatic auth header injection and token refresh.
 * Access token lives in memory (never localStorage) to avoid XSS theft.
 * Refresh token lives in an httpOnly cookie — the browser sends it automatically.
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

import { API_V1 } from "@/lib/apiBase";

const BASE_URL = API_V1;

// ── In-memory token store ────────────────────────────────────────────────────
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ── Axios instance ────────────────────────────────────────────────────────────
export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,   // send the refresh_token httpOnly cookie automatically
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor — attach Bearer token ─────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (_accessToken) {
    config.headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return config;
});

// ── Response interceptor — silent token refresh on 401 ───────────────────────
let _isRefreshing = false;
let _refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }

    original._retried = true;

    if (_isRefreshing) {
      // Queue this request until the refresh completes
      return new Promise((resolve) => {
        _refreshQueue.push((token) => {
          original.headers["Authorization"] = `Bearer ${token}`;
          resolve(api(original));
        });
      });
    }

    _isRefreshing = true;
    try {
      const { data } = await axios.post(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken: string = data.access_token;
      setAccessToken(newToken);
      _refreshQueue.forEach((cb) => cb(newToken));
      _refreshQueue = [];
      original.headers["Authorization"] = `Bearer ${newToken}`;
      return api(original);
    } catch {
      // Refresh failed — clear token and let the caller handle
      setAccessToken(null);
      _refreshQueue = [];
      return Promise.reject(error);
    } finally {
      _isRefreshing = false;
    }
  }
);
