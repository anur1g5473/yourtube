import path from "node:path";

let readerPath;
let readerPromise;

const openDatabase = async (databasePath) => {
  const maxmind = await import("maxmind");
  const open = maxmind.open || maxmind.default?.open;
  if (typeof open !== "function") throw new Error("The MaxMind reader package does not expose an open function");
  return open(databasePath);
};

export const lookupIpLocation = async (ipAddress) => {
  const configuredPath = process.env.GEOIP_DB_PATH;
  if (!configuredPath) return { status: "unconfigured" };
  if (typeof ipAddress !== "string" || !ipAddress.trim()) return { status: "not_found" };

  const databasePath = path.resolve(configuredPath);
  if (!readerPromise || readerPath !== databasePath) {
    readerPath = databasePath;
    readerPromise = openDatabase(databasePath);
  }

  try {
    const reader = await readerPromise;
    const normalizedIp = ipAddress.replace(/^::ffff:/i, "");
    const record = reader.get(normalizedIp);
    if (!record) return { status: "not_found" };
    const city = record.city?.names?.en;
    const state = record.subdivisions?.[0]?.names?.en;
    const country = record.country?.names?.en;
    if (!city && !state && !country) return { status: "not_found" };
    return { status: "resolved", city, state, country };
  } catch (error) {
    readerPromise = undefined;
    throw error;
  }
};
