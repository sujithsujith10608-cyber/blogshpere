const Recommendation = require('../models/recommendationModel');
const Profile = require('../models/profileModel');
const User = require('../models/userModel');
const Blog = require('../models/blogModel');

// Calculate recommendation score
const calculateScore = (userProfile, recommendedProfile, mutualFollowersCount, commonTags = 0) => {
  let score = 0;

  // Mutual followers factor (max 30 points)
  score += Math.min(mutualFollowersCount * 5, 30);

  // Popularity factor (max 25 points)
  score += Math.min(recommendedProfile.followers.length * 0.5, 25);

  // Common interests/tags (max 25 points)
  score += Math.min(commonTags * 5, 25);

  // Engagement factor (max 20 points)
  const engagementRate = (recommendedProfile.totalLikes / Math.max(recommendedProfile.totalBlogs, 1)) / 10;
  score += Math.min(engagementRate, 20);

  return Math.round(score);
};

// Get mutual followers
const getMutualFollowers = (userFollowers, recommendedFollowers) => {
  const userFollowingSet = new Set(userFollowers.map((f) => f.toString()));
  const mutual = recommendedFollowers.filter((f) => userFollowingSet.has(f.toString()));
  return mutual.length;
};

// Generate recommendations for a user
exports.generateRecommendations = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    // Get user profile
    const userProfile = await Profile.findOne({ user: userId })
      .populate('following', '_id');

    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found',
      });
    }

    // Get user's following IDs
    const userFollowingIds = userProfile.following.map((f) => f._id);
    userFollowingIds.push(mongoose.Types.ObjectId(userId)); // Exclude self

    // Get users who are NOT already followed
    const suggestedUsers = await Profile.find({
      user: { $nin: userFollowingIds },
    })
      .populate('user', 'name email')
      .populate('followers', '_id')
      .limit(limit * 2);

    const recommendations = [];

    for (const profile of suggestedUsers) {
      // Calculate mutual followers
      const mutualFollowers = getMutualFollowers(userProfile.followers, profile.followers);

      // Calculate common tags/interests
      const userBlogs = await Blog.find({ author: userId });
      const recommendedBlogs = await Blog.find({ author: profile.user._id });
      const userTags = new Set(userBlogs.flatMap((b) => b.tags));
      const recommendedTags = recommendedBlogs.flatMap((b) => b.tags);
      const commonTags = recommendedTags.filter((tag) => userTags.has(tag)).length;

      // Calculate score
      let reason = 'popular_creator';
      if (mutualFollowers > 0) reason = 'mutual_followers';
      if (commonTags > 0) reason = 'shared_tags';
      if (profile.location === userProfile.location && profile.location) reason = 'same_location';

      const score = calculateScore(userProfile, profile, mutualFollowers, commonTags);

      recommendations.push({
        user: userId,
        recommendedUser: profile.user._id,
        reason,
        score,
        mutualFollowers,
        isViewed: false,
        isFollowed: false,
      });
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    // Delete old recommendations
    await Recommendation.deleteMany({ user: userId });

    // Save new recommendations
    const savedRecommendations = await Recommendation.insertMany(recommendations.slice(0, limit));

    res.status(200).json({
      success: true,
      message: 'Recommendations generated successfully',
      count: savedRecommendations.length,
      data: savedRecommendations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating recommendations',
      error: error.message,
    });
  }
};

// Get recommendations for user (Instagram-style feed)
exports.getRecommendations = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const recommendations = await Recommendation.find({ user: userId })
      .populate('recommendedUser', 'name email')
      .populate({
        path: 'recommendedUser',
        populate: {
          path: 'profilePicture',
          model: 'Profile',
        },
      })
      .sort({ score: -1 })
      .limit(limit)
      .skip(offset);

    const total = await Recommendation.countDocuments({ user: userId });

    res.status(200).json({
      success: true,
      data: recommendations,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recommendations',
      error: error.message,
    });
  }
};

// Mark recommendation as viewed
exports.viewRecommendation = async (req, res) => {
  try {
    const { recommendationId } = req.params;

    const recommendation = await Recommendation.findByIdAndUpdate(
      recommendationId,
      {
        isViewed: true,
        viewedAt: new Date(),
      },
      { new: true }
    );

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Recommendation marked as viewed',
      data: recommendation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error viewing recommendation',
      error: error.message,
    });
  }
};

// Follow from recommendation
exports.followFromRecommendation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { recommendationId, recommendedUserId } = req.body;

    if (!recommendedUserId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide recommendedUserId',
      });
    }

    // Update recommendation as followed
    const recommendation = await Recommendation.findByIdAndUpdate(
      recommendationId,
      { isFollowed: true },
      { new: true }
    );

    // Get user profiles
    let userProfile = await Profile.findOne({ user: userId });
    let recommendedProfile = await Profile.findOne({ user: recommendedUserId });

    if (!userProfile) {
      userProfile = new Profile({ user: userId });
      await userProfile.save();
    }

    if (!recommendedProfile) {
      recommendedProfile = new Profile({ user: recommendedUserId });
      await recommendedProfile.save();
    }

    // Add follower relationship
    if (!userProfile.following.includes(recommendedUserId)) {
      userProfile.following.push(recommendedUserId);
      await userProfile.save();
    }

    if (!recommendedProfile.followers.includes(userId)) {
      recommendedProfile.followers.push(userId);
      await recommendedProfile.save();
    }

    res.status(200).json({
      success: true,
      message: 'User followed from recommendation',
      data: recommendation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error following from recommendation',
      error: error.message,
    });
  }
};

// Get trending creators
exports.getTrendingCreators = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const trendingCreators = await Profile.find()
      .populate('user', 'name email')
      .sort({ followers: -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      message: 'Trending creators fetched',
      data: trendingCreators,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching trending creators',
      error: error.message,
    });
  }
};

// Get recommendations by reason
exports.getRecommendationsByReason = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Please provide reason query parameter',
      });
    }

    const recommendations = await Recommendation.find({
      user: userId,
      reason,
    })
      .populate('recommendedUser', 'name email')
      .sort({ score: -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recommendations by reason',
      error: error.message,
    });
  }
};

// Dismiss recommendation
exports.dismissRecommendation = async (req, res) => {
  try {
    const { recommendationId } = req.params;

    await Recommendation.findByIdAndDelete(recommendationId);

    res.status(200).json({
      success: true,
      message: 'Recommendation dismissed',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error dismissing recommendation',
      error: error.message,
    });
  }
};

// Get recommendation stats for user
exports.getRecommendationStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await Recommendation.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalRecommendations: { $sum: 1 },
          viewedRecommendations: {
            $sum: { $cond: ['$isViewed', 1, 0] },
          },
          followedFromRec: {
            $sum: { $cond: ['$isFollowed', 1, 0] },
          },
          averageScore: { $avg: '$score' },
          byReason: {
            $push: '$reason',
          },
        },
      },
      {
        $project: {
          totalRecommendations: 1,
          viewedRecommendations: 1,
          followedFromRec: 1,
          averageScore: { $round: ['$averageScore', 2] },
          viewRate: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$viewedRecommendations', '$totalRecommendations'] },
                  100,
                ],
              },
              2,
            ],
          },
          followRate: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$followedFromRec', '$totalRecommendations'] },
                  100,
                ],
              },
              2,
            ],
          },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: stats[0] || {
        totalRecommendations: 0,
        viewedRecommendations: 0,
        followedFromRec: 0,
        averageScore: 0,
        viewRate: 0,
        followRate: 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching recommendation stats',
      error: error.message,
    });
  }
};
