/**
 * WhatsApp API Handler
 * Handles WhatsApp client management, QR code generation, and message routing
 */

import { ProjectStorage } from "../storage/project-storage";

const WHATSAPP_API_URL = "http://localhost:7031/api/v1";

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
    const response = await fetch(`${WHATSAPP_API_URL}/clients`);

    if (!response.ok) {
      throw new Error("Failed to fetch clients from WhatsApp service");
    }

    const data = await response.json();

    // Find client for this project (client ID would be the projectId)
    const client = data.clients?.find((c: any) => c.id === projectId);

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
        connected: client.is_connected || false,
        connectedAt: client.connected_at,
        deviceName: client.os_name || "WhatsApp Device",
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
    const body = await req.json();
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

    const data = await response.json();

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

    const data = await response.json();

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
    const body = await req.json();
    const { clientId, message: messageData, timestamp } = body;

    console.log("[WhatsApp] Webhook received:", {
      clientId,
      from: messageData?.from,
      type: messageData?.type
    });

    // The clientId is the projectId
    const projectId = clientId;

    // Verify project exists
    const projectStorage = ProjectStorage.getInstance();
    const project = projectStorage.getById(projectId);

    if (!project) {
      console.error("[WhatsApp] Project not found:", projectId);
      return Response.json({ success: false, error: "Project not found" });
    }

    // Extract WhatsApp phone number as UID
    const whatsappNumber = messageData.from;
    const uid = `wa_${whatsappNumber}`;

    // Get or create conversation for this WhatsApp contact
    const { ChatHistoryStorage } = await import("../storage/chat-history-storage");
    const chatHistoryStorage = ChatHistoryStorage.getInstance();

    // Find existing conversation for this UID
    let convId: string | null = null;
    const conversations = await chatHistoryStorage.listAllConversations(projectId);

    // Look for existing conversation with this WhatsApp number in the ID
    for (const conv of conversations) {
      if (conv.convId.includes(whatsappNumber)) {
        convId = conv.convId;
        break;
      }
    }

    // Create new conversation if not found
    if (!convId) {
      convId = `wa_${whatsappNumber}_${Date.now()}`;
      const title = `WhatsApp - ${messageData.pushName || whatsappNumber}`;

      // Initialize conversation with title
      const { setConversationTitle } = await import("../llm/conversation-title-generator");
      await setConversationTitle(convId, projectId, title);

      console.log("[WhatsApp] Created new conversation:", convId);
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

      default:
        messageText = "Sent a message";
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
    // Load conversation and process message through AI
    const { Conversation } = await import("../llm/conversation");
    const { ChatHistoryStorage } = await import("../storage/chat-history-storage");
    const chatHistoryStorage = ChatHistoryStorage.getInstance();

    // Load existing conversation history
    const existingHistory = await chatHistoryStorage.getClientHistory(convId, projectId, uid);

    // Create conversation instance
    const conversation = await Conversation.create({
      projectId,
      userId: uid,
      convId,
      urlParams: { CURRENT_UID: uid },
    });

    // Load history if exists
    if (existingHistory && existingHistory.length > 0) {
      (conversation as any)._history = existingHistory;
    }

    // Process the message through AI
    let fullResponse = "";

    // Add user message with attachments if any
    const userMessage: any = {
      role: "user",
      content: messageText,
    };

    // Add attachments to message if present
    if (attachments.length > 0) {
      const content: any[] = [{ type: "text", text: messageText }];

      for (const attachment of attachments) {
        if (attachment.type === "image") {
          // Download image and convert to base64 for vision
          try {
            const imageResponse = await fetch(attachment.url);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64Image = Buffer.from(imageBuffer).toString("base64");
            const mimeType = attachment.mimeType || "image/jpeg";

            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64Image,
              },
            });
          } catch (error) {
            console.error("[WhatsApp] Error downloading image:", error);
          }
        }
      }

      userMessage.content = content;
    }

    // Send user message to conversation
    await conversation.sendMessage(userMessage, {
      onChunk: (chunk: string) => {
        fullResponse += chunk;
      },
      onComplete: async () => {
        // Save conversation history
        const history = (conversation as any)._history || [];
        await chatHistoryStorage.setClientHistory(convId, history, projectId, uid);

        // Send response back to WhatsApp
        if (fullResponse.trim()) {
          await sendWhatsAppMessage(projectId, whatsappNumber, {
            text: fullResponse,
          });
        }
      },
    });
  } catch (error) {
    console.error("[WhatsApp] Error in AI processing:", error);
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
    const response = await fetch(`${WHATSAPP_API_URL}/clients/${projectId}/send`, {
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
      throw new Error("Failed to send WhatsApp message");
    }

    console.log("[WhatsApp] Message sent to", phone);
  } catch (error) {
    console.error("[WhatsApp] Error sending message:", error);
    throw error;
  }
}
