/**
 * Category Storage Service
 * Manages project-specific categories for extension grouping
 * Categories are stored in data/projects/{tenantId}/{projectId}/categories.json
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { getProjectDir } from '../config/paths';

export interface Category {
  id: string;           // unique identifier (e.g., "database-tools", "web-tools")
  name: string;         // display name (e.g., "Database Tools", "Web Tools")
  description?: string; // what this category is for
  icon?: string;        // optional icon name for UI
  color?: string;       // optional color code for UI
  createdAt: number;    // timestamp
  updatedAt: number;    // timestamp
}

export interface CreateCategoryData {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface UpdateCategoryData {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export class CategoryStorage {
  /**
   * Get categories file path for a project
   */
  private getCategoriesPath(projectId: string, tenantId: number | string): string {
    return path.join(getProjectDir(projectId, tenantId), 'categories.json');
  }

  /**
   * Ensure categories file exists with default categories
   */
  private async ensureCategoriesFile(projectId: string, tenantId: number | string): Promise<void> {
    const categoriesPath = this.getCategoriesPath(projectId, tenantId);

    try {
      await fs.access(categoriesPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create with default categories
        const defaultCategories: Category[] = [
          {
            id: 'database-tools',
            name: 'Database Tools',
            description: 'Query and manipulate databases',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'web-tools',
            name: 'Web Tools',
            description: 'Web scraping, APIs, and data fetching',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'document-tools',
            name: 'Document Tools',
            description: 'Document processing and conversion',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'visualization-tools',
            name: 'Visualization Tools',
            description: 'Charts, tables, and diagrams',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            id: 'utility-tools',
            name: 'Utility Tools',
            description: 'Helper functions and utilities',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ];

        await fs.writeFile(
          categoriesPath,
          JSON.stringify(defaultCategories, null, 2),
          'utf-8'
        );

        console.log(`[CategoryStorage] Created default categories for project ${projectId} (tenant: ${tenantId})`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get all categories for a project
   */
  async getAll(projectId: string, tenantId: number | string): Promise<Category[]> {
    await this.ensureCategoriesFile(projectId, tenantId);

    const categoriesPath = this.getCategoriesPath(projectId, tenantId);
    const content = await fs.readFile(categoriesPath, 'utf-8');
    const categories = JSON.parse(content) as Category[];

    // Sort by name
    return categories.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get category by ID
   */
  async getById(projectId: string, tenantId: number | string, categoryId: string): Promise<Category | null> {
    const categories = await this.getAll(projectId, tenantId);
    return categories.find(cat => cat.id === categoryId) || null;
  }

  /**
   * Create a new category
   */
  async create(projectId: string, tenantId: number | string, data: CreateCategoryData): Promise<Category> {
    const categories = await this.getAll(projectId, tenantId);

    // Check if category ID already exists
    if (categories.find(cat => cat.id === data.id)) {
      throw new Error(`Category '${data.id}' already exists`);
    }

    const now = Date.now();
    const newCategory: Category = {
      id: data.id,
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      createdAt: now,
      updatedAt: now,
    };

    categories.push(newCategory);
    await this.saveCategories(projectId, tenantId, categories);

    console.log(`[CategoryStorage] Created category '${data.id}' for project ${projectId}`);
    return newCategory;
  }

  /**
   * Update a category
   */
  async update(projectId: string, tenantId: number | string, categoryId: string, updates: UpdateCategoryData): Promise<Category | null> {
    const categories = await this.getAll(projectId, tenantId);
    const index = categories.findIndex(cat => cat.id === categoryId);

    if (index === -1) {
      return null;
    }

    const existing = categories[index];
    if (!existing) {
      return null;
    }

    const updatedCategory: Category = {
      id: existing.id,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      icon: updates.icon ?? existing.icon,
      color: updates.color ?? existing.color,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    categories[index] = updatedCategory;
    await this.saveCategories(projectId, tenantId, categories);

    console.log(`[CategoryStorage] Updated category '${categoryId}' for project ${projectId}`);
    return updatedCategory;
  }

  /**
   * Delete a category
   */
  async delete(projectId: string, tenantId: number | string, categoryId: string): Promise<boolean> {
    const categories = await this.getAll(projectId, tenantId);
    const index = categories.findIndex(cat => cat.id === categoryId);

    if (index === -1) {
      return false;
    }

    categories.splice(index, 1);
    await this.saveCategories(projectId, tenantId, categories);

    console.log(`[CategoryStorage] Deleted category '${categoryId}' for project ${projectId}`);
    return true;
  }

  /**
   * Save categories to file
   */
  private async saveCategories(projectId: string, tenantId: number | string, categories: Category[]): Promise<void> {
    const categoriesPath = this.getCategoriesPath(projectId, tenantId);
    await fs.writeFile(
      categoriesPath,
      JSON.stringify(categories, null, 2),
      'utf-8'
    );
  }

  /**
   * Check if category exists
   */
  async exists(projectId: string, tenantId: number | string, categoryId: string): Promise<boolean> {
    const category = await this.getById(projectId, tenantId, categoryId);
    return category !== null;
  }

  /**
   * Get or create default categories (for initialization)
   */
  async getOrCreateDefaults(projectId: string, tenantId: number | string): Promise<Category[]> {
    await this.ensureCategoriesFile(projectId, tenantId);
    return this.getAll(projectId, tenantId);
  }

  /**
   * Reset categories to defaults (recreate categories.json with default categories)
   * Used when user resets extensions to defaults
   */
  async resetToDefaults(projectId: string, tenantId: number | string): Promise<void> {
    const categoriesPath = this.getCategoriesPath(projectId, tenantId);

    // Delete existing categories file if exists
    try {
      await fs.unlink(categoriesPath);
    } catch (error: any) {
      // Ignore if file doesn't exist
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Ensure categories file is recreated with defaults
    await this.ensureCategoriesFile(projectId, tenantId);

    console.log(`[CategoryStorage] Reset categories to defaults for project ${projectId}`);
  }
}
