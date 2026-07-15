import express from 'express';
import { 
  createOrder, 
  getOrders, 
  getOrderById, 
  updateOrderWorkflow, 
  updateOrderBilling,
  getDashboardStats,
  getWhatsAppLink,
  updateOrderStatus,
  deleteOrder,
  getStaffOrders,
  getInvoiceWhatsAppLink,
  updateBill,
  assignOrder
} from '../controllers/OrderController.js';
import { protect } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../config/storage.js';

const router = express.Router();

router.route('/')
  .post(protect, upload.fields([
    { name: 'referenceImage', maxCount: 1 },
    { name: 'referenceImages', maxCount: 5 },
    { name: 'sampleDressPhoto', maxCount: 1 },
    { name: 'sampleDressPhotos', maxCount: 5 },
    { name: 'audioInstruction', maxCount: 1 }
  ]), uploadToCloudinary, createOrder)
  .get(protect, getOrders);

router.get('/dashboard', protect, getDashboardStats);
router.get('/staff-orders', protect, getStaffOrders);

router.put('/workflow', protect, updateOrderWorkflow);
router.put('/billing', protect, updateOrderBilling);
router.put('/assign', protect, assignOrder);

router.route('/:id')
  .get(protect, getOrderById)
  .delete(protect, deleteOrder);

router.put('/:id/status', protect, updateOrderStatus);
router.put('/:id/update-bill', protect, updateBill);
router.get('/:id/whatsapp', protect, getWhatsAppLink);
router.get('/:id/invoice-whatsapp', protect, getInvoiceWhatsAppLink);

export default router;
