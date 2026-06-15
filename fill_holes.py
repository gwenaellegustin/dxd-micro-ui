# -*- coding: utf-8 -*-
"""
Fill all boundary loops in tete_clean.glb.
- Small loops (< MIN_LARGE_LOOP verts): already handled by trimesh.repair.fill_holes()
- Large loops: centroid-fan triangulation with correct winding order
"""
import trimesh
import numpy as np
from collections import defaultdict

INPUT  = "public/models/head-polygon/tete_clean.glb"
OUTPUT = "public/models/head-polygon/tete_clean_filled.glb"

MIN_LARGE_LOOP = 10   # loops with >= this many verts get fan-filled manually


def find_boundary_loops(vertices, faces):
    """Return list of vertex-index lists, each forming one closed boundary loop."""
    edges = np.sort(
        np.stack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]], axis=0)
        .reshape(-1, 2),
        axis=1,
    )
    unique_edges, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = unique_edges[counts == 1]

    adj = defaultdict(set)
    for e in boundary:
        adj[e[0]].add(e[1])
        adj[e[1]].add(e[0])

    visited = set()
    loops = []
    for start in list(adj.keys()):
        if start in visited:
            continue
        loop, current, prev = [], start, None
        while True:
            visited.add(current)
            loop.append(int(current))
            nexts = adj[current] - ({prev} if prev is not None else set())
            if not nexts:
                break
            nxt = next(iter(nexts))
            if nxt in visited:
                break
            prev, current = current, nxt
        if len(loop) >= 3:
            loops.append(loop)
    return loops


def fill_loop_fan(vertices, normals, loop):
    """
    Fill one boundary loop with a centroid fan.
    Returns (new_vertex, new_faces_array).
    """
    pts = vertices[loop]
    centroid = pts.mean(axis=0)
    new_v = len(vertices)
    n = len(loop)

    tris = [[loop[i], loop[(i + 1) % n], new_v] for i in range(n)]

    # Check winding vs. average loop-vertex normal
    v0 = pts[0]
    v1 = pts[1 % n]
    fill_normal = np.cross(v1 - v0, centroid - v0)
    avg_normal = normals[loop].mean(axis=0)
    if np.dot(fill_normal, avg_normal) < 0:
        tris = [[t[0], t[2], t[1]] for t in tris]

    return np.array([centroid]), np.array(tris, dtype=np.int64)


# ---------------------------------------------------------------------------
scene = trimesh.load(INPUT, force="scene")
print("Loaded", len(scene.geometry), "mesh(es) from", INPUT)

for name, geom in scene.geometry.items():
    if not isinstance(geom, trimesh.Trimesh):
        continue

    print("\nMesh:", name)
    print("  Vertices:", len(geom.vertices), " Faces:", len(geom.faces))

    # --- Pass 1: let trimesh handle trivial holes --------------------------
    trimesh.repair.fill_holes(geom)

    # --- Pass 2: fan-fill remaining large loops ----------------------------
    vertices = geom.vertices.copy()
    faces    = geom.faces.copy()

    loops = find_boundary_loops(vertices, faces)
    large = [l for l in loops if len(l) >= MIN_LARGE_LOOP]
    print("  Large boundary loops remaining:", len(large),
          "(sizes:", [len(l) for l in sorted(large, key=len)], ")")

    all_new_verts = []
    all_new_faces = []
    vert_offset   = len(vertices)

    tmp_mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    normals  = tmp_mesh.vertex_normals

    for loop in sorted(large, key=len):
        new_v, new_f = fill_loop_fan(vertices, normals, loop)
        # shift face indices to account for previously appended vertices
        new_f_shifted = new_f.copy()
        for row in new_f_shifted:
            for k in range(3):
                if row[k] == len(vertices) + len(all_new_verts) - 1 + 1:
                    pass  # centroid index is assigned below
        # centroid vertex will be at (vert_offset + len(all_new_verts))
        centroid_idx = vert_offset + len(all_new_verts)
        new_f[:, new_f[0] == len(vertices)] = centroid_idx
        # Rebuild with correct centroid index
        pts  = vertices[loop]
        cent = pts.mean(axis=0)
        n    = len(loop)
        avg_n = normals[loop].mean(axis=0)
        v0, v1 = pts[0], pts[1 % n]
        fn = np.cross(v1 - v0, cent - v0)
        tris = [[loop[i], loop[(i + 1) % n], centroid_idx] for i in range(n)]
        if np.dot(fn, avg_n) < 0:
            tris = [[t[0], t[2], t[1]] for t in tris]

        all_new_verts.append(cent)
        all_new_faces.extend(tris)

    if all_new_verts:
        extra_v = np.array(all_new_verts)
        extra_f = np.array(all_new_faces, dtype=np.int64)
        new_vertices = np.vstack([vertices, extra_v])
        new_faces    = np.vstack([faces, extra_f])
        # Replace geometry in-place
        geom.vertices = new_vertices
        geom.faces    = new_faces.astype(np.int64)

    print("  After fill  - Vertices:", len(geom.vertices),
          " Faces:", len(geom.faces))
    print("  Watertight:", geom.is_watertight)

# ---------------------------------------------------------------------------
scene.export(OUTPUT)
print("\nSaved ->", OUTPUT)
