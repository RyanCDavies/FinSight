# FinSight Technical Design Specification

## Context (Deployment) Diagram

```mermaid
flowchart LR
    U["User"] --> A["FinSight App"]
    A --> DB["Local SQLite Database"]
    A --> SS["Secure Session Storage"]
    A --> CSV["Windows CSV Picker"]
    A --> OCR["Windows OCR Scanner"]
    A --> LLM["Windows Local LLM Module"]
    LLM --> M["Optional Local Model Files"]
```

## Architecture Layout

```mermaid
flowchart TD
    UI["Presentation Layer<br/>App.js + Screens"] --> SVC["Service Layer<br/>Auth, Financial Data, Budgeting, Import, Analytics, AI"]
    SVC --> DB["Data Layer<br/>SQLite + Secure Store"]
    SVC --> ENG["Analysis Engines"]
    SVC --> PLT["Platform Adapters"]
    PLT --> WIN["Windows Native Modules"]
```

## Component Diagram

- Existing image artifact: [Component Diagram.jpg](./Component%20Diagram.jpg)

```mermaid
flowchart LR
    App["App Shell"] --> Screens["Screens"]
    Screens --> Services["Services"]
    Services --> Database["Database Module"]
    Services --> AI["AI Runtime / Model Manager"]
    Services --> Platform["CSV / OCR / Storage Adapters"]
    Platform --> Native["Windows Native Modules"]
```

## Class Hierarchy and Relationship Diagram

```mermaid
classDiagram
    class App
    class AuthScreen
    class DashboardScreen
    class TransactionsScreen
    class BudgetManagerScreen
    class AssistantScreen
    class ProfileScreen

    class FinancialDataService
    class BudgetingGoalService
    class LocalAIService

    App --> AuthScreen
    App --> DashboardScreen
    App --> TransactionsScreen
    App --> BudgetManagerScreen
    App --> AssistantScreen
    App --> ProfileScreen
    TransactionsScreen --> FinancialDataService
    BudgetManagerScreen --> BudgetingGoalService
    AssistantScreen --> LocalAIService
```

## Sequence Diagrams

### Login Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Auth Screen
    participant Auth as AuthSecurityService
    participant DB as SQLite Database
    participant Session as Secure Store
    User->>UI: Enter email and PIN
    UI->>Auth: login(email, pin)
    Auth->>DB: Query profile by email
    DB-->>Auth: Profile row
    Auth-->>UI: Login result
    UI->>Session: saveSession(profileId)
```

### CSV Import Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Transactions Screen
    participant Import as ImportIntegrationService
    participant DB as SQLite Database
    User->>UI: Select CSV
    UI->>Import: parseCSV(text)
    UI->>Import: importTransactions(profileId, rows)
    Import->>DB: Insert non-duplicate rows
    DB-->>Import: Complete
```

### Assistant Query Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Assistant Screen
    participant AI as LocalAIService
    participant Analytics as ReportingAnalyticsService
    participant DB as SQLite Database
    User->>UI: Ask finance question
    UI->>AI: getAssistantContext(profileId)
    AI->>Analytics: getDashboardData(profileId)
    Analytics->>DB: Read local data
    DB-->>AI: Context
    UI->>AI: ask(message, context)
```
