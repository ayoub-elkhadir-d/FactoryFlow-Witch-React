import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const emptyForm = {
  sku: "",
  name: "",
  unit: "unit",
  description: "",
  minimumStock: "0",
};

const emptyCompositionLine = { rawMaterial: "", quantity: "1" };

function materialId(value) {
  return String(value?._id || value || "");
}

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [composition, setComposition] = useState([{ ...emptyCompositionLine }]);
  const [editingId, setEditingId] = useState("");
  const [stockProduct, setStockProduct] = useState(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setError("");
    try {
      const [productResult, materialResult] = await Promise.all([
        api("/products"),
        api("/raw-materials"),
      ]);
      setProducts(productResult.products);
      setMaterials(materialResult.materials);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function updateComposition(index, field, value) {
    setComposition((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, [field]: value } : line
    ));
  }

  function startEditing(product) {
    setEditingId(product._id);
    setForm({
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      description: product.description || "",
      minimumStock: String(product.minimumStock ?? 0),
    });
    setComposition(product.composition?.length
      ? product.composition.map((line) => ({
          rawMaterial: materialId(line.rawMaterial),
          quantity: String(line.quantity),
        }))
      : [{ ...emptyCompositionLine }]
    );
    setError("");
    setMessage("");
  }

  function cancelEditing() {
    setEditingId("");
    setForm(emptyForm);
    setComposition([{ ...emptyCompositionLine }]);
  }

  async function saveProduct(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const compositionData = composition.map((line) => ({
      rawMaterial: line.rawMaterial,
      quantity: Number(line.quantity),
    }));
    if (compositionData.some((line) => !line.rawMaterial || line.quantity <= 0)) {
      setError("Choose a material and enter a positive quantity for every composition line.");
      return;
    }
    if (new Set(compositionData.map((line) => line.rawMaterial)).size !== compositionData.length) {
      setError("A material can only appear once in a product composition.");
      return;
    }

    setBusy(true);
    const productData = {
      ...form,
      minimumStock: Number(form.minimumStock),
      composition: compositionData,
    };

    try {
      if (editingId) {
        await api(`/products/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            sku: productData.sku,
            name: productData.name,
            unit: productData.unit,
            description: productData.description,
            minimumStock: productData.minimumStock,
          }),
        });
        await api(`/products/${editingId}/composition`, {
          method: "PUT",
          body: JSON.stringify({ composition: compositionData }),
        });
        setMessage("Product updated.");
      } else {
        await api("/products", {
          method: "POST",
          body: JSON.stringify(productData),
        });
        setMessage("Product created.");
      }
      cancelEditing();
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  async function deactivateProduct(product) {
    if (!window.confirm(`Deactivate ${product.name}?`)) return;
    setError("");
    setMessage("");
    try {
      await api(`/products/${product._id}`, { method: "DELETE" });
      setMessage("Product deactivated.");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function recordStockEntry(event) {
    event.preventDefault();
    if (Number(stockQuantity) <= 0) {
      setError("Stock entry quantity must be greater than zero.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/stock-movements", {
        method: "POST",
        body: JSON.stringify({
          itemModel: "Product",
          item: stockProduct._id,
          movementType: "ENTRY",
          quantity: Number(stockQuantity),
          reason: "Manual stock entry",
        }),
      });
      setMessage(`Stock entry recorded for ${stockProduct.name}.`);
      setStockProduct(null);
      setStockQuantity("");
      await loadData();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const visibleProducts = products.filter((product) =>
    `${product.sku} ${product.name}`.toLowerCase().includes(search.toLowerCase())
  );

  function materialName(id) {
    const found = materials.find((material) => material._id === materialId(id));
    return found ? found.name : "Inactive or missing material";
  }

  return (
    <main className="page-content">
      <p className="eyebrow">ADMIN SPACE</p>
      <h1>Products</h1>
      <p className="dashboard-intro">Manage products, their material composition, and finished stock.</p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="management-success" role="status">{message}</p>}

      <section className="dashboard-panel management-form-panel">
        <h2>{editingId ? "Edit product" : "Add a product"}</h2>
        {materials.length === 0 && !loading && (
          <p className="dashboard-message">Create a raw material before adding a product composition.</p>
        )}
        <form className="management-form" onSubmit={saveProduct}>
          <label>Reference (SKU)<input name="sku" onChange={updateForm} required value={form.sku} /></label>
          <label>Name<input name="name" onChange={updateForm} required value={form.name} /></label>
          <label>Unit<input name="unit" onChange={updateForm} required value={form.unit} /></label>
          <label>Minimum stock<input min="0" name="minimumStock" onChange={updateForm} required step="any" type="number" value={form.minimumStock} /></label>
          <label className="management-wide-field">Description<textarea name="description" onChange={updateForm} rows="2" value={form.description} /></label>

          <div className="composition-editor management-wide-field">
            <div className="management-list-heading">
              <h3>Material composition</h3>
              <button className="secondary-button" disabled={materials.length === 0} onClick={() => setComposition((current) => current.concat([{ ...emptyCompositionLine }]))} type="button">
                Add material
              </button>
            </div>
            {composition.map((line, index) => (
              <div className="composition-line" key={index}>
                <label>Material
                  <select
                    onChange={(event) => updateComposition(index, "rawMaterial", event.target.value)}
                    required
                    value={line.rawMaterial}
                  >
                    <option value="">Choose a material</option>
                    {materials.map((material) => (
                      <option key={material._id} value={material._id}>{material.sku} - {material.name}</option>
                    ))}
                  </select>
                </label>
                <label>Quantity per product<input min="0.0000001" onChange={(event) => updateComposition(index, "quantity", event.target.value)} required step="any" type="number" value={line.quantity} /></label>
                {composition.length > 1 && (
                  <button className="danger-button composition-remove" onClick={() => setComposition((current) => current.filter((_, lineIndex) => lineIndex !== index))} type="button">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="management-form-actions management-wide-field">
            <button className="primary-button" disabled={busy || materials.length === 0} type="submit">
              {busy ? "Saving..." : editingId ? "Save changes" : "Create product"}
            </button>
            {editingId && <button className="secondary-button" onClick={cancelEditing} type="button">Cancel</button>}
          </div>
        </form>
      </section>

      <div className="management-list-heading">
        <h2>Product list</h2>
        <input
          aria-label="Search products"
          className="management-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or SKU"
          value={search}
        />
      </div>

      {loading && <p className="dashboard-message">Loading products...</p>}
      {!loading && !error && visibleProducts.length === 0 && (
        <section className="dashboard-panel"><p className="dashboard-message">No products found.</p></section>
      )}

      <section className="management-list" aria-label="Products">
        {visibleProducts.map((product) => (
          <article className="management-item-card" key={product._id}>
            <div className="management-item-main">
              <p className="production-order-sku">{product.sku}</p>
              <h3>{product.name}</h3>
              <p className="production-order-meta">
                {(product.composition || []).map((line) => `${materialName(line.rawMaterial)} x ${line.quantity}`).join(", ") || "No composition"}
              </p>
            </div>
            <div className="management-item-stock">
              <strong>{product.stockQuantity} {product.unit}</strong>
              <small>Minimum: {product.minimumStock} {product.unit}</small>
            </div>
            <div className="management-item-actions">
              <button className="secondary-button" onClick={() => { setStockProduct(product); setError(""); }} type="button">Add stock</button>
              <button className="secondary-button" onClick={() => startEditing(product)} type="button">Edit</button>
              <button className="danger-button" onClick={() => deactivateProduct(product)} type="button">Deactivate</button>
            </div>
            {stockProduct?._id === product._id && (
              <form className="stock-entry-form" onSubmit={recordStockEntry}>
                <label>Quantity to add<input autoFocus min="0.0000001" onChange={(event) => setStockQuantity(event.target.value)} required step="any" type="number" value={stockQuantity} /></label>
                <button className="primary-button" disabled={busy} type="submit">{busy ? "Saving..." : "Record entry"}</button>
                <button className="secondary-button" onClick={() => setStockProduct(null)} type="button">Cancel</button>
              </form>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

