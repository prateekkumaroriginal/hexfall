import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine } from './game/engine';
import type { Settings } from './settings';
import { parseSettings } from './settings';
import { ORC, PLAYER, SLIME, STAFF, WAVES } from './config/gameplay';
import { QUALITY_OPTIONS, QUALITY_PRESETS } from './config/rendering';
import {
  FIELD_OF_VIEW_SETTINGS,
  RENDER_SCALE_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SENSITIVITY_SETTINGS,
} from './config/settings';
import { StatusCheck } from './StatusCheck';
import type { Snapshot } from './game/simulation';
import { Button } from './components/ui/button';
import { PanelContent, PanelOverlay, PanelTitle } from './components/ui/panel';
import { cn } from './lib/utils';

const initial: Snapshot = {
  phase: 'ready',
  hp: PLAYER.MAX_HEALTH,
  wave: 0,
  kills: 0,
  score: 0,
  time: 0,
  alive: 0,
  remaining: 0,
  hit: 0,
  hurt: 0,
  waveWait: 0,
};
function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}
const formatTime = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(n % 60)
    .toString()
    .padStart(2, '0')}`;

export default function App() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [settings, setSettings] = useState(loadSettings);
  const initialSettings = useRef(settings);
  const [panel, setPanel] = useState<'none' | 'settings' | 'guide' | 'status'>('none');
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [perf, setPerf] = useState({ fps: 0, calls: 0 });
  useEffect(() => {
    if (panel === 'none') return;
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel('none');
        return;
      }
      if (event.key !== 'Tab') return;
      const items = document.querySelectorAll<HTMLElement>(
        '[role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea',
      );
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, [panel]);
  const updatePerformance = useCallback(
    (fps: number, calls: number) => setPerf({ fps, calls }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    const onError = (event: Event) => setError((event as CustomEvent<string>).detail);
    element.addEventListener('engine-error', onError);
    import('./game/engine')
      .then(({ Engine }) => {
        if (cancelled) return;
        try {
          engine.current = new Engine(
            element,
            setSnapshot,
            updatePerformance,
            initialSettings.current,
          );
          setReady(true);
        } catch {
          setError(
            'The arena could not start. This game needs a desktop browser with WebGL 2 and hardware acceleration enabled.',
          );
        }
      })
      .catch(() => {
        if (!cancelled)
          setError('The game could not load. Check your connection and reload the page.');
      });
    return () => {
      cancelled = true;
      element.removeEventListener('engine-error', onError);
      engine.current?.dispose();
      engine.current = null;
    };
  }, [updatePerformance]);
  useEffect(() => {
    engine.current?.updateSettings(settings);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* Private browsers may disable storage. */
    }
  }, [settings]);
  const start = async () => {
    setError('');
    setPanel('none');
    try {
      await engine.current?.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not capture the mouse. Try again.');
    }
  };
  const playing = snapshot.phase === 'playing';
  const ended = snapshot.phase === 'dead' || snapshot.phase === 'won';
  const menu = snapshot.phase === 'ready';
  return (
    <main className="relative h-dvh overflow-hidden">
      <div
        className={
          'absolute inset-0 size-full' +
          ' bg-[radial-gradient(ellipse_at_70%_40%,#687258,#17251e)] [&_canvas]:absolute' +
          ' [&_canvas]:inset-0 [&_canvas]:block [&_canvas]:size-full'
        }
        ref={host}
      />
      <div
        className="vignette pointer-events-none absolute inset-0 size-full"
        data-playing={playing}
      />
      {snapshot.hurt > 0 && playing ? (
        <div
          className="pointer-events-none absolute inset-0 z-2 size-full shadow-[inset_0_0_180px_45px_#b43222]"
          style={{ opacity: snapshot.hurt * 2 }}
        />
      ) : null}

      {menu && panel === 'none' ? (
        <section
          className={
            'absolute top-[22%] left-[8.5%] z-2 min-[1600px]:top-[23%] medium:top-[23%]' +
            ' medium:left-[6%] compact:top-[145px] compact:right-[7%] compact:left-[7%]'
          }
        >
          <h1
            className={
              'mt-[25px] mr-0 mb-10 ml-0 font-title text-[clamp(70px,7.6vw,124px)]' +
              ' leading-[.94] font-semibold tracking-[-1px] medium:text-[88px]' +
              ' compact:text-[76px]'
            }
          >
            HEXFALL
          </h1>
          <Button
            className="w-[320px] min-[1600px]:min-h-[60px] min-[1600px]:w-[360px] compact:max-w-full"
            onClick={start}
            disabled={!ready}
          >
            {ready ? 'PLAY' : 'LOADING'}
          </Button>
          <Button variant="menu" onClick={() => setPanel('settings')} aria-label="Open settings">
            SETTINGS
          </Button>
          <Button variant="link" className="mt-4 block" onClick={() => setPanel('status')}>
            Status check
          </Button>
        </section>
      ) : null}

      {playing ? (
        <>
          <div
            className={
              'wave-hud absolute top-7 left-[4.5%] flex flex-col gap-2 text-[13px]' +
              ' tracking-[1px] text-[#dde6d0]'
            }
          >
            Wave {snapshot.wave || 1} / {WAVES.TOTAL}
          </div>
          <div
            className={cn(
              'pointer-events-none absolute top-1/2 left-1/2 size-5' +
                ' [transform:translate(-50%,-50%)] [&_span]:absolute [&_span]:bg-[#efffd8]' +
                ' [&_span]:shadow-[0_0_2px_#000]',
              snapshot.hit > 0 &&
                '[transform:translate(-50%,-50%)_rotate(45deg)_scale(1.5)] [&_span]:bg-white',
            )}
          >
            <span className="left-[9px] h-[5px] w-[2px]" />
            <span className="bottom-0 left-[9px] h-[5px] w-[2px]" />
            <span className="top-[9px] left-0 h-[2px] w-[5px]" />
            <span className="top-[9px] right-0 h-[2px] w-[5px]" />
          </div>
          {snapshot.alive === 0 && snapshot.remaining === 0 ? (
            <div className="pointer-events-none absolute top-[27%] left-1/2 [transform:translateX(-50%)] text-center">
              <h2 className="my-3 font-display text-[45px] font-medium">
                {snapshot.wave === 0 ? 'Get ready' : 'Wave cleared'}
              </h2>
              <p className="text-[11px] tracking-[1px]">
                {snapshot.wave === WAVES.TOTAL
                  ? `All ${WAVES.TOTAL} waves complete.`
                  : `Next wave in ${Math.ceil(snapshot.waveWait)}`}
              </p>
            </div>
          ) : null}
          <div
            className={
              'pointer-events-none absolute right-[4.5%] bottom-[38px] left-[4.5%] flex' +
              ' items-end justify-between gap-5 compact:right-[5%] compact:left-[5%]'
            }
          >
            <div className="w-40" aria-label={`Health ${snapshot.hp} out of ${PLAYER.MAX_HEALTH}`}>
              <div className="flex items-center gap-[10px]">
                <span className="text-[9px] tracking-[1.7px] compact:text-[7px]">HP</span>
                <strong className="ml-auto font-display text-[24px] font-medium">
                  {snapshot.hp}
                </strong>
              </div>
              <div className="my-[10px] h-[5px] bg-[#10201399]">
                <i
                  className="block h-full bg-[#c6d89d] [transition:width_.1s]"
                  style={{ width: `${(snapshot.hp / PLAYER.MAX_HEALTH) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}

      {!menu && !playing && panel === 'none' ? (
        <PanelOverlay>
          <PanelContent className="text-center">
            <PanelTitle>
              {ended ? (snapshot.phase === 'won' ? 'You won' : 'Game over') : 'Paused'}
            </PanelTitle>
            {ended ? (
              <div
                className={
                  'my-[30px] flex justify-around [&>div]:flex [&>div]:flex-col [&>div]:gap-[9px]' +
                  ' [&_strong]:font-display [&_strong]:text-[31px] [&_strong]:font-medium' +
                  ' [&_span]:text-[8px] [&_span]:tracking-[1.5px] [&_span]:text-[#a9b79d]'
                }
              >
                <div>
                  <strong>{snapshot.score.toLocaleString()}</strong>
                  <span>SCORE</span>
                </div>
                <div>
                  <strong>{snapshot.kills}</strong>
                  <span>KILLS</span>
                </div>
                <div>
                  <strong>{formatTime(snapshot.time)}</strong>
                  <span>SURVIVED</span>
                </div>
              </div>
            ) : null}
            <Button className="mt-7" onClick={start}>
              {ended ? 'PLAY AGAIN' : 'RESUME'}
            </Button>
            <Button variant="secondary" onClick={() => setPanel('settings')}>
              SETTINGS
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                engine.current?.exitToMenu();
                setPanel('none');
                setError('');
              }}
            >
              EXIT TO MENU
            </Button>
            <Button variant="link" className="mx-3" onClick={() => setPanel('status')}>
              Status check
            </Button>
            <Button variant="link" className="mx-3" onClick={() => setPanel('guide')}>
              Controls
            </Button>
          </PanelContent>
        </PanelOverlay>
      ) : null}

      {panel !== 'none' ? (
        <PanelOverlay className="has-[.status-scrollbar]:overflow-hidden">
          <PanelContent
            className={cn(
              'has-[.status-scrollbar]:m-auto has-[.status-scrollbar]:flex' +
                ' has-[.status-scrollbar]:max-h-full has-[.status-scrollbar]:flex-col',
              panel === 'settings' && 'box-border max-h-full overflow-y-auto',
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
          >
            <button
              className="absolute top-[10px] right-[17px] border-0 bg-transparent text-[29px] text-[#b4c3a6]"
              onClick={() => setPanel('none')}
              aria-label="Close panel"
              autoFocus
            >
              ×
            </button>
            <PanelTitle id="panel-title" className={panel === 'status' ? 'shrink-0' : undefined}>
              {panel === 'settings' ? 'Settings' : panel === 'status' ? 'Status check' : 'Controls'}
            </PanelTitle>
            {panel === 'settings' ? (
              <div className="mt-8">
                <fieldset className="mx-0 my-[22px] border-0 p-0">
                  <legend className="mb-3 p-0 text-[13px]">Render quality</legend>
                  <div className="flex gap-2">
                    {QUALITY_OPTIONS.map((quality) => (
                      <Button
                        variant="quality"
                        key={quality}
                        type="button"
                        aria-pressed={settings.quality === quality}
                        onClick={() => setSettings((s) => ({ ...s, quality }))}
                      >
                        {QUALITY_PRESETS[quality].LABEL}
                      </Button>
                    ))}
                  </div>
                </fieldset>
                <fieldset
                  className="mx-0 my-[22px] border-0 p-0"
                  aria-describedby="render-scale-description"
                >
                  <legend className="mb-3 p-0 text-[13px]">
                    {RENDER_SCALE_SETTINGS.LABELS.NAME}
                  </legend>
                  <div className="flex gap-2">
                    {RENDER_SCALE_SETTINGS.OPTIONS.map(({ VALUE: value, LABEL: label }) => (
                      <Button
                        variant="quality"
                        key={value}
                        type="button"
                        aria-pressed={settings.renderScale === value}
                        onClick={() => setSettings((s) => ({ ...s, renderScale: value }))}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <p id="render-scale-description">{RENDER_SCALE_SETTINGS.LABELS.DESCRIPTION}</p>
                </fieldset>
                <label className="mt-[22px] block text-[13px]">
                  Field of view{' '}
                  <span className="float-right text-primary">{settings.fieldOfView}°</span>
                  <input
                    className="mx-0 my-5 block w-full accent-primary"
                    type="range"
                    min={FIELD_OF_VIEW_SETTINGS.MIN}
                    max={FIELD_OF_VIEW_SETTINGS.MAX}
                    step={FIELD_OF_VIEW_SETTINGS.STEP}
                    value={settings.fieldOfView}
                    aria-describedby="field-of-view-description"
                    onChange={(e) => {
                      const fieldOfView = Number(e.target.value);
                      setSettings((s) => ({ ...s, fieldOfView }));
                    }}
                  />
                </label>
                <p id="field-of-view-description">
                  Lower values reduce stretching at the edges. Higher values show more of the arena.
                </p>
                <label className="mt-[22px] block text-[13px]">
                  Mouse sensitivity{' '}
                  <span className="float-right text-primary">
                    {settings.sensitivity.toFixed(1)}×
                  </span>
                  <input
                    className="mx-0 my-5 block w-full accent-primary"
                    type="range"
                    min={SENSITIVITY_SETTINGS.MIN}
                    max={SENSITIVITY_SETTINGS.MAX}
                    step={SENSITIVITY_SETTINGS.STEP}
                    value={settings.sensitivity}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, sensitivity: Number(e.target.value) }))
                    }
                  />
                </label>
                <label
                  className={
                    'mt-[22px] flex items-center justify-between border-0 border-t border-solid' +
                    ' border-[#c4d29b20] pt-5 text-[13px]'
                  }
                >
                  Spell audio
                  <input
                    className="size-[18px] accent-primary"
                    type="checkbox"
                    checked={settings.sound}
                    onChange={(e) => setSettings((s) => ({ ...s, sound: e.target.checked }))}
                  />
                </label>
              </div>
            ) : panel === 'status' ? (
              <StatusCheck engine={engine.current} />
            ) : (
              <>
                <p>Survive {WAVES.TOTAL} waves.</p>
                <div className="my-[25px] grid gap-[15px]">
                  {[
                    ['W A S D', 'Move through the arena'],
                    ['MOUSE', 'Look around'],
                    ['CLICK / LEFT CTRL', 'Hold to cast'],
                    ['ESC / P', 'Pause'],
                  ].map(([key, text]) => (
                    <div
                      className="flex items-center gap-[14px] text-[11px] text-[#c7d0ba] compact:text-[10px]"
                      key={key}
                    >
                      <kbd
                        className={
                          'min-w-24 rounded-[2px] border border-[#c9d3b23b] bg-[#10221938] px-[7px]' +
                          ' py-[5px] text-center font-sans text-[8px] tracking-[1px] text-[#cdd5bd]'
                        }
                      >
                        {key}
                      </kbd>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
                <p className="border-0 border-l-2 border-solid border-[#bfcd94] bg-[#263429] p-[15px]">
                  Slimes and orcs attack in melee. Orcs take {Math.ceil(ORC.HEALTH / STAFF.DAMAGE)}{' '}
                  hits; slimes take {Math.ceil(SLIME.HEALTH / STAFF.DAMAGE)}. Boulders block your
                  projectiles. Every kill restores {PLAYER.HEALING_PER_KILL} health; a new wave
                  restores {PLAYER.HEALING_PER_WAVE}.
                </p>
                <p>
                  Desktop keyboard and mouse required. Entering the arena captures your cursor;
                  Escape releases it.
                </p>
              </>
            )}
            <Button
              className={cn('mt-7', panel === 'status' && 'shrink-0')}
              onClick={() => setPanel('none')}
            >
              DONE
            </Button>
          </PanelContent>
        </PanelOverlay>
      ) : null}
      {error ? (
        <div
          className={
            'absolute bottom-[90px] left-1/2 z-10 w-[90%] max-w-[600px] border' +
            ' border-[#c49878] bg-[#4b3029] py-[18px] pr-[45px] pl-5 text-[12px]' +
            ' leading-[1.7] [transform:translateX(-50%)]'
          }
          role="alert"
        >
          {error}
          <button
            className="absolute top-[10px] right-[10px] border-0 bg-transparent text-[24px]"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}
      <div
        className={
          'pointer-events-none absolute bottom-[14px] left-[4.5%] flex items-center gap-2' +
          ' text-[7px] font-medium tracking-[1px] text-[#a3b595] compact:left-[7%]'
        }
      >
        {perf.fps ? `${perf.fps} FPS` : ''}
      </div>
    </main>
  );
}
