import type { Config } from 'tailwindcss'

const config: Config = {
  // ── B-01: Content paths — todos los directorios FSD ───────────────────────
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/widgets/**/*.{js,ts,jsx,tsx,mdx}',
    './src/shared/**/*.{js,ts,jsx,tsx,mdx}',
    './src/providers/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── B-02 + B-04: Design System tokens ─────────────────────────────────

      // ── Colores ─────────────────────────────────────────────────────────────

      colors: {
        // Grupo A — Superficies (design-system §1.1-A)
        'surface-void':    '#080B0F',
        'surface-abyss':   '#0D1117',
        'surface-console': '#131920',
        'surface-studio':  '#1A2330',
        'surface-rack':    '#21303F',
        // Panel del sidebar — tinte teal profundo para contrastar con el
        // contenido en negro puro (rediseño 2026-07).
        'surface-sidebar': '#0A1A18',

        // Amarillo Sony Sports (WM-F5) — cuerpo del Walkman del reproductor.
        walkman: {
          DEFAULT: '#FFD60A',
          dark:    '#E0B400',
        },

        // Grupo B — Texto (design-system §1.1-B)
        // Genera text-primary, text-secondary, text-disabled, text-ghost
        primary:   '#E8EFF5',
        secondary: '#8FA3B8',
        disabled:  '#4D6278',
        ghost:     '#2C3E50',

        // Grupo C — Acento teal (design-system §1.1-C)
        teal: {
          300:  '#4DFFD9',
          400:  '#00E5BF',
          500:  '#00C9A7',
          700:  '#008C73',
          glow: '#00C9A720',
        },

        // Grupo D — Semántica de estado (design-system §1.1-D)
        //
        // `on-dark` es la variante para TEXTO. Los colores base están pensados
        // como relleno (barras, puntos, bordes, fondos teñidos) y sobre las
        // superficies oscuras se quedan en 3.0-3.7:1, por debajo del 4.5:1 que
        // pide WCAG AA para texto: error, info y queue se aclaran solo cuando
        // son glifos. Los rellenos NO cambian — WCAG 1.4.3 no aplica a ellos y
        // aclararlos deslavaría el diseño. success y warning ya cumplen, pero
        // mantienen la variante para que el uso sea uniforme.
        semantic: {
          success: { DEFAULT: '#39D353', 'on-dark': '#39D353' },
          warning: { DEFAULT: '#E8A020', 'on-dark': '#E8A020' },
          error:   { DEFAULT: '#E84040', 'on-dark': '#EF7D7D' },
          info:    { DEFAULT: '#3B82F6', 'on-dark': '#72A5F9' },
          queue:   { DEFAULT: '#8B5CF6', 'on-dark': '#B192F9' },
        },

        // Grupo F — Synthwave, uso restringido (design-system §1.1-F)
        synthwave: {
          magenta: '#E040FB',
          blue:    '#40C4FF',
          pink:    '#FF4081',
        },

        // ── Legacy neon (mantenidos para compatibilidad) ──────────────────────
        neon: {
          green:   '#00ff00',
          magenta: '#ff00ff',
          cyan:    '#00ffff',
        },
        dark: {
          bg:      '#0a0e27',
          surface: '#111827',
          border:  '#1f2937',
        },
      },

      // ── Colores de borde (design-system §1.1-E) ────────────────────────────
      // Genera: border, border-subtle, border-focus, border-error
      borderColor: {
        DEFAULT: '#1E2D3D',
        subtle:  '#162030',
        focus:   '#00C9A750',
        error:   '#E8404050',
      },

      // ── B-04: Tipografías (design-system §2.1) ─────────────────────────────
      // CSS variables: --font-sans (Inter), --font-display (Geist Mono)
      // next/font provee las variables; Tailwind las consume aquí.
      fontFamily: {
        // UI / Interfaz — Inter
        sans: [
          'var(--font-sans)',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        // Display / Técnica — Geist Mono
        // --font-display es mapeado desde --font-geist-mono en globals.css
        mono: [
          'var(--font-display)',
          'var(--font-geist-mono)',
          'JetBrains Mono',
          'monospace',
        ],
        // Código / CLI — JetBrains Mono (futuro, por ahora usa Geist como fallback)
        code: [
          'JetBrains Mono',
          'var(--font-display)',
          'var(--font-geist-mono)',
          'monospace',
        ],
        // Letrero neon — Monoton (display de doble trazo, tipo tubo de neon)
        neon: ['var(--font-neon)', 'cursive'],
        // Retro / Displays — VT323 (código OAuth, contador de expiración)
        retro: ['var(--font-retro)', 'monospace'],
        // Plumón — Permanent Marker (título de canción en el cassette del Walkman)
        marker: ['var(--font-marker)', 'cursive'],
      },

      // ── Escala de tamaños tipográficos (design-system §2.2) ────────────────
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1.0', letterSpacing: '0.05em' }], // 10px
        heading: ['1.25rem', { lineHeight: '1.2', letterSpacing: '0' }],      // 20px
      },

      // ── Radios de borde (design-system §1.3) ───────────────────────────────
      // Sobreescribe defaults de Tailwind para alinear con el design system.
      // Cambio más notable: rounded-md 6px → 4px (canónico del DS)
      borderRadius: {
        none: '0px',
        sm:   '2px',
        md:   '4px',
        lg:   '8px',
        xl:   '12px',
        full: '9999px',
      },

      // ── Sombras y Glow (design-system §1.4) ────────────────────────────────
      boxShadow: {
        // Elevación
        sm:  '0 1px 3px 0 rgba(0,0,0,0.40), 0 1px 2px 0 rgba(0,0,0,0.30)',
        md:  '0 4px 12px 0 rgba(0,0,0,0.50), 0 2px 4px 0 rgba(0,0,0,0.40)',
        lg:  '0 10px 30px 0 rgba(0,0,0,0.60), 0 4px 8px 0 rgba(0,0,0,0.40)',
        xl:  '0 20px 50px 0 rgba(0,0,0,0.70), 0 8px 16px 0 rgba(0,0,0,0.50)',
        // Glow semántico
        'glow-active':   '0 0 8px 0 rgba(0,201,167,0.40), 0 0 24px 0 rgba(0,201,167,0.15)',
        // Glow magenta para la variante neón morada (synthwave-magenta #E040FB)
        'glow-magenta':  '0 0 8px 0 rgba(224,64,251,0.45), 0 0 24px 0 rgba(224,64,251,0.20)',
        // Marco del letrero neón (tubo perimetral morado/rosa: glow externo + interno)
        'neon-frame':    '0 0 6px 0 rgba(224,64,251,0.80), 0 0 20px 0 rgba(224,64,251,0.45), inset 0 0 14px 0 rgba(224,64,251,0.30)',
        'glow-focus':    '0 0 0 2px rgba(0,201,167,0.50)',
        'glow-error':    '0 0 8px 0 rgba(232,64,64,0.35)',
        'glow-success':  '0 0 8px 0 rgba(57,211,83,0.30)',
        'glow-download': '0 0 8px 0 rgba(59,130,246,0.35)',
        // Glow violeta para descargas en cola (semantic-queue #8B5CF6)
        'glow-queue':    '0 0 8px 0 rgba(139,92,246,0.40), 0 0 24px 0 rgba(139,92,246,0.15)',
        // Iluminacion del borde superior del Download Panel (glow hacia arriba)
        'glow-panel':        '0 -4px 16px -4px rgba(0,201,167,0.12)',
        'glow-panel-active': '0 -4px 20px -2px rgba(0,201,167,0.30), 0 -1px 6px 0 rgba(0,201,167,0.20)',
        // Legacy neon (compatibilidad)
        'neon-green':    '0 0 10px #00ff00, 0 0 20px #00ff00, 0 0 40px #00ff00',
        'neon-cyan':     '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 40px #00ffff',
        'neon-magenta':  '0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 40px #ff00ff',
      },

      // ── Z-Index (design-system §1.5 + wireframes-v2 §2 z-panel:150) ────────
      zIndex: {
        base:     '0',
        raised:   '10',
        dropdown: '100',
        panel:    '150',  // Download Panel fijo — agregado en wireframes-v2
        sticky:   '200',
        overlay:  '300',
        modal:    '400',
        toast:    '500',
        tooltip:  '600',
      },

      // ── Constantes de layout (design-system §1.2) ──────────────────────────
      width: {
        sidebar: '240px',
      },
      height: {
        player: '80px',
        header: '56px',
      },
      maxWidth: {
        content: '1440px',
        prose:   '65ch',
      },

      // ── Animaciones ─────────────────────────────────────────────────────────
      animation: {
        'pulse-neon':            'pulseNeon 2s ease-in-out infinite',
        shimmer:                 'shimmer 1500ms linear infinite',
        'progress-indeterminate':'progressIndeterminate 1500ms ease-in-out infinite',
        // vNext neon (DESIGN_SYSTEM_VISION §9.2)
        'laser-scan':            'laserScan 7s linear infinite',
        'audio-wave':            'audioWave 1.6s ease-in-out infinite',
        // Fase 15 — balanceo pendular del letrero colgado (solo rotate)
        'sign-sway':             'signSway 6.5s ease-in-out infinite alternate',
        // Fase 15 — giro perezoso del plato del tocadiscos decorativo
        'record-spin':           'recordSpin 8s linear infinite',
        // Fase 5 — carretes del cassette en el reproductor Now Playing (Walkman).
        // Mas rapido que el plato (2.5s) y sin destellos; solo rotate.
        'reel-spin':             'reelSpin 2.5s linear infinite',
      },
      keyframes: {
        pulseNeon: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        progressIndeterminate: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        // Barrido laser continuo (7s lineal, sin destellos — WCAG 2.3.1).
        // El span mide w-24; recorre todo el ancho del contenedor y sale.
        laserScan: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(calc(100vw + 100%))' },
        },
        // Barras de ecualizador: solo scaleY compuesto, origen en la base.
        audioWave: {
          '0%, 100%': { transform: 'scaleY(0.2)' },
          '50%':      { transform: 'scaleY(1)' },
        },
        // Letrero colgado: péndulo sutil alrededor del anclaje de las cadenas
        // (origin-top en el elemento). Amplitud mínima para leerse como una
        // corriente de aire, no como movimiento que distrae.
        signSway: {
          from: { transform: 'rotate(-0.7deg)' },
          to:   { transform: 'rotate(0.7deg)' },
        },
        // Plato del tocadiscos: rotacion continua lenta (solo transform);
        // mas lenta que un 33rpm real a proposito — ambientacion, no realismo.
        recordSpin: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        // Carretes del cassette: rotacion continua (solo transform). El grupo
        // usa transform-box: fill-box + origin center para girar sobre su eje.
        reelSpin: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
