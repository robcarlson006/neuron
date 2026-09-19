import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execFileSync } from 'child_process'
import { app } from 'electron'
import { createWorker } from 'tesseract.js'
import { cleanExtractedText } from '../../src/lib/fileParser'
import { getAIConfig, getApiKey, getStoredKey, readMeta } from './aiConfigStore'

// Helper to get temp dir safely whether in Electron or test environment
function getTempDirectory(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('temp')
    }
  } catch {}
  return os.tmpdir()
}

/**
 * Check if the user has a Vision AI key available (Gemini or OpenAI).
 * Respects the configured vision_provider from the Multi-Key Vault.
 */
function getVisionConfig(): { provider: 'gemini' | 'openai'; apiKey: string; model: string } | null {
  try {
    const visionProvider = readMeta('vision_provider') || 'auto'
    const configuredVisionModel = readMeta('vision_model') || 'gemini-2.0-flash'

    // If user explicitly chose local OCR, disable Cloud Vision
    if (visionProvider === 'local') {
      return null
    }

    // 1. Explicit Gemini selection
    if (visionProvider === 'gemini') {
      const geminiKey = getStoredKey('gemini')
      if (geminiKey) {
        return { provider: 'gemini', apiKey: geminiKey, model: configuredVisionModel || 'gemini-2.0-flash' }
      }
    }

    // 2. Explicit OpenAI selection
    if (visionProvider === 'openai') {
      const openaiKey = getStoredKey('openai')
      if (openaiKey) {
        return { provider: 'openai', apiKey: openaiKey, model: configuredVisionModel.startsWith('gpt') ? configuredVisionModel : 'gpt-4o-mini' }
      }
    }

    // 3. Auto / Fallback: Check Gemini vault key first
    const vaultGeminiKey = getStoredKey('gemini')
    if (vaultGeminiKey) {
      return { provider: 'gemini', apiKey: vaultGeminiKey, model: configuredVisionModel || 'gemini-2.0-flash' }
    }

    // 4. Auto / Fallback: Check OpenAI vault key
    const vaultOpenaiKey = getStoredKey('openai')
    if (vaultOpenaiKey) {
      return { provider: 'openai', apiKey: vaultOpenaiKey, model: 'gpt-4o-mini' }
    }

    // 5. Fallback to main AI config key
    const aiConfig = getAIConfig()
    const mainKey = getApiKey()

    if (aiConfig.provider === 'gemini' && mainKey) {
      return { provider: 'gemini', apiKey: mainKey, model: aiConfig.model || 'gemini-2.0-flash' }
    }
    if (mainKey && (mainKey.startsWith('AIza') || mainKey.startsWith('AQ.'))) {
      return { provider: 'gemini', apiKey: mainKey, model: 'gemini-2.0-flash' }
    }

    if (aiConfig.provider === 'openai' && mainKey) {
      return { provider: 'openai', apiKey: mainKey, model: aiConfig.model || 'gpt-4o-mini' }
    }
    if (mainKey && (mainKey.startsWith('sk-proj-') || (mainKey.startsWith('sk-') && !mainKey.startsWith('sk-ant-')))) {
      if (!aiConfig.baseUrl?.includes('deepseek.com')) {
        return { provider: 'openai', apiKey: mainKey, model: 'gpt-4o-mini' }
      }
    }
  } catch (err) {
    console.warn('Could not inspect Vision AI config:', err)
  }
  return null
}

/**
 * Transcribe image using Google Gemini Vision API
 */
async function transcribeWithGeminiVision(
  imageBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  model: string = 'gemini-2.0-flash'
): Promise<string> {
  const base64Data = imageBuffer.toString('base64')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const prompt =
    'You are an expert academic assistant and transcriber. Transcribe all text, questions, homework exercises, ' +
    'problem sets, numbers, tables, and mathematical formulas from this image. ' +
    'Use standard LaTeX notation (enclosed in $...$ for inline or $$...$$ for display) for all mathematical expressions, ' +
    'subscripts, exponents, Greek symbols, matrices, and equations. ' +
    'Preserve question numbering (e.g. 1., 2a, etc.) exactly. Output only the verbatim transcribed content.'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192
      }
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini Vision API error (${response.status}): ${errText.substring(0, 300)}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return text.trim()
}

/**
 * Transcribe image using OpenAI Vision API (gpt-4o-mini / gpt-4o)
 */
async function transcribeWithOpenAIVision(
  imageBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<string> {
  const base64Data = imageBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64Data}`
  const url = 'https://api.openai.com/v1/chat/completions'

  const prompt =
    'You are an expert academic assistant and transcriber. Transcribe all text, questions, homework exercises, ' +
    'problem sets, numbers, tables, and mathematical formulas from this image. ' +
    'Use standard LaTeX notation (enclosed in $...$ for inline or $$...$$ for display) for all mathematical expressions, ' +
    'subscripts, exponents, Greek symbols, matrices, and equations. ' +
    'Preserve question numbering (e.g. 1., 2a, etc.) exactly. Output only the verbatim transcribed content.'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 4096
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI Vision API error (${response.status}): ${errText.substring(0, 300)}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content || ''
  return text.trim()
}

/**
 * Perform neural OCR using macOS native Apple Vision framework (VNRecognizeTextRequest) via JXA.
 * Runs in ~1s, completely local and offline, requires no external dependencies or tools.
 */
function ocrWithAppleVision(imagePath: string): string {
  if (process.platform !== 'darwin') return ''

  const tempScriptPath = path.join(getTempDirectory(), `neuron_vision_${Date.now()}_${Math.random().toString(36).substring(7)}.js`)
  const jxaCode = `
ObjC.import('Vision');
ObjC.import('Foundation');

function run(argv) {
  var imgPath = argv[0];
  var imgUrl = $.NSURL.fileURLWithPath(imgPath);
  var request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;

  var handler = $.VNImageRequestHandler.alloc.initWithURLOptions(imgUrl, $());
  var success = handler.performRequestsError($([request]), null);
  if (!success) {
    return JSON.stringify({ success: false, text: '' });
  }

  var results = request.results;
  var lines = [];
  for (var i = 0; i < results.count; i++) {
    var obs = results.objectAtIndex(i);
    var cand = obs.topCandidates(1).objectAtIndex(0);
    lines.push(ObjC.unwrap(cand.string));
  }
  return JSON.stringify({ success: true, text: lines.join('\\n') });
}
`

  try {
    fs.writeFileSync(tempScriptPath, jxaCode, 'utf8')
    const stdout = execFileSync('osascript', ['-l', 'JavaScript', tempScriptPath, path.resolve(imagePath)], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    })
    const parsed = JSON.parse(stdout.trim())
    return parsed.text || ''
  } catch (err) {
    console.warn('Apple Vision OCR attempt failed:', err)
    return ''
  } finally {
    try {
      if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath)
    } catch {}
  }
}

/**
 * Perform local OCR using pure JS / WebAssembly Tesseract.js worker.
 * Cross-platform fallback for Windows, Linux, or when Apple Vision is unavailable.
 */
async function ocrWithTesseract(imageInput: string | Buffer): Promise<string> {
  let worker: any = null
  try {
    const options: any = {}
    try {
      options.workerPath = require.resolve('tesseract.js/src/worker-script/node/index.js')
    } catch {}
    worker = await createWorker('eng', 1, options)
    const ret = await worker.recognize(imageInput)
    return ret.data.text || ''
  } catch (err) {
    console.warn('Tesseract OCR failed:', err)
    return ''
  } finally {
    if (worker) {
      try {
        await worker.terminate()
      } catch {}
    }
  }
}

/**
 * Detect image MIME type from buffer or file extension
 */
function getImageMimeType(filePathOrExt: string, buffer?: Buffer): string {
  const ext = path.extname(filePathOrExt).toLowerCase().replace('.', '')
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'heic') return 'image/heic'

  if (buffer && buffer.length > 4) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
    if (buffer.subarray(0, 4).toString() === 'RIFF') return 'image/webp'
  }
  return 'image/png'
}

/**
 * Master image text extraction pipeline:
 * 1. Tries Vision AI (Gemini Flash or OpenAI) if API keys exist (best LaTeX math accuracy).
 * 2. On macOS: Tries Apple Vision neural OCR (fast, offline, highly accurate).
 * 3. Falls back to Tesseract.js (cross-platform offline OCR).
 */
export async function extractTextFromImage(input: string | Buffer): Promise<string> {
  let buffer: Buffer
  let tempFilePath: string | null = null
  let isTemp = false

  if (typeof input === 'string') {
    if (!fs.existsSync(input)) {
      throw new Error(`Image file not found: ${input}`)
    }
    buffer = fs.readFileSync(input)
    tempFilePath = path.resolve(input)
  } else {
    buffer = input
    tempFilePath = path.join(getTempDirectory(), `neuron_temp_img_${Date.now()}_${Math.random().toString(36).substring(7)}.png`)
    fs.writeFileSync(tempFilePath, buffer)
    isTemp = true
  }

  const mimeType = getImageMimeType(typeof input === 'string' ? input : 'temp.png', buffer)

  try {
    // 1. Vision AI if configured
    const visionConfig = getVisionConfig()
    if (visionConfig) {
      try {
        let visionText = ''
        if (visionConfig.provider === 'gemini') {
          try {
            visionText = await transcribeWithGeminiVision(buffer, mimeType, visionConfig.apiKey, visionConfig.model)
          } catch (geminiErr) {
            console.warn('Gemini Vision failed, checking for secondary OpenAI key:', geminiErr)
            const openaiKey = getStoredKey('openai')
            if (openaiKey) {
              visionText = await transcribeWithOpenAIVision(buffer, mimeType, openaiKey, 'gpt-4o-mini')
            } else {
              throw geminiErr
            }
          }
        } else {
          try {
            visionText = await transcribeWithOpenAIVision(buffer, mimeType, visionConfig.apiKey, visionConfig.model)
          } catch (openaiErr) {
            console.warn('OpenAI Vision failed, checking for secondary Gemini key:', openaiErr)
            const geminiKey = getStoredKey('gemini')
            if (geminiKey) {
              visionText = await transcribeWithGeminiVision(buffer, mimeType, geminiKey, 'gemini-2.0-flash')
            } else {
              throw openaiErr
            }
          }
        }
        if (visionText && visionText.trim().length >= 10) {
          return cleanExtractedText(visionText)
        }
      } catch (visionErr) {
        console.warn('Vision AI transcription failed, falling back to local OCR:', visionErr)
      }
    }

    // 2. macOS Apple Vision framework
    if (process.platform === 'darwin' && tempFilePath) {
      const appleVisionText = ocrWithAppleVision(tempFilePath)
      if (appleVisionText && appleVisionText.trim().length >= 10) {
        return cleanExtractedText(appleVisionText)
      }
    }

    // 3. Tesseract.js fallback
    const tesseractText = await ocrWithTesseract(buffer)
    if (tesseractText && tesseractText.trim().length > 0) {
      return cleanExtractedText(tesseractText)
    }

    return ''
  } finally {
    if (isTemp && tempFilePath) {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath)
      } catch {}
    }
  }
}

/**
 * Extract embedded JPEG/Flate images directly from PDF stream objects.
 */
export function extractEmbeddedImagesFromPdf(buffer: Buffer): Buffer[] {
  const images: Buffer[] = []
  let streamIdx = 0

  while ((streamIdx = buffer.indexOf('stream', streamIdx)) !== -1) {
    const headerSlice = buffer.subarray(Math.max(0, streamIdx - 500), streamIdx).toString('latin1')
    const isImage = headerSlice.includes('/Subtype /Image') || headerSlice.includes('/Subtype/Image')

    if (isImage) {
      let contentStart = streamIdx + 6
      if (buffer[contentStart] === 0x0d && buffer[contentStart + 1] === 0x0a) contentStart += 2
      else if (buffer[contentStart] === 0x0a || buffer[contentStart] === 0x0d) contentStart += 1

      let endIdx = buffer.indexOf('endstream', contentStart)
      if (endIdx !== -1) {
        while (endIdx > contentStart && (buffer[endIdx - 1] === 0x0a || buffer[endIdx - 1] === 0x0d)) {
          endIdx--
        }
        const streamData = buffer.subarray(contentStart, endIdx)
        if (headerSlice.includes('/DCTDecode')) {
          images.push(streamData)
        }
      }
    }
    streamIdx += 6
  }

  return images
}

/**
 * Renders pages of a PDF to separate image files on disk.
 * On macOS, uses PDFKit via JXA for native vector-to-raster rendering.
 */
export async function renderPdfPagesToImages(pdfPath: string): Promise<string[]> {
  const absPdfPath = path.resolve(pdfPath)
  const renderedPages: string[] = []

  if (process.platform === 'darwin') {
    const tempScriptPath = path.join(getTempDirectory(), `neuron_pdf_pages_${Date.now()}_${Math.random().toString(36).substring(7)}.js`)
    const tempDir = getTempDirectory().replace(/\\/g, '/')
    const jxaCode = `
ObjC.import('PDFKit');
ObjC.import('AppKit');

function run(argv) {
  var pdfPath = argv[0];
  var pdfUrl = $.NSURL.fileURLWithPath(pdfPath);
  var pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);

  if (!pdfDoc) {
    return JSON.stringify({ error: 'Could not open PDF' });
  }

  var count = pdfDoc.pageCount;
  var outPaths = [];
  var tempDir = "${tempDir}";

  for (var i = 0; i < count; i++) {
    var page = pdfDoc.pageAtIndex(i);
    var imgData = page.dataRepresentation;
    var nsImg = $.NSImage.alloc.initWithData(imgData);
    var tiffData = nsImg.TIFFRepresentation;
    var reps = $.NSBitmapImageRep.imageRepsWithData(tiffData);
    if (reps.count > 0) {
      var rep = reps.objectAtIndex(0);
      var pngData = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
      var outPath = tempDir + '/neuron_pdf_page_' + Date.now() + '_' + i + '.png';
      pngData.writeToFileAtomically(outPath, true);
      outPaths.push(outPath);
    }
  }
  return JSON.stringify({ pages: outPaths });
}
`

    try {
      fs.writeFileSync(tempScriptPath, jxaCode, 'utf8')
      const stdout = execFileSync('osascript', ['-l', 'JavaScript', tempScriptPath, absPdfPath], {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024
      })
      const parsed = JSON.parse(stdout.trim())
      if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        return parsed.pages
      }
    } catch (err) {
      console.warn('macOS PDFKit page rendering failed, falling back to stream extraction:', err)
    } finally {
      try {
        if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath)
      } catch {}
    }
  }

  // Cross-platform / fallback: Extract embedded stream images
  try {
    const pdfBuf = fs.readFileSync(absPdfPath)
    const embedded = extractEmbeddedImagesFromPdf(pdfBuf)
    if (embedded.length > 0) {
      for (let i = 0; i < embedded.length; i++) {
        const outPath = path.join(getTempDirectory(), `neuron_embedded_img_${Date.now()}_${i}.jpg`)
        fs.writeFileSync(outPath, embedded[i])
        renderedPages.push(outPath)
      }
    }
  } catch (err) {
    console.warn('Embedded image extraction from PDF failed:', err)
  }

  return renderedPages
}

/**
 * High-level extractor for scanned or image-based PDFs (e.g. combined screenshots).
 * Extracts or renders each page image, runs OCR / Vision extraction, and stitches them together.
 */
export async function ocrScannedPdf(pdfPath: string): Promise<string> {
  const pageImagePaths = await renderPdfPagesToImages(pdfPath)

  if (pageImagePaths.length === 0) {
    // If no page images could be extracted, try single-page sips fallback on macOS
    if (process.platform === 'darwin') {
      const singlePageOut = path.join(getTempDirectory(), `neuron_sips_page_${Date.now()}.png`)
      try {
        execFileSync('/usr/bin/sips', ['-s', 'format', 'png', path.resolve(pdfPath), '--out', singlePageOut], {
          encoding: 'utf8',
          timeout: 15000
        })
        if (fs.existsSync(singlePageOut)) {
          pageImagePaths.push(singlePageOut)
        }
      } catch (sipsErr) {
        console.warn('sips fallback failed:', sipsErr)
      }
    }
  }

  if (pageImagePaths.length === 0) {
    throw new Error('This PDF appears to be an image-only scan, but page images could not be rendered for OCR.')
  }

  const pageTexts: string[] = []

  for (let i = 0; i < pageImagePaths.length; i++) {
    const pagePath = pageImagePaths[i]
    try {
      const text = await extractTextFromImage(pagePath)
      if (text.trim().length > 0) {
        pageTexts.push(`--- Page ${i + 1} ---\n${text}`)
      }
    } catch (pageErr) {
      console.warn(`Failed to OCR PDF page ${i + 1}:`, pageErr)
    } finally {
      try {
        if (fs.existsSync(pagePath)) fs.unlinkSync(pagePath)
      } catch {}
    }
  }

  if (pageTexts.length === 0) {
    throw new Error('Could not recognize any text from the scanned PDF pages.')
  }

  return cleanExtractedText(pageTexts.join('\n\n'))
}
