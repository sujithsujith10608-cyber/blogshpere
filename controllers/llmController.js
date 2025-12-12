const LLM = require('../models/llmModel');
const geminiModel = require('../config/gemini');

// Generate content using LLM
exports.generateContent = async (req, res) => {
  try {
    const { prompt, userId, tone, language, contentLength, temperature, maxTokens, blogId } = req.body;

    // Validation
    if (!prompt || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide prompt and userId',
      });
    }

    // Create enhanced prompt with tone and content length
    const enhancedPrompt = `
      Generate ${contentLength || 'medium'} length content in ${tone || 'professional'} tone and ${language || 'english'} language.
      Original prompt: ${prompt}
    `;

    // Call Gemini API
    let generatedContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const result = await geminiModel.generateContent(enhancedPrompt);
      const response = await result.response;
      generatedContent = response.text();

      // Estimate tokens (rough approximation: 4 chars = 1 token)
      inputTokens = Math.ceil(enhancedPrompt.length / 4);
      outputTokens = Math.ceil(generatedContent.length / 4);
    } catch (geminiError) {
      console.error('Gemini API Error:', geminiError);
      return res.status(500).json({
        success: false,
        message: 'Error calling Gemini API',
        error: geminiError.message,
      });
    }

    // Save to database
    const llmRecord = new LLM({
      prompt,
      user: userId,
      blog: blogId || null,
      tone: tone || 'professional',
      language: language || 'english',
      contentLength: contentLength || 'medium',
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 2000,
      generatedContent,
      model: 'gemini-pro',
      tokens: {
        inputTokens,
        outputTokens,
      },
    });

    await llmRecord.save();

    res.status(201).json({
      success: true,
      message: 'Content generated successfully',
      data: llmRecord,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating content',
      error: error.message,
    });
  }
};

// Get all generated contents for a user
exports.getUserGenerations = async (req, res) => {
  try {
    const { userId } = req.params;

    const generations = await LLM.find({ user: userId })
      .populate('user', 'name email')
      .populate('blog', 'title')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: generations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching generations',
      error: error.message,
    });
  }
};

// Get generation by ID
exports.getGenerationById = async (req, res) => {
  try {
    const generation = await LLM.findById(req.params.id)
      .populate('user', 'name email')
      .populate('blog', 'title');

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found',
      });
    }

    res.status(200).json({
      success: true,
      data: generation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching generation',
      error: error.message,
    });
  }
};

// Update generated content
exports.updateGeneration = async (req, res) => {
  try {
    const { generatedContent, tone, temperature, contentLength } = req.body;

    let generation = await LLM.findById(req.params.id);

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found',
      });
    }

    generation = await LLM.findByIdAndUpdate(
      req.params.id,
      {
        generatedContent,
        tone: tone || generation.tone,
        temperature: temperature || generation.temperature,
        contentLength: contentLength || generation.contentLength,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Generation updated successfully',
      data: generation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating generation',
      error: error.message,
    });
  }
};

// Delete generation
exports.deleteGeneration = async (req, res) => {
  try {
    const generation = await LLM.findByIdAndDelete(req.params.id);

    if (!generation) {
      return res.status(404).json({
        success: false,
        message: 'Generation not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Generation deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting generation',
      error: error.message,
    });
  }
};

// Get generation history/stats
exports.getGenerationStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = require('mongoose');

    const stats = await LLM.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalGenerations: { $sum: 1 },
          totalInputTokens: { $sum: '$tokens.inputTokens' },
          totalOutputTokens: { $sum: '$tokens.outputTokens' },
          averageTemperature: { $avg: '$temperature' },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: stats[0] || {
        totalGenerations: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        averageTemperature: 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message,
    });
  }
};
