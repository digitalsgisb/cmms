import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
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
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/spare-parts" element={<SparePartsPage />} />
        <Route path="/spare-parts/inventory" element={<SparePartsPage />} />
        <Route path="/spare-parts/scanner" element={<SparePartsPage />} />
        <Route path="/spare-parts/setup" element={<SparePartsPage />} />
        <Route path="/spare-parts/issue/:itemNo" element={<SparePartsPage />} />
        <Route path="/spare-parts/:itemNo" element={<SparePartsPage />} />
        <Route path="/preventive-maintenance/*" element={<PreventiveMaintenancePage />} />
        <Route path="/performance" element={<Suspense fallback={<div className="performance-loading">Preparing live performance view...</div>}><PerformancePage /></Suspense>} />
        <Route path="/reports" element={<Suspense fallback={<div className="performance-loading">Building live report...</div>}><ReportsPage /></Suspense>} />
        <Route path="/users" element={<AdminPage />} />
        <Route path="/profile" element={<TechnicianProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

function HomePage() {
  const { currentUser } = useCurrentUser();

  if (currentUser?.role === "technician") {
    return <Navigate to="/technician" replace />;
  }

  return <DashboardPage />;
}
