import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { toJsonSchema } from "@valibot/to-json-schema";
import { MassCommandsConfigSchema } from "../src/config-schema.js";

const schema = toJsonSchema(MassCommandsConfigSchema, {
	definitions: {},
	errorMode: "ignore",
});

const out = JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", ...schema }, null, "\t");
const outPath = resolve(import.meta.dirname, "../mass-exec.config.schema.json");

writeFileSync(outPath, out + "\n", "utf8");
console.log(`Schema written to ${outPath}`);
