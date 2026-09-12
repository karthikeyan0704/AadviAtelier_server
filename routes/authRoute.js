import express from 'express';
import { login, register, getStaff, updateProfile, updateStaffProfile, deleteStaff, saveExpoPushToken, refreshAccessToken, logout } from '../controllers/authController.js';
import { protect, authorize, protectStaffRegistration } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../config/storage.js';

const router = express.Router();

router.post('/register', protectStaffRegistration, register);
router.post('/login', login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.get('/staff', protect, authorize('owner', 'admin'), getStaff);
router.put('/staff/:id', protect, authorize('owner', 'admin'), updateStaffProfile);
router.delete('/staff/:id', protect, authorize('owner', 'admin'), deleteStaff);
router.put('/profile', protect, upload.single('profilePicture'), uploadToCloudinary, updateProfile);
router.post('/profile', protect, updateProfile);
router.post('/push-token', protect, saveExpoPushToken);

router.get('/owner-dashboard', protect, authorize('owner'), (req, res) => {
  res.json({ message: "Welcome, Boss!" });
});

router.get('/staff-area', protect, authorize('owner', 'staff'), (req, res) => {
  res.json({ message: "Welcome to the workspace" });
});

export default router;
