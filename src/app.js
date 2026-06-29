// Inspired by https://github.com/mrdoob/three.js/blob/master/examples/webgl_decals.html
//* Backup of import in case of auto delete
// import * as THREE from "three";
// import { GUI } from "three/addons/libs/lil-gui.module.min.js";
// import Stats from "three/addons/libs/stats.module.js";
// import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
// import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as colorjs from "./color.js";
import { navigate } from "./nav.js";
import { onMount, onUnmount } from "./router.js";

const container = document.getElementById("container");

//* Define in example
let renderer, scene, camera, stats, mesh, raycaster, line;
const intersection = {
  intersects: false,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
};
const mouse = new THREE.Vector2();
const intersects = [];

//* Model point
let controls;
let headMaxDim = 20; // updated after model load, used to scale decals

//* Drawing
const textureLoader = new THREE.TextureLoader();
const decalMaterial = new THREE.MeshBasicMaterial({
  map: createDecalTexture(),
  transparent: true,
  depthTest: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
});
const decals = [];
const decalData = [];
let pendingSession = null;
let sessionStart = Date.now();
let mouseHelper;
const position = new THREE.Vector3();
const orientation = new THREE.Euler();
const size = new THREE.Vector3(10, 10, 10);

let colorSelected = 0xffd000;
let sizeSelected = 0.1;
const SIZE_MIN = 0.5;
const SIZE_MAX = 1.8;
const SIZE_GROW_DURATION = 4000;
const PREVIEW_DELAY = 200;
const RING_BORDER = 0.01;
let isPressing = false;
let pressOriginatedOutside = false;
let pressStart = 0;
let previewMesh;
let hapticInterval = null;

let _appInitialized = false;
let _modelLoaded = false;

//////////////////////////* Lifecycle

function clearDecals() {
  decals.forEach((d) => mesh?.remove(d));
  decals.length = 0;
  decalData.length = 0;
}

function restoreDecals(savedDecals) {
  if (!mesh || !savedDecals?.length) return;
  const texMap = {
    point: createDecalTexture(),
    pulse: createPulseTexture(),
    acute: createAcuteLineTexture(),
  };
  for (const d of savedDecals) {
    const pos = new THREE.Vector3(...d.position);
    const ori = new THREE.Euler(...d.orientation);
    const sz = new THREE.Vector3(...d.size);
    const mat = decalMaterial.clone();
    mat.color.setHex(d.color);
    if (texMap[d.tool]) {
      mat.map = texMap[d.tool];
      mat.needsUpdate = true;
    }
    const m = new THREE.Mesh(new DecalGeometry(mesh, pos, ori, sz), mat);
    m.renderOrder = decals.length;
    decals.push(m);
    mesh.attach(m);
    decalData.push(d);
  }
}

function mountApp() {
  pendingSession = JSON.parse(
    sessionStorage.getItem("pending-session") || "null",
  );
  sessionStart = pendingSession?.timestamp ?? Date.now();

  if (!_appInitialized) {
    init();
    _appInitialized = true;
  } else {
    clearDecals();
    if (_modelLoaded && pendingSession?.decals?.length) {
      restoreDecals(pendingSession.decals);
    }
    renderer.setAnimationLoop(animate);
    onWindowResize();
  }
}

function unmountApp() {
  if (renderer) renderer.setAnimationLoop(null);
}

onMount("app", mountApp);
onUnmount("app", unmountApp);

//////////////////////////* Init

function init() {
  //*FPS info
  // stats = new Stats();
  // container.appendChild(stats.dom);

  //*Scene
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setAnimationLoop(animate);
  container.appendChild(renderer.domElement);
  scene = new THREE.Scene();

  //*Camera
  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    1,
    1000,
  );
  camera.position.z = 120;

  //*Lights
  scene.add(new THREE.AmbientLight(0x666666));
  const dirLight1 = new THREE.DirectionalLight(0xffddcc, 3);
  dirLight1.position.set(1, 0.75, 0.5);
  scene.add(dirLight1);
  const dirLight2 = new THREE.DirectionalLight(0xccccff, 3);
  dirLight2.position.set(-1, 0.75, -0.5);
  scene.add(dirLight2);

  //*Control
  controls = new OrbitControls(camera, renderer.domElement);
  // controls.minDistance = 50; // Redefine after base on head size
  // controls.maxDistance = 200; // Redefine after base on head size

  //*Interaction
  const tapHintEl = document.getElementById("hint");
  window.addEventListener("resize", onWindowResize);
  let moved = false;
  controls.addEventListener("change", function () {
    moved = true;
    isPressing = false;
    stopHaptic();
    if (previewMesh) previewMesh.visible = false;
    line.visible = false;
  });
  window.addEventListener("pointerdown", function (event) {
    if (!container.contains(event.target)) {
      pressOriginatedOutside = true;
    }
  });
  container.addEventListener("pointerdown", function (event) {
    if (pressOriginatedOutside) return;
    moved = false;
    isPressing = true;
    pressStart = Date.now();
    sizeSelected = SIZE_MIN;
    checkIntersection(event.clientX, event.clientY);
  });
  window.addEventListener("pointerup", function (event) {
    if (moved === false && isPressing && intersection.intersects) {
      const isTap = Date.now() - pressStart < PREVIEW_DELAY;
      if (isTap) {
        sizeSelected = SIZE_MIN * 0.6;
        if (decals.length === 0) {
          clearTimeout(colorHideTimeout);
          tapHintEl.classList.add("hidden");
          tapHintEl.textContent = "Press and hold to expand the area";
          tapHintEl.style.color = "white";
          tapHintEl.style.textAlign = "center";
          void tapHintEl.offsetWidth;
          tapHintEl.classList.remove("hidden");
        }
      } else {
        tapHintEl.classList.add("hidden");
      }
      shoot();
    }
    isPressing = false;
    pressOriginatedOutside = false;
    controls.enabled = true;
    stopHaptic();
    if (previewMesh) previewMesh.visible = false;
    line.visible = false;
  });
  window.addEventListener("pointercancel", function () {
    isPressing = false;
    pressOriginatedOutside = false;
    controls.enabled = true;
    stopHaptic();
    if (previewMesh) previewMesh.visible = false;
    line.visible = false;
  });
  window.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", function () {
    if (isPressing) {
      isPressing = false;
      controls.enabled = true;
      stopHaptic();
      if (previewMesh) previewMesh.visible = false;
      line.visible = false;
    }
  });

  //*Model
  loadGlbCloudPoint("models/head-polygon/tete_1.glb");
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

  //*Draw on head
  line = new THREE.Line(geometry, new THREE.LineBasicMaterial());
  line.visible = false;
  scene.add(line);
  raycaster = new THREE.Raycaster();
  mouseHelper = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 10),
    new THREE.MeshNormalMaterial(),
  );
  mouseHelper.visible = false;
  scene.add(mouseHelper);

  //* Color picker
  const colorBar = document.getElementById("color-bar");
  let colorSliderTouched = false;
  const painLevels = [
    [10, "Able to ignore it"],
    [20, "Mildly distracted"],
    [30, "Distracted"],
    [40, "Making mistakes"],
    [50, "Can't work"],
    [60, "Laying down resting"],
    [70, "Crying and/or moaning"],
    [80, "Can't move"],
    [90, "Need ambulance"],
    [100, "Need sedation"],
  ];
  const applySliderColor = (target) => {
    const hex = colorjs.getColorFromRangeValue(target.value, target.max);
    target.style.setProperty("--slider-color", hex);
    colorSelected = parseInt(hex.replace("#", ""), 16);
    return hex;
  };
  colorBar.addEventListener("input", (event) => {
    const hex = applySliderColor(event.target);
    const pct = (Number(event.target.value) / Number(event.target.max)) * 100;
    tapHintEl.textContent =
      painLevels.find(([threshold]) => pct <= threshold)?.[1] ??
      painLevels.at(-1)[1];
    tapHintEl.style.color = hex;
    tapHintEl.style.textAlign = pct <= 50 ? "right" : "left";
    tapHintEl.classList.remove("hidden");
    colorSliderTouched = true;
  });
  let colorHideTimeout;
  colorBar.addEventListener("change", () => {
    clearTimeout(colorHideTimeout);
    colorHideTimeout = setTimeout(
      () => tapHintEl.classList.add("hidden"),
      1000,
    );
  });
  applySliderColor(colorBar);

  const cancelButton = document.getElementById("cancel-btn");
  cancelButton.addEventListener("click", (event) => {
    const toRemove = decals.pop();
    mesh.remove(toRemove);
    decalData.pop();
  });

  const cancelAllButton = document.getElementById("cancel-all-btn");
  cancelAllButton.addEventListener("click", (event) => {
    event.preventDefault();
    decals.forEach(function (d) {
      mesh.remove(d);
    });
    decals.length = 0;
    decalData.length = 0;
  });

  document.getElementById("close-btn").addEventListener("click", () => {
    sessionStorage.removeItem("pending-session");
    navigate("index.html");
  });

  const validateButton = document.getElementById("validate-btn");
  validateButton.addEventListener("click", () => {
    sessionStorage.setItem(
      "pending-session",
      JSON.stringify({
        ...(pendingSession ?? {}),
        timestamp: sessionStart,
        decals: [...decalData],
      }),
    );
    navigate("evolution.html");
  });

  const infoButton = document.getElementById("info");
  const infoPopup = document.getElementById("info-popup");
  const infoBackdrop = document.getElementById("info-popup-backdrop");
  const closeInfo = () => {
    infoPopup.classList.add("hidden");
    infoBackdrop.classList.add("hidden");
  };
  infoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isHidden = infoPopup.classList.toggle("hidden");
    infoBackdrop.classList.toggle("hidden", isHidden);
    if (!isHidden) {
      const current = document.querySelector(
        "input[name='tool']:checked",
      )?.value;
      document
        .querySelectorAll(".info-popup-item[data-tool]")
        .forEach((item) => {
          item.classList.toggle("selected", item.dataset.tool === current);
        });
    }
  });
  infoBackdrop.addEventListener("click", closeInfo);
  document.querySelectorAll(".info-popup-item[data-tool]").forEach((item) => {
    item.addEventListener("click", () => {
      const radio = document.getElementById(item.dataset.tool);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      closeInfo();
    });
  });

  //* Press-size preview ring
  previewMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.0, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    }),
  );
  previewMesh.renderOrder = 999;
  previewMesh.visible = false;
  scene.add(previewMesh);

  //* Show tap hint after 1.5 s if no shoot yet
  setTimeout(() => {
    if (decals.length === 0 && !colorSliderTouched && !isPressing) {
      clearTimeout(colorHideTimeout);
      tapHintEl.textContent = "Press and hold to expand the area";
      tapHintEl.style.color = "white";
      tapHintEl.style.textAlign = "center";
      tapHintEl.classList.remove("hidden");
    }
  }, 1500);

  //* Tool picker
  const toolTextures = {
    point: createDecalTexture(),
    pulse: createPulseTexture(),
    acute: createAcuteLineTexture(),
  };
  document.querySelectorAll("input[name='tool']").forEach((radio) => {
    radio.addEventListener("change", () => {
      const tex = toolTextures[radio.value];
      if (tex) {
        decalMaterial.map = tex;
        decalMaterial.needsUpdate = true;
      }
    });
  });
}

//////////////////////////* Move
function onWindowResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

function animate() {
  if (isPressing && previewMesh) {
    const elapsed = Date.now() - pressStart;
    const sizeMax = Math.min(SIZE_MAX, headMaxDim / 2);
    sizeSelected =
      SIZE_MIN +
      Math.min(Math.max(elapsed - PREVIEW_DELAY, 0) / SIZE_GROW_DURATION, 1) *
        (sizeMax - SIZE_MIN);

    const activeTool = document.querySelector(
      "input[name='tool']:checked",
    )?.value;
    if (
      elapsed >= PREVIEW_DELAY + SIZE_GROW_DURATION &&
      hapticInterval !== null &&
      activeTool !== "point"
    ) {
      stopHaptic();
    }

    if (intersection.intersects && elapsed > PREVIEW_DELAY) {
      controls.enabled = false;
      if (!previewMesh.visible) {
        startHaptic(
          document.querySelector("input[name='tool']:checked")?.value,
        );
      }
      previewMesh.visible = true;
      line.visible = true;
      previewMesh.position.copy(intersection.point);
      previewMesh.rotation.copy(mouseHelper.rotation);
      const outerR = sizeSelected / 2;
      const innerR = Math.max(0, outerR - RING_BORDER);
      previewMesh.geometry.dispose();
      previewMesh.geometry = new THREE.RingGeometry(innerR, outerR, 48);
    }
  } else {
    line.visible = false;
  }
  renderer.render(scene, camera);
  // stats.update();
}

//////////////////////////* Haptic feedback
function startHaptic(tool) {
  if (!navigator.vibrate || hapticInterval !== null) return;

  if (tool === "point") {
    // High-frequency heartbeat trick:
    // Requests a 200ms vibration every 100ms. This forces the hardware
    // to stay at full power continuously without ever spinning down.
    navigator.vibrate(200);
    hapticInterval = setInterval(() => {
      navigator.vibrate(200);
    }, 100);
  } else if (tool === "pulse") {
    // Fast-attack, slow-decay wave: Jumps into action immediately,
    // hits a heavy peak, and then gradually slopes down over a 4-second cycle.
    const pulseSteps = [350, 480, 350, 220, 120, 50, 0, 0];
    let currentStep = 0;

    // Trigger the strong initial step instantly on touch
    navigator.vibrate(pulseSteps[currentStep]);
    currentStep = (currentStep + 1) % pulseSteps.length;

    // Maintain the slow 500ms pace for the gradual fade-out
    hapticInterval = setInterval(() => {
      navigator.vibrate(pulseSteps[currentStep]);
      currentStep = (currentStep + 1) % pulseSteps.length;
    }, 500);
  } else if (tool === "acute") {
    // Sharp discharge: 6ms burst then silence, 4 Hz
    const pattern = [6, 50, 6, 188];
    const duration = pattern.reduce((a, b) => a + b, 0);
    navigator.vibrate(pattern);
    hapticInterval = setInterval(() => navigator.vibrate(pattern), duration);
  }
}

function stopHaptic() {
  clearInterval(hapticInterval);
  hapticInterval = null;
  if (navigator.vibrate) navigator.vibrate(0);
}

//////////////////////////* Load models
function loadGlbCloudPoint(glbPath) {
  const loader = new GLTFLoader();
  loader.load(glbPath, function (gltf) {
    gltf.scene.scale.multiplyScalar(50);
    gltf.scene.updateMatrixWorld(true);

    // Pick the first mesh as the raycasting target (kept invisible)
    gltf.scene.traverse((child) => {
      if (child.isMesh && mesh === undefined) {
        mesh = child;
        mesh.material = new THREE.MeshPhongMaterial({
          colorWrite: false,
          depthWrite: true,
        });
      }
    });

    scene.add(gltf.scene);

    // Build point cloud from all meshes, and cap open holes with black fills
    const allPositions = [];
    const blackFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        const pts = samplePointsOnMesh(child.geometry, 5000);
        for (let i = 0; i < pts.length; i += 3) {
          const v = new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]);
          v.applyMatrix4(child.matrixWorld);
          allPositions.push(v.x, v.y, v.z);
        }
        // Cap each open boundary loop with a black polygon
        const fillGeo = fillMeshHoles(child.geometry);
        if (fillGeo) {
          const fillMesh = new THREE.Mesh(fillGeo, blackFillMaterial);
          fillMesh.applyMatrix4(child.matrixWorld);
          scene.add(fillMesh);
        }
      }
    });

    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(allPositions, 3),
    );

    pointsGeo.computeBoundingBox();
    pointsGeo.computeBoundingSphere();
    const bboxSize = new THREE.Vector3();
    pointsGeo.boundingBox.getSize(bboxSize);
    const center = new THREE.Vector3();
    pointsGeo.boundingBox.getCenter(center);

    headMaxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
    const headRadius = pointsGeo.boundingSphere.radius;

    // Fit camera & controls to model
    controls.target.copy(center);
    camera.position.set(center.x, center.y, center.z + headMaxDim * 1.8);
    controls.minDistance = headRadius + 1;
    controls.maxDistance = headMaxDim * 1.4;
    controls.update();

    // Scale mouseHelper to model size
    mouseHelper.scale.setScalar(headMaxDim * 0.01);

    const pointsMaterial = new THREE.PointsMaterial({
      size: headMaxDim * 0.012,
      map: createDotTexture(),
      color: new THREE.Color(0xffffff),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    scene.add(new THREE.Points(pointsGeo, pointsMaterial));

    _modelLoaded = true;
    restoreDecals(pendingSession?.decals);
  });
}
function samplePointsOnMesh(geo, totalCount) {
  const positions = [];
  const posAttr = geo.attributes.position;

  if (!geo.index) {
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    }
    return positions;
  }

  const indices = geo.index.array;
  const triCount = indices.length / 3;
  const samplesPerTri = Math.max(1, Math.ceil(totalCount / triCount));

  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3],
      ib = indices[t * 3 + 1],
      ic = indices[t * 3 + 2];
    const ax = posAttr.getX(ia),
      ay = posAttr.getY(ia),
      az = posAttr.getZ(ia);
    const bx = posAttr.getX(ib),
      by = posAttr.getY(ib),
      bz = posAttr.getZ(ib);
    const cx = posAttr.getX(ic),
      cy = posAttr.getY(ic),
      cz = posAttr.getZ(ic);

    for (let s = 0; s < samplesPerTri; s++) {
      let u = Math.random();
      let v = Math.random();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const w = 1 - u - v;
      positions.push(
        ax * w + bx * u + cx * v,
        ay * w + by * u + cy * v,
        az * w + bz * u + cz * v,
      );
    }
  }

  return positions;
}
function fillMeshHoles(geometry) {
  if (!geometry.index) return null;

  const posAttr = geometry.attributes.position;
  const indices = geometry.index.array;
  const triCount = indices.length / 3;

  // Count edge occurrences; boundary edges appear in exactly one triangle
  const edgeCount = new Map();
  const edgeVerts = new Map();
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3],
      b = indices[t * 3 + 1],
      c = indices[t * 3 + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      if (!edgeVerts.has(key)) edgeVerts.set(key, [i, j]);
    }
  }

  // Build adjacency map from boundary edges
  const adj = new Map();
  for (const [key, count] of edgeCount) {
    if (count !== 1) continue;
    const [a, b] = edgeVerts.get(key);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  if (adj.size === 0) return null;

  // Walk adjacency to extract boundary loops
  const visited = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop = [start];
    visited.add(start);
    let cur = start,
      prev = -1;
    while (true) {
      const next = adj.get(cur)?.find((n) => n !== prev && !visited.has(n));
      if (next === undefined) break;
      visited.add(next);
      loop.push(next);
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  if (loops.length === 0) return null;

  // Fan-triangulate each loop from its centroid
  const vertices = [];
  for (const loop of loops) {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const idx of loop) {
      cx += posAttr.getX(idx);
      cy += posAttr.getY(idx);
      cz += posAttr.getZ(idx);
    }
    cx /= loop.length;
    cy /= loop.length;
    cz /= loop.length;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i],
        b = loop[(i + 1) % loop.length];
      vertices.push(
        cx,
        cy,
        cz,
        posAttr.getX(a),
        posAttr.getY(a),
        posAttr.getZ(a),
        posAttr.getX(b),
        posAttr.getY(b),
        posAttr.getZ(b),
      );
    }
  }

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  return fillGeo;
}

function createDotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.25, "rgba(173, 173, 173, 0.9)");
  gradient.addColorStop(0.6, "rgba(87, 87, 87, 0.4)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  return new THREE.CanvasTexture(canvas);
}

//////////////////////////* Drawing
function onPointerMove(event) {
  if (event.isPrimary && controls.enabled) {
    checkIntersection(event.clientX, event.clientY);
  }
}
function checkIntersection(x, y) {
  if (mesh === undefined) return;

  const rect = container.getBoundingClientRect();
  const localX = x - rect.left;
  const localY = y - rect.top;

  if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
    intersection.intersects = false;
    return;
  }

  mouse.x = (localX / rect.width) * 2 - 1;
  mouse.y = -(localY / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  raycaster.intersectObject(mesh, false, intersects);

  if (intersects.length > 0) {
    const p = intersects[0].point;
    mouseHelper.position.copy(p);
    intersection.point.copy(p);

    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);

    const n = intersects[0].face.normal.clone();
    n.applyNormalMatrix(normalMatrix);
    n.multiplyScalar(10);
    n.add(intersects[0].point);

    intersection.normal.copy(intersects[0].face.normal);
    mouseHelper.lookAt(n);

    const positions = line.geometry.attributes.position;
    positions.setXYZ(0, p.x, p.y, p.z);
    positions.setXYZ(1, n.x, n.y, n.z);
    positions.needsUpdate = true;

    intersection.intersects = true;

    intersects.length = 0;
  } else {
    intersection.intersects = false;
  }
}
function shoot() {
  position.copy(intersection.point);
  orientation.copy(mouseHelper.rotation);
  orientation.z = Math.random() * 2 * Math.PI;

  const selectedTool = document.querySelector(
    "input[name='tool']:checked",
  )?.value;

  size.set(sizeSelected, sizeSelected, sizeSelected);
  const material = decalMaterial.clone();
  material.color.setHex(colorSelected);

  const m = new THREE.Mesh(
    new DecalGeometry(mesh, position, orientation, size),
    material,
  );
  m.renderOrder = decals.length;
  decals.push(m);
  mesh.attach(m);
  decalData.push({
    tool: selectedTool,
    position: position.toArray(),
    orientation: [orientation.x, orientation.y, orientation.z],
    size: size.toArray(),
    color: colorSelected,
  });
}
function createDecalTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.8)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

function svgToTexture(svgString) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 512, 512);
    URL.revokeObjectURL(url);
    tex.needsUpdate = true;
  };
  img.src = url;

  return tex;
}

function createPulseTexture() {
  return svgToTexture(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="80"  fill="none" stroke="white" stroke-width="16" stroke-opacity="1"/>
    <circle cx="256" cy="256" r="160" fill="none" stroke="white" stroke-width="16" stroke-opacity="0.75"/>
    <circle cx="256" cy="256" r="240" fill="none" stroke="white" stroke-width="16" stroke-opacity="0.5"/>
  </svg>`);
}

function createAcuteLineTexture() {
  return svgToTexture(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><path id="petal" d="M48,0 Q89.6,28 224,0 Q89.6,-28 48,0 Z"/></defs>
    <g transform="translate(256,256)" fill="rgba(255,255,255,0.9)">
      <use href="#petal"/>
      <use href="#petal" transform="rotate(45)"/>
      <use href="#petal" transform="rotate(90)"/>
      <use href="#petal" transform="rotate(135)"/>
      <use href="#petal" transform="rotate(180)"/>
      <use href="#petal" transform="rotate(225)"/>
      <use href="#petal" transform="rotate(270)"/>
      <use href="#petal" transform="rotate(315)"/>
    </g>
  </svg>`);
}
