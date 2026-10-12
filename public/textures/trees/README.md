# Tree textures

Photographic textures from Poly Haven, licensed CC0:

- [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) by Rob Tuytel: bark color, OpenGL normal, and AO/roughness/metal maps.
- [Tree Small 02](https://polyhaven.com/a/tree_small_02) by Rico Cilliers: leaf color, alpha, and OpenGL normal maps. Only its textures are used; the game's tree geometry is generated locally.
- [Poly Haven license](https://polyhaven.com/license).

The bark maps are 1024 × 1024 JPEGs. Eight photographed leaves were isolated from the source atlas and packed into a 1024 × 512 RGBA color atlas and matching OpenGL normal atlas, with transparent padding. Leaf alpha is packed into color so foliage needs no separate alpha texture. JPEGs were recompressed for the browser.

Color textures use sRGB. Normal and packed surface maps use linear data. All trees share these five maps, which the environment releases when the game is disposed.
