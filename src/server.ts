import type { NoteIndex } from './index'

import { createServer } from 'http'

import { embedText } from './ollama'

export class HttpSearchServer {
  private server: any
  private index: NoteIndex
  private ollamaUrl: string
  private model: string

  constructor(index: NoteIndex, ollamaUrl: string, model: string) {
    this.index = index
    this.ollamaUrl = ollamaUrl
    this.model = model
  }

  public updateConfig(ollamaUrl: string, model: string) {
    this.ollamaUrl = ollamaUrl
    this.model = model
  }

  public start(port: number) {
    this.server = createServer(async (req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.method === 'POST') {
        let body = ''
        req.on('data', chunk => {
          body += chunk.toString()
        })
        req.on('end', async () => {
          try {
            const data = JSON.parse(body)
            if (req.url === '/embed') {
              const vector = await embedText(this.ollamaUrl, this.model, data.text)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ vector }))
            } else if (req.url === '/search/vector') {
              const results = this.index.search(data.vector, data.allowlist, data.top_n)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ results }))
            } else if (req.url === '/search/text') {
              const vector = await embedText(this.ollamaUrl, this.model, data.text)
              const results = this.index.search(vector, data.allowlist, data.top_n)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ results }))
            } else {
              res.writeHead(404)
              res.end()
            }
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          }
        })
      } else {
        res.writeHead(405)
        res.end()
      }
    })

    this.server.listen(port, '127.0.0.1')
  }

  public stop() {
    if (this.server) {
      this.server.close()
    }
  }
}
