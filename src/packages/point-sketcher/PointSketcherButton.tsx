// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { FC, useCallback, useEffect, useState } from "react";
import { useIntl, useService } from "open-pioneer:react-hooks";
import { useMapModel } from "@open-pioneer/map";
import { ToolButton } from "@open-pioneer/map-ui-components";
import { CommonComponentProps, useCommonComponentProps } from "@open-pioneer/react-utils";
import { LuMapPin } from "react-icons/lu";
import type { PointSketcherService } from "./api";

export interface PointSketcherButtonProps extends CommonComponentProps {
    /**
     * The map ID to use for the point sketcher.
     */
    mapId: string;

    /**
     * Optional label for the button. Defaults to "Draw Points".
     */
    label?: string;
}

export const PointSketcherButton: FC<PointSketcherButtonProps> = (props) => {
    const { mapId, label } = props;
    const { containerProps } = useCommonComponentProps("point-sketcher-button", props);
    const intl = useIntl();
    const defaultLabel = intl.formatMessage({ id: "pointSketcher.buttonLabel" });
    const buttonLabel = label ?? defaultLabel;

    const pointSketcherService = useService<PointSketcherService>(
        "point-sketcher.PointSketcherService"
    );
    const { map } = useMapModel(mapId);

    const [isActive, setIsActive] = useState(false);

    // Sync state with service
    useEffect(() => {
        setIsActive(pointSketcherService.isActive());
    }, [pointSketcherService]);

    const handleClick = useCallback(() => {
        if (!map) {
            return;
        }

        const olMap = map.olMap;
        if (pointSketcherService.isActive()) {
            pointSketcherService.deactivate();
            setIsActive(false);
        } else {
            pointSketcherService.activate(olMap);
            setIsActive(true);
        }
    }, [map, pointSketcherService]);

    return (
        <ToolButton
            {...containerProps}
            label={buttonLabel}
            icon={<LuMapPin />}
            active={isActive}
            onClick={handleClick}
            disabled={!map}
        />
    );
};
