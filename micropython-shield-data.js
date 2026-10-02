/* GPIO + actual PCB pad positions from plotterflow-motor-shield 7c90efd, r2.
 * Read-only source export: tools/read-shield-handoff.py. Coordinates are TOP mm.
 * No firmware or electrical verification is implied by this drawing data. */
const MicroPythonShieldData = {
  "generic": {
    "pico2w": {
      "reserved": [
        23,
        24,
        25,
        29
      ],
      "signals": {
        "X_STEP": {
          "gpio": 2,
          "pin": 4
        },
        "X_DIR": {
          "gpio": 4,
          "pin": 6
        },
        "Y_STEP": {
          "gpio": 3,
          "pin": 5
        },
        "Y_DIR": {
          "gpio": 5,
          "pin": 7
        },
        "ENABLE": {
          "gpio": 7,
          "pin": 10
        },
        "X_LIMIT": {
          "gpio": 6,
          "pin": 9
        },
        "Y_LIMIT": {
          "gpio": 8,
          "pin": 11
        },
        "Z_SERVO_PWM": {
          "gpio": 12,
          "pin": 16
        },
        "BUTTON_UP": {
          "gpio": 9,
          "pin": 12
        },
        "BUTTON_DOWN": {
          "gpio": 10,
          "pin": 14
        },
        "BUTTON_OK": {
          "gpio": 11,
          "pin": 15
        },
        "TMC_UART_TX": {
          "gpio": 0,
          "pin": 1
        },
        "TMC_UART_RX": {
          "gpio": 1,
          "pin": 2
        },
        "SERIAL_DATA_GPIO": {
          "pin": 17,
          "gpio": 13
        }
      }
    },
    "lcd147a": {
      "reserved": [
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24
      ],
      "signals": {
        "X_STEP": {
          "gpio": 2,
          "pin": 15
        },
        "X_DIR": {
          "gpio": 4,
          "pin": 17
        },
        "Y_STEP": {
          "gpio": 3,
          "pin": 16
        },
        "Y_DIR": {
          "gpio": 5,
          "pin": 18
        },
        "ENABLE": {
          "gpio": 7,
          "pin": 2
        },
        "X_LIMIT": {
          "gpio": 6,
          "pin": 1
        },
        "Y_LIMIT": {
          "gpio": 8,
          "pin": 3
        },
        "Z_SERVO_PWM": {
          "gpio": 9,
          "pin": 4
        },
        "BUTTON_UP": {
          "gpio": 25,
          "pin": 5
        },
        "BUTTON_DOWN": {
          "gpio": 26,
          "pin": 6
        },
        "BUTTON_OK": {
          "gpio": 27,
          "pin": 7
        },
        "TMC_UART_TX": {
          "gpio": 0,
          "pin": 13
        },
        "TMC_UART_RX": {
          "gpio": 1,
          "pin": 14
        },
        "SERIAL_DATA_GPIO": {
          "pin": 9,
          "gpio": 28
        }
      }
    },
    "touch2_no_camera": {
      "reserved": [
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        24,
        25,
        26,
        27,
        28,
        29
      ],
      "signals": {
        "X_STEP": {
          "gpio": 2,
          "pin": 7
        },
        "X_DIR": {
          "gpio": 4,
          "pin": 11
        },
        "Y_STEP": {
          "gpio": 3,
          "pin": 9
        },
        "Y_DIR": {
          "gpio": 5,
          "pin": 19
        },
        "ENABLE": {
          "gpio": 7,
          "pin": 28
        },
        "X_LIMIT": {
          "gpio": 6,
          "pin": 20
        },
        "Y_LIMIT": {
          "gpio": 8,
          "pin": 26
        },
        "Z_SERVO_PWM": {
          "gpio": 9,
          "pin": 27
        },
        "BUTTON_UP": {
          "gpio": 10,
          "pin": 12
        },
        "BUTTON_DOWN": {
          "gpio": 11,
          "pin": 21
        },
        "BUTTON_OK": {
          "gpio": 22,
          "pin": 25
        },
        "TMC_UART_TX": {
          "gpio": 0,
          "pin": 10
        },
        "TMC_UART_RX": {
          "gpio": 1,
          "pin": 8
        },
        "SERIAL_DATA_GPIO": {
          "pin": 24,
          "gpio": 21
        }
      }
    },
    "rp2350_pizero": {
      "reserved": [
        0,
        1,
        6,
        7,
        8,
        10,
        11,
        13,
        15,
        16,
        19,
        20,
        21,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47
      ],
      "signals": {
        "X_STEP": {
          "gpio": 17,
          "pin": 11
        },
        "X_DIR": {
          "gpio": 18,
          "pin": 12
        },
        "Y_STEP": {
          "gpio": 22,
          "pin": 15
        },
        "Y_DIR": {
          "gpio": 23,
          "pin": 16
        },
        "ENABLE": {
          "gpio": 14,
          "pin": 7
        },
        "X_LIMIT": {
          "gpio": 2,
          "pin": 3
        },
        "Y_LIMIT": {
          "gpio": 3,
          "pin": 5
        },
        "Z_SERVO_PWM": {
          "gpio": 12,
          "pin": 32
        },
        "BUTTON_UP": {
          "gpio": null,
          "pin": null
        },
        "BUTTON_DOWN": {
          "gpio": null,
          "pin": null
        },
        "BUTTON_OK": {
          "gpio": null,
          "pin": null
        },
        "TMC_UART_TX": {
          "gpio": 4,
          "pin": 8
        },
        "TMC_UART_RX": {
          "gpio": 5,
          "pin": 10
        },
        "SERIAL_DATA_GPIO": {
          "pin": 26,
          "gpio": 9
        }
      }
    }
  },
  "compact": {
    "pico2w": {
      "variant": "pico2w-compact",
      "mapping": {
        "reserved": [
          23,
          24,
          25,
          29
        ],
        "signals": {
          "X_STEP": {
            "gpio": 2,
            "pin": 4
          },
          "X_DIR": {
            "gpio": 4,
            "pin": 6
          },
          "Y_STEP": {
            "gpio": 3,
            "pin": 5
          },
          "Y_DIR": {
            "gpio": 5,
            "pin": 7
          },
          "ENABLE": {
            "gpio": 7,
            "pin": 10
          },
          "X_LIMIT": {
            "gpio": 6,
            "pin": 9
          },
          "Y_LIMIT": {
            "gpio": 8,
            "pin": 11
          },
          "Z_SERVO_PWM": {
            "gpio": 12,
            "pin": 16
          },
          "BUTTON_UP": {
            "gpio": 9,
            "pin": 12
          },
          "BUTTON_DOWN": {
            "gpio": 10,
            "pin": 14
          },
          "BUTTON_OK": {
            "gpio": 11,
            "pin": 15
          },
          "TMC_UART_TX": {
            "gpio": 0,
            "pin": 1
          },
          "TMC_UART_RX": {
            "gpio": 1,
            "pin": 2
          },
          "SERIAL_DATA_GPIO": {
            "pin": 17,
            "gpio": 13
          }
        }
      },
      "outline": {
        "width": 60,
        "height": 40,
        "corner_radius": 5,
        "notch": [
          45,
          9,
          60,
          23
        ],
        "pico_origin": [
          3,
          5.5
        ],
        "pico_mm": [
          51,
          21
        ],
        "mounting_holes": [],
        "copper_layers": 2,
        "thickness_mm": 1.6
      },
      "parts": {
        "J7": {
          "bottom": true,
          "pads": {
            "1": [
              50.5,
              3.2,
              "VMOT"
            ],
            "2": [
              53.04,
              3.2,
              "GND"
            ]
          }
        },
        "J13": {
          "bottom": true,
          "pads": {
            "1": [
              57.5,
              30,
              "SERIAL_VCC"
            ],
            "2": [
              57.5,
              27.46,
              "GND"
            ]
          }
        },
        "J12": {
          "bottom": true,
          "pads": {
            "1": [
              53.5,
              33,
              "GND"
            ],
            "2": [
              53.5,
              30.46,
              "SERIAL_VCC"
            ],
            "3": [
              53.5,
              27.92,
              "SERIAL_DATA"
            ]
          }
        },
        "J6": {
          "bottom": true,
          "pads": {
            "1": [
              20,
              32.6,
              "Y_A1"
            ],
            "2": [
              22.5,
              32.6,
              "Y_A2"
            ],
            "3": [
              25,
              32.6,
              "Y_B1"
            ],
            "4": [
              27.5,
              32.6,
              "Y_B2"
            ]
          }
        },
        "J11": {
          "bottom": true,
          "pads": {
            "1": [
              40.2,
              3.2,
              "Y_LIMIT"
            ],
            "2": [
              42.74,
              3.2,
              "GND"
            ],
            "3": [
              45.28,
              3.2,
              "+3V3"
            ]
          }
        },
        "J10": {
          "bottom": true,
          "pads": {
            "1": [
              2.3,
              3.2,
              "X_LIMIT"
            ],
            "2": [
              4.84,
              3.2,
              "GND"
            ],
            "3": [
              7.38,
              3.2,
              "+3V3"
            ]
          }
        },
        "U2": {
          "bottom": true,
          "pads": {
            "1": [
              25,
              9.5,
              "ENABLE"
            ],
            "2": [
              27.54,
              9.5,
              "Y_MS1"
            ],
            "3": [
              30.08,
              9.5,
              "GND"
            ],
            "4": [
              32.62,
              9.5,
              "Y_MS3_PDN"
            ],
            "5": [
              35.16,
              9.5,
              "Y_RESET_PDN"
            ],
            "6": [
              37.7,
              9.5,
              "Y_SLEEP_CLK"
            ],
            "7": [
              40.24,
              9.5,
              "Y_STEP"
            ],
            "8": [
              42.78,
              9.5,
              "Y_DIR"
            ],
            "9": [
              42.78,
              22.2,
              "GND"
            ],
            "10": [
              40.24,
              22.2,
              "+3V3"
            ],
            "11": [
              37.7,
              22.2,
              "Y_B2"
            ],
            "12": [
              35.16,
              22.2,
              "Y_B1"
            ],
            "13": [
              32.62,
              22.2,
              "Y_A1"
            ],
            "14": [
              30.08,
              22.2,
              "Y_A2"
            ],
            "15": [
              27.54,
              22.2,
              "GND"
            ],
            "16": [
              25,
              22.2,
              "VMOT"
            ]
          }
        },
        "J5": {
          "bottom": true,
          "pads": {
            "1": [
              6,
              32.6,
              "X_A1"
            ],
            "2": [
              8.5,
              32.6,
              "X_A2"
            ],
            "3": [
              11,
              32.6,
              "X_B1"
            ],
            "4": [
              13.5,
              32.6,
              "X_B2"
            ]
          }
        },
        "J8": {
          "bottom": true,
          "pads": {
            "1": [
              47,
              33.5,
              "+5V_SERVO"
            ],
            "2": [
              47,
              30.96,
              "GND"
            ]
          }
        },
        "J9": {
          "bottom": true,
          "pads": {
            "1": [
              34,
              32.6,
              "GND"
            ],
            "2": [
              36.54,
              32.6,
              "+5V_SERVO"
            ],
            "3": [
              39.08,
              32.6,
              "SERVO_PWM_OUT"
            ]
          }
        },
        "U1": {
          "bottom": true,
          "pads": {
            "1": [
              3.5,
              9.5,
              "ENABLE"
            ],
            "2": [
              6.04,
              9.5,
              "GND"
            ],
            "3": [
              8.58,
              9.5,
              "GND"
            ],
            "4": [
              11.12,
              9.5,
              "X_MS3_PDN"
            ],
            "5": [
              13.66,
              9.5,
              "X_RESET_PDN"
            ],
            "6": [
              16.2,
              9.5,
              "X_SLEEP_CLK"
            ],
            "7": [
              18.74,
              9.5,
              "X_STEP"
            ],
            "8": [
              21.28,
              9.5,
              "X_DIR"
            ],
            "9": [
              21.28,
              22.2,
              "GND"
            ],
            "10": [
              18.74,
              22.2,
              "+3V3"
            ],
            "11": [
              16.2,
              22.2,
              "X_B2"
            ],
            "12": [
              13.66,
              22.2,
              "X_B1"
            ],
            "13": [
              11.12,
              22.2,
              "X_A1"
            ],
            "14": [
              8.58,
              22.2,
              "X_A2"
            ],
            "15": [
              6.04,
              22.2,
              "GND"
            ],
            "16": [
              3.5,
              22.2,
              "VMOT"
            ]
          }
        }
      }
    },
    "lcd147a": {
      "variant": "lcd147a-compact",
      "mapping": {
        "reserved": [
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24
        ],
        "signals": {
          "X_STEP": {
            "gpio": 2,
            "pin": 15
          },
          "X_DIR": {
            "gpio": 4,
            "pin": 17
          },
          "Y_STEP": {
            "gpio": 3,
            "pin": 16
          },
          "Y_DIR": {
            "gpio": 5,
            "pin": 18
          },
          "ENABLE": {
            "gpio": 7,
            "pin": 2
          },
          "X_LIMIT": {
            "gpio": 6,
            "pin": 1
          },
          "Y_LIMIT": {
            "gpio": 8,
            "pin": 3
          },
          "Z_SERVO_PWM": {
            "gpio": 9,
            "pin": 4
          },
          "BUTTON_UP": {
            "gpio": 25,
            "pin": 5
          },
          "BUTTON_DOWN": {
            "gpio": 26,
            "pin": 6
          },
          "BUTTON_OK": {
            "gpio": 27,
            "pin": 7
          },
          "TMC_UART_TX": {
            "gpio": 0,
            "pin": 13
          },
          "TMC_UART_RX": {
            "gpio": 1,
            "pin": 14
          },
          "SERIAL_DATA_GPIO": {
            "pin": 9,
            "gpio": 28
          }
        }
      },
      "outline": {
        "width": 60,
        "height": 34,
        "corner_radius": 5,
        "mounting_holes": [
          [
            50,
            10
          ],
          [
            50,
            20
          ]
        ],
        "module_origin": [
          10,
          5.5
        ],
        "module_mm": [
          36.37,
          20.32
        ]
      },
      "parts": {
        "J7": {
          "bottom": true,
          "pads": {
            "1": [
              50.5,
              3.2,
              "VMOT"
            ],
            "2": [
              53.04,
              3.2,
              "GND"
            ]
          }
        },
        "J9": {
          "bottom": true,
          "pads": {
            "1": [
              34,
              30.5,
              "GND"
            ],
            "2": [
              36.54,
              30.5,
              "+5V_SERVO"
            ],
            "3": [
              39.08,
              30.5,
              "SERVO_PWM_OUT"
            ]
          }
        },
        "U1": {
          "bottom": true,
          "pads": {
            "1": [
              3.5,
              9.5,
              "ENABLE"
            ],
            "2": [
              6.04,
              9.5,
              "GND"
            ],
            "3": [
              8.58,
              9.5,
              "GND"
            ],
            "4": [
              11.12,
              9.5,
              "X_MS3_PDN"
            ],
            "5": [
              13.66,
              9.5,
              "X_RESET_PDN"
            ],
            "6": [
              16.2,
              9.5,
              "X_SLEEP_CLK"
            ],
            "7": [
              18.74,
              9.5,
              "X_STEP"
            ],
            "8": [
              21.28,
              9.5,
              "X_DIR"
            ],
            "9": [
              21.28,
              22.2,
              "GND"
            ],
            "10": [
              18.74,
              22.2,
              "+3V3"
            ],
            "11": [
              16.2,
              22.2,
              "X_B2"
            ],
            "12": [
              13.66,
              22.2,
              "X_B1"
            ],
            "13": [
              11.12,
              22.2,
              "X_A1"
            ],
            "14": [
              8.58,
              22.2,
              "X_A2"
            ],
            "15": [
              6.04,
              22.2,
              "GND"
            ],
            "16": [
              3.5,
              22.2,
              "VMOT"
            ]
          }
        },
        "J13": {
          "bottom": true,
          "pads": {
            "1": [
              57.9,
              18.5,
              "SERIAL_VCC"
            ],
            "2": [
              57.9,
              15.96,
              "GND"
            ]
          }
        },
        "J5": {
          "bottom": true,
          "pads": {
            "1": [
              6,
              30.5,
              "X_A1"
            ],
            "2": [
              8.5,
              30.5,
              "X_A2"
            ],
            "3": [
              11,
              30.5,
              "X_B1"
            ],
            "4": [
              13.5,
              30.5,
              "X_B2"
            ]
          }
        },
        "J10": {
          "bottom": true,
          "pads": {
            "1": [
              2.3,
              3.2,
              "X_LIMIT"
            ],
            "2": [
              4.84,
              3.2,
              "GND"
            ],
            "3": [
              7.38,
              3.2,
              "+3V3"
            ]
          }
        },
        "J12": {
          "bottom": true,
          "pads": {
            "1": [
              55,
              28.5,
              "GND"
            ],
            "2": [
              55,
              25.96,
              "SERIAL_VCC"
            ],
            "3": [
              55,
              23.42,
              "SERIAL_DATA"
            ]
          }
        },
        "J6": {
          "bottom": true,
          "pads": {
            "1": [
              20,
              30.5,
              "Y_A1"
            ],
            "2": [
              22.5,
              30.5,
              "Y_A2"
            ],
            "3": [
              25,
              30.5,
              "Y_B1"
            ],
            "4": [
              27.5,
              30.5,
              "Y_B2"
            ]
          }
        },
        "J8": {
          "bottom": true,
          "pads": {
            "1": [
              47,
              30.5,
              "+5V_SERVO"
            ],
            "2": [
              47,
              27.96,
              "GND"
            ]
          }
        },
        "J11": {
          "bottom": true,
          "pads": {
            "1": [
              40.2,
              3.2,
              "Y_LIMIT"
            ],
            "2": [
              42.74,
              3.2,
              "GND"
            ],
            "3": [
              45.28,
              3.2,
              "+3V3"
            ]
          }
        },
        "U2": {
          "bottom": true,
          "pads": {
            "1": [
              25,
              9.5,
              "ENABLE"
            ],
            "2": [
              27.54,
              9.5,
              "Y_MS1"
            ],
            "3": [
              30.08,
              9.5,
              "GND"
            ],
            "4": [
              32.62,
              9.5,
              "Y_MS3_PDN"
            ],
            "5": [
              35.16,
              9.5,
              "Y_RESET_PDN"
            ],
            "6": [
              37.7,
              9.5,
              "Y_SLEEP_CLK"
            ],
            "7": [
              40.24,
              9.5,
              "Y_STEP"
            ],
            "8": [
              42.78,
              9.5,
              "Y_DIR"
            ],
            "9": [
              42.78,
              22.2,
              "GND"
            ],
            "10": [
              40.24,
              22.2,
              "+3V3"
            ],
            "11": [
              37.7,
              22.2,
              "Y_B2"
            ],
            "12": [
              35.16,
              22.2,
              "Y_B1"
            ],
            "13": [
              32.62,
              22.2,
              "Y_A1"
            ],
            "14": [
              30.08,
              22.2,
              "Y_A2"
            ],
            "15": [
              27.54,
              22.2,
              "GND"
            ],
            "16": [
              25,
              22.2,
              "VMOT"
            ]
          }
        }
      }
    },
    "touch2": {
      "variant": "touch2-compact",
      "mapping": {
        "reserved": [
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          24,
          25,
          26,
          27,
          28,
          29
        ],
        "signals": {
          "X_STEP": {
            "gpio": 2,
            "pin": 7
          },
          "X_DIR": {
            "gpio": 4,
            "pin": 11
          },
          "Y_STEP": {
            "gpio": 3,
            "pin": 9
          },
          "Y_DIR": {
            "gpio": 5,
            "pin": 19
          },
          "ENABLE": {
            "gpio": 7,
            "pin": 28
          },
          "X_LIMIT": {
            "gpio": 6,
            "pin": 20
          },
          "Y_LIMIT": {
            "gpio": 8,
            "pin": 26
          },
          "Z_SERVO_PWM": {
            "gpio": 9,
            "pin": 27
          },
          "BUTTON_UP": {
            "gpio": 10,
            "pin": 12
          },
          "BUTTON_DOWN": {
            "gpio": 11,
            "pin": 21
          },
          "BUTTON_OK": {
            "gpio": 22,
            "pin": 25
          },
          "TMC_UART_TX": {
            "gpio": 0,
            "pin": 10
          },
          "TMC_UART_RX": {
            "gpio": 1,
            "pin": 8
          },
          "SERIAL_DATA_GPIO": {
            "pin": 24,
            "gpio": 21
          }
        },
        "disabled_signals": [
          "BUTTON_UP",
          "BUTTON_DOWN",
          "BUTTON_OK"
        ]
      },
      "outline": {
        "width": 66,
        "height": 40,
        "corner_radius": 5,
        "mounting_holes": [
          [
            10,
            30
          ],
          [
            20,
            30
          ]
        ],
        "module_origin": [
          0.5,
          1.5
        ],
        "module_mm": [
          59,
          37.1
        ]
      },
      "parts": {
        "J13": {
          "bottom": true,
          "pads": {
            "1": [
              62,
              16,
              "SERIAL_VCC"
            ],
            "2": [
              62,
              13.46,
              "GND"
            ]
          }
        },
        "J10": {
          "bottom": true,
          "pads": {
            "1": [
              3,
              8,
              "X_LIMIT"
            ],
            "2": [
              3,
              5.46,
              "GND"
            ],
            "3": [
              3,
              2.92,
              "+3V3"
            ]
          }
        },
        "J11": {
          "bottom": true,
          "pads": {
            "1": [
              3,
              34,
              "Y_LIMIT"
            ],
            "2": [
              3,
              31.46,
              "GND"
            ],
            "3": [
              3,
              28.92,
              "+3V3"
            ]
          }
        },
        "U1": {
          "bottom": true,
          "pads": {
            "1": [
              6.5,
              9.5,
              "ENABLE"
            ],
            "2": [
              9.04,
              9.5,
              "GND"
            ],
            "3": [
              11.58,
              9.5,
              "GND"
            ],
            "4": [
              14.12,
              9.5,
              "X_MS3_PDN"
            ],
            "5": [
              16.66,
              9.5,
              "X_RESET_PDN"
            ],
            "6": [
              19.2,
              9.5,
              "X_SLEEP_CLK"
            ],
            "7": [
              21.74,
              9.5,
              "X_STEP"
            ],
            "8": [
              24.28,
              9.5,
              "X_DIR"
            ],
            "9": [
              24.28,
              22.2,
              "GND"
            ],
            "10": [
              21.74,
              22.2,
              "+3V3"
            ],
            "11": [
              19.2,
              22.2,
              "X_B2"
            ],
            "12": [
              16.66,
              22.2,
              "X_B1"
            ],
            "13": [
              14.12,
              22.2,
              "X_A1"
            ],
            "14": [
              11.58,
              22.2,
              "X_A2"
            ],
            "15": [
              9.04,
              22.2,
              "GND"
            ],
            "16": [
              6.5,
              22.2,
              "VMOT"
            ]
          }
        },
        "J9": {
          "bottom": true,
          "pads": {
            "1": [
              62,
              35,
              "GND"
            ],
            "2": [
              62,
              32.46,
              "+5V_SERVO"
            ],
            "3": [
              62,
              29.92,
              "SERVO_PWM_OUT"
            ]
          }
        },
        "J5": {
          "bottom": true,
          "pads": {
            "1": [
              54,
              6,
              "X_A1"
            ],
            "2": [
              54,
              8.5,
              "X_A2"
            ],
            "3": [
              54,
              11,
              "X_B1"
            ],
            "4": [
              54,
              13.5,
              "X_B2"
            ]
          }
        },
        "J7": {
          "bottom": true,
          "pads": {
            "1": [
              51,
              37.5,
              "VMOT"
            ],
            "2": [
              53.54,
              37.5,
              "GND"
            ]
          }
        },
        "U2": {
          "bottom": true,
          "pads": {
            "1": [
              28,
              9.5,
              "ENABLE"
            ],
            "2": [
              30.54,
              9.5,
              "Y_MS1"
            ],
            "3": [
              33.08,
              9.5,
              "GND"
            ],
            "4": [
              35.62,
              9.5,
              "Y_MS3_PDN"
            ],
            "5": [
              38.16,
              9.5,
              "Y_RESET_PDN"
            ],
            "6": [
              40.7,
              9.5,
              "Y_SLEEP_CLK"
            ],
            "7": [
              43.24,
              9.5,
              "Y_STEP"
            ],
            "8": [
              45.78,
              9.5,
              "Y_DIR"
            ],
            "9": [
              45.78,
              22.2,
              "GND"
            ],
            "10": [
              43.24,
              22.2,
              "+3V3"
            ],
            "11": [
              40.7,
              22.2,
              "Y_B2"
            ],
            "12": [
              38.16,
              22.2,
              "Y_B1"
            ],
            "13": [
              35.62,
              22.2,
              "Y_A1"
            ],
            "14": [
              33.08,
              22.2,
              "Y_A2"
            ],
            "15": [
              30.54,
              22.2,
              "GND"
            ],
            "16": [
              28,
              22.2,
              "VMOT"
            ]
          }
        },
        "J8": {
          "bottom": true,
          "pads": {
            "1": [
              62,
              8,
              "+5V_SERVO"
            ],
            "2": [
              62,
              5.46,
              "GND"
            ]
          }
        },
        "J12": {
          "bottom": true,
          "pads": {
            "1": [
              62,
              25,
              "GND"
            ],
            "2": [
              62,
              22.46,
              "SERIAL_VCC"
            ],
            "3": [
              62,
              19.92,
              "SERIAL_DATA"
            ]
          }
        },
        "J6": {
          "bottom": true,
          "pads": {
            "1": [
              54,
              24,
              "Y_A1"
            ],
            "2": [
              54,
              26.5,
              "Y_A2"
            ],
            "3": [
              54,
              29,
              "Y_B1"
            ],
            "4": [
              54,
              31.5,
              "Y_B2"
            ]
          }
        }
      }
    }
  }
};
if(typeof module!=='undefined') module.exports=MicroPythonShieldData;
