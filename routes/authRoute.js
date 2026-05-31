import express from 'express';
import { login, register, getStaff, updateProfile, updateStaffProfile, deleteStaff, saveExpoPushToken } from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../config/storage.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/staff', protect, getStaff);
router.put('/staff/:id', protect, authorize('owner'), updateStaffProfile);
router.delete('/staff/:id', protect, authorize('owner'), deleteStaff);
router.put('/profile', protect, upload.single('profilePicture'), uploadToCloudinary, updateProfile);
router.post('/push-token', protect, saveExpoPushToken);

router.get('/owner-dashboard', protect, authorize('owner'), (req, res) => {
  res.json({ message: "Welcome, Boss!" });
});

router.get('/staff-area', protect, authorize('owner', 'staff'), (req, res) => {
  res.json({ message: "Welcome to the workspace" });
});

export default router;
