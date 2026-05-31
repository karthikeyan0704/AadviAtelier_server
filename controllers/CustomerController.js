import Customer from '../models/Customer.js';
import Order from '../models/Order.js';

export const createCustomer = async (req, res) => {
  try {
    const { name, mobileNumber, address, email, gender, dateOfBirth } = req.body;
    let profileImage = null;
    
    if (req.file) {
      profileImage = req.file.path;
    }
    
    let customer = await Customer.findOne({ mobileNumber });
    if (customer) {
      return res.status(400).json({ message: 'Customer with this mobile number already exists' });
    }
    
    customer = new Customer({
      name,
      mobileNumber,
      email,
      gender,
      dateOfBirth,
      address: typeof address === 'string' ? JSON.parse(address) : address,
      profileImage
    });
    
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 }).lean();
    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    // Fetch related stats
    const orders = await Order.find({ customer: req.params.id }).sort({ createdAt: -1 }).lean();
    const totalOrders = orders.length;
    const pendingRevenue = orders.reduce((sum, order) => sum + (order.billing?.balanceDue || 0), 0);
    const totalRevenue = orders.reduce((sum, order) => sum + (order.billing?.estimatedCost || 0), 0);

    res.status(200).json({
      customer,
      stats: {
        totalOrders,
        pendingRevenue,
        totalRevenue
      },
      orders: orders.slice(0, 5) // Last 5 orders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    
    res.status(200).json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { name, mobileNumber, address, email, gender, dateOfBirth } = req.body;
    let customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    
    if (mobileNumber && mobileNumber !== customer.mobileNumber) {
      const existing = await Customer.findOne({ mobileNumber });
      if (existing) {
        return res.status(400).json({ message: 'Customer with this mobile number already exists' });
      }
    }

    if (name) customer.name = name;
    if (mobileNumber) customer.mobileNumber = mobileNumber;
    if (email !== undefined) customer.email = email;
    if (gender) customer.gender = gender;
    if (dateOfBirth) customer.dateOfBirth = dateOfBirth;
    if (address) customer.address = typeof address === 'string' ? JSON.parse(address) : address;
    if (req.file) {
      customer.profileImage = req.file.path;
    } else if (req.body.removeProfileImage === 'true') {
      customer.profileImage = null;
    }
    
    await customer.save();
    res.status(200).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const searchCustomer = async (req, res) => {
  try {
    const { query } = req.query;
    const customers = await Customer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { mobileNumber: { $regex: query, $options: 'i' } }
      ]
    }).lean();
    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMeasurements = async (req, res) => {
  try {
    const { outfitName, measurements } = req.body;
    const customer = await Customer.findById(req.params.id);
    
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (!customer.measurements) {
      customer.measurements = new Map();
    }
    
    customer.measurements.set(outfitName, measurements);
    await customer.save();
    
    res.status(200).json({ message: 'Measurements updated', customer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
