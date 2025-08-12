// src/overlay/frameBorderOverlay.js
import { THREE } from '../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class FrameBorderOverlay {
  /**
   * @param {Object} opts
   * @param {string}  opts.url
   * @param {number}  opts.margin
   * @param {number}  opts.marginH
   * @param {number}  opts.marginV
   * @param {number}  opts.distance
   * @param {boolean} opts.renderOnTop
   * @param {'stretch'|'uniform'} opts.scalingMode
   * @param {'unlit'|'keep'|'normals'} opts.lighting
   * @param {number}  opts.mixStrength   // only for 'normals' mode (0..1)
   */
  constructor({
    url,
    margin = 0.06,
    marginH,
    marginV,
    distance = 2.0,
    renderOnTop = true,
    scalingMode = 'stretch',
    lighting = 'unlit',
    mixStrength = 0.5
  } = {}) {
    this.url = url;
    this.marginH = (marginH ?? margin) * 0.5; // side margins 50% smaller by default
    this.marginV = (marginV ?? margin);
    this.distance = distance;
    this.renderOnTop = renderOnTop;
    this.scalingMode = scalingMode;
    this.lighting = lighting;
    this.mixStrength = THREE.MathUtils.clamp(mixStrength, 0, 1);

    this.group = new THREE.Group();
    this.group.name = 'FrameBorderOverlay';
    this.model = null;
    this.pivot = null;

    this._baseWidth = 1;
    this._baseHeight = 1;
    this._loaded = false;
  }

  async load() {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(this.url);

    this.model = gltf.scene || gltf.scenes?.[0];

    this.model.traverse(obj => {
      if (!obj.isMesh) return;

      obj.frustumCulled = false;
      obj.renderOrder = 9999;

      if (this.lighting === 'unlit') {
        const src = obj.material;
        const mat = new THREE.MeshBasicMaterial({
          color: (src?.color) ? src.color.clone() : new THREE.Color(0xffffff),
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
        obj.material = mat;

      } else if (this.lighting === 'normals') {
        const src = obj.material;
        const map = src?.map ?? null;
        if (map && 'colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;

        const uniforms = {
          map: { value: map },
          useMap: { value: !!map },
          mixStrength: { value: this.mixStrength } // 0 = only texture, 1 = only normals
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
            vec3 normalColor = normalize(vNormal) * 0.5 + 0.5;
            vec3 texColor = useMap ? texture2D(map, vUv).rgb : vec3(1.0);
            vec3 finalColor = mix(texColor, normalColor, mixStrength);
            gl_FragColor = vec4(finalColor, 1.0);
          }
        `;

        const mat = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: vert,
          fragmentShader: frag,
          transparent: !!src?.transparent || !!src?.alphaMap,
          depthTest: this.renderOnTop ? false : true,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true)
        });

        obj.material = mat;

      } else {
        // 'keep' — still render on top if requested
        if (this.renderOnTop && obj.material) {
          obj.material = obj.material.clone();
          obj.material.depthTest = false;
          obj.material.depthWrite = false;
          obj.material.fog = false;
          if ('toneMapped' in obj.material) obj.material.toneMapped = false;
        }
      }
    });

    // Center pivot in X/Y
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    this.pivot = new THREE.Object3D();
    this.pivot.add(this.model);
    this.model.position.sub(new THREE.Vector3(center.x, center.y, 0));

    // Cache native (unscaled) size once
    this.pivot.updateMatrixWorld(true);
    const nativeBox = new THREE.Box3().setFromObject(this.pivot);
    const nativeSize = new THREE.Vector3();
    nativeBox.getSize(nativeSize);
    this._baseWidth = Math.max(nativeSize.x, 1e-6);
    this._baseHeight = Math.max(nativeSize.y, 1e-6);

    this.group.add(this.pivot);
    this._loaded = true;
  }

  setMixStrength(v) {
    this.mixStrength = THREE.MathUtils.clamp(v, 0, 1);
    // update all shader materials if in 'normals' mode
    if (!this._loaded || this.lighting !== 'normals') return;
    this.group.traverse(o => {
      if (o.isMesh && o.material && o.material.uniforms && 'mixStrength' in o.material.uniforms) {
        o.material.uniforms.mixStrength.value = this.mixStrength;
      }
    });
  }

  update(camera) {
    if (!this._loaded) return;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.clone().addScaledVector(dir, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewportHeight = 2 * Math.tan(vFov / 2) * this.distance;
    const viewportWidth  = viewportHeight * camera.aspect;

    const wTarget = viewportWidth  * (1 - 2 * this.marginH);
    const hTarget = viewportHeight * (1 - 2 * this.marginV);

    if (this.scalingMode === 'stretch') {
      const scaleX = wTarget / this._baseWidth;
      const scaleY = hTarget / this._baseHeight;
      const scaleZ = Math.min(scaleX, scaleY);
      this.group.scale.set(scaleX, scaleY, scaleZ);
    } else {
      const s = Math.min(wTarget / this._baseWidth, hTarget / this._baseHeight);
      this.group.scale.set(s, s, s);
    }
  }

  addTo(scene) { scene.add(this.group); }
  removeFrom(scene) { scene.remove(this.group); }
}
