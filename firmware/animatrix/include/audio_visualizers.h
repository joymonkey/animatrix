#ifndef AUDIO_VISUALIZERS_H
#define AUDIO_VISUALIZERS_H

#include <Arduino.h>

void renderAudioVisualizer(const char* type, const char* origin, uint16_t width, uint16_t height, uint8_t* outBuffer);

#endif // AUDIO_VISUALIZERS_H
