import "server-only";
import Database from "better-sqlite3";
import path from "node:path";

// Databasefilen ligger utenfor web/-mappen (se data/schema.sql), siden den
// inneholder personlige treningsdata og ikke skal versjonskontrolleres
// sammen med appkoden.
const DB_PATH = path.join(process.cwd(), "..", "data", "klatre-data.sqlite");

declare global {
  var __klatreDb: Database.Database | undefined;
}

// Gjenbruker én tilkobling på tvers av kall, slik at vi ikke åpner
// databasefilen på nytt for hver server-handling (spesielt viktig i dev
// med hot-reload, som ellers ville lekket filhåndtak).
export function getDb(): Database.Database {
  if (!global.__klatreDb) {
    const db = new Database(DB_PATH);
    db.pragma("foreign_keys = ON");
    global.__klatreDb = db;
  }
  return global.__klatreDb;
}
