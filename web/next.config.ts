import type { NextConfig } from 'next';

// GitHub Pages supplies /codex32; root hosting and a custom domain use ''.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
if (basePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(basePath)) {
  throw new Error(
    'NEXT_PUBLIC_BASE_PATH must be empty or a path without a trailing slash',
  );
}
const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
};

export default nextConfig;
