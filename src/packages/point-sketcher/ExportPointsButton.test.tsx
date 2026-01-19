// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PackageContextProvider } from "@open-pioneer/test-utils/react";
import { ExportPointsButton } from "./ExportPointsButton";
import type { PointSketcherService } from "./api";
import type Feature from "ol/Feature";
import type { Point } from "ol/geom";

// Mock the exportUtils module
vi.mock("./exportUtils", () => ({
    downloadKML: vi.fn()
}));

import { downloadKML } from "./exportUtils";

function createMockService(initialPoints: Feature<Point>[] = []): PointSketcherService {
    let points = [...initialPoints];
    const callbacks: ((points: Feature<Point>[]) => void)[] = [];

    return {
        activate: vi.fn(),
        deactivate: vi.fn(),
        isActive: vi.fn().mockReturnValue(false),
        getPoints: vi.fn(() => points),
        clearPoints: vi.fn(() => {
            points = [];
            callbacks.forEach((cb) => cb(points));
        }),
        onPointsChange: vi.fn((callback) => {
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            };
        }),
        setPointLabel: vi.fn(),
        getPointLabel: vi.fn(),
        removePoint: vi.fn(),
        getSource: vi.fn()
    } as unknown as PointSketcherService;
}

function createMockFeature(): Feature<Point> {
    return {
        getId: () => "test-feature",
        get: () => undefined,
        set: vi.fn(),
        getGeometry: () => ({ getCoordinates: () => [0, 0] })
    } as unknown as Feature<Point>;
}

function createMockMapRegistry(mapId: string) {
    return {
        expectMapModel: vi.fn().mockResolvedValue({
            id: mapId,
            olMap: {
                getView: () => ({
                    getProjection: () => ({
                        getCode: () => "EPSG:3857"
                    })
                })
            }
        })
    };
}

it("renders button with i18n label", async () => {
    const mockService = createMockService();
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" />
        </PackageContextProvider>
    );

    // ToolButton uses aria-label for the label text
    const button = await screen.findByRole("button", { name: "export.buttonLabel" });
    expect(button).toBeDefined();
});

it("renders button with custom label", async () => {
    const mockService = createMockService();
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" label="Custom Export" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button", { name: "Custom Export" });
    expect(button).toBeDefined();
});

it("is disabled when no points exist", async () => {
    const mockService = createMockService([]);
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    expect(button).toHaveProperty("disabled", true);
});

it("is enabled when points exist", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    expect(button).toHaveProperty("disabled", false);
});

it("calls downloadKML when clicked", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    fireEvent.click(button);

    expect(downloadKML).toHaveBeenCalledWith([mockFeature], "EPSG:3857", "points.kml");
});

it("uses custom filename when provided", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" filename="custom-export.kml" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    fireEvent.click(button);

    expect(downloadKML).toHaveBeenCalledWith([mockFeature], "EPSG:3857", "custom-export.kml");
});

it("updates disabled state when points change", async () => {
    let pointsChangeCallback: ((points: Feature<Point>[]) => void) | null = null;
    const mockService = {
        ...createMockService([]),
        onPointsChange: vi.fn((callback) => {
            pointsChangeCallback = callback;
            return () => {
                pointsChangeCallback = null;
            };
        })
    } as unknown as PointSketcherService;
    const mockMapRegistry = createMockMapRegistry("test-map");

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <ExportPointsButton mapId="test-map" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    expect(button).toHaveProperty("disabled", true);

    // Simulate adding a point - wrap in act() to handle state update
    await act(async () => {
        if (pointsChangeCallback) {
            pointsChangeCallback([createMockFeature()]);
        }
    });

    // Button should now be enabled
    expect(button).toHaveProperty("disabled", false);
});
