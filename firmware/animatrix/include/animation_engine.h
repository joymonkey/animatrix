#ifndef ANIMATION_ENGINE_H
#define ANIMATION_ENGINE_H

#include <Arduino.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include "matrix_driver.h"
#include "messages.h"

// ==============================================================================
// Hex Conversion Helpers
// ==============================================================================
inline uint8_t hexNibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return 0;
}

inline uint8_t hexToByte(char h, char l) {
    return (hexNibble(h) << 4) | hexNibble(l);
}

// ==============================================================================
// Loop Mode & Blend Mode Enumerations
// ==============================================================================
#define MAX_MATRIX_LEDS 144

enum LoopMode {
    LOOP_INFINITE,
    LOOP_ONCE,
    LOOP_PING_PONG
};

enum TransitionBlendMode {
    BLEND_NONE = 0,
    BLEND_ADDITIVE,
    BLEND_CROSSFADE
};

// ==============================================================================
// AnimationEngine Class
// ==============================================================================
class AnimationEngine {
public:
    AnimationEngine() :
        _isLoaded(false),
        _isPlaying(false),
        _animWidth(0),
        _animHeight(0),
        _fps(30),
        _frameDelayMs(33),
        _totalFrames(0),
        _currentFrame(0),
        _pingPongDir(1),
        _loopMode(LOOP_INFINITE),
        _lastFrameTime(0),
        _cycleCount(0),
        _brightnessMultiplier(1.0f),
        _blendMode(BLEND_NONE),
        _blendProgress(0.0f),
        _blendBufferWidth(0),
        _blendBufferHeight(0)
    {
        strncpy(_animName, "none", sizeof(_animName) - 1);
        strncpy(_activeFilename, "", sizeof(_activeFilename) - 1);
        memset(_lastRenderedBuffer, 0, sizeof(_lastRenderedBuffer));
        memset(_blendFromBuffer, 0, sizeof(_blendFromBuffer));
    }

    bool loadAnimation(const char* filepath, bool renderFirstFrame = true) {
        Serial.printf("[AnimEngine] Loading '%s'...\n", filepath);

        File file = LittleFS.open(filepath, "r");
        if (!file) {
            Serial.printf("[AnimEngine] Error: File '%s' not found.\n", filepath);
            return false;
        }

        // Parse JSON using ArduinoJson v7
        DeserializationError err = deserializeJson(_doc, file);
        file.close();

        if (err) {
            Serial.printf("[AnimEngine] JSON deserialize error: %s\n", err.c_str());
            return false;
        }

        // Validate animatrix schema
        const char* schema = _doc["$schema"] | "";
        if (strcmp(schema, "animatrix-v2") != 0 && strcmp(schema, "animatrix-v1") != 0) {
            Serial.printf("[AnimEngine] Warning: Unrecognized schema '%s', attempting parse anyway.\n", schema);
        }

        const char* name = _doc["name"] | "untitled";
        strncpy(_animName, name, sizeof(_animName) - 1);
        strncpy(_activeFilename, filepath, sizeof(_activeFilename) - 1);

        JsonObject matrixObj = _doc["matrix"];
        _animWidth = matrixObj["width"] | displayMatrix->width();
        _animHeight = matrixObj["height"] | displayMatrix->height();

        JsonObject playbackObj = _doc["playback"];
        _fps = playbackObj["fps"] | 30;
        if (_fps < 1) _fps = 1;
        if (_fps > 120) _fps = 120;
        _frameDelayMs = 1000 / _fps;

        const char* loopStr = playbackObj["loop"] | "infinite";
        if (strcmp(loopStr, "once") == 0) {
            _loopMode = LOOP_ONCE;
        } else if (strcmp(loopStr, "ping_pong") == 0) {
            _loopMode = LOOP_PING_PONG;
        } else {
            _loopMode = LOOP_INFINITE;
        }

        JsonArray frames = _doc["frames"].as<JsonArray>();
        if (frames.isNull() || frames.size() == 0) {
            Serial.println("[AnimEngine] Error: No frames array found in JSON.");
            _isLoaded = false;
            _isPlaying = false;
            return false;
        }

        _totalFrames = frames.size();
        _currentFrame = 0;
        _pingPongDir = 1;
        _isLoaded = true;
        _isPlaying = true;
        _lastFrameTime = 0;
        _cycleCount = 0;
        _brightnessMultiplier = 1.0f;

        Serial.printf("[AnimEngine] Loaded '%s' successfully (%u frames, %ux%u @ %u FPS, loop: %s)\n",
                      _animName, _totalFrames, _animWidth, _animHeight, _fps, loopStr);

        // Render first frame immediately only if requested
        if (renderFirstFrame) {
            renderCurrentFrame();
        }
        return true;
    }

    void reset() {
        _isLoaded = false;
        _isPlaying = false;
        _totalFrames = 0;
        _currentFrame = 0;
        _cycleCount = 0;
        _brightnessMultiplier = 1.0f;
        _blendMode = BLEND_NONE;
        _doc.clear();
    }

    void renderCurrentFrame() {
        if (!_isLoaded || _totalFrames == 0) return;

        JsonArray frames = _doc["frames"].as<JsonArray>();
        const char* hexStr = frames[_currentFrame] | "";
        size_t hexLen = strlen(hexStr);
        size_t expectedLen = _animWidth * _animHeight * 2;

        if (hexLen < expectedLen) {
            // Incomplete frame string, skip
            return;
        }

        int dispW = displayMatrix->width();
        int dispH = displayMatrix->height();

        // Render row by row
        for (int y = 0; y < _animHeight && y < dispH; y++) {
            for (int x = 0; x < _animWidth && x < dispW; x++) {
                int charIdx = (y * _animWidth + x) * 2;
                uint8_t rawBrightness = hexToByte(hexStr[charIdx], hexStr[charIdx + 1]);
                uint8_t finalBrightness = rawBrightness;

                if (_blendMode == BLEND_ADDITIVE) {
                    uint8_t fromPixel = (x < _blendBufferWidth && y < _blendBufferHeight && (y * _blendBufferWidth + x) < MAX_MATRIX_LEDS) 
                                        ? _blendFromBuffer[y * _blendBufferWidth + x] : 0;
                    uint16_t outgoing = (uint16_t)(fromPixel * (1.0f - _blendProgress));
                    uint16_t incoming = (uint16_t)(rawBrightness * _blendProgress);
                    uint16_t sum = outgoing + incoming;
                    finalBrightness = (sum > 255) ? 255 : (uint8_t)sum;
                } else if (_blendMode == BLEND_CROSSFADE) {
                    uint8_t fromPixel = (x < _blendBufferWidth && y < _blendBufferHeight && (y * _blendBufferWidth + x) < MAX_MATRIX_LEDS) 
                                        ? _blendFromBuffer[y * _blendBufferWidth + x] : 0;
                    finalBrightness = (uint8_t)(fromPixel * (1.0f - _blendProgress) + rawBrightness * _blendProgress);
                } else {
                    finalBrightness = (uint8_t)(rawBrightness * _brightnessMultiplier);
                }

                if ((y * _animWidth + x) < MAX_MATRIX_LEDS) {
                    _lastRenderedBuffer[y * _animWidth + x] = finalBrightness;
                }

                displayMatrix->drawPixel(x, y, finalBrightness);
            }
        }
    }

    void stepNextFrame(bool render = true) {
        if (!_isLoaded || _totalFrames <= 1) return;

        bool cycleEnded = false;
        if (_loopMode == LOOP_INFINITE) {
            if (_currentFrame + 1 >= _totalFrames) {
                cycleEnded = true;
                _currentFrame = 0;
            } else {
                _currentFrame++;
            }
        } else if (_loopMode == LOOP_ONCE) {
            if (_currentFrame + 1 < _totalFrames) {
                _currentFrame++;
            } else {
                cycleEnded = true;
                _isPlaying = false; // Finished playback
                return;
            }
        } else if (_loopMode == LOOP_PING_PONG) {
            int next = (int)_currentFrame + _pingPongDir;
            if (next >= (int)_totalFrames) {
                _pingPongDir = -1;
                _currentFrame = _totalFrames > 1 ? _totalFrames - 2 : 0;
            } else if (next < 0) {
                _pingPongDir = 1;
                _currentFrame = _totalFrames > 1 ? 1 : 0;
                cycleEnded = true;
            } else {
                _currentFrame = next;
            }
        }

        if (cycleEnded) {
            _cycleCount++;
        }

        if (render) {
            renderCurrentFrame();
        }
    }

    bool update(bool render = true) {
        if (!_isLoaded || !_isPlaying) return false;

        uint32_t now = millis();
        if (now - _lastFrameTime >= _frameDelayMs) {
            _lastFrameTime = now;
            stepNextFrame(render);
            return true;
        }
        return false;
    }

    uint32_t getFramesRemainingInCycle() const {
        if (!_isLoaded || _totalFrames <= 1) return 0;
        if (_loopMode == LOOP_INFINITE || _loopMode == LOOP_ONCE) {
            return (_totalFrames > _currentFrame + 1) ? ((_totalFrames - 1) - _currentFrame) : 0;
        } else if (_loopMode == LOOP_PING_PONG) {
            if (_pingPongDir == 1) {
                uint32_t forwardLeft = (_totalFrames > _currentFrame + 1) ? ((_totalFrames - 1) - _currentFrame) : 0;
                uint32_t returnFrames = _totalFrames - 1;
                return forwardLeft + returnFrames;
            } else {
                return _currentFrame;
            }
        }
        return 0;
    }

    bool getFramePixels(uint8_t* dest, size_t maxLen) const {
        if (!_isLoaded || _totalFrames == 0 || !dest) return false;
        JsonArrayConst frames = _doc["frames"].as<JsonArrayConst>();
        const char* hexStr = frames[_currentFrame] | "";
        size_t expectedLen = _animWidth * _animHeight * 2;
        if (strlen(hexStr) < expectedLen) return false;

        size_t numPixels = _animWidth * _animHeight;
        if (numPixels > maxLen) numPixels = maxLen;

        for (size_t i = 0; i < numPixels; i++) {
            dest[i] = hexToByte(hexStr[i * 2], hexStr[i * 2 + 1]);
        }
        return true;
    }

    void swap(AnimationEngine& other) {
        _doc = std::move(other._doc);
        std::swap(_isLoaded, other._isLoaded);
        std::swap(_isPlaying, other._isPlaying);
        std::swap(_animWidth, other._animWidth);
        std::swap(_animHeight, other._animHeight);
        std::swap(_fps, other._fps);
        std::swap(_frameDelayMs, other._frameDelayMs);
        std::swap(_totalFrames, other._totalFrames);
        std::swap(_currentFrame, other._currentFrame);
        std::swap(_pingPongDir, other._pingPongDir);
        std::swap(_loopMode, other._loopMode);
        std::swap(_lastFrameTime, other._lastFrameTime);
        std::swap(_cycleCount, other._cycleCount);
        std::swap(_brightnessMultiplier, other._brightnessMultiplier);
        std::swap(_blendMode, other._blendMode);
        std::swap(_blendProgress, other._blendProgress);
        std::swap(_blendBufferWidth, other._blendBufferWidth);
        std::swap(_blendBufferHeight, other._blendBufferHeight);

        char tmp[48];
        memcpy(tmp, _animName, sizeof(tmp));
        memcpy(_animName, other._animName, sizeof(tmp));
        memcpy(other._animName, tmp, sizeof(tmp));

        memcpy(tmp, _activeFilename, sizeof(tmp));
        memcpy(_activeFilename, other._activeFilename, sizeof(tmp));
        memcpy(other._activeFilename, tmp, sizeof(tmp));

        uint8_t bufTmp[MAX_MATRIX_LEDS];
        memcpy(bufTmp, _lastRenderedBuffer, sizeof(bufTmp));
        memcpy(_lastRenderedBuffer, other._lastRenderedBuffer, sizeof(bufTmp));
        memcpy(other._lastRenderedBuffer, bufTmp, sizeof(bufTmp));

        memcpy(bufTmp, _blendFromBuffer, sizeof(bufTmp));
        memcpy(_blendFromBuffer, other._blendFromBuffer, sizeof(bufTmp));
        memcpy(other._blendFromBuffer, bufTmp, sizeof(bufTmp));
    }

    void pause() {
        _isPlaying = false;
        Serial.println("[AnimEngine] Playback paused.");
    }

    void resume() {
        if (_isLoaded) {
            _isPlaying = true;
            _lastFrameTime = millis();
            Serial.println("[AnimEngine] Playback resumed.");
        }
    }

    void stop() {
        _isPlaying = false;
        _currentFrame = 0;
        displayMatrix->clear();
    }

    // Status inspection
    bool isLoaded() const { return _isLoaded; }
    bool isPlaying() const { return _isPlaying; }
    const char* getName() const { return _animName; }
    const char* getFilename() const { return _activeFilename; }
    uint16_t getFps() const { return _fps; }
    uint32_t getTotalFrames() const { return _totalFrames; }
    uint32_t getCurrentFrame() const { return _currentFrame; }
    uint16_t getAnimWidth() const { return _animWidth; }
    uint16_t getAnimHeight() const { return _animHeight; }
    const char* getLoopModeStr() const {
        if (_loopMode == LOOP_ONCE) return "once";
        if (_loopMode == LOOP_PING_PONG) return "ping_pong";
        return "infinite";
    }

    uint32_t getCycleCount() const { return _cycleCount; }
    void resetCycleCount() { _cycleCount = 0; }
    void setLoopMode(LoopMode mode) { _loopMode = mode; }
    void setBrightnessMultiplier(float factor) {
        if (factor < 0.0f) factor = 0.0f;
        if (factor > 1.0f) factor = 1.0f;
        _brightnessMultiplier = factor;
        renderCurrentFrame();
    }
    float getBrightnessMultiplier() const { return _brightnessMultiplier; }

    void snapshotForTransition(TransitionBlendMode mode) {
        memcpy(_blendFromBuffer, _lastRenderedBuffer, sizeof(_blendFromBuffer));
        _blendBufferWidth = _animWidth;
        _blendBufferHeight = _animHeight;
        _blendMode = mode;
        _blendProgress = 0.0f;
    }

    void setBlendProgress(float progress) {
        if (progress < 0.0f) progress = 0.0f;
        if (progress > 1.0f) progress = 1.0f;
        _blendProgress = progress;
        renderCurrentFrame();
    }

    void endTransition() {
        _blendMode = BLEND_NONE;
        _blendProgress = 1.0f;
    }

    TransitionBlendMode getBlendMode() const { return _blendMode; }

private:
    JsonDocument _doc;
    bool _isLoaded;
    bool _isPlaying;
    char _animName[48];
    char _activeFilename[48];
    uint16_t _animWidth;
    uint16_t _animHeight;
    uint16_t _fps;
    uint32_t _frameDelayMs;
    uint32_t _totalFrames;
    uint32_t _currentFrame;
    int _pingPongDir;
    LoopMode _loopMode;
    uint32_t _lastFrameTime;
    uint32_t _cycleCount;
    float _brightnessMultiplier;
    TransitionBlendMode _blendMode;
    float _blendProgress;
    uint16_t _blendBufferWidth;
    uint16_t _blendBufferHeight;
    uint8_t _lastRenderedBuffer[MAX_MATRIX_LEDS];
    uint8_t _blendFromBuffer[MAX_MATRIX_LEDS];
};

#endif // ANIMATION_ENGINE_H
