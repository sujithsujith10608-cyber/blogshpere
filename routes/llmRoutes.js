const express = require('express');
const llmController = require('../controllers/llmController');

const router = express.Router();

// LLM generation routes
router.post('/generate', llmController.generateContent);
router.get('/user/:userId', llmController.getUserGenerations);
router.get('/:id', llmController.getGenerationById);
router.put('/:id', llmController.updateGeneration);
router.delete('/:id', llmController.deleteGeneration);
router.get('/stats/:userId', llmController.getGenerationStats);

module.exports = router;
