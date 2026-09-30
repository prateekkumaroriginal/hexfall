import { useState } from 'react';
import type { Engine } from './game/engine';

export function StatusCheck({ engine }: { engine: Engine | null }) {
  const [status, setStatus] = useState(() => engine?.statusCheck());
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  const edge = /Edg\//.test(navigator.userAgent);
  const address = edge ? 'edge://settings/system' : 'chrome://settings/system';
  const chromium = edge || /Chrome\//.test(navigator.userAgent);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Copied.'); setFallback(''); }
    catch { setFallback(value); setMessage('Select and copy below.'); }
  };
  if (!status) return <p>The graphics engine is not available.</p>;
  return <div className="status-check">
    <dl>
      <div><dt>Graphics renderer</dt><dd className={`renderer-${status.acceleration}`}>{status.acceleration === 'software' ? 'Software rendering detected' : status.acceleration === 'hardware' ? 'GPU renderer detected' : 'Could not verify acceleration'}</dd></div>
      <div><dt>WebGL 2</dt><dd>{status.contextLost ? 'Connection lost' : 'Available'}</dd></div>
      <div><dt>Render quality</dt><dd>{status.quality}</dd></div>
      <div><dt>Actual resolution</dt><dd>{status.width} × {status.height}</dd></div>
      <div><dt>Automatic resolution scale</dt><dd>{Math.round(status.scale * 100)}%</dd></div>
      <div><dt>Grass detail</dt><dd>{status.grassQuality}</dd></div>
      <div><dt>Recent gameplay FPS</dt><dd>{status.gameplay.fps ?? 'Play first to measure'}</dd></div>
      {status.gameplay.averageFrameMs !== null ? <div><dt>Average frame time</dt><dd>{status.gameplay.averageFrameMs} ms</dd></div> : null}
    </dl>
    <p className="renderer-name">{status.renderer}</p>
    {status.scale < 1 ? <p>Resolution was reduced after slow frames.</p> : null}
    {status.gameplay.fps !== null ? <p>Gameplay readings cover the last {status.gameplay.sampledSeconds} seconds played.</p> : null}
    <div className="status-help">
      <h3>Browser graphics settings</h3>
      <p>This game cannot read or change the browser's acceleration switch.</p>
      {chromium ? <><p>Paste <code>{address}</code> into the address bar. Enable “Use graphics acceleration when available”, then relaunch the browser.</p><button className="secondary" onClick={() => void copy(address)}>Copy settings address</button><p>If it is already enabled, check <code>{edge ? 'edge://gpu' : 'chrome://gpu'}</code> for driver problems.</p></> : <p>Enable hardware acceleration in your browser settings, then restart the browser.</p>}
    </div>
    <button className="secondary" onClick={() => setStatus(engine?.statusCheck())}>Check again</button>
    <button className="secondary" onClick={() => { if (engine) void copy(engine.performanceReport()); }}>Copy performance report</button>
    <p role="status">{message}</p>
    {fallback ? <textarea aria-label="Copyable status information" readOnly value={fallback} onFocus={e => e.currentTarget.select()} /> : null}
  </div>;
}
