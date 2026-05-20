import type { FfufParseMeta, FfufParseResult, FfufResult } from "../types";

const CONSOLE_LINE_RE =
	/^(.+?)\s+\[Status:\s*(\d+),\s*Size:\s*(\d+),\s*Words:\s*(\d+),\s*Lines:\s*(\d+),\s*Duration:\s*(\d+)ms\]/;

interface RawJsonResult {
	input?: Record<string, string>;
	position?: number;
	status?: number;
	length?: number;
	words?: number;
	lines?: number;
	"content-type"?: string;
	redirectlocation?: string;
	url?: string;
	duration?: number | string;
	host?: string;
	resultfile?: string;
}

interface RawJsonFile {
	commandline?: string;
	time?: string;
	results?: RawJsonResult[];
}

function durationToMs(duration: number | string | undefined): number {
	if (duration === undefined) return 0;
	if (typeof duration === "number") {
		// ffuf stores Go time.Duration in nanoseconds in JSON
		return duration > 1_000_000 ? Math.round(duration / 1_000_000) : duration;
	}
	const parsed = Number(duration);
	return Number.isFinite(parsed) ? (parsed > 1_000_000 ? Math.round(parsed / 1_000_000) : parsed) : 0;
}

function normalizeResult(raw: RawJsonResult): FfufResult | null {
	if (raw.url === undefined && raw.status === undefined) return null;

	const input = raw.input ?? {};
	const fuzzValue = Object.values(input)[0] ?? "";

	return {
		input,
		position: raw.position ?? 0,
		status: raw.status ?? 0,
		length: raw.length ?? 0,
		words: raw.words ?? 0,
		lines: raw.lines ?? 0,
		contentType: raw["content-type"] ?? "",
		redirectLocation: raw.redirectlocation ?? "",
		url: raw.url ?? "",
		durationMs: durationToMs(raw.duration),
		host: raw.host ?? "",
		resultFile: raw.resultfile ?? "",
	};
}

function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isFfufResultObject(obj: unknown): obj is RawJsonResult {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
	const o = obj as RawJsonResult;
	return o.url !== undefined || o.status !== undefined;
}

function throwNotFfufJson(data: object): never {
	const keys = Object.keys(data).slice(0, 8).join(", ");
	throw new Error(
		`Файл — валидный JSON, но это не вывод ffuf (нет поля results). ` +
			`Найдены поля: ${keys}. ` +
			`Сохраните скан так: ffuf ... -o scan.json -of json`,
	);
}

function parseJsonFile(text: string): FfufParseResult {
	const parsed: unknown = JSON.parse(stripBom(text).trim());

	let rawResults: RawJsonResult[];
	const meta: FfufParseMeta = { sourceFormat: "json" };

	if (Array.isArray(parsed)) {
		if (parsed.length === 0 || !parsed.every(isFfufResultObject)) {
			throw new Error("JSON-массив не похож на результаты ffuf.");
		}
		rawResults = parsed;
	} else if (typeof parsed === "object" && parsed !== null) {
		const file = parsed as RawJsonFile;
		if (Array.isArray(file.results)) {
			rawResults = file.results;
			meta.commandline = file.commandline;
			meta.time = file.time;
		} else if (isFfufResultObject(file)) {
			rawResults = [file];
		} else {
			throwNotFfufJson(file);
		}
	} else {
		throw new Error("Неизвестная структура JSON.");
	}

	const results = rawResults.map(normalizeResult).filter((r): r is FfufResult => r !== null);

	return { meta, results };
}

function parseNdjson(text: string): FfufParseResult {
	const results: FfufResult[] = [];

	for (const line of stripBom(text).split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;

		let raw: RawJsonResult;
		try {
			raw = JSON.parse(trimmed) as RawJsonResult;
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new Error(`Ошибка JSON в строке NDJSON: ${msg}`);
		}
		const result = normalizeResult(raw);
		if (result) results.push(result);
	}

	return {
		meta: { sourceFormat: "ndjson" },
		results,
	};
}

function parseConsole(text: string): FfufParseResult {
	const results: FfufResult[] = [];
	let current: Partial<FfufResult> | null = null;

	for (const line of text.split("\n")) {
		const trimmed = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
		if (!trimmed) continue;

		const match = trimmed.match(CONSOLE_LINE_RE);
		if (match) {
			if (current?.url || current?.input) {
				results.push(finalizeConsoleResult(current));
			}
			current = {
				input: { FUZZ: match[1].trim() },
				status: Number(match[2]),
				length: Number(match[3]),
				words: Number(match[4]),
				lines: Number(match[5]),
				durationMs: Number(match[6]),
			};
			continue;
		}

		if (!current) continue;

		const urlMatch = trimmed.match(/^\| URL \| (.+)$/);
		if (urlMatch) {
			current.url = urlMatch[1].trim();
			continue;
		}

		const redirectMatch = trimmed.match(/^\| --> \| (.+)$/);
		if (redirectMatch) {
			current.redirectLocation = redirectMatch[1].trim();
		}
	}

	if (current?.url || current?.input) {
		results.push(finalizeConsoleResult(current));
	}

	return {
		meta: { sourceFormat: "console" },
		results,
	};
}

function finalizeConsoleResult(partial: Partial<FfufResult>): FfufResult {
	const input = partial.input ?? {};
	const fuzz = Object.values(input)[0] ?? "";

	return {
		input,
		position: partial.position ?? 0,
		status: partial.status ?? 0,
		length: partial.length ?? 0,
		words: partial.words ?? 0,
		lines: partial.lines ?? 0,
		contentType: partial.contentType ?? "",
		redirectLocation: partial.redirectLocation ?? "",
		url: partial.url ?? fuzz,
		durationMs: partial.durationMs ?? 0,
		host: partial.host ?? "",
		resultFile: partial.resultFile ?? "",
	};
}

function tryParseJson(text: string): unknown | null {
	try {
		return JSON.parse(stripBom(text).trim());
	} catch {
		return null;
	}
}

function detectNdjson(text: string): boolean {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);

	if (lines.length === 0) return false;

	let parsedLines = 0;
	for (const line of lines) {
		if (!line.startsWith("{")) continue;
		try {
			JSON.parse(line);
			parsedLines++;
		} catch {
			return false;
		}
	}

	// NDJSON: несколько полных JSON-объектов по строкам (не один многострочный файл)
	return parsedLines >= 1 && parsedLines === lines.length && lines.length > 1;
}

function detectFormat(text: string): FfufParseMeta["sourceFormat"] {
	const trimmed = stripBom(text).trim();
	if (!trimmed) throw new Error("Файл пустой");

	if (tryParseJson(trimmed) !== null) {
		return "json";
	}

	if (detectNdjson(trimmed)) {
		return "ndjson";
	}

	if (CONSOLE_LINE_RE.test(trimmed) || trimmed.includes("[Status:")) {
		return "console";
	}

	throw new Error(
		"Не удалось определить формат. Поддерживаются: JSON (-of json), NDJSON (-json) и текстовый вывод ffuf.",
	);
}

export function parseFfufOutput(text: string, format?: FfufParseMeta["sourceFormat"]): FfufParseResult {
	const detected = format ?? detectFormat(text);

	switch (detected) {
		case "json":
			return parseJsonFile(text);
		case "ndjson":
			return parseNdjson(text);
		case "console":
			return parseConsole(text);
	}
}

export function filterByStatus(results: FfufResult[], allowed: number[]): FfufResult[] {
	if (allowed.length === 0) return results;
	const set = new Set(allowed);
	return results.filter((r) => set.has(r.status));
}

export function sortResults(
	results: FfufResult[],
	by: "status" | "length" | "url",
	descending: boolean,
): FfufResult[] {
	const copy = [...results];
	const factor = descending ? -1 : 1;

	copy.sort((a, b) => {
		const av = a[by];
		const bv = b[by];
		if (av < bv) return -1 * factor;
		if (av > bv) return 1 * factor;
		return 0;
	});

	return copy;
}
