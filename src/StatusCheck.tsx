import { useState } from 'react';
import type { Engine } from './game/engine';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';

export function StatusCheck({ engine }: { engine: Engine | null }) {
  const [status, setStatus] = useState(() => engine?.statusCheck());
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  const edge = /Edg\//.test(navigator.userAgent);
  const address = edge ? 'edge://settings/system' : 'chrome://settings/system';
  const chromium = edge || /Chrome\//.test(navigator.userAgent);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Copied.');
      setFallback('');
    } catch {
      setFallback(value);
      setMessage('Select and copy below.');
    }
  };
  if (!status) return <p>The graphics engine is not available.</p>;
  return (
    <div className="status-scrollbar min-h-0 overflow-y-auto pr-3 [scrollbar-gutter:stable]">
      <dl
        className={
          'm-0 [&>div]:flex [&>div]:justify-between [&>div]:gap-5 [&>div]:border-0' +
          ' [&>div]:border-b [&>div]:border-solid [&>div]:border-[#ced9b220]' +
          ' [&>div]:py-[9px] [&>div]:text-[12px] [&_dt]:text-muted-foreground [&_dd]:m-0' +
          ' [&_dd]:text-right'
        }
      >
        <div>
          <dt>Graphics renderer</dt>
          <dd
            className={cn(
              status.acceleration === 'software' && 'text-[#edb48d]',
              status.acceleration === 'hardware' && 'text-primary',
            )}
          >
            {status.acceleration === 'software'
              ? 'Software rendering detected'
              : status.acceleration === 'hardware'
                ? 'GPU renderer detected'
                : 'Could not verify acceleration'}
          </dd>
        </div>
        <div>
          <dt>WebGL 2</dt>
          <dd>{status.contextLost ? 'Connection lost' : 'Available'}</dd>
        </div>
        <div>
          <dt>Render quality</dt>
          <dd>{status.quality}</dd>
        </div>
        <div>
          <dt>Actual resolution</dt>
          <dd>
            {status.width} × {status.height}
          </dd>
        </div>
        <div>
          <dt>Automatic resolution scale</dt>
          <dd>{Math.round(status.scale * 100)}%</dd>
        </div>
        <div>
          <dt>Grass detail</dt>
          <dd>{status.grassQuality}</dd>
        </div>
        <div>
          <dt>Recent gameplay FPS</dt>
          <dd>{status.gameplay.fps ?? 'Play first to measure'}</dd>
        </div>
        {status.gameplay.averageFrameMs !== null ? (
          <div>
            <dt>Average frame time</dt>
            <dd>{status.gameplay.averageFrameMs} ms</dd>
          </div>
        ) : null}
      </dl>
      <p className="wrap-anywhere text-[11px]!">{status.renderer}</p>
      {status.scale < 1 ? <p>Resolution was reduced after slow frames.</p> : null}
      {status.gameplay.fps !== null ? (
        <p>Gameplay readings cover the last {status.gameplay.sampledSeconds} seconds played.</p>
      ) : null}
      <div>
        <h3 className="mt-[22px] mb-0 text-[14px]">Browser graphics settings</h3>
        <p>This game cannot read or change the browser's acceleration switch.</p>
        {chromium ? (
          <>
            <p>
              Paste <code className="wrap-anywhere text-[#e1e9d6]">{address}</code> into the address
              bar. Enable “Use graphics acceleration when available”, then relaunch the browser.
            </p>
            <Button variant="secondary" onClick={() => void copy(address)}>
              Copy settings address
            </Button>
            <p>
              If it is already enabled, check{' '}
              <code className="wrap-anywhere text-[#e1e9d6]">
                {edge ? 'edge://gpu' : 'chrome://gpu'}
              </code>{' '}
              for driver problems.
            </p>
          </>
        ) : (
          <p>Enable hardware acceleration in your browser settings, then restart the browser.</p>
        )}
      </div>
      <Button variant="secondary" onClick={() => setStatus(engine?.statusCheck())}>
        Check again
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          if (engine) void copy(engine.performanceReport());
        }}
      >
        Copy performance report
      </Button>
      <p role="status">{message}</p>
      {fallback ? (
        <textarea
          className="min-h-[120px] w-full"
          aria-label="Copyable status information"
          readOnly
          value={fallback}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
    </div>
  );
}
