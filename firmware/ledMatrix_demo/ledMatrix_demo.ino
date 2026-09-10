/*
 * =============================================================================
 * "Discovery Lite Light" / IS31FL3731 Multi-Matrix Test Sketch
 * =============================================================================
 * Target MCU: Waveshare ESP32-S3 Zero (or any ESP32 / Arduino board)
 *
 * Supported Hardware Profiles:
 *   1. PROFILE_3X40_DISCOVERY : Custom 3x40 Flex PCB (120 LEDs, 6mm pitch)
 *   2. PROFILE_16X9_ADAFRUIT  : Adafruit 2946 / 2947 16x9 SMD Matrix (144 LEDs)
 *   3. PROFILE_9X16_ADAFRUIT  : Adafruit 2946 / 2947 rotated vertically (9x16)
 *
 * ESP32-S3 Zero Direct Pinout:
 *   - 5V     -> 5V VBUS (Main supply for IS31FL3731 & LEDs)
 *   - GND    -> GND
 *   - 3V3    -> 3.3V (Supplies pull-ups for SDA, SCL, SDB, INTB)
 *   - GPIO1  -> SDA (I2C Data)
 *   - GPIO2  -> SCL (I2C Clock)
 *   - GPIO3  -> INTB (Active-Low Interrupt)
 *   - GPIO4  -> SDB (Active-Low Hardware Shutdown)
 *
 * Dependencies:
 *   - Adafruit GFX Library: https://github.com/adafruit/Adafruit-GFX-Library
 *   - Adafruit IS31FL3731 Library: https://github.com/adafruit/Adafruit_IS31FL3731
 * =============================================================================
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_IS31FL3731.h>

// -----------------------------------------------------------------------------
// HARDWARE PROFILE SELECTION
// -----------------------------------------------------------------------------
#define PROFILE_3X40_DISCOVERY 1 // Custom 3x40 "Discovery Lite Light" Flex Board
#define PROFILE_16X9_ADAFRUIT 2  // Adafruit 2946 / 2947 (16 Cols x 9 Rows Horizontal)
#define PROFILE_9X16_ADAFRUIT 3  // Adafruit 2946 / 2947 (9 Cols x 16 Rows Vertical)

// >>> SELECT YOUR ACTIVE BOARD PROFILE HERE <<<
#define ACTIVE_PROFILE PROFILE_16X9_ADAFRUIT

// Pin definitions on ESP32-S3 Zero (Custom PCB Mapping)
#define PIN_I2C_SDA 1
#define PIN_I2C_SCL 2
#define PIN_INTB 3
#define PIN_SDB 4

#define IS31_I2C_ADDR 0x75 // I2C address (0x74 default, 0x75 if 0x75 bridged)

// -----------------------------------------------------------------------------
// 1. Custom 3x40 Matrix Mapping for "Discovery Lite Light" Flex Board
// -----------------------------------------------------------------------------
#define LED_A(a, c) (((a) - 1) * 8 + ((c) < (a) ? ((c) - 1) : ((c) - 2)))
#define LED_B(a, c) (72 + ((a) - 1) * 8 + ((c) < (a) ? ((c) - 1) : ((c) - 2)))

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
        /* Cols 39-40 */ LED_B(4, 5), LED_B(5, 4)},
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
        /* Cols 39-40 */ LED_B(4, 7), LED_B(7, 4)},
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
        /* Cols 39-40 */ LED_B(5, 7), LED_B(7, 5)}};

class CustomMatrix3x40 : public Adafruit_IS31FL3731
{
public:
  CustomMatrix3x40() : Adafruit_IS31FL3731(40, 3) {}

  void drawPixel(int16_t x, int16_t y, uint16_t color) override
  {
    if ((x < 0) || (x >= 40) || (y < 0) || (y >= 3))
      return;
    uint8_t led_id = matrix_lut_3x40[y][x];
    setLEDPWM(led_id, (uint8_t)color, _frame);
  }
};

// -----------------------------------------------------------------------------
// Driver Instance & Display Dimensions
// -----------------------------------------------------------------------------
#if (ACTIVE_PROFILE == PROFILE_3X40_DISCOVERY)
CustomMatrix3x40 matrix;
const int MATRIX_W = 40;
const int MATRIX_H = 3;
#elif (ACTIVE_PROFILE == PROFILE_16X9_ADAFRUIT)
Adafruit_IS31FL3731 matrix;
const int MATRIX_W = 16;
const int MATRIX_H = 9;
#elif (ACTIVE_PROFILE == PROFILE_9X16_ADAFRUIT)
Adafruit_IS31FL3731 matrix;
const int MATRIX_W = 9;
const int MATRIX_H = 16;
#endif

// Helper to test an I2C pin pair
bool probeI2CPins(int sda, int scl, byte &foundAddr)
{
  Wire.end();
  delay(10);
  Wire.setPins(sda, scl);
  Wire.begin(sda, scl, 100000);
  for (byte addr = 1; addr < 127; ++addr)
  {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0)
    {
      foundAddr = addr;
      return true;
    }
  }
  return false;
}

// -----------------------------------------------------------------------------
// Setup
// -----------------------------------------------------------------------------
void setup()
{
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("  \"Discovery Lite Light\" IS31FL3731 Controller     ");
  Serial.println("==================================================");

#if (ACTIVE_PROFILE == PROFILE_3X40_DISCOVERY)
  Serial.println("Active Profile: 3x40 Flex Matrix (120 LEDs)");
#elif (ACTIVE_PROFILE == PROFILE_16X9_ADAFRUIT)
  Serial.println("Active Profile: 16x9 Adafruit SMD Matrix (144 LEDs)");
#elif (ACTIVE_PROFILE == PROFILE_9X16_ADAFRUIT)
  Serial.println("Active Profile: 9x16 Adafruit SMD Matrix (Rotated Vertical)");
#endif

  // Pull SDB pin HIGH (Active operation, wake up chip)
  pinMode(PIN_SDB, OUTPUT);
  digitalWrite(PIN_SDB, HIGH);
  delay(20); // Allow hardware to power on and settle

  int activeSda = PIN_I2C_SDA;
  int activeScl = PIN_I2C_SCL;
  byte foundAddr = 0;

  Serial.printf("\n[I2C] Testing primary configuration: SDA=GPIO%d, SCL=GPIO%d...\n", activeSda, activeScl);
  bool detected = probeI2CPins(activeSda, activeScl, foundAddr);

  if (!detected)
  {
    Serial.println("  -> [!] No response on primary pins. Scanning alternative pin combinations...");

    // Test common wiring mismatches (swapped wires, alternative pinouts, default pins)
    struct PinPair
    {
      int sda;
      int scl;
      const char *diagnosis;
    };
    PinPair candidatePairs[] = {
        {2, 1, "SDA and SCL jumper wires are swapped (SDA=GPIO2, SCL=GPIO1)!"},
        {4, 3, "Connected to previous pinout (SDA=GPIO4, SCL=GPIO3)!"},
        {3, 4, "Connected to swapped previous pinout (SDA=GPIO3, SCL=GPIO4)!"},
        {3, 2, "Connected to GPIO3 & GPIO2!"},
        {2, 3, "Connected to GPIO2 & GPIO3!"},
        {1, 0, "Connected to GPIO1 & GPIO0!"},
        {5, 4, "Connected to GPIO5 & GPIO4!"},
        {8, 9, "Connected to ESP32 default GPIO8 & GPIO9!"},
        {9, 8, "Connected to ESP32 default GPIO9 & GPIO8!"}};

    for (auto &pair : candidatePairs)
    {
      if (probeI2CPins(pair.sda, pair.scl, foundAddr))
      {
        Serial.printf("  -> [SUCCESS] Found device at 0x%02X on SDA=GPIO%d, SCL=GPIO%d!\n", foundAddr, pair.sda, pair.scl);
        Serial.printf("  -> DIAGNOSIS: %s\n", pair.diagnosis);
        activeSda = pair.sda;
        activeScl = pair.scl;
        detected = true;
        break;
      }
    }
  }
  else
  {
    Serial.printf("  -> [SUCCESS] Found device at address 0x%02X!\n", foundAddr);
  }

  if (!detected)
  {
    Serial.println("\n========================================================");
    Serial.println("[ERROR] No I2C device detected on any tested pin pairs!");
    Serial.println("--------------------------------------------------------");
    Serial.println("Checklist:");
    Serial.println("1. Power: Is VCC on breakout receiving 3.3V or 5V?");
    Serial.println("2. Ground: Is GND connected securely to ESP32-S3 GND?");
    Serial.println("3. SD Pin: Try disconnecting the SD/SDB wire (it floats HIGH).");
    Serial.println("4. Jumper Wires: Check for loose breadboard pins/connections.");
    Serial.println("========================================================");
    while (1)
    {
      delay(1000);
    }
  }

  // Lock in the detected pins
  Wire.setPins(activeSda, activeScl);
  Wire.begin(activeSda, activeScl, 100000);

  if (!matrix.begin(foundAddr))
  {
    Serial.println("\n[ERROR] matrix.begin() failed to initialize IS31FL3731 registers!");
    while (1)
    {
      delay(1000);
    }
  }

#if (ACTIVE_PROFILE == PROFILE_9X16_ADAFRUIT)
  matrix.setRotation(1); // 90 degree rotation for 9x16 vertical orientation
#endif

  Serial.println("\n[OK] IS31FL3731 initialized and running display patterns!");
  matrix.clear();
  matrix.setTextWrap(false);
  matrix.setTextColor(180); // Default font brightness
}

// -----------------------------------------------------------------------------
// Pattern 1: Sequential Pixel Scan (Tests every individual LED in raster order)
// -----------------------------------------------------------------------------
void testDotScan()
{
  Serial.println("Running: Sequential Pixel Scan...");
  for (int y = 0; y < MATRIX_H; y++)
  {
    for (int x = 0; x < MATRIX_W; x++)
    {
      matrix.clear();
      matrix.drawPixel(x, y, 150);
      delay(12);
    }
  }
}

// -----------------------------------------------------------------------------
// Pattern 2: Full Matrix Breathing / Pulse
// -----------------------------------------------------------------------------
void testBreathing()
{
  Serial.println("Running: Full Matrix Breathing...");
  for (int cycle = 0; cycle < 2; cycle++)
  {
    // Fade in
    for (int b = 0; b <= 180; b += 6)
    {
      matrix.fillScreen(b);
      delay(10);
    }
    // Fade out
    for (int b = 180; b >= 0; b -= 6)
    {
      matrix.fillScreen(b);
      delay(10);
    }
  }
}

// -----------------------------------------------------------------------------
// Pattern 3: Equalizer / Dynamic Sine Wave Bars
// -----------------------------------------------------------------------------
void testSineWave()
{
  Serial.println("Running: Dynamic Sine Wave Bars...");
  for (int t = 0; t < 120; t++)
  {
    matrix.clear();
    for (int x = 0; x < MATRIX_W; x++)
    {
      float s = (sin((x * 0.45) + (t * 0.15)) + 1.0) / 2.0; // 0.0 to 1.0
      int barHeight = (int)(s * MATRIX_H);
      if (barHeight < 1)
        barHeight = 1;

      for (int y = 0; y < barHeight; y++)
      {
        matrix.drawPixel(x, (MATRIX_H - 1) - y, 120);
      }
    }
    delay(30);
  }
}

// -----------------------------------------------------------------------------
// Pattern 4: Scrolling Marquee Banner ("DISCOVERY LITE LIGHT")
// -----------------------------------------------------------------------------
void testMarquee(const char *text)
{
  Serial.print("Running: Scrolling Marquee Banner (\"");
  Serial.print(text);
  Serial.println("\")...");

  int textLengthPixels = strlen(text) * 6; // ~6 pixels per character in default font
  for (int x = MATRIX_W; x >= -textLengthPixels; x--)
  {
    matrix.clear();
    matrix.setCursor(x, (MATRIX_H > 8) ? 1 : 0);
    matrix.print(text);
    delay(45);
  }
}

// -----------------------------------------------------------------------------
// Main Loop
// -----------------------------------------------------------------------------
void loop()
{
  // 1. Text Banner
  testMarquee("DISCOVERY LITE LIGHT");
  delay(300);

  // 2. Smooth Sine Equalizer
  testSineWave();
  delay(300);

  // 3. Pixel Sweep Verification
  testDotScan();
  delay(300);

  // 4. Pulse / Breathing
  testBreathing();
  delay(500);
}
