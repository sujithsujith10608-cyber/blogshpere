const express = require('express');
const recommendationController = require('../controllers/recommendationController');

const router = express.Router();

// Recommendation routes
router.get('/generate/:userId', recommendationController.generateRecommendations);
router.get('/list/:userId', recommendationController.getRecommendations);
router.get('/trending', recommendationController.getTrendingCreators);
router.get('/reason/:userId', recommendationController.getRecommendationsByReason);
router.get('/stats/:userId', recommendationController.getRecommendationStats);

// Recommendation interaction routes
router.put('/:recommendationId/view', recommendationController.viewRecommendation);
router.post('/:userId/follow', recommendationController.followFromRecommendation);
router.delete('/:recommendationId/dismiss', recommendationController.dismissRecommendation);

module.exports = router;
