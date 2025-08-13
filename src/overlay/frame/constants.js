// src/overlay/frame/constants.js

export const PART_FILES = {
  // corners
  'corner-top-left':        'corner-top-left.glb',
  'corner-top-right':       'corner-top-right.glb',
  'corner-bottom-left':     'corner-bottom-left.glb',
  'corner-bottom-right':    'corner-bottom-right.glb',
  // mains (fixed interior rim segments)
  'main-top':               'main-top.glb',
  'main-bottom':            'main-bottom.glb',
  'main-left':              'main-left.glb',
  'main-right':             'main-right.glb',
  // horizontal expanders (scale X)
  'top-left-expander':      'top-left-expander.glb',
  'top-right-expander':     'top-right-expander.glb',
  'bottom-left-expander':   'bottom-left-expander.glb',
  'bottom-right-expander':  'bottom-right-expander.glb',
  // vertical expanders (scale Y)
  'left-top-expander':      'left-top-expander.glb',
  'left-bottom-expander':   'left-bottom-expander.glb',
  'right-top-expander':     'right-top-expander.glb',
  'right-bottom-expander':  'right-bottom-expander.glb'
};

export const CORNERS = [
  'corner-top-left', 'corner-top-right', 'corner-bottom-left', 'corner-bottom-right'
];

export const MAINS = [
  'main-top', 'main-bottom', 'main-left', 'main-right'
];

export const H_EXPANDERS = [
  'top-left-expander', 'top-right-expander', 'bottom-left-expander', 'bottom-right-expander'
];

export const V_EXPANDERS = [
  'left-top-expander', 'left-bottom-expander', 'right-top-expander', 'right-bottom-expander'
];

// tiny epsilon for guards
export const EPS = 1e-6;
