const mongoose = require('mongoose');
const logger = require('./../middleware/loggerMiddleware').logger;

// Database connection options
const dbOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
    w: 'majority'
};

// Connect to MongoDB
const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in environment variables');
        }

        const conn = await mongoose.connect(process.env.MONGODB_URI, dbOptions);
        
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
        logger.info(`Database: ${conn.connection.name}`);
        
        // Log connection stats
        const stats = await mongoose.connection.db.stats();
        logger.info(`Database stats: ${JSON.stringify({
            collections: stats.collections,
            objects: stats.objects,
            avgObjSize: Math.round(stats.avgObjSize),
            dataSize: Math.round(stats.dataSize / 1024 / 1024) + 'MB',
            storageSize: Math.round(stats.storageSize / 1024 / 1024) + 'MB'
        })}`);
        
        return conn;
    } catch (error) {
        logger.error(`Database connection error: ${error.message}`);
        console.error('Database connection error:', error);
        process.exit(1);
    }
};

// Disconnect from MongoDB
const disconnectDB = async () => {
    try {
        await mongoose.disconnect();
        logger.info('MongoDB disconnected successfully');
    } catch (error) {
        logger.error(`Database disconnection error: ${error.message}`);
        console.error('Database disconnection error:', error);
    }
};

// Get database connection status
const getDBStatus = () => {
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
        99: 'uninitialized'
    };
    
    return {
        state: states[mongoose.connection.readyState] || 'unknown',
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
        
        // Get some stats
        const stats = await mongoose.connection.db.stats();
        
        return {
            healthy: true,
            status: 'connected',
            stats: {
                collections: stats.collections,
                objects: stats.objects,
                avgObjSize: Math.round(stats.avgObjSize),
                dataSize: Math.round(stats.dataSize / 1024 / 1024) + 'MB',
                indexes: stats.indexes,
                indexSize: Math.round(stats.indexSize / 1024 / 1024) + 'MB'
            },
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            healthy: false,
            status: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};

// Database backup utility
const createBackup = async (backupPath = './backups') => {
    // Note: This is a placeholder for actual backup logic
    // In production, you might use mongodump or a cloud service
    logger.warn('Database backup functionality not implemented. Use mongodump for production backups.');
    
    return {
        success: false,
        message: 'Backup functionality requires mongodump or external service',
        timestamp: new Date().toISOString()
    };
};

// Database cleanup utility (remove old documents)
const cleanupOldDocuments = async (modelName, field, days = 30) => {
    try {
        const Model = mongoose.model(modelName);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const result = await Model.deleteMany({
            [field]: { $lt: cutoffDate }
        });
        
        logger.info(`Cleaned up ${result.deletedCount} old documents from ${modelName}`);
        
        return {
            success: true,
            deletedCount: result.deletedCount,
            model: modelName,
            cutoffDate: cutoffDate.toISOString()
        };
    } catch (error) {
        logger.error(`Cleanup error for ${modelName}: ${error.message}`);
        return {
            success: false,
            error: error.message,
            model: modelName
        };
    }
};

// Database indexing utility
const createIndexes = async () => {
    const indexOperations = [];
    
    try {
        // User model indexes
        const User = mongoose.model('User');
        indexOperations.push(
            User.collection.createIndex({ email: 1 }, { unique: true, sparse: true }),
            User.collection.createIndex({ status: 1 }),
            User.collection.createIndex({ role: 1 }),
            User.collection.createIndex({ bloodGroup: 1 }),
            User.collection.createIndex({ district: 1, upazila: 1 }),
            User.collection.createIndex({ lastDonationDate: 1 }),
            User.collection.createIndex({ createdAt: -1 })
        );
        
        // DonationRequest model indexes
        const DonationRequest = mongoose.model('DonationRequest');
        indexOperations.push(
            DonationRequest.collection.createIndex({ status: 1 }),
            DonationRequest.collection.createIndex({ bloodGroup: 1 }),
            DonationRequest.collection.createIndex({ requester: 1 }),
            DonationRequest.collection.createIndex({ donor: 1 }),
            DonationRequest.collection.createIndex({ 
                recipientDistrict: 1, 
                recipientUpazila: 1 
            }),
            DonationRequest.collection.createIndex({ donationDate: 1 }),
            DonationRequest.collection.createIndex({ urgencyLevel: 1 }),
            DonationRequest.collection.createIndex({ createdAt: -1 }),
            DonationRequest.collection.createIndex({ 
                bloodGroup: 1, 
                status: 1, 
                recipientDistrict: 1 
            })
        );
        
        // Funding model indexes
        const Funding = mongoose.model('Funding');
        indexOperations.push(
            Funding.collection.createIndex({ user: 1 }),
            Funding.collection.createIndex({ status: 1 }),
            Funding.collection.createIndex({ paymentMethod: 1 }),
            Funding.collection.createIndex({ amount: -1 }),
            Funding.collection.createIndex({ createdAt: -1 }),
            Funding.collection.createIndex({ paymentIntentId: 1 }, { unique: true, sparse: true })
        );
        
        // Execute all index creation operations
        const results = await Promise.allSettled(indexOperations);
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        logger.info(`Created ${successful} indexes, ${failed} failed`);
        
        return {
            success: true,
            total: results.length,
            successful,
            failed
        };
    } catch (error) {
        logger.error(`Index creation error: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
};

// Database transaction utility
const withTransaction = async (callback) => {
    const session = await mongoose.startSession();
    
    try {
        let result;
        await session.withTransaction(async () => {
            result = await callback(session);
        });
        
        return result;
    } catch (error) {
        logger.error(`Transaction error: ${error.message}`);
        throw error;
    } finally {
        session.endSession();
    }
};

// Database query performance monitoring
const monitorQueryPerformance = (modelName, operation, duration, query = {}) => {
    if (duration > 1000) { // Log slow queries (> 1 second)
        logger.warn(`Slow query detected: ${modelName}.${operation} took ${duration}ms`, {
            model: modelName,
            operation,
            duration,
            query: JSON.stringify(query).slice(0, 500) // Limit query log size
        });
    }
};

module.exports = {
    connectDB,
    disconnectDB,
    getDBStatus,
    checkDBHealth,
    createBackup,
    cleanupOldDocuments,
    createIndexes,
    withTransaction,
    monitorQueryPerformance
};