import express from 'express';
import { 
  createCustomer, 
  getCustomers, 
  getCustomerById, 
  deleteCustomer,
  searchCustomer,
  updateMeasurements,
  updateCustomer
} from '../controllers/CustomerController.js';
import { protect, authorize } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../config/storage.js';

const router = express.Router();

router.route('/')
  .post(protect, authorize('owner', 'admin'), upload.single('profileImage'), uploadToCloudinary, createCustomer)
  .get(protect, getCustomers);

router.get('/search', protect, searchCustomer);

router.route('/:id')
  .get(protect, getCustomerById)
  .put(protect, authorize('owner', 'admin'), upload.single('profileImage'), uploadToCloudinary, updateCustomer)
  .delete(protect, authorize('owner', 'admin'), deleteCustomer);

router.put('/:id/measurements', protect, authorize('owner', 'admin'), updateMeasurements);

export default router;
