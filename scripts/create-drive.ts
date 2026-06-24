/**
 * create-drive — create a fresh reactor-drive on a switchboard and print its id + URL.
 *
 * Usage:
 *   pnpm create-drive                       # uses http://localhost:4001
 *   SWITCHBOARD_URL=http://host:4001 pnpm create-drive [name]
 */
import { DriveGql } from "../lib/drive-client.js";

const SWITCHBOARD_URL = process.env.SWITCHBOARD_URL ?? "http://localhost:4001";
const name = process.argv[2] ?? "My Drive";

async function main() {
  const gql = new DriveGql(SWITCHBOARD_URL);
  const driveId = await gql.createDrive(name, "PhDriveExplorer");
  const driveUrl = `${SWITCHBOARD_URL.replace(/\/+$/, "")}/d/${driveId}`;

  console.log("");
  console.log(`✅ Created reactor-drive "${name}"`);
  console.log(`   DRIVE_ID = ${driveId}`);
  console.log(`   drive URL = ${driveUrl}`);
  console.log("");
  console.log("Point Connect at it:");
  console.log(`   ph connect --default-drives-url ${driveUrl}`);
  console.log("");
  console.log("Run the watcher against it (or configure from the editor):");
  console.log(
    `   SWITCHBOARD_URL=${SWITCHBOARD_URL} DRIVE_ID=${driveId} WATCH_DIR=./drive pnpm watch`,
  );
  console.log("");
}

main().catch((err) => {
  console.error("Failed to create drive:", err.message ?? err);
  process.exit(1);
});
