// src/env/sky.js
import { THREE } from '../core/three.js';

/**
 * Gradient skydome (inside-out sphere) that always renders behind everything.
 * Keep radius well within the camera far plane.
 */
export function buildSkyDome({
  radius = 200,
  topColor = new THREE.Color(0x9ecbff),     // blue-ish zenith
  bottomColor = new THREE.Color(0xf2f7ff),  // pale horizon
  exponent = 1.6
} = {}) {
  const geo = new THREE.SphereGeometry(radius, 48, 32);

  const uniforms = {
    topColor:    { value: topColor instanceof THREE.Color ? topColor : new THREE.Color(topColor) },
    bottomColor: { value: bottomColor instanceof THREE.Color ? bottomColor : new THREE.Color(bottomColor) },
    exponent:    { value: exponent }
  };

  const vert = /* glsl */`
    varying float vHeight;
    void main() {
      // World position
      vec4 wp = modelMatrix * vec4(position, 1.0);
      // Map world Y into 0..1 based on the dome radius around origin
      // (camera is near origin relative to this big sphere)
      float r = ${radius.toFixed(1)};
      vHeight = clamp((wp.y + r) / (2.0 * r), 0.0, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  const frag = /* glsl */`
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float exponent;
    varying float vHeight;
    void main() {
      float t = pow(vHeight, exponent);
      vec3 col = mix(bottomColor, topColor, t);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,     // render inside
    depthWrite: false,
    depthTest: false,         // always draw (as background)
    fog: false,
    toneMapped: true
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SkyDome';
  mesh.frustumCulled = false; // ensure it draws even if the camera moves
  mesh.renderOrder = -1000;   // render early; depthTest=false already prevents conflicts
  return mesh;
}
