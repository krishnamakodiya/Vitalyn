import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, categoryLabel, type AiAnalysis, type EventSource, type HealthRecord, type MemoryCategory, type TimelineEvent } from './lib/api';
import { clearSession, loadSession, saveSession, type Session } from './lib/session';
import {
  assistantReplies,
  demoTimeline,
  demoUser,
  initialChat,
  insights,
  medications,
  metrics,
  overviewSeries,
  prescriptions,
  reminders,
  reports,
  wearableStats,
  type ChatMessage,
} from './lib/demoData';

type View =
  | 'dashboard'
  | 'chat'
  | 'journal'
  | 'timeline'
  | 'medications'
  | 'reports'
  | 'prescriptions'
  | 'wearables'
  | 'doctor'
  | 'reminders'
  | 'insights'
  | 'settings';

type RecordType = 'medications' | 'reports' | 'prescriptions' | 'wearables' | 'reminders' | 'insights' | 'food' | 'sleep' | 'water' | 'activity' | 'symptoms' | 'vitals';

type AuthMode = 'login' | 'register';

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'chat', label: 'AI Health Chat', icon: '✦' },
  { id: 'journal', label: 'Health Journal', icon: '□' },
  { id: 'timeline', label: 'Timeline', icon: '▦' },
  { id: 'medications', label: 'Medications', icon: '◇' },
  { id: 'reports', label: 'Reports', icon: '▤' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '▧' },
  { id: 'wearables', label: 'Wearables', icon: '◌' },
  { id: 'doctor', label: 'Doctor Summary', icon: '✚' },
  { id: 'reminders', label: 'Reminders', icon: '○' },
  { id: 'insights', label: 'Insights', icon: '⌁' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const categories: MemoryCategory[] = ['conversation', 'medical', 'long_term', 'permanent'];
const sources: EventSource[] = ['manual', 'voice_journal', 'doctor_visit', 'report_upload', 'wearable'];

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [view, setView] = useState<View>('dashboard');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [records, setRecords] = useState<Record<RecordType, HealthRecord[]>>(() => emptyRecords());
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!session) {
      setEvents([]);
      setRecords(emptyRecords());
      setChat([]);
      return;
    }
    if (isDemoSession(session)) {
      setEvents(demoTimeline());
      setRecords(demoRecords());
      setChat(initialChat);
      return;
    }
    setEvents([]);
    setRecords(emptyRecords());
    setChat([]);
    void refreshBackendMemory(session.accessToken);
  }, [session]);

  async function refreshBackendMemory(token: string) {
    try {
      const remoteEvents = await api.listTimeline(token);
      setEvents(remoteEvents);
      const recordTypes: RecordType[] = ['medications', 'reports', 'prescriptions', 'wearables', 'reminders', 'insights', 'food', 'sleep', 'water', 'activity', 'symptoms', 'vitals'];
      const recordEntries = await Promise.all(
        recordTypes.map(async (recordType) => [recordType, await api.listRecords(token, recordType)] as const),
      );
      setRecords(() => {
        const next = emptyRecords();
        for (const [recordType, items] of recordEntries) {
          next[recordType] = items;
        }
        return next;
      });
      setError('');
    } catch (err) {
      if (isInvalidTokenError(err)) {
        signOut();
        setError('Session expired. Please log in again.');
        return;
      }
      setError('Backend connection unavailable. Please retry when the API reconnects.');
    }
  }

  async function useDemoAccount() {
    setError('');
    try {
      let nextSession: Session;
      try {
        nextSession = await api.login(demoUser.email, demoUser.password);
      } catch {
        nextSession = await api.register(demoUser.email, demoUser.password, demoUser.name);
      }
      saveSession(nextSession);
      setSession(nextSession);
      setEvents(demoTimeline());
      setRecords(demoRecords());
      setChat(initialChat);
      setView('dashboard');
    } catch {
      const fallback: Session = {
        accessToken: 'offline-demo-token',
        user: { id: 'demo', email: demoUser.email, displayName: demoUser.name, role: 'user' },
      };
      saveSession(fallback);
      setSession(fallback);
      setEvents(demoTimeline());
      setRecords(demoRecords());
      setChat(initialChat);
      setView('dashboard');
      setError('Using sample workspace. Backend login was not reachable.');
    }
  }

  function signOut() {
    clearSession();
    setSession(null);
    setView('dashboard');
    setError('');
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      const email = String(form.get('email') || '');
      const password = String(form.get('password') || '');
      const nextSession =
        authMode === 'register'
          ? await api.register(email, password, String(form.get('displayName') || ''))
          : await api.login(email, password);
      saveSession(nextSession);
      setSession(nextSession);
      setEvents([]);
      setRecords(emptyRecords());
      setChat([]);
      setView('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue.');
    }
  }

  function addLocalEvent(input: {
    category: MemoryCategory;
    source: EventSource;
    title: string;
    details: string;
    linkedEntities: string[];
  }) {
    const created: TimelineEvent = {
      id: crypto.randomUUID(),
      category: input.category,
      source: input.source,
      title: input.title,
      details: input.details,
      occurred_at: new Date().toISOString(),
      linked_entities: input.linkedEntities,
      created_at: new Date().toISOString(),
      archived_at: null,
    };
    setEvents((current) => [created, ...current]);
    if (session?.accessToken && session.accessToken !== 'offline-demo-token') {
      void api.createTimelineEvent(session.accessToken, {
        category: input.category,
        source: input.source,
        title: input.title,
        details: input.details,
        linked_entities: input.linkedEntities,
        occurred_at: created.occurred_at,
      });
    }
  }

  async function addRecord(recordType: RecordType, title: string, details: string) {
    const localRecord: HealthRecord = {
      id: crypto.randomUUID(),
      record_type: recordType,
      title,
      details,
      metadata: {},
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      archived_at: null,
    };
    setRecords((current) => ({
      ...current,
      [recordType]: [localRecord, ...current[recordType]],
    }));
    if (session?.accessToken && session.accessToken !== 'offline-demo-token') {
      try {
        const saved = await api.createRecord(session.accessToken, recordType, { title, details });
        setRecords((current) => ({
          ...current,
          [recordType]: [saved, ...current[recordType].filter((item) => item.id !== localRecord.id)],
        }));
      } catch (err) {
        if (isInvalidTokenError(err)) {
          signOut();
          setError('Session expired. Please log in again.');
          return;
        }
        setError('Saved locally. Backend sync for this record will need retry.');
      }
    }
  }

  async function sendChat(message: string) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChat((current) => [
      ...current,
      { from: 'user', text: message, time: now },
    ]);
    let reply = assistantReplies[chat.length % assistantReplies.length];
    if (session?.accessToken && session.accessToken !== 'offline-demo-token') {
      try {
        const result = await api.aiChat(session.accessToken, message);
        reply = result.reply;
      } catch (error) {
        reply = error instanceof Error ? error.message : 'AI chat is unavailable right now.';
      }
    }
    setChat((current) => [...current, { from: 'assistant', text: reply, time: now }]);
    addLocalEvent({
      category: 'conversation',
      source: 'manual',
      title: 'AI chat note',
      details: message,
      linkedEntities: extractEntities(message),
    });
  }

  if (!session) {
    return (
      <AuthScreen
        mode={authMode}
        error={error}
        onModeChange={setAuthMode}
        onSubmit={authenticate}
        onDemo={useDemoAccount}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((value) => !value)}
      />
    );
  }

  return (
    <main className="product-shell">
      <Sidebar activeView={view} onViewChange={setView} />
      <section className="main-stage">
        <TopBar session={session} darkMode={darkMode} isDemo={isDemoSession(session)} onToggleTheme={() => setDarkMode((value) => !value)} onSignOut={signOut} />
        {error && <div className="status-banner">{error}</div>}
        {view === 'dashboard' && <Dashboard displayName={session.user.displayName} events={events} records={records} isDemo={isDemoSession(session)} onViewChange={setView} onSendChat={sendChat} />}
        {view === 'chat' && <ChatView displayName={session.user.displayName} chat={chat} onSend={sendChat} />}
        {view === 'journal' && (
          <JournalView
            token={session.accessToken}
            onCreate={addLocalEvent}
            onEventCreated={(event) => setEvents((current) => [event, ...current])}
            onRecordsCreated={(createdRecords) => {
              setRecords((current) => {
                const next = { ...current };
                for (const record of createdRecords) {
                  const type = record.record_type as RecordType;
                  if (type in next) next[type] = [record, ...next[type]];
                }
                return next;
              });
            }}
          />
        )}
        {view === 'timeline' && <TimelineView events={events} />}
        {view === 'medications' && <MedicationsView records={records.medications} onAdd={addRecord} />}
        {view === 'reports' && <ReportsView records={records.reports} onAdd={addRecord} token={session.accessToken} onSaved={(record) => setRecords((current) => ({ ...current, reports: [record, ...current.reports] }))} />}
        {view === 'prescriptions' && (
          <PrescriptionsView
            token={session.accessToken}
            records={records.prescriptions}
            onAdd={addRecord}
            onEventCreated={(event) => setEvents((current) => [event, ...current])}
            onReminderCreated={(record) => setRecords((current) => ({ ...current, reminders: [record, ...current.reminders] }))}
          />
        )}
        {view === 'wearables' && <WearablesView records={records.wearables} onAdd={addRecord} />}
        {view === 'doctor' && <DoctorSummaryView events={events} />}
        {view === 'reminders' && <RemindersView records={records.reminders} onAdd={addRecord} token={session.accessToken} onSaved={(record) => setRecords((current) => ({ ...current, reminders: [record, ...current.reminders] }))} />}
        {view === 'insights' && <InsightsView records={records.insights} onAdd={addRecord} />}
        {view === 'settings' && <SettingsView session={session} />}
      </section>
    </main>
  );
}

function AuthScreen({
  mode,
  error,
  darkMode,
  onModeChange,
  onSubmit,
  onDemo,
  onToggleTheme,
}: {
  mode: AuthMode;
  error: string;
  darkMode: boolean;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDemo: () => void;
  onToggleTheme: () => void;
}) {
  return (
    <main className="auth-product">
      <section className="auth-story">
        <Logo />
        <h1>Your Health.<br />Remembered.</h1>
        <p>Vitalyn is your personal AI health companion that remembers your health, understands your patterns, and helps you prepare better questions.</p>
        <div className="auth-visual" aria-hidden="true">
          <div className="heart-core">
            <svg viewBox="0 0 48 48"><path d="M24 40S7 30 7 17.5C7 11.7 11.5 8 16.7 8c3.1 0 5.8 1.5 7.3 4 1.5-2.5 4.2-4 7.3-4C36.5 8 41 11.7 41 17.5 41 30 24 40 24 40Z"/><path d="M12 24h7l3-7 5 14 3-7h6"/></svg>
          </div>
          <span className="float-card secure">Secure<br />Private</span>
          <span className="float-card insights">Health<br />Insights</span>
          <span className="float-card records">Medical<br />Records</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="section-head horizontal">
          <div>
            <h2>{mode === 'register' ? 'Create Account' : 'Welcome Back'}</h2>
            <p>{mode === 'register' ? 'Start your health journey' : 'Log in to continue your health journey'}</p>
          </div>
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {darkMode ? 'L' : 'D'}
          </button>
        </div>
        <form className="form-stack" onSubmit={onSubmit}>
          {mode === 'register' && (
            <label>Display name<input name="displayName" placeholder="Your name" required /></label>
          )}
          <label>Email<input name="email" type="email" placeholder="Enter your email" required /></label>
          <label>Password<input name="password" type="password" placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} minLength={mode === 'register' ? 8 : 1} required /></label>
          {error && <div className="status-banner danger">{error}</div>}
          <button className="primary-btn">{mode === 'register' ? 'Create Account' : 'Log In'}</button>
          <div className="auth-divider"><span>or</span></div>
          <button className="secondary-btn" type="button" onClick={onDemo}>Open sample workspace</button>
          <p className="auth-mode-link">
            {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}
            <button type="button" onClick={() => onModeChange(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </form>
      </section>
      <footer className="auth-footer">
        <span>Your health data is private and secure.</span>
        <span>Privacy Policy</span>
        <span>Terms of Service</span>
      </footer>
    </main>
  );
}

function Sidebar({ activeView, onViewChange }: { activeView: View; onViewChange: (view: View) => void }) {
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="side-nav">
        {navItems.map((item) => (
          <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => onViewChange(item.id)}>
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="premium-card">
        <strong>Private health memory</strong>
        <p>Your records stay organized and ready for review.</p>
      </div>
    </aside>
  );
}

function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48"><path d="M24 40S7 30 7 17.5C7 11.7 11.5 8 16.7 8c3.1 0 5.8 1.5 7.3 4 1.5-2.5 4.2-4 7.3-4C36.5 8 41 11.7 41 17.5 41 30 24 40 24 40Z"/><path d="M12 24h7l3-7 5 14 3-7h6"/></svg>
      </div>
      <div>
        <strong>Vitalyn</strong>
        <span>AI Health Companion</span>
      </div>
    </div>
  );
}

function TopBar({
  session,
  darkMode,
  isDemo,
  onToggleTheme,
  onSignOut,
}: {
  session: Session;
  darkMode: boolean;
  isDemo: boolean;
  onToggleTheme: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="topbar">
      <label className="search-box">
        <span>⌕</span>
        <input placeholder="Search for anything..." />
        <kbd>Ctrl /</kbd>
      </label>
      <div className="top-actions">
        <button className="round-btn" aria-label="Notifications">○{isDemo && <b>3</b>}</button>
        <button className="round-btn" onClick={onToggleTheme}>{darkMode ? 'L' : 'D'}</button>
        <div className="profile-chip">
          <div className="avatar">{initials(session.user.displayName)}</div>
          <span>{session.user.displayName}</span>
        </div>
        <button className="ghost-btn" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

function Dashboard({
  displayName,
  events,
  records,
  isDemo,
  onViewChange,
  onSendChat,
}: {
  displayName: string;
  events: TimelineEvent[];
  records: Record<RecordType, HealthRecord[]>;
  isDemo: boolean;
  onViewChange: (view: View) => void;
  onSendChat: (message: string) => void;
}) {
  return (
    <div className="dashboard">
      <div className="welcome-row">
        <div>
          <h1>Good Morning, {firstName(displayName)}</h1>
          <p>Your health is your greatest wealth. Let us take care of it today.</p>
        </div>
        <button className="outline-btn" onClick={() => onViewChange('chat')}>AI Health Chat</button>
      </div>
      <section className="metric-grid">
        {isDemo ? metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />) : dashboardMetrics(records).map((metric) => <FreshMetricCard key={metric.label} metric={metric} />)}
      </section>
      <section className="dashboard-grid">
        <AssistantCard displayName={displayName} onSend={onSendChat} compact />
        <OverviewChart isDemo={isDemo} />
        <div className="dashboard-stack">
          <ReminderCard records={records.reminders} />
          <RecentLogs events={events} onViewAll={() => onViewChange('timeline')} />
        </div>
        <LatestReports records={records.reports} onViewAll={() => onViewChange('reports')} />
        <div className="doctor-hero">
          <div>
            <h2>One-Tap Doctor Summary</h2>
            <p>Generate your complete health summary and share facts with your doctor before consultation.</p>
            <button className="primary-btn" onClick={() => onViewChange('doctor')}>Generate Summary</button>
          </div>
          <div className="summary-visual">
            <span>Medical History</span><span>Reports</span><span>Medications</span><span>Symptoms</span><span>Allergies</span><span>Lifestyle</span>
          </div>
        </div>
        <HealthInsights records={[...records.insights, ...records.symptoms]} />
      </section>
    </div>
  );
}

function MetricCard({ metric }: { metric: (typeof metrics)[number] }) {
  return (
    <article className={`metric-card ${metric.tone}`}>
      <div className="metric-top">
        <span className="metric-icon">{metric.label.slice(0, 1)}</span>
        <div>
          <p>{metric.label}</p>
          <strong>{metric.value} <small>{metric.unit}</small></strong>
        </div>
        <em>{metric.status}</em>
      </div>
      {metric.sparkline ? <Sparkline values={metric.sparkline} color="currentColor" /> : <div className="progress"><span style={{ width: `${metric.progress}%` }} /></div>}
    </article>
  );
}

const freshMetrics: Array<{ label: string; action: string; value?: string; unit?: string; status?: string }> = [
  { label: 'Health Score', action: 'Add health memories to calculate score.' },
  { label: 'Steps', action: 'Connect a wearable or add steps manually.' },
  { label: 'Sleep', action: 'Record sleep from the journal or wearable.' },
  { label: 'Heart Rate', action: 'Connect wearable data to show trends.' },
  { label: 'Water Intake', action: 'Log hydration to start tracking.' },
];

function FreshMetricCard({ metric }: { metric: (typeof freshMetrics)[number] }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-icon">{metric.label.slice(0, 1)}</span>
        <div>
          <p>{metric.label}</p>
          <strong>{metric.value || '--'} <small>{metric.unit || 'No data'}</small></strong>
        </div>
        <em>{metric.status || 'Ready'}</em>
      </div>
      <div className="notice">{metric.action}</div>
    </article>
  );
}

function dashboardMetrics(records: Record<RecordType, HealthRecord[]>): typeof freshMetrics {
  const latest = (type: RecordType) => records[type]?.[0];
  const metricValue = (record?: HealthRecord, fallback = 'Logged') => {
    if (!record) return { value: '--', unit: 'Awaiting entry' };
    const value = typeof record.metadata.value === 'string' ? record.metadata.value : '';
    const unit = typeof record.metadata.unit === 'string' ? record.metadata.unit : '';
    const match = `${record.title} ${record.details}`.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|liters?|litres?|l|ml|minutes?|mins?|steps?|km|kilometers?)/i);
    if (value) return { value, unit: unit || record.title };
    if (match) return { value: match[1], unit: match[2] };
    return { value: fallback, unit: record.title };
  };
  const sleep = metricValue(latest('sleep'));
  const water = metricValue(latest('water'));
  const activity = metricValue(latest('activity'));
  const score = Math.min(100, 50 + ['food', 'sleep', 'water', 'activity', 'symptoms', 'medications'].filter((type) => records[type as RecordType].length).length * 8);
  return [
    { label: 'Health Score', value: String(score), unit: '/100', status: records.insights.length || records.symptoms.length ? 'Updated' : 'Ready', action: `${records.insights.length + records.symptoms.length} health insights/symptoms logged.` },
    { label: 'Steps', value: activity.value, unit: activity.unit, status: latest('activity') ? 'Logged' : 'Ready', action: latest('activity')?.details || 'Log walks/workouts by voice.' },
    { label: 'Sleep', value: sleep.value, unit: sleep.unit, status: latest('sleep') ? 'Logged' : 'Ready', action: latest('sleep')?.details || 'Record sleep by voice.' },
    { label: 'Water Intake', value: water.value, unit: water.unit, status: latest('water') ? 'Logged' : 'Ready', action: latest('water')?.details || 'Log hydration by voice.' },
    { label: 'Food', value: latest('food') ? 'Logged' : '--', unit: latest('food')?.title || 'Awaiting entry', status: latest('food') ? 'Logged' : 'Ready', action: latest('food')?.details || 'Record meals by voice.' },
  ];
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${60 - value}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 100 65" role="img" aria-label="Heart rate sparkline"><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function OverviewChart({ isDemo }: { isDemo: boolean }) {
  return (
    <article className="panel chart-panel">
      <div className="section-head horizontal">
        <div><h2>Health Overview</h2></div>
        <button className="ghost-btn">This Week</button>
      </div>
      {isDemo ? (
        <>
          <svg viewBox="0 0 600 260" className="chart" role="img" aria-label="Weekly health overview chart">
            {[0, 25, 50, 75, 100].map((line) => <line key={line} x1="42" x2="580" y1={220 - line * 1.7} y2={220 - line * 1.7} />)}
            {overviewSeries.map((series) => (
              <polyline key={series.label} points={series.values.map((value, index) => `${50 + index * 88},${220 - value * 1.7}`).join(' ')} fill="none" stroke={series.color} strokeWidth="4" strokeLinecap="round" />
            ))}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => <text key={day} x={42 + index * 88} y="248">{day}</text>)}
          </svg>
          <div className="legend">
            {overviewSeries.map((series) => <span key={series.label}><i style={{ background: series.color }} />{series.label}</span>)}
          </div>
        </>
      ) : (
        <EmptyState text="No weekly overview yet. Add journal entries or wearable records to build your chart." />
      )}
    </article>
  );
}

function AssistantCard({ displayName, onSend, compact = false }: { displayName?: string; onSend: (message: string) => void; compact?: boolean }) {
  const [message, setMessage] = useState('');
  const quick = ['I am feeling good', 'I have a headache', 'I slept well last night', 'Log my morning walk'];
  function submit(text = message) {
    if (!text.trim()) return;
    onSend(text.trim());
    setMessage('');
  }
  return (
    <article className={`panel assistant-card ${compact ? 'compact' : ''}`}>
      <p className="eyebrow">AI Health Assistant</p>
      <div className="assistant-bubble">Hi {firstName(displayName || demoUser.name)}. I am your AI health companion. How are you feeling today?</div>
      <div className="quick-grid">
        {quick.map((item) => <button key={item} onClick={() => submit(item)}>{item}</button>)}
      </div>
      <form className="chat-input" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type your message..." />
        <button>Send</button>
      </form>
      <small>Your conversations are private and secure.</small>
    </article>
  );
}

function ReminderCard({ records }: { records: HealthRecord[] }) {
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Upcoming Reminders</h2><button className="ghost-btn">View All</button></div>
      <div className="list-stack">
        {records.length === 0 ? <EmptyState text="No reminders yet." /> : records.slice(0, 4).map((item) => <RowItem key={item.id} title={item.title} detail={item.details} meta={String(item.metadata.time || new Date(item.occurred_at).toLocaleString())} />)}
      </div>
    </article>
  );
}

function SymptomsCard({ records }: { records: HealthRecord[] }) {
  const [openId, setOpenId] = useState('');
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Symptoms</h2></div>
      <div className="list-stack">
        {records.length === 0 ? <EmptyState text="No symptoms logged yet." /> : records.slice(0, 5).map((item) => (
          <button className="row-button" key={item.id} onClick={() => setOpenId(openId === item.id ? '' : item.id)}>
            <RowItem title={item.title} detail={openId === item.id ? item.details : new Date(item.occurred_at).toLocaleString()} meta={openId === item.id ? 'Hide' : 'Open'} />
          </button>
        ))}
      </div>
    </article>
  );
}

function RecentLogs({ events, onViewAll }: { events: TimelineEvent[]; onViewAll: () => void }) {
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Recent Logs</h2><button className="ghost-btn" onClick={onViewAll}>View All</button></div>
      <div className="list-stack">{events.length === 0 ? <EmptyState text="No health memories yet." /> : events.slice(0, 4).map((event) => <RowItem key={event.id} title={event.title} detail={new Date(event.occurred_at).toLocaleString()} meta={categoryLabel(event.category)} />)}</div>
    </article>
  );
}

function LatestReports({ records, onViewAll }: { records: HealthRecord[]; onViewAll: () => void }) {
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Latest Reports</h2><button className="ghost-btn" onClick={onViewAll}>View All</button></div>
      <div className="list-stack">{records.length === 0 ? <EmptyState text="No reports uploaded yet." /> : records.slice(0, 4).map((record) => <RowItem key={record.id} title={record.title} detail={record.details} meta={new Date(record.occurred_at).toLocaleDateString()} />)}</div>
    </article>
  );
}

function HealthInsights({ records }: { records: HealthRecord[] }) {
  return (
    <article className="panel insight-card">
      <p className="eyebrow">Health Insights</p>
      <h2>This month</h2>
      {records.length === 0 ? <p>Add health memories to generate insights.</p> : records.slice(0, 3).map((item) => <p key={item.id}>✓ {item.details}</p>)}
      {records.length > 0 && <div className="score-ring"><strong>{Math.min(95, 60 + records.length * 8)}%</strong><span>Consistency Score</span></div>}
    </article>
  );
}

function ChatView({ displayName, chat, onSend }: { displayName: string; chat: ChatMessage[]; onSend: (message: string) => void }) {
  return (
    <section className="view-grid two">
      <article className="panel chat-thread">
        <p className="eyebrow">AI Health Chat</p>
        <h2>Personal health companion</h2>
        {chat.length === 0 ? <EmptyState text="No chat messages yet." /> : chat.map((message, index) => <div key={`${message.time}-${index}`} className={`message ${message.from}`}>{message.text}<time>{message.time}</time></div>)}
      </article>
      <AssistantCard displayName={displayName} onSend={onSend} />
    </section>
  );
}

function JournalView({
  token,
  onCreate,
  onEventCreated,
  onRecordsCreated,
}: {
  token: string;
  onCreate: (input: { category: MemoryCategory; source: EventSource; title: string; details: string; linkedEntities: string[] }) => void;
  onEventCreated: (event: TimelineEvent) => void;
  onRecordsCreated: (records: HealthRecord[]) => void;
}) {
  const [transcript, setTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('Ready to record');
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreate({
      category: form.get('category') as MemoryCategory,
      source: form.get('source') as EventSource,
      title: String(form.get('title')),
      details: String(form.get('details')),
      linkedEntities: String(form.get('entities') || '').split(',').map((item) => item.trim()).filter(Boolean),
    });
    event.currentTarget.reset();
  }

  async function startVoiceCapture() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceStatus('This browser cannot record audio here. Use the sample transcript or type your note.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      setAudioUrl('');
      setAudioBlob(null);
      setRecordingSeconds(0);
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioUrl(URL.createObjectURL(audio));
        setAudioBlob(audio);
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setIsRecording(false);
        setVoiceStatus('Recording saved. Click transcribe to structure it into health memory.');
      };
      recorder.start();
      setIsRecording(true);
      setVoiceStatus('Recording... speak naturally about symptoms, meds, sleep, food, or activity.');
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((value) => value + 1);
      }, 1000);
    } catch {
      setVoiceStatus('Microphone permission was blocked. Allow mic access in the browser or use the sample transcript.');
    }
  }

  function stopVoiceCapture() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }

  async function transcribeRecording() {
    if (!audioBlob) {
      setVoiceStatus('Record audio first, or use the sample transcript.');
      return;
    }
    if (token === 'offline-demo-token') {
      setVoiceStatus('Transcription needs a real account connected to the backend.');
      return;
    }
    setIsProcessing(true);
    setVoiceStatus('Uploading audio for AI transcription...');
    try {
      const result = await api.transcribeVoiceRecording(token, audioBlob);
      setTranscript(result.transcript);
      setVoiceStatus(`Transcribed with ${result.provider} (${result.model}). Review it, then save to memory.`);
    } catch (error) {
      setVoiceStatus(error instanceof Error ? error.message : 'Unable to transcribe recording.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function analyzeVoice() {
    if (!transcript.trim()) return;
    setIsProcessing(true);
    setVoiceStatus('Structuring voice journal...');
    try {
      if (token === 'offline-demo-token') {
        onCreate({
          category: 'conversation',
          source: 'voice_journal',
          title: 'Voice health journal',
          details: `Voice journal transcript: ${transcript}`,
          linkedEntities: extractEntities(transcript),
        });
        setAnalysis({
          title: 'Voice health journal',
          summary: `Voice journal transcript: ${transcript}`,
          extracted_entities: extractEntities(transcript),
          safety_note: 'Sample mode saved this as a timeline memory. Vitalyn does not diagnose.',
          created_event: demoTimeline()[0],
          structured_records: [],
        });
      } else {
        const result = await api.analyzeVoiceJournal(token, transcript);
        setAnalysis(result);
        onEventCreated(result.created_event);
        if (result.structured_records?.length) onRecordsCreated(result.structured_records);
      }
      setVoiceStatus('Saved to health memory.');
      setTranscript('');
    } catch (error) {
      setVoiceStatus(error instanceof Error ? error.message : 'Unable to analyze voice journal.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section className="view-grid two">
      <article className="panel">
        <p className="eyebrow">Health Journal</p>
        <h2>Log a health event</h2>
        <form className="form-stack" onSubmit={submit}>
          <div className="form-grid">
            <label>Category<select name="category">{categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></label>
            <label>Source<select name="source">{sources.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
          </div>
          <label>Title<input name="title" required placeholder="Felt mild headache" /></label>
          <label>Details<textarea name="details" rows={7} required placeholder="Describe what happened, when, and any useful context." /></label>
          <label>Linked entities<input name="entities" placeholder="headache, sleep, hydration" /></label>
          <button className="primary-btn">Save health memory</button>
        </form>
      </article>
      <article className="panel voice-panel">
        <p className="eyebrow">AI Voice Journaling</p>
        <h2>Record once. Vitalyn structures it.</h2>
        <p>{voiceStatus}</p>
        {isRecording && <div className="recording-meter"><span /> Recording {formatDuration(recordingSeconds)}</div>}
        <div className="voice-actions">
          {!isRecording ? (
            <button className="primary-btn" onClick={startVoiceCapture}>Start recording</button>
          ) : (
            <button className="danger-btn" onClick={stopVoiceCapture}>Stop recording</button>
          )}
          <button className="secondary-btn" onClick={() => void transcribeRecording()} disabled={!audioBlob || isProcessing}>Transcribe recording</button>
          <button className="secondary-btn" onClick={() => setTranscript('I took Vitamin D after breakfast, drank less water today, and felt a mild headache at 3 PM.')}>Use sample</button>
        </div>
        {audioUrl && <audio className="audio-player" src={audioUrl} controls />}
        <label>
          Transcript
          <textarea rows={7} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Your voice transcript appears here..." />
        </label>
        <button className="primary-btn" disabled={isProcessing || !transcript.trim()} onClick={analyzeVoice}>
          {isProcessing ? 'Analyzing...' : 'Analyze and save to memory'}
        </button>
        {analysis && <AnalysisCard analysis={analysis} />}
      </article>
    </section>
  );
}

function TimelineView({ events }: { events: TimelineEvent[] }) {
  return (
    <article className="panel">
      <p className="eyebrow">Timeline</p>
      <h2>Chronological health memory</h2>
      <div className="timeline-list">{events.length === 0 ? <EmptyState text="No timeline events yet. Add one from Health Journal." /> : events.map((event) => <TimelineEventRow key={event.id} event={event} />)}</div>
    </article>
  );
}

function TimelineEventRow({ event }: { event: TimelineEvent }) {
  return (
    <div className="timeline-row">
      <div className="timeline-dot" />
      <div>
        <span className="pill">{categoryLabel(event.category)}</span>
        <h3>{event.title}</h3>
        <p>{event.details}</p>
        <div className="entity-row">{event.linked_entities.map((entity) => <span key={entity}>{entity}</span>)}</div>
      </div>
      <time>{new Date(event.occurred_at).toLocaleString()}</time>
    </div>
  );
}

function MedicationsView({ records, onAdd }: { records: HealthRecord[]; onAdd: (recordType: RecordType, title: string, details: string) => void }) {
  return <CollectionView eyebrow="Medications" title="Medication memory" recordType="medications" records={records} onAdd={onAdd} />;
}

function ReportsView({
  records,
  onAdd,
  token,
  onSaved,
}: {
  records: HealthRecord[];
  onAdd: (recordType: RecordType, title: string, details: string) => void;
  token: string;
  onSaved: (record: HealthRecord) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [fileData, setFileData] = useState('');
  const [status, setStatus] = useState('');

  async function handleFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setFileData(await fileToDataUrl(file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || fileName || 'Medical report');
    const details = String(form.get('details') || `Uploaded file: ${fileName}`);
    if (!fileData) {
      onAdd('reports', title, details);
      event.currentTarget.reset();
      return;
    }
    try {
      const saved = await api.createRecord(token, 'reports', {
        title,
        details,
        metadata: { fileName, fileData, source: 'report_upload' },
      });
      onSaved(saved);
      setStatus('Report uploaded and added to dashboard.');
      setFileName('');
      setFileData('');
      event.currentTarget.reset();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to upload report.');
    }
  }

  return (
    <article className="panel">
      <p className="eyebrow">Reports</p>
      <h2>Medical reports</h2>
      <form className="form-stack" onSubmit={submit}>
        <input name="title" required placeholder="Custom report name" />
        <input name="details" placeholder="Notes, lab type, doctor, date" />
        <label className="upload-zone">
          <input type="file" accept="application/pdf,image/*,.pdf" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
          <span>{fileName || 'Add PDF or report image'}</span>
        </label>
        <button className="primary-btn">Save report</button>
      </form>
      {status && <div className="notice">{status}</div>}
      <div className="collection-grid">
        {records.length === 0 ? <EmptyState text="No reports saved yet." /> : records.map((item) => (
          <RowItem key={item.id} title={item.title} detail={item.details} meta={String(item.metadata.fileName || new Date(item.occurred_at).toLocaleDateString())} />
        ))}
      </div>
    </article>
  );
}

function PrescriptionsView({
  token,
  records,
  onAdd,
  onEventCreated,
  onReminderCreated,
}: {
  token: string;
  records: HealthRecord[];
  onAdd: (recordType: RecordType, title: string, details: string) => void;
  onEventCreated: (event: TimelineEvent) => void;
  onReminderCreated: (record: HealthRecord) => void;
}) {
  const [imageName, setImageName] = useState('');
  const [imageData, setImageData] = useState('');
  const [question, setQuestion] = useState('What is this medicine for and what should I ask my doctor?');
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [status, setStatus] = useState('');

  async function handleFile(file: File | null) {
    if (!file) return;
    setImageName(file.name);
    setImageData(await fileToDataUrl(file));
    setStatus('Photo added. Ask a question about the prescription or medicine.');
  }

  async function analyze() {
    if (!imageData || !question.trim()) {
      setStatus('Add a prescription photo and question first.');
      return;
    }
    setStatus('Reading prescription photo...');
    try {
      if (token === 'offline-demo-token') {
        setAnalysis({
          title: 'Prescription photo question',
          summary: `Photo '${imageName}' added. Question: ${question}. Confirm dosage and timing with a clinician or pharmacist.`,
          extracted_entities: ['vitamin', 'tablet', 'medicine'],
          safety_note: 'This is not a diagnosis or prescription. Confirm medicines with a licensed professional.',
          created_event: demoTimeline()[4],
          structured_records: [],
        });
      } else {
        const result = await api.analyzePrescriptionPhoto(token, { imageName, imageData, question });
        setAnalysis(result);
        onEventCreated(result.created_event);
        onReminderCreated(await api.createRecord(token, 'reminders', {
          title: `Review ${imageName || 'prescription'}`,
          details: 'Confirm medicine, dosage, and timing with doctor/pharmacist.',
          metadata: { time: '09:00', source: 'prescription_upload' },
        }));
      }
      setStatus('Saved prescription question to medical memory.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to analyze prescription photo.');
    }
  }

  return (
    <section className="view-grid two">
      <article className="panel">
        <p className="eyebrow">Prescription Intelligence</p>
        <h2>Upload photo and ask about medicine</h2>
        <label className="upload-zone">
          <input type="file" accept="image/*,.pdf" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
          <span>{imageName || 'Add prescription photo, medicine label, or report image'}</span>
        </label>
        {imageData && imageData.startsWith('data:image') && <img className="upload-preview" src={imageData} alt="Prescription preview" />}
        <label>
          Question
          <textarea rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <button className="primary-btn" onClick={analyze}>Ask Vitalyn</button>
        {status && <div className="notice">{status}</div>}
        {analysis && <AnalysisCard analysis={analysis} />}
      </article>
      <CollectionView eyebrow="Medication Understanding" title="Saved prescription records" recordType="prescriptions" records={records} onAdd={onAdd} />
    </section>
  );
}

function WearablesView({ records, onAdd }: { records: HealthRecord[]; onAdd: (recordType: RecordType, title: string, details: string) => void }) {
  return <CollectionView eyebrow="Wearables" title="Connected health signals" recordType="wearables" records={records} onAdd={onAdd} />;
}

function RemindersView({ records, onAdd, token, onSaved }: { records: HealthRecord[]; onAdd: (recordType: RecordType, title: string, details: string) => void; token: string; onSaved: (record: HealthRecord) => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title'));
    const details = String(form.get('details'));
    const time = String(form.get('time'));
    if (token === 'offline-demo-token') onAdd('reminders', title, `${details} • ${time}`);
    else onSaved(await api.createRecord(token, 'reminders', { title, details, metadata: { time } }));
    event.currentTarget.reset();
  }
  return (
    <article className="panel">
      <p className="eyebrow">Reminders</p>
      <h2>Care tasks</h2>
      <form className="inline-add-form" onSubmit={submit}>
        <input name="title" required placeholder="Reminder title" />
        <input name="details" required placeholder="Details" />
        <input name="time" type="time" required />
        <button className="primary-btn">Add</button>
      </form>
      <div className="collection-grid">
        {records.length === 0 ? <EmptyState text="No reminders saved yet." /> : records.map((item) => <RowItem key={item.id} title={item.title} detail={item.details} meta={String(item.metadata.time || new Date(item.occurred_at).toLocaleDateString())} />)}
      </div>
    </article>
  );
}

function InsightsView({ records, onAdd }: { records: HealthRecord[]; onAdd: (recordType: RecordType, title: string, details: string) => void }) {
  return <CollectionView eyebrow="Insights" title="Weekly and monthly patterns" recordType="insights" records={records} onAdd={onAdd} />;
}

function DoctorSummaryView({ events }: { events: TimelineEvent[] }) {
  const grouped = groupEvents(events);
  return (
    <article className="panel doctor-summary">
      <p className="eyebrow">Doctor Summary</p>
      <h2>Facts-only one-tap summary</h2>
      <div className="notice">Vitalyn summarizes stored health facts. It does not diagnose, prescribe, or replace professional medical advice.</div>
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h3>{categoryLabel(category as MemoryCategory)}</h3>
          {items.map((event) => <p key={event.id}><strong>{event.title}:</strong> {event.details}</p>)}
        </section>
      ))}
      <button className="primary-btn">Export PDF Summary</button>
    </article>
  );
}

function SettingsView({ session }: { session: Session }) {
  return (
    <article className="panel">
      <p className="eyebrow">Settings</p>
      <h2>Privacy and account</h2>
      <RowItem title="Account" detail={session.user.email} meta={session.user.role} />
      <RowItem title="Data ownership" detail="User owns all health data. Sharing requires explicit consent." meta="Enabled" />
      <RowItem title="Medical safety" detail="AI can organize and summarize facts, not diagnose or prescribe." meta="Locked" />
    </article>
  );
}

function CollectionView({
  eyebrow,
  title,
  recordType,
  records,
  onAdd,
}: {
  eyebrow: string;
  title: string;
  recordType: RecordType;
  records: HealthRecord[];
  onAdd: (recordType: RecordType, title: string, details: string) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onAdd(recordType, String(form.get('title')), String(form.get('details')));
    event.currentTarget.reset();
  }
  return (
    <article className="panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <form className="inline-add-form" onSubmit={submit}>
        <input name="title" required placeholder={`Add ${recordType.replaceAll('_', ' ')} title`} />
        <input name="details" required placeholder="Details" />
        <button className="primary-btn">Add</button>
      </form>
      <div className="collection-grid">
        {records.length === 0 ? <EmptyState text={`No ${recordType.replaceAll('_', ' ')} saved yet.`} /> : records.map((item) => (
          <RowItem key={item.id} title={item.title} detail={item.details} meta={new Date(item.occurred_at).toLocaleDateString()} />
        ))}
      </div>
    </article>
  );
}

function AnalysisCard({ analysis }: { analysis: AiAnalysis }) {
  return (
    <div className="analysis-card">
      <p className="eyebrow">AI structured output</p>
      <h3>{analysis.title}</h3>
      <p>{analysis.summary}</p>
      {analysis.extracted_entities.length > 0 && (
        <div className="entity-row">
          {analysis.extracted_entities.map((entity) => <span key={entity}>{entity}</span>)}
        </div>
      )}
      <div className="notice">{analysis.safety_note}</div>
    </div>
  );
}

function RowItem({ title, detail, meta, status }: { title: string; detail: string; meta: string; status?: string }) {
  return (
    <div className="row-item">
      <div className="row-icon">{title.slice(0, 1)}</div>
      <div><strong>{title}</strong><p>{detail}</p></div>
      <span>{status || meta}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="notice">{text}</div>;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function emptyRecords(): Record<RecordType, HealthRecord[]> {
  return {
    medications: [],
    reports: [],
    prescriptions: [],
    wearables: [],
    reminders: [],
    insights: [],
    food: [],
    sleep: [],
    water: [],
    activity: [],
    symptoms: [],
    vitals: [],
  };
}

function demoRecords(): Record<RecordType, HealthRecord[]> {
  return {
    medications: medications.map((item) =>
      recordFromSeed('medications', item.name, `${item.dose} • ${item.schedule} • ${item.status}`),
    ),
    reports: reports.map((item) =>
      recordFromSeed('reports', item.title, `${item.summary} (${item.type}, ${item.date})`),
    ),
    prescriptions: prescriptions.map((item) =>
      recordFromSeed('prescriptions', item.medicine, `${item.instruction} • ${item.extractedFrom}`),
    ),
    wearables: wearableStats.map((item) =>
      recordFromSeed('wearables', item.label, item.value),
    ),
    reminders: reminders.map((item) =>
      recordFromSeed('reminders', item.title, `${item.detail} • ${item.time} • ${item.done ? 'Done' : 'Upcoming'}`),
    ),
    insights: insights.map((item, index) =>
      recordFromSeed('insights', `Insight ${index + 1}`, item),
    ),
    food: [],
    sleep: [],
    water: [],
    activity: [],
    symptoms: [],
    vitals: [],
  };
}

function isDemoSession(session: Session): boolean {
  return session.accessToken === 'offline-demo-token' || session.user.email === demoUser.email;
}

function isInvalidTokenError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('invalid access token');
}

function recordFromSeed(recordType: RecordType, title: string, details: string): HealthRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    record_type: recordType,
    title,
    details,
    metadata: { seed: true },
    occurred_at: now,
    created_at: now,
    archived_at: null,
  };
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'there';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

function groupEvents(events: TimelineEvent[]) {
  return events.reduce<Record<string, TimelineEvent[]>>((groups, event) => {
    groups[event.category] = groups[event.category] || [];
    groups[event.category].push(event);
    return groups;
  }, {});
}

function extractEntities(message: string) {
  return message
    .split(/\s|,/)
    .map((item) => item.trim().replace(/[^a-zA-Z0-9-]/g, ''))
    .filter((item) => item.length > 4)
    .slice(0, 4);
}
