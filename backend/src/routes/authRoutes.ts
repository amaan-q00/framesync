import { Router } from 'express';
import { register, login, googleLogin, googleRedirect, googleCallback, logout, getMe, deleteMe } from '../controllers/authController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get('/google', googleRedirect);
router.get('/google/callback', googleCallback);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.delete('/me', protect, deleteMe);

export default router;