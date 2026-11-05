// Choices shared by the "make a rule" and "change a rule" screens.
import type { Strength } from "@/lib/guardian";

export const STRENGTHS: Strength[] = ["gentle", "firm", "locked"];
export const TITLE: Record<Strength, string> = { gentle: "Gentle", firm: "Firm", locked: "Locked" };
export const WAITS = [{ h: 12, t: "12 hours" }, { h: 24, t: "1 day" }, { h: 48, t: "2 days" }, { h: 72, t: "3 days" }, { h: 168, t: "1 week" }];
