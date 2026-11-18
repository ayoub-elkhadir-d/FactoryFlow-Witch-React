jest.mock("../../../src/repositories/productRepository", () => ({
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  setComposition: jest.fn(),
  deactivate: jest.fn(),
}));
jest.mock("../../../src/repositories/rawMaterialRepository", () => ({
  findActiveByIds: jest.fn(),
}));

const productRepository = require("../../../src/repositories/productRepository");
const rawMaterialRepository = require("../../../src/repositories/rawMaterialRepository");
const productService = require("../../../src/services/productService");

const MATERIAL_A = "650000000000000000000001";
const MATERIAL_B = "650000000000000000000002";
const PRODUCT_ID = "650000000000000000000003";

beforeEach(() => jest.clearAllMocks());

describe("ProductService composition rules", () => {
  it("requires a product to include at least one material", async () => {
    await expect(productService.create({ sku: "P1", name: "Product", unit: "unit" }))
      .rejects.toThrow("A product must use at least one raw material");
    expect(productRepository.create).not.toHaveBeenCalled();
  });

  it("rejects a material repeated in the same composition", async () => {
    await expect(productService.setComposition(PRODUCT_ID, [
      { rawMaterial: MATERIAL_A, quantity: 2 },
      { rawMaterial: MATERIAL_A, quantity: 3 },
    ])).rejects.toThrow("A raw material can only appear once");
    expect(rawMaterialRepository.findActiveByIds).not.toHaveBeenCalled();
    expect(productRepository.setComposition).not.toHaveBeenCalled();
  });

  it("rejects zero or negative composition quantities", async () => {
    await expect(productService.setComposition(PRODUCT_ID, [
      { rawMaterial: MATERIAL_A, quantity: 0 },
    ])).rejects.toThrow("positive quantity");
    expect(productRepository.setComposition).not.toHaveBeenCalled();
  });

  it("rejects a material that does not exist or is inactive", async () => {
    rawMaterialRepository.findActiveByIds.mockResolvedValue([]);
    await expect(productService.setComposition(PRODUCT_ID, [
      { rawMaterial: MATERIAL_A, quantity: 2 },
    ])).rejects.toThrow("missing or inactive raw material");
    expect(productRepository.setComposition).not.toHaveBeenCalled();
  });

  it("accepts an existing unique material composition", async () => {
    rawMaterialRepository.findActiveByIds.mockResolvedValue([{ _id: MATERIAL_A }, { _id: MATERIAL_B }]);
    productRepository.setComposition.mockResolvedValue({ id: PRODUCT_ID });

    await productService.setComposition(PRODUCT_ID, [
      { rawMaterial: MATERIAL_A, quantity: 2 },
      { rawMaterial: MATERIAL_B, quantity: 1 },
    ]);

    expect(productRepository.setComposition).toHaveBeenCalledWith(PRODUCT_ID, [
      { rawMaterial: MATERIAL_A, quantity: 2 },
      { rawMaterial: MATERIAL_B, quantity: 1 },
    ]);
  });
});
