const mongoose = require("mongoose");

const compositionSchema = new mongoose.Schema(
  {
    rawMaterial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RawMaterial",
      required: true,
    },
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

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    stockQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },
    minimumStock: {
      type: Number,
      min: 0,
      default: 0,
    },
    composition: {
      type: [compositionSchema],
      default: [],
      validate: {
        validator: (composition) => Array.isArray(composition) && composition.length > 0,
        message: "A product must use at least one raw material",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
