// Stable reference numbers, so every claim can be traced to its source.
//
// An attorney cannot use "he threatened me in March". They can use
// "MSG-000482, 14 March 2024, 01:47" — pull that row, read it, put it in front
// of a witness. Every derived document in this app therefore cites the rows it
// was built from.
//
// The number comes from the database row id, which is assigned once and never
// changes. That matters more than it looks: an earlier version numbered
// exhibits by their position in a sorted list, so importing one more message
// silently renumbered everything, and a citation written last week pointed at
// the wrong row this week. A reference that moves is worse than no reference.

export const refMsg = (id?: number) => (id == null ? "MSG-?????" : `MSG-${String(id).padStart(6, "0")}`);
export const refInc = (id?: number) => (id == null ? "INC-???" : `INC-${String(id).padStart(4, "0")}`);
export const refEvi = (id?: number) => (id == null ? "E-???" : `E-${String(id).padStart(4, "0")}`);
export const refJrn = (id?: number) => (id == null ? "J-???" : `J-${String(id).padStart(4, "0")}`);
export const refVio = (id?: number) => (id == null ? "V-???" : `V-${String(id).padStart(4, "0")}`);

/** How the reference scheme is explained to whoever receives the export. */
export const REF_KEY = [
  "REFERENCE NUMBERS",
  "  INC-0001   an incident I documented",
  "  MSG-000001 a single message in the archive",
  "  E-0001     an evidence file (photo, video, recording, document)",
  "  J-0001     a journal entry",
  "  V-0001     a violation of a court order",
  "",
  "  These numbers are fixed. They are assigned when a record is first saved",
  "  and never change, so a reference cited in one document points at the same",
  "  record in every other document and in every later export.",
].join("\n");
