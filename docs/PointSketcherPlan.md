# Plan: Point-Sketcher Package

## Ziel

Erstelle ein Package `point-sketcher`, das das Einzeichnen von Punkten auf einer OpenLayers-Karte ermöglicht. Die Punkte werden transient (nur in der Session) gespeichert und mit einem blauen Kreis visualisiert. Jeder Punkt kann mit einem editierbaren Label versehen werden, das in kleiner Schrift oberhalb des Punktes angezeigt wird.

## Dateistruktur

```
src/packages/point-sketcher/
├── build.config.mjs          # Service- und UI-Konfiguration
├── package.json              # Dependencies
├── index.ts                  # Public API (Interfaces, Component-Exports)
├── api.ts                    # TypeScript Interface-Definitionen
├── services.ts               # Service-Exports
├── PointSketcherServiceImpl.ts    # Service-Implementierung
├── PointSketcherServiceImpl.test.ts # Service-Tests
├── PointSketcherButton.tsx   # Einfacher UI Toggle-Button
├── PointSketcherButton.test.tsx    # Button-Tests
├── PointSketcher.tsx         # Haupt-Komponente mit Button + Rechtsklick-Label-Editor
├── LabelEditPopup.tsx        # Popup zur Label-Bearbeitung
├── LabelEditPopup.test.tsx   # Popup-Tests
├── i18n/
│   ├── en.yaml               # Englische Übersetzungen
│   └── de.yaml               # Deutsche Übersetzungen
```

## Implementierungsschritte

### 1. Package-Grundstruktur erstellen

**package.json**

- Name: `point-sketcher`
- Dependencies: `@open-pioneer/map`, `@open-pioneer/map-ui-components`, `@open-pioneer/runtime`, `@chakra-ui/react`, `ol`, `react`, `react-icons`

**build.config.mjs**

- Service: `PointSketcherServiceImpl` provides `"point-sketcher.PointSketcherService"`
- UI references: `"point-sketcher.PointSketcherService"`
- i18n: `["en", "de"]` für i18n-Support

### 2. i18n-Konfiguration

**i18n/en.yaml** (Englisch):

```yaml
messages:
    pointSketcher:
        buttonLabel: "Draw Points"
    labelEdit:
        placeholder: "Enter label..."
        save: "Save"
        cancel: "Cancel"
        delete: "Delete"
    clearPoints:
        buttonLabel: "Clear All Points"
        confirmMessage: "Delete all {count, plural, =1 {# point} other {# points}}?"
```

**i18n/de.yaml** (Deutsch):

```yaml
messages:
    pointSketcher:
        buttonLabel: "Punkte zeichnen"
    labelEdit:
        placeholder: "Label eingeben..."
        save: "Speichern"
        cancel: "Abbrechen"
        delete: "Löschen"
    clearPoints:
        buttonLabel: "Alle Punkte löschen"
        confirmMessage: "{count, plural, =1 {# Punkt} other {# Punkte}} löschen?"
```

**Verwendung in Komponenten:**

```typescript
import { useIntl } from "open-pioneer:react-hooks";

const intl = useIntl();
const label = intl.formatMessage({ id: "pointSketcher.buttonLabel" });
```

### 3. Service-Interface definieren (api.ts) ✓

```typescript
interface PointSketcherService {
    activate(olMap: OlMap): void; // Zeichenmodus aktivieren
    deactivate(): void; // Zeichenmodus deaktivieren
    isActive(): boolean; // Status abfragen
    getPoints(): Feature<Point>[]; // Alle Punkte abrufen
    clearPoints(): void; // Alle Punkte löschen
    onPointsChange(callback): () => void; // Änderungen beobachten

    // Label-Funktionen
    setPointLabel(featureId: string, label: string): void; // Label setzen/aktualisieren
    getPointLabel(featureId: string): string | undefined; // Label abrufen
    removePoint(featureId: string): void; // Punkt löschen
    getSource(): VectorSource<Feature<Point>>; // VectorSource für Interaktionen
}
```

### 4. Service implementieren (PointSketcherServiceImpl.ts) ✓

**Kernkomponenten:**

- `VectorSource<Feature<Point>>` - speichert die gezeichneten Punkte
- `VectorLayer` - visualisiert die Punkte auf der Karte
- `Draw` Interaction - OpenLayers-Interaktion für Punkteingabe (nur Linksklick)

**Draw-Interaction Konfiguration:**

```typescript
import { noModifierKeys, primaryAction } from "ol/events/condition";

this._drawInteraction = new Draw({
    source: this._vectorSource,
    type: "Point",
    condition: (event) => {
        // Only trigger on left mouse button (button 0)
        const originalEvent = event.originalEvent as PointerEvent;
        if (originalEvent.button !== 0) {
            return false;
        }
        return primaryAction(event) && noModifierKeys(event);
    }
});
```

**Wichtig:** Die Custom-Condition prüft explizit:

1. `originalEvent.button !== 0` - Nur linke Maustaste (button 0)
2. `primaryAction(event)` - Standard-Klick-Aktion
3. `noModifierKeys(event)` - Keine Modifier-Tasten (Ctrl, Shift, Alt)

Dies stellt sicher, dass nur Linksklicks neue Punkte anlegen. Rechtsklicks werden vom `contextmenu`-Event in `PointSketcher.tsx` behandelt.

**Blauer Kreis-Style mit Label:**

```typescript
// Style-Funktion, die das Label aus dem Feature liest
function createPointStyle(feature: Feature<Point>): Style {
    const label = feature.get("label") || "";
    return new Style({
        image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: "rgba(0, 100, 255, 0.7)" }),
            stroke: new Stroke({ color: "rgba(0, 50, 200, 1)", width: 2 })
        }),
        text: label
            ? new Text({
                  text: label,
                  font: "12px sans-serif",
                  fill: new Fill({ color: "#333" }),
                  stroke: new Stroke({ color: "#fff", width: 2 }),
                  offsetY: -15, // Oberhalb des Punktes
                  textAlign: "center"
              })
            : undefined
    });
}
```

**Lifecycle:**

- `activate()`: Layer zur Karte hinzufügen, Draw-Interaction aktivieren
- `deactivate()`: Draw-Interaction entfernen (Layer bleibt)
- `destroy()`: Alles aufräumen

**Label-Management:**

- Jedes Feature erhält bei Erstellung eine eindeutige ID (`feature.setId(uuid())`)
- Labels werden als Feature-Property gespeichert (`feature.set("label", text)`)
- Bei Label-Änderung wird `feature.changed()` aufgerufen, um Style-Update zu triggern
- `setPointLabel()` findet Feature per ID und aktualisiert die Property

### 5. UI-Button erstellen (PointSketcherButton.tsx) ✓

**Pattern wie in MapApp.tsx:**

- Verwendet `ToolButton` von `@open-pioneer/map-ui-components`
- Toggle-State mit `useState`
- Icon: `LuMapPin` von `react-icons/lu`
- Greift auf Service via `useService<PointSketcherService>()` zu
- Greift auf Map via `useMapModel(mapId)` zu

### 6. Label-Editor Popup erstellen (LabelEditPopup.tsx) ✓

**Neue UI-Komponente für Label-Bearbeitung:**

- Wird als Overlay auf der Karte angezeigt (OpenLayers Overlay oder Chakra Popover)
- Erscheint bei Klick auf einen existierenden Punkt (wenn Sketcher aktiv)
- Enthält:
    - Input-Feld für Label-Text
    - "Speichern"-Button
    - "Abbrechen"-Button
    - Optional: "Löschen"-Button für den Punkt

**Interaktions-Logik:**

- **Rechtsklick** auf existierenden Punkt öffnet den Label-Editor
- Implementiert via DOM `contextmenu` Event auf dem Map-Container
- Feature wird via `olMap.getFeaturesAtPixel()` ermittelt
- Bei "Speichern": `pointSketcherService.setPointLabel(featureId, newLabel)` aufrufen
- Bei "Abbrechen": Popup schließen ohne Änderung
- Bei "Löschen": `pointSketcherService.removePoint(featureId)` aufrufen

**Implementierung:**

```tsx
interface LabelEditPopupProps {
    feature: Feature<Point> | null;
    position: Coordinate | null;
    onSave: (label: string) => void;
    onCancel: () => void;
    onDelete?: () => void;
}
```

### 7. Public API exportieren (index.ts) ✓

- Export: `PointSketcherService` (Type)
- Export: `PointSketcherButton` (Component) - Einfacher Toggle-Button ohne Label-Editor
- Export: `PointSketcher` (Component) - Komplette Komponente mit Button + Rechtsklick-Label-Editor
- Export: `LabelEditPopup` (Component) - Optional, für eigene Integrationen

### 8. Tests schreiben ✓

**Service-Tests:**

- Startet im inaktiven Zustand
- Kann aktiviert/deaktiviert werden
- Keine doppelte Aktivierung
- Punkte können geleert werden
- Callbacks werden benachrichtigt
- Cleanup bei destroy()
- Label kann gesetzt und abgerufen werden
- Label-Änderung triggert Callback

**Component-Tests:**

- Button wird gerendert
- Toggle-Verhalten funktioniert
- LabelEditPopup zeigt korrekten Label-Text
- LabelEditPopup ruft onSave mit neuem Text auf

## Kritische Dateien (Referenz)

| Datei                                        | Zweck                         |
| -------------------------------------------- | ----------------------------- |
| src/packages/sample-package/build.config.mjs | Service-Konfiguration Pattern |
| src/packages/sample-package/services.ts      | Service-Export Pattern        |
| src/packages/sample-package/index.ts         | Public API Pattern            |
| src/samples/map-sample/ol-app/MapApp.tsx     | ToolButton & Map-Integration  |
| src/samples/map-sample/ol-app/services.ts    | MAP_ID Konstante              |

## Integration

Um das Package in einer App zu verwenden:

1. **Dependency hinzufügen** in `package.json`:

    ```json
    "point-sketcher": "workspace:^"
    ```

2. **UI-Reference hinzufügen** in `build.config.mjs`:

    ```javascript
    ui: {
        references: ["point-sketcher.PointSketcherService"];
    }
    ```

3. **Button einbinden** in der React-Komponente:

    ```tsx
    import { PointSketcherButton } from "point-sketcher";
    // Im Toolbar-Bereich:
    <PointSketcherButton mapId={MAP_ID} />;
    ```

4. **pnpm install** ausführen

## Verifikation

1. `pnpm install` - Package wird verlinkt
2. `pnpm check-types` - Keine TypeScript-Fehler
3. `pnpm lint` - Keine Linting-Fehler
4. `pnpm test` - Tests bestehen
5. `pnpm dev` - Dev-Server starten
6. **Manueller Test:**
    - http://localhost:5173/samples/map-sample/ öffnen
    - Point-Sketcher Button klicken (aktiviert Zeichenmodus)
    - **Linksklick** auf Karte → Blaue Kreise erscheinen
    - **Rechtsklick** auf existierenden Punkt → Label-Editor Popup öffnet sich
    - Label eingeben und speichern → Label erscheint oberhalb des Punktes
    - Label ändern → Aktualisiertes Label wird angezeigt
    - "Delete" klicken → Punkt wird entfernt
    - Erneut Button klicken (deaktiviert Zeichenmodus)
    - Punkte und Labels bleiben sichtbar

## Status

| Schritt | Beschreibung                            | Status              |
| ------- | --------------------------------------- | ------------------- |
| 1       | Package-Grundstruktur                   | ✓ Fertig            |
| 2       | i18n-Konfiguration                      | ✓ Fertig            |
| 3       | Service-Interface (api.ts)              | ✓ Fertig            |
| 4       | Service-Implementierung                 | ✓ Fertig            |
| 5       | UI-Button (PointSketcherButton.tsx)     | ✓ Fertig            |
| 6       | Label-Editor Popup (LabelEditPopup.tsx) | ✓ Fertig            |
| 7       | Public API (index.ts)                   | ✓ Fertig            |
| 8       | Tests                                   | ✓ Fertig (21 Tests) |
| -       | Integration in map-sample               | ✓ Fertig            |

**Nächste Schritte:**

- ClearAllPoints-Feature implementieren (siehe [ClearAllPointsPlan.md](ClearAllPointsPlan.md))
