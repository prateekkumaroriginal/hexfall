# Hexfall

A desktop first-person wizard survival shooter built with React, TypeScript, Vite, and Three.js. Survive five waves of slimes and orcs in a grassy mountain clearing.

## Run

Requires Node.js 22.12+ or 24 LTS and pnpm 10.15.0, pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Click **PLAY** to capture the mouse. A desktop keyboard, mouse, WebGL 2, and hardware acceleration are required.

Render scale starts at 100% and stays at the selected value during gameplay. In **Settings**, choose **Render scale** from 25%, 50%, 75%, or 100%. Lower values can improve frame rate at the cost of image clarity. The scale applies to the selected **Render quality** preset and persists locally. Existing saved settings use 100% until you choose another value.

Field of view defaults to 90° horizontally at 16:9, reducing stretching at the edges. The **Field of view** slider in **Settings** ranges from 75° to 110° and persists locally. Wider windows retain the selected horizontal angle; narrower windows retain the 16:9 vertical angle. The staff keeps its screen framing when FOV changes. Existing saved settings use the new 90° default.

| Control                     | Action                      |
| --------------------------- | --------------------------- |
| WASD / arrows               | Move                        |
| Mouse                       | Aim                         |
| Hold left mouse / Left Ctrl | Shoot spell projectiles     |
| Escape / P                  | Pause and release the mouse |

The first wave contains exactly one slime and one orc. Later waves retain their existing sizes and randomized enemy mix.

Slimes and orcs pursue the player and only attack in melee after a visible wind-up. Slimes have 2 health and orcs have 4. Slimes form from bubbling green puddles over 2.5 seconds before moving or attacking. Their hitboxes grow with their bodies, so emerging slimes can be shot. Slimes move at 1.11 to 1.36 metres per second across the five waves. Orcs move 20% slower than slimes in the same wave. The staff fires visible projectiles at 30 world units per second. Boulders, tree trunks, the ground, and arena walls block them. Tree trunks also block the wizard and enemies; enemies steer around them and spawn clear of them. Only the wizard shoots; enemies remain melee-only. Kills restore 1 vitality and new waves restore 15. Clear five waves to win. Settings persist locally; no account or server is needed.

## Checks

```sh
pnpm test
pnpm lint
pnpm build
pnpm preview
```

Use `pnpm install --frozen-lockfile` in CI to install the versions recorded in `pnpm-lock.yaml` without updating it.

## Game configuration

Tuning values live in `src/config/`. These modules export readonly constants and data; simulation, rendering, layout generation, and settings validation remain in their owning modules.

- `gameplay.ts`: player stats, staff damage and projectiles, separate slime and orc stats, waves, spawning, collisions, and hit feedback.
- `world.ts`: arena dimensions, boulder layout, tree layout parameters, and environment seeds.
- `runtime.ts`: pool capacities, simulation and rendering rates, HUD sampling, and diagnostic intervals.
- `rendering.ts`: quality presets, pixel budgets, grass density and visibility, camera, animation, and spell audio tuning.
- `settings.ts`: settings defaults, options, slider ranges, and aiming limits.

Each enemy owns its health, damage, movement speed, and wave scaling. Orc stats do not reference slime stats. Movement speed uses each enemy's own base speed plus its per-wave increase multiplied by the current wave number. The initial values preserve the existing game balance.

Orc windup and recovery durations control playback speed around the Punch clip's authored strike time. Changing these gameplay durations keeps the visible strike aligned with damage. `TREES.VARIANTS` lists each tree variant's `SEED` and `SPREAD`; layout generation and rendering use this same list. Add a definition to add a variant.

Shared consumers import the same values: the health bar scales against maximum health, the guide calculates hits from health and spell damage, and attack animation and shot audio cadence use combat timings. Ordinary mathematical literals and detailed procedural art coefficients stay local. Constant names and config properties use `SCREAMING_SNAKE_CASE`, with units where needed, such as `STAFF.FIRE_INTERVAL_SECONDS` and `PLAYER.COLLISION_RADIUS_UNITS`. Quality identifiers (`low`, `balanced`, `high`) and saved settings retain their existing format.

## Architecture and performance

- UI styling uses Tailwind CSS v4 through the Vite plugin. `src/style.css` maps the existing palette to semantic theme tokens, following [shadcn's theming conventions](https://ui.shadcn.com/docs/theming). Shared buttons and panels live in `src/components/ui`; `cn()` merges conditional classes and caller overrides. Tailwind's theme and utilities are imported without Preflight to preserve native controls and browser typography. Custom CSS covers base defaults, layered vignette gradients, and browser-specific scrollbars. Preserve the inclusive 700px and 1000px breakpoints when changing responsive utilities.

- React owns menus, settings, and a HUD sampled at 10 Hz. The game engine is dynamically imported and held in a ref. Simulation positions never enter React state.
- Combat runs at a fixed 60 Hz with bounded catch-up after a long frame. Input and rendering are separate from the deterministic-step simulation.
- The enemy pool is capped at 48. Slimes, contact shadows, and birth bubbles use shared instanced batches. Orcs share geometry and PBR textures, with a pooled skeleton, one skinned body draw, and two eye draws per visible orc. Grass, trees, boulders, spell cores, and trails also use instancing; the stepped cliffs, distant snowy summits, and base outcrops are merged into one mountain mesh. A fixed pool caps wizard projectiles at 96. Swept ray/ellipsoid and obstacle-cylinder tests prevent fast shots from skipping targets.
- Slimes retain their continuous baked sculpture and painted details. Orcs use `public/models/orc-rigged.glb`. The importer selects the largest full-body figure from five disconnected concept studies and simplifies it to about 120,000 triangles while preserving UV seams and its PBR textures. `scripts/rig-orc.py` aligns the source's three-quarter pose with the walk direction, corrects the head's remaining yaw and sideways cant, builds a 17-bone Blender armature, binds the mesh with bone-heat weights, and exports baked Idle, Walk, and Punch clips plus eyelid, jaw, and brow shape keys. The walk uses two-bone leg IK, heel contact and toe push-off, hip weight transfer, opposing shoulder rotation, and arm swing. Gait phase follows travel over a full 1.4-metre stride; stopped orcs settle and paused gameplay freezes their pose. Leg proportions are 12% longer at approximately the same overall height. The head stays upright and forward while recessed eyes track the player, with timed blinks and subtle jaw breathing. The punch raises an upright fist and slams downward, while the free arm holds still; its mouth stays closed. Each slime uses 11,556 triangles. The earlier Blender source and exports remain available, but their packed geometry is no longer loaded by the game. The development-only `/creature-studio.html` provides fixed views, concept comparisons, clay and wireframe modes, and cross-section measurements. See [creature art inspection](docs/creature-art.md) for import and rig export commands.
- The 32Ã—40-metre rectangular valley has continuous mountain walls, wind-animated textured grass clumps, branching broadleaf trees, boulders, and a procedural sky with moving clouds. Movement and enemy spawning stay inside the same rectangle. Grass uses spatial tiles with frustum culling and decreasing density at distance. Trees have three sculpted crown shapes, smaller foliage tufts, thick tapered trunks with bark grooves and knots, flared roots, and solid rounded foliage with broad painted color gradients and subtle wind motion. Trees stand inside the arena; their positions, scales, and trunk collision dimensions come from the same layout in `src/game/world.ts`. The canopy is a closed surface blended from overlapping volumes; it uses no individual leaves, leaf cards, or alpha textures. Trunks and canopies use six culled instanced batches in total. Off-screen creatures are not submitted. The cloud shader is baked once into a 256-pixel cubemap. Render-pixel budgets are 960x540 / 1280x720 / 1920x1080 on Low / Balanced / High, with a saved manual render scale that defaults to 100%. Lighting uses a hemisphere and directional sun; there are no shadow maps, texture downloads, or post-processing passes.
- Mountains have stepped cliffs, recessed gullies, large base outcrops, and a taller snowy ridge behind them. Broad color layers and procedural rock relief add detail without texture downloads. The terrain stays outside the playable rectangle and encloses every approach.
- Menus render at up to 30 Hz and gameplay at up to 60 Hz. The HUD measures actual elapsed frame time independently of the capped simulation timestep. These are local observations, not a performance guarantee across devices.
- Pointer-lock loss, tab hiding, and window blur pause gameplay and clear held input. Hidden tabs skip rendering. Disposal removes listeners, cancels animation, closes audio, and releases Three.js resources. React Strict Mode is enabled.
- Settings use a validated versioned localStorage record. Audio is synthesized after a user gesture. Google Fonts are optional; local font fallbacks keep the interface usable offline.

The requested Vercel React skill is installed in `.agents/skills/vercel-react-best-practices`. Relevant guidance is applied to this client-only app. Next.js server and data-fetching rules do not apply.

Implementation references: [React effects](https://react.dev/reference/react/useEffect), [Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html), [resource cleanup](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).

This is a playable prototype with a rigged orc and procedural environment art. Slimes have painted scalloped bodies, faces, and squash/stretch motion. The staff has carved wood, a wrapped grip, bronze filigree, runes, and a crystal cradle. Orc import and legacy Blender export instructions are in [creature art inspection](docs/creature-art.md). Slime and environment assets are authored in `scripts/sculpt-creatures.mjs`, `src/game/creature-models.ts`, `src/game/staff.ts`, `src/game/trees.ts`, `src/game/mountains.ts`, and `src/game/environment.ts`. The game has no mobile controls, multiplayer, saved runs, or cross-device performance certification.

## Performance regression check

With the dev server running, `node scripts/performance-check.mjs` records scene submissions at 1920x1080. The fixed empty-arena view dropped from 1,175,200 originally, through 198,878 in the earlier foliage pass, to 65,262 submitted triangles in the enclosed valley. The current stylized trees and layered mountains bring that fixed view to 163,874 triangles and 32 draw calls. Balanced render pixels dropped from 2,073,600 to 921,600. The check writes `local-artifacts/performance.json`. Historical snapshots, when available locally, are in `local-artifacts/performance-before.json`, `local-artifacts/performance-after.json`, and `local-artifacts/performance-valley.json`. Git ignores the whole `local-artifacts/` directory. These counts are reproducible workload metrics; the headless timing samples are not a GPU benchmark or an FPS guarantee on another device.
