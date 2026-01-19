// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { defineConfig, mergeConfigs } from "@chakra-ui/react";
import { config as defaultTrailsConfig } from "@open-pioneer/base-theme";

export const config = mergeConfigs(
    defaultTrailsConfig,
    defineConfig({
        globalCss: {
            html: {
                colorPalette: "conterra"
            }
        },
        theme: {
            tokens: {
                colors: {
                    // conterra Grün (aus Logo)
                    conterra: {
                        50: { value: "#f0faf0" },
                        100: { value: "#dcf5dc" },
                        200: { value: "#b8e8b5" },
                        300: { value: "#8dd888" },
                        400: { value: "#6CC24A" },
                        500: { value: "#5aad3d" },
                        600: { value: "#4a9132" },
                        700: { value: "#3d7529" },
                        800: { value: "#335f23" },
                        900: { value: "#2a4f1e" },
                        950: { value: "#1a3012" }
                    },
                    // conterra Blau (aus Logo)
                    conterraBlue: {
                        50: { value: "#e6f0f7" },
                        100: { value: "#cce1ef" },
                        200: { value: "#99c3df" },
                        300: { value: "#66a5cf" },
                        400: { value: "#3387bf" },
                        500: { value: "#005587" },
                        600: { value: "#00466d" },
                        700: { value: "#003753" },
                        800: { value: "#00283a" },
                        900: { value: "#001920" },
                        950: { value: "#000d10" }
                    }
                }
            },
            semanticTokens: {
                colors: {
                    "conterra.solid": { value: "{colors.conterra.400}" },
                    "conterra.contrast": { value: "white" },
                    "conterra.fg": { value: "{colors.conterra.700}" },
                    "conterraBlue.solid": { value: "{colors.conterraBlue.500}" },
                    "conterraBlue.contrast": { value: "white" },
                    "conterraBlue.fg": { value: "{colors.conterraBlue.700}" }
                }
            }
        }
    })
);
