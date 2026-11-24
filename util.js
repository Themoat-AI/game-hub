/**
 * Size a canvas/board to fit the viewport while keeping its aspect ratio.
 * `ratio` = width / height. The box is limited by available width *and* height.
 */
export function sizeStyle(ratio, fullscreen) {
  const vh = fullscreen ? 82 : 64;
  return { width: `min(100%, calc(${vh}vh * ${ratio}))`, aspectRatio: String(ratio) };
}

/** Ignore keystrokes aimed at form fields. */
export const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
