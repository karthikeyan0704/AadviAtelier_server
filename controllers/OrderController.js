import Order from "../models/Order.js";
import Customer from "../models/Customer.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { Expo } from "expo-server-sdk";

const expo = new Expo();

const sendPushNotification = async (tokens, title, body) => {
  let messages = [];
  for (let pushToken of tokens) {
    if (!Expo.isExpoPushToken(pushToken)) continue;
    messages.push({
      to: pushToken,
      sound: "default",
      title,
      body,
    });
  }
  let chunks = expo.chunkPushNotifications(messages);
  for (let chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch (error) {
      console.error("Error sending push notification", error);
    }
  }
};

const getWorkflowSteps = (dressType, isAariWorkStr) => {
  const isAari = String(isAariWorkStr) === "true";
  const type = String(dressType || "").toLowerCase();

  // Pants and Shirts typically don't need Hook and Hem
  const isPantOrShirt = type.includes("pant") || type.includes("shirt");

  let steps = [
    "Order Received",
    "Fabric / Lining Sourcing",
    "Marking",
    "Cutting",
    "Stitching",
  ];

  if (isAari) {
    steps.push("Aari Work / Embroidery");
  }

  steps.push("Checking");

  if (!isPantOrShirt) {
    steps.push("Hook and Hem");
  }

  steps.push("Ironing", "Packing", "Billing", "Delivery");

  return steps;
};

const getIndiaDayRange = (dayOffset = 0) => {
  const indiaNow = new Date(Date.now() + 330 * 60 * 1000);
  const start = new Date(Date.UTC(
    indiaNow.getUTCFullYear(),
    indiaNow.getUTCMonth(),
    indiaNow.getUTCDate() + dayOffset,
  ) - 330 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};

const formatOrderList = (orders) => {
  const listed = orders.slice(0, 4).map((order) => order.orderId).join(", ");
  return orders.length > 4 ? `${listed} and ${orders.length - 4} more` : listed;
};

const saveAndSendNotification = async ({ recipient, title, message, type, orderIds, notificationKey }) => {
  try {
    await Notification.create({
      recipient: recipient._id,
      title,
      message,
      type,
      orderIds,
      notificationKey,
    });
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }

  await sendPushNotification([recipient.expoPushToken], title, message);
  return true;
};

export const sendDailyDeliveryReminders = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: "Unauthorized scheduled task" });
  }

  try {
    const { start: tomorrowStart, end: tomorrowEnd } = getIndiaDayRange(1);
    const { start: todayStart } = getIndiaDayRange(0);
    const activeOrderQuery = { status: { $nin: ["Draft", "Delivered"] } };

    const [tomorrowOrders, overdueOrders, managers] = await Promise.all([
      Order.find({
        ...activeOrderQuery,
        deliveryDate: { $gte: tomorrowStart, $lt: tomorrowEnd },
      }).select("orderId").lean(),
      Order.find({
        ...activeOrderQuery,
        deliveryDate: { $lt: todayStart },
        workflow: { $elemMatch: { status: "Pending" } },
      })
        .select("orderId workflow assignedTo")
        .populate("assignedTo.cuttingMaster", "name expoPushToken")
        .populate("assignedTo.stitchingMaster", "name expoPushToken")
        .lean(),
      User.find({ role: { $in: ["owner", "admin"] } }).select("expoPushToken").lean(),
    ]);

    if (tomorrowOrders.length) {
      const title = "Tomorrow's Deliveries";
      const message = `${tomorrowOrders.length} order(s) due tomorrow: ${formatOrderList(tomorrowOrders)}.`;
      const notificationKey = `tomorrow-deliveries-${tomorrowStart.toISOString().slice(0, 10)}`;
      await Promise.all(managers.map((manager) => saveAndSendNotification({
        recipient: manager,
        title,
        message,
        type: "tomorrow_delivery",
        orderIds: tomorrowOrders.map((order) => order._id),
        notificationKey,
      })));
    }
    if (overdueOrders.length) {
      const title = "Overdue Orders";
      const message = `${overdueOrders.length} overdue order(s) need attention: ${formatOrderList(overdueOrders)}.`;
      const notificationKey = `overdue-orders-${todayStart.toISOString().slice(0, 10)}`;
      await Promise.all(managers.map((manager) => saveAndSendNotification({
        recipient: manager,
        title,
        message,
        type: "overdue_order",
        orderIds: overdueOrders.map((order) => order._id),
        notificationKey,
      })));
    }

    const masterTasks = new Map();
    const addMasterTasks = (master, order, allowedSteps) => {
      if (!master?.expoPushToken) return;
      const pendingSteps = (order.workflow || [])
        .filter((step) => allowedSteps.includes(step.step) && step.status === "Pending")
        .map((step) => step.step);
      if (!pendingSteps.length) return;

      const current = masterTasks.get(master._id.toString()) || { master, tasks: [], orderIds: [] };
      current.tasks.push(`${order.orderId}: ${pendingSteps.join(", ")}`);
      current.orderIds.push(order._id);
      masterTasks.set(master._id.toString(), current);
    };

    overdueOrders.forEach((order) => {
      addMasterTasks(order.assignedTo?.cuttingMaster, order, ["Marking", "Cutting"]);
      addMasterTasks(order.assignedTo?.stitchingMaster, order, ["Stitching", "Aari Work / Embroidery", "Hook and Hem"]);
    });

    for (const master of masterTasks.values()) {
      const listedTasks = master.tasks.slice(0, 3).join(" • ");
      const more = master.tasks.length > 3 ? ` and ${master.tasks.length - 3} more` : "";
      await saveAndSendNotification({
        recipient: master.master,
        title: "Overdue Task Reminder",
        message: `Please complete overdue task(s): ${listedTasks}${more}.`,
        type: "overdue_task",
        orderIds: master.orderIds,
        notificationKey: `overdue-tasks-${todayStart.toISOString().slice(0, 10)}`,
      });
    }

    res.status(200).json({
      message: "Daily reminders sent",
      tomorrowDeliveries: tomorrowOrders.length,
      overdueOrders: overdueOrders.length,
      mastersNotified: masterTasks.size,
    });
  } catch (error) {
    console.error("Daily delivery reminder error:", error);
    res.status(500).json({ message: "Failed to send daily reminders" });
  }
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
      additionalCosts,
      status,
    } = req.body;

    let referenceImage = "";
    let referenceImages = [];
    let sampleDressPhoto = "";
    let sampleDressPhotos = [];
    let audioInstruction = "";

    if (req.files) {
      if (req.files.referenceImage) {
        referenceImage = req.files.referenceImage[0].path;
      }
      if (req.files.referenceImages) {
        referenceImages = req.files.referenceImages.map((f) => f.path);
        if (!referenceImage && referenceImages.length > 0) {
          referenceImage = referenceImages[0];
        }
      }
      if (req.files.sampleDressPhoto) {
        sampleDressPhoto = req.files.sampleDressPhoto[0].path;
      }
      if (req.files.sampleDressPhotos) {
        sampleDressPhotos = req.files.sampleDressPhotos.map((f) => f.path);
        if (!sampleDressPhoto && sampleDressPhotos.length > 0) {
          sampleDressPhoto = sampleDressPhotos[0];
        }
      }
      if (req.files.audioInstruction) {
        audioInstruction = req.files.audioInstruction[0].path;
      }
    }

    // Parse measurements if it comes as a string (happens with multipart/form-data)
    let parsedMeasurements =
      typeof measurements === "string"
        ? JSON.parse(measurements)
        : measurements;
    if (sampleDressPhoto) {
      parsedMeasurements.sampleDressPhoto = sampleDressPhoto;
    }

    // Parse billing if it comes as a string
    let parsedBilling =
      typeof billing === "string" ? JSON.parse(billing) : billing;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const lastOrder = await Order.findOne({
      orderId: new RegExp(`^AAD-${dateStr}-`),
    }).sort({ orderId: -1 });

    let sequenceNumber = 1;
    if (lastOrder && lastOrder.orderId) {
      const parts = lastOrder.orderId.split("-");
      if (parts.length >= 3) {
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) {
          sequenceNumber = lastSeq + 1;
        }
      }
    }

    const sequenceStr = sequenceNumber.toString().padStart(4, "0");
    const orderId = `AAD-${dateStr}-${sequenceStr}`;

    // Initialize dynamic workflow based on dress type
    const dynamicSteps = getWorkflowSteps(dressType, isAariWork);
    const workflow = dynamicSteps.map((step) => ({
      step,
      status: "Pending",
    }));

    const isDraft = status === "Draft";
    if (!isDraft) {
      workflow[0].status = "Completed";
    }

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
      status: isDraft ? "Draft" : "Pending",
      billing: {
        ...parsedBilling,
        balanceDue:
          (parsedBilling.estimatedCost || 0) - (parsedBilling.advancePaid || 0),
      },
      assignedTo: !isDraft && assignedTo ? JSON.parse(assignedTo) : null,
      createdBy: req.user ? req.user.id : null,
      extraCharges: req.body.extraCharges
        ? JSON.parse(req.body.extraCharges)
        : additionalCosts && Number(additionalCosts) > 0
          ? [
              {
                description: description || "Extra Charge",
                amount: Number(additionalCosts),
              },
            ]
          : [],
    });

    await order.save();

    // Notify assigned staff if order is not a draft
    if (!isDraft && order.assignedTo) {
      const tokens = [];
      if (order.assignedTo.cuttingMaster) {
        const cmUser = await User.findById(order.assignedTo.cuttingMaster);
        if (cmUser && cmUser.expoPushToken) tokens.push(cmUser.expoPushToken);
      }
      if (order.assignedTo.stitchingMaster) {
        const smUser = await User.findById(order.assignedTo.stitchingMaster);
        if (smUser && smUser.expoPushToken) tokens.push(smUser.expoPushToken);
      }
      if (tokens.length > 0) {
        const shortId = order.orderId ? order.orderId.split("-").pop() : "";
        await sendPushNotification(
          tokens,
          "New Work Assigned ✂️",
          `Order #${shortId} has been assigned to you.`,
        );
      }
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrders = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let userRole = req.user.role;

    if (!userRole) {
      const User = mongoose.model("User");
      const dbUser = await User.findById(userId).lean();
      if (dbUser) userRole = dbUser.role;
    }

    let query = {};
    if (userRole === "cutting_master") {
      query = { "assignedTo.cuttingMaster": userId, status: { $ne: "Draft" } };
    } else if (userRole === "stitching_master") {
      query = { "assignedTo.stitchingMaster": userId, status: { $ne: "Draft" } };
    } else if (userRole === "owner" || userRole === "admin") {
      query = {};
    } else {
      query = { _id: null };
    }

    const orders = await Order.find(query)
      .populate("customer")
      .populate("createdBy", "name role")
      .populate("assignedTo.cuttingMaster", "name")
      .populate("assignedTo.stitchingMaster", "name")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer")
      .populate("createdBy", "name role")
      .lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (req.user) {
      const userId = req.user.id || req.user._id;
      let userRole = req.user.role;
      if (!userRole) {
        const User = mongoose.model("User");
        const dbUser = await User.findById(userId).lean();
        if (dbUser) userRole = dbUser.role;
      }

      if (
        userRole === "cutting_master" &&
        order.assignedTo?.cuttingMaster?.toString() !== userId.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this order" });
      } else if (
        userRole === "stitching_master" &&
        order.assignedTo?.stitchingMaster?.toString() !== userId.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this order" });
      } else if (
        userRole !== "cutting_master" &&
        userRole !== "stitching_master" &&
        userRole !== "admin" &&
        userRole !== "owner"
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this order" });
      }
    }

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderWorkflow = async (req, res) => {
  try {
    const { orderId, stepIndex, status } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "Draft") {
      return res.status(400).json({ message: "Confirm this draft before updating its workflow" });
    }

    if (req.user) {
      const role = req.user.role;
      const userId = req.user.id;
      const stepName = order.workflow[stepIndex]?.step;

      if (role !== "owner" && role !== "admin") {
        if (role === "cutting_master") {
          if (order.assignedTo?.cuttingMaster?.toString() !== userId) {
            return res.status(403).json({
              message: "Not assigned to this order as cutting master",
            });
          }
          if (!["Marking", "Cutting"].includes(stepName)) {
            return res.status(403).json({
              message:
                "Cutting masters can only update Marking and Cutting steps",
            });
          }
        } else if (role === "stitching_master") {
          if (order.assignedTo?.stitchingMaster?.toString() !== userId) {
            return res.status(403).json({
              message: "Not assigned to this order as stitching master",
            });
          }
          if (
            !["Stitching", "Aari Work / Embroidery", "Hook and Hem"].includes(
              stepName,
            )
          ) {
            return res.status(403).json({
              message:
                "Stitching masters can only update Stitching, Aari and Hook/Hem steps",
            });
          }
        } else {
          return res
            .status(403)
            .json({ message: "Unauthorized role for workflow updates" });
        }
      }
    }

    if (order.workflow[stepIndex]) {
      order.workflow[stepIndex].status = status;
      order.workflow[stepIndex].updatedAt = Date.now();

      // Update overall status based on workflow
      if (status === "Completed") {
        if (stepIndex === order.workflow.length - 1) {
          order.status = "Delivered";
        } else if (stepIndex >= 4) {
          // After stitching
          order.status = "Ready";
        } else {
          order.status = "In Progress";
        }
      }

      await order.save();

      // If completed by staff, notify owners
      if (
        status === "Completed" &&
        req.user &&
        (req.user.role === "cutting_master" ||
          req.user.role === "stitching_master")
      ) {
        const owners = await User.find({ role: { $in: ["owner", "admin"] } });
        const tokens = owners.map((o) => o.expoPushToken).filter(Boolean);
        if (tokens.length > 0) {
          const shortId = order.orderId ? order.orderId.split("-").pop() : "";
          await sendPushNotification(
            tokens,
            "Task Completed ✅",
            `${order.workflow[stepIndex].step} completed by ${req.user.name || "Staff"} for Order #${shortId}`,
          );
        }
      }

      res.status(200).json(order);
    } else {
      res.status(400).json({ message: "Invalid step index" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderBilling = async (req, res) => {
  try {
    const { orderId, totalPaid } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const existingAdvance = order.billing.advancePaid || 0;
    const normalizedTotalPaid = Math.max(totalPaid || 0, existingAdvance);
    order.billing.totalPaid = normalizedTotalPaid;
    order.billing.balanceDue = Math.max(order.billing.estimatedCost - normalizedTotalPaid, 0);

    if (order.billing.balanceDue <= 0) {
      order.billing.paymentStatus = "Paid";
    } else if (normalizedTotalPaid > 0) {
      order.billing.paymentStatus = "Partially Paid";
    } else {
      order.billing.paymentStatus = "Unpaid";
    }

    await order.save();
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let userRole = req.user.role;

    if (!userRole) {
      const User = mongoose.model("User");
      const dbUser = await User.findById(userId).lean();
      if (dbUser) userRole = dbUser.role;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let baseQuery = {};
    if (userRole === "cutting_master") {
      baseQuery = { "assignedTo.cuttingMaster": userId };
    } else if (userRole === "stitching_master") {
      baseQuery = { "assignedTo.stitchingMaster": userId };
    } else if (userRole === "owner" || userRole === "admin") {
      baseQuery = {};
    } else {
      baseQuery = { _id: null };
    }

    const stats = {
      todayDeliveries: await Order.countDocuments({
        ...baseQuery,
        deliveryDate: { $gte: today, $lt: tomorrow },
      }),
      pendingOrders: await Order.countDocuments({
        ...baseQuery,
        status: "Pending",
      }),
      draftOrders: await Order.countDocuments({
        ...baseQuery,
        status: "Draft",
      }),
      overdueOrders: await Order.countDocuments({
        ...baseQuery,
        deliveryDate: { $lt: today },
        status: { $nin: ["Delivered", "Draft"] },
        workflow: { $elemMatch: { status: "Pending" } },
      }),
      underStitching: await Order.countDocuments({
        ...baseQuery,
        $and: [
          {
            workflow: { $elemMatch: { step: "Cutting", status: "Completed" } },
          },
          {
            workflow: { $elemMatch: { step: "Stitching", status: "Pending" } },
          },
        ],
      }), // Cutting done, stitching pending
      aariWorkPending: await Order.countDocuments({
        ...baseQuery,
        workflow: {
          $elemMatch: { step: "Aari Work / Embroidery", status: "Pending" },
        },
      }),
      completedOrders: await Order.countDocuments({
        ...baseQuery,
        status: "Delivered",
      }),
      paymentPending: await Order.countDocuments({
        ...baseQuery,
        "billing.paymentStatus": { $ne: "Paid" },
      }),
    };

    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getWhatsAppLink = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer")
      .lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const { customer, orderId, status, workflow } = order;
    const currentStep =
      workflow.find((s) => s.status === "Pending") ||
      workflow[workflow.length - 1];

    const message = `Hello ${customer.name}, your order ${orderId} is currently: ${status}. \nCurrent stage: ${currentStep.step}. \nThank you for choosing Aadvi Designer Studio!`;

    const encodedMessage = encodeURIComponent(message);
    const link = `https://wa.me/91${customer.mobileNumber.replace(/\D/g, "")}?text=${encodedMessage}`;

    res.status(200).json({ link, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPaymentLink = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer")
      .lean();
    if (!order) return res.status(404).send("Order not found");

    const balanceDue = order.billing?.balanceDue || 0;
    if (balanceDue <= 0)
      return res.send(
        '<h3 style="text-align:center;margin-top:50px;font-family:sans-serif;">This order is already fully paid! Thank you.</h3>',
      );

    const upiId = "sathyaatamilselvan-1@oksbi";
    const upiName = "Sathyaa Tamilselvan";
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${balanceDue}&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Pay Aadvi Designer Studio</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px 20px; background: #f8f9fa; }
          .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          h2 { color: #5959be; margin-top: 0; }
          .amount { font-size: 32px; font-weight: bold; color: #333; margin: 20px 0; }
          .btn { display: block; background: #5959be; color: white; padding: 15px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px; margin-top: 20px; }
          .qr-box { margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
          img { max-width: 100%; border-radius: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Aadvi Designer Studio</h2>
          <p>Payment for Order: <b>${order.orderId}</b></p>
          <div class="amount">₹${balanceDue}</div>
          
          <a href="${upiUrl}" class="btn">Pay Now via UPI App</a>
          
          <div class="qr-box">
            <p style="color: #666; font-size: 14px; margin-bottom: 15px;">Or scan this QR code from another device:</p>
            <img src="${qrUrl}" alt="UPI QR Code" />
          </div>
        </div>
        <script>
          if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            window.location.href = "${upiUrl}";
          }
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    res.status(500).send("Error loading payment page");
  }
};

export const getInvoiceWhatsAppLink = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer")
      .lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const {
      customer,
      orderId,
      billing,
      dressType,
      category,
      quantity,
      extraCharges,
    } = order;

    let isEstimate = req.query.type === "estimate";
    let title = isEstimate ? "🧾 *ESTIMATE INVOICE*" : "🧾 *FINAL INVOICE*";

    let extraChargeText = "";
    if (extraCharges && extraCharges.length > 0) {
      extraChargeText =
        "\n" +
        extraCharges
          .map((ec) => `Extra (${ec.description}): ₹${ec.amount}`)
          .join("\n");
    }

    const balanceDue = billing?.balanceDue || 0;

    let message = `*Aadvi Designer Studio*\n${title}\n\n*Order ID:* ${orderId}\n*Customer:* ${customer.name}\n*Item:* ${category} - ${dressType} (Qty: ${quantity})\n\n*Billing Details:*\nStitching Price: ₹${(order.stitchingPrice || 0) * (quantity || 1)}${extraChargeText}\nTotal Amount: ₹${billing?.estimatedCost || 0}\nTotal Paid: ₹${billing?.totalPaid || billing?.advancePaid || 0}\n*Balance Due:* ₹${balanceDue}`;

    if (balanceDue > 0) {
      const paymentLink = `https://aadvi-atelier-server.vercel.app/api/orders/${order._id}/pay`;
      message += `\n\n*Pay Balance via UPI:*\nClick the secure payment link below to automatically open GPay/PhonePe and pay the pending balance of ₹${balanceDue}:\n${paymentLink}`;
    }

    message += `\n\nThank you for choosing Aadvi Designer Studio! 🙏`;

    const encodedMessage = encodeURIComponent(message);
    const link = `https://wa.me/91${customer.mobileNumber.replace(/\D/g, "")}?text=${encodedMessage}`;

    res.status(200).json({ link, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status === "Draft" && status === "Pending" && order.workflow?.length) {
      order.workflow[0].status = "Completed";
      order.workflow[0].updatedAt = Date.now();
    }
    order.status = status;
    await order.save();

    const populated = await Order.findById(order._id).populate("customer");
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateBill = async (req, res) => {
  try {
    const { additionalCost, description } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const addedCost = Number(additionalCost) || 0;
    order.additionalCosts = (order.additionalCosts || 0) + addedCost;
    order.billing.estimatedCost = order.billing.estimatedCost + addedCost;
    order.billing.balanceDue =
      order.billing.estimatedCost -
      (order.billing.totalPaid || order.billing.advancePaid || 0);

    if (addedCost > 0) {
      order.extraCharges.push({
        description: description || "Extra Work",
        amount: addedCost,
      });
    }

    if (order.billing.balanceDue <= 0) {
      order.billing.paymentStatus = "Paid";
    } else if (
      (order.billing.totalPaid || order.billing.advancePaid || 0) > 0
    ) {
      order.billing.paymentStatus = "Partially Paid";
    } else {
      order.billing.paymentStatus = "Unpaid";
    }

    await order.save();
    const populated = await Order.findById(order._id).populate("customer");
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userRole = req.user.role || (await User.findById(userId).select("role").lean())?.role;
    if (userRole !== "owner" && userRole !== "admin") {
      return res.status(403).json({ message: "Only owners and admins can delete orders" });
    }

    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStaffOrders = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let userRole = req.user.role;

    if (!userRole) {
      const User = mongoose.model("User");
      const dbUser = await User.findById(userId).lean();
      if (dbUser) userRole = dbUser.role;
    }

    let query = {};
    if (userRole === "cutting_master") {
      query = { "assignedTo.cuttingMaster": userId, status: { $ne: "Draft" } };
    } else if (userRole === "stitching_master") {
      query = { "assignedTo.stitchingMaster": userId, status: { $ne: "Draft" } };
    } else if (userRole === "owner" || userRole === "admin") {
      query = {};
    } else {
      query = { _id: null };
    }

    const orders = await Order.find(query)
      .populate("customer")
      .sort({ createdAt: -1 })
      .lean();
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
    if (!order) return res.status(404).json({ message: "Order not found" });

    let currentAssignedTo = {};

    // Check if assignedTo is already a proper object (not an ObjectId from the old schema)
    if (
      order.assignedTo &&
      typeof order.assignedTo === "object" &&
      !order.assignedTo._bsontype &&
      !order.assignedTo.toHexString
    ) {
      currentAssignedTo = order.assignedTo;
    }

    if (cuttingMaster !== undefined)
      currentAssignedTo.cuttingMaster = cuttingMaster;
    if (stitchingMaster !== undefined)
      currentAssignedTo.stitchingMaster = stitchingMaster;

    await Order.updateOne(
      { _id: orderId },
      { $set: { assignedTo: currentAssignedTo } },
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
      const shortId = order.orderId ? order.orderId.split("-").pop() : "";
      await sendPushNotification(
        tokens,
        "New Work Assigned ✂️",
        `Order #${shortId} has been assigned to you.`,
      );
    }

    const populated = await Order.findById(orderId).populate("customer");
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
