import type { DiscoveredDirectory } from "../investigation/paths";
import type { FfufParseResult } from "../types";

export function generateInvestigationIndex(
	targetName: string,
	directories: DiscoveredDirectory[],
	parsed: FfufParseResult,
	scanNoteName: string,
): string {
	const lines: string[] = [
		"---",
		`target: ${targetName}`,
		"tags: [investigation, security]",
		"---",
		"",
		`# ${targetName}`,
		"",
		"Структура по найденным в ffuf путям.",
		"",
	];

	if (parsed.meta.commandline) {
		lines.push("**Цель (ffuf):**", "```", parsed.meta.commandline, "```", "");
	}

	if (directories.length > 0) {
		lines.push("## Найденные директории", "", "| URL | Папка |", "|-----|-------|");

		for (const dir of directories) {
			const linkPath = dir.vaultRelativePath.replace(/\//g, "/");
			lines.push(
				`| \`${dir.normalizedUrl}\` | [[${linkPath}/index\\|${dir.vaultRelativePath}/]] |`,
			);
		}
	} else {
		lines.push("_В результатах нет URL с путями — подпапки не созданы._", "");
	}

	lines.push("", "## Сканирования", "", `- [[${scanNoteName}|FFUF — ${scanNoteName}]]`, "");

	return lines.join("\n");
}

export function generateDirectoryIndex(dir: DiscoveredDirectory): string {
	return [
		"---",
		`url: ${dir.normalizedUrl}`,
		"---",
		"",
		`# ${dir.normalizedUrl}`,
		"",
		`**Путь:** \`${dir.vaultRelativePath}/\``,
		"",
	].join("\n");
}
