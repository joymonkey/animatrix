#ifndef AUDIO_PROCESSOR_H
#define AUDIO_PROCESSOR_H

#include <Arduino.h>
#include <driver/i2s.h>
#include <cmath>

#define PIN_I2S_SD       7
#define PIN_I2S_SCK      8
#define PIN_I2S_WS       9
#define PIN_I2S_LR       10

#define I2S_PORT         I2S_NUM_0
#define SAMPLE_RATE      16000
#define AUDIO_CHUNK_SIZE 256

struct AudioMetrics {
    float rms;
    float peak;
    float dynamic_max_amp;
    float beat_intensity;
    float voice_smooth;
    float filtered_samples[AUDIO_CHUNK_SIZE];
    float vu_peak_level;
    unsigned long last_vu_peak_time;
    unsigned long last_beat_time;
};

extern AudioMetrics audioStats;
extern bool micDetected;

bool initI2S();
void audioTask(void *pvParameters);

#endif // AUDIO_PROCESSOR_H
