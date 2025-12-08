const stripe = require('stripe');
const logger = require('../middleware/loggerMiddleware').logger;

// Stripe configuration
const stripeConfig = {
    // Stripe API keys
    apiKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    
    // Stripe API version
    apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
    
    // Stripe client configuration
    clientConfig: {
        apiKey: process.env.STRIPE_SECRET_KEY,
        stripeAccount: process.env.STRIPE_ACCOUNT_ID,
        maxNetworkRetries: 3,
        timeout: 80000,
        host: process.env.STRIPE_HOST,
        port: process.env.STRIPE_PORT,
        telemetry: process.env.STRIPE_TELEMETRY !== 'false'
    },
    
    // Payment configuration
    payment: {
        // Default currency
        defaultCurrency: 'usd',
        
        // Supported currencies
        supportedCurrencies: ['usd', 'eur', 'gbp', 'cad', 'aud'],
        
        // Currency conversion rates (for BDT to other currencies)
        conversionRates: {
            bdt: {
                usd: 0.0092,
                eur: 0.0085,
                gbp: 0.0075,
                cad: 0.0125,
                aud: 0.0138
            }
        },
        
        // Minimum and maximum amounts
        minimumAmounts: {
            usd: 0.50,
            eur: 0.45,
            gbp: 0.40,
            cad: 0.65,
            aud: 0.70
        },
        
        maximumAmounts: {
            usd: 10000,
            eur: 9000,
            gbp: 8000,
            cad: 13000,
            aud: 14000
        },
        
        // Stripe fees (percentage + fixed)
        fees: {
            percentage: 2.9,
            fixed: 0.30, // in USD
            additionalPercentage: 0.0,
            additionalFixed: 0.0
        },
        
        // Tax rates (if applicable)
        taxRates: [],
        
        // Payment method types
        paymentMethodTypes: ['card', 'alipay', 'ideal', 'sofort', 'giropay', 'bancontact', 'eps', 'p24'],
        
        // Payment method options
        paymentMethodOptions: {
            card: {
                request_three_d_secure: 'automatic'
            }
        }
    },
    
    // Subscription configuration
    subscription: {
        // Default subscription plans
        plans: {
            monthly: {
                name: 'Monthly Donor',
                price: 1000, // in cents
                interval: 'month',
                interval_count: 1
            },
            quarterly: {
                name: 'Quarterly Donor',
                price: 2500, // in cents
                interval: 'month',
                interval_count: 3
            },
            yearly: {
                name: 'Annual Donor',
                price: 10000, // in cents
                interval: 'year',
                interval_count: 1
            }
        },
        
        // Trial period (in days)
        trialPeriodDays: 0,
        
        // Billing cycle anchor
        billingCycleAnchor: 'now',
        
        // Collection method
        collectionMethod: 'charge_automatically',
        
        // Days until due
        daysUntilDue: 0
    },
    
    // Webhook events configuration
    webhookEvents: {
        // Payment events
        payment: [
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
            'payment_intent.canceled',
            'payment_intent.processing',
            'payment_intent.requires_action'
        ],
        
        // Subscription events
        subscription: [
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
            'customer.subscription.trial_will_end'
        ],
        
        // Invoice events
        invoice: [
            'invoice.paid',
            'invoice.payment_failed',
            'invoice.payment_succeeded',
            'invoice.upcoming',
            'invoice.marked_uncollectible'
        ],
        
        // Customer events
        customer: [
            'customer.created',
            'customer.updated',
            'customer.deleted',
            'customer.source.created',
            'customer.source.updated',
            'customer.source.deleted'
        ],
        
        // Charge events
        charge: [
            'charge.succeeded',
            'charge.failed',
            'charge.refunded',
            'charge.dispute.created',
            'charge.dispute.closed'
        ],
        
        // Refund events
        refund: [
            'charge.refund.updated'
        ]
    },
    
    // Stripe client instance
    client: null,
    
    // Initialization state
    initialized: false
};

// Initialize Stripe client
const initializeStripe = () => {
    try {
        if (stripeConfig.initialized && stripeConfig.client) {
            logger.info('Stripe is already initialized');
            return stripeConfig.client;
        }
        
        // Check if API key is available
        if (!stripeConfig.apiKey) {
            logger.error('Stripe API key not found. Please set STRIPE_SECRET_KEY environment variable.');
            stripeConfig.initialized = false;
            return null;
        }
        
        // Initialize Stripe client
        stripeConfig.client = stripe(stripeConfig.apiKey, {
            apiVersion: stripeConfig.apiVersion,
            maxNetworkRetries: stripeConfig.clientConfig.maxNetworkRetries,
            timeout: stripeConfig.clientConfig.timeout,
            host: stripeConfig.clientConfig.host,
            port: stripeConfig.clientConfig.port,
            telemetry: stripeConfig.clientConfig.telemetry
        });
        
        stripeConfig.initialized = true;
        logger.info('Stripe client initialized successfully');
        
        return stripeConfig.client;
    } catch (error) {
        logger.error(`Failed to initialize Stripe: ${error.message}`);
        stripeConfig.initialized = false;
        throw error;
    }
};

// Get Stripe client instance
const getStripeClient = () => {
    if (!stripeConfig.initialized) {
        return initializeStripe();
    }
    return stripeConfig.client;
};

// Payment utilities
const paymentUtils = {
    // Convert amount to Stripe format (smallest currency unit)
    convertToStripeAmount: (amount, currency = 'usd') => {
        // Stripe amounts are in smallest currency unit (cents for USD)
        const decimalMultipliers = {
            usd: 100,
            eur: 100,
            gbp: 100,
            cad: 100,
            aud: 100,
            jpy: 1, // Yen doesn't have cents
            krw: 1  // Won doesn't have cents
        };
        
        const multiplier = decimalMultipliers[currency.toLowerCase()] || 100;
        return Math.round(amount * multiplier);
    },
    
    // Convert from Stripe format
    convertFromStripeAmount: (amount, currency = 'usd') => {
        const decimalMultipliers = {
            usd: 100,
            eur: 100,
            gbp: 100,
            cad: 100,
            aud: 100,
            jpy: 1,
            krw: 1
        };
        
        const multiplier = decimalMultipliers[currency.toLowerCase()] || 100;
        return amount / multiplier;
    },
    
    // Validate payment amount
    validateAmount: (amount, currency = 'usd') => {
        const minAmount = stripeConfig.payment.minimumAmounts[currency] || 0.50;
        const maxAmount = stripeConfig.payment.maximumAmounts[currency] || 10000;
        
        if (amount < minAmount) {
            return {
                valid: false,
                error: `Minimum amount is ${minAmount} ${currency.toUpperCase()}`
            };
        }
        
        if (amount > maxAmount) {
            return {
                valid: false,
                error: `Maximum amount is ${maxAmount} ${currency.toUpperCase()}`
            };
        }
        
        return { valid: true, amount };
    },
    
    // Calculate Stripe fees
    calculateFees: (amount, currency = 'usd') => {
        const stripeAmount = paymentUtils.convertToStripeAmount(amount, currency);
        const feePercentage = stripeConfig.payment.fees.percentage;
        const fixedFee = stripeConfig.payment.fees.fixed;
        
        // Convert fixed fee to currency
        let convertedFixedFee = fixedFee;
        if (currency !== 'usd') {
            // Convert USD fixed fee to target currency
            const conversionRate = stripeConfig.payment.conversionRates.usd?.[currency] || 1;
            convertedFixedFee = fixedFee / conversionRate;
        }
        
        const feeAmount = (stripeAmount * feePercentage / 100) + 
                         paymentUtils.convertToStripeAmount(convertedFixedFee, currency);
        
        const netAmount = stripeAmount - feeAmount;
        
        return {
            grossAmount: stripeAmount,
            feePercentage,
            fixedFee: convertedFixedFee,
            feeAmount,
            netAmount,
            netAmountDecimal: paymentUtils.convertFromStripeAmount(netAmount, currency)
        };
    },
    
    // Format currency
    formatCurrency: (amount, currency = 'usd') => {
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase()
        });
        
        return formatter.format(amount);
    },
    
    // Convert BDT to supported currency
    convertBDTToCurrency: (bdtAmount, targetCurrency = 'usd') => {
        const conversionRate = stripeConfig.payment.conversionRates.bdt?.[targetCurrency];
        if (!conversionRate) {
            throw new Error(`Conversion rate not available for ${targetCurrency}`);
        }
        
        const convertedAmount = bdtAmount * conversionRate;
        return {
            originalAmount: bdtAmount,
            originalCurrency: 'bdt',
            convertedAmount,
            targetCurrency,
            conversionRate,
            stripeAmount: paymentUtils.convertToStripeAmount(convertedAmount, targetCurrency)
        };
    }
};

// Customer management utilities
const customerUtils = {
    // Create customer
    createCustomer: async (customerData) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const customer = await stripe.customers.create({
                email: customerData.email,
                name: customerData.name,
                phone: customerData.phone,
                metadata: {
                    userId: customerData.userId,
                    ...customerData.metadata
                },
                address: customerData.address,
                shipping: customerData.shipping,
                description: customerData.description || `Customer for ${customerData.email}`,
                payment_method: customerData.paymentMethodId
            });
            
            logger.info(`Stripe customer created: ${customer.id}`);
            
            return {
                success: true,
                customer,
                customerId: customer.id
            };
        } catch (error) {
            logger.error(`Create customer error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Retrieve customer
    retrieveCustomer: async (customerId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const customer = await stripe.customers.retrieve(customerId);
            
            return {
                success: true,
                customer
            };
        } catch (error) {
            logger.error(`Retrieve customer error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Update customer
    updateCustomer: async (customerId, updates) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const customer = await stripe.customers.update(customerId, updates);
            
            return {
                success: true,
                customer
            };
        } catch (error) {
            logger.error(`Update customer error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Delete customer
    deleteCustomer: async (customerId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const customer = await stripe.customers.del(customerId);
            
            logger.info(`Stripe customer deleted: ${customerId}`);
            
            return {
                success: true,
                customer
            };
        } catch (error) {
            logger.error(`Delete customer error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // List customers
    listCustomers: async (options = {}) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const customers = await stripe.customers.list({
                limit: options.limit || 10,
                starting_after: options.startingAfter,
                ending_before: options.endingBefore,
                email: options.email
            });
            
            return {
                success: true,
                customers: customers.data,
                hasMore: customers.has_more,
                total: customers.data.length
            };
        } catch (error) {
            logger.error(`List customers error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Create payment method
    createPaymentMethod: async (paymentMethodData) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const paymentMethod = await stripe.paymentMethods.create({
                type: 'card',
                card: {
                    number: paymentMethodData.cardNumber,
                    exp_month: paymentMethodData.expMonth,
                    exp_year: paymentMethodData.expYear,
                    cvc: paymentMethodData.cvc
                },
                billing_details: {
                    name: paymentMethodData.name,
                    email: paymentMethodData.email,
                    phone: paymentMethodData.phone,
                    address: paymentMethodData.address
                },
                metadata: paymentMethodData.metadata
            });
            
            return {
                success: true,
                paymentMethod,
                paymentMethodId: paymentMethod.id
            };
        } catch (error) {
            logger.error(`Create payment method error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Attach payment method to customer
    attachPaymentMethod: async (paymentMethodId, customerId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
                customer: customerId
            });
            
            return {
                success: true,
                paymentMethod
            };
        } catch (error) {
            logger.error(`Attach payment method error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Set default payment method
    setDefaultPaymentMethod: async (customerId, paymentMethodId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const customer = await stripe.customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId
                }
            });
            
            return {
                success: true,
                customer
            };
        } catch (error) {
            logger.error(`Set default payment method error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Payment intent utilities
const paymentIntentUtils = {
    // Create payment intent
    createPaymentIntent: async (paymentData) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const {
                amount,
                currency = 'usd',
                customerId,
                paymentMethodId,
                metadata = {},
                description,
                receiptEmail,
                setupFutureUsage
            } = paymentData;
            
            // Validate amount
            const amountValidation = paymentUtils.validateAmount(
                paymentUtils.convertFromStripeAmount(amount, currency),
                currency
            );
            
            if (!amountValidation.valid) {
                throw new Error(amountValidation.error);
            }
            
            const paymentIntent = await stripe.paymentIntents.create({
                amount,
                currency: currency.toLowerCase(),
                customer: customerId,
                payment_method: paymentMethodId,
                metadata: {
                    ...metadata,
                    createdBy: 'blood-donation-app',
                    timestamp: new Date().toISOString()
                },
                description: description || 'Blood donation payment',
                receipt_email: receiptEmail,
                setup_future_usage: setupFutureUsage,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never'
                },
                confirmation_method: 'automatic',
                confirm: false,
                capture_method: 'automatic'
            });
            
            logger.info(`Payment intent created: ${paymentIntent.id}`);
            
            return {
                success: true,
                paymentIntent,
                clientSecret: paymentIntent.client_secret
            };
        } catch (error) {
            logger.error(`Create payment intent error: ${error.message}`);
            return {
                success: false,
                error: error.message,
                errorType: error.type,
                code: error.code
            };
        }
    },
    
    // Retrieve payment intent
    retrievePaymentIntent: async (paymentIntentId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            
            return {
                success: true,
                paymentIntent
            };
        } catch (error) {
            logger.error(`Retrieve payment intent error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Confirm payment intent
    confirmPaymentIntent: async (paymentIntentId, paymentMethodId, returnUrl = null) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const confirmData = {
                payment_method: paymentMethodId,
                return_url: returnUrl
            };
            
            const paymentIntent = await stripe.paymentIntents.confirm(
                paymentIntentId,
                confirmData
            );
            
            return {
                success: true,
                paymentIntent,
                requiresAction: paymentIntent.status === 'requires_action',
                nextAction: paymentIntent.next_action
            };
        } catch (error) {
            logger.error(`Confirm payment intent error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Capture payment intent
    capturePaymentIntent: async (paymentIntentId, amount = null) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const captureData = amount ? { amount_to_capture: amount } : {};
            const paymentIntent = await stripe.paymentIntents.capture(
                paymentIntentId,
                captureData
            );
            
            logger.info(`Payment intent captured: ${paymentIntentId}`);
            
            return {
                success: true,
                paymentIntent
            };
        } catch (error) {
            logger.error(`Capture payment intent error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Cancel payment intent
    cancelPaymentIntent: async (paymentIntentId, cancellationReason = null) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const cancelData = cancellationReason ? { cancellation_reason: cancellationReason } : {};
            const paymentIntent = await stripe.paymentIntents.cancel(
                paymentIntentId,
                cancelData
            );
            
            logger.info(`Payment intent canceled: ${paymentIntentId}`);
            
            return {
                success: true,
                paymentIntent
            };
        } catch (error) {
            logger.error(`Cancel payment intent error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // List payment intents
    listPaymentIntents: async (options = {}) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const paymentIntents = await stripe.paymentIntents.list({
                limit: options.limit || 10,
                starting_after: options.startingAfter,
                ending_before: options.endingBefore,
                customer: options.customerId,
                created: options.created
            });
            
            return {
                success: true,
                paymentIntents: paymentIntents.data,
                hasMore: paymentIntents.has_more
            };
        } catch (error) {
            logger.error(`List payment intents error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Subscription utilities
const subscriptionUtils = {
    // Create subscription
    createSubscription: async (subscriptionData) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const {
                customerId,
                priceId,
                paymentMethodId,
                trialPeriodDays = stripeConfig.subscription.trialPeriodDays,
                metadata = {},
                couponId
            } = subscriptionData;
            
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId }],
                default_payment_method: paymentMethodId,
                trial_period_days: trialPeriodDays,
                metadata: {
                    ...metadata,
                    createdBy: 'blood-donation-app'
                },
                coupon: couponId,
                expand: ['latest_invoice.payment_intent']
            });
            
            logger.info(`Subscription created: ${subscription.id}`);
            
            return {
                success: true,
                subscription,
                clientSecret: subscription.latest_invoice?.payment_intent?.client_secret
            };
        } catch (error) {
            logger.error(`Create subscription error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Retrieve subscription
    retrieveSubscription: async (subscriptionId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            return {
                success: true,
                subscription
            };
        } catch (error) {
            logger.error(`Retrieve subscription error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Update subscription
    updateSubscription: async (subscriptionId, updates) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const subscription = await stripe.subscriptions.update(subscriptionId, updates);
            
            return {
                success: true,
                subscription
            };
        } catch (error) {
            logger.error(`Update subscription error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Cancel subscription
    cancelSubscription: async (subscriptionId, cancelAtPeriodEnd = false) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            let subscription;
            
            if (cancelAtPeriodEnd) {
                subscription = await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true
                });
                logger.info(`Subscription scheduled for cancellation: ${subscriptionId}`);
            } else {
                subscription = await stripe.subscriptions.cancel(subscriptionId);
                logger.info(`Subscription canceled immediately: ${subscriptionId}`);
            }
            
            return {
                success: true,
                subscription
            };
        } catch (error) {
            logger.error(`Cancel subscription error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // List subscriptions
    listSubscriptions: async (options = {}) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const subscriptions = await stripe.subscriptions.list({
                limit: options.limit || 10,
                starting_after: options.startingAfter,
                ending_before: options.endingBefore,
                customer: options.customerId,
                status: options.status,
                created: options.created
            });
            
            return {
                success: true,
                subscriptions: subscriptions.data,
                hasMore: subscriptions.has_more
            };
        } catch (error) {
            logger.error(`List subscriptions error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Webhook utilities
const webhookUtils = {
    // Verify webhook signature
    verifyWebhookSignature: (payload, signature) => {
        try {
            if (!stripeConfig.webhookSecret) {
                throw new Error('Stripe webhook secret not configured');
            }
            
            const event = stripe.webhooks.constructEvent(
                payload,
                signature,
                stripeConfig.webhookSecret
            );
            
            return {
                success: true,
                event
            };
        } catch (error) {
            logger.error(`Verify webhook signature error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Handle webhook event
    handleWebhookEvent: async (event) => {
        try {
            const eventType = event.type;
            const data = event.data.object;
            
            logger.info(`Processing Stripe webhook event: ${eventType}`);
            
            // Route event to appropriate handler
            switch (eventType) {
                case 'payment_intent.succeeded':
                    await handlePaymentIntentSucceeded(data);
                    break;
                    
                case 'payment_intent.payment_failed':
                    await handlePaymentIntentFailed(data);
                    break;
                    
                case 'customer.subscription.created':
                    await handleSubscriptionCreated(data);
                    break;
                    
                case 'customer.subscription.updated':
                    await handleSubscriptionUpdated(data);
                    break;
                    
                case 'customer.subscription.deleted':
                    await handleSubscriptionDeleted(data);
                    break;
                    
                case 'invoice.paid':
                    await handleInvoicePaid(data);
                    break;
                    
                case 'invoice.payment_failed':
                    await handleInvoicePaymentFailed(data);
                    break;
                    
                case 'charge.refunded':
                    await handleChargeRefunded(data);
                    break;
                    
                default:
                    logger.debug(`Unhandled Stripe event type: ${eventType}`);
            }
            
            return {
                success: true,
                eventType,
                handled: true
            };
        } catch (error) {
            logger.error(`Handle webhook event error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Event handlers
    handlePaymentIntentSucceeded: async (paymentIntent) => {
        // Handle successful payment
        logger.info(`Payment succeeded: ${paymentIntent.id}`);
        // Update your database, send confirmation email, etc.
    },
    
    handlePaymentIntentFailed: async (paymentIntent) => {
        // Handle failed payment
        logger.warn(`Payment failed: ${paymentIntent.id}`);
        // Update your database, notify user, etc.
    },
    
    handleSubscriptionCreated: async (subscription) => {
        // Handle new subscription
        logger.info(`Subscription created: ${subscription.id}`);
        // Update your database, send welcome email, etc.
    },
    
    handleSubscriptionUpdated: async (subscription) => {
        // Handle subscription update
        logger.info(`Subscription updated: ${subscription.id}`);
        // Update your database
    },
    
    handleSubscriptionDeleted: async (subscription) => {
        // Handle subscription cancellation
        logger.info(`Subscription deleted: ${subscription.id}`);
        // Update your database, send cancellation email, etc.
    },
    
    handleInvoicePaid: async (invoice) => {
        // Handle paid invoice
        logger.info(`Invoice paid: ${invoice.id}`);
        // Update your database, send receipt, etc.
    },
    
    handleInvoicePaymentFailed: async (invoice) => {
        // Handle failed invoice payment
        logger.warn(`Invoice payment failed: ${invoice.id}`);
        // Update your database, notify user, etc.
    },
    
    handleChargeRefunded: async (charge) => {
        // Handle refund
        logger.info(`Charge refunded: ${charge.id}`);
        // Update your database, notify user, etc.
    }
};

// Refund utilities
const refundUtils = {
    // Create refund
    createRefund: async (paymentIntentId, amount = null, reason = 'requested_by_customer') => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const refundData = {
                payment_intent: paymentIntentId,
                reason
            };
            
            if (amount) {
                refundData.amount = amount;
            }
            
            const refund = await stripe.refunds.create(refundData);
            
            logger.info(`Refund created: ${refund.id}`);
            
            return {
                success: true,
                refund
            };
        } catch (error) {
            logger.error(`Create refund error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // Retrieve refund
    retrieveRefund: async (refundId) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const refund = await stripe.refunds.retrieve(refundId);
            
            return {
                success: true,
                refund
            };
        } catch (error) {
            logger.error(`Retrieve refund error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    },
    
    // List refunds
    listRefunds: async (options = {}) => {
        try {
            const stripe = getStripeClient();
            if (!stripe) {
                throw new Error('Stripe not initialized');
            }
            
            const refunds = await stripe.refunds.list({
                limit: options.limit || 10,
                starting_after: options.startingAfter,
                ending_before: options.endingBefore,
                payment_intent: options.paymentIntentId
            });
            
            return {
                success: true,
                refunds: refunds.data,
                hasMore: refunds.has_more
            };
        } catch (error) {
            logger.error(`List refunds error: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// Check Stripe service status
const checkStripeStatus = async () => {
    try {
        const stripe = getStripeClient();
        if (!stripe) {
            return {
                connected: false,
                message: 'Stripe not initialized'
            };
        }
        
        // Test connection by retrieving balance
        const balance = await stripe.balance.retrieve();
        
        return {
            connected: true,
            message: 'Stripe connected successfully',
            balance: {
                available: balance.available.map(b => ({
                    amount: paymentUtils.convertFromStripeAmount(b.amount, b.currency),
                    currency: b.currency
                })),
                pending: balance.pending.map(b => ({
                    amount: paymentUtils.convertFromStripeAmount(b.amount, b.currency),
                    currency: b.currency
                }))
            }
        };
    } catch (error) {
        return {
            connected: false,
            message: error.message
        };
    }
};

// Get Stripe configuration
const getStripeConfig = () => {
    return {
        initialized: stripeConfig.initialized,
        publishableKey: stripeConfig.publishableKey,
        apiVersion: stripeConfig.apiVersion,
        payment: {
            defaultCurrency: stripeConfig.payment.defaultCurrency,
            supportedCurrencies: stripeConfig.payment.supportedCurrencies,
            minimumAmounts: stripeConfig.payment.minimumAmounts,
            paymentMethodTypes: stripeConfig.payment.paymentMethodTypes
        },
        subscription: {
            plans: stripeConfig.subscription.plans,
            trialPeriodDays: stripeConfig.subscription.trialPeriodDays
        }
    };
};

// Export configuration and utilities
module.exports = {
    stripeConfig,
    initializeStripe,
    getStripeClient,
    getStripeConfig,
    checkStripeStatus,
    paymentUtils,
    customerUtils,
    paymentIntentUtils,
    subscriptionUtils,
    webhookUtils,
    refundUtils
};