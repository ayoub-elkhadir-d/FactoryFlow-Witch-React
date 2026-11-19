jest.mock("../../../src/repositories/productRepository", () => ({
  findByIdWithComposition: jest.fn(),
}));
jest.mock("../../../src/repositories/productionOrderRepository", () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  count: jest.fn(),
  findById: jest.fn(),
  updateIfStatus: jest.fn(),
}));
jest.mock("../../../src/repositories/rawMaterialRepository", () => ({
  findByIds: jest.fn(),
  adjustStock: jest.fn(),
}));
jest.mock("../../../src/repositories/stockMovementRepository", () => ({
  create: jest.fn(),
}));
jest.mock("../../../src/repositories/userRepository", () => ({
  findById: jest.fn(),
}));

const mongoose = require("mongoose");
const productRepository = require("../../../src/repositories/productRepository");
const productionOrderRepository = require("../../../src/repositories/productionOrderRepository");
const rawMaterialRepository = require("../../../src/repositories/rawMaterialRepository");
const stockMovementRepository = require("../../../src/repositories/stockMovementRepository");
const userRepository = require("../../../src/repositories/userRepository");
const productionOrderService = require("../../../src/services/productionOrderService");

const IDS = {
  admin: "650000000000000000000001",
  operator: "650000000000000000000002",
  productA: "650000000000000000000003",
  productB: "650000000000000000000004",
  materialX: "650000000000000000000005",
  materialY: "650000000000000000000006",
  order: "650000000000000000000007",
};

function product(id, name, composition) {
  return {
    id,
    _id: id,
    sku: `SKU-${name}`,
    name,
    unit: "unit",
    isActive: true,
    composition,
  };
}

function material(id, name, quantity, unit = "kg") {
  return {
    rawMaterial: { _id: id, id, name, unit, isActive: true },
    name,
    unit,
    quantity,
  };
}

let session;

beforeEach(() => {
  jest.clearAllMocks();
  session = {
    withTransaction: jest.fn(async (work) => work()),
    endSession: jest.fn(),
  };
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ProductionOrderService multi-product orders", () => {
  it("requires at least one product line", async () => {
    await expect(productionOrderService.create({ operator: IDS.operator }, IDS.admin))
      .rejects.toThrow("An order must contain at least one product");
    expect(productionOrderRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a product that appears twice in the same order", async () => {
    await expect(productionOrderService.create({
      operator: IDS.operator,
      items: [
        { product: IDS.productA, quantity: 1 },
        { product: IDS.productA, quantity: 2 },
      ],
    }, IDS.admin)).rejects.toThrow("A product can only appear once in an order");
    expect(productRepository.findByIdWithComposition).not.toHaveBeenCalled();
  });

  it("copies each product composition into the order", async () => {
    productRepository.findByIdWithComposition
      .mockResolvedValueOnce(product(IDS.productA, "Product A", [material(IDS.materialX, "Material X", 2)]))
      .mockResolvedValueOnce(product(IDS.productB, "Product B", [
        material(IDS.materialX, "Material X", 3),
        material(IDS.materialY, "Material Y", 1),
      ]));
    userRepository.findById.mockResolvedValue({ role: "OPERATOR", isActive: true });
    productionOrderRepository.create.mockImplementation(async (data) => data);

    const order = await productionOrderService.create({
      operator: IDS.operator,
      items: [
        { product: IDS.productA, quantity: 10 },
        { product: IDS.productB, quantity: 5 },
      ],
    }, IDS.admin);

    expect(order.items).toHaveLength(2);
    expect(order.items[0].compositionSnapshot[0]).toMatchObject({
      rawMaterial: IDS.materialX,
      name: "Material X",
      quantity: 2,
    });
    expect(order.items[1].compositionSnapshot).toHaveLength(2);
    expect(order.product).toBe(IDS.productA);
    expect(order.quantity).toBe(10);
  });

  it("adds material needs across all products and records each total once", async () => {
    const order = {
      id: IDS.order,
      operator: IDS.operator,
      status: "PLANIFIED",
      items: [
        { quantity: 10, compositionSnapshot: [material(IDS.materialX, "Material X", 2)] },
        { quantity: 5, compositionSnapshot: [
          material(IDS.materialX, "Material X", 3),
          material(IDS.materialY, "Material Y", 1),
        ] },
      ],
    };
    productionOrderRepository.findById.mockResolvedValue(order);
    rawMaterialRepository.findByIds.mockResolvedValue([
      { id: IDS.materialX, stockQuantity: 40, isActive: true },
      { id: IDS.materialY, stockQuantity: 5, isActive: true },
    ]);
    rawMaterialRepository.adjustStock.mockResolvedValue({ isActive: true });
    productionOrderRepository.updateIfStatus.mockResolvedValue({ ...order, status: "IN_PROGRESS" });

    await productionOrderService.start(IDS.order, IDS.operator);

    expect(rawMaterialRepository.adjustStock).toHaveBeenCalledTimes(2);
    expect(rawMaterialRepository.adjustStock).toHaveBeenCalledWith(IDS.materialX, "EXIT", 35, session);
    expect(rawMaterialRepository.adjustStock).toHaveBeenCalledWith(IDS.materialY, "EXIT", 5, session);
    expect(stockMovementRepository.create).toHaveBeenCalledTimes(2);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ item: IDS.materialX, quantity: 35 }), session
    );
    expect(productionOrderRepository.updateIfStatus).toHaveBeenCalledWith(
      IDS.order, "PLANIFIED", expect.objectContaining({ status: "IN_PROGRESS" }), session
    );
  });

  it("does not deduct any material when one total is insufficient", async () => {
    const order = {
      id: IDS.order,
      operator: IDS.operator,
      status: "PLANIFIED",
      items: [
        { quantity: 10, compositionSnapshot: [material(IDS.materialX, "Material X", 2)] },
        { quantity: 5, compositionSnapshot: [
          material(IDS.materialX, "Material X", 3),
          material(IDS.materialY, "Material Y", 1),
        ] },
      ],
    };
    productionOrderRepository.findById.mockResolvedValue(order);
    rawMaterialRepository.findByIds.mockResolvedValue([
      { id: IDS.materialX, stockQuantity: 100, isActive: true },
      { id: IDS.materialY, stockQuantity: 4, isActive: true },
    ]);

    await expect(productionOrderService.start(IDS.order, IDS.operator))
      .rejects.toThrow("Insufficient stock for raw material: Material Y");
    expect(rawMaterialRepository.adjustStock).not.toHaveBeenCalled();
    expect(stockMovementRepository.create).not.toHaveBeenCalled();
    expect(productionOrderRepository.updateIfStatus).not.toHaveBeenCalled();
  });

  it("does not deduct stock when an order has already started", async () => {
    productionOrderRepository.findById.mockResolvedValue({
      id: IDS.order,
      operator: IDS.operator,
      status: "IN_PROGRESS",
      items: [],
    });

    await expect(productionOrderService.start(IDS.order, IDS.operator))
      .rejects.toThrow("Only planified orders can be started");
    expect(rawMaterialRepository.findByIds).not.toHaveBeenCalled();
    expect(rawMaterialRepository.adjustStock).not.toHaveBeenCalled();
  });

  it("filters an operator's order list by that operator", async () => {
    productionOrderRepository.findAll.mockResolvedValue([]);
    productionOrderRepository.count.mockResolvedValue(0);

    await productionOrderService.getAll({}, { id: IDS.operator, role: "OPERATOR" });

    expect(productionOrderRepository.findAll).toHaveBeenCalledWith(
      { operator: IDS.operator }, 0, 20
    );
  });
});



describe("ProductionOrderService snapshot rules", () => {
  it("keeps the saved composition when only an order quantity changes", async () => {
    const savedSnapshot = [{ rawMaterial: IDS.materialX, name: "Old material name", unit: "kg", quantity: 2 }];
    const existing = {
      status: "PLANIFIED",
      items: [{ product: IDS.productA, quantity: 10, compositionSnapshot: savedSnapshot }],
    };
    productionOrderRepository.findById.mockResolvedValue(existing);
    productionOrderRepository.updateIfStatus.mockResolvedValue({ ...existing, items: [{ ...existing.items[0], quantity: 7 }] });

    await productionOrderService.update(IDS.order, { quantity: 7 });

    expect(productRepository.findByIdWithComposition).not.toHaveBeenCalled();
    expect(productionOrderRepository.updateIfStatus).toHaveBeenCalledWith(
      IDS.order,
      "PLANIFIED",
      expect.objectContaining({
        quantity: 7,
        items: [expect.objectContaining({ quantity: 7, compositionSnapshot: savedSnapshot })],
      })
    );
  });
});

describe("ProductionOrderService status rules", () => {
  it("does not cancel an order that has already started", async () => {
    productionOrderRepository.findById.mockResolvedValue({ status: "IN_PROGRESS" });
    productionOrderRepository.updateIfStatus.mockResolvedValue(null);

    await expect(productionOrderService.cancel(IDS.order))
      .rejects.toThrow("Only planified orders can be cancelled");
    expect(productionOrderRepository.updateIfStatus).toHaveBeenCalledWith(
      IDS.order, "PLANIFIED", { status: "CANCELLED" }
    );
  });

  it("finishes an in-progress order assigned to the operator", async () => {
    const order = { operator: IDS.operator, status: "IN_PROGRESS" };
    productionOrderRepository.findById.mockResolvedValue(order);
    productionOrderRepository.updateIfStatus.mockResolvedValue({ ...order, status: "COMPLETED" });

    const result = await productionOrderService.finish(IDS.order, IDS.operator);

    expect(result.status).toBe("COMPLETED");
    expect(productionOrderRepository.updateIfStatus).toHaveBeenCalledWith(
      IDS.order, "IN_PROGRESS", expect.objectContaining({ status: "COMPLETED" })
    );
  });

  it("does not let an operator finish another operator's order", async () => {
    productionOrderRepository.findById.mockResolvedValue({
      operator: IDS.operator,
      status: "IN_PROGRESS",
    });

    await expect(productionOrderService.finish(IDS.order, IDS.admin))
      .rejects.toThrow("This production order is assigned to another operator");
    expect(productionOrderRepository.updateIfStatus).not.toHaveBeenCalled();
  });
});


  it("keeps snapshots when existing product lines are resubmitted", async () => {
    const savedSnapshot = [{ rawMaterial: IDS.materialX, name: "Original X", unit: "kg", quantity: 2 }];
    const existing = {
      status: "PLANIFIED",
      items: [{
        product: IDS.productA,
        sku: "OLD-SKU",
        name: "Original product name",
        unit: "unit",
        quantity: 10,
        compositionSnapshot: savedSnapshot,
      }],
    };
    productionOrderRepository.findById.mockResolvedValue(existing);
    productionOrderRepository.updateIfStatus.mockResolvedValue(existing);

    await productionOrderService.update(IDS.order, {
      items: [{ product: IDS.productA, quantity: 7 }],
    });

    expect(productRepository.findByIdWithComposition).not.toHaveBeenCalled();
    expect(productionOrderRepository.updateIfStatus).toHaveBeenCalledWith(
      IDS.order,
      "PLANIFIED",
      expect.objectContaining({
        items: [expect.objectContaining({
          name: "Original product name",
          quantity: 7,
          compositionSnapshot: savedSnapshot,
        })],
      })
    );
  });
