// @ts-check

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https?.*(\/api\/v1\/catalog\/feed)/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "feed-cache",
        expiration: { maxEntries: 50, maxAgeSeconds: 300 },
      },
    },
    {
      urlPattern: /^https?.*\.(png|jpg|jpeg|webp|svg|gif)/,
      handler: "CacheFirst",
      options: {
        cacheName: "image-cache",
        expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**", // Temporarily allow all for scaffold testing
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
  },
};

// Sentry wrapping — only active when DSN is configured; no-ops otherwise
const withSentryConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? require("@sentry/nextjs").withSentryConfig
  : (config) => config;

module.exports = withSentryConfig(
  withPWA(nextConfig),
  {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  },
  {
    widenClientFileUpload: true,
    transpileClientSDK: true,
    hideSourceMaps: true,
    disableLogger: true,
  }
);
