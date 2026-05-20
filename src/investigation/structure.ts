export function investigationRoot(baseFolder: string, targetName: string): string {
	const base = baseFolder.replace(/^\/|\/$/g, "");
	return base ? `${base}/${targetName}` : targetName;
}
