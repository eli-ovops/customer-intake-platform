export type QuestionItem = {
  id: string;
  title: string;
  sourceField: string;
  blocking: boolean;
  requirementIds: string[];
  status: "open" | "answered" | "deferred";
  answer: string;
};
export type Requirement = {
  id: string;
  title: string;
  sourceField: string;
  kind: "build" | "research";
  status: "included" | "later" | "excluded";
  stage: string;
  deliverable: string;
  acceptance: string;
  condition: string;
  stop: string;
};
export type QuoteStage = {
  id: string;
  title: string;
  requirementIds: string[];
  saleFen: number | null;
  minutes: number | null;
  rateFen: number | null;
  costFen: number | null;
  costState: "known" | "na" | "unknown";
  costPayer: "eli" | "customer" | "unknown";
  zeroReason: string;
};
export type Change = {
  id: string;
  title: string;
  reason: string;
  impact: string;
  baseScopeId: string;
  status: "pending" | "accepted" | "rejected" | "later";
};
export type PlanItem = {
  id: string;
  requirementId: string;
  title: string;
  action: string;
  status: "unmeasured" | "passed" | "failed" | "na";
  result: string;
  evidence: string;
  testedVersion: string;
  actor: string;
  created: string;
};
export type Refs = {
  source: string | null;
  scope: string | null;
  quote: string | null;
  plan: string | null;
};
export type DeliveryState = {
  source: string | null;
  scope: string | null;
  quote: string | null;
  plan: string | null;
  questions: QuestionItem[];
  requirements: Requirement[];
  quoteStages: QuoteStage[];
  changes: Change[];
  scopeMeta: { goal: string; excluded: string };
  publicPermission: "unknown" | "allowed" | "revoked";
  permissionRevision: number;
  approval: null | {
    epoch: string;
    textHash: string;
    permissionRevision: number;
    refs: Refs;
  };
};
export type Snapshot = {
  id: string;
  kind: string;
  version: number;
  payload: any;
  sourceId: string | null;
  scopeId: string | null;
  sha256: string;
  actor: string;
  created: string;
};
export type Workspace = {
  id: string;
  intakeId: string;
  revision: number;
  state: DeliveryState;
  snapshots: Snapshot[];
  sourceValid: boolean;
  readOnlyReason: string | null;
  alignment: { scope: boolean; quote: boolean; plan: boolean };
  publicApprovalValid: boolean;
  publicPreview: string;
  quoteTotals: QuoteTotals | null;
};
export type QuoteTotals = {
  saleTotalFen: number | null;
  saleSubtotalFen: number;
  estimateTotalFen: number | null;
  estimateSubtotalFen: number;
  costTotalFen: number | null;
  costSubtotalFen: number;
  stages: (QuoteStage & { estimateFen: number | null })[];
};
export type DeliveryExport = {
  exportId: string;
  status: "COMPLETED" | "PARTIAL";
  privacyMode: "internal" | "customer";
  files: { relativePath: string; sha256: string; bytes: number }[];
  error?: string;
};
