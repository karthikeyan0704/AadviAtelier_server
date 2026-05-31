import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  fullAddress: { type: String },
  houseLandmark: { type: String }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobileNumber: { type: String, required: true, unique: true },
  email: { type: String },
  gender: { type: String, enum: ['Male', 'Female', 'Kids', 'Other'] },
  dateOfBirth: { type: Date },
  address: addressSchema,
  profileImage: { type: String },
  referencePhotos: [{ type: String }], // URLs to images
  measurements: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
