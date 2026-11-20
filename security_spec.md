# NutriPulse Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Data Invariants
1. **Strict Private Ownership**: Every user document (`/users/{userId}`) and every subcollection document (`foodEntries`, `weightHistory`, `dietPlans`, `chatMessages`) belongs exclusively to `{userId}` where `request.auth.uid == userId`. No cross-user read, list, create, update, or delete is ever permitted.
2. **Master Gate Enforcement**: Every subcollection write (`foodEntries`, `weightHistory`, `dietPlans`, `chatMessages`) verifies that the parent `/users/{userId}` document exists and belongs to `request.auth.uid`.
3. **Immutable Identity & Timestamps**: `uid` / `userId` and `createdAt` can never be mutated on update. `createdAt` on create and `updatedAt` on update must equal `request.time`.
4. **Strict Key Allowlisting & Volumetric Bounds**: No shadow fields (`isAdmin`, `role`, `isVerified`) are allowed. All string fields enforce explicit `.size()` limits, numeric fields enforce physiological bounds (e.g., height 50–280cm, weight 15–400kg, calories 0–25000), and arrays enforce `.size() <= MAX`.
5. **Path Variable Hardening**: Every single-document `get`, `create`, `update`, and `delete` validates `isValidId()` on path variables.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-User Profile Read (PII Leak)**: User B attempts `get` on `/users/userA`. Expected: `PERMISSION_DENIED`.
2. **Cross-User Food List Scraping**: User B attempts `list` on `/users/userA/foodEntries`. Expected: `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: User A attempts `create` on `/users/userA/foodEntries/e1` with `userId: "userB"`. Expected: `PERMISSION_DENIED`.
4. **Shadow Field Injection**: User A attempts `create` on `/users/userA` adding `isAdmin: true`. Expected: `PERMISSION_DENIED`.
5. **Immutable Field Tampering**: User A attempts `update` on `/users/userA/foodEntries/e1` changing `createdAt` or `userId`. Expected: `PERMISSION_DENIED`.
6. **Client-Spoofed Timestamp**: User A attempts `create` on `/users/userA/foodEntries/e1` with `createdAt` set to a past timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
7. **Resource Poisoning via Oversized String**: User A attempts `create` on `/users/userA/chatMessages/m1` with `content` > 4000 characters. Expected: `PERMISSION_DENIED`.
8. **ID Poisoning**: User A attempts `create` on `/users/userA/foodEntries/` with a 200-char ID containing invalid characters (`../../evil`). Expected: `PERMISSION_DENIED`.
9. **Value Poisoning on Update**: User A attempts `update` on `/users/userA/foodEntries/e1` setting `calories: "unlimited"` (string instead of number) or `calories: -500`. Expected: `PERMISSION_DENIED`.
10. **Orphaned Subcollection Write**: User A attempts `create` on `/users/userA/foodEntries/e1` before `/users/userA` profile exists. Expected: `PERMISSION_DENIED`.
11. **Unbounded Array Injection**: User A attempts `create` on `/users/userA/dietPlans/p1` with `meals` array of size 50 (limit 10). Expected: `PERMISSION_DENIED`.
12. **Unauthenticated Access**: Unauthenticated caller attempts `read` or `write` on any path. Expected: `PERMISSION_DENIED`.
