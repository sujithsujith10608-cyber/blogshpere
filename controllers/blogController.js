const Blog = require('../models/blogModel');
const User = require('../models/userModel');
const cloudinary = require('../config/cloudinary');

// Create a new blog with image
exports.createBlog = async (req, res) => {
  try {
    let { title, content, emoji, tags } = req.body;
    const authorId = req.user?.id;

    console.log('📝 Create Blog Request:');
    console.log('  Title:', title);
    console.log('  Content:', content ? content.substring(0, 50) + '...' : 'EMPTY');
    console.log('  Emoji:', emoji);
    console.log('  AuthorId:', authorId);
    console.log('  Tags (raw):', tags);
    console.log('  Tags (type):', typeof tags);

    // Parse tags if it's a JSON string
    if (typeof tags === 'string') {
      try {
        tags = JSON.parse(tags);
        console.log('  Tags (parsed from JSON string):', tags);
      } catch (e) {
        console.log('  Tags not valid JSON, using as is');
        tags = tags ? [tags] : [];
      }
    }
    
    // Ensure tags is an array
    if (!Array.isArray(tags)) {
      tags = tags ? [tags] : [];
    }
    console.log('  Tags (final):', tags);

    // Validation
    if (!title || !content || !authorId) {
      console.error('❌ Validation failed - Missing fields');
      console.error('  Title:', !!title);
      console.error('  Content:', !!content);
      console.error('  AuthorId:', !!authorId);
      return res.status(400).json({
        success: false,
        message: 'Please provide title, content, and authorId',
      });
    }

    let imageUrl = null;

    // Upload image if provided
    if (req.file) {
      imageUrl = req.file.path;
      console.log('📸 Image uploaded:', imageUrl);
    }

    // Create new blog - set isPublished to true by default
    const blog = new Blog({
      title,
      content,
      image: imageUrl,
      emoji,
      author: authorId,
      tags: Array.isArray(tags) ? tags : [],
      isPublished: true, // Blogs are published by default
    });

    console.log('💾 Saving blog to database...');
    await blog.save();
    console.log('✅ Blog saved with ID:', blog._id);

    // Populate author data before returning
    await blog.populate('author', 'name email avatar');
    console.log('👤 Author populated:', blog.author?.name);

    console.log('📤 Sending success response');
    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog,
    });


              // Persist and emit a user notification for the blog author
              try {
                const blogAuthorId = blog.author ? blog.author.toString() : null;
                if (blogAuthorId && blogAuthorId !== userId) {
                  // Create notification in DB if model available
                  try {
                    const Notification = require('../models/notificationModel');
                    const actorUser = await require('../models/userModel').findById(userId).select('name avatar');
                    await Notification.create({
                      recipient: blogAuthorId,
                      type: 'like',
                      message: `${actorUser?.name || 'Someone'} liked your blog`,
                      actor: {
                        id: actorUser?._id,
                        name: actorUser?.name,
                        avatar: actorUser?.avatar,
                      },
                      targetBlog: { id: blog._id.toString(), title: blog.title },
                    });
                  } catch (e) {
                    console.error('Failed to persist like notification:', e && e.message ? e.message : e);
                  }

                  // Emit real-time notification event targeted to the author
                  global.broadcastEvent('notification:new', {
                    type: 'like',
                    message: 'Someone liked your blog',
                    actor: { id: userId },
                    targetBlog: { id: blog._id.toString(), title: blog.title },
                    recipientId: blogAuthorId,
                    timestamp: new Date().toISOString(),
                  });
                }
              } catch (e) {
                console.error('Error sending like notification:', e && e.message ? e.message : e);
              }
    // Broadcast real-time event
    if (global.broadcastEvent) {
      global.broadcastEvent('blog:created', {
        id: blog._id.toString(),
        title: blog.title,
        emoji: blog.emoji || '📝',
        author: {
          id: blog.author._id.toString(),
          name: blog.author.name,
          avatar: blog.author.avatar,
        },
        createdAt: blog.createdAt,
      });
    }
  } catch (error) {
    console.error('❌ Error creating blog:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error creating blog',
      error: error.message,
    });
  }
};

// Get all blogs
exports.getAllBlogs = async (req, res) => {
  try {
    // First check if there are any blogs at all
    const totalBlogs = await Blog.countDocuments();
    const publishedBlogs = await Blog.countDocuments({ isPublished: true });
    
    console.log(`Total blogs in DB: ${totalBlogs}, Published: ${publishedBlogs}`);
    
    const blogs = await Blog.find({ isPublished: true })
      .populate('author', 'name email avatar')
      .populate('likes', 'name email')
      .populate('shares', 'name email')
      .populate('comments.author', 'name email avatar')
      .sort({ createdAt: -1 });

    console.log(`Found ${blogs.length} published blogs`);

    // Transform the data to match frontend expectations
    const transformedBlogs = blogs.map(blog => {
      // Check if author exists and is populated
      const authorId = blog.author?._id ? blog.author._id.toString() : blog.author?.toString() || 'unknown';
      const authorName = blog.author?.name || 'Unknown Author';
      const authorAvatar = blog.author?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop';

      // Build a compact preview of last 2 comments for feed (instagram-like)
      const latestComments = (blog.comments || []).slice(-2).map(c => ({
        id: c._id?.toString(),
        text: c.text,
        createdAt: c.createdAt,
        author: c.author ? { id: c.author._id?.toString(), name: c.author.name, avatar: c.author.avatar } : null,
      }));

      return {
        id: blog._id.toString(),
        title: blog.title,
        content: blog.content,
        emoji: blog.emoji || '📝',
        coverImage: blog.image || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=400&fit=crop',
        tags: blog.tags || [],
        authorId: authorId,
        author: {
          id: authorId,
          name: authorName,
          avatar: authorAvatar,
        },
        likes: blog.likes?.length || 0,
        comments: blog.comments?.length || 0,
        latestComments,
        shares: blog.shares?.length || 0,
        isLiked: false,
        isBookmarked: false,
        createdAt: blog.createdAt,
        updatedAt: blog.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: transformedBlogs,
      debug: {
        totalInDB: totalBlogs,
        publishedInDB: publishedBlogs,
        returned: transformedBlogs.length
      }
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching blogs',
      error: error.message,
    });
  }
};

// Get blog by ID
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate('author', 'name email avatar')
      .populate('likes', 'name email')
      .populate('shares', 'name email')
      .populate('comments.author', 'name email avatar');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog',
      error: error.message,
    });
  }
};

// Update blog
exports.updateBlog = async (req, res) => {
  try {
    const { title, content, emoji, tags, isPublished } = req.body;

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Authorization: only the author can update
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (blog.author && blog.author.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this blog' });
    }

    let imageUrl = blog.image;

    // Upload new image if provided
    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (blog.image) {
        const publicId = blog.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy('fb-blogs/' + publicId);
      }
      imageUrl = req.file.path;
    }

    blog = await Blog.findByIdAndUpdate(
      req.params.id,
      {
        title,
        content,
        image: imageUrl,
        emoji,
        tags,
        isPublished,
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog,
    });

    // Broadcast real-time event
    if (global.broadcastEvent) {
      global.broadcastEvent('blog:updated', {
        id: blog._id.toString(),
        title: blog.title,
        emoji: blog.emoji || '📝',
        updatedAt: blog.updatedAt,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating blog',
      error: error.message,
    });
  }
};

// Delete blog
exports.deleteBlog = async (req, res) => {
  try {
    // Authorization: only the author can delete
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    if (blog.author && blog.author.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this blog' });
    }

    // Delete blog and image
    const deleted = await Blog.findByIdAndDelete(req.params.id);
    if (deleted && deleted.image) {
      const publicId = deleted.image.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy('fb-blogs/' + publicId);
    }

    res.status(200).json({ success: true, message: 'Blog deleted successfully' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting blog',
      error: error.message,
    });
  }
};

// Like a blog
exports.likeBlog = async (req, res) => {
  try {
    // Use authenticated user id
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Check if user already liked
    const alreadyLiked = blog.likes.map(String).includes(String(userId));

    if (alreadyLiked) {
      // Unlike the blog
      blog.likes = blog.likes.filter((id) => id.toString() !== userId);
      await blog.save();

      // Broadcast real-time event
      if (global.broadcastEvent) {
        global.broadcastEvent('like:added', {
          blogId: blog._id.toString(),
          userId: userId,
          likeCount: blog.likes.length,
          action: 'unlike',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Blog unliked',
        likeCount: blog.likes.length,
        data: blog,
      });
    } else {
      // Like the blog
      blog.likes.push(userId);
      await blog.save();

      // Broadcast real-time event
      if (global.broadcastEvent) {
        global.broadcastEvent('like:added', {
          blogId: blog._id.toString(),
          userId: userId,
          likeCount: blog.likes.length,
          action: 'like',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Blog liked',
        likeCount: blog.likes.length,
        data: blog,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error liking blog',
      error: error.message,
    });
  }
};

// Add comment to blog
exports.addComment = async (req, res) => {
  try {
    const { text } = req.body;
    const authorId = req.user?.id;

    if (!authorId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'Please provide comment text' });
    }

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    const newComment = {
      text,
      author: authorId,
    };

    blog.comments.push(newComment);
    await blog.save();

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: blog,
    });

    // Broadcast real-time event
    if (global.broadcastEvent) {
      global.broadcastEvent('comment:added', {
        blogId: blog._id.toString(),
        commentId: newComment._id?.toString() || new Date().getTime().toString(),
        authorId: authorId,
        text: newComment.text,
        createdAt: new Date().toISOString(),
      });
    
      try {
        // Send a notification event to the blog author (unless they commented themself)
        const blogAuthorId = blog.author ? blog.author.toString() : null;
        if (blogAuthorId && blogAuthorId !== authorId) {
          // Fetch actor details for nicer notification payload
          const actor = await User.findById(authorId).select('name avatar');
          global.broadcastEvent('notification:new', {
            type: 'comment',
            message: `${actor?.name || 'Someone'} commented on your blog`,
            actor: {
              id: actor?._id?.toString() || authorId,
              name: actor?.name || 'Unknown',
              avatar: actor?.avatar || null,
            },
            targetBlog: {
              id: blog._id.toString(),
              title: blog.title,
            },
            recipientId: blogAuthorId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.error('Error broadcasting notification for comment:', e && e.message ? e.message : e);
      }
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding comment',
      error: error.message,
    });
  }
};

// Delete comment from blog
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide commentId',
      });
    }

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    const comment = blog.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Only comment author or blog author can delete the comment
    const blogAuthorId = blog.author ? blog.author.toString() : null;
    const commentAuthorId = comment.author ? comment.author.toString() : null;
    if (commentAuthorId !== userId && blogAuthorId !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    // Remove the comment
    comment.remove();
    await blog.save();

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      data: blog,
    });

    // Broadcast real-time event
    if (global.broadcastEvent) {
      global.broadcastEvent('comment:added', {
        blogId: blog._id.toString(),
        action: 'delete',
        commentId: commentId,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting comment',
      error: error.message,
    });
  }
};

// Like comment
exports.likeComment = async (req, res) => {
  try {
    const { commentId } = req.body;

    if (!commentId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide commentId',
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    const comment = blog.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // For now we simply increment likes. Could be improved to track per-user likes.
    comment.likes = (comment.likes || 0) + 1;
    await blog.save();

    res.status(200).json({
      success: true,
      message: 'Comment liked',
      data: blog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error liking comment',
      error: error.message,
    });
  }
};

// Share blog
exports.shareBlog = async (req, res) => {
  try {
    // Use authenticated user id
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    let blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    // Check if user already shared
    const alreadyShared = blog.shares.map(String).includes(String(userId));

    if (!alreadyShared) {
      blog.shares.push(userId);
      await blog.save();
    }

    res.status(200).json({
      success: true,
      message: 'Blog shared successfully',
      shareCount: blog.shares.length,
      data: blog,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error sharing blog',
      error: error.message,
    });
  }
};

// Get blog stats
exports.getBlogStats = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found',
      });
    }

    const stats = {
      likes: blog.likes.length,
      comments: blog.comments.length,
      shares: blog.shares.length,
      totalEngagement: blog.likes.length + blog.comments.length + blog.shares.length,
    };

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog stats',
      error: error.message,
    });
  }
};
