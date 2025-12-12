const Profile = require('../models/profileModel');
const cloudinary = require('../config/cloudinary');

// Create or get user profile
exports.getOrCreateProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    let profile = await Profile.findOne({ user: userId })
      .populate('user', 'name email phone address')
      .populate('followers', 'name email')
      .populate('following', 'name email');

    if (!profile) {
      profile = new Profile({ user: userId });
      await profile.save();
      profile = await profile.populate('user', 'name email phone address');
    }

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, bio, dateOfBirth, gender, location, website, socialLinks, isPublic } = req.body;

    let profile = await Profile.findOne({ user: userId });

    if (!profile) {
      profile = new Profile({ user: userId });
    }

    let profilePicture = profile.profilePicture;

    // Handle profile picture upload
    if (req.file) {
      // Delete old profile picture from Cloudinary if exists
      if (profile.profilePicture) {
        const publicId = profile.profilePicture.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy('fb-profiles/' + publicId);
      }
      profilePicture = req.file.path;
    }

    // Update profile
    profile.firstName = firstName || profile.firstName;
    profile.lastName = lastName || profile.lastName;
    profile.bio = bio || profile.bio;
    profile.profilePicture = profilePicture;
    profile.dateOfBirth = dateOfBirth || profile.dateOfBirth;
    profile.gender = gender || profile.gender;
    profile.location = location || profile.location;
    profile.website = website || profile.website;
    profile.isPublic = isPublic !== undefined ? isPublic : profile.isPublic;

    if (socialLinks) {
      profile.socialLinks = {
        twitter: socialLinks.twitter || profile.socialLinks.twitter,
        facebook: socialLinks.facebook || profile.socialLinks.facebook,
        instagram: socialLinks.instagram || profile.socialLinks.instagram,
        linkedin: socialLinks.linkedin || profile.socialLinks.linkedin,
      };
    }

    await profile.save();

    const updatedProfile = await Profile.findOne({ user: userId })
      .populate('user', 'name email phone address')
      .populate('followers', 'name email')
      .populate('following', 'name email');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message,
    });
  }
};

// Upload profile picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    let profile = await Profile.findOne({ user: userId });

    if (!profile) {
      profile = new Profile({ user: userId });
    }

    // Delete old profile picture from Cloudinary if exists
    if (profile.profilePicture) {
      const publicId = profile.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy('fb-profiles/' + publicId);
    }

    profile.profilePicture = req.file.path;
    await profile.save();

    const updatedProfile = await Profile.findOne({ user: userId })
      .populate('user', 'name email phone address');

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: updatedProfile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading profile picture',
      error: error.message,
    });
  }
};

// Get profile by username or userId
exports.getProfileById = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await Profile.findOne({ user: userId })
      .populate('user', 'name email phone address')
      .populate('followers', 'name email profilePicture')
      .populate('following', 'name email profilePicture');

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message,
    });
  }
};

// Follow user
exports.followUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { followerId } = req.body;

    if (!followerId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide followerId',
      });
    }

    if (userId === followerId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow yourself',
      });
    }

    // Get both profiles
    let userProfile = await Profile.findOne({ user: userId });
    let followerProfile = await Profile.findOne({ user: followerId });

    if (!userProfile) {
      userProfile = new Profile({ user: userId });
      await userProfile.save();
    }

    if (!followerProfile) {
      followerProfile = new Profile({ user: followerId });
      await followerProfile.save();
    }

    // Check if already following
    if (!userProfile.followers.includes(followerId)) {
      userProfile.followers.push(followerId);
      await userProfile.save();
    }

    if (!followerProfile.following.includes(userId)) {
      followerProfile.following.push(userId);
      await followerProfile.save();
    }

    const updatedProfile = await Profile.findOne({ user: userId })
      .populate('followers', 'name email');

    res.status(200).json({
      success: true,
      message: 'User followed successfully',
      data: updatedProfile,
    });

        // Broadcast real-time follow event and persist notification for the followed user
        if (global.broadcastEvent) {
          try {
            global.broadcastEvent('follow:added', { userId: userId, followerId });

            // Persist notification
            try {
              const Notification = require('../models/notificationModel');
              const actorUser = await require('../models/userModel').findById(followerId).select('name avatar');
              await Notification.create({
                recipient: userId,
                type: 'follow',
                message: `${actorUser?.name || 'Someone'} started following you`,
                actor: { id: actorUser?._id, name: actorUser?.name, avatar: actorUser?.avatar },
              });
            } catch (e) {
              console.error('Failed to persist follow notification:', e && e.message ? e.message : e);
            }

            // Emit targeted realtime notification
            global.broadcastEvent('notification:new', {
              type: 'follow',
              message: 'Someone started following you',
              actor: { id: followerId },
              recipientId: userId,
              timestamp: new Date().toISOString(),
            });
          } catch (e) {
            console.error('Error broadcasting follow event/notification:', e && e.message ? e.message : e);
          }
        }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error following user',
      error: error.message,
    });
  }
};

// Unfollow user
exports.unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { followerId } = req.body;

    if (!followerId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide followerId',
      });
    }

    // Get both profiles
    let userProfile = await Profile.findOne({ user: userId });
    let followerProfile = await Profile.findOne({ user: followerId });

    if (!userProfile || !followerProfile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    // Remove follower
    userProfile.followers = userProfile.followers.filter((id) => id.toString() !== followerId);
    await userProfile.save();

    // Remove from following
    followerProfile.following = followerProfile.following.filter((id) => id.toString() !== userId);
    await followerProfile.save();

    const updatedProfile = await Profile.findOne({ user: userId })
      .populate('followers', 'name email');

    res.status(200).json({
      success: true,
      message: 'User unfollowed successfully',
      data: updatedProfile,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error unfollowing user',
      error: error.message,
    });
  }
};

// Get followers
exports.getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await Profile.findOne({ user: userId })
      .populate('followers', 'name email profilePicture');

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    res.status(200).json({
      success: true,
      data: profile.followers,
      count: profile.followers.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching followers',
      error: error.message,
    });
  }
};

// Get following
exports.getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await Profile.findOne({ user: userId })
      .populate('following', 'name email profilePicture');

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    res.status(200).json({
      success: true,
      data: profile.following,
      count: profile.following.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching following',
      error: error.message,
    });
  }
};

// Get profile stats
exports.getProfileStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const profile = await Profile.findOne({ user: userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found',
      });
    }

    const stats = {
      followers: profile.followers.length,
      following: profile.following.length,
      totalBlogs: profile.totalBlogs,
      totalLikes: profile.totalLikes,
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching profile stats',
      error: error.message,
    });
  }
};
