import NodeCache from "node-cache";
import Redis from "ioredis";

// Initialize caches
const memoryCache = new NodeCache({
  stdTTL: 600, // Default TTL: 10 minutes
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false,
  deleteOnExpire: true,
});

let redisClient;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);
  console.log("Redis cache initialized");
} else {
  console.log("Using in-memory cache (Redis not configured)");
}

// Memory cache wrapper
const memoryCacheWrapper = {
  set: async (key, value, ttl = 600) => {
    return memoryCache.set(key, value, ttl);
  },

  get: async (key) => {
    return memoryCache.get(key);
  },

  del: async (key) => {
    return memoryCache.del(key);
  },

  has: async (key) => {
    return memoryCache.has(key);
  },

  flush: async () => {
    return memoryCache.flushAll();
  },

  keys: async () => {
    return memoryCache.keys();
  },
};

// Redis cache wrapper
const redisCacheWrapper = {
  set: async (key, value, ttl = 600) => {
    if (typeof value === "object") {
      value = JSON.stringify(value);
    }
    if (ttl) {
      return redisClient.setex(key, ttl, value);
    }
    return redisClient.set(key, value);
  },

  get: async (key) => {
    const value = await redisClient.get(key);
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },

  del: async (key) => {
    return redisClient.del(key);
  },

  has: async (key) => {
    const exists = await redisClient.exists(key);
    return exists === 1;
  },

  flush: async () => {
    return redisClient.flushall();
  },

  keys: async (pattern = "*") => {
    return redisClient.keys(pattern);
  },
};

// Use Redis if available, otherwise use memory cache
const cache = redisClient ? redisCacheWrapper : memoryCacheWrapper;

// Generate cache key from request
const generateCacheKey = (req) => {
  const { originalUrl, method, query, user, body } = req;
  const keyParts = [
    method,
    originalUrl,
    JSON.stringify(query),
    user?._id || "anonymous",
    JSON.stringify(body).slice(0, 100), // Limit body length for key
  ];

  return `cache:${keyParts.join(":")}`.replace(/[^a-zA-Z0-9:_-]/g, "_");
};

// Cache middleware for GET requests
const cacheMiddleware = (ttl = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    // Skip cache for authenticated user-specific data
    if (req.user && req.originalUrl.includes("/dashboard")) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      const cachedData = await cache.get(cacheKey);

      if (cachedData) {
        console.log(`Cache hit: ${cacheKey}`);
        return res.json(cachedData);
      }

      // Override res.json to cache response
      const originalJson = res.json;
      res.json = function (data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cache.set(cacheKey, data, ttl).catch((err) => {
            console.error("Cache set error:", err);
          });
        }
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error("Cache middleware error:", error);
      next();
    }
  };
};

// Clear cache for specific routes
const clearCacheForRoute = (pattern) => {
  return async (req, res, next) => {
    try {
      const keys = await cache.keys(`cache:${pattern}*`);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => cache.del(key)));
        console.log(
          `Cleared ${keys.length} cache entries for pattern: ${pattern}`
        );
      }
      next();
    } catch (error) {
      console.error("Clear cache error:", error);
      next();
    }
  };
};

// Clear user-specific cache
const clearUserCache = (userId) => {
  return async (req, res, next) => {
    try {
      const userPattern = `*:${userId}:*`;
      const keys = await cache.keys(userPattern);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => cache.del(key)));
      }
      next();
    } catch (error) {
      console.error("Clear user cache error:", error);
      next();
    }
  };
};

// Cache statistics middleware
const cacheStatsMiddleware = async (req, res, next) => {
  if (req.path === "/api/cache/stats" && req.method === "GET") {
    try {
      let stats = {};

      if (redisClient) {
        const info = await redisClient.info();
        const keys = await cache.keys("cache:*");
        stats = {
          type: "redis",
          totalKeys: keys.length,
          info: info.split("\r\n").slice(0, 20), // First 20 lines
        };
      } else {
        const cacheStats = memoryCache.getStats();
        const keys = memoryCache.keys();
        stats = {
          type: "memory",
          totalKeys: keys.length,
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          keys: cacheStats.keys,
          ksize: cacheStats.ksize,
          vsize: cacheStats.vsize,
        };
      }

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Cache stats error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get cache statistics",
      });
    }
  }
  next();
};

// Invalidate cache after mutations
const invalidateCache = (patterns = []) => {
  return async (req, res, next) => {
    // Store original send method
    const originalSend = res.send;

    res.send = async function (data) {
      // Only invalidate on successful mutations
      if (
        res.statusCode >= 200 &&
        res.statusCode < 300 &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
      ) {
        try {
          // Invalidate based on patterns
          for (const pattern of patterns) {
            const keys = await cache.keys(pattern);
            if (keys.length > 0) {
              await Promise.all(keys.map((key) => cache.del(key)));
              console.log(
                `Invalidated ${keys.length} cache entries for pattern: ${pattern}`
              );
            }
          }

          // Invalidate user-specific cache
          if (req.user) {
            await clearUserCache(req.user._id)(req, res, () => {});
          }
        } catch (error) {
          console.error("Cache invalidation error:", error);
        }
      }

      return originalSend.call(this, data);
    };

    next();
  };
};

// Health check for cache
const cacheHealthCheck = async () => {
  try {
    if (redisClient) {
      await redisClient.ping();
      return { healthy: true, type: "redis" };
    } else {
      // Memory cache is always healthy if Node process is running
      return { healthy: true, type: "memory" };
    }
  } catch (error) {
    return {
      healthy: false,
      type: redisClient ? "redis" : "memory",
      error: error.message,
    };
  }
};

export default {
  cache,
  cacheMiddleware,
  clearCacheForRoute,
  clearUserCache,
  cacheStatsMiddleware,
  invalidateCache,
  cacheHealthCheck,
  generateCacheKey,
  memoryCache: memoryCacheWrapper,
  redisCache: redisCacheWrapper,
};
