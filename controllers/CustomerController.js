import Customer from "../models/Customer.js";
import Order from "../models/Order.js";
import mongoose from "mongoose";

export const createCustomer = async (req, res) => {
  try {
    const { name, mobileNumber, address, email, gender, dateOfBirth } =
      req.body;
    let profileImage = null;

    if (req.file) {
      profileImage = req.file.path;
    }

    let customer = await Customer.findOne({ mobileNumber });
    if (customer) {
      return res
        .status(400)
        .json({ message: "Customer with this mobile number already exists" });
    }

    customer = new Customer({
      name,
      mobileNumber,
      email,
      gender,
      dateOfBirth,
      address: typeof address === "string" ? JSON.parse(address) : address,
      profileImage,
    });

    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    console.error("createCustomer error:", error.message, error.stack);
    res.status(500).json({ message: error.message });
  }
};

export const getCustomers = async (req, res) => {
  try {
    let query = {};
    if (req.user) {
      const userId = req.user.id || req.user._id;
      let userRole = req.user.role;
      if (!userRole) {
        const User = mongoose.model("User");
        const dbUser = await User.findById(userId).lean();
        if (dbUser) userRole = dbUser.role;
      }

      if (userRole === "cutting_master" || userRole === "stitching_master") {
        const orderQuery =
          userRole === "cutting_master"
            ? { "assignedTo.cuttingMaster": userId }
            : { "assignedTo.stitchingMaster": userId };
        const assignedOrders = await Order.find(orderQuery)
          .select("customer")
          .lean();
        const customerIds = assignedOrders.map((o) => o.customer);
        query = { _id: { $in: customerIds } };
      } else if (userRole !== "admin" && userRole !== "owner") {
        query = { _id: null };
      }
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    let orderQuery = { customer: req.params.id };
    if (req.user) {
      const userId = req.user.id || req.user._id;
      let userRole = req.user.role;
      if (!userRole) {
        const User = mongoose.model("User");
        const dbUser = await User.findById(userId).lean();
        if (dbUser) userRole = dbUser.role;
      }

      if (userRole === "cutting_master") {
        orderQuery["assignedTo.cuttingMaster"] = userId;
      } else if (userRole === "stitching_master") {
        orderQuery["assignedTo.stitchingMaster"] = userId;
      } else if (userRole !== "admin" && userRole !== "owner") {
        orderQuery._id = null;
      }
    }

    console.log("[getCustomerById] orderQuery:", JSON.stringify(orderQuery));

    // Fetch related stats based on allowed orders
    const orders = await Order.find(orderQuery).sort({ createdAt: -1 }).lean();
    console.log("[getCustomerById] orders found:", orders.length);

    // Masters may only open customers attached to at least one of their
    // assigned orders. Without this check, a guessed customer ID exposed the
    // customer's personal details even though the related orders were hidden.
    if (
      (req.user?.role === "cutting_master" ||
        req.user?.role === "stitching_master") &&
      orders.length === 0
    ) {
      return res.status(403).json({ message: "Not authorized to view this customer" });
    }

    const totalOrders = orders.length;
    const pendingRevenue = orders.reduce(
      (sum, order) => sum + (order.billing?.balanceDue || 0),
      0,
    );
    const totalRevenue = orders.reduce(
      (sum, order) => sum + (order.billing?.estimatedCost || 0),
      0,
    );

    res.status(200).json({
      customer,
      stats: {
        totalOrders,
        pendingRevenue,
        totalRevenue,
      },
      orders: orders.slice(0, 5), // Last 5 orders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    res.status(200).json({ message: "Customer deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { name, mobileNumber, address, email, gender, dateOfBirth } =
      req.body;
    let customer = await Customer.findById(req.params.id);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    if (mobileNumber && mobileNumber !== customer.mobileNumber) {
      const existing = await Customer.findOne({ mobileNumber });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Customer with this mobile number already exists" });
      }
    }

    if (name) customer.name = name;
    if (mobileNumber) customer.mobileNumber = mobileNumber;
    if (email !== undefined) customer.email = email;
    if (gender) customer.gender = gender;
    if (dateOfBirth) customer.dateOfBirth = dateOfBirth;
    if (address)
      customer.address =
        typeof address === "string" ? JSON.parse(address) : address;
    if (req.file) {
      customer.profileImage = req.file.path;
    } else if (req.body.removeProfileImage === "true") {
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
    const { query: searchQuery } = req.query;
    let dbQuery = {
      $or: [
        { name: { $regex: searchQuery, $options: "i" } },
        { mobileNumber: { $regex: searchQuery, $options: "i" } },
      ],
    };

    if (req.user) {
      const userId = req.user.id || req.user._id;
      let userRole = req.user.role;
      if (!userRole) {
        const User = mongoose.model("User");
        const dbUser = await User.findById(userId).lean();
        if (dbUser) userRole = dbUser.role;
      }

      if (userRole === "cutting_master" || userRole === "stitching_master") {
        const orderQuery =
          userRole === "cutting_master"
            ? { "assignedTo.cuttingMaster": userId }
            : { "assignedTo.stitchingMaster": userId };
        const assignedOrders = await Order.find(orderQuery)
          .select("customer")
          .lean();
        const customerIds = assignedOrders.map((o) => o.customer);
        dbQuery._id = { $in: customerIds };
      } else if (userRole !== "admin" && userRole !== "owner") {
        dbQuery._id = null;
      }
    }

    const customers = await Customer.find(dbQuery).lean();
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
      return res.status(404).json({ message: "Customer not found" });
    }

    if (!customer.measurements) {
      customer.measurements = new Map();
    }

    customer.measurements.set(outfitName, measurements);
    await customer.save();

    res.status(200).json({ message: "Measurements updated", customer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
