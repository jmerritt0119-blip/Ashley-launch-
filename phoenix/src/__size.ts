import "fake-indexeddb/auto";
import { db, exportAllData } from "./db";
const now = Date.now();
// A realistic 27,000-message archive: real-length texts, emoji, punctuation.
const sample = [
  "I never said that and you know it. You always twist everything I say.",
  "where are you",
  "ok",
  "You will never see her again if you keep this up 😤",
  "I'm sorry. I love you. It won't happen again, I promise. Please just answer me.",
];
await db.messages.bulkAdd(Array.from({ length: 27000 }, (_, i) => ({
  date: "2024-03-01", sender: i % 2 ? "Him" : "Me", text: sample[i % sample.length],
  source: "csv", tags: [], starred: i % 40 === 0, createdAt: now,
})));
const data = await exportAllData(false);
const bytes = JSON.stringify(data).length;
console.log(`27,000 messages as JSON: ${(bytes / 1048576).toFixed(1)} MB (${Math.round(bytes / 27000)} bytes each)`);

// How long does a page of the list take, the way the app now reads it?
let t = Date.now();
await db.messages.orderBy("date").reverse().limit(401).toArray();
console.log(`unfiltered page of 400: ${Date.now() - t} ms`);

t = Date.now();
await db.messages.orderBy("date").reverse().filter((m) => m.text.toLowerCase().includes("never")).limit(401).toArray();
console.log(`filtered search (matches early): ${Date.now() - t} ms`);

t = Date.now();
await db.messages.orderBy("date").reverse().filter((m) => m.text.includes("zzzznomatch")).limit(401).toArray();
console.log(`worst case — search matching nothing (scans all 27,000): ${Date.now() - t} ms`);

t = Date.now();
await db.messages.filter((m) => m.starred).toArray();
console.log(`Timeline/Packet starred scan: ${Date.now() - t} ms`);
