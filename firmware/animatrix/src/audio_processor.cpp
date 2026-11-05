#include "audio_processor.h"

AudioMetrics audioStats;
bool micDetected = false;

// Single-pole DC blocking filter state
static float dc_x_prev = 0.0f;
static float dc_y_prev = 0.0f;
static const float DC_POLE = 0.985f;

// Beat detection state
static float energy_short_acc = 0.0f;
static float energy_long_avg  = 100.0f;

static int32_t raw_i2s_buf[AUDIO_CHUNK_SIZE];

bool initI2S() {
    pinMode(PIN_I2S_LR, OUTPUT);
    digitalWrite(PIN_I2S_LR, LOW); // Left channel

    // Set internal pull-down on SD pin so disconnected pin reads 0
    gpio_set_pull_mode((gpio_num_t)PIN_I2S_SD, GPIO_PULLDOWN_ONLY);

    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 4,
        .dma_buf_len = AUDIO_CHUNK_SIZE,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .mck_io_num = I2S_PIN_NO_CHANGE, // Prevent stealing GPIO 0
        .bck_io_num = PIN_I2S_SCK,
        .ws_io_num = PIN_I2S_WS,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = PIN_I2S_SD
    };

    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("[I2S] Failed to install driver: %d\n", err);
        micDetected = false;
        return false;
    }

    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("[I2S] Failed to set pins: %d\n", err);
        i2s_driver_uninstall(I2S_PORT);
        micDetected = false;
        return false;
    }

    // Initialize stats
    audioStats.dynamic_max_amp = 500.0f;
    audioStats.voice_smooth = 0.0f;
    audioStats.vu_peak_level = 0.0f;
    audioStats.last_vu_peak_time = 0;
    audioStats.last_beat_time = 0;
    audioStats.beat_intensity = 0.0f;

    // Sample variance check to detect microphone presence
    int total_samples = 0;
    float sum = 0.0f;
    float sum_sq = 0.0f;

    for (int b = 0; b < 3; b++) {
        size_t bytes_read = 0;
        esp_err_t res = i2s_read(I2S_PORT, raw_i2s_buf, sizeof(raw_i2s_buf), &bytes_read, pdMS_TO_TICKS(50));
        if (res == ESP_OK && bytes_read > 0) {
            int count = bytes_read / sizeof(int32_t);
            for (int i = 0; i < count; i++) {
                float sample = (float)(raw_i2s_buf[i] >> 14);
                sum += sample;
                sum_sq += sample * sample;
                total_samples++;
            }
        }
    }

    float variance = 0.0f;
    if (total_samples > 0) {
        float mean = sum / (float)total_samples;
        variance = (sum_sq / (float)total_samples) - (mean * mean);
    }

    // An active INMP441 always produces non-zero acoustic dither variance (>4.0f).
    // Without a mic, pulled-down line reads 0s with 0.0 variance.
    micDetected = (variance > 4.0f);
    Serial.printf("[I2S] Microphone detection: sample variance = %.2f -> %s\n",
                  variance, micDetected ? "CONNECTED" : "NOT DETECTED");

    if (!micDetected) {
        Serial.println("[I2S] Releasing I2S driver & DMA memory (no mic attached).");
        i2s_driver_uninstall(I2S_PORT);
        return false;
    }

    Serial.println("[I2S] INMP441 Driver initialized successfully.");
    return true;
}

void audioTask(void *pvParameters) {
    Serial.println("[Audio] Audio Processing Task Started");
    
    while(1) {
        size_t bytes_read = 0;
        esp_err_t res = i2s_read(I2S_PORT, raw_i2s_buf, sizeof(raw_i2s_buf), &bytes_read, portMAX_DELAY);
        if (res != ESP_OK || bytes_read == 0) {
            vTaskDelay(10 / portTICK_PERIOD_MS);
            continue;
        }

        int sample_count = bytes_read / sizeof(int32_t);
        if (sample_count == 0) {
            vTaskDelay(5 / portTICK_PERIOD_MS);
            continue;
        }

        float sum_sq = 0.0f;
        float peak_val = 0.0f;

        for (int i = 0; i < sample_count; ++i) {
            float sample = (float)(raw_i2s_buf[i] >> 14);

            float y = sample - dc_x_prev + DC_POLE * dc_y_prev;
            dc_x_prev = sample;
            dc_y_prev = y;

            audioStats.filtered_samples[i] = y;

            float abs_val = fabsf(y);
            if (abs_val > peak_val) {
                peak_val = abs_val;
            }
            sum_sq += y * y;
        }

        audioStats.peak = peak_val;
        audioStats.rms = sqrtf(sum_sq / (float)sample_count);

        if (peak_val > audioStats.dynamic_max_amp) {
            audioStats.dynamic_max_amp = peak_val;
        } else {
            audioStats.dynamic_max_amp = audioStats.dynamic_max_amp * 0.985f + 200.0f * 0.015f;
            if (audioStats.dynamic_max_amp < 300.0f) audioStats.dynamic_max_amp = 300.0f;
        }

        energy_short_acc = energy_short_acc * 0.6f + audioStats.rms * 0.4f;
        energy_long_avg  = energy_long_avg * 0.96f + audioStats.rms * 0.04f;

        unsigned long now = millis();
        if ((energy_short_acc > energy_long_avg * 1.65f) && 
            (energy_short_acc > 400.0f) && 
            (now - audioStats.last_beat_time > 200)) {
            audioStats.last_beat_time = now;
            audioStats.beat_intensity = 1.0f;
        } else {
            audioStats.beat_intensity *= 0.82f;
            if (audioStats.beat_intensity < 0.01f) audioStats.beat_intensity = 0.0f;
        }

        const float VAD_THRESHOLD = 350.0f;
        if (audioStats.rms > VAD_THRESHOLD) {
            audioStats.voice_smooth = audioStats.voice_smooth * 0.7f + 1.0f * 0.3f;
        } else {
            audioStats.voice_smooth = audioStats.voice_smooth * 0.88f;
        }
    }
}
