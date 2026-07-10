# Fusion plotter demo data

`assembly.json` is a read-only export of `rackn_delta_assy v34` through the local Fusion MCP server.

- Fusion lengths are centimeters. The web simulator converts them to millimeters with `cmToMm: 10`.
- `transformCmRowMajor` is a row-major 4x4 matrix. Translation is stored at indices 3, 7, and 11.
- `boundingBoxCm` is an axis-aligned world-space bounding box for each occurrence.
- `motionGroups` was measured by applying a temporary `+0.1 cm` joint drive, comparing occurrence transforms, restoring the value, and running Fusion Undo.
- The Fusion document was not saved and reported `isModified: false` after the probe.

`mesh-manifest.json` maps top-level occurrences, nested component occurrences, and root-component bodies to medium-refinement binary STL files in `meshes/`. STL vertices use component-local millimeter coordinates.

- Nested occurrence transforms are local to their parent occurrence and are recursively composed to the root assembly.
- The three bodies created directly in the top assembly are exported as `root-body-*.stl` with an identity transform.
- `SG90 v1:1` is exported as one assembled parent-occurrence STL. This bakes the motor/horn child placement and servo joint rotation exactly as Fusion exports them.
- `holder_rack v3:1` remains split into its body-owning child occurrences because those children participate in the measured X motion group.

The web view now uses the exported STL geometry. Bounding boxes remain only as a fallback when an individual STL cannot be loaded.
