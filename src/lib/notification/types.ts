export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'telegram';
export type NotificationKind = 'transaction' | 'balance' | 'system' | 'error' | 'info';
export interface NotificationPayload { userId?: string; kind: NotificationKind; title: string; titleFa: string; body: string; bodyFa: string; channels: NotificationChannel[]; metadata?: Record<string, unknown>; priority?: 'low'|'medium'|'high'|'critical'; amount?: number; currency?: string; }
export interface NotificationResult { channel: NotificationChannel; success: boolean; messageId?: string; error?: string; at: string; }
export interface NotificationConfig { inApp: { enabled: boolean }; email: { enabled: boolean; provider: string }; sms: { enabled: boolean; provider: string }; telegram: { enabled: boolean; botToken?: string; chatId?: string }; }
export function getNotificationConfig(): NotificationConfig {
  return {
    inApp: { enabled: process.env.NOTIF_IN_APP !== 'false' },
    email: { enabled: process.env.NOTIF_EMAIL === 'yes' || process.env.NOTIF_EMAIL === 'true', provider: process.env.EMAIL_PROVIDER || 'mock' },
    sms: { enabled: process.env.NOTIF_SMS === 'yes' || process.env.NOTIF_SMS === 'true', provider: process.env.SMS_PROVIDER || 'mock' },
    telegram: { enabled: process.env.NOTIF_TELEGRAM === 'yes' || process.env.NOTIF_TELEGRAM === 'true', botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID },
  };
}
