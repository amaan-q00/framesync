import { Router } from 'express';
import { 
  initializeMultipart, 
  signPart, 
  completeMultipart,
  getMyWorks,
  getSharedWithMe,
  getVideo,
  getManifest,
  shareVideo,
  removeShare,
  removeMyShare,
  updatePublicAccess,
  getVideoShares,
  deleteVideo
} from '../controllers/videoController';
import { 
  addComment, 
  getComments, 
  deleteComment 
} from '../controllers/commentController';
import { protect, optionalAuth } from '../middleware/auth';

const router = Router();

router.post('/initialize', protect, initializeMultipart);
router.post('/sign-part', protect, signPart);
router.post('/complete', protect, completeMultipart);

router.get('/my-works', protect, getMyWorks);
router.get('/shared-with-me', protect, getSharedWithMe);

router.get('/:id/manifest.m3u8', optionalAuth, getManifest);
router.get('/:id', optionalAuth, getVideo);

router.get('/:id/shares', protect, getVideoShares);
router.post('/:id/share', protect, shareVideo);
router.delete('/:id/share/me', protect, removeMyShare);
router.delete('/:id/share', protect, removeShare);
router.post('/:id/public', protect, updatePublicAccess);

router.delete('/:id', protect, deleteVideo);

router.get('/:id/comments', optionalAuth, getComments);
router.post('/:id/comments', optionalAuth, addComment);
router.delete('/:id/comments/:commentId', optionalAuth, deleteComment);

export default router;