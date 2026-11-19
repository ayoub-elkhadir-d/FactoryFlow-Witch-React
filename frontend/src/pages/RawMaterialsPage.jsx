import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const emptyForm = {
  sku: "",
  name: "",
  unit: "kg",
  description: "",
  supplier: "",
  minimumStock: "0",
  unitCost: "0",
};

export default function RawMaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [stockMaterial, setStockMaterial] = useState(null);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockCost, setStockCost] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadMaterials() {
    setError("");
    try {
      const result = await api("/raw-materials");
      setMaterials(result.materials);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMaterials();
  }, []);

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function startEditing(material) {
    setEditingId(material._id);
    setForm({
      sku: material.sku,
      name: material.name,
      unit: material.unit,
      description: material.description || "",
      supplier: material.supplier || "",
      minimumStock: String(material.minimumStock ?? 0),
      unitCost: String(material.unitCost ?? 0),
    });
    setMessage("");
    setError("");
  }

  function cancelEditing() {
    setEditingId("");
    setForm(emptyForm);
  }

  async function saveMaterial(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const materialData = {
      ...form,
      minimumStock: Number(form.minimumStock),
      unitCost: Number(form.unitCost),
    };

    try {
      if (editingId) {
        await api(`/raw-materials/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(materialData),
        });
        setMessage("Raw material updated.");
      } else {
        await api("/raw-materials", {
          method: "POST",
          body: JSON.stringify(materialData),
        });
        setMessage("Raw material created.");
      }
      cancelEditing();
      await loadMaterials();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivateMaterial(material) {
    if (!window.confirm(`Deactivate ${material.name}?`)) return;
    setError("");
    setMessage("");
    try {
      await api(`/raw-materials/${material._id}`, { method: "DELETE" });
      setMessage("Raw material deactivated.");
      await loadMaterials();
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
    const movement = {
      movementType: "ENTRY",
      quantity: Number(stockQuantity),
      reason: "Manual stock entry",
    };
    if (stockCost !== "") movement.unitCost = Number(stockCost);

    try {
      await api(`/raw-materials/${stockMaterial._id}/movements`, {
        method: "POST",
        body: JSON.stringify(movement),
      });
      setMessage(`Stock entry recorded for ${stockMaterial.name}.`);
      setStockMaterial(null);
      setStockQuantity("");
      setStockCost("");
      await loadMaterials();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const visibleMaterials = materials.filter((material) => {
    const text = `${material.sku} ${material.name} ${material.supplier || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  return (
    <main className="page-content">
      <p className="eyebrow">ADMIN SPACE</p>
      <h1>Raw materials</h1>
      <p className="dashboard-intro">Manage material details, alert levels, and stock entries.</p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="management-success" role="status">{message}</p>}

      <section className="dashboard-panel management-form-panel">
        <h2>{editingId ? "Edit raw material" : "Add a raw material"}</h2>
        <form className="management-form" onSubmit={saveMaterial}>
          <label>Reference (SKU)<input name="sku" onChange={updateForm} required value={form.sku} /></label>
          <label>Name<input name="name" onChange={updateForm} required value={form.name} /></label>
          <label>Unit<input name="unit" onChange={updateForm} required value={form.unit} /></label>
          <label>Supplier<input name="supplier" onChange={updateForm} value={form.supplier} /></label>
          <label>Minimum stock<input min="0" name="minimumStock" onChange={updateForm} required step="any" type="number" value={form.minimumStock} /></label>
          <label>Unit cost<input min="0" name="unitCost" onChange={updateForm} required step="any" type="number" value={form.unitCost} /></label>
          <label className="management-wide-field">Description<textarea name="description" onChange={updateForm} rows="2" value={form.description} /></label>
          <div className="management-form-actions management-wide-field">
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? "Saving..." : editingId ? "Save changes" : "Create raw material"}
            </button>
            {editingId && <button className="secondary-button" onClick={cancelEditing} type="button">Cancel</button>}
          </div>
        </form>
      </section>

      <div className="management-list-heading">
        <h2>Raw material list</h2>
        <input
          aria-label="Search raw materials"
          className="management-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, SKU, or supplier"
          value={search}
        />
      </div>

      {loading ? <p className="dashboard-message">Loading raw materials...</p> : null}
      {!loading && !error && visibleMaterials.length === 0 && (
        <section className="dashboard-panel"><p className="dashboard-message">No raw materials found.</p></section>
      )}

      <section className="management-list" aria-label="Raw materials">
        {visibleMaterials.map((material) => {
          const isLowStock = material.stockQuantity <= material.minimumStock;
          return (
            <article className="management-item-card" key={material._id}>
              <div className="management-item-main">
                <p className="production-order-sku">{material.sku}</p>
                <h3>{material.name}</h3>
                <p className="production-order-meta">{material.supplier || "No supplier"}</p>
              </div>
              <div className="management-item-stock">
                <strong>{material.stockQuantity} {material.unit}</strong>
                <small>Alert at {material.minimumStock} {material.unit}</small>
                {isLowStock && <span className="order-status order-status-cancelled">Low stock</span>}
              </div>
              <div className="management-item-actions">
                <button className="secondary-button" onClick={() => { setStockMaterial(material); setError(""); }} type="button">Add stock</button>
                <button className="secondary-button" onClick={() => startEditing(material)} type="button">Edit</button>
                <button className="danger-button" onClick={() => deactivateMaterial(material)} type="button">Deactivate</button>
              </div>
              {stockMaterial?._id === material._id && (
                <form className="stock-entry-form" onSubmit={recordStockEntry}>
                  <label>Quantity to add<input autoFocus min="0.0000001" onChange={(event) => setStockQuantity(event.target.value)} required step="any" type="number" value={stockQuantity} /></label>
                  <label>Unit cost (optional)<input min="0" onChange={(event) => setStockCost(event.target.value)} step="any" type="number" value={stockCost} /></label>
                  <button className="primary-button" disabled={busy} type="submit">{busy ? "Saving..." : "Record entry"}</button>
                  <button className="secondary-button" onClick={() => setStockMaterial(null)} type="button">Cancel</button>
                </form>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
