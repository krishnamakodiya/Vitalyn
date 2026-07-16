import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, categoryLabel, type AiAnalysis, type EventSource, type MemoryCategory, type TimelineEvent } from './lib/api';
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
  const [events, setEvents] = useState<TimelineEvent[]>(() => demoTimeline());
  const [chat, setChat] = useState<ChatMessage[]>(initialChat);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!session) return;
    void refreshBackendMemory(session.accessToken);
  }, [session]);

  async function refreshBackendMemory(token: string) {
    try {
      const remoteEvents = await api.listTimeline(token);
      if (remoteEvents.length > 0) setEvents(mergeEvents(remoteEvents, demoTimeline()));
      setError('');
    } catch {
      setError('Offline demo mode is active. Prototype data is available while the backend reconnects.');
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
      setView('dashboard');
    } catch {
      const fallback: Session = {
        accessToken: 'offline-demo-token',
        user: { id: 'demo', email: demoUser.email, displayName: demoUser.name, role: 'user' },
      };
      saveSession(fallback);
      setSession(fallback);
      setView('dashboard');
      setError('Using offline demo mode. Backend login was not reachable.');
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

  function sendChat(message: string) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const reply = assistantReplies[chat.length % assistantReplies.length];
    setChat((current) => [
      ...current,
      { from: 'user', text: message, time: now },
      { from: 'assistant', text: reply, time: now },
    ]);
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
        <TopBar darkMode={darkMode} onToggleTheme={() => setDarkMode((value) => !value)} onSignOut={signOut} />
        {error && <div className="status-banner">{error}</div>}
        {view === 'dashboard' && <Dashboard events={events} onViewChange={setView} onSendChat={sendChat} />}
        {view === 'chat' && <ChatView chat={chat} onSend={sendChat} />}
        {view === 'journal' && (
          <JournalView
            token={session.accessToken}
            onCreate={addLocalEvent}
            onEventCreated={(event) => setEvents((current) => [event, ...current])}
          />
        )}
        {view === 'timeline' && <TimelineView events={events} />}
        {view === 'medications' && <MedicationsView />}
        {view === 'reports' && <ReportsView />}
        {view === 'prescriptions' && (
          <PrescriptionsView
            token={session.accessToken}
            onEventCreated={(event) => setEvents((current) => [event, ...current])}
          />
        )}
        {view === 'wearables' && <WearablesView />}
        {view === 'doctor' && <DoctorSummaryView events={events} />}
        {view === 'reminders' && <RemindersView />}
        {view === 'insights' && <InsightsView />}
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
        <h1>Vitalyn remembers the whole health story.</h1>
        <p>
          A working prototype for health memory, AI journal capture, medication tracking,
          reports, wearables, doctor summaries, reminders, and insights.
        </p>
        <div className="auth-proof">
          <span>Health timeline</span>
          <span>Doctor mode</span>
          <span>AI companion</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="section-head horizontal">
          <div>
            <p className="eyebrow">Prototype access</p>
            <h2>{mode === 'register' ? 'Create account' : 'Welcome back'}</h2>
          </div>
          <button className="icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
            {darkMode ? 'L' : 'D'}
          </button>
        </div>
        <div className="switcher">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => onModeChange('login')}>Login</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => onModeChange('register')}>Register</button>
        </div>
        <form className="form-stack" onSubmit={onSubmit}>
          {mode === 'register' && (
            <label>Display name<input name="displayName" defaultValue="Sunny Shah" required /></label>
          )}
          <label>Email<input name="email" type="email" defaultValue={demoUser.email} required /></label>
          <label>Password<input name="password" type="password" defaultValue={demoUser.password} minLength={mode === 'register' ? 12 : 1} required /></label>
          {error && <div className="status-banner danger">{error}</div>}
          <button className="primary-btn">{mode === 'register' ? 'Create account' : 'Login'}</button>
          <button className="secondary-btn" type="button" onClick={onDemo}>Open Sunny demo workspace</button>
        </form>
      </section>
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
        <strong>Upgrade to Premium</strong>
        <p>Unlock advanced insights and AI health analysis.</p>
        <button>Upgrade Now</button>
      </div>
    </aside>
  );
}

function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark">♡</div>
      <div>
        <strong>Vitalyn</strong>
        <span>AI Health Companion</span>
      </div>
    </div>
  );
}

function TopBar({
  darkMode,
  onToggleTheme,
  onSignOut,
}: {
  darkMode: boolean;
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
        <button className="round-btn" aria-label="Notifications">○<b>3</b></button>
        <button className="round-btn" onClick={onToggleTheme}>{darkMode ? 'L' : 'D'}</button>
        <div className="profile-chip">
          <div className="avatar">SS</div>
          <span>{demoUser.name}</span>
        </div>
        <button className="ghost-btn" onClick={onSignOut}>Sign out</button>
      </div>
    </header>
  );
}

function Dashboard({
  events,
  onViewChange,
  onSendChat,
}: {
  events: TimelineEvent[];
  onViewChange: (view: View) => void;
  onSendChat: (message: string) => void;
}) {
  return (
    <div className="dashboard">
      <div className="welcome-row">
        <div>
          <h1>Good Morning, Sunny</h1>
          <p>Your health is your greatest wealth. Let us take care of it today.</p>
        </div>
        <button className="outline-btn" onClick={() => onViewChange('chat')}>AI Health Chat</button>
      </div>
      <section className="metric-grid">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </section>
      <section className="dashboard-grid">
        <AssistantCard onSend={onSendChat} compact />
        <OverviewChart />
        <ReminderCard />
        <RecentLogs events={events} onViewAll={() => onViewChange('timeline')} />
        <LatestReports onViewAll={() => onViewChange('reports')} />
        <HealthInsights />
      </section>
      <section className="doctor-hero">
        <div>
          <h2>One-Tap Doctor Summary</h2>
          <p>Generate your complete health summary and share facts with your doctor before consultation.</p>
          <button className="primary-btn" onClick={() => onViewChange('doctor')}>Generate Summary</button>
        </div>
        <div className="summary-visual">
          <span>Medical History</span><span>Reports</span><span>Medications</span><span>Symptoms</span><span>Allergies</span><span>Lifestyle</span>
        </div>
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

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${60 - value}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 100 65" role="img" aria-label="Heart rate sparkline"><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function OverviewChart() {
  return (
    <article className="panel chart-panel">
      <div className="section-head horizontal">
        <div><h2>Health Overview</h2></div>
        <button className="ghost-btn">This Week</button>
      </div>
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
    </article>
  );
}

function AssistantCard({ onSend, compact = false }: { onSend: (message: string) => void; compact?: boolean }) {
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
      <div className="assistant-bubble">Hi Sunny. I am your AI health companion. How are you feeling today?</div>
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

function ReminderCard() {
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Upcoming Reminders</h2><button className="ghost-btn">View All</button></div>
      <div className="list-stack">
        {reminders.map((item) => <RowItem key={item.title} title={item.title} detail={item.detail} meta={item.time} status={item.done ? 'Done' : 'Open'} />)}
      </div>
    </article>
  );
}

function RecentLogs({ events, onViewAll }: { events: TimelineEvent[]; onViewAll: () => void }) {
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Recent Logs</h2><button className="ghost-btn" onClick={onViewAll}>View All</button></div>
      <div className="list-stack">{events.slice(0, 4).map((event) => <RowItem key={event.id} title={event.title} detail={new Date(event.occurred_at).toLocaleString()} meta={categoryLabel(event.category)} />)}</div>
    </article>
  );
}

function LatestReports({ onViewAll }: { onViewAll: () => void }) {
  return (
    <article className="panel">
      <div className="section-head horizontal"><h2>Latest Reports</h2><button className="ghost-btn" onClick={onViewAll}>View All</button></div>
      <div className="list-stack">{reports.map((report) => <RowItem key={report.title} title={report.title} detail={report.date} meta={report.type} />)}</div>
    </article>
  );
}

function HealthInsights() {
  return (
    <article className="panel insight-card">
      <p className="eyebrow">Health Insights</p>
      <h2>This month</h2>
      {insights.slice(0, 3).map((item) => <p key={item}>✓ {item}</p>)}
      <div className="score-ring"><strong>85%</strong><span>Consistency Score</span></div>
    </article>
  );
}

function ChatView({ chat, onSend }: { chat: ChatMessage[]; onSend: (message: string) => void }) {
  return (
    <section className="view-grid two">
      <article className="panel chat-thread">
        <p className="eyebrow">AI Health Chat</p>
        <h2>Personal health companion</h2>
        {chat.map((message, index) => <div key={`${message.time}-${index}`} className={`message ${message.from}`}>{message.text}<time>{message.time}</time></div>)}
      </article>
      <AssistantCard onSend={onSend} />
    </section>
  );
}

function JournalView({
  token,
  onCreate,
  onEventCreated,
}: {
  token: string;
  onCreate: (input: { category: MemoryCategory; source: EventSource; title: string; details: string; linkedEntities: string[] }) => void;
  onEventCreated: (event: TimelineEvent) => void;
}) {
  const [transcript, setTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('Ready to record');
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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

  function startVoiceCapture() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscript('I slept well last night, walked for 30 minutes, and had a mild headache after lunch.');
      setVoiceStatus('Browser speech recognition is not available, so a sample transcript was added.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    setVoiceStatus('Listening...');
    recognition.onresult = (event: any) => {
      const text = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join(' ');
      setTranscript(text);
    };
    recognition.onerror = () => setVoiceStatus('Could not access the microphone. You can type or use the sample.');
    recognition.onend = () => setVoiceStatus('Recording finished. Review and save the transcript.');
    recognition.start();
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
          safety_note: 'Prototype offline mode saved this as a timeline memory. Vitalyn does not diagnose.',
          created_event: demoTimeline()[0],
        });
      } else {
        const result = await api.analyzeVoiceJournal(token, transcript);
        setAnalysis(result);
        onEventCreated(result.created_event);
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
        <div className="voice-actions">
          <button className="primary-btn" onClick={startVoiceCapture}>Record voice</button>
          <button className="secondary-btn" onClick={() => setTranscript('I took Vitamin D after breakfast, drank less water today, and felt a mild headache at 3 PM.')}>Use sample</button>
        </div>
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
      <div className="timeline-list">{events.map((event) => <TimelineEventRow key={event.id} event={event} />)}</div>
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

function MedicationsView() {
  return <CollectionView eyebrow="Medications" title="Medication memory" items={medications.map((item) => ({ title: item.name, detail: `${item.dose} • ${item.schedule}`, meta: item.status }))} />;
}

function ReportsView() {
  return <CollectionView eyebrow="Reports" title="Medical reports" items={reports.map((item) => ({ title: item.title, detail: item.summary, meta: `${item.type} • ${item.date}` }))} />;
}

function PrescriptionsView({
  token,
  onEventCreated,
}: {
  token: string;
  onEventCreated: (event: TimelineEvent) => void;
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
          summary: `Photo '${imageName}' added. Question: ${question}. Prototype found Vitamin D / Omega style medication context. Confirm dosage and timing with a clinician or pharmacist.`,
          extracted_entities: ['vitamin', 'tablet', 'medicine'],
          safety_note: 'This is not a diagnosis or prescription. Confirm medicines with a licensed professional.',
          created_event: demoTimeline()[4],
        });
      } else {
        const result = await api.analyzePrescriptionPhoto(token, { imageName, imageData, question });
        setAnalysis(result);
        onEventCreated(result.created_event);
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
      <CollectionView eyebrow="Medication Understanding" title="Saved prescription examples" items={prescriptions.map((item) => ({ title: item.medicine, detail: item.instruction, meta: item.extractedFrom }))} />
    </section>
  );
}

function WearablesView() {
  return <CollectionView eyebrow="Wearables" title="Connected health signals" items={wearableStats.map((item) => ({ title: item.label, detail: item.value, meta: 'Synced sample data' }))} />;
}

function RemindersView() {
  return <CollectionView eyebrow="Reminders" title="Care tasks" items={reminders.map((item) => ({ title: item.title, detail: item.detail, meta: `${item.time} • ${item.done ? 'Done' : 'Upcoming'}` }))} />;
}

function InsightsView() {
  return <CollectionView eyebrow="Insights" title="Weekly and monthly patterns" items={insights.map((item, index) => ({ title: `Insight ${index + 1}`, detail: item, meta: 'Non-diagnostic pattern' }))} />;
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

function CollectionView({ eyebrow, title, items }: { eyebrow: string; title: string; items: Array<{ title: string; detail: string; meta: string }> }) {
  return (
    <article className="panel">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <div className="collection-grid">{items.map((item) => <RowItem key={`${item.title}-${item.meta}`} {...item} />)}</div>
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function groupEvents(events: TimelineEvent[]) {
  return events.reduce<Record<string, TimelineEvent[]>>((groups, event) => {
    groups[event.category] = groups[event.category] || [];
    groups[event.category].push(event);
    return groups;
  }, {});
}

function mergeEvents(primary: TimelineEvent[], fallback: TimelineEvent[]) {
  const ids = new Set(primary.map((event) => event.id));
  return [...primary, ...fallback.filter((event) => !ids.has(event.id))].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
}

function extractEntities(message: string) {
  return message
    .split(/\s|,/)
    .map((item) => item.trim().replace(/[^a-zA-Z0-9-]/g, ''))
    .filter((item) => item.length > 4)
    .slice(0, 4);
}
