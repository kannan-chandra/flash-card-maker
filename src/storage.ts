import { del, get, set } from 'idb-keyval';
import type { ProjectData, WorkspaceData } from './types';

const LEGACY_PROJECT_KEY = 'flashcard-maker/project/v1';
const WORKSPACE_KEY = 'flashcard-maker/workspace/v2';

export async function loadWorkspace(): Promise<WorkspaceData | null> {
  try {
    const workspace = await get<WorkspaceData>(WORKSPACE_KEY);
    if (workspace?.sets?.length) {
      return workspace;
    }

    const legacy = await get<ProjectData>(LEGACY_PROJECT_KEY);
    if (!legacy) {
      return null;
    }

    const setId = `set-${Date.now()}`;
    const migrated: WorkspaceData = {
      sets: [
        {
          ...legacy,
          id: setId,
          name: 'My First Set',
          createdAt: Date.now()
        }
      ],
      activeSetId: setId,
      updatedAt: Date.now()
    };
    await set(WORKSPACE_KEY, migrated);
    await del(LEGACY_PROJECT_KEY);
    return migrated;
  } catch {
    return null;
  }
}

export async function saveWorkspace(workspace: WorkspaceData): Promise<void> {
  await set(WORKSPACE_KEY, workspace);
}
