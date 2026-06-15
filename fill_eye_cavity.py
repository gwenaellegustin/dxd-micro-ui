# -*- coding: utf-8 -*-
"""
Create tete_1_filled.glb: copy of tete_1.glb with both eye cavities capped.

Strategy per eye:
  1. Collect all boundary-edge vertices within a search sphere around the eye.
  2. Project them to 2D (XY plane, since Z is face-forward in this model).
  3. Compute the 2D convex hull to get the outer rim.
  4. Fan-triangulate the hull from a new centroid vertex.
  5. Add the cap faces + centroid to the mesh.
"""
import trimesh
import numpy as np
from collections import defaultdict
from scipy.spatial import ConvexHull

INPUT  = "public/models/head-polygon/tete_1.glb"
OUTPUT = "public/models/head-polygon/tete_1_filled.glb"

# Approximate eye centres (X, Y, Z) in model space + search radius.
# Z is face-forward (positive = front).  Adjust radius if the hull looks wrong.
EYE_REGIONS = [
    (np.array([ 0.69, 4.41, 1.68]), 0.4),   # right eyelid
    (np.array([-0.69, 4.41, 1.68]), 0.4),   # left eyelid
]


def find_boundary_verts(faces):
    edges = np.sort(
        np.stack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]).reshape(-1, 2),
        axis=1,
    )
    unique_edges, counts = np.unique(edges, axis=0, return_counts=True)
    return np.unique(unique_edges[counts == 1])


# ---------------------------------------------------------------------------
scene = trimesh.load(INPUT, force="scene")
print("Loaded", INPUT)

for name, geom in scene.geometry.items():
    if not isinstance(geom, trimesh.Trimesh):
        continue

    print(f"\nMesh: {name}  ({len(geom.vertices)} verts, {len(geom.faces)} faces)")

    bverts = find_boundary_verts(geom.faces)
    bpts   = geom.vertices[bverts]

    extra_verts = []
    extra_faces = []

    for center, radius in EYE_REGIONS:
        # --- 1. Boundary verts near this eye --------------------------------
        dists   = np.linalg.norm(bpts - center, axis=1)
        mask    = dists < radius
        near_gidx = bverts[mask]       # global vertex indices
        near_pts  = geom.vertices[near_gidx]

        if len(near_pts) < 4:
            print(f"  Eye at {center}: too few boundary verts ({len(near_pts)}), skipped.")
            continue

        # --- 2. 2D convex hull (XY projection) ------------------------------
        try:
            hull = ConvexHull(near_pts[:, :2])
        except Exception as e:
            print(f"  Eye at {center}: ConvexHull failed ({e}), skipped.")
            continue

        hull_gidx = near_gidx[hull.vertices]   # global indices of hull rim
        hull_pts  = geom.vertices[hull_gidx]   # 3-D positions of hull rim
        n = len(hull_gidx)

        # --- 3. Centroid vertex (new) at max Z of hull verts ---------------
        cap_z      = hull_pts[:, 2].max()
        centroid   = np.array([hull_pts[:, 0].mean(),
                               hull_pts[:, 1].mean(),
                               cap_z])
        centroid_gidx = len(geom.vertices) + len(extra_verts)
        extra_verts.append(centroid)

        # --- 4. Fan-triangulate the hull ------------------------------------
        tris = [[hull_gidx[i], hull_gidx[(i + 1) % n], centroid_gidx]
                for i in range(n)]

        # Fix winding: cap should face forward (+Z)
        v0, v1 = hull_pts[0], hull_pts[1]
        fn = np.cross(v1 - v0, centroid - v0)
        if fn[2] < 0:
            tris = [[t[0], t[2], t[1]] for t in tris]

        extra_faces.extend(tris)
        print(f"  Eye at {np.round(center, 2)}: {len(near_pts)} boundary verts, "
              f"hull={n} verts, cap_z={cap_z:.3f}, +{len(tris)} faces")

    # --- Merge into geometry ------------------------------------------------
    if extra_verts:
        geom.vertices = np.vstack([geom.vertices, np.array(extra_verts)])
        geom.faces    = np.vstack([geom.faces,
                                   np.array(extra_faces, dtype=np.int64)])

    print(f"  Result: {len(geom.vertices)} verts, {len(geom.faces)} faces")

# ---------------------------------------------------------------------------
scene.export(OUTPUT)
print(f"\nSaved -> {OUTPUT}")
