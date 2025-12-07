import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import postRoutes from './postRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);

// Health check route (directly in index.js instead of separate file)
router.get('/health', async (req, res) => {
  try {
    const healthCheck = {
      success: true,
      message: '✅ Service is healthy',
      timestamp: new Date().toISOString(),
      uptime: `${process.uptime().toFixed(2)} seconds`,
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