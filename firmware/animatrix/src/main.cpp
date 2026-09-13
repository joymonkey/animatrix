#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

#include "config.h"
#include "matrix_driver.h"
#include "messages.h"
#include "animation_engine.h"

// ==============================================================================
// Shared Global State & Queues
// ==============================================================================
AsyncWebServer server(80);
QueueHandle_t animationQueue = NULL;
SemaphoreHandle_t statusMutex = NULL;

struct SharedStatus {
    bool matrixFound;
    uint8_t i2cAddr;
    char matrixType[24];
    uint16_t matrixWidth;
    uint16_t matrixHeight;
    bool isLoaded;
    bool isPlaying;
    char animName[48];
    uint16_t fps;
    uint32_t totalFrames;
    uint32_t currentFrame;
    char loopMode[16];
} systemStatus;

bool wifiActive = true;
uint32_t lastWifiActivity = 0;

TaskHandle_t TaskCore0;
TaskHandle_t TaskCore1;

// ==============================================================================
// Core 1: Matrix Rendering & Animation Engine Task
// ==============================================================================
void runSwipeTest() {
    int w = displayMatrix->width();
    int h = displayMatrix->height();

    // Horizontal wipe
    for (int x = 0; x < w; x++) {
        displayMatrix->clear();
        for (int y = 0; y < h; y++) {
            displayMatrix->drawPixel(x, y, 255);
        }
        delay(20);
    }
    // Return to clear
    displayMatrix->clear();
}

void animationTask(void *pvParameters) {
    Serial.println("[Core 1] Animation Task Starting...");

    uint8_t detectedAddr = 0;
    bool matrixOk = initMatrixHardware(detectedAddr);

    if (!matrixOk) {
        Serial.println("[Core 1] ERROR: IS31FL3731 not detected on I2C bus!");
    } else {
        Serial.printf("[Core 1] IS31FL3731 initialized at 0x%02X (%dx%d matrix)\n",
                      detectedAddr, displayMatrix->width(), displayMatrix->height());
    }

    // Update shared initial status
    if (xSemaphoreTake(statusMutex, portMAX_DELAY) == pdTRUE) {
        systemStatus.matrixFound = matrixOk;
        systemStatus.i2cAddr = detectedAddr;
#if ACTIVE_MATRIX_TYPE == MATRIX_TYPE_ADAFRUIT_16X9
        strncpy(systemStatus.matrixType, "adafruit_16x9", sizeof(systemStatus.matrixType) - 1);
#else
        strncpy(systemStatus.matrixType, "custom_3x40", sizeof(systemStatus.matrixType) - 1);
#endif
        systemStatus.matrixWidth = displayMatrix->width();
        systemStatus.matrixHeight = displayMatrix->height();
        systemStatus.isLoaded = false;
        systemStatus.isPlaying = false;
        strncpy(systemStatus.animName, "none", sizeof(systemStatus.animName) - 1);
        systemStatus.fps = 0;
        systemStatus.totalFrames = 0;
        systemStatus.currentFrame = 0;
        strncpy(systemStatus.loopMode, "infinite", sizeof(systemStatus.loopMode) - 1);
        xSemaphoreGive(statusMutex);
    }

    AnimationEngine engine;

    // Load active animation or default animation if present in LittleFS
    if (LittleFS.exists(ACTIVE_ANIM_FILE)) {
        engine.loadAnimation(ACTIVE_ANIM_FILE);
    } else if (LittleFS.exists(DEFAULT_ANIM_FILE)) {
        engine.loadAnimation(DEFAULT_ANIM_FILE);
    } else {
        // Initial state if no file present: All LEDs on test pattern
        displayMatrix->fillScreen(255);
    }

    AnimationTrigger trigger;
    uint32_t lastStatusUpdate = 0;

    while (1) {
        // Check for incoming trigger without blocking animation timing
        if (xQueueReceive(animationQueue, &trigger, 0) == pdTRUE) {
            Serial.printf("[Core 1] Received Trigger: %d\n", trigger.type);

            switch (trigger.type) {
                case TRIGGER_ALL_ON:
                    engine.stop();
                    displayMatrix->fillScreen(255);
                    break;

                case TRIGGER_ALL_OFF:
                    engine.stop();
                    displayMatrix->clear();
                    break;

                case TRIGGER_TEST_SWIPE:
                    engine.pause();
                    runSwipeTest();
                    engine.resume();
                    break;

                case TRIGGER_PLAY_SCRIPT:
                    engine.loadAnimation(trigger.scriptFilename);
                    break;

                case TRIGGER_PAUSE:
                    engine.pause();
                    break;

                case TRIGGER_RESUME:
                    engine.resume();
                    break;

                default:
                    break;
            }
        }

        // Advance animation frame if due
        engine.update();

        // Periodically sync status with Core 0 (every 100ms)
        uint32_t now = millis();
        if (now - lastStatusUpdate > 100) {
            lastStatusUpdate = now;
            if (xSemaphoreTake(statusMutex, 0) == pdTRUE) {
                systemStatus.isLoaded = engine.isLoaded();
                systemStatus.isPlaying = engine.isPlaying();
                strncpy(systemStatus.animName, engine.getName(), sizeof(systemStatus.animName) - 1);
                systemStatus.fps = engine.getFps();
                systemStatus.totalFrames = engine.getTotalFrames();
                systemStatus.currentFrame = engine.getCurrentFrame();
                strncpy(systemStatus.loopMode, engine.getLoopModeStr(), sizeof(systemStatus.loopMode) - 1);
                xSemaphoreGive(statusMutex);
            }
        }

        // Small yield for FreeRTOS tick
        vTaskDelay(2 / portTICK_PERIOD_MS);
    }
}

// ==============================================================================
// Core 0: Network, LittleFS & Web Server Task
// ==============================================================================
void IRAM_ATTR bootButtonISR() {
    static uint32_t lastIsrTime = 0;
    uint32_t currentTime = millis();
    if (currentTime - lastIsrTime > 250) { // 250ms debounce
        AnimationTrigger t = {TRIGGER_TEST_SWIPE, ""};
        xQueueSendFromISR(animationQueue, &t, NULL);
        lastWifiActivity = currentTime;
        lastIsrTime = currentTime;
    }
}

void setupNetworkAndIO() {
    Serial.println("[Core 0] Network & IO Task Starting...");

    // Mount LittleFS
    if (!LittleFS.begin(true)) {
        Serial.println("[Core 0] ERROR: LittleFS Mount Failed");
    } else {
        Serial.println("[Core 0] LittleFS mounted successfully.");
    }

    // Configure BOOT button
    pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_BOOT_BTN), bootButtonISR, FALLING);

    // Setup Wi-Fi SoftAP
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(AP_SSID, AP_PASS);
    Serial.printf("[Core 0] Wi-Fi SoftAP '%s' ready. IP: %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());

    lastWifiActivity = millis();

    // Configure Global CORS Headers for Web Studio (EspUploader.js)
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type, X-Animation-Name, Authorization");

    // Preflight OPTIONS Handler
    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->method() == HTTP_OPTIONS) {
            request->send(200);
        } else {
            request->send(404, "text/plain", "Not Found");
        }
    });

    // --------------------------------------------------------------------------
    // REST API: GET /api/status
    // --------------------------------------------------------------------------
    server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        JsonDocument doc;

        if (xSemaphoreTake(statusMutex, portMAX_DELAY) == pdTRUE) {
            doc["status"] = "online";
            JsonObject mat = doc["matrix"].to<JsonObject>();
            mat["found"] = systemStatus.matrixFound;
            mat["i2c_addr"] = systemStatus.i2cAddr;
            mat["type"] = systemStatus.matrixType;
            mat["width"] = systemStatus.matrixWidth;
            mat["height"] = systemStatus.matrixHeight;

            JsonObject anim = doc["animation"].to<JsonObject>();
            anim["loaded"] = systemStatus.isLoaded;
            anim["playing"] = systemStatus.isPlaying;
            anim["name"] = systemStatus.animName;
            anim["fps"] = systemStatus.fps;
            anim["total_frames"] = systemStatus.totalFrames;
            anim["current_frame"] = systemStatus.currentFrame;
            anim["loop"] = systemStatus.loopMode;

            xSemaphoreGive(statusMutex);
        }

        JsonObject sys = doc["system"].to<JsonObject>();
        sys["free_heap"] = ESP.getFreeHeap();
        sys["free_psram"] = ESP.getFreePsram();
        sys["uptime_sec"] = millis() / 1000;

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // --------------------------------------------------------------------------
    // REST API: POST /api/upload (Direct JSON upload from Animatrix Web Studio)
    // --------------------------------------------------------------------------
    server.on(
        "/api/upload",
        HTTP_POST,
        [](AsyncWebServerRequest *request) {
            // Completed upload response
            request->send(200, "text/plain", "Animation loaded successfully on helmet!");
        },
        NULL,
        [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
            lastWifiActivity = millis();
            static File uploadFile;

            if (index == 0) {
                uploadFile = LittleFS.open(ACTIVE_ANIM_FILE, "w");
                if (!uploadFile) {
                    Serial.println("[Core 0] Error opening active animation file for write!");
                    return;
                }
            }

            if (uploadFile) {
                uploadFile.write(data, len);
            }

            if (index + len == total) {
                if (uploadFile) {
                    uploadFile.close();
                    Serial.printf("[Core 0] Direct JSON upload complete: %u bytes.\n", (uint32_t)total);

                    // Notify Core 1 to play the newly uploaded animation
                    AnimationTrigger t;
                    t.type = TRIGGER_PLAY_SCRIPT;
                    strncpy(t.scriptFilename, ACTIVE_ANIM_FILE, sizeof(t.scriptFilename) - 1);
                    xQueueSend(animationQueue, &t, 0);
                }
            }
        }
    );

    // --------------------------------------------------------------------------
    // REST API: POST /api/trigger (Actions: all_on, all_off, test, play, pause)
    // --------------------------------------------------------------------------
    server.on("/api/trigger", HTTP_POST, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        AnimationTrigger t = {TRIGGER_NONE, ""};

        if (request->hasParam("action", true)) {
            String act = request->getParam("action", true)->value();
            if (act == "all_on") t.type = TRIGGER_ALL_ON;
            else if (act == "all_off") t.type = TRIGGER_ALL_OFF;
            else if (act == "test") t.type = TRIGGER_TEST_SWIPE;
            else if (act == "pause") t.type = TRIGGER_PAUSE;
            else if (act == "resume") t.type = TRIGGER_RESUME;
            else if (act == "play") {
                t.type = TRIGGER_PLAY_SCRIPT;
                strncpy(t.scriptFilename, ACTIVE_ANIM_FILE, sizeof(t.scriptFilename) - 1);
            }
        }

        if (t.type != TRIGGER_NONE) {
            xQueueSend(animationQueue, &t, 0);
            request->send(200, "text/plain", "Action executed.");
        } else {
            request->send(400, "text/plain", "Invalid or missing action parameter.");
        }
    });

    // --------------------------------------------------------------------------
    // Multipart File Upload Handler (for Web UI file picker)
    // --------------------------------------------------------------------------
    server.on("/upload", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "text/plain", "Upload Complete");
    }, [](AsyncWebServerRequest *request, const String& filename, size_t index, uint8_t *data, size_t len, bool final) {
        lastWifiActivity = millis();
        static File formFile;
        if (!index) {
            formFile = LittleFS.open(ACTIVE_ANIM_FILE, "w");
        }
        if (formFile) {
            formFile.write(data, len);
        }
        if (final) {
            if (formFile) {
                formFile.close();
                AnimationTrigger t;
                t.type = TRIGGER_PLAY_SCRIPT;
                strncpy(t.scriptFilename, ACTIVE_ANIM_FILE, sizeof(t.scriptFilename) - 1);
                xQueueSend(animationQueue, &t, 0);
            }
        }
    });

    // --------------------------------------------------------------------------
    // Static Web Dashboard Files
    // --------------------------------------------------------------------------
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        if (LittleFS.exists("/index.html")) {
            request->send(LittleFS, "/index.html", "text/html");
        } else {
            request->send(200, "text/html", "<h2>Animatrix Matrix Online</h2><p>Upload index.html to LittleFS.</p>");
        }
    });

    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        request->send(LittleFS, "/style.css", "text/css");
    });

    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        request->send(LittleFS, "/script.js", "application/javascript");
    });

    server.begin();
    Serial.println("[Core 0] HTTP Web Server started.");
}

void networkTask(void *pvParameters) {
    setupNetworkAndIO();

    while (1) {
        if (wifiActive) {
            if (WiFi.softAPgetStationNum() > 0) {
                lastWifiActivity = millis();
            }

            if (millis() - lastWifiActivity > WIFI_TIMEOUT_MS) {
                Serial.println("[Core 0] Wi-Fi inactivity timeout. Sleeping AP...");
                WiFi.softAPdisconnect(true);
                WiFi.mode(WIFI_OFF);
                wifiActive = false;
            }
        }
        vTaskDelay(1000 / portTICK_PERIOD_MS);
    }
}

// ==============================================================================
// Arduino Setup & Loop
// ==============================================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n=============================================");
    Serial.println("  ANIMATRIX // ESP32-S3 LED MATRIX FIRMWARE  ");
    Serial.println("=============================================");

    // Initialize synchronization primitives
    animationQueue = xQueueCreate(10, sizeof(AnimationTrigger));
    statusMutex = xSemaphoreCreateMutex();

    // Spawn Core 1 Task (Matrix Rendering & Animation Engine)
    xTaskCreatePinnedToCore(
        animationTask,
        "AnimationTask",
        8192,
        NULL,
        2,              // Higher priority for real-time LED rendering
        &TaskCore1,
        1               // Core 1
    );

    // Spawn Core 0 Task (Network, LittleFS, Web Server)
    xTaskCreatePinnedToCore(
        networkTask,
        "NetworkTask",
        8192,
        NULL,
        1,              // Standard priority
        &TaskCore0,
        0               // Core 0
    );
}

void loop() {
    // Idle main loop task (FreeRTOS handles everything on Core 0 & Core 1)
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
