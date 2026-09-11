# animatrix // LED Studio & JSON Spec

A flexible, web-based animation suite designed for crafting, sequencing, previewing, and deploying animations to custom LED matrices.

Designed for an **8-bit PWM matrix** (such as a 40×3 120-LED display) powered by an **ESP32-S3** or any other microcontroller. All coordinate mapping is handled cleanly at the firmware driver level.

---

## Quick Start

1. Open `index.html` directly in your browser (no build steps or dependencies needed).
2. The studio initializes with the iconic **Cylon / Knight Rider Visor Sweep** animation pre-loaded.
3. Press `Space` to start/pause playback.
4. Click **Text Marquee** in the header to convert any phrase (e.g. "DAFT PUNK", "ROBOT ROCK") into a scrolling ticker across the 3-row display using the built-in micro font.
5. Click **Push to Display** in the Export/Import section to push animations directly to your ESP32-S3 over WiFi!

---

## Studio Features

- **LED Matrix Simulation**:
  - High-intensity phosphor glow, hot center cores, and bloom.
  - Optional **Visor Glass filter** toggle to simulate looking through tinted smoke acrylic with subtle horizontal scanlines.
  - Optional **Center Axis** center guide (column 20) for dual-eye setups (20×3 Left Eye + 20×3 Right Eye).
- **Comprehensive Drawing Tools**:
  - **Pencil** (brush with 8-bit PWM brightness 0–255).
  - **Eraser** (turn off pixels).
  - **Eyedropper** (sample brightness from any pixel).
  - **Bucket Fill** (flood fill contiguous pixels).
  - **Line Tool** (Bresenham line rasterization).
  - **Hollow & Filled Rectangle** tools.
  - **Nudge & Shift**: Shift frame Left, Right, Up, Down (with edge wrapping).
  - **Flip & Invert**: Flip horizontal/vertical or invert brightness ($255 - b$).
- **Multi-Frame Sequencer & Timeline**:
  - Live miniature canvas thumbnails for every frame.
  - Drag-and-drop frame reordering.
  - Per-frame duration control (e.g., hold eye open for 1200ms, blink for 40ms).
  - Playback loop modes: **Infinite Loop**, **Play Once**, and **Ping-Pong (Bounce)**.
- **Built-in Procedural Generators & Compositing**:
  - **Generators**: Cylon/KITT sweeps (multiple shapes & turnaround endpoints), robotic eye expressions (blink, wink, squint, scan with auto-proportional geometry), 40-band audio spectrum equalizers, sinusoidal breathing pulses, and text marquees.
  - **Multi-Track Compositing**: Target modes (`replace`, `overlay`, `append`) with blend modes (`add`, `max`, `overwrite`, `screen`) and automatic Least Common Multiple (LCM) duration alignment for polyrhythmic layering.
  - **Frame-Count Motion Speed**: Motion speed is synchronized via frames per pass/sweep, keeping layered animations in lockstep with the global timeline FPS.
- **Flexible Matrix Resizing**:
  - Easily reconfigure to any dimension (e.g. 16×9, 24×8, 48×3) via the header configuration modal.

---

## JSON Animation Specification (`animatrix-v1`)

Animations are exported as `.json` files. The specification is designed for minimal parsing overhead and memory footprint on microcontrollers like the ESP32-S3.

### Specification Structure

```json
{
  "$schema": "animatrix-v1",
  "name": "cylon_visor_sweep",
  "author": "Guy-Manuel",
  "version": 1,
  "matrix": {
    "width": 40,
    "height": 3,
    "color": "red",
    "grayscale_depth": 8
  },
  "playback": {
    "fps": 30,
    "loop": "infinite",
    "ping_pong": false
  },
  "total_frames": 10,
  "frames": [
    {
      "duration_ms": 33,
      "encoding": "hex_stream",
      "data": "00ffff00...00"
    }
  ]
}
```

### Encoding Formats Supported

1. **`hex_stream` (Optimized for Microcontrollers)**:
   - Each LED's 8-bit brightness ($0-255$) is represented by two hexadecimal characters (`00` to `ff`).
   - For a $40 \times 3 = 120$ LED matrix, each frame's data string is exactly **240 characters**.
   - Negligible RAM overhead and can be parsed into a raw `uint8_t[120]` buffer with simple byte shifts in C++.
2. **`raw_array` (Human-Readable)**:
   - A 2D array of rows `[[row0_cols...], [row1_cols...], [row2_cols...]]` with integers from 0 to 255.
   - Ideal for inspecting or hand-crafting single frames.

---

## Hardware-Agnostic Matrix Architecture
The studio operates purely with logical $(X, Y)$ coordinates ($0 \le X < \text{width}$, $0 \le Y < \text{height}$) and 8-bit PWM brightness values ($0-255$).

By decoupling the animation tool from specific LED driver hardware:
- **Universal Sequences:** Animation files and C++ tables work with any display technology (Charlieplexed drivers like IS31FL3731, addressable strips like WS2812/NeoPixel, shift-register matrices like MAX7219, or multiplexed HUB75 panels).
- **Firmware Driver Abstraction:** Hardware-specific address translation, pin routing, and Charlieplex LUTs live where they belong—in the microcontroller's `drawPixel(x, y, brightness)` routine.

---

## Firmware Integration & Deployment

Animatrix is designed to connect directly with the ESP32-S3 firmware:

- **Direct Wi-Fi Push:** The studio includes a client-side HTTP uploader (`EspUploader.js`) that sends JSON payloads directly to `POST /api/upload` on the ESP32-S3 over local Wi-Fi.
- **C++ PROGMEM Export:** Export animations directly as compiled C++ byte arrays for embedding into microcontroller flash memory without filesystem dependencies.
- **Microcontroller Processing:** On the ESP32-S3, Core 0 receives and stores the lightweight `hex_stream` data in LittleFS, while Core 1 parses frames and streams them over I2C to the IS31FL3731 driver.

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause Animation |
| `[` / `]` | Step Backward / Forward one frame |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `B` | Select Pencil Tool |
| `E` | Select Eraser Tool |
| `I` | Select Eyedropper Tool |
| `G` | Select Bucket Fill Tool |
| `L` | Select Line Tool |
| `R` | Select Rectangle Tool |
| `Shift + Arrow Keys` | Nudge / Shift active frame Left, Right, Up, Down |
