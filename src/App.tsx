import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine, Settings } from './game/engine';
import { StatusCheck } from './StatusCheck';
import type { Snapshot } from './game/simulation';

const initial: Snapshot = { phase: 'ready', hp: 100, wave: 0, kills: 0, score: 0, time: 0, alive: 0, remaining: 0, hit: 0, hurt: 0, waveWait: 0 };
const defaultSettings: Settings = { quality: 'balanced', sensitivity: 1, sound: true };
function loadSettings(): Settings {
  try { const s = JSON.parse(localStorage.getItem('hexfall.settings.v1') || 'null'); return s && ['low', 'balanced', 'high'].includes(s.quality) && typeof s.sensitivity === 'number' && s.sensitivity >= 0.3 && s.sensitivity <= 2.5 && typeof s.sound === 'boolean' ? s : defaultSettings; } catch { return defaultSettings; }
}
const formatTime = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;

export default function App() {
  const host = useRef<HTMLDivElement>(null), engine = useRef<Engine | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [settings, setSettings] = useState(loadSettings);
  const initialSettings = useRef(settings);
  const [panel, setPanel] = useState<'none' | 'settings' | 'guide' | 'status'>('none');
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [perf, setPerf] = useState({ fps: 0, calls: 0 });
  useEffect(() => {
    if (panel === 'none') return;
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPanel('none'); return; }
      if (event.key !== 'Tab') return;
      const items = document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea');
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [panel]);
  const updatePerformance = useCallback((fps: number, calls: number) => setPerf({ fps, calls }), []);
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    const onError = (event: Event) => setError((event as CustomEvent<string>).detail);
    element.addEventListener('engine-error', onError);
    import('./game/engine').then(({ Engine }) => {
      if (cancelled) return;
      try { engine.current = new Engine(element, setSnapshot, updatePerformance, initialSettings.current); setReady(true); }
      catch { setError('The arena could not start. This game needs a desktop browser with WebGL 2 and hardware acceleration enabled.'); }
    }).catch(() => { if (!cancelled) setError('The game could not load. Check your connection and reload the page.'); });
    return () => { cancelled = true; element.removeEventListener('engine-error', onError); engine.current?.dispose(); engine.current = null; };
  }, [updatePerformance]);
  useEffect(() => { engine.current?.updateSettings(settings); try { localStorage.setItem('hexfall.settings.v1', JSON.stringify(settings)); } catch { /* Private browsers may disable storage. */ } }, [settings]);
  const start = async () => { setError(''); setPanel('none'); try { await engine.current?.start(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not capture the mouse. Try again.'); } };
  const playing = snapshot.phase === 'playing';
  const ended = snapshot.phase === 'dead' || snapshot.phase === 'won';
  const menu = snapshot.phase === 'ready';
  return <main className={playing ? 'app in-game' : 'app'}>
    <div className="world" ref={host} />
    <div className="vignette" />
    {snapshot.hurt > 0 && playing ? <div className="damage" style={{ opacity: snapshot.hurt * 2 }} /> : null}


    {menu && panel === 'none' ? <>
      <section className="hero">
        <h1>HEXFALL</h1>
        <button className="primary start" onClick={start} disabled={!ready}>{ready ? 'PLAY' : 'LOADING'}</button>
        <button className="menu-settings" onClick={() => setPanel('settings')} aria-label="Open settings">SETTINGS</button>
        <button className="guide-link status-link" onClick={() => setPanel('status')}>Status check</button>
      </section>
    </> : null}

    {playing ? <>
      <div className="wave-hud">Wave {snapshot.wave || 1} / 5</div>
      <div className={snapshot.hit > 0 ? 'crosshair hit' : 'crosshair'}><span /><span /><span /><span /></div>
      {snapshot.alive === 0 && snapshot.remaining === 0 ? <div className="wave-announcement"><h2>{snapshot.wave === 0 ? 'Get ready' : 'Wave cleared'}</h2><p>{snapshot.wave === 5 ? 'All five waves complete.' : `Next wave in ${Math.ceil(snapshot.waveWait)}`}</p></div> : null}
      <div className="bottom-hud">
        <div className="health" aria-label={`Health ${snapshot.hp} out of 100`}><div><span>HP</span><strong>{snapshot.hp}</strong></div><div className="health-track"><i style={{ width: `${snapshot.hp}%` }} /></div></div>

      </div>
    </> : null}

    {!menu && !playing && panel === 'none' ? <section className="overlay"><div className="modal result"><h2>{ended ? snapshot.phase === 'won' ? 'You won' : 'Game over' : 'Paused'}</h2>{ended ? <div className="result-stats"><div><strong>{snapshot.score.toLocaleString()}</strong><span>SCORE</span></div><div><strong>{snapshot.kills}</strong><span>KILLS</span></div><div><strong>{formatTime(snapshot.time)}</strong><span>SURVIVED</span></div></div> : null}<button className="primary" onClick={start}>{ended ? 'PLAY AGAIN' : 'RESUME'}</button><button className="secondary" onClick={() => setPanel('settings')}>SETTINGS</button><button className="secondary" onClick={() => { engine.current?.exitToMenu(); setPanel('none'); setError(''); }}>EXIT TO MENU</button><button className="guide-link" onClick={() => setPanel('status')}>Status check</button><button className="guide-link" onClick={() => setPanel('guide')}>Controls</button></div></section> : null}

    {panel !== 'none' ? <section className="overlay"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="panel-title"><button className="close" onClick={() => setPanel('none')} aria-label="Close panel" autoFocus>×</button><h2 id="panel-title">{panel === 'settings' ? 'Settings' : panel === 'status' ? 'Status check' : 'Controls'}</h2>{panel === 'settings' ? <div className="settings-fields"><fieldset className="quality-field"><legend>Render quality</legend><div className="quality-options">{(['low', 'balanced', 'high'] as const).map(quality => <button key={quality} type="button" aria-pressed={settings.quality === quality} onClick={() => setSettings(s => ({ ...s, quality }))}>{quality === 'low' ? 'Low' : quality === 'balanced' ? 'Balanced' : 'High'}</button>)}</div></fieldset><label>Mouse sensitivity <span>{settings.sensitivity.toFixed(1)}×</span><input type="range" min="0.3" max="2.5" step="0.1" value={settings.sensitivity} onChange={e => setSettings(s => ({ ...s, sensitivity: Number(e.target.value) }))} /></label><label className="toggle-label">Spell audio<input type="checkbox" checked={settings.sound} onChange={e => setSettings(s => ({ ...s, sound: e.target.checked }))} /></label></div> : panel === 'status' ? <StatusCheck engine={engine.current} /> : <><p>Survive five waves.</p><div className="guide-grid">{[['W A S D', 'Move through the arena'], ['MOUSE', 'Look around'], ['CLICK / LEFT CTRL', 'Hold to cast'], ['ESC / P', 'Pause']].map(([key, text]) => <div key={key}><kbd>{key}</kbd><span>{text}</span></div>)}</div><p className="tip">Slimes and orcs attack in melee. Orcs take six hits; slimes take three. Boulders block your projectiles. Every kill restores 1 health; a new wave restores 15.</p><p>Desktop keyboard and mouse required. Entering the arena captures your cursor; Escape releases it.</p></>}<button className="primary" onClick={() => setPanel('none')}>DONE</button></div></section> : null}
    {error ? <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div> : null}
    <div className="performance">{perf.fps ? `${perf.fps} FPS` : ''}</div>
  </main>;
}
