export default function About({ darkMode = false }) {
  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> About Us</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem', lineHeight: '1.8' }}>
        <h2>About Resume Rush</h2>

        <p style={{ background: darkMode ? '#2a2412' : '#fff8dc', border: `1px solid ${darkMode ? '#6b5b2a' : '#e9d27d'}`, borderRadius: '8px', padding: '0.85rem 1rem' }}>
          <strong>Early Development Notice:</strong> Resume Rush is in early development. We are continuously shipping updates, and some workflows may change as we improve reliability, accuracy, and usability.
        </p>

        <p>
          Resume Rush is an AI-assisted resume optimization platform designed to help candidates adapt their
          materials for specific job descriptions faster and more consistently.
        </p>

        <h3>Our Mission</h3>
        <p>
          Our mission is to make high-quality resume tailoring accessible, transparent, and practical for
          job seekers at every level. We focus on helping users present their real experience clearly and
          effectively without unnecessary complexity.
        </p>

        <h3>What Resume Rush Does</h3>
        <ol>
          <li><strong>Ingests Resume Content:</strong> Supports standard file formats such as PDF, DOCX, and TXT.</li>
          <li><strong>Analyzes Job Requirements:</strong> Uses the provided job description to identify relevant skills and emphasis areas.</li>
          <li><strong>Generates Tailored Output:</strong> Produces role-targeted resume and optional cover letter content for review.</li>
          <li><strong>Supports Export and Iteration:</strong> Lets users preview, refine, and export documents in supported formats.</li>
        </ol>

        <h3>Core Principles</h3>
        <ul>
          <li><strong>User Control:</strong> You decide what to keep, edit, or discard before submission.</li>
          <li><strong>Practical Clarity:</strong> Focus on concise, role-relevant phrasing and readable structure.</li>
          <li><strong>Continuous Improvement:</strong> Product quality, templates, and generation logic are iterated regularly.</li>
          <li><strong>Responsible Use:</strong> We strongly discourage misrepresentation or fabricated credentials.</li>
        </ul>

        <h3>Current Feature Areas</h3>
        <ul>
          <li><strong>AI-powered resume tailoring</strong> aligned to target job descriptions.</li>
          <li><strong>Template-based document generation</strong> for multiple visual styles.</li>
          <li><strong>Cover letter drafting</strong> for faster first-pass applications.</li>
          <li><strong>Usage tracking and subscription controls</strong> for plan enforcement and billing workflows.</li>
        </ul>

        <h3>Technology Stack</h3>
        <p>
          Resume Rush is built with modern web technologies, including a React client and Node.js backend,
          with AI integrations for parsing and tailoring workflows.
        </p>

        <h3>Important Limitations</h3>
        <ul>
          <li>AI output can contain mistakes. You must verify all facts before use.</li>
          <li>No platform can guarantee ATS outcomes, interview callbacks, or offers.</li>
          <li>Template availability, limits, and features may change over time.</li>
        </ul>

        <h3>Contact</h3>
        <p>
          Questions, feedback, or support requests: resumerushio@gmail.com.
        </p>
      </div>
    </div>
  )
}
