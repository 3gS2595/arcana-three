export interface CloudsEffect {
  prepare: (dt: number) => void;
  draw: (dt: number) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createNoopCloudsEffect(): CloudsEffect {
  const noop = () => {};
  return { prepare: noop, draw: noop, resize: noop, dispose: noop };
}
