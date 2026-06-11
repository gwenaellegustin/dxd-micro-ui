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
// const decalDiffuse = textureLoader.load("textures/decal/decal-diffuse.png");
const decalDiffuse = textureLoader.load("textures/point/decal-diffuse.png");
decalDiffuse.colorSpace = THREE.SRGBColorSpace;
const decalNormal = textureLoader.load("textures/decal/decal-normal.jpg");
const decalMaterial = new THREE.MeshPhongMaterial({
  specular: 0x444444,
  map: decalDiffuse,
  // normalMap: decalNormal,
  normalScale: new THREE.Vector2(1, 1),
  shininess: 30,
  transparent: true,
  depthTest: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  wireframe: false,
});
const decals = [];
let mouseHelper;
const position = new THREE.Vector3();
const orientation = new THREE.Euler();
const size = new THREE.Vector3(10, 10, 10);

let colorSelected = 0xffd000;
let sizeSelected = 0.24;

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
  controls.minDistance = 50;
  controls.maxDistance = 200;

  //*Interaction
  window.addEventListener("resize", onWindowResize);
  let moved = false;
  controls.addEventListener("change", function () {
    moved = true;
  });
  window.addEventListener("pointerdown", function () {
    moved = false;
  });
  window.addEventListener("pointerup", function (event) {
    if (moved === false) {
      checkIntersection(event.clientX, event.clientY);
      if (intersection.intersects) shoot();
    }
  });
  window.addEventListener("pointermove", onPointerMove);

  //*Model
  loadGlbCloudPoint("models/head-polygon/tete_clean.glb");
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

  //*Draw on head
  line = new THREE.Line(geometry, new THREE.LineBasicMaterial());
  // scene.add(line);
  raycaster = new THREE.Raycaster();
  mouseHelper = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 10),
    new THREE.MeshNormalMaterial(),
  );
  mouseHelper.visible = false;
  scene.add(mouseHelper);

  //* Color picker
  const colorBar = document.getElementById("color-bar");
  const updateSliderColor = (event) => {
    const target = event.target || event;
    const hex = colorjs.getColorFromRangeValue(target.value, target.max);
    target.style.setProperty("--slider-color", hex);
    colorSelected = parseInt(hex.replace("#", ""), 16);
  };
  colorBar.addEventListener("input", updateSliderColor);
  // updateSliderColor(colorBar);

  const cancelButton = document.getElementById("cancel-btn");
  cancelButton.addEventListener("click", (event) => {
    const toRemove = decals.pop();
    mesh.remove(toRemove);
  });

  const cancelAllButton = document.getElementById("cancel-all-btn");
  cancelAllButton.addEventListener("click", (event) => {
    event.preventDefault();
    decals.forEach(function (d) {
      mesh.remove(d);
    });

    decals.length = 0;
  });

  //* Size picker
  const sizeBar = document.getElementById("size-bar");
  const updateSizeThumb = (event) => {
    const target = event.target || event;
    const percent =
      target.max > 0 ? Number(target.value) / Number(target.max) : 0;
    const sizeValue = 16 + percent * (32 - 16);
    target.style.setProperty("--size-thumb-size", `${sizeValue}px`);
    sizeSelected = 0.1 + percent;
  };
  sizeBar.addEventListener("input", updateSizeThumb);
  // updateSizeThumb(sizeBar)
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
          transparent: true,
          opacity: 0,
          depthWrite: false,
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
    const bboxSize = new THREE.Vector3();
    pointsGeo.boundingBox.getSize(bboxSize);
    const center = new THREE.Vector3();
    pointsGeo.boundingBox.getCenter(center);

    headMaxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

    // Fit camera & controls to model
    controls.target.copy(center);
    camera.position.set(center.x, center.y, center.z + headMaxDim * 1.8);
    controls.minDistance = headMaxDim * 0.3;
    controls.maxDistance = headMaxDim * 5;
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
  if (event.isPrimary) {
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

  size.set(sizeSelected, sizeSelected, sizeSelected);

  const material = decalMaterial.clone();
  // material.color.setHex(Math.random() * 0xffffff);
  material.color.setHex(colorSelected);

  const m = new THREE.Mesh(
    new DecalGeometry(mesh, position, orientation, size),
    material,
  );
  m.renderOrder = decals.length; // give decals a fixed render order

  decals.push(m);

  mesh.attach(m);
}
