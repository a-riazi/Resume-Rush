export default function Privacy({ darkMode = false }) {
  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> Privacy Policy</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem', lineHeight: '1.8' }}>
        <h2>Privacy Policy</h2>
        <p><strong>Last updated: December 21, 2025</strong></p>
        
        <h3>1. Introduction</h3>
        <p>Resume Rush ("we" or "us") respects your privacy. This Privacy Policy explains how we collect, use, and protect your information.</p>
        
        <h3>2. Information We Collect</h3>
        <ul>
          <li><strong>Resume Content:</strong> When you upload a resume, we temporarily process it to extract content and tailor it based on job descriptions.</li>
          <li><strong>Usage Data:</strong> We may collect anonymized usage statistics (e.g., features used, browser type) to improve our service.</li>
        </ul>
        
        <h3>3. How We Use Your Information</h3>
        <ul>
          <li>To generate tailored resumes and cover letters</li>
          <li>To improve and optimize our service</li>
          <li>To provide technical support if needed</li>
        </ul>
        
        <h3>4. Data Storage</h3>
        <p>Your resume and personal data are NOT permanently stored. Files are processed temporarily and then deleted from our servers.</p>
        
        <h3>5. Security</h3>
        <p>We use industry-standard encryption and security practices to protect your data during transmission.</p>
        
        <h3>6. Third-Party Services</h3>
        <p>We use Google Generative AI to power resume tailoring. Your data may be processed according to Google's privacy policies.</p>
        
        <h3>7. Changes to This Policy</h3>
        <p>We may update this policy from time to time. Changes will be posted on this page.</p>

        <h3>8. Contact Us</h3>
        <p>If you have questions about this privacy policy, please contact us at privacy@resumerush.com</p>
      </div>
    </div>
  )
}
