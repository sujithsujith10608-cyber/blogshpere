const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recommendedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: [
        'mutual_followers',
        'similar_interests',
        'popular_creator',
        'trending',
        'same_location',
        'shared_tags',
        'engagement_match',
      ],
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    mutualFollowers: {
      type: Number,
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
    viewedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Recommendation', recommendationSchema);
