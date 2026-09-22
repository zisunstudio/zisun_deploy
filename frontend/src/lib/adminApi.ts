import axios, { InternalAxiosRequestConfig } from "axios";
import { attachRefresh, getAccessToken } from "@/lib/api";

import { API_ADMIN_V1 } from "@/lib/apiBase";

export const adminApi = axios.create({
  baseURL: API_ADMIN_V1,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token on every request
adminApi.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// The console gets the same silent refresh as the storefront. Without it a
// 15-minute access token expired while she filled a long form, and the save
// came back "token expired" with her work unrecoverable on the screen.
attachRefresh(adminApi);
