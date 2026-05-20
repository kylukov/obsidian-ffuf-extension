import { App, TFile } from "obsidian";

export async function ensureFolderPath(app: App, folderPath: string): Promise<void> {
	const parts = folderPath.split("/").filter(Boolean);
	let current = "";

	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (!app.vault.getAbstractFileByPath(current)) {
			await app.vault.createFolder(current);
		}
	}
}

export async function writeVaultNote(
	app: App,
	path: string,
	content: string,
): Promise<TFile> {
	await ensureFolderPath(app, path.split("/").slice(0, -1).join("/"));

	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await app.vault.modify(existing, content);
		return existing;
	}

	return app.vault.create(path, content);
}
