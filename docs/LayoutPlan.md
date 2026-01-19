# Plan: Layout-Anpassung "Point Marker" im conterra-Stil

## Ziel

Passe das Layout der Map-Sample-App an:

1. Titel ändern: "Open Pioneer Trails - Map Sample" → **"Point Marker"**
2. Design im conterra.de-Stil mit der Akzentfarbe **#F2695C** (Coral/Salmon)

## conterra.de Design-Analyse

Basierend auf der Website-Analyse:

- **Primärfarbe**: #F2695C (Coral/Salmon-Rot)
- **Design-Sprache**: Modern, professionell, clean
- **Header**: Klare Struktur, professionelles Erscheinungsbild
- **Footer**: Dunkel mit hellem Text

## Implementierungsansatz

### 1. Custom Theme erstellen

Erstelle `src/samples/map-sample/ol-app/theme/config.ts`:

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
                    conterra: {
                        50: { value: "#fef2f1" },
                        100: { value: "#fde6e4" },
                        200: { value: "#fbd0cc" },
                        300: { value: "#f8aea7" },
                        400: { value: "#f38274" },
                        500: { value: "#F2695C" }, // Hauptfarbe
                        600: { value: "#d4493c" },
                        700: { value: "#b23a2f" },
                        800: { value: "#93332a" },
                        900: { value: "#7a3129" },
                        950: { value: "#421512" }
                    }
                }
            },
            semanticTokens: {
                colors: {
                    "conterra.solid": { value: "{colors.conterra.500}" },
                    "conterra.contrast": { value: "white" },
                    "conterra.fg": { value: "{colors.conterra.700}" }
                }
            }
        }
    })
);
```

### 2. Theme in App einbinden

Anpassen von `src/samples/map-sample/ol-app/app.ts`:

```typescript
import { createCustomElement } from "@open-pioneer/runtime";
import * as appMetadata from "open-pioneer:app";
import { MapApp } from "./MapApp";
import { config } from "./theme/config";

const Element = createCustomElement({
    component: MapApp,
    chakraSystemConfig: config, // Custom Theme hinzufügen
    appMetadata
});

customElements.define("ol-map-app", Element);
```

### 3. Header-Design anpassen (MapApp.tsx)

```tsx
// Neuer Header mit conterra-Styling
<Box
    role="region"
    aria-label={intl.formatMessage({ id: "ariaLabel.header" })}
    bg="conterra.500"
    color="white"
    py={3}
    px={4}
    boxShadow="md"
>
    <Flex alignItems="center" justifyContent="space-between" maxW="1400px" mx="auto">
        <SectionHeading size="lg" color="white" fontWeight="600">
            Point Marker
        </SectionHeading>
    </Flex>
</Box>
```

### 4. Footer-Design anpassen

```tsx
<Flex
    role="region"
    aria-label={intl.formatMessage({ id: "ariaLabel.footer" })}
    bg="gray.800"
    color="white"
    gap={3}
    py={2}
    px={4}
    alignItems="center"
    justifyContent="center"
>
    <CoordinateViewer precision={2} />
    <ScaleBar />
    <ScaleViewer />
</Flex>
```

### 5. i18n für neuen Titel

Aktualisiere `src/samples/map-sample/ol-app/i18n/en.yaml`:

```yaml
messages:
    appTitle: "Point Marker"
```

Aktualisiere `src/samples/map-sample/ol-app/i18n/de.yaml`:

```yaml
messages:
    appTitle: "Point Marker"
```

### 6. Optional: CSS-Anpassungen (app.css)

```css
/* conterra-inspired accents */
.sidebar {
    border-left: 3px solid #f2695c;
}

/* Subtle hover effects */
button:hover {
    border-color: #f2695c;
}
```

## Dateistruktur

```
src/samples/map-sample/ol-app/
├── theme/
│   └── config.ts          # NEU: Custom Theme
├── app.ts                  # ÄNDERN: Theme einbinden
├── app.css                 # ÄNDERN: CSS-Anpassungen
├── MapApp.tsx              # ÄNDERN: Header/Footer Layout
├── i18n/
│   ├── en.yaml             # ÄNDERN: appTitle
│   └── de.yaml             # ÄNDERN: appTitle
```

## Kritische Dateien

| Datei                                           | Änderung               |
| ----------------------------------------------- | ---------------------- |
| `src/samples/map-sample/ol-app/theme/config.ts` | NEU: conterra Theme    |
| `src/samples/map-sample/ol-app/app.ts`          | Theme einbinden        |
| `src/samples/map-sample/ol-app/MapApp.tsx`      | Header/Footer anpassen |
| `src/samples/map-sample/ol-app/app.css`         | CSS-Feinheiten         |
| `src/samples/map-sample/ol-app/i18n/*.yaml`     | Titel-Übersetzung      |

## Verifikation

1. `pnpm check-types` - Keine TypeScript-Fehler
2. `pnpm dev` - Dev-Server starten
3. **Visueller Test:**
    - Header zeigt "Point Marker" in Coral-Farbe (#F2695C)
    - Footer ist dunkel mit weißem Text
    - Buttons haben conterra-Akzentfarbe
    - Professionelles, modernes Erscheinungsbild

## Status

| Schritt | Beschreibung           | Status     |
| ------- | ---------------------- | ---------- |
| 1       | Custom Theme erstellen | Ausstehend |
| 2       | Theme in App einbinden | Ausstehend |
| 3       | Header-Design anpassen | Ausstehend |
| 4       | Footer-Design anpassen | Ausstehend |
| 5       | i18n für Titel         | Ausstehend |
| 6       | CSS-Anpassungen        | Optional   |
