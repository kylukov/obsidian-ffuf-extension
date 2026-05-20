import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors src/investigation/paths.ts for smoke test
const FILE_EXT_RE = /\.[a-z0-9]{1,10}$/i;
const SKIP_FUZZ = new Set([".", "..", ""]);

function parseResultUrl(raw) {
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

function extractFuzzUrlTemplate(commandline) {
	if (!commandline) return null;
	const match = commandline.match(/-u\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i);
	return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function resolveResultUrl(parsed, result) {
	for (const raw of [result.url, result.redirectlocation].filter(Boolean)) {
		if (parseResultUrl(raw)) return raw;
	}
	const fuzz = Object.values(result.input ?? {})[0]?.trim() ?? "";
	if (SKIP_FUZZ.has(fuzz)) return null;
	const template = extractFuzzUrlTemplate(parsed.commandline);
	if (template && /FUZZ|FUZ2Z/i.test(template)) {
		return template.replace(/FUZ2Z/g, fuzz).replace(/FUZZ/g, fuzz);
	}
	return null;
}

function directoryPathname(pathname) {
	if (!pathname || pathname === "/") return "";
	let path = pathname;
	if (!path.endsWith("/")) {
		const lastSlash = path.lastIndexOf("/");
		const lastSegment = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
		if (FILE_EXT_RE.test(lastSegment)) path = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
	} else path = path.slice(0, -1);
	return path.startsWith("/") ? path.slice(1) : path;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "examples/books-res.json"), "utf8"));
const dirs = new Map();

for (const r of data.results) {
	const rawUrl = resolveResultUrl(
		{ commandline: data.commandline },
		{
			url: r.url,
			redirectlocation: r.redirectlocation,
			input: r.input,
		},
	);
	if (!rawUrl) continue;
	const u = parseResultUrl(rawUrl);
	const dirPath = directoryPathname(u.pathname);
	if (!dirPath) continue;
	const segments = dirPath.split("/");
	for (let i = 1; i <= segments.length; i++) {
		const p = segments.slice(0, i).join("/");
		dirs.set(p, `http://${u.hostname}/${p}/`);
	}
}

console.log([...dirs.entries()].map(([k, v]) => `${k} → ${v}`).join("\n"));
