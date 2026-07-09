import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BSM Dispatch Dashboard',
  description: 'Serial, QR label, packaging, dispatch, warranty and machine passport dashboard for BSM India.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
