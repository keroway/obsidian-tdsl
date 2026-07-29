import { describe, expect, it } from "vitest";
import {
	findTemplate,
	renderTemplateSnippet,
	TIMELINE_TEMPLATES,
} from "./templates";

describe("TIMELINE_TEMPLATES", () => {
	it("offers several templates with unique ids", () => {
		expect(TIMELINE_TEMPLATES.length).toBeGreaterThanOrEqual(3);
		const ids = TIMELINE_TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("gives every template a name and a description for the picker", () => {
		for (const t of TIMELINE_TEMPLATES) {
			expect(t.name.length).toBeGreaterThan(0);
			expect(t.description.length).toBeGreaterThan(0);
		}
	});

	// The bodies are inserted verbatim into user notes, so a broken one only
	// surfaces as a render error after the fact. These pin the DSL invariants
	// documented in CLAUDE.md that are cheap to check statically.
	it("declares a timeline block with unit and range in every body", () => {
		for (const t of TIMELINE_TEMPLATES) {
			expect(t.body, t.id).toMatch(/timeline\s+"/);
			expect(t.body, t.id).toMatch(/unit\s+\w+;/);
			expect(t.body, t.id).toMatch(/range\s+\S+\.\.\S+;/);
		}
	});

	it("never uses the `start to end` range form", () => {
		for (const t of TIMELINE_TEMPLATES) {
			expect(t.body, t.id).not.toMatch(/\d\s+to\s+\d/);
		}
	});

	it("terminates every span / event / event_range with a trailing `;`", () => {
		for (const t of TIMELINE_TEMPLATES) {
			// Each such statement ends with its block; the `}` must be followed by `;`.
			const statements = t.body.match(
				/^\s*(?:span|event|event_range)\b[\s\S]*?\}(.?)/gm,
			);
			expect(statements, t.id).not.toBeNull();
			for (const s of statements ?? []) {
				// `trimEnd` needs lib ES2019; this file targets ES2018.
				expect(
					s.replace(/\s+$/, "").endsWith("};"),
					`${t.id}: ${s.trim()}`,
				).toBe(true);
			}
		}
	});

	it("does not put a trailing `;` on lane / group declarations", () => {
		for (const t of TIMELINE_TEMPLATES) {
			for (const line of t.body.split("\n")) {
				if (/^\s*(lane|group)\b/.test(line)) {
					expect(
						line.replace(/\s+$/, "").endsWith(";"),
						`${t.id}: ${line.trim()}`,
					).toBe(false);
				}
			}
		}
	});
});

describe("findTemplate", () => {
	it("finds a template by id", () => {
		const first = TIMELINE_TEMPLATES[0];
		expect(findTemplate(first.id)).toBe(first);
	});

	it("returns undefined for an unknown id", () => {
		expect(findTemplate("no-such-template")).toBeUndefined();
	});
});

describe("renderTemplateSnippet", () => {
	it("wraps the body in a tdsl fence", () => {
		const snippet = renderTemplateSnippet(TIMELINE_TEMPLATES[0]);
		expect(snippet.startsWith("```tdsl\n")).toBe(true);
		expect(snippet.endsWith("```\n")).toBe(true);
	});

	it("keeps the body verbatim between the fences", () => {
		const t = TIMELINE_TEMPLATES[0];
		const snippet = renderTemplateSnippet(t);
		expect(snippet).toContain(t.body.replace(/\s+$/, ""));
	});

	// Without this the closing fence would share a line with the DSL, which
	// stops Obsidian recognising the block at all.
	it("separates the closing fence from a body that lacks a trailing newline", () => {
		const snippet = renderTemplateSnippet({
			id: "x",
			name: "x",
			description: "x",
			body: 'timeline "T" { unit year; range 0..1; }',
		});
		expect(snippet).toBe(
			'```tdsl\ntimeline "T" { unit year; range 0..1; }\n```\n',
		);
	});

	it("does not double the newline when the body already ends with one", () => {
		const snippet = renderTemplateSnippet({
			id: "x",
			name: "x",
			description: "x",
			body: 'timeline "T" { unit year; range 0..1; }\n',
		});
		expect(snippet).not.toContain("\n\n```");
	});
});
