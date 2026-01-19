// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from "vitest";
import { escapeXml, generateKML, downloadFile } from "./exportUtils";
import type { Feature } from "ol";
import type { Point } from "ol/geom";

// Mock ol/proj transform function
vi.mock("ol/proj", () => ({
    transform: vi.fn((coords: number[], _from: string, _to: string) => {
        // Simple mock: return coordinates as-is for testing
        // In reality, this would transform from EPSG:3857 to EPSG:4326
        return coords;
    })
}));

function createMockFeature(coords: [number, number], label?: string): Feature<Point> {
    return {
        getGeometry: () => ({
            getCoordinates: () => coords
        }),
        get: (key: string) => (key === "label" ? label : undefined),
        getId: () => "test-id"
    } as unknown as Feature<Point>;
}

describe("escapeXml", () => {
    it("escapes ampersand", () => {
        expect(escapeXml("A & B")).toBe("A &amp; B");
    });

    it("escapes less than", () => {
        expect(escapeXml("A < B")).toBe("A &lt; B");
    });

    it("escapes greater than", () => {
        expect(escapeXml("A > B")).toBe("A &gt; B");
    });

    it("escapes double quotes", () => {
        expect(escapeXml('A "B" C')).toBe("A &quot;B&quot; C");
    });

    it("escapes single quotes", () => {
        expect(escapeXml("A 'B' C")).toBe("A &apos;B&apos; C");
    });

    it("escapes multiple special characters", () => {
        expect(escapeXml('<test attr="value"> & more</test>')).toBe(
            "&lt;test attr=&quot;value&quot;&gt; &amp; more&lt;/test&gt;"
        );
    });

    it("returns empty string for empty input", () => {
        expect(escapeXml("")).toBe("");
    });

    it("returns unchanged string when no special characters", () => {
        expect(escapeXml("Normal text 123")).toBe("Normal text 123");
    });
});

describe("generateKML", () => {
    it("generates valid KML structure for empty array", () => {
        const kml = generateKML([], "EPSG:3857");

        expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
        expect(kml).toContain("<Document>");
        expect(kml).toContain("<name>Point Sketcher Export</name>");
        expect(kml).toContain("</Document>");
        expect(kml).toContain("</kml>");
        expect(kml).not.toContain("<Placemark>");
    });

    it("generates Placemark for single point without label", () => {
        const feature = createMockFeature([8.6821, 50.1109]);
        const kml = generateKML([feature], "EPSG:3857");

        expect(kml).toContain("<Placemark>");
        expect(kml).toContain("<name></name>");
        expect(kml).toContain("<coordinates>8.6821,50.1109,0</coordinates>");
        expect(kml).toContain("</Placemark>");
    });

    it("generates Placemark with label", () => {
        const feature = createMockFeature([8.6821, 50.1109], "Test Location");
        const kml = generateKML([feature], "EPSG:3857");

        expect(kml).toContain("<name>Test Location</name>");
    });

    it("escapes XML characters in labels", () => {
        const feature = createMockFeature([8.6821, 50.1109], 'Location <1> & "test"');
        const kml = generateKML([feature], "EPSG:3857");

        expect(kml).toContain("<name>Location &lt;1&gt; &amp; &quot;test&quot;</name>");
    });

    it("generates multiple Placemarks", () => {
        const features = [
            createMockFeature([8.0, 50.0], "Point A"),
            createMockFeature([9.0, 51.0], "Point B"),
            createMockFeature([10.0, 52.0], "Point C")
        ];
        const kml = generateKML(features, "EPSG:3857");

        expect(kml.match(/<Placemark>/g)?.length).toBe(3);
        expect(kml).toContain("<name>Point A</name>");
        expect(kml).toContain("<name>Point B</name>");
        expect(kml).toContain("<name>Point C</name>");
        expect(kml).toContain("<coordinates>8,50,0</coordinates>");
        expect(kml).toContain("<coordinates>9,51,0</coordinates>");
        expect(kml).toContain("<coordinates>10,52,0</coordinates>");
    });

    it("skips features without geometry", () => {
        const featureWithGeometry = createMockFeature([8.0, 50.0], "Valid");
        const featureWithoutGeometry = {
            getGeometry: () => null,
            get: () => "Invalid",
            getId: () => "test-id"
        } as unknown as Feature<Point>;

        const kml = generateKML([featureWithGeometry, featureWithoutGeometry], "EPSG:3857");

        expect(kml.match(/<Placemark>/g)?.length).toBe(1);
        expect(kml).toContain("<name>Valid</name>");
    });
});

describe("downloadFile", () => {
    it("creates blob and triggers download", () => {
        // Mock DOM methods
        const mockClick = vi.fn();
        const mockAppendChild = vi.fn();
        const mockRemoveChild = vi.fn();
        const mockCreateObjectURL = vi.fn().mockReturnValue("blob:test-url");
        const mockRevokeObjectURL = vi.fn();
        const mockCreateElement = vi.fn().mockReturnValue({
            href: "",
            download: "",
            click: mockClick
        });

        // Store original functions
        const originalCreateElement = document.createElement.bind(document);
        const originalAppendChild = document.body.appendChild.bind(document.body);
        const originalRemoveChild = document.body.removeChild.bind(document.body);

        // Mock global objects
        document.createElement = mockCreateElement;
        document.body.appendChild = mockAppendChild;
        document.body.removeChild = mockRemoveChild;
        globalThis.URL.createObjectURL = mockCreateObjectURL;
        globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

        downloadFile("test content", "test.txt", "text/plain");

        expect(mockCreateElement).toHaveBeenCalledWith("a");
        expect(mockCreateObjectURL).toHaveBeenCalled();
        expect(mockAppendChild).toHaveBeenCalled();
        expect(mockClick).toHaveBeenCalled();
        expect(mockRemoveChild).toHaveBeenCalled();
        expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test-url");

        // Restore original functions
        document.createElement = originalCreateElement;
        document.body.appendChild = originalAppendChild;
        document.body.removeChild = originalRemoveChild;
    });
});
