#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <DNSServer.h>

#include "config.h"
#include "matrix_driver.h"
#include "messages.h"
#include "animation_engine.h"
#include "script_engine.h"
#include "heartbeat.h"

// ==============================================================================
// Shared Global State & Queues
// ==============================================================================
const byte DNS_PORT = 53;
DNSServer dnsServer;
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

volatile bool wifiActive = true;
uint32_t lastWifiActivity = 0;
String currentApSsid = AP_SSID;
bool isDefaultSsid = true;

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
}

void animationTask(void *pvParameters) {
    Serial.println("[Core 1] Animation Task Starting...");

    // Read persisted matrix hardware choice from Preferences (NVS)
    Preferences prefs;
    prefs.begin("animatrix", true);
    String savedMatrix = prefs.getString("matrix_type", "adafruit_16x9");
    prefs.end();
    if (savedMatrix == "custom_3x40") savedMatrix = "custom_40x3";

    setMatrixType(savedMatrix.c_str());

    uint8_t detectedAddr = 0;
    bool matrixOk = initMatrixHardware(detectedAddr);

    if (!matrixOk) {
        Serial.println("[Core 1] ERROR: IS31FL3731 not detected on I2C bus!");
    } else {
        Serial.printf("[Core 1] IS31FL3731 initialized at 0x%02X (%dx%d matrix, type: %s)\n",
                      detectedAddr, displayMatrix->width(), displayMatrix->height(), savedMatrix.c_str());
    }

    // Update shared initial status
    if (xSemaphoreTake(statusMutex, portMAX_DELAY) == pdTRUE) {
        systemStatus.matrixFound = matrixOk;
        systemStatus.i2cAddr = detectedAddr;
        strncpy(systemStatus.matrixType, savedMatrix.c_str(), sizeof(systemStatus.matrixType) - 1);
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
    ScriptEngine scriptEngine;

    // Check for matrix-specific startup script or generic startup script
    String startupScript = "";
    String matrixScript = (savedMatrix == "custom_40x3" || savedMatrix == "custom_3x40") ? "/startup_40x3.json" : "/startup_16x9.json";

    if (LittleFS.exists(matrixScript)) {
        startupScript = matrixScript;
    } else if (LittleFS.exists("/startup.json")) {
        startupScript = "/startup.json";
    }

    if (startupScript.length() > 0) {
        scriptEngine.loadScript(startupScript.c_str(), engine);
    } else if (LittleFS.exists(ACTIVE_ANIM_FILE)) {
        engine.loadAnimation(ACTIVE_ANIM_FILE);
    } else {
        // Initial state if no startup script or active animation present: All LEDs on test pattern
        displayMatrix->fillScreen(255);
    }

    AnimationTrigger trigger;
    uint32_t lastStatusUpdate = 0;

    while (1) {
        // Check for incoming trigger without blocking animation timing
        if (xQueueReceive(animationQueue, &trigger, 0) == pdTRUE) {
            Serial.printf("[Core 1] Received Trigger: %d\n", trigger.type);

            // Any user trigger terminates active startup choreography script
            if (scriptEngine.isActive()) {
                scriptEngine.stop();
            }

            switch (trigger.type) {
                case TRIGGER_ALL_ON:
                    engine.stop();
                    displayMatrix->fillScreen(255);
                    break;

                case TRIGGER_ALL_OFF:
                    engine.stop();
                    displayMatrix->clear();
                    break;

                case TRIGGER_TEST_SWIPE: {
                    bool wasLoaded = engine.isLoaded();
                    bool wasPlaying = engine.isPlaying();
                    engine.pause();

                    // Set playing status so heartbeat LED includes yellow in its cycle
                    if (xSemaphoreTake(statusMutex, portMAX_DELAY) == pdTRUE) {
                        systemStatus.isPlaying = true;
                        xSemaphoreGive(statusMutex);
                    }

                    runSwipeTest();

                    if (wasLoaded && wasPlaying) {
                        engine.resume();
                    } else {
                        // Return to default state: all LEDs on at 255
                        displayMatrix->fillScreen(255);
                    }

                    if (xSemaphoreTake(statusMutex, portMAX_DELAY) == pdTRUE) {
                        systemStatus.isPlaying = engine.isPlaying();
                        xSemaphoreGive(statusMutex);
                    }
                    break;
                }

                case TRIGGER_PLAY_SCRIPT:
                    engine.loadAnimation(trigger.scriptFilename);
                    break;

                case TRIGGER_PAUSE:
                    engine.pause();
                    break;

                case TRIGGER_RESUME:
                    engine.resume();
                    break;

                case TRIGGER_SET_MATRIX: {
                    engine.stop();
                    setMatrixType(trigger.scriptFilename);

                    uint8_t detectedAddr = 0;
                    bool matrixOk = initMatrixHardware(detectedAddr);
                    displayMatrix->fillScreen(255); // Reset to default all-on state

                    // Persist to NVS Preferences across reboots
                    Preferences p;
                    p.begin("animatrix", false);
                    p.putString("matrix_type", trigger.scriptFilename);
                    p.end();

                    if (xSemaphoreTake(statusMutex, portMAX_DELAY) == pdTRUE) {
                        systemStatus.matrixFound = matrixOk;
                        systemStatus.i2cAddr = detectedAddr;
                        strncpy(systemStatus.matrixType, trigger.scriptFilename, sizeof(systemStatus.matrixType) - 1);
                        systemStatus.matrixWidth = displayMatrix->width();
                        systemStatus.matrixHeight = displayMatrix->height();
                        systemStatus.isLoaded = false;
                        systemStatus.isPlaying = false;
                        strncpy(systemStatus.animName, "none", sizeof(systemStatus.animName) - 1);
                        xSemaphoreGive(statusMutex);
                    }
                    Serial.printf("[Core 1] Switched matrix target to %s (%dx%d, I2C: 0x%02X)\n",
                                  trigger.scriptFilename, displayMatrix->width(), displayMatrix->height(), detectedAddr);
                    break;
                }

                default:
                    break;
            }
        }

        // Advance script choreography if active, otherwise advance standalone animation
        if (scriptEngine.isActive()) {
            scriptEngine.update(engine);
        } else {
            engine.update();
        }

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

// Helper to inspect animation JSON header (matrix width, height, and title)
// Returns false if file is a script or non-animation file
static bool extractAnimationMeta(File& file, const String& filename, uint16_t& width, uint16_t& height, String& title) {
    width = 0;
    height = 0;
    title = filename;

    // Filter out system scripts from the animation picker
    if (filename.startsWith("startup") || filename.startsWith("script")) {
        return false;
    }

    // 1. Fast filename pattern extraction (e.g. cylon_40x3.json -> 40, 3)
    int xPos = filename.lastIndexOf('x');
    if (xPos > 0 && xPos < filename.length() - 1) {
        int startW = xPos - 1;
        while (startW >= 0 && isDigit(filename[startW])) startW--;
        startW++;
        int endH = xPos + 1;
        while (endH < filename.length() && isDigit(filename[endH])) endH++;
        if (startW < xPos && endH > xPos + 1) {
            width = filename.substring(startW, xPos).toInt();
            height = filename.substring(xPos + 1, endH).toInt();
        }
    }

    // 2. Read first 512 bytes to extract JSON metadata (name, width, height)
    char buf[512];
    file.seek(0);
    size_t bytesRead = file.readBytes(buf, sizeof(buf) - 1);
    buf[bytesRead] = '\0';

    // If file is a script (e.g. animatrix-script-v1 or has "steps":), ignore from animation dropdown
    if (strstr(buf, "\"steps\"") != NULL || strstr(buf, "animatrix-script-v1") != NULL) {
        return false;
    }

    // Find "name": "..."
    const char* pName = strstr(buf, "\"name\"");
    if (pName) {
        const char* q1 = strchr(pName + 6, '\"');
        if (q1) {
            const char* q2 = strchr(q1 + 1, '\"');
            if (q2 && (q2 - q1 < 64)) {
                title = String(q1 + 1).substring(0, q2 - q1 - 1);
            }
        }
    }

    // Find "width": ...
    const char* pWidth = strstr(buf, "\"width\"");
    if (pWidth) {
        const char* col = strchr(pWidth + 7, ':');
        if (col) {
            while (*col == ':' || *col == ' ') col++;
            if (isDigit(*col)) {
                width = atoi(col);
            }
        }
    }

    // Find "height": ...
    const char* pHeight = strstr(buf, "\"height\"");
    if (pHeight) {
        const char* col = strchr(pHeight + 8, ':');
        if (col) {
            while (*col == ':' || *col == ' ') col++;
            if (isDigit(*col)) {
                height = atoi(col);
            }
        }
    }

    return true;
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

    // Read persisted AP SSID from Preferences
    Preferences prefs;
    prefs.begin("animatrix", true);
    currentApSsid = prefs.getString("ap_ssid", AP_SSID);
    String apPass = prefs.getString("ap_pass", AP_PASS);
    isDefaultSsid = (currentApSsid == AP_SSID);
    prefs.end();

    // Setup Wi-Fi SoftAP
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(currentApSsid.c_str(), apPass.c_str());
    Serial.printf("[Core 0] Wi-Fi SoftAP '%s' ready. IP: %s (Default SSID: %s)\n",
                  currentApSsid.c_str(), WiFi.softAPIP().toString().c_str(), isDefaultSsid ? "YES" : "NO");

    // Start Captive Portal DNS Server (redirects all domains to local IP)
    dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());
    Serial.println("[Core 0] Captive Portal DNS Server started.");

    lastWifiActivity = millis();

    // Configure Global CORS Headers for Web Studio (EspUploader.js)
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT");
    DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "Content-Type, X-Animation-Name, Authorization");

    // --------------------------------------------------------------------------
    // Captive Portal Detection Routes (iOS, Android, Windows)
    // --------------------------------------------------------------------------
    auto handleCaptiveRedirect = [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        request->redirect("http://" + WiFi.softAPIP().toString() + "/");
    };

    server.on("/hotspot-detect.html", HTTP_GET, handleCaptiveRedirect); // Apple
    server.on("/canonical.html", HTTP_GET, handleCaptiveRedirect);      // Apple
    server.on("/generate_204", HTTP_GET, handleCaptiveRedirect);        // Android
    server.on("/gen_204", HTTP_GET, handleCaptiveRedirect);             // Android

    // Windows NCSI Probes: Spoof success so Windows does NOT launch browser to msftconnecttest.com/redirect (which redirects to msn.com)
    server.on("/connecttest.txt", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        request->send(200, "text/plain", "Microsoft Connect Test");
    });
    server.on("/ncsi.txt", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        request->send(200, "text/plain", "Microsoft NCSI");
    });
    // In case any browser or Windows client still navigates to /redirect
    server.on("/redirect", HTTP_GET, handleCaptiveRedirect);

    // Preflight OPTIONS & Catch-all Captive Portal Redirect Handler
    server.onNotFound([](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        if (request->method() == HTTP_OPTIONS) {
            request->send(200);
            return;
        }

        // If client requested an external hostname (e.g. captive.apple.com), redirect to root
        String host = request->host();
        String localIp = WiFi.softAPIP().toString();
        if (!host.equalsIgnoreCase(localIp)) {
            request->redirect("http://" + localIp + "/");
            return;
        }

        request->send(404, "text/plain", "Not Found");
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

        JsonObject wifi = doc["wifi"].to<JsonObject>();
        wifi["ssid"] = currentApSsid;
        wifi["is_default"] = isDefaultSsid;

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
            static String uploadPath;

            if (index == 0) {
                uploadPath = ACTIVE_ANIM_FILE;
                if (request->hasHeader("X-Animation-Name")) {
                    String name = request->getHeader("X-Animation-Name")->value();
                    name.trim();
                    if (name.length() > 0) {
                        uploadPath = name.startsWith("/") ? name : "/" + name;
                    }
                }
                uploadFile = LittleFS.open(uploadPath, "w");
                if (!uploadFile) {
                    Serial.println("[Core 0] Error opening animation file for write!");
                    return;
                }
            }

            if (uploadFile) {
                uploadFile.write(data, len);
            }

            if (index + len == total) {
                if (uploadFile) {
                    uploadFile.close();
                    Serial.printf("[Core 0] Direct JSON upload complete: %s (%u bytes)\n", uploadPath.c_str(), (uint32_t)total);

                    // Notify Core 1 to play the newly uploaded animation
                    AnimationTrigger t;
                    t.type = TRIGGER_PLAY_SCRIPT;
                    strncpy(t.scriptFilename, uploadPath.c_str(), sizeof(t.scriptFilename) - 1);
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
                String targetFile = ACTIVE_ANIM_FILE;
                if (request->hasParam("file", true)) {
                    targetFile = request->getParam("file", true)->value();
                } else if (request->hasParam("file")) {
                    targetFile = request->getParam("file")->value();
                }
                if (!targetFile.startsWith("/")) targetFile = "/" + targetFile;
                strncpy(t.scriptFilename, targetFile.c_str(), sizeof(t.scriptFilename) - 1);
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
    // REST API: GET /api/animations (List all .json sequences stored in LittleFS)
    // --------------------------------------------------------------------------
    server.on("/api/animations", HTTP_GET, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        JsonDocument doc;
        JsonArray arr = doc["files"].to<JsonArray>();

        File root = LittleFS.open("/");
        if (root && root.isDirectory()) {
            File file = root.openNextFile();
            while (file) {
                String name = file.name();
                if (name.startsWith("/")) name = name.substring(1);
                if (name.endsWith(".json")) {
                    uint16_t w = 0, h = 0;
                    String title = name;
                    if (extractAnimationMeta(file, name, w, h, title)) {
                        JsonObject item = arr.add<JsonObject>();
                        item["name"] = name;
                        item["size"] = file.size();
                        item["width"] = w;
                        item["height"] = h;
                        item["title"] = title;
                    }
                }
                file = root.openNextFile();
            }
        }

        String response;
        serializeJson(doc, response);
        request->send(200, "application/json", response);
    });

    // --------------------------------------------------------------------------
    // REST API: POST /api/matrix (Actions: select hardware target e.g. adafruit_16x9, custom_40x3)
    // --------------------------------------------------------------------------
    server.on("/api/matrix", HTTP_POST, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        String matType = "";

        if (request->hasParam("type", true)) {
            matType = request->getParam("type", true)->value();
        } else if (request->hasParam("type")) {
            matType = request->getParam("type")->value();
        }

        if (matType == "custom_3x40") matType = "custom_40x3";

        if (matType == "adafruit_16x9" || matType == "custom_40x3") {
            AnimationTrigger t;
            t.type = TRIGGER_SET_MATRIX;
            strncpy(t.scriptFilename, matType.c_str(), sizeof(t.scriptFilename) - 1);
            xQueueSend(animationQueue, &t, 0);

            request->send(200, "application/json", "{\"status\":\"ok\",\"type\":\"" + matType + "\"}");
        } else {
            request->send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid matrix type. Use 'adafruit_16x9' or 'custom_40x3'.\"}");
        }
    });

    // --------------------------------------------------------------------------
    // REST API: POST /api/ssid (Update custom AP SSID name & reboot)
    // --------------------------------------------------------------------------
    server.on("/api/ssid", HTTP_POST, [](AsyncWebServerRequest *request) {
        lastWifiActivity = millis();
        String newSsid = "";

        if (request->hasParam("ssid", true)) newSsid = request->getParam("ssid", true)->value();
        else if (request->hasParam("ssid")) newSsid = request->getParam("ssid")->value();

        newSsid.trim();

        if (newSsid.length() < 1 || newSsid.length() > 32) {
            request->send(400, "application/json", "{\"status\":\"error\",\"message\":\"SSID must be 1 to 32 characters\"}");
            return;
        }

        Preferences p;
        p.begin("animatrix", false);
        p.putString("ap_ssid", newSsid);
        p.end();

        currentApSsid = newSsid;
        isDefaultSsid = (newSsid == AP_SSID);

        request->send(200, "application/json", "{\"status\":\"ok\",\"ssid\":\"" + newSsid + "\"}");

        // Delayed restart to broadcast new SSID cleanly
        xTaskCreate([](void *param) {
            vTaskDelay(1000 / portTICK_PERIOD_MS);
            ESP.restart();
        }, "restartTask", 2048, NULL, 1, NULL);
    });

    // --------------------------------------------------------------------------
    // Multipart File Upload Handler (for Web UI file picker)
    // --------------------------------------------------------------------------
    server.on("/upload", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "text/plain", "Upload Complete");
    }, [](AsyncWebServerRequest *request, const String& filename, size_t index, uint8_t *data, size_t len, bool final) {
        lastWifiActivity = millis();
        static File formFile;
        static String savedPath;
        if (!index) {
            savedPath = filename;
            if (!savedPath.startsWith("/")) savedPath = "/" + savedPath;
            formFile = LittleFS.open(savedPath, "w");
        }
        if (formFile) {
            formFile.write(data, len);
        }
        if (final) {
            if (formFile) {
                formFile.close();
                AnimationTrigger t;
                t.type = TRIGGER_PLAY_SCRIPT;
                strncpy(t.scriptFilename, savedPath.c_str(), sizeof(t.scriptFilename) - 1);
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

    uint32_t lastStationCheck = 0;

    while (1) {
        if (wifiActive) {
            // Process DNS queries for Captive Portal
            dnsServer.processNextRequest();

            uint32_t now = millis();
            if (now - lastStationCheck >= 1000) {
                lastStationCheck = now;

                if (WiFi.softAPgetStationNum() > 0) {
                    lastWifiActivity = now;
                }

                if (now - lastWifiActivity > WIFI_TIMEOUT_MS) {
                    Serial.println("[Core 0] Wi-Fi inactivity timeout. Sleeping AP...");
                    dnsServer.stop();
                    WiFi.softAPdisconnect(true);
                    WiFi.mode(WIFI_OFF);
                    wifiActive = false;
                }
            }
        }
        vTaskDelay(10 / portTICK_PERIOD_MS);
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

    // Initialize onboard NeoPixel heartbeat indicator (GPIO21)
    HeartbeatIndicator::init();

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
    static bool isPlaying = false;
    if (xSemaphoreTake(statusMutex, 0) == pdTRUE) {
        isPlaying = systemStatus.isPlaying;
        xSemaphoreGive(statusMutex);
    }

    HeartbeatIndicator::update(isPlaying, wifiActive);
    vTaskDelay(50 / portTICK_PERIOD_MS);
}
