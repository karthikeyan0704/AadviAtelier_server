import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String },
  mobileNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePicture: { type: String },
  role: { 
    type: String, 
    enum: ['owner', 'admin', 'cutting_master', 'stitching_master'],
    default: 'admin'
  },
  expoPushToken: { type: String }
});

const User = mongoose.model('User', userSchema);
export default User;    