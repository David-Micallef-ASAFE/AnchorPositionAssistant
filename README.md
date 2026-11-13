# Anchor Position Assistant

A web app that helps you place anchors on a floor plan during installation and calculate
the position of anchors that can't be placed by eye, using distances measured with a tape or laser.

**Phone / tablet app (hosted, works offline):** https://david-micallef-asafe.github.io/AnchorPositionAssistant/app/

## Phone and tablet: install from GitHub Pages (recommended)

1. Open **https://david-micallef-asafe.github.io/AnchorPositionAssistant/app/** on the phone.
2. Install it:
   - **Android (Chrome):** ⋮ menu → **Install app** (or **Add to Home screen**).
   - **iPhone / iPad (Safari):** **Share** → **Add to Home Screen**.
3. Open it from the home screen. Once it has opened, it works without any connection.

There is no cable, adb or developer mode involved. When the phone is online, the app picks up new versions by itself
and shows "The app was updated". Close and reopen the app to use the new version.

**Your data stays on the device.** The site only delivers the app; floor plans, images and anchors are stored on the phone
and are never uploaded. The app's code is public; the data is not.
- **The phone holds the only copy.** Uninstalling the app or clearing the browser's site data deletes it,
  so use **Backup** regularly. A backup file can be imported on another phone or on the laptop version.
- **Moving from the USB-installed app** (`http://localhost:3000/app/`): its data stays with that address.
  **Backup** each plan there, then **Import plan** in the GitHub-hosted app.

The site is published automatically by GitHub Actions (`.github/workflows/pages.yml`) on every push to `main`:
it runs the tests, then `npm run build:pages` builds the static site into `dist/`.

## Laptop: run locally

Requires Node.js 22 or later. There are no npm dependencies.

```
npm start
```

Open http://127.0.0.1:3000. Set `PORT=xxxx` to use a different port.

Data is stored in `data/db.json`, and the images in `data/images/`. Delete the `data` folder to start over.
Set `DATA_DIR=<folder>` to keep the data somewhere else.

## Two versions from the same code

| Address | Who uses it | Where the data lives |
|---|---|---|
| `http://localhost:3000/` | The laptop web app | On the laptop, in `data/` |
| `http://localhost:3000/app/` | The phone app served by the laptop (Android, over USB). It is installable and works offline | On the phone only |
| `https://david-micallef-asafe.github.io/AnchorPositionAssistant/app/` | The same phone app, hosted on GitHub Pages (Android and iPhone) | On the phone only |

Both versions have the same features. On a touch screen the app also shows a crosshair for precise placement,
nudge buttons and larger touch targets.

On a narrow screen (a phone, or a small tablet in portrait), the plan view shows **one screen at a time**: the **Map**
or the **Anchors** panel. A tab bar at the bottom switches between them, and the app also switches by itself where that makes sense:
- Adding an anchor, *Place with crosshair*, *Measure to point*, *Center on map* and *Show on map* open the map.
  *Set position* or *Cancel* returns to the anchors screen.
- *+ Add measurement* opens the map so you can tap the anchor you measured to. It then returns to the anchors screen
  with the distance box ready, and **Enter** goes back to the map for the next anchor. **Done** on the map banner stops picking.
- On the map, a bar shows the selected anchor. **Details ›** opens its panel.

Wider screens (laptops, larger tablets) show the map and the panel side by side.

## Alternative: install the phone app from the laptop over USB (Android)

Use this when you want the phone app without GitHub, for example to try local changes before pushing them.
Chrome only installs offline apps from a secure address, and `http://localhost` counts as one.
The phone reaches the laptop's `localhost` over a USB cable, so no certificates are needed.

**One-time setup on the laptop:** download Google's
[SDK Platform-Tools for Windows](https://developer.android.com/tools/releases/platform-tools), unzip it,
and add the folder to your `PATH` so that `adb` works in a terminal.

**One-time setup on the phone:** go to *Settings → About phone* and tap *Build number* 7 times to enable Developer options.
Then go to *Settings → Developer options* and turn on **USB debugging**.

**Install:**

1. Run `npm start` on the laptop.
2. Connect the phone by USB, accept the "Allow USB debugging?" prompt, and run:
   ```
   npm run phone
   ```
   This runs `adb reverse tcp:3000 tcp:3000`, so `localhost:3000` on the phone reaches the laptop.
3. On the phone, open **Chrome** and go to `http://localhost:3000/app/`.
4. In Chrome's ⋮ menu, choose **Install app** (or **Add to Home screen**).

You can now unplug the phone. The app opens from the home screen and works with no connection at all.

**Updating the app:** connect the phone again, run `npm start` and `npm run phone`, and open the app.
It downloads the new version in the background and shows "The app was updated". Close and reopen the app to use the new version.
Your data on the phone is kept.

**Important:**
- **The data belongs to the address.** Always install and update from exactly `http://localhost:3000/app/`.
  If you use a different port or address, Chrome treats it as a different app with separate, empty storage.
- **The phone holds the only copy** of its floor plans. Uninstalling the app or clearing Chrome's site data deletes them.
  Use **Backup** regularly (see below).

<details><summary>Alternative without a USB cable (Wi-Fi, less convenient)</summary>

1. Start the server so other devices can reach it: in PowerShell, run `$env:HOST='0.0.0.0'; npm start`, and allow it through the Windows firewall.
2. On the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and enter `http://<laptop-IP>:3000`.
   Then set the flag to *Enabled* and relaunch Chrome.
3. Open `http://<laptop-IP>:3000/app/` and install the app as above.

The data then belongs to `http://<laptop-IP>:3000`. If the laptop's IP address changes, a new install starts with empty storage.
This is why the USB method is recommended.
</details>

## Workflow

1. **Upload a floor plan**: give it a name, choose a PNG or JPEG, and enter its real width and height in meters.
   (0, 0) is the bottom-left corner. The form suggests a height that matches the image's aspect ratio.
   **Very large images are reduced automatically** to at most 8,192 px on the longest side (and 32 megapixels in total).
   Many CAD exports are 20,000+ px wide, which makes zooming and panning crawl on any device.
   Positions are in meters, so this does not affect accuracy: a 100 m wide plan still has about 1.3 cm per pixel.
   For plans uploaded before this was added, the plan view offers an **Optimize image** button.
2. **Add reference anchors**: enter the serial, choose *Reference*, then press *Add anchor*. A pin appears in the
   middle of the view. Drag it so its **tip** sits on the known spot, such as a column or a corner. You can also type X/Y,
   or select the pin and press the arrow keys to move it 1 cm at a time (hold Shift for 10 cm).
   **On a phone,** your finger would hide the pin tip, so a new anchor starts in **crosshair mode**.
   The pin stays under a fixed crosshair in the middle of the screen while you drag and pinch the map. Tap **Set position** when it is in place.
   *Place with crosshair* and the ← ↑ ↓ → nudge buttons (1 cm or 10 cm) are available for any selected anchor.
   **Tip:** press **📷 Scan** next to the serial field to read the anchor's QR code with the webcam.
   `AS-123456` (or `RL-123456` on older devices) is entered as `123456`. If the anchor is already on the plan, it is selected instead.
   The browser asks for camera permission the first time. Scanning works offline, because the decoder (jsQR, Apache-2.0) is
   included in `public/vendor/`. The camera only works when the app is opened at `localhost`/`127.0.0.1`
   (or over HTTPS), not at a plain `http://<LAN-IP>` address.
3. **Add approximate anchors**: add the anchor as *Approximate* and drag it roughly to where it is.
   Under *Measured distances*, press **+ Add measurement**, then **click the anchor you measured to**, either on the plan or in the anchor table.
   Type the distance in meters and press **Enter** to save it and pick the next anchor. Esc cancels picking.
   Hover over a measurement row to highlight its anchor on the plan.
   Dashed circles show each measured distance. Once distances to **at least 3 anchors** are entered,
   press **Calculate position** to preview the result.
   The result shows the per-measurement residuals, the geometry check and any warnings. Then press **Apply position**.
   The anchor stays *Approximate*.
   **Apply position is blocked when the geometry is poor** (see *Calculation rules* below). The result then
   explains why: add a measurement to an anchor on the empty side, or at a different angle, and calculate again.
   **Calculated mark:** in the anchor table, an approximate anchor shows a green **✓** once a calculated position has been applied,
   and a grey **?** while its pin was only placed by hand. Moving the pin by hand afterwards (dragging, nudging, typing X/Y or
   *Place with crosshair*) clears the ✓, so a ✓ always means the position on the plan is the calculated one.
   The mark is included in backups and in the CSV export (*Position calculated*: Yes/No).
4. **Check positions**: select any anchor and press **Show measurements** to see its distance to every other anchor on the plan.
   **Measure to point** gives the distance from the anchor to any spot you click, such as a wall.

5. **Export**: the **Export** checkbox column in the anchor table chooses which anchors are exported. It is ticked by default,
   and the header checkbox ticks or unticks all listed anchors. Next to *Anchors* there are two export buttons:
   - **Export CSV**: one row per anchor with the floor plan, serial, type, X/Y (m), position calculated (Yes/No, approximate anchors only),
     number of measurements, and the metrics logged with the last applied calculation: time, RMS and max residual,
     anchors used, reference anchors used, effective anchor count and HDOP.
   - **Export SQL**: one statement per anchor, ready to run against the device database:
     `update device set space_coordinates=(10,25.3) where serial_number='123456';`
     Coordinates are in meters, rounded to the millimeter, with no trailing zeros.
6. **Backup / move a plan**: **Backup** in the floor plan list saves the whole plan as one `.apaplan.json` file.
   The file contains the image, the anchors with their export ticks and the measurements. **Import plan** loads such a file as a new plan.
   This works in both versions, so you can move a plan from the phone to the laptop or the other way.

## Calculation rules

Three rules stop a poor position from being applied. Their values are in [`public/config.js`](public/config.js)
(`CALCULATION_RULES`). The current values are provisional defaults.

| Rule | Default | Why |
|---|---|---|
| `minAnchors`: distances to at least this many anchors before *Calculate position* is enabled | 3 | With two distances, a mistyped one still gives a position with no warning. With three or more, it shows up as a large residual. |
| `minEffectiveAnchors`: effective anchor count N of the calculated position, at least | 2.5 | How well the measured anchors surround the position (Edge TDOA Solver Requirements, 7.2). |
| `maxHdop`: horizontal dilution of precision of the calculated position, at most | 2.0 | How much the geometry amplifies a measuring error into a position error (7.3). |

Both geometry metrics use the directions (azimuths, 7.1) from the calculated position to the measured anchors.

- **Effective anchor count N** = 1 / Σ (gap / 360°)², where the gaps are the angles between neighbouring anchor
  directions, including the wrap-around. Three evenly spaced anchors give 3.0, anchors at 0°, 90° and 180° give 2.67,
  and anchors bunched on one side give less than 2.
- **HDOP** = √trace((HᵀH)⁻¹), where H holds the unit vectors to the anchors. Position error ≈ HDOP × measuring error.
  About 1 is excellent: three evenly spaced anchors give 1.15, four give 1.00. It grows quickly when the anchors line up.
  The app measures distances directly, so this is the range-based HDOP. For evenly spaced anchors it equals the TDoA values in the
  requirements document; for uneven layouts it is a little lower, because a tape measurement has no shared time offset.

Each applied calculation logs its RMS residual, max residual, number of anchors used (and how many of them are references),
effective anchor count and HDOP. They are shown under *Last calculated*, in an info box when you hover over a calculated
approximate anchor (✓) in the anchor table, and in the CSV export.

## Notes on the calculation

- 2D non-linear least squares (Levenberg–Marquardt) that uses every distance you enter.
  It starts from the pin's current position, so the pin's rough location picks the correct mirror solution when the geometry is ambiguous.
- With 3 or more anchors that are not in a line, the solution is unique. If all the measured anchors are in one line,
  there are two mirror solutions and the one nearest the pin is used (a warning is shown).
- Distances are treated as horizontal. If two anchors are mounted at very different heights, enter the horizontal distance:
  `sqrt(measured² − heightDiff²)`.
- Residuals: green < 5 cm, amber < 15 cm, red ≥ 15 cm. A large residual usually means a mistyped distance or a misplaced reference.

## Tests

```
npm test
```
