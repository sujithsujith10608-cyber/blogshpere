const FollowSuggestion = require('../models/followSuggestionModel');
const Profile = require('../models/profileModel');
const Blog = require('../models/blogModel');
const User = require('../models/userModel');

// Calculate suggestion score based on common liked blogs
const calculateSuggestionScore = (commonLikesCount, userFollowers, suggestedFollowers) => {
  let score = 0;

  // Common likes factor (max 40 points)
  score += Math.min(commonLikesCount * 10, 40);

  // Follower popularity factor (max 30 points)
  score += Math.min(suggestedFollowers * 0.5, 30);

  // Social proof factor (max 30 points) - mutual connections
  const userFollowingSet = new Set(userFollowers.map((f) => f.toString()));
  const mutualCount = suggestedFollowers.filter((f) => userFollowingSet.has(f.toString())).length;
  score += Math.min(mutualCount * 10, 30);

  return Math.round(score);
};

// Generate follow suggestions based on likes
exports.generateLikeBasedSuggestions = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    // Get user's liked blogs
    const userLikedBlogs = await Blog.find({
      likes: mongoose.Types.ObjectId(userId),
    }).select('_id author likes');

    if (userLikedBlogs.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No liked blogs found. Follow more blogs to get suggestions.',
        data: [],
      });
    }

    // Get user profile
    const userProfile = await Profile.findOne({ user: userId })
      .populate('following', '_id');

    const userFollowingIds = userProfile?.following.map((f) => f._id) || [];
    userFollowingIds.push(mongoose.Types.ObjectId(userId));

    // Find users who also liked the same blogs
    const suggestedUsers = {};

    for (const blog of userLikedBlogs) {
      for (const liker of blog.likes) {
        if (!userFollowingIds.some((id) => id.equals(liker))) {
          if (!suggestedUsers[liker]) {
            suggestedUsers[liker] = {
              likedBlogIds: [],
              commonLikeCount: 0,
            };
          }
          suggestedUsers[liker].likedBlogIds.push(blog._id);
          suggestedUsers[liker].commonLikeCount += 1;
        }
      }
    }

    // Filter users with at least 1 common like
    const suggestions = [];

    for (const [suggestedUserId, data] of Object.entries(suggestedUsers)) {
      if (data.commonLikeCount >= 1) {
        const suggestedProfile = await Profile.findOne({
          user: suggestedUserId,
        }).populate('followers', '_id');

        if (suggestedProfile) {
          const score = calculateSuggestionScore(
            data.commonLikeCount,
            userProfile?.followers || [],
            suggestedProfile.followers || []
          );

          suggestions.push({
            user: userId,
            suggestedUser: suggestedUserId,
            suggestionType: 'liked_same_blog',
            sharedBlogLikes: data.likedBlogIds,
            commonLikedCount: data.commonLikeCount,
            confidenceScore: score,
            isViewed: false,
            isFollowed: false,
            isDismissed: false,
          });
        }
      }
    }

    // Sort by common likes count
    suggestions.sort((a, b) => b.commonLikedCount - a.commonLikedCount);

    // Delete old suggestions for this user
    await FollowSuggestion.deleteMany({
      user: userId,
      suggestionType: 'liked_same_blog',
    });

    // Save new suggestions
    const savedSuggestions = await FollowSuggestion.insertMany(suggestions.slice(0, limit));

    res.status(200).json({
      success: true,
      message: 'Follow suggestions generated based on likes',
      count: savedSuggestions.length,
      data: savedSuggestions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating suggestions',
      error: error.message,
    });
  }
};

// Get follow suggestions for user
exports.getFollowSuggestions = async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const suggestions = await FollowSuggestion.find({
      user: userId,
      isDismissed: false,
      isFollowed: false,
    })
      .populate('suggestedUser', 'name email')
      .populate({
        path: 'suggestedUser',
        populate: {
          path: 'profilePicture',
          model: 'Profile',
        },
      })
      .populate('sharedBlogLikes', 'title')
      .sort({ confidenceScore: -1 })
      .limit(limit)
      .skip(offset);

    const total = await FollowSuggestion.countDocuments({
      user: userId,
      isDismissed: false,
      isFollowed: false,
    });

    res.status(200).json({
      success: true,
      data: suggestions,
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
      message: 'Error fetching suggestions',
      error: error.message,
    });
  }
};

// View suggestion
exports.viewSuggestion = async (req, res) => {
  try {
    const { suggestionId } = req.params;

    const suggestion = await FollowSuggestion.findByIdAndUpdate(
      suggestionId,
      {
        isViewed: true,
        viewedAt: new Date(),
      },
      { new: true }
    );

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        message: 'Suggestion not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Suggestion marked as viewed',
      data: suggestion,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error viewing suggestion',
      error: error.message,
    });
  }
};

// Follow from suggestion
exports.followFromSuggestion = async (req, res) => {
  try {
    const { userId } = req.params;
    const { suggestionId, suggestedUserId } = req.body;

    if (!suggestedUserId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide suggestedUserId',
      });
    }

    // Update suggestion
    const suggestion = await FollowSuggestion.findByIdAndUpdate(
      suggestionId,
      {
        isFollowed: true,
        followedAt: new Date(),
      },
      { new: true }
    );

    // Get user profiles
    let userProfile = await Profile.findOne({ user: userId });
    let suggestedProfile = await Profile.findOne({ user: suggestedUserId });

    if (!userProfile) {
      userProfile = new Profile({ user: userId });
      await userProfile.save();
    }

    if (!suggestedProfile) {
      suggestedProfile = new Profile({ user: suggestedUserId });
      await suggestedProfile.save();
    }

    // Add follow relationship
    if (!userProfile.following.includes(suggestedUserId)) {
      userProfile.following.push(suggestedUserId);
      await userProfile.save();
    }

    if (!suggestedProfile.followers.includes(userId)) {
      suggestedProfile.followers.push(userId);
      await suggestedProfile.save();
    }

    res.status(200).json({
      success: true,
      message: 'User followed from suggestion',
      data: suggestion,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error following from suggestion',
      error: error.message,
    });
  }
};

// Dismiss suggestion
exports.dismissSuggestion = async (req, res) => {
  try {
    const { suggestionId } = req.params;

    const suggestion = await FollowSuggestion.findByIdAndUpdate(
      suggestionId,
      { isDismissed: true },
      { new: true }
    );

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        message: 'Suggestion not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Suggestion dismissed',
      data: suggestion,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error dismissing suggestion',
      error: error.message,
    });
  }
};

// Get suggestion stats
exports.getSuggestionStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const stats = await FollowSuggestion.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalSuggestions: { $sum: 1 },
          viewedSuggestions: {
            $sum: { $cond: ['$isViewed', 1, 0] },
          },
          followedFromSuggestion: {
            $sum: { $cond: ['$isFollowed', 1, 0] },
          },
          dismissedSuggestions: {
            $sum: { $cond: ['$isDismissed', 1, 0] },
          },
          averageConfidenceScore: { $avg: '$confidenceScore' },
        },
      },
      {
        $project: {
          totalSuggestions: 1,
          viewedSuggestions: 1,
          followedFromSuggestion: 1,
          dismissedSuggestions: 1,
          averageConfidenceScore: { $round: ['$averageConfidenceScore', 2] },
          conversionRate: {
            $round: [
              {
                $multiply: [
                  { $divide: ['$followedFromSuggestion', '$totalSuggestions'] },
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
        totalSuggestions: 0,
        viewedSuggestions: 0,
        followedFromSuggestion: 0,
        dismissedSuggestions: 0,
        averageConfidenceScore: 0,
        conversionRate: 0,
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

// Get suggestions by type
exports.getSuggestionsByType = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Please provide type query parameter',
      });
    }

    const suggestions = await FollowSuggestion.find({
      user: userId,
      suggestionType: type,
      isDismissed: false,
    })
      .populate('suggestedUser', 'name email')
      .sort({ confidenceScore: -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching suggestions',
      error: error.message,
    });
  }
};
