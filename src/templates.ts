/**
 * Starter `.tdsl` snippets offered by the "Insert timeline template" command.
 *
 * Kept free of Obsidian and WASM imports so the template bodies and the text
 * that actually gets inserted stay unit-testable — the SuggestModal that picks
 * one lives in main.ts.
 *
 * Every body must satisfy the DSL invariants documented in CLAUDE.md:
 * properties inside `timeline { … }` end with `;`, ranges are `start..end`,
 * `span` / `event` / `event_range` take a trailing `;` after their block, and
 * `lane` / `group` declarations take none.
 */
export interface TimelineTemplate {
	/** Stable key used in tests; not shown to the user. */
	id: string;
	/** Primary line in the picker. */
	name: string;
	/** Secondary line in the picker. */
	description: string;
	/** DSL source, without the surrounding code fence. */
	body: string;
}

export const TIMELINE_TEMPLATES: readonly TimelineTemplate[] = [
	{
		id: "history",
		name: "Historical eras",
		description: "Dynasties or periods on parallel lanes, with point events",
		body: `timeline "Japanese History" {
    title "Nara to Edo";
    unit year;
    range 710..1868;
    color_map {
        imperial: "#8b5cf6";
        military: "#ef4444";
    }
}

lane "Imperial court" as court { kind dynasty; order 10; }
lane "Military rule" as bakufu { kind dynasty; order 20; }

span court 710..794 "Nara period" { tags ["imperial"]; };
span court 794..1185 "Heian period" { tags ["imperial"]; };
span bakufu 1603..1868 "Edo period" {
    tags ["military"];
    note "Sakoku era";
};

event bakufu 1600 "Battle of Sekigahara" {};
`,
	},
	{
		id: "project",
		name: "Project plan",
		description: "Phases as spans plus milestones, with an open-ended `now`",
		body: `//! grid: year
//! events: on
timeline "Project plan" {
    title "Roadmap";
    unit year;
    range 2024..2028;
    color_map {
        build: "#3366cc";
        ship: "#16a34a";
    }
}

lane "Development" as dev { kind custom; order 10; }
lane "Release" as rel { kind custom; order 20; }

span dev 2024..2026 "Prototype" { tags ["build"]; };
span dev 2026..now "Current phase" { tags ["build"]; };

event rel 2025 "Alpha" { tags ["ship"]; };
event rel 2027 "1.0 release" { tags ["ship"]; };
`,
	},
	{
		id: "biography",
		name: "Life of a person",
		description: "One lane per person, with life span and key moments",
		body: `timeline "A life" {
    title "Biography";
    unit year;
    range 1850..1935;
}

lane "Person" as p { kind person; order 10; }

span p 1856..1915 "Lifetime" {
    color "#4682B4";
};

event p 1879 "Graduated" {};
event p 1890 "Moved abroad" {
    note "Reason worth remembering";
};
event_range p 1901..1908 "Major work" {};
`,
	},
	{
		id: "reading",
		name: "Reading log",
		description: "Books read over time, grouped by genre",
		body: `//! table: on
timeline "Reading log" {
    title "Books";
    unit month;
    range 2026-01..2026-12;
    color_map {
        fiction: "#8b5cf6";
        nonfiction: "#0ea5e9";
    }
}

group "By genre" {
    lane "Fiction" as fic { kind custom; order 10; }
    lane "Non-fiction" as non { kind custom; order 20; }
}

span fic 2026-01..2026-03 "A long novel" { tags ["fiction"]; };
span non 2026-02..2026-04 "A history book" {
    tags ["nonfiction"];
    link "https://example.com/book";
};

event fic 2026-06 "Finished a short story" { tags ["fiction"]; };
`,
	},
] as const;

/** Looks a template up by id. Returns `undefined` for an unknown id. */
export function findTemplate(id: string): TimelineTemplate | undefined {
	return TIMELINE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Wraps a template body in a `tdsl` code fence, ready to drop into a note.
 *
 * Always ends with a newline so the fence never runs into whatever text
 * follows the cursor.
 */
export function renderTemplateSnippet(template: TimelineTemplate): string {
	const body = template.body.endsWith("\n")
		? template.body
		: `${template.body}\n`;
	return `\`\`\`tdsl\n${body}\`\`\`\n`;
}
