const express = require('express');
const followSuggestionController = require('../controllers/followSuggestionController');

const router = express.Router();

// Follow suggestion routes
router.get('/generate/:userId', followSuggestionController.generateLikeBasedSuggestions);
router.get('/list/:userId', followSuggestionController.getFollowSuggestions);
router.get('/type/:userId', followSuggestionController.getSuggestionsByType);
router.get('/stats/:userId', followSuggestionController.getSuggestionStats);

// Suggestion interaction routes
router.put('/:suggestionId/view', followSuggestionController.viewSuggestion);
router.post('/:userId/follow', followSuggestionController.followFromSuggestion);
router.put('/:suggestionId/dismiss', followSuggestionController.dismissSuggestion);

module.exports = router;
