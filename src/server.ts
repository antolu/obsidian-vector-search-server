import type { NoteIndex } from './index'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

import { embedText } from './ollama'

interface NoteSnapshot {
  path: string
  content: string
  mtime: number
}

interface SearchMatch {
  match: { start: number, end: number, source: string }
  context: string
}

interface SearchResult {
  filename: string
  score: number
  matches: SearchMatch[]
}

interface ServerNoteAccess {
  readNote: (path: string) => Promise<NoteSnapshot | null>
  writeNote: (path: string, content: string) => Promise<NoteSnapshot | null>
  reindexNote: (path: string) => Promise<void>
  openNote: (path: string) => Promise<boolean>
  executeCommand: (commandId: string) => Promise<boolean>
  searchSimple: (query: string, contextLength: number) => Promise<SearchResult[]>
}

class HttpError extends Error {
  status: number
  payload: Record<string, unknown>

  constructor(status: number, payload: Record<string, unknown>) {
    super(payload.error as string)
    this.status = status
    this.payload = payload
  }
}

function computeSha256(content: string): string {
  const hash = createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')
  return `sha256:${hash}`
}

function splitLines(content: string): { lines: string[], trailingNewline: boolean } {
  if (content.length === 0) {
    return { lines: [], trailingNewline: false }
  }
  const trailingNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (trailingNewline) {
    lines.pop()
  }
  return { lines, trailingNewline }
}

function splitReplacement(replacement: string): string[] {
  if (replacement.length === 0) {
    return []
  }
  const lines = replacement.split('\n')
  if (replacement.endsWith('\n')) {
    lines.pop()
  }
  return lines
}

function joinLines(lines: string[], trailingNewline: boolean): string {
  const content = lines.join('\n')
  if (trailingNewline && lines.length > 0) {
    return `${content}\n`
  }
  return content
}

function parseLineNumber(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HttpError(400, { error: `invalid_${key}` })
  }
  return value
}

function parseRequiredString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, { error: `invalid_${key}` })
  }
  return value
}

function parseStringField(value: unknown, key: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, { error: `invalid_${key}` })
  }
  return value
}

function parseMarkdownPath(value: unknown): string {
  const path = parseRequiredString(value, 'path')
  if (!path.endsWith('.md')) {
    throw new HttpError(400, { error: 'invalid_path' })
  }
  return path
}

function parseJsonBody(rawBody: string): Record<string, unknown> {
  try {
    const body = JSON.parse(rawBody)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, { error: 'invalid_body' })
    }
    return body as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    throw new HttpError(400, { error: 'invalid_json' })
  }
}

export class HttpSearchServer {
  private server: any
  private index: NoteIndex
  private ollamaUrl: string
  private model: string
  private noteAccess: ServerNoteAccess
  private version: string

  constructor(index: NoteIndex, ollamaUrl: string, model: string, noteAccess: ServerNoteAccess, version: string) {
    this.index = index
    this.ollamaUrl = ollamaUrl
    this.model = model
    this.noteAccess = noteAccess
    this.version = version
  }

  public updateConfig(ollamaUrl: string, model: string) {
    this.ollamaUrl = ollamaUrl
    this.model = model
  }

  private async handleRead(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = parseMarkdownPath(body.path)
    const snapshot = await this.noteAccess.readNote(path)
    if (!snapshot) {
      throw new HttpError(404, { error: 'note_not_found', path })
    }

    const { lines } = splitLines(snapshot.content)
    return {
      path: snapshot.path,
      content: snapshot.content,
      line_count: lines.length,
      content_hash: computeSha256(snapshot.content),
      mtime: snapshot.mtime,
    }
  }

  private async handlePatchLines(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = parseMarkdownPath(body.path)
    const startLine = parseLineNumber(body.start_line, 'start_line')
    const endLine = parseLineNumber(body.end_line, 'end_line')
    const replacement = parseStringField(body.replacement, 'replacement')
    const expectedHash = parseRequiredString(body.expected_hash, 'expected_hash')

    if (startLine < 1 || endLine < startLine - 1) {
      throw new HttpError(400, { error: 'invalid_line_range' })
    }

    const currentSnapshot = await this.noteAccess.readNote(path)
    if (!currentSnapshot) {
      throw new HttpError(404, { error: 'note_not_found', path })
    }

    const currentHash = computeSha256(currentSnapshot.content)
    if (currentHash !== expectedHash) {
      throw new HttpError(409, {
        error: 'hash_mismatch',
        path,
        expected_hash: expectedHash,
        current_hash: currentHash,
        mtime: currentSnapshot.mtime,
      })
    }

    const { lines, trailingNewline } = splitLines(currentSnapshot.content)
    if (endLine > lines.length) {
      throw new HttpError(400, { error: 'line_range_out_of_bounds' })
    }

    const replacementLines = splitReplacement(replacement)
    const updatedLines = [
      ...lines.slice(0, startLine - 1),
      ...replacementLines,
      ...lines.slice(endLine),
    ]
    const updatedContent = joinLines(updatedLines, trailingNewline)

    const writeResult = await this.noteAccess.writeNote(path, updatedContent)
    if (!writeResult) {
      throw new HttpError(404, { error: 'note_not_found', path })
    }
    await this.noteAccess.reindexNote(path)

    return {
      path: writeResult.path,
      applied_start_line: startLine,
      applied_end_line: endLine,
      new_hash: computeSha256(updatedContent),
      new_line_count: updatedLines.length,
      mtime: writeResult.mtime,
    }
  }

  public start(port: number) {
    this.server = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const url = new URL(req.url || '', `http://${req.headers.host}`)
      const pathname = url.pathname

      if (req.method === 'GET') {
        try {
          if (pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ok', version: this.version }))
          }
          else if (pathname === '/notes/read') {
            const data = { path: url.searchParams.get('path') }
            const note = await this.handleRead(data)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(note))
          }
          else {
            res.writeHead(404)
            res.end()
          }
        }
        catch (error) {
          this.handleError(res, error)
        }
      }
      else if (req.method === 'POST' || req.method === 'PATCH') {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk.toString()
        })
        req.on('end', async () => {
          try {
            if (req.method === 'POST' && pathname === '/search/simple/') {
              const query = url.searchParams.get('query') || ''
              if (!query) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'query parameter required' }))
                return
              }
              const contextLengthRaw = Number.parseInt(url.searchParams.get('contextLength') || '100', 10)
              const contextLength = Number.isNaN(contextLengthRaw) ? 100 : contextLengthRaw
              const results = await this.noteAccess.searchSimple(query, contextLength)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(results))
            }
            else if (req.method === 'POST' && /^\/open\//.test(pathname)) {
              const notePath = decodeURIComponent(pathname.slice('/open/'.length))
              const opened = await this.noteAccess.openNote(notePath)
              if (opened) {
                res.writeHead(204)
                res.end()
              }
              else {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'note_not_found' }))
              }
            }
            else if (req.method === 'POST' && /^\/commands\//.test(pathname)) {
              const commandId = decodeURIComponent(pathname.slice('/commands/'.length))
              const executed = await this.noteAccess.executeCommand(commandId)
              if (executed) {
                res.writeHead(204)
                res.end()
              }
              else {
                res.writeHead(404, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'command_not_found' }))
              }
            }
            else {
              const data = parseJsonBody(body)
              if (req.method === 'POST' && pathname === '/embed') {
                const text = parseRequiredString(data.text, 'text')
                const vector = await embedText(this.ollamaUrl, this.model, text)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ vector }))
              }
              else if (req.method === 'POST' && pathname === '/search/vector') {
                const results = this.index.search(data.vector as number[], data.allowlist as string[] | undefined, data.top_n as number | undefined)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ results }))
              }
              else if (req.method === 'POST' && pathname === '/search/text') {
                const text = parseRequiredString(data.text, 'text')
                const vector = await embedText(this.ollamaUrl, this.model, text)
                const results = this.index.search(vector, data.allowlist as string[] | undefined, data.top_n as number | undefined)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ results }))
              }
              else if (req.method === 'PATCH' && pathname === '/notes/patch-lines') {
                const patched = await this.handlePatchLines(data)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(patched))
              }
              else {
                res.writeHead(404)
                res.end()
              }
            }
          }
          catch (error) {
            this.handleError(res, error)
          }
        })
      }
      else {
        res.writeHead(405)
        res.end()
      }
    })

    this.server.listen(port, '127.0.0.1')
  }

  private handleError(res: any, error: unknown) {
    if (error instanceof HttpError) {
      res.writeHead(error.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(error.payload))
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }

  public stop() {
    if (this.server) {
      this.server.close()
    }
  }
}
