// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { Draw } from "ol/interaction";
import { noModifierKeys, primaryAction } from "ol/events/condition";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import type OlMap from "ol/Map";
import type { Feature } from "ol";
import type { FeatureLike } from "ol/Feature";
import type { Point } from "ol/geom";
import type { PointSketcherService, PointChangeCallback } from "./api";

let featureIdCounter = 0;

/**
 * Generates a unique feature ID.
 */
function generateFeatureId(): string {
    return `point-sketcher-${Date.now()}-${++featureIdCounter}`;
}

/**
 * Creates the blue circle style with optional label for point features.
 */
function createPointStyle(feature: FeatureLike): Style {
    const label = feature.get("label") as string | undefined;
    return new Style({
        image: new CircleStyle({
            radius: 8,
            fill: new Fill({
                color: "rgba(0, 100, 255, 0.7)"
            }),
            stroke: new Stroke({
                color: "rgba(0, 50, 200, 1)",
                width: 2
            })
        }),
        text: label
            ? new Text({
                  text: label,
                  font: "12px sans-serif",
                  fill: new Fill({ color: "#333" }),
                  stroke: new Stroke({ color: "#fff", width: 2 }),
                  offsetY: -15,
                  textAlign: "center"
              })
            : undefined
    });
}

export class PointSketcherServiceImpl implements PointSketcherService {
    declare [Symbol.toStringTag]: "point-sketcher.PointSketcherService";

    private _vectorSource: VectorSource<Feature<Point>>;
    private _vectorLayer: VectorLayer<VectorSource<Feature<Point>>>;
    private _drawInteraction: Draw | null = null;
    private _currentMap: OlMap | null = null;
    private _isActive = false;
    private _callbacks: Set<PointChangeCallback> = new Set();

    constructor() {
        this._vectorSource = new VectorSource<Feature<Point>>();
        this._vectorLayer = new VectorLayer({
            source: this._vectorSource,
            style: createPointStyle,
            properties: {
                title: "Sketched Points",
                "point-sketcher-layer": true
            }
        });

        // Listen for feature additions and assign unique IDs
        this._vectorSource.on("addfeature", (event) => {
            const feature = event.feature;
            if (feature && !feature.getId()) {
                feature.setId(generateFeatureId());
            }
            this._notifyPointsChange();
        });
    }

    activate(olMap: OlMap): void {
        if (this._isActive) {
            return;
        }

        this._currentMap = olMap;

        // Add layer to map if not already added
        if (!olMap.getLayers().getArray().includes(this._vectorLayer)) {
            olMap.addLayer(this._vectorLayer);
        }

        // Create and add the draw interaction
        // Custom condition: only left-click (primaryAction) without modifier keys
        // This prevents right-clicks from creating points
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

        olMap.addInteraction(this._drawInteraction);
        this._isActive = true;
    }

    deactivate(): void {
        if (!this._isActive || !this._currentMap || !this._drawInteraction) {
            return;
        }

        this._currentMap.removeInteraction(this._drawInteraction);
        this._drawInteraction = null;
        this._isActive = false;
    }

    isActive(): boolean {
        return this._isActive;
    }

    getPoints(): Feature<Point>[] {
        return this._vectorSource.getFeatures() as Feature<Point>[];
    }

    clearPoints(): void {
        this._vectorSource.clear();
        this._notifyPointsChange();
    }

    onPointsChange(callback: PointChangeCallback): () => void {
        this._callbacks.add(callback);
        return () => {
            this._callbacks.delete(callback);
        };
    }

    setPointLabel(featureId: string, label: string): void {
        const feature = this._vectorSource.getFeatureById(featureId);
        if (feature) {
            feature.set("label", label);
            feature.changed(); // Trigger style update
            this._notifyPointsChange();
        }
    }

    getPointLabel(featureId: string): string | undefined {
        const feature = this._vectorSource.getFeatureById(featureId);
        if (feature) {
            return feature.get("label") as string | undefined;
        }
        return undefined;
    }

    removePoint(featureId: string): void {
        const features = this._vectorSource.getFeatures();
        const featureToRemove = features.find((f) => f.getId() === featureId);

        if (featureToRemove) {
            this._vectorSource.removeFeature(featureToRemove);
            this._notifyPointsChange();
        }
    }

    getSource(): VectorSource<Feature<Point>> {
        return this._vectorSource;
    }

    destroy(): void {
        this.deactivate();

        // Remove layer from map
        if (this._currentMap) {
            this._currentMap.removeLayer(this._vectorLayer);
        }

        // Clear all data
        this._vectorSource.clear();
        this._callbacks.clear();
    }

    private _notifyPointsChange(): void {
        const points = this.getPoints();
        for (const callback of this._callbacks) {
            callback(points);
        }
    }
}
