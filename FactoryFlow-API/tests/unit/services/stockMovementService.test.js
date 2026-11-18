jest.mock("../../../src/repositories/rawMaterialRepository", () => ({
  adjustStock: jest.fn(),
}));
jest.mock("../../../src/repositories/productRepository", () => ({
  adjustStock: jest.fn(),
}));
jest.mock("../../../src/repositories/stockMovementRepository", () => ({
  create: jest.fn(),
}));

const mongoose = require("mongoose");
const rawMaterialRepository = require("../../../src/repositories/rawMaterialRepository");
const stockMovementRepository = require("../../../src/repositories/stockMovementRepository");
const stockMovementService = require("../../../src/services/stockMovementService");

const MATERIAL_ID = "650000000000000000000001";
const USER_ID = "650000000000000000000002";
let session;

beforeEach(() => {
  jest.clearAllMocks();
  session = {
    withTransaction: jest.fn(async (work) => work()),
    endSession: jest.fn(),
  };
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
});

afterEach(() => jest.restoreAllMocks());

describe("StockMovementService quantity rules", () => {
  it("rejects a zero or negative stock movement", async () => {
    await expect(stockMovementService.create("RawMaterial", MATERIAL_ID, {
      movementType: "ENTRY",
      quantity: 0,
    }, USER_ID)).rejects.toThrow("quantity must be a positive number");
    expect(rawMaterialRepository.adjustStock).not.toHaveBeenCalled();
  });

  it("records a positive entry and its stock change in the same transaction", async () => {
    rawMaterialRepository.adjustStock.mockResolvedValue({ isActive: true, stockQuantity: 4 });
    stockMovementRepository.create.mockResolvedValue({ quantity: 4 });

    await stockMovementService.create("RawMaterial", MATERIAL_ID, {
      movementType: "ENTRY",
      quantity: 4,
    }, USER_ID);

    expect(rawMaterialRepository.adjustStock).toHaveBeenCalledWith(
      MATERIAL_ID, "ENTRY", 4, session
    );
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ item: MATERIAL_ID, movementType: "ENTRY", quantity: 4 }),
      session
    );
  });

  it("does not record an exit when stock is insufficient", async () => {
    rawMaterialRepository.adjustStock.mockResolvedValue(null);

    await expect(stockMovementService.create("RawMaterial", MATERIAL_ID, {
      movementType: "EXIT",
      quantity: 2,
    }, USER_ID)).rejects.toThrow("Item not found or not enough stock");
    expect(stockMovementRepository.create).not.toHaveBeenCalled();
  });
});
