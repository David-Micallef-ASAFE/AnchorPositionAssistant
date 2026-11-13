# Anchor Position Assistant

A local web app that helps you place anchors on a floor plan during installation and calculate
the position of anchors that can't be placed by eye, using distances measured with a tape or laser.

## Run

Requires Node.js 22 or later. There are no npm dependencies.

```
npm start
```

Open http://127.0.0.1:3000. Set `PORT=xxxx` to use a different port.

Data is stored in `data/db.json`, and the images in `data/images/`. Delete the `data` folder to start over.

## Workflow

1. **Upload a floor plan**: give it a name, choose a PNG or JPEG, and enter its real width and height in meters.
   (0, 0) is the bottom-left corner. The form suggests a height that matches the image's aspect ratio.
2. **Add reference anchors**: enter the serial, choose *Reference*, then press *Add anchor*. A pin appears in the
   middle of the view. Drag it so its **tip** sits on the known spot, such as a column or a corner. You can also type X/Y,
   or select the pin and press the arrow keys to move it 1 cm at a time (hold Shift for 10 cm).
   **Tip:** press **📷 Scan** next to the serial field to read the anchor's QR code with the webcam.
   `AS-123456` is entered as `123456`. If the anchor is already on the plan, it is selected instead.
   The browser asks for camera permission the first time. Scanning works offline, because the decoder (jsQR, Apache-2.0) is
   included in `public/vendor/`. The camera only works when the app is opened at `localhost`/`127.0.0.1`
   (or over HTTPS), not at a plain `http://<LAN-IP>` address.
3. **Add approximate anchors**: add the anchor as *Approximate* and drag it roughly to where it is.
   Under *Measured distances*, press **+ Add measurement**, then **click the anchor you measured to**, either on the plan or in the anchor table.
   Type the distance in meters and press **Enter** to save it and pick the next anchor. Esc cancels picking.
   Hover over a measurement row to highlight its anchor on the plan.
   Dashed circles show each measured distance. Press **Calculate position** to preview the result.
   The result shows the per-measurement residuals and any warnings. Then press **Apply position**.
   The anchor stays *Approximate*.
4. **Check positions**: select any anchor and press **Show measurements** to see its distance to every other anchor on the plan.
   **Measure to point** gives the distance from the anchor to any spot you click, such as a wall.

5. **Export**: the **Export** checkbox column in the anchor table chooses which anchors are exported. It is ticked by default,
   and the header checkbox ticks or unticks all listed anchors. Next to *Anchors* there are two export buttons:
   - **Export CSV**: one row per anchor with the floor plan, serial, type, X/Y (m), number of measurements, last calculation time and RMS residual.
   - **Export SQL**: one statement per anchor, ready to run against the device database:
     `update device set space_coordinates=(10,25.3) where serial_number='123456';`
     Coordinates are in meters, rounded to the millimeter, with no trailing zeros.

## Notes on the calculation

- 2D non-linear least squares (Levenberg–Marquardt) that uses every distance you enter.
  It starts from the pin's current position, so the pin's rough location picks the correct mirror solution when the geometry is ambiguous.
- With 3 or more references that are not in a line, the solution is unique. With 2 references, or with all references in a line,
  there are two mirror solutions and the one nearest the pin is used. With 1 reference, the pin only moves along the line to that reference.
- Distances are treated as horizontal. If two anchors are mounted at very different heights, enter the horizontal distance:
  `sqrt(measured² − heightDiff²)`.
- Residuals: green < 5 cm, amber < 15 cm, red ≥ 15 cm. A large residual usually means a mistyped distance or a misplaced reference.

## Tests

```
npm test
```
