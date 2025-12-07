import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    const healthCheck = {
      success: true,
      message: '✅ Service is healthy',
      timestamp: new Date().toISOString(),
      uptime: `${process.uptime().toFixed(2)} seconds`,
      database: dbStatus,
      environment: process.env.NODE_ENV || 'development'
    };

    res.status(200).json(healthCheck);
  } catch (error) {
    res.status(503).json({
      success: false,
      message: '❌ Service unhealthy',
      error: error.message
    });
  }
});

export default router;