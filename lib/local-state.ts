import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type PlanningSearchSnapshot = {
  capturedAt: string;
  settings: {
    categoryCount: number;
    keywordsPerCategory: number;
    articlesPerKeyword: number;
    dailyArticleLimit: number;
  };
  rawResponse: string;
  sources: any[];
  plan?: any;
  status: "captured" | "ready";
};

type LocalAgentState = {
  version: 1;
  savedAt: string;
  workspace?: any;
  planningSearch?: PlanningSearchSnapshot;
};

let writeQueue: Promise<void> = Promise.resolve();

function stateDirectory() {
  if (process.env.BLOGGER_AGENT_DATA_DIR)
    return path.resolve(process.env.BLOGGER_AGENT_DATA_DIR);
  if (process.env.LOCALAPPDATA)
    return path.join(process.env.LOCALAPPDATA, "BloggerWritingAgent");
  return path.join(process.cwd(), ".blogger-agent-data");
}

function statePath() {
  return path.join(stateDirectory(), "state.json");
}

async function readState(): Promise<LocalAgentState> {
  await writeQueue.catch(() => {});
  try {
    const value = JSON.parse(await readFile(statePath(), "utf8"));
    return value?.version === 1
      ? value
      : { version: 1, savedAt: new Date(0).toISOString() };
  } catch {
    return { version: 1, savedAt: new Date(0).toISOString() };
  }
}

async function updateState(
  change: (current: LocalAgentState) => LocalAgentState,
) {
  writeQueue = writeQueue.then(async () => {
    let current: LocalAgentState;
    try {
      const value = JSON.parse(await readFile(statePath(), "utf8"));
      current =
        value?.version === 1
          ? value
          : { version: 1, savedAt: new Date(0).toISOString() };
    } catch {
      current = { version: 1, savedAt: new Date(0).toISOString() };
    }
    const next = change(current);
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized, "utf8") > 20 * 1024 * 1024)
      throw new Error("로컬 작업 저장 크기가 20MB를 초과했습니다.");
    const directory = stateDirectory();
    await mkdir(directory, { recursive: true });
    const temporary = path.join(
      directory,
      `state-${process.pid}-${Date.now()}.tmp`,
    );
    await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, statePath());
  });
  return writeQueue;
}

export async function getLocalAgentState() {
  return readState();
}

export async function saveLocalWorkspace(workspace: any) {
  return updateState((current) => ({
    ...current,
    version: 1,
    savedAt: new Date().toISOString(),
    workspace,
  }));
}

export async function saveLocalPlanningSearch(
  snapshot: PlanningSearchSnapshot,
) {
  return updateState((current) => ({
    ...current,
    version: 1,
    savedAt: new Date().toISOString(),
    planningSearch: snapshot,
  }));
}

export async function markLocalPlanningSearchReady(plan: any) {
  return updateState((current) => ({
    ...current,
    version: 1,
    savedAt: new Date().toISOString(),
    planningSearch: current.planningSearch
      ? { ...current.planningSearch, plan, status: "ready" }
      : current.planningSearch,
  }));
}
