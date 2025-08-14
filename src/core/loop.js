export function makeLoop(stepFn /* (dt) => void */) {
  let raf = 0;
  let last = performance.now();

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000); // clamp to ~30fps delta
    last = t;
    stepFn(dt);
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
