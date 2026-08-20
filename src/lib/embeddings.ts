/**
 * Embedding generation utilities.
 * Main-process only (uses fetch / Node.js APIs).
 * Tries the configured AI provider, falls back to TF-IDF.
 */

import type { AIProviderConfig } from '../types'

/**
 * Type for AI provider configuration used by this module.
 */
export interface EmbeddingProviderConfig {
  provider: string
  baseUrl: string
  apiKey: string
}

export interface EmbeddingResult {
  embedding: number[]
  model: string
}

/**
 * Generate a single embedding via the AI provider.
 * Falls back to TF-IDF if the provider fails or isn't configured.
 */
export async function generateEmbedding(
  text: string,
  config?: AIProviderConfig | null
): Promise<number[]> {
  if (!config?.apiKey || !config?.provider) {
    throw new Error('No AI provider configured for embeddings')
  }

  try {
    const embedding = await callEmbeddingAPI(text, config)
    return embedding
  } catch (err) {
    throw new Error(
      `Embedding generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
  }
}

/**
 * Generate embeddings for multiple texts.
 */
export async function generateEmbeddings(
  texts: string[],
  config?: AIProviderConfig | null
): Promise<number[][]> {
  if (!config?.apiKey || !config?.provider) {
    throw new Error('No AI provider configured for embeddings')
  }

  try {
    const embeddings = await callEmbeddingAPIBatch(texts, config)
    return embeddings
  } catch (err) {
    throw new Error(
      `Batch embedding generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
  }
}

/**
 * Call the AI provider's embedding API for a single text.
 */
async function callEmbeddingAPI(text: string, config: AIProviderConfig): Promise<number[]> {
  if (config.provider === 'gemini') {
    return callGeminiEmbedding(text, config)
  }

  // OpenAI-compatible embedding API
  const baseUrl = config.baseUrl || 'https://api.deepseek.com'
  const url = `${baseUrl.replace(/\/$/, '')}/v1/embeddings`
  const model = config.model || 'text-embedding-ada-002'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      input: text,
      model
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API error (${response.status}): ${errorText.substring(0, 500)}`)
  }

  const data = await response.json()
  const embedding = data.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding API returned unexpected response structure')
  }

  return embedding as number[]
}

/**
 * Call the embedding API for multiple texts.
 */
async function callEmbeddingAPIBatch(texts: string[], config: AIProviderConfig): Promise<number[][]> {
  if (config.provider === 'gemini') {
    // Gemini doesn't support batch embeddings via the same endpoint.
    // Fall back to sequential calls.
    const results: number[][] = []
    for (const text of texts) {
      results.push(await callGeminiEmbedding(text, config))
    }
    return results
  }

  const baseUrl = config.baseUrl || 'https://api.deepseek.com'
  const url = `${baseUrl.replace(/\/$/, '')}/v1/embeddings`
  const model = config.model || 'text-embedding-ada-002'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      input: texts,
      model
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API error (${response.status}): ${errorText.substring(0, 500)}`)
  }

  const data = await response.json()

  if (!Array.isArray(data.data)) {
    throw new Error('Embedding API returned unexpected response structure')
  }

  // Sort by index to preserve order
  const sorted = (data.data as Array<{ index: number; embedding: number[] }>)
    .sort((a, b) => a.index - b.index)

  return sorted.map(item => {
    if (!Array.isArray(item.embedding)) {
      throw new Error('Embedding API returned malformed embedding data')
    }
    return item.embedding as number[]
  })
}

/**
 * Call Gemini embedding API.
 */
async function callGeminiEmbedding(text: string, config: AIProviderConfig): Promise<number[]> {
  const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com'
  const model = config.model || 'text-embedding-004'
  const url = `${baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:embedContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey
    },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini embedding error (${response.status}): ${errorText.substring(0, 500)}`)
  }

  const data = await response.json()
  const embedding = data.embedding?.values
  if (!Array.isArray(embedding)) {
    throw new Error('Gemini embedding API returned unexpected response structure')
  }

  return embedding as number[]
}

// ── TF-IDF Vectorizer (local fallback, no API call needed) ───────────────────

/**
 * Simple TF-IDF vectorizer for local fallback.
 * Builds a vocabulary from all documents and computes TF-IDF scores.
 */
export class TfIdfVectorizer {
  private _vocabulary: Map<string, number> = new Map()
  private _idf: Map<string, number> = new Map()
  private _fitted = false
  private _docCount = 0

  /**
   * Fit the vectorizer on a corpus of documents.
   * Builds vocabulary and computes IDF values.
   */
  fit(texts: string[]): void {
    this._vocabulary = new Map()
    this._idf = new Map()
    this._docCount = texts.length

    // Count document frequency for each term
    const docFreq = new Map<string, number>()

    for (const text of texts) {
      const tokens = this._tokenize(text)
      const uniqueTerms = new Set(tokens)

      for (const term of uniqueTerms) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1)
      }
    }

    // Build vocabulary (all terms sorted) and compute IDF
    const sortedTerms = Array.from(docFreq.keys()).sort()

    for (let i = 0; i < sortedTerms.length; i++) {
      const term = sortedTerms[i]
      this._vocabulary.set(term, i)
      // idf = log(N / df)
      const df = docFreq.get(term) || 1
      this._idf.set(term, Math.log(this._docCount / df) + 1) // +1 smooth
    }

    this._fitted = true
  }

  /**
   * Transform a single text into a TF-IDF vector matching the vocabulary.
   */
  transform(text: string): number[] {
    if (!this._fitted) {
      throw new Error('TfIdfVectorizer must be fitted before transform. Call fit() first.')
    }

    const vector = new Array(this._vocabulary.size).fill(0)
    const tokens = this._tokenize(text)
    const termFreq = new Map<string, number>()

    // Count term frequency in this document
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1)
    }

    // Compute TF-IDF for each term in vocabulary
    const maxFreq = Math.max(...Array.from(termFreq.values()), 1)

    for (const [term, freq] of termFreq) {
      const idx = this._vocabulary.get(term)
      if (idx !== undefined) {
        const tf = 0.5 + (0.5 * freq) / maxFreq // TF normalization
        const idf = this._idf.get(term) || 1
        vector[idx] = tf * idf
      }
    }

    return vector
  }

  /**
   * Get the vocabulary mapping (term -> index).
   */
  get vocabulary(): Map<string, number> {
    return new Map(this._vocabulary)
  }

  /**
   * Whether the vectorizer has been fitted.
   */
  get isFitted(): boolean {
    return this._fitted
  }

  /**
   * Get vocabulary size.
   */
  get size(): number {
    return this._vocabulary.size
  }

  /**
   * Tokenize and normalize text.
   */
  private _tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')  // Remove punctuation except apostrophes/hyphens
      .split(/\s+/)
      .filter(t => t.length > 2)          // Filter very short tokens
      .filter(t => t.length < 50)         // Filter very long tokens
  }
}
