import { THREE } from '../core/three.js';

export function buildSkyDome({ radius = 600 } = {}) {
  const geom = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x0e1722) },
      mid: { value: new THREE.Color(0x0c1320) },
      bottom: { value: new THREE.Color(0x0a0f18) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5; // 0..1
        vec3 c = mix(bottom, mix(mid, top, smoothstep(0.5,1.0,h)), smoothstep(0.0,1.0,h));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'SkyDome';
  return mesh;
}
