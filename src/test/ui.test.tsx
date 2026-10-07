import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddResourceModal } from "../components/AddResourceModal";
import Resources from "../Resources";
import Notes from "../Notes";
import App from "../App";
import { GlobalSearch } from "../components/GlobalSearch";
import { saveSubjects } from "../services/storage";
import { getAllNotes } from "../services/noteStorage";
import type { Resource } from "../types/resource";
import type { Subject } from "../Subjects";

const subjects: Subject[] = [{
    id: 1,
    name: "Operating Systems",
    description: "Processes",
    color: "blue",
}];

const legacyResource: Resource = {
    id: "legacy-resource",
    title: "Legacy note",
    description: "Old note",
    type: "Note",
    subjectId: 1,
    createdAt: "2026-10-04T00:00:00.000Z",
    content: "Legacy content",
};

afterEach(() => {
    vi.restoreAllMocks();
});

beforeEach(async () => {
    await saveSubjects(subjects);
});

describe("resource workflows", () => {
    it("validates and successfully creates a text note through the modal", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(<AddResourceModal subjects={subjects} onClose={vi.fn()} onSave={onSave} />);

        await user.click(screen.getByRole("button", { name: "Save resource" }));
        expect(onSave).not.toHaveBeenCalled();

        await user.type(screen.getByLabelText("Resource title"), "Study note");
        await user.selectOptions(screen.getByLabelText("Resource type"), "Note");
        await user.type(screen.getByLabelText("Note content"), "Important content");
        await user.click(screen.getByRole("button", { name: "Save resource" }));

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
            title: "Study note",
            type: "Note",
            content: "Important content",
        }));
    });

    it("keeps the modal open and allows retry after a save failure", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn()
            .mockRejectedValueOnce(new Error("Storage unavailable"))
            .mockResolvedValueOnce(undefined);
        render(<AddResourceModal subjects={subjects} onClose={vi.fn()} onSave={onSave} />);

        await user.type(screen.getByLabelText("Resource title"), "Retry note");
        await user.selectOptions(screen.getByLabelText("Resource type"), "Note");
        await user.type(screen.getByLabelText("Note content"), "Retry content");
        await user.click(screen.getByRole("button", { name: "Save resource" }));

        expect((await screen.findByRole("alert")).textContent).toContain("Storage unavailable");
        expect((screen.getByLabelText("Resource title") as HTMLInputElement).value).toBe("Retry note");

        await user.click(screen.getByRole("button", { name: "Save resource" }));
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    });

    it("prevents duplicate submissions while a save is pending", async () => {
        const user = userEvent.setup();
        let resolveSave: (() => void) | undefined;
        const onSave = vi.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
        render(<AddResourceModal subjects={subjects} onClose={vi.fn()} onSave={onSave} />);

        await user.type(screen.getByLabelText("Resource title"), "Pending note");
        await user.selectOptions(screen.getByLabelText("Resource type"), "Note");
        await user.type(screen.getByLabelText("Note content"), "Pending content");
        const saveButton = screen.getByRole("button", { name: "Save resource" });
        await user.click(saveButton);
        await user.click(saveButton);

        expect(onSave).toHaveBeenCalledTimes(1);
        expect((saveButton as HTMLButtonElement).disabled).toBe(true);
        resolveSave?.();
    });

    it("keeps a resource visible when deletion fails", async () => {
        const user = userEvent.setup();
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const onDelete = vi.fn().mockRejectedValue(new Error("Delete failed"));
        const resource: Resource = {
            ...legacyResource,
            id: "resource-to-keep",
            title: "Keep this resource",
            type: "Link",
            url: "https://example.com",
            content: undefined,
        };
        render(
            <Resources
                resources={[resource]}
                subjects={subjects}
                onAddResource={vi.fn()}
                onEditResource={vi.fn()}
                onDeleteResource={onDelete}
            />
        );

        await user.click(screen.getByRole("button", { name: "Delete Keep this resource" }));
        expect((await screen.findByRole("alert")).textContent).toContain("Delete failed");
        expect(screen.getByText("Keep this resource")).toBeTruthy();
    });
});

describe("Notes and application regression", () => {
    it("renders ranked search results, filters them, and opens the selected result", async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        const resource: Resource = {
            id: "search-resource",
            title: "Memory Management Guide",
            description: "A guide to paging",
            type: "PDF",
            subjectId: 1,
            createdAt: "2026-10-04T00:00:00.000Z",
        };
        render(
            <GlobalSearch
                isOpen
                query="memory"
                resources={[resource]}
                subjects={subjects}
                onQueryChange={vi.fn()}
                onClose={vi.fn()}
                onSelect={onSelect}
            />
        );

        expect(await screen.findByRole("option")).toBeTruthy();
        await user.click(screen.getByRole("tab", { name: "Resources" }));
        await user.click(screen.getByRole("option"));
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: resource.id, type: "Resource" }));
    });

    it("supports keyboard selection and Escape close", async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        const onClose = vi.fn();
        render(
            <GlobalSearch
                isOpen
                query="memory"
                resources={[{
                    id: "keyboard-resource",
                    title: "Memory Management Guide",
                    description: "Paging",
                    type: "PDF",
                    subjectId: 1,
                    createdAt: "2026-10-04T00:00:00.000Z",
                }]}
                subjects={subjects}
                onQueryChange={vi.fn()}
                onClose={onClose}
                onSelect={onSelect}
            />
        );

        await screen.findByRole("option");
        const input = await screen.findByRole("textbox", { name: "Search your knowledge" });
        await user.click(input);
        await user.keyboard("{ArrowDown}{Enter}");
        expect(onSelect).toHaveBeenCalledTimes(1);
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
    });

    it("renders Notes navigation and creates, pins, and filters a note", async () => {
        const user = userEvent.setup();
        render(<Notes resources={[]} subjects={subjects} />);
        await waitFor(() => expect(screen.getByText("0 notes")).toBeTruthy());

        await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
        expect(await screen.findByDisplayValue("Untitled note")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Pin note" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Unpin note" })).toBeTruthy());
        await user.click(screen.getByRole("button", { name: /Pinned/ }));
        expect(screen.getByRole("button", { name: /Pinned/ })).toBeTruthy();
        expect(screen.getByDisplayValue("Untitled note")).toBeTruthy();
        await waitFor(() => expect(screen.getByText("Saved locally")).toBeTruthy());
    });

    it("creates a folder and filters the Notes workspace by it", async () => {
        const user = userEvent.setup();
        render(<Notes resources={[]} subjects={subjects} />);
        await waitFor(() => expect(screen.getByText("No folders yet")).toBeTruthy());

        await user.click(screen.getByRole("button", { name: "Create folder" }));
        await user.type(screen.getByRole("textbox", { name: "New folder name" }), "Research");
        await user.click(screen.getByRole("button", { name: "Save folder" }));

        expect(await screen.findByRole("button", { name: /Research/ })).toBeTruthy();
        expect(screen.getByText("0 notes")).toBeTruthy();
    });

    it("persists a pending edit after leaving the Notes page", async () => {
        const user = userEvent.setup();
        const { unmount } = render(<Notes resources={[]} subjects={subjects} />);
        await waitFor(() => expect(screen.getByText("0 notes")).toBeTruthy());
        await user.click(screen.getAllByRole("button", { name: "New note" })[0]);
        const title = await screen.findByDisplayValue("Untitled note");
        await user.clear(title);
        await user.type(title, "Persisted after navigation");
        unmount();

        await new Promise((resolve) => window.setTimeout(resolve, 850));
        expect((await getAllNotes()).some((note) => note.title === "Persisted after navigation")).toBe(true);
    });

    it("renders the existing application shell and Notes navigation", async () => {
        const user = userEvent.setup();
        render(<App />);
        expect(await screen.findByText("Good morning, Vikas.")).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Notes" }));
        expect(await screen.findByRole("heading", { name: "Notes" })).toBeTruthy();
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        expect(await screen.findByRole("dialog", { name: "Search your knowledge" })).toBeTruthy();
        await user.type(screen.getByRole("textbox", { name: "Search your knowledge" }), "Operating Systems");
        await user.click(await screen.findByRole("option"));
        expect(await screen.findByRole("heading", { name: "My Subjects" })).toBeTruthy();
    });

    it("exposes legacy notes as read-only until explicit conversion", async () => {
        const user = userEvent.setup();
        render(<Notes resources={[legacyResource]} subjects={subjects} />);
        expect(await screen.findByText("Legacy note · Read only")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Make editable" })).toBeTruthy();
        await user.click(screen.getByRole("button", { name: "Make editable" }));
        await waitFor(() => expect(screen.queryByText("Legacy note · Read only")).toBeNull());
    });
});
