import type { Metadata } from 'next'

import { LegalDocument } from '../_components/LegalDocument'

export const metadata: Metadata = {
  title: 'Terms of Service — Music 4 All',
  description: 'The terms that govern your use of Music 4 All.',
}

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" updated="2026-07-28">
      <section>
        <h2>1. Acceptance of these terms</h2>
        <p>
          By accessing or using Music 4 All (the &ldquo;Service&rdquo;), operated by{' '}
          <strong>TuGfA</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to be
          bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. What the Service is</h2>
        <p>
          Music 4 All is an unofficial tool that connects to <strong>your own</strong> Tidal
          account, through Tidal&rsquo;s authorization flow, to let you download and play tracks
          available under your subscription. We are not affiliated with, endorsed by, or sponsored
          by Tidal. See the <a href="/legal/disclaimer">Disclaimer</a>.
        </p>
      </section>

      <section>
        <h2>3. Eligibility and your Tidal account</h2>
        <ul>
          <li>You must be at least 18 years old (or the age of majority in your jurisdiction).</li>
          <li>
            You must have a valid, active Tidal subscription and the right to access the content
            you download.
          </li>
          <li>
            You are responsible for complying with Tidal&rsquo;s own terms of service. Using this
            Service does not grant you any rights beyond those your Tidal subscription already
            gives you.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Acceptable use</h2>
        <p>You agree that you will not:</p>
        <ul>
          <li>Use the Service to infringe copyright or any third-party right (see the <a href="/legal/copyright">Copyright &amp; DMCA</a> policy).</li>
          <li>Redistribute, sell, publicly perform, or share downloaded content.</li>
          <li>
            Access the Service through automated means (bots, scrapers) or attempt to circumvent
            rate limits, quotas, or other technical safeguards.
          </li>
          <li>Share your session, resell access, or operate the Service on behalf of others at scale.</li>
          <li>Interfere with, overload, or attempt to compromise the Service or its infrastructure.</li>
        </ul>
      </section>

      <section>
        <h2>5. Quotas, fair use, and suspension</h2>
        <p>
          To keep the Service available for everyone and to protect shared third-party
          credentials, we apply per-user quotas and rate limits. Repeated attempts to exceed them,
          or any abusive or unlawful use, may result in temporary throttling or the{' '}
          <strong>suspension (ban)</strong> of your account at our discretion. We may act
          automatically or after manual review.
        </p>
      </section>

      <section>
        <h2>6. Availability; no warranty</h2>
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
          <strong>&ldquo;as available&rdquo;</strong>, without warranties of any kind. Because the
          Service depends on third-party systems, access may be degraded, interrupted, or
          discontinued at any time without notice. See the{' '}
          <a href="/legal/disclaimer">Disclaimer</a>.
        </p>
      </section>

      <section>
        <h2>7. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we will not be liable for any indirect,
          incidental, or consequential damages, or for any loss of data, arising from your use of
          the Service. Your sole remedy for dissatisfaction is to stop using the Service.
        </p>
      </section>

      <section>
        <h2>8. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the Service after changes
          take effect constitutes acceptance of the updated terms.
        </p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>
          Questions about these terms:{' '}
          <a href="mailto:twittersno45@gmail.com">twittersno45@gmail.com</a>.
        </p>
      </section>
    </LegalDocument>
  )
}
