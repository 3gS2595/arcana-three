import { THREE } from '../core/three.js';
import { makeGrassTexture } from './grassTexture.js';

function makeBladeGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 4);
  geo.translate(0, 0.5, 0);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const widthScale = 1.0 - 0.8 * y;
    const curlZ = 0.18 * y * y;
    pos.setXYZ(i, x * widthScale, y, z + curlZ);
  }
  pos.needsUpdate = true;

  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    c.setHSL(0.33, 0.75, 0.25 + 0.2 * y);
    colors[i*3+0] = c.r;
    colors[i*3+1] = c.g;
    colors[i*3+2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function buildGrassPatch({ radius = 3.8 * 10, bladeCount = 2400 * 100, groundRepeat = 7 * 10 } = {}) {
  const group = new THREE.Group();

  // optional small ground texture (commented; patch looks good without)
  // const groundGeom = new THREE.CircleGeometry(radius + 0.4, 64);
  // groundGeom.rotateX(-Math.PI / 2);
  // const groundTex = makeGrassTexture({ tuftCount: 1200 });
  // groundTex.repeat.set(groundRepeat, groundRepeat);
  // const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 });
  // group.add(new THREE.Mesh(groundGeom, groundMat));

  const bladeGeo = makeBladeGeometry();
  const bladeMat = new THREE.MeshStandardMaterial({
    roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide, vertexColors: true
  });

  const blades = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < bladeCount; i++) {
    const t = Math.random() * Math.PI * 2.0;
    const r = Math.sqrt(Math.random()) * radius;

    const x = Math.cos(t) * r;
    const z = Math.sin(t) * r;

    const outward = new THREE.Vector3(x, 0, z).normalize();
    const leanAngle = (Math.random() * 0.22) - 0.06;
    const yaw = Math.random() * Math.PI * 2;

    dummy.position.set(x, 0.0, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(outward.z, 0, -outward.x).normalize(), leanAngle
    ));

    const h = 0.45 + Math.random() * 0.35;
    const w = 0.05 + Math.random() * 0.035;
    dummy.scale.set(w, h, 1);

    dummy.updateMatrix();
    blades.setMatrixAt(i, dummy.matrix);
  }

  group.add(blades);
  return group;
}
