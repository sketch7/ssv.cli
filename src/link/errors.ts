import { getDotPath } from "valibot";
import type { BaseIssue } from "valibot";

export function formatValidationError(issues: readonly BaseIssue<unknown>[], filePath: string): string {
	const details = issues.map(issue => `  - ${getDotPath(issue) ?? "(root)"}: ${issue.message}`).join("\n");
	return `Invalid ${filePath}\n${details}`;
}
