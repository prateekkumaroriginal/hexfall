# Hexfall

A first-person survival game where you play a wizard fighting slimes and orcs in a mountain clearing. Keep moving, cast spells with your staff, and survive all five waves to win.

Hexfall is a playable single-player browser prototype. You'll need a desktop keyboard and mouse. There are no mobile controls, multiplayer, or saved runs.

## Run locally

Install Node.js 22.12+ and pnpm 10.15.0, then run these commands from the project folder:

```sh
pnpm install
pnpm dev
```

Open the local URL printed in your terminal and click **PLAY**. The game captures your mouse so you can look around. Press **Escape** to release it.

Your browser needs WebGL 2 and hardware acceleration enabled. No account or game server is required.

## How to play

| Control                      | Action                      |
| ---------------------------- | --------------------------- |
| WASD or arrow keys           | Move                        |
| Mouse                        | Look and aim                |
| Hold left mouse or Left Ctrl | Cast spells continuously    |
| Escape or P                  | Pause and release the mouse |

The first wave starts with one slime and one orc. Later waves bring larger crowds. Clear every enemy in a wave to advance.

- Slimes take two hits; orcs take four.
- Both enemies attack up close. Move away when you see them wind up.
- You can shoot slimes while they emerge from their puddles.
- Boulders and tree trunks block your spells. Keep a clear line of fire.
- Each kill restores 1 health. Starting a new wave restores 15, up to your maximum of 100.

Switching tabs or leaving the game window pauses the action. Click **RESUME** when you're ready to continue.

## Photo mode

Pause a run and choose **PHOTO MODE** to freeze the arena and frame a shot. Mouse look works like gameplay: move the mouse or trackpad to turn the camera. Press Tab to release the cursor and use the controls; click the scene to return to mouse look. WASD moves the camera, Q/E lowers or raises it, and Shift moves faster. The wizard stays in place.

Adjust field of view and height, toggle a thirds grid or the staff, or reset the camera to its entry view. **Hide controls** or H clears the interface and returns to mouse look. H shows the controls and releases the cursor again. **Capture** or Enter downloads the scene without the interface or grid, at up to 1920 × 1080 while preserving the window's aspect ratio. The confirmation disappears after three seconds. Photo settings do not change your gameplay settings.

Press Escape or click **Back to pause** to restore the gameplay view. Click **RESUME** to continue the same run.

Photo camera and session lifecycle tests run with `pnpm test`. Run `pnpm test:browser:photo` to build the app and check the photo flow against a temporary production preview. The check uses Edge on Windows and Playwright Chromium elsewhere. Install Chromium with `pnpm exec playwright install chromium` if needed. To check an already running server, set `PHOTO_MODE_TEST_URL` before running `node scripts/photo-mode-check.mjs`.

## Settings

Open **SETTINGS** from the main menu or pause screen to adjust:

- **Render quality:** Low, Balanced, or High.
- **Render scale:** 25%, 50%, 75%, or 100%. Lower values trade image clarity for a potentially smoother frame rate.
- **Field of view:** 75 to 110 degrees, with a default of 90. Higher values show more of the arena.
- **Mouse sensitivity** and **spell audio**.

Settings are saved in your browser. If the game feels slow, try Low quality or a lower render scale. If the arena won't load, check that hardware acceleration is enabled. The menu's **Status check** shows rendering and performance information.

## Working on the game

Built with React, TypeScript, Vite, and Three.js. React handles the menus and HUD; the game code lives in [`src/game/`](src/game/).

```sh
pnpm test    # Run the tests
pnpm lint    # Check code quality
pnpm build   # Create a production build in dist/
pnpm preview # Serve the production build locally
```

To change the balance, start with [`src/config/gameplay.ts`](src/config/gameplay.ts). Arena layout, rendering presets, and settings defaults live alongside it in [`src/config/`](src/config/).

For creature models and Blender export instructions, see [creature art inspection](docs/creature-art.md). With the dev server running, open `/creature-studio.html` to inspect the models from different angles or in wireframe.
