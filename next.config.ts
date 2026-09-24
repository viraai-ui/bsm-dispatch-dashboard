import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: { '/*': ['./data/**/*.json'] },
}

export default nextConfig
