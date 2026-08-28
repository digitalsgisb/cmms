import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { Layout } from "./components/Layout";
import { AdminPage } from "./pages/AdminPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CreateWorkOrderPage } from "./pages/CreateWorkOrderPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PreventiveMaintenancePage } from "./pages/PreventiveMaintenancePage";
import { PublicRequesterPage } from "./pages/PublicRequesterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SparePartsPage } from "./pages/SparePartsPage";
import { TechnicianPage } from "./pages/TechnicianPage";
import { TechnicianProfilePage } from "./pages/TechnicianProfilePage";
import { TvDashboardPage } from "./pages/TvDashboardPage";
import { WorkOrderDetailPage } from "./pages/WorkOrderDetailPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";
import { useCurrentUser } from "./state/UserContext";

const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));

export function App() {
  const location = useLocation();

  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = location.pathname.startsWith("/requester") ? "/requester.webmanifest" : "/manifest.webmanifest";
    }
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/requester" element={<PublicRequesterPage />} />
      <Route path="/tv" element={<TvDashboardPage />} />
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/work-orders" element={<WorkOrdersPage />} />
        <Route path="/work-orders/new" element={<CreateWorkOrderPage />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
        <Route path="/technician" element={<TechnicianPage />} />
        <Route path="/assets" element={<RestrictedFeature name="Assets"><AssetsPage /></RestrictedFeature>} />
        <Route path="/spare-parts" element={<SparePartsPage />} />
        <Route path="/spare-parts/inventory" element={<SparePartsPage />} />
        <Route path="/spare-parts/scanner" element={<SparePartsPage />} />
        <Route path="/spare-parts/setup" element={<SparePartsPage />} />
        <Route path="/spare-parts/issue/:itemNo" element={<SparePartsPage />} />
        <Route path="/spare-parts/:itemNo" element={<SparePartsPage />} />
        <Route path="/preventive-maintenance/*" element={<RestrictedFeature name="Preventive Maintenance"><PreventiveMaintenancePage /></RestrictedFeature>} />
        <Route path="/performance" element={<RestrictedFeature name="Performance"><Suspense fallback={<div className="performance-loading">Preparing live performance view...</div>}><PerformancePage /></Suspense></RestrictedFeature>} />
        <Route path="/reports" element={<RestrictedFeature name="Reports"><Suspense fallback={<div className="performance-loading">Building live report...</div>}><ReportsPage /></Suspense></RestrictedFeature>} />
        <Route path="/users" element={<RestrictedFeature name="Users"><AdminPage /></RestrictedFeature>} />
        <Route path="/profile" element={<RestrictedFeature name="Profile"><TechnicianProfilePage /></RestrictedFeature>} />
        <Route path="/settings" element={<RestrictedFeature name="Settings"><SettingsPage /></RestrictedFeature>} />
      </Route>
    </Routes>
  );
}

function HomePage() {
  return <DashboardPage />;
}

function RestrictedFeature({ name, children }: { name: string; children: React.ReactNode }) {
  const { currentUser } = useCurrentUser();
  if (currentUser && ["admin", "developer"].includes(currentUser.role)) return children;

  return (
    <section className="locked-feature-page">
      <span><LockKeyhole size={28} aria-hidden="true" /></span>
      <p className="eyebrow">Feature locked</p>
      <h1>{name} is coming later</h1>
      <p>Production access is currently limited to Work Orders and Spare Parts while this module is being completed.</p>
      <a href="/work-orders">Go to Work Orders</a>
    </section>
  );
}
