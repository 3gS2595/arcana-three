export default /* glsl */ `
precision highp float;

vec3 computeWorldPosition(
  vec2 uv,
  sampler2D tDepth,
  mat4 uProjectionInverse,
  mat4 uCameraMatrixWorld
) {
  float z = texture(tDepth, uv).r;
  z = clamp(z, 0.0, 1.0);

  vec4 ndc = vec4(
    uv * 2.0 - 1.0,
    z * 2.0 - 1.0,
    1.0
  );

  vec4 viewPos = uProjectionInverse * ndc;
  viewPos /= max(viewPos.w, 1e-6);
  vec4 world = uCameraMatrixWorld * viewPos;
  return world.xyz;
}
`;
