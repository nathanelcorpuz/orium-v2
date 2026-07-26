import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// T113 (user rule, 2026-07-25/26): no long em dashes anywhere in the app -
// UI copy, seed data, or code comments. CLAUDE.md and SPEC.md's "Writing
// style" section state the rule; this test is what actually enforces it, so
// a slip fails `npm run test` in the session it's introduced rather than
// being found months later by a grep.
//
// Deliberately the project's first non-engine test (SPEC.md's stack section
// says Vitest is "engine only"). There's no CI or pre-commit hook in this
// project, so the test suite is the only automated gate available, and a
// rule that nothing checks is a rule that drifts back.
//
// Built from its code point rather than typed literally, so this file never
// contains the very thing it searches for. (Writing it as a literal makes the
// test fail on its own source - which is how this line got here.)
const EM_DASH = String.fromCharCode(8212);

// Scoped to what actually ships or runs:
//   - src/            the app itself
//   - supabase/*.sql  the seed and wipe scripts, which are re-run as-is
//
// `supabase/migrations/` is deliberately excluded: an applied migration is a
// record of what was really run against the database, so rewriting one to
// satisfy a later style rule would make the file disagree with production.
// Migration 0016 genuinely did seed "Salary - Nathan" with an em dash at the
// time; 0018 later replaced those strings, and the live function was
// confirmed clean by querying it directly when this test was added.
//
// The project's own docs (SPEC.md, CLAUDE.md, BUGS.md) are out of scope too:
// historical prose, not shipped content.
const SOURCE_DIR = "src";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".css"];
const SQL_SCRIPTS = ["supabase/seed.sql", "supabase/wipe_test_data.sql"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) found.push(full);
  }
  return found;
}

describe("writing style", () => {
  it("uses no long em dashes in app code, copy, or seed data", () => {
    const targets = [...sourceFiles(SOURCE_DIR), ...SQL_SCRIPTS.filter((f) => fs.existsSync(f))];

    const offenders: string[] = [];
    for (const file of targets) {
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes(EM_DASH)) {
            offenders.push(`${file.split(path.sep).join("/")}:${index + 1}  ${line.trim()}`);
          }
        });
    }

    expect(
      offenders,
      `Long em dashes found. Use a plain hyphen "-" instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("actually detects an em dash when one is present", () => {
    // Guards the guard: without this, a bug that stopped the check from ever
    // matching would look identical to a clean codebase.
    expect(`Salary ${EM_DASH} Nathan`.includes(EM_DASH)).toBe(true);
    expect("Salary - Nathan".includes(EM_DASH)).toBe(false);
  });
});
