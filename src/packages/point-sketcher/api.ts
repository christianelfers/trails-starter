// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { DeclaredService } from "@open-pioneer/runtime";
import type { Feature } from "ol";
import type { Point } from "ol/geom";
import type OlMap from "ol/Map";

/**
 * Callback type for point change events.
 */
export type PointChangeCallback = (points: Feature<Point>[]) => void;

/**
 * Service for sketching points on an OpenLayers map.
 * Points are stored transiently in memory and are not persisted.
 *
 * Use the interface `"point-sketcher.PointSketcherService"` to inject this service.
 */
export interface PointSketcherService
    extends DeclaredService<"point-sketcher.PointSketcherService"> {
    /**
     * Activates point drawing mode on the specified map.
     * @param olMap The OpenLayers map instance
     */
    activate(olMap: OlMap): void;

    /**
     * Deactivates point drawing mode.
     */
    deactivate(): void;

    /**
     * Returns whether drawing mode is currently active.
     */
    isActive(): boolean;

    /**
     * Returns all currently drawn points.
     */
    getPoints(): Feature<Point>[];

    /**
     * Clears all drawn points.
     */
    clearPoints(): void;

    /**
     * Registers a callback to be notified when points change.
     * @param callback The callback function
     * @returns A function to unregister the callback
     */
    onPointsChange(callback: PointChangeCallback): () => void;

    /**
     * Sets or updates the label for a point feature.
     * @param featureId The unique ID of the feature
     * @param label The label text to set
     */
    setPointLabel(featureId: string, label: string): void;

    /**
     * Gets the label for a point feature.
     * @param featureId The unique ID of the feature
     * @returns The label text or undefined if not set
     */
    getPointLabel(featureId: string): string | undefined;

    /**
     * Removes a point feature by its ID.
     * @param featureId The unique ID of the feature to remove
     */
    removePoint(featureId: string): void;

    /**
     * Returns the VectorSource containing all points.
     * Useful for integrating with Select interactions.
     */
    getSource(): import("ol/source/Vector").default<Feature<Point>>;
}
