// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { it, expect, vi } from "vitest";
import { PointSketcherServiceImpl } from "./PointSketcherServiceImpl";
import OlMap from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";

function createMockMap(): OlMap {
    return new OlMap({
        view: new View({
            center: [0, 0],
            zoom: 2
        })
    });
}

it("starts in inactive state", () => {
    const service = new PointSketcherServiceImpl();
    expect(service.isActive()).toBe(false);
    expect(service.getPoints()).toHaveLength(0);
});

it("can be activated and deactivated", () => {
    const service = new PointSketcherServiceImpl();
    const map = createMockMap();

    service.activate(map);
    expect(service.isActive()).toBe(true);

    service.deactivate();
    expect(service.isActive()).toBe(false);
});

it("does not activate twice", () => {
    const service = new PointSketcherServiceImpl();
    const map = createMockMap();

    service.activate(map);
    service.activate(map); // Should not throw or change state
    expect(service.isActive()).toBe(true);
});

it("can clear points", () => {
    const service = new PointSketcherServiceImpl();
    service.clearPoints();
    expect(service.getPoints()).toHaveLength(0);
});

it("notifies callbacks when points change", () => {
    const service = new PointSketcherServiceImpl();
    const callback = vi.fn();

    const unsubscribe = service.onPointsChange(callback);
    service.clearPoints(); // This triggers notification

    expect(callback).toHaveBeenCalled();

    unsubscribe();
    callback.mockClear();
    service.clearPoints();
    expect(callback).not.toHaveBeenCalled();
});

it("cleans up on destroy", () => {
    const service = new PointSketcherServiceImpl();
    const map = createMockMap();

    service.activate(map);
    service.destroy();

    expect(service.isActive()).toBe(false);
});

it("can set and get point labels", () => {
    const service = new PointSketcherServiceImpl();
    const source = service.getSource();

    // Manually add a feature with an ID
    const feature = new Feature({ geometry: new Point([0, 0]) });
    feature.setId("test-feature-1");
    source.addFeature(feature);

    // Set label
    service.setPointLabel("test-feature-1", "Test Label");
    expect(service.getPointLabel("test-feature-1")).toBe("Test Label");

    // Update label
    service.setPointLabel("test-feature-1", "Updated Label");
    expect(service.getPointLabel("test-feature-1")).toBe("Updated Label");

    // Non-existent feature returns undefined
    expect(service.getPointLabel("non-existent")).toBeUndefined();
});

it("notifies callbacks when label changes", () => {
    const service = new PointSketcherServiceImpl();
    const callback = vi.fn();
    const source = service.getSource();

    // Manually add a feature with an ID
    const feature = new Feature({ geometry: new Point([0, 0]) });
    feature.setId("test-feature-2");
    source.addFeature(feature);

    service.onPointsChange(callback);
    callback.mockClear(); // Clear the callback from addFeature

    service.setPointLabel("test-feature-2", "New Label");
    expect(callback).toHaveBeenCalled();
});

it("can remove points by ID", () => {
    const service = new PointSketcherServiceImpl();
    const source = service.getSource();

    // Manually add a feature with an ID
    const feature = new Feature({ geometry: new Point([0, 0]) });
    feature.setId("test-feature-3");
    source.addFeature(feature);

    expect(service.getPoints()).toHaveLength(1);

    service.removePoint("test-feature-3");
    expect(service.getPoints()).toHaveLength(0);
});

it("returns the vector source", () => {
    const service = new PointSketcherServiceImpl();
    const source = service.getSource();
    expect(source).toBeDefined();
    expect(typeof source.addFeature).toBe("function");
});
