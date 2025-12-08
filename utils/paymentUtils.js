const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const crypto = require('crypto');
const logger = require('./../middleware/loggerMiddleware').logger;

// Payment configuration
const paymentConfig = {
    stripe: {
        currency: 'bdt',
        conversionRate: 1, // BDT to USD conversion if needed
        minimumAmount: 10, // Minimum donation amount in BDT
        maximumAmount: 1000000, // Maximum donation amount in BDT
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },
    bkash: {
        appKey: process.env.BKASH_APP_KEY,
        appSecret: process.env.BKASH_APP_SECRET,
        username: process.env.BKASH_USERNAME,
        password: process.env.BKASH_PASSWORD,
        sandbox: process.env.BKASH_SANDBOX === 'true',
        callbackUrl: process.env.BKASH_CALLBACK_URL
    },
    nagad: {
        merchantId: process.env.NAGAD_MERCHANT_ID,
        merchantNumber: process.env.NAGAD_MERCHANT_NUMBER,
        callbackUrl: process.env.NAGAD_CALLBACK_URL,
        sandbox: process.env.NAGAD_SANDBOX === 'true'
    },
    rocket: {
        merchantId: process.env.ROCKET_MERCHANT_ID,
        storePassword: process.env.ROCKET_STORE_PASSWORD,
        successUrl: process.env.ROCKET_SUCCESS_URL,
        failUrl: process.env.ROCKET_FAIL_URL,
        cancelUrl: process.env.ROCKET_CANCEL_URL
    }
};

// Stripe payment utilities
const stripeUtils = {
    // Create a payment intent
    createPaymentIntent: async (amount, currency = 'bdt', metadata = {}) => {
        try {
            // Convert BDT to USD if currency is USD (Stripe doesn't support BDT directly)
            let stripeAmount = amount;
            let stripeCurrency = currency.toLowerCase();
            
            if (stripeCurrency === 'bdt') {
                // Convert BDT to USD for Stripe (approximate conversion)
                stripeAmount = Math.round(amount * 0.0092); // 1 BDT = 0.0092 USD
                stripeCurrency = 'usd';
            }
            
            // Ensure minimum amount (in cents/paisa)
            const minAmount = stripeCurrency === 'usd' ? 0.50 * 100 : 10 * 100; // $0.50 or ৳10
            if (stripeAmount < minAmount) {
                throw new Error(`Amount too small. Minimum is ${stripeCurrency === 'usd' ? '$0.50' : '৳10'}`);
            }
            
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(stripeAmount * 100), // Convert to cents
                currency: stripeCurrency,
                metadata: {
                    originalAmount: amount,
                    originalCurrency: currency,
                    ...metadata
                },
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            
            logger.info(`Stripe payment intent created: ${paymentIntent.id}`);
            
            return {
                success: true,
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                originalAmount: amount,
                originalCurrency: currency
            };
        } catch (error) {
            logger.error(`Stripe payment intent creation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Retrieve a payment intent
    retrievePaymentIntent: async (paymentIntentId) => {
        try {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            return {
                success: true,
                paymentIntent
            };
        } catch (error) {
            logger.error(`Stripe payment intent retrieval error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Confirm a payment intent
    confirmPaymentIntent: async (paymentIntentId, paymentMethodId) => {
        try {
            const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
                payment_method: paymentMethodId
            });
            
            return {
                success: true,
                paymentIntent
            };
        } catch (error) {
            logger.error(`Stripe payment intent confirmation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Create a customer
    createCustomer: async (email, name, metadata = {}) => {
        try {
            const customer = await stripe.customers.create({
                email,
                name,
                metadata
            });
            
            logger.info(`Stripe customer created: ${customer.id}`);
            
            return {
                success: true,
                customer
            };
        } catch (error) {
            logger.error(`Stripe customer creation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Create subscription for recurring donations
    createSubscription: async (customerId, priceId, metadata = {}) => {
        try {
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId }],
                metadata,
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.payment_intent']
            });
            
            logger.info(`Stripe subscription created: ${subscription.id}`);
            
            return {
                success: true,
                subscription,
                clientSecret: subscription.latest_invoice.payment_intent.client_secret
            };
        } catch (error) {
            logger.error(`Stripe subscription creation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Cancel subscription
    cancelSubscription: async (subscriptionId) => {
        try {
            const subscription = await stripe.subscriptions.cancel(subscriptionId);
            
            logger.info(`Stripe subscription cancelled: ${subscriptionId}`);
            
            return {
                success: true,
                subscription
            };
        } catch (error) {
            logger.error(`Stripe subscription cancellation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Create payment method
    createPaymentMethod: async (cardDetails) => {
        try {
            const paymentMethod = await stripe.paymentMethods.create({
                type: 'card',
                card: cardDetails
            });
            
            return {
                success: true,
                paymentMethod
            };
        } catch (error) {
            logger.error(`Stripe payment method creation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Verify webhook signature
    verifyWebhookSignature: (payload, signature) => {
        try {
            const event = stripe.webhooks.constructEvent(
                payload,
                signature,
                paymentConfig.stripe.webhookSecret
            );
            return { success: true, event };
        } catch (error) {
            logger.error(`Stripe webhook signature verification error: ${error.message}`);
            return { success: false, error: error.message };
        }
    },
    
    // Refund payment
    createRefund: async (paymentIntentId, amount, reason = 'requested_by_customer') => {
        try {
            const refund = await stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: Math.round(amount * 100), // Convert to cents
                reason
            });
            
            logger.info(`Stripe refund created: ${refund.id}`);
            
            return {
                success: true,
                refund
            };
        } catch (error) {
            logger.error(`Stripe refund creation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// bKash payment utilities (simplified version)
const bKashUtils = {
    // Get bKash token
    getToken: async () => {
        try {
            const response = await axios.post(
                paymentConfig.bkash.sandbox 
                    ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant'
                    : 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant',
                {
                    app_key: paymentConfig.bkash.appKey,
                    app_secret: paymentConfig.bkash.appSecret
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'username': paymentConfig.bkash.username,
                        'password': paymentConfig.bkash.password
                    }
                }
            );
            
            return {
                success: true,
                token: response.data.id_token,
                expires: Date.now() + (response.data.expires_in * 1000)
            };
        } catch (error) {
            logger.error(`bKash token error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Create bKash payment
    createPayment: async (amount, orderId, token) => {
        try {
            const response = await axios.post(
                paymentConfig.bkash.sandbox
                    ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/create'
                    : 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/create',
                {
                    mode: '0011',
                    payerReference: orderId,
                    callbackURL: paymentConfig.bkash.callbackUrl,
                    amount: amount.toString(),
                    currency: 'BDT',
                    intent: 'sale',
                    merchantInvoiceNumber: `INV-${orderId}`
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': token,
                        'X-APP-Key': paymentConfig.bkash.appKey
                    }
                }
            );
            
            return {
                success: true,
                paymentId: response.data.paymentID,
                bkashURL: response.data.bkashURL
            };
        } catch (error) {
            logger.error(`bKash payment creation error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Execute bKash payment
    executePayment: async (paymentId, token) => {
        try {
            const response = await axios.post(
                paymentConfig.bkash.sandbox
                    ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/execute'
                    : 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/execute',
                { paymentID: paymentId },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': token,
                        'X-APP-Key': paymentConfig.bkash.appKey
                    }
                }
            );
            
            return {
                success: true,
                transactionStatus: response.data.transactionStatus,
                trxID: response.data.trxID,
                amount: response.data.amount,
                currency: response.data.currency
            };
        } catch (error) {
            logger.error(`bKash payment execution error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Nagad payment utilities (simplified version)
const nagadUtils = {
    // Initialize Nagad payment
    initializePayment: async (amount, orderId) => {
        try {
            const datetime = Date.now().toString();
            const merchantId = paymentConfig.nagad.merchantId;
            const orderIdStr = orderId.toString();
            
            // Generate SPS service ID
            const spsServiceId = 'NPG';
            
            // Create request data
            const requestData = {
                merchantId,
                orderId: orderIdStr,
                datetime,
                challenge: crypto.randomBytes(32).toString('hex')
            };
            
            // In real implementation, you would:
            // 1. Generate signature
            // 2. Call Nagad API
            // 3. Handle response
            
            // Mock response for development
            if (paymentConfig.nagad.sandbox) {
                return {
                    success: true,
                    paymentReference: `NAGAD-${orderId}`,
                    checkoutURL: `https://sandbox.mynagad.com/checkout/${orderId}`,
                    amount,
                    orderId: orderIdStr
                };
            }
            
            return {
                success: false,
                error: 'Nagad payment not fully implemented'
            };
        } catch (error) {
            logger.error(`Nagad payment initialization error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Rocket payment utilities (simplified version)
const rocketUtils = {
    // Initialize Rocket payment
    initializePayment: async (amount, orderId, customerPhone) => {
        try {
            const storeId = paymentConfig.rocket.merchantId;
            const storePassword = paymentConfig.rocket.storePassword;
            
            // Generate signature (simplified)
            const signatureString = `${storeId}${orderId}${amount}${paymentConfig.rocket.successUrl}${storePassword}`;
            const signature = crypto.createHash('md5').update(signatureString).digest('hex');
            
            // In real implementation, you would call Rocket API
            
            // Mock response for development
            return {
                success: true,
                paymentUrl: `https://rocket.com.bd/payment/checkout`,
                parameters: {
                    store_id: storeId,
                    order_id: orderId,
                    amount,
                    success_url: paymentConfig.rocket.successUrl,
                    fail_url: paymentConfig.rocket.failUrl,
                    cancel_url: paymentConfig.rocket.cancelUrl,
                    signature,
                    customer_phone: customerPhone,
                    currency: 'BDT'
                }
            };
        } catch (error) {
            logger.error(`Rocket payment initialization error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// General payment utilities
const paymentUtils = {
    // Format amount with currency symbol
    formatAmount: (amount, currency = 'bdt') => {
        const currencies = {
            bdt: { symbol: '৳', code: 'BDT' },
            usd: { symbol: '$', code: 'USD' },
            eur: { symbol: '€', code: 'EUR' },
            gbp: { symbol: '£', code: 'GBP' }
        };
        
        const currencyInfo = currencies[currency.toLowerCase()] || currencies.bdt;
        
        return {
            formatted: `${currencyInfo.symbol}${amount.toFixed(2)}`,
            symbol: currencyInfo.symbol,
            code: currencyInfo.code,
            amount: parseFloat(amount.toFixed(2))
        };
    },
    
    // Validate payment amount
    validateAmount: (amount, currency = 'bdt') => {
        const minAmount = paymentConfig.stripe.minimumAmount;
        const maxAmount = paymentConfig.stripe.maximumAmount;
        
        if (typeof amount !== 'number' || isNaN(amount)) {
            return { valid: false, error: 'Invalid amount' };
        }
        
        if (amount < minAmount) {
            return { 
                valid: false, 
                error: `Minimum amount is ${paymentUtils.formatAmount(minAmount, currency).formatted}` 
            };
        }
        
        if (amount > maxAmount) {
            return { 
                valid: false, 
                error: `Maximum amount is ${paymentUtils.formatAmount(maxAmount, currency).formatted}` 
            };
        }
        
        return { valid: true, amount };
    },
    
    // Generate unique transaction ID
    generateTransactionId: (prefix = 'TXN') => {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `${prefix}-${timestamp}-${random}`;
    },
    
    // Generate order ID
    generateOrderId: (prefix = 'ORD') => {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        return `${prefix}${timestamp}${random}`;
    },
    
    // Calculate fees
    calculateFees: (amount, paymentMethod = 'stripe') => {
        let feePercentage = 0;
        let fixedFee = 0;
        
        switch (paymentMethod.toLowerCase()) {
            case 'stripe':
                feePercentage = 2.9; // 2.9%
                fixedFee = 0.30; // $0.30
                break;
            case 'bkash':
                feePercentage = 1.85; // 1.85%
                break;
            case 'nagad':
                feePercentage = 1.5; // 1.5%
                break;
            case 'rocket':
                feePercentage = 1.4; // 1.4%
                break;
            case 'bank_transfer':
                feePercentage = 0; // Usually no fee for bank transfer
                break;
            default:
                feePercentage = 2.9;
                fixedFee = 0.30;
        }
        
        const feeAmount = (amount * feePercentage / 100) + fixedFee;
        const netAmount = amount - feeAmount;
        
        return {
            grossAmount: amount,
            feePercentage,
            fixedFee,
            feeAmount: parseFloat(feeAmount.toFixed(2)),
            netAmount: parseFloat(netAmount.toFixed(2))
        };
    },
    
    // Process payment based on method
    processPayment: async (paymentMethod, amount, paymentData) => {
        switch (paymentMethod.toLowerCase()) {
            case 'stripe':
                return await stripeUtils.createPaymentIntent(
                    amount, 
                    paymentData.currency, 
                    paymentData.metadata
                );
            case 'bkash':
                const tokenResult = await bKashUtils.getToken();
                if (!tokenResult.success) return tokenResult;
                
                return await bKashUtils.createPayment(
                    amount,
                    paymentData.orderId,
                    tokenResult.token
                );
            case 'nagad':
                return await nagadUtils.initializePayment(
                    amount,
                    paymentData.orderId
                );
            case 'rocket':
                return await rocketUtils.initializePayment(
                    amount,
                    paymentData.orderId,
                    paymentData.customerPhone
                );
            case 'bank_transfer':
                return {
                    success: true,
                    paymentMethod: 'bank_transfer',
                    instructions: 'Please transfer the amount to our bank account',
                    bankDetails: {
                        bankName: 'Example Bank',
                        accountName: 'Blood Donation Organization',
                        accountNumber: '1234567890',
                        branch: 'Main Branch',
                        routingNumber: '123456789',
                        swiftCode: 'EXBKBDDH'
                    }
                };
            default:
                return {
                    success: false,
                    error: 'Unsupported payment method'
                };
        }
    },
    
    // Verify payment status
    verifyPayment: async (paymentMethod, paymentId, additionalData = {}) => {
        switch (paymentMethod.toLowerCase()) {
            case 'stripe':
                return await stripeUtils.retrievePaymentIntent(paymentId);
            case 'bkash':
                const tokenResult = await bKashUtils.getToken();
                if (!tokenResult.success) return tokenResult;
                
                return await bKashUtils.executePayment(paymentId, tokenResult.token);
            default:
                return {
                    success: false,
                    error: 'Payment verification not implemented for this method'
                };
        }
    },
    
    // Get supported payment methods
    getSupportedPaymentMethods: () => {
        return [
            {
                id: 'stripe',
                name: 'Credit/Debit Card',
                description: 'Pay with Visa, MasterCard, or American Express',
                icon: 'credit-card',
                supportedCurrencies: ['usd', 'eur', 'gbp'],
                fees: '2.9% + $0.30 per transaction'
            },
            {
                id: 'bkash',
                name: 'bKash',
                description: 'Mobile banking payment',
                icon: 'mobile',
                supportedCurrencies: ['bdt'],
                fees: '1.85% per transaction'
            },
            {
                id: 'nagad',
                name: 'Nagad',
                description: 'Mobile financial service',
                icon: 'mobile',
                supportedCurrencies: ['bdt'],
                fees: '1.5% per transaction'
            },
            {
                id: 'rocket',
                name: 'Rocket',
                description: 'Mobile banking payment',
                icon: 'mobile',
                supportedCurrencies: ['bdt'],
                fees: '1.4% per transaction'
            },
            {
                id: 'bank_transfer',
                name: 'Bank Transfer',
                description: 'Direct bank transfer',
                icon: 'bank',
                supportedCurrencies: ['bdt', 'usd'],
                fees: 'No additional fees'
            }
        ];
    },
    
    // Check payment service status
    checkPaymentServiceStatus: async () => {
        const status = {
            stripe: { healthy: false, message: '' },
            bkash: { healthy: false, message: '' },
            nagad: { healthy: false, message: '' },
            rocket: { healthy: false, message: '' }
        };
        
        try {
            // Check Stripe
            const balance = await stripe.balance.retrieve();
            status.stripe = { healthy: true, message: 'Operational' };
        } catch (error) {
            status.stripe = { healthy: false, message: error.message };
        }
        
        // Note: Other payment gateways would need their own health checks
        
        return status;
    }
};

module.exports = {
    paymentConfig,
    stripeUtils,
    bKashUtils,
    nagadUtils,
    rocketUtils,
    ...paymentUtils
};