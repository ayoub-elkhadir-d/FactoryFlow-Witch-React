import { useContext, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { api, TOKEN_KEY } from "./services/api.js";
import { AuthContext } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import DashboardPage from "./pages/Dashboard.jsx";
import ProductsPage from "./pages/ProductsPage.jsx";
import RawMaterialsPage from "./pages/RawMaterialsPage.jsx";
import ProductionOrdersPage from "./pages/ProductionOrdersPage.jsx";
import ProductionOrderDetails from "./pages/ProductionOrderDetails.jsx";
import Navbar from "./components/Navbar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import "./styles.css";

function SetupPage({ onSetup }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await api("/installation", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      onSetup(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="brand">FactoryFlow</p>
        <p className="eyebrow">FIRST TIME SETUP</p>
        <h1>Create your workspace</h1>
        <p className="intro">Create the first administrator account to get started.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" onChange={(event) => setName(event.target.value)} required value={name} />
          <label htmlFor="setup-email">Email address</label>
          <input id="setup-email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <label htmlFor="setup-password">Password</label>
          <input id="setup-password" autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={loading} type="submit">
            {loading ? "Please wait..." : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="page-content">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>This page does not exist</h1>
      <p className="dashboard-intro">Use the navigation menu to open an available page.</p>
    </main>
  );
}

function RoleHome() {
  const { user } = useContext(AuthContext);
  return <Navigate to={user.role === "OPERATOR" ? "/production" : "/dashboard"} replace />;
}

function RequireRole({ role }) {
  const { user } = useContext(AuthContext);
  if (user.role === role) return <Outlet />;
  return <Navigate to={user.role === "OPERATOR" ? "/production" : "/dashboard"} replace />;
}

function DashboardLayout({ onLogout }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar user={user} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-area">
        <Navbar
          onLogout={() => {
            onLogout();
            navigate("/login", { replace: true });
          }}
          onMenuClick={() => setSidebarOpen(true)}
          user={user}
        />
        <Outlet />
      </div>
    </div>
  );
}

function SignedInRoutes({ user, onLogout }) {
  return (
    <AuthContext.Provider value={{ user }}>
      <Routes>
        <Route element={<DashboardLayout onLogout={onLogout} />}>
          <Route index element={<RoleHome />} />
          <Route path="login" element={<RoleHome />} />
          <Route path="setup" element={<RoleHome />} />
          <Route path="dashboard" element={<RequireRole role="ADMIN" />}>
            <Route index element={<DashboardPage user={user} />} />
          </Route>
          <Route path="products" element={<RequireRole role="ADMIN" />}>
            <Route index element={<ProductsPage />} />
          </Route>
          <Route path="materials" element={<RequireRole role="ADMIN" />}>
            <Route index element={<RawMaterialsPage />} />
          </Route>
          <Route path="production" element={<RequireRole role="OPERATOR" />}>
            <Route index element={<ProductionOrdersPage key="active" />} />
            <Route path="history" element={<ProductionOrdersPage key="history" showHistory />} />
            <Route path=":id" element={<ProductionOrderDetails />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthContext.Provider>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [installed, setInstalled] = useState(true);
  const [error, setError] = useState("");

  async function checkSession() {
    setChecking(true);
    setError("");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const status = await api("/installation/status");
        setInstalled(status.installed);
        if (status.installed && localStorage.getItem(TOKEN_KEY)) {
          const profile = await api("/auth/profile");
          setUser(profile.user);
        }
        setChecking(false);
        return;
      } catch (requestError) {
        if (requestError.message === "Failed to fetch" && attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        if (requestError.message === "Failed to fetch") {
          setError("Could not connect to the API. Check that the backend is running.");
        } else if (localStorage.getItem(TOKEN_KEY)) {
          localStorage.removeItem(TOKEN_KEY);
        }
        setChecking(false);
        return;
      }
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  function logOut() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  if (checking) return <main className="status-page">Connecting to FactoryFlow...</main>;
  if (error) {
    return (
      <main className="status-page">
        <div>
          <p role="alert">{error}</p>
          <button type="button" onClick={checkSession}>Retry connection</button>
        </div>
      </main>
    );
  }

  if (user) return <SignedInRoutes user={user} onLogout={logOut} />;

  return (
    <Routes>
      <Route path="/" element={installed ? <Login onLogin={setUser} /> : <SetupPage onSetup={setUser} />} />
      <Route path="/login" element={installed ? <Login onLogin={setUser} /> : <Navigate to="/" replace />} />
      <Route path="/setup" element={!installed ? <SetupPage onSetup={setUser} /> : <Navigate to="/login" replace />} />
      <Route path="/dashboard" element={<Navigate to="/login" replace />} />
      <Route path="/products/*" element={<Navigate to="/login" replace />} />
      <Route path="/materials/*" element={<Navigate to="/login" replace />} />
      <Route path="/production/*" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}









