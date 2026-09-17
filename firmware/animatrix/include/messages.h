#ifndef MESSAGES_H
#define MESSAGES_H

#include <Arduino.h>

enum TriggerType {
    TRIGGER_NONE,
    TRIGGER_ALL_ON,
    TRIGGER_ALL_OFF,
    TRIGGER_TEST_SWIPE,
    TRIGGER_PLAY_SCRIPT,
    TRIGGER_PAUSE,
    TRIGGER_RESUME,
    TRIGGER_SET_MATRIX,
    TRIGGER_PROBE_PIXEL
};

struct AnimationTrigger {
    TriggerType type;
    char scriptFilename[48]; // Target script path in LittleFS
    int16_t x;
    int16_t y;
    uint8_t brightness;
};

#endif // MESSAGES_H
