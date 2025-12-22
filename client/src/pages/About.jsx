export default function About({ darkMode = false }) {
  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> About Us</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1rem', lineHeight: '1.8' }}>
        <h2>Why Resume Rush?</h2>
        <p>In today's competitive job market, a generic resume won't cut it. Every job posting has different requirements, keywords, and priorities. Resume Rush uses AI to help you tailor your resume for each position—automatically.</p>
        
        <h3>Our Mission</h3>
        <p>We believe everyone deserves a fighting chance in the job market. Our mission is to democratize resume optimization by providing powerful AI tools that help you stand out, get past ATS systems, and land interviews.</p>
        
        <h3>How It Works</h3>
        <ol>
          <li><strong>Upload Your Resume:</strong> Drag and drop your resume (PDF, DOCX, or TXT)</li>
          <li><strong>Add Job Descriptions:</strong> Paste job descriptions from positions you're targeting</li>
          <li><strong>Tailor Automatically:</strong> Our AI analyzes and tailors your resume for each position</li>
          <li><strong>Download & Apply:</strong> Get PDF or DOCX versions ready to submit</li>
        </ol>
        
        <h3>Features</h3>
        <ul>
          <li>✨ <strong>AI-Powered Tailoring:</strong> Uses Google Gemini to match your skills with job requirements</li>
          <li>📄 <strong>Multiple Templates:</strong> Choose from 14 professional resume designs</li>
          <li>💌 <strong>Cover Letter Generation:</strong> Auto-generate targeted cover letters</li>
          <li>⚡ <strong>Batch Processing:</strong> Tailor resumes for multiple jobs at once</li>
          <li>🎯 <strong>ATS Optimization:</strong> Ensures compatibility with Applicant Tracking Systems</li>
          <li>🆓 <strong>Free to Use:</strong> No signup required, no hidden costs</li>
        </ul>
        
        <h3>Built With</h3>
        <p>Resume Rush is built with React, Node.js, and powered by Google's Generative AI to deliver fast, intelligent resume tailoring.</p>

        <h3>Why Choose Us?</h3>
        <ul>
          <li><strong>Fast:</strong> Get tailored resumes in seconds, not hours</li>
          <li><strong>Smart:</strong> AI understands job requirements and highlights your best fit</li>
          <li><strong>Professional:</strong> Choose from beautifully designed templates</li>
          <li><strong>Easy:</strong> No login needed. Start tailoring immediately</li>
          <li><strong>Free:</strong> No credit card required. No cost. No catch.</li>
        </ul>
      </div>
    </div>
  )
}
