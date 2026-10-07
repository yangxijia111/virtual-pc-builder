// 一次性脚本：生成 src/data/devices.json 引用的全部 20×20 线性图标（stroke 1.5）
// 用法：node scripts/gen-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const icons = {
  keycap: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M6 16v2h8v-2"/>',
  switch: '<rect x="5" y="7" width="10" height="8" rx="1"/><path d="M10 3v4M8 3h4M8 13v2h4v-2"/>',
  plate: '<rect x="2" y="6" width="16" height="8" rx="1"/><path d="M5 6v8M9 6v8M13 6v8"/>',
  pcb: '<rect x="3" y="3" width="14" height="14" rx="1"/><circle cx="7" cy="7" r="1.2"/><path d="M7 10h6M7 13h4M13 13h2"/>',
  foam: '<rect x="3" y="7" width="14" height="6" rx="2"/><path d="M6 10h2M10 10h2M14 10h1" stroke-dasharray="1 2"/>',
  case: '<path d="M4 6h12v10H4z"/><path d="M4 9h12M7 6V4h6v2"/>',
  glass: '<rect x="4" y="3" width="12" height="14" rx="1"/><path d="M7 6l6 8M13 6l-6 8" opacity="0.5"/>',
  cooler: '<rect x="4" y="4" width="12" height="12" rx="1"/><circle cx="10" cy="10" r="3.5"/><path d="M10 6.5v-2M10 15.5v-2M6.5 10h-2M15.5 10h-2"/>',
  fan: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1.5"/><path d="M10 8.5c2-1 3-2.5 3-4M11.5 10c1 2 2.5 3 4 3M10 11.5c-2 1-3 2.5-3 4M8.5 10c-1-2-2.5-3-4-3"/>',
  pipe: '<path d="M5 17V7a3 3 0 013-3h0a3 3 0 013 3v6a3 3 0 003 3h0a3 3 0 003-3V3"/>',
  fins: '<path d="M3 5h14M3 8h14M3 11h14M3 14h14M3 17h14"/>',
  coldplate: '<rect x="4" y="8" width="12" height="6" rx="1"/><path d="M6 8V6h8v2"/>',
  ram: '<rect x="3" y="6" width="14" height="7" rx="1"/><path d="M3 15h2M6.5 15h2M10 15h2M13.5 15h2M3 9h14" opacity="0.6"/>',
  gpu: '<rect x="2" y="7" width="15" height="7" rx="1"/><circle cx="7" cy="10.5" r="2"/><circle cx="12.5" cy="10.5" r="2"/><path d="M4 14v2"/>',
  ssd: '<rect x="4" y="8" width="12" height="4" rx="1"/><path d="M4 12h3M9 12h7M6 8v4" opacity="0.6"/>',
  mobo: '<rect x="3" y="3" width="14" height="14" rx="1"/><rect x="6" y="6" width="4" height="3"/><rect x="12" y="6" width="2.5" height="5"/><path d="M6 12h4M6 14.5h3"/>',
  psu: '<rect x="3" y="5" width="14" height="10" rx="1"/><circle cx="8" cy="10" r="2.5"/><path d="M13 8v4M15 8v4"/>',
  chassis: '<path d="M5 3h10v14H5z"/><path d="M5 6h10M12 3v14" opacity="0.5"/>',
  panel: '<rect x="2" y="4" width="16" height="11" rx="1"/><path d="M7 18h6M10 15v3"/>',
  backlight: '<rect x="2" y="5" width="16" height="10" rx="1"/><path d="M5 8h10M5 11h7" opacity="0.4"/><path d="M4 13l2-2M8 13l2-2M12 13l2-2"/>',
  driver: '<rect x="4" y="5" width="12" height="10" rx="1"/><path d="M7 8h6M7 11h4M12 12h2"/>',
  power: '<path d="M11 2L5 11h4l-1 7 6-9h-4z"/>',
  shell: '<path d="M3 6c0-1.5 1-3 3-3h8c2 0 3 1.5 3 3v8c0 1.5-1 3-3 3H6c-2 0-3-1.5-3-3z"/><path d="M6 6h8v6H6z" opacity="0.5"/>',
  stand: '<path d="M10 4v8M6 16c0-2.5 1.8-4 4-4s4 1.5 4 4M4 18h12"/>',
  'mouse-shell': '<path d="M6 5c0-1.5 1.5-2.5 4-2.5S14 3.5 14 5v8c0 2-1.5 4-4 4s-4-2-4-4z"/><path d="M10 3v6"/>',
  micro: '<rect x="6" y="6" width="8" height="9" rx="1"/><path d="M10 6V4"/><circle cx="10" cy="10" r="1" fill="currentColor"/>',
  wheel: '<ellipse cx="10" cy="10" rx="3.5" ry="6.5"/><path d="M6.5 8h7M6.5 12h7"/>',
  'mouse-pcb': '<rect x="5" y="4" width="10" height="12" rx="1"/><circle cx="10" cy="9" r="2"/><path d="M7 14h2M11 14h2"/>',
  battery: '<rect x="5" y="5" width="10" height="12" rx="1"/><path d="M8 3h4"/><path d="M10 8v4M8.5 9.5L10 8l1.5 1.5"/>',
  feet: '<ellipse cx="7" cy="12" rx="3" ry="1.8"/><ellipse cx="13.5" cy="12" rx="3" ry="1.8"/>',
  cpu: '<rect x="5" y="5" width="10" height="10" rx="1"/><rect x="8" y="8" width="4" height="4" opacity="0.5"/><path d="M9 5V2.5M11 5V2.5M9 17.5V15M11 17.5V15M5 9H2.5M5 11H2.5M17.5 9H15M17.5 11H15"/>',
  ihs: '<rect x="4" y="5" width="12" height="10" rx="1.5"/><path d="M7 8.5h6M7 11.5h4" opacity="0.5"/><path d="M4 8h12M8 5v10" opacity="0.25"/>',
  die: '<rect x="4" y="5" width="5" height="6" rx="0.5"/><rect x="11" y="9" width="5" height="6" rx="0.5" opacity="0.6"/>',
  substrate: '<rect x="4" y="4" width="12" height="12" rx="1"/><path d="M6.5 4V2.5M10 4V2.5M13.5 4V2.5M6.5 17.5V16M10 17.5V16M13.5 17.5V16"/><circle cx="7.5" cy="9" r="1" opacity="0.5"/><path d="M7.5 12.5h5" opacity="0.5"/>',
  pins: '<path d="M5 6h10M5 9.5h10M5 13h10" stroke-dasharray="1.4 1.5"/>',
  cable: '<path d="M3 16c2.5-5.5 4.5-5.5 7 0 1.8 3.6 3.6 2.8 5-1.5"/><rect x="14.5" y="3" width="3.5" height="5" rx="0.8"/><path d="M16.25 8v2.5"/>',
}

mkdirSync(new URL('../public/assets/icons/', import.meta.url), { recursive: true })
for (const [name, body] of Object.entries(icons)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#8A97A5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">\n  ${body}\n</svg>\n`
  writeFileSync(new URL(`../public/assets/icons/${name}.svg`, import.meta.url), svg)
}
console.log(`生成 ${Object.keys(icons).length} 个图标`)
