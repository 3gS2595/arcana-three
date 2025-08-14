import { THREE } from '../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class FrameBorderOverlay {
  constructor({
    url,
    margin = 0.06, marginH, marginV,
    distance = 2.0,
    renderOnTop = true,
    scalingMode = 'stretch',
    lighting = 'normals',
    mixStrength = 0.5
  } = {}) {
    this.url = url;
    this.marginH = (marginH ?? margin) * 0.5;
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
          color: src?.color ? src.color.clone() : new THREE.Color(0xffffff),
          map: src?.map ?? null,
          transparent: !!(src?.transparent || src?.alphaMap),
          opacity: typeof src?.opacity === 'number' ? src.opacity : 1,
          side: src?.side ?? THREE.FrontSide,
          alphaTest: src?.alphaTest ?? 0,
          depthTest: !this.renderOnTop,
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

        obj.material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: map },
            useMap: { value: !!map },
            mixStrength: { value: this.mixStrength }
          },
          vertexShader: `
            varying vec3 vNormal; varying vec2 vUv;
            void main(){ vNormal = normalize(normalMatrix * normal); vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
          `,
          fragmentShader: `
            uniform sampler2D map; uniform bool useMap; uniform float mixStrength;
            varying vec3 vNormal; varying vec2 vUv;
            void main(){
              vec3 n = normalize(vNormal) * 0.5 + 0.5;
              vec3 tex = useMap ? texture2D(map, vUv).rgb : vec3(1.0);
              gl_FragColor = vec4(mix(tex, n, mixStrength), 1.0);
            }
          `,
          transparent: !!(src?.transparent || src?.alphaMap),
          depthTest: !this.renderOnTop,
          depthWrite: this.renderOnTop ? false : (src?.depthWrite ?? true)
        });
      } else {
        if (this.renderOnTop && obj.material) {
          obj.material = obj.material.clone();
          obj.material.depthTest = false;
          obj.material.depthWrite = false;
          obj.material.fog = false;
          if ('toneMapped' in obj.material) obj.material.toneMapped = false;
        }
      }
    });

    // center X/Y around (0,0)
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = bbox.getCenter(new THREE.Vector3());
    this.pivot = new THREE.Object3D();
    this.pivot.add(this.model);
    this.model.position.sub(new THREE.Vector3(center.x, center.y, 0));

    // cache native size
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
    if (!this._loaded || this.lighting !== 'normals') return;
    this.group.traverse(o => {
      const u = o.material?.uniforms;
      if (u && 'mixStrength' in u) u.mixStrength.value = this.mixStrength;
    });
  }

  update(camera) {
    if (!this._loaded) return;

    const dir = camera.getWorldDirection(new THREE.Vector3());
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.addScaledVector(dir, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * this.distance;
    const viewW = viewH * camera.aspect;

    const wTarget = viewW  * (1 - 2 * this.marginH);
    const hTarget = viewH  * (1 - 2 * this.marginV);

    if (this.scalingMode === 'stretch') {
      const sx = wTarget / this._baseWidth;
      const sy = hTarget / this._baseHeight;
      const sz = Math.min(sx, sy);
      this.group.scale.set(sx, sy, sz);
    } else {
      const s = Math.min(wTarget / this._baseWidth, hTarget / this._baseHeight);
      this.group.scale.set(s, s, s);
    }
  }

  addTo(scene) { scene.add(this.group); }
  removeFrom(scene) { scene.remove(this.group); }
}
