import React, { useEffect, useState, useRef } from 'react'

export interface InteractiveGraphProps {
  spec: Record<string, any>
  theme?: 'dark' | 'light'
  className?: string
  minHeight?: number
}

/**
 * Sandboxed Vega-Lite renderer component.
 * Implements strict iframe isolation with allow-scripts (NO allow-same-origin)
 * and secure postMessage verification nonces.
 */
export default function InteractiveGraph({
  spec,
  theme = 'light',
  className = '',
  minHeight = 320
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

  // Prepare normalized Vega-Lite spec with responsive properties and theme styling
  const normalizedSpec = React.useMemo(() => {
    try {
      const cloned = JSON.parse(JSON.stringify(spec))
      
      // Ensure schema is present
      if (!cloned.$schema) {
        cloned.$schema = 'https://vega.github.io/schema/vega-lite/v5.json'
      }

      // Responsive sizing defaults
      if (!cloned.width) cloned.width = 'container'
      if (!cloned.height && !cloned.vconcat && !cloned.hconcat) cloned.height = 240

      cloned.autosize = {
        type: 'fit',
        contains: 'padding'
      }

      // Background styling
      cloned.background = isDark ? '#0f172a' : '#ffffff'

      // Default theme configurations if not explicitly overridden
      cloned.config = {
        ...cloned.config,
        background: isDark ? '#0f172a' : '#ffffff',
        title: {
          color: isDark ? '#f8fafc' : '#0f172a',
          fontSize: 14,
          fontWeight: 600,
          anchor: 'start',
          ...(cloned.config?.title || {})
        },
        axis: {
          domainColor: isDark ? '#334155' : '#cbd5e1',
          gridColor: isDark ? '#1e293b' : '#f1f5f9',
          tickColor: isDark ? '#475569' : '#cbd5e1',
          labelColor: isDark ? '#94a3b8' : '#64748b',
          titleColor: isDark ? '#cbd5e1' : '#334155',
          labelFontSize: 11,
          titleFontSize: 12,
          ...(cloned.config?.axis || {})
        },
        legend: {
          labelColor: isDark ? '#94a3b8' : '#64748b',
          titleColor: isDark ? '#cbd5e1' : '#334155',
          labelFontSize: 11,
          titleFontSize: 12,
          ...(cloned.config?.legend || {})
        },
        view: {
          stroke: 'transparent',
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; connect-src https:;">
  <script src="https://cdn.jsdelivr.net/npm/vega@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-lite@5"></script>
  <script src="https://cdn.jsdelivr.net/npm/vega-embed@6"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
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
    .vega-bindings {
      margin-top: 14px;
      padding: 10px 14px;
      background: ${isDark ? '#1e293b' : '#f8fafc'};
      border: 1px solid ${isDark ? '#334155' : '#e2e8f0'};
      border-radius: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
    }
    .vega-bind {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .vega-bind-name {
      font-weight: 500;
      color: ${isDark ? '#cbd5e1' : '#475569'};
    }
    .vega-bind input[type=range] {
      accent-color: #8b5cf6;
      cursor: pointer;
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
    /* Hide vega action menu for cleaner educational display */
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
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 280);
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
        // Observe mutations / resizes
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
      // Validate nonce to prevent message spoofing from other frames
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
