# OpenClaw Config Manager - Specification

## 1. Project Overview

### Project Name
OpenClaw Config Manager (openclaw-config-manager)

### Project Type
Cross-platform Desktop Application (Tauri + React + TypeScript)

### Core Feature Summary
A full-featured visual configuration management application for OpenClaw, enabling users to easily configure Gateway settings, AI models, communication channels, tools, automation, and security settings through an intuitive desktop interface.

### Target Users
- OpenClaw users who prefer visual configuration over CLI
- New users going through initial setup
- Advanced users managing multiple configurations

---

## 2. UI/UX Specification

### 2.1 Layout Structure

#### Multi-Window Model
- **Main Window**: Primary configuration interface (1200x800 default, min 900x600)
- **Connection Dialog**: Gateway connection setup modal
- **Confirmation Dialogs**: For destructive actions (reset, delete)
- **Toast Notifications**: Non-blocking status feedback

#### Major Layout Areas
```
┌─────────────────────────────────────────────────────────────┐
│  Title Bar (Custom with native controls)                    │
├──────────────┬──────────────────────────────────────────────┤
│              │  Header                                       │
│   Sidebar    │  - Breadcrumb navigation                     │
│   Navigation │  - Connection status indicator               │
│              ├──────────────────────────────────────────────┤
│   - Dashboard│  Main Content Area                           │
│   - Gateway  │  - Configuration forms                       │
│   - Models   │  - Settings panels                           │
│   - Channels │  - Status displays                           │
│   - Tools    │                                               │
│   - Security │                                               │
│   - System   │                                               │
├──────────────┴──────────────────────────────────────────────┤
│  Footer - Status bar (Gateway status, version)              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Visual Design

#### Color Palette
| Role | Light Mode | Dark Mode |
|------|------------|-----------|
| Primary | #2563EB (Blue 600) | #3B82F6 (Blue 500) |
| Primary Hover | #1D4ED8 (Blue 700) | #60A5FA (Blue 400) |
| Secondary | #64748B (Slate 500) | #94A3B8 (Slate 400) |
| Accent | #F59E0B (Amber 500) | #FBBF24 (Amber 400) |
| Success | #10B981 (Emerald 500) | #34D399 (Emerald 400) |
| Warning | #F59E0B (Amber 500) | #FBBF24 (Amber 400) |
| Error | #EF4444 (Red 500) | #F87171 (Red 400) |
| Background | #FFFFFF | #0F172A (Slate 900) |
| Surface | #F8FAFC (Slate 50) | #1E293B (Slate 800) |
| Border | #E2E8F0 (Slate 200) | #334155 (Slate 700) |
| Text Primary | #0F172A (Slate 900) | #F1F5F9 (Slate 100) |
| Text Secondary | #64748B (Slate 500) | #94A3B8 (Slate 400) |

#### Typography
| Element | Font | Size | Weight |
|---------|------|------|--------|
| App Title | Inter | 18px | 600 |
| Section Header | Inter | 16px | 600 |
| Subsection | Inter | 14px | 500 |
| Body | Inter | 14px | 400 |
| Caption | Inter | 12px | 400 |
| Code/Mono | JetBrains Mono | 13px | 400 |

#### Spacing System
- Base unit: 4px
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px
- Content padding: 24px
- Card padding: 16px
- Form field gap: 16px
- Sidebar width: 240px

#### Visual Effects
- Card shadows: `0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)`
- Elevated shadows: `0 10px 15px -3px rgba(0,0,0,0.1)`
- Border radius: 8px (cards), 6px (inputs), 4px (buttons small)
- Transitions: 150ms ease-out for interactions

### 2.3 Components

#### Navigation Sidebar
- Logo/Title at top
- Nav items with icons
- Active state: primary color background with opacity
- Hover state: surface color background
- Collapse button at bottom

#### Connection Status Indicator
- Green dot + "Connected" when Gateway reachable
- Yellow dot + "Connecting..." during handshake
- Red dot + "Disconnected" when unreachable
- Click to open connection dialog

#### Configuration Cards
- Title with icon
- Description text
- Toggle switch for enable/disable
- Expand button for detailed settings
- Status badge (enabled/disabled/config error)

#### Form Controls
- Text input with label, placeholder, validation message
- Select dropdown with search capability
- Toggle switch for boolean values
- Number input with increment/decrement
- Textarea for multi-line content
- File picker for credentials
- Color picker for theming

#### Buttons
| Type | Style | Use Case |
|------|-------|----------|
| Primary | Filled primary color | Main actions (Save, Connect) |
| Secondary | Outlined | Secondary actions (Cancel, Reset) |
| Danger | Red filled | Destructive actions |
| Ghost | Transparent | Tertiary actions |
| Icon | Icon only | Toolbar actions |

#### Data Display
- Tables for lists (channels, agents)
- Key-value pairs for status info
- Charts for usage statistics
- Code blocks for configuration JSON

#### Feedback
- Toast notifications: success, error, warning, info
- Loading spinners for async operations
- Progress bars for file operations
- Empty states with illustrations

---

## 3. Functional Specification

### 3.1 Core Features

#### F1: Gateway Connection Management
- Connect to local Gateway via WebSocket (ws://127.0.0.1:18789)
- Auto-reconnect with exponential backoff
- Display connection status in real-time
- Support for remote Gateway (Tailscale/SSH tunnel)
- Token-based authentication

#### F2: Dashboard
- Gateway status overview (running, port, uptime)
- Quick stats: active channels, sessions, messages today
- Recent activity log
- Quick access to common actions
- Health check results

#### F3: Gateway Configuration
- Port and bind address settings
- Authentication mode (token/password)
- Reload mode (hot/hybrid/restart/off)
- Tailscale serve/funnel configuration
- Remote Gateway support
- Logging level configuration

#### F4: Model Configuration
- Primary model selection (with provider dropdown)
- Fallback models list
- Model catalog management
- API key management per provider
- Model alias customization
- Image dimension settings
- Usage tracking display

#### F5: Channel Configuration
Supported channels:
- WhatsApp (Baileys)
- Telegram
- Discord
- Slack
- Signal
- Google Chat
- Microsoft Teams
- Matrix
- iMessage (BlueBubbles)
- IRC
- Feishu
- LINE
- Mattermost
- Nostr
- And more...

Each channel provides:
- Enable/disable toggle
- Credential input (tokens, bot names)
- DM policy configuration (pairing/allowlist/open/disabled)
- Allowlist management
- Group settings

#### F6: Tools Configuration
- Browser control (enabled, color, profile)
- Canvas settings
- Node configurations
- Cron job management
- Webhook endpoints
- Skill registry (ClawHub)

#### F7: Security Settings
- Sandbox mode configuration
- Tool allowlist/denylist
- DM policy enforcement
- Session management
- Access control per channel

#### F8: Session Management
- Active sessions display
- Session history
- Manual session reset
- Session retention settings

#### F9: System Settings
- Theme toggle (light/dark/system)
- Language selection (future)
- Auto-start on login
- Notification preferences
- Data directory configuration

### 3.2 User Interactions and Flows

#### Connection Flow
1. App launches → Check for saved Gateway address
2. If no saved address → Show connection dialog
3. User enters address (default: 127.0.0.1:18789) and token
4. Click "Connect" → WebSocket handshake
5. Success → Load dashboard, save address
6. Failure → Show error, allow retry

#### Configuration Flow
1. Navigate to section via sidebar
2. View current settings (loaded from Gateway)
3. Make changes in form
4. Click "Save" → Validate → Send to Gateway
5. Gateway applies config (hot reload if possible)
6. Show success/error toast

#### Channel Setup Flow
1. Navigate to Channels section
2. Select channel to configure
3. Toggle enable → Show credential form
4. Enter credentials (or use file picker)
5. Configure DM policy and allowlist
6. Save → Gateway attempts connection
7. Show connection status (success/failure details)

### 3.3 Data Flow & Processing

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │
│  │   UI Layer  │  │  State Mgmt │  │  WebSocket API │     │
│  │  (Components)│  │   (Zustand) │  │   (Gateway)    │     │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘     │
│         │                │                   │              │
│         └────────────────┴───────────────────┘              │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │ WebSocket
┌──────────────────────────┼───────────────────────────────────┐
│                     Tauri Backend                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │
│  │   Commands  │  │  App State  │  │  File System    │     │
│  │  (IPC Bridge)│  │   (Rust)    │  │   (Config I/O)  │     │
│  └─────────────┘  └─────────────┘  └─────────────────┘     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  OpenClaw Gateway                            │
│              (WebSocket: ws://127.0.0.1:18789)              │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │
│  │ Config RPC  │  │  Status API │  │  Channel Mgmt   │     │
│  └─────────────┘  └─────────────┘  └─────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

#### Key Modules

| Module | Responsibility | Public API |
|--------|---------------|------------|
| `GatewayClient` | WebSocket connection management | `connect()`, `disconnect()`, `send()`, `subscribe()` |
| `ConfigStore` | Application state management | `getConfig()`, `setConfig()`, `subscribe()` |
| `ConfigService` | Gateway config operations | `get()`, `apply()`, `patch()`, `validate()` |
| `ChannelService` | Channel operations | `list()`, `enable()`, `disable()`, `test()` |
| `AuthService` | Authentication | `login()`, `logout()`, `validateToken()` |

### 3.4 Edge Cases

| Scenario | Handling |
|----------|----------|
| Gateway not running | Show connection dialog with helpful message |
| Invalid config | Display validation errors, prevent save |
| Channel connection failure | Show detailed error, suggest troubleshooting |
| WebSocket disconnect | Auto-reconnect, show status, queue pending ops |
| Large config file | Lazy load, pagination for lists |
| Concurrent edits | Optimistic UI, conflict resolution |
| Network timeout | Retry with exponential backoff, user notification |
| Invalid credentials | Clear error message, don't save invalid creds |

---

## 4. Acceptance Criteria

### 4.1 Success Conditions

#### Connection
- [ ] App can connect to Gateway at 127.0.0.1:18789
- [ ] Connection status displays correctly in real-time
- [ ] Auto-reconnect works after disconnection
- [ ] Invalid token shows appropriate error

#### Dashboard
- [ ] Shows Gateway status (running/stopped)
- [ ] Displays active channel count
- [ ] Shows recent activity (last 10 items)
- [ ] Quick actions navigate correctly

#### Gateway Settings
- [ ] All Gateway config fields are editable
- [ ] Changes save successfully
- [ ] Hot reload works for supported settings
- [ ] Restart required settings show notification

#### Model Configuration
- [ ] Can select from major providers (OpenAI, Anthropic, Google)
- [ ] API keys can be entered and masked
- [ ] Fallback models can be configured

#### Channel Configuration
- [ ] All channels listed with enable/disable
- [ ] Each channel has proper credential form
- [ ] DM policy options work correctly
- [ ] Channel status shows connection state

#### Tools Configuration
- [ ] Browser toggle works
- [ ] Cron jobs can be created/edited
- [ ] Webhook endpoints configurable

#### Security Settings
- [ ] Sandbox mode toggles correctly
- [ ] Tool allowlist/denylist editable

#### System Settings
- [ ] Theme toggle switches immediately
- [ ] Settings persist across app restarts

### 4.2 Visual Checkpoints

1. **Initial Launch**: Connection dialog appears with correct styling
2. **Dashboard**: Cards display with proper shadows and spacing
3. **Dark Mode**: All components render correctly in dark theme
4. **Forms**: Labels, inputs, validation messages align properly
5. **Loading States**: Spinners appear during async operations
6. **Error States**: Red error messages display clearly
7. **Success States**: Green toast notifications appear on save

---

## 5. Technical Specifications

### 5.1 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Tauri 2.x |
| Frontend | React 18 + TypeScript |
| Build Tool | Vite |
| State Management | Zustand |
| Styling | Tailwind CSS |
| UI Components | Custom + Headless UI |
| WebSocket | Native WebSocket API |
| IPC | Tauri Commands |

### 5.2 Project Structure

```
openclaw-config-manager/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── common/         # Shared components
│   │   ├── layout/         # Layout components
│   │   └── sections/       # Page-specific components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API services
│   │   ├── gateway.ts      # WebSocket client
│   │   └── config.ts       # Config operations
│   ├── store/              # Zustand stores
│   ├── types/              # TypeScript types
│   ├── utils/              # Utility functions
│   ├── styles/             # Global styles
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
├── src-tauri/              # Tauri backend (Rust)
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── commands.rs     # Tauri commands
│   │   └── lib.rs          # Library
│   ├── Cargo.toml
│   └── tauri.conf.json
├── public/                 # Static assets
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── SPEC.md
```

### 5.3 Gateway API Contract

The app communicates with Gateway via WebSocket RPC:

```typescript
// Request
{
  id: string,
  method: string,  // e.g., "config.get", "config.apply"
  params: object
}

// Response
{
  id: string,
  result?: any,
  error?: {
    code: number,
    message: string
  }
}

// Notifications (server → client)
{
  event: string,  // e.g., "config.changed", "status.updated"
  data: any
}
```

Key methods:
- `config.get` - Get full config
- `config.apply` - Apply full config
- `config.patch` - Patch config
- `status.get` - Get Gateway status
- `channels.list` - List channels
- `sessions.list` - List sessions

---

## 6. Non-Functional Requirements

### Performance
- App launch < 2 seconds
- UI response < 100ms for interactions
- WebSocket message round-trip < 200ms

### Reliability
- Graceful handling of Gateway disconnections
- Auto-save draft config on unexpected close
- Crash recovery with error logging

### Security
- API keys stored securely (not in plain config display)
- Token authentication for Gateway
- No sensitive data in logs

### Accessibility
- Keyboard navigation support
- Proper ARIA labels
- Sufficient color contrast ratios