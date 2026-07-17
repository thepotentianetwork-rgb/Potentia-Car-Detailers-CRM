import { createContext, useContext, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchTenantBySlug } from "../api/tenants.js";
import { LoadingBox } from "../components/LoadingBox.jsx";
import { ErrorBox } from "../components/ErrorBox.jsx";

const TenantContext = createContext(null);

function toConfig(tenant) {
  return {
    businessName: tenant.name,
    tagline: tenant.tagline || "",
    businessHours: tenant.business_hours,
    bookingGranularityMin: tenant.booking_granularity_min,
    mobileTravelBufferMin: tenant.mobile_travel_buffer_min,
    expenseCategories: tenant.expense_categories,
    paymentMethods: tenant.payment_methods,
  };
}

export function TenantProvider({ children }) {
  const { tenantSlug } = useParams();
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setTenant(null);
    setError("");
    fetchTenantBySlug(tenantSlug)
      .then(setTenant)
      .catch(() => setError(`No business found for "${tenantSlug}".`));
  }, [tenantSlug]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center px-6">
        <ErrorBox message={error} />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-[#F5F5F6] flex items-center justify-center">
        <LoadingBox center />
      </div>
    );
  }

  return <TenantContext.Provider value={{ tenant, config: toConfig(tenant) }}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within a TenantProvider");
  return ctx;
}
