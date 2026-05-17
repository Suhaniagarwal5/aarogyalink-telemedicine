const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const { upload } = require('../middleware/upload');

// ── Token Helpers ──────────────────────────────────────────────

const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

const setRefreshCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// ── POST /api/auth/register ────────────────────────────────────

router.post('/register', upload.single('certificate'), async (req, res) => {
  try {
    const { name, email, password, role, specialty, phone } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password and role are required.'
      });
    }

    if (role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Registration as administrator is not allowed.'
      });
    }

    const validRoles = ['patient', 'doctor', 'asha'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${validRoles.join(', ')}`
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists.'
      });
    }

    const status = (role === 'doctor' || role === 'asha') ? 'pending' : 'active';

    const certificateUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;
    
    const user = await User.create({ name, email, password, role, phone, status, certificateUrl });

    if (role === 'doctor') {
      await Doctor.create({
        userId: user._id,
        specialty: specialty || 'General Medicine',
        certificateUrl
      });
    }

    // Do not log in immediately if pending
    if (status === 'pending') {
      return res.status(201).json({
        success: true,
        message: 'Registration successful. Account is pending admin approval.',
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error('Register Error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and role are required.'
      });
    }

    let user = await User.findOne({ email });

    if (role === 'admin') {
      const allowedAdminEmails = process.env.ADMIN_EMAILS 
        ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()) 
        : [];
      
      if (!allowedAdminEmails.includes(email.toLowerCase())) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized admin login.'
        });
      }
      
      const adminSecretPassword = process.env.ADMIN_PASSWORD || '123456';
      
      // Auto-create admin if not exists, so they can login with the configured password
      if (!user && password === adminSecretPassword) {
        user = await User.create({ name: 'Admin', email: email.toLowerCase(), password: adminSecretPassword, role: 'admin', status: 'active' });
      }
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (user.role !== role) {
      return res.status(401).json({
        success: false,
        message: `Invalid login for this role. You are registered as ${user.role}.`
      });
    }



    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. Please wait for confirmation.'
      });
    } else if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: 'Your account request was rejected by the admin.'
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      message: 'Login successful',
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// ── POST /api/auth/refresh ─────────────────────────────────────
// Called silently by TM2's Axios interceptor on 401

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token. Please log in again.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      res.clearCookie('refreshToken');
      return res.status(401).json({
        success: false,
        message: 'Refresh token invalid or expired. Please log in again.'
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }

    const newAccessToken = generateAccessToken(user);

    res.json({ success: true, accessToken: newAccessToken });

  } catch (err) {
    console.error('Refresh Error:', err);
    res.status(500).json({ success: false, message: 'Server error during token refresh' });
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────

router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;