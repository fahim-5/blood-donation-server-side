import express from 'express';
import {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost
} from '../controllers/postController.js';
import { protect } from '../middleware/auth.js';
import { validatePost } from '../middleware/validation.js';

const router = express.Router();

router.get('/', getPosts);
router.get('/:id', getPost);

// Protected routes
router.use(protect);

router.post('/', validatePost, createPost);
router.put('/:id', validatePost, updatePost);
router.delete('/:id', deletePost);

export default router;