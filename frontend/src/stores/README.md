# Zustand Store Architecture

## Store Organization

### 1. Chat Store (`useChatStore`)
**Purpose**: Manages all chat-related state including messages, WebSocket connection, and streaming

**State**:
- `messages: Message[]` - All chat messages
- `input: string` - Current message input text
- `isLoading: boolean` - Generation in progress
- `error: string | null` - Error messages
- `connectionStatus: string` - WebSocket connection state
- `todos: any` - Todo list from backend
- `currentMessageRef: { current: string | null }` - Streaming message buffer
- `currentMessageIdRef: { current: string | null }` - Current message ID
- `currentToolInvocationsRef: { current: Map<string, any> }` - Tool execution tracking
- `currentPartsRef: { current: any[] }` - Message parts for streaming order

**Actions**:
- `setMessages`, `addMessage`, `updateMessage`
- `setInput`, `setIsLoading`, `setError`
- `setConnectionStatus`, `setTodos`
- `resetCurrentMessage`, `updateCurrentMessage`

---

### 2. UI Store (`useUIStore`)
**Purpose**: Manages UI-specific state like dialogs, highlights, and selections

**State**:
- `selectedScript: object | null` - Selected script for detail dialog
- `selectedFileTool: object | null` - Selected file tool for detail dialog
- `isReasoningOpen: boolean` - Collapsible reasoning block state
- `highlightedCode: string` - Syntax-highlighted code
- `highlightedResult: string` - Syntax-highlighted JSON result
- `showInterruptPrompt: boolean` - Interrupt confirmation dialog
- `textAreaHeight: number` - Message input textarea height

**Actions**:
- `setSelectedScript`, `setSelectedFileTool`
- `setReasoningOpen`, `setHighlightedCode`, `setHighlightedResult`
- `setShowInterruptPrompt`, `setTextAreaHeight`
- `closeAllDialogs`

---

### 3. File Store (`useFileStore`)
**Purpose**: Manages file attachments, uploads, and drag-drop state

**State**:
- `files: File[] | null` - Currently attached files
- `uploadProgress: number | null` - File upload progress (0-100)
- `isDragging: boolean` - Drag-and-drop active state
- `preview: string` - File preview text

**Actions**:
- `setFiles`, `addFile`, `removeFile`, `clearFiles`
- `setUploadProgress`
- `setIsDragging`
- `setPreview`

---

### 4. Audio Store (`useAudioStore`)
**Purpose**: Manages audio recording and transcription state

**State**:
- `isListening: boolean` - Audio listening/recording active
- `isSpeechSupported: boolean` - Browser audio API availability
- `isRecording: boolean` - Recording in progress
- `isTranscribing: boolean` - Transcription in progress
- `audioStream: MediaStream | null` - Active audio stream

**Actions**:
- `setIsListening`, `setIsSpeechSupported`
- `setIsRecording`, `setIsTranscribing`
- `setAudioStream`, `stopRecording`

---

### 5. Utility Store (`useUtilityStore`)
**Purpose**: Manages miscellaneous utility states

**State**:
- `isCopied: boolean` - Clipboard copy success state
- `shouldAutoScroll: boolean` - Auto-scroll to bottom enabled
- `serverResponse: string` - Example/demo API response

**Actions**:
- `setIsCopied`, `resetCopied`
- `setShouldAutoScroll`
- `setServerResponse`

---

## Migration Strategy

1. Install Zustand
2. Create store files in `src/stores/`
3. Refactor components one by one:
   - Import store hooks
   - Replace useState with store selectors
   - Replace setState with store actions
4. Remove unused useState imports
5. Test functionality

## Benefits

- **Centralized State**: All state in one place, easier to debug
- **DevTools**: Zustand DevTools for time-travel debugging
- **Performance**: Selective re-renders with selectors
- **Simplified Code**: No prop drilling, cleaner component code
- **Type Safety**: Full TypeScript support
