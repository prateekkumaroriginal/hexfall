# Fantasy willow

Reserved for possible use in future levels. This asset is not part of the current game or its production build.

`tree.glb` is the converted `STWillow2` model from **Stylized Trees Pack** by **Elijah Cobden**.

- Source: https://elijahcobden.itch.io/stylized-trees-pack
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), also recorded in `LICENSE.txt`.
- Geometry: 3,552 triangles and two material primitives, for bark and hanging leaves.
- Download size: about 0.91 MB, with textures embedded.
- Coordinates: glTF Y up, with the ground pivot centered. Scale the model to the chosen level's tree height.

The authored FBX geometry and alpha texture are retained. Conversion resizes textures to 1024 pixels, bakes the original Unity leaf shader's two colors into vertex colors, and normalizes the ground pivot. Unity wind animation is omitted.

`source/` contains the original FBX, bark and leaf textures, and Unity leaf material parameters for reference and future manual editing. `manifest.json` records their checksums and the converted model's provenance.

See [future level asset notes](../../../docs/future-level-assets.md) before adding it to a level. Preserve this creator attribution, license link, and conversion notice in any future release that uses the model.
