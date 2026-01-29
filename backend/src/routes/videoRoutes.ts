import { Router } from 'express';
import { initializeMultipart, signPart, completeMultipart } from '../controllers/videoController';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/initialize', protect, initializeMultipart);
router.post('/sign-part', protect, signPart);
router.post('/complete', protect, completeMultipart);

export default router;