# Sprites

Empty for now — Micro Riders currently draws everything (cars, obstacles,
decor, hazard surfaces) as procedural vector shapes in `js/renderer.js`.

To switch a piece over to a sprite once art exists:

1. Drop the PNG in this folder.
2. Add a `key: 'filename.png'` entry to `SPRITE_MANIFEST` in `js/config.js`.

That's it — every `Renderer` draw method already checks `this.spr[key]`
first and only falls back to vector art if nothing loaded for that key, so
no other code changes are needed. Expected keys:

- **Cars** (recolored at draw time to the player's chosen color):
  `carBuggy`, `carFlash`
- **Obstacles**: `obsBlocks`, `obsBooks`, `obsMarble`, `obsPencil`, `obsBigblock`
- **Decor**: `decorBed`, `decorToybox`, `decorLamp`, `decorRugpatch`,
  `decorBall`, `decorBlockspair`, `decorSock`, `decorMarble`
- **Hazard surfaces**: `surfOil`, `surfHoney`

Cars should be drawn facing right (+X), roughly square-ish canvas around the
car silhouette, in white/light gray so the multiply-tint recoloring reads
cleanly in any of the 8 palette colors.
