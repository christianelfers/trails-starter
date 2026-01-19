// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { transform } from "ol/proj";
import type { Feature } from "ol";
import type { Point } from "ol/geom";

/**
 * Escapes special XML characters in a string.
 */
export function escapeXml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/**
 * Generates a KML string from an array of point features.
 *
 * @param points - Array of OpenLayers Point features
 * @param mapProjection - The projection of the map coordinates (e.g., "EPSG:3857")
 * @returns KML string ready for download
 */
export function generateKML(points: Feature<Point>[], mapProjection: string): string {
    const placemarks = points
        .map((feature) => {
            const geometry = feature.getGeometry();
            if (!geometry) {
                return "";
            }

            const coords = geometry.getCoordinates();
            const wgs84 = transform(coords, mapProjection, "EPSG:4326");
            const label = (feature.get("label") as string) || "";

            return `
    <Placemark>
      <name>${escapeXml(label)}</name>
      <Point>
        <coordinates>${wgs84[0]},${wgs84[1]},0</coordinates>
      </Point>
    </Placemark>`;
        })
        .filter((placemark) => placemark !== "")
        .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Point Sketcher Export</name>${placemarks}
  </Document>
</kml>`;
}

/**
 * Triggers a file download in the browser.
 *
 * @param content - The file content as a string
 * @param filename - The name of the file to download
 * @param mimeType - The MIME type of the file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Downloads point features as a KML file.
 *
 * @param points - Array of OpenLayers Point features
 * @param mapProjection - The projection of the map coordinates (e.g., "EPSG:3857")
 * @param filename - The name of the file to download (default: "points.kml")
 */
export function downloadKML(
    points: Feature<Point>[],
    mapProjection: string,
    filename: string = "points.kml"
): void {
    const kml = generateKML(points, mapProjection);
    downloadFile(kml, filename, "application/vnd.google-earth.kml+xml");
}
