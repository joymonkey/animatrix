#ifndef MATRIX_DRIVER_H
#define MATRIX_DRIVER_H

#include <Adafruit_GFX.h>
#include <Adafruit_IS31FL3731.h>

// ESP32-S3 Zero Pin Definitions
#define PIN_I2C_SDA     1
#define PIN_I2C_SCL     2
#define PIN_INTB        3
#define PIN_SDB         4
#define PIN_BOOT_BTN    0

#define IS31_I2C_ADDR   0x75  // Default was 0x74, 0x75 when AD is pulled high/bridged

// Custom 40x3 Matrix Mapping for flex board
#define LED_A(a, c) ( ((a)-1)*8 + ((c) < (a) ? ((c)-1) : ((c)-2)) )
#define LED_B(a, c) ( 72 + ((a)-1)*8 + ((c) < (a) ? ((c)-1) : ((c)-2)) )

const uint8_t matrix_lut_40x3[3][40] = {
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

class CustomMatrix40x3 : public Adafruit_IS31FL3731 {
 public:
  CustomMatrix40x3() : Adafruit_IS31FL3731(40, 3) {}

  void drawPixel(int16_t x, int16_t y, uint16_t color) override {
    if ((x < 0) || (x >= 40) || (y < 0) || (y >= 3)) return;
    uint8_t led_id = matrix_lut_40x3[y][x];
    setLEDPWM(led_id, (uint8_t)color, _frame);
  }
};

#endif // MATRIX_DRIVER_H
