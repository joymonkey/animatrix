#ifndef HEARTBEAT_H
#define HEARTBEAT_H

#include <Arduino.h>
#include "config.h"

// ==============================================================================
// Heartbeat Status Indicator (Waveshare ESP32-S3 Zero NeoPixel on GPIO 21)
//
// States:
//  - Solid Yellow: Animation JSON actively playing
//  - Slow blink Green/Blue: Wi-Fi enabled & healthy idle
//  - Slow blink Green/Off: Wi-Fi disabled & healthy idle ("everything okay")
// ==============================================================================
class HeartbeatIndicator {
public:
    static void init() {
        neopixelWrite(PIN_RGB_LED, 0, 0, 0);
    }

    static void update(bool isPlaying, bool isWifiEnabled) {
        if (isPlaying) {
            // Solid Yellow (Red + Green at low brightness)
            neopixelWrite(PIN_RGB_LED, HEARTBEAT_BRIGHTNESS, HEARTBEAT_BRIGHTNESS, 0);
            return;
        }

        // Slow blink toggles every HEARTBEAT_BLINK_MS
        bool phase = ((millis() / HEARTBEAT_BLINK_MS) % 2) == 0;

        if (isWifiEnabled) {
            if (phase) {
                // Phase 1: Green
                neopixelWrite(PIN_RGB_LED, 0, HEARTBEAT_BRIGHTNESS, 0);
            } else {
                // Phase 2: Blue
                neopixelWrite(PIN_RGB_LED, 0, 0, HEARTBEAT_BRIGHTNESS);
            }
        } else {
            if (phase) {
                // Phase 1: Green
                neopixelWrite(PIN_RGB_LED, 0, HEARTBEAT_BRIGHTNESS, 0);
            } else {
                // Phase 2: Off
                neopixelWrite(PIN_RGB_LED, 0, 0, 0);
            }
        }
    }
};

#endif // HEARTBEAT_H
