# Client ID Management

This document describes the client ID management system implemented in the frontend application.

## Overview

The client ID system provides a persistent way to identify and track individual client sessions across browser restarts and page reloads. This is useful for:

- Maintaining conversation history continuity
- Debugging and troubleshooting
- Analytics and user tracking
- Server-side session management

## Architecture

### Core Components

1. **`ClientIdManager`** (`/src/lib/client-id.ts`)
   - Static class for client ID operations
   - Handles localStorage persistence
   - Provides utility methods for ID management

2. **`useClientId`** Hook (`/src/lib/client-id.ts`)
   - React hook for component integration
   - Provides reactive state management
   - Handles cross-tab synchronization

3. **Integration Points**
   - **WSClient** (`/src/lib/ws/ws-client.ts`) - Uses client ID for WebSocket connections
   - **ShadcnChatInterface** (`/src/components/shadcn-chat-interface.tsx`) - Main UI component with client ID awareness

## Usage

### Basic Usage

```typescript
import { ClientIdManager } from '@/lib/client-id';

// Get current client ID (generates one if doesn't exist)
const clientId = ClientIdManager.getClientId();

// Set a specific client ID
ClientIdManager.setClientId('custom-client-id');

// Generate a new client ID
const newId = ClientIdManager.generateClientId();

// Check if client ID exists
const hasId = ClientIdManager.hasClientId();

// Clear stored client ID
ClientIdManager.clearClientId();
```

### React Hook Usage

```typescript
import { useClientId } from '@/lib/client-id';

function MyComponent() {
  const {
    clientId,           // Current client ID
    setClientId,        // Set a specific client ID
    generateNewClientId, // Generate and set new ID
    clearClientId,      // Clear stored ID
    hasClientId,        // Boolean flag
    metadata           // Debug metadata
  } = useClientId();

  return (
    <div>
      <p>Client ID: {clientId}</p>
      <button onClick={generateNewClientId}>
        Generate New ID
      </button>
    </div>
  );
}
```

## Storage Details

- **Storage Mechanism**: `localStorage`
- **Storage Key**: `ws_client_id`
- **ID Format**: `client_${timestamp}_${randomString}`
- **Persistence**: Survives browser restarts and page reloads
- **Cross-tab Sync**: Changes are synchronized across browser tabs

## Debug Features

The development environment includes a debug component (`ClientIdDebug`) that displays:

- Current client ID
- Storage status (stored vs generated)
- Browser environment detection
- Manual ID management controls

### Debug Component Usage

```typescript
import { ClientIdDebug } from '@/components/debug/client-id-debug';

// Only renders in development mode
<ClientIdDebug />
```

## Integration Examples

### WebSocket Integration

The WebSocket client automatically includes the client ID in:

1. **Connection URL**: `?clientId=client_123_abc`
2. **Message Metadata**: All messages include `clientId` in their metadata
3. **State Management**: Connection state tracks the active client ID

### Message Metadata

```typescript
{
  type: "user_message",
  id: "msg_123_456",
  data: { text: "Hello" },
  metadata: {
    timestamp: 1634567890,
    clientId: "client_123_abc",
    sequence: 1
  }
}
```

## Security Considerations

- Client IDs are **not** security tokens
- They are **not** used for authentication
- They are **public** and can be shared
- Do not rely on client IDs for sensitive operations

## Best Practices

1. **Always use the utility functions** rather than direct localStorage access
2. **Handle the case** where client ID might not be available (server-side rendering)
3. **Use the React hook** for component-level integration
4. **Leverage the debug component** during development
5. **Consider cross-tab scenarios** when implementing features

## Troubleshooting

### Common Issues

1. **Missing Client ID in Production**
   - Check if localStorage is available
   - Verify browser privacy settings
   - Check for localStorage quota issues

2. **Multiple Client IDs**
   - Ensure consistent usage of `ClientIdManager`
   - Check for accidental localStorage clears
   - Verify cross-tab synchronization

3. **Debug Component Not Showing**
   - Verify `NODE_ENV` is set to "development"
   - Check if the component is properly imported
   - Ensure the component is not behind conditional rendering

### Logging

The system logs client ID information during WebSocket initialization:

```
ShadcnChatInterface: Initializing with Client ID: client_123_abc
ShadcnChatInterface: Client metadata: {
  clientId: "client_123_abc",
  hasStoredId: true,
  isBrowserEnvironment: true
}
```

## Migration Notes

If migrating from a previous system:

1. The storage key (`ws_client_id`) remains the same for backward compatibility
2. The ID format is compatible with existing implementations
3. Existing client IDs will be preserved and continue to work