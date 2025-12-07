import express from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateUser } from '../middleware/validation.js';

const router = express.Router();

router.post('/register', validateUser, register);
router.post('/login', login);
router.get('/me', protect, getMe);

export default router;