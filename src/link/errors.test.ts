import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { formatValidationError } from "./errors";
import { LinkConfigSchema } from "./schema";

describe("formatValidationError", () => {
	it("includes the file and invalid field path", () => {
		const result = v.safeParse(LinkConfigSchema, {
			links: { source: { packages: ["UpperCase"] } },
		});
		if (result.success) {
			throw new Error("Expected the fixture to be invalid");
		}

		expect(formatValidationError(result.issues, "S:/repo/.ssv-links.yaml")).toContain(
			"S:/repo/.ssv-links.yaml\n  - links.source.packages.0: Must be a valid npm package name",
		);
	});
});
