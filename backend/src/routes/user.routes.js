const express = require('express');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const { upload } = require('../middleware/upload');
const { uploadDoctorPhoto, getProfile, updateProfile } = require('../controllers/user.controller');
const { auth } = require('../middleware/auth');
const { checkRole } = require('../middleware/rbac');
const router = express.Router();

// ── GET /api/users/profile ─────────────────────────────────────────────────
router.get('/profile', auth, getProfile);

// ── PUT /api/users/profile ─────────────────────────────────────────────────
router.put('/profile', auth, updateProfile);

// ── GET /api/users/doctors ─────────────────────────────────────────────────
// Returns all doctors (joins User + Doctor for specialty & photo).
// Used by: Admin dashboard doctor roster, slot display in Patient/ASHA views.
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .populate('userId', 'name email phone status')
      .select('userId specialty availableDays profilePhoto');
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/users/patients ────────────────────────────────────────────────
// Returns all users with role 'patient'.
// Used by: ASHA dashboard to load the real caseload list for book-on-behalf.
// Access: ASHA workers and Admins only (RBAC).
router.get('/patients', auth, checkRole(['asha', 'admin']), async (req, res) => {
  try {
    const patients = await User.find({ role: 'patient' })
      .select('name email phone role _id createdAt')
      .sort({ createdAt: -1 });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/users/doctor/:id/photo ──────────────────────────────────────
// Multer multipart upload for doctor profile photo (TM3 — infrastructure).
router.post('/doctor/:id/photo', upload.single('photo'), uploadDoctorPhoto);

module.exports = router;
