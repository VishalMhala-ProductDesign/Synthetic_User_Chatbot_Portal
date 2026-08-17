import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const showBackLink = location.pathname !== "/personas";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-title">Synthetic User Chatbot Portal</span>
          {showBackLink && (
            <Link to="/personas" className="back-link">
              ← Personas and Persona Groups
            </Link>
          )}
        </div>
        <div className="app-user">
          <span>{user?.display_name || user?.email}</span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
