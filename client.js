/**
 * Client half of the restart-button bundle.
 *
 * One button in the Settings header, beside the shipped "open configuration file"
 * action. It shares the restart protocol with the Host half: the Host arms a
 * detached relauncher, this half closes the window so the shell can quit cleanly,
 * and the relauncher starts the application again.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-reboot-button',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-reboot-button'

    /** Host route that arms the relauncher. */
    const ENDPOINT = '/dsh-reboot/restart'

    /** How long the "click again" state waits before returning to idle. */
    const CONFIRM_MS = 5000

    /** How long a refusal or failure note stays on the button. */
    const NOTE_MS = 4200

    /** How long the "restarting" state waits before assuming the restart did not start. */
    const PENDING_MS = 8000

    const DICT = {
      en: {
        action: 'Restart',
        confirm: 'Click again',
        working: 'Restarting…',
        busy: 'Task running',
        unsupported: 'Desktop only',
        failed: 'Restart failed',
        hint: 'Restart DeepSeek Harness',
        confirmHint: 'The window closes and the application starts again. Click once more to restart.',
        workingHint: 'Waiting for the application to close.',
        busyHint: 'A task is still running. Restart after it finishes.',
        unsupportedHint: 'Automatic restart is available only in the desktop application.',
        failedHint: 'The restart could not be prepared. Try again.',
      },
      zh: {
        action: '重启',
        confirm: '确认重启',
        working: '正在重启…',
        busy: '有任务运行中',
        unsupported: '仅桌面版',
        failed: '重启失败',
        hint: '重启 DeepSeek Harness',
        confirmHint: '窗口会关闭，应用随后自动重新启动。再点一次确认。',
        workingHint: '正在等待应用关闭。',
        busyHint: '当前仍有任务在运行，结束后再重启。',
        unsupportedHint: '自动重启只在桌面应用中可用。',
        failedHint: '未能准备重启，请重试。',
      },
    }

    /** Failure codes that mean "this surface cannot restart", not "this attempt failed". */
    const UNSUPPORTED_CODES = new Set(['not-desktop'])

    // Matches the shipped settings-header action: the primitives Button with
    // variant="outline" and size="sm" (28px tall, 12px text, 8px radius, hairline
    // border, transparent fill). Only the tone overrides differ, and they only
    // recolor text and border for the confirm and failure states.
    const STYLE = `
.dsh-reboot-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: .5px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12));
  border-radius: var(--dsw-radius-sm, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.dsh-reboot-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06)); }
.dsh-reboot-button:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active, rgba(38, 49, 72, 0.1)); }
.dsh-reboot-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-reboot-button:disabled { cursor: not-allowed; opacity: 0.4; }
.dsh-reboot-button[data-tone='confirm'] {
  color: var(--dsw-alias-state-error-primary);
  border-color: var(--dsw-alias-state-error-primary);
}
.dsh-reboot-button[data-tone='muted'] { color: var(--dsw-alias-label-secondary); }
.dsh-reboot-button[data-tone='warn'] { color: var(--dsw-alias-state-warn-primary); }
.dsh-reboot-button .dsh-reboot-glyph { flex: none; display: block; }
`

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        /**
         * Read one localized label, falling back to English when the locale service is absent.
         * @param key - Dictionary key.
         * @returns The visible text.
         */
        const text = (key) => {
          const locale = ctx.locale
          if (locale !== undefined && locale !== null && typeof locale.bind === 'function') {
            const value = locale.bind(NS)(key)
            if (typeof value === 'string' && value !== key) return value
          }
          const fallback = DICT.en[key]
          return fallback === undefined ? key : fallback
        }

        ctx.effect(() => ctx.locale.register(NS, DICT))

        /**
         * Render the restart action.
         * @returns The Settings-header button.
         */
        function RestartButton() {
          const [phase, setPhase] = React.useState('idle')
          const [note, setNote] = React.useState(null)
          const [, setRevision] = React.useState(0)
          const timer = React.useRef(null)

          React.useEffect(() => ctx.locale.subscribe(() => setRevision((value) => value + 1)), [])

          React.useEffect(() => () => {
            if (timer.current !== null) clearTimeout(timer.current)
          }, [])

          const schedule = (delay, run) => {
            if (timer.current !== null) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
              timer.current = null
              run()
            }, delay)
          }

          const cancelScheduled = () => {
            if (timer.current === null) return
            clearTimeout(timer.current)
            timer.current = null
          }

          const restart = async () => {
            setPhase('working')
            schedule(PENDING_MS, () => setPhase('idle'))
            let payload = null
            try {
              const response = await fetch(ENDPOINT, { method: 'POST', cache: 'no-store' })
              payload = await response.json()
            } catch {
              payload = null
            }
            if (payload !== null && typeof payload === 'object' && payload.ok === true) {
              return
            }
            const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : 'failed'
            setPhase('idle')
            setNote(code === 'busy' || code === 'pending' ? 'busy' : UNSUPPORTED_CODES.has(code) ? 'unsupported' : 'failed')
            schedule(NOTE_MS, () => setNote(null))
          }

          const onClick = () => {
            if (phase === 'working') return
            if (note !== null) {
              cancelScheduled()
              setNote(null)
              return
            }
            if (phase === 'idle') {
              setPhase('confirm')
              schedule(CONFIRM_MS, () => setPhase('idle'))
              return
            }
            cancelScheduled()
            restart().catch(() => {
              setPhase('idle')
              setNote('failed')
              schedule(NOTE_MS, () => setNote(null))
            })
          }

          let key = 'action'
          let tone = 'default'
          if (note === 'busy') {
            key = 'busy'
            tone = 'warn'
          } else if (note === 'unsupported') {
            key = 'unsupported'
            tone = 'muted'
          } else if (note === 'failed') {
            key = 'failed'
            tone = 'warn'
          } else if (phase === 'confirm') {
            key = 'confirm'
            tone = 'confirm'
          } else if (phase === 'working') {
            key = 'working'
            tone = 'muted'
          }
          const hintKey = note !== null
            ? `${note}Hint`
            : phase === 'confirm'
              ? 'confirmHint'
              : phase === 'working'
                ? 'workingHint'
                : 'hint'
          const label = text(key)

          return h(
            React.Fragment,
            null,
            h('style', { key: 'style' }, STYLE),
            h(
              'button',
              {
                key: 'button',
                type: 'button',
                className: 'dsh-reboot-button',
                'data-tone': tone,
                title: text(hintKey),
                'aria-label': label,
                disabled: phase === 'working',
                onClick,
              },
              h(
                'svg',
                {
                  className: 'dsh-reboot-glyph',
                  viewBox: '0 0 16 16',
                  width: 14,
                  height: 14,
                  'aria-hidden': true,
                  focusable: false,
                },
                h('path', {
                  d: 'M14 8a6 6 0 1 1-6-6c1.68 0 3.29.67 4.49 1.83L14 5.33',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.6,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }),
                h('path', {
                  d: 'M14 2v3.33h-3.33',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 1.6,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                }),
              ),
              h('span', null, label),
            ),
          )
        }

        ctx.slots.inject('settings.action', () => ctx.slots.register({
          name: 'settings.action',
          id: 'dsh-reboot-button',
          order: -10,
          label: () => text('action'),
        }, RestartButton))
      },
    }
  },
})
