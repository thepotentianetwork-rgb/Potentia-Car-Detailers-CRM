import { fetchTenantById } from "../api/tenants.js";

// Where a signed-in user belongs: Potentia admin -> /crm/admin, owners and
// staff -> their business dashboard, customers -> their business's portal.
export async function homePathFor(profile) {
  if (profile.role === "potentia_admin") return "/crm/admin";
  const tenant = await fetchTenantById(profile.tenant_id);
  if (profile.role === "business_owner" || profile.role === "staff") return `/crm/${tenant.slug}`;
  return `/crm/${tenant.slug}/portal`;
}
