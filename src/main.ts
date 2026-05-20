import { MarkdownView, Menu, Notice, Plugin, TAbstractFile, TFile } from "obsidian";
import { extractDiscoveredDirectories } from "./investigation/paths";
import { investigationRoot } from "./investigation/structure";
import { deriveTargetName } from "./investigation/target";
import {
	generateDirectoryIndex,
	generateInvestigationIndex,
} from "./markdown/investigation-index";
import { resultsToMarkdown } from "./markdown/generator";
import { filterByStatus, parseFfufOutput, sortResults } from "./parser";
import { DEFAULT_SETTINGS, FfufSettingTab, type FfufPluginSettings } from "./settings";
import type { FfufParseResult, FfufResult } from "./types";
import { ensureFolderPath, writeVaultNote } from "./vault/files";

const FFUF_FILE_EXTENSIONS = new Set(["json", "ndjson", "txt", "log", "csv"]);

function isFfufSourceFile(file: TAbstractFile): file is TFile {
	if (!(file instanceof TFile)) return false;
	const ext = file.extension.toLowerCase();
	return FFUF_FILE_EXTENSIONS.has(ext);
}

export default class FfufPlugin extends Plugin {
	settings: FfufPluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("scan-search", "Parse ffuf results", () => {
			void this.parseActiveFile();
		});

		this.addCommand({
			id: "parse-active-file",
			name: "Parse ffuf: active file",
			callback: () => void this.parseActiveFile(),
		});

		this.addCommand({
			id: "parse-clipboard",
			name: "Parse ffuf: clipboard",
			callback: () => void this.parseClipboard(),
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				if (!isFfufSourceFile(file)) return;

				menu.addItem((item) => {
					item
						.setTitle("Обработать как FFUF")
						.setIcon("scan-search")
						.onClick(() => void this.parseFile(file));
				});
			}),
		);

		this.addSettingTab(new FfufSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<FfufPluginSettings>) };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private parseStatusFilter(): number[] {
		if (!this.settings.statusFilter.trim()) return [];
		return this.settings.statusFilter
			.split(",")
			.map((s) => parseInt(s.trim(), 10))
			.filter((n) => Number.isFinite(n));
	}

	private filteredResults(parsed: FfufParseResult): FfufResult[] {
		let results = filterByStatus(parsed.results, this.parseStatusFilter());
		return sortResults(results, this.settings.sortBy, this.settings.sortDescending);
	}

	private applySettings(parsed: FfufParseResult) {
		return resultsToMarkdown(parsed, this.filteredResults(parsed));
	}

	private async createInvestigationStructure(
		targetName: string,
		parsed: FfufParseResult,
		scanMarkdown: string,
		stamp: string,
	): Promise<string> {
		const results = this.filteredResults(parsed);
		const directories = extractDiscoveredDirectories(parsed, results);
		const root = investigationRoot(this.settings.outputFolder, targetName);
		const scanNoteName = `ffuf-${stamp}`;

		await ensureFolderPath(this.app, root);

		for (const dir of directories) {
			const folderPath = `${root}/${dir.vaultRelativePath}`;
			await ensureFolderPath(this.app, folderPath);

			const indexPath = `${folderPath}/index.md`;
			const indexExists = this.app.vault.getAbstractFileByPath(indexPath);
			if (!(indexExists instanceof TFile)) {
				await writeVaultNote(this.app, indexPath, generateDirectoryIndex(dir));
			}
		}

		const scanPath = `${root}/${scanNoteName}.md`;
		await writeVaultNote(this.app, scanPath, scanMarkdown);

		const mainIndexPath = `${root}/index.md`;
		const mainIndex = generateInvestigationIndex(targetName, directories, parsed, scanNoteName);
		await writeVaultNote(this.app, mainIndexPath, mainIndex);

		return scanPath;
	}

	private async outputMarkdown(markdown: string, parsed: FfufParseResult, sourceName: string) {
		if (this.settings.replaceSelection) {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				view.editor.replaceSelection(markdown);
				new Notice("FFUF: результат вставлен в редактор");
				return;
			}
		}

		const stamp = parsed.meta.time
			? parsed.meta.time.slice(0, 10)
			: new Date().toISOString().slice(0, 10);

		if (this.settings.createInvestigationStructure) {
			const targetName = deriveTargetName(parsed, sourceName);
			const path = await this.createInvestigationStructure(targetName, parsed, markdown, stamp);
			const dirs = extractDiscoveredDirectories(parsed, this.filteredResults(parsed)).length;
			await this.app.workspace.openLinkText(path, "", false);
			new Notice(
				`FFUF v0.3.1: ${investigationRoot(this.settings.outputFolder, targetName)}/ — ${dirs} папок`,
			);
			return;
		}

		const baseName = `ffuf-${stamp}-${sourceName.replace(/\.[^.]+$/, "")}`;
		const folder = this.settings.outputFolder.replace(/^\/|\/$/g, "");
		const path = folder ? `${folder}/${baseName}.md` : `${baseName}.md`;

		const file = await writeVaultNote(this.app, path, markdown);
		await this.app.workspace.openLinkText(file.path, "", false);
		new Notice(`FFUF: создано ${file.path}`);
	}

	private async parseText(text: string, sourceName: string) {
		try {
			const parsed = parseFfufOutput(text);
			const markdown = this.applySettings(parsed);
			await this.outputMarkdown(markdown, parsed, sourceName);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			new Notice(`FFUF: ${message}`, 8000);
			console.error("[obsidian-ffuf]", e);
		}
	}

	private async parseFile(file: TFile) {
		const text = await this.app.vault.read(file);
		await this.parseText(text, file.basename);
	}

	private async parseActiveFile() {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("FFUF: нет активного файла");
			return;
		}
		if (!isFfufSourceFile(file)) {
			new Notice("FFUF: откройте .json, .ndjson, .txt или другой поддерживаемый файл");
			return;
		}
		await this.parseFile(file);
	}

	private async parseClipboard() {
		const text = await navigator.clipboard.readText();
		if (!text.trim()) {
			new Notice("FFUF: буфер обмена пуст");
			return;
		}
		await this.parseText(text, "clipboard");
	}
}
