import { Notice, Plugin, TFile } from 'obsidian'

import { NoteIndex } from './index'

import { embedText } from './ollama'

import { HttpSearchServer } from './server'

import { DEFAULT_SETTINGS, type VectorSearchSettings } from './settings'

import { VectorSearchSettingsTab } from './settingsTab'

export default class VectorSearchPlugin extends Plugin {
  settings: VectorSearchSettings
  index: NoteIndex
  server: HttpSearchServer

  async onload() {
    await this.loadSettings()

    this.index = new NoteIndex()
    await this.loadIndex()

    this.server = new HttpSearchServer(
      this.index,
      this.settings.ollamaUrl,
      this.settings.embeddingModel
    )
    this.server.start(this.settings.serverPort)

    this.addSettingTab(new VectorSearchSettingsTab(this.app, this))

    // Index on boot (incremental)
    this.app.workspace.onLayoutReady(() => {
      this.incrementalIndex()
    })

    // Listen for file changes
    this.registerEvent(
      this.app.vault.on('modify', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.indexFile(file)
          await this.saveIndex()
        }
      })
    )

    this.registerEvent(
      this.app.vault.on('create', async (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          await this.indexFile(file)
          await this.saveIndex()
        }
      })
    )

    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        if (file instanceof TFile) {
          this.index.delete(file.path)
          await this.saveIndex()
        }
      })
    )

    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          this.index.delete(oldPath)
          await this.indexFile(file)
          await this.saveIndex()
        }
      })
    )
  }

  onunload() {
    this.server.stop()
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  async loadIndex() {
    const indexPath = this.getIndexFilePath()
    if (await this.app.vault.adapter.exists(indexPath)) {
      const data = await this.app.vault.adapter.read(indexPath)
      this.index.deserialize(data)
    }
  }

  async saveIndex() {
    const indexPath = this.getIndexFilePath()
    await this.app.vault.adapter.write(indexPath, this.index.serialize())
  }

  getIndexFilePath(): string {
    return `${this.manifest.dir}/index.json`
  }

  async indexFile(file: TFile) {
    if (!this.settings.embeddingModel) return

    const content = await this.app.vault.read(file)
    if (content.length < this.settings.minChars) {
        this.index.delete(file.path)
        return
    }

    try {
      const vector = await embedText(
        this.settings.ollamaUrl,
        this.settings.embeddingModel,
        content
      )
      this.index.set(file.path, {
        path: file.path,
        vector,
        mtime: file.stat.mtime,
      })
    } catch (e) {
      console.error(`Failed to embed ${file.path}`, e)
    }
  }

  async incrementalIndex() {
    if (!this.settings.embeddingModel) {
        new Notice('Vector Search: Select an embedding model in settings to enable search.')
        return
    }

    const files = this.app.vault.getMarkdownFiles()
    const toIndex = files.filter(f => {
      const entry = this.index.get(f.path)
      return !entry || entry.mtime < f.stat.mtime
    })

    if (toIndex.length === 0) return

    new Notice(`Vector Search: Updating index for ${toIndex.length} files...`)
    let done = 0
    for (const file of toIndex) {
      await this.indexFile(file)
      done++
      if (done % 10 === 0) {
          // Just a minor logging, Obsidian Notice isn't great for frequent updates
          console.log(`Indexed ${done}/${toIndex.length}`)
      }
    }
    await this.saveIndex()
    new Notice('Vector Search: Index update complete.')
  }

  async reindexAll() {
    if (!this.settings.embeddingModel) {
        new Notice('Vector Search: Select a model first.')
        return
    }

    this.index.clear()
    const files = this.app.vault.getMarkdownFiles()
    
    new Notice(`Vector Search: Full re-index started (${files.length} files)...`)
    
    let done = 0
    for (const file of files) {
      await this.indexFile(file)
      done++
      if (done % 10 === 0) {
        console.log(`Re-indexing ${done}/${files.length}`)
      }
    }

    await this.saveIndex()
    new Notice('Vector Search: Full re-index complete.')
  }
}
