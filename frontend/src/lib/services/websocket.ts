/**
 * WebSocket service for streaming AI conversations
 * Handles real-time message streaming from the backend
 */

export interface WSMessage {
	method: 'sendMessage' | 'abort' | 'clearHistory' | 'getHistory' | 'isProcessing' | 'ping';
	conversationId: string;
	params?: {
		message?: string;
		keepSystemPrompt?: boolean;
	};
}

export interface WSResponse {
	method: string;
	conversationId: string;
	result?: any;
	error?: string;
	streaming?: boolean;
	chunk?: string;
	done?: boolean;
}

export type MessageHandler = (response: WSResponse) => void;

export class ConversationWebSocket {
	private ws: WebSocket | null = null;
	private messageHandlers: Set<MessageHandler> = new Set();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private url: string;

	constructor(url: string = '/ws') {
		// Use relative URL so Vite proxy can handle it
		this.url = url;
	}

	/**
	 * Connect to WebSocket server
	 */
	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Convert relative URL to absolute WebSocket URL
				const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const wsUrl = `${wsProtocol}//${window.location.host}${this.url}`;

				this.ws = new WebSocket(wsUrl);

				this.ws.onopen = () => {
					console.log('[WebSocket] Connected');
					this.reconnectAttempts = 0;
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const response: WSResponse = JSON.parse(event.data);
						this.messageHandlers.forEach((handler) => handler(response));
					} catch (error) {
						console.error('[WebSocket] Failed to parse message:', error);
					}
				};

				this.ws.onerror = (error) => {
					console.error('[WebSocket] Error:', error);
					reject(error);
				};

				this.ws.onclose = () => {
					console.log('[WebSocket] Disconnected');
					this.handleReconnect();
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Handle reconnection logic
	 */
	private handleReconnect() {
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			this.reconnectAttempts++;
			console.log(`[WebSocket] Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

			setTimeout(() => {
				this.connect().catch(console.error);
			}, this.reconnectDelay * this.reconnectAttempts);
		}
	}

	/**
	 * Send a message through WebSocket
	 */
	send(message: WSMessage) {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket is not connected');
		}

		this.ws.send(JSON.stringify(message));
	}

	/**
	 * Add a message handler
	 */
	onMessage(handler: MessageHandler) {
		this.messageHandlers.add(handler);
		return () => this.messageHandlers.delete(handler);
	}

	/**
	 * Send a message and stream the response
	 */
	async sendMessage(
		conversationId: string,
		message: string,
		onChunk: (chunk: string) => void
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const cleanup = this.onMessage((response) => {
				if (response.conversationId !== conversationId || response.method !== 'sendMessage') {
					return;
				}

				if (response.error) {
					cleanup();
					reject(new Error(response.error));
					return;
				}

				if (response.streaming && response.chunk) {
					onChunk(response.chunk);
				}

				if (response.done) {
					cleanup();
					resolve();
				}
			});

			this.send({
				method: 'sendMessage',
				conversationId,
				params: { message }
			});
		});
	}

	/**
	 * Abort current message processing
	 */
	abort(conversationId: string) {
		this.send({
			method: 'abort',
			conversationId
		});
	}

	/**
	 * Clear conversation history
	 */
	clearHistory(conversationId: string, keepSystemPrompt = true) {
		this.send({
			method: 'clearHistory',
			conversationId,
			params: { keepSystemPrompt }
		});
	}

	/**
	 * Get conversation history
	 */
	async getHistory(conversationId: string): Promise<any[]> {
		return new Promise((resolve, reject) => {
			const cleanup = this.onMessage((response) => {
				if (response.conversationId !== conversationId || response.method !== 'getHistory') {
					return;
				}

				cleanup();

				if (response.error) {
					reject(new Error(response.error));
				} else {
					resolve(response.result?.history || []);
				}
			});

			this.send({
				method: 'getHistory',
				conversationId
			});
		});
	}

	/**
	 * Disconnect from WebSocket
	 */
	disconnect() {
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.messageHandlers.clear();
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}
}
