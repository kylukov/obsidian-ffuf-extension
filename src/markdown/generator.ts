import type { FfufParseResult, FfufResult } from "../types";

function escapeCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function inputLabel(result: FfufResult): string {
	const parts = Object.entries(result.input).map(([k, v]) =>
		Object.keys(result.input).length > 1 ? `${k}=${v}` : v,
	);
	return parts.join(", ") || "—";
}

export function resultsToMarkdown(parsed: FfufParseResult, results: FfufResult[]): string {
	const lines: string[] = ["---"];

	if (parsed.meta.commandline) {
		lines.push(`ffuf-command: "${parsed.meta.commandline.replace(/"/g, '\\"')}"`);
	}
	if (parsed.meta.time) {
		lines.push(`ffuf-time: "${parsed.meta.time}"`);
	}
	lines.push(`ffuf-format: ${parsed.meta.sourceFormat}`);
	lines.push(`ffuf-count: ${results.length}`);
	lines.push("tags: [ffuf, security]");
	lines.push("---", "");

	lines.push("# FFUF scan results", "");
	if (parsed.meta.commandline) {
		lines.push("**Команда:**", "```", parsed.meta.commandline, "```", "");
	}
	if (parsed.meta.time) {
		lines.push(`**Время:** ${parsed.meta.time}`, "");
	}
	lines.push(`**Записей:** ${results.length}`, "");

	if (results.length === 0) {
		lines.push("_Нет результатов после фильтрации._");
		return lines.join("\n");
	}

	lines.push(
		"| # | Input | Status | Size | Words | Lines | Duration | URL |",
		"|---:|---|---:|---:|---:|---:|---:|---|",
	);

	results.forEach((r, i) => {
		const url = r.url ? `[${escapeCell(r.url)}](${r.url})` : "—";
		lines.push(
			`| ${i + 1} | ${escapeCell(inputLabel(r))} | ${r.status} | ${r.length} | ${r.words} | ${r.lines} | ${r.durationMs}ms | ${url} |`,
		);
	});

	const redirects = results.filter((r) => r.redirectLocation);
	if (redirects.length > 0) {
		lines.push("", "## Redirects", "");
		for (const r of redirects) {
			lines.push(`- \`${r.url}\` → \`${r.redirectLocation}\``);
		}
	}

	return lines.join("\n");
}
