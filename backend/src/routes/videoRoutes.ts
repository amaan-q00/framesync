import { Router } from 'express';
import { 
  initializeMultipart, 
  signPart, 
  completeMultipart,
  getMyWorks,
  getSharedWithMe,
  getVideo,
  shareVideo,
  removeShare,
  updatePublicAccess
} from '../controllers/videoController';
import { 
  addComment, 
  getComments, 
  deleteComment 
} from '../controllers/commentController'; // <--- NEW IMPORT
import { protect, optionalAuth } from '../middleware/auth';

const router = Router();

// --- UPLOAD FLOW ---
router.post('/initialize', protect, initializeMultipart);
router.post('/sign-part', protect, signPart);
router.post('/complete', protect, completeMultipart);

// --- LISTS ---
router.get('/my-works', protect, getMyWorks);
router.get('/shared-with-me', protect, getSharedWithMe);

// --- WATCHING ---
router.get('/:id', optionalAuth, getVideo);

// --- SHARING ---
router.post('/:id/share', protect, shareVideo);
router.delete('/:id/share', protect, removeShare);
router.post('/:id/public', protect, updatePublicAccess);

// --- NEW: COMMENTS & MARKERS ---
// 1. Get all comments (Public or Private)
router.get('/:id/comments', optionalAuth, getComments);

// 2. Add comment (Must verify permissions inside controller)
router.post('/:id/comments', optionalAuth, addComment);

// 3. Delete comment (Must verify permissions inside controller)
router.delete('/:id/comments/:commentId', optionalAuth, deleteComment);

export default router;