"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { designWeave, drawWeave, type WeaveSpec } from "@/lib/weave";
import { requestTilt, useTilt } from "@/lib/useTilt";
import { Weave } from "@/components/Weave";
import { paletteColour } from "@/lib/colours";

/**
 * The weave as cloth you can hold.
 *
 * The same generated weave (same seed, same number) drawn onto a small WebGL
 * drape pinned along its top edge. It hangs, breathes, sways the way she
 * tilts her phone, catches a light that moves with her, and ripples where
 * her finger lands. Everything is computed in the vertex shader from a
 * handful of numbers, so it is a few hundred triangles and no library.
 *
 * It only animates while it is on screen and the tab is visible. Without
 * WebGL, or under reduced motion, it is the flat Weave, still.
 */
const COLS = 48, ROWS = 36; // mesh resolution

const VERT = `
attribute vec2 aUV;
uniform float uTime, uAspect;
// Shared with the fragment shader, so its precision is spelled out: the
// vertex default is highp and the fragment default mediump, and GLSL will not
// link a uniform the two stages disagree about.
uniform mediump vec2 uTilt;
uniform vec3 uRipple; // xy = uv, z = seconds since the touch (large = none)
varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vPos;

vec3 place(vec2 uv) {
  float hang = uv.y;                       // 0 at the pinned top edge, 1 at the hem
  float sway = hang * hang;
  // Vertical pleats - how hung cloth actually falls - deepening toward the
  // hem, drifting slowly and shifting with the tilt; a slower billow over
  // them; and the whole hem leaning toward or away from her with the phone.
  float z = (0.25 + 0.75 * hang) * 0.045 * sin(uv.x * 16.0 + uTime * 0.9 + uTilt.x * 3.0)
          + sway * 0.09 * sin(uv.x * 4.0 + uTime * 1.3)
          + hang * 0.03 * sin(uv.y * 6.0 - uTime * 1.7)
          + sway * 0.16 * uTilt.y;
  // The ripple: a ring spreading from the touch, fading over 1.6 s.
  float d = distance(uv, uRipple.xy);
  float age = uRipple.z;
  z += hang * 0.09 * sin(d * 38.0 - age * 11.0) * exp(-d * 5.0) * max(0.0, 1.0 - age / 1.6);
  float x = (uv.x - 0.5) * uAspect + sway * 0.16 * uTilt.x + sway * 0.03 * sin(uTime * 0.9);
  float y = 0.5 - uv.y;
  return vec3(x, y, z);
}

void main() {
  vec3 p = place(aUV);
  vec2 e = vec2(1.0 / ${COLS}.0, 1.0 / ${ROWS}.0);
  vec3 dx = place(aUV + vec2(e.x, 0.0)) - p;
  vec3 dy = place(aUV + vec2(0.0, e.y)) - p;
  vNormal = normalize(cross(dx, dy));
  vUV = aUV;
  vPos = p;
  // A gentle perspective: the cloth is a little closer at the hem.
  float w = 1.0 + p.z * 0.9;
  // Inset from the edges, so the hem can be seen to swing free.
  gl_Position = vec4(p.x / uAspect * 1.7 / w, (p.y * 1.7 + 0.04) / w, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform mediump vec2 uTilt;
varying vec2 vUV;
varying vec3 vNormal;
varying vec3 vPos;

void main() {
  vec3 base = texture2D(uTex, vUV).rgb;
  vec3 n = normalize(vNormal);
  if (n.z < 0.0) n = -n;
  vec3 light = normalize(vec3(-0.35 + uTilt.x * 0.6, 0.55 - uTilt.y * 0.5, 0.75));
  float diffuse = 0.48 + 0.66 * max(dot(n, light), 0.0);
  vec3 view = vec3(0.0, 0.0, 1.0);
  float sheen = pow(max(dot(n, normalize(light + view)), 0.0), 40.0) * 0.14;
  gl_FragColor = vec4(base * diffuse + sheen, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

export function ClothWeave({ seed, colours, label, onSpec, className = "" }: {
  seed: string;
  colours: (string | null | undefined)[];
  label: string;
  onSpec?: (spec: WeaveSpec) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [flat, setFlat] = useState(false);
  const colourKey = colours.filter(Boolean).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const spec = useMemo(() => designWeave(seed, colours, { cols: 72, rows: 48 }), [seed, colourKey]);
  // Tilting wakes the drape; it settles and sleeps a few seconds after she
  // stops moving the phone, rather than breathing forever on a page she is
  // only reading.
  const wakeRef = useRef<() => void>(() => {});
  const tilt = useTilt(box, () => wakeRef.current());
  const ripple = useRef({ u: 0.5, v: 0.5, at: -1e4 });

  useEffect(() => { onSpec?.(spec); }, [spec, onSpec]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setFlat(true); return; }
    const el = canvas.current;
    const gl = el?.getContext("webgl", { antialias: true, premultipliedAlpha: false, alpha: true }) as WebGLRenderingContext | null;
    if (!el || !gl) { if (el) console.warn("ClothWeave: no WebGL - flat weave"); setFlat(true); return; }

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
    } catch (err) {
      // Said once in the console, so a device that always gets the flat
      // weave can be diagnosed instead of guessed at.
      console.warn("ClothWeave: falling back to the flat weave -", err);
      setFlat(true);
      return;
    }
    gl.useProgram(program);

    // The mesh: a grid of UVs, drawn as triangles.
    const uvs: number[] = [];
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) uvs.push(i / COLS, j / ROWS);
    const idx: number[] = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "aUV");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

    // The texture: the finished weave, drawn once on a 2D canvas.
    const tex2d = document.createElement("canvas");
    tex2d.width = 576; tex2d.height = 384;
    const ctx = tex2d.getContext("2d")!;
    drawWeave(ctx, spec, tex2d.width, tex2d.height, 1, [], paletteColour("Ivory")?.hex ?? "white");
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex2d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u = (n: string) => gl.getUniformLocation(program, n);
    const uTime = u("uTime"), uAspect = u("uAspect"), uTilt = u("uTilt"), uRipple = u("uRipple");
    gl.enable(gl.DEPTH_TEST);

    let raf = 0, visible = false;
    const start = performance.now();
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      gl.viewport(0, 0, el.width, el.height);
    };
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uAspect, el.width / Math.max(1, el.height));
      gl.uniform2f(uTilt, tilt.current.x, tilt.current.y);
      gl.uniform3f(uRipple, ripple.current.u, ripple.current.v, (now - ripple.current.at) / 1000);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    };
    let active = performance.now();
    const IDLE_MS = 6000;
    const loop = (now: number) => {
      draw(now);
      raf = visible && !document.hidden && now - active < IDLE_MS ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => { active = performance.now(); if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
    wakeRef.current = wake;

    const ro = new ResizeObserver(() => { resize(); draw(performance.now()); });
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }, { threshold: 0.05 });
    io.observe(el);
    const onVis = () => wake();
    document.addEventListener("visibilitychange", onVis);

    const onDown = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ripple.current = { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height, at: performance.now() };
      requestTilt(); // iOS asks here, on her touch, if it is going to ask at all
      try { navigator.vibrate?.(6); } catch { /* unsupported */ }
      wake();
    };
    el.addEventListener("pointerdown", onDown);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointerdown", onDown);
      gl.deleteBuffer(vbo); gl.deleteBuffer(ibo); gl.deleteTexture(tex); gl.deleteProgram(program);
    };
  }, [spec, tilt]);

  if (flat) return <Weave seed={seed} colours={colours} mode="enter" label={label} onSpec={onSpec} className={className} />;
  return (
    <div ref={box} className={`relative h-full w-full ${className}`}>
      <canvas ref={canvas} data-cloth role="img" aria-label={label} className="block h-full w-full touch-pan-y select-none" />
    </div>
  );
}
