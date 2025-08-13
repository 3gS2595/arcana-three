// src/overlay/frame/FrameLoader.js
import { THREE } from '../../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads all GLB parts, applies an axis fix (Z-up assets → XY plane),
 * and standardizes materials based on lighting mode.
 *
 * Returns: { group, parts } where parts is a Map(name -> { pivot, object, meshes, originals })
 */
export class FrameLoader {
  constructor({ dir, renderOnTop, lighting, mixStrength }) {
    this.dir = dir;
    this.renderOnTop = !!renderOnTop;
    this.lighting = lighting || 'normals';
    this.mixStrength = THREE.MathUtils.clamp(mixStrength ?? 0.6, 0, 1);

    this.group = new THREE.Group();
    this.group.name = 'FrameBorderOverlayGroup';

    this.parts = new Map();

    this._tmpColor = new THREE.Color();
  }

  async loadFiles(partMap) {
    const loader = new GLTFLoader();
    const entries = Object.entries(partMap);

    const loadOne = async (name, url) => {
      const gltf = await loader.loadAsync(url);

      // Create a stable container hierarchy:
      // pivot (origin) -> object (axisFix + materialized GLB)
      const pivot = new THREE.Object3D();
      pivot.name = `pivot:${name}`;

      const object = new THREE.Group();
      object.name = `overlay-part:${name}`;

      // Add GLB scene under object
      const root = gltf.scene;
      object.add(root);

      // === AXIS FIX ===
      // Your assets are authored Z-up. For a HUD we want the geometry in the XY plane
      // (Y = up, X = right; normal ~ +Z), so rotate -90° around X to map Z→Y.
      object.rotation.x = -Math.PI / 2;

      // Gather meshes & original materials (for 'keep' mode)
      const meshes = [];
      const originals = [];
      root.traverse(n => {
        if (n.isMesh) {
          meshes.push(n);
          originals.push(n.material);
          n.frustumCulled = false;
          n.renderOrder = 9999;
        }
      });

      // Apply current lighting mode
      this._applyLighting({ meshes, originals });

      // Mount
      pivot.add(object);
      this.group.add(pivot);

      this.parts.set(name, { name, pivot, object, meshes, originals });
    };

    await Promise.all(entries.map(([name, file]) => loadOne(name, this.dir + file)));
    return { group: this.group, parts: this.parts };
  }

  setLighting(mode) {
    const m = (mode || '').toLowerCase();
    if (m !== 'unlit' && m !== 'keep' && m !== 'normals') return;
    this.lighting = m;
    // reapply to existing parts
    for (const [, P] of this.parts) {
      this._applyLighting({ meshes: P.meshes, originals: P.originals });
    }
  }

  setMixStrength(v) {
    this.mixStrength = THREE.MathUtils.clamp(v ?? this.mixStrength, 0, 1);
    if (this.lighting !== 'normals') return;
    for (const [, P] of this.parts) {
      for (const mesh of P.meshes) {
        const mat = mesh.material;
        if (mat && mat.uniforms && mat.uniforms.mixStrength) {
          mat.uniforms.mixStrength.value = this.mixStrength;
        }
      }
    }
  }

  // ---------- materials ----------
  _applyLighting({ meshes, originals }) {
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      const src = originals[i];

      if (this.lighting === 'unlit') {
        const mat = new THREE.MeshBasicMaterial({
          color: src?.color ? src.color.clone() : this._tmpColor.set(0xffffff),
          map: src?.map ?? null,
          transparent: !!src?.transparent || !!src?.alphaMap,
          opacity: (typeof src?.opacity === 'number') ? src.opacity : 1,
          side: src?.side ?? THREE.FrontSide,
          alphaTest: src?.alphaTest ?? 0,
          depthTest: this.renderOnTop ? false : true,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true),
          fog: false,
          toneMapped: false,
          vertexColors: !!src?.vertexColors
        });
        if (mat.map && 'colorSpace' in mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        mesh.material = mat;
        continue;
      }

      if (this.lighting === 'normals') {
        const map = src?.map ?? null;
        if (map && 'colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;

        const uniforms = {
          map: { value: map },
          useMap: { value: !!map },
          mixStrength: { value: this.mixStrength }
        };
        const vert = `
          varying vec3 vNormal;
          varying vec2 vUv;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `;
        const frag = `
          uniform sampler2D map;
          uniform bool useMap;
          uniform float mixStrength;
          varying vec3 vNormal;
          varying vec2 vUv;
          void main() {
            vec3 n = normalize(vNormal) * 0.5 + 0.5;
            vec3 tex = useMap ? texture2D(map, vUv).rgb : vec3(1.0);
            vec3 col = mix(tex, n, mixStrength);
            gl_FragColor = vec4(col, 1.0);
          }
        `;
        const mat = new THREE.ShaderMaterial({
          uniforms, vertexShader: vert, fragmentShader: frag,
          transparent: !!src?.transparent || !!src?.alphaMap,
          depthTest: this.renderOnTop ? false : true,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true)
        });
        mesh.material = mat;
        continue;
      }

      // 'keep'
      const mat = src?.clone ? src.clone() : src;
      if (mat) {
        if (this.renderOnTop) {
          mat.depthTest = false;
          mat.depthWrite = false;
          mat.fog = false;
          if ('toneMapped' in mat) mat.toneMapped = false;
        }
        mesh.material = mat;
      }
    }
  }
}
