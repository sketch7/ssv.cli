import { toJsonSchema } from "@valibot/to-json-schema";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format } from "oxfmt";

import { MassCommandsConfigSchema } from "../src/config-schema.js";

const schema = toJsonSchema(MassCommandsConfigSchema, {
	definitions: {},
	errorMode: "ignore",
});

const raw = JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", ...schema });
const outPath = resolve(import.meta.dirname, "../mass-exec.config.schema.json");
const { code } = await format("mass-exec.config.schema.json", raw, {});

writeFileSync(outPath, code, "utf8");
console.log(`Schema written to ${outPath}`);
