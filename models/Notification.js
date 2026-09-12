import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["tomorrow_delivery", "overdue_order", "overdue_task"],
      required: true,
    },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    notificationKey: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, notificationKey: 1 }, { unique: true });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
