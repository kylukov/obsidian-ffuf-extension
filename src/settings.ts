import { App, PluginSettingTab, Setting } from "obsidian";
import type FfufPlugin from "./main";

export interface FfufPluginSettings {
	outputFolder: string;
	createInvestigationStructure: boolean;
	statusFilter: string;
	sortBy: "status" | "length" | "url";
	sortDescending: boolean;
	replaceSelection: boolean;
}

export const DEFAULT_SETTINGS: FfufPluginSettings = {
	outputFolder: "",
	createInvestigationStructure: true,
	statusFilter: "",
	sortBy: "status",
	sortDescending: false,
	replaceSelection: false,
};

export class FfufSettingTab extends PluginSettingTab {
	plugin: FfufPlugin;

	constructor(app: App, plugin: FfufPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Создавать структуру исследования")
			.setDesc(
				"Создаёт папку цели (books.toscrape.com/) только для путей из URL в ffuf: /media → http://books.toscrape.com/media/, плюс scans/ с таблицей.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.createInvestigationStructure).onChange(async (value) => {
					this.plugin.settings.createInvestigationStructure = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Базовая папка")
			.setDesc(
				"Родитель для папок целей. Пусто — в корне vault. Пример: research → research/books.toscrape.com/",
			)
			.addText((text) =>
				text
					.setPlaceholder("(корень vault)")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Фильтр по статус-кодам")
			.setDesc("Через запятую, например: 200,301,302. Пусто — показать все.")
			.addText((text) =>
				text
					.setPlaceholder("200,301")
					.setValue(this.plugin.settings.statusFilter)
					.onChange(async (value) => {
						this.plugin.settings.statusFilter = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Сортировка")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("status", "Status")
					.addOption("length", "Size")
					.addOption("url", "URL")
					.setValue(this.plugin.settings.sortBy)
					.onChange(async (value) => {
						this.plugin.settings.sortBy = value as FfufPluginSettings["sortBy"];
						await this.plugin.saveSettings();
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sortDescending)
					.setTooltip("По убыванию")
					.onChange(async (value) => {
						this.plugin.settings.sortDescending = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Вставлять вместо выделения")
			.setDesc("Если включено — markdown вставится в редактор. Иначе создаётся структура или заметка.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.replaceSelection).onChange(async (value) => {
					this.plugin.settings.replaceSelection = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
