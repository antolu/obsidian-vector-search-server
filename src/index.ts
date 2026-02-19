import { requestUrl } from 'obsidian'

export interface IndexEntry {
  path: string
  vector: number[]
  mtime: number
}

export class NoteIndex {
  private entries: Map<string, IndexEntry> = new Map()

  constructor() {}

  public set(path: string, entry: IndexEntry) {
    this.entries.set(path, entry)
  }

  public delete(path: string) {
    this.entries.delete(path)
  }

  public get(path: string): IndexEntry | undefined {
    return this.entries.get(path)
  }

  public clear() {
    this.entries.clear()
  }

  public getAll(): IndexEntry[] {
    return Array.from(this.entries.values())
  }

  public search(queryVector: number[], allowlist?: string[], topN: number = 10): { path: string; score: number }[] {
    let candidates = this.getAll()
    if (allowlist && allowlist.length > 0) {
      const set = new Set(allowlist)
      candidates = candidates.filter(e => set.has(e.path))
    }

    const results = candidates.map(entry => ({
      path: entry.path,
      score: this.cosineSimilarity(queryVector, entry.vector),
    }))

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
  }

  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0
    let mag1 = 0
    let mag2 = 0
    for (let i = 0; i < v1.length; i++) {
        dotProduct += v1[i] * v2[i]
        mag1 += v1[i] * v1[i]
        mag2 += v2[i] * v2[i]
    }
    mag1 = Math.sqrt(mag1)
    mag2 = Math.sqrt(mag2)
    if (mag1 === 0 || mag2 === 0) return 0
    return dotProduct / (mag1 * mag2)
  }

  public serialize(): string {
    return JSON.stringify(Array.from(this.entries.values()))
  }

  public deserialize(json: string) {
    try {
      const data: IndexEntry[] = JSON.parse(json)
      this.entries.clear()
      for (const entry of data) {
        this.entries.set(entry.path, entry)
      }
    } catch (e) {
      console.error('Failed to deserialize index', e)
    }
  }

  public sizeInBytes(): number {
    return new TextEncoder().encode(this.serialize()).length
  }
}
