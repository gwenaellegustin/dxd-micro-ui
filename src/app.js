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
const pendingSession = JSON.parse(
  sessionStorage.getItem("pending-session") || "null",
);
const sessionStart = pendingSession?.timestamp ?? Date.now();
let mouseHelper;
const position = new THREE.Vector3();
const orientation = new THREE.Euler();
const size = new THREE.Vector3(10, 10, 10);

let colorSelected = 0xffd000;
let sizeSelected = 0.1;
const SIZE_MIN = 0.5;
const SIZE_MAX = 1.8;
const SIZE_GROW_DURATION = 4000;
const PREVIEW_DELAY = 100;
let isPressing = false;
let pressOriginatedOutside = false;
let pressStart = 0;
let previewMesh;

init();

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
  window.addEventListener("resize", onWindowResize);
  let moved = false;
  controls.addEventListener("change", function () {
    moved = true;
    isPressing = false;
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
          document.getElementById("tap-hint")?.classList.remove("hidden");
        }
      } else {
        document.getElementById("tap-hint")?.classList.add("hidden");
      }
      shoot();
    }
    isPressing = false;
    pressOriginatedOutside = false;
    controls.enabled = true;
    if (previewMesh) previewMesh.visible = false;
    line.visible = false;
  });
  window.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerleave", function () {
    if (isPressing) {
      isPressing = false;
      controls.enabled = true;
      if (previewMesh) previewMesh.visible = false;
      line.visible = false;
    }
  });

  //*Model
  loadGlbCloudPoint("models/head-polygon/tete_clean.glb");
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
  const painLabel = document.getElementById("pain-label");
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
  const updateSliderColor = (event) => {
    const target = event.target || event;
    const hex = colorjs.getColorFromRangeValue(target.value, target.max);
    target.style.setProperty("--slider-color", hex);
    colorSelected = parseInt(hex.replace("#", ""), 16);
    const pct = (Number(target.value) / Number(target.max)) * 100;
    painLabel.textContent =
      painLevels.find(([threshold]) => pct <= threshold)?.[1] ??
      painLevels.at(-1)[1];
    painLabel.style.color = hex;
  };
  colorBar.addEventListener("input", updateSliderColor);
  updateSliderColor(colorBar);

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

  //* Show tap hint after 3 s if no shoot yet
  const tapHintEl = document.getElementById("tap-hint");
  setTimeout(() => {
    if (decals.length === 0) tapHintEl.classList.remove("hidden");
  }, 3000);

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

    if (intersection.intersects && elapsed > PREVIEW_DELAY) {
      controls.enabled = false;
      previewMesh.visible = true;
      line.visible = true;
      previewMesh.position.copy(intersection.point);
      previewMesh.rotation.copy(mouseHelper.rotation);
      previewMesh.scale.setScalar(sizeSelected / 2);
    }
  } else {
    line.visible = false;
  }
  renderer.render(scene, camera);
  // stats.update();
}

//////////////////////////* Load models
function loadLeePerrySmith() {
  const map = textureLoader.load(jpgSmithCol);
  map.colorSpace = THREE.SRGBColorSpace;
  const specularMap = textureLoader.load(jpgSmithSpec);
  const normalMap = textureLoader.load(jpgSmithTangent);

  const loader = new GLTFLoader();

  loader.load(glbSmith, function (gltf) {
    mesh = gltf.scene.children[0];
    mesh.material = new THREE.MeshPhongMaterial({
      specular: 0x111111,
      map: map,
      specularMap: specularMap,
      normalMap: normalMap, // skin texture
      shininess: 25,
    });

    scene.add(mesh);
    mesh.scale.multiplyScalar(10);
  });
}
function loadGlb(glbPath, scale = 1) {
  const loader = new GLTFLoader();

  loader.load(glbPath, function (gltf) {
    mesh = gltf.scene.children[0];
    mesh.material = new THREE.MeshPhongMaterial({
      specular: 0x111111,
      shininess: 25,
    });

    scene.add(mesh);
    mesh.scale.multiplyScalar(scale);
  });
}
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

    // Build point cloud from all meshes
    const allPositions = [];
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        const pts = samplePointsOnMesh(child.geometry, 5000);
        for (let i = 0; i < pts.length; i += 3) {
          const v = new THREE.Vector3(pts[i], pts[i + 1], pts[i + 2]);
          v.applyMatrix4(child.matrixWorld);
          allPositions.push(v.x, v.y, v.z);
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

    // Restore decals when returning from evolution page
    if (pendingSession?.decals?.length) {
      const texMap = {
        point: createDecalTexture(),
        pulse: createPulseTexture(),
        acute: createAcuteLineTexture(),
      };
      for (const d of pendingSession.decals) {
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
