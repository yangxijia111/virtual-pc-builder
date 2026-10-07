import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：React + three 依赖预构建
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    watch: {
      ignored: ['**/shots/**', '**/dist/**', '**/scripts/**'],
    },
  },
  build: {
    // three 生态 chunk 本身就大于默认阈值（three ~0.7MB），放宽到 1MB 抑制噪音
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // 依赖分包：框架 / three 生态 / 后处理各自独立，业务改动不再打穿 vendor 缓存，
        // 且各 chunk 可并行下载（注意匹配顺序：postprocessing 需先于 three 判定）
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          // 匹配顺序即优先级：postprocessing（@react-three/postprocessing 两者皆含）→
          // three 生态（含 @react-three/*、three-stdlib、drei 的 @monogrid/gainmap-js、maath）→
          // react 生态（R3F/zustand/drei 的小型依赖，归 react 避免 vendor↔react/three 循环）
          if (id.includes('postprocessing')) return 'fx'
          if (/(three|maath|monogrid|gainmap)/.test(id)) return 'three'
          if (/(react|scheduler|zustand|its-fine|suspend-react|use-sync-external-store)/.test(id)) return 'react'
          return 'vendor'
        },
      },
    },
  },
})
