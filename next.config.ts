import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['apartments-demonstrated-trainers-paragraph.trycloudflare.com', 'sara-precision-supplements-axis.trycloudflare.com', 'locks-fall-served-examination.trycloudflare.com'],
  outputFileTracingIncludes: { '/*': ['./data/**/*.json'] },
}

export default nextConfig
