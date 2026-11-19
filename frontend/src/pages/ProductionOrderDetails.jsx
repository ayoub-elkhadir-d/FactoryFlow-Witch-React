import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../services/api.js";

function getProductLines(order) {
  if (order.items && order.items.length > 0) return order.items;
  if (order.product) {
    return [{
      product: order.product,
      name: order.product.name,
      sku: order.product.sku,
      unit: order.product.unit,
      quantity: order.quantity,
      compositionSnapshot: order.compositionSnapshot || [],
    }];
  }
  return [];
}

function getMaterialNeeds(lines) {
  const materials = new Map();

  for (const line of lines) {
    for (const material of line.compositionSnapshot || []) {
      const id = String(material.rawMaterial?._id || material.rawMaterial);
      const current = materials.get(id);
      const neededQuantity = material.quantity * line.quantity;

      if (current) {
        current.quantity += neededQuantity;
      } else {
        materials.set(id, {
          rawMaterial: id,
          name: material.name,
          unit: material.unit,
          quantity: neededQuantity,
        });
      }
    }
  }

  return [...materials.values()];
}

export default function ProductionOrderDetails() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  async function loadOrder(showLoading = true) {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const result = await api(`/production-orders/${id}`);
      setOrder(result.order);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function changeStatus(action) {
    if (action === "start" && !window.confirm("Start this production order?")) {
      return;
    }

    setWorking(true);
    setActionError("");

    try {
      const result = await api(`/production-orders/${id}/${action}`, { method: "POST" });
      // Show the status returned by the server immediately, then refresh the order.
      setOrder((currentOrder) => ({ ...currentOrder, ...result.order }));
      await loadOrder(false);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <main className="page-content"><p className="dashboard-message">Loading order...</p></main>;
  }

  if (error || !order) {
    return (
      <main className="page-content">
        <Link className="text-link" to="/production">&lt;- Back to production</Link>
        <p className="error" role="alert">{error || "Production order not found."}</p>
      </main>
    );
  }

  const lines = getProductLines(order);
  const materialNeeds = getMaterialNeeds(lines);

  return (
    <main className="page-content">
      <Link className="text-link" to="/production">&lt;- Back to production</Link>
      <p className="eyebrow production-detail-eyebrow">PRODUCTION ORDER</p>
      <div className="production-detail-heading">
        <div>
          <h1>Order #{order._id.slice(-6)}</h1>
          <p className="dashboard-intro">{lines.length} product{lines.length === 1 ? "" : "s"}</p>
        </div>
        <span className={`order-status order-status-${order.status.toLowerCase()}`}>
          {order.status.replaceAll("_", " ").toLowerCase()}
        </span>
      </div>

      {actionError && <p className="error" role="alert">{actionError}</p>}

      <section className="dashboard-panel order-summary-panel">
        <h2>Products and requested quantities</h2>
        {lines.length ? (
          <ul className="low-stock-list">
            {lines.map((line) => (
              <li key={String(line.product?._id || line.product)}>
                <span>{line.name || line.product?.name || "Product"} ({line.sku || line.product?.sku || "No SKU"})</span>
                <strong>{line.quantity} {line.unit || line.product?.unit || ""}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dashboard-message">This order has no product lines.</p>
        )}
        <dl className="order-facts">
          <div><dt>Assigned operator</dt><dd>{order.operator?.name || "You"}</dd></div>
        </dl>
      </section>

      <section className="dashboard-panel order-materials-panel">
        <h2>Total materials needed</h2>
        {materialNeeds.length ? (
          <ul className="low-stock-list">
            {materialNeeds.map((material) => (
              <li key={material.rawMaterial}>
                <span>{material.name}</span>
                <strong>{material.quantity} {material.unit}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dashboard-message">No material requirements are recorded for this order.</p>
        )}
      </section>

      <div className="order-actions">
        {order.status === "PLANIFIED" && (
          <button className="primary-button" disabled={working} onClick={() => changeStatus("start")} type="button">
            {working ? "Starting..." : "Start order"}
          </button>
        )}
        {order.status === "IN_PROGRESS" && (
          <button className="primary-button" disabled={working} onClick={() => changeStatus("finish")} type="button">
            {working ? "Finishing . . ." : "Finish order"}
          </button>
        )}
      </div>
    </main>
  );
}




