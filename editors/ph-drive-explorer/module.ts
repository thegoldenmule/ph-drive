import type { EditorModule } from "document-model";
import { lazy } from "react";

export const PhDriveExplorer: EditorModule = {
  Component: lazy(() => import("./editor.js")),
  config: {
    id: "PhDriveExplorer",
    name: "Ph Drive Explorer",
  },
  documentTypes: ["powerhouse/reactor-drive"],
};

export default PhDriveExplorer;
