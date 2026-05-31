import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import streamifier from 'streamifier';
import dotenv from 'dotenv';
import path from 'path';

// If config/storage.js is loaded early, ensure dotenv is configured
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const multerStorage = multer.memoryStorage();
export const upload = multer({ storage: multerStorage });

export const uploadToCloudinary = async (req, res, next) => {
  if (!req.files && !req.file) return next();

  try {
    const uploadFile = (file) => {
      return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream(
          { folder: 'aadvi-atelier', resource_type: 'auto' },
          (error, result) => {
            if (result) {
              // Standardize file.path for other controllers to use easily
              file.path = result.secure_url;
              resolve(result);
            } else {
              reject(error);
            }
          }
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
      });
    };

    if (req.file) {
      await uploadFile(req.file);
    } else if (req.files) {
      for (const fieldname in req.files) {
        for (const file of req.files[fieldname]) {
          await uploadFile(file);
        }
      }
    }
    next();
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    next(error);
  }
};
