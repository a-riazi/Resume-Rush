import { useState } from 'react'

export default function FAQ({ darkMode = false }) {
  const [openIndex, setOpenIndex] = useState(null)
  
  const faqs = [
    {
      question: "Is Resume Rush really free?",
      answer: "Yes! Resume Rush is completely free to use. No signup required, no hidden costs. We believe everyone deserves access to resume optimization tools."
    },
    {
      question: "What file formats do you support?",
      answer: "We support PDF, DOCX (Word), and TXT files. Your resume must be under 10MB."
    },
    {
      question: "How does AI tailoring work?",
      answer: "Our AI analyzes your resume and the job description you provide, then rewrites sections to highlight relevant skills, experiences, and keywords that match the position."
    },
    {
      question: "Can I tailor for multiple jobs at once?",
      answer: "Absolutely! Add multiple job descriptions and we'll generate tailored resumes for all of them in one go."
    },
    {
      question: "Does tailoring hurt my original resume?",
      answer: "No. Tailoring creates a new version of your resume. Your original data stays intact and you can always start fresh."
    },
    {
      question: "Will my resume pass ATS systems?",
      answer: "Our AI tailors your resume to include relevant keywords and formatting that ATS systems look for, improving your chances of passing initial screening."
    },
    {
      question: "Can I choose different resume templates?",
      answer: "Yes! We offer 14 professionally designed templates. You can choose your preferred style before downloading."
    },
    {
      question: "Is my resume data secure?",
      answer: "Your resume data is processed temporarily to generate tailored versions. We don't store your resume files permanently."
    }
  ]

  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <h1><img src="./Logo.png" alt="Resume Rush Logo" className="header-logo" /> FAQ</h1>
      </header>
      <div className="container static-page" style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
        <h2>Frequently Asked Questions</h2>
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
