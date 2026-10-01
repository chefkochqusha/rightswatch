#!/usr/bin/env node
/**
 * Pushes prisma/schema.prisma to a LOCAL Postgres — the `prisma db push`
 * this build sandbox can't run, because Prisma's native schema-engine binary
 * is downloaded from binaries.prisma.sh, which the sandbox can't reach. Uses
 * Prisma's own WebAssembly build of the same schema engine instead (an npm
 * package, version-matched below to the installed Prisma), talking to the
 * database through the project's own @prisma/adapter-pg.
 *
 * Local verification only. Production's schema is pushed by Vercel's build
 * (`prisma db push` in package.json's `build`), never by this — which is
 * also why it refuses any DATABASE_URL that isn't on localhost.
 *
 *   npm run db:local              # local Postgres via `prisma dev`; leave it running
 *   export DATABASE_URL="postgres://postgres:postgres@localhost:55432/template1?sslmode=disable"
 *   npm run db:local:push         # this script
 *   npx prisma db seed            # the plan catalog
 *   PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate
 *                                 # generate never runs the engine; it only
 *                                 # refuses to start without one to point at
 *
 * Prints the engine's result. Any `warnings` (possible data loss) or
 * `unexecutable` steps mean nothing was applied — the same changes Vercel's
 * `prisma db push` would refuse without --accept-data-loss — so this is
 * where to find that out before deploying a schema change.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const projectRequire = createRequire(path.join(root, "package.json"));

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("DATABASE_URL must point at a local Postgres (localhost). This script never touches a remote database.");
  process.exit(1);
}

// The WASM engine must match the installed Prisma exactly; @prisma/engines-version
// carries that version string.
const { version } = projectRequire("@prisma/engines-version/package.json");
const cacheDir = path.join(root, "node_modules", ".cache", "schema-engine-wasm", version);
const entry = path.join(cacheDir, "node_modules", "@prisma", "schema-engine-wasm", "schema_engine.js");
if (!fs.existsSync(entry)) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, "package.json"), '{ "private": true }\n');
  execFileSync(
    "npm",
    ["install", "--prefix", cacheDir, "--no-audit", "--no-fund", `@prisma/schema-engine-wasm@${version}`],
    { stdio: "inherit" },
  );
}

const { SchemaEngine } = await import(pathToFileURL(entry).href);
const { PrismaPg } = projectRequire("@prisma/adapter-pg");
const { bindMigrationAwareSqlAdapterFactory } = projectRequire("@prisma/driver-adapter-utils");

// @prisma/adapter-pg has no mapping for Postgres's internal single-byte "char"
// type (OID 18) or its array (OID 1002). Only the schema engine's own
// pg_catalog queries ever return them, and their values already arrive as
// plain strings, so they're relabeled as text / text[] before the adapter
// maps column types.
function relabelCharColumns(queryable) {
  const perform = queryable.performIO.bind(queryable);
  queryable.performIO = async (query) => {
    const result = await perform(query);
    for (const field of result?.fields ?? []) {
      if (field.dataTypeID === 18) field.dataTypeID = 25;
      if (field.dataTypeID === 1002) field.dataTypeID = 1009;
    }
    return result;
  };
  if (typeof queryable.startTransaction === "function") {
    const start = queryable.startTransaction.bind(queryable);
    queryable.startTransaction = async (...args) => relabelCharColumns(await start(...args));
  }
  return queryable;
}

const factory = new PrismaPg({ connectionString: url });
const connect = factory.connect.bind(factory);
factory.connect = async () => relabelCharColumns(await connect());
if (factory.connectToShadowDb) {
  const connectShadow = factory.connectToShadowDb.bind(factory);
  factory.connectToShadowDb = async () => relabelCharColumns(await connectShadow());
}

const schema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const engine = await SchemaEngine.new(
  { datamodels: [["schema.prisma", schema]] },
  () => {},
  bindMigrationAwareSqlAdapterFactory(factory),
);
const result = await engine.schemaPush({
  force: false,
  schema: { files: [{ path: "schema.prisma", content: schema }] },
  filters: { externalTables: [], externalEnums: [] },
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.warnings?.length || result.unexecutable?.length ? 2 : 0);
