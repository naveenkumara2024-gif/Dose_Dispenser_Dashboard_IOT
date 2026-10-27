# Smart Pill Dispenser for Elderly Care

An ESP32-based dispenser that releases medication on schedule, confirms each dose with sensors, and reports everything over Wi-Fi to a caregiver dashboard.

**Repository layout:** `firmware/pill_dispenser/` (ESP32 code) · `embedded/` (server, database and dashboard)

---

## 1. Problem and goal

Elderly patients on several medications often miss doses, take them twice, or take them at the wrong time. Caregivers usually can't watch every dose in person.

The goal is a device that:

- dispenses the right compartment at the right time, and only when the patient is present;
- verifies the pill actually dropped and that the patient confirmed taking it;
- watches storage conditions (temperature, humidity), stock level and physical tampering;
- keeps a caregiver informed remotely through a web dashboard with alerts.

---

## 2. What the system does

| Capability | How |
|---|---|
| Scheduled dispensing | The caregiver sets dose times on the dashboard. The device polls the schedule every 15 s and keeps time with a battery-backed RTC. |
| Presence check | The PIR sensor must detect the patient before a dose is released. If nobody comes within 2 min, the dose is missed. |
| Reminder | Buzzer and LED for 5 s before dispensing. |
| Dispense | A servo turns a 5-compartment wheel to the scheduled compartment (C1–C5). |
| Drop verification | An IR sensor must see the pill fall within 6 s. If it doesn't, the dashboard raises a "Dispense failed" (jam) alert. |
| Intake confirmation | The patient touches a capacitive pad within 60 s. If they don't, the dose is missed. |
| Stock monitoring | A load cell weighs the whole wheel. The weight shows on the LCD and dashboard, with a low-stock alert below 20 % of full. |
| Storage monitoring | A DHT11 reports temperature and humidity every minute. Readings outside the safe range raise an alert. |
| Tamper detection | The tilt/vibration sensor detects knocks, heavy shaking and the device being knocked over. Tilt triggers a dashboard pop-up. |
| Remote dashboard | Today's doses, adherence %, dose history, stock trend, live sensor status, and an alert centre. |
| Offline operation | The device keeps dispensing on a local fallback schedule if Wi-Fi or the server is down. |

---

## 3. Architecture

```
 ESP32 device                                   Laptop / server
 ────────────                                   ───────────────
 Sensors:  PIR, IR, touch pad, DHT11,           Bun web server (one process)
           load cell, tilt/vibration, RTC         ├─ WebSocket hub  /ws
 Outputs:  servo wheel, buzzer, LED, LCD          ├─ REST API  /api/*  (same logic)
                                                  ├─ monitor job (every 60 s):
 Dose state machine + background tasks            │    missed doses, device offline
                                                  └─ serves the React dashboard
          │                                                 │
          │  Wi-Fi WebSocket (HTTP as fallback)              │ Drizzle ORM
          │  events, readings, live values ───────────────▶ PostgreSQL 17 (Docker)
          │  schedule pushed on change    ◀──────────────
                                                            ▲  push: "this changed"
                                       Caregiver's browser ─┘  (WebSocket, live)
```

- The device sends readings and events to the server; it never depends on the server to dispense.
- The server stores everything, derives alerts (missed dose, offline, low stock and so on) and serves the dashboard.
- The dashboard is a single-page React app served by the same server.
- **Real time:** one WebSocket from the device and one from each open dashboard. Any change is
  pushed the moment it happens (see 6.6). If the socket is down, the device falls back to plain
  HTTP and pages refresh every 30 s, so nothing is lost.

---

## 4. Hardware

### 4.1 Components and pin map

| Component | Model | ESP32 pin | Role |
|---|---|---|---|
| Microcontroller | ESP32 Dev Module | — | Runs the dose cycle, Wi-Fi, HTTP |
| Real-time clock | DS3231 (I2C) | SDA 21, SCL 22 | Keeps local time with battery backup; synced from NTP daily |
| Display | 16×2 LCD, I2C backpack (0x27) | SDA 21, SCL 22 | Time, temperature/humidity, next dose, weight, prompts |
| Temp / humidity | DHT11 | GPIO 33 | Storage conditions |
| Load cell + amplifier | Load cell + HX711 | DT 32, SCK 2 | Total pill weight on the wheel |
| Servo | Hobby servo (5 V from VIN) | GPIO 13 | Turns the wheel: home 0° is a blank slot covering the hole (closed); C1 30°, C2 60° … C5 150° |
| Presence | PIR (HC-SR501 / AM312) | GPIO 27 | Patient is at the device |
| Drop sensor | TCRT5000 IR (digital out) | GPIO 25 | Sees the pill fall (LOW = object) |
| Confirmation | TTP223 capacitive touch pad | GPIO 26 | Patient confirms the dose was taken |
| Tilt / vibration | Ball tilt switch (SW-520D type) or SW-420 module | GPIO 19 (pull-up) | Knock, shaking, knocked over |
| Buzzer | Active buzzer | GPIO 12 | Reminder and alarms |
| LED | Indicator LED | GPIO 14 | Reminder and "take your pill" |

The servo is powered from 5 V (VIN), not 3.3 V. Each part has its own test sketch in `firmware/` (`pir_test`, `servo_test`, `touch_test`, `tilt_test`, `buzzer_test`) for checking wiring in isolation.

### 4.2 Calibration

- **Load cell:** `CAL_FACTOR = 420` in the firmware. From the serial monitor, send `t` with the wheel empty (tare), then `f` with the wheel full (sets 100 %). Both values are stored in flash.
- **Tilt sensor:** the "upright" level is learned at boot. Send `c` to re-learn it.

---

## 5. Firmware (ESP32)

### 5.1 Dose cycle

```
IDLE ─▶ WAIT_PRESENCE ─▶ REMINDER ─▶ DISPENSING ─▶ WAIT_TAKEN ─▶ RESULT ─▶ IDLE
```

| State | What happens | Leaves when | Reported to server |
|---|---|---|---|
| IDLE | LCD row 1: temp, humidity, weight (`32C 52% 42.3g`); row 2: clock + next dose (`21:34 Next 22:43`), or LOW STOCK / TILTED! | Dose time reached (or `d` on serial) | — |
| WAIT_PRESENCE | LCD "Dose due Cn / Come near device" | PIR detects someone, or 120 s timeout → missed | `PRESENCE_DETECTED` / `NO_PRESENCE` |
| REMINDER | Buzzer + LED blink for 5 s | After 5 s | `REMINDER` |
| DISPENSING | Servo turns compartment *n* over the hole; IR watches for the pill. 1.5 s after the drop (so a second tablet falls too) the wheel returns to the closed home position | IR sees pill, or 6 s timeout | `DISPENSED` dose log, `SERVO_ROTATED`, `PILL_DROP` / `NO_DROP` |
| WAIT_TAKEN | LCD "Take your pill / Touch the pad" | Touch, or 60 s timeout → missed | `CONFIRMED_TAKEN` dose log |
| RESULT | Shows the outcome for 4 s | — | — |

If several compartments are due at the same minute, they run one after another, lowest compartment first.

### 5.2 Background tasks (while idle)

| Task | Interval | Endpoint |
|---|---|---|
| Tilt / vibration check | every 100 ms | `tilt` / `event` (on change only) |
| Load-cell sampling | continuous, ~10 samples/s, never blocks; weight shown on LCD every 1 s | stored `stock` reading every 60 s or on ≥ 0.5 g change (paused while tilted, shaken, or the servo is moving) |
| Low-stock warning | when stock drops below 20 % | `/api/stock-alert` (once until refilled above 30 %) |
| DHT11 read | every 60 s (stored) | `env` |
| Heartbeat (uptime, Wi-Fi RSSI, RTC time) | every 30 s | `hb` |
| Schedule | pushed by the server the moment it changes | `schedule` (HTTP poll every 15 s only while the socket is down) |
| Live telemetry (only while a dashboard is open) | weight 1 s, DHT11 2 s, PIR/IR/touch/tilt on change within 50 ms | `live` (shown, never stored) |

Every message goes over the WebSocket when it's connected and as the equivalent HTTP POST
otherwise. Nothing network-related runs while dispensing, so the IR sensor can't miss a falling pill.
| RTC sync from NTP | daily, and at boot | — |

### 5.3 Serial commands (115200 baud)

`t` tare · `f` set 100 % full · `d` dispense now · `1`–`5` test a compartment · `s` print status · `r` set RTC to compile time · `c` re-learn tilt upright level · `h` home the servo (closed) · `w` wheel test, sent twice, wheel empty (C1→C5 and home)

The servo returns to the closed home position at every boot and after every dose, so nothing drops between doses and every move starts from a known angle.

`DEMO_MODE = true` in the firmware triggers a dose every 90 s with shorter timeouts, which is useful for a live review.

---

## 6. Server and dashboard

### 6.1 Technology

| Layer | Choice |
|---|---|
| Runtime and HTTP server | Bun (`Bun.serve` with a routes table) |
| Frontend | React 19 single-page app, react-router, Tailwind CSS, Recharts |
| Database | PostgreSQL 17 in Docker, accessed through Drizzle ORM with versioned migrations |
| Validation | Zod on every API input and every WebSocket message |
| Real time | Bun's built-in WebSocket server; `WebSockets` library (Markus Sattler) on the ESP32 |
| Language | TypeScript (strict) everywhere |

### 6.2 Dashboard pages

| Page | Shows |
|---|---|
| **Home** | Today's doses and their status, 7-day adherence %, active alert banner, device online/offline |
| **Schedule** | Medications and their dose times: add, edit, archive; compartment (C1–C5), daily/weekly, optional end date |
| **History** | Every dispensed / confirmed / missed event, with filters (status, medication, date range) and pagination |
| **Stock** | Current pill weight and % full from the load cell, with a trend chart |
| **Sensors** | Live readings panel (weight, temperature, humidity, PIR, IR, touch, tilt, device state, streaming every second), status card for each of the 10 device parts, temperature and humidity charts with the safe band shaded, recent readings table, tilt history, and a device activity feed. |
| **Alerts** | Unified alert list, filterable, with resolve / reopen |

A pop-up appears on any page when the device is tilted or storage goes out of range. Every page
updates itself the moment data changes; a **Live** indicator in the header shows the connection state.

### 6.3 API

**Called by the ESP32**

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/schedule` | GET | Current dose times (time, frequency, compartment, end date) |
| `/api/dispense-log` | POST | Pill dispensed (IR confirmed) |
| `/api/confirm-taken` | POST | Patient touched the pad |
| `/api/stock-reading` | POST | Routine weight and % full |
| `/api/stock-alert` | POST | One-off low-stock warning |
| `/api/environment-log` | POST | Temperature and humidity |
| `/api/tilt-event` | POST | Tilted / upright |
| `/api/device-event` | POST | PIR, buzzer, servo, IR and vibration events |
| `/api/device-heartbeat` | POST | "I'm alive", with uptime, RSSI and RTC time |

**Used by the dashboard:** `/api/dashboard`, `/api/schedule` (POST/PATCH/DELETE), `/api/medications`, `/api/history`, `/api/stock`, `/api/sensors`, `/api/alerts`.

**WebSocket `/ws`:** `?role=device` for the ESP32 and `?role=dashboard` for browsers; protocol in 6.6.
Each device message type mirrors one REST endpoint above and runs the same code.

Every response is JSON, including errors: 400 with field errors for bad input, 404 for an unknown id, 409 for a rule violation, and a generic 500 with details logged only on the server. The device never has to parse an HTML error page.

### 6.4 Database

| Table | Holds |
|---|---|
| `Medication`, `Schedule` | Medicines and their dose times (compartment, frequency, end date, active/archived) |
| `DispenseLog` | Every DISPENSED / CONFIRMED_TAKEN / MISSED event |
| `StockLevel`, `StockLog` | Current weight and full history of weight readings |
| `EnvironmentLog` | Every temperature/humidity reading, flagged if out of range |
| `TiltLog`, `DeviceEvent` | Tilt changes and per-sensor activity |
| `Device` | Last heartbeat, RSSI, uptime, RTC drift |
| `Alert` | All alerts with resolved flag |
| `JobState` | Monitor job bookkeeping |

### 6.5 Alerts

| Alert | Raised when | Cleared when | Pop-up |
|---|---|---|---|
| Missed dose | No confirmation 30 min after a dose time (server monitor job) | Caregiver resolves | — |
| Low stock | Weight below 20 % of full | A reading at 20 % or above (refill), or the caregiver resolves it | — |
| Storage condition | Reading outside 15–35 °C or 30–70 % RH | Caregiver acknowledges | ✅ |
| Device tilted | Tilt sensor held off-level for more than 1 s | Device set upright | ✅ |
| Dispense failed | IR saw no pill within 6 s (jam or empty compartment) | Next successful drop from that compartment | — |
| Device offline | No heartbeat for 5 min | Next heartbeat | — |

Each condition produces only one open alert, so repeats don't flood the list. Alerts are pushed to
open dashboards the instant they're raised.

### 6.6 Real-time protocol (WebSocket)

Every message is JSON `{"t": "<type>", ...}`, validated on arrival.

| Direction | Types |
|---|---|
| Device → server | `hello`, `hb`, `env`, `stock`, `stock_low`, `tilt`, `event`, `dose` (with an event id), `live` (not stored) |
| Server → device | `schedule` (on connect and on every change), `watch` (stream live values on/off), `dose_ack`, `err` |
| Server → dashboard | `hello`, `invalidate` (which data changed, so the page refetches), `alert`, `live`, `device` (online/offline), `vibration` (knock / heavy shaking, for the toast) |

- **Same logic either way:** each device message calls the same service as its REST endpoint,
  so the database can't tell which transport delivered it.
- **No lost or double doses:** each dose event carries an id. The server acks it; without an ack
  in 3 s the device resends over HTTP with the same id, and a unique index stores it only once.
- **Online/offline:** the device counts as online while its socket is open, and offline 20 s
  after the socket drops, unless it keeps reporting over HTTP.
- **Measured latency** (localhost): event → dashboard told ≈ 6 ms (p50), → page refetched ≈ 10 ms
  (p50), ≈ 40 ms (p95); live values ≈ 0.1 ms per hop.

---

## 7. Design decisions

1. **The device works offline.** It dispenses from a local fallback schedule and its battery-backed RTC if Wi-Fi or the server is down. The server is for monitoring, not control.
2. **Two independent confirmations per dose.** The IR sensor proves the pill left the wheel; the touch pad proves the patient took it. A dose only counts as taken when both happen.
3. **No network calls while dispensing.** An HTTP request can block for up to 2.5 s. Posting while the servo turns could make the IR sensor miss the falling pill, so events are sent after the drop decision.
4. **Sensor noise is filtered on the device.** The vibration sensor ignores the device's own servo and buzzer. Weighing pauses while the device is tilted, shaken or turning, so a knock can't cause a false low-stock alert. The touch pad must be released before a touch counts, so a resting finger can't confirm a dose.
5. **The database enforces the rules.** "One open alert per condition" and "one active dose per compartment" are unique indexes in PostgreSQL rather than checks in application code. Two simultaneous requests therefore can't create duplicates.
6. **Missed doses use the patient's timezone.** "Due today" and "missed" are evaluated in the care location's timezone (`APP_TIMEZONE`, Asia/Kolkata), not the server's. The monitor back-fills up to 14 days after downtime, and a database lock ensures only one copy runs.
7. **History is never destroyed.** Deleting a dose that has history archives it instead, so adherence records stay intact. All readings are append-only logs, which is what makes the trend charts possible.
8. **Compartment order matches the wheel.** The wheel turns one way through C1 to C5, so dose times must increase from C1 to C5. The server rejects an out-of-order schedule with a clear message.
9. **Real time without fragility.** WebSockets make the dashboard instant, but REST is kept as the
   fallback, so a dropped socket never loses data. The server tells pages *what* changed and each
   page refetches its own data, so there's still one source of truth per page. Live sensor values
   stream only while someone is watching and are never stored, so the database doesn't fill with
   per-second rows.

---

## 8. How to run

**Server and dashboard** (from `embedded/`, needs Bun and Docker):

```bash
bun install
bun run db:up        # start PostgreSQL in Docker
bun run db:migrate   # create the tables
bun dev              # http://localhost:3000
```

**Firmware:**

1. Open `firmware/pill_dispenser/pill_dispenser.ino` in Arduino IDE 2 with board **ESP32 Dev Module**.
2. Install the libraries listed at the top of the file, plus **WebSockets** (Markus Sattler) from the Library Manager.
3. Set `WIFI_SSID`, `WIFI_PASS` and `SERVER_URL` (the laptop's local IP and port 3000). The laptop and the ESP32 must be on the same Wi-Fi network.
4. Upload, then open the Serial Monitor at 115200 baud. You should see `[net] POST /api/device-heartbeat -> 200` every 30 s.
5. Calibrate the load cell: `t` with the wheel empty, then `f` with it full.

---

## 9. Review demo script

Have the laptop show the **Sensors** page throughout. Each step lists what the reviewer should see.

| # | Do | Device | Dashboard |
|---|---|---|---|
| 1 | Open **Home** | LCD: temp, humidity, weight; clock and next dose | Today's doses, adherence %, device online |
| 2 | On **Schedule**, add a medicine in C1 a few minutes ahead (or use `d`) | LCD "Schedule updated" within 15 s | New dose time listed |
| 3 | Try to give C2 an earlier time than C1 | — | Refused with a clear compartment-order message |
| 4 | Let the dose fire, stand in front of the PIR | Buzzer + LED, servo turns, pill drops, LCD "Take your pill" | Activity feed: patient detected, reminder, wheel turned, pill dropped |
| 5 | Touch the pad | LCD "Thank you!" | History: DISPENSED, then CONFIRMED_TAKEN; touch pad card updates |
| 6 | Dispense from an empty compartment (`1`–`5`) | LCD "No pill dropped" | "Dispense failed" alert |
| 7 | Tip the device over, then stand it up | 5 beeps, LCD "Device tilted!" | Red pop-up within about a second; tilt card Attention; clears when upright |
| 8 | Knock or shake it hard | Short beep / 3 beeps, LCD "Shaking detected" | Red "Heavy shaking detected" toast on any page, live tile "Heavy shaking!", card shows Attention for a minute |
| 9 | Remove a few pills | LCD weight drops within ~5 s | Stock page and weight card update |
| 10 | Warm the DHT11 (hand or breath) | LCD temp rises | Red points on the chart, storage pop-up |
| 11 | Open **Alerts**, resolve one | — | Removed from the list; badge count drops |
| 12 | Open the **Sensors** page and wave at the PIR, cover the IR sensor, touch the pad, add a pill | — | Live readings change within about a second, with no reload |
| 13 | Open the dashboard in two browser tabs and edit a dose time in one | LCD "Schedule updated" at once | The other tab updates by itself |

Optional: power the ESP32 off for 5 minutes. A "Device offline" alert appears, and it clears on reconnect.

---

## 10. Testing and verification

| What | How | Result |
|---|---|---|
| API contract | Every endpoint exercised with valid, invalid and edge-case input (`curl`) against the real database | Correct status codes and JSON bodies, alerts raised and cleared as specified |
| Dashboard | Pages rendered in headless Chrome at desktop and 390 px phone width | No console errors, no horizontal overflow, charts and pop-ups render |
| Real time | Latency script (`scripts/ws-latency.ts`), protocol robustness checks, and browser checks of live updates and reconnects | Event → dashboard ≈ 6 ms, page refreshed ≈ 10 ms (p50); bad messages rejected without dropping the socket; duplicate dose ids stored once; indicator recovers after a server restart |
| Types | `tsc --noEmit` (strict) | Clean |
| Firmware | Compiled with `arduino-cli` for `esp32:esp32:esp32` | Builds; 84 % of flash used |
| Live device | ESP32 on Wi-Fi posting to the server | Environment readings every minute and heartbeat with RSSI arriving |
| Per-component | Test sketches in `firmware/*_test/` | Used to check wiring of each sensor and actuator in isolation |

Hardware checklist to tick during the review:

- [ ] PIR detects the patient
- [ ] Buzzer and LED reminder
- [ ] Servo reaches each compartment C1–C5
- [ ] IR sees the pill drop
- [ ] Touch pad confirms the dose
- [ ] Load cell weight on LCD and dashboard
- [ ] DHT11 readings on dashboard
- [ ] Tilt pop-up and auto-clear
- [ ] RTC in sync on the Sensors page

---

## 11. Limitations and future work

| Limitation | Future work |
|---|---|
| No authentication: anyone on the local network can call the API | Per-device API key for the ESP32, and caregiver login for the dashboard |
| Plain HTTP; Wi-Fi credentials compiled into the firmware | HTTPS or MQTT over TLS; Wi-Fi provisioning portal |
| Safe ranges (15–35 °C, 30–70 % RH, 20 % stock) are placeholders, and the device's own local limits (35 °C, 75 %) differ | Set per medication from the drug's storage label |
| One load cell measures total weight only, so it can't tell which compartment is empty | One cell per compartment, or count drops from the IR sensor |
| DHT11 accuracy is about ±2 °C / ±5 % RH | DHT22 or SHT31 |
| The device shows "Missed dose" immediately, but the dashboard records it only after a 30-min grace period | Post the device's missed event directly |
| Alerts reach the caregiver only while the dashboard is open | SMS / WhatsApp / push notifications to the caregiver's phone |
| Firmware uses 91 % of the default app partition | Switch to a larger partition scheme (e.g. "Huge APP") before adding features |
| No firmware updates over the air | ESP32 OTA updates |

---

## Appendix: development log

Built incrementally, one reviewed step at a time:

| # | Step |
|---|---|
| 01–05 | Database schema, the six device endpoints, JSON error handling, Home page; moved from SQLite to PostgreSQL |
| 06–07 | Schedule editing and dose history with filters |
| 08–11 | Missed-dose and offline monitor, alert de-duplication, Alerts page, timezone handling |
| 12–13 | Several dose times per medicine; Stock page and weight history |
| 15 | Five-compartment wheel rules (C1→C5 order, one dose per compartment, end dates) |
| 16 | Sensors page, environment charts, tilt endpoint and pop-up alerts |
| 18–19 | Single load cell view; live weight readings with % full |
| 20 | Every sensor and actuator reports to the dashboard; jam alert; RTC drift and Wi-Fi signal |
| 21 | Load-cell weight on the device LCD |
| 22 | Real-time WebSocket link for the device and dashboard, live sensor streaming, REST kept as fallback |
