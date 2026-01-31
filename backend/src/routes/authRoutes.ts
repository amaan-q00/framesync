import { Router } from 'express';
import { register, login, googleLogin, logout } from '../controllers/authController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/logout', logout);

export default router;