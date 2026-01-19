# Plan: Clear All Points Feature

## Ziel

Erstelle ein Feature, das alle Punkte auf der Karte löscht, die mit dem PointSketcher erstellt wurden. Der Benutzer soll mit einem Klick alle gezeichneten Punkte entfernen können.

## Analyse des bestehenden Codes

### Bereits vorhandene Funktionalität

Der `PointSketcherService` hat bereits eine `clearPoints()` Methode implementiert:

```typescript
// In PointSketcherServiceImpl.ts (Zeile 122-125)
clearPoints(): void {
    this._vectorSource.clear();
    this._notifyPointsChange();
}
```

Diese Methode:

- Leert die gesamte VectorSource
- Benachrichtigt alle Listener über die Änderung

### Fehlende Komponenten

1. **UI-Element**: Ein Button zum Auslösen der "Clear All" Aktion
2. **Integration**: Einbindung des Buttons in die bestehende UI

> **Hinweis:** i18n ist bereits implementiert (`build.config.mjs`, `i18n/en.yaml`, `i18n/de.yaml`). Die i18n-Keys für `clearPoints.*` sind vorbereitet.

## Implementierungsoptionen

### Option A: Separater "Clear All" Button (Empfohlen)

**Vorteile:**

- Eigenständige Komponente, wiederverwendbar
- Klare Trennung der Verantwortlichkeiten
- Kann unabhängig vom PointSketcher-Button platziert werden

**Implementierung:**

- Neue Komponente `ClearPointsButton.tsx`
- Verwendet `useService` für Zugriff auf PointSketcherService
- Einfacher ToolButton mit Papierkorb-Icon

### Option B: Integration in PointSketcher-Komponente

**Vorteile:**

- Alle Sketcher-Funktionen an einem Ort
- Weniger neue Dateien
- Konsistente UI-Gruppierung

### Option C: Kontextmenü-Erweiterung

**Vorteile:**

- Konsistent mit bestehender Rechtsklick-Interaktion
- Kein zusätzlicher Button in der Toolbar

## Empfehlung

**Option A (Separater Button)** wird empfohlen, weil:

- Maximale Flexibilität für App-Entwickler
- Einfache Integration in verschiedene UI-Layouts
- Klare, fokussierte Komponente
- Kann optional mit PointSketcher kombiniert werden

## Dateistruktur (Änderungen)

```
src/packages/point-sketcher/
├── ...bestehende Dateien...
├── ClearPointsButton.tsx        # NEU: Clear All Button Komponente
├── ClearPointsButton.test.tsx   # NEU: Tests für den Button
├── i18n/
│   ├── en.yaml                  # EXISTIERT: clearPoints.* Keys bereits vorhanden
│   └── de.yaml                  # EXISTIERT: clearPoints.* Keys bereits vorhanden
└── index.ts                     # ÄNDERUNG: Export hinzufügen
```

## Implementierungsschritte

### Voraussetzungen (bereits erledigt ✓)

Die folgenden Schritte wurden bereits im Rahmen der i18n-Implementierung durchgeführt:

- ✓ `build.config.mjs` mit `i18n: ["en", "de"]` konfiguriert
- ✓ `i18n/en.yaml` und `i18n/de.yaml` erstellt (inkl. `clearPoints.*` Keys)
- ✓ Alle bestehenden Komponenten auf `useIntl` umgestellt

### 1. ClearPointsButton Komponente erstellen

**Datei:** `ClearPointsButton.tsx`

```typescript
// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0

interface ClearPointsButtonProps extends CommonComponentProps {
    /**
     * Optional custom label for the button.
     * If not provided, uses i18n message "clearPoints.buttonLabel".
     */
    buttonLabel?: string;

    /**
     * Show confirmation dialog before clearing?
     * @default false
     */
    confirmBeforeClear?: boolean;
}
```

**Funktionalität:**

- Verwendet `useService<PointSketcherService>()` für Service-Zugriff
- Verwendet `useIntl()` für lokalisierte Texte
- Icon: `LuTrash2` von `react-icons/lu`
- Ruft `pointSketcherService.clearPoints()` auf
- Optional: Bestätigungsdialog vor dem Löschen

**Implementierung:**

```tsx
// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { FC, useCallback, useEffect, useState } from "react";
import { useService } from "open-pioneer:react-hooks";
import { useIntl } from "open-pioneer:react-hooks";
import { ToolButton } from "@open-pioneer/map-ui-components";
import { CommonComponentProps, useCommonComponentProps } from "@open-pioneer/react-utils";
import { LuTrash2 } from "react-icons/lu";
import type { PointSketcherService } from "./api";

export const ClearPointsButton: FC<ClearPointsButtonProps> = (props) => {
    const { buttonLabel, confirmBeforeClear = false } = props;
    const { containerProps } = useCommonComponentProps("clear-points-button", props);

    const intl = useIntl();
    const pointSketcherService = useService<PointSketcherService>(
        "point-sketcher.PointSketcherService"
    );

    const [hasPoints, setHasPoints] = useState(false);

    useEffect(() => {
        setHasPoints(pointSketcherService.getPoints().length > 0);
        const unsubscribe = pointSketcherService.onPointsChange((points) => {
            setHasPoints(points.length > 0);
        });
        return unsubscribe;
    }, [pointSketcherService]);

    const label = buttonLabel ?? intl.formatMessage({ id: "clearPoints.buttonLabel" });

    const handleClick = useCallback(() => {
        if (confirmBeforeClear) {
            const count = pointSketcherService.getPoints().length;
            const message = intl.formatMessage({ id: "clearPoints.confirmMessage" }, { count });
            if (window.confirm(message)) {
                pointSketcherService.clearPoints();
            }
        } else {
            pointSketcherService.clearPoints();
        }
    }, [pointSketcherService, confirmBeforeClear, intl]);

    return (
        <ToolButton
            {...containerProps}
            label={label}
            icon={<LuTrash2 />}
            onClick={handleClick}
            disabled={!hasPoints}
        />
    );
};
```

### 2. Tests schreiben

**Datei:** `ClearPointsButton.test.tsx`

**Testfälle:**

- Button wird gerendert
- Button ist deaktiviert wenn keine Punkte vorhanden
- Button ist aktiv wenn Punkte vorhanden
- Klick ruft `clearPoints()` auf
- Nach Klick sind keine Punkte mehr vorhanden
- Bestätigungsdialog erscheint wenn `confirmBeforeClear={true}`
- i18n: Button zeigt lokalisierten Text

### 3. Public API erweitern

**Datei:** `index.ts` (Änderung)

```typescript
// Bestehende Exports...
export { ClearPointsButton } from "./ClearPointsButton";
export type { ClearPointsButtonProps } from "./ClearPointsButton";
```

## Integration in App

Nach Implementierung kann der Button so verwendet werden:

```tsx
import { PointSketcher, ClearPointsButton } from "point-sketcher";

// In der Toolbar:
<PointSketcher mapId={MAP_ID} />
<ClearPointsButton />

// Oder mit Bestätigung:
<ClearPointsButton confirmBeforeClear={true} />

// Mit benutzerdefiniertem Label (überschreibt i18n):
<ClearPointsButton buttonLabel="Alles löschen" />
```

## Verifikation

1. `pnpm check-types` - Keine TypeScript-Fehler
2. `pnpm lint` - Keine Linting-Fehler
3. `pnpm test` - Tests bestehen
4. **Manueller Test:**
    - Mehrere Punkte auf der Karte zeichnen
    - "Clear All" Button ist aktiv
    - Button klicken → Alle Punkte werden entfernt
    - Button ist jetzt deaktiviert (keine Punkte mehr)
    - Browser-Sprache auf Deutsch stellen → Texte sind deutsch
    - Optional: Bestätigungsdialog testen mit `confirmBeforeClear={true}`

## Checkliste Projektanforderungen

| Anforderung       | Status | Details                                                   |
| ----------------- | ------ | --------------------------------------------------------- |
| License Headers   | ✅     | Alle neuen Dateien mit SPDX-Header                        |
| i18n              | ✅     | `build.config.mjs` mit `i18n: ["en", "de"]`, YAML-Dateien |
| TypeScript strict | ✅     | Keine `any`, keine `!` assertions                         |
| Tests             | ✅     | `ClearPointsButton.test.tsx`                              |
| Double quotes     | ✅     | Code-Beispiele verwenden double quotes                    |
| Semicolons        | ✅     | Alle Statements mit Semikolon                             |

## Offene Entscheidungen

1. **Soll der Bestätigungsdialog standardmäßig aktiviert sein?**
    - Empfehlung: Nein (`confirmBeforeClear={false}` als Standard)

2. **Soll der Button nur sichtbar sein wenn der PointSketcher aktiv ist?**
    - Empfehlung: Nein, Button immer sichtbar (aber deaktiviert wenn keine Punkte)

3. **Welches Icon soll verwendet werden?**
    - Empfehlung: `LuTrash2` (Papierkorb) von react-icons/lu

## Status

| Schritt | Beschreibung                   | Status               |
| ------- | ------------------------------ | -------------------- |
| -       | i18n-Konfiguration             | ✓ Erledigt           |
| -       | i18n YAML-Dateien              | ✓ Erledigt           |
| -       | Komponenten auf i18n umstellen | ✓ Erledigt           |
| 1       | ClearPointsButton erstellen    | ✓ Erledigt           |
| 2       | Tests schreiben                | ✓ Erledigt (8 Tests) |
| 3       | Public API erweitern           | ✓ Erledigt           |
| -       | Integration in map-sample      | ✓ Erledigt           |

**Implementierung abgeschlossen**
