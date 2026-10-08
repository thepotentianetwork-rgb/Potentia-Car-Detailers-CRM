// Juan's Auto Detailing (Tremonton, UT): portal branding and contact info.
// Source of truth: juansautodetailing.com (repo Juans-Auto-Detailing, main @
// 924a70e, checked 2026-10-08). Business data (hours, slot grid, services,
// prices) is in tenants/juans-auto-detailing-seed.sql.
//
// Colors and fonts are the CSS variables / Google Fonts from the site's
// stylesheet (index.html :root). Assets in public/tenants/juans-auto-detailing/
// are copied from the site: logo.png (transparent margins trimmed),
// juans-detailing-clip.mp4 and juans-detailing-poster.jpg (homepage video).
const ASSETS = "/tenants/juans-auto-detailing";

export default {
  logo: { src: `${ASSETS}/logo.png`, alt: "Juan's Auto Detailing", wide: true },
  hero: { video: `${ASSETS}/juans-detailing-clip.mp4`, poster: `${ASSETS}/juans-detailing-poster.jpg` },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;600;700;900&family=Barlow:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap",
  fonts: { heading: "'Barlow Condensed', sans-serif", body: "'Barlow', sans-serif" },
  headingUppercase: true,
  colors: {
    bg: "#080808", //          --black
    surface: "#111113", //     --carbon
    input: "#1c1c20", //       --charcoal (form fields on book.html)
    border: "#2a2a2e", //      --border
    divider: "#1c1c20", //     --charcoal
    borderStrong: "#2a2a2e", // --border
    borderHover: "#b8bec4", // --gold (the site's silver accent)
    text: "#f0ede8", //        --white
    muted: "#7a7870", //       --muted
    subtle: "#7a7870", //      --muted (the site has no darker gray)
    soft: "#e2e6e9", //        --gold-light
    primary: "#b8bec4", //     --gold: button background
    primaryHover: "#e2e6e9", // --gold-light
    onPrimary: "#080808", //   --black: button text
  },
  contact: {
    phone: "435-282-1061", // "Call or Text"
    email: "js07272001@gmail.com",
    address: "900 W Main St #20, Tremonton, UT 84337", // drop-off location
    hours: "Monday – Saturday", // the site lists days only, no open/close times
    serviceArea: "Box Elder County & Beyond",
    cities: ["Tremonton", "Brigham City", "Ogden", "Logan", "Perry", "Layton", "Preston"],
    payment: "Pay by cash or Venmo.", // about.html, "How It Works" step 04
  },
  // book.html's calendar disables Sundays; the site says "Open Monday – Saturday".
  closedWeekdays: [0],
  zipPlaceholder: "84337",
  // Email alert to Juan for every new portal booking request (src/lib/bookingAlert.js).
  // TODO(Nando): form mykaqben ("Detail Submission Form", the one Juan's site
  // posts to today) currently emails thepotentianetwork@gmail.com, not Juan.
  // Before go-live, either set that form's notification email to
  // js07272001@gmail.com (or add Juan as a recipient) in Formspree, or create
  // a new form for Juan and put its ID here. Formspree must also accept posts
  // from the CRM's domain (check the form's allowed-domains setting).
  bookingAlertFormspreeUrl: "https://formspree.io/f/mykaqben",
  priceNote: "Pricing may vary based on vehicle size and location. Mobile service available within our service area.",
  // Keyed by services.name in the seed file. Copy, "from" prices and duration
  // labels are from services.html.
  serviceDetails: {
    "Regular — Interior & Exterior": {
      durationLabel: "4 – 5 hrs",
      includes: ["Vacuum interior & wipe-down", "Windows in & out", "Hand wash & wheel clean", "Tire dressing"],
    },
    "Medium — Interior, Shampoo & Exterior": {
      durationLabel: "4 – 5 hrs",
      includes: ["Everything in Regular", "Carpet & upholstery shampoo", "Stain treatment on seats"],
    },
    "Super — Interior, Shampoo, Exterior & Engine": {
      durationLabel: "4 – 5 hrs",
      includes: ["Everything in Medium", "Engine bay clean & degrease", "Engine dressing"],
    },
    "Full Detail — Everything + Wax": {
      durationLabel: "4 – 5 hrs",
      includes: ["Everything in Super", "Hand-applied exterior wax", "Trim dressing & glass polish"],
    },
    "Interior Only": {
      from: true,
      durationLabel: "2 – 4 hrs",
      includes: ["Vacuum, wipe-down, windows & trim dressing. No exterior work."],
    },
    "Exterior Only": {
      from: true,
      durationLabel: "~1.5 hrs",
      includes: ["Hand wash & wheel clean. No interior work."],
    },
    "Paint Polish": {
      from: true,
      durationLabel: "~5 hrs",
      includes: ["Removes swirls & scratches, restores depth and gloss."],
    },
    "Polish + Ceramic Coat": {
      from: true,
      durationLabel: "Half to full day",
      includes: ["Full machine polish plus a professional-grade ceramic coat that repels water and contaminants for years."],
    },
    "Headlight Restoration": {
      durationLabel: "~30 min",
      includes: ["Clears foggy, yellowed lenses for better visibility."],
    },
    "Pet Hair Removal": {
      durationLabel: "~30 min",
      includes: ["Deep extraction from seats, carpet & trunk."],
    },
    "Odor Removal": {
      durationLabel: "~30 min",
      includes: ["Eliminates smoke, pet & musty odors at the source."],
    },
  },
};
