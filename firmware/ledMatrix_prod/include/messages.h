#ifndef MESSAGES_H
#define MESSAGES_H

#include <Arduino.h>

enum TriggerType {
    TRIGGER_NONE,
    TRIGGER_ALL_ON,
    TRIGGER_ALL_OFF,
    TRIGGER_TEST_ANIMATION,
    TRIGGER_JSON_SCRIPT
};

struct AnimationTrigger {
    TriggerType type;
    char scriptFilename[32]; // If type is TRIGGER_JSON_SCRIPT
};

#endif
