import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const { loadEnvConfig } = nextEnv
loadEnvConfig(path.resolve(currentDir, '../..'))

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
