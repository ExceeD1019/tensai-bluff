/** 検証の指摘。構造チェック（コード）と内容チェック（LLM）の両方がこの形で返す。 */

export type Severity = "error" | "warn";

export interface Issue {
  code: string;
  severity: Severity;
  /** 対象データ（fact id / "structure" / "topic" など） */
  target: string;
  message: string;
  /** 生成AIへの修正指示 */
  fixHint: string;
}

export function issue(
  code: string,
  severity: Severity,
  target: string,
  message: string,
  fixHint: string,
): Issue {
  return { code, severity, target, message, fixHint };
}
