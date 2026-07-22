// Plain-language legal glossary for Indian land/property buyers.
// Used by the browsable Legal Guide and as quick reference; Jamindar also explains these live.

export interface LegalTerm {
  term: string;
  short: string;
  detail: string;
}

export const LEGAL_TERMS: LegalTerm[] = [
  { term: "Patta", short: "Govt land ownership record", detail: "A Patta is a government record that establishes who legally owns a piece of land. It is one of the most important documents to verify before buying land." },
  { term: "Chitta", short: "Land revenue record", detail: "Chitta is a revenue record maintained by the village office showing the size, type and ownership of the land." },
  { term: "Adangal", short: "Cultivation & usage record", detail: "The Adangal (or Anadangal) records how the land is being used — crops grown, type of land, and cultivation details." },
  { term: "FMB Sketch", short: "Field measurement map", detail: "The Field Measurement Book sketch is the official map of a survey number showing exact boundaries and measurements of the plot." },
  { term: "Survey Number", short: "Unique land ID", detail: "A survey number is a unique identifier the government assigns to each parcel of land in a village for record-keeping." },
  { term: "Encumbrance Certificate (EC)", short: "Loans / charges history", detail: "An EC shows whether the land has any loans, mortgages or legal charges against it, plus its past transactions. A clean EC means the title is free of dues." },
  { term: "Parent Documents", short: "Chain of prior deeds", detail: "Parent documents are the earlier title deeds that trace how ownership passed hands over the years — proving a clear chain of title." },
  { term: "Sale Deed", short: "Registered transfer of ownership", detail: "The Sale Deed is the legal document, registered at the sub-registrar office, that transfers ownership of the property from seller to buyer." },
  { term: "Gift Deed", short: "Transfer without payment", detail: "A Gift Deed transfers property from one person to another without money, usually between family members. It must be registered." },
  { term: "Partition Deed", short: "Split among co-owners", detail: "A Partition Deed legally divides jointly-owned property among co-owners, giving each a clearly defined share." },
  { term: "Power of Attorney", short: "Authority to act for owner", detail: "A Power of Attorney lets one person legally act on behalf of the owner — for example to sign documents. Buyers should verify it is genuine and valid." },
  { term: "RERA", short: "Buyer-protection regulator", detail: "RERA is the Real Estate Regulatory Authority. RERA-registered projects follow rules that protect buyers on timelines, disclosures and quality." },
  { term: "DTCP", short: "Town-planning approval", detail: "DTCP (Directorate of Town and Country Planning) approves layouts outside metro areas, confirming the plot is legally developed and buildable." },
  { term: "CMDA", short: "Chennai metro planning approval", detail: "CMDA (Chennai Metropolitan Development Authority) is the planning approval for layouts within the Chennai metropolitan area." },
  { term: "Panchayat Approval", short: "Local body approval", detail: "Panchayat approval is a local-body clearance for a layout or building in village/panchayat limits." },
  { term: "Building Approval", short: "Permission to construct", detail: "Building approval is the sanction from the local authority to construct as per the approved plan." },
  { term: "Completion Certificate", short: "Built as approved", detail: "A Completion Certificate confirms the building was completed as per the sanctioned plan and rules." },
  { term: "Occupancy Certificate", short: "Safe to occupy", detail: "An Occupancy Certificate certifies the building is complete, meets norms and is safe to occupy." },
  { term: "Mutation", short: "Update ownership in records", detail: "Mutation updates the government/municipal records to reflect the new owner after a sale — important for property tax and future sale." },
  { term: "Khata", short: "Municipal property account", detail: "Khata (A-Khata/B-Khata in some states) is the municipal account of a property used for tax and civic records." },
  { term: "Property Tax", short: "Annual civic tax", detail: "Property tax is the yearly tax paid to the local body based on the property's value and location." },
  { term: "Stamp Duty", short: "Govt fee at registration", detail: "Stamp duty is a government fee (a percentage of the property value) paid when the sale deed is registered. Rates vary by state." },
  { term: "Registration Charges", short: "Fee to register the deed", detail: "Registration charges are the fee paid to officially register the sale deed at the sub-registrar office, typically around 1%." },
];

export function findLegalTerm(query: string): LegalTerm | undefined {
  const q = query.toLowerCase();
  return LEGAL_TERMS.find((t) => q.includes(t.term.toLowerCase().split(" ")[0]));
}
