import type { FfufParseResult, FfufResult } from "../types";
import { sanitizePathSegment } from "./target";

const FILE_EXT_RE = /\.[a-z0-9]{1,10}$/i;
const SKIP_FUZZ = new Set([".", "..", ""]);

export interface DiscoveredDirectory {
	normalizedUrl: string;
	vaultRelativePath: string;
}

function parseResultUrl(raw: string): URL | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	try {
		return new URL(trimmed);
	} catch {
		const match = trimmed.match(/^(https?):\/\/([^/?#]+)(\/[^?#]*)?/i);
		if (!match) return null;
		return new URL(`${match[1]}://${match[2]}${match[3] ?? "/"}`);
	}
}

function extractFuzzUrlTemplate(commandline?: string): string | null {
	if (!commandline) return null;
	const match = commandline.match(/-u\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function getFuzzWord(result: FfufResult): string {
	const values = Object.values(result.input);
	return (values[0] ?? "").trim();
}

function applyFuzzToTemplate(template: string, fuzz: string): string {
	return template.replace(/FUZ2Z/g, fuzz).replace(/FUZZ/g, fuzz);
}

export function resolveResultUrl(parsed: FfufParseResult, result: FfufResult): string | null {
	const candidates = [result.url, result.redirectLocation].filter(Boolean) as string[];

	for (const raw of candidates) {
		if (parseResultUrl(raw)) return raw;
	}

	const fuzz = getFuzzWord(result);
	if (SKIP_FUZZ.has(fuzz)) return null;

	const template = extractFuzzUrlTemplate(parsed.meta.commandline);
	if (template && /FUZZ|FUZ2Z/i.test(template)) {
		return applyFuzzToTemplate(template, fuzz);
	}

	return null;
}

function directoryPathname(pathname: string): string {
	if (!pathname || pathname === "/") return "";

	let path = pathname;
	if (!path.endsWith("/")) {
		const lastSlash = path.lastIndexOf("/");
		const lastSegment = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
		if (FILE_EXT_RE.test(lastSegment)) {
			path = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
		}
	} else {
		path = path.slice(0, -1);
	}

	return path.startsWith("/") ? path.slice(1) : path;
}

function allDirectoryPrefixes(dirPath: string): string[] {
	const segments = dirPath.split("/").filter(Boolean);
	const prefixes: string[] = [];

	for (let i = 1; i <= segments.length; i++) {
		prefixes.push(segments.slice(0, i).join("/"));
	}

	return prefixes;
}

function toNormalizedDirectoryUrl(host: string, dirPath: string): string {
	const path = dirPath ? `/${dirPath}/` : "/";
	return `http://${host}${path}`;
}

function toVaultRelativePath(dirPath: string): string {
	return dirPath
		.split("/")
		.map((segment) => sanitizePathSegment(segment))
		.filter(Boolean)
		.join("/");
}

export function extractDiscoveredDirectories(
	parsed: FfufParseResult,
	results: FfufResult[],
): DiscoveredDirectory[] {
	const byUrl = new Map<string, DiscoveredDirectory>();

	for (const result of results) {
		const rawUrl = resolveResultUrl(parsed, result);
		if (!rawUrl) continue;

		const url = parseResultUrl(rawUrl);
		if (!url?.hostname) continue;

		const fullDirPath = directoryPathname(url.pathname);
		if (!fullDirPath) continue;

		const host = url.hostname.toLowerCase();

		for (const prefix of allDirectoryPrefixes(fullDirPath)) {
			const vaultRelativePath = toVaultRelativePath(prefix);
			if (!vaultRelativePath) continue;

			const normalizedUrl = toNormalizedDirectoryUrl(host, prefix);
			byUrl.set(normalizedUrl, { normalizedUrl, vaultRelativePath });
		}
	}

	return [...byUrl.values()].sort((a, b) => a.vaultRelativePath.localeCompare(b.vaultRelativePath));
}
