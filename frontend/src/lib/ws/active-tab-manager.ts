/**
 * Active Tab Manager
 * Ensures only one tab processes WebSocket events for a given conversation
 * Other tabs remain passive listeners
 */

type TabId = string;
type ConvId = string;

class ActiveTabManager {
  private static instance: ActiveTabManager;
  private activeTabsPerConv = new Map<ConvId, TabId>();
  private tabIds = new WeakMap<object, TabId>();
  private nextTabId = 0;

  private constructor() {}

  static getInstance(): ActiveTabManager {
    if (!ActiveTabManager.instance) {
      ActiveTabManager.instance = new ActiveTabManager();
    }
    return ActiveTabManager.instance;
  }

  /**
   * Register a component as potentially active for a conversation
   * Returns a tab ID for this component
   */
  registerTab(componentRef: object, convId: ConvId): TabId {
    let tabId = this.tabIds.get(componentRef);

    if (!tabId) {
      tabId = `tab_${this.nextTabId++}_${Date.now()}`;
      this.tabIds.set(componentRef, tabId);
    }

    // This tab becomes the active one for this conversation
    const previousActiveTab = this.activeTabsPerConv.get(convId);
    this.activeTabsPerConv.set(convId, tabId);

    console.log(`[ActiveTabManager] Tab ${tabId} is now active for convId ${convId} (previous: ${previousActiveTab || 'none'})`);

    return tabId;
  }

  /**
   * Unregister a component when it unmounts
   */
  unregisterTab(componentRef: object, convId: ConvId): void {
    const tabId = this.tabIds.get(componentRef);

    if (tabId && this.activeTabsPerConv.get(convId) === tabId) {
      console.log(`[ActiveTabManager] Tab ${tabId} unregistered for convId ${convId}`);
      this.activeTabsPerConv.delete(convId);
    }
  }

  /**
   * Check if a tab is the active one for a conversation
   */
  isActiveTab(componentRef: object, convId: ConvId): boolean {
    const tabId = this.tabIds.get(componentRef);
    const activeTabId = this.activeTabsPerConv.get(convId);
    return tabId === activeTabId;
  }

  /**
   * Get stats for debugging
   */
  getStats() {
    return {
      activeConversations: this.activeTabsPerConv.size,
      activeTabs: Array.from(this.activeTabsPerConv.entries())
    };
  }
}

export const activeTabManager = ActiveTabManager.getInstance();
