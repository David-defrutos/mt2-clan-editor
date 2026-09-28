export type JsonRecord = Record<string, unknown>;

export interface Entry {
  section: string;
  id: string;
  name: string;
  file: string;
  index: number;
  data: JsonRecord;
  hash: string;
}

export interface Issue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  section?: string;
  id?: string;
}

export interface ClanSnapshot {
  key: string;
  root: string;
  name: string;
  classId: string;
  entries: Entry[];
  sections: Record<string, number>;
  files: string[];
  issues: Issue[];
  textureCount: number;
  hasSource: boolean;
  hasGit: boolean;
  hasDll: boolean;
}

export interface LibraryItem {
  key: string;
  root: string;
  addedAt: string;
}
