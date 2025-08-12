// frameBorderOverlay.js
import { THREE } from '../core/three.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class FrameBorderOverlay {
  constructor({
    url,
    margin = 0.06,
    marginH,
    marginV,
    distance = 2.0,
    renderOnTop = true,
    scalingMode = 'stretch',
    // NEW: choose lighting behavior for the overlay
    lighting = 'unlit', // 'unlit' | 'keep'
  } = {}) {
    this.url = url;
    this.marginH = (marginH ?? margin) * 0.5;
    this.marginV = (marginV ?? margin);
    this.distance = distance;
    this.renderOnTop = renderOnTop;
    this.scalingMode = scalingMode;
    this.lighting = lighting;

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

    // ---- STATIC (SCENE-INDEPENDENT) LOOK ----
this.model.traverse(obj => {
  if (!obj.isMesh) return;

  obj.frustumCulled = false;
  obj.renderOrder = 9999;

  if (this.lighting === 'unlit') {
    // Existing unlit logic...
    const src = obj.material;
    const dst = new THREE.MeshBasicMaterial({
      color: (src?.color) ? src.color.clone() : new THREE.Color(0xffffff),
      map: src?.map ?? null,
      transparent: !!src?.transparent,
      opacity: (typeof src?.opacity === 'number') ? src.opacity : 1,
      side: src?.side ?? THREE.FrontSide,
      alphaTest: src?.alphaTest ?? 0,
      depthTest: this.renderOnTop ? false : true,
      depthWrite: this.renderOnTop ? false : src?.depthWrite ?? true,
      fog: false,
      toneMapped: false,
      vertexColors: !!src?.vertexColors,
    });
    if (dst.map && 'colorSpace' in dst.map) dst.map.colorSpace = THREE.SRGBColorSpace;
    obj.material = dst;

  } else if (this.lighting === 'normals') {
    const src = obj.material;
    const tex = src?.map ?? null;
    if (tex && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;

    obj.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        mixStrength: { value: 0.5 } // 0 = only texture, 1 = only normals
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec2 vUv;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float mixStrength;
        varying vec3 vNormal;
        varying vec2 vUv;

        void main() {
          vec3 normalColor = normalize(vNormal) * 0.5 + 0.5;
          vec3 texColor = texture2D(map, vUv).rgb;
          vec3 finalColor = mix(texColor, normalColor, mixStrength);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: !!src?.transparent,
      depthTest: this.renderOnTop ? false : true,
      depthWrite: this.renderOnTop ? false : src?.depthWrite ?? true,
    });
  } 
  
  else {
    // 'keep'
    if (this.renderOnTop && obj.material) {
      obj.material = obj.material.clone();
      obj.material.depthTest = false;
      obj.material.depthWrite = false;
      obj.material.fog = false;
      if ('toneMapped' in obj.material) obj.material.toneMapped = false;
    }
  }
});


    // Center the frame around origin in X/Y for clean scaling
    const bbox = new THREE.Box3().setFromObject(this.model);
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    this.pivot = new THREE.Object3D();
    this.pivot.add(this.model);
    this.model.position.sub(new THREE.Vector3(center.x, center.y, 0));

    // Cache native size ONCE (avoid feedback scaling)
    this.pivot.updateMatrixWorld(true);
    const nativeBox = new THREE.Box3().setFromObject(this.pivot);
    const nativeSize = new THREE.Vector3();
    nativeBox.getSize(nativeSize);
    this._baseWidth = Math.max(nativeSize.x, 1e-6);
    this._baseHeight = Math.max(nativeSize.y, 1e-6);

    this.group.add(this.pivot);
    this._loaded = true;
  }

  update(camera) {
    if (!this._loaded) return;

    // Position in front of camera, face camera
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const targetPos = camPos.clone().addScaledVector(dir, this.distance);

    this.group.position.copy(targetPos);
    this.group.quaternion.copy(camera.quaternion);

    // Compute visible viewport at this depth
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewportHeight = 2 * Math.tan(vFov / 2) * this.distance;
    const viewportWidth  = viewportHeight * camera.aspect;

    // Target box with margins (smaller horizontal margins as requested)
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
