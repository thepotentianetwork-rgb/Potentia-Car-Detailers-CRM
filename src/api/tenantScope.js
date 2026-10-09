// Owner-dashboard reads must always be limited to the business in the URL.
// RLS already limits owners and staff to their own business, but the Potentia
// admin can read every business, so an unfiltered query on /crm/<slug> would
// mix businesses together for the admin. Fail closed if the id is missing.
export function requireTenantId(tenantId) {
  if (!tenantId) throw new Error("Missing business id for this query.");
  return tenantId;
}
