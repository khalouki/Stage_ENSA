export const STUDENT_EMAIL_DOMAIN = "usms.ac.ma";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isInstitutionalStudentEmail(value: string): boolean {
  const normalizedEmail = normalizeEmail(value);
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex <= 0 || atIndex !== normalizedEmail.indexOf("@")) {
    return false;
  }

  return normalizedEmail.slice(atIndex + 1) === STUDENT_EMAIL_DOMAIN;
}
