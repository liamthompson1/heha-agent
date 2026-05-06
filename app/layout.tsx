import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import AppShell from '@/components/AppShell'
import TrackerInit from '@/components/TrackerInit'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
import './globals.css'

config.autoAddCss = false

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HEHA',
  description: 'Your AI travel assistant',
}

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="h-full antialiased" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <AppShell>{children}</AppShell>
        <TrackerInit />
      </body>
    </html>
  )
}
