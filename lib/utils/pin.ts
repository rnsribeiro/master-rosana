export function generatePin6(): string {
  // Gera 6 dígitos, incluindo zeros à esquerda
  const n = Math.floor(Math.random() * 1_000_000);
  return String(n).padStart(6, "0");
}

export function sanitizePin(input: string): string {
  return input.replace(/\D/g, "").slice(0, 6);
}

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}
