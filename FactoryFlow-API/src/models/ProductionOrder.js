const mongoose = require("mongoose");
const {
  PLANIFIED,
  IN_PROGRESS,
  COMPLETED,
  CANCELLED,
} = require("../constants/status");

const materialSnapshotSchema = new mongoose.Schema(
  {
    rawMaterial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RawMaterial",
      required: true,
    },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: (quantity) => Number.isFinite(quantity) && quantity > 0,
        message: "Composition quantity must be positive",
      },
    },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: {
      type: Number,
      required: true,
      validate: {
        validator: (quantity) => Number.isFinite(quantity) && quantity > 0,
        message: "Product quantity must be positive",
      },
    },
    compositionSnapshot: {
      type: [materialSnapshotSchema],
      required: true,
      validate: {
        validator: (composition) => Array.isArray(composition) && composition.length > 0,
        message: "Each order product must contain at least one material",
      },
    },
  },
  { _id: false }
);

const legacyMaterialSnapshotSchema = new mongoose.Schema(
  {
    rawMaterial: { type: mongoose.Schema.Types.ObjectId, ref: "RawMaterial", required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    // New orders use one entry per distinct product in items.
    items: { type: [orderItemSchema], default: [] },
    // These fields keep older one-product documents readable.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    quantity: {
      type: Number,
      validate: {
        validator: (quantity) => quantity === undefined || (Number.isFinite(quantity) && quantity > 0),
        message: "Product quantity must be positive",
      },
    },
    compositionSnapshot: { type: [legacyMaterialSnapshotSchema], default: [] },
    operator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [PLANIFIED, IN_PROGRESS, COMPLETED, CANCELLED],
      default: PLANIFIED,
      required: true,
    },
    plannedStartDate: { type: Date },
    plannedEndDate: { type: Date },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

schema.index({ operator: 1, status: 1 });

schema.pre("validate", function () {
  if (this.items && this.items.length > 0) return;
  if (!this.product || !Number.isFinite(this.quantity) || this.quantity <= 0) {
    this.invalidate("items", "An order must contain at least one product with a positive quantity");
  }
});

module.exports = mongoose.model("ProductionOrder", schema);




