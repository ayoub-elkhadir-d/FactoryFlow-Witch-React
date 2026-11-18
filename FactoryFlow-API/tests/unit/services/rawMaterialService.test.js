jest.mock("../../../src/repositories/rawMaterialRepository", () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findLowStock: jest.fn(),
}));
jest.mock("../../../src/services/stockMovementService", () => ({
  create: jest.fn(),
}));

const rawMaterialRepository = require("../../../src/repositories/rawMaterialRepository");
const rawMaterialService = require("../../../src/services/rawMaterialService");

beforeEach(() => jest.clearAllMocks());

describe("RawMaterialService stock threshold rules", () => {
  it("allows a zero minimum stock threshold", async () => {
    rawMaterialRepository.create.mockResolvedValue({ sku: "RM-1", minimumStock: 0 });

    const result = await rawMaterialService.create({
      sku: "RM-1",
      name: "Material",
      unit: "kg",
      minimumStock: 0,
    });

    expect(result.minimumStock).toBe(0);
  });

  it("rejects a negative minimum stock threshold", async () => {
    await expect(rawMaterialService.create({
      sku: "RM-1",
      name: "Material",
      unit: "kg",
      minimumStock: -1,
    })).rejects.toThrow("minimumStock and unitCost must be non-negative numbers");
    expect(rawMaterialRepository.create).not.toHaveBeenCalled();
  });

  it("reports duplicate material references", async () => {
    rawMaterialRepository.create.mockRejectedValue({ code: 11000 });

    await expect(rawMaterialService.create({
      sku: "RM-1",
      name: "Material",
      unit: "kg",
    })).rejects.toMatchObject({ message: "A raw material with this SKU already exists", statusCode: 409 });
  });
});
