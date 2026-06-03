import { useState } from 'react'

export default function FAQ({ darkMode = false }) {
  const [openIndex, setOpenIndex] = useState(null)
  
  const faqs = [
    {
      question: "Is Resume Rush in a finished production state?",
      answer: "Not yet. Resume Rush is in early development. Features may change, and you may occasionally encounter bugs, temporary errors, or output inconsistencies. Please review all generated content carefully before submission."
    },
    {
      question: "What file formats do you support?",
      answer: "We currently support PDF, DOCX (Word), and TXT uploads. File size limits and accepted formats may be updated as the product evolves."
    },
    {
      question: "How does AI tailoring work?",
      answer: "The system analyzes your resume and job description, then rewrites and reorders content to better match role requirements. AI output is assistive and may be imperfect, so you remain responsible for factual accuracy and final edits."
    },
    {
      question: "Can I tailor for multiple jobs?",
      answer: "Yes. Depending on plan limits and feature availability, you can tailor resumes for multiple job descriptions. Processing speed and limits may vary by usage tier and system load."
    },
    {
      question: "Does tailoring overwrite my original resume?",
      answer: "Tailoring generates new output from your provided content; it does not automatically edit your original source file on your device. You should still keep your own backup copies."
    },
    {
      question: "Will my resume pass ATS systems?",
      answer: "Resume Rush is designed to improve ATS alignment through clearer structure and relevant keywords, but no tool can guarantee ATS passage or interview outcomes. Hiring systems and recruiter preferences vary by employer."
    },
    {
      question: "Can I choose different resume templates?",
      answer: "Yes. Available templates may change as we iterate on design and quality. You can preview and export using supported templates in the app."
    },
    {
      question: "How is my data handled?",
      answer: "We process submitted data to provide resume/cover letter generation and related features. Depending on the feature, some data may be processed transiently while account, billing, and operational records may be retained. See the Privacy Policy for full details."
    },
    {
      question: "Do you provide legal or career guarantees?",
      answer: "No. Resume Rush is a drafting and optimization tool, not legal or employment advice. We do not guarantee job offers, interviews, salary outcomes, or legal compliance for your submitted materials."
    },
    {
      question: "How can I contact support?",
      answer: "For support, policy, or billing questions, email resumerushio@gmail.com."
    }
  ]

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> FAQ</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
        <h2>Frequently Asked Questions</h2>
        <p style={{ background: darkMode ? '#2a2412' : '#fff8dc', border: `1px solid ${darkMode ? '#6b5b2a' : '#e9d27d'}`, borderRadius: '8px', padding: '0.85rem 1rem', lineHeight: '1.7' }}>
          <strong>Early Development Notice:</strong> Resume Rush is actively being improved. Some features may change and occasional bugs may appear. Always review your final documents before sending them to employers.
        </p>
        <div className="faq-list">
          {faqs.map((faq, idx) => (
            <div key={idx} className="faq-item">
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="faq-question"
              >
                {openIndex === idx ? '▼' : '▶'} {faq.question}
              </button>
              {openIndex === idx && (
                <p className="faq-answer">{faq.answer}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
