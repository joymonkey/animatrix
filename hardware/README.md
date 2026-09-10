# animatrix — Hardware

This directory contains KiCad 10 design files for a custom 40×3 (120 LEDs total) flexible circuit board (FPC) using standard 3mm through-hole LEDs spaced on a 6.0 mm grid. The display is driven by a Lumissil IS31FL3731 charlieplexing driver IC (SSOP-28) over I2C with individual 8-bit PWM brightness control, powered via 5V USB VBUS, and featuring a direct-solder controller tail designed to interface with a Waveshare ESP32-S3 Zero.
