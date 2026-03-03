# Vector Search for Obsidian

A local semantic search engine for your Obsidian vault. This plugin embeds your notes using [Ollama](https://ollama.com/) and provides a local HTTP API for performing hybrid keyword and vector searches.

## 🎨 Features

- **Semantic Search**: Find notes by meaning, not just exact keywords.
- **Hybrid Support**: Easily integrate with keyword-based search for high precision.
- **Local-First**: All embeddings are generated locally via Ollama and stored in your vault.
- **Disk Persistence**: Your index is saved to `.obsidian/plugins/obsidian-vector-search/index.json` and stays between restarts.
- **Incremental Indexing**: Automatically updates your index as you add, modify, or delete notes.
- **HTTP API**: Built-in server to allow external tools (like [dragonglass](https://github.com/antolu/dragonglass)) to search your vault.

## 😎 How to install

### Install manually

1. Clone or download this repository.
2. Run `pnpm install` and `pnpm run build`.
3. Create a directory named `obsidian-vector-search` inside your vault's `.obsidian/plugins/` folder.
4. Copy `main.js`, `manifest.json`, and `styles.css` (if any) into that folder.
5. Enable the plugin in Obsidian settings.

## ⚙️ Configuration

1. **Ollama URL**: The address of your Ollama server (default: `http://localhost:11434`).
2. **Embedding Model**: Choose a model installed in Ollama (e.g., `nomic-embed-text`).
3. **Server Port**: Port for the local search API (default: `51362`).
4. **Min Characters**: Minimum length for a note to be indexed.

## 🚀 HTTP API

The plugin starts a local server on the configured port. All endpoints are `POST` only.

### `POST /embed`
Generates an embedding for the provided text using the configured Ollama model.
- **Request**: `{ "text": string }`
- **Response**: `{ "vector": number[] }`

### `POST /search/text`
Performs a semantic search for the given query text.
- **Request**:
  ```json
  {
    "text": string,
    "top_n"?: number,
    "allowlist"?: string[]
  }
  ```
- **Response**: `{ "results": { "path": string, "score": number }[] }`

### `POST /search/vector`
Performs a semantic search using a pre-computed vector.
- **Request**:
  ```json
  {
    "vector": number[],
    "top_n"?: number,
    "allowlist"?: string[]
  }
  ```
- **Response**: Same as `/search/text`.

### `POST /notes/read`
Reads a note's content and metadata.
- **Request**: `{ "path": string }` (Path must end in `.md`)
- **Response**:
  ```json
  {
    "path": string,
    "content": string,
    "line_count": number,
    "content_hash": string,
    "mtime": number
  }
  ```

### `POST /notes/patch-lines`
Performs atomic line-based edits on a note. Fails if the `expected_hash` doesn't match the current file hash (Sha256).
- **Request**:
  ```json
  {
    "path": string,
    "start_line": number,
    "end_line": number,
    "replacement": string,
    "expected_hash": string
  }
  ```
- **Response**:
  ```json
  {
    "path": string,
    "applied_start_line": number,
    "applied_end_line": number,
    "new_hash": string,
    "new_line_count": number,
    "mtime": number
  }
  ```

## 💻 How to develop

1. Clone into your vault's plugin directory.
2. `pnpm install`
3. `pnpm run dev` (starts a dev build)

## ⌚ TODOs

- [ ] Support for multiple vault indexing.
- [ ] UI for searching directly within Obsidian.
- [ ] Support for local LLM reranking.

---
Written with ♥ for local-first knowledge management.
