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

    // Get QR code from aimeow API
    const response = await fetch(`${WHATSAPP_API_URL}/clients/${clientId}/qr/png`);

    if (!response.ok) {
      throw new Error("Failed to fetch QR code");
    }

    const data = await response.json();

    return Response.json({
      success: true,
      qrCodeDataUrl: data.qr_code_png || data.qr_code_data_url,
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
    const conversationStorage = (await import("../storage/conversation-storage")).ConversationStorage.getInstance();

    // Find existing conversation for this UID
    let convId: string | null = null;
    const conversations = conversationStorage.listByProject(projectId);

    // Look for existing conversation with this WhatsApp number in the title or metadata
    for (const conv of conversations) {
      if (conv.title?.includes(whatsappNumber) || conv.id.includes(whatsappNumber)) {
        convId = conv.id;
        break;
      }
    }

    // Create new conversation if not found
    if (!convId) {
      convId = `wa_${whatsappNumber}_${Date.now()}`;
      const title = `WhatsApp - ${messageData.pushName || whatsappNumber}`;

      conversationStorage.create({
        id: convId,
        projectId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

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
    // This will be handled by the WebSocket system
    // For now, we store the webhook data and trigger processing
    console.log("[WhatsApp] Processing message:", {
      projectId,
      convId,
      from: whatsappNumber,
      messageText,
      attachments,
    });

    // Send response back to WhatsApp
    // We'll implement this in the next step
    if (messageText) {
      await sendWhatsAppMessage(projectId, whatsappNumber, {
        text: "Message received! Processing with AI...",
      });
    }

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
