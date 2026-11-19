const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { MONGO_URI } = require("../config/env");
const { ADMIN, OPERATOR } = require("../constants/roles");
const { ENTRY, EXIT } = require("../constants/stockMovementTypes");
const { PLANIFIED, IN_PROGRESS, COMPLETED, CANCELLED } = require("../constants/status");
const User = require("../models/User");
const SystemState = require("../models/SystemState");
const RawMaterial = require("../models/RawMaterial");
const Product = require("../models/Product");
const ProductionOrder = require("../models/ProductionOrder");
const StockMovement = require("../models/StockMovement");

const materialSeeds = [
  { sku: "RM-STEEL-001", name: "Steel Sheet", description: "Cold-rolled steel sheet", unit: "kg", stockQuantity: 500, minimumStock: 50, unitCost: 2.5, supplier: "Atlas Metals" },
  { sku: "RM-ALU-001", name: "Aluminum Bar", description: "Aluminum bar stock", unit: "kg", stockQuantity: 250, minimumStock: 25, unitCost: 4.2, supplier: "Atlas Metals" },
  { sku: "RM-BOLT-001", name: "Steel Bolts", description: "M8 assembly bolts", unit: "unit", stockQuantity: 1000, minimumStock: 100, unitCost: 0.08, supplier: "FastenPro" },
  { sku: "RM-WOOD-001", name: "Pine Board", description: "Kiln-dried pine board", unit: "m", stockQuantity: 100, minimumStock: 15, unitCost: 3.75, supplier: "Safi Timber" },
];

const productSeeds = [
  {
    sku: "FG-CHAIR-001",
    name: "Factory Chair",
    description: "Steel-frame workshop chair",
    unit: "unit",
    stockQuantity: 12,
    minimumStock: 5,
    components: [["RM-STEEL-001", 4], ["RM-ALU-001", 1], ["RM-BOLT-001", 4]],
  },
  {
    sku: "FG-TABLE-001",
    name: "Assembly Table",
    description: "Pine-top assembly table with steel frame",
    unit: "unit",
    stockQuantity: 5,
    minimumStock: 2,
    components: [["RM-STEEL-001", 8], ["RM-WOOD-001", 1], ["RM-BOLT-001", 8]],
  },
];

async function upsertUser({ name, email, password, role }) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  return User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: { name, email: normalizedEmail, password: passwordHash, role, isActive: true },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function upsertMovement(key, movement) {
  const reason = "Seed data: " + key;
  return StockMovement.findOneAndUpdate(
    { reason },
    { $set: { ...movement, reason }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function seed() {
  const adminName = process.env.SEED_ADMIN_NAME || "FactoryFlow Admin";
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@grr.la";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const operatorName = process.env.SEED_OPERATOR_NAME || "FactoryFlow Operator";
  const operatorEmail = process.env.SEED_OPERATOR_EMAIL || "operator@grr.la";
  const operatorPassword = process.env.SEED_OPERATOR_PASSWORD || adminPassword;

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error("Set SEED_ADMIN_PASSWORD to a password of at least 8 characters.");
  }
  if (!operatorPassword || operatorPassword.length < 8) {
    throw new Error("Set SEED_OPERATOR_PASSWORD or provide a valid SEED_ADMIN_PASSWORD.");
  }

  await mongoose.connect(MONGO_URI);

  const admin = await upsertUser({
    name: adminName,
    email: adminEmail,
    password: adminPassword,
    role: ADMIN,
  });
  const operator = await upsertUser({
    name: operatorName,
    email: operatorEmail,
    password: operatorPassword,
    role: OPERATOR,
  });

  await SystemState.findOneAndUpdate(
    { key: "installation" },
    {
      $set: { value: { installed: true }, updatedBy: admin._id },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true, runValidators: true }
  );

  const materialsBySku = {};
  for (const materialData of materialSeeds) {
    materialsBySku[materialData.sku] = await RawMaterial.findOneAndUpdate(
      { sku: materialData.sku },
      { $set: materialData },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const productsBySku = {};
  for (const productData of productSeeds) {
    const composition = productData.components.map(([sku, quantity]) => {
      const material = materialsBySku[sku];
      if (!material) throw new Error("Missing seeded raw material: " + sku);
      return { rawMaterial: material._id, quantity };
    });

    productsBySku[productData.sku] = await Product.findOneAndUpdate(
      { sku: productData.sku },
      {
        $set: {
          sku: productData.sku,
          name: productData.name,
          description: productData.description,
          unit: productData.unit,
          stockQuantity: productData.stockQuantity,
          minimumStock: productData.minimumStock,
          composition,
          isActive: true,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const orderSeeds = [
    {
      key: "PO-PLANIFIED-001",
      productSku: "FG-CHAIR-001",
      quantity: 10,
      status: PLANIFIED,
      plannedStartDate: new Date(now + 2 * day),
      plannedEndDate: new Date(now + 4 * day),
      notes: "Seed data: PO-PLANIFIED-001",
    },
    {
      key: "PO-IN-PROGRESS-001",
      productSku: "FG-TABLE-001",
      quantity: 1,
      status: IN_PROGRESS,
      plannedStartDate: new Date(now - day),
      plannedEndDate: new Date(now + day),
      startedAt: new Date(now - 2 * 60 * 60 * 1000),
      notes: "Seed data: PO-IN-PROGRESS-001",
    },
    {
      key: "PO-COMPLETED-001",
      productSku: "FG-CHAIR-001",
      quantity: 2,
      status: COMPLETED,
      plannedStartDate: new Date(now - 4 * day),
      plannedEndDate: new Date(now - 3 * day),
      startedAt: new Date(now - 4 * day),
      finishedAt: new Date(now - 3 * day),
      notes: "Seed data: PO-COMPLETED-001",
    },
    {
      key: "PO-CANCELLED-001",
      productSku: "FG-TABLE-001",
      quantity: 3,
      status: CANCELLED,
      plannedStartDate: new Date(now - 2 * day),
      plannedEndDate: new Date(now - day),
      notes: "Seed data: PO-CANCELLED-001",
    },
  ];

  const ordersByKey = {};
  for (const orderData of orderSeeds) {
    const product = productsBySku[orderData.productSku];
    const productSeed = productSeeds.find((entry) => entry.sku === orderData.productSku);
    const compositionSnapshot = productSeed.components.map(([sku, quantity]) => ({
      rawMaterial: materialsBySku[sku]._id,
      name: materialsBySku[sku].name,
      unit: materialsBySku[sku].unit,
      quantity,
    }));

    ordersByKey[orderData.key] = await ProductionOrder.findOneAndUpdate(
      { notes: orderData.notes },
      {
        $set: {
          product: product._id,
          operator: operator._id,
          quantity: orderData.quantity,
          compositionSnapshot,
          status: orderData.status,
          plannedStartDate: orderData.plannedStartDate,
          plannedEndDate: orderData.plannedEndDate,
          startedAt: orderData.startedAt || null,
          finishedAt: orderData.finishedAt || null,
          createdBy: admin._id,
          notes: orderData.notes,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const totalConsumedByMaterial = {};
  for (const orderData of orderSeeds.filter((entry) => [IN_PROGRESS, COMPLETED].includes(entry.status))) {
    const order = ordersByKey[orderData.key];
    for (const component of order.compositionSnapshot) {
      const material = await RawMaterial.findById(component.rawMaterial);
      totalConsumedByMaterial[material.sku] =
        (totalConsumedByMaterial[material.sku] || 0) + component.quantity * order.quantity;
    }
  }

  for (const materialData of materialSeeds) {
    const material = materialsBySku[materialData.sku];
    await upsertMovement("opening-" + materialData.sku, {
      itemModel: "RawMaterial",
      item: material._id,
      movementType: ENTRY,
      quantity: materialData.stockQuantity + (totalConsumedByMaterial[materialData.sku] || 0),
      unitCost: materialData.unitCost,
      performedBy: admin._id,
    });
  }

  for (const productData of productSeeds) {
    const product = productsBySku[productData.sku];
    const completedQuantity = orderSeeds
      .filter((entry) => entry.productSku === productData.sku && entry.status === COMPLETED)
      .reduce((sum, entry) => sum + entry.quantity, 0);

    await upsertMovement("opening-" + productData.sku, {
      itemModel: "Product",
      item: product._id,
      movementType: ENTRY,
      quantity: Math.max(productData.stockQuantity - completedQuantity, 0),
      performedBy: admin._id,
    });
  }

  for (const orderData of orderSeeds.filter((entry) => [IN_PROGRESS, COMPLETED].includes(entry.status))) {
    const order = ordersByKey[orderData.key];
    for (const component of order.compositionSnapshot) {
      const material = await RawMaterial.findById(component.rawMaterial);
      await upsertMovement(orderData.key + "-consume-" + material.sku, {
        itemModel: "RawMaterial",
        item: material._id,
        movementType: EXIT,
        quantity: component.quantity * order.quantity,
        productionOrder: order._id,
        performedBy: operator._id,
      });
    }
  }

  for (const orderData of orderSeeds.filter((entry) => entry.status === COMPLETED)) {
    const order = ordersByKey[orderData.key];
    await upsertMovement(orderData.key + "-output", {
      itemModel: "Product",
      item: order.product,
      movementType: ENTRY,
      quantity: order.quantity,
      productionOrder: order._id,
      performedBy: operator._id,
    });
  }

  console.log(
    "Seed complete: 2 users, " +
      materialSeeds.length +
      " raw materials, " +
      productSeeds.length +
      " products, " +
      orderSeeds.length +
      " production orders, and stock movement history."
  );
}

seed()
  .catch((error) => {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
