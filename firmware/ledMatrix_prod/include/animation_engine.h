#ifndef ANIMATION_ENGINE_H
#define ANIMATION_ENGINE_H

#include <Arduino.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include "matrix_driver.h"

extern CustomMatrix3x40 matrix;

void runJsonAnimation(const char* filename) {
    Serial.printf("[Core 1] Running JSON Script: %s\n", filename);
    
    File file = LittleFS.open(filename, "r");
    if (!file) {
        Serial.println("[Core 1] Failed to open script file.");
        return;
    }

    JsonDocument doc; // ArduinoJson v7 adjusts size automatically (on ESP32 uses heap)
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.printf("[Core 1] deserializeJson() failed: %s\n", error.c_str());
        return;
    }

    JsonArray frames = doc["frames"].as<JsonArray>();
    if (frames.isNull()) {
        Serial.println("[Core 1] No 'frames' array found in JSON.");
        return;
    }

    for (JsonObject frame : frames) {
        if (frame["clear"] | false) {
            matrix.clear();
        }
        
        if (frame.containsKey("fill")) {
            uint8_t brightness = frame["fill"].as<uint8_t>();
            matrix.fillScreen(brightness);
        }

        if (frame.containsKey("pixels")) {
            JsonArray pixels = frame["pixels"].as<JsonArray>();
            for (JsonArray pixel : pixels) {
                int16_t x = pixel[0];
                int16_t y = pixel[1];
                uint8_t color = pixel[2];
                matrix.drawPixel(x, y, color);
            }
        }

        uint32_t delayMs = frame["delay"] | 0;
        if (delayMs > 0) {
            delay(delayMs);
        }
    }
    Serial.println("[Core 1] JSON Animation finished.");
}

#endif // ANIMATION_ENGINE_H
