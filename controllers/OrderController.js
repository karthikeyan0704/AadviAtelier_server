import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

const sendPushNotification = async (tokens, title, body) => {
  let messages = [];
  for (let pushToken of tokens) {
    if (!Expo.isExpoPushToken(pushToken)) continue;
    messages.push({
      to: pushToken,
      sound: 'default',
      title,
      body,
    });
  }
  let chunks = expo.chunkPushNotifications(messages);
  for (let chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error('Error sending push notification', error);
    }
  }
};

const getWorkflowSteps = (dressType, isAariWorkStr) => {
  const isAari = String(isAariWorkStr) === 'true';
  const type = String(dressType || '').toLowerCase();
  
  // Pants and Shirts typically don't need Hook and Hem
  const isPantOrShirt = type.includes('pant') || type.includes('shirt');

  let steps = [
    'Order Received',
    'Fabric / Lining Sourcing',
    'Marking',
    'Cutting',
    'Stitching'
  ];

  if (isAari) {
    steps.push('Aari Work / Embroidery');
  }

  steps.push('Checking');

  if (!isPantOrShirt) {
    steps.push('Hook and Hem');
  }

  steps.push('Ironing', 'Packing', 'Billing', 'Delivery');
  
  return steps;
};

export const createOrder = async (req, res) => {
  try {
    const { 
      customerId, 
      category, 
      dressType, 
      model, 
      description, 
      fabricDetails, 
      deliveryDate, 
      priority, 
      isAariWork,
      measurements,
      billing,
      type,
      quantity,
      stitchingPrice,
      trialDate,
      specialInstructions,
      assignedTo,
      additionalCosts
    } = req.body;

    let referenceImage = '';
    let referenceImages = [];
    let sampleDressPhoto = '';
    let sampleDressPhotos = [];
    let audioInstruction = '';

    if (req.files) {
      if (req.files.referenceImage) {
        referenceImage = req.files.referenceImage[0].path;
      }
      if (req.files.referenceImages) {
        referenceImages = req.files.referenceImages.map(f => f.path);
        if (!referenceImage && referenceImages.length > 0) {
          referenceImage = referenceImages[0];
        }
      }
      if (req.files.sampleDressPhoto) {
        sampleDressPhoto = req.files.sampleDressPhoto[0].path;
      }
      if (req.files.sampleDressPhotos) {
        sampleDressPhotos = req.files.sampleDressPhotos.map(f => f.path);
        if (!sampleDressPhoto && sampleDressPhotos.length > 0) {
          sampleDressPhoto = sampleDressPhotos[0];
        }
      }
      if (req.files.audioInstruction) {
        audioInstruction = req.files.audioInstruction[0].path;
      }
    }

    // Parse measurements if it comes as a string (happens with multipart/form-data)
    let parsedMeasurements = typeof measurements === 'string' ? JSON.parse(measurements) : measurements;
    if (sampleDressPhoto) {
      parsedMeasurements.sampleDressPhoto = sampleDressPhoto;
    }

    // Parse billing if it comes as a string
    let parsedBilling = typeof billing === 'string' ? JSON.parse(billing) : billing;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const lastOrder = await Order.findOne({
      orderId: new RegExp(`^AAD-${dateStr}-`)
    }).sort({ orderId: -1 });

    let sequenceNumber = 1;
    if (lastOrder && lastOrder.orderId) {
      const parts = lastOrder.orderId.split('-');
      if (parts.length >= 3) {
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) {
          sequenceNumber = lastSeq + 1;
        }
      }
    }

    const sequenceStr = sequenceNumber.toString().padStart(4, '0');
    const orderId = `AAD-${dateStr}-${sequenceStr}`;

    // Initialize dynamic workflow based on dress type
    const dynamicSteps = getWorkflowSteps(dressType, isAariWork);
    const workflow = dynamicSteps.map(step => ({
      step,
      status: 'Pending'
    }));

    // Set first step to completed
    workflow[0].status = 'Completed';

    const order = new Order({
      orderId,
      customer: customerId,
      category,
      dressType,
      model,
      referenceImage,
      referenceImages,
      sampleDressPhoto,
      sampleDressPhotos,
      audioInstruction,
      description,
      fabricDetails,
      deliveryDate,
      priority,
      isAariWork,
      type,
      quantity: quantity ? Number(quantity) : 1,
      stitchingPrice: stitchingPrice ? Number(stitchingPrice) : 0,
      trialDate: trialDate ? new Date(trialDate) : null,
      specialInstructions,
      measurements: parsedMeasurements,
      workflow,
      billing: {
        ...parsedBilling,
        balanceDue: (parsedBilling.estimatedCost || 0) - (parsedBilling.advancePaid || 0)
      },
      assignedTo: assignedTo ? JSON.parse(assignedTo) : null,
      createdBy: req.user ? req.user.id : null,
      extraCharges: req.body.extraCharges ? JSON.parse(req.body.extraCharges) : (
        (additionalCosts && Number(additionalCosts) > 0) ? [{
        description: description || 'Extra Charge',
        amount: Number(additionalCosts)
      }] : [])
    });

    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate('customer').populate('createdBy', 'name role').sort({ createdAt: -1 }).lean();
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer').populate('createdBy', 'name role').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderWorkflow = async (req, res) => {
  try {
    const { orderId, stepIndex, status } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (req.user) {
      const role = req.user.role;
      const userId = req.user.id;
      const stepName = order.workflow[stepIndex]?.step;

      if (role !== 'owner' && role !== 'admin') {
        if (role === 'cutting_master') {
          if (order.assignedTo?.cuttingMaster?.toString() !== userId) {
            return res.status(403).json({ message: 'Not assigned to this order as cutting master' });
          }
          if (!['Marking', 'Cutting'].includes(stepName)) {
            return res.status(403).json({ message: 'Cutting masters can only update Marking and Cutting steps' });
          }
        } else if (role === 'stitching_master') {
          if (order.assignedTo?.stitchingMaster?.toString() !== userId) {
            return res.status(403).json({ message: 'Not assigned to this order as stitching master' });
          }
          if (!['Stitching', 'Aari Work / Embroidery', 'Hook and Hem'].includes(stepName)) {
            return res.status(403).json({ message: 'Stitching masters can only update Stitching, Aari and Hook/Hem steps' });
          }
        } else {
          return res.status(403).json({ message: 'Unauthorized role for workflow updates' });
        }
      }
    }

    if (order.workflow[stepIndex]) {
      order.workflow[stepIndex].status = status;
      order.workflow[stepIndex].updatedAt = Date.now();
      
      // Update overall status based on workflow
      if (status === 'Completed') {
        if (stepIndex === order.workflow.length - 1) {
          order.status = 'Delivered';
        } else if (stepIndex >= 4) { // After stitching
          order.status = 'Ready';
        } else {
          order.status = 'In Progress';
        }
      }
      
      await order.save();
      
      // If completed by staff, notify owners
      if (status === 'Completed' && req.user && (req.user.role === 'cutting_master' || req.user.role === 'stitching_master')) {
        const owners = await User.find({ role: { $in: ['owner', 'admin'] } });
        const tokens = owners.map(o => o.expoPushToken).filter(Boolean);
        if (tokens.length > 0) {
          const shortId = order.orderId ? order.orderId.split('-').pop() : '';
          sendPushNotification(
            tokens, 
            "Task Completed ✅", 
            `${order.workflow[stepIndex].step} completed by ${req.user.name || 'Staff'} for Order #${shortId}`
          );
        }
      }

      res.status(200).json(order);
    } else {
      res.status(400).json({ message: 'Invalid step index' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderBilling = async (req, res) => {
  try {
    const { orderId, totalPaid } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.billing.totalPaid = totalPaid;
    order.billing.balanceDue = order.billing.estimatedCost - totalPaid;
    
    if (order.billing.balanceDue <= 0) {
      order.billing.paymentStatus = 'Paid';
    } else if (totalPaid > 0) {
      order.billing.paymentStatus = 'Partially Paid';
    } else {
      order.billing.paymentStatus = 'Unpaid';
    }

    await order.save();
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = {
      todayDeliveries: await Order.countDocuments({ deliveryDate: { $gte: today, $lt: tomorrow } }),
      pendingOrders: await Order.countDocuments({ status: 'Pending' }),
      underStitching: await Order.countDocuments({ 
        $and: [
          { workflow: { $elemMatch: { step: 'Cutting', status: 'Completed' } } },
          { workflow: { $elemMatch: { step: 'Stitching', status: 'Pending' } } }
        ]
      }), // Cutting done, stitching pending
      aariWorkPending: await Order.countDocuments({ 
        workflow: { $elemMatch: { step: 'Aari Work / Embroidery', status: 'Pending' } }
      }),
      completedOrders: await Order.countDocuments({ status: 'Delivered' }),
      paymentPending: await Order.countDocuments({ 'billing.paymentStatus': { $ne: 'Paid' } })
    };

    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getWhatsAppLink = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const { customer, orderId, status, workflow } = order;
    const currentStep = workflow.find(s => s.status === 'Pending') || workflow[workflow.length - 1];
    
    const message = `Hello ${customer.name}, your order ${orderId} is currently: ${status}. \nCurrent stage: ${currentStep.step}. \nThank you for choosing Aadvi Designer Studio!`;
    
    const encodedMessage = encodeURIComponent(message);
    const link = `https://wa.me/91${customer.mobileNumber.replace(/\D/g, '')}?text=${encodedMessage}`;
    
    res.status(200).json({ link, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getInvoiceWhatsAppLink = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer').lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const { customer, orderId, billing, dressType, category, quantity, extraCharges } = order;
    
    let isEstimate = req.query.type === 'estimate';
    let title = isEstimate ? "🧾 *ESTIMATE INVOICE*" : "🧾 *FINAL INVOICE*";
    
    let extraChargeText = "";
    if (extraCharges && extraCharges.length > 0) {
      extraChargeText = "\n" + extraCharges.map(ec => `Extra (${ec.description}): ₹${ec.amount}`).join('\n');
    }
    
    const message = `*Aadvi Designer Studio*\n${title}\n\n*Order ID:* ${orderId}\n*Customer:* ${customer.name}\n*Item:* ${category} - ${dressType} (Qty: ${quantity})\n\n*Billing Details:*\nStitching Price: ₹${(order.stitchingPrice || 0) * (quantity || 1)}${extraChargeText}\nTotal Amount: ₹${billing?.estimatedCost || 0}\nTotal Paid: ₹${billing?.totalPaid || billing?.advancePaid || 0}\n*Balance Due:* ₹${billing?.balanceDue || 0}\n\nThank you for choosing Aadvi Designer Studio! 🙏`;
    
    const encodedMessage = encodeURIComponent(message);
    const link = `https://wa.me/91${customer.mobileNumber.replace(/\D/g, '')}?text=${encodedMessage}`;
    
    res.status(200).json({ link, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    order.status = status;
    await order.save();
    
    const populated = await Order.findById(order._id).populate('customer');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBill = async (req, res) => {
  try {
    const { additionalCost, description } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    const addedCost = Number(additionalCost) || 0;
    order.additionalCosts = (order.additionalCosts || 0) + addedCost;
    order.billing.estimatedCost = order.billing.estimatedCost + addedCost;
    order.billing.balanceDue = order.billing.estimatedCost - (order.billing.totalPaid || order.billing.advancePaid || 0);
    
    if (addedCost > 0) {
      order.extraCharges.push({
        description: description || 'Extra Work',
        amount: addedCost
      });
    }
    
    if (order.billing.balanceDue <= 0) {
      order.billing.paymentStatus = 'Paid';
    } else if ((order.billing.totalPaid || order.billing.advancePaid || 0) > 0) {
      order.billing.paymentStatus = 'Partially Paid';
    } else {
      order.billing.paymentStatus = 'Unpaid';
    }
    
    await order.save();
    const populated = await Order.findById(order._id).populate('customer');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStaffOrders = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'cutting_master') {
      query = { 'assignedTo.cuttingMaster': req.user.id };
    } else if (req.user.role === 'stitching_master') {
      query = { 'assignedTo.stitchingMaster': req.user.id };
    }
    const orders = await Order.find(query).populate('customer').sort({ createdAt: -1 }).lean();
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const assignOrder = async (req, res) => {
  try {
    const { orderId, cuttingMaster, stitchingMaster } = req.body;
    
    // Get raw order data to check the current type of assignedTo
    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    let currentAssignedTo = {};
    
    // Check if assignedTo is already a proper object (not an ObjectId from the old schema)
    if (order.assignedTo && typeof order.assignedTo === 'object' && !order.assignedTo._bsontype && !order.assignedTo.toHexString) {
      currentAssignedTo = order.assignedTo;
    }
    
    if (cuttingMaster !== undefined) currentAssignedTo.cuttingMaster = cuttingMaster;
    if (stitchingMaster !== undefined) currentAssignedTo.stitchingMaster = stitchingMaster;
    
    await Order.updateOne(
      { _id: orderId },
      { $set: { assignedTo: currentAssignedTo } }
    );
    
    // Send notifications to assigned staff
    const tokens = [];
    if (cuttingMaster) {
      const cmUser = await User.findById(cuttingMaster);
      if (cmUser && cmUser.expoPushToken) tokens.push(cmUser.expoPushToken);
    }
    if (stitchingMaster) {
      const smUser = await User.findById(stitchingMaster);
      if (smUser && smUser.expoPushToken) tokens.push(smUser.expoPushToken);
    }
    if (tokens.length > 0) {
      const shortId = order.orderId ? order.orderId.split('-').pop() : '';
      sendPushNotification(tokens, "New Work Assigned ✂️", `Order #${shortId} has been assigned to you.`);
    }
    
    const populated = await Order.findById(orderId).populate('customer');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
