import type { Session } from './session';

export type MemoryCategory = 'permanent' | 'long_term' | 'medical' | 'conversation';
export type EventSource =
  | 'manual'
  | 'voice_journal'
  | 'prescription_ocr'
  | 'report_upload'
  | 'wearable'
  | 'doctor_visit';

export type TimelineEvent = {
  id: string;
  category: MemoryCategory;
  source: EventSource;
  title: string;
  details: string;
  occurred_at: string;
  linked_entities: string[];
  created_at: string;
  archived_at: string | null;
};

export type DoctorSummary = {
  generated_at: string;
  event_count: number;
  disclaimer: string;
  sections: Array<{
    category: MemoryCategory;
    events: TimelineEvent[];
  }>;
};

export type TimelineEventInput = {
  category: MemoryCategory;
  source: EventSource;
  title: string;
  details: string;
  occurred_at: string;
  linked_entities: string[];
};

export type AiAnalysis = {
  title: string;
  summary: string;
  extracted_entities: string[];
  safety_note: string;
  created_event: TimelineEvent;
  structured_records: HealthRecord[];
};

export type HealthRecord = {
  id: string;
  record_type: string;
  title: string;
  details: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  archived_at: string | null;
};

export type VoiceTranscription = {
  transcript: string;
  provider: string;
  model: string;
};

export type AiChatReply = {
  reply: string;
  provider: string;
  model: string;
};

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || '/api/v1';

function localApiFallbackUrl(): string | null {
  if (apiBaseUrl !== '/api/v1') return null;
  if (typeof window === 'undefined') return null;
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return null;
  return 'http://127.0.0.1:8000/api/v1';
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  return requestFrom<T>(apiBaseUrl, path, options, token, true);
}

async function requestFrom<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  token?: string,
  allowLocalFallback = false,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    const fallbackUrl = allowLocalFallback ? localApiFallbackUrl() : null;
    if (fallbackUrl && fallbackUrl !== baseUrl) {
      return requestFrom<T>(fallbackUrl, path, options, token, false);
    }
    throw new Error(
      `Could not reach Vitalyn API at ${baseUrl}. Confirm the backend is running.`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');
  if (!response.ok) {
    const fallbackUrl = allowLocalFallback ? localApiFallbackUrl() : null;
    if (
      fallbackUrl &&
      fallbackUrl !== baseUrl &&
      [404, 405].includes(response.status) &&
      typeof body === 'string'
    ) {
      return requestFrom<T>(fallbackUrl, path, options, token, false);
    }
    let detail = `Request failed (${response.status}) at ${baseUrl}${path}.`;
    if (body && typeof body === 'object' && 'detail' in body) {
      const apiDetail = body.detail;
      if (typeof apiDetail === 'string') {
        detail = apiDetail;
      } else if (Array.isArray(apiDetail)) {
        detail = apiDetail
          .map((item) => {
            if (item && typeof item === 'object' && 'msg' in item) return String(item.msg);
            return String(item);
          })
          .join(' ');
      }
    } else if (typeof body === 'string' && body.trim()) {
      detail = `Request failed (${response.status}) at ${apiBaseUrl}${path}. The API did not return JSON.`;
    }
    throw new Error(detail);
  }
  return body as T;
}

async function upload<T>(
  path: string,
  formData: FormData,
  token: string,
): Promise<T> {
  return uploadTo<T>(apiBaseUrl, path, formData, token, true);
}

async function uploadTo<T>(
  baseUrl: string,
  path: string,
  formData: FormData,
  token: string,
  allowLocalFallback = false,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch {
    const fallbackUrl = allowLocalFallback ? localApiFallbackUrl() : null;
    if (fallbackUrl && fallbackUrl !== baseUrl) {
      return uploadTo<T>(fallbackUrl, path, formData, token, false);
    }
    throw new Error(
      `Could not reach Vitalyn API at ${baseUrl}. Confirm the backend is running.`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');
  if (!response.ok) {
    const fallbackUrl = allowLocalFallback ? localApiFallbackUrl() : null;
    if (
      fallbackUrl &&
      fallbackUrl !== baseUrl &&
      [404, 405].includes(response.status) &&
      typeof body === 'string'
    ) {
      return uploadTo<T>(fallbackUrl, path, formData, token, false);
    }
    let detail = `Request failed (${response.status}) at ${baseUrl}${path}.`;
    if (body && typeof body === 'object' && 'detail' in body) {
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    }
    throw new Error(detail);
  }
  return body as T;
}

function normalizeSession(body: {
  access_token: string;
  user: { id: string; email: string; display_name: string; role: string };
}): Session {
  return {
    accessToken: body.access_token,
    user: {
      id: body.user.id,
      email: body.user.email,
      displayName: body.user.display_name,
      role: body.user.role,
    },
  };
}

export const api = {
  health(): Promise<{ status: string }> {
    return request<{ status: string }>('/health');
  },

  async register(email: string, password: string, displayName: string): Promise<Session> {
    const body = await request<{
      access_token: string;
      user: { id: string; email: string; display_name: string; role: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    return normalizeSession(body);
  },

  async login(email: string, password: string): Promise<Session> {
    const body = await request<{
      access_token: string;
      user: { id: string; email: string; display_name: string; role: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return normalizeSession(body);
  },

  listTimeline(token: string): Promise<TimelineEvent[]> {
    return request<TimelineEvent[]>('/timeline-events', {}, token);
  },

  createTimelineEvent(token: string, input: TimelineEventInput): Promise<TimelineEvent> {
    return request<TimelineEvent>(
      '/timeline-events',
      { method: 'POST', body: JSON.stringify(input) },
      token,
    );
  },

  doctorSummary(token: string): Promise<DoctorSummary> {
    return request<DoctorSummary>('/doctor-summary', {}, token);
  },

  analyzeVoiceJournal(token: string, transcript: string): Promise<AiAnalysis> {
    return request<AiAnalysis>(
      '/ai/voice-journal',
      { method: 'POST', body: JSON.stringify({ transcript }) },
      token,
    );
  },

  aiChat(token: string, message: string): Promise<AiChatReply> {
    return request<AiChatReply>(
      '/ai/chat',
      { method: 'POST', body: JSON.stringify({ message }) },
      token,
    );
  },

  transcribeVoiceRecording(token: string, audio: Blob): Promise<VoiceTranscription> {
    const formData = new FormData();
    const extension = audio.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio', audio, `vitalyn-recording.${extension}`);
    return upload<VoiceTranscription>('/ai/voice-transcription', formData, token);
  },

  analyzePrescriptionPhoto(
    token: string,
    input: { imageName: string; imageData: string; question: string },
  ): Promise<AiAnalysis> {
    return request<AiAnalysis>(
      '/ai/prescription-photo',
      {
        method: 'POST',
        body: JSON.stringify({
          image_name: input.imageName,
          image_data: input.imageData,
          question: input.question,
        }),
      },
      token,
    );
  },

  listRecords(token: string, recordType: string): Promise<HealthRecord[]> {
    return request<HealthRecord[]>(`/records/${recordType}`, {}, token);
  },

  createRecord(
    token: string,
    recordType: string,
    input: { title: string; details: string; metadata?: Record<string, unknown> },
  ): Promise<HealthRecord> {
    return request<HealthRecord>(
      `/records/${recordType}`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          details: input.details,
          metadata: input.metadata ?? {},
        }),
      },
      token,
    );
  },
};

export function categoryLabel(category: MemoryCategory): string {
  const labels: Record<MemoryCategory, string> = {
    permanent: 'Permanent',
    long_term: 'Long-term',
    medical: 'Medical',
    conversation: 'Conversation',
  };
  return labels[category];
}
