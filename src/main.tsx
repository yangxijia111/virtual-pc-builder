import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'

// 入口：挂载应用根
const el = document.getElementById('root')
if (!el) throw new Error('缺少 #root 挂载点')
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
