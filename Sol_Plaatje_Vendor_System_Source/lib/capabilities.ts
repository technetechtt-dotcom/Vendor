/**
 * Role capabilities.
 *
 * Roles map to the duties the LED Office separates in practice:
 *  - superuser: system owner. Every capability.
 *  - office: registration and compliance counter work. No money movements,
 *    no tariff changes, no bulk data loading, no account or system settings.
 *  - finance: the money side of the counter. Can charge, take and reverse
 *    payments, reconcile, and keep fee schedules. Cannot register or approve
 *    traders, and cannot change compliance findings.
 *  - field: the field app. Records inspections, warnings and violations on one
 *    vendor at a time and nothing else.
 *
 * These are enforced on the server for every mutating action; the interface
 * only decides what to show.
 */

export type Role = 'superuser' | 'office' | 'finance' | 'field';

export const roles: Role[] = ['superuser', 'office', 'finance', 'field'];

export type Capability =
  | 'register.write'
  | 'compliance.write'
  | 'finance.write'
  | 'finance.tariffs'
  | 'permits.write'
  | 'hubs.write'
  | 'requirements.write'
  | 'import.write'
  | 'settings.write'
  | 'accounts.write'
  | 'backup.read'
  | 'audit.read';

const capabilityRoles: Record<Capability, Role[]> = {
  'register.write': ['superuser', 'office'],
  'compliance.write': ['superuser', 'office', 'field'],
  'finance.write': ['superuser', 'finance'],
  'finance.tariffs': ['superuser', 'finance'],
  'permits.write': ['superuser', 'office'],
  'hubs.write': ['superuser', 'office'],
  'requirements.write': ['superuser', 'office'],
  'import.write': ['superuser', 'office'],
  'settings.write': ['superuser'],
  'accounts.write': ['superuser'],
  'backup.read': ['superuser'],
  'audit.read': ['superuser', 'office', 'finance'],
};

export function can(role: string, capability: Capability) {
  return capabilityRoles[capability].includes(role as Role);
}

export function capabilitiesFor(role: string): Capability[] {
  return (Object.keys(capabilityRoles) as Capability[]).filter(capability => can(role, capability));
}

export function roleLabel(role: string) {
  return role === 'superuser' ? 'Super user' : role === 'finance' ? 'Finance officer' : role === 'field' ? 'Field officer' : 'Registration / compliance';
}

/** Which mutating register actions belong to which capability. */
export function actionCapability(action: string): Capability | null {
  switch (action) {
    case 'vendor':
    case 'hub':
      return 'register.write';
    case 'unit':
    case 'unit-delete':
    case 'pitch':
      return 'hubs.write';
    case 'permit':
      return 'permits.write';
    case 'event':
    case 'resolve':
    case 'assign':
    case 'schedule':
    case 'transition':
      return 'compliance.write';
    case 'reconcile':
    case 'reverse':
      return 'finance.write';
    case 'tariff':
      return 'finance.tariffs';
    case 'requirement':
    case 'requirement-delete':
      return 'requirements.write';
    case 'import':
    case 'edit-import':
    case 'reject-import':
    case 'approve-import':
      return 'import.write';
    case 'settings':
    case 'integrity-resolve':
      return 'settings.write';
    default:
      return null;
  }
}

/**
 * An action request may need more than one capability. Recording a fee entry is
 * compliance-shaped for a warning and money-shaped for a charge or payment, so
 * the kind of event decides which side of the counter may write it.
 */
export function capabilityForRequest(action: string, body: {kind?: string}): Capability | null {
  if (action !== 'event') return actionCapability(action);
  const kind = String(body.kind || '');
  if (kind === 'Charge' || kind === 'Payment') return 'finance.write';
  if (kind === 'Warning' || kind === 'Violation' || kind === 'Inspection' || kind === 'Resolution') return 'compliance.write';
  return 'compliance.write';
}
