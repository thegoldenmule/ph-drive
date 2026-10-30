// Put the third-party notices into dist/ after `ph-cli build`, which does not
// copy them. dist/ is what the package ships ("files": ["/dist"]).
//
//   THIRD_PARTY_NOTICES             → dist/THIRD_PARTY_NOTICES
//   node_modules/nl-runtime/
//     THIRD_PARTY_NOTICES           → dist/THIRD_PARTY_NOTICES.nl-runtime
//                                     (wllama, llama.cpp and the libraries
//                                     compiled into the wasm in dist/browser,
//                                     and the model licence pointers)
//
// Runs from `build` and `prepack`, and fails when a source is missing.
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const copies = [
  ["THIRD_PARTY_NOTICES", join(dist, "THIRD_PARTY_NOTICES")],
  [
    join("node_modules", "nl-runtime", "THIRD_PARTY_NOTICES"),
    join(dist, "THIRD_PARTY_NOTICES.nl-runtime"),
  ],
];

if (!existsSync(dist)) {
  console.error("[notices] no dist/: run the build first");
  process.exit(1);
}
for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.error(`[notices] missing ${from}`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`[notices] ${from} → ${to}`);
}
