/**
 * Google Analytics 4 (gtag.js), loaded after hydration so it never blocks the
 * page. Client-side navigations are counted by GA4's enhanced measurement
 * (browser history events), so no router hook is needed. Production only —
 * `next dev` visits stay out of the reports.
 */

import Script from 'next/script';

const MEASUREMENT_ID = 'G-BJHS0LL0J0';

export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== 'production') return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
