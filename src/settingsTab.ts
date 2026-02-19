import type VectorSearchPlugin from './main'

import { App, PluginSettingTab, Setting } from 'obsidian'

import { listModels } from './ollama'

export class VectorSearchSettingsTab extends PluginSettingTab {
  plugin: VectorSearchPlugin

  constructor(app: App, plugin: VectorSearchPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    new Setting(containerEl)
      .setName('Ollama URL')
      .setDesc('Endpoint for your local Ollama instance')
      .addText(text => text
        .setPlaceholder('http://localhost:11434')
        .setValue(this.plugin.settings.ollamaUrl)
        .onChange(async (value) => {
          this.plugin.settings.ollamaUrl = value
          await this.plugin.saveSettings()
          this.display() // Refresh to update model list
        }))

    const modelSetting = new Setting(containerEl)
      .setName('Embedding Model')
      .setDesc('Select the model to use for embeddings')

    listModels(this.plugin.settings.ollamaUrl)
      .then(models => {
        modelSetting.addDropdown(dropdown => {
          dropdown.addOption('', 'Select a model')
          models.forEach(model => dropdown.addOption(model, model))
          dropdown.setValue(this.plugin.settings.embeddingModel)
          dropdown.onChange(async (value) => {
            this.plugin.settings.embeddingModel = value
            await this.plugin.saveSettings()
            this.plugin.server.updateConfig(this.plugin.settings.ollamaUrl, value)
            
            // Trigger re-index warning/action
            if (value) {
                new Setting(containerEl)
                    .setName('Re-index required')
                    .setDesc('Changing the model requires a full re-index of your vault.')
                    .addButton(btn => btn
                        .setButtonText('Re-index All')
                        .onClick(async () => {
                            await this.plugin.reindexAll()
                        }))
            }
          })
        })
      })
      .catch(err => {
        modelSetting.setDesc('Error connecting to Ollama. Make sure it is running.')
      })

    new Setting(containerEl)
      .setName('HTTP Server Port')
      .setDesc('Port for the local search API')
      .addText(text => text
        .setPlaceholder('51362')
        .setValue(String(this.plugin.settings.serverPort))
        .onChange(async (value) => {
          this.plugin.settings.serverPort = Number(value)
          await this.plugin.saveSettings()
        }))

    new Setting(containerEl)
      .setName('Minimum Characters')
      .setDesc('Notes shorter than this will be skipped during indexing')
      .addText(text => text
        .setPlaceholder('100')
        .setValue(String(this.plugin.settings.minChars))
        .onChange(async (value) => {
          this.plugin.settings.minChars = Number(value)
          await this.plugin.saveSettings()
        }))

    const usage = this.plugin.index.sizeInBytes()
    new Setting(containerEl)
      .setName('Index Storage Usage')
      .setDesc(`Currently using ${(usage / 1024 / 1024).toFixed(2)} MB on disk`)
      .addButton(btn => btn
        .setButtonText('Refresh Usage')
        .onClick(() => this.display()))

    new Setting(containerEl)
        .setName('Force Re-index')
        .setDesc('Trigger a full re-index of the vault')
        .addButton(btn => btn
            .setButtonText('Re-index All Now')
            .setWarning()
            .onClick(async () => {
                await this.plugin.reindexAll()
            }))
  }
}
