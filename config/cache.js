const NodeCache = require('node-cache');
const Redis = require('ioredis');
const logger = require('../middleware/loggerMiddleware').logger;

// Cache configuration
const cacheConfig = {
    // Cache type (memory, redis, or hybrid)
    type: process.env.CACHE_TYPE || 'memory',
    
    // Memory cache configuration
    memory: {
        // NodeCache options
        options: {
            stdTTL: parseInt(process.env.CACHE_TTL || '600'), // Default TTL: 10 minutes
            checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD || '120'), // Check expired keys every 2 minutes
            useClones: false, // Better performance
            deleteOnExpire: true, // Auto delete expired keys
            maxKeys: parseInt(process.env.CACHE_MAX_KEYS || '-1') // Unlimited keys
        },
        
        // Cache instance
        instance: null,
        
        // Statistics
        stats: {
            hits: 0,
            misses: 0,
            keys: 0,
            ksize: 0,
            vsize: 0
        }
    },
    
    // Redis configuration
    redis: {
        // Redis connection URL
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        
        // Redis connection options
        options: {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
            connectTimeout: 10000,
            commandTimeout: 5000
        },
        
        // Redis client instance
        client: null,
        
        // Connection status
        connected: false,
        
        // Statistics
        stats: {
            hits: 0,
            misses: 0,
            totalOperations: 0,
            lastError: null,
            connectedSince: null
        }
    },
    
    // Hybrid cache configuration
    hybrid: {
        enabled: process.env.CACHE_HYBRID === 'true',
        memoryTTL: parseInt(process.env.CACHE_MEMORY_TTL || '60'), // 1 minute
        redisTTL: parseInt(process.env.CACHE_REDIS_TTL || '3600') // 1 hour
    },
    
    // Cache prefixes
    prefixes: {
        user: 'user:',
        donation: 'donation:',
        funding: 'funding:',
        search: 'search:',
        stats: 'stats:',
        session: 'session:',
        api: 'api:',
        geolocation: 'geo:',
        bloodGroup: 'blood:'
    },
    
    // Default TTL values (in seconds)
    ttl: {
        short: 60, // 1 minute
        medium: 300, // 5 minutes
        long: 1800, // 30 minutes
        veryLong: 3600, // 1 hour
        day: 86400, // 24 hours
        week: 604800 // 7 days
    },
    
    // Cache initialization state
    initialized: false,
    
    // Cache statistics
    statistics: {
        totalOperations: 0,
        totalHits: 0,
        totalMisses: 0,
        totalSets: 0,
        totalDeletes: 0,
        totalClears: 0,
        startTime: null
    }
};

// Initialize cache
const initializeCache = async () => {
    try {
        if (cacheConfig.initialized) {
            logger.info('Cache is already initialized');
            return true;
        }
        
        cacheConfig.statistics.startTime = new Date();
        
        switch (cacheConfig.type) {
            case 'redis':
                await initializeRedisCache();
                break;
                
            case 'hybrid':
                await initializeHybridCache();
                break;
                
            case 'memory':
            default:
                initializeMemoryCache();
                break;
        }
        
        cacheConfig.initialized = true;
        logger.info(`Cache initialized (type: ${cacheConfig.type})`);
        
        return true;
    } catch (error) {
        logger.error(`Failed to initialize cache: ${error.message}`);
        
        // Fallback to memory cache
        if (cacheConfig.type !== 'memory') {
            logger.warn('Falling back to memory cache');
            initializeMemoryCache();
            cacheConfig.initialized = true;
        }
        
        return false;
    }
};

// Initialize memory cache
const initializeMemoryCache = () => {
    try {
        cacheConfig.memory.instance = new NodeCache(cacheConfig.memory.options);
        
        // Set up event listeners
        cacheConfig.memory.instance.on('set', (key, value) => {
            cacheConfig.statistics.totalSets++;
            cacheConfig.statistics.totalOperations++;
        });
        
        cacheConfig.memory.instance.on('del', (key, value) => {
            cacheConfig.statistics.totalDeletes++;
            cacheConfig.statistics.totalOperations++;
        });
        
        cacheConfig.memory.instance.on('expired', (key, value) => {
            logger.debug(`Cache key expired: ${key}`);
        });
        
        cacheConfig.memory.instance.on('flush', () => {
            cacheConfig.statistics.totalClears++;
            logger.info('Memory cache flushed');
        });
        
        // Initialize stats
        const stats = cacheConfig.memory.instance.getStats();
        cacheConfig.memory.stats = { ...stats };
        
        logger.info('Memory cache initialized');
        return true;
    } catch (error) {
        logger.error(`Initialize memory cache error: ${error.message}`);
        throw error;
    }
};

// Initialize Redis cache
const initializeRedisCache = async () => {
    try {
        cacheConfig.redis.client = new Redis(cacheConfig.redis.url, cacheConfig.redis.options);
        
        // Set up event listeners
        cacheConfig.redis.client.on('connect', () => {
            logger.info('Redis cache connected');
            cacheConfig.redis.connected = true;
            cacheConfig.redis.stats.connectedSince = new Date();
        });
        
        cacheConfig.redis.client.on('ready', () => {
            logger.info('Redis cache ready');
        });
        
        cacheConfig.redis.client.on('error', (error) => {
            logger.error(`Redis cache error: ${error.message}`);
            cacheConfig.redis.stats.lastError = error.message;
            cacheConfig.redis.connected = false;
        });
        
        cacheConfig.redis.client.on('end', () => {
            logger.warn('Redis cache disconnected');
            cacheConfig.redis.connected = false;
        });
        
        cacheConfig.redis.client.on('reconnecting', () => {
            logger.info('Redis cache reconnecting...');
        });
        
        // Test connection
        await cacheConfig.redis.client.ping();
        
        logger.info('Redis cache initialized');
        return true;
    } catch (error) {
        logger.error(`Initialize Redis cache error: ${error.message}`);
        throw error;
    }
};

// Initialize hybrid cache
const initializeHybridCache = async () => {
    try {
        // Initialize both memory and Redis
        initializeMemoryCache();
        await initializeRedisCache();
        
        logger.info('Hybrid cache initialized');
        return true;
    } catch (error) {
        logger.error(`Initialize hybrid cache error: ${error.message}`);
        throw error;
    }
};

// Get cache instance
const getCache = () => {
    if (!cacheConfig.initialized) {
        initializeCache();
    }
    
    switch (cacheConfig.type) {
        case 'redis':
            return cacheConfig.redis.client;
        case 'hybrid':
            return {
                memory: cacheConfig.memory.instance,
                redis: cacheConfig.redis.client
            };
        case 'memory':
        default:
            return cacheConfig.memory.instance;
    }
};

// Cache operations
const cacheOperations = {
    // Set cache value
    set: async (key, value, ttl = null) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
            const ttlSeconds = ttl || cacheConfig.memory.options.stdTTL;
            
            cacheConfig.statistics.totalOperations++;
            cacheConfig.statistics.totalSets++;
            
            switch (cacheConfig.type) {
                case 'redis':
                    if (ttlSeconds > 0) {
                        await cacheConfig.redis.client.setex(cacheKey, ttlSeconds, JSON.stringify(value));
                    } else {
                        await cacheConfig.redis.client.set(cacheKey, JSON.stringify(value));
                    }
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    // Set in memory with shorter TTL
                    cacheConfig.memory.instance.set(cacheKey, value, cacheConfig.hybrid.memoryTTL);
                    
                    // Set in Redis with longer TTL
                    if (cacheConfig.redis.connected) {
                        if (ttlSeconds > 0) {
                            await cacheConfig.redis.client.setex(cacheKey, ttlSeconds, JSON.stringify(value));
                        } else {
                            await cacheConfig.redis.client.set(cacheKey, JSON.stringify(value));
                        }
                    }
                    break;
                    
                case 'memory':
                default:
                    cacheConfig.memory.instance.set(cacheKey, value, ttlSeconds);
                    break;
            }
            
            logger.debug(`Cache set: ${cacheKey} (TTL: ${ttlSeconds}s)`);
            return true;
        } catch (error) {
            logger.error(`Cache set error for key ${key}: ${error.message}`);
            return false;
        }
    },
    
    // Get cache value
    get: async (key) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
            
            cacheConfig.statistics.totalOperations++;
            
            let value = null;
            let fromMemory = false;
            
            switch (cacheConfig.type) {
                case 'redis':
                    const redisValue = await cacheConfig.redis.client.get(cacheKey);
                    if (redisValue) {
                        value = JSON.parse(redisValue);
                        cacheConfig.redis.stats.hits++;
                        cacheConfig.redis.stats.totalOperations++;
                        cacheConfig.statistics.totalHits++;
                    } else {
                        cacheConfig.redis.stats.misses++;
                        cacheConfig.redis.stats.totalOperations++;
                        cacheConfig.statistics.totalMisses++;
                    }
                    break;
                    
                case 'hybrid':
                    // Try memory first
                    value = cacheConfig.memory.instance.get(cacheKey);
                    if (value !== undefined) {
                        fromMemory = true;
                        cacheConfig.memory.stats.hits++;
                        cacheConfig.statistics.totalHits++;
                        logger.debug(`Cache hit (memory): ${cacheKey}`);
                    } else {
                        // Try Redis
                        if (cacheConfig.redis.connected) {
                            const redisValue = await cacheConfig.redis.client.get(cacheKey);
                            if (redisValue) {
                                value = JSON.parse(redisValue);
                                cacheConfig.redis.stats.hits++;
                                cacheConfig.redis.stats.totalOperations++;
                                cacheConfig.statistics.totalHits++;
                                
                                // Store in memory for faster access next time
                                cacheConfig.memory.instance.set(cacheKey, value, cacheConfig.hybrid.memoryTTL);
                                logger.debug(`Cache hit (redis): ${cacheKey}`);
                            } else {
                                cacheConfig.redis.stats.misses++;
                                cacheConfig.redis.stats.totalOperations++;
                                cacheConfig.statistics.totalMisses++;
                            }
                        } else {
                            cacheConfig.statistics.totalMisses++;
                        }
                    }
                    break;
                    
                case 'memory':
                default:
                    value = cacheConfig.memory.instance.get(cacheKey);
                    if (value !== undefined) {
                        cacheConfig.memory.stats.hits++;
                        cacheConfig.statistics.totalHits++;
                    } else {
                        cacheConfig.memory.stats.misses++;
                        cacheConfig.statistics.totalMisses++;
                    }
                    break;
            }
            
            if (value === undefined || value === null) {
                logger.debug(`Cache miss: ${cacheKey}`);
                return null;
            }
            
            return value;
        } catch (error) {
            logger.error(`Cache get error for key ${key}: ${error.message}`);
            return null;
        }
    },
    
    // Delete cache key
    del: async (key) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
            
            cacheConfig.statistics.totalOperations++;
            cacheConfig.statistics.totalDeletes++;
            
            switch (cacheConfig.type) {
                case 'redis':
                    await cacheConfig.redis.client.del(cacheKey);
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    cacheConfig.memory.instance.del(cacheKey);
                    if (cacheConfig.redis.connected) {
                        await cacheConfig.redis.client.del(cacheKey);
                    }
                    break;
                    
                case 'memory':
                default:
                    cacheConfig.memory.instance.del(cacheKey);
                    break;
            }
            
            logger.debug(`Cache deleted: ${cacheKey}`);
            return true;
        } catch (error) {
            logger.error(`Cache delete error for key ${key}: ${error.message}`);
            return false;
        }
    },
    
    // Check if key exists
    has: async (key) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
            
            cacheConfig.statistics.totalOperations++;
            
            let exists = false;
            
            switch (cacheConfig.type) {
                case 'redis':
                    const result = await cacheConfig.redis.client.exists(cacheKey);
                    exists = result === 1;
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    exists = cacheConfig.memory.instance.has(cacheKey);
                    if (!exists && cacheConfig.redis.connected) {
                        const result = await cacheConfig.redis.client.exists(cacheKey);
                        exists = result === 1;
                    }
                    break;
                    
                case 'memory':
                default:
                    exists = cacheConfig.memory.instance.has(cacheKey);
                    break;
            }
            
            return exists;
        } catch (error) {
            logger.error(`Cache has error for key ${key}: ${error.message}`);
            return false;
        }
    },
    
    // Get multiple keys
    mget: async (keys) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const cacheKeys = keys.map(key => key.startsWith('cache:') ? key : `cache:${key}`);
            
            cacheConfig.statistics.totalOperations++;
            
            let values = [];
            
            switch (cacheConfig.type) {
                case 'redis':
                    const redisValues = await cacheConfig.redis.client.mget(cacheKeys);
                    values = redisValues.map(v => v ? JSON.parse(v) : null);
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    values = cacheConfig.memory.instance.mget(cacheKeys);
                    // Fill missing values from Redis
                    if (cacheConfig.redis.connected) {
                        for (let i = 0; i < values.length; i++) {
                            if (values[i] === undefined) {
                                const redisValue = await cacheConfig.redis.client.get(cacheKeys[i]);
                                if (redisValue) {
                                    values[i] = JSON.parse(redisValue);
                                    // Store in memory
                                    cacheConfig.memory.instance.set(cacheKeys[i], values[i], cacheConfig.hybrid.memoryTTL);
                                }
                            }
                        }
                    }
                    break;
                    
                case 'memory':
                default:
                    values = cacheConfig.memory.instance.mget(cacheKeys);
                    break;
            }
            
            return values;
        } catch (error) {
            logger.error(`Cache mget error: ${error.message}`);
            return keys.map(() => null);
        }
    },
    
    // Set multiple keys
    mset: async (keyValuePairs, ttl = null) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const ttlSeconds = ttl || cacheConfig.memory.options.stdTTL;
            
            cacheConfig.statistics.totalOperations++;
            cacheConfig.statistics.totalSets += keyValuePairs.length;
            
            switch (cacheConfig.type) {
                case 'redis':
                    const pipeline = cacheConfig.redis.client.pipeline();
                    keyValuePairs.forEach(([key, value]) => {
                        const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
                        if (ttlSeconds > 0) {
                            pipeline.setex(cacheKey, ttlSeconds, JSON.stringify(value));
                        } else {
                            pipeline.set(cacheKey, JSON.stringify(value));
                        }
                    });
                    await pipeline.exec();
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    keyValuePairs.forEach(([key, value]) => {
                        const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
                        cacheConfig.memory.instance.set(cacheKey, value, cacheConfig.hybrid.memoryTTL);
                    });
                    
                    if (cacheConfig.redis.connected) {
                        const pipeline = cacheConfig.redis.client.pipeline();
                        keyValuePairs.forEach(([key, value]) => {
                            const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
                            if (ttlSeconds > 0) {
                                pipeline.setex(cacheKey, ttlSeconds, JSON.stringify(value));
                            } else {
                                pipeline.set(cacheKey, JSON.stringify(value));
                            }
                        });
                        await pipeline.exec();
                    }
                    break;
                    
                case 'memory':
                default:
                    keyValuePairs.forEach(([key, value]) => {
                        const cacheKey = key.startsWith('cache:') ? key : `cache:${key}`;
                        cacheConfig.memory.instance.set(cacheKey, value, ttlSeconds);
                    });
                    break;
            }
            
            return true;
        } catch (error) {
            logger.error(`Cache mset error: ${error.message}`);
            return false;
        }
    },
    
    // Delete multiple keys
    mdel: async (keys) => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            const cacheKeys = keys.map(key => key.startsWith('cache:') ? key : `cache:${key}`);
            
            cacheConfig.statistics.totalOperations++;
            cacheConfig.statistics.totalDeletes += keys.length;
            
            switch (cacheConfig.type) {
                case 'redis':
                    await cacheConfig.redis.client.del(cacheKeys);
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    cacheConfig.memory.instance.del(cacheKeys);
                    if (cacheConfig.redis.connected) {
                        await cacheConfig.redis.client.del(cacheKeys);
                    }
                    break;
                    
                case 'memory':
                default:
                    cacheConfig.memory.instance.del(cacheKeys);
                    break;
            }
            
            return true;
        } catch (error) {
            logger.error(`Cache mdel error: ${error.message}`);
            return false;
        }
    },
    
    // Clear all cache
    clear: async (pattern = 'cache:*') => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            cacheConfig.statistics.totalOperations++;
            cacheConfig.statistics.totalClears++;
            
            switch (cacheConfig.type) {
                case 'redis':
                    if (pattern === '*') {
                        await cacheConfig.redis.client.flushall();
                    } else {
                        const keys = await cacheConfig.redis.client.keys(pattern);
                        if (keys.length > 0) {
                            await cacheConfig.redis.client.del(keys);
                        }
                    }
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    if (pattern === '*') {
                        cacheConfig.memory.instance.flushAll();
                        if (cacheConfig.redis.connected) {
                            await cacheConfig.redis.client.flushall();
                        }
                    } else {
                        // Clear memory cache
                        const memoryKeys = cacheConfig.memory.instance.keys();
                        const keysToDelete = memoryKeys.filter(key => key.match(new RegExp(pattern.replace('*', '.*'))));
                        cacheConfig.memory.instance.del(keysToDelete);
                        
                        // Clear Redis cache
                        if (cacheConfig.redis.connected) {
                            const redisKeys = await cacheConfig.redis.client.keys(pattern);
                            if (redisKeys.length > 0) {
                                await cacheConfig.redis.client.del(redisKeys);
                            }
                        }
                    }
                    break;
                    
                case 'memory':
                default:
                    if (pattern === '*') {
                        cacheConfig.memory.instance.flushAll();
                    } else {
                        const keys = cacheConfig.memory.instance.keys();
                        const keysToDelete = keys.filter(key => key.match(new RegExp(pattern.replace('*', '.*'))));
                        cacheConfig.memory.instance.del(keysToDelete);
                    }
                    break;
            }
            
            logger.info(`Cache cleared with pattern: ${pattern}`);
            return true;
        } catch (error) {
            logger.error(`Cache clear error: ${error.message}`);
            return false;
        }
    },
    
    // Get cache keys by pattern
    keys: async (pattern = 'cache:*') => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            cacheConfig.statistics.totalOperations++;
            
            let keys = [];
            
            switch (cacheConfig.type) {
                case 'redis':
                    keys = await cacheConfig.redis.client.keys(pattern);
                    cacheConfig.redis.stats.totalOperations++;
                    break;
                    
                case 'hybrid':
                    const memoryKeys = cacheConfig.memory.instance.keys();
                    const filteredMemoryKeys = memoryKeys.filter(key => key.match(new RegExp(pattern.replace('*', '.*'))));
                    
                    if (cacheConfig.redis.connected) {
                        const redisKeys = await cacheConfig.redis.client.keys(pattern);
                        keys = [...new Set([...filteredMemoryKeys, ...redisKeys])];
                    } else {
                        keys = filteredMemoryKeys;
                    }
                    break;
                    
                case 'memory':
                default:
                    const allKeys = cacheConfig.memory.instance.keys();
                    keys = allKeys.filter(key => key.match(new RegExp(pattern.replace('*', '.*'))));
                    break;
            }
            
            return keys;
        } catch (error) {
            logger.error(`Cache keys error: ${error.message}`);
            return [];
        }
    },
    
    // Get cache statistics
    stats: async () => {
        try {
            if (!cacheConfig.initialized) {
                await initializeCache();
            }
            
            let redisInfo = null;
            if (cacheConfig.type === 'redis' || cacheConfig.type === 'hybrid') {
                if (cacheConfig.redis.connected) {
                    redisInfo = await cacheConfig.redis.client.info();
                }
            }
            
            const memoryStats = cacheConfig.memory.stats;
            const redisStats = cacheConfig.redis.stats;
            const overallStats = cacheConfig.statistics;
            
            const uptime = overallStats.startTime 
                ? Math.floor((new Date() - overallStats.startTime) / 1000)
                : 0;
            
            const hitRate = overallStats.totalOperations > 0
                ? (overallStats.totalHits / overallStats.totalOperations) * 100
                : 0;
            
            return {
                type: cacheConfig.type,
                initialized: cacheConfig.initialized,
                uptime,
                statistics: {
                    totalOperations: overallStats.totalOperations,
                    totalHits: overallStats.totalHits,
                    totalMisses: overallStats.totalMisses,
                    totalSets: overallStats.totalSets,
                    totalDeletes: overallStats.totalDeletes,
                    totalClears: overallStats.totalClears,
                    hitRate: hitRate.toFixed(2) + '%'
                },
                memory: cacheConfig.type !== 'redis' ? {
                    keys: memoryStats.keys || 0,
                    hits: memoryStats.hits || 0,
                    misses: memoryStats.misses || 0,
                    ksize: memoryStats.ksize || 0,
                    vsize: memoryStats.vsize || 0,
                    hitRate: memoryStats.hits + memoryStats.misses > 0 
                        ? ((memoryStats.hits / (memoryStats.hits + memoryStats.misses)) * 100).toFixed(2) + '%'
                        : '0%'
                } : null,
                redis: (cacheConfig.type === 'redis' || cacheConfig.type === 'hybrid') ? {
                    connected: cacheConfig.redis.connected,
                    connectedSince: cacheConfig.redis.stats.connectedSince,
                    hits: redisStats.hits,
                    misses: redisStats.misses,
                    totalOperations: redisStats.totalOperations,
                    lastError: redisStats.lastError,
                    info: redisInfo ? redisInfo.split('\n').slice(0, 20).join('\n') : null
                } : null,
                configuration: {
                    ttl: cacheConfig.ttl,
                    prefixes: cacheConfig.prefixes
                }
            };
        } catch (error) {
            logger.error(`Cache stats error: ${error.message}`);
            return {
                error: error.message,
                type: cacheConfig.type,
                initialized: cacheConfig.initialized
            };
        }
    },
    
    // Reset cache statistics
    resetStats: () => {
        cacheConfig.statistics = {
            totalOperations: 0,
            totalHits: 0,
            totalMisses: 0,
            totalSets: 0,
            totalDeletes: 0,
            totalClears: 0,
            startTime: new Date()
        };
        
        if (cacheConfig.memory.instance) {
            const stats = cacheConfig.memory.instance.getStats();
            cacheConfig.memory.stats = { ...stats };
        }
        
        cacheConfig.redis.stats = {
            hits: 0,
            misses: 0,
            totalOperations: 0,
            lastError: null,
            connectedSince: cacheConfig.redis.connected ? new Date() : null
        };
        
        logger.info('Cache statistics reset');
        return cacheConfig.statistics;
    },
    
    // Cache middleware for Express
    middleware: (options = {}) => {
        return async (req, res, next) => {
            // Skip caching for non-GET requests
            if (req.method !== 'GET') {
                return next();
            }
            
            // Skip caching for authenticated routes if specified
            if (options.skipAuthenticated && req.user) {
                return next();
            }
            
            // Generate cache key from request
            const cacheKey = `api:${req.originalUrl}:${JSON.stringify(req.query)}:${req.user?.id || 'anonymous'}`;
            
            // Try to get from cache
            const cachedData = await cacheOperations.get(cacheKey);
            
            if (cachedData) {
                logger.debug(`Cache hit for API: ${req.originalUrl}`);
                
                // Set cache header
                res.setHeader('X-Cache', 'HIT');
                res.setHeader('X-Cache-Key', cacheKey);
                
                return res.json(cachedData);
            }
            
            // Cache miss - override res.json to cache response
            const originalJson = res.json;
            
            res.json = function(data) {
                // Only cache successful responses
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const ttl = options.ttl || cacheConfig.ttl.medium;
                    cacheOperations.set(cacheKey, data, ttl).catch(err => {
                        logger.error(`Cache set error in middleware: ${err.message}`);
                    });
                }
                
                // Set cache header
                res.setHeader('X-Cache', 'MISS');
                res.setHeader('X-Cache-Key', cacheKey);
                
                return originalJson.call(this, data);
            };
            
            next();
        };
    }
};

// Check cache health
const checkCacheHealth = async () => {
    try {
        if (!cacheConfig.initialized) {
            await initializeCache();
        }
        
        const health = {
            type: cacheConfig.type,
            initialized: cacheConfig.initialized,
            memory: null,
            redis: null,
            overall: 'healthy'
        };
        
        // Test memory cache
        if (cacheConfig.type !== 'redis') {
            const testKey = 'health:test';
            const testValue = { timestamp: Date.now(), status: 'ok' };
            
            cacheConfig.memory.instance.set(testKey, testValue, 10);
            const retrieved = cacheConfig.memory.instance.get(testKey);
            
            health.memory = {
                healthy: retrieved !== undefined,
                keys: cacheConfig.memory.instance.keys().length,
                stats: cacheConfig.memory.stats
            };
            
            if (!health.memory.healthy) {
                health.overall = 'unhealthy';
            }
        }
        
        // Test Redis cache
        if (cacheConfig.type === 'redis' || cacheConfig.type === 'hybrid') {
            if (cacheConfig.redis.connected) {
                const testKey = 'health:test';
                const testValue = JSON.stringify({ timestamp: Date.now(), status: 'ok' });
                
                await cacheConfig.redis.client.setex(testKey, 10, testValue);
                const retrieved = await cacheConfig.redis.client.get(testKey);
                
                health.redis = {
                    connected: true,
                    healthy: retrieved !== null,
                    info: await cacheConfig.redis.client.info('server')
                };
                
                if (!health.redis.healthy) {
                    health.overall = 'unhealthy';
                }
            } else {
                health.redis = {
                    connected: false,
                    healthy: false,
                    error: 'Redis not connected'
                };
                
                if (cacheConfig.type === 'redis') {
                    health.overall = 'unhealthy';
                }
            }
        }
        
        return health;
    } catch (error) {
        logger.error(`Check cache health error: ${error.message}`);
        return {
            type: cacheConfig.type,
            initialized: cacheConfig.initialized,
            overall: 'unhealthy',
            error: error.message
        };
    }
};

// Export configuration and operations
module.exports = {
    cacheConfig,
    initializeCache,
    getCache,
    ...cacheOperations,
    checkCacheHealth
};