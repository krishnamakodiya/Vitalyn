import type { EventSource, MemoryCategory, TimelineEvent } from './api';

export type Metric = {
  label: string;
  value: string;
  unit?: string;
  status: string;
  progress: number;
  tone: 'green' | 'blue' | 'purple' | 'red' | 'cyan';
  sparkline?: number[];
};

export type Medication = {
  name: string;
  dose: string;
  schedule: string;
  status: 'Taken' | 'Upcoming' | 'Missed';
};

export type Report = {
  title: string;
  date: string;
  type: 'PDF' | 'Image' | 'Lab';
  summary: string;
};

export type Reminder = {
  title: string;
  detail: string;
  time: string;
  done: boolean;
};

export type ChatMessage = {
  from: 'assistant' | 'user';
  text: string;
  time: string;
};

export const demoUser = {
  name: 'Sunny Shah',
  email: 'sunny.demo@vitalyn.test',
  password: 'vitalyn-demo-2026',
};

export const metrics: Metric[] = [
  { label: 'Health Score', value: '89', unit: '/100', status: 'Up 6%', progress: 89, tone: 'green' },
  { label: 'Steps', value: '8,543', unit: '/10,000', status: '85%', progress: 85, tone: 'blue' },
  { label: 'Sleep', value: '7h 24m', unit: '/8h', status: 'Good', progress: 92, tone: 'purple' },
  { label: 'Heart Rate', value: '72', unit: 'bpm', status: 'Normal', progress: 72, tone: 'red', sparkline: [36, 34, 38, 35, 49, 39, 41, 57, 44, 46, 39, 43] },
  { label: 'Water Intake', value: '1.8 L', unit: '/2.5L', status: '72%', progress: 72, tone: 'cyan' },
];

export const overviewSeries = [
  { label: 'Steps', color: '#2878e8', values: [58, 82, 65, 73, 89, 75, 69] },
  { label: 'Sleep', color: '#8b6de8', values: [31, 48, 48, 43, 60, 47, 53] },
  { label: 'Heart Rate', color: '#f45b6a', values: [15, 22, 20, 24, 33, 23, 26] },
  { label: 'Water', color: '#28b8c7', values: [1, 4, 2, 4, 8, 5, 8] },
];

export const reminders: Reminder[] = [
  { title: 'Vitamin D3', detail: '1 tablet after breakfast', time: '08:00 AM', done: true },
  { title: 'Omega 3', detail: '1 capsule with lunch', time: '01:00 PM', done: false },
  { title: 'Evening Walk', detail: '30 minutes', time: '07:00 PM', done: false },
  { title: 'Meditation', detail: '10 minutes', time: '09:30 PM', done: false },
];

export const medications: Medication[] = [
  { name: 'Vitamin D3', dose: '1000 IU', schedule: 'After breakfast', status: 'Taken' },
  { name: 'Omega 3', dose: '1 capsule', schedule: 'After lunch', status: 'Upcoming' },
  { name: 'Cetirizine', dose: '10 mg', schedule: 'Only if allergy symptoms appear', status: 'Upcoming' },
];

export const reports: Report[] = [
  { title: 'Blood Report - May 2024', date: 'May 20, 2024', type: 'Lab', summary: 'CBC values in normal range. Vitamin D slightly low.' },
  { title: 'X-Ray Chest', date: 'May 18, 2024', type: 'Image', summary: 'Uploaded image report. No AI diagnosis generated.' },
  { title: 'Health Checkup Full Report', date: 'May 10, 2024', type: 'PDF', summary: 'Annual health checkup uploaded for doctor review.' },
  { title: 'ECG Report', date: 'May 05, 2024', type: 'PDF', summary: 'ECG report stored in medical memory.' },
];

export const prescriptions = [
  { medicine: 'Vitamin D3', instruction: 'Take after breakfast for 8 weeks', extractedFrom: 'Prescription - May 2024' },
  { medicine: 'Omega 3', instruction: 'Take once daily after lunch', extractedFrom: 'Prescription - May 2024' },
  { medicine: 'Hydration target', instruction: 'Maintain 2.5L water intake daily', extractedFrom: 'Doctor advice note' },
];

export const wearableStats = [
  { label: 'Average steps', value: '7,920/day' },
  { label: 'Average sleep', value: '7h 12m' },
  { label: 'Resting heart rate', value: '70 bpm' },
  { label: 'Workout streak', value: '5 days' },
];

export const insights = [
  'Maintained a stable sleep schedule this month.',
  'Completed 18 workouts in the last 30 days.',
  'Water intake improved compared with last month.',
  'Mild headaches appear more often on low-sleep days.',
];

export const assistantReplies = [
  'I logged that as a health memory. If symptoms persist or worsen, consider speaking with a healthcare professional.',
  'Noted. I can connect this with your sleep, water intake, and recent medications in the timeline.',
  'I can summarize this factually for your doctor without making a diagnosis.',
];

export const initialChat: ChatMessage[] = [
  { from: 'assistant', text: "Hi Sunny. I'm your AI health companion. How are you feeling today?", time: '09:30 AM' },
];

export function demoTimeline(): TimelineEvent[] {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  return [
    event('conversation', 'voice_journal', 'Felt mild headache', 'Mild headache after long screen time. No other symptoms recorded.', new Date(now.getTime() - 60 * 60 * 1000), ['headache', 'screen time']),
    event('long_term', 'wearable', 'Morning walk', 'Completed a 32 minute morning walk with 4,200 steps.', new Date(now.getTime() - 3 * 60 * 60 * 1000), ['walking', 'steps']),
    event('long_term', 'manual', 'Slept for 7h 24m', 'Sleep was consistent and wake-up energy was good.', new Date(now.getTime() - 7 * 60 * 60 * 1000), ['sleep']),
    event('long_term', 'manual', 'Water intake 500ml', 'Logged 500ml water intake after waking up.', new Date(now.getTime() - 9 * 60 * 60 * 1000), ['hydration']),
    event('medical', 'doctor_visit', 'Vitamin D follow-up', 'Doctor advised Vitamin D3 and Omega 3 supplementation after reviewing reports.', new Date(now.getTime() - 12 * day), ['Vitamin D3', 'Omega 3']),
    event('medical', 'report_upload', 'Blood report uploaded', 'CBC report and Vitamin D values uploaded for doctor review.', new Date(now.getTime() - 18 * day), ['CBC', 'Vitamin D']),
    event('permanent', 'manual', 'Known allergy', 'Reports allergy to penicillin.', new Date(now.getTime() - 120 * day), ['penicillin']),
  ];
}

function event(
  category: MemoryCategory,
  source: EventSource,
  title: string,
  details: string,
  occurredAt: Date,
  linkedEntities: string[],
): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    category,
    source,
    title,
    details,
    occurred_at: occurredAt.toISOString(),
    linked_entities: linkedEntities,
    created_at: new Date().toISOString(),
    archived_at: null,
  };
}

