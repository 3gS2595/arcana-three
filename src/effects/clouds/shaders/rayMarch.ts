export default /* glsl */ `
float beersLaw(float density, float absorptionCoefficient) {
  return exp(-absorptionCoefficient * density);
}
float henyeyGreenstein(float g, float cosTheta) {
  float g2 = g * g;
  return 1.0 / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}
float dualLobeHenyeyGreenstein(float g, float cosTheta, float K) {
  return mix(henyeyGreenstein(g, cosTheta), henyeyGreenstein(-g, cosTheta), K);
}
float multipleScattering(float depth, float g, float cosTheta, float K) {
  int octaves = 4; float attenuation = 0.5; float contribution = 0.5; float phaseAttenuation = 0.1;
  float luminance = 0.0; float a = 1.0; float b = 1.0; float c = 1.0;
  for (int i = 0; i < octaves; i++) {
    float beer = beersLaw(depth, a);
    float phase = dualLobeHenyeyGreenstein(g * c, cosTheta, K);
    luminance += b * phase * beer;
    a *= attenuation; b *= contribution; c *= (1.0 - phaseAttenuation);
  }
  return luminance;
}
vec3 marchDirectionalLight(vec3 samplePos, vec3 lightDirection, float cosTheta) {
  float lightDepth = 0.0; float lightDensity = 0.0;
  for (int j = 0; j < N_LIGHT_STEPS; j++) {
    lightDepth += LIGHT_STEP_SIZE;
    vec3 lightSamplePos = samplePos - lightDirection * lightDepth;
    float _lightDensity = clamp(getCloudDensity(lightSamplePos), 0.0, 1.0);
    lightDensity += _lightDensity;
    if(lightDensity >= 1.0) break;
  }
  return vec3(multipleScattering(lightDensity, anisotropicFactor, cosTheta, phaseMix));
}
vec4 rayMarch(vec3 ro, vec3 rd, float near, float far, vec3 aabbMin, vec3 aabbMax) {
  vec3 finalColor = vec3(0.0); float T = 1.0; float depth = 0.0; float density = 0.0;
  vec3 lightDir = normalize(-lightPosition); float cosTheta = dot(rd, lightDir);
  float stepSize = (far - near) / float(MAX_STEPS); int steps = MAX_STEPS;
  vec3 p = ro + rd * near; p = (p - aabbMin) / (aabbMax - aabbMin);
  bool tight = false; float adaptive = stepSize;
  for (int i = 0; i < steps; i++) {
    p += rd * adaptive;
    if(p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z < 0.0 || p.z > 1.0) break;
    float d = clamp(getCloudDensity(p), 0.0, 1.0);
    density += d;
    if(d > 0.0) {
      if(!tight){ tight = true; depth -= adaptive; p -= rd * adaptive; adaptive *= 0.5; steps = int(1.0 / adaptive); continue; }
      vec3 L = marchDirectionalLight(p, lightDir, cosTheta);
      finalColor += lightColor * L * d * T;
      T *= beersLaw(d, lightAbsorption);
      finalColor += ambientLightColor * d * T;
    } else if(tight) { tight = false; adaptive = stepSize; steps = MAX_STEPS; }
    if(density >= 1.0) break;
    depth += adaptive;
  }
  return vec4(finalColor, 1.0 - T);
}
`;
