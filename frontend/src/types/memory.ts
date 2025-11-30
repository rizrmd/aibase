export interface MemoryStore {
  [category: string]: {
    [key: string]: any;
  };
}

export interface MemoryEntry {
  category: string;
  key: string;
  value: any;
}

export interface MemoryApiResponse {
  success: boolean;
  data?: MemoryStore | Record<string, any>;
  error?: string;
}

export interface MemorySetResponse {
  success: boolean;
  action?: "created" | "updated";
  category?: string;
  key?: string;
  value?: any;
  oldValue?: any;
  error?: string;
}

export interface MemoryDeleteResponse {
  success: boolean;
  action?: "removed";
  category?: string;
  key?: string;
  removedValue?: any;
  keysRemoved?: number;
  removedData?: Record<string, any>;
  error?: string;
}
