// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { Box, Flex } from "@chakra-ui/react";
import { CoordinateViewer } from "@open-pioneer/coordinate-viewer";
import { Geolocation } from "@open-pioneer/geolocation";
import { DefaultMapProvider, MapAnchor, MapContainer, useMapModel } from "@open-pioneer/map";
import { InitialExtent, ZoomIn, ZoomOut } from "@open-pioneer/map-navigation";
import { ToolButton } from "@open-pioneer/map-ui-components";
import { Measurement } from "@open-pioneer/measurement";
import { Notifier } from "@open-pioneer/notifier";
import { SectionHeading, TitledSection } from "@open-pioneer/react-utils";
import { ScaleViewer } from "@open-pioneer/scale-viewer";
import { useIntl } from "open-pioneer:react-hooks";
import { PointSketcher, ClearPointsButton, ExportPointsButton } from "point-sketcher";
import { useId, useState } from "react";
import { LuRuler } from "react-icons/lu";
import { MAP_ID } from "./services";

export function MapApp() {
    const intl = useIntl();
    const measurementTitleId = useId();
    const { map } = useMapModel(MAP_ID);

    const [measurementIsActive, setMeasurementIsActive] = useState<boolean>(false);
    function toggleMeasurement() {
        setMeasurementIsActive(!measurementIsActive);
    }

    return (
        <Flex height="100%" direction="column" overflow="hidden">
            <Notifier />
            <TitledSection
                title={
                    <Box
                        role="region"
                        aria-label={intl.formatMessage({ id: "ariaLabel.header" })}
                        bg="conterraBlue.500"
                        color="white"
                        py={3}
                        px={4}
                        boxShadow="md"
                    >
                        <Flex
                            alignItems="center"
                            justifyContent="space-between"
                            maxW="1400px"
                            mx="auto"
                        >
                            <SectionHeading size="lg" color="white">
                                {intl.formatMessage({ id: "appTitle" })}
                            </SectionHeading>
                        </Flex>
                    </Box>
                }
            >
                {map && (
                    <DefaultMapProvider map={map}>
                        <Flex flex="1" direction="column" position="relative">
                            <MapContainer aria-label={intl.formatMessage({ id: "ariaLabel.map" })}>
                                <MapAnchor position="top-left" horizontalGap={5} verticalGap={5}>
                                    {measurementIsActive && (
                                        <Box
                                            backgroundColor="white"
                                            borderWidth="1px"
                                            borderRadius="lg"
                                            padding={2}
                                            boxShadow="lg"
                                            aria-label={intl.formatMessage({
                                                id: "ariaLabel.topLeft"
                                            })}
                                        >
                                            <Box role="dialog" aria-labelledby={measurementTitleId}>
                                                <TitledSection
                                                    title={
                                                        <SectionHeading
                                                            id={measurementTitleId}
                                                            size="md"
                                                            mb={2}
                                                        >
                                                            {intl.formatMessage({
                                                                id: "measurementTitle"
                                                            })}
                                                        </SectionHeading>
                                                    }
                                                >
                                                    <Measurement />
                                                </TitledSection>
                                            </Box>
                                        </Box>
                                    )}
                                </MapAnchor>
                                <MapAnchor
                                    position="bottom-right"
                                    horizontalGap={10}
                                    verticalGap={30}
                                >
                                    <Flex
                                        aria-label={intl.formatMessage({
                                            id: "ariaLabel.bottomRight"
                                        })}
                                        direction="column"
                                        gap={1}
                                        padding={1}
                                        backgroundColor="white"
                                        borderRadius="lg"
                                        boxShadow="md"
                                    >
                                        <ToolButton
                                            label={intl.formatMessage({ id: "measurementTitle" })}
                                            icon={<LuRuler />}
                                            active={measurementIsActive}
                                            onClick={toggleMeasurement}
                                        />
                                        <PointSketcher mapId={MAP_ID} />
                                        <ClearPointsButton confirmBeforeClear />
                                        <ExportPointsButton mapId={MAP_ID} />
                                        <Geolocation />
                                        <InitialExtent />
                                        <ZoomIn />
                                        <ZoomOut />
                                    </Flex>
                                </MapAnchor>
                            </MapContainer>
                        </Flex>
                        <Flex
                            role="region"
                            aria-label={intl.formatMessage({ id: "ariaLabel.footer" })}
                            bg="conterraBlue.500"
                            color="white"
                            gap={3}
                            py={2}
                            px={4}
                            alignItems="center"
                            justifyContent="space-between"
                        >
                            <Box backgroundColor="white" borderRadius="md" px={2} py={1}>
                                <img
                                    src="https://www.conterra.de/themes/conterra/logo.svg"
                                    alt="con terra Logo"
                                    style={{ width: "200px", height: "auto" }}
                                />
                            </Box>
                            <Flex gap={3} alignItems="center">
                                <CoordinateViewer precision={2} />
                                <ScaleViewer />
                            </Flex>
                        </Flex>
                    </DefaultMapProvider>
                )}
            </TitledSection>
        </Flex>
    );
}
