/**
 * Detached relaunch helper for the restart button.
 *
 * Runs under the application's own Electron binary in Node mode, so it needs no
 * external runtime and survives the death of the Host that spawned it. It arms
 * itself first (the Host waits for that marker before stopping the shell), waits for
 * the shell process to disappear, then starts the same executable again.
 *
 * A shell that never exits leaves this helper to time out and start nothing.
 */

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

/** Polling slice while waiting for the shell to exit. */
const POLL_MS = 200

/** Poll slices before giving up: 300 x 200 ms = 60 s. */
const STEPS = 300

const [shellPidArg, executable, marker, handoverArg] = process.argv.slice(2)
const shellPid = Number(shellPidArg)
const handoverMs = Number(handoverArg)

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

try {
  writeFileSync(marker, 'armed')
} catch {
  // Without the marker the Host refuses to stop the shell, so a failure here is safe.
  process.exit(1)
}

const shellAlive = () => {
  try {
    process.kill(shellPid, 0)
    return true
  } catch {
    return false
  }
}

for (let step = 0; step < STEPS; step++) {
  if (!shellAlive()) break
  await sleep(POLL_MS)
}

if (shellAlive()) process.exit(0)

await sleep(Number.isFinite(handoverMs) && handoverMs > 0 ? handoverMs : 1500)

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_NO_ATTACH_CONSOLE

for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const child = spawn(executable, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: environment,
    })
    child.unref()
    break
  } catch {
    await sleep(2000)
  }
}
