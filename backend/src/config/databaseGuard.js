// Refuses to let a non-production process connect to a remote database unless
// that is written down on purpose (ALLOW_REMOTE_DB=true).
//
// Why it exists: until 2026-10-22 the local backend pointed at the production
// Atlas cluster, so every local verification wrote real records that then had
// to be found and deleted by hand. A local database is now the default, and
// this guard stops a missing or stale `.env.local` from silently falling back
// to the production URI. Production (Vercel) is remote by design and is never
// checked.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hostWithoutPort(hostAndPort) {
  if (hostAndPort.startsWith("[")) {
    // IPv6 literal: [::1]:27017
    const end = hostAndPort.indexOf("]");
    return end === -1 ? hostAndPort : hostAndPort.slice(1, end);
  }

  return hostAndPort.split(":")[0];
}

/**
 * True only when EVERY host in a `mongodb://` URI is the local machine.
 * `mongodb+srv://` is always remote (it resolves through DNS).
 */
export function isLocalMongoUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith("mongodb://")) {
    return false;
  }

  const afterScheme = uri.slice("mongodb://".length);
  const authority = afterScheme.split(/[/?]/)[0];
  // Credentials end at the LAST "@" — a password may itself contain "@".
  const hostList = authority.slice(authority.lastIndexOf("@") + 1);

  if (!hostList) {
    return false;
  }

  return hostList.split(",").every((entry) => {
    const host = hostWithoutPort(entry.trim()).toLowerCase();
    return LOCAL_HOSTS.has(host) || /^127(\.\d{1,3}){3}$/.test(host);
  });
}

/**
 * Throws when a non-production process would connect to a remote database
 * without ALLOW_REMOTE_DB=true. The message never contains the URI.
 */
export function assertDatabaseTargetAllowed({ nodeEnv, mongodbUri, allowRemoteDb }) {
  if (nodeEnv === "production") {
    return;
  }

  if (isLocalMongoUri(mongodbUri) || allowRemoteDb === "true") {
    return;
  }

  throw new Error(
    `Refusing to connect: NODE_ENV is "${nodeEnv ?? "unset"}" but MONGODB_URI is not a local database. ` +
      "Point MONGODB_URI at localhost in backend/.env.local, or set ALLOW_REMOTE_DB=true " +
      "if connecting to a remote database is really intended."
  );
}
