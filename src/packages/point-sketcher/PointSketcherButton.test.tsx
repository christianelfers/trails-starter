// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PackageContextProvider } from "@open-pioneer/test-utils/react";
import { PointSketcherButton } from "./PointSketcherButton";

// Mock the services used by the component
const mockPointSketcherService = {
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
    getPoints: vi.fn(() => []),
    clearPoints: vi.fn(),
    onPointsChange: vi.fn(() => () => {})
};

// Mock MapRegistry (required by useMapModel)
const mockMapRegistry = {
    getMapModel: vi.fn(() => Promise.resolve(undefined)),
    expectMapModel: vi.fn(() => {
        throw new Error("Map not found");
    })
};

it("renders the button", async () => {
    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockPointSketcherService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <PointSketcherButton mapId="test-map" data-testid="point-sketcher-btn" />
        </PackageContextProvider>
    );

    const button = await screen.findByTestId("point-sketcher-btn");
    expect(button).toBeDefined();
});

it("renders with custom label", async () => {
    render(
        <PackageContextProvider
            services={{
                "point-sketcher.PointSketcherService": mockPointSketcherService,
                "map.MapRegistry": mockMapRegistry
            }}
        >
            <PointSketcherButton
                mapId="test-map"
                label="Custom Label"
                data-testid="point-sketcher-btn"
            />
        </PackageContextProvider>
    );

    const button = await screen.findByTestId("point-sketcher-btn");
    expect(button).toBeDefined();
});
