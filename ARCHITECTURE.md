# Technical Architecture: Data Consistency & Sync

## 1. The "Vault" Structure (Google Drive)

```text
/Memento_Box
├── inventory.json      # The Single Source of Truth (SSOT)
├── lock.json           # Concurrency control
└── /Media
    ├── {uuid}.jpg      # Original photos
    └── {uuid}.mp3      # Audio narrations
```

## 2. Concurrency Control (`lock.json`)

Since we lack a real backend, we use a cooperative locking mechanism on Google Drive.

### Lock Schema
```json
{
  "clientId": "uuid-v4-generated-on-app-install",
  "timestamp": 1716300000000,
  "expiresAt": 1716300300000  // 5 minutes TTL
}
```

### Write Protocol (The "Mutex" Dance)
1.  **Check Lock**: Read `lock.json`.
    - If exists AND `expiresAt` > `now` AND `clientId` != `myId`: **WAIT** (Show "Vault Busy").
    - Else: Proceed.
2.  **Acquire Lock**: Upload `lock.json` with `myId` and `expiresAt = now + 5min`.
3.  **Sync**: Read latest `inventory.json`.
4.  **Write**: Update local data -> Upload `inventory.json`.
5.  **Release**: Delete `lock.json` (or set expired).

## 3. The "Write-Through" Sync Strategy

To support the "Cloud-First" directive while allowing for the "Couch Workflow":

### State Definitions
- **Local (IndexedDB)**: Transient buffer.
- **Remote (Drive)**: Permanent storage.

### The "Draft" Entity
An item in `inventory.json` can have a status of `DRAFT`.
- **Rapid Capture**:
    1.  Upload Image -> Get Drive ID.
    2.  Acquire Lock -> Read Inventory -> Append Item (Status: DRAFT, ImageID: X) -> Write Inventory -> Release Lock.
    - *Result*: Item is safe in cloud, but incomplete.
- **Processing**:
    1.  User adds Audio + Tags.
    2.  Upload Audio -> Get Drive ID.
    3.  Acquire Lock -> Read Inventory -> Update Item (Status: DONATE, AudioID: Y) -> Write Inventory -> Release Lock.

### Offline Handling (The Guardrail)
If offline:
1.  Save to IndexedDB (Status: PENDING_UPLOAD).
2.  UI shows "🟡 Pending (1/3)".
3.  **Limit**: If Pending count >= 3, disable Capture button. Show "Please reconnect to save your memories."

## 4. Data Schema (`inventory.json`)

```typescript
interface Inventory {
  version: number;
  items: Record<string, Item>; // Keyed by UUID
}

interface Item {
  id: string;
  createdAt: number;
  updatedAt: number;
  
  // Assets
  imageDriveId?: string; // If missing, upload failed
  audioDriveId?: string;
  
  // Metadata
  status: 'DRAFT' | 'KEEP' | 'GIFT' | 'DONATE';
  title?: string;
  description?: string; // Transcribed text (future)
  
  // Sync State (Local Only - Not saved to JSON)
  _syncStatus?: 'SYNCED' | 'PENDING' | 'ERROR';
}
```
