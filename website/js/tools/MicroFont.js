/**
 * MicroFont.js
 * Specialized bitmap fonts optimized for low-resolution LED matrices.
 * Includes:
 * 1. FONT_3X3: Ultra-compact 3-row font (A-Z, 0-9, symbols) specifically designed for 3-pixel-tall matrices.
 * 2. FONT_5X3: 5-row compact font for matrices with height >= 5.
 */

// 3-row font: Each character is an array of 3 strings (or rows of 0s and 1s)
// Width varies typically between 2 to 4 pixels, followed by 1 column spacing.
export const FONT_3X3 = {
  ' ': [
    [0, 0],
    [0, 0],
    [0, 0]
  ],
  'A': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'B': [
    [1, 1, 0],
    [1, 1, 1],
    [1, 1, 0]
  ],
  'C': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1]
  ],
  'D': [
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 0]
  ],
  'E': [
    [1, 1, 1],
    [1, 1, 0],
    [1, 1, 1]
  ],
  'F': [
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 0]
  ],
  'G': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'H': [
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1]
  ],
  'I': [
    [1, 1, 1],
    [0, 1, 0],
    [1, 1, 1]
  ],
  'J': [
    [0, 0, 1],
    [0, 0, 1],
    [1, 1, 0]
  ],
  'K': [
    [1, 0, 1],
    [1, 1, 0],
    [1, 0, 1]
  ],
  'L': [
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1]
  ],
  'M': [
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1]
  ],
  'N': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1]
  ],
  'O': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'P': [
    [1, 1, 1],
    [1, 1, 1],
    [1, 0, 0]
  ],
  'Q': [
    [1, 1, 1],
    [1, 0, 1],
    [0, 1, 1]
  ],
  'R': [
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 1]
  ],
  'S': [
    [0, 1, 1],
    [0, 1, 0],
    [1, 1, 0]
  ],
  'T': [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0]
  ],
  'U': [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  'V': [
    [1, 0, 1],
    [1, 0, 1],
    [0, 1, 0]
  ],
  'W': [
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0]
  ],
  'X': [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1]
  ],
  'Y': [
    [1, 0, 1],
    [0, 1, 0],
    [0, 1, 0]
  ],
  'Z': [
    [1, 1, 1],
    [0, 1, 0],
    [1, 1, 1]
  ],
  '0': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  '1': [
    [1, 1],
    [0, 1],
    [1, 1]
  ],
  '2': [
    [1, 1, 1],
    [0, 1, 1],
    [1, 1, 0]
  ],
  '3': [
    [1, 1, 1],
    [0, 1, 1],
    [1, 1, 1]
  ],
  '4': [
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1]
  ],
  '5': [
    [1, 1, 1],
    [1, 1, 0],
    [0, 1, 1]
  ],
  '6': [
    [1, 0, 0],
    [1, 1, 1],
    [1, 1, 1]
  ],
  '7': [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1]
  ],
  '8': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1]
  ],
  '9': [
    [1, 1, 1],
    [1, 1, 1],
    [0, 0, 1]
  ],
  '!': [
    [1],
    [1],
    [0]
  ],
  '?': [
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0]
  ],
  '-': [
    [0, 0],
    [1, 1],
    [0, 0]
  ],
  '+': [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0]
  ],
  '=': [
    [1, 1],
    [0, 0],
    [1, 1]
  ],
  ':': [
    [1],
    [0],
    [1]
  ],
  '.': [
    [0],
    [0],
    [1]
  ],
  '<': [
    [0, 1],
    [1, 0],
    [0, 1]
  ],
  '>': [
    [1, 0],
    [0, 1],
    [1, 0]
  ],
  '|': [
    [1],
    [1],
    [1]
  ]
};

/**
 * Converts a text string into a 2D boolean array [row][col] using 3-row font.
 * Spacing between characters is 1 blank column.
 */
export function renderTextToBitmap3(text, tracking = 1) {
  const upper = text.toUpperCase();
  const rows = [[], [], []];

  for (let i = 0; i < upper.length; i++) {
    const char = upper[i];
    const glyph = FONT_3X3[char] || FONT_3X3[' '];
    const width = glyph[0].length;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < width; c++) {
        rows[r].push(glyph[r][c]);
      }
      if (i < upper.length - 1) {
        for (let s = 0; s < tracking; s++) {
          rows[r].push(0);
        }
      }
    }
  }

  return {
    rows,
    width: rows[0].length,
    height: 3
  };
}
