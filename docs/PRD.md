# Product Requirements Document

## Product

Vitalyn - Personal AI Health Companion

## Goals

- Build a lifelong health memory.
- Improve doctor-patient communication.
- Enable early risk awareness.
- Simplify health record management.

## Target Users

- Students
- Working professionals
- Families
- Elderly
- Chronic disease patients
- Fitness enthusiasts

## Core Features

1. Daily AI voice journaling
2. Lifelong Health Memory
3. Wearable integration
4. Prescription Intelligence
5. Medication Memory
6. Medical report storage
7. Symptom Timeline
8. Doctor Mode (One-Tap Summary)
9. Early Risk Detection
10. Personalized AI Nurse
11. Weekly/Monthly insights

## Functional Requirements

- Voice input
- OCR for prescriptions
- Health timeline
- AI chat
- PDF doctor summary
- Secure cloud sync

## Non-functional Requirements

- Encryption
- Fast response under two seconds for common actions
- Scalable architecture
- Offline journal queue

## Current Implementation Notes

- The first backend slice includes API health checks, user registration/login, JWT auth, authenticated timeline/doctor-summary APIs, archive semantics, and Alembic migrations.
- The product is pivoting to a website-first client before mobile so the core health-memory workflow can be validated faster.
- The Flutter shell remains in the repo but mobile is now scheduled after the web foundation.
- The current website prototype includes a full Sunny Shah demo workspace with dashboard metrics, AI health chat, journal, timeline, medications, reports, prescriptions, wearables, doctor summary, reminders, insights, and settings.
