import React from 'react'

interface NeuronLogoProps {
  size?: number
  className?: string
}

export default function NeuronLogo({ size = 32, className = '' }: NeuronLogoProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        {/* Background gradient */}
        <radialGradient id="nlBg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#f5f0ff" />
          <stop offset="100%" stopColor="#e8efff" />
        </radialGradient>

        {/* Soma gradient */}
        <radialGradient id="nlSoma" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="45%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6d28d9" />
        </radialGradient>

        {/* Nucleus gradient */}
        <radialGradient id="nlNucleus" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ede9fe" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>

        {/* Soma halo */}
        <radialGradient id="nlHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>

        {/* Dendrite glow filter */}
        <filter id="nlGlowPurple" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Axon glow filter */}
        <filter id="nlGlowSky" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Terminal glow */}
        <filter id="nlDotGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <style>{`
          @keyframes nlSomaPulse {
            0%, 100% { opacity: 0.85; }
            50% { opacity: 1; }
          }
          @keyframes nlHaloPulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.08); }
          }
          @keyframes nlDendriteFlow {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
          }
          @keyframes nlAxonFlow {
            0%, 100% { opacity: 0.65; }
            50% { opacity: 1; }
          }
          @keyframes nlTwinkle1 {
            0%, 100% { opacity: 0.5; transform: scale(0.85); }
            50% { opacity: 1; transform: scale(1.15); }
          }
          @keyframes nlTwinkle2 {
            0%, 100% { opacity: 0.6; transform: scale(0.9); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          @keyframes nlTwinkle3 {
            0%, 100% { opacity: 0.55; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          .nl-halo {
            animation: nlHaloPulse 3s ease-in-out infinite;
            transform-origin: 50px 50px;
          }
          .nl-soma {
            animation: nlSomaPulse 3s ease-in-out infinite;
          }
          .nl-dendrite {
            animation: nlDendriteFlow 4s ease-in-out infinite;
          }
          .nl-axon {
            animation: nlAxonFlow 3.5s ease-in-out infinite;
            animation-delay: 0.5s;
          }
          .nl-dot-1 {
            animation: nlTwinkle1 2.5s ease-in-out infinite;
            transform-origin: var(--ox) var(--oy);
          }
          .nl-dot-2 {
            animation: nlTwinkle2 3s ease-in-out infinite;
            animation-delay: 0.4s;
            transform-origin: var(--ox) var(--oy);
          }
          .nl-dot-3 {
            animation: nlTwinkle3 2.8s ease-in-out infinite;
            animation-delay: 0.8s;
            transform-origin: var(--ox) var(--oy);
          }
          .nl-dot-4 {
            animation: nlTwinkle1 3.2s ease-in-out infinite;
            animation-delay: 1.2s;
            transform-origin: var(--ox) var(--oy);
          }
          .nl-dot-5 {
            animation: nlTwinkle2 2.6s ease-in-out infinite;
            animation-delay: 0.6s;
            transform-origin: var(--ox) var(--oy);
          }
          .nl-dot-6 {
            animation: nlTwinkle3 3.4s ease-in-out infinite;
            animation-delay: 1.6s;
            transform-origin: var(--ox) var(--oy);
          }
        `}</style>
      </defs>

      {/* Background rounded rect */}
      <rect x="0" y="0" width="100" height="100" rx="18" fill="url(#nlBg)" />

      {/* === DENDRITES (upper area, purple) === */}
      {/* Outer glow layer */}
      <g opacity="0.25" stroke="#a78bfa" strokeLinecap="round" fill="none">
        <path d="M50 50 Q42 38 36 26" strokeWidth="5" />
        <path d="M36 26 Q28 24 22 18" strokeWidth="3.5" />
        <path d="M36 26 Q30 32 24 35" strokeWidth="2.5" />
        <path d="M50 50 Q60 40 68 28" strokeWidth="4.5" />
        <path d="M68 28 Q74 22 76 14" strokeWidth="3" />
        <path d="M68 28 Q76 30 82 24" strokeWidth="2.5" />
        <path d="M50 50 Q38 50 26 46" strokeWidth="4" />
      </g>

      {/* Main dendrite paths */}
      <g className="nl-dendrite" filter="url(#nlGlowPurple)" stroke="#a78bfa" strokeLinecap="round" fill="none">
        <path d="M50 50 Q42 38 36 26" strokeWidth="2" />
        <path d="M36 26 Q28 24 22 18" strokeWidth="1.4" />
        <path d="M36 26 Q30 32 24 35" strokeWidth="1.1" />
        <path d="M50 50 Q60 40 68 28" strokeWidth="1.8" />
        <path d="M68 28 Q74 22 76 14" strokeWidth="1.3" />
        <path d="M68 28 Q76 30 82 24" strokeWidth="1.1" />
        <path d="M50 50 Q38 50 26 46" strokeWidth="1.6" />
        <path d="M26 46 Q20 50 16 47" strokeWidth="1" />
      </g>

      {/* === AXON (lower-right, sky blue) === */}
      {/* Outer glow */}
      <g opacity="0.25" stroke="#38bdf8" strokeLinecap="round" fill="none">
        <path d="M50 50 Q58 62 62 76" strokeWidth="6" />
        <path d="M62 76 Q64 82 60 88" strokeWidth="4.5" />
        <path d="M62 76 Q70 78 76 74" strokeWidth="3.5" />
        <path d="M58 62 Q68 66 76 62" strokeWidth="3" />
      </g>

      {/* Main axon path */}
      <g className="nl-axon" filter="url(#nlGlowSky)" stroke="#38bdf8" strokeLinecap="round" fill="none">
        <path d="M50 50 Q58 62 62 76" strokeWidth="2.2" />
        <path d="M62 76 Q64 82 60 88" strokeWidth="1.8" />
        <path d="M62 76 Q70 78 76 74" strokeWidth="1.5" />
        <path d="M58 62 Q68 66 76 62" strokeWidth="1.3" />
      </g>

      {/* === SOMA HALO === */}
      <circle className="nl-halo" cx="50" cy="50" r="22" fill="url(#nlHalo)" />

      {/* === SOMA === */}
      <circle className="nl-soma" cx="50" cy="50" r="13" fill="url(#nlSoma)" />
      <circle cx="50" cy="50" r="13" stroke="#c4b5fd" strokeWidth="0.7" fill="none" opacity="0.8" />

      {/* === NUCLEUS === */}
      <circle cx="50" cy="50" r="5.5" fill="url(#nlNucleus)" />
      <circle cx="50" cy="50" r="5.5" stroke="#c4b5fd" strokeWidth="0.5" fill="none" opacity="0.6" />
      {/* Nucleus shine */}
      <circle cx="48.5" cy="48.5" r="2" fill="white" opacity="0.5" />

      {/* === DENDRITE TERMINALS (purple dots) === */}
      <circle className="nl-dot-1" cx="22" cy="18" r="1.6" fill="#c4b5fd" filter="url(#nlDotGlow)" style={{ '--ox': '22px', '--oy': '18px' } as React.CSSProperties} />
      <circle className="nl-dot-2" cx="24" cy="35" r="1.3" fill="#c4b5fd" filter="url(#nlDotGlow)" style={{ '--ox': '24px', '--oy': '35px' } as React.CSSProperties} />
      <circle className="nl-dot-3" cx="76" cy="14" r="1.4" fill="#c4b5fd" filter="url(#nlDotGlow)" style={{ '--ox': '76px', '--oy': '14px' } as React.CSSProperties} />
      <circle className="nl-dot-4" cx="82" cy="24" r="1.3" fill="#c4b5fd" filter="url(#nlDotGlow)" style={{ '--ox': '82px', '--oy': '24px' } as React.CSSProperties} />
      <circle className="nl-dot-5" cx="16" cy="47" r="1.3" fill="#c4b5fd" filter="url(#nlDotGlow)" style={{ '--ox': '16px', '--oy': '47px' } as React.CSSProperties} />

      {/* === AXON TERMINALS (sky dots) === */}
      <circle className="nl-dot-2" cx="60" cy="88" r="2" fill="#7dd3fc" filter="url(#nlDotGlow)" style={{ '--ox': '60px', '--oy': '88px' } as React.CSSProperties} />
      <circle className="nl-dot-3" cx="76" cy="74" r="1.8" fill="#7dd3fc" filter="url(#nlDotGlow)" style={{ '--ox': '76px', '--oy': '74px' } as React.CSSProperties} />
      <circle className="nl-dot-6" cx="76" cy="62" r="1.7" fill="#7dd3fc" filter="url(#nlDotGlow)" style={{ '--ox': '76px', '--oy': '62px' } as React.CSSProperties} />
    </svg>
  )
}
