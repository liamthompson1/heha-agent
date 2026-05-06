import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  basePath: process.env.BASE_PATH ?? '',
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH ?? '',
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.holidayextras.com' },
      { protocol: 'https', hostname: '**.imgix.net' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.heha.ai' },
    ],
  },
}

export default nextConfig
