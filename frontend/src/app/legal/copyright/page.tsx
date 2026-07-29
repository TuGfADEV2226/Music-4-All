import type { Metadata } from 'next'

import { LegalDocument } from '../_components/LegalDocument'

export const metadata: Metadata = {
  title: 'Copyright & DMCA — Music 4 All',
  description: 'Copyright policy and how to file a takedown notice.',
}

export default function CopyrightPage() {
  return (
    <LegalDocument title="Copyright & DMCA Policy" updated="2026-07-28">
      <section>
        <h2>1. Respect for copyright</h2>
        <p>
          Music 4 All respects the intellectual property rights of others and expects its users to
          do the same. The Service is intended only to let you access content available under{' '}
          <strong>your own</strong> Tidal subscription, for your personal use. You are solely
          responsible for how you use the content you download, including compliance with the
          licenses that apply to it and with Tidal&rsquo;s terms.
        </p>
      </section>

      <section>
        <h2>2. No redistribution</h2>
        <p>
          Downloaded content is licensed, not owned. You may not copy, distribute, publicly
          perform, broadcast, or make available to the public any content obtained through the
          Service, except as expressly permitted by the applicable rights holders.
        </p>
      </section>

      <section>
        <h2>3. Filing a copyright takedown notice (DMCA)</h2>
        <p>
          If you believe content or functionality made available through the Service infringes a
          copyright you own or control, send a written notice to our designated agent:
        </p>
        <ul>
          <li><strong>Designated agent:</strong> TuGfA</li>
          <li>
            <strong>Email:</strong>{' '}
            <a href="mailto:twittersno45@gmail.com">twittersno45@gmail.com</a>
          </li>
        </ul>
        <p>Your notice must include:</p>
        <ul>
          <li>Your physical or electronic signature.</li>
          <li>Identification of the copyrighted work claimed to have been infringed.</li>
          <li>Identification of the material that is claimed to be infringing and its location.</li>
          <li>Your contact information (address, telephone number, and email).</li>
          <li>
            A statement that you have a good-faith belief that the use is not authorized by the
            copyright owner, its agent, or the law.
          </li>
          <li>
            A statement, under penalty of perjury, that the information in your notice is accurate
            and that you are authorized to act on behalf of the copyright owner.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Counter-notification</h2>
        <p>
          If you believe your content or access was removed or disabled by mistake or
          misidentification, you may send a counter-notification to the same designated agent,
          including the information required by applicable law (identification of the material, a
          statement under penalty of perjury of your good-faith belief, your contact information,
          and your consent to jurisdiction).
        </p>
      </section>

      <section>
        <h2>5. Repeat-infringer policy</h2>
        <p>
          In appropriate circumstances and at our discretion, we will{' '}
          <strong>suspend or ban</strong> the accounts of users who are found to be repeat
          infringers. See the account suspension section of the{' '}
          <a href="/legal/terms">Terms of Service</a>.
        </p>
      </section>
    </LegalDocument>
  )
}
