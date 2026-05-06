'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { basePath } from '@/lib/basePath'

const TRACKER_CONFIG = {
  env: 'production',
  service: 'ui-stories',
  organisation: 'Holiday Extras Limited',
  lb: true,  // use current domain — we're behind the HX nginx load balancer
}

export default function TrackerInit() {
  // If the HX page already loaded window.tracker (embedded on holidayextras.com),
  // initialise it directly without loading the script again.
  useEffect(() => {
    if (window.tracker) window.tracker.initialise(TRACKER_CONFIG)
  }, [])

  return (
    <Script
      src={`${basePath}/hx-tracker.js`}
      strategy="afterInteractive"
      onLoad={() => window.tracker?.initialise(TRACKER_CONFIG)}
    />
  )
}
