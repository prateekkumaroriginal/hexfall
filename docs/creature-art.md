# Creature art inspection

The orc now comes from the editable Blender asset at `assets/enemies/orc.blend`. The file contains named anatomical and equipment meshes, a five-joint armature, vertex paint, the packed concept reference, and a studio camera with lighting. `public/models/orc.glb` is its portable skinned export. The game decodes the same geometry from `src/game/orc-blender-data.json`, then animates shared instanced batches. It does not construct the orc from procedural primitives at runtime.

The Blender sculpture includes continuous facial and limb surfaces, narrow amber eyes, tusks, swept hair, asymmetric shoulder armor, two strap buckles, thick bracers, hanging leather panels, and layered boots. Leather panels fit the thigh surfaces. Vertex colors combine the concept's front and rear colors with material masks and baked contact shading. This is an approximation of the painted reference. Facial contours, muscle planes, hair shape, armor profiles, and individual wear marks still differ; exact reproduction has not been achieved.

The slime retains its existing offline sculpture and procedural detail assembly. Its geometry is unchanged.

## Inspecting the game model

Run `pnpm dev` and open `/creature-studio.html`. The viewer uses the game's renderer, materials, and joint transforms. It provides front, three-quarter, side, rear, and face views, clay and wireframe modes, concept comparisons, and measurements.

The comparison reads `orc-concept.png` and `slime-concept.png` from `local-artifacts/enemy-concepts/`. Those local image files are not included separately in the repository. The orc reference is packed inside the Blender source. Missing browser references are reported in the viewer. Full-body comparisons align reference crops to the model's projected height. Lighting and perspective differ between the concept, Blender studio, and game. The sheet has no orc side view or slime rear view; the viewer labels the front reference when substituting it.

Measurement exports report world-space bounds and twelve triangle cross-sections from feet to crown. The width ratios describe geometry, not artistic similarity.

## Editing and exporting Blender

Open `assets/enemies/orc.blend` in Blender 5.2.2 LTS. Edit the named meshes and their `Paint` color attributes, then save. Mesh custom properties `creature_bone` and `creature_surface` determine the game's joint and material batches. Keep those properties when adding or replacing parts. The runtime uses the fixed five pivots in `scripts/build-orc-blender.py`; changing the rig's joints also requires updating those pivots.

From the repository root, export saved edits with PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' assets/enemies/orc.blend --background --python scripts/build-orc-blender.py -- --export-only
pnpm exec prettier --write src/game/orc-blender-data.json
```

This writes both the GLB and packed game buffers. It preserves the saved sculpture and paint. The GLB has skin weights and five joints; walk and punch animation remain in the game's pooled renderer. The GLB does not contain animation clips.

To regenerate the authored sculpture and all four inspection renders:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-orc-blender.py
pnpm exec prettier --write src/game/orc-blender-data.json
```

Regeneration overwrites the Blender source and exports. Supply the original concept at `local-artifacts/enemy-concepts/orc-concept.png` to reproduce the projected paint. Without it, the generator uses its material palette. Add `-- --no-render` to skip the Cycles renders. Generated inspection images and logs go to `local-artifacts/blender-orc/`.

`node scripts/sculpt-creatures.mjs` rebuilds the slime's quantized closed sculpture. Clothing and other slime details remain in `src/game/creature-models.ts`.

## Limits and verification

The orc uses 38,008 triangles and the slime uses 11,556. A mixed crowd of 48 uses 1,189,536 creature triangles, plus contact shadows. The models share 23 joint/material batches and four paint textures. Shared geometry occupies 1,433,640 bytes, about 1.37 MiB. Regression limits are 40,000 triangles per orc and 14,000 per slime.

The Blender export tests check decoded attributes, normal lengths, color ranges, triangle areas, index bounds, GLB vertex paint, skin joints, and agreement between GLB and game triangle counts. Existing creature tests cover crowd submission, culling, shared textures, disposal, and slime birth behavior. Slime sculpture tests check closed topology and winding.

All 75 tests, lint, and the production build pass. Formatting checks pass for the changed files. The repository-wide `pnpm format:check` still reports existing formatting issues in ten untouched files. The production build retains its large-chunk warning.

The browser check submitted all 48 enemies in the full game scene. Both the two-enemy and 48-enemy checks used 60 scene draw calls, with no page errors, WebGL errors, or failed shader programs. This validates submission and compilation, not frame rate. The report is `local-artifacts/blender-orc/crowd-check.json`; neutral measurements are in `measurements.json` beside it.
