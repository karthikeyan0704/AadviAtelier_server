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
  assignOrder,
  getPaymentLink,
  sendDailyDeliveryReminders
} from '../controllers/OrderController.js';
import { protect, authorize } from '../middleware/auth.js';
import { upload, uploadToCloudinary } from '../config/storage.js';

const router = express.Router();

router.route('/')
  .post(protect, authorize('owner', 'admin'), upload.fields([
    { name: 'referenceImage', maxCount: 1 },
    { name: 'referenceImages', maxCount: 5 },
    { name: 'sampleDressPhoto', maxCount: 1 },
    { name: 'sampleDressPhotos', maxCount: 5 },
    { name: 'audioInstruction', maxCount: 1 }
  ]), uploadToCloudinary, createOrder)
  .get(protect, getOrders);

router.get('/dashboard', protect, getDashboardStats);
router.get('/staff-orders', protect, getStaffOrders);
router.get('/daily-delivery-reminders', sendDailyDeliveryReminders);

router.put('/workflow', protect, updateOrderWorkflow);
router.put('/billing', protect, authorize('owner', 'admin'), updateOrderBilling);
router.put('/assign', protect, authorize('owner', 'admin'), assignOrder);

router.route('/:id')
  .get(protect, getOrderById)
  .delete(protect, authorize('owner', 'admin'), deleteOrder);

router.put('/:id/status', protect, authorize('owner', 'admin'), updateOrderStatus);
router.put('/:id/update-bill', protect, authorize('owner', 'admin'), updateBill);
router.get('/:id/whatsapp', protect, authorize('owner', 'admin'), getWhatsAppLink);
router.get('/:id/invoice-whatsapp', protect, authorize('owner', 'admin'), getInvoiceWhatsAppLink);
router.get('/:id/pay', getPaymentLink);

export default router;
