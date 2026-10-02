# Orc Blender asset

`orc.blend` is the editable source. It contains the concept sheet as a packed image, named mesh parts, painted vertex colors, five game joints, and a Cycles inspection studio. Open it in Blender 5.2.2 LTS.

The portable export is `../../public/models/orc.glb`. The game uses equivalent geometry in `../../src/game/orc-blender-data.json` so enemies can share instanced batches and retain their existing animations.

After saving edits, run the export command in [creature art inspection](../../docs/creature-art.md#editing-and-exporting-blender). Retain each mesh's `creature_bone`, `creature_surface`, and `Paint` attribute. Numbered Blender backup files are ignored by Git.

The model follows the supplied concept, but its facial contours, painted muscle planes, hair, armor profiles, and wear patterns remain approximate.
