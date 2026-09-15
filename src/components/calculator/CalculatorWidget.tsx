import React, { useState, useEffect } from "react"
import { X } from "../icons"
import type { CalculatorSkin } from "../../types"

interface CalculatorProps {
  skin?: CalculatorSkin
  onClose?: () => void
  isFloating?: boolean
}

export default function CalculatorWidget({
  skin = "numworks",
  onClose,
  isFloating = false
}: CalculatorProps): React.JSX.Element {
  const [activeSkin, setActiveSkin] = useState<CalculatorSkin>(skin)
  const [expression, setExpression] = useState<string>("")
  const [result, setResult] = useState<string>("")
  const [isRad, setIsRad] = useState<boolean>(true)
  const [lastAns, setLastAns] = useState<string>("0")

  useEffect(() => {
    setActiveSkin(skin)
  }, [skin])

  const safeEvaluate = (expr: string): string => {
    try {
      if (!expr.trim()) return ""
      
      // Replace constants and math functions
      let formatted = expr
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/π/g, "Math.PI")
        .replace(/\be\b/g, "Math.E")
        .replace(/\bans\b/gi, lastAns)
        .replace(/\^/g, "**")

      // Handle trig with Deg/Rad
      if (!isRad) {
        formatted = formatted
          .replace(/sin\(([^)]+)\)/g, "Math.sin(($1) * Math.PI / 180)")
          .replace(/cos\(([^)]+)\)/g, "Math.cos(($1) * Math.PI / 180)")
          .replace(/tan\(([^)]+)\)/g, "Math.tan(($1) * Math.PI / 180)")
      } else {
        formatted = formatted
          .replace(/sin\(/g, "Math.sin(")
          .replace(/cos\(/g, "Math.cos(")
          .replace(/tan\(/g, "Math.tan(")
      }

      formatted = formatted
        .replace(/ln\(/g, "Math.log(")
        .replace(/log\(/g, "Math.log10(")
        .replace(/sqrt\(/g, "Math.sqrt(")
        .replace(/√\(/g, "Math.sqrt(")

      // Sanitize before Function execution
      if (/[^0-9+\-*/().,%\sMath.PIEsincoztanlgrq]/.test(formatted)) {
        return "Error"
      }

      // eslint-disable-next-line no-new-func
      const evalVal = Function(`"use strict"; return (${formatted})`)()
      if (typeof evalVal === "number" && !isNaN(evalVal)) {
        // Round nicely if floating point precision artifacts
        const rounded = Number(evalVal.toFixed(8))
        return String(rounded)
      }
      return "Error"
    } catch {
      return "Error"
    }
  }

  const handleInput = (val: string) => {
    setExpression((prev) => prev + val)
  }

  const handleClear = () => {
    setExpression("")
    setResult("")
  }

  const handleDelete = () => {
    setExpression((prev) => prev.slice(0, -1))
  }

  const handleEquals = () => {
    const res = safeEvaluate(expression)
    if (res && res !== "Error") {
      setResult(res)
      setLastAns(res)
    } else {
      setResult("Error")
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NUMWORKS THEME / SKIN
  // ──────────────────────────────────────────────────────────────────────────
  if (activeSkin === "numworks") {
    return (
      <div className={`bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex flex-col font-mono text-slate-800 dark:text-slate-100 transition-all select-none ${isFloating ? "w-80" : "w-full max-w-sm"}`}>
        {/* Top Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block animate-pulse"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">NumWorks</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold cursor-pointer" onClick={() => setIsRad(!isRad)}>
              {isRad ? "RAD" : "DEG"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveSkin("ti84")}
              title="Switch to TI-84 Skin"
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-600 dark:text-slate-400"
            >
              TI-84
            </button>
            {onClose && (
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Display Screen */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 mb-3 shadow-inner flex flex-col justify-end min-h-[85px]">
          <div className="text-xs text-slate-400 dark:text-slate-500 overflow-x-auto whitespace-nowrap text-right mb-1">
            {expression || "0"}
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-amber-400 text-right overflow-x-auto whitespace-nowrap">
            {result || (expression ? "= " + safeEvaluate(expression) : "0")}
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-5 gap-1.5 text-xs">
          {/* Row 1 */}
          <button onClick={() => setIsRad(!isRad)} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold hover:bg-slate-300 dark:hover:bg-slate-700">{isRad ? "rad" : "deg"}</button>
          <button onClick={() => handleInput("sin(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">sin</button>
          <button onClick={() => handleInput("cos(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">cos</button>
          <button onClick={() => handleInput("tan(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">tan</button>
          <button onClick={() => handleInput("ln(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">ln</button>

          {/* Row 2 */}
          <button onClick={() => handleInput("sqrt(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">√x</button>
          <button onClick={() => handleInput("^2")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">x²</button>
          <button onClick={() => handleInput("^(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">x^y</button>
          <button onClick={() => handleInput("e")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">e</button>
          <button onClick={() => handleInput("π")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">π</button>

          {/* Row 3 */}
          <button onClick={() => handleInput("(")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">(</button>
          <button onClick={() => handleInput(")")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700">)</button>
          <button onClick={handleDelete} className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-200">DEL</button>
          <button onClick={handleClear} className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-200">AC</button>
          <button onClick={() => handleInput("÷")} className="p-2 rounded-lg bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-300/60">÷</button>

          {/* Row 4 */}
          <button onClick={() => handleInput("7")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">7</button>
          <button onClick={() => handleInput("8")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">8</button>
          <button onClick={() => handleInput("9")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">9</button>
          <button onClick={() => handleInput("ans")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold hover:bg-slate-300">Ans</button>
          <button onClick={() => handleInput("×")} className="p-2 rounded-lg bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-300/60">×</button>

          {/* Row 5 */}
          <button onClick={() => handleInput("4")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">4</button>
          <button onClick={() => handleInput("5")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">5</button>
          <button onClick={() => handleInput("6")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">6</button>
          <button onClick={() => handleInput("%")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold hover:bg-slate-300">%</button>
          <button onClick={() => handleInput("-")} className="p-2 rounded-lg bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-300/60">−</button>

          {/* Row 6 */}
          <button onClick={() => handleInput("1")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">1</button>
          <button onClick={() => handleInput("2")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">2</button>
          <button onClick={() => handleInput("3")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">3</button>
          <button onClick={() => handleInput(",")} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold hover:bg-slate-300">,</button>
          <button onClick={() => handleInput("+")} className="p-2 rounded-lg bg-amber-200/60 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-300/60">+</button>

          {/* Row 7 */}
          <button onClick={() => handleInput("0")} className="col-span-2 p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">0</button>
          <button onClick={() => handleInput(".")} className="p-2 rounded-lg bg-white dark:bg-slate-800 font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700">.</button>
          <button onClick={handleEquals} className="col-span-2 p-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold shadow-md">=</button>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TI-84 PLUS THEME / SKIN
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-neutral-800 border-2 border-neutral-900 rounded-3xl shadow-2xl p-4 flex flex-col font-mono text-neutral-100 select-none ${isFloating ? "w-80" : "w-full max-w-sm"}`}>
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-700">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black text-neutral-300 uppercase tracking-wider">TI-84 Plus</span>
          <span className="text-[9px] px-1 bg-neutral-700 text-emerald-400 font-bold rounded">TEXAS INSTRUMENTS</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveSkin("numworks")}
            title="Switch to NumWorks Skin"
            className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700 hover:bg-neutral-600 text-amber-400 font-bold"
          >
            NumWorks
          </button>
          {onClose && (
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-200 p-1">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Retro Dot-Matrix LCD Screen */}
      <div className="bg-[#a4ba9c] text-neutral-900 border-4 border-neutral-950 rounded-lg p-2.5 mb-3 font-mono shadow-inner min-h-[90px] flex flex-col justify-between">
        <div className="flex justify-between text-[10px] border-b border-neutral-800/30 pb-0.5 font-bold tracking-tight">
          <span>NORMAL FLOAT AUTO REAL {isRad ? "RAD" : "DEG"} MP</span>
          <span className="cursor-pointer" onClick={() => setIsRad(!isRad)}>[MODE]</span>
        </div>
        <div className="text-xs text-right whitespace-nowrap overflow-x-auto font-medium my-1">
          {expression || "0"}
        </div>
        <div className="text-lg font-black text-right whitespace-nowrap overflow-x-auto">
          {result || (expression ? safeEvaluate(expression) : "0")}
        </div>
      </div>

      {/* Function / 2nd / Alpha Keys Row */}
      <div className="grid grid-cols-5 gap-1.5 text-xs mb-2">
        <button className="p-1.5 rounded bg-amber-400 text-neutral-950 font-black text-[10px]">2nd</button>
        <button className="p-1.5 rounded bg-emerald-600 text-white font-black text-[10px]">ALPHA</button>
        <button onClick={() => setIsRad(!isRad)} className="p-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-[10px]">MODE</button>
        <button onClick={handleDelete} className="p-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-[10px]">DEL</button>
        <button onClick={handleClear} className="p-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-[10px] font-bold text-rose-300">CLEAR</button>
      </div>

      {/* TI-84 Keypad Grid */}
      <div className="grid grid-cols-5 gap-1.5 text-xs">
        <button onClick={() => handleInput("^(-1)")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">x⁻¹</button>
        <button onClick={() => handleInput("sin(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">sin</button>
        <button onClick={() => handleInput("cos(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">cos</button>
        <button onClick={() => handleInput("tan(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">tan</button>
        <button onClick={() => handleInput("^(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">^</button>

        <button onClick={() => handleInput("^2")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">x²</button>
        <button onClick={() => handleInput(",") } className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">,</button>
        <button onClick={() => handleInput("(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">(</button>
        <button onClick={() => handleInput(")")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">)</button>
        <button onClick={() => handleInput("÷")} className="p-2 rounded bg-sky-900 hover:bg-sky-800 text-sky-200 font-bold text-sm">÷</button>

        <button onClick={() => handleInput("sqrt(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">√</button>
        <button onClick={() => handleInput("7")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">7</button>
        <button onClick={() => handleInput("8")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">8</button>
        <button onClick={() => handleInput("9")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">9</button>
        <button onClick={() => handleInput("×")} className="p-2 rounded bg-sky-900 hover:bg-sky-800 text-sky-200 font-bold text-sm">×</button>

        <button onClick={() => handleInput("ln(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">ln</button>
        <button onClick={() => handleInput("4")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">4</button>
        <button onClick={() => handleInput("5")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">5</button>
        <button onClick={() => handleInput("6")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">6</button>
        <button onClick={() => handleInput("-")} className="p-2 rounded bg-sky-900 hover:bg-sky-800 text-sky-200 font-bold text-sm">−</button>

        <button onClick={() => handleInput("log(")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">log</button>
        <button onClick={() => handleInput("1")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">1</button>
        <button onClick={() => handleInput("2")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">2</button>
        <button onClick={() => handleInput("3")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">3</button>
        <button onClick={() => handleInput("+")} className="p-2 rounded bg-sky-900 hover:bg-sky-800 text-sky-200 font-bold text-sm">+</button>

        <button onClick={() => handleInput("π")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 font-semibold text-[11px]">π</button>
        <button onClick={() => handleInput("0")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">0</button>
        <button onClick={() => handleInput(".")} className="p-2 rounded bg-neutral-600 hover:bg-neutral-500 font-bold text-sm">.</button>
        <button onClick={() => handleInput("ans")} className="p-2 rounded bg-neutral-700 hover:bg-neutral-600 text-[11px]">(-) </button>
        <button onClick={handleEquals} className="p-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm">ENTER</button>
      </div>
    </div>
  )
}
