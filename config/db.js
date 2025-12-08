const mongoose = require('mongoose');
const logger = require('../middleware/loggerMiddleware').logger;

// MongoDB connection configuration
const dbConfig = {
    // MongoDB URI from environment variable
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/blood_donation_db',
    
    // Connection options
    options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 2,
        retryWrites: true,
        w: 'majority',
        
        // Authentication options (if using auth)
        authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
        user: process.env.MONGODB_USER,
        pass: process.env.MONGODB_PASS,
        
        // SSL/TLS options
        ssl: process.env.MONGODB_SSL === 'true',
        tls: process.env.MONGODB_TLS === 'true',
        tlsAllowInvalidCertificates: process.env.MONGODB_TLS_ALLOW_INVALID === 'true',
        tlsAllowInvalidHostnames: process.env.MONGODB_TLS_ALLOW_INVALID_HOSTS === 'true',
        
        // Replica set options
        replicaSet: process.env.MONGODB_REPLICA_SET,
        readPreference: process.env.MONGODB_READ_PREFERENCE || 'primary',
        
        // Write concern
        wtimeoutMS: process.env.MONGODB_WTIMEOUT_MS || 10000,
        j: process.env.MONGODB_JOURNAL === 'true',
        
        // Connection pool options
        maxIdleTimeMS: 60000,
        waitQueueTimeoutMS: 10000,
        
        // Compression
        compressors: process.env.MONGODB_COMPRESSORS || 'snappy,zlib',
        zlibCompressionLevel: process.env.MONGODB_ZLIB_LEVEL || 3
    },
    
    // Database names
    databases: {
        main: process.env.MONGODB_DATABASE || 'blood_donation_db',
        test: process.env.MONGODB_TEST_DATABASE || 'blood_donation_test',
        analytics: process.env.MONGODB_ANALYTICS_DATABASE || 'blood_donation_analytics'
    },
    
    // Collection configurations
    collections: {
        users: {
            name: 'users',
            indexes: [
                { key: { email: 1 }, options: { unique: true, sparse: true } },
                { key: { status: 1 } },
                { key: { role: 1 } },
                { key: { bloodGroup: 1 } },
                { key: { district: 1, upazila: 1 } },
                { key: { lastDonationDate: 1 } },
                { key: { createdAt: -1 } },
                { key: { lastActivity: -1 } },
                { key: { phone: 1 }, options: { sparse: true } },
                { key: { 'notificationPreferences.emailNotifications': 1 } }
            ]
        },
        donationRequests: {
            name: 'donationrequests',
            indexes: [
                { key: { status: 1 } },
                { key: { bloodGroup: 1 } },
                { key: { requester: 1 } },
                { key: { donor: 1 } },
                { key: { recipientDistrict: 1, recipientUpazila: 1 } },
                { key: { donationDate: 1 } },
                { key: { urgencyLevel: 1 } },
                { key: { createdAt: -1 } },
                { key: { updatedAt: -1 } },
                { key: { bloodGroup: 1, status: 1, recipientDistrict: 1 } },
                { key: { donationDate: 1, status: 1 } },
                { key: { 'location.coordinates': '2dsphere' } }
            ]
        },
        funding: {
            name: 'funding',
            indexes: [
                { key: { user: 1 } },
                { key: { status: 1 } },
                { key: { paymentMethod: 1 } },
                { key: { amount: -1 } },
                { key: { createdAt: -1 } },
                { key: { paymentIntentId: 1 }, options: { unique: true, sparse: true } },
                { key: { transactionId: 1 }, options: { unique: true, sparse: true } },
                { key: { isRecurring: 1 } }
            ]
        },
        notifications: {
            name: 'notifications',
            indexes: [
                { key: { recipient: 1, createdAt: -1 } },
                { key: { recipient: 1, isRead: 1 } },
                { key: { type: 1 } },
                { key: { priority: 1 } },
                { key: { createdAt: -1 } },
                { key: { relatedTo: 1 } },
                { key: { recipient: 1, type: 1, isRead: 1 } }
            ]
        },
        contacts: {
            name: 'contacts',
            indexes: [
                { key: { email: 1 } },
                { key: { status: 1 } },
                { key: { category: 1 } },
                { key: { priority: 1 } },
                { key: { createdAt: -1 } },
                { key: { respondedAt: 1 } }
            ]
        },
        activities: {
            name: 'activities',
            indexes: [
                { key: { user: 1, createdAt: -1 } },
                { key: { type: 1 } },
                { key: { createdAt: -1 } },
                { key: { entityType: 1, entityId: 1 } }
            ]
        }
    },
    
    // Connection state tracking
    connectionState: {
        connected: false,
        connecting: false,
        error: null,
        lastConnectionAttempt: null,
        connectionAttempts: 0
    },
    
    // Connection event handlers
    events: {
        onConnected: () => {
            logger.info('MongoDB connected successfully');
            dbConfig.connectionState.connected = true;
            dbConfig.connectionState.connecting = false;
            dbConfig.connectionState.error = null;
            dbConfig.connectionState.connectionAttempts = 0;
        },
        
        onError: (error) => {
            logger.error(`MongoDB connection error: ${error.message}`);
            dbConfig.connectionState.connected = false;
            dbConfig.connectionState.error = error.message;
            dbConfig.connectionState.connectionAttempts++;
        },
        
        onDisconnected: () => {
            logger.warn('MongoDB disconnected');
            dbConfig.connectionState.connected = false;
        },
        
        onReconnected: () => {
            logger.info('MongoDB reconnected');
            dbConfig.connectionState.connected = true;
            dbConfig.connectionState.error = null;
        }
    }
};

// Connect to MongoDB
const connectDB = async () => {
    try {
        if (dbConfig.connectionState.connecting) {
            logger.info('MongoDB connection already in progress');
            return mongoose.connection;
        }
        
        dbConfig.connectionState.connecting = true;
        dbConfig.connectionState.lastConnectionAttempt = new Date();
        
        logger.info(`Connecting to MongoDB: ${dbConfig.uri.replace(/:[^:]*@/, ':****@')}`);
        
        // Set up event listeners
        mongoose.connection.on('connected', dbConfig.events.onConnected);
        mongoose.connection.on('error', dbConfig.events.onError);
        mongoose.connection.on('disconnected', dbConfig.events.onDisconnected);
        mongoose.connection.on('reconnected', dbConfig.events.onReconnected);
        
        // Connect to database
        const conn = await mongoose.connect(dbConfig.uri, dbConfig.options);
        
        // Create indexes
        await createIndexes();
        
        return conn;
    } catch (error) {
        dbConfig.connectionState.connecting = false;
        dbConfig.connectionState.error = error.message;
        logger.error(`Failed to connect to MongoDB: ${error.message}`);
        throw error;
    }
};

// Create database indexes
const createIndexes = async () => {
    try {
        logger.info('Creating database indexes...');
        
        for (const [collectionName, config] of Object.entries(dbConfig.collections)) {
            const collection = mongoose.connection.collection(config.name);
            
            for (const indexConfig of config.indexes) {
                try {
                    await collection.createIndex(indexConfig.key, indexConfig.options || {});
                    logger.debug(`Created index for ${config.name}: ${JSON.stringify(indexConfig.key)}`);
                } catch (error) {
                    logger.warn(`Failed to create index for ${config.name}: ${error.message}`);
                }
            }
        }
        
        logger.info('Database indexes created successfully');
    } catch (error) {
        logger.error(`Error creating indexes: ${error.message}`);
    }
};

// Disconnect from MongoDB
const disconnectDB = async () => {
    try {
        await mongoose.disconnect();
        logger.info('MongoDB disconnected successfully');
        dbConfig.connectionState.connected = false;
        dbConfig.connectionState.connecting = false;
    } catch (error) {
        logger.error(`Error disconnecting from MongoDB: ${error.message}`);
        throw error;
    }
};

// Get database connection status
const getDBStatus = () => {
    return {
        connected: dbConfig.connectionState.connected,
        connecting: dbConfig.connectionState.connecting,
        error: dbConfig.connectionState.error,
        lastConnectionAttempt: dbConfig.connectionState.lastConnectionAttempt,
        connectionAttempts: dbConfig.connectionState.connectionAttempts,
        mongooseState: mongoose.STATES[mongoose.connection.readyState] || 'unknown',
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        port: mongoose.connection.port
    };
};

// Database health check
const checkDBHealth = async () => {
    try {
        // Ping the database
        await mongoose.connection.db.command({ ping: 1 });
        
        // Get database stats
        const stats = await mongoose.connection.db.stats();
        
        // Get collection stats
        const collectionStats = {};
        for (const [name, config] of Object.entries(dbConfig.collections)) {
            try {
                const collStats = await mongoose.connection.collection(config.name).stats();
                collectionStats[config.name] = {
                    count: collStats.count,
                    size: collStats.size,
                    avgObjSize: collStats.avgObjSize,
                    storageSize: collStats.storageSize,
                    totalIndexSize: collStats.totalIndexSize,
                    indexes: collStats.nindexes
                };
            } catch (error) {
                collectionStats[config.name] = { error: error.message };
            }
        }
        
        return {
            healthy: true,
            status: 'connected',
            uptime: process.uptime(),
            database: {
                name: stats.db,
                collections: stats.collections,
                objects: stats.objects,
                avgObjSize: stats.avgObjSize,
                dataSize: stats.dataSize,
                storageSize: stats.storageSize,
                indexes: stats.indexes,
                indexSize: stats.indexSize
            },
            collections: collectionStats,
            connection: getDBStatus(),
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            healthy: false,
            status: 'disconnected',
            error: error.message,
            connection: getDBStatus(),
            timestamp: new Date().toISOString()
        };
    }
};

// Backup database (simplified - in production use mongodump)
const backupDatabase = async (backupPath = './backups') => {
    logger.warn('Database backup initiated - using simplified backup method');
    
    try {
        // Get all collections data
        const backupData = {
            timestamp: new Date().toISOString(),
            database: mongoose.connection.name,
            collections: {}
        };
        
        for (const [name, config] of Object.entries(dbConfig.collections)) {
            try {
                const data = await mongoose.connection.collection(config.name)
                    .find({})
                    .limit(1000) // Limit for demo purposes
                    .toArray();
                
                backupData.collections[config.name] = {
                    count: data.length,
                    sample: data.slice(0, 10) // Store sample for verification
                };
            } catch (error) {
                backupData.collections[config.name] = { error: error.message };
            }
        }
        
        // In production, you would:
        // 1. Use mongodump command
        // 2. Upload to cloud storage
        // 3. Schedule regular backups
        
        return {
            success: true,
            message: 'Backup data collected (simplified demo)',
            backupData,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        logger.error(`Backup error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Database utilities for specific operations
const dbUtils = {
    // Get database size information
    getDatabaseSize: async () => {
        const stats = await mongoose.connection.db.stats();
        return {
            dataSize: formatBytes(stats.dataSize),
            storageSize: formatBytes(stats.storageSize),
            indexSize: formatBytes(stats.indexSize),
            totalSize: formatBytes(stats.dataSize + stats.storageSize + stats.indexSize)
        };
    },
    
    // Get collection counts
    getCollectionCounts: async () => {
        const counts = {};
        for (const [name, config] of Object.entries(dbConfig.collections)) {
            try {
                const count = await mongoose.connection.collection(config.name).countDocuments();
                counts[config.name] = count;
            } catch (error) {
                counts[config.name] = { error: error.message };
            }
        }
        return counts;
    },
    
    // Run database command
    runCommand: async (command) => {
        try {
            const result = await mongoose.connection.db.command(command);
            return { success: true, result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// Helper function to format bytes
const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Export configuration and functions
module.exports = {
    dbConfig,
    connectDB,
    disconnectDB,
    getDBStatus,
    checkDBHealth,
    backupDatabase,
    createIndexes,
    ...dbUtils
};