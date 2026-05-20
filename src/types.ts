export interface FfufResult {
	input: Record<string, string>;
	position: number;
	status: number;
	length: number;
	words: number;
	lines: number;
	contentType: string;
	redirectLocation: string;
	url: string;
	durationMs: number;
	host: string;
	resultFile: string;
}

export interface FfufParseMeta {
	commandline?: string;
	time?: string;
	sourceFormat: "json" | "ndjson" | "console";
}

export interface FfufParseResult {
	meta: FfufParseMeta;
	results: FfufResult[];
}
