// Email templates styled to match Resume Rocket website theme

const getWarningEmailHTML = (type, data) => {
  const baseStyles = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a;
    line-height: 1.6;
  `;

  const containerStyles = `
    max-width: 600px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `;

  const headerStyles = `
    background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%);
    color: #ffffff;
    padding: 40px 20px;
    text-align: center;
  `;

  const contentStyles = `
    padding: 40px 30px;
  `;

  const buttonStyles = `
    display: inline-block;
    background: #0f766e;
    color: #ffffff;
    padding: 12px 32px;
    border-radius: 6px;
    text-decoration: none;
    font-weight: 600;
    margin-top: 20px;
    border: none;
    cursor: pointer;
  `;

  const alertBoxStyles = `
    background: #fff7ed;
    border-left: 4px solid #ea580c;
    padding: 20px;
    margin: 20px 0;
    border-radius: 4px;
  `;

  const footerStyles = `
    background: #f8f8f8;
    padding: 20px 30px;
    text-align: center;
    color: #666;
    font-size: 12px;
    border-top: 1px solid #eee;
  `;

  let subject = '';
  let heading = '';
  let content = '';
  let alertMessage = '';

  if (type === 'low-generations') {
    subject = `⚠️ Low on Generations - Resume Rocket`;
    heading = '⚠️ Low on Generations';
    alertMessage = `You have only <strong>${data.remaining} generations</strong> remaining in your current plan.`;
    content = `
      <p>Hi ${data.userName || 'there'},</p>
      <p>You're running low on your generation allowance. ${alertMessage}</p>
      <p>Consider upgrading to a higher tier to keep tailoring your resume without interruptions.</p>
    `;
  } else if (type === 'expiration-soon') {
    subject = `⏰ Your Resume Rocket Plan Expires Soon`;
    heading = '⏰ Plan Expiring Soon';
    alertMessage = `Your plan expires in <strong>${data.daysLeft} day${data.daysLeft > 1 ? 's' : ''}</strong>.`;
    content = `
      <p>Hi ${data.userName || 'there'},</p>
      <p>${alertMessage}</p>
      <p>Renew or upgrade your plan now to continue using Resume Rocket without interruption.</p>
    `;
  } else if (type === 'subscription-cancelled') {
    subject = `Your Resume Rocket Subscription Will End`;
    heading = 'Subscription Ending';
    alertMessage = `Your monthly subscription has been cancelled. You have <strong>${data.daysLeft} day${data.daysLeft > 1 ? 's' : ''}</strong> of access remaining.`;
    content = `
      <p>Hi ${data.userName || 'there'},</p>
      <p>${alertMessage}</p>
      <p>After this period ends, your account will revert to the free tier (3 generations per day).</p>
      <p>If you'd like to keep your subscription active, you can reactivate it anytime.</p>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            ${baseStyles}
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            ${containerStyles}
          }
          .header {
            ${headerStyles}
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
          }
          .content {
            ${contentStyles}
          }
          .content p {
            margin: 15px 0;
            font-size: 16px;
            color: #333;
          }
          .alert-box {
            ${alertBoxStyles}
          }
          .cta-button {
            ${buttonStyles}
          }
          .cta-button:hover {
            background: #0d5d57;
            text-decoration: none;
          }
          .footer {
            ${footerStyles}
          }
          .footer a {
            color: #0f766e;
            text-decoration: none;
          }
          .footer a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${heading}</h1>
          </div>
          <div class="content">
            <div class="alert-box">
              ${alertMessage}
            </div>
            ${content}
            <a href="${data.actionUrl || 'https://www.resumerocket.ai'}" class="cta-button">
              ${type === 'low-generations' ? 'View Plans' : 'Manage Subscription'}
            </a>
          </div>
          <div class="footer">
            <p>© 2026 Resume Rocket. All rights reserved.</p>
            <p>
              <a href="https://www.resumerocket.ai/account">Account Settings</a> | 
              <a href="https://www.resumerocket.ai">Home</a>
            </p>
            <p>If you prefer not to receive these emails, you can update your notification preferences in your account settings.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
};

module.exports = { getWarningEmailHTML };
