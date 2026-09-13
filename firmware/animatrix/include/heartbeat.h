#ifndef HEARTBEAT_H
#define HEARTBEAT_H

#include <Arduino.h>
#include "config.h"

// ==============================================================================
// Heartbeat Status Indicator (Waveshare ESP32-S3 Zero NeoPixel on GPIO 21)
//
// Dynamic multi-state slow blink:
//  - Green:  System running / healthy heartbeat (always present)
//  - Blue:   Wi-Fi active (SoftAP / STA)
//  - Yellow: Matrix animation actively playing
//
// Combinations:
//  - All 3 active:      Green -> Blue -> Yellow
//  - Running + Wi-Fi:   Green -> Blue
//  - Running + Playing: Green -> Yellow
//  - Running only:      Green -> Off
// ==============================================================================
class HeartbeatIndicator {
public:
    static void init() {
        neopixelWrite(PIN_RGB_LED, 0, 0, 0);
    }

    static void update(bool isPlaying, bool isWifiEnabled) {
        // Collect active status colors for this cycle
        uint8_t colors[4];
        uint8_t count = 0;

        // 1. Green = Base system heartbeat (always alive)
        colors[count++] = 1;

        // 2. Blue = Wi-Fi active
        if (isWifiEnabled) {
            colors[count++] = 2;
        }

        // 3. Yellow = Animation actively playing
        if (isPlaying) {
            colors[count++] = 3;
        }

        // If only Green is active, add Off phase for a standard heartbeat pulse
        if (count == 1) {
            colors[count++] = 0;
        }

        uint32_t step = (millis() / HEARTBEAT_BLINK_MS) % count;
        uint8_t activeColor = colors[step];

        switch (activeColor) {
            case 1: // Green
                neopixelWrite(PIN_RGB_LED, 0, HEARTBEAT_BRIGHTNESS, 0);
                break;
            case 2: // Blue
                neopixelWrite(PIN_RGB_LED, 0, 0, HEARTBEAT_BRIGHTNESS);
                break;
            case 3: // Yellow (Red + Green)
                neopixelWrite(PIN_RGB_LED, HEARTBEAT_BRIGHTNESS, HEARTBEAT_BRIGHTNESS, 0);
                break;
            default: // Off
                neopixelWrite(PIN_RGB_LED, 0, 0, 0);
                break;
        }
    }
};

#endif // HEARTBEAT_H
