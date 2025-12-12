const mongoose = require('mongoose');

const followSuggestionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    suggestedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    suggestionType: {
      type: String,
      enum: ['liked_same_blog', 'liked_by_followers', 'comment_interaction', 'similar_interests', 'engagement_pattern'],
    },
    sharedBlogLikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Blog',
      },
    ],
    commonLikedCount: {
      type: Number,
      default: 0,
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    isViewed: {
      type: Boolean,
      default: false,
    },
    isFollowed: {
      type: Boolean,
      default: false,
    },
    isDismissed: {
      type: Boolean,
      default: false,
    },
    viewedAt: Date,
    followedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('FollowSuggestion', followSuggestionSchema);
