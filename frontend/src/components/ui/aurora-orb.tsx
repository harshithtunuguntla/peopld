"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Aurora orb — a real WebGL shader sphere with flowing blue "silk" light ribbons
 * inside (domain-warped FBM noise + fresnel rim), inspired by the reference the
 * user loved. Raw WebGL on a single fullscreen-quad fragment shader — no
 * Three.js, no npm dependency. Transparent canvas, so it sits over the cream or
 * ink canvas alike. Gracefully falls back to the CSS orb (`.vo-core` ribbons) if
 * a WebGL context can't be created or the shaders fail to compile.
 *
 * `listening` ramps the internal energy; `pulseSignal` (a string that changes as
 * words arrive) triggers a brief brightness bloom so it visibly "hears" you.
 */
export function AuroraOrb({
  listening,
  pulseSignal = "",
  size = 96,
}: {
  listening: boolean;
  pulseSignal?: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  // Live values read by the render loop without restarting it.
  const activeTargetRef = useRef(0);
  const activeRef = useRef(0);
  const pulseRef = useRef(0);

  useEffect(() => {
    activeTargetRef.current = listening ? 1 : 0;
  }, [listening]);

  useEffect(() => {
    if (pulseSignal) pulseRef.current = 1;
  }, [pulseSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = (canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true }) ||
      canvas.getContext("experimental-webgl", { alpha: true })) as WebGLRenderingContext | null;
    if (!gl) {
      setFailed(true);
      return;
    }

    const vsSource = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform float uTime;
      uniform float uActive;
      uniform float uPulse;
      varying vec2 vUv;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                   mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.55;
        for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main(){
        vec2 uv = vUv * 2.0 - 1.0;
        float r = length(uv);

        // Soft sphere mask + fake 3D depth for the rim.
        float sphere = smoothstep(1.0, 0.965, r);
        float z = sqrt(max(0.0, 1.0 - r * r));

        float t = uTime * (0.12 + 0.28 * uActive);

        // Swirl the sampling coords → the "silk" flow.
        float ang = atan(uv.y, uv.x);
        vec2 sw = vec2(cos(ang + t + r * 2.2), sin(ang - t + r * 2.2));
        vec2 q = uv * 1.7;
        float f1 = fbm(q + sw + t);
        float f2 = fbm(q * 1.7 - sw * 0.8 - t * 1.2 + f1);
        float flow = fbm(q + vec2(f1, f2) * 1.3);

        float ribbon = smoothstep(0.52, 0.86, flow);
        float hot = smoothstep(0.80, 0.98, flow);

        vec3 base = vec3(0.02, 0.05, 0.16);
        vec3 blue = vec3(0.12, 0.42, 1.0);
        vec3 cyan = vec3(0.55, 0.92, 1.0);
        vec3 col = base;
        col = mix(col, blue, ribbon);
        col = mix(col, cyan, hot);

        // Fresnel rim glow — brighter blue at the sphere's edge.
        float fres = pow(1.0 - z, 2.4);
        col += vec3(0.10, 0.36, 0.95) * fres * (0.55 + 0.65 * uActive);

        // Vertical depth: darker toward the bottom.
        col *= mix(0.68, 1.15, uv.y * 0.5 + 0.5);

        // Word bloom + overall energy.
        col += vec3(0.15, 0.42, 0.95) * uPulse * (0.4 + ribbon);
        col *= (0.82 + 0.55 * uActive);

        // Outer soft glow beyond the sphere edge.
        float glow = smoothstep(1.32, 0.98, r) * (1.0 - sphere);
        vec3 glowCol = vec3(0.10, 0.32, 0.9) * glow * (0.45 + 0.55 * uActive);

        float alpha = sphere + glow * 0.55;
        vec3 outCol = col * sphere + glowCol;
        gl_FragColor = vec4(outCol, alpha);
      }
    `;

    function compile(type: number, src: string): WebGLShader | null {
      const sh = gl!.createShader(type);
      if (!sh) return null;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
        gl!.deleteShader(sh);
        return null;
      }
      return sh;
    }

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) {
      setFailed(true);
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    // Fullscreen quad (two triangles).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uActive = gl.getUniformLocation(prog, "uActive");
    const uPulse = gl.getUniformLocation(prog, "uPulse");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    canvas.width = px;
    canvas.height = px;
    gl.viewport(0, 0, px, px);

    let raf = 0;
    const start = performance.now();
    let last = start;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Ease active toward its target; decay the word pulse.
      activeRef.current += (activeTargetRef.current - activeRef.current) * Math.min(dt * 6, 1);
      pulseRef.current = Math.max(0, pulseRef.current - dt * 2.2);

      // Under reduced motion, hold a still frame (no time advance).
      const time = reduce ? 3.0 : (now - start) / 1000;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uActive, activeRef.current);
      gl.uniform1f(uPulse, reduce ? 0 : pulseRef.current);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (reduce) return; // one frame is enough; no loop
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
  }, [size]);

  // CSS fallback keeps the same look language when WebGL isn't available.
  if (failed) {
    return (
      <span className="vo-core" aria-hidden style={{ height: size, width: size }}>
        <span className="vo-ribbon vo-ribbon-1" />
        <span className="vo-ribbon vo-ribbon-2" />
        <span className="vo-ribbon vo-ribbon-3" />
        <span className="vo-sheen" />
      </span>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ height: size, width: size, borderRadius: "9999px", display: "block" }}
    />
  );
}
