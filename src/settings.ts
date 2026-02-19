export interface VectorSearchSettings {
  ollamaUrl: string
  ollamaToken: string
  embeddingModel: string
  serverPort: number
  minChars: number
}

export const DEFAULT_SETTINGS: VectorSearchSettings = {
  ollamaUrl: 'http://localhost:11434',
  ollamaToken: '',
  embeddingModel: '',
  serverPort: 51362,
  minChars: 100,
}
