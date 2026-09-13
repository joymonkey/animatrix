#ifndef SCRIPT_ENGINE_H
#define SCRIPT_ENGINE_H

#include <Arduino.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include "animation_engine.h"
#include "matrix_driver.h"

// ==============================================================================
// Script Action Enumerations & Structures
// ==============================================================================
enum ScriptActionType {
    ACTION_NONE = 0,
    ACTION_PLAY,
    ACTION_HOLD,
    ACTION_ALL_ON,
    ACTION_ALL_OFF,
    ACTION_TEST
};

enum ScriptStepPhase {
    PHASE_IDLE = 0,
    PHASE_TRANSITION_IN,
    PHASE_RUNNING,
    PHASE_HOLDING_LAST_FRAME,
    PHASE_TRANSITION_OUT,
    PHASE_COMPLETED
};

struct ScriptTransition {
    char type[16];        // "cut", "fade", "additive", "crossfade"
    uint32_t durationMs;  // duration in ms
    uint16_t leadFrames;  // number of frames remaining in previous animation to start overlap
};

struct ScriptStep {
    ScriptActionType action;
    char filename[48];
    uint16_t repeat;           // 0 = infinite, 1 = once, N = N times
    uint32_t holdLastFrameMs;  // hold on final frame before advancing
    uint32_t durationMs;       // duration for static hold/all_on/all_off
    uint8_t brightness;        // for all_on
    ScriptTransition transition;
};

// ==============================================================================
// ScriptEngine Class
// ==============================================================================
class ScriptEngine {
public:
    static const size_t MAX_STEPS = 16;

    ScriptEngine() :
        _isActive(false),
        _stepCount(0),
        _currentStepIdx(0),
        _phase(PHASE_IDLE),
        _phaseStartTime(0),
        _phaseEndTime(0),
        _isOverlapping(false),
        _overlapBlendMode(BLEND_ADDITIVE),
        _overlapTotalFrames(0),
        _overlapFramesElapsed(0),
        _overlapFirstRender(false),
        _secondaryPreloaded(false)
    {
        strncpy(_scriptName, "none", sizeof(_scriptName) - 1);
    }

    bool loadScript(const char* filepath, AnimationEngine& engine) {
        Serial.printf("[ScriptEngine] Loading script '%s'...\n", filepath);

        File file = LittleFS.open(filepath, "r");
        if (!file) {
            Serial.printf("[ScriptEngine] Error: Script '%s' not found.\n", filepath);
            _isActive = false;
            return false;
        }

        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, file);
        file.close();

        if (err) {
            Serial.printf("[ScriptEngine] JSON parse error in script: %s\n", err.c_str());
            _isActive = false;
            return false;
        }

        const char* schema = doc["$schema"] | "";
        if (strcmp(schema, "animatrix-script-v1") != 0) {
            Serial.printf("[ScriptEngine] Warning: Unexpected schema '%s'\n", schema);
        }

        const char* name = doc["name"] | "untitled_script";
        strncpy(_scriptName, name, sizeof(_scriptName) - 1);

        JsonArray stepsArray = doc["steps"].as<JsonArray>();
        if (stepsArray.isNull() || stepsArray.size() == 0) {
            Serial.println("[ScriptEngine] Error: No steps found in script.");
            _isActive = false;
            return false;
        }

        _stepCount = 0;
        for (JsonObject stepObj : stepsArray) {
            if (_stepCount >= MAX_STEPS) break;

            ScriptStep& step = _steps[_stepCount];
            step.action = ACTION_NONE;
            step.filename[0] = '\0';
            step.repeat = 1;
            step.holdLastFrameMs = 0;
            step.durationMs = 0;
            step.brightness = 255;
            strncpy(step.transition.type, "cut", sizeof(step.transition.type) - 1);
            step.transition.durationMs = 0;
            step.transition.leadFrames = 0;

            const char* actStr = stepObj["action"] | "play";
            if (strcmp(actStr, "play") == 0) {
                step.action = ACTION_PLAY;
                const char* fn = stepObj["file"] | "";
                strncpy(step.filename, fn, sizeof(step.filename) - 1);
                
                const char* loopStr = stepObj["loop"] | "";
                if (strcmp(loopStr, "infinite") == 0) {
                    step.repeat = 0;
                } else {
                    step.repeat = stepObj["repeat"] | 1;
                }

                step.holdLastFrameMs = stepObj["hold_last_frame_ms"] | 0;
            } else if (strcmp(actStr, "hold") == 0) {
                step.action = ACTION_HOLD;
                step.durationMs = stepObj["duration_ms"] | 1000;
            } else if (strcmp(actStr, "all_on") == 0) {
                step.action = ACTION_ALL_ON;
                step.durationMs = stepObj["duration_ms"] | 0;
                step.brightness = stepObj["brightness"] | 255;
            } else if (strcmp(actStr, "all_off") == 0) {
                step.action = ACTION_ALL_OFF;
                step.durationMs = stepObj["duration_ms"] | 0;
            } else if (strcmp(actStr, "test") == 0) {
                step.action = ACTION_TEST;
            }

            // Optional transition parameters
            if (stepObj["transition"].is<JsonObject>()) {
                JsonObject trans = stepObj["transition"];
                const char* tType = trans["type"] | "cut";
                strncpy(step.transition.type, tType, sizeof(step.transition.type) - 1);
                step.transition.durationMs = trans["duration_ms"] | 0;
                step.transition.leadFrames = trans["lead_frames"] | 0;
            }

            _stepCount++;
        }

        Serial.printf("[ScriptEngine] Script '%s' loaded with %u steps.\n", _scriptName, (unsigned int)_stepCount);
        _currentStepIdx = 0;
        _isOverlapping = false;
        _secondaryEngine.reset();
        _secondaryPreloaded = false;
        _isActive = true;

        startStep(_currentStepIdx, engine);
        return true;
    }

    void update(AnimationEngine& engine) {
        if (!_isActive || _stepCount == 0) return;

        uint32_t now = millis();
        ScriptStep& step = _steps[_currentStepIdx];

        // ==============================================================================
        // Active Dual-Engine Motion Overlap Blend
        // ==============================================================================
        if (_isOverlapping) {
            bool primaryStepped = engine.update(false); // step without direct rendering
            bool secondaryStepped = _secondaryEngine.update(false); // advance incoming animation at its native rate

            if (primaryStepped) {
                _overlapFramesElapsed++;
            }

            // Only calculate composite and render to matrix when at least one engine steps (or first frame)
            if (primaryStepped || secondaryStepped || _overlapFirstRender) {
                _overlapFirstRender = false;

                float t = (_overlapTotalFrames > 0) ? ((float)_overlapFramesElapsed / (float)_overlapTotalFrames) : 1.0f;
                if (t > 1.0f) t = 1.0f;

                // Fetch and composite pixels
                uint8_t pixA[MAX_MATRIX_LEDS] = {0};
                uint8_t pixB[MAX_MATRIX_LEDS] = {0};
                engine.getFramePixels(pixA, MAX_MATRIX_LEDS);
                _secondaryEngine.getFramePixels(pixB, MAX_MATRIX_LEDS);

                int dispW = displayMatrix->width();
                int dispH = displayMatrix->height();

                for (int y = 0; y < dispH; y++) {
                    for (int x = 0; x < dispW; x++) {
                        int idx = y * dispW + x;
                        uint8_t valA = (idx < MAX_MATRIX_LEDS) ? pixA[idx] : 0;
                        uint8_t valB = (idx < MAX_MATRIX_LEDS) ? pixB[idx] : 0;
                        uint8_t blended = 0;

                        if (_overlapBlendMode == BLEND_ADDITIVE) {
                            uint16_t sum = (uint16_t)valA + (uint16_t)(valB * t);
                            blended = (sum > 255) ? 255 : (uint8_t)sum;
                        } else { // BLEND_CROSSFADE
                            blended = (uint8_t)(valA * (1.0f - t) + valB * t);
                        }

                        displayMatrix->drawPixel(x, y, blended);
                    }
                }
            }

            // Check if outgoing animation has completed its repeat cycle
            if (step.repeat > 0 && engine.getCycleCount() >= step.repeat) {
                Serial.printf("[ScriptEngine] Live motion overlap complete. Transitioned fully to step %u ('%s')\n",
                              (unsigned int)(_currentStepIdx + 2), _steps[_currentStepIdx + 1].filename);

                _isOverlapping = false;
                _currentStepIdx++; // Advance to incoming step

                // Instant swap: incoming secondary engine becomes primary
                engine.swap(_secondaryEngine);
                _secondaryEngine.reset(); // DOES NOT touch displayMatrix!
                _secondaryPreloaded = false;

                engine.endTransition();
                engine.setBrightnessMultiplier(1.0f);

                _phase = PHASE_RUNNING;

                // Preload any next step if configured
                preloadNextStepIfNeeded();
            }
            return;
        }

        // ==============================================================================
        // Standard (Non-overlapping) Execution
        // ==============================================================================
        switch (_phase) {
            case PHASE_TRANSITION_IN: {
                if (step.transition.durationMs == 0) {
                    engine.endTransition();
                    engine.setBrightnessMultiplier(1.0f);
                    _phase = PHASE_RUNNING;
                } else {
                    uint32_t elapsed = now - _phaseStartTime;
                    if (elapsed >= step.transition.durationMs) {
                        engine.endTransition();
                        engine.setBrightnessMultiplier(1.0f);
                        _phase = PHASE_RUNNING;
                    } else {
                        float progress = (float)elapsed / (float)step.transition.durationMs;
                        if (engine.getBlendMode() != BLEND_NONE) {
                            engine.setBlendProgress(progress);
                        } else {
                            engine.setBrightnessMultiplier(progress);
                        }
                    }
                }
                engine.update(true);
                break;
            }

            case PHASE_RUNNING: {
                if (step.action == ACTION_PLAY) {
                    // Check if we should begin an overlapping transition with the next step
                    if (_currentStepIdx + 1 < _stepCount && _steps[_currentStepIdx + 1].action == ACTION_PLAY) {
                        ScriptStep& nextStep = _steps[_currentStepIdx + 1];
                        uint16_t leadFrames = nextStep.transition.leadFrames;
                        if (leadFrames == 0 && nextStep.transition.durationMs > 0 &&
                            (strcmp(nextStep.transition.type, "additive") == 0 || strcmp(nextStep.transition.type, "crossfade") == 0)) {
                            leadFrames = (nextStep.transition.durationMs * engine.getFps() + 500) / 1000;
                        }

                        if (leadFrames > 0) {
                            bool finalRepeat = (step.repeat > 0 && engine.getCycleCount() >= (step.repeat - 1));
                            if (finalRepeat) {
                                uint32_t rem = engine.getFramesRemainingInCycle();
                                if (rem <= leadFrames && rem > 0) {
                                    // Start simultaneous overlapping crossfade!
                                    _isOverlapping = true;
                                    _overlapTotalFrames = rem;
                                    _overlapFramesElapsed = 0;
                                    _overlapFirstRender = true;
                                    _overlapBlendMode = (strcmp(nextStep.transition.type, "crossfade") == 0) ? BLEND_CROSSFADE : BLEND_ADDITIVE;

                                    if (!_secondaryPreloaded) {
                                        String nextPath = nextStep.filename;
                                        if (!nextPath.startsWith("/")) nextPath = "/" + nextPath;
                                        _secondaryEngine.loadAnimation(nextPath.c_str(), false);
                                    }
                                    _secondaryEngine.setLoopMode((nextStep.repeat == 0) ? LOOP_INFINITE : LOOP_ONCE);
                                    _secondaryEngine.resume();

                                    Serial.printf("[ScriptEngine] Live motion overlap started! Outgoing frames left: %u, blending into '%s'\n",
                                                  (unsigned int)rem, nextStep.filename);
                                    return;
                                }
                            }
                        }
                    }

                    // Advance primary animation and render frame if due
                    engine.update(true);

                    // Standard repeat check
                    if (step.repeat > 0 && engine.getCycleCount() >= step.repeat) {
                        if (step.holdLastFrameMs > 0) {
                            engine.pause();
                            _phase = PHASE_HOLDING_LAST_FRAME;
                            _phaseStartTime = now;
                            _phaseEndTime = now + step.holdLastFrameMs;
                            Serial.printf("[ScriptEngine] Step %u finished %u repeats. Holding last frame for %u ms.\n",
                                          (unsigned int)_currentStepIdx, step.repeat, (unsigned int)step.holdLastFrameMs);
                        } else {
                            advanceStep(engine);
                        }
                    }
                } else if (step.action == ACTION_HOLD || step.action == ACTION_ALL_ON || step.action == ACTION_ALL_OFF) {
                    if (step.durationMs > 0 && now >= _phaseEndTime) {
                        advanceStep(engine);
                    }
                }
                break;
            }

            case PHASE_HOLDING_LAST_FRAME: {
                if (now >= _phaseEndTime) {
                    advanceStep(engine);
                }
                break;
            }

            case PHASE_TRANSITION_OUT: {
                advanceStep(engine);
                break;
            }

            default:
                break;
        }
    }

    void stop() {
        if (_isActive) {
            Serial.printf("[ScriptEngine] Script '%s' stopped.\n", _scriptName);
            _isActive = false;
            _isOverlapping = false;
            _secondaryEngine.reset();
            _secondaryPreloaded = false;
            _phase = PHASE_IDLE;
        }
    }

    bool isActive() const { return _isActive; }
    const char* getScriptName() const { return _scriptName; }
    size_t getCurrentStep() const { return _currentStepIdx; }
    size_t getStepCount() const { return _stepCount; }

private:
    void preloadNextStepIfNeeded() {
        _secondaryPreloaded = false;
        _secondaryEngine.reset();

        if (_currentStepIdx + 1 < _stepCount) {
            ScriptStep& nextStep = _steps[_currentStepIdx + 1];
            if (nextStep.action == ACTION_PLAY && nextStep.transition.leadFrames > 0) {
                String nextPath = nextStep.filename;
                if (!nextPath.startsWith("/")) nextPath = "/" + nextPath;
                if (LittleFS.exists(nextPath)) {
                    // Preload into secondary engine WITHOUT rendering first frame
                    if (_secondaryEngine.loadAnimation(nextPath.c_str(), false)) {
                        _secondaryEngine.pause();
                        _secondaryPreloaded = true;
                        Serial.printf("[ScriptEngine] Preloaded incoming animation '%s' for zero-latency overlap transition.\n", nextPath.c_str());
                    }
                }
            }
        }
    }

    void startStep(size_t idx, AnimationEngine& engine) {
        if (idx >= _stepCount) {
            _isActive = false;
            _phase = PHASE_COMPLETED;
            Serial.println("[ScriptEngine] All script steps finished.");
            return;
        }

        _currentStepIdx = idx;
        ScriptStep& step = _steps[idx];
        uint32_t now = millis();
        _phaseStartTime = now;

        Serial.printf("[ScriptEngine] Starting step %u/%u (Action: %d, File: '%s', Repeat: %u)\n",
                      (unsigned int)(idx + 1), (unsigned int)_stepCount, step.action, step.filename, step.repeat);

        switch (step.action) {
            case ACTION_PLAY: {
                String fullPath = step.filename;
                if (!fullPath.startsWith("/")) fullPath = "/" + fullPath;

                TransitionBlendMode bMode = BLEND_NONE;
                if (step.transition.durationMs > 0 && step.transition.leadFrames == 0) {
                    if (strcmp(step.transition.type, "additive") == 0 || strcmp(step.transition.type, "additive_blend") == 0) {
                        bMode = BLEND_ADDITIVE;
                    } else if (strcmp(step.transition.type, "crossfade") == 0) {
                        bMode = BLEND_CROSSFADE;
                    }
                }

                if (bMode != BLEND_NONE) {
                    engine.snapshotForTransition(bMode);
                    _phase = PHASE_TRANSITION_IN;
                    _phaseStartTime = now;
                    _phaseEndTime = now + step.transition.durationMs;
                } else if (step.transition.durationMs > 0 && strcmp(step.transition.type, "fade") == 0) {
                    engine.setBrightnessMultiplier(0.0f);
                    _phase = PHASE_TRANSITION_IN;
                    _phaseStartTime = now;
                    _phaseEndTime = now + step.transition.durationMs;
                } else {
                    engine.endTransition();
                    engine.setBrightnessMultiplier(1.0f);
                    _phase = PHASE_RUNNING;
                }

                bool loaded = engine.loadAnimation(fullPath.c_str());
                if (!loaded) {
                    Serial.printf("[ScriptEngine] Warning: Failed to load '%s'. Skipping step.\n", fullPath.c_str());
                    advanceStep(engine);
                    return;
                }

                // Preload incoming animation for zero-latency transition
                preloadNextStepIfNeeded();
                break;
            }

            case ACTION_HOLD: {
                engine.pause();
                _phase = PHASE_RUNNING;
                _phaseEndTime = now + step.durationMs;
                break;
            }

            case ACTION_ALL_ON: {
                engine.stop();
                displayMatrix->fillScreen(step.brightness);
                _phase = PHASE_RUNNING;
                if (step.durationMs > 0) {
                    _phaseEndTime = now + step.durationMs;
                } else {
                    _phaseEndTime = 0; // Infinite static hold
                }
                break;
            }

            case ACTION_ALL_OFF: {
                engine.stop();
                displayMatrix->clear();
                _phase = PHASE_RUNNING;
                if (step.durationMs > 0) {
                    _phaseEndTime = now + step.durationMs;
                } else {
                    _phaseEndTime = 0;
                }
                break;
            }

            case ACTION_TEST: {
                int w = displayMatrix->width();
                int h = displayMatrix->height();
                for (int x = 0; x < w; x++) {
                    displayMatrix->clear();
                    for (int y = 0; y < h; y++) displayMatrix->drawPixel(x, y, 255);
                    delay(20);
                }
                advanceStep(engine);
                break;
            }

            default:
                advanceStep(engine);
                break;
        }
    }

    void advanceStep(AnimationEngine& engine) {
        if (_currentStepIdx + 1 < _stepCount) {
            startStep(_currentStepIdx + 1, engine);
        } else {
            _isActive = false;
            _phase = PHASE_COMPLETED;
            Serial.println("[ScriptEngine] Script sequence completed.");
        }
    }

    bool _isActive;
    char _scriptName[48];
    ScriptStep _steps[MAX_STEPS];
    size_t _stepCount;
    size_t _currentStepIdx;
    ScriptStepPhase _phase;
    uint32_t _phaseStartTime;
    uint32_t _phaseEndTime;

    // Dual-engine live motion overlap variables
    AnimationEngine _secondaryEngine;
    bool _isOverlapping;
    TransitionBlendMode _overlapBlendMode;
    uint32_t _overlapTotalFrames;
    uint32_t _overlapFramesElapsed;
    bool _overlapFirstRender;
    bool _secondaryPreloaded;
};

#endif // SCRIPT_ENGINE_H
