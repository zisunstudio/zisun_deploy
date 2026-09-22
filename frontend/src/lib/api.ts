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
//
// Shared by both clients. It used to live only on `api`, so the console's
// `adminApi` had no refresh at all: the access token lasts 15 minutes, a
// product form takes longer than that to fill, and the save came back
// "token expired" with everything she had typed still on screen and no way
// to send it. She then retyped and saved again, which is how one piece ended
// up with three sets of variants. A 401 on an admin call must refresh and
// retry exactly like a customer call.
let _isRefreshing = false;
let _refreshQueue: Array<(token: string) => void> = [];

export function attachRefresh(instance: AxiosInstance) {
  instance.interceptors.response.use(
    (res) => res,
    async (error) => {
      const original = error.config;

      if (error.response?.status !== 401 || !original || original._retried) {
        return Promise.reject(error);
      }

      original._retried = true;

      if (_isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          _refreshQueue.push((token) => {
            if (!token) return reject(error);
            original.headers["Authorization"] = `Bearer ${token}`;
            resolve(instance(original));
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
        return instance(original);
      } catch {
        // Refresh failed — clear the token and let the caller handle it.
        // Queued callers are rejected rather than left hanging for ever.
        setAccessToken(null);
        _refreshQueue.forEach((cb) => cb(""));
        _refreshQueue = [];
        return Promise.reject(error);
      } finally {
        _isRefreshing = false;
      }
    }
  );
}

attachRefresh(api);
