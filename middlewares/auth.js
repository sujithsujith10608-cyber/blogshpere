const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  try {
    console.log('🔐 Auth Middleware Debug:');
    console.log('  Cookies:', req.cookies);
    console.log('  Authorization header:', req.headers.authorization ? '✓ Present' : '✗ Missing');
    
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
    console.log('  Token extracted:', token ? '✓ Yes' : '✗ No');
    
    if (!token) {
      console.error('❌ No token found in cookies or headers');
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const jwtSecret = process.env.JWT_SECRET || process.env.jwt || 'dev_jwt_secret_change_me';
    console.log('  JWT Secret used:', jwtSecret ? '✓ Found' : '✗ Missing');

    const decoded = jwt.verify(token, jwtSecret);
    console.log('  Token decoded successfully');
    console.log('  Decoded user ID:', decoded.id);
    
    // Attach user info to request
    req.user = { id: decoded.id, email: decoded.email };
    console.log('  req.user set:', req.user);
    next();
  } catch (err) {
    console.error('❌ Auth middleware error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};
