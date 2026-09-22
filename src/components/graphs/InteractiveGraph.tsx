import React, { useEffect, useState, useRef } from 'react'
import { sanitizeVegaSpecMath } from './latexGraphUtils'

export interface InteractiveGraphProps {
  spec: Record<string, any>
  theme?: 'dark' | 'light'
  className?: string
  minHeight?: number
  scale?: number
  onScaleChange?: (scale: number) => void
}

/**
 * Sandboxed High-Definition Vega-Lite renderer component.
 * Implements strict iframe isolation with allow-scripts (NO allow-same-origin),
 * secure postMessage verification nonces, LaTeX-to-Unicode typography formatting,
 * direct point grabbing & dragging, dynamic scale/zoom adjustments, and responsive sizing.
 */
export default function InteractiveGraph({
  spec,
  theme = 'light',
  className = '',
  minHeight = 360,
  scale = 1.0,
  onScaleChange
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
      user-select: none;
    }
    #scale-wrapper {
      width: 100%;
      transform-origin: top center;
      transition: transform 0.15s ease-out;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    #vis {
      width: 100%;
      display: flex;
      justify-content: center;
      position: relative;
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
    /* Interactive Draggable Points & Highlights */
    .mark-symbol path, .mark-symbol circle, [class*="mark-symbol"] path, .role-mark.mark-symbol {
      cursor: grab !important;
      pointer-events: all !important;
      transition: transform 0.08s ease, filter 0.15s ease;
    }
    .mark-symbol path:hover, [class*="mark-symbol"] path:hover {
      filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.9)) drop-shadow(0 0 10px rgba(139, 92, 246, 0.7)) !important;
      transform: scale(1.25);
      transform-origin: center;
    }
    body.dragging-point, body.dragging-point * {
      cursor: grabbing !important;
      user-select: none !important;
    }
    #drag-tooltip {
      position: fixed;
      display: none;
      pointer-events: none;
      z-index: 9999;
      background: ${isDark ? '#1e293b' : '#0f172a'};
      color: #ffffff;
      padding: 4px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      border: 1px solid ${isDark ? '#475569' : '#334155'};
      white-space: nowrap;
      transform: translate(-50%, -100%);
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
      max-width: 220px;
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
  <div id="drag-tooltip"></div>
  <div id="scale-wrapper" style="transform: scale(${scale});">
    <div id="vis"></div>
    <div id="error" class="error-box" style="display: none;"></div>
  </div>

  <script>
    const NONCE = "${nonce}";
    let currentScale = ${scale};
    let vegaViewInstance = null;

    function post(type, payload) {
      try {
        window.parent.postMessage({ nonce: NONCE, type: type, payload: payload }, "*");
      } catch (e) {}
    }

    function sendHeight() {
      const wrapper = document.getElementById("scale-wrapper");
      const baseHeight = wrapper ? wrapper.scrollHeight : document.body.scrollHeight;
      const height = Math.max(Math.ceil(baseHeight * currentScale) + 24, 340);
      post("RESIZE", { height: height });
    }

    function applyScale(scaleVal) {
      currentScale = Math.max(0.5, Math.min(2.5, scaleVal));
      const wrapper = document.getElementById("scale-wrapper");
      if (wrapper) {
        wrapper.style.transform = "scale(" + currentScale + ")";
      }
      sendHeight();
    }

    window.addEventListener('message', function(event) {
      if (!event.data || event.data.nonce !== NONCE) return;
      if (event.data.type === 'SET_SCALE' && event.data.payload) {
        applyScale(event.data.payload.scale || 1.0);
      }
    });

    // Setup interactive Point Dragging system
    function initPointDragging(view) {
      const visEl = document.getElementById("vis");
      const tooltip = document.getElementById("drag-tooltip");
      let isDragging = false;
      let activeSignal = null;
      let activeSignalInfo = null;

      function getInteractiveSignals() {
        try {
          const state = view.getState();
          const signals = state.signals || {};
          const bindings = [];
          const inputs = document.querySelectorAll('.vega-bindings input[type=range]');
          inputs.forEach(input => {
            const parent = input.closest('.vega-bind');
            const nameText = parent ? parent.querySelector('.vega-bind-name')?.textContent || '' : '';
            const min = parseFloat(input.min) || 0;
            const max = parseFloat(input.max) || 100;
            const step = parseFloat(input.step) || 0.1;
            const val = parseFloat(input.value);
            bindings.push({ name: nameText.trim(), min, max, step, val, inputEl: input });
          });
          const specParams = (spec.params || spec.signals || []);
          return { signals, bindings, specParams };
        } catch (e) {
          return { signals: {}, bindings: [], specParams: [] };
        }
      }

      function getScales() {
        let xScale = null;
        let yScale = null;
        try {
          if (typeof view.scale === 'function') {
            xScale = view.scale('x') || view.scale('xscale');
            yScale = view.scale('y') || view.scale('yscale');
          }
          if (!xScale || !yScale) {
            const runtimeScales = view._runtime?.scales || {};
            for (const key of Object.keys(runtimeScales)) {
              const s = runtimeScales[key]?.value;
              if (!s) continue;
              if (!xScale && (key.includes('x') || key.endsWith('_x'))) xScale = s;
              if (!yScale && (key.includes('y') || key.endsWith('_y'))) yScale = s;
            }
          }
        } catch (e) {}
        return { xScale, yScale };
      }

      function getSvgCoordinates(evt) {
        const svg = visEl.querySelector('svg');
        if (!svg) return null;
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        try {
          const screenCTM = svg.getScreenCTM();
          if (screenCTM) {
            return pt.matrixTransform(screenCTM.inverse());
          }
        } catch (e) {}
        const rect = svg.getBoundingClientRect();
        return { x: (evt.clientX - rect.left) / currentScale, y: (evt.clientY - rect.top) / currentScale };
      }

      function getChartOffset() {
        const svg = visEl.querySelector('svg');
        if (!svg) return { x: 0, y: 0 };
        const markGroup = svg.querySelector('g.mark-group.role-scope') || svg.querySelector('g.mark-group');
        if (markGroup && markGroup.transform?.baseVal?.numberOfItems > 0) {
          const matrix = markGroup.transform.baseVal.getItem(0).matrix;
          return { x: matrix.e || 0, y: matrix.f || 0 };
        }
        const pad = spec.padding || { left: 40, top: 20 };
        return {
          x: typeof pad === 'number' ? pad : (pad.left || 40),
          y: typeof pad === 'number' ? pad : (pad.top || 20)
        };
      }

      function updatePointFromCoords(chartX, chartY, evt) {
        if (!activeSignalInfo) return;
        const { xScale, yScale } = getScales();
        let dataX = (xScale && typeof xScale.invert === 'function') ? xScale.invert(chartX) : chartX;
        let dataY = (yScale && typeof yScale.invert === 'function') ? yScale.invert(chartY) : chartY;

        let targetVal = activeSignalInfo.isY ? dataY : dataX;
        if (isNaN(targetVal)) targetVal = activeSignalInfo.min;

        let clamped = Math.max(activeSignalInfo.min, Math.min(activeSignalInfo.max, targetVal));
        const step = activeSignalInfo.step || 0.1;
        const precision = step < 1 ? (step.toString().split('.')[1] || '').length : 0;
        clamped = Number((Math.round(clamped / step) * step).toFixed(precision));

        if (activeSignal) {
          try {
            view.signal(activeSignal, clamped).runAsync();
          } catch (e) {}
        }

        // Sync bound slider range input
        const inputs = document.querySelectorAll('.vega-bindings input[type=range]');
        inputs.forEach(input => {
          const parent = input.closest('.vega-bind');
          const name = parent ? parent.querySelector('.vega-bind-name')?.textContent || '' : '';
          if (name.toLowerCase().includes(activeSignalInfo.name.toLowerCase()) || inputs.length === 1) {
            input.value = clamped;
            const valSpan = parent?.querySelector('span');
            if (valSpan) valSpan.textContent = clamped;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });

        // Update floating drag tooltip
        if (tooltip) {
          tooltip.style.display = 'block';
          tooltip.style.left = evt.clientX + 'px';
          tooltip.style.top = (evt.clientY - 12) + 'px';
          tooltip.textContent = activeSignalInfo.name + ': ' + clamped;
        }
      }

      visEl.addEventListener('pointerdown', function(e) {
        if (e.target.closest('input') || e.target.closest('button')) return;
        const svgPoint = getSvgCoordinates(e);
        if (!svgPoint) return;
        const offset = getChartOffset();
        const chartX = svgPoint.x - offset.x;
        const chartY = svgPoint.y - offset.y;

        const { signals, bindings, specParams } = getInteractiveSignals();
        const datum = e.target.__data__?.datum || (e.target.parentElement && e.target.parentElement.__data__?.datum);

        let bestSignal = null;
        let bestBinding = null;

        if (datum) {
          for (const k of Object.keys(datum)) {
            if (signals[k] !== undefined) {
              bestSignal = k;
              bestBinding = bindings.find(b => b.name.toLowerCase() === k.toLowerCase() || b.name.toLowerCase().includes(k.toLowerCase()));
              break;
            }
          }
        }

        if (!bestSignal && bindings.length > 0) {
          bestBinding = bindings[0];
          for (const sigName of Object.keys(signals)) {
            if (!sigName.startsWith('__') && (sigName === bestBinding.name || bestBinding.name.toLowerCase().includes(sigName.toLowerCase()) || sigName.length <= 2)) {
              bestSignal = sigName;
              break;
            }
          }
          if (!bestSignal && specParams.length > 0) {
            bestSignal = specParams[0].name;
          }
        }

        if (!bestSignal) {
          const userSignals = Object.keys(signals).filter(s => !s.startsWith('__') && !s.includes('unit') && !s.includes('width') && !s.includes('height') && !s.includes('cursor'));
          if (userSignals.length > 0) {
            bestSignal = userSignals[0];
          }
        }

        if (bestSignal || bindings.length > 0) {
          isDragging = true;
          document.body.classList.add('dragging-point');
          e.preventDefault();

          const min = bestBinding ? bestBinding.min : (specParams[0]?.bind?.min ?? 0);
          const max = bestBinding ? bestBinding.max : (specParams[0]?.bind?.max ?? 20);
          const step = bestBinding ? bestBinding.step : (specParams[0]?.bind?.step ?? 0.1);

          const nameLower = (bestSignal || bestBinding?.name || '').toLowerCase();
          const isY = nameLower.includes('price') || nameLower.includes('p') || nameLower.includes('y') || nameLower.includes('cost');

          activeSignal = bestSignal;
          activeSignalInfo = {
            name: bestSignal || bestBinding?.name || 'Value',
            min, max, step,
            isY,
            binding: bestBinding
          };

          updatePointFromCoords(chartX, chartY, e);
        }
      });

      window.addEventListener('pointermove', function(e) {
        if (!isDragging) return;
        const svgPoint = getSvgCoordinates(e);
        if (!svgPoint) return;
        const offset = getChartOffset();
        const chartX = svgPoint.x - offset.x;
        const chartY = svgPoint.y - offset.y;
        updatePointFromCoords(chartX, chartY, e);
      });

      window.addEventListener('pointerup', function() {
        if (isDragging) {
          isDragging = false;
          document.body.classList.remove('dragging-point');
          if (tooltip) tooltip.style.display = 'none';
          sendHeight();
        }
      });
      window.addEventListener('pointercancel', function() {
        if (isDragging) {
          isDragging = false;
          document.body.classList.remove('dragging-point');
          if (tooltip) tooltip.style.display = 'none';
        }
      });

      // Interactive mouse wheel zoom directly on chart canvas
      visEl.addEventListener('wheel', function(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 1.08 : 0.92;
          const nextScale = Math.max(0.6, Math.min(2.0, currentScale * delta));
          applyScale(nextScale);
          post("SCALE_CHANGED", { scale: nextScale });
        }
      }, { passive: false });

      // Double-click to reset scale
      visEl.addEventListener('dblclick', function(e) {
        if (!e.target.closest('input')) {
          applyScale(1.0);
          post("SCALE_CHANGED", { scale: 1.0 });
        }
      });
    }

    try {
      const spec = ${specJson};
      vegaEmbed("#vis", spec, {
        actions: false,
        theme: "${isDark ? 'dark' : 'vox'}",
        renderer: "svg"
      }).then(function(result) {
        vegaViewInstance = result.view;
        initPointDragging(result.view);
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
  }, [normalizedSpec, isDark, scale])

  // Broadcast scale updates to iframe if scale prop changes
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          nonce: nonceRef.current,
          type: 'SET_SCALE',
          payload: { scale }
        },
        '*'
      )
    }
  }, [scale])

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
      } else if (type === 'SCALE_CHANGED' && payload?.scale && onScaleChange) {
        onScaleChange(payload.scale)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [minHeight, onScaleChange])

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
