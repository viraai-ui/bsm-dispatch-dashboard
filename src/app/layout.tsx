import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import './globals.css'

const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], display: 'swap' })

export const metadata: Metadata = {
  title: 'BSM Dispatch Dashboard',
  description: 'Serial, QR label, packaging, dispatch, warranty and machine passport dashboard for BSM India.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={poppins.className}>{children}</body>
    </html>
  )
}
