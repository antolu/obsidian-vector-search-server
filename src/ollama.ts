import { Ollama } from 'ollama'

export async function listModels(url: string): Promise<string[]> {
  const ollama = new Ollama({ host: url })
  const response = await ollama.list()
  return response.models.map(m => m.name)
}

export async function embedText(url: string, model: string, text: string): Promise<number[]> {
  const ollama = new Ollama({ host: url })
  const response = await ollama.embeddings({
    model,
    prompt: text,
  })
  return response.embedding
}
