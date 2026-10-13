import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import DailyTimetable from "./DailyTimetable";

describe("DailyTimetable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the weekly selector, daily summary, and starter routine", () => {
    render(<DailyTimetable />);
    expect(screen.getByRole("navigation", { name: "Choose a day" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your timeline" })).toBeTruthy();
    expect(screen.getAllByText("Morning routine & breakfast").length).toBeGreaterThan(0);
    expect(screen.getAllByText("College / classes").length).toBeGreaterThan(0);
  });

  it("adds a block and persists the updated plan", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    await user.click(screen.getByRole("button", { name: /add a block/i }));
    await user.type(screen.getByPlaceholderText("e.g. Java problem-solving"), "Java practice");
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "18:15" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "19:00" } });
    await user.selectOptions(screen.getByLabelText("Repeats"), "weekdays");
    await user.click(screen.getByRole("button", { name: /add to my day/i }));
    expect(screen.getByText("Java practice")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem("studyvault-daily-timetable-v1") ?? "[]");
    expect(saved.some((block: { title: string }) => block.title === "Java practice")).toBe(true);
  });

  it("rejects overlapping repeat schedules", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    await user.click(screen.getByRole("button", { name: /add a block/i }));
    await user.type(screen.getByPlaceholderText("e.g. Java problem-solving"), "Overlap test");
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "07:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "08:30" } });
    await user.selectOptions(screen.getByLabelText("Repeats"), "weekdays");
    await user.click(screen.getByRole("button", { name: /add to my day/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/overlaps another block/i);
    expect(screen.queryByText("Overlap test")).toBeNull();
  });

  it("records completion and keeps it when restoring the starter routine", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    const event = screen.getAllByText("Morning routine & breakfast")
      .map((element) => element.closest("article"))
      .find((candidate) => candidate !== null);
    expect(event).not.toBeNull();
    await user.click(within(event as HTMLElement).getByRole("button", { name: "Mark complete" }));
    const savedBeforeReset = JSON.parse(localStorage.getItem("studyvault-timetable-completions-v1") ?? "{}");
    expect(Object.values(savedBeforeReset).flat()).toContain("starter-morning");
    await user.click(screen.getByRole("button", { name: /reset plan/i }));
    const savedAfterReset = JSON.parse(localStorage.getItem("studyvault-timetable-completions-v1") ?? "{}");
    expect(Object.values(savedAfterReset).flat()).toContain("starter-morning");
  });

  it("does not accept an end time before or equal to the start time", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    await user.click(screen.getByRole("button", { name: /add a block/i }));
    await user.type(screen.getByPlaceholderText("e.g. Java problem-solving"), "Invalid time");
    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("Ends"), { target: { value: "18:00" } });
    await user.click(screen.getByRole("button", { name: /add to my day/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/end time must be after start time/i);
  });
});
