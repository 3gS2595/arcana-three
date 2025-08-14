import * as THREE from "three";

/**
 * Compile/link a minimal GLSL ES 3.00 program using the renderer's context.
 * If this fails, the driver/context cannot reliably handle our GLSL3 shaders.
 */
export function preflightClouds(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext() as WebGL2RenderingContext | null;
  if (!gl) return false;

  const vsSrc = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 pos;
    void main(){ gl_Position = vec4(pos, 0.0, 1.0); }`;

  const fsSrc = `#version 300 es
    precision highp float;
    out vec4 outColor;
    void main(){ outColor = vec4(0.0); }`;

  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.warn("[clouds:preflight] VS compile:", gl.getShaderInfoLog(vs));
    gl.deleteShader(vs);
    return false;
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fsSrc);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn("[clouds:preflight] FS compile:", gl.getShaderInfoLog(fs));
    gl.deleteShader(vs); gl.deleteShader(fs);
    return false;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  const ok = !!gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (!ok) console.warn("[clouds:preflight] Link:", gl.getProgramInfoLog(prog));

  gl.deleteProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return ok;
}
