// Palette system - Matplotlib-style colors
export const COLORS = {
  // Default blue (matches user's favorite #2E5BFF)
  primary: '#2E5BFF',

  // Matplotlib tableau colors
  tableau: [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  ],

  // Viridis-like palette
  viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26838e', '#1f9d8a', '#6cce5a', '#b6de2b', '#fde725'],

  // Plasma-like
  plasma: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'],

  // Monochrome blues
  blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],

  // Diverging red-blue
  rdbu: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'],
}

// Theme definitions
export interface Theme {
  name: string
  figure: {
    background: string
  }
  axes: {
    facecolor: string
    edgecolor: string
    textcolor: string
    gridcolor: string
  }
  lines: {
    colors: string[]
    width: number
  }
  fonts: {
    sans: string[]
    size: number
  }
}

export const THEMES: Record<string, Theme> = {
  light: {
    name: 'light',
    figure: { background: 'transparent' },
    axes: {
      facecolor: '#ffffff',
      edgecolor: '#333333',
      textcolor: '#333333',
      gridcolor: '#e0e0e0',
    },
    lines: {
      colors: COLORS.tableau,
      width: 2,
    },
    fonts: {
      sans: ['PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK', 'Inter', 'system-ui', 'sans-serif'],
      size: 12,
    },
  },

  dark: {
    name: 'dark',
    figure: { background: 'transparent' },
    axes: {
      facecolor: '#1a1a2e',
      edgecolor: '#e0e0e0',
      textcolor: '#e0e0e0',
      gridcolor: '#2d2d44',
    },
    lines: {
      colors: [...COLORS.tableau.slice(0, 1), ...COLORS.tableau.slice(2)],
      width: 2,
    },
    fonts: {
      sans: ['PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK', 'Inter', 'system-ui', 'sans-serif'],
      size: 12,
    },
  },

  editorial: {
    name: 'editorial',
    figure: { background: 'transparent' },
    axes: {
      facecolor: '#faf8f5',
      edgecolor: '#2c2c2c',
      textcolor: '#2c2c2c',
      gridcolor: '#e8e4df',
    },
    lines: {
      colors: ['#000000', '#666666', '#999999', '#cccccc'],
      width: 1.5,
    },
    fonts: {
      sans: ['Georgia', 'Times New Roman', 'serif'],
      size: 13,
    },
  },

  vintage: {
    name: 'vintage',
    figure: { background: 'transparent' },
    axes: {
      facecolor: '#f5e6d3',
      edgecolor: '#5c4a3d',
      textcolor: '#5c4a3d',
      gridcolor: '#e8d5c4',
    },
    lines: {
      colors: ['#8b4513', '#cd853f', '#d2691e', '#a0522d'],
      width: 2,
    },
    fonts: {
      sans: ['Garamond', 'Georgia', 'serif'],
      size: 12,
    },
  },

  neon: {
    name: 'neon',
    figure: { background: 'transparent' },
    axes: {
      facecolor: '#0a0a0f',
      edgecolor: '#00ffff',
      textcolor: '#ffffff',
      gridcolor: '#1a1a2a',
    },
    lines: {
      colors: ['#00ffff', '#ff00ff', '#00ff00', '#ffff00', '#ff6600'],
      width: 2.5,
    },
    fonts: {
      sans: ['Courier New', 'monospace'],
      size: 12,
    },
  },

  blueprint: {
    name: 'blueprint',
    figure: { background: 'transparent' },
    axes: {
      facecolor: '#1e3a5f',
      edgecolor: '#7cb9e8',
      textcolor: '#ffffff',
      gridcolor: '#2a4a6f',
    },
    lines: {
      colors: ['#7cb9e8', '#ffffff', '#ffd700', '#ff6b6b'],
      width: 1.5,
    },
    fonts: {
      sans: ['Courier New', 'monospace'],
      size: 11,
    },
  },
}

let currentTheme: Theme = THEMES.light as Theme

export function getTheme(): Theme {
  return currentTheme
}

export function setTheme(name: string): void {
  const theme = THEMES[name]
  if (theme) {
    currentTheme = theme
  } else {
    throw new Error(`Unknown theme: ${name}. Available: ${Object.keys(THEMES).join(', ')}`)
  }
}

export function withTheme<T>(name: string, fn: () => T): T {
  const prev = currentTheme
  currentTheme = THEMES[name] || prev
  try {
    return fn()
  } finally {
    currentTheme = prev
  }
}
