// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { FC, useCallback, useEffect, useState } from "react";
import { useIntl, useService } from "open-pioneer:react-hooks";
import { ToolButton } from "@open-pioneer/map-ui-components";
import { CommonComponentProps, useCommonComponentProps } from "@open-pioneer/react-utils";
import { LuTrash2 } from "react-icons/lu";
import type { PointSketcherService } from "./api";

export interface ClearPointsButtonProps extends CommonComponentProps {
    /**
     * Optional custom label for the button.
     * If not provided, uses i18n message "clearPoints.buttonLabel".
     */
    label?: string;

    /**
     * Show confirmation dialog before clearing?
     * @default false
     */
    confirmBeforeClear?: boolean;
}

export const ClearPointsButton: FC<ClearPointsButtonProps> = (props) => {
    const { label, confirmBeforeClear = false } = props;
    const { containerProps } = useCommonComponentProps("clear-points-button", props);

    const intl = useIntl();
    const pointSketcherService = useService<PointSketcherService>(
        "point-sketcher.PointSketcherService"
    );

    const [hasPoints, setHasPoints] = useState(false);

    useEffect(() => {
        setHasPoints(pointSketcherService.getPoints().length > 0);
        const unsubscribe = pointSketcherService.onPointsChange((points) => {
            setHasPoints(points.length > 0);
        });
        return unsubscribe;
    }, [pointSketcherService]);

    const buttonLabel = label ?? intl.formatMessage({ id: "clearPoints.buttonLabel" });

    const handleClick = useCallback(() => {
        if (confirmBeforeClear) {
            const count = pointSketcherService.getPoints().length;
            const message = intl.formatMessage({ id: "clearPoints.confirmMessage" }, { count });
            if (window.confirm(message)) {
                pointSketcherService.clearPoints();
            }
        } else {
            pointSketcherService.clearPoints();
        }
    }, [pointSketcherService, confirmBeforeClear, intl]);

    return (
        <ToolButton
            {...containerProps}
            label={buttonLabel}
            icon={<LuTrash2 />}
            onClick={handleClick}
            disabled={!hasPoints}
        />
    );
};
