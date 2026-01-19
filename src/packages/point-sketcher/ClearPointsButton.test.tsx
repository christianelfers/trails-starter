// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PackageContextProvider } from "@open-pioneer/test-utils/react";
import { ClearPointsButton } from "./ClearPointsButton";
import type { PointSketcherService } from "./api";
import type Feature from "ol/Feature";
import type { Point } from "ol/geom";

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

it("renders button with i18n label", async () => {
    const mockService = createMockService();

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton />
        </PackageContextProvider>
    );

    // ToolButton uses aria-label for the label text
    const button = await screen.findByRole("button", { name: "clearPoints.buttonLabel" });
    expect(button).toBeDefined();
});

it("renders button with custom label", async () => {
    const mockService = createMockService();

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton label="Custom Clear" />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button", { name: "Custom Clear" });
    expect(button).toBeDefined();
});

it("is disabled when no points exist", async () => {
    const mockService = createMockService([]);

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    expect(button).toHaveProperty("disabled", true);
});

it("is enabled when points exist", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    expect(button).toHaveProperty("disabled", false);
});

it("calls clearPoints when clicked", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    fireEvent.click(button);

    expect(mockService.clearPoints).toHaveBeenCalled();
});

it("shows confirmation dialog when confirmBeforeClear is true", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);

    // Mock window.confirm using globalThis
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = vi.fn().mockReturnValue(true);

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton confirmBeforeClear={true} />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    fireEvent.click(button);

    expect(globalThis.confirm).toHaveBeenCalled();
    expect(mockService.clearPoints).toHaveBeenCalled();

    globalThis.confirm = originalConfirm;
});

it("does not clear points when confirmation is cancelled", async () => {
    const mockFeature = createMockFeature();
    const mockService = createMockService([mockFeature]);

    // Mock window.confirm to return false
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = vi.fn().mockReturnValue(false);

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton confirmBeforeClear={true} />
        </PackageContextProvider>
    );

    const button = await screen.findByRole("button");
    fireEvent.click(button);

    expect(globalThis.confirm).toHaveBeenCalled();
    expect(mockService.clearPoints).not.toHaveBeenCalled();

    globalThis.confirm = originalConfirm;
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

    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockService
            }}
        >
            <ClearPointsButton />
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
