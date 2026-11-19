export default function Navbar({ user, onLogout, onMenuClick }) {
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenuClick} type="button" aria-label="Open menu">
        ?
      </button>
      <p className="topbar-title">FactoryFlow</p>
      <div className="topbar-user">
        <span>{user.name}</span>
        <span>{user.role}</span>


        <button className="logout-button" onClick={onLogout} type="button">
          Log out
        </button>
      </div>
    </header>
  );
}
