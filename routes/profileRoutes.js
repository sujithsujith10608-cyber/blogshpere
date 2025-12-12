const express = require('express');
const upload = require('../config/multer');
const profileController = require('../controllers/profileController');

const router = express.Router();

// Profile routes - more specific routes first
router.get('/:userId/followers', profileController.getFollowers);
router.get('/:userId/following', profileController.getFollowing);
router.get('/:userId/stats', profileController.getProfileStats);
router.post('/:userId/picture', upload.single('profilePicture'), profileController.uploadProfilePicture);
router.post('/:userId/follow', profileController.followUser);
router.post('/:userId/unfollow', profileController.unfollowUser);

// General profile routes - less specific routes last
router.get('/details/:userId', profileController.getProfileById);
router.put('/:userId', upload.single('profilePicture'), profileController.updateProfile);
router.get('/:userId', profileController.getOrCreateProfile);

module.exports = router;
