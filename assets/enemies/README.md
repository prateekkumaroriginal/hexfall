# Orc Blender asset

The game currently uses the rigged Tripo model at `../../public/models/tripo-orc-rigged.glb`. Its editable 17-bone rig, baked animation clips, and Blink/JawOpen/BrowTense facial shape keys are in `tripo-orc-rig.blend`. Import and rig export commands are documented in [creature art inspection](../../docs/creature-art.md#tripo-game-model). The files below remain the previous editable Blender asset and exports.

`orc.blend` is the editable source. It contains the concept sheet as a packed image, named mesh parts, painted vertex colors, five game joints, and a Cycles inspection studio. Open it in Blender 5.2.2 LTS.

The portable export is `../../public/models/orc.glb`. Equivalent geometry in `../../src/game/orc-blender-data.json` supports the previous instanced rig and its validation tests. The current game does not load that data.

After saving edits, run the export command in [creature art inspection](../../docs/creature-art.md#editing-and-exporting-blender). Retain each mesh's `creature_bone`, `creature_surface`, and `Paint` attribute. Numbered Blender backup files are ignored by Git.

The rejected sculpture has been replaced. `scripts/build-orc-replacement.py` starts from an empty Blender scene and builds the new anatomy, carved eye sockets, brows, cupped ears, swept hair, clenched hands, fitted equipment, and separate hanging panels. It never loads the previous model. `scripts/build-orc-blender.py` contains shared mesh/export utilities; the previous sculpture builders and refinement script have been removed.

The model follows the supplied concept, but its facial contours, painted muscle planes, hair, armor profiles, and wear patterns remain approximate.

There is no triangle cap for the orc. The builder preserves the voxel sculpt, adds carved finger folds, forged armor bevels and individual leather stitches, and exports 32-bit indices. `scripts/refine-orc-concept.py` applies the proportion and equipment fitting pass to both fresh builds and live MCP edits.
