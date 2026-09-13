#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==============================================================================
// 1. Hardware Matrix Selection
// ==============================================================================
#define MATRIX_TYPE_ADAFRUIT_16X9 1  // Adafruit 16x9 Charlieplexed Matrix (#2947)
#define MATRIX_TYPE_CUSTOM_3X40   2  // Custom 3x40 Daft Punk Visor Flex Matrix

// Set your active matrix geometry here:
#ifndef ACTIVE_MATRIX_TYPE
#define ACTIVE_MATRIX_TYPE MATRIX_TYPE_ADAFRUIT_16X9
#endif

// ==============================================================================
// 2. Pin Definitions (Waveshare ESP32-S3 Zero)
// ==============================================================================
#define PIN_I2C_SDA     1
#define PIN_I2C_SCL     2
#define PIN_INTB        3   // Driver interrupt pin
#define PIN_SDB         4   // Driver active-low shutdown pin
#define PIN_BOOT_BTN    0   // Onboard BOOT button

// ==============================================================================
// 3. I2C Bus & IS31FL3731 Settings
// ==============================================================================
#define I2C_BUS_SPEED       400000  // 400kHz Fast Mode
#define IS31_ADDR_PRIMARY   0x74    // Default for Adafruit breakout
#define IS31_ADDR_SECONDARY 0x75    // Default for Visor flex (AD pulled high)

// ==============================================================================
// 4. Wi-Fi SoftAP & Inactivity Settings
// ==============================================================================
#define AP_SSID             "Animatrix-Visor"
#define AP_PASS             "daftpunk"
#define WIFI_TIMEOUT_MS     (3 * 60 * 1000) // 3 minutes inactivity timeout

// ==============================================================================
// 5. Filesystem & Animation File Paths
// ==============================================================================
#define ACTIVE_ANIM_FILE    "/active_anim.json"
#define DEFAULT_ANIM_FILE   "/default_anim.json"

#endif // CONFIG_H
