/**
 * Host half of the restart-button bundle.
 *
 * The browser cannot restart the application: the window's close button is
 * intercepted by the desktop shell (it hides to the tray instead of quitting), and
 * only a Node process can start a replacement executable. So this half owns the
 * whole operation behind one POST from the Settings button.
 *
 * Restart protocol:
 * 1. The Host refuses while a session or a background job is still working, the
 *    same guard the shell applies to its own quit path.
 * 2. A detached helper starts, arms itself by writing a marker file, and only then
 *    waits for the shell process to disappear.
 * 3. The Host answers the request, then terminates the shell process it runs under.
 * 4. The helper sees the shell exit, waits for the old Host to finish shutting
 *    down, and starts the same executable again.
 *
 * The helper runs under the application's own Electron binary in Node mode, so it
 * needs no external runtime and survives the death of the process that spawned it.
 * A shell that never exits leaves the helper to time out and start nothing.
 */

import { spawn } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Exact path the Client half posts to. */
const ROUTE_PATH = '/dsh-reboot/restart'

/** Delay after the helper confirms readiness before the shell is stopped. */
const RESPONSE_GRACE_MS = 350

/** Delay between the observed shell exit and the new launch, so the old Host can finish. */
const HANDOVER_MS = 1500

/** How long the Host waits for the helper's arm marker. */
const ARM_TIMEOUT_MS = 5000

/** Upper bound of one helper's lifetime: its wait loop plus the handover delay. */
const HELP_LIFETIME_MS = 61000

/** Helper module carried by this package. */
const HELPER_PATH = fileURLToPath(new URL('./relaunch.mjs', import.meta.url))

/**
 * Host plugin entry.
 * @param ctx - Profile context owning the web server.
 */
export function apply(ctx) {
  let armed = false
  let disarm = null

  const answer = (response, status, body) => {
    if (response.headersSent) return
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end(JSON.stringify(body))
  }

  /**
   * Reject requests a page outside this application could have sent.
   * The desktop shell strips `origin` when it forwards, so a missing header is the
   * desktop path and an equal-origin header is the browser path.
   * @param request - Incoming request.
   * @returns true when the request may trigger a restart.
   */
  const trusted = (request) => {
    const origin = request.headers.origin
    if (origin === undefined) return true
    if (origin === 'dsh-app://app') return true
    const host = request.headers.host
    if (typeof host !== 'string' || host === '') return false
    return origin === `http://${host}` || origin === `https://${host}`
  }

  const handler = (request, response) => {
    if (request.method !== 'POST') {
      answer(response, 405, { ok: false, code: 'method', message: 'POST only' })
      return
    }
    if (!trusted(request)) {
      answer(response, 403, { ok: false, code: 'origin', message: 'rejected origin' })
      return
    }
    if (armed) {
      answer(response, 409, { ok: false, code: 'pending', message: 'restart already prepared' })
      return
    }
    const plan = planRelaunch()
    if (plan.ok === false) {
      answer(response, 200, plan)
      return
    }
    const busy = busyReason(ctx)
    if (busy !== undefined) {
      answer(response, 200, { ok: false, code: 'busy', message: `still working: ${busy}` })
      return
    }

    const probe = new URL(request.url ?? '/', 'http://localhost').searchParams.get('probe') === '1'
    armed = true
    if (disarm !== null) clearTimeout(disarm)
    disarm = setTimeout(() => {
      armed = false
      disarm = null
    }, ARM_TIMEOUT_MS + HELP_LIFETIME_MS)
    plan.arm().then((result) => {
      if (result.ok === false) {
        armed = false
        answer(response, 200, result)
        return
      }
      answer(response, 200, probe
        ? { ok: true, platform: process.platform, probe: true }
        : { ok: true, platform: process.platform })
      if (probe) return
      setTimeout(() => {
        try {
          process.kill(plan.shellPid, 'SIGTERM')
        } catch (error) {
          const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-reboot-button') : console
          logger.warn(error)
        }
      }, RESPONSE_GRACE_MS)
    }, (error) => {
      armed = false
      const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-reboot-button') : console
      logger.warn(error)
      answer(response, 500, {
        ok: false,
        code: 'launch-failed',
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }

  ctx.effect(() => () => {
    if (disarm !== null) clearTimeout(disarm)
  })

  ctx.inject(['webServer'], (serverCtx) => {
    serverCtx.effect(() => serverCtx.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler,
    }))
  })
}

/**
 * Report what would be interrupted by a restart.
 * @param ctx - Profile context exposing the live agent and job registries.
 * @returns A short reason, or undefined when the process is idle.
 */
function busyReason(ctx) {
  const agents = ctx.get('agents')
  const jobs = ctx.get('jobs')
  const live = agents === undefined ? [] : agents.list()
  const runningAgent = live.find((agent) => agent.status === 'running'
    || agent.inbox.nextTurn.length > 0
    || agent.inbox.nextStep.length > 0)
  if (runningAgent !== undefined) return 'session'
  if (jobs === undefined) return undefined
  const busyJob = [undefined, ...live].some((agent) => jobs.list(agent?.id)
    .some((job) => job.status === 'running' || job.status === 'stopping'))
  return busyJob ? 'job' : undefined
}

/**
 * Decide whether this process can relaunch the application, and how.
 * @returns A refusal for an unsupported surface, or a launcher bound to the shell.
 */
function planRelaunch() {
  if (process.versions.electron === undefined) {
    return {
      ok: false,
      code: 'not-desktop',
      message: 'Automatic restart is available only in the desktop application.',
    }
  }
  const shellPid = process.ppid
  if (!Number.isInteger(shellPid) || shellPid <= 0) {
    return { ok: false, code: 'unknown-shell', message: 'The shell process is unknown.' }
  }
  const executable = process.execPath
  if (typeof executable !== 'string' || executable === '' || !existsSync(executable)) {
    return { ok: false, code: 'missing-executable', message: 'The application executable is not reachable.' }
  }
  const marker = join(tmpdir(), `dsh-reboot-${String(process.pid)}-${randomUUID()}.arm`)
  return {
    ok: true,
    shellPid,
    async arm() {
      const child = spawn(process.execPath, [
        HELPER_PATH,
        String(shellPid),
        executable,
        marker,
        String(HANDOVER_MS),
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      })
      child.unref()
      const deadline = Date.now() + ARM_TIMEOUT_MS
      while (Date.now() < deadline) {
        if (existsSync(marker)) break
        await new Promise((resolve) => {
          setTimeout(resolve, 100)
        })
      }
      const ready = existsSync(marker)
      try {
        unlinkSync(marker)
      } catch {
        // The marker is a temporary handshake file; a failed cleanup is harmless.
      }
      if (!ready) {
        try {
          child.kill('SIGKILL')
        } catch {
          // The helper already exited on its own.
        }
        return { ok: false, code: 'helper-failed', message: 'The relaunch helper did not start.' }
      }
      return { ok: true }
    },
  }
}
