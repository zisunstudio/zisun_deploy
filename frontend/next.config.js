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
    // Allowlist ONLY the media host. `hostname: "**"` turns next/image into an
    // open proxy: anyone can pass an arbitrary URL through our domain, and on a
    // per-transformation billing plan we pay for strangers' images.
    // Adding a CDN or a second bucket means adding an entry here, deliberately.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "zisun-media.fly.storage.tigris.dev",
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
