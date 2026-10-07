/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0B0F14',
        vignette: '#05070A',
        fg: {
          primary: '#E8EDF2',
          secondary: '#8A97A5',
          tertiary: '#55616D',
        },
        accent: {
          red: '#FF4D5E',
          mint: '#7BE3BD',
        },
      },
      fontFamily: {
        num: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
        cn: ['"Noto Sans SC"', '"HarmonyOS Sans SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
