# Assets reserved for future levels

## Fantasy willow

The fantasy willow is retained for possible use in future levels. It is not used by the current game, imported by its renderer, or included in the production build. The temporary tree selection URLs and the painted and fluffy experiments have been removed. The current arena uses its original trees.

The model and its source files are in [assets/future-levels/fantasy-willow](../assets/future-levels/fantasy-willow/README.md). Keeping them outside `public/` prevents the unused model from being shipped with the current game.

The willow is Elijah Cobden's `STWillow2` from [Stylized Trees Pack](https://elijahcobden.itch.io/stylized-trees-pack), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Its converted GLB has 3,552 triangles, two material primitives, embedded textures, and a size of about 0.91 MB. The source leaf curtains and bark geometry are preserved. The source textures are resized to 1024 pixels, the Unity leaf shader's colors are baked into vertex colors, and the ground pivot is centered. Wind animation is omitted.

When a future level adopts it, choose its placement and scale for that level and load it only when the level needs it. Its long hanging foliage can hide enemies and paths, so review visibility and place collision volumes against the trunk shape. The retained model has no gameplay collision data or current arena placement. Preserve the creator credit, license link, and conversion notice when shipping it.
