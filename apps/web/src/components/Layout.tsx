import {
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import type { NotificationRecord } from "@sugi-cmms/shared";
import { api, mediaUrl } from "../api/client";
import { useCurrentUser } from "../state/UserContext";
import { formatShortDate } from "../utils/format";

const navItems = [
  { to: "/assets", label: "Assets", icon: Factory },
  { to: "/preventive-maintenance", label: "Preventive", icon: ShieldCheck },
  { to: "/performance", label: "Performance", icon: ChartNoAxesCombined },
  { to: "/reports", label: "Reports", icon: Boxes },
  { to: "/users", label: "Users", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings }
];

const technicianTabs = [
  { to: "/technician", label: "Jobs", icon: ClipboardCheck },
  { to: "/spare-parts/scanner", label: "Parts", icon: Package },
  { to: "/preventive-maintenance", label: "PM", icon: ShieldCheck },
  { to: "/profile", label: "Profile", icon: Settings }
];

function isTechnicianTabActive(tabPath: string, pathname: string) {
  if (tabPath === "/technician") {
    return pathname.startsWith("/technician") || pathname.startsWith("/work-orders");
  }

  return pathname.startsWith(tabPath);
}

export function Layout() {
  const { currentUser, loadingUsers, logout } = useCurrentUser();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const isRequester = currentUser?.role === "requester";
  const canUseTechnicianViews = currentUser ? currentUser.role !== "requester" : true;
  const workOrdersActive = location.pathname.startsWith("/work-orders") || (!isRequester && location.pathname.startsWith("/technician"));
  const sparePartsActive = location.pathname.startsWith("/spare-parts");
  const [workOrdersOpen, setWorkOrdersOpen] = useState(workOrdersActive);
  const [sparePartsOpen, setSparePartsOpen] = useState(sparePartsActive);

  async function loadNotifications() {
    if (!currentUser) {
      return;
    }

    const nextNotifications = await api.notifications(currentUser.id);
    setNotifications(nextNotifications);
  }

  useEffect(() => {
    loadNotifications().catch(console.error);
    const interval = window.setInterval(() => loadNotifications().catch(console.error), 15000);
    return () => window.clearInterval(interval);
  }, [currentUser?.id]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);
  const breadcrumb = useMemo(() => {
    const current = [
      { match: "/work-orders", label: "Work Orders" },
      { match: "/technician", label: "Technician" },
      { match: "/assets", label: "Assets" },
      { match: "/spare-parts/setup", label: "Sheet Setup" },
      { match: "/spare-parts/scanner", label: "Spare Scanner" },
      { match: "/spare-parts/inventory", label: "Spare Inventory" },
      { match: "/spare-parts/issue", label: "Spare Scanner" },
      { match: "/spare-parts", label: "Spare Parts" },
      { match: "/preventive-maintenance", label: "Preventive" },
      { match: "/performance", label: "Performance" },
      { match: "/reports", label: "Reports" },
      { match: "/users", label: "Admin" },
      { match: "/settings", label: "Settings" }
    ].find((item) => location.pathname.startsWith(item.match));

    return current?.label || "Dashboard";
  }, [location.pathname]);

  const initials = useMemo(() => {
    if (!currentUser) {
      return "DTU";
    }

    return currentUser.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [currentUser]);
  const avatarSrc = currentUser?.avatarUrl ? mediaUrl(currentUser.avatarUrl) : "";

  useEffect(() => {
    if (workOrdersActive) {
      setWorkOrdersOpen(true);
      return;
    }

    setWorkOrdersOpen(false);
  }, [workOrdersActive]);

  useEffect(() => {
    if (sparePartsActive) {
      setSparePartsOpen(true);
      return;
    }

    setSparePartsOpen(false);
  }, [sparePartsActive]);

  useEffect(() => {
    setMobileNavOpen(false);
    setPanelOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileNavOpen]);

  async function markAllRead() {
    if (!currentUser) {
      return;
    }

    await api.markAllNotificationsRead(currentUser.id);
    await loadNotifications();
  }

  if (loadingUsers) {
    return <div className="auth-loading">Loading SUGI CMMS...</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (currentUser.role === "technician") {
    return (
      <div className="technician-app-shell">
        <header className="technician-app-topbar">
          <div className="technician-brand-lockup">
            <span className="technician-brand-mark">
              <img src="/brand/sugi_symbol.png" alt="Sugihara Grand" />
            </span>
            <div>
              <span>Sugi Tech</span>
              <strong>{breadcrumb}</strong>
            </div>
          </div>

          <div className="technician-topbar-actions">
            <button className="profile-chip" type="button" aria-label="Current technician">
              {avatarSrc ? <img src={avatarSrc} alt={currentUser.name} /> : initials}
            </button>
            <div className="notification-wrap">
              <button className="icon-button" type="button" onClick={() => setPanelOpen((open) => !open)} aria-label="Notifications">
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 ? <span className="notification-count">{unreadCount}</span> : null}
              </button>
              {panelOpen ? (
                <div className="notification-panel technician-notification-panel">
                  <div className="panel-header">
                    <strong>Notifications</strong>
                    <button type="button" onClick={markAllRead}>
                      Mark all read
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <p>No notifications yet.</p>
                    ) : (
                      notifications.slice(0, 8).map((notification) => (
                        <div key={notification.id} className={`notification-item ${notification.readAt ? "" : "unread"}`}>
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="technician-app-main">
          <Outlet />
        </main>

        <nav className="technician-tabbar" aria-label="Technician navigation">
          {technicianTabs.map((item) => {
            const active = isTechnicianTabActive(item.to, location.pathname);
            return (
              <NavLink key={item.to} to={item.to} className={`technician-tab ${active ? "active" : ""}`}>
                <item.icon size={20} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className={`app-shell ${mobileNavOpen ? "mobile-nav-is-open" : ""}`}>
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} id="mobile-main-navigation">
        <div className="brand">
          <span className="brand-mark">
            <img src="/brand/sugi_symbol.png" alt="Sugihara Grand" />
          </span>
          <div>
            <strong>SUGI CMMS</strong>
            <small>Maintenance command</small>
          </div>
          <button className="mobile-close-button" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="mobile-account-panel">
          <div>
            <span>{formatShortDate()}</span>
            <span className="profile-chip mobile-profile-chip">
              {avatarSrc ? <img src={avatarSrc} alt={currentUser.name} /> : initials}
            </span>
          </div>
          <div className="mobile-account-user">
            <strong>{currentUser.name}</strong>
            <span>{currentUser.title} - {currentUser.role}</span>
          </div>
          <button className="mobile-signout-button" type="button" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setMobileNavOpen(false)}>
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Dashboard</span>
          </NavLink>

          <div className={`nav-group ${workOrdersOpen ? "open" : ""}`}>
            <NavLink
              to="/work-orders"
              className={`nav-item nav-parent ${workOrdersActive ? "active" : ""}`}
              aria-expanded={workOrdersOpen}
              onClick={(event) => {
                if (workOrdersActive) {
                  event.preventDefault();
                  setWorkOrdersOpen((open) => !open);
                  return;
                }

                setWorkOrdersOpen(true);
              }}
            >
              <ClipboardCheck size={18} aria-hidden="true" />
              <span>Work Orders</span>
              {workOrdersOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            </NavLink>

            <div className="nav-subitems" aria-hidden={!workOrdersOpen}>
              <NavLink to="/work-orders" tabIndex={workOrdersOpen ? 0 : -1} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMobileNavOpen(false)}>
                Main
              </NavLink>
              {canUseTechnicianViews ? (
                <>
                  <NavLink to="/technician" tabIndex={workOrdersOpen ? 0 : -1} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMobileNavOpen(false)}>
                    Technician
                  </NavLink>
                  <a href="/tv" target="_blank" rel="noreferrer" tabIndex={workOrdersOpen ? 0 : -1} onClick={() => setMobileNavOpen(false)}>
                    TV Board
                  </a>
                </>
              ) : null}
            </div>
          </div>

          <div className={`nav-group ${sparePartsOpen ? "open" : ""}`}>
            <NavLink
              to="/spare-parts"
              className={`nav-item nav-parent ${sparePartsActive ? "active" : ""}`}
              aria-expanded={sparePartsOpen}
              onClick={(event) => {
                if (sparePartsActive) {
                  event.preventDefault();
                  setSparePartsOpen((open) => !open);
                  return;
                }

                setSparePartsOpen(true);
              }}
            >
              <Package size={18} aria-hidden="true" />
              <span>Spare Parts</span>
              {sparePartsOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            </NavLink>

            <div className="nav-subitems" aria-hidden={!sparePartsOpen}>
              <NavLink to="/spare-parts" tabIndex={sparePartsOpen ? 0 : -1} end className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMobileNavOpen(false)}>
                Main
              </NavLink>
              <NavLink to="/spare-parts/inventory" tabIndex={sparePartsOpen ? 0 : -1} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMobileNavOpen(false)}>
                Inventory
              </NavLink>
              {canUseTechnicianViews ? (
                <NavLink to="/spare-parts/scanner" tabIndex={sparePartsOpen ? 0 : -1} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMobileNavOpen(false)}>
                  QR Scanner
                </NavLink>
              ) : null}
              {["executive", "admin"].includes(currentUser.role) ? (
                <NavLink to="/spare-parts/setup" tabIndex={sparePartsOpen ? 0 : -1} className={({ isActive }) => (isActive ? "active" : "")} onClick={() => setMobileNavOpen(false)}>
                  Sheet Setup
                </NavLink>
              ) : null}
            </div>
          </div>

          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setMobileNavOpen(false)}>
              <item.icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-credit">
          <span aria-hidden="true">&copy;</span>
          <strong>Digital Transformation Unit</strong>
        </div>
      </aside>
      <button
        className="mobile-nav-scrim"
        type="button"
        aria-label="Close navigation"
        aria-hidden={!mobileNavOpen}
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />

      <div className="content-shell">
        <header className="topbar">
          <div className="topbar-main">
            <button
              className="mobile-menu-button"
              type="button"
              aria-label="Open navigation"
              aria-controls="mobile-main-navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={21} aria-hidden="true" />
            </button>
            <div className="topbar-breadcrumb" aria-label="Breadcrumb">
              <span>Operations</span>
              <ChevronRight size={16} aria-hidden="true" />
              <strong>{breadcrumb}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <span className="topbar-date">{formatShortDate()}</span>
            <button className="profile-chip" type="button" aria-label="Current user">
              {avatarSrc ? <img src={avatarSrc} alt={currentUser.name} /> : initials}
            </button>
            <button className="logout-button" type="button" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
            <div className="notification-wrap">
              <button className="icon-button" type="button" onClick={() => setPanelOpen((open) => !open)} aria-label="Notifications">
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 ? <span className="notification-count">{unreadCount}</span> : null}
              </button>
              {panelOpen ? (
                <div className="notification-panel">
                  <div className="panel-header">
                    <strong>Notifications</strong>
                    <button type="button" onClick={markAllRead}>
                      Mark all read
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <p>No notifications yet.</p>
                    ) : (
                      notifications.slice(0, 8).map((notification) => (
                        <div key={notification.id} className={`notification-item ${notification.readAt ? "" : "unread"}`}>
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

          </div>
        </header>

        <main className="page-frame">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
