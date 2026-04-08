import { ipcMain, safeStorage } from 'electron'
import {
  buildCardGenerationPrompt,
  buildEvaluationPrompt,
  parseCardGenerationResponse,
  parseEvaluationResponse
} from '../../src/lib/gemini'

const DEFAULT_API_KEY = 'AIzaSyDJ_WKTF2NNERfr80ISWF63Z-GUZVV1Fq4'
let encryptedApiKey: Buffer | null = null
let cachedApiKey: string | null = null

function getApiKey(): string {
  if (cachedApiKey) return cachedApiKey

  if (encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      cachedApiKey = safeStorage.decryptString(encryptedApiKey)
      return cachedApiKey
    } catch {
      // fall through to default
    }
  }

  return DEFAULT_API_KEY
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(prompt)
  const response = result.response
  return response.text()
}

export function registerGeminiHandlers(): void {
  ipcMain.handle('gemini:getApiKey', () => {
    const key = getApiKey()
    // Return masked version for display
    if (key && key.length > 8) {
      return key.substring(0, 8) + '...' + key.substring(key.length - 4)
    }
    return key
  })

  ipcMain.handle('gemini:saveApiKey', (_event, key: string) => {
    cachedApiKey = key
    if (safeStorage.isEncryptionAvailable()) {
      encryptedApiKey = safeStorage.encryptString(key)
    }
    return { success: true }
  })

  ipcMain.handle('gemini:generateCards', async (_event, text: string, minCards: number = 10, minQuestions: number = 5) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const prompt = buildCardGenerationPrompt(text, minCards, minQuestions)
    const responseText = await callGemini(prompt, apiKey)
    return parseCardGenerationResponse(responseText)
  })

  ipcMain.handle('gemini:evaluateAnswer', async (_event, question: string, modelAnswer: string, studentAnswer: string) => {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const prompt = buildEvaluationPrompt(question, modelAnswer, studentAnswer)
    const responseText = await callGemini(prompt, apiKey)
    return parseEvaluationResponse(responseText)
  })

  ipcMain.handle('gemini:checkApiKey', async () => {
    const apiKey = getApiKey()
    if (!apiKey) return { valid: false, error: 'No API key configured' }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GoogleGenerativeAI } = require('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
      await model.generateContent('Say "OK" in one word.')
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })
}
