import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	addIcon,
	request,
	Vault,
	requestUrl,
	TAbstractFile
} from 'obsidian';

import { FolderSuggest } from "./src/FolderSuggester";

import AdmZip from 'adm-zip';

// Remember to rename these classes and interfaces!

interface WiscOPluginSettings {
	WiscOSyncKeySetting: string;
	WiscOLocalFilePathSetting: string;
	WiscOURLSetting: string;
	WiscODlNewSetting: string;
}

const WiscO_DEFAULT_SETTINGS: WiscOPluginSettings = {
	WiscOSyncKeySetting: 'default',
	WiscOLocalFilePathSetting: 'WiscO',
	WiscOURLSetting: 'https://wisco.tunnelto.dev',
	WiscODlNewSetting: "true"
}

async function unzipFile(filePath, destPath) {
	try {
		const zip = new AdmZip(filePath);
		zip.extractAllTo(destPath, true);
	} catch (e) {
		console.log("error in unzipping the file")
		console.log(e);
	}
}

export default class WiscOPlugin extends Plugin {
	settings: WiscOPluginSettings;

	async onload() {
		console.log("plugin loadded..");
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('sigma', 'WiscO Sync Plugin', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('WiscO Sync started');

			console.log("sync initiated");
			const WiscOSyncVal = await this.loadData();

			if (WiscOSyncVal == null || WiscOSyncVal.WiscOSyncKeySetting == '' || WiscOSyncVal.WiscOSyncKeySetting == 'default') {
				new Notice('WiscO Sync Failed! Please add the WiscO sync key in the plugin settings.');
				return
			}

			const {
				vault
			} = this.app;

			//Step 1. Create file and get its name from cloud storage 

			let sync_key = WiscOSyncVal.WiscOSyncKeySetting;
			let baseUrl = WiscOSyncVal.WiscOURLSetting;
			let dlOnlyNew = WiscOSyncVal.WiscODlNewSetting;

			let zipFileName = await this.getNotesZipFileName(sync_key, baseUrl, dlOnlyNew);
			if (zipFileName == null) {
				return;
			}
			console.log("zipname is " + zipFileName);
			let fileUrl = baseUrl + "/v1/dlZip"

			//Step 2 : Download the file as zip
			//before downloading delete the file if it exists 
			const files = this.app.vault.getFiles()

			const file = this.app.vault.getAbstractFileByPath(`${zipFileName}`)
			if (file) {
				this.app.vault.delete(file);
			}
			await this.downloadWiscONotesAsZip(vault, fileUrl, zipFileName);

			//@ts-ignore
			let folderPath = this.app.vault.adapter.basePath;
			let zipFilePath = folderPath + "/" + zipFileName;

			// Step 3: create a folder of WiscO
			try {
				if (!(this.app.vault.getAbstractFileByPath(WiscOSyncVal.WiscOLocalFilePathSetting) instanceof TFolder)) {
					await vault.createFolder(WiscOSyncVal.WiscOLocalFilePathSetting)
				}
			} catch (e) {
				console.log("error in creating the folder")
				console.log(e);
			}
			let unzip_folder = folderPath + '/' + WiscOSyncVal.WiscOLocalFilePathSetting + '/'

			// Step 4: unzip file in the WiscO folder
			await unzipFile(zipFilePath, unzip_folder);

			//Step 5: delete the zip file

			const file2 = this.app.vault.getAbstractFileByPath(`${zipFileName}`)
			if (file2) {
				this.app.vault.delete(file2);
			} else {
				console.log("Unable to delete file");
			}
			new Notice('Sync complete');
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new WiscOSettingTab(this.app, this));
	}

	private async getNotesZipFileName(apikey, baseUrl, dlOnlyNew) {
		console.log(dlOnlyNew)
		console.log("preparing for api call");
		if (dlOnlyNew == "true") {
			dlOnlyNew = true;
		} else {
			dlOnlyNew = false;
		}
		let settings = {
			"dlOnlyNew": dlOnlyNew
		}
		var config = {
			method: 'post',
			url: baseUrl + '/v1/getZipFileName',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': apikey,
			},
			body: `settings=${encodeURIComponent(JSON.stringify(settings))}`
		};

		try {
			let resp = await requestUrl(config);
			const response = JSON.parse(resp.text);
			if (response.message == "No new files to download") {
				new Notice('There are no new notes to download');
				return null;
			}
			return response.zip_file_name;
		} catch (e) {
			new Notice('Please add correct WiscO sync key');
		}
	}

	private downloadWiscONotesAsZip(vault, dlUrl, fileName) {

		let fileData: ArrayBuffer;
		return new Promise(async (resolve) => {
			console.log("starting the download");
			const response = await requestUrl({
				url: dlUrl,
				method: "POST",
				headers: {
					'Accept': 'application/json',
					'Authorization': '123',
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			});
			fileData = response.arrayBuffer;

			if (fileData != null) {
				console.log("file data is not null and file name is " + fileName);
				try {
					await vault.createBinary(fileName, fileData);
				}
				catch (e) {
					console.log("error in creating file");
					console.log(e);
				}
				console.log("file created");
				resolve("success");
			} else {
				console.log("fie data is null");
				resolve("error");
			}
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, WiscO_DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class WiscOSettingTab extends PluginSettingTab {
	plugin: WiscOPlugin;

	constructor(app: App, plugin: WiscOPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {
			containerEl
		} = this;

		containerEl.empty();

		containerEl.createEl('h2', {
			text: 'Settings for WiscO Sync plugin.'
		});

		new Setting(containerEl)
			.setName('WiscO Obsidian sync key')
			.setDesc('Get this key from the WiscO website')

			.addText(text => text
				.setPlaceholder('Enter your key')
				.setValue(this.plugin.settings.WiscOSyncKeySetting)

				.onChange(async (value) => {

					this.plugin.settings.WiscOSyncKeySetting = value;
					await this.plugin.saveSettings();
				}));

				new Setting(containerEl)
				.setName("WiscO Local Folder Path")
				.setDesc("Enter the folder path where you want to sync the notes")
	
				.addSearch((text) => {
					new FolderSuggest(text.inputEl);
					text.setPlaceholder("Example: Inbox/WiscO")
						.setValue(this.plugin.settings.WiscOLocalFilePathSetting)
	
						.onChange(async (value) => {
	
							this.plugin.settings.WiscOLocalFilePathSetting = value;
							await this.plugin.saveSettings();
						});
				});

				new Setting(containerEl)
					.setName("WiscO Url")
					.setDesc("Enter the server url")
		
					.addSearch((text) => {
						new FolderSuggest(text.inputEl);
						text.setPlaceholder("Example: https://wisco.tunnelto.dev")
							.setValue(this.plugin.settings.WiscOURLSetting)
		
							.onChange(async (value) => {
		
								this.plugin.settings.WiscOURLSetting = value;
								await this.plugin.saveSettings();
							});
					});
					new Setting(containerEl)
						.setName("WiscO Dl New ?")
						.setDesc("true/false for downloading only new notes")
			
						.addSearch((text) => {
							new FolderSuggest(text.inputEl);
							text.setPlaceholder("Example: true/false")
								.setValue(this.plugin.settings.WiscODlNewSetting)
			
								.onChange(async (value) => {
			
									this.plugin.settings.WiscODlNewSetting = value;
									await this.plugin.saveSettings();
								});
						});
	}
}
