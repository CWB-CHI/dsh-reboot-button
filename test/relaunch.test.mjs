// Exercises the shipped relaunch helper against a stand-in shell process.
//
// The helper is pointed at the real application executable; because the application
// is already running, the extra launch performs the single-instance handoff and
// exits, so this test never disturbs the live window.
//
//   node test/relaunch.test.mjs "C:\path\to\DeepSeek Harness.exe" "C:\path\to\DeepSeek Harness.exe"
//
// The second path is the helper runtime; the desktop Host uses process.execPath
// (the same application executable) with ELECTRON_RUN_AS_NODE=1.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const helperPath = fileURLToPath(new URL('../relaunch.mjs', import.meta.url))
const executable = process.argv[2]
const helperExecutable = process.argv[3] ?? process.execPath
if (executable === undefined) {
  console.error('usage: node test/relaunch.test.mjs <application executable> [helper runtime]')
  process.exit(2)
}

const shell = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1200)'], { stdio: 'ignore' })
const marker = join(tmpdir(), `dsh-reboot-helper-test-${String(Date.now())}.arm`)
const started = Date.now()

const helper = spawn(helperExecutable, [helperPath, String(shell.pid), executable, marker, '600'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
helper.unref()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let armedAt
for (let i = 0; i < 40; i++) {
  if (existsSync(marker)) {
    armedAt = Date.now() - started
    break
  }
  await sleep(50)
}

while (helper.exitCode === null) await sleep(100)

console.log(JSON.stringify({
  shellPid: shell.pid,
  armedAfterMs: armedAt ?? null,
  helperExitCode: helper.exitCode,
  helperLifetimeMs: Date.now() - started,
}, null, 2))
try {
  shell.kill('SIGKILL')
} catch {
  // The stand-in already exited.
}
