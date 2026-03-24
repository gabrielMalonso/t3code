import { ProviderRuntimeInfo } from "@t3tools/contracts";
import { Schema, Struct } from "effect";

import { ProjectionThreadSession } from "../Services/ProjectionThreadSessions.ts";

export const ProjectionThreadSessionDbRowSchema = ProjectionThreadSession.mapFields(
  Struct.assign({
    providerRuntimeInfo: Schema.NullOr(Schema.fromJsonString(ProviderRuntimeInfo)),
  }),
);
