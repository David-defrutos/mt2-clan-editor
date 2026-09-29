export interface Entry {
  section: string;
  id: string;
  name: string;
  file: string;
  index: number;
  data: Record<string, unknown>;
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

export interface LibraryItem { key: string; root: string; addedAt: string }
export interface AssetInfo { id: string; file: string; image: string; category: string; categoryLabel: string; width?: number; height?: number; format?: string; bytes?: number; status: 'ok' | 'missing' | 'case-mismatch' | 'invalid-path'; uses: { section: string; id: string; file: string }[] }
export interface NavItem { id: string; label: string; icon: string }
export interface FieldRule { path: string; label: string; type: string; optional?: boolean; options?: string[] }
export interface Config {
  creation: { minimumDraftCards: number; defaultDraftCards: number; maximumDraftCards: number };
  navigation: { global: NavItem[]; clan: NavItem[] };
  fields: Record<string, FieldRule[]>;
  stats: { draftPools: string[]; starterPool: string; bannerPool: string; progressionMaxLevel: number; technicalUnlockLevels: number[]; metrics: { id: string; label: string }[] };
  mechanics: { assignments: { section: string; path: string; label: string; sourceSection: string; filter?: string; mode: 'append-id' | 'set-reference' }[] };
}

export interface ClanStats {
  key: string; name: string; root: string; files: number; cards: number; draft: number;
  champions: number; paths: number; characters: number; relics: number; abilities: number;
  starter: number; banner: number; rarity: Record<string, number>; types: Record<string, number>;
  unlocks: Record<string, number>; costs: Record<string, number>; attack: { min: number; median: number; max: number } | null;
  health: { min: number; median: number; max: number } | null; sprites: number; textureFiles: number;
  effects: number; triggers: number; pools: number; errors: number; error?: string;
}
export interface StatsItem { name: string; file: string; section?: string; id?: string; value?: number }
