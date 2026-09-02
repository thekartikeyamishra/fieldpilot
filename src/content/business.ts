/**
 * Single source of truth for every legal and contact detail on the site.
 *
 * Razorpay's activation review checks that these pages exist, are reachable
 * WITHOUT signing in, and carry a real address and contact. Fill in the four
 * TODO fields before you submit for activation — a missing address is the most
 * common rejection reason.
 */
export const BUSINESS = {
  /** Trading name shown to customers. */
  productName: "FieldPilot",

  /** TODO: the exact legal entity on your PAN / bank account.
   *  For a sole proprietorship this is usually "Kartikeya Mishra" or
   *  "<Your Firm Name> (Proprietor: Kartikeya Mishra)". It must match Razorpay. */
  legalName: "Kartikeya Mishra (Sole Proprietor)",

  /** TODO: operating address. Razorpay requires a real, complete one. */
  address: {
    line1: "TODO: street address",
    line2: "",
    city: "TODO: city",
    state: "TODO: state",
    postalCode: "TODO: PIN",
    country: "India",
  },

  email: "workmailkartikeya@gmail.com",
  supportEmail: "workmailkartikeya@gmail.com",

  /** DPDP Act requires a named contact for data-protection grievances. */
  grievanceOfficer: {
    name: "Kartikeya Mishra",
    email: "workmailkartikeya@gmail.com",
  },

  /** TODO: your production domain, once deployed. */
  websiteUrl: "https://fieldpilot.app",

  jurisdiction: "the courts of India",
  governingLaw: "the laws of India",

  /** Update whenever you materially change a policy. */
  effectiveDate: "31 August 2026",

  supportResponseTarget: "2 business days",
  refundWindowDays: 7,
} as const;

export const addressLines = () =>
  [
    BUSINESS.address.line1,
    BUSINESS.address.line2,
    `${BUSINESS.address.city}, ${BUSINESS.address.state} ${BUSINESS.address.postalCode}`,
    BUSINESS.address.country,
  ].filter(Boolean);

/** Every third party that touches customer data. Keep this list true. */
export const SUBPROCESSORS = [
  { name: "AssemblyAI", purpose: "Speech-to-text for live voice sessions", data: "Audio streamed during a voice job, and its transcript" },
  { name: "LLM provider (via AssemblyAI LLM Gateway)", purpose: "Generating recommendations from retrieved context", data: "The current transcript, the identified asset and its related records" },
  { name: "Razorpay", purpose: "Payment processing", data: "Payment metadata. Card details go to Razorpay directly and never reach our servers" },
  { name: "Hosting and database provider", purpose: "Running the application and storing your records", data: "All application data" },
] as const;
