// SPDX-FileCopyrightText: 2023-2025 Open Pioneer project (https://github.com/open-pioneer)
// SPDX-License-Identifier: Apache-2.0
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PackageContextProvider } from "@open-pioneer/test-utils/react";
import { LabelEditPopup } from "./LabelEditPopup";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";

function createMockFeature(label?: string): Feature<Point> {
    const feature = new Feature({ geometry: new Point([0, 0]) });
    feature.setId("test-feature");
    if (label) {
        feature.set("label", label);
    }
    return feature;
}

it("renders nothing when feature is null", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    const { container } = render(
        <PackageContextProvider>
            <LabelEditPopup feature={null} position={null} onSave={onSave} onCancel={onCancel} />
        </PackageContextProvider>
    );

    expect(container.firstChild).toBeNull();
});

it("renders popup when feature and position are provided", async () => {
    const feature = createMockFeature();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
        <PackageContextProvider>
            <LabelEditPopup
                feature={feature}
                position={[100, 100]}
                onSave={onSave}
                onCancel={onCancel}
            />
        </PackageContextProvider>
    );

    // i18n keys are shown directly in tests without translation provider
    const saveButton = await screen.findByText("labelEdit.save");
    expect(saveButton).toBeDefined();
});

it("displays existing label in input field", async () => {
    const feature = createMockFeature("Existing Label");
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
        <PackageContextProvider>
            <LabelEditPopup
                feature={feature}
                position={[100, 100]}
                onSave={onSave}
                onCancel={onCancel}
            />
        </PackageContextProvider>
    );

    // i18n key is shown directly in tests
    const input = await screen.findByPlaceholderText("labelEdit.placeholder");
    expect((input as HTMLInputElement).value).toBe("Existing Label");
});

it("calls onSave with new label when Save button is clicked", async () => {
    const feature = createMockFeature();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
        <PackageContextProvider>
            <LabelEditPopup
                feature={feature}
                position={[100, 100]}
                onSave={onSave}
                onCancel={onCancel}
            />
        </PackageContextProvider>
    );

    // i18n keys are shown directly in tests without translation provider
    const input = await screen.findByPlaceholderText("labelEdit.placeholder");
    fireEvent.change(input, { target: { value: "New Label" } });

    const saveButton = await screen.findByText("labelEdit.save");
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith("New Label");
});

it("calls onCancel when Cancel button is clicked", async () => {
    const feature = createMockFeature();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
        <PackageContextProvider>
            <LabelEditPopup
                feature={feature}
                position={[100, 100]}
                onSave={onSave}
                onCancel={onCancel}
            />
        </PackageContextProvider>
    );

    // i18n key shown directly in tests
    const cancelButton = await screen.findByText("labelEdit.cancel");
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalled();
});

it("calls onDelete when Delete button is clicked", async () => {
    const feature = createMockFeature();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const onDelete = vi.fn();

    render(
        <PackageContextProvider>
            <LabelEditPopup
                feature={feature}
                position={[100, 100]}
                onSave={onSave}
                onCancel={onCancel}
                onDelete={onDelete}
            />
        </PackageContextProvider>
    );

    // i18n key shown directly in tests
    const deleteButton = await screen.findByText("labelEdit.delete");
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalled();
});

it("does not render Delete button when onDelete is not provided", async () => {
    const feature = createMockFeature();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(
        <PackageContextProvider>
            <LabelEditPopup
                feature={feature}
                position={[100, 100]}
                onSave={onSave}
                onCancel={onCancel}
            />
        </PackageContextProvider>
    );

    // Wait for render (i18n key shown directly in tests)
    await screen.findByText("labelEdit.save");

    const deleteButton = screen.queryByText("labelEdit.delete");
    expect(deleteButton).toBeNull();
});
