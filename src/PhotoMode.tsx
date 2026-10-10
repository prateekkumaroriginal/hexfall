import type { PhotoModeActions, PhotoSnapshot } from './game/photo-mode';
import { PHOTO_MODE } from './config/photo-mode';

export function PhotoMode({
  engine,
  snapshot,
}: {
  engine: PhotoModeActions;
  snapshot: PhotoSnapshot;
}) {
  return (
    <section className="photo-mode" aria-label="Photo mode">
      {!snapshot.controlsHidden ? (
        <>
          <div className="photo-mode-shade" />
          {snapshot.grid ? <div className="photo-mode-grid" aria-hidden="true" /> : null}
          <h1 className="photo-mode-title">PHOTO MODE</h1>
          <aside className="photo-mode-controls" aria-label="Photo camera controls">
            <label className="photo-mode-field" htmlFor="photo-field-of-view">
              <span>
                Field of view <output>{snapshot.fieldOfView}°</output>
              </span>
              <input
                id="photo-field-of-view"
                type="range"
                min={PHOTO_MODE.FIELD_OF_VIEW.MIN}
                max={PHOTO_MODE.FIELD_OF_VIEW.MAX}
                step={PHOTO_MODE.FIELD_OF_VIEW.STEP}
                value={snapshot.fieldOfView}
                onChange={(event) =>
                  engine.updatePhotoControls({ fieldOfView: Number(event.target.value) })
                }
              />
            </label>
            <label className="photo-mode-field" htmlFor="photo-camera-height">
              <span>
                Height <output>{snapshot.height.toFixed(1)} m</output>
              </span>
              <input
                id="photo-camera-height"
                type="range"
                min={PHOTO_MODE.HEIGHT_UNITS.MIN}
                max={PHOTO_MODE.HEIGHT_UNITS.MAX}
                step={PHOTO_MODE.HEIGHT_UNITS.STEP}
                value={snapshot.height}
                onChange={(event) =>
                  engine.updatePhotoControls({ height: Number(event.target.value) })
                }
              />
            </label>
            <label className="photo-mode-toggle">
              Thirds grid
              <input
                type="checkbox"
                checked={snapshot.grid}
                onChange={(event) => engine.updatePhotoControls({ grid: event.target.checked })}
              />
            </label>
            <label className="photo-mode-toggle">
              Show staff
              <input
                type="checkbox"
                checked={snapshot.showStaff}
                onChange={(event) =>
                  engine.updatePhotoControls({ showStaff: event.target.checked })
                }
              />
            </label>
            <button className="photo-mode-reset" onClick={() => engine.resetPhotoCamera()}>
              Reset camera
            </button>
          </aside>
          <div className="photo-mode-guide" aria-label="Photo mode controls">
            <span>
              <kbd>WASD</kbd> Move
            </span>
            <span>
              <kbd>Q / E</kbd> Height
            </span>
            {snapshot.mouseLook ? (
              <span>
                <kbd>Tab</kbd> Use controls
              </span>
            ) : (
              <button onClick={() => void engine.enablePhotoMouseLook()}>
                <kbd>Click scene</kbd> Mouse look
              </button>
            )}
            <button onClick={() => engine.exitPhotoMode()}>
              <kbd>Esc</kbd> Back to pause
            </button>
          </div>
          <div className="photo-mode-actions">
            <button
              className="photo-mode-button"
              onClick={() => engine.updatePhotoControls({ controlsHidden: true })}
            >
              Hide controls <kbd>H</kbd>
            </button>
            <button
              className="photo-mode-button photo-mode-capture"
              onClick={() => void engine.capturePhoto()}
              disabled={snapshot.saving}
            >
              {snapshot.saving ? 'CAPTURING' : 'CAPTURE'} <kbd>↵</kbd>
            </button>
          </div>
          {snapshot.message ? (
            <div className="photo-mode-message" role={snapshot.failed ? 'alert' : 'status'}>
              {snapshot.message}
            </div>
          ) : null}
        </>
      ) : (
        <button
          className="photo-mode-button photo-mode-reveal"
          onClick={() => engine.updatePhotoControls({ controlsHidden: false })}
        >
          Show controls <kbd>H</kbd>
        </button>
      )}
    </section>
  );
}
