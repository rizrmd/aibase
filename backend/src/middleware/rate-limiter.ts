/**
 * Simple in-memory rate limiter for public endpoints
 * Prevents abuse by limiting requests per IP address
 */

interface RequestTimestamp {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private requests: Map<string, RequestTimestamp> = new Map();
  private cleanupInterval: Timer;

  constructor(private windowMs: number = 60000) {
    // Clean up old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request is within rate limit
   * @param ip - Client IP address
   * @param limit - Maximum requests allowed in window
   * @returns true if within limit, false if exceeded
   */
  checkLimit(ip: string, limit: number): boolean {
    const now = Date.now();
    const record = this.requests.get(ip);

    if (!record || now > record.resetTime) {
      // First request or window expired, create new record
      this.requests.set(ip, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    // Check if limit exceeded
    if (record.count >= limit) {
      return false;
    }

    // Increment count
    record.count++;
    return true;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [ip, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(ip);
      }
    }
  }

  /**
   * Clear all rate limit records (for testing)
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Destroy the rate limiter and cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.requests.clear();
  }
}

// Create rate limiter instances for different endpoints
export const embedRateLimiter = new RateLimiter(60000); // 1 minute window
export const embedWsRateLimiter = new RateLimiter(60000); // 1 minute window for WebSocket

/**
 * Get client IP from request headers
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback to connection remote address (not available in Bun request)
  return "unknown";
}
