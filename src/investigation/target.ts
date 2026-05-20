import type { FfufParseResult } from "../types";

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>]+/gi;

export function sanitizePathSegment(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/^www\./, "")
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80) || "unknown-target";
}

function hostFromUrl(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		const match = url.match(/^https?:\/\/([^/?#]+)/i);
		return match?.[1] ?? null;
	}
}

function hostFromCommandline(commandline: string): string | null {
	const urls = commandline.match(URL_IN_TEXT_RE);
	if (!urls?.length) return null;
	for (const raw of urls) {
		const host = hostFromUrl(raw);
		if (host) return host;
	}
	return null;
}

export function deriveTargetName(parsed: FfufParseResult, sourceName: string): string {
	if (parsed.meta.commandline) {
		const host = hostFromCommandline(parsed.meta.commandline);
		if (host) return sanitizePathSegment(host);
	}

	for (const result of parsed.results) {
		if (result.host) return sanitizePathSegment(result.host);
		if (result.url) {
			const host = hostFromUrl(result.url);
			if (host) return sanitizePathSegment(host);
		}
	}

	const base = sourceName.replace(/\.[^.]+$/, "").replace(/^ffuf-/, "");
	return sanitizePathSegment(base === "clipboard" ? "target" : base);
}
