export default function Privacy({ darkMode = false }) {
  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> Privacy Policy</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem', lineHeight: '1.8' }}>
        <h2>Privacy Policy</h2>
        <p><strong>Last updated: June 3, 2026</strong></p>

        <p style={{ background: darkMode ? '#2a2412' : '#fff8dc', border: `1px solid ${darkMode ? '#6b5b2a' : '#e9d27d'}`, borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <strong>Early Development Notice:</strong> Resume Rush is in early development. Features and data flows may change, and occasional bugs may affect behavior.
        </p>

        <p>
          This Privacy Policy explains how Resume Rush ("Resume Rush," "we," "us," or "our") collects,
          uses, discloses, and protects information when you use our website and services (collectively,
          the "Service"). By using the Service, you agree to this Privacy Policy.
        </p>

        <h3>1. Information We Collect</h3>
        <ul>
          <li><strong>Account Information:</strong> If you create an account, we may collect identifiers such as email address and authentication data.</li>
          <li><strong>Resume and Job Content:</strong> Files and text you submit (e.g., resumes, job descriptions, prompts) are processed to provide tailoring, generation, and export features.</li>
          <li><strong>Usage and Device Data:</strong> We may collect technical data such as request metadata, feature usage, browser type, IP-derived region, and basic diagnostics.</li>
          <li><strong>Billing and Subscription Data:</strong> If you purchase paid features, payment processing is handled by third-party processors. We may store subscription status, plan tier, transaction references, and billing event metadata, but not full payment card numbers.</li>
          <li><strong>Support Communications:</strong> Information you send to us via email or support channels.</li>
        </ul>

        <h3>2. How We Use Information</h3>
        <ul>
          <li>To operate the Service and deliver requested features.</li>
          <li>To generate tailored resumes, cover letters, and related outputs.</li>
          <li>To authenticate users, manage subscriptions, enforce limits, and prevent abuse.</li>
          <li>To monitor reliability, troubleshoot errors, and improve performance and quality.</li>
          <li>To communicate service, billing, policy, and support-related messages.</li>
          <li>To comply with legal obligations and enforce our Terms.</li>
        </ul>

        <h3>3. Legal Bases (where applicable)</h3>
        <p>
          Depending on your location, we process personal data under one or more legal bases: your consent,
          performance of a contract with you, legitimate interests (such as product security and improvement),
          and legal compliance.
        </p>

        <h3>4. AI and Third-Party Processing</h3>
        <p>
          We use third-party services, including AI providers and payment processors, to deliver core functionality.
          Data you submit may be transmitted to those providers only as needed to perform requested operations.
          Those providers process data according to their own terms and privacy policies.
        </p>

        <h3>5. Data Retention</h3>
        <p>
          We retain information for as long as needed for the purposes described in this policy, including
          service delivery, billing records, legal compliance, dispute resolution, and security investigations.
          Some uploaded content may be processed transiently and deleted after processing, while account,
          subscription, and operational records may be retained longer.
        </p>

        <h3>6. Data Sharing and Disclosure</h3>
        <p>We may share information with:</p>
        <ul>
          <li><strong>Service providers</strong> that host, analyze, process payments, or support operations.</li>
          <li><strong>Legal and compliance recipients</strong> when required by law, regulation, court order, or valid legal process.</li>
          <li><strong>Business transaction counterparties</strong> in the context of a merger, financing, acquisition, or asset sale.</li>
        </ul>
        <p>We do not sell your personal information for money.</p>

        <h3>7. Security</h3>
        <p>
          We implement reasonable administrative, technical, and organizational safeguards to protect personal data.
          No method of transmission or storage is completely secure, so we cannot guarantee absolute security.
        </p>

        <h3>8. International Data Transfers</h3>
        <p>
          Your information may be processed in countries other than your own, where data protection laws may differ.
          Where required, we apply appropriate safeguards for cross-border data transfers.
        </p>

        <h3>9. Your Rights and Choices</h3>
        <p>Depending on your jurisdiction, you may have rights to:</p>
        <ul>
          <li>Access, correct, or delete personal information.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Request data portability.</li>
          <li>Withdraw consent where processing is based on consent.</li>
          <li>Appeal certain privacy decisions and lodge complaints with regulators.</li>
        </ul>
        <p>
          To exercise rights, contact us at the email below. We may need to verify your identity before fulfilling requests.
        </p>

        <h3>10. Children’s Privacy</h3>
        <p>
          The Service is not directed to children under 13 (or higher age where required by local law).
          We do not knowingly collect personal information from children without appropriate authorization.
        </p>

        <h3>11. Policy Updates</h3>
        <p>
          We may update this Privacy Policy periodically. We will post the updated version with a revised
          "Last updated" date.
        </p>

        <h3>12. Contact</h3>
        <p>
          If you have privacy questions or requests, contact us at resumerushio@gmail.com.
        </p>
      </div>
    </div>
  )
}
