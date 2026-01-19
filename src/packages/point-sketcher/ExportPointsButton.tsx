// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { FC, useCallback, useEffect, useState } from "react";
import { useIntl, useService } from "open-pioneer:react-hooks";
import { useMapModel } from "@open-pioneer/map";
import { ToolButton } from "@open-pioneer/map-ui-components";
import { CommonComponentProps, useCommonComponentProps } from "@open-pioneer/react-utils";
import { LuDownload } from "react-icons/lu";
import type { PointSketcherService } from "./api";
import { downloadKML } from "./exportUtils";

export interface ExportPointsButtonProps extends CommonComponentProps {
    /**
     * The map ID to use for getting the map projection.
     */
    mapId: string;

    /**
     * Optional filename for the exported KML file.
     * Defaults to "points.kml".
     */
    filename?: string;

    /**
     * Optional label for the button.
     * Defaults to i18n "export.buttonLabel".
     */
    label?: string;
}

export const ExportPointsButton: FC<ExportPointsButtonProps> = (props) => {
    const { mapId, filename = "points.kml", label } = props;
    const { containerProps } = useCommonComponentProps("export-points-button", props);
    const intl = useIntl();
    const defaultLabel = intl.formatMessage({ id: "export.buttonLabel" });
    const buttonLabel = label ?? defaultLabel;

    const pointSketcherService = useService<PointSketcherService>(
        "point-sketcher.PointSketcherService"
    );
    const { map } = useMapModel(mapId);

    const [pointCount, setPointCount] = useState(() => pointSketcherService.getPoints().length);

    // Subscribe to point changes to update button state
    useEffect(() => {
        // Initialize with current count
        setPointCount(pointSketcherService.getPoints().length);

        // Subscribe to changes
        return pointSketcherService.onPointsChange((points) => {
            setPointCount(points.length);
        });
    }, [pointSketcherService]);

    const handleExport = useCallback(() => {
        if (!map) {
            return;
        }

        const olMap = map.olMap;
        const projection = olMap.getView().getProjection().getCode();
        const points = pointSketcherService.getPoints();

        downloadKML(points, projection, filename);
    }, [map, pointSketcherService, filename]);

    return (
        <ToolButton
            {...containerProps}
            label={buttonLabel}
            icon={<LuDownload />}
            onClick={handleExport}
            disabled={!map || pointCount === 0}
        />
    );
};
