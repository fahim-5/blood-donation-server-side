// server/src/utils/emailService.js
import nodemailer from 'nodemailer';

// Create a simple email service without EJS templates initially
const createTransporter = async () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Use real SMTP configuration
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Use Ethereal test account for development
    console.log('No SMTP configuration found. Creating test account...');
    const testAccount = await nodemailer.createTestAccount();
    
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    
    console.log('Test account created. You can view emails at: https://ethereal.email');
    console.log('Test user:', testAccount.user);
    console.log('Test pass:', testAccount.pass);
    
    return transporter;
  }
};

// Simple template function (no EJS dependency)
const renderTemplate = (templateName, data = {}) => {
  const templates = {
    'contact-auto-reply': (data) => ({
      subject: data.subject || 'Thank you for contacting us',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Thank you for contacting Blood Donation App!</h2>
          <p>Dear ${data.name || 'Valued User'},</p>
          <p>We have received your message regarding "${data.subject || 'your inquiry'}".</p>
          <p>Our team will review your message and get back to you within 24-48 hours.</p>
          <p><strong>Reference ID:</strong> ${data.referenceId || 'N/A'}</p>
          <p><strong>Category:</strong> ${data.category || 'General'}</p>
          <p>If you have any urgent matters, please contact us at: ${process.env.SUPPORT_EMAIL || 'support@blooddonation.app'}</p>
          <br>
          <p>Best regards,<br>The Blood Donation App Team</p>
        </div>
      `,
      text: `Thank you for contacting Blood Donation App! We have received your message regarding "${data.subject}". Our team will review it and get back to you within 24-48 hours. Reference ID: ${data.referenceId || 'N/A'}.`
    }),
    
    'contact-response': (data) => ({
      subject: `Re: ${data.subject || 'Your inquiry'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Response to your inquiry</h2>
          <p>Dear ${data.name || 'Valued User'},</p>
          <p>Thank you for contacting us. Here is our response:</p>
          <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
            <p>${data.response || 'Thank you for your message.'}</p>
          </div>
          <p><strong>Responded by:</strong> ${data.responderName || 'Support Team'} (${data.responderRole || 'Support'})</p>
          <p>If you have further questions, please reply to this email.</p>
          <br>
          <p>Best regards,<br>The Blood Donation App Team</p>
        </div>
      `,
      text: `Response to your inquiry: ${data.response || 'Thank you for your message.'}`
    }),
    
    'welcome': (data) => ({
      subject: 'Welcome to Blood Donation App!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Blood Donation App!</h2>
          <p>Dear ${data.name || 'New User'},</p>
          <p>Thank you for joining our community of life-savers! Your registration is complete.</p>
          <p>You can now:</p>
          <ul>
            <li>Search for blood donors in your area</li>
            <li>Request blood donations when needed</li>
            <li>Manage your donation history</li>
            <li>Receive important notifications</li>
          </ul>
          <p>If you need to verify your email, please click <a href="${data.verificationLink || '#'}">here</a>.</p>
          <br>
          <p>Best regards,<br>The Blood Donation App Team</p>
        </div>
      `,
      text: `Welcome to Blood Donation App! Thank you for joining our community.`
    }),
    
    'password-reset': (data) => ({
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset</h2>
          <p>Dear ${data.name || 'User'},</p>
          <p>You have requested to reset your password. Please click the link below to reset your password:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${data.resetLink || '#'}" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Password</a>
          </p>
          <p>This link will expire in ${data.expiryTime || '10 minutes'}.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <br>
          <p>Best regards,<br>The Blood Donation App Team</p>
        </div>
      `,
      text: `Password reset requested. Click here to reset: ${data.resetLink || '#'}. This link expires in ${data.expiryTime || '10 minutes'}.`
    }),
    
    'default': (data) => ({
      subject: data.subject || 'Notification',
      html: `<div>${data.message || 'No content'}</div>`,
      text: data.message || 'No content'
    })
  };

  const template = templates[templateName] || templates['default'];
  return template(data);
};

// Main sendEmail function
export const sendEmail = async (options) => {
  const {
    to,
    subject,
    template,
    data = {},
    cc,
    bcc,
    attachments = []
  } = options;

  try {
    const transporter = await createTransporter();
    
    let emailContent;
    if (template) {
      emailContent = renderTemplate(template, { ...data, subject });
    } else {
      emailContent = {
        subject: subject || 'Notification',
        html: data.html || `<div>${data.message || 'No content'}</div>`,
        text: data.text || data.message || 'No content'
      };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || `"Blood Donation App" <noreply@blooddonation.app>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Log test email URL if using Ethereal
    if (!process.env.SMTP_HOST) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('Email preview URL:', previewUrl);
    }
    
    console.log(`Email sent to ${to}: ${info.messageId}`);
    
    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info)
    };
  } catch (error) {
    console.error(`Email sending error to ${to}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Convenience functions
export const sendWelcomeEmail = async (user) => {
  return sendEmail({
    to: user.email,
    subject: 'Welcome to Blood Donation App!',
    template: 'welcome',
    data: {
      name: user.name,
      email: user.email,
      verificationLink: `${process.env.APP_URL}/verify-email?token=${user.emailVerificationToken}`
    }
  });
};

export const sendPasswordResetEmail = async (user, resetToken) => {
  const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
  
  return sendEmail({
    to: user.email,
    subject: 'Password Reset Request',
    template: 'password-reset',
    data: {
      name: user.name,
      resetLink,
      expiryTime: '10 minutes'
    }
  });
};

export default sendEmail;