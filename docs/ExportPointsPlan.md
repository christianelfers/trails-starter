# Plan: Export-Funktion für Point-Sketcher (KML-Format)

## Ziel

Erweitere das `point-sketcher` Package um eine Export-Funktion, die alle gezeichneten Punkte als KML-Datei exportiert. KML (Keyhole Markup Language) ist das primäre Format für Google Maps/Google Earth und bietet volle Kompatibilität.

## Warum KML?

Google My Maps unterstützt folgende Import-Formate:

- **KML/KMZ** - Primäres Google-Format, bis zu 5 MB
- **CSV** - Tabellenformat mit WKT-Geometrie
- **GPX** - GPS Exchange Format (muss konvertiert werden)

**KML ist die beste Wahl**, da:

1. Natives Google-Format - keine Konvertierung nötig
2. Unterstützt Labels/Namen direkt als `<name>` Element
3. XML-basiert - einfach zu generieren
4. Koordinatenformat: `longitude,latitude,altitude`

## KML-Struktur für Punkte

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Point Sketcher Export</name>
    <description>Exported points from Point Sketcher</description>
    <Placemark>
      <name>Punkt-Label</name>
      <description></description>
      <Point>
        <coordinates>8.6821,50.1109,0</coordinates>
      </Point>
    </Placemark>
    <!-- weitere Placemarks -->
  </Document>
</kml>
```

## Koordinaten-Transformation

**Wichtig:** OpenLayers verwendet möglicherweise EPSG:3857 (Web Mercator), während KML **WGS84 (EPSG:4326)** erwartet.

- Koordinaten müssen mit `ol/proj.transform()` konvertiert werden
- Von: Map-Projektion (z.B. `EPSG:3857`)
- Nach: `EPSG:4326` (longitude, latitude)

```typescript
import { transform } from "ol/proj";

const mapCoords = feature.getGeometry()?.getCoordinates();
const wgs84Coords = transform(mapCoords, "EPSG:3857", "EPSG:4326");
// wgs84Coords = [longitude, latitude]
```

## Dateistruktur (Erweiterungen)

```
src/packages/point-sketcher/
├── ... (bestehende Dateien)
├── ExportPointsButton.tsx        # NEU: UI-Button für Export
├── ExportPointsButton.test.tsx   # NEU: Tests
├── exportUtils.ts                # NEU: KML-Generierung & Download
├── exportUtils.test.ts           # NEU: Tests für Export-Logik
```

## Implementierungsschritte

### 1. Export-Utilities erstellen (`exportUtils.ts`) ✓

**Funktionen:**

- `generateKML(points, mapProjection)`: Generiert KML-String
- `downloadFile(content, filename, mimeType)`: Browser-Download auslösen
- `downloadKML(points, mapProjection, filename)`: Kombinierte Funktion
- `escapeXml(text)`: XML-Sonderzeichen escapen (`<`, `>`, `&`, etc.)

### 2. Export-Button erstellen (`ExportPointsButton.tsx`) ✓

**Props:**

```typescript
interface ExportPointsButtonProps extends CommonComponentProps {
    mapId: string;
    filename?: string; // Default: "points.kml"
    label?: string; // Default: i18n "export.buttonLabel"
}
```

**Verhalten:**

- Disabled wenn keine Punkte vorhanden
- Holt Map-Projektion von `olMap.getView().getProjection().getCode()`
- Generiert KML und triggert Download
- Icon: `LuDownload` von `react-icons/lu`

### 3. i18n erweitern ✓

**i18n/en.yaml:**

```yaml
messages:
    export:
        buttonLabel: "Export Points"
```

**i18n/de.yaml:**

```yaml
messages:
    export:
        buttonLabel: "Punkte exportieren"
```

### 4. Public API erweitern (`index.ts`) ✓

```typescript
export { ExportPointsButton, type ExportPointsButtonProps } from "./ExportPointsButton";
export { generateKML, downloadKML, downloadFile, escapeXml } from "./exportUtils";
```

### 5. Tests schreiben ✓

**exportUtils.test.ts (15 Tests):**

- `escapeXml` escaped alle XML-Sonderzeichen
- `generateKML` gibt korrekten KML-String zurück
- Koordinaten werden korrekt transformiert
- Leere Punkt-Liste gibt minimales KML zurück
- Labels werden korrekt in `<name>` eingefügt
- Features ohne Geometrie werden übersprungen

**ExportPointsButton.test.tsx (7 Tests):**

- Button wird gerendert mit i18n Label
- Button wird gerendert mit custom Label
- Button ist disabled wenn keine Punkte
- Button ist enabled wenn Punkte vorhanden
- Click triggert downloadKML
- Custom filename wird verwendet
- Disabled-State aktualisiert bei Point-Änderungen

## Kritische Dateien

| Datei                                                | Zweck                      |
| ---------------------------------------------------- | -------------------------- |
| `src/packages/point-sketcher/exportUtils.ts`         | KML-Generierung & Download |
| `src/packages/point-sketcher/ExportPointsButton.tsx` | UI-Button                  |
| `src/packages/point-sketcher/index.ts`               | Public API                 |
| `src/samples/map-sample/ol-app/MapApp.tsx`           | Integration                |

## Integration in MapApp ✓

```tsx
import { PointSketcher, ClearPointsButton, ExportPointsButton } from "point-sketcher";

// Im Toolbar-Bereich:
<PointSketcher mapId={MAP_ID} />
<ClearPointsButton confirmBeforeClear />
<ExportPointsButton mapId={MAP_ID} />
```

## Verifikation

1. `pnpm check-types` - Keine TypeScript-Fehler ✓
2. `pnpm test -- --run` - Alle 51 Tests bestehen ✓
3. `pnpm lint` - Keine ESLint-Fehler ✓
4. **Manueller Test:**
    - Point-Sketcher aktivieren
    - Mehrere Punkte mit Labels erstellen
    - Export-Button klicken → `points.kml` wird heruntergeladen
    - Google My Maps öffnen (https://www.google.com/mymaps)
    - "Importieren" → KML-Datei hochladen
    - Punkte erscheinen mit korrekten Labels an richtigen Positionen

## Status

| Schritt | Beschreibung                           | Status   |
| ------- | -------------------------------------- | -------- |
| 1       | Export-Utilities (exportUtils.ts)      | ✓ Fertig |
| 2       | Export-Button (ExportPointsButton.tsx) | ✓ Fertig |
| 3       | i18n-Erweiterung                       | ✓ Fertig |
| 4       | Public API (index.ts)                  | ✓ Fertig |
| 5       | Tests (22 neue Tests)                  | ✓ Fertig |
| -       | Integration in MapApp                  | ✓ Fertig |

## Quellen

- [Google My Maps Import](https://support.google.com/mymaps/answer/3024836)
- [KML Tutorial (Google)](https://developers.google.com/kml/documentation/kml_tut)
- [KML Reference](https://developers.google.com/kml/documentation/kmlreference)
