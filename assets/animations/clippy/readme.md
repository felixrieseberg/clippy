Here's the lay of the land — and one gotcha that'll save you a confusing hour.

  Edit this one file in GIMP

  assets/animations/clippy/map.png — the master sprite sheet. It's a plain, static PNG (3348 × 3162), laid out as a 27-column × 34-row grid of 124 × 93-pixel cells. Each cell is a single animation frame. This is the source of truth, and
  it's GIMP-friendly.

  GIMP tip: set up the grid so your edits stay aligned to frames:
  - Image → Configure Grid… → spacing 124 (width) × 93 (height)
  - View → Show Grid and View → Snap to Grid
  - Keep the background transparent (it's an alpha PNG) and export as PNG.

  Its companion assets/animations/clippy/animations.json maps each animation's frames to grid cells (Column/Row) and frame durations. You only need to touch it if you're adding/removing/reordering frames — for just redrawing Clippy
  (bloodshot eyes, stubble, etc.), leave it alone and paint over the existing cells.

  Don't edit these directly

  src/renderer/images/animations/*.png are generated APNGs (animated PNGs with frame timing baked in). GIMP doesn't handle APNG well — it'll flatten them to a single frame and you'll lose the animation. Treat them as build output.

  Regenerate after editing — with the --force gotcha

  After you save map.png, re-slice it back into the per-animation APNGs:

  brew install imagemagick apngasm jq    # one-time, the script needs these

  ⚠️ The npm run extract-animations script skips files that already exist — so on its own it won't pick up your edits. Run it with --force (or delete the target PNGs first):

  ./tools/extract-animations.sh \
    -j ./assets/animations/clippy/animations.json \
    -s ./assets/animations/clippy/map.png \
    -o src/renderer/images/animations \
    --force

  That regenerates all 44 sprite files and src/renderer/clippy-animations.tsx (the import/duration table the app uses). Then npm start to see him.

  ---
  So the loop is: paint map.png in GIMP → run the extract script with --force → npm start. This is exactly the right path for the disheveled-Clippy work we shelved earlier — a human in GIMP is the tool I couldn't be.

  Want me to add a extract-animations:force script to package.json so you don't have to remember the long command + flag each time?
