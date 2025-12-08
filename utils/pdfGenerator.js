const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const logger = require('./../middleware/loggerMiddleware').logger;

// PDF generation utility functions
const pdfGenerator = {
    // Generate donation request PDF
    generateDonationRequestPDF: async (donationRequest, user, options = {}) => {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: `Donation Request - ${donationRequest.recipientName}`,
                        Author: 'Blood Donation Application',
                        Subject: 'Blood Donation Request',
                        Keywords: 'blood, donation, request, medical',
                        Creator: 'Blood Donation App',
                        CreationDate: new Date()
                    }
                });

                // Create output directory if it doesn't exist
                const outputDir = path.join(__dirname, '../generated-pdfs');
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const filename = `donation-request-${donationRequest._id}-${Date.now()}.pdf`;
                const filepath = path.join(outputDir, filename);
                const stream = fs.createWriteStream(filepath);
                
                doc.pipe(stream);

                // Add header
                doc.fontSize(20)
                   .font('Helvetica-Bold')
                   .fillColor('#e74c3c')
                   .text('Blood Donation Request', { align: 'center' });
                
                doc.moveDown();
                
                // Add logo/watermark
                doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text('Blood Donation Application', { align: 'center' });
                
                doc.moveDown(2);

                // Request Information Section
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Request Information', { underline: true });
                
                doc.moveDown();

                // Create table-like structure
                const leftColumn = 50;
                const rightColumn = 300;
                let yPosition = doc.y;

                // Recipient Information
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Recipient Information:', leftColumn, yPosition);
                
                yPosition += 20;
                
                doc.font('Helvetica')
                   .fillColor('#34495e');
                
                doc.text(`Name: ${donationRequest.recipientName}`, leftColumn, yPosition);
                doc.text(`Blood Group: ${donationRequest.bloodGroup}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Hospital: ${donationRequest.hospitalName}`, leftColumn, yPosition);
                doc.text(`Date: ${moment(donationRequest.donationDate).format('DD/MM/YYYY')}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Time: ${donationRequest.donationTime}`, leftColumn, yPosition);
                doc.text(`Urgency: ${donationRequest.urgencyLevel.toUpperCase()}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Location: ${donationRequest.recipientDistrict}, ${donationRequest.recipientUpazila}`, leftColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Address: ${donationRequest.hospitalAddress}`, leftColumn, yPosition);
                yPosition += 30;

                // Requester Information
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Requester Information:', leftColumn, yPosition);
                
                yPosition += 20;
                
                doc.font('Helvetica')
                   .fillColor('#34495e');
                
                doc.text(`Name: ${user.name}`, leftColumn, yPosition);
                doc.text(`Email: ${user.email}`, rightColumn, yPosition);
                yPosition += 20;
                
                if (user.phone) {
                    doc.text(`Phone: ${user.phone}`, leftColumn, yPosition);
                }
                
                if (user.bloodGroup) {
                    doc.text(`Blood Group: ${user.bloodGroup}`, rightColumn, yPosition);
                }
                yPosition += 30;

                // Request Details
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Request Details:', leftColumn, yPosition);
                
                yPosition += 20;
                
                doc.font('Helvetica')
                   .fillColor('#34495e');
                
                doc.text(`Request ID: ${donationRequest._id}`, leftColumn, yPosition);
                doc.text(`Status: ${donationRequest.status.toUpperCase()}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Created: ${moment(donationRequest.createdAt).format('DD/MM/YYYY HH:mm')}`, leftColumn, yPosition);
                doc.text(`Required Units: ${donationRequest.requiredUnits || 1}`, rightColumn, yPosition);
                yPosition += 30;

                // Message
                if (donationRequest.requestMessage) {
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Message:', leftColumn, yPosition);
                    
                    yPosition += 20;
                    
                    doc.font('Helvetica')
                       .fillColor('#34495e')
                       .text(donationRequest.requestMessage, {
                            width: 500,
                            align: 'left'
                       });
                    
                    yPosition += 60;
                }

                // Donor Information (if applicable)
                if (donationRequest.donor && donationRequest.status === 'inprogress') {
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor('#27ae60')
                       .text('Donor Information:', leftColumn, yPosition);
                    
                    yPosition += 20;
                    
                    // This would need to be populated from the user data
                    doc.font('Helvetica')
                       .fillColor('#34495e')
                       .text('Donor has been assigned and will contact you soon.', leftColumn, yPosition);
                    
                    yPosition += 30;
                }

                // Footer
                const footerY = doc.page.height - 100;
                
                doc.fontSize(10)
                   .font('Helvetica-Oblique')
                   .fillColor('#7f8c8d')
                   .text('This is an auto-generated document from Blood Donation Application.', 
                         50, footerY, { width: 500, align: 'center' });
                
                doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, 
                         50, footerY + 20, { width: 500, align: 'center' });
                
                doc.text('For any queries, please contact: support@blooddonationapp.com', 
                         50, footerY + 40, { width: 500, align: 'center' });

                // Add page border
                doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50)
                   .strokeColor('#e74c3c')
                   .stroke();

                doc.end();

                stream.on('finish', () => {
                    resolve({
                        success: true,
                        filepath,
                        filename,
                        url: `/generated-pdfs/${filename}`,
                        size: fs.statSync(filepath).size
                    });
                });

                stream.on('error', (error) => {
                    reject({
                        success: false,
                        error: error.message
                    });
                });

            } catch (error) {
                logger.error(`Generate donation request PDF error: ${error.message}`);
                reject({
                    success: false,
                    error: error.message
                });
            }
        });
    },

    // Generate user profile PDF
    generateUserProfilePDF: async (user, options = {}) => {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: `User Profile - ${user.name}`,
                        Author: 'Blood Donation Application',
                        Subject: 'User Profile',
                        Keywords: 'user, profile, blood, donation',
                        Creator: 'Blood Donation App',
                        CreationDate: new Date()
                    }
                });

                const outputDir = path.join(__dirname, '../generated-pdfs');
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const filename = `user-profile-${user._id}-${Date.now()}.pdf`;
                const filepath = path.join(outputDir, filename);
                const stream = fs.createWriteStream(filepath);
                
                doc.pipe(stream);

                // Header
                doc.fontSize(24)
                   .font('Helvetica-Bold')
                   .fillColor('#e74c3c')
                   .text('User Profile', { align: 'center' });
                
                doc.moveDown();
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text('Blood Donation Application', { align: 'center' });
                
                doc.moveDown(2);

                // Personal Information
                doc.fontSize(18)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Personal Information', { underline: true });
                
                doc.moveDown();

                const leftColumn = 50;
                const rightColumn = 300;
                let yPosition = doc.y;

                // Basic Info
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Basic Information:', leftColumn, yPosition);
                
                yPosition += 20;
                
                doc.font('Helvetica')
                   .fillColor('#34495e');
                
                doc.text(`Name: ${user.name}`, leftColumn, yPosition);
                doc.text(`Email: ${user.email}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Role: ${user.role.toUpperCase()}`, leftColumn, yPosition);
                doc.text(`Status: ${user.status.toUpperCase()}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Member Since: ${moment(user.createdAt).format('DD/MM/YYYY')}`, leftColumn, yPosition);
                doc.text(`Last Login: ${user.lastLogin ? moment(user.lastLogin).format('DD/MM/YYYY HH:mm') : 'Never'}`, rightColumn, yPosition);
                yPosition += 30;

                // Medical Information
                if (user.bloodGroup || user.dateOfBirth || user.weight) {
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Medical Information:', leftColumn, yPosition);
                    
                    yPosition += 20;
                    
                    if (user.bloodGroup) {
                        doc.text(`Blood Group: ${user.bloodGroup}`, leftColumn, yPosition);
                    }
                    
                    if (user.dateOfBirth) {
                        const age = moment().diff(moment(user.dateOfBirth), 'years');
                        doc.text(`Age: ${age} years`, rightColumn, yPosition);
                    }
                    yPosition += 20;
                    
                    if (user.weight) {
                        doc.text(`Weight: ${user.weight} kg`, leftColumn, yPosition);
                    }
                    
                    if (user.height) {
                        doc.text(`Height: ${user.height} cm`, rightColumn, yPosition);
                    }
                    yPosition += 20;
                    
                    if (user.lastDonationDate) {
                        doc.text(`Last Donation: ${moment(user.lastDonationDate).format('DD/MM/YYYY')}`, leftColumn, yPosition);
                        
                        const daysSinceLastDonation = moment().diff(moment(user.lastDonationDate), 'days');
                        const eligibleForDonation = daysSinceLastDonation >= 90;
                        
                        doc.text(`Eligible for Donation: ${eligibleForDonation ? 'YES' : 'NO'}`, rightColumn, yPosition);
                        
                        if (!eligibleForDonation) {
                            const daysRemaining = 90 - daysSinceLastDonation;
                            doc.text(`Next eligible in: ${daysRemaining} days`, rightColumn, yPosition + 15);
                        }
                    }
                    yPosition += 30;
                }

                // Location Information
                if (user.district || user.upazila) {
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Location Information:', leftColumn, yPosition);
                    
                    yPosition += 20;
                    
                    if (user.district) {
                        doc.text(`District: ${user.district}`, leftColumn, yPosition);
                    }
                    
                    if (user.upazila) {
                        doc.text(`Upazila: ${user.upazila}`, rightColumn, yPosition);
                    }
                    yPosition += 30;
                }

                // Statistics Section (if available)
                if (options.includeStats) {
                    doc.fontSize(18)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Donation Statistics', { underline: true });
                    
                    doc.moveDown();

                    if (options.donationStats) {
                        const stats = options.donationStats;
                        
                        doc.fontSize(12)
                           .font('Helvetica')
                           .fillColor('#34495e');
                        
                        doc.text(`Total Donations: ${stats.totalDonations || 0}`, leftColumn, doc.y);
                        doc.text(`Pending Requests: ${stats.pendingRequests || 0}`, rightColumn, doc.y);
                        doc.moveDown();
                        
                        doc.text(`Completed Requests: ${stats.completedRequests || 0}`, leftColumn, doc.y);
                        doc.text(`Cancelled Requests: ${stats.cancelledRequests || 0}`, rightColumn, doc.y);
                        doc.moveDown();
                        
                        if (stats.firstDonationDate) {
                            doc.text(`First Donation: ${moment(stats.firstDonationDate).format('DD/MM/YYYY')}`, leftColumn, doc.y);
                        }
                        
                        if (stats.lastDonationDate) {
                            doc.text(`Last Donation: ${moment(stats.lastDonationDate).format('DD/MM/YYYY')}`, rightColumn, doc.y);
                        }
                        doc.moveDown(2);
                    }
                }

                // Footer
                const footerY = doc.page.height - 100;
                
                doc.fontSize(10)
                   .font('Helvetica-Oblique')
                   .fillColor('#7f8c8d')
                   .text('This document contains confidential user information.', 
                         50, footerY, { width: 500, align: 'center' });
                
                doc.text(`Generated on: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, 
                         50, footerY + 20, { width: 500, align: 'center' });
                
                doc.text('For verification, contact: support@blooddonationapp.com', 
                         50, footerY + 40, { width: 500, align: 'center' });

                // QR Code for verification (placeholder)
                doc.moveDown(2);
                doc.fontSize(9)
                   .text(`User ID: ${user._id}`, { align: 'center' });

                // Border
                doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50)
                   .strokeColor('#e74c3c')
                   .stroke();

                doc.end();

                stream.on('finish', () => {
                    resolve({
                        success: true,
                        filepath,
                        filename,
                        url: `/generated-pdfs/${filename}`,
                        size: fs.statSync(filepath).size
                    });
                });

                stream.on('error', (error) => {
                    reject({
                        success: false,
                        error: error.message
                    });
                });

            } catch (error) {
                logger.error(`Generate user profile PDF error: ${error.message}`);
                reject({
                    success: false,
                    error: error.message
                });
            }
        });
    },

    // Generate funding receipt PDF
    generateFundingReceiptPDF: async (funding, donor, options = {}) => {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: `Donation Receipt - ${funding._id}`,
                        Author: 'Blood Donation Application',
                        Subject: 'Donation Receipt',
                        Keywords: 'donation, receipt, funding, charity',
                        Creator: 'Blood Donation App',
                        CreationDate: new Date()
                    }
                });

                const outputDir = path.join(__dirname, '../generated-pdfs');
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const filename = `receipt-${funding._id}-${Date.now()}.pdf`;
                const filepath = path.join(outputDir, filename);
                const stream = fs.createWriteStream(filepath);
                
                doc.pipe(stream);

                // Header with receipt title
                doc.fontSize(28)
                   .font('Helvetica-Bold')
                   .fillColor('#27ae60')
                   .text('DONATION RECEIPT', { align: 'center' });
                
                doc.moveDown();
                
                doc.fontSize(14)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text('Blood Donation Application', { align: 'center' });
                
                doc.text('Acknowledgment of Your Generous Contribution', { align: 'center' });
                
                doc.moveDown(2);

                // Receipt Details
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Receipt Details', { underline: true });
                
                doc.moveDown();

                const leftColumn = 50;
                const rightColumn = 300;
                let yPosition = doc.y;

                // Transaction Information
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Transaction Information:', leftColumn, yPosition);
                
                yPosition += 20;
                
                doc.font('Helvetica')
                   .fillColor('#34495e');
                
                doc.text(`Receipt No: ${funding._id}`, leftColumn, yPosition);
                doc.text(`Date: ${moment(funding.createdAt).format('DD/MM/YYYY')}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Transaction ID: ${funding.transactionId || funding._id}`, leftColumn, yPosition);
                doc.text(`Time: ${moment(funding.createdAt).format('HH:mm:ss')}`, rightColumn, yPosition);
                yPosition += 20;
                
                doc.text(`Payment Method: ${funding.paymentMethod.toUpperCase()}`, leftColumn, yPosition);
                doc.text(`Status: ${funding.status.toUpperCase()}`, rightColumn, yPosition);
                yPosition += 30;

                // Donor Information
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Donor Information:', leftColumn, yPosition);
                
                yPosition += 20;
                
                if (funding.isAnonymous) {
                    doc.text('Anonymous Donor', leftColumn, yPosition);
                } else {
                    doc.text(`Name: ${donor.name}`, leftColumn, yPosition);
                    doc.text(`Email: ${donor.email}`, rightColumn, yPosition);
                    yPosition += 20;
                    
                    if (donor.phone) {
                        doc.text(`Phone: ${donor.phone}`, leftColumn, yPosition);
                    }
                    
                    if (funding.donorEmail) {
                        doc.text(`Receipt Email: ${funding.donorEmail}`, rightColumn, yPosition);
                    }
                }
                yPosition += 30;

                // Donation Amount
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .fillColor('#27ae60')
                   .text('Donation Amount:', leftColumn, yPosition);
                
                yPosition += 25;
                
                doc.fontSize(24)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text(`৳${funding.amount.toFixed(2)}`, leftColumn, yPosition);
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .fillColor('#7f8c8d')
                   .text(`(Bangladeshi Taka)`, leftColumn + 100, yPosition + 5);
                yPosition += 40;

                // Message (if any)
                if (funding.message) {
                    doc.fontSize(12)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Donor Message:', leftColumn, yPosition);
                    
                    yPosition += 20;
                    
                    doc.font('Helvetica')
                       .fillColor('#34495e')
                       .text(funding.message, {
                            width: 500,
                            align: 'left'
                       });
                    
                    yPosition += 40;
                }

                // Thank You Message
                doc.fontSize(16)
                   .font('Helvetica-Bold')
                   .fillColor('#e74c3c')
                   .text('Thank You for Your Support!', { align: 'center' });
                
                doc.moveDown();
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .fillColor('#34495e')
                   .text('Your generous contribution will help save lives and support our blood donation initiatives.', 
                         { width: 500, align: 'center' });
                
                doc.moveDown(2);

                // Impact Statement
                const livesImpacted = Math.floor(funding.amount / 1000); // Rough estimate
                
                doc.fontSize(12)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Your Impact:', { align: 'center' });
                
                doc.moveDown();
                
                doc.fontSize(14)
                   .font('Helvetica')
                   .fillColor('#27ae60')
                   .text(`Your donation could help save up to ${livesImpacted} lives!`, { align: 'center' });
                
                doc.moveDown(2);

                // Tax Deduction Information
                doc.fontSize(11)
                   .font('Helvetica-Oblique')
                   .fillColor('#7f8c8d')
                   .text('This receipt is for your records. Please retain it for tax purposes.', 
                         { width: 500, align: 'center' });
                
                doc.text('Blood Donation Application is a registered non-profit organization.', 
                         { width: 500, align: 'center' });
                
                doc.moveDown();

                // Organization Information
                doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text('Blood Donation Application', { align: 'center' });
                
                doc.text('123 Blood Donation Street, Dhaka 1212, Bangladesh', { align: 'center' });
                
                doc.text('Email: donations@blooddonationapp.com | Phone: +8801712345678', { align: 'center' });
                
                doc.text('Website: www.blooddonationapp.com', { align: 'center' });
                
                doc.moveDown();

                // Verification QR/Barcode (placeholder)
                doc.fontSize(9)
                   .fillColor('#95a5a6')
                   .text(`Verification Code: ${funding._id}`, { align: 'center' });
                
                doc.text(`Generated: ${moment().format('DD/MM/YYYY HH:mm:ss')}`, { align: 'center' });

                // Border
                doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50)
                   .strokeColor('#27ae60')
                   .strokeWidth(2)
                   .stroke();

                doc.end();

                stream.on('finish', () => {
                    resolve({
                        success: true,
                        filepath,
                        filename,
                        url: `/generated-pdfs/${filename}`,
                        size: fs.statSync(filepath).size
                    });
                });

                stream.on('error', (error) => {
                    reject({
                        success: false,
                        error: error.message
                    });
                });

            } catch (error) {
                logger.error(`Generate funding receipt PDF error: ${error.message}`);
                reject({
                    success: false,
                    error: error.message
                });
            }
        });
    },

    // Generate analytics report PDF
    generateAnalyticsReportPDF: async (reportData, options = {}) => {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: 'Analytics Report',
                        Author: 'Blood Donation Application',
                        Subject: 'Analytics and Statistics Report',
                        Keywords: 'analytics, report, statistics, blood donation',
                        Creator: 'Blood Donation App',
                        CreationDate: new Date()
                    }
                });

                const outputDir = path.join(__dirname, '../generated-pdfs');
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const filename = `analytics-report-${Date.now()}.pdf`;
                const filepath = path.join(outputDir, filename);
                const stream = fs.createWriteStream(filepath);
                
                doc.pipe(stream);

                // Title Page
                doc.fontSize(28)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('ANALYTICS REPORT', { align: 'center' });
                
                doc.moveDown();
                
                doc.fontSize(18)
                   .font('Helvetica')
                   .fillColor('#e74c3c')
                   .text('Blood Donation Application', { align: 'center' });
                
                doc.moveDown(2);
                
                doc.fontSize(14)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text(`Report Period: ${options.period || 'Custom'}`, { align: 'center' });
                
                doc.text(`Generated: ${moment().format('DD MMMM YYYY')}`, { align: 'center' });
                
                doc.moveDown(5);
                
                // Executive Summary
                if (reportData.summary) {
                    doc.addPage();
                    
                    doc.fontSize(20)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Executive Summary', { underline: true });
                    
                    doc.moveDown();
                    
                    doc.fontSize(12)
                       .font('Helvetica')
                       .fillColor('#34495e');
                    
                    const summaryPoints = [
                        `Total Users: ${reportData.summary.totalUsers || 0}`,
                        `Total Donation Requests: ${reportData.summary.totalRequests || 0}`,
                        `Total Funding: ৳${(reportData.summary.totalFunding || 0).toFixed(2)}`,
                        `Completion Rate: ${(reportData.summary.completionRate || 0).toFixed(1)}%`,
                        `Growth Rate: ${(reportData.summary.growthRate || 0).toFixed(1)}%`
                    ];
                    
                    summaryPoints.forEach(point => {
                        doc.text(`• ${point}`);
                        doc.moveDown(0.5);
                    });
                }

                // User Analytics
                if (reportData.userAnalytics) {
                    doc.addPage();
                    
                    doc.fontSize(20)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('User Analytics', { underline: true });
                    
                    doc.moveDown();
                    
                    const userData = reportData.userAnalytics;
                    
                    // User Growth Chart
                    doc.fontSize(14)
                       .font('Helvetica-Bold')
                       .fillColor('#3498db')
                       .text('User Growth');
                    
                    doc.moveDown();
                    
                    if (userData.growthData && userData.growthData.length > 0) {
                        userData.growthData.forEach((dataPoint, index) => {
                            const barWidth = (dataPoint.count / Math.max(...userData.growthData.map(d => d.count))) * 400;
                            
                            doc.rect(50, doc.y, barWidth, 20)
                               .fillColor('#3498db')
                               .fill();
                            
                            doc.fontSize(10)
                               .font('Helvetica')
                               .fillColor('#fff')
                               .text(`${dataPoint.period}: ${dataPoint.count}`, 55, doc.y + 5);
                            
                            doc.moveDown(2);
                        });
                    }
                    
                    doc.moveDown();
                    
                    // User Distribution
                    doc.fontSize(14)
                       .font('Helvetica-Bold')
                       .fillColor('#3498db')
                       .text('User Distribution by Role');
                    
                    doc.moveDown();
                    
                    if (userData.roleDistribution) {
                        userData.roleDistribution.forEach(role => {
                            doc.text(`${role._id}: ${role.count} users (${((role.count / userData.totalUsers) * 100).toFixed(1)}%)`);
                            doc.moveDown(0.5);
                        });
                    }
                }

                // Donation Analytics
                if (reportData.donationAnalytics) {
                    doc.addPage();
                    
                    doc.fontSize(20)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Donation Analytics', { underline: true });
                    
                    doc.moveDown();
                    
                    const donationData = reportData.donationAnalytics;
                    
                    // Status Distribution
                    doc.fontSize(14)
                       .font('Helvetica-Bold')
                       .fillColor('#e74c3c')
                       .text('Request Status Distribution');
                    
                    doc.moveDown();
                    
                    if (donationData.statusDistribution) {
                        donationData.statusDistribution.forEach(status => {
                            const color = status._id === 'done' ? '#2ecc71' : 
                                         status._id === 'pending' ? '#f39c12' : 
                                         status._id === 'inprogress' ? '#3498db' : '#e74c3c';
                            
                            doc.fillColor(color)
                               .rect(50, doc.y, 10, 10)
                               .fill();
                            
                            doc.fillColor('#34495e')
                               .text(`  ${status._id}: ${status.count} (${((status.count / donationData.totalRequests) * 100).toFixed(1)}%)`, 65, doc.y - 2);
                            
                            doc.moveDown(1.5);
                        });
                    }
                    
                    doc.moveDown();
                    
                    // Blood Group Distribution
                    doc.fontSize(14)
                       .font('Helvetica-Bold')
                       .fillColor('#e74c3c')
                       .text('Blood Group Distribution');
                    
                    doc.moveDown();
                    
                    if (donationData.bloodGroupDistribution) {
                        donationData.bloodGroupDistribution.forEach(bg => {
                            doc.text(`${bg._id}: ${bg.count} requests`);
                            doc.moveDown(0.5);
                        });
                    }
                }

                // Funding Analytics
                if (reportData.fundingAnalytics) {
                    doc.addPage();
                    
                    doc.fontSize(20)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Funding Analytics', { underline: true });
                    
                    doc.moveDown();
                    
                    const fundingData = reportData.fundingAnalytics;
                    
                    // Total Funding
                    doc.fontSize(16)
                       .font('Helvetica-Bold')
                       .fillColor('#27ae60')
                       .text(`Total Funding: ৳${(fundingData.totalAmount || 0).toFixed(2)}`);
                    
                    doc.moveDown();
                    
                    // Payment Method Distribution
                    doc.fontSize(14)
                       .font('Helvetica-Bold')
                       .fillColor('#27ae60')
                       .text('Payment Method Distribution');
                    
                    doc.moveDown();
                    
                    if (fundingData.paymentMethodDistribution) {
                        fundingData.paymentMethodDistribution.forEach(method => {
                            doc.text(`${method._id}: ৳${method.total.toFixed(2)} (${method.count} donations)`);
                            doc.moveDown(0.5);
                        });
                    }
                }

                // Recommendations
                if (reportData.insights && reportData.insights.length > 0) {
                    doc.addPage();
                    
                    doc.fontSize(20)
                       .font('Helvetica-Bold')
                       .fillColor('#2c3e50')
                       .text('Key Insights & Recommendations', { underline: true });
                    
                    doc.moveDown();
                    
                    doc.fontSize(12)
                       .font('Helvetica')
                       .fillColor('#34495e');
                    
                    reportData.insights.forEach((insight, index) => {
                        doc.text(`${index + 1}. ${insight.title}`);
                        doc.moveDown(0.3);
                        
                        doc.fontSize(11)
                           .font('Helvetica-Oblique')
                           .fillColor('#7f8c8d')
                           .text(`   ${insight.message}`);
                        
                        doc.moveDown(1);
                    });
                }

                // Footer on last page
                const pageCount = doc.bufferedPageRange().count;
                for (let i = 0; i < pageCount; i++) {
                    doc.switchToPage(i);
                    
                    // Page number
                    doc.fontSize(10)
                       .font('Helvetica')
                       .fillColor('#95a5a6')
                       .text(
                           `Page ${i + 1} of ${pageCount}`,
                           50,
                           doc.page.height - 50,
                           { align: 'center', width: doc.page.width - 100 }
                       );
                    
                    // Confidential notice
                    doc.text(
                           'Confidential - For internal use only',
                           50,
                           doc.page.height - 35,
                           { align: 'center', width: doc.page.width - 100 }
                       );
                }

                doc.end();

                stream.on('finish', () => {
                    resolve({
                        success: true,
                        filepath,
                        filename,
                        url: `/generated-pdfs/${filename}`,
                        size: fs.statSync(filepath).size,
                        pageCount
                    });
                });

                stream.on('error', (error) => {
                    reject({
                        success: false,
                        error: error.message
                    });
                });

            } catch (error) {
                logger.error(`Generate analytics report PDF error: ${error.message}`);
                reject({
                    success: false,
                    error: error.message
                });
            }
        });
    },

    // Generate search results PDF
    generateSearchResultsPDF: async (searchResults, searchCriteria, options = {}) => {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50,
                    info: {
                        Title: 'Search Results - Blood Donors',
                        Author: 'Blood Donation Application',
                        Subject: 'Search Results Export',
                        Keywords: 'search, donors, blood, export',
                        Creator: 'Blood Donation App',
                        CreationDate: new Date()
                    }
                });

                const outputDir = path.join(__dirname, '../generated-pdfs');
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                const filename = `search-results-${Date.now()}.pdf`;
                const filepath = path.join(outputDir, filename);
                const stream = fs.createWriteStream(filepath);
                
                doc.pipe(stream);

                // Header
                doc.fontSize(22)
                   .font('Helvetica-Bold')
                   .fillColor('#2c3e50')
                   .text('Blood Donor Search Results', { align: 'center' });
                
                doc.moveDown();
                
                doc.fontSize(12)
                   .font('Helvetica')
                   .fillColor('#666')
                   .text('Blood Donation Application', { align: 'center' });
                
                doc.text('Donor Search Export', { align: 'center' });
                
                doc.moveDown(2);

                // Search Criteria
                doc.fontSize(14)
                   .font('Helvetica-Bold')
                   .fillColor('#3498db')
                   .text('Search Criteria:', { underline: true });
                
                doc.moveDown();
                
                doc.fontSize(11)
                   .font('Helvetica')
                   .fillColor('#34495e');
                
                if (searchCriteria.bloodGroup) {
                    doc.text(`Blood Group: ${searchCriteria.bloodGroup}`);
                }
                
                if (searchCriteria.district) {
                    doc.text(`District: ${searchCriteria.district}`);
                }
                
                if (searchCriteria.upazila) {
                    doc.text(`Upazila: ${searchCriteria.upazila}`);
                }
                
                doc.text(`Total Results: ${searchResults.length}`);
                doc.text(`Generated: ${moment().format('DD/MM/YYYY HH:mm:ss')}`);
                
                doc.moveDown(2);

                // Results Table Header
                const tableTop = doc.y;
                const leftMargin = 50;
                const colWidth = 100;
                
                // Table Headers
                doc.fontSize(10)
                   .font('Helvetica-Bold')
                   .fillColor('#fff')
                   .rect(leftMargin, tableTop, colWidth * 5, 20)
                   .fillColor('#2c3e50')
                   .fill();
                
                doc.text('Name', leftMargin + 5, tableTop + 5);
                doc.text('Blood Group', leftMargin + colWidth + 5, tableTop + 5);
                doc.text('Location', leftMargin + colWidth * 2 + 5, tableTop + 5);
                doc.text('Last Donation', leftMargin + colWidth * 3 + 5, tableTop + 5);
                doc.text('Status', leftMargin + colWidth * 4 + 5, tableTop + 5);
                
                let currentY = tableTop + 25;

                // Table Rows
                doc.fontSize(9)
                   .font('Helvetica')
                   .fillColor('#34495e');
                
                searchResults.forEach((donor, index) => {
                    // Alternate row colors
                    if (index % 2 === 0) {
                        doc.rect(leftMargin, currentY - 5, colWidth * 5, 20)
                           .fillColor('#f8f9fa')
                           .fill();
                    }
                    
                    // Row content
                    doc.text(donor.name || 'N/A', leftMargin + 5, currentY);
                    doc.text(donor.bloodGroup || 'N/A', leftMargin + colWidth + 5, currentY);
                    doc.text(`${donor.district || ''}${donor.upazila ? ', ' + donor.upazila : ''}`, 
                            leftMargin + colWidth * 2 + 5, currentY);
                    doc.text(donor.lastDonationDate ? moment(donor.lastDonationDate).format('DD/MM/YYYY') : 'Never', 
                            leftMargin + colWidth * 3 + 5, currentY);
                    
                    // Status with color coding
                    const status = donor.status || 'active';
                    const statusColor = status === 'active' ? '#27ae60' : 
                                      status === 'inactive' ? '#f39c12' : '#e74c3c';
                    
                    doc.fillColor(statusColor)
                       .text(status.toUpperCase(), leftMargin + colWidth * 4 + 5, currentY);
                    
                    doc.fillColor('#34495e'); // Reset color
                    
                    currentY += 25;
                    
                    // Check if we need a new page
                    if (currentY > doc.page.height - 100) {
                        doc.addPage();
                        currentY = 50;
                        
                        // Add table header on new page
                        doc.fontSize(10)
                           .font('Helvetica-Bold')
                           .fillColor('#fff')
                           .rect(leftMargin, currentY - 25, colWidth * 5, 20)
                           .fillColor('#2c3e50')
                           .fill();
                        
                        doc.text('Name', leftMargin + 5, currentY - 20);
                        doc.text('Blood Group', leftMargin + colWidth + 5, currentY - 20);
                        doc.text('Location', leftMargin + colWidth * 2 + 5, currentY - 20);
                        doc.text('Last Donation', leftMargin + colWidth * 3 + 5, currentY - 20);
                        doc.text('Status', leftMargin + colWidth * 4 + 5, currentY - 20);
                        
                        currentY += 5;
                    }
                });

                // Footer
                const footerY = doc.page.height - 50;
                
                doc.fontSize(9)
                   .font('Helvetica-Oblique')
                   .fillColor('#7f8c8d')
                   .text('This document contains donor information for authorized use only.', 
                         leftMargin, footerY, { width: colWidth * 5, align: 'center' });
                
                doc.text('Please handle this information with confidentiality.', 
                         leftMargin, footerY + 15, { width: colWidth * 5, align: 'center' });

                // Border
                doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50)
                   .strokeColor('#3498db')
                   .stroke();

                doc.end();

                stream.on('finish', () => {
                    resolve({
                        success: true,
                        filepath,
                        filename,
                        url: `/generated-pdfs/${filename}`,
                        size: fs.statSync(filepath).size,
                        resultCount: searchResults.length
                    });
                });

                stream.on('error', (error) => {
                    reject({
                        success: false,
                        error: error.message
                    });
                });

            } catch (error) {
                logger.error(`Generate search results PDF error: ${error.message}`);
                reject({
                    success: false,
                    error: error.message
                });
            }
        });
    },

    // Clean up old PDF files
    cleanupOldPDFs: (maxAgeDays = 7) => {
        try {
            const pdfsDir = path.join(__dirname, '../generated-pdfs');
            
            if (!fs.existsSync(pdfsDir)) {
                return {
                    success: true,
                    message: 'PDF directory does not exist',
                    deleted: 0
                };
            }
            
            const files = fs.readdirSync(pdfsDir);
            const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
            let deletedCount = 0;
            
            files.forEach(file => {
                const filepath = path.join(pdfsDir, file);
                const stats = fs.statSync(filepath);
                
                if (stats.mtime < cutoffDate) {
                    fs.unlinkSync(filepath);
                    deletedCount++;
                    logger.info(`Deleted old PDF: ${file}`);
                }
            });
            
            return {
                success: true,
                deleted: deletedCount,
                message: `Cleaned up ${deletedCount} old PDF files`
            };
        } catch (error) {
            logger.error(`Cleanup old PDFs error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Get PDF file info
    getPDFInfo: (filename) => {
        try {
            const filepath = path.join(__dirname, '../generated-pdfs', filename);
            
            if (!fs.existsSync(filepath)) {
                return {
                    success: false,
                    error: 'File not found'
                };
            }
            
            const stats = fs.statSync(filepath);
            
            return {
                success: true,
                filename,
                filepath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                url: `/generated-pdfs/${filename}`
            };
        } catch (error) {
            logger.error(`Get PDF info error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

module.exports = pdfGenerator;