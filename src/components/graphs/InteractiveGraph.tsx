import React, { useEffect, useState, useRef } from 'react'
import { sanitizeVegaSpecMath } from './latexGraphUtils'

export interface InteractiveGraphProps {
  spec: Record<string, any>
  theme?: 'dark' | 'light'
  className?: string
  minHeight?: number
}

/**
 * Sandboxed High-Definition Vega-Lite renderer component.
 * Implements strict iframe isolation with allow-scripts (NO allow-same-origin),
 * secure postMessage verification nonces, LaTeX-to-Unicode typography formatting,
 * and responsive expansive sizing.
 */
export default function InteractiveGraph({
  spec,
  theme = 'light',
  className = '',
  minHeight = 360
}: InteractiveGraphProps): React.JSX.Element {
  const [iframeHeight, setIframeHeight] = useState<number>(minHeight)
  const [hasError, setHasError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const nonceRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `graph_${Math.random().toString(36).slice(2)}`
  )

  const isDark = theme === 'dark'

  // Prepare normalized Vega-Lite spec with responsive properties, LaTeX cleanup, and theme styling
  const normalizedSpec = React.useMemo(() => {
    try {
      // 1. First sanitize mathematical expressions across titles, axes, legends, and parameters
      const sanitized = sanitizeVegaSpecMath(spec)
      const cloned = JSON.parse(JSON.stringify(sanitized))

      // 2. Ensure schema is present
      if (!cloned.$schema) {
        cloned.$schema = 'https://vega.github.io/schema/vega-lite/v5.json'
      }

      // 3. Generous responsive sizing defaults
      if (!cloned.width) cloned.width = 'container'
      if (!cloned.height && !cloned.vconcat && !cloned.hconcat) cloned.height = 320

      cloned.autosize = {
        type: 'fit',
        contains: 'padding'
      }

      // 4. Background styling
      cloned.background = isDark ? '#0f172a' : '#ffffff'

      // 5. Default theme configurations for high-definition rendering
      cloned.config = {
        ...cloned.config,
        background: isDark ? '#0f172a' : '#ffffff',
        padding: { top: 12, left: 14, right: 14, bottom: 12 },
        title: {
          color: isDark ? '#f8fafc' : '#0f172a',
          fontSize: 15,
          fontWeight: 600,
          anchor: 'start',
          offset: 12,
          subtitleColor: isDark ? '#94a3b8' : '#64748b',
          subtitleFontSize: 12,
          ...(cloned.config?.title || {})
        },
        axis: {
          domainColor: isDark ? '#334155' : '#cbd5e1',
          domainWidth: 1.5,
          gridColor: isDark ? '#1e293b' : '#f1f5f9',
          gridWidth: 1,
          gridOpacity: isDark ? 0.6 : 0.8,
          tickColor: isDark ? '#475569' : '#cbd5e1',
          tickSize: 5,
          labelColor: isDark ? '#94a3b8' : '#64748b',
          labelFontSize: 11,
          labelFontWeight: '500',
          labelPadding: 6,
          titleColor: isDark ? '#cbd5e1' : '#334155',
          titleFontSize: 13,
          titleFontWeight: '600',
          titlePadding: 10,
          ...(cloned.config?.axis || {})
        },
        legend: {
          labelColor: isDark ? '#94a3b8' : '#64748b',
          labelFontSize: 11,
          labelFontWeight: '500',
          titleColor: isDark ? '#cbd5e1' : '#334155',
          titleFontSize: 12,
          titleFontWeight: '600',
          symbolSize: 100,
          symbolStrokeWidth: 2,
          padding: 10,
          ...(cloned.config?.legend || {})
        },
        view: {
          stroke: 'transparent',
          continuousWidth: 600,
          continuousHeight: 320,
          ...(cloned.config?.view || {})
        }
      }

      return cloned
    } catch (e: any) {
      setHasError(e.message || 'Invalid graph specification')
      return spec
    }
  }, [spec, isDark])

  // Construct isolated HTML for iframe srcdoc
  const srcDoc = React.useMemo(() => {
    const nonce = nonceRef.current
    const specJson = JSON.stringify(normalizedSpec)
    const bgColor = isDark ? '#0f172a' : '#ffffff'
    const textColor = isDark ? '#e2e8f0' : '#1e293b'

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; connect-src https:;">
  <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      background-color: ${bgColor};
      color: ${textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 12px;
      overflow-x: hidden;
      overflow-y: auto;
    }
    #vis {
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .vega-embed {
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
    }
    .vega-embed > svg, .vega-embed > canvas {
      max-width: 100% !important;
      height: auto !important;
    }
    .vega-bindings {
      width: 100% !important;
      margin-top: 16px;
      padding: 14px 18px;
      background: ${isDark ? '#1e293b' : '#f8fafc'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 12px;
    }
    .vega-bind {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      width: 100%;
    }
    .vega-bind-name {
      font-weight: 600;
      font-size: 12px;
      color: ${isDark ? '#e2e8f0' : '#334155'};
      min-width: 130px;
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .vega-bind input[type=range] {
      flex: 1;
      height: 6px;
      border-radius: 9999px;
      background: ${isDark ? '#334155' : '#cbd5e1'};
      outline: none;
      accent-color: #8b5cf6;
      cursor: pointer;
    }
    .vega-bind span {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      color: #8b5cf6;
      min-width: 45px;
      text-align: right;
    }
    .error-box {
      color: #ef4444;
      background: ${isDark ? '#450a0a' : '#fef2f2'};
      border: 1px solid ${isDark ? '#7f1d1d' : '#fecaca'};
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .vega-actions {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="vis"></div>
  <div id="error" class="error-box" style="display: none;"></div>

  <script>
    const NONCE = "${nonce}";
    function post(type, payload) {
      try {
        window.parent.postMessage({ nonce: NONCE, type: type, payload: payload }, "*");
      } catch (e) {}
    }

    function sendHeight() {
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 340);
      post("RESIZE", { height: height });
    }

    try {
      const spec = ${specJson};
      vegaEmbed("#vis", spec, {
        actions: false,
        theme: "${isDark ? 'dark' : 'vox'}",
        renderer: "svg"
      }).then(function(result) {
        post("LOADED", {});
        sendHeight();
        const resizeObserver = new ResizeObserver(() => sendHeight());
        resizeObserver.observe(document.body);
      }).catch(function(err) {
        document.getElementById("error").style.display = "block";
        document.getElementById("error").textContent = "Rendering Error: " + err.message;
        post("ERROR", { message: err.message });
        sendHeight();
      });
    } catch (e) {
      document.getElementById("error").style.display = "block";
      document.getElementById("error").textContent = "Syntax Error: " + e.message;
      post("ERROR", { message: e.message });
      sendHeight();
    }
  </script>
</body>
</html>`
  }, [normalizedSpec, isDark])

  // Handle postMessage communication from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.nonce !== nonceRef.current) return

      const { type, payload } = event.data

      if (type === 'RESIZE' && payload?.height) {
        setIframeHeight(Math.max(payload.height, minHeight))
      } else if (type === 'LOADED') {
        setIsLoading(false)
        setHasError(null)
      } else if (type === 'ERROR') {
        setIsLoading(false)
        setHasError(payload?.message || 'Failed to render visualization')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [minHeight])

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 transition-all ${className}`}
      style={{ minHeight: `${minHeight}px` }}
    >
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xs text-xs text-slate-500 dark:text-slate-400 gap-2">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span>Rendering interactive model...</span>
        </div>
      )}

      {hasError && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg m-3 text-xs text-red-700 dark:text-red-300 font-mono">
          <div className="font-semibold mb-1">Visualization Error:</div>
          <div>{hasError}</div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        title="Interactive Graph"
        className="w-full border-0 block"
        style={{ height: `${iframeHeight}px`, minHeight: `${minHeight}px` }}
        sandbox="allow-scripts"
      />
    </div>
  )
}
