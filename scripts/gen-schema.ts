import { toJsonSchema } from "@valibot/to-json-schema";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { format } from "oxfmt";

import { MassCommandsConfigSchema } from "../src/config-schema.ts";
import { LinkConfigSchema } from "../src/link/schema.ts";

const schemas = [
	{ fileName: "mass-exec.config.schema.json", schema: MassCommandsConfigSchema },
	{ fileName: "ssv-links.config.schema.json", schema: LinkConfigSchema },
] as const;

await Promise.all(
	schemas.map(async entry => {
		const schema = toJsonSchema(entry.schema, {
			definitions: {},
			errorMode: "ignore",
		});
		const raw = JSON.stringify({ $schema: "http://json-schema.org/draft-07/schema#", ...schema });
		const outPath = resolve(import.meta.dirname, `../${entry.fileName}`);
		const { code } = await format(entry.fileName, raw, {});

		writeFileSync(outPath, code, "utf8");
		console.log(`Schema written to ${outPath}`);
	}),
);
