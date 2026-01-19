// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { Box } from "@chakra-ui/react";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIntl, useService } from "open-pioneer:react-hooks";
import { useMapModel } from "@open-pioneer/map";
import { ToolButton } from "@open-pioneer/map-ui-components";
import { CommonComponentProps, useCommonComponentProps } from "@open-pioneer/react-utils";
import { LuMapPin } from "react-icons/lu";
import type { Feature } from "ol";
import type { Point } from "ol/geom";
import type { Coordinate } from "ol/coordinate";
import type { PointSketcherService } from "./api";
import { LabelEditPopup } from "./LabelEditPopup";

export interface PointSketcherProps extends CommonComponentProps {
    /**
     * The map ID to use for the point sketcher.
     */
    mapId: string;

    /**
     * Optional label for the button. Defaults to "Draw Points".
     */
    buttonLabel?: string;
}

export const PointSketcher: FC<PointSketcherProps> = (props) => {
    const { mapId, buttonLabel } = props;
    const { containerProps } = useCommonComponentProps("point-sketcher", props);
    const intl = useIntl();
    const defaultButtonLabel = intl.formatMessage({ id: "pointSketcher.buttonLabel" });
    const label = buttonLabel ?? defaultButtonLabel;

    const pointSketcherService = useService<PointSketcherService>(
        "point-sketcher.PointSketcherService"
    );
    const { map } = useMapModel(mapId);

    const [isActive, setIsActive] = useState(false);
    const [selectedFeature, setSelectedFeature] = useState<Feature<Point> | null>(null);
    const [popupPosition, setPopupPosition] = useState<Coordinate | null>(null);

    const mapContainerRef = useRef<HTMLElement | null>(null);
    const selectedFeatureRef = useRef<Feature<Point> | null>(null);

    // Keep ref in sync with state
    useEffect(() => {
        selectedFeatureRef.current = selectedFeature;
    }, [selectedFeature]);

    // Sync state with service
    useEffect(() => {
        setIsActive(pointSketcherService.isActive());
    }, [pointSketcherService]);

    // Setup right-click handler when active
    useEffect(() => {
        if (!map || !isActive) {
            setSelectedFeature(null);
            setPopupPosition(null);
            return;
        }

        const olMap = map.olMap;
        const mapContainer = olMap.getTargetElement() as HTMLElement;
        mapContainerRef.current = mapContainer;

        // Handle right-click (contextmenu) to select existing points
        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();

            // Get pixel position relative to map container
            const rect = mapContainer.getBoundingClientRect();
            const pixel: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];

            // Find feature at click position
            const features = olMap.getFeaturesAtPixel(pixel, {
                layerFilter: (layer) => layer.get("point-sketcher-layer") === true
            });

            const clickedFeature = features?.[0] as Feature<Point> | undefined;

            if (clickedFeature) {
                // Get the feature ID and find the actual feature from the service's source
                const featureId = clickedFeature.getId() as string;

                if (featureId) {
                    // Get the actual feature from the VectorSource
                    const sourceFeature = pointSketcherService
                        .getSource()
                        .getFeatureById(featureId) as Feature<Point> | null;

                    if (sourceFeature) {
                        setSelectedFeature(sourceFeature);
                        setPopupPosition(pixel);
                    } else {
                        // Fallback: use the clicked feature directly
                        setSelectedFeature(clickedFeature);
                        setPopupPosition(pixel);
                    }
                } else {
                    setSelectedFeature(clickedFeature);
                    setPopupPosition(pixel);
                }
            } else {
                setSelectedFeature(null);
                setPopupPosition(null);
            }
        };

        mapContainer.addEventListener("contextmenu", handleContextMenu);

        // Update popup position when map moves
        const handleMapMove = () => {
            if (selectedFeature) {
                const geometry = selectedFeature.getGeometry();
                if (geometry) {
                    const coords = geometry.getCoordinates();
                    const pixel = olMap.getPixelFromCoordinate(coords);
                    if (pixel) {
                        setPopupPosition(pixel);
                    }
                }
            }
        };

        olMap.on("postrender", handleMapMove);

        return () => {
            mapContainer.removeEventListener("contextmenu", handleContextMenu);
            olMap.un("postrender", handleMapMove);
        };
    }, [map, isActive, selectedFeature, pointSketcherService]);

    const handleButtonClick = useCallback(() => {
        if (!map) {
            return;
        }

        const olMap = map.olMap;
        if (pointSketcherService.isActive()) {
            pointSketcherService.deactivate();
            setIsActive(false);
            setSelectedFeature(null);
            setPopupPosition(null);
        } else {
            pointSketcherService.activate(olMap);
            setIsActive(true);
        }
    }, [map, pointSketcherService]);

    const handleSaveLabel = useCallback(
        (label: string) => {
            if (selectedFeature) {
                const featureId = selectedFeature.getId() as string;
                if (featureId) {
                    pointSketcherService.setPointLabel(featureId, label);
                }
            }
            setSelectedFeature(null);
            setPopupPosition(null);
        },
        [selectedFeature, pointSketcherService]
    );

    const handleCancelEdit = useCallback(() => {
        setSelectedFeature(null);
        setPopupPosition(null);
    }, []);

    const handleDeletePoint = useCallback(() => {
        const feature = selectedFeatureRef.current;
        if (feature) {
            const featureId = feature.getId() as string;
            if (featureId) {
                pointSketcherService.removePoint(featureId);
            }
        }
        setSelectedFeature(null);
        setPopupPosition(null);
    }, [pointSketcherService]);

    return (
        <Box {...containerProps}>
            <ToolButton
                label={label}
                icon={<LuMapPin />}
                active={isActive}
                onClick={handleButtonClick}
                disabled={!map}
            />
            {isActive &&
                selectedFeature &&
                popupPosition &&
                mapContainerRef.current &&
                createPortal(
                    <LabelEditPopup
                        feature={selectedFeature}
                        position={popupPosition}
                        onSave={handleSaveLabel}
                        onCancel={handleCancelEdit}
                        onDelete={handleDeletePoint}
                    />,
                    mapContainerRef.current
                )}
        </Box>
    );
};
