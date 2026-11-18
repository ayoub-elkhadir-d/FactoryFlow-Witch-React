const mongoose = require("mongoose");
const AppError = require("../utils/AppError");
const { OPERATOR } = require("../constants/roles");
const {
  PLANIFIED,
  IN_PROGRESS,
  COMPLETED,
  CANCELLED,
} = require("../constants/status");
const { EXIT } = require("../constants/stockMovementTypes");
const productRepository = require("../repositories/productRepository");
const productionOrderRepository = require("../repositories/productionOrderRepository");
const rawMaterialRepository = require("../repositories/rawMaterialRepository");
const stockMovementRepository = require("../repositories/stockMovementRepository");
const userRepository = require("../repositories/userRepository");

function referenceId(value) {
  return value && value._id ? value._id : value;
}

function orderItems(order) {
  if (order.items && order.items.length > 0) return order.items;

  // Support orders saved before the multi-product format was added.
  if (order.product && order.quantity > 0) {
    return [{
      product: order.product,
      quantity: order.quantity,
      compositionSnapshot: order.compositionSnapshot || [],
    }];
  }
  return [];
}

function validateOrderLineInputs(inputItems) {
  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    throw new AppError("An order must contain at least one product", 400);
  }

  const productIds = [];
  for (const item of inputItems) {
    if (!item || !mongoose.isValidObjectId(item.product)) {
      throw new AppError("Each order line must reference a valid product", 400);
    }
    if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new AppError("Each product quantity must be positive", 400);
    }
    productIds.push(String(item.product));
  }

  if (new Set(productIds).size !== productIds.length) {
    throw new AppError("A product can only appear once in an order", 400);
  }
  return inputItems.map((item) => ({ product: String(item.product), quantity: item.quantity }));
}
class ProductionOrderService {
  async buildOrderItems(inputItems, existingOrderItems = []) {
    const lineInputs = validateOrderLineInputs(inputItems);
    const oldLines = new Map(
      existingOrderItems.map((line) => [String(referenceId(line.product)), line])
    );
    const newLineInputs = lineInputs.filter((line) => !oldLines.has(line.product));
    const products = await Promise.all(
      newLineInputs.map((line) => productRepository.findByIdWithComposition(line.product))
    );
    const newLines = new Map();

    for (let index = 0; index < newLineInputs.length; index += 1) {
      const lineInput = newLineInputs[index];
      const product = products[index];
      if (!product || !product.isActive) {
        throw new AppError("Product not found", 404);
      }
      if (!Array.isArray(product.composition) || product.composition.length === 0) {
        throw new AppError(`Product ${product.name} must use at least one raw material`, 400);
      }

      const materialIds = product.composition.map((component) =>
        String(referenceId(component.rawMaterial))
      );
      if (new Set(materialIds).size !== materialIds.length) {
        throw new AppError(`Product ${product.name} has a duplicate material in its composition`, 400);
      }

      const compositionSnapshot = product.composition.map((component) => {
        const material = component.rawMaterial;
        if (
          !material ||
          !material.isActive ||
          typeof component.quantity !== "number" ||
          !Number.isFinite(component.quantity) ||
          component.quantity <= 0
        ) {
          throw new AppError("The product composition contains an invalid material or quantity", 400);
        }
        return {
          rawMaterial: referenceId(material),
          name: material.name,
          unit: material.unit,
          quantity: component.quantity,
        };
      });

      newLines.set(lineInput.product, {
        product: product.id || product._id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        quantity: lineInput.quantity,
        compositionSnapshot,
      });
    }

    return lineInputs.map((lineInput) => {
      const savedLine = oldLines.get(lineInput.product);
      if (!savedLine) return newLines.get(lineInput.product);

      const savedData = savedLine.toObject ? savedLine.toObject() : savedLine;
      return {
        product: referenceId(savedData.product),
        sku: savedData.sku || savedData.product?.sku || "",
        name: savedData.name || savedData.product?.name || "",
        unit: savedData.unit || savedData.product?.unit || "",
        quantity: lineInput.quantity,
        compositionSnapshot: savedData.compositionSnapshot || [],
      };
    });
  }

  async getAll(query = {}, user) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("page must be positive and limit must be between 1 and 100", 400);
    }

    const filter = {};
    if (user.role === OPERATOR) filter.operator = user.id;
    if (query.status) {
      const allowedStatuses = [PLANIFIED, IN_PROGRESS, COMPLETED, CANCELLED];
      if (!allowedStatuses.includes(query.status)) {
        throw new AppError("Invalid order status", 400);
      }
      filter.status = query.status;
    }

    if (query.product) {
      if (!mongoose.isValidObjectId(query.product)) {
        throw new AppError("Invalid product ID", 400);
      }
      filter.$or = [
        { product: query.product },
        { "items.product": query.product },
      ];
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        const from = new Date(query.from);
        if (Number.isNaN(from.getTime())) throw new AppError("Invalid from date", 400);
        filter.createdAt.$gte = from;
      }
      if (query.to) {
        const to = new Date(query.to);
        if (Number.isNaN(to.getTime())) throw new AppError("Invalid to date", 400);
        filter.createdAt.$lte = to;
      }
    }

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      productionOrderRepository.findAll(filter, skip, limit),
      productionOrderRepository.count(filter),
    ]);
    return { orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  getHistory(userId, query = {}) {
    return this.getAll(
      { ...query, status: COMPLETED },
      { id: userId, role: OPERATOR }
    );
  }

  async getById(id, user) {
    this.validateId(id, "order");
    const order = await productionOrderRepository.findById(id);
    if (!order) throw new AppError("Production order not found", 404);
    if (user.role === OPERATOR && String(referenceId(order.operator)) !== String(user.id)) {
      throw new AppError("You do not have access to this production order", 403);
    }
    return order;
  }

  async create(input = {}, userId) {
    const { items, product, quantity, operator, plannedStartDate, plannedEndDate, notes } = input || {};
    let inputItems = items;

    // Accept the old one-product request as a single line during the transition.
    if (inputItems === undefined && product !== undefined) {
      inputItems = [{ product, quantity }];
    } else if (inputItems !== undefined && (product !== undefined || quantity !== undefined)) {
      throw new AppError("Send either items or the legacy product and quantity fields", 400);
    }

    if (!mongoose.isValidObjectId(operator)) {
      throw new AppError("A valid operator is required", 400);
    }

    const orderLineItems = await this.buildOrderItems(inputItems);
    const operatorRecord = await userRepository.findById(operator);
    this.ensureOperator(operatorRecord);
    const firstItem = orderLineItems[0];

    return productionOrderRepository.create({
      items: orderLineItems,
      // Keep these aliases for existing one-product clients and old data tools.
      product: firstItem.product,
      quantity: firstItem.quantity,
      compositionSnapshot: firstItem.compositionSnapshot,
      operator,
      plannedStartDate,
      plannedEndDate,
      notes,
      createdBy: userId,
    });
  }

  async update(id, input = {}) {
    this.validateId(id, "order");
    const existing = await productionOrderRepository.findById(id);
    if (!existing) throw new AppError("Production order not found", 404);
    if (existing.status !== PLANIFIED) {
      throw new AppError("Only planified orders can be edited", 400);
    }

    const update = {};
    if (input.items !== undefined) {
      if (input.product !== undefined || input.quantity !== undefined) {
        throw new AppError("Send either items or the legacy product and quantity fields", 400);
      }
      const currentLines = orderItems(existing);
      const currentLinesByProduct = new Map(
        currentLines.map((line) => [String(referenceId(line.product)), line])
      );
      const requestedLines = await this.buildOrderItems(input.items, currentLines);
      update.items = requestedLines.map((line) => {
        const savedLine = currentLinesByProduct.get(String(line.product));
        if (!savedLine) return line;

        const savedData = savedLine.toObject ? savedLine.toObject() : savedLine;
        return {
          ...line,
          sku: savedData.sku || savedData.product?.sku || line.sku,
          name: savedData.name || savedData.product?.name || line.name,
          unit: savedData.unit || savedData.product?.unit || line.unit,
          compositionSnapshot: savedData.compositionSnapshot,
        };
      });
    } else if (input.product !== undefined || input.quantity !== undefined) {
      const existingItems = orderItems(existing);
      if (existingItems.length !== 1) {
        throw new AppError("Use items to update a multi-product order", 400);
      }

      if (input.product !== undefined) {
        const nextQuantity = input.quantity === undefined ? existingItems[0].quantity : input.quantity;
        update.items = await this.buildOrderItems([{ product: input.product, quantity: nextQuantity }], existingItems);
      } else {
        if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity) || input.quantity <= 0) {
          throw new AppError("Product quantity must be positive", 400);
        }
        if (existing.items && existing.items.length > 0) {
          const currentItem = existing.items[0].toObject
            ? existing.items[0].toObject()
            : existing.items[0];
          update.items = [{ ...currentItem, quantity: input.quantity }];
        } else {
          // Changing only the quantity must keep the original legacy snapshot.
          update.quantity = input.quantity;
        }
      }
    }

    if (update.items) {
      const firstItem = update.items[0];
      update.product = firstItem.product;
      update.quantity = firstItem.quantity;
      update.compositionSnapshot = firstItem.compositionSnapshot;
    }
    if (input.plannedStartDate !== undefined) update.plannedStartDate = input.plannedStartDate;
    if (input.plannedEndDate !== undefined) update.plannedEndDate = input.plannedEndDate;
    if (input.notes !== undefined) update.notes = input.notes;

    const order = await productionOrderRepository.updateIfStatus(id, PLANIFIED, update);
    if (!order) throw new AppError("Only planified orders can be edited", 400);
    return order;
  }

  async assign(id, operatorId) {
    this.validateId(id, "order");
    this.validateId(operatorId, "operator");
    const operator = await userRepository.findById(operatorId);
    this.ensureOperator(operator);
    const existing = await productionOrderRepository.findById(id);
    if (!existing) throw new AppError("Production order not found", 404);
    const order = await productionOrderRepository.updateIfStatus(
      id,
      PLANIFIED,
      { operator: operatorId }
    );
    if (!order) throw new AppError("Planified production order not found", 404);
    return order;
  }

  async cancel(id) {
    this.validateId(id, "order");
    const existing = await productionOrderRepository.findById(id);
    if (!existing) throw new AppError("Production order not found", 404);
    const order = await productionOrderRepository.updateIfStatus(
      id,
      PLANIFIED,
      { status: CANCELLED }
    );
    if (!order) throw new AppError("Only planified orders can be cancelled", 400);
    return order;
  }

  async start(id, userId) {
    this.validateId(id, "order");
    const session = await mongoose.startSession();
    let startedOrder;

    try {
      await session.withTransaction(async () => {
        const order = await productionOrderRepository.findById(id, session);
        if (!order) throw new AppError("Production order not found", 404);
        if (order.status !== PLANIFIED) {
          throw new AppError("Only planified orders can be started", 400);
        }
        if (String(referenceId(order.operator)) !== String(userId)) {
          throw new AppError("This production order is assigned to another operator", 403);
        }

        const lines = orderItems(order);
        if (lines.length === 0) {
          throw new AppError("An order must contain at least one product", 400);
        }

        // Sum material use across every product line before touching any stock.
        const requiredMaterials = new Map();
        for (const line of lines) {
          if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !line.compositionSnapshot?.length) {
            throw new AppError("The order contains an invalid product or composition", 400);
          }
          for (const component of line.compositionSnapshot) {
            if (!Number.isFinite(component.quantity) || component.quantity <= 0) {
              throw new AppError("The order contains an invalid material quantity", 400);
            }
            const key = String(referenceId(component.rawMaterial));
            const requiredQuantity = component.quantity * line.quantity;
            const current = requiredMaterials.get(key);
            if (current) {
              current.quantity += requiredQuantity;
            } else {
              requiredMaterials.set(key, {
                rawMaterial: referenceId(component.rawMaterial),
                name: component.name,
                unit: component.unit,
                quantity: requiredQuantity,
              });
            }
          }
        }

        const materials = await rawMaterialRepository.findByIds(
          [...requiredMaterials.keys()],
          session
        );
        const materialsById = new Map(materials.map((material) => [String(material.id), material]));

        // Check all materials first. Insufficient stock aborts before any deduction.
        for (const required of requiredMaterials.values()) {
          const material = materialsById.get(String(required.rawMaterial));
          if (!material || material.stockQuantity < required.quantity) {
            throw new AppError(`Insufficient stock for raw material: ${required.name}`, 400);
          }
        }

        for (const required of requiredMaterials.values()) {
          const material = await rawMaterialRepository.adjustStock(
            required.rawMaterial,
            EXIT,
            required.quantity,
            session
          );
          if (!material || !material.isActive) {
            throw new AppError(`Insufficient stock for raw material: ${required.name}`, 400);
          }
          await stockMovementRepository.create(
            {
              itemModel: "RawMaterial",
              item: required.rawMaterial,
              movementType: EXIT,
              quantity: required.quantity,
              productionOrder: order.id,
              performedBy: userId,
              reason: `Materials consumed by production order ${order.id}`,
            },
            session
          );
        }

        startedOrder = await productionOrderRepository.updateIfStatus(
          id,
          PLANIFIED,
          { status: IN_PROGRESS, startedAt: new Date() },
          session
        );
        if (!startedOrder) throw new AppError("Only planified orders can be started", 400);
      });
      return startedOrder;
    } finally {
      await session.endSession();
    }
  }

  async finish(id, userId) {
    this.validateId(id, "order");
    const order = await productionOrderRepository.findById(id);
    if (!order) throw new AppError("Production order not found", 404);
    if (String(referenceId(order.operator)) !== String(userId)) {
      throw new AppError("This production order is assigned to another operator", 403);
    }
    const completedOrder = await productionOrderRepository.updateIfStatus(
      id,
      IN_PROGRESS,
      { status: COMPLETED, finishedAt: new Date() }
    );
    if (!completedOrder) throw new AppError("Only in-progress orders can be finished", 400);
    return completedOrder;
  }

  validateId(id, label) {
    if (!id || !mongoose.isValidObjectId(id)) {
      throw new AppError(`Invalid ${label} ID`, 400);
    }
  }

  ensureOperator(user) {
    if (!user || !user.isActive || user.role !== OPERATOR) {
      throw new AppError("An active operator must be assigned", 400);
    }
  }
}

module.exports = new ProductionOrderService();





