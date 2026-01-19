// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { createCustomElement } from "@open-pioneer/runtime";
import * as appMetadata from "open-pioneer:app";
import { MapApp } from "./MapApp";
import { config } from "./theme/config";

const element = createCustomElement({
    component: MapApp,
    chakraSystemConfig: config,
    appMetadata
});

customElements.define("point-marker-app", element);
