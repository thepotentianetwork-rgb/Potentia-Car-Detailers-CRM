import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { TenantProvider } from "./context/TenantContext.jsx";
import { ClientLogin } from "./pages/ClientLogin.jsx";
import { CustomerPortal } from "./pages/CustomerPortal.jsx";
import { OwnerDashboardRoute } from "./pages/OwnerDashboardRoute.jsx";
import { PotentiaAdminApp } from "./pages/potentia/PotentiaAdminApp.jsx";
import { SetPassword } from "./pages/SetPassword.jsx";
import { AuthLinkGuard } from "./components/AuthLinkGuard.jsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthLinkGuard>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<ClientLogin />} />
            <Route path="/set-password" element={<SetPassword />} />
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
        </AuthLinkGuard>
      </BrowserRouter>
    </AuthProvider>
  );
}
