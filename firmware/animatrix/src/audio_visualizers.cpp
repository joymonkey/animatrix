#include "audio_visualizers.h"
#include "audio_processor.h"
#include "matrix_driver.h"

void renderVUMeter(const char* origin, uint16_t width, uint16_t height, uint8_t* outBuffer) {
    displayMatrix->clear();
    memset(outBuffer, 0, width * height);

    float max_expected = 2500.0f;
    float level = (audioStats.rms / max_expected) * (float)width;
    if (level > width) level = width;

    // Peak decay
    if (level > audioStats.vu_peak_level) {
        audioStats.vu_peak_level = level;
        audioStats.last_vu_peak_time = millis();
    } else if (millis() - audioStats.last_vu_peak_time > 40) {
        audioStats.vu_peak_level -= 0.35f;
        if (audioStats.vu_peak_level < 0.0f) audioStats.vu_peak_level = 0.0f;
    }

    int active_cols = (int)roundf(level);
    int peak_col = (int)roundf(audioStats.vu_peak_level);

    bool isCenter = (strcmp(origin, "center_horizontal") == 0);
    bool isRight = (strcmp(origin, "right_to_left") == 0);

    for (int col = 0; col < width; ++col) {
        bool isActive = false;
        bool isPeak = false;

        if (isCenter) {
            int mid = width / 2;
            int dist = abs(col - mid);
            if (dist < active_cols / 2) isActive = true;
            if (dist == peak_col / 2 && peak_col > 0) isPeak = true;
        } else if (isRight) {
            int dist = (width - 1) - col;
            if (dist < active_cols) isActive = true;
            if (dist == peak_col && peak_col > 0) isPeak = true;
        } else {
            // left to right
            if (col < active_cols) isActive = true;
            if (col == peak_col && peak_col > 0) isPeak = true;
        }

        if (isActive || isPeak) {
            for (int row = 0; row < height; ++row) {
                uint8_t b = isPeak ? 255 : (isActive ? 160 : 0);
                displayMatrix->drawPixel(col, row, b);
                outBuffer[row * width + col] = b;
            }
        }
    }
}

void renderWaveform(const char* origin, uint16_t width, uint16_t height, uint8_t* outBuffer) {
    displayMatrix->clear();
    memset(outBuffer, 0, width * height);

    const int midY = height / 2;
    const int step = AUDIO_CHUNK_SIZE / width;
    int prevY = midY;

    bool isRight = (strcmp(origin, "right_to_left") == 0);

    for (int c = 0; c < width; ++c) {
        int col = isRight ? (width - 1) - c : c;

        float col_sum = 0.0f;
        for (int s = 0; s < step; ++s) {
            col_sum += audioStats.filtered_samples[c * step + s];
        }
        float avg_sample = col_sum / (float)step;

        float norm = avg_sample / audioStats.dynamic_max_amp;
        if (norm > 1.0f)  norm = 1.0f;
        if (norm < -1.0f) norm = -1.0f;

        int targetY = midY - (int)roundf(norm * (height / 2.0f));
        if (targetY < 0) targetY = 0;
        if (targetY >= height) targetY = height - 1;

        int minY = min(midY, targetY);
        int maxY = max(midY, targetY);
        for (int y = minY; y <= maxY; ++y) {
            uint8_t brightness = (y == targetY) ? 180 : 80;
            displayMatrix->drawPixel(col, y, brightness);
            outBuffer[y * width + col] = brightness;
        }

        if (c > 0) {
            int step_min = min(prevY, targetY);
            int step_max = max(prevY, targetY);
            for (int y = step_min; y <= step_max; ++y) {
                displayMatrix->drawPixel(col, y, 120);
                outBuffer[y * width + col] = 120;
            }
        }
        prevY = targetY;
    }
}

void renderBeatRipple(const char* origin, uint16_t width, uint16_t height, uint8_t* outBuffer) {
    displayMatrix->clear();
    memset(outBuffer, 0, width * height);

    float center_x = width / 2.0f;
    float center_y = height / 2.0f;

    if (strcmp(origin, "left_to_right") == 0) center_x = 0.0f;
    if (strcmp(origin, "right_to_left") == 0) center_x = (float)width;

    float max_radius = max((float)width, (float)height);

    unsigned long elapsed = millis() - audioStats.last_beat_time;
    float ripple_radius = (elapsed < 350) ? (elapsed / 350.0f) * max_radius : -1.0f;

    for (int x = 0; x < width; ++x) {
        for (int y = 0; y < height; ++y) {
            float dx = (float)x - center_x;
            float dy = ((float)y - center_y) * (width / (float)height); // scale for non-square
            float dist = sqrtf(dx * dx + dy * dy);

            uint8_t brightness = 0;

            if (ripple_radius >= 0.0f) {
                float ring_diff = fabsf(dist - ripple_radius);
                if (ring_diff < 1.2f) {
                    float ring_factor = (1.2f - ring_diff) / 1.2f;
                    float fade = 1.0f - (ripple_radius / max_radius);
                    if (fade < 0.0f) fade = 0.0f;
                    brightness = (uint8_t)(ring_factor * fade * 255.0f);
                }
            }

            if (audioStats.beat_intensity > 0.05f && dist < 3.0f) {
                uint8_t flash = (uint8_t)((1.0f - (dist / 3.0f)) * audioStats.beat_intensity * 240.0f);
                brightness = max(brightness, flash);
            }

            if (brightness > 0) {
                displayMatrix->drawPixel(x, y, brightness);
                outBuffer[y * width + x] = brightness;
            }
        }
    }
}

void renderVadBreath(const char* origin, uint16_t width, uint16_t height, uint8_t* outBuffer) {
    displayMatrix->clear();
    memset(outBuffer, 0, width * height);

    if (audioStats.voice_smooth > 0.15f) {
        int width_span = (int)roundf(audioStats.voice_smooth * (width / 2.0f));
        int midX = width / 2;
        
        if (strcmp(origin, "left_to_right") == 0) midX = 0;
        if (strcmp(origin, "right_to_left") == 0) midX = width - 1;

        for (int x = midX - width_span; x <= midX + width_span; ++x) {
            if (x < 0 || x >= width) continue;
            float dist_from_mid = fabsf((float)x - (float)midX) / (float)(width / 2.0f);
            if (dist_from_mid > 1.0f) dist_from_mid = 1.0f;
            
            int active_height = (int)roundf((1.0f - dist_from_mid) * height * audioStats.voice_smooth);
            int minY = (height / 2) - (active_height / 2);
            int maxY = (height / 2) + (active_height / 2);
            for (int y = minY; y <= maxY; ++y) {
                if (y >= 0 && y < height) {
                    uint8_t b = (uint8_t)(audioStats.voice_smooth * 220.0f);
                    displayMatrix->drawPixel(x, y, b);
                    outBuffer[y * width + x] = b;
                }
            }
        }
    } else {
        float breath = (sinf(millis() * 0.003f) + 1.0f) * 0.5f;
        uint8_t b = (uint8_t)(breath * 40.0f + 10.0f);
        displayMatrix->drawPixel(width/2, height/2, b);
        outBuffer[(height/2) * width + (width/2)] = b;
        if (width/2 + 1 < width) {
            displayMatrix->drawPixel(width/2 + 1, height/2, b);
            outBuffer[(height/2) * width + (width/2 + 1)] = b;
        }
    }
}


void renderAudioVisualizer(const char* type, const char* origin, uint16_t width, uint16_t height, uint8_t* outBuffer) {
    if (strcmp(type, "vu_meter") == 0) {
        renderVUMeter(origin, width, height, outBuffer);
    } else if (strcmp(type, "waveform") == 0) {
        renderWaveform(origin, width, height, outBuffer);
    } else if (strcmp(type, "beat_ripple") == 0) {
        renderBeatRipple(origin, width, height, outBuffer);
    } else if (strcmp(type, "vad_breath") == 0) {
        renderVadBreath(origin, width, height, outBuffer);
    } else {
        // Fallback or unknown
        displayMatrix->clear();
        memset(outBuffer, 0, width * height);
    }
}
