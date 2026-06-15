# -*- coding: utf-8 -*-
"""Inspect boundary loops in the head mesh."""
import trimesh
import numpy as np
from collections import defaultdict

INPUT = r"public/models/head-polygon/tete_clean.glb"

scene = trimesh.load(INPUT, force="scene")
geom = next(g for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh))

# --- Find boundary edges (appear in only one triangle) -------------------
edges_sorted = np.sort(geom.edges, axis=1)
unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
boundary_edges = unique_edges[counts == 1]
print(f"Total boundary edges: {len(boundary_edges)}")

# --- Trace connected boundary loops --------------------------------------
adj = defaultdict(set)
for e in boundary_edges:
    adj[e[0]].add(e[1])
    adj[e[1]].add(e[0])

visited_verts = set()
loops = []
for start in list(adj.keys()):
    if start in visited_verts:
        continue
    loop = []
    current = start
    prev = None
    while True:
        visited_verts.add(current)
        loop.append(current)
        nexts = adj[current] - ({prev} if prev is not None else set())
        if not nexts:
            break
        nxt = next(iter(nexts))
        if nxt in visited_verts:
            break
        prev = current
        current = nxt
    loops.append(loop)

loops.sort(key=len)
print(f"Distinct boundary loops: {len(loops)}")
print()
verts = geom.vertices
for i, loop in enumerate(loops):
    pts = verts[loop]
    cx, cy, cz = pts.mean(axis=0)
    span = pts.max(axis=0) - pts.min(axis=0)
    print(f"  Loop {i:2d}: {len(loop):4d} verts  center=({cx:6.2f},{cy:6.2f},{cz:6.2f})  span=({span[0]:.2f},{span[1]:.2f},{span[2]:.2f})")
