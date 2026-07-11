// Everything client-specific lives here. A new client should only require a
// new Supabase project (.env) + edits to this file — no other code changes.
export const CONFIG = {
  businessName: "Apex Auto Detailing",
  tagline: "Don't Stress, Enjoy the Best!",
  businessHours: { start: "9:00 AM", end: "5:00 PM" },
  bookingGranularityMin: 30,
  mobileTravelBufferMin: 30,
  expenseCategories: [
    "Gas",
    "Equipment",
    "Water & Electricity",
    "Phone",
    "Chemicals",
    "Vehicle Maintenance",
    "Equipment Maintenance",
    "Other",
  ],
};
