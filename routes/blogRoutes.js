const express = require('express');
const upload = require('../config/multer');
const blogController = require('../controllers/blogController');
const auth = require('../middlewares/auth');
const Blog = require('../models/blogModel');

const router = express.Router();

// Debug endpoint - check all blogs (including unpublished)
router.get('/debug/all-blogs', async (req, res) => {
  try {
    const blogs = await Blog.find().populate('author', 'name email avatar');
    const count = await Blog.countDocuments();
    const publishedCount = await Blog.countDocuments({ isPublished: true });
    
    res.json({
      totalBlogs: count,
      publishedBlogs: publishedCount,
      data: blogs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Blog CRUD routes
router.post('/create', auth, upload.single('image'), blogController.createBlog);
router.get('/all', blogController.getAllBlogs);
router.get('/:id', blogController.getBlogById);
router.put('/update/:id', auth, upload.single('image'), blogController.updateBlog);
router.delete('/delete/:id', auth, blogController.deleteBlog);

// Like routes
router.post('/:id/like', auth, blogController.likeBlog);

// Comment routes
router.post('/:id/comment', auth, blogController.addComment);
router.delete('/:id/comment', auth, blogController.deleteComment);
router.post('/:id/comment/like', auth, blogController.likeComment);

// Share routes
router.post('/:id/share', auth, blogController.shareBlog);

// Stats route
router.get('/:id/stats', blogController.getBlogStats);

module.exports = router;
