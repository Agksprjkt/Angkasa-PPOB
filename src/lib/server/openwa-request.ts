function requiredValue(name: string, value: string | undefined): string {
  const resolved = value?.trim();
  if (!resolved) {
    throw new Error(`Configure ${name} in the server environment or admin dashboard`);
  }
  return resolved;
}

export function createOpenWaTextRequest(
  phoneNumber: string,
  text: string,
  config: { apiUrl?: string; apiKey?: string; sessionId?: string },
) {
  const sessionId = encodeURIComponent(
    requiredValue('OPENWA_SESSION_ID', config.sessionId),
  );
  const url = new URL(
    `/api/sessions/${sessionId}/messages/send-text`,
    requiredValue('OPENWA_API_URL', config.apiUrl),
  );

  return {
    url,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': requiredValue('OPENWA_API_KEY', config.apiKey),
      },
      body: JSON.stringify({
        chatId: `${phoneNumber.replace(/\D/g, '')}@c.us`,
        text,
      }),
    },
  };
}
