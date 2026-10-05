# Creature art inspection

The game currently uses the supplied Tripo orc at `public/models/tripo-orc-rigged.glb`, with its editable rig at `assets/enemies/tripo-orc-rig.blend`. The earlier editable Blender asset remains at `assets/enemies/orc.blend`, with its five-joint armature, vertex paint, packed concept reference, and studio camera. `public/models/orc.glb` and `src/game/orc-blender-data.json` remain its exports; the current game does not load them.

## Tripo game model

The left shoulder plate and its ivory spikes use rigid plate weights. Spike classification precedes the leather-strap test, and the strap mask stops at the plate boundary. Protected equipment vertices are excluded from skin-weight smoothing so the spike roots cannot stretch with the chest during a punch.

`tripo-orc-material.ts` corrects the imported skin finish at render time. A green-albedo mask gives skin a roughness floor of 0.72 and removes metallic response while preserving equipment materials. A smooth mask in bind-pose coordinates lifts the punching arm's darker albedo toward the torso's olive color. It follows the arm through animation without changing positions, normals, UVs, or skin weights.

The punching arm uses asymmetric shoulder, elbow, and wrist pivots measured inside the sculpt, including its rearward elbow position. Its IK pole points down and outward. The hinge normal keeps one sign throughout the attack, preventing a half-turn wrist flip during recovery. The upper arm shares half the hinge roll, and the wrist follows the forearm. Distance-weighted skin blends soften the joined shoulder armor/skin seams. Regression checks sample the full attack for angular jumps and excessive triangle stretching, alongside the existing rigid-fist and minimal-free-arm-sway checks.

The supplied `tripo_pbr_model_faadd513-13e0-414f-9b38-28d3d535c356_meshopt.glb` contains 1,941,648 triangles across five disconnected studies from the concept sheet. `scripts/import-tripo-orc.mjs` decodes its meshopt buffers, welds UV-seam duplicates for connectivity, selects the largest full-body figure, and simplifies that figure from 885,264 to 119,996 triangles. This doubles the earlier 60,000-triangle budget using detail from the original mesh. Attribute-aware simplification retains UV seams and normals. The original color, metallic/roughness, and normal images are copied unchanged. The rigged asset is about 17 MB; the downloaded original is untouched.

Rebuild the game copy from the downloaded source:

```powershell
node scripts/import-tripo-orc.mjs 'path/to/tripo_pbr_model_faadd513-13e0-414f-9b38-28d3d535c356_meshopt.glb'
```

The static intermediate is `public/models/tripo-orc.glb`. Build its skeleton and clips with Blender:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/rig-tripo-orc.py
```

The rig script corrects the source's three-quarter pose by turning it 120 degrees before binding, aligning its torso with gameplay +Z. It centers the figure, grounds its feet, and sets its height to about 2.9 metres. Ankle-to-hip proportions are 12% longer; the upper body's vertical extent absorbs the change to retain approximately the same overall height and width. It welds coincident mesh vertices while retaining face-corner UVs, then binds a 17-bone armature with Blender bone-heat weights. Measured eye landmarks define a separate correction for the head's remaining yaw and sideways cant. Head weights blend that correction into the neck on the neutral mesh and every facial pose. The corrected eye line is level and faces +Z. The GLB includes the corrected eye landmarks as mesh extras. Collar and trapezius weights exclude the raising arm; the blend belongs at the outer deltoid. Fists have rigid hand weights, with local wrist/elbow transitions. Shoulder equipment is identified from the original PBR maps and attached to separate hinged plate bones; plate spikes move with their cap. The chest strap stays attached to the spine. Forearm cores have no torso influence, and the elbow blend is confined to the joint. The rig has pelvis, spine, head, and paired upper arm, forearm, hand, shoulder plate, thigh, shin, and foot bones. It writes the editable `.blend` and a skinned GLB with Idle, Walk, and Punch clips. The rejected coordinate-based shader deformation has been removed.

The walk solves each leg with two-bone IK and constant segment lengths. One full left-to-left stride covers 1.4 metres, with a 0.7-metre step per leg. Feet are spaced 60 cm apart beneath the hips. Each foot rolls from heel contact through flat support to toe push-off, then returns in a continuous swing. The ankle follows the contact pivot during foot roll; the heel or toe stays planted in world space. The swing matches stance velocity at both ends, avoiding pauses between steps. The pelvis rises over the supporting leg and transfers weight laterally, turning opposite the shoulders. Arms counter-swing with elbow flexion. The head stays upright and forward throughout every clip, compensating for shoulder rotation. The punch raises the right fist beside the head, holds briefly, then accelerates downward into a hammer-fist slam at the 0.55-second melee hit. The wrist follows the forearm without folding across it, preserving the clenched fist at the raised peak. The free arm retains its incoming pose with a subtle shoulder sway throughout the attack, including clip blends and recovery. The sway moves the fist about one centimetre and fades to zero at either end of the clip. Its bone transforms are held relative to the orc, so the whole enemy can still turn toward the player. Saved animation transforms are restored before the next mixer update and after release. Two-bone arm IK preserves arm lengths. The elbow hinge plane keeps the forearm from rolling against the upper arm. The 0.45-second recovery rebounds slightly before lowering the hand; the simulation holds the orc in place throughout recovery. Rendering blends into and out of the attack rather than switching poses abruptly.

The mesh also has `Blink`, `JawOpen`, and `BrowTense` shape keys localized to measured facial landmarks. Eyelid closure, subtle resting jaw breathing, and brow tension preserve the original mesh and painted UVs. The jaw remains closed during the punch's wind-up, strike, and recovery. The skull and eye sockets are weighted entirely to the head, with a transition through the neck. This prevents torso rotation from pulling the sockets away from the separate eyeballs. Painted eye surfaces are opened beneath the retained eyelids, with opaque socket interiors preventing gaps from revealing the background. Two recessed spherical eyes with round pupils follow the same head transform and aim independently toward the wizard's 1.6-metre eye height. Gaze does not rotate or tilt the neck. The eye surfaces close with the eyelid morph and hide at full closure. Idle breathing runs over a four-second clip. Facial rhythms vary by enemy slot and follow simulation time, so pausing freezes them.

`src/game/tripo-orc.ts` pools cloned skeletons and animation mixers while sharing geometry and PBR materials. Each visible orc uses one skinned body draw and two eye draws; eye geometry and material are shared across the pool. `src/game/tripo-orc-animation.ts` tracks distance-based gait phase and walking blend. Stopped orcs settle, paused simulation freezes the pose, pooled or teleported enemies reset their gait, and culled enemies keep tracking travel. Tests verify heel/toe contacts, flat stance feet, lifted swing feet, constant limb lengths, upright head orientation, eye tracking across bearings and distances, independent facial controls, pause behavior, shared geometry, and skeleton cleanup. The first wave contains exactly one slime and one orc.

## Previous Blender model

The rejected orc was discarded. The replacement starts from an empty Blender scene and contains newly built torso, limbs, hands, head, hair, and equipment. Eye sockets and the mouth are carved into the facial mesh. Brows overlap spherical amber eyes; ears have recessed inner planes. Bracers follow the forearm surfaces, the chest strap follows the torso, and the belt fits both the torso and hips. The armor includes three upper shoulder spikes and one front spike. Leather panels hang separately over the thighs. The source also contains stitches, rivets, buckles, scars, hair strands, and surface scuffs.

This remains an interpretation of the painted reference, not an exact reproduction. The facial planes, hair masses, muscle transitions, equipment contours, and wear placement still differ. Geometric dimensions and rendering checks do not establish artistic equivalence.

The slime retains its existing offline sculpture and procedural detail assembly. Its geometry is unchanged.

## Inspecting the game model

Run `pnpm dev` and open `/creature-studio.html`. The viewer uses the game's renderer, materials, and joint transforms. It provides front, three-quarter, side, rear, and face views, clay and wireframe modes, concept comparisons, and measurements.

The comparison reads `orc-concept.png` and `slime-concept.png` from `local-artifacts/enemy-concepts/`. Those local image files are not included separately in the repository. The orc reference is packed inside the Blender source. Missing browser references are reported in the viewer. Full-body comparisons align reference crops to the model's projected height. Lighting and perspective differ between the concept, Blender studio, and game. The sheet has no orc side view or slime rear view; the viewer labels the front reference when substituting it.

Measurement exports report world-space bounds and twelve triangle cross-sections from feet to crown. The width ratios describe geometry, not artistic similarity.

## Editing and exporting Blender

Open `assets/enemies/orc.blend` in Blender 5.2.2 LTS. Edit the named meshes and their `Paint` color attributes, then save. Mesh custom properties `creature_bone` and `creature_surface` determine the game's joint and material batches. Keep those properties when adding or replacing parts. The runtime uses the fixed five pivots in `scripts/build-orc-blender.py`; changing the rig's joints also requires updating those pivots.

Prefer Blender MCP for live edits and viewport inspection. The current source has been inspected and edited through its `get_scene_info`, `execute_blender_code`, and `get_viewport_screenshot` tools. The live scene is organized into anatomy, hair, equipment, and detail collections. To export through `execute_blender_code`, load `scripts/build-orc-blender.py` with `importlib.util`, populate its `MODELS` list with meshes carrying `creature_bone`, and call `export_batches()`. Save the `.blend` after editing. This keeps the GLB and packed game geometry synchronized.

For an offline batch export, run this from the repository root with PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' assets/enemies/orc.blend --background --python scripts/build-orc-blender.py -- --export-only
pnpm exec prettier --write src/game/orc-blender-data.json
```

This writes both the GLB and packed game buffers. It preserves the saved sculpture and paint. The GLB has skin weights and five joints; walk and punch animation remain in the game's pooled renderer. The GLB does not contain animation clips.

To build the replacement in an empty Blender scene and replace the source and game exports:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-orc-replacement.py -- --publish
pnpm exec prettier --write src/game/orc-blender-data.json
```

Without `--publish`, the script writes review assets to `local-artifacts/orc-replacement/`. Add `--no-render` to skip Cycles renders, or use `--anatomy` to inspect the unclothed sculpture. Supply the original concept at `local-artifacts/enemy-concepts/orc-concept.png` to reproduce the projected paint. Without it, the generator uses its material palette. The source packs the supplied reference.

Use `--publish --render-only` to refresh the inspection renders from the saved source without rebuilding or exporting. Add `--view front`, `quarter`, `face`, or `rear` to render one view.

`scripts/build-orc-blender.py` supplies mesh, paint, rig, and export utilities. Its previous sculpture builders have been removed, and the rejected mesh-refinement script has been deleted. Running it without `--export-only` delegates to the replacement builder.

`node scripts/sculpt-creatures.mjs` rebuilds the slime's quantized closed sculpture. Clothing and other slime details remain in `src/game/creature-models.ts`.

## Limits and verification

The orc has no triangle budget. Sculpted surfaces are retained without decimation, and the game export uses 32-bit indices so larger meshes do not hit a 65,535-vertex batch limit. The exact triangle and buffer counts are recorded by the creature studio and the export log. The slime is unchanged.

The Blender export tests check decoded attributes, normal lengths, color ranges, triangle areas, index bounds, GLB vertex paint, skin joints, and agreement between GLB and game triangle counts. Existing creature tests cover crowd submission, culling, shared textures, disposal, and slime birth behavior. Slime sculpture tests check closed topology and winding.

Validation commands are `pnpm test`, `pnpm lint`, and `pnpm build`. The production build retains its large-chunk warning.

Review images and measurements are saved in `local-artifacts/orc-replacement/`. Blender MCP provides live mesh edits and viewport inspection. The collaborative browser supports game inspection; older captures in that directory used headless Edge. Render checks validate submission and compilation, not artistic fidelity.
