import axios, { InternalAxiosRequestConfig } from "axios";
import { getAccessToken } from "@/lib/api";

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
