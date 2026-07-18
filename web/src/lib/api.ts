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

const CLOUD_API_BASE_URL = 'https://vitalyn-api.onrender.com/api/v1';
const LOCAL_DB_KEY = 'vitalyn_pages_db_v1';
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';

function defaultApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    return CLOUD_API_BASE_URL;
  }
  return '/api/v1';
}

export const apiBaseUrl = defaultApiBaseUrl();

function canUseLocalBackend(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
}

type LocalUser = { id: string; email: string; password: string; displayName: string };
type LocalDb = {
  users: LocalUser[];
  records: Record<string, HealthRecord[]>;
  timeline: Record<string, TimelineEvent[]>;
};

function readLocalDb(): LocalDb {
  const raw = localStorage.getItem(LOCAL_DB_KEY);
  if (!raw) return { users: [], records: {}, timeline: {} };
  try {
    return JSON.parse(raw) as LocalDb;
  } catch {
    return { users: [], records: {}, timeline: {} };
  }
}

function writeLocalDb(db: LocalDb): void {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

function localUserId(token: string): string {
  return token.replace(/^local:/, '');
}

function localSession(user: LocalUser): Session {
  return {
    accessToken: `local:${user.id}`,
    user: { id: user.id, email: user.email, displayName: user.displayName, role: 'patient' },
  };
}

async function withLocalFallback<T>(remote: () => Promise<T>, local: () => T | Promise<T>): Promise<T> {
  try {
    return await remote();
  } catch (error) {
    if (canUseLocalBackend()) return local();
    throw error;
  }
}

function localRecord(token: string, recordType: string, input: { title: string; details: string; metadata?: Record<string, unknown> }): HealthRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    record_type: recordType,
    title: input.title,
    details: input.details,
    metadata: input.metadata ?? {},
    occurred_at: now,
    created_at: now,
    archived_at: null,
  };
}

function geminiApiKey(): string {
  return import.meta.env.VITE_GEMINI_API_KEY?.trim() || '';
}

async function fileBlobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(',', 2)[1] ?? '';
}

async function callGemini(parts: Array<Record<string, unknown>>): Promise<string> {
  const key = geminiApiKey();
  if (!key) throw new Error('Gemini API key is not configured for this deployment.');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || 'Gemini request failed.');
  return String(body?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

function parseGeminiJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

async function localAnalyzeTranscript(token: string, transcript: string): Promise<AiAnalysis> {
  const lower = transcript.toLowerCase();
  const items: Array<[string, string]> = [];
  try {
    const text = await callGemini([{ text: `Extract health records from this voice journal. Return only JSON array like [{"type":"water|activity|sleep|food|symptoms|medications|vitals|insights","title":"short title","details":"clean detail"}]. Transcript: ${transcript}` }]);
    const parsed = parseGeminiJson<Array<{ type: string; title: string; details: string }>>(text);
    parsed?.forEach((item) => items.push([item.type, item.title || item.type]));
  } catch {
    // keep local parser fallback
  }
  if (!items.length && /water|drink|hydr/.test(lower)) items.push(['water', 'Hydration']);
  if (!items.length && /walk|step|run|exercise|workout/.test(lower)) items.push(['activity', 'Activity']);
  if (!items.length && /sleep|slept|wake|woke/.test(lower)) items.push(['sleep', 'Sleep']);
  if (!items.length && /ate|food|meal|breakfast|lunch|dinner/.test(lower)) items.push(['food', 'Food']);
  if (!items.length && /pain|headache|fever|cough|symptom/.test(lower)) items.push(['symptoms', 'Symptoms']);
  if (!items.length) items.push(['insights', 'Health note']);

  const db = readLocalDb();
  const userId = localUserId(token);
  const records = items.map(([type, title]) => localRecord(token, type, { title, details: transcript, metadata: { source: 'voice_journal' } }));
  db.records[userId] = [...(db.records[userId] ?? []), ...records];
  const event = {
    id: crypto.randomUUID(),
    category: 'conversation' as MemoryCategory,
    source: 'voice_journal' as EventSource,
    title: 'Voice health journal',
    details: transcript,
    occurred_at: new Date().toISOString(),
    linked_entities: items.map((item) => item[0]),
    created_at: new Date().toISOString(),
    archived_at: null,
  };
  db.timeline[userId] = [event, ...(db.timeline[userId] ?? [])];
  writeLocalDb(db);
  return {
    title: 'Voice health journal',
    summary: transcript,
    extracted_entities: items.map((item) => item[0]),
    safety_note: geminiApiKey() ? 'Structured with Gemini and saved locally in this browser.' : 'Saved locally in this browser because the cloud backend is unavailable.',
    created_event: event,
    structured_records: records,
  };
}

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
      detail = `Request failed (${response.status}) at ${baseUrl}${path}. The API did not return JSON.`;
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
    return withLocalFallback(
      async () => {
        const body = await request<{
          access_token: string;
          user: { id: string; email: string; display_name: string; role: string };
        }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, display_name: displayName }),
        });
        return normalizeSession(body);
      },
      () => {
        const db = readLocalDb();
        const existing = db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
        const user = existing ?? { id: crypto.randomUUID(), email, password, displayName: displayName || email.split('@')[0] };
        if (!existing) {
          db.users.push(user);
          writeLocalDb(db);
        }
        return localSession(user);
      },
    );
  },

  async login(email: string, password: string): Promise<Session> {
    return withLocalFallback(
      async () => {
        const body = await request<{
          access_token: string;
          user: { id: string; email: string; display_name: string; role: string };
        }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        return normalizeSession(body);
      },
      () => {
        const user = readLocalDb().users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password);
        if (!user) throw new Error('No local account found. Create account first.');
        return localSession(user);
      },
    );
  },

  listTimeline(token: string): Promise<TimelineEvent[]> {
    return withLocalFallback(
      () => request<TimelineEvent[]>('/timeline-events', {}, token),
      () => readLocalDb().timeline[localUserId(token)] ?? [],
    );
  },

  createTimelineEvent(token: string, input: TimelineEventInput): Promise<TimelineEvent> {
    return withLocalFallback(
      () => request<TimelineEvent>('/timeline-events', { method: 'POST', body: JSON.stringify(input) }, token),
      () => {
        const db = readLocalDb();
        const userId = localUserId(token);
        const event = { ...input, id: crypto.randomUUID(), created_at: new Date().toISOString(), archived_at: null };
        db.timeline[userId] = [event, ...(db.timeline[userId] ?? [])];
        writeLocalDb(db);
        return event;
      },
    );
  },

  doctorSummary(token: string): Promise<DoctorSummary> {
    return request<DoctorSummary>('/doctor-summary', {}, token);
  },

  analyzeVoiceJournal(token: string, transcript: string): Promise<AiAnalysis> {
    return withLocalFallback(
      () => request<AiAnalysis>('/ai/voice-journal', { method: 'POST', body: JSON.stringify({ transcript }) }, token),
      () => localAnalyzeTranscript(token, transcript),
    );
  },

  aiChat(token: string, message: string): Promise<AiChatReply> {
    return withLocalFallback(
      () => request<AiChatReply>('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }, token),
      async () => ({
        reply: await callGemini([{ text: `You are Vitalyn, a careful AI health companion. Answer briefly and safely. User: ${message}` }]),
        provider: 'gemini',
        model: GEMINI_MODEL,
      }),
    );
  },

  transcribeVoiceRecording(token: string, audio: Blob): Promise<VoiceTranscription> {
    const formData = new FormData();
    const extension = audio.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio', audio, `vitalyn-recording.${extension}`);
    return withLocalFallback(
      () => upload<VoiceTranscription>('/ai/voice-transcription', formData, token),
      async () => ({
        transcript: await callGemini([
          { text: 'Transcribe this health journal audio. Return only the transcript.' },
          { inline_data: { mime_type: audio.type || 'audio/webm', data: await fileBlobToBase64(audio) } },
        ]),
        provider: 'gemini',
        model: GEMINI_MODEL,
      }),
    );
  },

  analyzePrescriptionPhoto(
    token: string,
    input: { imageName: string; imageData: string; question: string },
  ): Promise<AiAnalysis> {
    return withLocalFallback(
      () => request<AiAnalysis>(
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
      ),
      async () => {
        const [header, data] = input.imageData.split(',', 2);
        const mimeType = header?.match(/^data:(.*?);/)?.[1] || 'image/jpeg';
        const summary = await callGemini([
          { text: `Read this prescription/report image and answer safely. Question: ${input.question}` },
          { inline_data: { mime_type: mimeType, data } },
        ]);
        const event = {
          id: crypto.randomUUID(),
          category: 'medical' as MemoryCategory,
          source: 'prescription_ocr' as EventSource,
          title: input.imageName || 'Prescription upload',
          details: summary,
          occurred_at: new Date().toISOString(),
          linked_entities: [],
          created_at: new Date().toISOString(),
          archived_at: null,
        };
        return {
          title: event.title,
          summary,
          extracted_entities: [],
          safety_note: 'Gemini can make mistakes. Confirm all medicines and dosage with a doctor/pharmacist.',
          created_event: event,
          structured_records: [],
        };
      },
    );
  },

  listRecords(token: string, recordType: string): Promise<HealthRecord[]> {
    return withLocalFallback(
      () => request<HealthRecord[]>(`/records/${recordType}`, {}, token),
      () => (readLocalDb().records[localUserId(token)] ?? []).filter((record) => record.record_type === recordType),
    );
  },

  createRecord(
    token: string,
    recordType: string,
    input: { title: string; details: string; metadata?: Record<string, unknown> },
  ): Promise<HealthRecord> {
    return withLocalFallback(
      () => request<HealthRecord>(
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
      ),
      () => {
        const db = readLocalDb();
        const userId = localUserId(token);
        const record = localRecord(token, recordType, input);
        db.records[userId] = [record, ...(db.records[userId] ?? [])];
        writeLocalDb(db);
        return record;
      },
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
