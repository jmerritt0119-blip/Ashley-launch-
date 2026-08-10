// The two lists that define what a finding is allowed to be called.
//
// They used to live in db.ts, which is the right place for them conceptually
// and the wrong place for them practically: db.ts opens an IndexedDB
// connection through Dexie the moment it is imported, so anything that wanted
// the vocabulary — above all buildScanPrompt, which embeds both lists in every
// scan request — could only run inside a browser.
//
// That is how the scanner ended up being debugged by reasoning rather than by
// running it. The prompt that reads her archive is the single most important
// string in this app, and it could not be printed, diffed or exercised from a
// terminal without standing up a whole browser environment.
//
// Splitting them out changes nothing about the data: db.ts re-exports both, so
// every existing import keeps working unchanged, and the values themselves are
// byte-for-byte what they were. It only means the scan prompt can now be built
// and tested by a script.

export const INCIDENT_CATEGORIES = [
  "physical",
  "verbal / emotional",
  "coercive control",
  "financial abuse",
  "threats / intimidation",
  "stalking / monitoring",
  "sexual abuse",
  "property damage",
  "children / custody",
  "digital abuse",
  "legal / litigation abuse",
  "isolation",
] as const;

export const MESSAGE_TAGS = [
  "threat",
  "control",
  "financial",
  "custody / children",
  "harassment",
  "admission",
  "apology-cycle",
  "monitoring",
] as const;
