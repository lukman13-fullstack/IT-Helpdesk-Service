# Document Management API - Contoh Request

## 1. Create Document (Upload PDF)

### Endpoint

```
POST /documents
```

### Headers

```json
{
  "success": true,
  "message": "Document created successfully",
  "data": {
    "id": 1,
    "name": "Prosedur Keselamatan Kerja",
    "description": "Dokumen prosedur keselamatan kerja di area produksi",
    "documentCode": "IT-PM-001",
    "documentNumber": 1,
    "category": "procedure_mutu",
    "googleDriveFileId": "1a2b3c4d5e6f7g8h9i0j",
    "fileSize": 245678,
    "mimeType": "application/pdf",
    "departmentId": 1,
    "uploadedBy": 1,
    "version": 1,
    "revision": 0,
    "status": "draft",
    "createdAt": "2025-12-01T08:30:00.000Z",
    "updatedAt": "2025-12-01T08:30:00.000Z",
    "department": {
      "id": 1,
      "name": "IT",
      "departmentCode": "IT"
    },
    "uploader": {
      "id": 1,
      "fullName": "Super Admin",
      "email": "superadmin@example.com"
    }
  }
}
```

---

## 2. Get All Documents

### Endpoint

```
GET /documents?page=1&limit=10&departmentId=1&status=draft&category=form&search=keselamatan
```

### Headers

```
Authorization: Bearer <your_access_token>
```

### Query Parameters

- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 10
- `departmentId` (optional): Filter by department
- `status` (optional): Filter by status (draft, pending_approval, approved, rejected)
- `category` (optional): Filter by category
- `search` (optional): Search in name, code, or description

### cURL Example

```bash
curl -X GET "http://localhost:3000/documents?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Response Success (200)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Prosedur Keselamatan Kerja",
      "documentCode": "IT-PM-001",
      "status": "draft",
      "category": "procedure_mutu",
      "department": {
        "id": 1,
        "name": "IT",
        "departmentCode": "IT"
      },
      "uploader": {
        "id": 1,
        "fullName": "Super Admin"
      },
      "approvals": [
        {
          "id": 1,
          "level": 1,
          "status": "pending",
          "approver": {
            "id": 2,
            "fullName": "Manager IT"
          }
        }
      ],
      "createdAt": "2025-12-01T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## 3. Get Document by ID

### Endpoint

```
GET /documents/:id
```

### Headers

```
Authorization: Bearer <your_access_token>
```

### cURL Example

```bash
curl -X GET http://localhost:3000/documents/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 4. Update Document Metadata

### Endpoint

```
PUT /documents/:id
```

### Headers

```
Authorization: Bearer <your_access_token>
Content-Type: application/json
```

### Body

```json
{
  "name": "Prosedur Keselamatan Kerja (Updated)",
  "description": "Dokumen prosedur keselamatan kerja di area produksi - versi terbaru",
  "category": "procedure_mutu"
}
```

### cURL Example

```bash
curl -X PUT http://localhost:3000/documents/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Prosedur Keselamatan Kerja (Updated)",
    "description": "Dokumen prosedur keselamatan kerja di area produksi - versi terbaru"
  }'
```

---

## 5. Revise Document (Upload New Version)

### Endpoint

```
POST /documents/:id/revise
```

### Headers

```
Authorization: Bearer <your_access_token>
Content-Type: multipart/form-data
```

### Form Data

```
changeDescription: "Menambahkan prosedur baru untuk area warehouse"
file: <PDF file>
```

### cURL Example

```bash
curl -X POST http://localhost:3000/documents/1/revise \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "changeDescription=Menambahkan prosedur baru untuk area warehouse" \
  -F "file=@/path/to/updated_document.pdf"
```

---

## 6. Download Document

### Endpoint

```
GET /documents/:id/download
```

### Headers

```
Authorization: Bearer <your_access_token>
```

### cURL Example

```bash
curl -X GET http://localhost:3000/documents/1/download \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  --output document.pdf
```

---

## 7. Get Approval Requests

### Endpoint

```
GET /approvals/requests?status=pending&page=1&limit=10
```

### Headers

```
Authorization: Bearer <your_access_token>
```

### Query Parameters

- `status` (optional): Filter by status (pending, approved, rejected)
- `page` (optional): Page number
- `limit` (optional): Items per page

### cURL Example

```bash
curl -X GET "http://localhost:3000/approvals/requests?status=pending" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Response Success (200)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "documentId": 1,
      "level": 1,
      "status": "pending",
      "document": {
        "id": 1,
        "name": "Prosedur Keselamatan Kerja",
        "documentCode": "IT-PM-001",
        "status": "draft",
        "department": {
          "id": 1,
          "name": "IT",
          "departmentCode": "IT"
        },
        "uploader": {
          "id": 1,
          "fullName": "Super Admin",
          "email": "superadmin@example.com"
        }
      },
      "approver": {
        "id": 2,
        "fullName": "Manager IT",
        "email": "manager@example.com"
      },
      "createdAt": "2025-12-01T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## 8. Approve Document

### Endpoint

```
POST /approvals/:id/approve
```

### Headers

```
Authorization: Bearer <your_access_token>
Content-Type: application/json
```

### Body

```json
{
  "comments": "Dokumen sudah sesuai dengan standar perusahaan"
}
```

### cURL Example

```bash
curl -X POST http://localhost:3000/approvals/1/approve \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "comments": "Dokumen sudah sesuai dengan standar perusahaan"
  }'
```

### Response Success (200)

```json
{
  "success": true,
  "message": "Approval recorded successfully. Waiting for other approvals.",
  "data": {
    "approval": {
      "id": 1,
      "status": "approved",
      "comments": "Dokumen sudah sesuai dengan standar perusahaan",
      "approvedAt": "2025-12-01T09:00:00.000Z"
    },
    "document": {
      "id": 1,
      "status": "pending_approval"
    },
    "allApproved": false
  }
}
```

---

## 9. Reject Document

### Endpoint

```
POST /approvals/:id/reject
```

### Headers

```
Authorization: Bearer <your_access_token>
Content-Type: application/json
```

### Body

```json
{
  "comments": "Dokumen perlu revisi pada bagian prosedur darurat"
}
```

### cURL Example

```bash
curl -X POST http://localhost:3000/approvals/1/reject \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "comments": "Dokumen perlu revisi pada bagian prosedur darurat"
  }'
```

---

## 10. Delete Document

### Endpoint

```
DELETE /documents/:id
```

### Headers

```
Authorization: Bearer <your_access_token>
```

### cURL Example

```bash
curl -X DELETE http://localhost:3000/documents/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Category Options

Saat membuat document, gunakan salah satu category berikut:

| Category          | Code | Description              |
| ----------------- | ---- | ------------------------ |
| `form`            | FM   | Form Document            |
| `standard`        | SD   | Standard Document        |
| `instruksi_kerja` | IK   | Instruksi Kerja Document |
| `procedure_mutu`  | PM   | Procedure Mutu Document  |
| `manual`          | MN   | Manual Document          |

Document code akan otomatis di-generate dengan format: `{DEPT_CODE}-{CATEGORY_CODE}-{NUMBER}`

Contoh:

- `IT-FM-001` - Form document pertama dari IT department
- `HR-PM-003` - Procedure Mutu document ketiga dari HR department
- `FIN-SD-012` - Standard document ke-12 dari Finance department

---

## Status Workflow

1. **draft** - Document baru dibuat, belum disubmit untuk approval
2. **pending_approval** - Document sedang dalam proses approval
3. **approved** - Document sudah disetujui semua approver (PDF dengan cover page otomatis dibuat)
4. **rejected** - Document ditolak oleh salah satu approver

---

## Notes

- Semua endpoint memerlukan authentication token (Bearer token)
- File PDF maksimal 10MB
- Document code otomatis di-generate berdasarkan department code dan category
- Setelah semua approval selesai, sistem akan otomatis generate PDF cover page dengan QR code
- QR code berisi informasi document dan bisa di-scan untuk melihat detail
