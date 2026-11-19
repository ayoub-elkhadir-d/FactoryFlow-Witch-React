import { NavLink } from "react-router-dom";

export default function Sidebar({ user, isOpen, onClose }) {
  const menuItems = user.role === "OPERATOR"
    ? [
        { label: "Production", path: "/production", end: true },
        { label: "Order history", path: "/production/history", end: true },
      ]
    : [
        { label: "Dashboard", path: "/dashboard", end: true },
        { label: "Products", path: "/products", end: true },
        { label: "Raw materials", path: "/materials", end: true },
      ];

  return (
    <>
      {isOpen && (
        <button
          className="sidebar-backdrop"
          onClick={onClose}
          type="button"
          aria-label="Close menu"
        />
      )}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <p className="sidebar-brand">FactoryFlow</p>
        <p className="sidebar-label">{user.role} SPACE</p>
        <nav aria-label="Main navigation">
          {menuItems.map((item) => (
            <NavLink
              className={({ isActive }) => isActive ? "nav-item nav-item-active" : "nav-item"}
              end={item.end}
              key={item.path}
              onClick={onClose}
              to={item.path}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
