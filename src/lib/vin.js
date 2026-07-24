// NHTSA's vPIC API is free, keyless, and CORS-enabled - no backend needed.
export async function decodeVin(vin) {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`);
  if (!res.ok) throw new Error("VIN decode failed - check your connection and try again.");
  const data = await res.json();
  const r = data.Results?.[0];
  if (!r || !r.Make) throw new Error("Couldn't decode that VIN - double-check it and try again.");
  return {
    year: r.ModelYear ? Number(r.ModelYear) : null,
    make: r.Make || "",
    model: r.Model || "",
    trim: r.Trim || "",
  };
}
