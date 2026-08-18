/**
 * MongoDB connection singleton.
 *
 * Uses the native `mongodb` driver (not Prisma) so we can connect to the
 * user-provided MongoDB instance directly. Prisma would require a schema
 * migration step and a separate MongoDB connector — overkill for this app.
 *
 * On Vercel, the cached client is reused across warm invocations of the same
 * serverless function instance.
 */
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'invoice_tracker';

if (!uri) {
  console.warn('[mongo] MONGO_URI is not set. MongoDB-backed features will be disabled.');
}

interface CachedConn {
  client: MongoClient | null;
  db: Db | null;
  promise: Promise<{ client: MongoClient; db: Db }> | null;
}

const globalForMongo = globalThis as unknown as {
  _mongoConn?: CachedConn;
};

const cached: CachedConn = globalForMongo._mongoConn ?? {
  client: null,
  db: null,
  promise: null,
};

globalForMongo._mongoConn = cached;

export async function getMongo(): Promise<{ client: MongoClient; db: Db } | null> {
  if (!uri) return null;
  if (cached.client && cached.db) {
    return { client: cached.client, db: cached.db };
  }
  if (!cached.promise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 5000,
    });
    cached.promise = client.connect().then((c) => {
      const db = c.db(dbName);
      cached.client = c;
      cached.db = db;
      return { client: c, db };
    });
  }
  try {
    return await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
}

export async function getDb(): Promise<Db | null> {
  const r = await getMongo();
  return r?.db ?? null;
}

export const MONGO_ENABLED = !!uri;
