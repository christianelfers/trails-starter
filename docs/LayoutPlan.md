# Plan: Layout-Anpassung "Point Marker" im conterra-Stil

## Ziel

Passe das Layout der Map-Sample-App an:

1. App-Name ändern zu **"Point Marker"**
2. Design im conterra.de-Stil mit den offiziellen Markenfarben
3. conterra-Logo im Footer einfügen (200px Breite, weißer Hintergrund)
4. Solide Buttons (keine Transparenz)
5. Vereinfachte UI (ohne OverviewMap, BasemapSwitcher, ScaleBar)

## conterra.de Design-Analyse

Aus dem offiziellen conterra-Logo extrahierte Farben:

- **Primärfarbe Grün**: #6CC24A (con terra Grün)
- **Primärfarbe Blau**: #005587 (con terra Dunkelblau)
- **Design-Sprache**: Modern, professionell, clean
- **Header**: Dunkelblau mit weißem Text
- **Footer**: Dunkelblau mit Logo (weißer Hintergrund) und hellem Text

## Implementierung

### 1. Custom Element Name ✓

In `src/samples/map-sample/ol-app/app.ts`:

```typescript
customElements.define("point-marker-app", element);
```

In `src/samples/map-sample/index.html`:

```html
<title>Point Marker</title> <point-marker-app class="full-height" id="test"></point-marker-app>
```

### 2. Custom Theme mit conterra-Farben ✓

`src/samples/map-sample/ol-app/theme/config.ts`:

```typescript
import { defineConfig, mergeConfigs } from "@chakra-ui/react";
import { config as defaultTrailsConfig } from "@open-pioneer/base-theme";

export const config = mergeConfigs(
    defaultTrailsConfig,
    defineConfig({
        globalCss: {
            html: {
                colorPalette: "conterra"
            }
        },
        theme: {
            tokens: {
                colors: {
                    // conterra Grün (aus Logo)
                    conterra: {
                        50: { value: "#f0faf0" },
                        100: { value: "#dcf5dc" },
                        200: { value: "#b8e8b5" },
                        300: { value: "#8dd888" },
                        400: { value: "#6CC24A" }, // Hauptfarbe Grün
                        500: { value: "#5aad3d" },
                        600: { value: "#4a9132" },
                        700: { value: "#3d7529" },
                        800: { value: "#335f23" },
                        900: { value: "#2a4f1e" },
                        950: { value: "#1a3012" }
                    },
                    // conterra Blau (aus Logo)
                    conterraBlue: {
                        50: { value: "#e6f0f7" },
                        100: { value: "#cce1ef" },
                        200: { value: "#99c3df" },
                        300: { value: "#66a5cf" },
                        400: { value: "#3387bf" },
                        500: { value: "#005587" }, // Hauptfarbe Blau
                        600: { value: "#00466d" },
                        700: { value: "#003753" },
                        800: { value: "#00283a" },
                        900: { value: "#001920" },
                        950: { value: "#000d10" }
                    }
                }
            },
            semanticTokens: {
                colors: {
                    "conterra.solid": { value: "{colors.conterra.400}" },
                    "conterra.contrast": { value: "white" },
                    "conterra.fg": { value: "{colors.conterra.700}" },
                    "conterraBlue.solid": { value: "{colors.conterraBlue.500}" },
                    "conterraBlue.contrast": { value: "white" },
                    "conterraBlue.fg": { value: "{colors.conterraBlue.700}" }
                }
            }
        }
    })
);
```

### 3. Header-Design ✓

Der Header verwendet conterra Dunkelblau (#005587):

```tsx
<Box
    role="region"
    aria-label={intl.formatMessage({ id: "ariaLabel.header" })}
    bg="conterraBlue.500"
    color="white"
    py={3}
    px={4}
    boxShadow="md"
>
    <Flex alignItems="center" justifyContent="space-between" maxW="1400px" mx="auto">
        <SectionHeading size="lg" color="white">
            {intl.formatMessage({ id: "appTitle" })}
        </SectionHeading>
    </Flex>
</Box>
```

### 4. Footer mit conterra-Logo ✓

Der Footer enthält das conterra-Logo (200px Breite) auf weißem Hintergrund:

```tsx
<Flex
    role="region"
    aria-label={intl.formatMessage({ id: "ariaLabel.footer" })}
    bg="conterraBlue.500"
    color="white"
    gap={3}
    py={2}
    px={4}
    alignItems="center"
    justifyContent="space-between"
>
    {/* Logo links mit weißem Hintergrund */}
    <Box backgroundColor="white" borderRadius="md" px={2} py={1}>
        <img
            src="https://www.conterra.de/themes/conterra/logo.svg"
            alt="con terra Logo"
            style={{ width: "200px", height: "auto" }}
        />
    </Box>

    {/* Karten-Infos rechts */}
    <Flex gap={3} alignItems="center">
        <CoordinateViewer precision={2} />
        <ScaleViewer />
    </Flex>
</Flex>
```

### 5. Solide Buttons ✓

Die Map-Buttons haben solide weiße Hintergründe:

```tsx
<MapAnchor position="bottom-right" horizontalGap={10} verticalGap={30}>
    <Flex
        aria-label={intl.formatMessage({ id: "ariaLabel.bottomRight" })}
        direction="column"
        gap={1}
        padding={1}
        backgroundColor="white"
        borderRadius="lg"
        boxShadow="md"
    >
        <ToolButton ... />
        <PointSketcher mapId={MAP_ID} />
        <ClearPointsButton confirmBeforeClear />
        <ExportPointsButton mapId={MAP_ID} />
        <Geolocation />
        <InitialExtent />
        <ZoomIn />
        <ZoomOut />
    </Flex>
</MapAnchor>
```

### 6. Entfernte Komponenten ✓

Folgende Komponenten wurden entfernt:

- `OverviewMap` - Übersichtskarte oben rechts
- `BasemapSwitcher` - Hintergrundkarten-Auswahl
- `ScaleBar` - Maßstabsleiste im Footer

### 7. i18n ✓

In `i18n/en.yaml` und `i18n/de.yaml`:

```yaml
messages:
    appTitle: "Point Marker"
```

## Dateistruktur

```
src/samples/map-sample/
├── index.html                # Custom Element "point-marker-app", Titel "Point Marker"
└── ol-app/
    ├── theme/
    │   └── config.ts         # conterra Farben (#6CC24A, #005587)
    ├── app.ts                # Custom Element "point-marker-app"
    ├── MapApp.tsx            # Header/Footer/Buttons Layout
    └── i18n/
        ├── en.yaml           # appTitle: "Point Marker"
        └── de.yaml           # appTitle: "Point Marker"
```

## Farbübersicht

| Element                     | Farbe               | Hex-Code |
| --------------------------- | ------------------- | -------- |
| Header Hintergrund          | conterra Dunkelblau | #005587  |
| Header Text                 | Weiß                | #FFFFFF  |
| Footer Hintergrund          | conterra Dunkelblau | #005587  |
| Footer Text                 | Weiß                | #FFFFFF  |
| Logo-Hintergrund            | Weiß                | #FFFFFF  |
| Akzentfarbe (Buttons aktiv) | conterra Grün       | #6CC24A  |
| Button-Container            | Weiß (solide)       | #FFFFFF  |

## Verifikation

1. `pnpm check-types` - Keine TypeScript-Fehler ✓
2. `pnpm dev` - Dev-Server starten
3. **URL:** http://localhost:5173/samples/map-sample/
4. **Visueller Test:**
    - Header zeigt "Point Marker" in Dunkelblau (#005587) ✓
    - Footer ist dunkelblau mit conterra-Logo (200px, weißer Hintergrund) ✓
    - Buttons haben weißen, soliden Hintergrund (keine Transparenz) ✓
    - Keine OverviewMap, kein BasemapSwitcher, keine ScaleBar ✓
    - Aktive Buttons nutzen Grün (#6CC24A) als Akzent ✓

## Status

| Schritt | Beschreibung                                  | Status   |
| ------- | --------------------------------------------- | -------- |
| 1       | Custom Element Name                           | ✓ Fertig |
| 2       | Theme mit conterra-Farben                     | ✓ Fertig |
| 3       | Header dunkelblau                             | ✓ Fertig |
| 4       | Footer mit Logo (weißer Hintergrund)          | ✓ Fertig |
| 5       | Solide Buttons                                | ✓ Fertig |
| 6       | OverviewMap/BasemapSwitcher/ScaleBar entfernt | ✓ Fertig |
| 7       | i18n für Titel                                | ✓ Fertig |

## Hinweis zur URL

Das Verzeichnis heißt aktuell noch `ol-app`. Um die URL auf `/samples/map-sample/point-marker/` zu ändern:

1. Dev-Server stoppen
2. Verzeichnis umbenennen: `ol-app` → `point-marker`
3. In `index.html` Script-Pfad anpassen: `src="./point-marker/app.ts"`
4. Dev-Server neu starten
