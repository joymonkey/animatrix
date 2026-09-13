#ifndef MATRIX_DRIVER_H
#define MATRIX_DRIVER_H

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_IS31FL3731.h>
#include "config.h"

// ==============================================================================
// Custom 3x40 Matrix Mapping (Charlieplex Flex Board for Helmet Visor)
// ==============================================================================
#define LED_A(a, c) ( ((a)-1)*8 + ((c) < (a) ? ((c)-1) : ((c)-2)) )
#define LED_B(a, c) ( 72 + ((a)-1)*8 + ((c) < (a) ? ((c)-1) : ((c)-2)) )

const uint8_t matrix_lut_3x40[3][40] = {
  // Row 0 (Top row, Y=0):
  {
    /* Cols 1-3   */ LED_A(9, 8), LED_A(6, 8), LED_A(3, 8),
    /* Cols 4-6   */ LED_A(8, 9), LED_A(8, 6), LED_A(8, 3),
    /* Cols 7-9   */ LED_A(2, 8), LED_A(1, 8), LED_A(5, 8),
    /* Cols 10-12 */ LED_A(8, 2), LED_A(8, 1), LED_A(8, 5),
    /* Cols 13-15 */ LED_A(2, 9), LED_A(1, 9), LED_A(5, 9),
    /* Cols 16-18 */ LED_A(9, 2), LED_A(9, 1), LED_A(9, 5),
    /* Cols 19-20 */ LED_A(8, 7), LED_A(7, 8),
    /* Cols 21-23 */ LED_B(3, 4), LED_B(9, 4), LED_B(6, 4),
    /* Cols 24-26 */ LED_B(4, 3), LED_B(4, 9), LED_B(4, 6),
    /* Cols 27-29 */ LED_B(8, 4), LED_B(1, 4), LED_B(2, 4),
    /* Cols 30-32 */ LED_B(4, 8), LED_B(4, 1), LED_B(4, 2),
    /* Cols 33-35 */ LED_B(8, 3), LED_B(1, 3), LED_B(2, 3),
    /* Cols 36-38 */ LED_B(3, 8), LED_B(3, 1), LED_B(3, 2),
    /* Cols 39-40 */ LED_B(4, 5), LED_B(5, 4)
  },
  // Row 1 (Middle row, Y=1):
  {
    /* Cols 1-3   */ LED_A(9, 7), LED_A(6, 7), LED_A(3, 7),
    /* Cols 4-6   */ LED_A(7, 9), LED_A(7, 6), LED_A(7, 3),
    /* Cols 7-9   */ LED_A(2, 7), LED_A(1, 7), LED_A(5, 7),
    /* Cols 10-12 */ LED_A(7, 2), LED_A(7, 1), LED_A(7, 5),
    /* Cols 13-15 */ LED_A(2, 6), LED_A(1, 6), LED_A(5, 6),
    /* Cols 16-18 */ LED_A(6, 2), LED_A(6, 1), LED_A(6, 5),
    /* Cols 19-20 */ LED_A(8, 4), LED_A(4, 8),
    /* Cols 21-23 */ LED_B(3, 5), LED_B(9, 5), LED_B(6, 5),
    /* Cols 24-26 */ LED_B(5, 3), LED_B(5, 9), LED_B(5, 6),
    /* Cols 27-29 */ LED_B(8, 5), LED_B(1, 5), LED_B(2, 5),
    /* Cols 30-32 */ LED_B(5, 8), LED_B(5, 1), LED_B(5, 2),
    /* Cols 33-35 */ LED_B(8, 9), LED_B(1, 9), LED_B(2, 9),
    /* Cols 36-38 */ LED_B(9, 8), LED_B(9, 1), LED_B(9, 2),
    /* Cols 39-40 */ LED_B(4, 7), LED_B(7, 4)
  },
  // Row 2 (Bottom row, Y=2):
  {
    /* Cols 1-3   */ LED_A(9, 4), LED_A(6, 4), LED_A(3, 4),
    /* Cols 4-6   */ LED_A(4, 9), LED_A(4, 6), LED_A(4, 3),
    /* Cols 7-9   */ LED_A(2, 4), LED_A(1, 4), LED_A(5, 4),
    /* Cols 10-12 */ LED_A(4, 2), LED_A(4, 1), LED_A(4, 5),
    /* Cols 13-15 */ LED_A(2, 3), LED_A(1, 3), LED_A(5, 3),
    /* Cols 16-18 */ LED_A(3, 2), LED_A(3, 1), LED_A(3, 5),
    /* Cols 19-20 */ LED_A(7, 4), LED_A(4, 7),
    /* Cols 21-23 */ LED_B(3, 7), LED_B(9, 7), LED_B(6, 7),
    /* Cols 24-26 */ LED_B(7, 3), LED_B(7, 9), LED_B(7, 6),
    /* Cols 27-29 */ LED_B(8, 7), LED_B(1, 7), LED_B(2, 7),
    /* Cols 30-32 */ LED_B(7, 8), LED_B(7, 1), LED_B(7, 2),
    /* Cols 33-35 */ LED_B(8, 6), LED_B(1, 6), LED_B(2, 6),
    /* Cols 36-38 */ LED_B(6, 8), LED_B(6, 1), LED_B(6, 2),
    /* Cols 39-40 */ LED_B(5, 7), LED_B(7, 5)
  }
};

class CustomMatrix3x40 : public Adafruit_IS31FL3731 {
 public:
  CustomMatrix3x40() : Adafruit_IS31FL3731(40, 3) {}

  void drawPixel(int16_t x, int16_t y, uint16_t color) override {
    if ((x < 0) || (x >= 40) || (y < 0) || (y >= 3)) return;
    uint8_t led_id = matrix_lut_3x40[y][x];
    setLEDPWM(led_id, (uint8_t)min((uint16_t)255, color), _frame);
  }
};

// ==============================================================================
// Matrix Driver Instance & Hardware Init
// ==============================================================================

#if ACTIVE_MATRIX_TYPE == MATRIX_TYPE_ADAFRUIT_16X9
// Adafruit 16x9 Charlieplexed Matrix (Product #2947)
static Adafruit_IS31FL3731 hardwareMatrix(16, 9);
#elif ACTIVE_MATRIX_TYPE == MATRIX_TYPE_CUSTOM_3X40
// Custom 3x40 Flex Matrix
static CustomMatrix3x40 hardwareMatrix;
#else
#error "Undefined ACTIVE_MATRIX_TYPE in config.h"
#endif

// Global pointer used by animation engine and main logic
static Adafruit_IS31FL3731* displayMatrix = &hardwareMatrix;

inline bool initMatrixHardware(uint8_t& activeAddr) {
  // Take IS31FL3731 out of hardware shutdown
  pinMode(PIN_SDB, OUTPUT);
  digitalWrite(PIN_SDB, HIGH);
  delay(25);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, I2C_BUS_SPEED);

  // Probe primary address first
  activeAddr = IS31_ADDR_PRIMARY;
  if (displayMatrix->begin(activeAddr)) {
    displayMatrix->clear();
    return true;
  }

  // Probe secondary address
  activeAddr = IS31_ADDR_SECONDARY;
  if (displayMatrix->begin(activeAddr)) {
    displayMatrix->clear();
    return true;
  }

  // Auto-scan I2C bus if both preferred addresses fail
  for (uint8_t addr = 0x74; addr <= 0x77; addr++) {
    if (displayMatrix->begin(addr)) {
      activeAddr = addr;
      displayMatrix->clear();
      return true;
    }
  }

  return false;
}

#endif // MATRIX_DRIVER_H
