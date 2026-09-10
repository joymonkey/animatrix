# animatrix — Firmware

This directory contains firmware for the animatrix display system targeting the Waveshare ESP32-S3 Zero. It includes a standalone Arduino demonstration sketch (`ledMatrix_demo/`) with coordinate mapping routines, and a production PlatformIO project (`ledMatrix_prod/`) featuring a dual-core architecture: Core 0 manages Wi-Fi (SoftAP/Station), an asynchronous web server, REST API, LittleFS storage, and button/ESP-NOW triggers, while Core 1 handles real-time animation playback and I2C communication with the IS31FL3731 LED driver.
