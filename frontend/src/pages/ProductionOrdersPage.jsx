import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
    }];
  }
  return [];
}

function statusName(status) {
  return status.replaceAll("_", " ").toLowerCase();
}

export default function ProductionOrdersPage({ showHistory = false }) {
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      setError("");

      try {
        const path = showHistory
          ? `/production-orders/history?page=${page}&limit=20`
          : `/production-orders?page=${page}&limit=20`;
        const result = await api(path);
        setOrders((currentOrders) =>
          page === 1 ? result.orders : currentOrders.concat(result.orders)
        );
        setPages(result.pagination.pages);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, [page, showHistory]);

  const visibleOrders = showHistory
    ? orders
    : orders.filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELLED");

  return (
    <main className="page-content">
      <p className="eyebrow">OPERATOR SPACE</p>
      <h1>{showHistory ? "Completed orders" : "Production"}</h1>
      <p className="dashboard-intro">
        {showHistory
          ? "Review your completed production orders."
          : "View the production orders assigned to you."}
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {loading && orders.length === 0 && <p className="dashboard-message">Loading orders...</p>}
      {!loading && !error && visibleOrders.length === 0 && (
        <section className="dashboard-panel">
          <p className="dashboard-message">
            {showHistory ? "You have no completed orders yet." : "You have no active assigned orders."}
          </p>
        </section>
      )}

      {visibleOrders.length > 0 && (
        <section className="production-order-list" aria-label="Production orders">
          {visibleOrders.map((order) => {
            const lines = getProductLines(order);
            return (
              <article className="production-order-card" key={order._id}>
                <div>
                  <p className="production-order-sku">
                    {lines.map((line) => line.sku || line.product?.sku || "Product").join(", ")}
                  </p>
                  <h2>{lines.map((line) => line.name || line.product?.name || "Product").join(" + ")}</h2>
                  <p className="production-order-meta">
                    {lines.map((line) =>
                      `${line.quantity} ${line.unit || line.product?.unit || ""}`
                    ).join(" + ")}
                  </p>
                </div>
                <div className="production-order-card-end">
                  <span className={`order-status order-status-${order.status.toLowerCase()}`}>
                    {statusName(order.status)}
                  </span>
                  <Link className="text-link" to={`/production/${order._id}`} state={{ order }}>
                    View details
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!error && page < pages && (
        <button
          className="secondary-button load-more-button"
          disabled={loading}
          onClick={() => setPage((currentPage) => currentPage + 1)}
          type="button"
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </main>
  );
}
