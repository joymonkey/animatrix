# animatrix

**animatrix** is an open-source hardware, firmware, and software toolkit for custom LED matrix displays.

The project began as a reproduction display for a Daft Punk helmet visor (a 40×3 matrix sitting across the visor opening), but is designed to be hardware- and geometry-agnostic over time to support a variety of custom LED matrix projects.

## Hardware
KiCad design files for the custom flexible PCB LED matrix
- **EDA Tool:** KiCad 10
- **Matrix:** 40 columns × 3 rows (120 LEDs total) on a 2-layer flexible printed circuit (FPC).
- **LEDs:** Standard 3mm (T-1) through-hole LEDs spaced on a 6.0 mm grid pitch.
- **Driver:** Lumissil / ISSI **IS31FL3731**, communicating over I2C with per-pixel 8-bit PWM brightness control.
- **Interface:** Controller tail designed to mate directly with a Waveshare ESP32-S3 Zero.

## Firmware
ESP32-S3 firmware to drive the matrix and play animations
- **Platform:** ESP32-S3 using PlatformIO and the Arduino core.
- **Architecture:**
  - **Core 0 (Networking & Control):** Wi-Fi (SoftAP/Station), AsyncWebServer, REST API, and LittleFS file management.
  - **Core 1 (Animation Engine):** Real-time frame playback and I2C communication with the IS31FL3731 driver.
- **Animation Format:** Interprets lightweight JSON animation files.
- **UI & Control Options:**
  - **Web UI:** Hosted onboard over Wi-Fi (SoftAP/Station) for smartphone/browser control, animation triggering, and file uploads.
  - **Physical Triggers:** Support for external hardware pushbuttons (e.g., wearable/costume triggers), directly wired on via a separate device using ESP-Now.

## Website
Animatrix LED Studio companion web app for creating animations. Preview it at https://joymonkey.github.io/animatrix/
  - Visual editor with frame-by-frame drawing tools and LED bloom/visor simulation.
  - Multi-frame timeline sequencer with undo/redo and variable frame rates.
  - Procedural generators: Cylon/KITT sweeps, robotic eye gestures, audio spectrum visualizers, breathing pulses, and text marquees. All of which can be mixed together into single animations.
  - Multi-track timeline compositing (additive, max, overwrite, and screen blend modes).
  - Export to JSON, C++ PROGMEM headers (Arduino / ESP-IDF), or direct over-the-air HTTP upload to the ESP32-S3.

