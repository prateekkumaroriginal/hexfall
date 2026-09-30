# Hexfall

A desktop first-person wizard survival shooter built with React, TypeScript, Vite, and Three.js. Survive five waves of slimes and orcs in a grassy mountain clearing.

## Run

Requires Node.js 22.12+ or 24 LTS and pnpm 10.15.0, pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite. Click **PLAY** to capture the mouse. A desktop keyboard, mouse, WebGL 2, and hardware acceleration are required.

| Control | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Aim |
| Hold left mouse / Left Ctrl | Shoot spell projectiles |
| Escape / P | Pause and release the mouse |

Slimes and orcs pursue the player and only attack in melee after a visible wind-up. Slimes have 3 health and orcs have 6. Slimes form from bubbling green puddles over 1.4 seconds before moving or attacking. Their hitboxes grow with their bodies, so emerging slimes can be shot. Slimes move at 1.11 to 1.36 metres per second across the five waves. Orcs move 20% slower than slimes in the same wave. The staff fires visible projectiles at 30 world units per second. Boulders, the ground, and arena walls block them. Only the wizard shoots; enemies remain melee-only. Kills restore 1 vitality and new waves restore 15. Clear five waves to win. Settings persist locally; no account or server is needed.

## Checks

```sh
pnpm test
pnpm lint
pnpm build
pnpm preview
```

Use `pnpm install --frozen-lockfile` in CI to install the versions recorded in `pnpm-lock.yaml` without updating it.

## Architecture and performance

- React owns menus, settings, and a HUD sampled at 10 Hz. The game engine is dynamically imported and held in a ref. Simulation positions never enter React state.
- Combat runs at a fixed 60 Hz with bounded catch-up after a long frame. Input and rendering are separate from the deterministic-step simulation.
- The enemy pool is capped at 48. Creature geometry is merged by joint and material into 23 instanced batches, plus one shared contact-shadow batch and one pooled batch for slime birth bubbles. Crowd size does not increase creature draw calls. Grass, trees, boulders, spell cores, and trails also use instancing; the surrounding mountain ridge is one mesh. A fixed pool caps wizard projectiles at 96. Swept ray/ellipsoid and boulder tests prevent fast shots from skipping targets.
- The 32×40-metre rectangular valley has continuous mountain walls, wind-animated textured grass clumps, branching broadleaf trees, boulders, and a procedural sky with moving clouds. Movement and enemy spawning stay inside the same rectangle. Grass uses spatial tiles with frustum culling and decreasing density at distance. Trees use culled instanced batches with textured leaf clusters. Off-screen creatures are not submitted. The cloud shader is baked once into a 256-pixel cubemap. Render-pixel budgets are 960x540 / 1280x720 / 1920x1080 on Low / Balanced / High, with automatic resolution reduction during slow frames and gradual recovery. Lighting uses a hemisphere and directional sun; there are no shadow maps, texture downloads, or post-processing passes.
- Menus render at up to 30 Hz and gameplay at up to 60 Hz. The HUD measures actual elapsed frame time independently of the capped simulation timestep. These are local observations, not a performance guarantee across devices.
- Pointer-lock loss, tab hiding, and window blur pause gameplay and clear held input. Hidden tabs skip rendering. Disposal removes listeners, cancels animation, closes audio, and releases Three.js resources. React Strict Mode is enabled.
- Settings use a validated versioned localStorage record. Audio is synthesized after a user gesture. Google Fonts are optional; local font fallbacks keep the interface usable offline.

The requested Vercel React skill is installed in `.agents/skills/vercel-react-best-practices`. Relevant guidance is applied to this client-only app. Next.js server and data-fetching rules do not apply.

Implementation references: [React effects](https://react.dev/reference/react/useEffect), [Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html), [resource cleanup](https://threejs.org/manual/pages/how-to-dispose-of-objects.html).

This is a playable prototype with procedural art. Orcs have articulated walking and punch animations, tusks, facial features, armor, and leather gear. Slimes have glossy lobed bodies, faces, and squash/stretch motion. The staff has carved wood, a wrapped grip, bronze filigree, runes, and a crystal cradle. Models are authored in `src/game/creatures.ts`, `src/game/staff.ts`, and `src/game/environment.ts`; no third-party model assets are bundled. It has no mobile controls, multiplayer, saved runs, or cross-device performance certification.

## Performance regression check

With the dev server running, `node scripts/performance-check.mjs` records scene submissions at 1920x1080. The fixed empty-arena view dropped from 1,175,200 originally, through 198,878 in the earlier foliage pass, to 65,262 submitted triangles in the enclosed valley. Balanced render pixels dropped from 2,073,600 to 921,600. The check writes `local-artifacts/performance.json`. Historical snapshots, when available locally, are in `local-artifacts/performance-before.json`, `local-artifacts/performance-after.json`, and `local-artifacts/performance-valley.json`. Git ignores the whole `local-artifacts/` directory. These counts are reproducible workload metrics; the headless timing samples are not a GPU benchmark or an FPS guarantee on another device.

