import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';

export const register = async (req, res) => {
  const { name, mobileNumber, password, role, secretKey } = req.body;

  try {
    // 1. If trying to register as owner, check secret key
    if (role === 'owner') {
      if (secretKey !== process.env.OWNER_SECRET_KEY) {
        return res.status(403).json({ message: "Invalid Owner Secret Key" });
      }
      
      // Optional: check if an owner already exists
      const existingOwner = await User.findOne({ role: 'owner' });
      if (existingOwner) {
        return res.status(400).json({ message: "Owner already registered" });
      }
    }

    // 2. Check if mobileNumber already exists
    const userExists = await User.findOne({ mobileNumber });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    // 3. Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Create User
    const newUser = new User({
      name,
      mobileNumber,
      password: hashedPassword,
      role: role || 'admin'
    });

    try {
      await User.collection.dropIndex('email_1');
    } catch (e) {
      // index might not exist
    }

    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteStaff = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Staff not found" });
    }
    res.status(200).json({ message: "Staff deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

export const login = async (req, res) => {
  const { mobileNumber, password } = req.body;

  try {
    const user = await User.findOne({ mobileNumber });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { id: user._id, name: user.name, mobileNumber: user.mobileNumber, role: user.role, profilePicture: user.profilePicture }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: ['admin', 'cutting_master', 'stitching_master'] } }).select('-password');
    res.status(200).json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  const { name, mobileNumber, removeProfilePicture, profilePictureBase64 } = req.body || {};
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if new mobileNumber is already in use by another user
    if (mobileNumber && mobileNumber !== user.mobileNumber) {
      const mobileExists = await User.findOne({ mobileNumber });
      if (mobileExists) return res.status(400).json({ message: "Mobile number already in use" });
      user.mobileNumber = mobileNumber;
    }

    if (name) user.name = name;

    // Handle Base64 image upload (bypassing multer)
    if (profilePictureBase64) {
      const uploadResponse = await cloudinary.uploader.upload(profilePictureBase64, {
        folder: 'aadvi-atelier',
        resource_type: 'auto',
      });
      user.profilePicture = uploadResponse.secure_url;
    } else if (req.file && req.file.path) {
      user.profilePicture = req.file.path;
    } else if (removeProfilePicture === 'true') {
      user.profilePicture = null;
    }

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: { id: user._id, name: user.name, mobileNumber: user.mobileNumber, role: user.role, profilePicture: user.profilePicture }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateStaffProfile = async (req, res) => {
  const { id } = req.params;
  const { name, mobileNumber, role } = req.body;
  
  try {
    const staff = await User.findById(id);
    if (!staff) return res.status(404).json({ message: "Staff not found" });

    if (mobileNumber && mobileNumber !== staff.mobileNumber) {
      const mobileExists = await User.findOne({ mobileNumber });
      if (mobileExists) return res.status(400).json({ message: "Mobile number already in use" });
      staff.mobileNumber = mobileNumber;
    }

    if (name) staff.name = name;
    if (role) staff.role = role;
    if (req.body.profilePicture !== undefined) staff.profilePicture = req.body.profilePicture;

    await staff.save();

    res.json({
      message: "Staff profile updated successfully",
      staff: { id: staff._id, name: staff.name, mobileNumber: staff.mobileNumber, role: staff.role, profilePicture: staff.profilePicture }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const saveExpoPushToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token required" });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.expoPushToken = token;
    await user.save();
    res.json({ message: "Push token saved" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};