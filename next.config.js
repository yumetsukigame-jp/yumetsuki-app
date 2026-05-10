/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: false, // Turbopack を完全に無効化
  },
  webpack: (config) => {
    return config;
  },
  typescript: {
    ignoreBuildErrors: true, // TypeScript エラーを無視してビルドを通す
  },
  eslint: {
    ignoreDuringBuilds: true, // ESLint エラーを無視してビルドを通す
  },
};

module.exports = nextConfig;
