# Notification API Documentation

## Overview

Notification API menyediakan endpoint untuk mengelola notifikasi user terkait aktivitas dokumen dalam sistem QA Document Management.

**Base URL**: `/api/notifications`

**Authentication**: Semua endpoint memerlukan Bearer token di header `Authorization`

---

## Endpoints

### 1. Get Notifications

Mendapatkan daftar notifikasi untuk user yang sedang login.

**Endpoint**: `GET /api/notifications`

**Headers**:

```
Authorization: Bearer <token>
```

**Query Parameters**:

| Parameter  | Type    | Required | Default | Description                               |
| ---------- | ------- | -------- | ------- | ----------------------------------------- |
| page       | integer | No       | 1       | Nomor halaman untuk pagination            |
| limit      | integer | No       | 20      | Jumlah item per halaman (max: 100)        |
| unreadOnly | boolean | No       | false   | Filter hanya notifikasi yang belum dibaca |

**Success Response** (200 OK):

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": 1,
        "userId": 2,
        "type": "approval_pending",
        "title": "New Document Approval Request",
        "message": "You have a new document \"Instruksi Kerja QA\" waiting for your approval.",
        "documentId": 5,
        "isRead": false,
        "createdAt": "2025-12-03T10:15:00.000Z",
        "document": {
          "id": 5,
          "name": "Instruksi Kerja QA",
          "documentCode": "IK/III/TM/01",
          "status": "pending_approval"
        }
      },
      {
        "id": 2,
        "userId": 2,
        "type": "document_approved",
        "title": "Document Approved",
        "message": "Your document \"Manual Prosedur\" has been approved by T. Imamura.",
        "documentId": 3,
        "isRead": true,
        "createdAt": "2025-12-02T14:30:00.000Z",
        "document": {
          "id": 3,
          "name": "Manual Prosedur",
          "documentCode": "PR/II/QA/05",
          "status": "approved"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "totalPages": 1
    },
    "unreadCount": 5
  }
}
```

**Example Request**:

```bash
# Get all notifications
curl -X GET "http://localhost:3000/api/notifications" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get only unread notifications
curl -X GET "http://localhost:3000/api/notifications?unreadOnly=true" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get page 2 with 10 items per page
curl -X GET "http://localhost:3000/api/notifications?page=2&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2. Mark Notification as Read

Menandai satu notifikasi sebagai sudah dibaca.

**Endpoint**: `PATCH /api/notifications/:id/read`

**Headers**:

```
Authorization: Bearer <token>
```

**URL Parameters**:

| Parameter | Type    | Required | Description                                     |
| --------- | ------- | -------- | ----------------------------------------------- |
| id        | integer | Yes      | ID notifikasi yang akan ditandai sebagai dibaca |

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": 1,
    "userId": 2,
    "type": "approval_pending",
    "title": "New Document Approval Request",
    "message": "You have a new document \"Instruksi Kerja QA\" waiting for your approval.",
    "documentId": 5,
    "isRead": true,
    "createdAt": "2025-12-03T10:15:00.000Z"
  }
}
```

**Error Responses**:

**404 Not Found**:

```json
{
  "success": false,
  "message": "Notification not found"
}
```

**403 Forbidden**:

```json
{
  "success": false,
  "message": "You don't have permission to update this notification"
}
```

**Example Request**:

```bash
curl -X PATCH "http://localhost:3000/api/notifications/1/read" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 3. Mark All Notifications as Read

Menandai semua notifikasi user sebagai sudah dibaca.

**Endpoint**: `PATCH /api/notifications/read-all`

**Headers**:

```
Authorization: Bearer <token>
```

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "5 notifications marked as read",
  "data": {
    "count": 5
  }
}
```

**Example Request**:

```bash
curl -X PATCH "http://localhost:3000/api/notifications/read-all" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Notification Types

Sistem mendukung beberapa tipe notifikasi:

| Type                | Description                      | Triggered When     | Recipients                       |
| ------------------- | -------------------------------- | ------------------ | -------------------------------- |
| `approval_pending`  | Permintaan approval dokumen baru | Dokumen dibuat     | Semua approver dalam hierarchy   |
| `document_approved` | Dokumen telah disetujui          | Dokumen di-approve | Pembuat dokumen                  |
| `document_rejected` | Dokumen ditolak                  | Dokumen di-reject  | Pembuat dokumen                  |
| `document_revised`  | Dokumen telah direvisi           | Dokumen di-revisi  | Approver yang sebelumnya approve |

---

## Data Models

### Notification Object

```typescript
{
  id: number;              // ID unik notifikasi
  userId: number;          // ID user penerima notifikasi
  type: string;            // Tipe notifikasi (lihat tabel di atas)
  title: string;           // Judul notifikasi
  message: string;         // Pesan detail notifikasi
  documentId: number | null; // ID dokumen terkait (optional)
  isRead: boolean;         // Status sudah dibaca atau belum
  createdAt: string;       // Timestamp pembuatan (ISO 8601)
  document?: {             // Detail dokumen (jika ada)
    id: number;
    name: string;
    documentCode: string;
    status: string;
  }
}
```

---

## Error Handling

Semua endpoint menggunakan format error response yang konsisten:

```json
{
  "success": false,
  "message": "Error message description"
}
```

**Common HTTP Status Codes**:

| Code | Description                               |
| ---- | ----------------------------------------- |
| 200  | Success                                   |
| 201  | Created                                   |
| 400  | Bad Request - Invalid parameters          |
| 401  | Unauthorized - Token invalid atau expired |
| 403  | Forbidden - Tidak memiliki permission     |
| 404  | Not Found - Resource tidak ditemukan      |
| 500  | Internal Server Error                     |

---

## Integration Example

### React/JavaScript Example

```javascript
// Get notifications
async function getNotifications(page = 1, unreadOnly = false) {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams({
    page: page.toString(),
    limit: "20",
    ...(unreadOnly && { unreadOnly: "true" }),
  });

  const response = await fetch(
    `http://localhost:3000/api/notifications?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await response.json();
}

// Mark as read
async function markAsRead(notificationId) {
  const token = localStorage.getItem("token");

  const response = await fetch(
    `http://localhost:3000/api/notifications/${notificationId}/read`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await response.json();
}

// Mark all as read
async function markAllAsRead() {
  const token = localStorage.getItem("token");

  const response = await fetch(
    "http://localhost:3000/api/notifications/read-all",
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return await response.json();
}

// Usage
const notifications = await getNotifications(1, true); // Get unread only
await markAsRead(1); // Mark notification ID 1 as read
await markAllAsRead(); // Mark all as read
```

---

## Notes

1. **Pagination**: Default limit adalah 20 item per halaman. Maximum limit adalah 100.
2. **Real-time Updates**: Untuk real-time notifications, pertimbangkan implementasi WebSocket atau Server-Sent Events (SSE).
3. **Soft Delete**: Notifikasi tidak pernah dihapus secara permanen dari database.
4. **Performance**: Query notifications sudah dioptimasi dengan indexing pada `userId` dan `isRead`.

---

## Changelog

### Version 1.0.0 (2025-12-03)

- Initial release
- GET notifications endpoint
- PATCH mark as read endpoint
- PATCH mark all as read endpoint
- Integration with document creation workflow
