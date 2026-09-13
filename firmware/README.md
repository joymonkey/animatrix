# animatrix — Firmware

This directory contains firmware for the animatrix display system targeting the Waveshare ESP32-S3 Zero.

## Project Structure
- **`animatrix/` (Active / Production Release)**: The main release firmware for ESP32-S3. Built with PlatformIO, it features:
  - Multi-matrix hardware abstraction supporting both the **Adafruit 16×9 Charlieplexed Matrix (Product #2947)** and the **Custom 3×40 Daft Punk Visor Matrix** (selectable in `include/config.h`).
  - Native playback engine for `animatrix-v2` JSON animation files exported from the Animatrix Web Studio (flat hex byte streaming, resolution-agnostic headers, loop modes: `infinite`, `once`, `ping_pong`).
  - Dual-Core FreeRTOS division: Core 1 dedicated to high-precision matrix rendering, Core 0 handling Wi-Fi SoftAP (`Animatrix-Visor`), LittleFS storage, and asynchronous REST/upload API with CORS support (`EspUploader.js`).
  - Embedded Cyberpunk HUD web dashboard stored in LittleFS for browser control and drag-and-drop animation deployment.
- **`ledMatrix_prod/` (Reference / Proof of Concept)**: The original proof-of-concept dual-core firmware.
- **`ledMatrix_demo/` (Reference)**: Standalone Arduino demonstration sketch with Charlieplex LUT mapping.

