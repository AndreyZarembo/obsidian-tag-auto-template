import { tagAutotemplateField } from 'tagAutotemplateWidget';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { setAutotemplatesEffect, autotemplatesStateField } from 'autotemplatesStateField';
import { EditorView } from "@codemirror/view";
import * as yaml from 'js-yaml';

// Remember to rename these classes and interfaces!

interface TagAutotemplatePluginSettings {
	autotagTemplatesFolder: string;
}

const DEFAULT_SETTINGS: TagAutotemplatePluginSettings = {
	autotagTemplatesFolder: ''
}

export default class TagAutotemplatePlugin extends Plugin {

	settings: TagAutotemplatePluginSettings;
	loadedTemplates: Map<string, string[]> = new Map<string, string[]>();

	async getFileTags(file: TFile): Promise<string[]> {

		let content = await this.app.vault.read(file);

		let tags = [];
		const frontMatter = content.match(/^---\n([\s\S]*?)\n---/);
		let params;

		if (frontMatter == null) { return []; }

		params = yaml.load(frontMatter[1]);
		tags = (params as any)["tags"];
		return tags;
	}

	getEditorView(): EditorView | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view == null) { return null }
		// @ts-expect-error, not typed
		const editorView = view.editor.cm as EditorView;
		return editorView;
	}

	async loadFileContents(tags: string[]): Promise<string> {

		let filesToRender: string[] = [];
		for (let tag of tags) {
			let templates = this.loadedTemplates.get(tag);
			if (templates == null) {
				continue;
			}

			for (let template of templates) {
				if (!filesToRender.contains(template)) {
					filesToRender.push(template);
				}
			}
		}

		let contents: string[] = await Promise.all(filesToRender.map(filename => this.loadTemplateContent(filename)));
		return contents.join("\n");
	}

	async loadTemplateContent(filename: string): Promise<string> {

		let filepath = this.settings.autotagTemplatesFolder + "/" + filename + ".md";
		let file = this.app.vault.getAbstractFileByPath(filepath);
		// console.log("FILE from ", filepath, file);
		if (!(file instanceof TFile)) {
			return "";
		}
		let fileContent = await this.app.vault.cachedRead(file);

		const filteredContent = fileContent.replace(/^---\n([\s\S]*?)\n---/, "");

		return filteredContent.trim();
	}

	dispatchAutotemplates() {

		let file = this.app.workspace.getActiveFile();
		if (file == null) { return; }

		if (file.path.startsWith(this.settings.autotagTemplatesFolder + "/")) {
			// console.log("File from templates");
			return;
		}

		let editorView = this.getEditorView()
		this.getFileTags(file).then(tags => {

			// console.log("Loaded tags for ", file?.basename, " are ", tags);

			let autotemplates: { tag: string, template: string }[] = [];
			for (let tag of tags) {
				let templates = this.loadedTemplates.get(tag);
				if (templates == null) {
					continue;
				}
				// console.log('-');
				for (let template of templates) {
					autotemplates.push({ tag: tag, template: template });
				}
			}

			// console.log("Autotemplates for ", file?.basename, " are ", autotemplates);

			editorView?.dispatch({
				effects: [setAutotemplatesEffect.of(autotemplates)],
			})
		});
	}

	async onload() {
		await this.loadSettings();

		const Prec = require("@codemirror/state").Prec;
		this.registerEditorExtension([autotemplatesStateField, Prec.lowest(tagAutotemplateField(this))]);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TagAutotemplatePluginSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file != null && file.extension === 'md') {
					this.dispatchAutotemplates();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {

				if (file.path === this.app.workspace.getActiveFile()?.path) {
					// console.log("File changed");
					this.dispatchAutotemplates();
				}
			})
		);

		this.app.vault.on('create', (file) => {
			if (file.path.startsWith(this.settings.autotagTemplatesFolder + "/")) {
				this.lookupTemplates();
			}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		await this.lookupTemplates();
		this.dispatchAutotemplates();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async getTemplateFileTags(file: TFile): Promise<{ filename: string, tags: string[] }> {

		// console.log("Loading tags for ", file);

		let fileTags = await this.getFileTags(file);

		// console.log("file tags ", fileTags);

		return { filename: file.basename, tags: fileTags }
	}

	async lookupTemplates() {

		this.loadedTemplates.clear();

		// console.log("LOADING TEMPLATES FROM", this.settings.autotagTemplatesFolder);
		if (this.settings.autotagTemplatesFolder == null || this.settings.autotagTemplatesFolder.length == 0) {
			return;
		}

		let files = this.app.vault.getMarkdownFiles();

		// console.log("FILES", files, this.app.vault.getFiles());

		// Фильтруем файлы, чтобы найти те, что находятся в папке шаблонов
		const templateFiles = files.filter(file => file.path.startsWith(this.settings.autotagTemplatesFolder + "/"));
		// console.log("templateFiles", templateFiles);

		let matchedTemplates = await Promise.all(templateFiles.map(file => this.getTemplateFileTags(file)));
		// console.log("matchedTemplates", matchedTemplates);

		for (let template of matchedTemplates) {
			for (let tag of template.tags) {
				let existingTemplates = this.loadedTemplates.get(tag) ?? [];
				if (!existingTemplates.contains(template.filename)) {
					this.loadedTemplates.set(tag, existingTemplates.concat(template.filename));
				}
			}
		}

		// console.log("loadedTemplates", this.loadedTemplates);
	}
}

class TagAutotemplatePluginSettingTab extends PluginSettingTab {
	plugin: TagAutotemplatePlugin;

	constructor(app: App, plugin: TagAutotemplatePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Auto Tag Templates folder')
			.setDesc('Select the folder containing your templates to be applied based on tags')
			.addText(text => text
				.setPlaceholder('e.g. autotemplates')
				.setValue(this.plugin.settings.autotagTemplatesFolder)
				.onChange(async (value) => {
					this.plugin.settings.autotagTemplatesFolder = value;
					await this.plugin.saveSettings();
					this.plugin.lookupTemplates();
				}));
	}
}
