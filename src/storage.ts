import { get, set } from 'idb-keyval';
import type { ProjectData } from './types';

const STORAGE_KEY = 'flashcard-maker/project/v1';

export async function loadProject(): Promise<ProjectData | null> {
  try {
    const data = await get<ProjectData>(STORAGE_KEY);
    return data ?? null;
  } catch {
    return null;
  }
}

export async function saveProject(project: ProjectData): Promise<void> {
  await set(STORAGE_KEY, project);
}
