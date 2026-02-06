import { Router } from 'express';
import { getProfile, updateProfile, uploadAvatar } from '../controllers/profileController';
import { protect } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';

const router = Router();

// All profile routes require authentication
router.use(protect);

router.get('/me', getProfile);
router.put('/me', updateProfile);
router.post('/avatar', uploadSingle('avatar'), uploadAvatar);

export default router;
