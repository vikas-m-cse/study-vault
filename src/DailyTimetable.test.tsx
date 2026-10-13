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
    expect(screen.getByRole("navigation", { name: "Choose a day" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your timeline" })).toBeInTheDocument();
    expect(screen.getByText("Morning routine & breakfast")).toBeInTheDocument();
    expect(screen.getByText("College / classes")).toBeInTheDocument();
  });

  it("adds a block and persists the updated plan", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    await user.click(screen.getByRole("button", { name: /add a block/i }));
    await user.type(screen.getByPlaceholderText("e.g. Java problem-solving"), "Java practice");
    await user.clear(screen.getByLabelText("Starts"));
    await user.type(screen.getByLabelText("Starts"), "18:15");
    await user.clear(screen.getByLabelText("Ends"));
    await user.type(screen.getByLabelText("Ends"), "19:00");
    await user.selectOptions(screen.getByLabelText("Repeats"), "weekdays");
    await user.click(screen.getByRole("button", { name: /add to my day/i }));
    expect(screen.getByText("Java practice")).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("studyvault-daily-timetable-v1") ?? "[]");
    expect(saved.some((block: { title: string }) => block.title === "Java practice")).toBe(true);
  });

  it("rejects overlapping repeat schedules", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    await user.click(screen.getByRole("button", { name: /add a block/i }));
    await user.type(screen.getByPlaceholderText("e.g. Java problem-solving"), "Overlap test");
    await user.clear(screen.getByLabelText("Starts"));
    await user.type(screen.getByLabelText("Starts"), "07:00");
    await user.clear(screen.getByLabelText("Ends"));
    await user.type(screen.getByLabelText("Ends"), "08:30");
    await user.selectOptions(screen.getByLabelText("Repeats"), "weekdays");
    await user.click(screen.getByRole("button", { name: /add to my day/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/overlaps another block/i);
    expect(screen.queryByText("Overlap test")).not.toBeInTheDocument();
  });

  it("records completion and keeps it when restoring the starter routine", async () => {
    const user = userEvent.setup();
    render(<DailyTimetable />);
    const event = screen.getByText("Morning routine & breakfast").closest("article");
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
    await user.clear(screen.getByLabelText("Starts"));
    await user.type(screen.getByLabelText("Starts"), "18:00");
    await user.clear(screen.getByLabelText("Ends"));
    await user.type(screen.getByLabelText("Ends"), "18:00");
    await user.click(screen.getByRole("button", { name: /add to my day/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/end time must be after start time/i);
  });
});
