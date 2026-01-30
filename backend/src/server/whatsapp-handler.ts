/**
 * WhatsApp API Handler
 * Handles WhatsApp client management, QR code generation, and message routing
 */

import { ProjectStorage } from "../storage/project-storage";
import { Conversation } from "../llm/conversation";
import { ChatHistoryStorage } from "../storage/chat-history-storage";
import * as fs from "fs/promises";
import * as path from "path";
import { PATHS, getProjectDir } from "../config/paths";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "http://localhost:7031/api/v1";

// Import notification functions for WebSocket broadcasts
let notifyWhatsAppStatus: (projectId: string, status: any) => void = () => { };
let notifyWhatsAppQRCode: (projectId: string, qrCode: string) => void = () => { };
let notifyWhatsAppQRTimeout: (projectId: string) => void = () => { };

// Initialize notification functions (called after whatsapp-ws is loaded)
export function initWhatsAppNotifications(
  notifyStatus: typeof notifyWhatsAppStatus,
  notifyQR: typeof notifyWhatsAppQRCode,
  notifyTimeout: typeof notifyWhatsAppQRTimeout
) {
  notifyWhatsAppStatus = notifyStatus;
  notifyWhatsAppQRCode = notifyQR;
  notifyWhatsAppQRTimeout = notifyTimeout;
}

interface WhatsAppClient {
  id: string;
  connected: boolean;
  connectedAt?: string;
  deviceName?: string;
}

/**
 * Get WhatsApp client for a project
 */
export async function handleGetWhatsAppClient(req: Request, projectId?: string): Promise<Response> {
  try {
    // Get project ID from query params if not provided
    if (!projectId) {
      const url = new URL(req.url);
      projectId = url.searchParams.get("projectId") || undefined;
    }

    if (!projectId) {
      return Response.json(
        { success: false, error: "Missing projectId" },
        { status: 400 }
      );
    }

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Get client from aimeow API
    const url = `${WHATSAPP_API_URL}/clients`;
    console.log("[WhatsApp] Fetching clients from:", url);
    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      console.error("[WhatsApp] Failed to fetch clients, status:", response.status, "response:", text);
      throw new Error(`Failed to fetch clients from WhatsApp service: ${response.status} ${text}`);
    }

    const data = await response.json();

    // Find client for this project (client ID would be the projectId)
    // Handle both array response and object with clients property
    const clientsArray = Array.isArray(data) ? data : (data as any).clients;
    const client = clientsArray?.find((c: any) => c.id === projectId);

    if (!client) {
      return Response.json(
        { success: false, error: "Client not found" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      client: {
        id: client.id,
        phone: client.phone || null,
        connected: client.is_connected || false,
        connectedAt: client.connectedAt,
        deviceName: client.osName || "WhatsApp Device",
      },
    });
  } catch (error) {
    console.error("[WhatsApp] Error getting client:", error);
    return Response.json(
      { success: false, error: "Failed to get WhatsApp client" },
      { status: 500 }
    );
  }
}

/**
 * Create new WhatsApp client for a project
 */
export async function handleCreateWhatsAppClient(req: Request): Promise<Response> {
  try {
    const body = await req.json() as any;
    const { projectId, osName } = body;

    if (!projectId) {
      return Response.json(
        { success: false, error: "Missing projectId" },
        { status: 400 }
      );
    }

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Create client in aimeow API with projectId as the client ID
    const response = await fetch(`${WHATSAPP_API_URL}/clients/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: projectId,
        os_name: osName || `AIBase - ${project.name}`,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[WhatsApp] Error creating client:", error);
      throw new Error("Failed to create WhatsApp client");
    }

    const data = await response.json() as any;

    return Response.json({
      success: true,
      client: {
        id: data.id || projectId,
        connected: false,
        deviceName: osName || `AIBase - ${project.name}`,
      },
    });
  } catch (error) {
    console.error("[WhatsApp] Error creating client:", error);
    return Response.json(
      { success: false, error: "Failed to create WhatsApp client" },
      { status: 500 }
    );
  }
}

/**
 * Delete WhatsApp client
 */
export async function handleDeleteWhatsAppClient(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return Response.json(
        { success: false, error: "Missing clientId" },
        { status: 400 }
      );
    }

    // Delete client from aimeow API
    const response = await fetch(`${WHATSAPP_API_URL}/clients/${clientId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete WhatsApp client");
    }

    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error("[WhatsApp] Error deleting client:", error);
    return Response.json(
      { success: false, error: "Failed to delete WhatsApp client" },
      { status: 500 }
    );
  }
}

/**
 * Get QR code for device linking
 */
export async function handleGetWhatsAppQRCode(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");

    if (!clientId) {
      return Response.json(
        { success: false, error: "Missing clientId" },
        { status: 400 }
      );
    }

    // Get client info from aimeow API
    const response = await fetch(`${WHATSAPP_API_URL}/clients/${clientId}`);

    if (!response.ok) {
      throw new Error("Failed to fetch client info");
    }

    const data = await response.json() as any;

    // The QRCode field contains the raw QR code string
    // We need to generate a data URL from it
    if (!data.qrCode || data.qrCode === "not_available") {
      return Response.json({
        success: false,
        error: "QR code not available yet",
      });
    }

    // Generate QR code data URL using a simple QR code generator
    // For now, return the QR code text and let the frontend generate the image
    return Response.json({
      success: true,
      qrCode: data.qrCode,
    });
  } catch (error) {
    console.error("[WhatsApp] Error getting QR code:", error);
    return Response.json(
      { success: false, error: "Failed to get QR code" },
      { status: 500 }
    );
  }
}

/**
 * Handle incoming WhatsApp webhook (messages from aimeow)
 */
export async function handleWhatsAppWebhook(req: Request): Promise<Response> {
  try {
    const body = await req.json() as any;
    const { clientId, message: messageData, timestamp } = body;

    console.log("[WhatsApp] Webhook received:", {
      clientId,
      from: messageData?.from,
      type: messageData?.type,
      fromMe: messageData?.fromMe
    });

    // Ignore messages sent by the bot/device itself (self-messages)
    // This prevents the AI from replying to itself or syncing manual replies as user input
    if (messageData?.fromMe) {
      console.log("[WhatsApp] Ignoring self-message fromMe=true");
      return Response.json({ success: true, ignored: true });
    }

    // The clientId is the projectId
    const projectId = clientId;

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      console.error("[WhatsApp] Project not found:", projectId);
      return Response.json({ success: false, error: "Project not found" });
    }

    // Filter group messages: Ignore unless mentioned
    if (messageData.isGroup) {
      const mentions = messageData.mentions || [];
      const myPhone = messageData.myPhone;

      // If no mentions at all, ignore
      if (mentions.length === 0) {
        console.log("[WhatsApp] Ignoring group message (no mentions)");
        return Response.json({ success: true, ignored: true });
      }

      // If we know our phone number, check if we are mentioned
      if (myPhone) {
        // Mentions are JIDs (e.g., 12345@s.whatsapp.net), myPhone is usually just digits (12345)
        const isMentioned = mentions.some((m: string) => m.includes(myPhone));
        if (!isMentioned) {
          console.log("[WhatsApp] Ignoring group message (bot not mentioned)", { myPhone, mentions });
          return Response.json({ success: true, ignored: true });
        }
      } else {
        // If we don't know our phone number but there are mentions, 
        // we conservatively ignore it to prevent spamming groups.
        console.log("[WhatsApp] Ignoring group message (unknown bot identity)");
        return Response.json({ success: true, ignored: true });
      }

      console.log("[WhatsApp] Processing group message (bot mentioned)", { myPhone, mentions });
    } else {
      // Logic for Private Chat (DM)
      console.log("[WhatsApp] Processing PRIVATE message (DM)", { 
        from: messageData.from, 
        pushName: messageData.pushName 
      });
    }

    // Extract WhatsApp phone number for reply target
    // For DM: rawChat contains the phone number JID (e.g. "6281803417004@s.whatsapp.net")
    // For Group: rawSender contains the sender JID, but we still reply to rawChat (group)
    // The 'from' field may contain LID which is NOT suitable for replies
    let whatsappNumber: string;

    // PRIORITY 1: For DM, use rawChat (the chat JID is the phone number)
    if (!messageData.isGroup && messageData.rawChat && messageData.rawChat.includes('@s.whatsapp.net')) {
      whatsappNumber = messageData.rawChat.split('@')[0];
      console.log("[WhatsApp] Using rawChat for DM reply target:", whatsappNumber);
    }
    // PRIORITY 2: For Group, use rawSender (who sent the message)
    else if (messageData.isGroup && messageData.rawSender && messageData.rawSender.includes('@s.whatsapp.net')) {
      whatsappNumber = messageData.rawSender.split('@')[0];
      console.log("[WhatsApp] Using rawSender for Group reply target:", whatsappNumber);
    }
    // PRIORITY 3: Try rawSenderAlt if available
    else if (messageData.rawSenderAlt && messageData.rawSenderAlt.includes('@s.whatsapp.net')) {
      whatsappNumber = messageData.rawSenderAlt.split('@')[0];
      console.log("[WhatsApp] Using rawSenderAlt for reply target:", whatsappNumber);
    }
    // FALLBACK: Use 'from' field (may be LID, may fail)
    else {
      whatsappNumber = messageData.from;
      console.warn("[WhatsApp] WARNING: Using 'from' field as fallback. This may be an LID and reply may fail:", whatsappNumber);
    }

    // Ensure format is clean (digits only)
    whatsappNumber = whatsappNumber.replace(/[^0-9]/g, '');

    const uid = `whatsapp_user_${whatsappNumber}`;

    // Get or create conversation for this WhatsApp contact
    const { ChatHistoryStorage } = await import("../storage/chat-history-storage");
    const chatHistoryStorage = ChatHistoryStorage.getInstance();

    // Find existing conversation for this UID
    let convId: string | null = null;
    const tenantId = 'default'; // WhatsApp messages use default tenant
    const conversations = await chatHistoryStorage.listAllConversations(projectId, tenantId);

    // Look for existing conversation with this WhatsApp number in the ID
    for (const conv of conversations) {
      if (conv.convId.includes(whatsappNumber)) {
        convId = conv.convId;
        break;
      }
    }

    // Create new conversation if not found
    if (!convId) {
      // Use format: wa_<phone_number> WITHOUT timestamp so messages from same number go to same conversation
      convId = `wa_${whatsappNumber}`;
      const title = `WhatsApp - ${messageData.pushName || whatsappNumber}`;

      console.log("[WhatsApp] Creating new conversation:", convId, "with title:", title);
      // Note: Conversation will be created automatically when ChatHistoryStorage.saveChatHistory() is called
    }

    // Prepare message content based on type
    let messageText = "";
    const attachments: any[] = [];

    switch (messageData.type) {
      case "text":
        messageText = messageData.text || "";
        break;

      case "image":
        messageText = messageData.caption || "Sent an image";
        if (messageData.fileUrl) {
          attachments.push({
            type: "image",
            url: messageData.fileUrl,
            mimeType: messageData.mimeType,
          });

          // === SAVE IMAGE TO WHATSAPP FOLDER ===
          // Save image to data/projects/[tenant]/[project]/whatsapp/[phone]/
          (async () => {
            try {
              const tenantId = project.tenant_id ? String(project.tenant_id) : 'default';
              const projectDir = getProjectDir(projectId, tenantId);
              const whatsappFilesDir = path.join(projectDir, "whatsapp", whatsappNumber);
              
              // Ensure directory exists
              await fs.mkdir(whatsappFilesDir, { recursive: true });

              // Determine extension
              let ext = ".jpg";
              if (messageData.mimeType === "image/png") ext = ".png";
              else if (messageData.mimeType === "image/webp") ext = ".webp";
              else if (messageData.mimeType === "image/jpeg") ext = ".jpg";

              // Use message ID for filename if available, otherwise timestamp
              const filename = `${messageData.id || Date.now()}${ext}`;
              const filePath = path.join(whatsappFilesDir, filename);

              console.log(`[WhatsApp] saving image to: ${filePath}`);

              // Download file
              const imgResponse = await fetch(messageData.fileUrl);
              if (imgResponse.ok) {
                 const arrayBuffer = await imgResponse.arrayBuffer();
                 await fs.writeFile(filePath, Buffer.from(arrayBuffer));
                 console.log(`[WhatsApp] Image saved successfully: ${filename}`);
                 


                 // Optional: Save technical metadata as JSON too (backup)
                 const metaPath = filePath + ".meta.json";
                 await fs.writeFile(metaPath, JSON.stringify({
                   id: messageData.id,
                   timestamp: new Date().toISOString(),
                   sender: whatsappNumber,
                   caption: messageData.caption,
                   mimeType: messageData.mimeType,
                   originalUrl: messageData.fileUrl
                 }, null, 2));
              } else {
                 console.error(`[WhatsApp] Failed to download image from ${messageData.fileUrl}: ${imgResponse.status}`);
              }
            } catch (err) {
              console.error("[WhatsApp] Error saving image file:", err);
            }
          })();
        }
        break;

      case "video":
        messageText = messageData.caption || "Sent a video";
        if (messageData.fileUrl) {
          attachments.push({
            type: "video",
            url: messageData.fileUrl,
            mimeType: messageData.mimeType,
          });
        }
        break;

      case "audio":
        messageText = "Sent a voice message";
        if (messageData.fileUrl) {
          attachments.push({
            type: "audio",
            url: messageData.fileUrl,
            mimeType: messageData.mimeType,
          });
        }
        break;

      case "document":
        messageText = messageData.caption || "Sent a document";
        if (messageData.fileUrl) {
          attachments.push({
            type: "document",
            url: messageData.fileUrl,
            mimeType: messageData.mimeType,
          });
        }
        break;

      case "location":
        messageText = `Shared location: ${messageData.name || "Location"}\nLat: ${messageData.latitude}, Lng: ${messageData.longitude}`;
        if (messageData.address) {
          messageText += `\nAddress: ${messageData.address}`;
        }
        break;

      case "live_location":
        messageText = `Shared live location\nLat: ${messageData.latitude}, Lng: ${messageData.longitude}`;
        break;

      case "other":
      default:
        // For self-chat or other types, try to get text content
        messageText = messageData.text || messageData.caption || "Sent a message";
        break;
    }

    // === HANDLER KHUSUS UNTUK LOCATION MESSAGE ===
    // Respons instan tanpa AI untuk menghindari timeout dan rate limit
    if (messageData.type === "location" || messageData.type === "live_location") {
      const lat = messageData.latitude;
      const lng = messageData.longitude;
      const locationName = messageData.name || "";
      const locationAddress = messageData.address || "";
      
      // Format timestamp dalam bahasa Indonesia
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta'
      };
      const formattedTime = now.toLocaleDateString('id-ID', options) + ' WIB';
      
      // Template respons untuk pengaduan
      let autoReply = `📍 *Lokasi kejadian diterima!*\n\n`;
      
      if (locationName) {
        autoReply += `📌 Nama: ${locationName}\n`;
      }
      if (locationAddress) {
        autoReply += `🏠 Alamat: ${locationAddress}\n`;
      }
      
      autoReply += `🌐 Koordinat: ${lat}, ${lng}\n`;
      autoReply += `🕐 Waktu: ${formattedTime}\n`;
      autoReply += `🗺️ Maps: https://maps.google.com/?q=${lat},${lng}\n\n`;
      autoReply += `_Lokasi ini akan dilampirkan dalam laporan pengaduan Anda._`;
      
      console.log("[WhatsApp] Location handler: Sending instant response for location message");
      
      // Kirim respons langsung tanpa AI
      sendWhatsAppMessage(projectId, whatsappNumber, { text: autoReply })
        .then(() => console.log("[WhatsApp] Location auto-reply sent successfully"))
        .catch((err) => console.error("[WhatsApp] Error sending location auto-reply:", err));
      
      return Response.json({ success: true, convId, uid, handledBy: "location_handler" });
    }

    // Process the message through the AI system
    console.log("[WhatsApp] Processing message:", {
      projectId,
      convId,
      from: whatsappNumber,
      messageText,
      attachments,
    });

    // Process message through AI (async, don't block webhook response)
    processWhatsAppMessageWithAI(projectId, convId, whatsappNumber, messageText, attachments, uid)
      .catch((error) => {
        console.error("[WhatsApp] Error processing message with AI:", error);
        // Send error message to user
        sendWhatsAppMessage(projectId, whatsappNumber, {
          text: "Sorry, I encountered an error processing your message. Please try again.",
        }).catch(console.error);
      });

    return Response.json({ success: true, convId, uid });
  } catch (error) {
    console.error("[WhatsApp] Error handling webhook:", error);
    return Response.json(
      { success: false, error: "Failed to handle webhook" },
      { status: 500 }
    );
  }
}

/**
 * Clean response before sending to WhatsApp
 * Removes tool call JSON and other unwanted content
 */
function cleanWhatsAppResponse(response: string): string {
  let cleaned = response;

  // Remove structured tool call JSON with tool_call_id
  cleaned = cleaned.replace(/\{[^}]*"tool_call_id"\s*:\s*"[^"]*"[^}]*\}/g, '');

  // Remove tool call JSON patterns (e.g., {"name": "tool_name", "arguments": {...}})
  cleaned = cleaned.replace(/\{[^}]*"name"\s*:\s*"[^"]*"[^}]*"arguments"\s*:\s*\{[^}]*\}[^}]*\}/g, '');

  // Remove tool_calls array patterns
  cleaned = cleaned.replace(/"tool_calls"\s*:\s*\[[^\]]*\]/g, '');

  // Remove function call patterns
  cleaned = cleaned.replace(/\[Function Call: [^\]]*\]/gi, '');

  // Remove tool result patterns
  cleaned = cleaned.replace(/\[Tool Result: [^\]]*\]/gi, '');

  // Remove "Calling tool" messages
  cleaned = cleaned.replace(/Calling tool:?\s*\[?[^\n\]]*\]?/gi, '');

  // Remove tool execution messages
  cleaned = cleaned.replace(/Executing\s+\w+\s+tool/gi, '');

  // Remove JSON objects that look like tool results
  cleaned = cleaned.replace(/\{[^}]*"error"[^}]*\}/g, '');

  // Remove webhook/message JSON patterns (clientId, message, timestamp, etc.)
  cleaned = cleaned.replace(/\{"clientId"\s*:\s*"[^"]*"[^}]*\}/gs, '');
  
  // Remove message payload JSON patterns
  cleaned = cleaned.replace(/\{"message"\s*:\s*\{[^}]*\}[^}]*\}/gs, '');
  
  // Remove standalone JSON objects with common webhook fields
  cleaned = cleaned.replace(/\{[^}]*"timestamp"\s*:\s*\d+[^}]*\}/g, '');
  
  // Remove location-related JSON patterns
  cleaned = cleaned.replace(/\{[^}]*"latitude"\s*:\s*[0-9.-]+[^}]*"longitude"\s*:\s*[0-9.-]+[^}]*\}/g, '');
  
  // Remove any remaining JSON-like structures that start with { and contain quoted keys
  // Be more aggressive for obvious JSON dumps
  cleaned = cleaned.replace(/^\s*\{[\s\S]*"[a-zA-Z_]+"\s*:\s*[\s\S]*\}\s*$/gm, '');

  // Remove empty or whitespace-only markdown code blocks (```json\n\n```, ```\n```, etc.)
  cleaned = cleaned.replace(/```[a-z]*\s*\n*\s*```/gi, '');
  
  // Remove code blocks that only contain whitespace or very short content
  cleaned = cleaned.replace(/```[a-z]*\s*\n\s*\n*```/gi, '');

  // === NEW: Remove Thinking/Reasoning Tags ===
  // Removes content like <think>...</think> or just </think> artifacts
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<\/think>/gi, ''); // Remove stray closing tags
  cleaned = cleaned.replace(/<think>/gi, '');   // Remove stray opening tags

  // Remove multiple newlines (compress to max 2)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Process WhatsApp message with AI
 */
async function processWhatsAppMessageWithAI(
  projectId: string,
  convId: string,
  whatsappNumber: string,
  messageText: string,
  attachments: any[],
  uid: string
): Promise<void> {
  try {
    console.log("[WhatsApp] Starting AI processing for message:", messageText);

    // Get ChatHistoryStorage instance (singleton, already imported)
    const chatHistoryStorage = ChatHistoryStorage.getInstance();
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // Load existing conversation history
    console.log("[WhatsApp] Loading client history...");
    const existingHistory = await chatHistoryStorage.loadChatHistory(convId, projectId, tenantId);
    console.log("[WhatsApp] Loaded history, messages:", existingHistory?.length || 0);

    // Create conversation instance with custom hooks for script progress
    console.log("[WhatsApp] Creating conversation instance...");
    const conversation = await Conversation.create({
      projectId,
      tenantId,
      convId,
      urlParams: { CURRENT_UID: uid },
      hooks: {
        tools: {
          before: async (toolCallId: string, toolName: string, args: any) => {
            // Check if this is a script tool progress update
            // The script tool injects __status and __result via the broadcast function
            if (toolName === "script" && args.__status === "progress" && args.__result) {
              const progressMessage = args.__result.message;
              console.log("[WhatsApp] Script progress:", progressMessage);

              // Send progress update to WhatsApp
              try {
                await sendWhatsAppMessage(projectId, whatsappNumber, {
                  text: `⏳ ${progressMessage}`,
                });
              } catch (err) {
                console.error("[WhatsApp] Failed to send progress message:", err);
                // Don't throw - progress messages are optional
              }
            }
          },
        },
      },
    });
    console.log("[WhatsApp] Conversation created");

    // Load history if exists
    if (existingHistory && existingHistory.length > 0) {
      (conversation as any)._history = existingHistory;
    }
    console.log("[WhatsApp] Sending user message to AI...");

    // Initialize response accumulator
    let fullResponse = "";

    // Add user message to conversation and stream response
    console.log("[WhatsApp] Stream started. Waiting for first chunk...");
    let chunkCount = 0;
    
    // Create a timeout promise - increased to 60s for slow networks
    let isComplete = false;
    const TIMEOUT_MS = 60000; // 60 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        if (!isComplete && chunkCount === 0) {
          reject(new Error(`AI Response Timeout (No chunks received in ${TIMEOUT_MS / 1000}s)`));
        }
      }, TIMEOUT_MS);
    });

    const streamPromise = (async () => {
      try {
        for await (const chunk of conversation.sendMessage(messageText)) {
          chunkCount++;
          if (chunkCount === 1) console.log("[WhatsApp] First chunk received!");
          fullResponse += chunk;
          // Log progress every 50 chunks to avoid spam
          if (chunkCount % 50 === 0) console.log(`[WhatsApp] Received ${chunkCount} chunks...`);
        }
      } catch (err) {
        console.error("[WhatsApp] Error during AI streaming:", err);
        throw err;
      }
    })();

    // Race between stream and timeout
    await Promise.race([streamPromise, timeoutPromise]);
    isComplete = true;

    console.log("[WhatsApp] AI response complete, total chunks:", chunkCount, "length:", fullResponse.length);

    // Save conversation history
    const history = (conversation as any)._history || [];
    await chatHistoryStorage.saveChatHistory(convId, history, projectId, tenantId, uid);

    // Send response back to WhatsApp
    if (fullResponse.trim()) {
      const cleanedResponse = cleanWhatsAppResponse(fullResponse);
      
      if (!cleanedResponse.trim()) {
        console.warn("[WhatsApp] WARNING: Response is empty after cleaning. The AI likely executed a tool but didn't generate a text reply.");
        console.warn("[WhatsApp] Full raw response was:", fullResponse);
        return;
      }

      console.log("[WhatsApp] Sending response back to WhatsApp:", cleanedResponse.substring(0, 100) + "...");
      await sendWhatsAppMessage(projectId, whatsappNumber, {
        text: cleanedResponse,
      });
      console.log("[WhatsApp] Response sent successfully");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    console.error("[WhatsApp] Error in AI processing. Message:", errorMessage);
    console.error("[WhatsApp] Error stack:", errorStack);
    throw error;
  }
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(
  projectId: string,
  phone: string,
  message: { text?: string; imageUrl?: string; location?: { lat: number; lng: number } }
): Promise<void> {
  try {
    console.log("[WhatsApp] Sending to WhatsApp:", phone, "message:", message.text?.substring(0, 50) + "...");
    const response = await fetch(`${WHATSAPP_API_URL}/clients/${projectId}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        message: message.text,
        // Add support for other message types as needed
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp] Failed to send WhatsApp message:", errorText);
      throw new Error("Failed to send WhatsApp message");
    }

    console.log("[WhatsApp] Message sent successfully to", phone);
  } catch (error) {
    console.error("[WhatsApp] Error sending message to URL:", `${WHATSAPP_API_URL}/clients/${projectId}/send-message`);
    console.error("[WhatsApp] Error details:", error);
    
    const errorStr = String(error);
    if (errorStr.includes("fetch failed") || errorStr.includes("ECONNREFUSED")) {
      console.error("\x1b[31m[WhatsApp] CRITICAL: Could not connect to WhatsApp Service!\x1b[0m");
      console.error("\x1b[33m[WhatsApp] Please ensure the WhatsApp automation service is running on port 7031.\x1b[0m");
    }
    throw error;
  }
}

/**
 * Handle connection status updates from aimeow
 * This webhook is called when a WhatsApp client connects or disconnects
 */
export async function handleWhatsAppConnectionStatus(req: Request): Promise<Response> {
  try {
    const body = await req.json() as any;
    const { clientId, event, data } = body;

    console.log("[WhatsApp] Connection status update:", { clientId, event, data });

    if (!clientId) {
      return Response.json(
        { success: false, error: "Missing clientId" },
        { status: 400 }
      );
    }

    // The clientId is the projectId
    const projectId = clientId;

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      console.error("[WhatsApp] Project not found:", projectId);
      return Response.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Process the connection event
    switch (event) {
      case "connected":
        // Client successfully connected to WhatsApp
        // Fetch phone number from aimeow API
        try {
          const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "http://localhost:7031/api/v1";
          const response = await fetch(`${WHATSAPP_API_URL}/clients`);

          if (response.ok) {
            const clientsData = await response.json() as any;
            const clientsArray = Array.isArray(clientsData) ? clientsData : clientsData.clients;
            const client = clientsArray?.find((c: any) => c.id === projectId);

            notifyWhatsAppStatus(projectId, {
              connected: true,
              connectedAt: new Date().toISOString(),
              deviceName: client?.osName || "WhatsApp Device",
              phone: client?.phone || null,
            });
          } else {
            notifyWhatsAppStatus(projectId, {
              connected: true,
              connectedAt: new Date().toISOString(),
              deviceName: data?.osName || "WhatsApp Device",
              phone: data?.phone || null,
            });
          }
        } catch (err) {
          console.error("[WhatsApp] Error fetching phone number:", err);
          notifyWhatsAppStatus(projectId, {
            connected: true,
            connectedAt: new Date().toISOString(),
            deviceName: data?.osName || "WhatsApp Device",
            phone: data?.phone || null,
          });
        }
        console.log("[WhatsApp] Client connected:", projectId);
        break;

      case "disconnected":
        // Client disconnected from WhatsApp
        notifyWhatsAppStatus(projectId, {
          connected: false,
        });
        console.log("[WhatsApp] Client disconnected:", projectId);
        break;

      case "qr_code":
        // New QR code available
        if (data?.qrCode) {
          notifyWhatsAppQRCode(projectId, data.qrCode);
        }
        break;

      case "qr_timeout":
        // QR code expired
        notifyWhatsAppQRTimeout(projectId);
        break;

      case "error":
        // Error occurred
        notifyWhatsAppStatus(projectId, {
          error: data?.error || "Unknown error",
        });
        break;

      default:
        console.log("[WhatsApp] Unknown event:", event);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[WhatsApp] Error handling connection status:", error);
    return Response.json(
      { success: false, error: "Failed to handle connection status" },
      { status: 500 }
    );
  }
}

/**
 * Get all WhatsApp conversations for a project
 */
export async function handleGetWhatsAppConversations(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return Response.json(
        { success: false, error: "Missing projectId" },
        { status: 400 }
      );
    }

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Load ChatHistoryStorage to get conversations
    const { ChatHistoryStorage } = await import("../storage/chat-history-storage");
    const chatHistoryStorage = ChatHistoryStorage.getInstance();

    // Get all conversations for this project
    const tenantId = 'default'; // WhatsApp messages use default tenant
    const allConversations = await chatHistoryStorage.listAllConversations(projectId, tenantId);

    // Filter only WhatsApp conversations (convId starts with "wa_")
    const whatsappConversations = allConversations
      .filter((conv) => conv.convId.startsWith("wa_"))
      .map((conv) => {
        // Extract phone number from convId (format: wa_<phone_number>)
        const phoneNumber = conv.convId.substring(3); // Remove "wa_" prefix
        return {
          convId: conv.convId,
          phoneNumber: phoneNumber,
          title: `WhatsApp - ${phoneNumber}`,
          messageCount: conv.messageCount,
          lastUpdatedAt: conv.lastUpdatedAt,
          createdAt: conv.createdAt,
        };
      });

    return Response.json({
      success: true,
      conversations: whatsappConversations,
    });
  } catch (error) {
    console.error("[WhatsApp] Error getting conversations:", error);
    return Response.json(
      { success: false, error: "Failed to get conversations" },
      { status: 500 }
    );
  }
}

/**
 * Delete a WhatsApp conversation
 */
export async function handleDeleteWhatsAppConversation(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const convId = url.searchParams.get("convId");
    const projectId = url.searchParams.get("projectId");

    if (!convId || !projectId) {
      return Response.json(
        { success: false, error: "Missing convId or projectId" },
        { status: 400 }
      );
    }

    // Verify conversation is a WhatsApp conversation
    if (!convId.startsWith("wa_")) {
      return Response.json(
        { success: false, error: "Not a WhatsApp conversation" },
        { status: 400 }
      );
    }

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      return Response.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Delete conversation history
    const { ChatHistoryStorage } = await import("../storage/chat-history-storage");
    const chatHistoryStorage = ChatHistoryStorage.getInstance();

    // Delete the conversation (using WhatsApp user UID)
    const phoneNumber = convId.substring(3);
    const uid = `whatsapp_user_${phoneNumber}`;
    await chatHistoryStorage.deleteChatHistory(convId, projectId, uid);

    console.log("[WhatsApp] Deleted conversation:", convId, "for project:", projectId);

    return Response.json({
      success: true,
      message: "Conversation deleted successfully",
    });
  } catch (error) {
    console.error("[WhatsApp] Error deleting conversation:", error);
    return Response.json(
      { success: false, error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
