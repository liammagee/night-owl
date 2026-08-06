# Tall text fixture

- Line 01 — the complete slide must remain visible
- Line 02 — the complete slide must remain visible
- Line 03 — the complete slide must remain visible
- Line 04 — the complete slide must remain visible
- Line 05 — the complete slide must remain visible
- Line 06 — the complete slide must remain visible
- Line 07 — the complete slide must remain visible
- Line 08 — the complete slide must remain visible
- Line 09 — the complete slide must remain visible
- Line 10 — the complete slide must remain visible
- Line 11 — the complete slide must remain visible
- Line 12 — the complete slide must remain visible
- Line 13 — the complete slide must remain visible
- Line 14 — the complete slide must remain visible
- Line 15 — the complete slide must remain visible
- Line 16 — the complete slide must remain visible
- Line 17 — the complete slide must remain visible
- Line 18 — the footer edge must remain visible

```notes
Resize the inline notes panel while this slide is visible. The whole slide must
continue to fit above the panel.
```

---

# Wide table fixture

| Identifier | Long descriptive label | Owner | Verification | Status |
| --- | --- | --- | --- | --- |
| viewport-tall-content | A deliberately wide value that exceeds the authored slide content area | Presentation | All four slide edges are visible | Ready |
| viewport-speaker-notes | The fit recalculates after the notes panel changes height | Presentation | No internal delivery scrollbar | Ready |

---

# Image fixture

<img src="../../build/icon.png" alt="NightOwl icon" width="1200" height="700">

---

# Code fixture

```javascript
const longConfigurationNameThatMustNotCreateAnInternalDeliveryScrollbar = {
  viewport: { width: 640, height: 360 },
  slide: { width: 864, height: 486 },
  expected: 'all slide edges remain inside the presentation stage'
};
```

```notes
The delivery view should fit this code rather than expose a nested scrollbar.
```
