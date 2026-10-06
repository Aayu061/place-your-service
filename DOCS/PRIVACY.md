# Place Your Service — Privacy & Data Protection Requirements

## 1. Purpose

This document defines how Place Your Service should handle information responsibly.

It is an implementation/privacy requirement document, not a claim of legal compliance or certification.

---

## 2. Data Categories

The system may process:

### Internal user data

- Staff name
- Work contact information
- Authentication identity
- Role
- Account status
- Activity/audit records

### Customer/business data

- Customer/company name
- Addresses
- Contact numbers
- Email
- Site contacts
- Service history
- AC asset information
- AMC information
- Payment records

### Operational data

- Technician records
- Service assignments
- Parts usage
- Inventory transactions
- Service reports
- Notifications
- Audit logs

---

## 3. Data Minimization

Collect only information required for:

- service delivery
- customer identification
- asset management
- scheduling
- payments
- reporting
- security/auditing

Do not collect unrelated personal information.

---

## 4. Access Control

Users must only access information required by their role.

Admin has broader access.

Staff access is restricted by application permissions and database RLS.

Hiding a UI element is not sufficient security.

---

## 5. Authentication Data

Authentication credentials should be handled by Supabase Auth.

The application must never store plaintext passwords.

Never log passwords, access tokens, secret keys or sensitive authentication material.

---

## 6. Database Protection

Use:

- RLS
- least privilege
- foreign keys
- input validation
- secure server-side operations
- restricted service-role access

Every new exposed table must receive an explicit RLS review.

---

## 7. File/Storage Privacy

Service photos and documents should:

- be stored in controlled buckets
- use authorization-aware access
- avoid publicly exposing sensitive records unnecessarily
- use metadata references in the database

---

## 8. Audit Logs

Audit logs can contain operational accountability information.

Protect them from unauthorized modification.

Do not put secrets or unnecessary sensitive personal data into logs.

---

## 9. Payment Data

Store only payment information required by the platform.

Do not store card numbers, CVV or other payment credentials directly unless a separately approved architecture explicitly requires it.

Where an external payment provider is introduced, use provider references/statuses rather than sensitive payment credentials.

---

## 10. Data Retention

Retention periods should be defined according to business and applicable legal/accounting requirements.

Until a formal retention schedule is approved:

- retain operational records needed for business history
- restrict access to inactive records
- avoid unnecessary indefinite retention of personal data
- document deletion/archive decisions

---

## 11. Data Correction

Authorized users should be able to correct inaccurate operational/customer information.

Important changes should remain traceable through audit history where appropriate.

---

## 12. Data Deletion

Deletion must consider:

- operational dependencies
- financial records
- audit requirements
- historical service information

Where deletion would destroy required history, prefer anonymization/archive/inactivation where appropriate.

---

## 13. Privacy by Design

New features must answer:

1. What data is collected?
2. Why is it needed?
3. Who can access it?
4. How long is it retained?
5. Can it be avoided or minimized?
6. Does it introduce a new security risk?

---

## 14. Security Incidents

If unauthorized access, credential exposure, data leakage or suspicious activity is detected:

1. Contain the issue.
2. Revoke/rotate compromised credentials.
3. Preserve relevant technical evidence.
4. Determine affected records.
5. Correct the vulnerability.
6. Document the incident.
7. Handle required notifications according to applicable obligations.

---

## 15. Privacy UI

Avoid exposing private data in:

- public URLs where avoidable
- browser titles
- notifications visible to unintended users
- logs
- analytics payloads

Use masked or limited display for sensitive information when full visibility is unnecessary.
