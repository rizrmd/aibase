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
import { ScriptRuntime } from "../tools/extensions/script-runtime";
import { ExtensionLoader } from "../tools/extensions/extension-loader";
import { getBuiltinTools } from "../tools";

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
      isLID: messageData?.isLID,
      rawChat: messageData?.rawChat,
      rawSender: messageData?.rawSender,
      rawSenderAlt: messageData?.rawSenderAlt,
      type: messageData?.type,
      fromMe: messageData?.fromMe,
      isGroup: messageData?.isGroup,
      pushName: messageData?.pushName,
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

    // CHECK: Is this an unresolved LID?
    // aimeow sends isLID=true when it couldn't resolve the LID to a phone number
    // In this case, we cannot reply because we don't have a valid phone number
    if (messageData.isLID) {
      console.error("[WhatsApp] ❌ CANNOT REPLY: Unresolved LID detected from:", messageData.from);
      console.error("[WhatsApp] Raw fields provided by aimeow:", {
        rawChat: messageData.rawChat,
        rawSender: messageData.rawSender,
        rawSenderAlt: messageData.rawSenderAlt,
      });
      // Return early - we cannot reply to an LID
      return Response.json({
        success: true,
        ignored: true,
        reason: "Unresolved LID - cannot reply",
        from: messageData.from,
      });
    }

    // CHECK: If 'from' field is empty, aimeow couldn't resolve the phone number
    // Try to extract from raw fields, but if we can't find one, we cannot reply
    if (!messageData.from || messageData.from === "") {
      console.warn("[WhatsApp] 'from' field is empty (LID not resolved), attempting extraction from raw fields");
      // Don't return early - try to extract from raw fields below
    }

    // Extract WhatsApp phone number for reply target
    // For LID contacts: rawSenderAlt contains the actual phone number
    // For normal contacts: rawChat/rawSender contain the phone number
    let whatsappNumber: string;

    // PRIORITY 1: rawSenderAlt - this always has the real phone number when available
    // This is critical for LID contacts where Chat/Sender contain the LID
    if (messageData.rawSenderAlt) {
      const rawSenderAltClean = messageData.rawSenderAlt.split('@')[0];
      // Remove device ID suffix if present (e.g., "6281298329132:94" -> "6281298329132")
      const phoneClean = rawSenderAltClean.split(':')[0];
      if (phoneClean.length >= 8 && phoneClean.length < 15) {
        whatsappNumber = phoneClean;
        console.log("[WhatsApp] Using rawSenderAlt for reply target:", whatsappNumber);
      }
    }

    // PRIORITY 2: For DM, use rawChat (only if we haven't found a number yet)
    if (!whatsappNumber && !messageData.isGroup && messageData.rawChat) {
      const rawChatClean = messageData.rawChat.split('@')[0];
      const phoneClean = rawChatClean.split(':')[0];
      // Skip if it's obviously an LID (too long)
      if (phoneClean.length < 15) {
        whatsappNumber = phoneClean;
        console.log("[WhatsApp] Using rawChat for DM reply target:", whatsappNumber);
      }
    }

    // PRIORITY 3: For Group, use rawSender (who sent the message)
    if (!whatsappNumber && messageData.isGroup && messageData.rawSender) {
      const rawSenderClean = messageData.rawSender.split('@')[0];
      const phoneClean = rawSenderClean.split(':')[0];
      if (phoneClean.length < 15) {
        whatsappNumber = phoneClean;
        console.log("[WhatsApp] Using rawSender for Group reply target:", whatsappNumber);
      }
    }

    // FALLBACK: Use 'from' field - but validate it's not an LID
    if (!whatsappNumber) {
      const fromCandidate = messageData.from.replace(/[^0-9]/g, '');
      // Check if it's an obvious LID (too long for a phone number)
      if (fromCandidate.length >= 15) {
        console.error("[WhatsApp] ❌ CANNOT REPLY: 'from' field contains LID, no valid phone number available");
        console.error("[WhatsApp] Message data received:", {
          from: messageData.from,
          rawChat: messageData.rawChat,
          rawSender: messageData.rawSender,
          rawSenderAlt: messageData.rawSenderAlt,
          isLID: messageData.isLID,
        });
        return Response.json({
          success: false,
          error: "Cannot reply - no valid phone number found (LID detected)",
          from: messageData.from,
        });
      }
      whatsappNumber = fromCandidate;
      console.warn("[WhatsApp] WARNING: Using 'from' field as fallback:", whatsappNumber);
    }

    // Ensure format is clean (digits only)
    whatsappNumber = whatsappNumber.replace(/[^0-9]/g, '');

    // FIX: Remove device-specific suffix if present (e.g. "33" or "32" at end of phone number)
    // WhatsApp multi-device sometimes appends device ID to JID
    // Indonesian numbers start with 62 and are usually 11-13 digits max. 
    // If it's longer than 13 digits and ends with common suffixes, trim it.
    if (whatsappNumber.startsWith('62') && whatsappNumber.length > 13) {
      // Check for common suffixes like 33, 2, 1 etc
      // Only trim if the result is still a valid length (10-13 digits)
      
      // Try removing last 2 digits if it ends with known patterns
      if (whatsappNumber.endsWith('33') || whatsappNumber.endsWith('24') || whatsappNumber.endsWith('25')) {
        const trimmed = whatsappNumber.slice(0, -2);
        if (trimmed.length >= 10) {
           console.log(`[WhatsApp] Correcting phone number from ${whatsappNumber} to ${trimmed}`);
           whatsappNumber = trimmed;
        }
      }
      // Try removing last 1 digit (usually device ID)
      else if (whatsappNumber.length > 14) {
         const trimmed = whatsappNumber.slice(0, -1);
         if (trimmed.length >= 10) {
            console.log(`[WhatsApp] trimming extra digit from phone number ${whatsappNumber} to ${trimmed}`);
            whatsappNumber = trimmed;
         }
      }
    }

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
 * Detect and extract inline script JSON from AI response
 * Returns the parsed script object if found, null otherwise
 */
function detectInlineScriptJSON(response: string): { purpose?: string; code: string } | null {
  // Pattern 1: JSON in markdown code block
  const codeBlockMatch = response.match(/```json\s*\n?\s*(\{[\s\S]*?\})\s*\n?```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed.code && typeof parsed.code === 'string') {
        return parsed;
      }
    } catch (e) {
      // Not valid JSON, continue
    }
  }

  // Pattern 2: Raw JSON object with code field
  const jsonMatch = response.match(/^\s*\{[\s\S]*"code"\s*:\s*"[\s\S]*"\s*[\s\S]*\}\s*$/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(response.trim());
      if (parsed.code && typeof parsed.code === 'string') {
        return parsed;
      }
    } catch (e) {
      // Not valid JSON, continue
    }
  }

  return null;
}

/**
 * Execute script using ScriptRuntime with full extension support
 * This gives WhatsApp users access to ALL extensions (search, excel, chart, postgresql, etc.)
 */
async function executeWhatsAppScript(
  scriptData: { purpose?: string; code: string },
  projectId: string,
  tenantId: string,
  whatsappNumber: string
): Promise<string | null> {
  try {
    console.log("[WhatsApp] Executing script with ScriptRuntime:", scriptData.purpose || "Unknown purpose");
    console.log("[WhatsApp] Script code:", scriptData.code.substring(0, 200) + "...");
    
    // Load extensions via ExtensionLoader
    const extensionLoader = new ExtensionLoader();
    
    // Initialize project extensions (copies defaults if needed)
    try {
      await extensionLoader.initializeProject(projectId);
    } catch (initError) {
      console.warn("[WhatsApp] Extension initialization failed (non-critical):", initError);
    }
    
    // Load all enabled extensions
    const extensions = await extensionLoader.loadExtensions(projectId);
    console.log("[WhatsApp] Loaded extensions:", Object.keys(extensions).join(", ") || "none");

    // Create a broadcast function that sends progress to WhatsApp
    const broadcast = (type: "tool_call" | "tool_result", data: any) => {
      if (type === "tool_call" && data.status === "progress" && data.result?.message) {
        // Send progress update to WhatsApp
        sendWhatsAppMessage(projectId, whatsappNumber, {
          text: `⏳ ${data.result.message}`,
        }).catch(console.error);
      }
    };

    // Create ScriptRuntime with extensions
    const runtime = new ScriptRuntime({
      convId: `wa_${whatsappNumber}`,
      projectId,
      userId: `whatsapp_user_${whatsappNumber}`,
      tools: new Map(), // No additional tools registry needed for WA
      broadcast,
      toolCallId: `wa_script_${Date.now()}`,
      purpose: scriptData.purpose || "WhatsApp script",
      code: scriptData.code,
      extensions,
    });

    // Execute the script with timeout
    const result = await Promise.race([
      runtime.execute(scriptData.code),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Script execution timeout (30s)")), 30000)
      ),
    ]);

    console.log("[WhatsApp] Script execution result:", JSON.stringify(result).substring(0, 200));

    // Format result for WhatsApp
    if (result === undefined || result === null) {
      return null;
    }

    // Check for error in result
    if (result && typeof result === 'object' && result.__error) {
      return `❌ ${result.error || 'Unknown error'}`;
    }

    // Use helper for formatting
    const formatted = formatToolResultForWhatsApp("script", { purpose: scriptData.purpose }, result);
    return formatted || String(result);

  } catch (error) {
    console.error("[WhatsApp] Error executing script:", error);
    return `❌ Maaf, terjadi kesalahan saat memproses permintaan: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Format tool execution result for WhatsApp message
 */
function formatToolResultForWhatsApp(toolName: string, args: any, result: any): string | null {
  try {
    // Handle null/undefined results
    if (result === null || result === undefined) {
      return null;
    }

    // Handle error results
    if (typeof result === 'object' && result.error) {
      return `❌ ${result.error}`;
    }

    // Handle string results
    if (typeof result === 'string') {
      // Skip if it looks like internal JSON
      if (result.startsWith('{') || result.startsWith('[')) {
        try {
          const parsed = JSON.parse(result);
          return formatToolResultForWhatsApp(toolName, args, parsed);
        } catch {
          return result;
        }
      }
      return result;
    }

    // Handle array results (e.g., search results)
    if (Array.isArray(result)) {
      if (result.length === 0) {
        return "Tidak ada hasil ditemukan.";
      }

      let formatted = "";
      
      // Add title based on context
      if (args?.purpose) {
        formatted += `📊 *${args.purpose}*\n\n`;
      } else if (args?.search_query) {
        formatted += `🔍 *Hasil pencarian: ${args.search_query}*\n\n`;
      }

      // Format each item in array
      const maxItems = 5; // Limit to avoid too long messages
      const items = result.slice(0, maxItems);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item === 'object' && item !== null) {
          // Format search result style objects
          if (item.title && item.url) {
            formatted += `*${i + 1}. ${item.title}*\n`;
            if (item.description) {
              formatted += `${item.description.substring(0, 150)}${item.description.length > 150 ? '...' : ''}\n`;
            }
            formatted += `🔗 ${item.url}\n\n`;
          } else {
            // Generic object formatting
            for (const [key, value] of Object.entries(item)) {
              if (key.startsWith('_')) continue;
              const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
              formatted += `• ${label}: ${typeof value === 'object' ? JSON.stringify(value) : value}\n`;
            }
            formatted += '\n';
          }
        } else {
          formatted += `• ${item}\n`;
        }
      }

      if (result.length > maxItems) {
        formatted += `\n_...dan ${result.length - maxItems} hasil lainnya_`;
      }

      return formatted.trim() || null;
    }

    // Handle object results - format nicely
    if (typeof result === 'object') {
      let formatted = "";
      
      // Check if it's a search result wrapper with 'results' array
      if (result.results && Array.isArray(result.results)) {
        return formatToolResultForWhatsApp(toolName, args, result.results);
      }
      
      // Add purpose/title if available from args
      if (args?.purpose) {
        formatted += `📊 *${args.purpose}*\n\n`;
      } else if (toolName === 'script') {
        formatted += `📊 *Hasil*\n\n`;
      }

      // Format object properties
      for (const [key, value] of Object.entries(result)) {
        // Skip internal keys
        if (key.startsWith('_') || key === 'raw') continue;
        
        const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
        
        // Handle nested arrays
        if (Array.isArray(value)) {
          if (value.length > 0 && typeof value[0] === 'object') {
            // It's an array of objects, format separately
            const nestedFormatted = formatToolResultForWhatsApp(toolName, { ...args, purpose: label }, value);
            if (nestedFormatted) {
              formatted += nestedFormatted + '\n';
            }
          } else {
            formatted += `• ${label}: ${value.join(', ')}\n`;
          }
        }
        // Handle nested objects
        else if (typeof value === 'object' && value !== null) {
          formatted += `• ${label}: ${JSON.stringify(value)}\n`;
        } else {
          formatted += `• ${label}: ${value}\n`;
        }
      }

      return formatted.trim() || null;
    }

    // Fallback for other types
    return String(result);
  } catch (error) {
    console.error("[WhatsApp] Error formatting tool result:", error);
    return null;
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
    console.log("[WhatsApp] Received attachments:", JSON.stringify(attachments, null, 2));

    // Start typing indicator immediately
    await startWhatsAppTyping(projectId, whatsappNumber);

    // Get ChatHistoryStorage instance (singleton, already imported)
    const chatHistoryStorage = ChatHistoryStorage.getInstance();
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);
    const tenantId = project?.tenant_id ?? 'default';

    // === PRE-PROCESS IMAGE ATTACHMENTS ===
    // Analyze images using Vision API and add descriptions to message
    let enhancedMessage = messageText;
    
    // Notify user if we are processing images
    const hasImages = attachments.some(a => a.type === "image" && a.url);
    if (hasImages) {
      try {
        console.log("[WhatsApp] Sending image analysis notification");
        await sendWhatsAppMessage(projectId, whatsappNumber, {
          text: `⏳ Analyzing image(s)...`,
        }, true); // keep typing
      } catch (err) {
        console.error("[WhatsApp] Failed to send image analysis notification:", err);
      }
    }
    
    for (const attachment of attachments) {
      if (attachment.type === "image" && attachment.url) {
        console.log("[WhatsApp] Processing image attachment:", attachment.url);
        
        try {
          // Download image from URL
          const imgResponse = await fetch(attachment.url);
          if (!imgResponse.ok) {
            console.error("[WhatsApp] Failed to download image:", imgResponse.status);
            continue;
          }
          
          const arrayBuffer = await imgResponse.arrayBuffer();
          const base64Image = Buffer.from(arrayBuffer).toString('base64');
          const mimeType = attachment.mimeType || 'image/jpeg';
          
          console.log("[WhatsApp] Image downloaded, size:", arrayBuffer.byteLength, "bytes");
          
          // Call Vision API to analyze image
          const apiKey = process.env.OPENAI_API_KEY;
          if (!apiKey) {
            console.warn("[WhatsApp] OPENAI_API_KEY not set, skipping image analysis");
            continue;
          }
          
          const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.z.ai/v1';
          const endpoint = `${baseUrl}/chat/completions`;
          
          // Construct prompt based on user message
          const userPrompt = messageText.trim() 
            ? `User's question about this image: "${messageText}"\n\nPlease describe what you see in this image and answer the user's question if applicable.`
            : "Describe this image in detail, including the main subjects, colors, composition, mood, and any text visible in the image.";
          
          console.log("[WhatsApp] Calling Vision API...");
          const visionResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'GLM-4.6V',
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: userPrompt },
                    { 
                      type: 'image_url', 
                      image_url: { url: `data:${mimeType};base64,${base64Image}` } 
                    },
                  ],
                },
              ],
              max_tokens: 1000,
            }),
          });
          
          if (!visionResponse.ok) {
            const errorText = await visionResponse.text();
            console.error("[WhatsApp] Vision API error:", visionResponse.status, errorText);
            continue;
          }
          
          const visionData = await visionResponse.json() as any;
          const description = visionData.choices?.[0]?.message?.content || 
                             visionData.choices?.[0]?.message?.reasoning_content;
          
          if (description) {
            console.log("[WhatsApp] Image analyzed:", description.substring(0, 100) + "...");
            
            // Add image description to message for AI context
            enhancedMessage = `[User sent an image]\n\n**Image Analysis:**\n${description}\n\n${messageText ? `**User's message:** ${messageText}` : "Please respond to the image."}`;
          }
        } catch (err) {
          console.error("[WhatsApp] Error analyzing image:", err);
        }
      }
    }
    
    // Use enhanced message if we processed images
    const finalMessage = enhancedMessage;
    console.log("[WhatsApp] Final message to AI:", finalMessage.substring(0, 200) + "...");

    // Load existing conversation history
    console.log("[WhatsApp] Loading client history...");
    const existingHistory = await chatHistoryStorage.loadChatHistory(convId, projectId, tenantId);
    console.log("[WhatsApp] Loaded history, messages:", existingHistory?.length || 0);

    // Track tool execution results to send if AI response is empty
    const toolResults: Array<{ toolName: string; result: any }> = [];
    let toolResultSent = false;

    // Load built-in tools for this conversation (includes script tool with extensions)
    const tools = getBuiltinTools(convId, projectId, tenantId, uid);
    console.log("[WhatsApp] Loaded tools:", tools.map(t => t.name).join(", "));

    // Create conversation instance with custom hooks for script progress and tool results
    console.log("[WhatsApp] Creating conversation instance...");
    const conversation = await Conversation.create({
      projectId,
      tenantId,
      convId,
      urlParams: { CURRENT_UID: uid },
      tools, // <-- Register tools so AI can call script, todo, memory
      systemPrompt: `You are a helpful AI assistant on WhatsApp. 
      
CRITICAL: YOU HAVE ACCESS TO REAL-TIME EXTERNAL TOOLS.
When asked about current events, weather, stock prices, or specific data, YOU MUST USE THE 'script' TOOL.
DO NOT refuse to answer. DO NOT say you cannot access the internet.
DO NOT say "According to my last update". USE THE TOOLS.

Available Extensions in 'script' tool:
- search.web(query): Search the internet for real-time information
- search.image(query): Search for images
- excel.query(sql): Query CSV/Excel files
- chart.show(options): Generate charts
- image.extract(options): Analyze images

Example: To check weather, call script with:
await search.web("cuaca hari ini di madiun");

Always answer in the same language as the user (Indonesian/English).`,
      hooks: {
        tools: {
          before: async (toolCallId: string, toolName: string, args: any) => {
            // 1. Handle Script Tool Progress (The "Thinking..." equivalent)
            // Check if this is a script tool progress update
            // The script tool injects __status and __result via the broadcast function
            if (toolName === "script" && args.__status === "progress" && args.__result) {
              const progressMessage = args.__result.message;
              console.log("[WhatsApp] Script progress:", progressMessage);

              // Send progress update to WhatsApp
              try {
                await sendWhatsAppMessage(projectId, whatsappNumber, {
                  text: `⏳ ${progressMessage}`,
                }, true); // keep typing
              } catch (err) {
                console.error("[WhatsApp] Failed to send progress message:", err);
                // Don't throw - progress messages are optional
              }
              return;
            }

            // 2. Handle Initial Tool Call (The "Green Box" equivalent)
            // When AI calls a tool, notify user immediately
            let notificationText = "";
            if (toolName === "script") {
              // Extract purpose from script args if available
              const purpose = args.purpose || "Executing custom script...";
              notificationText = `⏳ ${purpose}`;
            } else if (toolName === "search") {
              notificationText = `🔍 Searching for: ${args.query || "data"}...`;
            } else {
              notificationText = `🔧 Using tool: ${toolName}...`;
            }

            console.log("[WhatsApp] Tool started:", toolName, notificationText);
            try {
              await sendWhatsAppMessage(projectId, whatsappNumber, { text: notificationText }, true); // keep typing
            } catch (err) {
              console.error("[WhatsApp] Failed to send tool start notification:", err);
            }
          },
          after: async (toolCallId: string, toolName: string, args: any, result: any) => {
            console.log("[WhatsApp] Tool executed:", toolName, "Result:", JSON.stringify(result).substring(0, 200));
            
            // Store tool result for later use
            toolResults.push({ toolName, result });
            
            // For script tool, immediately send result to user
            // This ensures user gets data even if AI follow-up is empty
            if (toolName === "script" && result && !toolResultSent) {
              console.log("[WhatsApp] Formatting script tool result for WhatsApp...");
              const formattedResult = formatToolResultForWhatsApp(toolName, args, result);
              console.log("[WhatsApp] Formatted result:", formattedResult ? formattedResult.substring(0, 200) + "..." : "NULL");
              if (formattedResult) {
                console.log("[WhatsApp] Sending tool result directly to user");
                try {
                  await sendWhatsAppMessage(projectId, whatsappNumber, {
                    text: formattedResult,
                  });
                  toolResultSent = true;
                  console.log("[WhatsApp] Tool result sent successfully");
                } catch (err) {
                  console.error("[WhatsApp] Failed to send tool result:", err);
                }
              } else {
                console.warn("[WhatsApp] formatToolResultForWhatsApp returned null, not sending");
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
        for await (const chunk of conversation.sendMessage(finalMessage, attachments)) {
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

    // If tool result was already sent, we may not need to send AI's response
    // unless it contains additional useful information
    if (toolResultSent) {
      console.log("[WhatsApp] Tool result already sent to user");
      
      // Check if AI generated a meaningful follow-up response
      if (fullResponse.trim()) {
        const cleanedResponse = cleanWhatsAppResponse(fullResponse);
        
        // Only send if it's not a generic "I will check..." type response
        // and contains actual new information
        const genericPatterns = [
          /saya akan (cek|periksa|lihat|cari)/i,
          /mari saya (cek|periksa|lihat|cari)/i,
          /sedang (mencari|mengecek|memeriksa)/i,
          /baik.*(saya|akan)/i,
          /tentu.*(saya|akan)/i,
        ];
        
        const isGenericResponse = genericPatterns.some(p => p.test(cleanedResponse));
        
        if (cleanedResponse.trim() && !isGenericResponse && cleanedResponse.length > 50) {
          console.log("[WhatsApp] Sending additional AI context:", cleanedResponse.substring(0, 50) + "...");
          await sendWhatsAppMessage(projectId, whatsappNumber, {
            text: cleanedResponse,
          });
        } else {
          console.log("[WhatsApp] Skipping generic/short AI response since tool result already sent");
        }
      }
      return;
    }

    // Send response back to WhatsApp
    if (fullResponse.trim()) {
      // First, check if this is an inline script JSON that needs execution
      const inlineScript = detectInlineScriptJSON(fullResponse);
      
      if (inlineScript) {
        console.log("[WhatsApp] Detected inline script JSON, executing...");
        const scriptResult = await executeWhatsAppScript(inlineScript, projectId, String(tenantId), whatsappNumber);
        
        if (scriptResult) {
          console.log("[WhatsApp] Script executed, sending result:", scriptResult.substring(0, 100) + "...");
          await sendWhatsAppMessage(projectId, whatsappNumber, {
            text: scriptResult,
          });
          console.log("[WhatsApp] Script result sent successfully");
        } else {
          console.warn("[WhatsApp] Script execution returned no result");
        }
        return;
      }
      
      // Normal flow: clean and send response
      const cleanedResponse = cleanWhatsAppResponse(fullResponse);
      
      if (!cleanedResponse.trim()) {
        console.warn("[WhatsApp] WARNING: Response is empty after cleaning. Checking for tool results...");
        console.warn("[WhatsApp] Full raw response was:", fullResponse);
        
        // If we have tool results but didn't send them yet, send now
        if (toolResults.length > 0) {
          for (const { toolName, result } of toolResults) {
            const formatted = formatToolResultForWhatsApp(toolName, {}, result);
            if (formatted) {
              console.log("[WhatsApp] Sending stored tool result as fallback");
              await sendWhatsAppMessage(projectId, whatsappNumber, {
                text: formatted,
              });
              break; // Only send first result to avoid spam
            }
          }
        }
        return;
      }

      console.log("[WhatsApp] Sending response back to WhatsApp:", cleanedResponse.substring(0, 100) + "...");
      await sendWhatsAppMessage(projectId, whatsappNumber, {
        text: cleanedResponse,
      });
      console.log("[WhatsApp] Response sent successfully");
    } else if (toolResults.length > 0) {
      // No AI response but we have tool results
      console.log("[WhatsApp] No AI response, sending tool results");
      for (const { toolName, result } of toolResults) {
        const formatted = formatToolResultForWhatsApp(toolName, {}, result);
        if (formatted) {
          await sendWhatsAppMessage(projectId, whatsappNumber, {
            text: formatted,
          });
          break;
        }
      }
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
 * Start WhatsApp typing indicator
 */
async function startWhatsAppTyping(projectId: string, phone: string): Promise<void> {
  try {
    // Only send typing indicator if phone is valid
    if (!phone || phone.includes('@')) { 
      // Sometimes raw JID is passed, clean it if needed or let endpoint handle it
      // Ideally we pass phone number only
    }

    const response = await fetch(`${WHATSAPP_API_URL}/clients/${projectId}/start-typing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      // Don't log 404s loudly as it might mean feature not supported or client not ready
      if (response.status !== 404) {
        const errorText = await response.text();
        console.warn("[WhatsApp] Failed to start typing indicator:", errorText);
      }
    } else {
      console.log("[WhatsApp] Started typing indicator for", phone);
    }
  } catch (error) {
    console.warn("[WhatsApp] Error starting typing:", error);
  }
}

/**
 * Stop WhatsApp typing indicator
 */
async function stopWhatsAppTyping(projectId: string, phone: string): Promise<void> {
  try {
    const response = await fetch(`${WHATSAPP_API_URL}/clients/${projectId}/stop-typing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[WhatsApp] Failed to stop typing indicator:", errorText);
      // Don't throw - this is not critical
    } else {
      console.log("[WhatsApp] Stopped typing indicator for", phone);
    }
  } catch (error) {
    console.warn("[WhatsApp] Error stopping typing:", error);
    // Don't throw - this is not critical
  }
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(
  projectId: string,
  phone: string,
  message: { text?: string; imageUrl?: string; location?: { lat: number; lng: number } },
  keepTyping: boolean = false
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

    // Stop typing indicator after message is sent, UNLESS keepTyping is true
    // Typing should continue during AI processing and tool execution
    if (!keepTyping) {
      await stopWhatsAppTyping(projectId, phone);
    } else {
      // FORCE restart typing if keepTyping is true
      // Sending a message usually stops the typing indicator on the client side
      console.log("[WhatsApp] keepTyping=true, restarting typing indicator...");
      startWhatsAppTyping(projectId, phone).catch(e => console.warn("[WhatsApp] Failed to restart typing:", e));
    }
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
