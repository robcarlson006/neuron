/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './src/index.html'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        },
        // Neuron brand palette — derived from the logo colors
        neuron: {
          50:  '#fdfcff',  // near-white with lavender hint (light mode bg)
          100: '#f5f0ff',  // soft lavender (sidebar bg, card bg)
          200: '#ede9fe',  // light purple (badges, subtle fills)
          300: '#c4b5fd',  // dendrite tips / violet-300
          400: '#a78bfa',  // dendrites / violet-400
          500: '#8b5cf6',  // soma / violet-500
          600: '#7c3aed',  // primary actions / violet-600
          700: '#6d28d9',  // hover / violet-700
          800: '#5b21b6',  // active / violet-800
          900: '#2e1065',  // dark text accent
          950: '#1a0835',  // dark mode bg
        },
        // Sky accent — axon / secondary accent color
        sky: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',  // axon terminals
          400: '#38bdf8',  // axon main
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        }
      },
      animation: {
        'flip': 'flip 0.4s ease-in-out',
        'flip-back': 'flip-back 0.4s ease-in-out',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'glow': 'glow 2.5s ease-in-out infinite',
      },
      keyframes: {
        flip: {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' }
        },
        'flip-back': {
          '0%': { transform: 'rotateY(180deg)' },
          '100%': { transform: 'rotateY(0deg)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.85' },
          '50%': { opacity: '1' }
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(139,92,246,0.3)' },
          '50%': { boxShadow: '0 0 18px rgba(139,92,246,0.6)' }
        }
      }
    }
  },
  plugins: []
}
