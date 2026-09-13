#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <esp_now.h>
#include <ArduinoJson.h>

#include "matrix_driver.h"
#include "messages.h"
#include "animation_engine.h"

// --- Configuration ---
#define AP_SSID "LED-Matrix"
#define AP_PASS "daftpunk"
#define WIFI_TIMEOUT_MS (2 * 60 * 1000) // 2 minutes inactivity timeout

// --- Globals ---
CustomMatrix40x3 matrix;
AsyncWebServer server(80);
QueueHandle_t animationQueue;

bool wifiActive = true;
uint32_t lastWifiActivity = 0;

// --- Task Handles ---
TaskHandle_t TaskCore0;
TaskHandle_t TaskCore1;

// --- Core 1: Animation Task ---
void animationTask(void *pvParameters) {
    Serial.println("[Core 1] Animation Task Started.");

    // Initialize I2C and Matrix
    pinMode(PIN_SDB, OUTPUT);
    digitalWrite(PIN_SDB, HIGH);
    delay(20);

    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);
    uint8_t activeAddr = IS31_I2C_ADDR;
    if (!matrix.begin(activeAddr)) {
        Serial.printf("[Core 1] Matrix not responding at 0x%02X, probing 0x74...\n", activeAddr);
        if (matrix.begin(0x74)) {
            activeAddr = 0x74;
            Serial.println("[Core 1] Matrix found at 0x74!");
        } else {
            Serial.println("[Core 1] Matrix init failed! Scanning I2C bus...");
            int found = 0;
            for (uint8_t addr = 1; addr < 127; addr++) {
                Wire.beginTransmission(addr);
                if (Wire.endTransmission() == 0) {
                    Serial.printf(" - Found I2C device at 0x%02X\n", addr);
                    found++;
                }
            }
            if (found == 0) {
                Serial.println(" - No I2C devices responded! Check SDA (GPIO1), SCL (GPIO2), VCC, GND, and SDB.");
            }
            while (1) vTaskDelay(100 / portTICK_PERIOD_MS);
        }
    }
    
    Serial.printf("[Core 1] Matrix init success at 0x%02X.\n", activeAddr);
    matrix.clear();
    
    // Initial State: All LEDs ON
    matrix.fillScreen(255); // Full brightness

    AnimationTrigger trigger;

    while (1) {
        if (xQueueReceive(animationQueue, &trigger, 0) == pdTRUE) {
            Serial.printf("[Core 1] Received Trigger: %d\n", trigger.type);
            
            if (trigger.type == TRIGGER_ALL_ON) {
                matrix.fillScreen(255);
            } 
            else if (trigger.type == TRIGGER_ALL_OFF) {
                matrix.clear();
            }
            else if (trigger.type == TRIGGER_TEST_ANIMATION) {
                // Basic swipe test
                for (int x = 0; x < 40; x++) {
                    matrix.clear();
                    matrix.drawLine(x, 0, x, 2, 255);
                    delay(30);
                }
                matrix.fillScreen(255); // Return to all on
            }
            else if (trigger.type == TRIGGER_JSON_SCRIPT) {
                // Execute JSON script from LittleFS
                runJsonAnimation(trigger.scriptFilename);
            }
        }

        // Add a small delay to yield to watchdog and other RTOS tasks
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

// --- Core 0: Network & IO Task ---
void IRAM_ATTR bootButtonISR() {
    static uint32_t lastIsrTime = 0;
    uint32_t currentTime = millis();
    if (currentTime - lastIsrTime > 200) { // 200ms debounce
        AnimationTrigger t = {TRIGGER_TEST_ANIMATION, ""};
        xQueueSendFromISR(animationQueue, &t, NULL);
        lastWifiActivity = currentTime; // Wake up Wi-Fi logic if we press button? Optional.
        lastIsrTime = currentTime;
    }
}

void setupNetworkAndIO() {
    Serial.println("[Core 0] Network & IO Task Started.");

    // Filesystem
    if (!LittleFS.begin(true)) {
        Serial.println("[Core 0] LittleFS Mount Failed");
    }

    // Button
    pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_BOOT_BTN), bootButtonISR, FALLING);

    // Wi-Fi SoftAP
    WiFi.mode(WIFI_AP_STA); // We need STA mode enabled temporarily to init ESP-NOW sometimes, but AP is main
    WiFi.softAP(AP_SSID, AP_PASS);
    Serial.print("[Core 0] AP IP address: ");
    Serial.println(WiFi.softAPIP());
    
    lastWifiActivity = millis();

    // Web Server setup
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
        lastWifiActivity = millis();
        request->send(LittleFS, "/index.html", "text/html");
    });
    
    server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
        lastWifiActivity = millis();
        request->send(LittleFS, "/style.css", "text/css");
    });

    server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
        lastWifiActivity = millis();
        request->send(LittleFS, "/script.js", "application/javascript");
    });

    server.on("/trigger", HTTP_POST, [](AsyncWebServerRequest *request){
        lastWifiActivity = millis();
        if (request->hasParam("type", true)) {
            String typeStr = request->getParam("type", true)->value();
            AnimationTrigger t;
            if (typeStr == "all_on") t.type = TRIGGER_ALL_ON;
            else if (typeStr == "all_off") t.type = TRIGGER_ALL_OFF;
            else if (typeStr == "test") t.type = TRIGGER_TEST_ANIMATION;
            else if (typeStr == "json_script") {
                t.type = TRIGGER_JSON_SCRIPT;
                strncpy(t.scriptFilename, "/uploaded.json", sizeof(t.scriptFilename) - 1);
            }
            else t.type = TRIGGER_NONE;
            
            xQueueSend(animationQueue, &t, 0);
            request->send(200, "text/plain", "Triggered");
        } else {
            request->send(400, "text/plain", "Missing type");
        }
    });

    // File upload handler
    server.on("/upload", HTTP_POST, [](AsyncWebServerRequest *request) {
        request->send(200, "text/plain", "Upload Complete");
    }, [](AsyncWebServerRequest *request, const String& filename, size_t index, uint8_t *data, size_t len, bool final) {
        lastWifiActivity = millis();
        static File uploadFile;
        if (!index) {
            uploadFile = LittleFS.open("/uploaded.json", "w");
            if (!uploadFile) {
                Serial.println("Failed to open file for writing");
            }
        }
        if (uploadFile) {
            uploadFile.write(data, len);
        }
        if (final) {
            if (uploadFile) {
                uploadFile.close();
                Serial.println("Upload complete: /uploaded.json");
            }
        }
    });

    server.begin();

    // ESP-NOW Stub
    if (esp_now_init() != ESP_OK) {
        Serial.println("[Core 0] Error initializing ESP-NOW");
    } else {
        Serial.println("[Core 0] ESP-NOW initialized.");
        // We will register recv callbacks here later
    }
}

void networkTask(void *pvParameters) {
    setupNetworkAndIO();

    while (1) {
        // Wi-Fi Inactivity Timeout Logic
        if (wifiActive) {
            // Check if any stations are connected
            if (WiFi.softAPgetStationNum() > 0) {
                lastWifiActivity = millis(); // Reset timeout while someone is connected
            }
            
            if (millis() - lastWifiActivity > WIFI_TIMEOUT_MS) {
                Serial.println("[Core 0] Wi-Fi inactivity timeout reached. Disabling Wi-Fi.");
                WiFi.softAPdisconnect(true);
                WiFi.mode(WIFI_OFF);
                wifiActive = false;
                // Optional: stop server? Or leave it, it's tied to wifi.
            }
        }
        
        vTaskDelay(1000 / portTICK_PERIOD_MS); // Check every second
    }
}

// --- Arduino Setup & Loop ---
void setup() {
    Serial.begin(115200);
    delay(1000); // Wait for serial to connect

    // Create Queue
    animationQueue = xQueueCreate(10, sizeof(AnimationTrigger));

    // Pin Tasks to Cores
    xTaskCreatePinnedToCore(
        networkTask,      // Task function
        "NetworkTask",    // Name
        8192,             // Stack size
        NULL,             // Parameters
        1,                // Priority
        &TaskCore0,       // Handle
        0                 // Core
    );

    xTaskCreatePinnedToCore(
        animationTask,    // Task function
        "AnimationTask",  // Name
        8192,             // Stack size
        NULL,             // Parameters
        1,                // Priority
        &TaskCore1,       // Handle
        1                 // Core
    );
}

void loop() {
    // FreeRTOS tasks handle everything; keep loop task idle
    vTaskDelay(1000 / portTICK_PERIOD_MS);
}
