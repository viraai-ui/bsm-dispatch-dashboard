import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], display: 'swap' })

export const metadata: Metadata = {
  title: 'BSM Dispatch',
  applicationName: 'BSM Dispatch',
  description: 'BSM Dispatch Dashboard.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'BSM Dispatch',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-180x180.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.ico'],
  },
}

export const viewport: Viewport = {
  themeColor: '#c8102e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={poppins.className}>{children}</body>
    </html>
  )
}
