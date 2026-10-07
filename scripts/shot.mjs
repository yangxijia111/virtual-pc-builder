/**
 * CDP 验收工具：headless Chrome 真实时间截图 + console 捕获 + 页面脚本执行。
 * 用法：node scripts/shot.mjs <名称> [等待毫秒] [页面JS]
 * 产物：shots/<名称>.png + console 汇总输出
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

// Chrome 可执行文件路径：默认取 Windows 标准安装位置，可用环境变量 CHROME_PATH 覆盖
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const name = process.argv[2] ?? 'shot'
const waitMs = Number(process.argv[3] ?? 6000)
const pageJs = process.argv[4] ?? ''

// profile 放系统临时目录：项目内会让 vite watcher 监听 Chrome 锁定文件而崩溃（EBUSY）
const userDataDir = resolve(tmpdir(), 'vpc-chrome-profile-' + name)
if (existsSync(userDataDir)) rmSync(userDataDir, { recursive: true, force: true })
mkdirSync('shots', { recursive: true })

// 清理残留实例：端口被上一个进程树占用会让本轮拿到旧页面
function killByPort() {
  return new Promise((resolveP) => {
    const p = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'remote-debugging-port=${PORT}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; 'done'`,
    ], { stdio: 'ignore' })
    p.on('exit', () => resolveP())
    setTimeout(resolveP, 4000)
  })
}
await killByPort()

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=1600,900',
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch { /* 等待端口就绪 */ }
    await sleep(250)
  }
  throw new Error('CDP 端口未就绪')
}

const target = await getTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })

let msgId = 0
const pending = new Map()
const consoleLines = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
    consoleLines.push(`[${msg.params.type}] ${text}`)
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    consoleLines.push(`[EXCEPTION] ${d.text} ${d.exception?.description ?? ''}`)
  }
}
const send = (method, params = {}) => new Promise((resolveP) => {
  const id = ++msgId
  pending.set(id, resolveP)
  ws.send(JSON.stringify({ id, method, params }))
})

await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await sleep(waitMs)

if (pageJs) {
  const r = await send('Runtime.evaluate', { expression: pageJs, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) consoleLines.push('[EVAL-ERR] ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  else consoleLines.push('[EVAL] ' + JSON.stringify(r.result?.result?.value ?? null))
  await sleep(Number(process.env.SHOT_AFTER_MS ?? 5000))
}

const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(resolve(`shots/${name}.png`), Buffer.from(shot.result.data, 'base64'))
console.log(`已写出 shots/${name}.png`)
const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
if (title.result?.result?.value && String(title.result.result.value) !== 'Virtual PC Builder · 计算机硬件拆解与组装交互实验室') {
  console.log('—— title ——\n' + title.result.result.value)
}
if (consoleLines.length) console.log('—— console ——\n' + consoleLines.slice(-14).join('\n'))
ws.close()
// 杀整个进程树（chrome.kill 只杀启动器，renderer 会残留并占用调试端口）
const treeKill = spawn('taskkill', ['/PID', String(chrome.pid), '/F', '/T'], { stdio: 'ignore' })
treeKill.on('exit', () => process.exit(0))
setTimeout(() => process.exit(0), 3000)
