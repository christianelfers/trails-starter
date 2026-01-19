// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, HStack, Input, VStack } from "@chakra-ui/react";
import { FC, useCallback, useEffect, useState } from "react";
import { useIntl } from "open-pioneer:react-hooks";
import type { Feature } from "ol";
import type { Point } from "ol/geom";
import type { Coordinate } from "ol/coordinate";

export interface LabelEditPopupProps {
    /**
     * The feature being edited, or null if no feature is selected.
     */
    feature: Feature<Point> | null;

    /**
     * The position where the popup should be displayed (in pixels).
     */
    position: Coordinate | null;

    /**
     * Called when the user saves the label.
     */
    onSave: (label: string) => void;

    /**
     * Called when the user cancels editing.
     */
    onCancel: () => void;

    /**
     * Called when the user deletes the point. Optional.
     */
    onDelete?: () => void;
}

export const LabelEditPopup: FC<LabelEditPopupProps> = (props) => {
    const { feature, position, onSave, onCancel, onDelete } = props;
    const [labelText, setLabelText] = useState("");
    const intl = useIntl();

    const placeholderText = intl.formatMessage({ id: "labelEdit.placeholder" });
    const saveText = intl.formatMessage({ id: "labelEdit.save" });
    const cancelText = intl.formatMessage({ id: "labelEdit.cancel" });
    const deleteText = intl.formatMessage({ id: "labelEdit.delete" });

    // Update label text when feature changes
    useEffect(() => {
        if (feature) {
            const currentLabel = (feature.get("label") as string) || "";
            setLabelText(currentLabel);
        } else {
            setLabelText("");
        }
    }, [feature]);

    const handleSave = useCallback(() => {
        onSave(labelText);
    }, [labelText, onSave]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                handleSave();
            } else if (e.key === "Escape") {
                onCancel();
            }
        },
        [handleSave, onCancel]
    );

    if (!feature || !position) {
        return null;
    }

    return (
        <Box
            position="absolute"
            left={`${position[0]}px`}
            top={`${position[1]}px`}
            transform="translate(-50%, -100%) translateY(-20px)"
            backgroundColor="white"
            borderWidth="1px"
            borderRadius="md"
            boxShadow="lg"
            padding={3}
            zIndex={1000}
            minWidth="200px"
        >
            <VStack gap={2} align="stretch">
                <Input
                    value={labelText}
                    onChange={(e) => setLabelText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholderText}
                    size="sm"
                />
                <HStack gap={2} justify="flex-end">
                    {onDelete && (
                        <Button size="sm" colorPalette="red" variant="ghost" onClick={onDelete}>
                            {deleteText}
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={onCancel}>
                        {cancelText}
                    </Button>
                    <Button size="sm" colorPalette="blue" onClick={handleSave}>
                        {saveText}
                    </Button>
                </HStack>
            </VStack>
        </Box>
    );
};
