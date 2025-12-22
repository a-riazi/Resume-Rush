export default function Terms({ darkMode = false }) {
  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> Terms of Service</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem', lineHeight: '1.8' }}>
        <h2>Terms of Service</h2>
        <p><strong>Last updated: December 21, 2025</strong></p>
        
        <h3>1. Use License</h3>
        <p>Resume Rush grants you a limited, non-exclusive license to use this service for personal, non-commercial resume tailoring.</p>
        
        <h3>2. Disclaimer</h3>
        <p>Resume Rush is provided "as is." We make no warranties about the accuracy of tailored content. Always review generated resumes before submitting them to employers.</p>
        
        <h3>3. Limitations of Liability</h3>
        <p>Resume Rush shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use of the service.</p>
        
        <h3>4. User Responsibilities</h3>
        <ul>
          <li>You are responsible for the accuracy of information in your uploaded resume</li>
          <li>You agree not to misrepresent your qualifications when tailoring resumes</li>
          <li>You acknowledge that resumes should be reviewed carefully before submission</li>
        </ul>
        
        <h3>5. Acceptable Use</h3>
        <p>You agree not to use Resume Rush for any illegal or unethical purposes, including creating false credentials or misleading employers.</p>
        
        <h3>6. Termination</h3>
        <p>We reserve the right to discontinue or modify the service at any time.</p>

        <h3>7. Changes to Terms</h3>
        <p>We may update these terms from time to time. Your continued use of the service constitutes acceptance of any changes.</p>

        <h3>8. Contact</h3>
        <p>If you have questions about these terms, please contact us at legal@resumerush.com</p>
      </div>
    </div>
  )
}
