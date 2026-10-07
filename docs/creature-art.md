# Creature art inspection

The game uses `public/models/orc-rigged.glb`, with its editable rig at `assets/enemies/orc-rig.blend`. The static source for rebuilding the rig is `public/models/orc-source.glb`. The earlier five-joint model, packed export, and export scripts have been removed.

## Rigged game model

The left shoulder plate and its ivory spikes use rigid plate weights. Spike classification precedes the leather-strap test, and the strap mask stops at the plate boundary. Protected equipment vertices are excluded from skin-weight smoothing so the spike roots cannot stretch with the chest during a punch.

`orc-material.ts` corrects the imported skin finish at render time. A green-albedo mask gives skin a roughness floor of 0.72 and removes metallic response while preserving equipment materials. A smooth mask in bind-pose coordinates lifts the punching arm's darker albedo toward the torso's olive color. It follows the arm through animation without changing positions, normals, UVs, or skin weights.

The punching arm uses asymmetric shoulder, elbow, and wrist pivots measured inside the sculpt, including its rearward elbow position. Its IK pole points down and outward. The hinge normal keeps one sign throughout the attack, preventing a half-turn wrist flip during recovery. The upper arm shares half the hinge roll, and the wrist follows the forearm. Distance-weighted skin blends soften the joined shoulder armor/skin seams. Regression checks sample the full attack for angular jumps and excessive triangle stretching, alongside the existing rigid-fist and minimal-free-arm-sway checks.

`scripts/import-orc.mjs` reads a static GLB, selects the largest connected full-body figure, and simplifies it to 119,996 triangles. Attribute-aware simplification retains UV seams and normals. Color, metallic/roughness, and normal images are retained. The rigged game asset is about 17 MB.

Rebuild the game copy from the downloaded source:

```powershell
node scripts/import-orc.mjs 'path/to/source.glb'
```

The static intermediate is `public/models/orc-source.glb`. Build its skeleton and clips with Blender:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/rig-orc.py
```

The rig script corrects the source's three-quarter pose by turning it 120 degrees before binding, aligning its torso with gameplay +Z. It centers the figure, grounds its feet, and sets its height to about 2.9 metres. Ankle-to-hip proportions are 12% longer; the upper body's vertical extent absorbs the change to retain approximately the same overall height and width. It welds coincident mesh vertices while retaining face-corner UVs, then binds a 17-bone armature with Blender bone-heat weights. Measured eye landmarks define a separate correction for the head's remaining yaw and sideways cant. Head weights blend that correction into the neck on the neutral mesh and every facial pose. The corrected eye line is level and faces +Z. The GLB includes the corrected eye landmarks as mesh extras. Collar and trapezius weights exclude the raising arm; the blend belongs at the outer deltoid. Fists have rigid hand weights, with local wrist/elbow transitions. Shoulder equipment is identified from the original PBR maps and attached to separate hinged plate bones; plate spikes move with their cap. The chest strap stays attached to the spine. Forearm cores have no torso influence, and the elbow blend is confined to the joint. The rig has pelvis, spine, head, and paired upper arm, forearm, hand, shoulder plate, thigh, shin, and foot bones. It writes the editable `.blend` and a skinned GLB with Idle, Walk, and Punch clips. The rejected coordinate-based shader deformation has been removed.

The walk solves each leg with two-bone IK and constant segment lengths. One full left-to-left stride covers 1.4 metres, with a 0.7-metre step per leg. Feet are spaced 60 cm apart beneath the hips. Each foot rolls from heel contact through flat support to toe push-off, then returns in a continuous swing. The ankle follows the contact pivot during foot roll; the heel or toe stays planted in world space. The swing matches stance velocity at both ends, avoiding pauses between steps. The pelvis rises over the supporting leg and transfers weight laterally, turning opposite the shoulders. Arms counter-swing with elbow flexion. The head stays upright and forward throughout every clip, compensating for shoulder rotation. The punch raises the right fist beside the head, holds briefly, then accelerates downward into a hammer-fist slam at the 0.55-second melee hit. The wrist follows the forearm without folding across it, preserving the clenched fist at the raised peak. The free arm retains its incoming pose with a subtle shoulder sway throughout the attack, including clip blends and recovery. The sway moves the fist about one centimetre and fades to zero at either end of the clip. Its bone transforms are held relative to the orc, so the whole enemy can still turn toward the player. Saved animation transforms are restored before the next mixer update and after release. Two-bone arm IK preserves arm lengths. The elbow hinge plane keeps the forearm from rolling against the upper arm. The 0.45-second recovery rebounds slightly before lowering the hand; the simulation holds the orc in place throughout recovery. Rendering blends into and out of the attack rather than switching poses abruptly.

The mesh also has `Blink`, `JawOpen`, and `BrowTense` shape keys localized to measured facial landmarks. Eyelid closure, subtle resting jaw breathing, and brow tension preserve the original mesh and painted UVs. The jaw remains closed during the punch's wind-up, strike, and recovery. The skull and eye sockets are weighted entirely to the head, with a transition through the neck. This prevents torso rotation from pulling the sockets away from the separate eyeballs. Painted eye surfaces are opened beneath the retained eyelids, with opaque socket interiors preventing gaps from revealing the background. Two recessed spherical eyes with round pupils follow the same head transform and aim independently toward the wizard's 1.6-metre eye height. Gaze does not rotate or tilt the neck. The eye surfaces close with the eyelid morph and hide at full closure. Idle breathing runs over a four-second clip. Facial rhythms vary by enemy slot and follow simulation time, so pausing freezes them.

`src/game/orc-renderer.ts` pools cloned skeletons and animation mixers while sharing geometry and PBR materials. Each visible orc uses one skinned body draw and two eye draws; eye geometry and material are shared across the pool. `src/game/orc-animation.ts` tracks distance-based gait phase and walking blend. Stopped orcs settle, paused simulation freezes the pose, pooled or teleported enemies reset their gait, and culled enemies keep tracking travel. Tests verify heel/toe contacts, flat stance feet, lifted swing feet, constant limb lengths, upright head orientation, eye tracking across bearings and distances, independent facial controls, pause behavior, shared geometry, and skeleton cleanup. The first wave contains exactly one slime and one orc.

## Inspecting the game model

Run `pnpm dev` and open `/creature-studio.html`. The viewer uses the game's renderer, materials, and joint transforms. It provides front, three-quarter, side, rear, and face views, clay and wireframe modes, concept comparisons, and measurements.

The comparison reads `orc-concept.png` and `slime-concept.png` from `local-artifacts/enemy-concepts/`. Those local image files are not included separately in the repository. Missing browser references are reported in the viewer. Full-body comparisons align reference crops to the model's projected height. Lighting and perspective differ between the concept, Blender studio, and game. The sheet has no orc side view or slime rear view; the viewer labels the front reference when substituting it.

Measurement exports report world-space bounds and twelve triangle cross-sections from feet to crown. The width ratios describe geometry, not artistic similarity.

## Editing and verification

Edit `assets/enemies/orc-rig.blend` to work on the current rig. The rebuild commands above regenerate it from the static source, so save any hand-edited work before rebuilding.

`node scripts/sculpt-creatures.mjs` rebuilds the slime's quantized closed sculpture. Slime details remain in `src/game/creature-models.ts`.

Tests check attack timing, foot contact, deformation, eye tracking, shared geometry, culling, resource disposal, and slime birth. They retain the orc's 120,000-triangle upper budget without requiring an exact triangle or bone count. Slime sculpture tests check closed topology and winding. These checks do not judge artistic quality.

Run `pnpm test`, `pnpm lint`, and `pnpm build`, then inspect the game and creature studio. The production build retains its large-chunk warning. Browser scripts capture screenshots or performance measurements; they do not compare screenshots or prove that animation looks good.
