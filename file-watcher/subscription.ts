import { createClient } from "graphql-ws";
import WebSocket from "ws";

const DOCUMENT_CHANGES = `
  subscription DriveChanges($search: SearchFilterInput!) {
    documentChanges(search: $search) {
      type
      context { parentId childId }
    }
  }
`;

/**
 * Subscribe to live drive changes on the switchboard over graphql-ws and invoke
 * `onChange` per event. Two filters cover everything: `identifiers:[driveId]`
 * (the drive doc's own mutations — folder ops + file link add/remove, since
 * relationships live on the drive doc) and `parentId:driveId` (child docs).
 * Returns a disposer. graphql-ws auto-reconnects.
 */
export function subscribeToDrive(
  switchboardUrl: string,
  driveId: string,
  onChange: () => void,
  onStatus?: (s: "connected" | "closed" | "error", detail?: unknown) => void,
): () => void {
  const wsUrl =
    switchboardUrl.replace(/\/+$/, "").replace(/^http/, "ws") +
    "/graphql/subscriptions";

  const client = createClient({
    url: wsUrl,
    webSocketImpl: WebSocket,
    retryAttempts: Infinity,
    on: {
      connected: () => onStatus?.("connected"),
      closed: (e) => onStatus?.("closed", e),
      error: (e) => onStatus?.("error", e),
    },
  });

  const filters = [{ identifiers: [driveId] }, { parentId: driveId }];
  const disposers = filters.map((search) =>
    client.subscribe(
      { query: DOCUMENT_CHANGES, variables: { search } },
      {
        next: () => onChange(),
        error: (err) => onStatus?.("error", err),
        complete: () => {},
      },
    ),
  );

  return () => {
    disposers.forEach((d) => d());
    void client.dispose();
  };
}
