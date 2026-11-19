import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const orderStatuses = [
  { name: "Planified", value: "PLANIFIED", color: "#07877f" },
  { name: "In progress", value: "IN_PROGRESS", color: "#3976c5" },
  { name: "Completed", value: "COMPLETED", color: "#4d9b68" },
  { name: "Cancelled", value: "CANCELLED", color: "#b65b5b" },
];

export default function DashboardPage({ user }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const requests = await Promise.all([
          api("/products"),
          api("/raw-materials"),
          api("/raw-materials/alerts/low-stock"),
          ...orderStatuses.map((status) =>
            api(`/production-orders?status=${status.value}&limit=1`)
          ),
        ]);

        setSummary({
          products: requests[0].products.length,
          materials: requests[1].materials.length,
          lowStockMaterials: requests[2].materials,
          orderCounts: requests.slice(3).map((result) => result.pagination.total),
        });
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    loadDashboard();
  }, []);

  if (error) {
    return <main className="page-content"><p className="error" role="alert">{error}</p></main>;
  }

  if (!summary) {
    return <main className="page-content"><p className="dashboard-message">Loading dashboard…</p></main>;
  }

  const totalOrders = summary.orderCounts.reduce((total, count) => total + count, 0);

  return (
    <main className="page-content">
      <p className="eyebrow">ADMIN SPACE</p>
      <h1>Dashboard</h1>
      <p className="dashboard-intro">Welcome, {user.name}. Here is your factory overview.</p>

      <section className="dashboard-stats" aria-label="Factory totals">
        <article className="dashboard-card">
          <p>Total products</p>
          <strong>{summary.products}</strong>
        </article>
        <article className="dashboard-card">
          <p>Raw materials</p>
          <strong>{summary.materials}</strong>
        </article>
        <article className="dashboard-card">
          <p>Production orders</p>
          <strong>{totalOrders}</strong>
        </article>
      </section>

      <div className="dashboard-sections">
        <section className="dashboard-panel">
          <h2>Orders by status</h2>
          {orderStatuses.map((status, index) => {
            const count = summary.orderCounts[index];
            const width = totalOrders ? `${(count / totalOrders) * 100}%` : "0%";

            return (
              <div className="status-row" key={status.value}>
                <div className="status-label">
                  <span>{status.name}</span>
                  <strong>{count}</strong>
                </div>
                <div className="status-track">
                  <span style={{ width, backgroundColor: status.color }} />
                </div>
              </div>
            );
          })}
        </section>

        <section className="dashboard-panel">
          <h2>Low stock alerts</h2>
          {summary.lowStockMaterials.length === 0 ? (
            <p className="dashboard-message">All raw materials are above their minimum stock level.</p>
          ) : (
            <ul className="low-stock-list">
              {summary.lowStockMaterials.map((material) => (
                <li key={material._id}>
                  <span>{material.name}</span>
                  <strong>{material.stockQuantity} {material.unit}</strong>
                  <small>Minimum: {material.minimumStock} {material.unit}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
