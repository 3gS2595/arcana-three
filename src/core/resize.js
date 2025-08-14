export function attachAutoResize({ element, onResize }) {
  const cb = () => {
    const w = element.clientWidth || element.offsetWidth || window.innerWidth;
    const h = element.clientHeight || window.innerHeight;
    onResize(w, h);
  };

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(cb);
    ro.observe(element);
  } else {
    window.addEventListener('resize', cb);
  }
  cb();
}
