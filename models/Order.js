import mongoose from 'mongoose';

const measurementSchema = new mongoose.Schema({
  dressType: { type: String, required: true },
  // Blouse / Women Tops
  bust: String,
  waist: String,
  hip: String,
  shoulder: String,
  frontNeck: String,
  backNeck: String,
  sleeveLength: String,
  sleeveRound: String,
  armhole: String,
  blouseLength: String,
  apexPoint: String,
  chestWidth: String,
  bottomWidth: String,
  upperChest: String, // Added from image
  underBust: String, // Added from image
  
  // Kurti / Tops / Maxi
  neckType: String,
  dressLength: String,
  slitLength: String,
  
  // Lehenga / Skirt / Bottoms
  flare: String,
  length: String,
  
  // Men
  chest: String,
  neck: String,
  shirtLength: String,
  armRound: String,
  
  // Pant
  rise: String,
  thigh: String,
  waistRound: String, // Added from image
  thighRound: String, // Added from image
  kneeRound: String, // Added from image
  ankleRound: String, // Added from image
  
  // Kids
  height: String,
  
  customNotes: String,
  isSampleDress: { type: Boolean, default: false },
  sampleDressPhoto: String
}, { _id: false, strict: false });

const workflowStepSchema = new mongoose.Schema({
  step: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  category: { type: String, enum: ['Kids', 'Women', 'Men'], required: true },
  dressType: { type: String, required: true },
  model: { type: String }, // e.g., "3 Dart Blouse", "Princess Blouse"
  referenceImage: { type: String },
  referenceImages: [{ type: String }],
  sampleDressPhoto: { type: String },
  sampleDressPhotos: [{ type: String }],
  audioInstruction: { type: String },
  description: String,
  fabricDetails: String,
  deliveryDate: { type: Date, required: true },
  priority: { type: String, enum: ['Normal', 'High'], default: 'Normal' },
  isAariWork: { type: Boolean, default: false },
  type: { type: String, enum: ['Stitching', 'Alteration'], default: 'Stitching' },
  quantity: { type: Number, default: 1 },
  stitchingPrice: { type: Number, default: 0 },
  additionalCosts: { type: Number, default: 0 },
  trialDate: { type: Date },
  specialInstructions: String,
  
  extraCharges: [{
    description: String,
    amount: Number,
    date: { type: Date, default: Date.now }
  }],
  
  measurements: measurementSchema,
  
  status: { 
    type: String, 
    enum: ['Draft', 'Pending', 'In Progress', 'Ready', 'Delivered'], 
    default: 'Pending' 
  },
  
  workflow: [workflowStepSchema],
  
  billing: {
    estimatedCost: { type: Number, default: 0 },
    advancePaid: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' }
  },
  
  assignedTo: {
    cuttingMaster: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    stitchingMaster: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
export default Order;
