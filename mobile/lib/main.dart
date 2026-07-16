import 'package:flutter/material.dart';

void main() {
  runApp(const VitalynApp());
}

class VitalynApp extends StatelessWidget {
  const VitalynApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vitalyn',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF146C63),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class HealthEvent {
  const HealthEvent({
    required this.time,
    required this.category,
    required this.title,
    required this.details,
  });

  final String time;
  final String category;
  final String title;
  final String details;
}

const sampleEvents = [
  HealthEvent(
    time: 'Today, 8:00 AM',
    category: 'Long-term',
    title: 'Sleep note',
    details: 'Slept seven hours and woke up refreshed.',
  ),
  HealthEvent(
    time: 'Today, 7:30 PM',
    category: 'Conversation',
    title: 'Symptom journal',
    details: 'Mild headache after work. No other symptoms recorded.',
  ),
  HealthEvent(
    time: 'Jul 12',
    category: 'Medical',
    title: 'Blood report uploaded',
    details: 'CBC report saved for doctor review.',
  ),
];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      const JournalPage(),
      const TimelinePage(),
      const DoctorModePage(),
    ];

    return Scaffold(
      body: SafeArea(child: pages[selectedIndex]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: (index) {
          setState(() => selectedIndex = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.mic_none),
            selectedIcon: Icon(Icons.mic),
            label: 'Journal',
          ),
          NavigationDestination(
            icon: Icon(Icons.timeline),
            label: 'Timeline',
          ),
          NavigationDestination(
            icon: Icon(Icons.medical_information_outlined),
            selectedIcon: Icon(Icons.medical_information),
            label: 'Doctor',
          ),
        ],
      ),
    );
  }
}

class JournalPage extends StatelessWidget {
  const JournalPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Vitalyn', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(
          'Daily health journal',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.mic),
          label: const Text('Record voice note'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.edit_note),
          label: const Text('Add manual note'),
        ),
        const SizedBox(height: 28),
        Text('Recent memory', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        for (final event in sampleEvents.take(2)) EventTile(event: event),
      ],
    );
  }
}

class TimelinePage extends StatelessWidget {
  const TimelinePage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Timeline', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 16),
        for (final event in sampleEvents) EventTile(event: event),
      ],
    );
  }
}

class DoctorModePage extends StatelessWidget {
  const DoctorModePage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Doctor Mode', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(
          'Facts only. No speculative medical conclusions.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: () {},
          icon: const Icon(Icons.picture_as_pdf),
          label: const Text('Generate summary'),
        ),
        const SizedBox(height: 24),
        Text('Summary preview', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        for (final event in sampleEvents) EventTile(event: event),
      ],
    );
  }
}

class EventTile extends StatelessWidget {
  const EventTile({required this.event, super.key});

  final HealthEvent event;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    event.category,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
                Text(event.time, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 8),
            Text(event.title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(event.details),
          ],
        ),
      ),
    );
  }
}

