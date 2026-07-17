import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { TenantProvider } from "./context/TenantContext.jsx";
import { CustomerPortal } from "./pages/CustomerPortal.jsx";
import { OwnerDashboardRoute } from "./pages/OwnerDashboardRoute.jsx";
import { PotentiaAdminApp } from "./pages/potentia/PotentiaAdminApp.jsx";

const DEFAULT_TENANT_SLUG = "apex-detailing";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={`/crm/${DEFAULT_TENANT_SLUG}/portal`} replace />} />
          <Route path="/crm/admin" element={<PotentiaAdminApp />} />
          <Route
            path="/crm/:tenantSlug/portal"
            element={
              <TenantProvider>
                <CustomerPortal />
              </TenantProvider>
            }
          />
          <Route
            path="/crm/:tenantSlug"
            element={
              <TenantProvider>
                <OwnerDashboardRoute />
              </TenantProvider>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
