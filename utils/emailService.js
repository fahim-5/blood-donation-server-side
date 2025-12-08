const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const logger = require('./../middleware/loggerMiddleware').logger;

// Email configuration
let transporter;

const initializeEmailService = () => {
    try {
        // Check if email configuration exists
        const emailConfig = {
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        };

        // If no SMTP config, use Ethereal for testing
        if (!emailConfig.host || !emailConfig.auth.user) {
            logger.warn('SMTP configuration not found. Using Ethereal test account.');
            return null;
        }

        transporter = nodemailer.createTransport(emailConfig);

        // Verify connection
        transporter.verify((error, success) => {
            if (error) {
                logger.error(`Email service initialization failed: ${error.message}`);
            } else {
                logger.info('Email service initialized successfully');
            }
        });

        return transporter;
    } catch (error) {
        logger.error(`Email service initialization error: ${error.message}`);
        return null;
    }
};

// Get email transporter
const getTransporter = () => {
    if (!transporter) {
        return initializeEmailService();
    }
    return transporter;
};

// Email templates directory
const templatesDir = path.join(__dirname, '../templates/email');

// Render email template
const renderTemplate = async (templateName, data = {}) => {
    try {
        const templatePath = path.join(templatesDir, `${templateName}.ejs`);
        
        // Check if template exists
        if (!fs.existsSync(templatePath)) {
            logger.warn(`Email template not found: ${templateName}.ejs`);
            return {
                subject: data.subject || 'Notification',
                html: `<div>${data.message || 'No content'}</div>`,
                text: data.message || 'No content'
            };
        }

        // Read template file
        const template = fs.readFileSync(templatePath, 'utf8');
        
        // Render template with data
        const html = ejs.render(template, {
            ...data,
            currentYear: new Date().getFullYear(),
            appName: process.env.APP_NAME || 'Blood Donation App',
            appUrl: process.env.APP_URL || 'http://localhost:3000',
            supportEmail: process.env.SUPPORT_EMAIL || 'support@blooddonation.com'
        });

        // Extract subject from template or use default
        let subject = data.subject || 'Notification';
        const subjectMatch = html.match(/<title>(.*?)<\/title>/i);
        if (subjectMatch) {
            subject = subjectMatch[1];
        }

        // Generate plain text version (simple strip of HTML)
        const text = html
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return { subject, html, text };
    } catch (error) {
        logger.error(`Template rendering error: ${error.message}`);
        return {
            subject: data.subject || 'Notification',
            html: `<div>${data.message || 'No content'}</div>`,
            text: data.message || 'No content'
        };
    }
};

// Send email
const sendEmail = async (options) => {
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
        const emailTransporter = getTransporter();
        if (!emailTransporter) {
            logger.warn('Email transporter not available. Email not sent.');
            return { success: false, message: 'Email service not configured' };
        }

        // Render template if provided
        let emailContent;
        if (template) {
            emailContent = await renderTemplate(template, { ...data, subject });
        } else {
            emailContent = {
                subject: subject || 'Notification',
                html: data.html || `<div>${data.message || 'No content'}</div>`,
                text: data.text || data.message || 'No content'
            };
        }

        // Prepare email options
        const mailOptions = {
            from: process.env.SMTP_FROM || `"Blood Donation App" <${process.env.SMTP_USER}>`,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
            cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
            bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
            attachments
        };

        // Send email
        const info = await emailTransporter.sendMail(mailOptions);
        
        logger.info(`Email sent to ${to}: ${info.messageId}`);
        
        return {
            success: true,
            messageId: info.messageId,
            response: info.response
        };
    } catch (error) {
        logger.error(`Email sending error to ${to}: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Send welcome email
const sendWelcomeEmail = async (user) => {
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

// Send password reset email
const sendPasswordResetEmail = async (user, resetToken) => {
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

// Send donation request notification
const sendDonationRequestEmail = async (donor, donationRequest) => {
    return sendEmail({
        to: donor.email,
        subject: 'New Blood Donation Request in Your Area',
        template: 'donation-request',
        data: {
            name: donor.name,
            recipientName: donationRequest.recipientName,
            bloodGroup: donationRequest.bloodGroup,
            hospitalName: donationRequest.hospitalName,
            hospitalAddress: donationRequest.hospitalAddress,
            donationDate: new Date(donationRequest.donationDate).toLocaleDateString(),
            donationTime: donationRequest.donationTime,
            requestLink: `${process.env.APP_URL}/donation-requests/${donationRequest._id}`,
            urgencyLevel: donationRequest.urgencyLevel
        }
    });
};

// Send donation status update
const sendDonationStatusEmail = async (user, donationRequest, status) => {
    let subject, statusText;
    
    switch (status) {
        case 'inprogress':
            subject = 'Donation Request Accepted';
            statusText = 'has been accepted by a donor';
            break;
        case 'done':
            subject = 'Donation Completed Successfully';
            statusText = 'has been completed successfully';
            break;
        case 'canceled':
            subject = 'Donation Request Cancelled';
            statusText = 'has been cancelled';
            break;
        default:
            subject = 'Donation Status Updated';
            statusText = `status has been updated to ${status}`;
    }

    return sendEmail({
        to: user.email,
        subject,
        template: 'donation-status',
        data: {
            name: user.name,
            recipientName: donationRequest.recipientName,
            bloodGroup: donationRequest.bloodGroup,
            status: statusText,
            donationLink: `${process.env.APP_URL}/dashboard/donation-requests/${donationRequest._id}`
        }
    });
};

// Send account status change email
const sendAccountStatusEmail = async (user, status) => {
    const subject = status === 'blocked' 
        ? 'Your Account Has Been Blocked' 
        : 'Your Account Has Been Unblocked';
    
    return sendEmail({
        to: user.email,
        subject,
        template: 'account-status',
        data: {
            name: user.name,
            status: status === 'blocked' ? 'blocked' : 'active',
            supportEmail: process.env.SUPPORT_EMAIL || 'support@blooddonation.com',
            action: status === 'blocked' ? 'blocked by an administrator' : 'unblocked and is now active'
        }
    });
};

// Send funding receipt
const sendFundingReceiptEmail = async (user, funding) => {
    return sendEmail({
        to: user.email,
        subject: 'Thank You for Your Donation',
        template: 'funding-receipt',
        data: {
            name: user.name,
            amount: funding.amount,
            transactionId: funding._id,
            date: new Date(funding.createdAt).toLocaleDateString(),
            paymentMethod: funding.paymentMethod,
            receiptLink: `${process.env.APP_URL}/dashboard/funding/${funding._id}/receipt`
        },
        attachments: [
            {
                filename: `receipt-${funding._id}.pdf`,
                path: `./receipts/${funding._id}.pdf` // Assuming PDF is generated elsewhere
            }
        ]
    });
};

// Send volunteer assignment email
const sendVolunteerAssignmentEmail = async (volunteer, assignment) => {
    return sendEmail({
        to: volunteer.email,
        subject: 'New Volunteer Assignment',
        template: 'volunteer-assignment',
        data: {
            name: volunteer.name,
            assignmentType: assignment.type,
            description: assignment.description,
            dueDate: new Date(assignment.dueDate).toLocaleDateString(),
            priority: assignment.priority,
            assignmentLink: `${process.env.APP_URL}/dashboard/assignments/${assignment._id}`
        }
    });
};

// Send contact form response
const sendContactFormResponse = async (contact) => {
    return sendEmail({
        to: contact.email,
        subject: `Re: ${contact.subject}`,
        template: 'contact-response',
        data: {
            name: contact.name,
            subject: contact.subject,
            response: contact.response || 'Thank you for contacting us. We will get back to you soon.',
            ticketId: contact._id,
            supportEmail: process.env.SUPPORT_EMAIL || 'support@blooddonation.com'
        }
    });
};

// Send system notification
const sendSystemNotificationEmail = async (users, notification) => {
    const emails = users.map(user => user.email);
    
    return sendEmail({
        to: emails,
        subject: notification.title,
        template: 'system-notification',
        data: {
            title: notification.title,
            message: notification.message,
            notificationDate: new Date().toLocaleDateString(),
            appName: process.env.APP_NAME || 'Blood Donation App'
        }
    });
};

// Send monthly report
const sendMonthlyReportEmail = async (user, reportData) => {
    return sendEmail({
        to: user.email,
        subject: 'Your Monthly Donation Report',
        template: 'monthly-report',
        data: {
            name: user.name,
            month: reportData.month,
            year: reportData.year,
            totalDonations: reportData.totalDonations,
            livesImpacted: reportData.livesImpacted,
            upcomingDonations: reportData.upcomingDonations,
            reportLink: `${process.env.APP_URL}/dashboard/reports/monthly`
        },
        attachments: [
            {
                filename: `monthly-report-${reportData.month}-${reportData.year}.pdf`,
                path: reportData.pdfPath
            }
        ]
    });
};

// Bulk email sender
const sendBulkEmail = async (recipients, subject, template, data = {}) => {
    const results = [];
    
    for (const recipient of recipients) {
        try {
            const result = await sendEmail({
                to: recipient.email,
                subject,
                template,
                data: { ...data, name: recipient.name }
            });
            results.push({ recipient: recipient.email, success: true, result });
        } catch (error) {
            results.push({ recipient: recipient.email, success: false, error: error.message });
        }
    }
    
    return {
        total: recipients.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
    };
};

// Email verification
const sendEmailVerification = async (user, verificationToken) => {
    const verificationLink = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    
    return sendEmail({
        to: user.email,
        subject: 'Verify Your Email Address',
        template: 'email-verification',
        data: {
            name: user.name,
            verificationLink,
            expiryTime: '24 hours'
        }
    });
};

// Check email service status
const checkEmailServiceStatus = async () => {
    try {
        const emailTransporter = getTransporter();
        if (!emailTransporter) {
            return { healthy: false, message: 'Email service not configured' };
        }
        
        await emailTransporter.verify();
        return { healthy: true, message: 'Email service is operational' };
    } catch (error) {
        return { healthy: false, message: error.message };
    }
};

module.exports = {
    initializeEmailService,
    getTransporter,
    sendEmail,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendDonationRequestEmail,
    sendDonationStatusEmail,
    sendAccountStatusEmail,
    sendFundingReceiptEmail,
    sendVolunteerAssignmentEmail,
    sendContactFormResponse,
    sendSystemNotificationEmail,
    sendMonthlyReportEmail,
    sendBulkEmail,
    sendEmailVerification,
    checkEmailServiceStatus
};